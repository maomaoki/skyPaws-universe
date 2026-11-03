/** fsx 模块出口：路径 / 探针 / 文本 / 预算四个原语。 */

export { resolveInsideRoot, assertInsideRoot } from "./path.ts";
export type { ResolvedPath } from "./path.ts";
export { probeBytes } from "./probe.ts";
export type { ProbeResult } from "./probe.ts";
export { decodeUtf8, splitLines, detectEol, humanSize } from "./text.ts";
export type { EolStyle } from "./text.ts";
export { renderLine, formatLineNumber } from "./budget.ts";
export type { LineRender } from "./budget.ts";
