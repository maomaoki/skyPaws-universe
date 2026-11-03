/**
 * 文件访问：stat 与 read 的薄封装，把系统 errno 翻译成带下一步的错误。
 * read_file 只管流程，不关心 ENOENT / EACCES 这些底层细节。
 */

import { promises as fs } from "node:fs";
import type { Stats } from "node:fs";
import { ToolError } from "../errors.ts";

export async function statPath(absolutePath: string, displayPath: string): Promise<Stats> {
  // 1. 分流前先 stat；不存在、无权限要在同一处翻译成可执行的错误
  try {
    return await fs.stat(absolutePath);
  } catch (error) {
    const code = errnoOf(error);
    if (code === "ENOENT") {
      throw new ToolError("E_NOT_FOUND", `路径不存在：${displayPath}`, "先用 read 列出父目录，确认路径拼写。");
    }
    if (code === "EACCES" || code === "EPERM") {
      throw new ToolError("E_IO", `没有权限访问：${displayPath}`, "检查权限，或换一个路径。");
    }
    if (code === "ENOTDIR") {
      throw new ToolError("E_NOT_FOUND", `路径中有一段不是目录：${displayPath}`, "先用 read 列出父目录，确认路径拼写。");
    }
    if (code === "ENAMETOOLONG") {
      throw new ToolError("E_INVALID_PARAM", `路径过长：${displayPath}`, "确认路径没有重复拼接；用相对路径而不是一长串 ../。");
    }
    throw new ToolError("E_IO", `访问路径失败：${displayPath}`, "检查路径与文件系统状态后重试。");
  }
}

export async function statRegularFile(absolutePath: string, displayPath: string): Promise<Stats> {
  // 1. 路径不存在、权限不足、指向目录，三种情况给不同的错误码
  try {
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) {
      throw new ToolError("E_KIND_UNSUPPORTED", `不是普通文件：${displayPath}`, "传目录会列出条目；传文件才会读内容。");
    }
    return stats;
  } catch (error) {
    if (error instanceof ToolError) throw error;
    throw toFileError(error, displayPath, "读取");
  }
}

export async function readWholeFile(absolutePath: string, displayPath: string): Promise<Buffer> {
  // 1. stat 与 read 之间文件可能被删或被占，统一收敛成可读的错误
  try {
    return await fs.readFile(absolutePath);
  } catch (error) {
    throw toFileError(error, displayPath, "读取");
  }
}

function toFileError(error: unknown, displayPath: string, action: string): ToolError {
  // 1. 按 errno 分类；其余少见错误统一归到 E_IO，保留可执行的提示
  const code = errnoOf(error);
  if (code === "ENOENT") {
    return new ToolError("E_NOT_FOUND", `文件不存在：${displayPath}`, "先用 read 列出父目录，确认路径拼写。");
  }
  if (code === "EACCES" || code === "EPERM") {
    return new ToolError("E_IO", `没有权限${action}文件：${displayPath}`, "检查文件权限，或用 shell 的 ls -l 查看。");
  }
  if (code === "EISDIR") {
    return new ToolError("E_KIND_UNSUPPORTED", `这是目录：${displayPath}`, "直接对目录调用 read 会列出条目。");
  }
  if (code === "ENOTDIR") {
    return new ToolError("E_NOT_FOUND", `路径中有一段不是目录：${displayPath}`, "先用 read 列出父目录，确认路径拼写。");
  }
  if (code === "ENAMETOOLONG") {
    return new ToolError("E_INVALID_PARAM", `路径过长：${displayPath}`, "确认路径没有重复拼接；用相对路径而不是一长串 ../。");
  }
  return new ToolError("E_IO", `${action}文件失败：${displayPath}`, "检查文件是否存在、是否被其他程序占用。");
}

function errnoOf(error: unknown): string | undefined {
  // 1. Node 的系统错误都带 code；不是对象就当没有，交给 E_IO 兜底
  return typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : undefined;
}
