package main

import (
	"fmt"
	"log"

	"github.com/maomaoki/skyPaws-universe/core/bootstrap"
)

const defaultPath = "config.yaml"

func main() {
	err := bootstrap.Init(defaultPath)
	if err != nil {
		log.Fatal(err)
	}

	// 打印全局变量（已按 环境变量 > config.yaml 优先级合并）
	fmt.Println("MODEL_URL  =", bootstrap.ModelURL)
	fmt.Println("MODEL_KEY  =", bootstrap.ModelKey)
	fmt.Println("MODEL_NAME =", bootstrap.ModelName)
}
