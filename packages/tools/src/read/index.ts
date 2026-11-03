/** read 模块唯一出口：外部只能拿到 readTool 与敏感路径判定，不深路径引用内部文件。 */

export { readTool } from "./read_main.ts";
export { isSensitivePath } from "./config.ts";
export { READ_LIMITS, READ_DIR_LIMITS } from "./config.ts";
