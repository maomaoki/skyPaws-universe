// Package getmodels 提供模型列表查询，返回原始 JSON 由调用方解析。
package getmodels

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
	// AuthBearer Authorization: Bearer <key>，OpenAI 及绝大多数兼容网关使用
	AuthBearer AuthStyle = "bearer"
	// AuthXAPIKey x-api-key: <key>，Anthropic 原生接口使用
	AuthXAPIKey AuthStyle = "x-api-key"
	// AuthAPIKey api-key: <key>，Azure OpenAI 使用
	AuthAPIKey AuthStyle = "api-key"
	// AuthQuery 以 ?key=<key> 查询参数携带，Google Gemini 使用
	AuthQuery AuthStyle = "query"
	// AuthNone 不携带任何认证，本地模型（ollama、vLLM 等）使用
	AuthNone AuthStyle = "none"
)

var defaultClient = &http.Client{Timeout: 30 * time.Second}

const maxErrBody = 4 << 10 // 4KB

// GetModelsRaw 请求 {baseURL}/models，以原始字节返回响应体，不做任何 JSON 解析。
// 各服务商返回结构差异很大（有的直接是数组，有的包在 data 字段里），解析交给调用方。
// 默认按 OpenAI 兼容方式携带密钥（Authorization: Bearer）。
func GetModelsRaw(baseURL, apiKey string) ([]byte, error) {
	return GetModelsRawWithAuth(baseURL, apiKey, AuthBearer)
}

// GetModelsRawWithAuth 与 GetModelsRaw 相同，但可指定密钥携带方式。
func GetModelsRawWithAuth(baseURL, apiKey string, style AuthStyle) ([]byte, error) {
	u, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return nil, fmt.Errorf("解析地址失败: %w", err)
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/models"

	req, err := http.NewRequest(http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	// 部分网关 / WAF 会拦截 Go 默认 UA，显式带一个
	req.Header.Set("User-Agent", "skyPaws/0.1")

	applyAuth(req, apiKey, style)

	resp, err := defaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求 %s 失败: %w", u.String(), err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, maxErrBody))
		msg := fmt.Sprintf("API 返回错误: status=%d", resp.StatusCode)
		if s := strings.TrimSpace(string(body)); s != "" {
			msg += ", body=" + s
		}
		return nil, errors.New(msg)
	}

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应数据失败: %w", err)
	}
	return raw, nil
}

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
