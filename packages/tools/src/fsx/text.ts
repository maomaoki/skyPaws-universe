/**
 * 文本原语：解码、切行、行尾识别、体积显示。
 * 纯函数，不抛业务错误的地方一律返回窄结果。
 */

import { ToolError } from "../errors.ts";

export type EolStyle = "lf" | "crlf" | "cr" | "mixed" | "none";

export function decodeUtf8(bytes: Uint8Array, hasBom: boolean): string {
  // 1. BOM 已在探针阶段识别，解码时去掉，避免首个标识符带不可见字符
  const body = hasBom ? bytes.subarray(3) : bytes;
  // 2. fatal 模式：非法 UTF-8 直接失败，不悄悄替换成 U+FFFD
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new ToolError(
      "E_DECODE",
      "文件不是合法的 UTF-8 文本。",
      "改用 shell 的 file 命令确认编码；确认后用 iconv 转成 UTF-8 再读。",
    );
  }
}

export function splitLines(text: string): string[] {
  // 1. 空文本没有行
  if (text.length === 0) return [];
  // 2. 按 CRLF / LF / CR 切行，最后一行没有换行符也算一行
  const lines = text.split(/\r\n|\n|\r/);
  // 3. 结尾换行会产生一个多余的空元素，去掉它（"a\n" 是 1 行不是 2 行）
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function detectEol(text: string): EolStyle {
  // 1. 分别数 CRLF、裸 LF、裸 CR；出现两种以上就是 mixed
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  const cr = (text.match(/\r(?!\n)/g) ?? []).length;
  const kinds = [crlf > 0, lf > 0, cr > 0].filter(Boolean).length;
  if (kinds > 1) return "mixed";
  if (crlf > 0) return "crlf";
  if (lf > 0) return "lf";
  if (cr > 0) return "cr";
  return "none";
}

export function humanSize(bytes: number): string {
  // 1. 按 B / KB / MB 三档显示，保留一位小数
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
