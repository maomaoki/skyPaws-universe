/**
 * 文件探针：只用前 8 KB 判断“能不能按 UTF-8 文本读”。
 * 判定结果窄而明确，文案由 read 层负责。
 */

export type ProbeResult =
  | { kind: "text"; hasUtf8Bom: boolean }
  | { kind: "binary"; reason: string }
  | { kind: "utf16"; reason: string };

const CONTROL_ALLOWED = new Set([0x09, 0x0a, 0x0c, 0x0d]);

export function probeBytes(sample: Uint8Array): ProbeResult {
  // 1. UTF-16 的 BOM 最明确：M0 只读 UTF-8，遇到就明确拒绝
  if (sample[0] === 0xff && sample[1] === 0xfe) return { kind: "utf16", reason: "UTF-16 LE" };
  if (sample[0] === 0xfe && sample[1] === 0xff) return { kind: "utf16", reason: "UTF-16 BE" };
  // 2. 识别 UTF-8 BOM，判定时先剥掉，避免把 BOM 字节当内容
  const hasUtf8Bom = sample[0] === 0xef && sample[1] === 0xbb && sample[2] === 0xbf;
  const body = hasUtf8Bom ? sample.subarray(3) : sample;
  // 3. NUL 是二进制最可靠的信号（文本文件不会出现）
  const nulCount = countByte(body, 0x00);
  if (nulCount > 0) {
    // 4. 无 BOM 的 UTF-16：ASCII 文本会隔一个字节一个 NUL，命中率高
    if (nulCount / body.length > 0.3) {
      return { kind: "utf16", reason: "疑似无 BOM 的 UTF-16" };
    }
    return { kind: "binary", reason: "包含 NUL 字节" };
  }
  // 5. 控制字符占比过高也按二进制处理；30% 是宽松的第一版阈值
  let control = 0;
  for (const byte of body) {
    if (byte < 0x20 && !CONTROL_ALLOWED.has(byte)) control += 1;
  }
  if (body.length > 0 && control / body.length > 0.3) {
    return { kind: "binary", reason: "控制字符占比过高" };
  }
  return { kind: "text", hasUtf8Bom };
}

function countByte(bytes: Uint8Array, target: number): number {
  // 1. 单遍计数，避免为了统计再分配数组
  let count = 0;
  for (const byte of bytes) {
    if (byte === target) count += 1;
  }
  return count;
}
