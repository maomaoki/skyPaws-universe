package llm

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// Message 一条对话消息
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// chatRequest 请求体
type chatRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
	Stream   bool      `json:"stream,omitempty"`
}

// chatResponse 非流式响应体
type chatResponse struct {
	Choices []struct {
		Message Message `json:"message"`
	} `json:"choices"`
}

// streamChunk 流式响应的单个分片
type streamChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
}

// Chat 发送一条消息，返回完整回复（非流式）
func Chat(baseURL, apiKey, modelName, prompt string) (string, error) {
	req, err := newChatRequest(baseURL, apiKey, modelName, prompt, false)
	if err != nil {
		return "", err
	}

	resp, err := defaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", statusError(resp)
	}

	var cr chatResponse
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取响应失败: %w", err)
	}

	if err := json.Unmarshal(raw, &cr); err != nil {
		return "", fmt.Errorf("解析响应失败: %w", err)
	}
	if len(cr.Choices) == 0 {
		return "", fmt.Errorf("响应中没有 choices")
	}
	return cr.Choices[0].Message.Content, nil
}

// ChatStream 发送一条消息，边收边回调，返回拼接后的完整回复（流式）
func ChatStream(baseURL, apiKey, modelName, prompt string, onDelta func(string)) (string, error) {
	req, err := newChatRequest(baseURL, apiKey, modelName, prompt, true)
	if err != nil {
		return "", err
	}

	resp, err := streamClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", statusError(resp)
	}

	var sb strings.Builder
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" || data == "[DONE]" {
			continue
		}

		var chunk streamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			return sb.String(), fmt.Errorf("解析流式数据失败: %w", err)
		}
		for _, c := range chunk.Choices {
			if c.Delta.Content == "" {
				continue
			}
			sb.WriteString(c.Delta.Content)
			if onDelta != nil {
				onDelta(c.Delta.Content)
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return sb.String(), fmt.Errorf("读取流式响应失败: %w", err)
	}
	return sb.String(), nil
}

// newChatRequest 构造 /chat/completions 请求，流式与非流式共用
func newChatRequest(baseURL, apiKey, modelName, prompt string, stream bool) (*http.Request, error) {
	reqURL, err := endpointURL(baseURL, "/chat/completions")
	if err != nil {
		return nil, err
	}

	payload, err := json.Marshal(chatRequest{
		Model:    modelName,
		Messages: []Message{{Role: "user", Content: prompt}},
		Stream:   stream,
	})
	if err != nil {
		return nil, fmt.Errorf("序列化请求体失败: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, reqURL, bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	applyAuth(req, apiKey, AuthBearer)
	return req, nil
}
