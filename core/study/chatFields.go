// Package study 记录 OpenAI 兼容接口返回字段的含义，便于查询。
package study

import (
	"fmt"
	"sort"
)

// ChatFields /chat/completions 返回字段说明。
// key 用「路径」表示嵌套层级，数组用 [] 表示。
var ChatFields = map[string]string{
	"id":      "本次响应的唯一 ID，排查问题时可以带上它找服务商",
	"object":  "对象类型，chat.completion 表示一次非流式对话补全",
	"created": "响应创建时间，Unix 时间戳（秒）",
	"model":   "实际处理本次请求的模型名，可能和请求里的不同（服务商可能路由到别的版本）",
	"choices": "候选回复列表，数组；n=1 时只有一个元素，默认取 [0]",

	"choices[].index":           "候选序号，从 0 开始",
	"choices[].finish_reason":   "停止原因：stop=正常结束，length=达到 max_tokens，content_filter=内容被过滤，tool_calls=模型要调用工具",
	"choices[].message":         "模型回复的消息对象",
	"choices[].message.role":    "消息角色，回复固定为 assistant",
	"choices[].message.content": "回复正文，Markdown 原文（含 **、换行等），排版由模型自由生成所以每次不同",

	"usage":                                            "token 用量与计费信息",
	"usage.prompt_tokens":                              "输入（提示词）消耗的 token 数",
	"usage.completion_tokens":                          "输出（回复）消耗的 token 数",
	"usage.total_tokens":                               "总 token 数，通常等于 prompt_tokens + completion_tokens",
	"usage.prompt_tokens_details":                      "输入 token 的细分信息",
	"usage.prompt_tokens_details.cached_tokens":        "输入中被缓存命中的 token 数，命中部分通常更便宜",
	"usage.completion_tokens_details":                  "输出 token 的细分信息",
	"usage.completion_tokens_details.reasoning_tokens": "推理模型在内部思考上消耗的 token，不计入可见回复",

	"usage.context_details":               "上下文窗口相关的用量信息（部分网关扩展字段，非 OpenAI 标准）",
	"usage.context_details.input_tokens":  "本次请求计入上下文的输入 token 数",
	"usage.context_details.output_tokens": "本次请求计入上下文的输出 token 数",
	"usage.cost_in_usd_ticks":             "本次调用费用的计费刻度（ticks），换算成美元的比率由网关定义（非 OpenAI 标准字段）",
	"usage.num_server_side_tools_used":    "服务端工具调用次数（网关扩展字段）",
	"usage.num_sources_used":              "引用来源数量（网关扩展字段）",
}

// Describe 按字段路径查询说明；不存在时返回空串和 false。
func Describe(key string) (string, bool) {
	v, ok := ChatFields[key]
	return v, ok
}

// PrintAll 按字母序打印全部字段说明。
func PrintAll() {
	keys := make([]string, 0, len(ChatFields))
	for k := range ChatFields {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for _, k := range keys {
		fmt.Printf("%-45s %s\n", k, ChatFields[k])
	}
}
