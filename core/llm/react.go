package llm

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

// reactMaxSteps 单轮对话的最大循环次数，防止模型反复输出动作停不下来。
const reactMaxSteps = 10

// Role 消息角色，对应请求体 messages[].role。
// 用自定义类型而不是裸 string，是为了让编译器拦住传错值的情况；
// 它底层就是 string，序列化成 JSON 和拼字符串时都不需要显式转换。
type Role string

// 走文本协议时只有这三个角色：工具结果伪装成 user 消息回传，所以没有 tool。
const (
	// RoleSystem 系统提示，用来约定 Thought / Action 的输出格式
	RoleSystem Role = "system"
	// RoleUser 用户消息；工具结果（Observation）也用它回传
	RoleUser Role = "user"
	// RoleAssistant 模型输出
	RoleAssistant Role = "assistant"
)

// reactMessage ReAct 循环里的一条消息，直接对应请求体 messages 数组的元素。
type reactMessage struct {
	// Role 角色，取值见 RoleSystem / RoleUser / RoleAssistant
	Role Role `json:"role"`
	// Content 正文
	Content string `json:"content"`
}

// reactRequest /chat/completions 的请求体（只声明循环用到的字段）。
type reactRequest struct {
	// Model 模型名
	Model string `json:"model"`
	// Messages 对话历史，循环中不断追加
	Messages []reactMessage `json:"messages"`
}

// reactResponse /chat/completions 的响应体（只声明循环用到的字段）。
type reactResponse struct {
	// Choices 候选回复列表，取第一个
	Choices []struct {
		// Message 模型这一轮返回的消息
		Message reactMessage `json:"message"`
		// FinishReason 停止原因：stop / length
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
}

// ReActChat 用 ReAct 循环处理一条用户消息，返回模型的最终回复。
func ReActChat(baseURL, apiKey, modelName, prompt string) string {
	// 1. 消息历史，整个循环唯一的状态；后续每一轮都往这里追加
	messages := []reactMessage{
		{Role: RoleUser, Content: prompt},
	}

	// 2. 最多循环 reactMaxSteps 次，防止模型反复输出动作停不下来
	for step := 0; step < reactMaxSteps; step++ {
		// 3. 把当前历史发给模型，拿回这一轮的输出
		resp, err := sendReactRequest(baseURL, apiKey, modelName, messages)
		if err != nil {
			return fmt.Sprintf("[error] %v", err)
		}

		// 4. 没有 choices 说明响应不完整，无法继续
		if len(resp.Choices) == 0 {
			return "[error] 响应中没有 choices"
		}

		// 5. 取出本轮模型输出
		reply := resp.Choices[0].Message

		// TODO: 解析 reply.Content 里的 Thought / Action / Action Input
		//       有动作 → 执行 → 追加 Observation → 继续循环
		//       无动作 → 这是最终回复，返回

		// 6. 临时：解析逻辑未实现，先直接返回
		return reply.Content
	}

	// 7. 走完上限仍未给出最终回复
	return fmt.Sprintf("[error] 达到最大步数 %d，模型仍未给出最终回复", reactMaxSteps)
}

// sendReactRequest 发一次 /chat/completions 请求，返回解析后的响应。
func sendReactRequest(baseURL, apiKey, modelName string, messages []reactMessage) (*reactResponse, error) {
	// 1. 拼接接口地址，baseURL 已带 /v1 前缀
	reqURL, err := endpointURL(baseURL, "/chat/completions")
	if err != nil {
		return nil, err
	}

	// 2. 组装请求体
	payload, err := json.Marshal(reactRequest{
		Model:    modelName,
		Messages: messages,
	})
	if err != nil {
		return nil, fmt.Errorf("序列化请求体失败: %w", err)
	}

	// 3. 创建请求并写入认证头
	req, err := http.NewRequest(http.MethodPost, reqURL, bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	applyAuth(req, apiKey, AuthBearer)

	// 4. 发送请求
	resp, err := defaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	// 5. 非 200 转成带状态码和响应体片段的错误
	if resp.StatusCode != http.StatusOK {
		return nil, statusError(resp)
	}

	// 6. 解析响应体
	var out reactResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("解析响应失败: %w", err)
	}
	return &out, nil
}
