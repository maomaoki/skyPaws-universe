/**
 * read 的目录分支：只列一层，不递归，不生成结构树。
 * 输出按“目录在前、名称排序”组织；预算超限时明确点名剩余数量。
 */

import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";
import { ToolError } from "../errors.ts";
import { humanSize } from "../fsx/index.ts";
import { READ_DIR_LIMITS, SKIPPED_DIRS } from "./config.ts";

export interface DirReadResult {
  content: string;
  entryCount: number;
  truncated: boolean;
  omittedCount: number;
}

interface DirEntry {
  name: string;
  kind: "dir" | "file" | "link";
  fullPath: string;
}

export async function readDirectory(absolutePath: string, displayPath: string): Promise<DirReadResult> {
  // 1. 读目录项；读不到通常是权限或并发删除，收敛成 E_IO
  let rawEntries: Dirent[];
  try {
    rawEntries = await fs.readdir(absolutePath, { withFileTypes: true });
  } catch (error) {
    throw toDirectoryError(error, displayPath);
  }
  // 2. 只收集名字与类型，不逐项 stat；大目录不会因为列一遍就变慢
  const entries: DirEntry[] = [];
  for (const entry of rawEntries) {
    // 3. 噪声目录直接跳过，避免一屏全是 node_modules
    if (entry.isDirectory() && SKIPPED_DIRS.includes(entry.name)) continue;
    // 4. 符号链接只展示、不跟随：跟随会带来越界与循环两个麻烦
    const kind = entry.isSymbolicLink() ? "link" : entry.isDirectory() ? "dir" : "file";
    entries.push({ name: entry.name, kind, fullPath: path.join(absolutePath, entry.name) });
  }
  // 5. 排序：目录在前，同类按名称；用码点比较，避免 locale 影响顺序
  entries.sort((left, right) => {
    if (left.kind !== right.kind) {
      if (left.kind === "dir") return -1;
      if (right.kind === "dir") return 1;
    }
    return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
  });
  // 6. 空目录给一句明确的话，不返回空字符串
  if (entries.length === 0) {
    return { content: `${displayPath} · （空目录）`, entryCount: 0, truncated: false, omittedCount: 0 };
  }
  // 7. 按行数 + 字符预算收集；只有真正要展示的条目才去取大小
  const lines: string[] = [];
  let usedChars = 0;
  let shown = 0;
  for (const entry of entries) {
    if (shown >= READ_DIR_LIMITS.maxEntries) break;
    const line = await formatEntry(entry);
    if (usedChars + line.length + 1 > READ_DIR_LIMITS.maxChars) break;
    lines.push(line);
    usedChars += line.length + 1;
    shown += 1;
  }
  const omittedCount = entries.length - shown;
  const truncated = omittedCount > 0;
  // 8. 头部写清目录与总数，尾部点名省略数量
  const header = `${displayPath} · ${entries.length} 项`;
  const footer = truncated
    ? `（还有 ${omittedCount} 个条目未列出；用 read 打开子目录，或缩小读取范围）`
    : "";
  const content = [header, "", ...lines, ...(footer ? ["", footer] : [])].join("\n");
  return { content, entryCount: entries.length, truncated, omittedCount };
}

async function formatEntry(entry: DirEntry): Promise<string> {
  // 1. 三类条目统一宽度前缀，方便模型按列扫读
  if (entry.kind === "dir") return `[dir]  ${entry.name}/`;
  if (entry.kind === "link") return `[link] ${entry.name}`;
  // 2. 文件大小只是展示信息，取不到就显示 0，不因此让整个目录读取失败
  return `[file] ${entry.name}  ${humanSize(await sizeOf(entry.fullPath))}`;
}

async function sizeOf(filePath: string): Promise<number> {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

function toDirectoryError(error: unknown, displayPath: string): ToolError {
  // 1. 权限不足是很常见的真实场景，hint 要指出“换个目录”而不是“重试”
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : undefined;
  if (code === "EACCES" || code === "EPERM") {
    return new ToolError("E_IO", `没有权限读取目录：${displayPath}`, "换一个目录，或用 shell 的 ls 查看权限设置。");
  }
  if (code === "ENOENT") {
    return new ToolError("E_NOT_FOUND", `目录不存在：${displayPath}`, "先用 read 列出父目录，确认路径拼写。");
  }
  if (code === "ENOTDIR") {
    return new ToolError("E_KIND_UNSUPPORTED", `不是目录：${displayPath}`, "如果它是文件，直接传文件路径读取内容。");
  }
  if (code === "ENAMETOOLONG") {
    return new ToolError("E_INVALID_PARAM", `路径过长：${displayPath}`, "确认路径没有重复拼接；用相对路径而不是一长串 ../。");
  }
  return new ToolError("E_IO", `读取目录失败：${displayPath}`, "检查路径与文件系统状态后重试。");
}
