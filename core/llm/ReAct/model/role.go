package model

// Role 消息角色，对应请求体 messages[].role。
// 用自定义类型而不是裸 string，是为了让编译器拦住传错值的情况
type Role string

// 消息角色常量，取值对应 OpenAI 兼容接口的 role 字段
const (
	// RoleSystem 系统提示，用来设定人格与规则
	RoleSystem Role = "system"
	// RoleUser 用户输入
	RoleUser Role = "user"
	// RoleAssistant 模型回复
	RoleAssistant Role = "assistant"
	// RoleTool 工具执行结果，需要配合 tool_call_id 使用
	RoleTool Role = "tool"
)
