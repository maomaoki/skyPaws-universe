/**
 * 工具执行阶段的错误码。只在 status === "error" 时有值。
 * 用户拒绝与用户中止不是错误，用 ToolStatus 表达，不进这张表。
 *
 * 现状：占位。M0 写 read / write_file / edit_file / shell 时再按实际失败场景逐个补。
 * 补的时候：每个码加一句“什么时候触发”，并且只增不改——码一旦进过会话记录就是协议。
 */

export type ToolErrorCode = never;
