/**
 * read 模块的预算常量与风险规则：阈值集中一处，不在调用点写魔法数字。
 * 改动这里等于改契约，需要同步 docs/2026-11-03-第0步-工具契约.md §6。
 */

export const READ_LIMITS = {
  /** 单次最多读取行数 */
  maxLines: 2000,
  /** 单次最多输出的字符总数（行号与提示也算在内）；按中文≈1 token/字估算，60k 字约 6 万 token */
  maxChars: 60_000,
  /** 单行显示宽度上限 */
  maxLineWidth: 2000,
  /** 文件体积硬上限，超过直接拒绝 */
  maxFileBytes: 1024 * 1024,
  /** 二进制探针采样字节数 */
  probeBytes: 8192,
} as const;

/** 永远跳过的目录：噪声大且对理解仓库无帮助 */
export const SKIPPED_DIRS: readonly string[] = [".git", "node_modules"];

export const READ_DIR_LIMITS = {
  /** 单次最多列出的条目数 */
  maxEntries: 500,
  /** 单次最多输出的字符总数 */
  maxChars: 50_000,
} as const;

/**
 * 敏感文件名规则：命中后风险从 low 升到 high，确认文案提示可能含密钥。
 * .env.example 是模板，不含真实密钥，明确排除。
 */
export function isSensitivePath(relativePath: string): boolean {
  // 1. 统一分隔符并只看文件名部分
  const fileName = relativePath.split(/[\\/]/).pop() ?? "";
  // 2. 模板文件永远不敏感
  if (fileName === ".env.example" || fileName.endsWith(".env.example")) return false;
  // 3. 环境变量文件、私钥、证书私钥、SSH 私钥都是敏感名
  if (fileName === ".env" || fileName.startsWith(".env.")) return true;
  if (fileName.endsWith(".pem") || fileName.endsWith(".key")) return true;
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(fileName)) return true;
  return false;
}
