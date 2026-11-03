/**
 * read 的文件分支：体积门禁 → 二进制探针 → 解码 → 切行 → 预算内交付。
 * “截断必须自报”在这里落地：头部写范围与 next_offset，超宽行在原位标注。
 */

import { ToolError, abortIfNeeded } from "../errors.ts";
import { decodeUtf8, detectEol, humanSize, probeBytes, renderLine, splitLines, formatLineNumber } from "../fsx/index.ts";
import { READ_LIMITS } from "./config.ts";
import type { ReadParams } from "./params.ts";
import { readWholeFile, statRegularFile } from "./fs_access.ts";

export interface FileReadResult {
  content: string;
  metadata: {
    kind: "file";
    mtime: string;
    size: number;
    totalLines: number;
    eol: string;
    truncated: boolean;
    nextOffset: number | null;
    lineWidthTruncated: boolean;
  };
}

export async function readTextFile(
  absolutePath: string,
  displayPath: string,
  params: ReadParams,
  signal?: AbortSignal,
): Promise<FileReadResult> {
  // 1. 先 stat，体积门禁与 mtime 都来自这里；stat 也顺带确认它确实是文件
  const stats = await statRegularFile(absolutePath, displayPath);
  if (stats.size > READ_LIMITS.maxFileBytes) {
    throw new ToolError(
      "E_TOO_LARGE",
      `文件 ${humanSize(stats.size)} 超过单次读取上限 ${humanSize(READ_LIMITS.maxFileBytes)}。`,
      "用 offset / limit 分段读；若需要全文处理，改用 shell 的 grep / head 等命令。",
    );
  }
  // 2. 一次读入内存（已有体积上限，不会撑爆进程）
  const buffer = await readWholeFile(absolutePath, displayPath);
  // 3. 读到的实际字节可能比 stat 时多（文件正在被写），再判一次上限
  if (buffer.byteLength > READ_LIMITS.maxFileBytes) {
    throw new ToolError(
      "E_TOO_LARGE",
      `文件在读取过程中增长，已超过 ${humanSize(READ_LIMITS.maxFileBytes)}。`,
      "等写入结束再读；或用 offset / limit 分段读取。",
    );
  }
  abortIfNeeded(signal);
  // 4. 二进制探针：采样窗口足够判断，避免为了分类而做全量扫描
  const probe = probeBytes(buffer.subarray(0, READ_LIMITS.probeBytes));
  if (probe.kind === "binary") {
    throw unsupportedBinary(displayPath, probe.reason);
  }
  if (probe.kind === "utf16") {
    throw new ToolError(
      "E_KIND_UNSUPPORTED",
      `检测到 ${probe.reason} 编码：${displayPath}`,
      "M0 只读 UTF-8；用 shell 的 iconv 转成 UTF-8 后重试。",
    );
  }
  // 5. 严格 UTF-8 解码，非法字节直接报错而不是替换成乱码
  const text = decodeUtf8(buffer, probe.hasUtf8Bom);
  // 6. 探针只看前 8 KB，NUL 出现在更后面时在这里补一刀
  if (text.includes("\u0000")) {
    throw unsupportedBinary(displayPath, "包含 NUL 字节");
  }
  const lines = splitLines(text);
  const eol = detectEol(text);
  const totalLines = lines.length;
  const baseMetadata = {
    kind: "file" as const,
    mtime: stats.mtime.toISOString(),
    size: stats.size,
    totalLines,
    eol,
  };
  // 7. 空文件单独处理：任何 offset 都超出范围，不带参数则给明确结论
  if (totalLines === 0) {
    if (params.offset !== undefined) {
      throw new ToolError(
        "E_INVALID_PARAM",
        `offset=${params.offset} 超出范围，文件共 0 行。`,
        "空文件不需要 offset；直接不带参数读取即可。",
      );
    }
    return {
      content: `${displayPath} · 共 0 行\n\n（空文件）`,
      metadata: { ...baseMetadata, truncated: false, nextOffset: null, lineWidthTruncated: false },
    };
  }
  // 8. offset 越界要报出真实行数，让模型知道该从哪里续读
  const startLine = params.offset ?? 1;
  if (startLine > totalLines) {
    throw new ToolError(
      "E_INVALID_PARAM",
      `offset=${startLine} 超出范围，文件仅 ${totalLines} 行。`,
      `把 offset 设为 1–${totalLines} 之间的值。`,
    );
  }
  // 9. 逐行渲染，同时吃行数预算与字符预算；任一超限就停在上一行
  const maxLinesThisCall = Math.min(params.limit ?? READ_LIMITS.maxLines, READ_LIMITS.maxLines);
  const rendered: string[] = [];
  let usedChars = 0;
  let wasWidthTruncated = false;
  let lastShownLine = startLine - 1;
  for (let index = startLine - 1; index < lines.length; index += 1) {
    if (rendered.length >= maxLinesThisCall) break;
    // 10. 每 256 行响应一次中断，长文件按 Ctrl+C 能立刻停
    if (index % 256 === 0) abortIfNeeded(signal);
    const line = renderLine(lines[index]!, READ_LIMITS.maxLineWidth);
    if (line.wasTruncated) wasWidthTruncated = true;
    const numbered = `${formatLineNumber(index + 1)}\t${line.text}`;
    // 11. 头部与可能的尾部提示预留空间，避免结果刚好卡在预算边缘
    if (usedChars + numbered.length + 1 > READ_LIMITS.maxChars - 200) break;
    rendered.push(numbered);
    usedChars += numbered.length + 1;
    lastShownLine = index + 1;
  }
  // 12. 一行都没放下说明单行就超预算，换策略比继续切更有效
  if (rendered.length === 0) {
    throw new ToolError(
      "E_TOO_LARGE",
      "单次读取预算不足以容纳任何一行。",
      "减小 limit 无用；改用 shell 的 cut / head 处理这个超宽文件。",
    );
  }
  const truncated = lastShownLine < totalLines;
  const nextOffset = truncated ? lastShownLine + 1 : null;
  // 13. 头部一句话说清范围与续读位置，模型不必翻到文末才知道被截断
  const rangeText = `显示 ${startLine}–${lastShownLine}`;
  const truncateText = truncated ? `（已截断，next_offset=${nextOffset}）` : "";
  const header = `${displayPath} · 共 ${totalLines} 行 · ${rangeText}${truncateText}`;
  const footer = truncated ? `\n\n（已省略第 ${nextOffset}–${totalLines} 行；继续读请传 offset=${nextOffset}）` : "";
  return {
    content: `${header}\n\n${rendered.join("\n")}${footer}`,
    metadata: { ...baseMetadata, truncated, nextOffset, lineWidthTruncated: wasWidthTruncated },
  };
}

function unsupportedBinary(displayPath: string, reason: string): ToolError {
  // 1. 二进制与文本走两条完全不同的处理路径，提示直接指向可用手段
  return new ToolError(
    "E_KIND_UNSUPPORTED",
    `不是文本文件（${reason}）：${displayPath}`,
    "不要用 read 读二进制；需要查看时用 shell 的 file / strings 命令。",
  );
}
