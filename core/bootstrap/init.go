// Package bootstrap 负责应用启动时的各项初始化（配置加载等）。
package bootstrap

import (
	"fmt"
	"os"

	"github.com/maomaoki/skyPaws-universe/core/config"
)

// Init 读取配置文件并填充全局变量（见 global.go）。
// 配置优先级：环境变量 > config.yaml。
// path 为空时默认读取项目根目录的 config.yaml。
func Init(path string) error {
	cfg, err := config.Load(path)
	if err != nil {
		return fmt.Errorf("初始化失败: %w", err)
	}

	ModelURL = cfg.ModelURL
	ModelKey = cfg.ModelKey
	ModelName = cfg.ModelName

	// 环境变量覆盖配置文件中的值
	override(&ModelURL, "MODEL_URL")
	override(&ModelKey, "MODEL_KEY")
	override(&ModelName, "MODEL_NAME")

	// 合并完所有配置来源后再校验必填项
	return validate()
}

// validate 校验必填的全局配置项
func validate() error {
	if ModelURL == "" {
		return fmt.Errorf("配置项 MODEL_URL 不能为空")
	}
	if ModelKey == "" {
		return fmt.Errorf("配置项 MODEL_KEY 不能为空")
	}
	if ModelName == "" {
		return fmt.Errorf("配置项 MODEL_NAME 不能为空")
	}
	return nil
}

// override 如果环境变量存在且非空，则用其覆盖目标全局变量
func override(target *string, envKey string) {
	if v := os.Getenv(envKey); v != "" {
		*target = v
	}
}
