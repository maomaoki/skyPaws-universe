/**
 * 工具错误：错误码 + 面向模型的两行文案。
 * 所有工具失败都收敛成 ToolResult（isError: true），不让异常穿透内核循环。
 */

import type { ToolResult } from "./registry.ts";

export type ToolErrorCode =
  | "E_INVALID_PARAM"
  | "E_OUTSIDE_ROOT"
  | "E_NOT_FOUND"
  | "E_TOO_LARGE"
  | "E_KIND_UNSUPPORTED"
  | "E_DECODE"
  | "E_IO"
  | "E_ABORTED";

export class ToolError extends Error {
  readonly code: ToolErrorCode;
  readonly hint: string;

  constructor(code: ToolErrorCode, message: string, hint: string) {
    super(message);
    this.name = "ToolError";
    this.code = code;
    this.hint = hint;
  }
}

export function toErrorResult(error: unknown): ToolResult {
  // 1. 已知错误：错误码 + 下一步，模型据此改道
  if (error instanceof ToolError) {
    return {
      content: `[${error.code}] ${error.message}\n下一步：${error.hint}`,
      isError: true,
      metadata: { code: error.code },
    };
  }
  // 2. 未知错误：兜底成 E_IO，保留原始信息方便排查
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: `[E_IO] 执行过程中发生未预期错误：${message}\n下一步：检查路径与文件权限；仍失败就改用 shell 的 ls / cat 观察。`,
    isError: true,
    metadata: { code: "E_IO" },
  };
}

export function abortIfNeeded(signal?: AbortSignal): void {
  // 1. 用户中断后不再继续读，避免把半截结果喂给模型
  if (signal?.aborted) {
    throw new ToolError("E_ABORTED", "操作已被用户中止。", "停止当前动作，等待新的指令。");
  }
}
