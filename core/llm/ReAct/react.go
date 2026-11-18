// Package react 实现 ReAct（Reasoning + Acting）循环对话。
package react

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"github.com/maomaoki/skyPaws-universe/core/llm/ReAct/model"
)

// maxSteps 单轮对话的最大循环次数，防止模型反复输出动作停不下来。
const maxSteps = 10

// ReActChat 用 ReAct 循环处理一条用户消息。
func ReActChat(baseURL, apiKey, modelName, prompt string) {

	// 次数
	// step := 0

	// 创建 HTTP 客户端，用于本轮所有请求
	client := &http.Client{}

	// 发送请求
	u, _ := url.Parse(baseURL)
	u.Path = u.Path + "/chat/completions"

	// 2. 组装请求体，序列化成 JSON
	payload, _ := json.Marshal(model.ChatRequest{
		Model: modelName,
		Messages: []model.Message{
			{Role: model.RoleUser, Content: prompt},
		},
	})

	// 3. 创建 HTTP 请求，写入头
	req, _ := http.NewRequest("POST", u.String(), bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	// 4. client 发出去，拿回响应
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println(err)
		return
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Println(err)
		return
	}

	fmt.Println(string(body))

	defer func(Body io.ReadCloser) {
		err := Body.Close()
		if err != nil {

		}
	}(resp.Body)

	//// 1. 死循环（最大次数）
	//for {
	//	// 每次循环 ++
	//	step++
	//	// 2.
	//
	//	// 到达 最大次数 会停止下来
	//	if step > maxSteps {
	//		break
	//	}
	//
	//}

}
