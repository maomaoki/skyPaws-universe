package main

import (
	"fmt"
	"log"

	"github.com/maomaoki/skyPaws-universe/core/bootstrap"
	"github.com/maomaoki/skyPaws-universe/core/llm"
)

const defaultPath = "config.yaml"

func main() {
	if err := bootstrap.Init(defaultPath); err != nil {
		log.Fatal(err)
	}

	const prompt = "你好，简单介绍一下你自己"

	result, err := llm.Chat(
		bootstrap.ModelURL,
		bootstrap.ModelKey,
		bootstrap.ModelName,
		prompt,
	)
	if err != nil {
		log.Fatal(err)
		return
	}

	fmt.Println(result)
}
