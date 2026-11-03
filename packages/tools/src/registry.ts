/**
 * 工具契约：全项目唯一的 Tool 类型定义处（见 docs/2026-11-03-第0步-工具契约.md §3）。
 * 本文件只放形状；注册表的实现（注册 / 查找 / 校验）到 T4 再补。
 */

export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: false;
}

export type RiskLevel = "low" | "high";

export interface ToolDefinition {
  /** 模型可见的工具名，全项目固定，snake_case */
  name: string;
  /** 何时用 / 何时不用 / 返回什么 */
  description: string;
  /** 参数校验的唯一依据 */
  parameters: JsonSchema;
  /** 风险基线，权限层只能升不能降 */
  riskLevel: RiskLevel;
}

export interface ToolContext {
  /** 仓库根，所有相对路径的基准 */
  root: string;
  /** Ctrl+C 或超时取消 */
  signal?: AbortSignal;
}

export interface ToolResult {
  /** 成功是结果；失败是“错误 + 下一步”的两行教程 */
  content: string;
  isError: boolean;
  /** 事实数据，不自动进模型上下文 */
  metadata?: Record<string, unknown>;
}

export interface Tool {
  definition: ToolDefinition;
  execute(args: unknown, ctx: ToolContext): Promise<ToolResult>;
  /** 按参数细化风险：工具基线之上只能升，不能降 */
  riskOf?(args: unknown): RiskLevel;
  /** 高风险工具的确认预览：diff / 命令 / 路径警告 */
  preview?(args: unknown): string;
}
