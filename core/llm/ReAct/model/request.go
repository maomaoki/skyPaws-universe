// Package model 存放 /chat/completions 的请求体、响应体结构和消息角色常量。
package model

// Message 一条对话消息，对应请求体 messages 数组的元素。
type Message struct {
	// Role 角色，取值见 role.go 中的常量
	Role Role `json:"role"`
	// Content 正文
	Content string `json:"content"`
}

// ChatRequest /chat/completions 的请求体（只声明循环用到的字段）。
type ChatRequest struct {
	// Model 模型名
	Model string `json:"model"`
	// Messages 对话历史，循环中不断追加
	Messages []Message `json:"messages"`
}
