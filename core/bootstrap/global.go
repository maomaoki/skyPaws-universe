package bootstrap

// 全局配置变量，由 Init() 在启动时填充。
// 取值优先级：环境变量 > config.yaml。

// ModelURL 模型服务接口地址（OpenAI 兼容格式），环境变量 MODEL_URL 可覆盖
var ModelURL string

// ModelKey 模型服务的 API 密钥，环境变量 MODEL_KEY 可覆盖
var ModelKey string

// ModelName 要调用的模型名称，环境变量 MODEL_NAME 可覆盖
var ModelName string
