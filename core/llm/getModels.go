package llm

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// AuthStyle 指定 API Key 在请求中的携带方式。
// 各服务商差异很大，不能假定都是 Authorization: Bearer。
type AuthStyle string

const (
	// AuthBearer Authorization: Bearer <key>
	// OpenAI 及绝大多数兼容网关使用。
	AuthBearer AuthStyle = "bearer"
	// AuthXAPIKey x-api-key: <key>，Anthropic 原生接口使用。
	AuthXAPIKey AuthStyle = "x-api-key"
	// AuthAPIKey api-key: <key>，Azure OpenAI 使用。
	AuthAPIKey AuthStyle = "api-key"
	// AuthQuery 以 ?key=<key> 查询参数携带，Google Gemini 使用。
	AuthQuery AuthStyle = "query"
	// AuthNone 不携带任何认证，本地模型（ollama、vLLM 等）使用。
	AuthNone AuthStyle = "none"
)

// defaultClient 全局复用一个客户端以复用 TCP 连接；需要调整超时改这里。
var defaultClient = &http.Client{Timeout: 30 * time.Second}

// streamClient 流式请求专用：Timeout 覆盖整个响应体读取，长回复不能用 30s。
var streamClient = &http.Client{Timeout: 10 * time.Minute}

// maxErrBody 出错时最多读取的响应体字节数，避免超大响应撑爆错误信息。
const maxErrBody = 4 << 10 // 4KB

// GetModelsRaw 请求 {baseURL}/models，并以原始字节返回响应体，不做任何 JSON 解析。
// 各服务商返回结构差异很大（有的直接是数组，有的包在 data 字段里），解析交给调用方。
// 默认按 OpenAI 兼容方式携带密钥（Authorization: Bearer）。
func GetModelsRaw(baseURL, apiKey string) ([]byte, error) {
	return GetModelsRawWithAuth(baseURL, apiKey, AuthBearer)
}

// GetModelsRawWithAuth 与 GetModelsRaw 相同，但可指定密钥携带方式。
func GetModelsRawWithAuth(baseURL, apiKey string, style AuthStyle) ([]byte, error) {
	reqURL, err := modelsURL(baseURL)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest(http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	// 部分网关 / WAF 会拦截 Go 默认 UA，显式带一个
	req.Header.Set("User-Agent", "skyPaws/0.1")

	applyAuth(req, apiKey, style)

	resp, err := defaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求 %s 失败: %w", reqURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, statusError(resp)
	}

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应数据失败: %w", err)
	}
	return raw, nil
}

// modelsURL 把 baseURL 与 /models 拼接，并保留原有 query 参数。
// 注意：baseURL 需自带版本前缀（如 https://api.openai.com/v1），本函数不会自动补 /v1。
func modelsURL(baseURL string) (string, error) {
	return endpointURL(baseURL, "/models")
}

// endpointURL 把 baseURL 与接口路径拼接，并保留原有 query 参数。
// 注意：baseURL 需自带版本前缀（如 https://api.openai.com/v1），本函数不会自动补 /v1。
func endpointURL(baseURL, path string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return "", fmt.Errorf("解析地址失败: %w", err)
	}
	if u.Scheme == "" || u.Host == "" {
		return "", fmt.Errorf("地址不合法，需要形如 https://host/v1 的完整地址: %q", baseURL)
	}
	u.Path = strings.TrimRight(u.Path, "/") + path
	return u.String(), nil
}

// applyAuth 按指定方式写入认证信息；key 为空时不写任何认证头。
func applyAuth(req *http.Request, apiKey string, style AuthStyle) {
	key := strings.TrimSpace(apiKey)
	if key == "" || style == AuthNone {
		return
	}

	switch style {
	case AuthXAPIKey:
		req.Header.Set("x-api-key", key)
	case AuthAPIKey:
		req.Header.Set("api-key", key)
	case AuthQuery:
		q := req.URL.Query()
		q.Set("key", key)
		req.URL.RawQuery = q.Encode()
	default: // AuthBearer
		// 调用方误传完整头时，避免出现 "Bearer Bearer xxx"
		if len(key) > 7 && strings.EqualFold(key[:7], "Bearer ") {
			key = key[7:]
		}
		req.Header.Set("Authorization", "Bearer "+key)
	}
}

// statusError 构造带状态码和响应体片段的错误。
func statusError(resp *http.Response) error {
	body, _ := io.ReadAll(io.LimitReader(resp.Body, maxErrBody))

	msg := fmt.Sprintf("API 返回错误: status=%d", resp.StatusCode)
	if s := strings.TrimSpace(string(body)); s != "" {
		msg += ", body=" + s
	}
	switch resp.StatusCode {
	case http.StatusUnauthorized, http.StatusForbidden:
		msg += "（密钥无效或无权限，检查 MODEL_KEY 与认证方式）"
	case http.StatusNotFound:
		msg += "（地址可能缺少版本前缀，如 /v1）"
	}
	return errors.New(msg)
}
