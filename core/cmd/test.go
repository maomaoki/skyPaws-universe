package main

import (
	"github.com/maomaoki/skyPaws-universe/core/bootstrap"
	react "github.com/maomaoki/skyPaws-universe/core/llm/ReAct"
)

func main() {

	err := bootstrap.Init("config.yaml")
	if err != nil {
		return
	}

	react.ReActChat(
		bootstrap.ModelURL,
		bootstrap.ModelKey,
		bootstrap.ModelName,
		"你好")
}
