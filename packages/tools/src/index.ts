/** tools 包唯一出口：M0 先只有 read，write_file / edit_file / shell 在 T6 / T7 加入。 */

export { readTool } from "./read/index.ts";
export { ToolError, toErrorResult } from "./errors.ts";
export type { ToolErrorCode } from "./errors.ts";
export type { Tool, ToolDefinition, ToolContext, ToolResult, JsonSchema, RiskLevel } from "./registry.ts";
