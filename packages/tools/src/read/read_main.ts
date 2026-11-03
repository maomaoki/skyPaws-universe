/**
 * read 的入口：校验 → 路径收敛 → stat 分流 → 交给文件或目录分支。
 * 这里是 read 唯一知道“两条分支存在”的地方。
 */

import path from "node:path";
import { ToolError, toErrorResult } from "../errors.ts";
import { resolveInsideRoot } from "../fsx/index.ts";
import { parseReadParams } from "./params.ts";
import type { ReadParams } from "./params.ts";
import { readTextFile } from "./read_file.ts";
import { readDirectory } from "./read_dir.ts";
import { statPath } from "./fs_access.ts";
import { isSensitivePath } from "./config.ts";
import type { RiskLevel, Tool, ToolContext, ToolResult } from "../registry.ts";

const DESCRIPTION = [
  "读取仓库内的文本文件，或列出一个目录的条目。",
  "- 传文件路径：返回带行号的内容；内容过长会截断并给出 next_offset，用它继续读下一段。",
  "- 传目录路径：返回该目录的直接条目（目录在前），不递归；要深入子目录，对子目录再调用一次。",
  "- path 必须是仓库根相对路径，不允许越出仓库根。",
  "- 不要用它读图片、PDF、二进制文件，会报 E_KIND_UNSUPPORTED。",
  "- 返回的行号只是阅读坐标，不是文件内容；传给 edit_file 的 old_string 不要带行号。",
  "- offset / limit 只对文件模式有效，目录模式传了会报 E_INVALID_PARAM。",
].join("\n");

export const readTool: Tool = {
  definition: {
    name: "read",
    description: DESCRIPTION,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "仓库根相对路径，例如 packages/cli/src/repl.ts 或 docs",
        },
        offset: {
          type: "integer",
          minimum: 1,
          description: "文件模式：起始行号（1 起），默认 1",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 2000,
          description: "文件模式：最多读取行数，默认 2000",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    riskLevel: "low",
  },

  riskOf(args: unknown): RiskLevel {
    // 1. 参数本身不合法时保持基线，交给 execute 报参数错误
    if (typeof args !== "object" || args === null || !("path" in args)) return "low";
    const rawPath = (args as { path?: unknown }).path;
    // 2. 拿不到路径也按基线处理
    if (typeof rawPath !== "string") return "low";
    // 3. 敏感文件名（.env / 私钥）升为 high：确认 UI 是唯一能看到内容的地方
    return isSensitivePath(rawPath) ? "high" : "low";
  },

  preview(args: unknown): string {
    // 1. 敏感文件只展示路径与风险，不预读内容，避免密钥进入终端历史
    const rawPath = typeof args === "object" && args !== null && "path" in args ? (args as { path?: unknown }).path : "";
    return `即将读取敏感文件：${String(rawPath)}\n该文件可能包含 API key、密码或私钥，内容会进入本次会话记录。`;
  },

  async execute(args: unknown, ctx: ToolContext): Promise<ToolResult> {
    // 1. 参数校验放在最前：不合法就不碰磁盘
    let params: ReadParams;
    try {
      params = parseReadParams(args);
    } catch (error) {
      return toErrorResult(error);
    }
    try {
      // 2. 路径收敛：越界、符号链接逃逸都在这一步拦住
      const { absolutePath, rootReal } = await resolveInsideRoot(ctx.root, params.path);
      // 3. 展示路径按真实位置算，绝对路径也会显示成简洁的相对形式
      const displayPath = toDisplayPath(rootReal, absolutePath);
      // 4. stat 分流：文件走读内容，目录走列表；两者之外的类型直接拒绝
      const stats = await statPath(absolutePath, displayPath);
      if (stats.isDirectory()) {
        // 5. 目录模式不能带文件参数，否则模型会以为 limit 生效了
        if (params.offset !== undefined || params.limit !== undefined) {
          throw new ToolError(
            "E_INVALID_PARAM",
            "目录模式不支持 offset / limit。",
            "去掉这两个参数；要深入子目录，直接对子目录再调用一次 read。",
          );
        }
        const result = await readDirectory(absolutePath, displayPath);
        return {
          content: result.content,
          isError: false,
          metadata: {
            kind: "dir",
            entryCount: result.entryCount,
            truncated: result.truncated,
            omittedCount: result.omittedCount,
          },
        };
      }
      // 6. 文件模式：正常读取并返回带预算信息的 metadata
      const result = await readTextFile(absolutePath, displayPath, params, ctx.signal);
      return { content: result.content, isError: false, metadata: result.metadata };
    } catch (error) {
      // 7. 所有失败都变成 ToolResult 回喂模型，不让异常穿透循环
      return toErrorResult(error);
    }
  },
};

function toDisplayPath(rootReal: string, absolutePath: string): string {
  // 1. 相对仓库根显示；根目录本身显示成 "."
  const relative = path.relative(rootReal, absolutePath).split(path.sep).join("/");
  return relative.length === 0 ? "." : relative;
}
