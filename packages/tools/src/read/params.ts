/**
 * read 的参数校验：不信任模型给的任何字段。
 * 校验失败一律 E_INVALID_PARAM，并在 hint 里给出正确用法。
 */

import { ToolError } from "../errors.ts";
import { READ_LIMITS } from "./config.ts";

export interface ReadParams {
  path: string;
  offset?: number;
  limit?: number;
}

const ALLOWED_KEYS = new Set(["path", "offset", "limit"]);

export function parseReadParams(args: unknown): ReadParams {
  // 1. 参数必须是对象，undefined 也不放过——模型该显式传 path
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    throw new ToolError("E_INVALID_PARAM", "参数必须是一个对象。", '正确形状：{"path":"docs/README.md","offset":1,"limit":200}');
  }
  const record = args as Record<string, unknown>;
  // 2. 多余字段直接拒绝：静默忽略会让模型以为自己传对了
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new ToolError(
        "E_INVALID_PARAM",
        `不支持的参数：${key}。`,
        "read 只接受 path、offset、limit；目录模式不能传 offset / limit。",
      );
    }
  }
  // 3. path 必填且非空
  if (typeof record.path !== "string" || record.path.length === 0) {
    throw new ToolError("E_INVALID_PARAM", "path 必填，且必须是非空字符串。", '正确形状：{"path":"docs/README.md"}');
  }
  // 4. offset / limit 可选，但出现就必须是正整数
  const offset = parseOptionalPositiveInt(record.offset, "offset");
  const limit = parseOptionalPositiveInt(record.limit, "limit");
  // 5. limit 不得超过单次上限，避免模型一次索要整个大仓库
  if (limit !== undefined && limit > READ_LIMITS.maxLines) {
    throw new ToolError(
      "E_INVALID_PARAM",
      `limit 最大为 ${READ_LIMITS.maxLines}，收到 ${limit}。`,
      `把 limit 调到 ${READ_LIMITS.maxLines} 以内，并用 next_offset 继续读。`,
    );
  }
  return { path: record.path, offset, limit };
}

function parseOptionalPositiveInt(value: unknown, name: string): number | undefined {
  // 1. 缺省就是缺省，不补默认值（默认值在 read_file 里按预算算）
  if (value === undefined) return undefined;
  // 2. 必须是整数；字符串 "10" 也拒绝，避免模型养成传字符串的习惯
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ToolError("E_INVALID_PARAM", `${name} 必须是大于等于 1 的整数。`, `把 ${name} 改成整数，例如 ${name}: 1。`);
  }
  return value;
}
