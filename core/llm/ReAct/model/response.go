package model

// ChatResponse /chat/completions 的响应体（只声明循环用到的字段）。
type ChatResponse struct {
	// Choices 候选回复列表，取第一个
	Choices []struct {
		// Message 模型这一轮返回的消息
		Message Message `json:"message"`
		// FinishReason 停止原因：stop / length
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
}
