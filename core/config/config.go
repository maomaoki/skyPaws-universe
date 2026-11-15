// Package config 负责读取应用配置文件（config.yaml）。
package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// 默认配置文件路径
const defaultPath = "config.yaml"

// Config 应用配置，对应根目录的 config.yaml
type Config struct {
	// 模型服务接口地址（OpenAI 兼容格式，通常以 /v1 结尾）
	ModelURL string `yaml:"MODEL_URL"`
	// 模型服务的 API 密钥
	ModelKey string `yaml:"MODEL_KEY"`
	// 要调用的模型名称
	ModelName string `yaml:"MODEL_NAME"`
}

// Load 读取并解析配置文件，path 为空时默认读取 config.yaml。
// 只负责解析，不做必填校验（校验在环境变量合并之后统一进行，见 bootstrap 包）。
func Load(path string) (*Config, error) {
	if path == "" {
		path = defaultPath
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("读取配置文件 %s 失败: %w", path, err)
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("解析配置文件 %s 失败: %w", path, err)
	}
	return &cfg, nil
}
