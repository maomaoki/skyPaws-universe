package study

import (
	"fmt"
	"sort"
)

// ChatRequestFields /chat/completions 请求参数说明。
// key 用「路径」表示嵌套层级，数组用 [] 表示。
var ChatRequestFields = map[string]string{
	"model":    "要调用的模型名，必填；同一服务商下名字通常区分大小写",
	"messages": "对话消息列表，必填；按时间顺序排列，最后一条通常是 user",

	"messages[].role":    "消息角色：system=设定人格与规则，user=用户输入，assistant=模型回复，tool=工具执行结果，developer=新版替代 system",
	"messages[].content": "消息正文；纯文本直接写字符串，多模态可写成内容片段数组（见 content[] 系列）",
	"messages[].name":    "可选的参与者名字，用于区分同角色多说话人；部分服务商已不支持",

	"messages[].content[].type":             "内容片段类型：text=文本，image_url=图片，input_audio=音频，file=文件",
	"messages[].content[].text":             "type=text 时的文本内容",
	"messages[].content[].image_url.url":    "图片地址，可以是 https URL 或 data:image/...;base64,...",
	"messages[].content[].image_url.detail": "图片解析精度：low=省 token，high=更细，auto=由模型决定",

	"messages[].tool_calls":                      "assistant 消息里模型发起的工具调用列表；回传历史时必须原样带回，否则上下文对不上",
	"messages[].tool_calls[].id":                 "工具调用 ID，tool 消息用它对应回哪次调用",
	"messages[].tool_calls[].type":               "调用类型，目前固定为 function",
	"messages[].tool_calls[].function.name":      "要调用的函数名",
	"messages[].tool_calls[].function.arguments": "函数参数，JSON 字符串（注意是字符串，不是对象）",
	"messages[].tool_call_id":                    "仅 tool 角色使用：本次结果对应哪次工具调用",

	"stream":                       "是否流式返回，true 时响应为 SSE，每个分片以 data: 开头，最后以 data: [DONE] 结束",
	"stream_options":               "流式附加选项，仅 stream=true 时生效",
	"stream_options.include_usage": "true 时最后一个分片附带 usage（此时 choices 为空数组），便于统计用量",

	"temperature":           "采样温度 0~2，越低越稳定、越高越发散；与 top_p 建议只调一个",
	"top_p":                 "核采样 0~1，只从累计概率前 top_p 的 token 中取；与 temperature 二选一调",
	"n":                     "生成几个候选回复，默认 1；大于 1 时按 choices 数组全部返回，费用也按倍数计",
	"max_tokens":            "输出 token 上限（旧字段），达到后 finish_reason=length",
	"max_completion_tokens": "输出 token 上限（新字段），含推理模型的思考 token；与 max_tokens 同时给时以它为准",
	"stop":                  "停止词，命中即结束；可传字符串或字符串数组，最多 4 个",
	"presence_penalty":      "话题新鲜度 -2~2，正值让模型更倾向聊新内容",
	"frequency_penalty":     "重复惩罚 -2~2，正值降低重复用词",
	"logit_bias":            "指定 token 的概率偏置，格式 {token_id: -100~100}；-100 等于禁用该 token",
	"logprobs":              "是否返回每个输出 token 的对数概率",
	"top_logprobs":          "每个位置返回几个候选 token 及其概率，0~20，需 logprobs=true",
	"seed":                  "随机种子，尽量让相同输入得到相同输出；不保证跨版本、跨服务商稳定",
	"response_format":       "输出格式约束：text=普通文本，json_object=JSON 对象，json_schema=按给定 schema 输出",
	"response_format.type":  "格式类型：text / json_object / json_schema",

	"response_format.json_schema.name":   "schema 名称，json_schema 模式必填",
	"response_format.json_schema.schema": "JSON Schema 定义，模型输出会按它约束",
	"response_format.json_schema.strict": "是否严格按 schema 输出，true 时模型不会漏字段或加字段",

	"tools":                        "可用工具清单，模型据此决定是否发起 tool_calls；不传则模型不会调用任何工具",
	"tools[].type":                 "工具类型，目前固定为 function",
	"tools[].function.name":        "函数名，模型返回 tool_calls 时用这个名字",
	"tools[].function.description": "函数用途说明，模型靠它判断什么时候该调用",
	"tools[].function.parameters":  "参数 JSON Schema，描述每个参数的类型、含义和是否必填",
	"tools[].function.strict":      "是否严格按 parameters 输出，true 时参数不会多也不会少",
	"tool_choice":                  "工具选择策略：none=不调用，auto=模型自行决定，required=必须调用，也可直接指定某个函数",
	"parallel_tool_calls":          "是否允许一次返回多个 tool_calls，默认 true；设 false 可强制串行",

	"user":             "终端用户标识，用于服务商侧限流与滥用追踪；不要放真实隐私信息",
	"metadata":         "附加元数据，部分网关支持，随请求存下来便于检索",
	"store":            "是否让服务商保存本次请求（用于蒸馏、评测），默认 false",
	"service_tier":     "服务等级，如 auto / default / flex，影响价格与延迟（部分服务商支持）",
	"reasoning_effort": "推理强度：minimal / low / medium / high，仅推理模型有效，越高越慢越贵",
	"modalities":       "输出模态，如 [\"text\"] 或 [\"text\",\"audio\"]",
	"audio":            "音频输出参数，仅 modalities 含 audio 时生效",
	"audio.voice":      "音色名",
	"audio.format":     "音频格式，如 wav / mp3",

	"functions":     "旧版工具清单字段，已被 tools 取代，新代码不要用",
	"function_call": "旧版工具选择字段，已被 tool_choice 取代，新代码不要用",
}

// DescribeRequest 按参数路径查询说明；不存在时返回空串和 false。
func DescribeRequest(key string) (string, bool) {
	v, ok := ChatRequestFields[key]
	return v, ok
}

// PrintRequestAll 按字母序打印全部请求参数说明。
func PrintRequestAll() {
	printSortedFields(ChatRequestFields)
}

// printSortedFields 按 key 字母序打印字段说明，供各字段表复用。
func printSortedFields(fields map[string]string) {
	keys := make([]string, 0, len(fields))
	for k := range fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for _, k := range keys {
		fmt.Printf("%-45s %s\n", k, fields[k])
	}
}
