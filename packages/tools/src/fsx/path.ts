/**
 * 路径原语：把模型给的路径收敛到仓库根内。
 * 只做判定与归一化，不读文件、不产出面向模型的业务文案。
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { ToolError } from "../errors.ts";

const OUTSIDE_HINT = "改用仓库根内的相对路径，例如 packages/cli/src/repl.ts 或 docs。";

export interface ResolvedPath {
  /** 收敛后的绝对路径，保证落在仓库根内 */
  absolutePath: string;
  /** 仓库根的真实路径，用于计算展示用的相对路径 */
  rootReal: string;
}

export async function resolveInsideRoot(root: string, input: string): Promise<ResolvedPath> {
  // 1. 空路径和 NUL 字符直接拒绝（NUL 会被系统当作路径截断符）
  if (input.length === 0 || input.includes("\0")) {
    throw new ToolError("E_INVALID_PARAM", "path 不能为空，也不能包含 NUL 字符。", OUTSIDE_HINT);
  }
  // 2. 根目录本身也取真实路径：Windows 盘符大小写、根目录是符号链接都要对齐
  const rootReal = await realpathOrThrow(root);
  // 3. 相对路径拼到根上；绝对路径保留，交给越界判定
  const candidate = path.resolve(rootReal, input);
  // 4. 路径可能不存在，realpath 只能从最近的已存在祖先开始
  const ancestor = await nearestExistingAncestor(candidate);
  const ancestorReal = await fs.realpath(ancestor);
  const tail = path.relative(ancestor, candidate);
  const absolutePath = tail === "" ? ancestorReal : path.join(ancestorReal, tail);
  // 5. 归一化后再判一次，符号链接指向根外也会在这里被拦住
  assertInsideRoot(rootReal, absolutePath);
  return { absolutePath, rootReal };
}

async function realpathOrThrow(root: string): Promise<string> {
  // 1. 根不存在是配置错误，比“文件不存在”更严重，单独给提示
  try {
    return await fs.realpath(root);
  } catch {
    throw new ToolError("E_IO", `仓库根不存在或不可访问：${root}`, "检查启动目录；read 的所有路径都相对于它。");
  }
}

export function assertInsideRoot(root: string, target: string): void {
  // 1. 用相对路径表达位置；返回绝对路径（跨盘符）或 .. 开头都算越界
  const relative = path.relative(root, target);
  const isOutside = relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  if (isOutside) {
    throw new ToolError("E_OUTSIDE_ROOT", `路径越出仓库根：${target}`, OUTSIDE_HINT);
  }
}

async function nearestExistingAncestor(target: string): Promise<string> {
  // 1. 从目标本身开始向上找，第一个存在的路径就是 realpath 的起点
  let current = target;
  for (;;) {
    try {
      await fs.stat(current);
      return current;
    } catch (error) {
      // 2. 只有“不存在”才继续向上；权限等其它错误原样抛出
      if (!isNotFound(error)) throw error;
    }
    const parent = path.dirname(current);
    // 3. 到达盘符根仍没有存在的祖先，说明整条路径都不可用
    if (parent === current) {
      throw new ToolError("E_NOT_FOUND", `路径不存在：${target}`, "先用 read 列出父目录，确认路径拼写。");
    }
    current = parent;
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}
