package study

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
)

// 三种主流对话接口风格，作为 RequestExamples 的 key（与各网关控制台的叫法一致）。
const (
	KeyAnthropicMessages = "Anthropic Messages (/v1/messages)"
	KeyChatCompletions   = "Chat Completions (/chat/completions)"
	KeyResponses         = "Responses (/responses)"
)

// RequestExample 一种接口风格的完整请求示例：地址 + 鉴权 + 请求参数。
type RequestExample struct {
	// Method HTTP 方法，这三种都是 POST
	Method string
	// URL 模拟地址；https://api.example.com/v1 对应 config.yaml 里的 MODEL_URL
	URL string
	// Auth 鉴权要点：密钥放在哪个头里
	Auth string
	// Headers 需要携带的请求头（含鉴权与版本）
	Headers map[string]string
	// Body 请求体，原样保存 JSON 文本（保留书写顺序，比 map 序列化更好读）
	Body json.RawMessage
	// Note 这套接口与另外两套的主要差异
	Note string
}

// RequestExamples 三种主流请求方式的示例。
// 同一件事（发一条「你好」）在三种接口里长什么样，方便对照。
var RequestExamples = map[string]RequestExample{
	KeyAnthropicMessages: {
		Method: http.MethodPost,
		URL:    "https://api.example.com/v1/messages",
		Auth:   "Anthropic 原生用 x-api-key；走 OpenAI 兼容网关时一般改成 Authorization: Bearer <key>",
		Headers: map[string]string{
			"x-api-key":         "sk-ant-xxxxxxxx",
			"anthropic-version": "2023-06-01",
			"Content-Type":      "application/json",
		},
		Body: json.RawMessage(`{
  "model": "claude-sonnet-4-5",
  "max_tokens": 1024,
  "system": "你是一个乐于助人的助手。",
  "messages": [
    { "role": "user", "content": "你好，介绍一下你自己" }
  ],
  "stream": false
}`),
		Note: "system 是顶层字段，不放进 messages；max_tokens 必填；回复在 content[] 数组里，取 type=text 的块。",
	},

	KeyChatCompletions: {
		Method: http.MethodPost,
		URL:    "https://api.example.com/v1/chat/completions",
		Auth:   "Authorization: Bearer <key>",
		Headers: map[string]string{
			"Authorization": "Bearer sk-xxxxxxxx",
			"Content-Type":  "application/json",
		},
		Body: json.RawMessage(`{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "你是一个乐于助人的助手。" },
    { "role": "user", "content": "你好，介绍一下你自己" }
  ],
  "stream": false
}`),
		Note: "兼容性最好，几乎所有服务商都支持；system 是 messages 里的一条消息；回复在 choices[0].message.content。",
	},

	KeyResponses: {
		Method: http.MethodPost,
		URL:    "https://api.example.com/v1/responses",
		Auth:   "Authorization: Bearer <key>",
		Headers: map[string]string{
			"Authorization": "Bearer sk-xxxxxxxx",
			"Content-Type":  "application/json",
		},
		Body: json.RawMessage(`{
  "model": "gpt-4o",
  "instructions": "你是一个乐于助人的助手。",
  "input": [
    { "role": "user", "content": "你好，介绍一下你自己" }
  ],
  "stream": false
}`),
		Note: "OpenAI 新接口：instructions 代替 system 消息，input 传消息数组（也可直接传字符串）；回复在 output[] 里，取 type=output_text 的片段。",
	},
}

// Example 按 key 取请求示例；不存在时返回零值和 false。
func Example(key string) (RequestExample, bool) {
	v, ok := RequestExamples[key]
	return v, ok
}

// AuthHeader 返回该示例的鉴权头名与取值，便于直接 req.Header.Set。
// 没有鉴权头（如本地模型）时返回空串。
func (e RequestExample) AuthHeader() (name, value string) {
	for _, k := range []string{"Authorization", "x-api-key", "api-key"} {
		if v, ok := e.Headers[k]; ok {
			return k, v
		}
	}
	return "", ""
}

// BodyJSON 返回请求体 JSON 文本（保持书写时的缩进与换行），并顺带校验合法性。
func (e RequestExample) BodyJSON() (string, error) {
	if !json.Valid(e.Body) {
		return "", fmt.Errorf("请求体不是合法 JSON")
	}
	return strings.TrimSpace(string(e.Body)), nil
}

// PrintExamples 按名称字母序打印全部请求示例：地址、请求头、请求体、差异说明。
func PrintExamples() {
	keys := make([]string, 0, len(RequestExamples))
	for k := range RequestExamples {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for i, k := range keys {
		if i > 0 {
			fmt.Println()
		}
		printExample(k, RequestExamples[k])
	}
}

// printExample 打印单个请求示例。
func printExample(key string, e RequestExample) {
	fmt.Printf("=== %s ===\n", key)
	fmt.Printf("%s %s\n", e.Method, e.URL)
	fmt.Printf("鉴权：%s\n", e.Auth)

	headerKeys := make([]string, 0, len(e.Headers))
	for k := range e.Headers {
		headerKeys = append(headerKeys, k)
	}
	sort.Strings(headerKeys)
	fmt.Println("请求头：")
	for _, k := range headerKeys {
		fmt.Printf("  %s: %s\n", k, e.Headers[k])
	}

	body, err := e.BodyJSON()
	if err != nil {
		fmt.Printf("请求体：%v\n", err)
		return
	}
	fmt.Println("请求体：")
	fmt.Println(body)
	fmt.Printf("说明：%s\n", e.Note)
}
