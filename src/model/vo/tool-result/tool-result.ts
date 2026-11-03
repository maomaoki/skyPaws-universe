/**
 * ToolResult：工具执行完交给内核的唯一交付物。
 * 模型只能看到 content 与 hint；status / code / metadata 只给程序读。
 */

import type { ToolErrorCode } from "./tool-error-code.ts";
import type { ToolStatus } from "./tool-status.ts";

export interface ToolResult {
  /** 给模型看的正文。成功：状态行 + 空行 + 正文；失败：只有状态行。 */
  content: string;

  /** 这一次调用是否兑现了工具契约。截断仍是 ok，不描述数据完整性。 */
  status: ToolStatus;

  /** 错误码。仅 status === "error" 时有值，其余状态省略。 */
  code?: ToolErrorCode;

  /** 下一步动作，祈使句。成功但被截断时也要写。绝不放文件内容。 */
  hint?: string;

  /** 程序用的事实（mtime / totalLines / exitCode…），不进模型上下文。 */
  metadata?: Record<string, unknown>;
}
