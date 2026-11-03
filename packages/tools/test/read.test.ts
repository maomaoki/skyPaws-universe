/**
 * read 工具的行为测试：每个用例对应契约 §4.1 的一条边界。
 * 用临时目录当仓库根，不碰真实仓库。
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readTool } from "../src/read/index.ts";
import { isSensitivePath } from "../src/read/index.ts";

let root: string;

async function run(args: unknown) {
  return readTool.execute(args, { root });
}

before(async () => {
  // 1. 造一个临时“仓库”，把所有边界的素材都放进去
  root = await fs.mkdtemp(path.join(os.tmpdir(), "skypaws-read-"));
  await fs.mkdir(path.join(root, "docs"));
  await fs.mkdir(path.join(root, "node_modules"));
  await fs.writeFile(path.join(root, "README.md"), "# 标题\n\n第一段\n第二段\n", "utf8");
  await fs.writeFile(path.join(root, "docs", "note.md"), "笔记\n", "utf8");
  await fs.writeFile(path.join(root, "empty.txt"), "", "utf8");
  await fs.writeFile(path.join(root, "crlf.txt"), "a\r\nb\r\n", "utf8");
  await fs.writeFile(path.join(root, "binary.bin"), Buffer.from([0x00, 0x01, 0x02, 0xff]));
  await fs.writeFile(path.join(root, "utf16.txt"), Buffer.from([0xff, 0xfe, 0x61, 0x00]));
  await fs.writeFile(path.join(root, "long-line.txt"), "x".repeat(5000) + "\n", "utf8");
  await fs.writeFile(path.join(root, "many-lines.txt"), Array.from({ length: 300 }, (_, i) => `line ${i + 1}`).join("\n") + "\n", "utf8");
  await fs.writeFile(path.join(root, ".env"), "SECRET=1\n", "utf8");
  await fs.writeFile(path.join(root, ".env.example"), "KEY=\n", "utf8");
  // 2. 一个体积超过 1 MB 的文件
  await fs.writeFile(path.join(root, "big.txt"), "y".repeat(1024 * 1024 + 1), "utf8");
});

after(async () => {
  // 1. 清理临时目录
  await fs.rm(root, { recursive: true, force: true });
});

describe("read · 文件模式", () => {
  test("读取文件带行号，头部给出总行数", async () => {
    const result = await run({ path: "README.md" });
    assert.equal(result.isError, false);
    assert.match(result.content, /共 4 行/);
    assert.match(result.content, /1\t# 标题/);
    assert.match(result.content, /4\t第二段/);
    assert.equal(result.metadata?.kind, "file");
    assert.equal(result.metadata?.totalLines, 4);
  });

  test("offset 从指定行开始", async () => {
    const result = await run({ path: "README.md", offset: 3 });
    assert.equal(result.isError, false);
    assert.match(result.content, /显示 3–4/);
    assert.doesNotMatch(result.content, /# 标题/);
  });

  test("limit 限制行数，并给出 next_offset", async () => {
    const result = await run({ path: "many-lines.txt", limit: 10 });
    assert.equal(result.isError, false);
    assert.equal(result.metadata?.truncated, true);
    assert.equal(result.metadata?.nextOffset, 11);
    assert.match(result.content, /next_offset=11/);
  });

  test("offset 越界报出真实行数", async () => {
    const result = await run({ path: "README.md", offset: 99 });
    assert.equal(result.isError, true);
    assert.match(result.content, /E_INVALID_PARAM/);
    assert.match(result.content, /文件仅 4 行/);
  });

  test("空文件返回明确说明，不是空字符串", async () => {
    const result = await run({ path: "empty.txt" });
    assert.equal(result.isError, false);
    assert.match(result.content, /空文件/);
    assert.equal(result.metadata?.totalLines, 0);
  });

  test("CRLF 原样识别，不转换", async () => {
    const result = await run({ path: "crlf.txt" });
    assert.equal(result.isError, false);
    assert.equal(result.metadata?.eol, "crlf");
  });

  test("超宽行截断并在原位标注原长", async () => {
    const result = await run({ path: "long-line.txt" });
    assert.equal(result.isError, false);
    assert.match(result.content, /本行原长 5000/);
    assert.equal(result.metadata?.lineWidthTruncated, true);
  });

  test("二进制文件被拒绝", async () => {
    const result = await run({ path: "binary.bin" });
    assert.equal(result.isError, true);
    assert.match(result.content, /E_KIND_UNSUPPORTED/);
  });

  test("UTF-16 明确拒绝并指路", async () => {
    const result = await run({ path: "utf16.txt" });
    assert.equal(result.isError, true);
    assert.match(result.content, /UTF-16/);
    assert.match(result.content, /iconv/);
  });

  test("超过 1 MB 直接拒绝", async () => {
    const result = await run({ path: "big.txt" });
    assert.equal(result.isError, true);
    assert.match(result.content, /E_TOO_LARGE/);
  });

  test("不存在的文件给出 E_NOT_FOUND", async () => {
    const result = await run({ path: "nope.txt" });
    assert.equal(result.isError, true);
    assert.match(result.content, /E_NOT_FOUND/);
  });
});

describe("read · 目录模式", () => {
  test("列目录：目录在前，跳过 node_modules", async () => {
    const result = await run({ path: "." });
    assert.equal(result.isError, false);
    assert.equal(result.metadata?.kind, "dir");
    const lines = result.content.split("\n");
    assert.ok(lines.some((line) => line.includes("[dir]  docs/")));
    assert.ok(!result.content.includes("node_modules"));
  });

  test("目录模式传 limit 报 E_INVALID_PARAM", async () => {
    const result = await run({ path: "docs", limit: 5 });
    assert.equal(result.isError, true);
    assert.match(result.content, /E_INVALID_PARAM/);
    assert.match(result.content, /目录模式不支持/);
  });

  test("目录当文件读也会列条目（按 stat 分流）", async () => {
    const result = await run({ path: "docs" });
    assert.equal(result.isError, false);
    assert.match(result.content, /note\.md/);
  });
});

describe("read · 路径与参数", () => {
  test("越出仓库根被拒绝", async () => {
    const result = await run({ path: "../outside.txt" });
    assert.equal(result.isError, true);
    assert.match(result.content, /E_OUTSIDE_ROOT/);
  });

  test("绝对路径在根内允许", async () => {
    const result = await run({ path: path.join(root, "README.md") });
    assert.equal(result.isError, false);
  });

  test("绝对路径在根外被拒绝", async () => {
    const result = await run({ path: path.resolve(root, "..", "x.txt") });
    assert.equal(result.isError, true);
    assert.match(result.content, /E_OUTSIDE_ROOT/);
  });

  test("多余参数被拒绝，不静默忽略", async () => {
    const result = await run({ path: "README.md", recursive: true });
    assert.equal(result.isError, true);
    assert.match(result.content, /不支持的参数/);
  });

  test("offset 传字符串被拒绝", async () => {
    const result = await run({ path: "README.md", offset: "2" });
    assert.equal(result.isError, true);
    assert.match(result.content, /E_INVALID_PARAM/);
  });

  test("缺少 path 被拒绝", async () => {
    const result = await run({});
    assert.equal(result.isError, true);
    assert.match(result.content, /path 必填/);
  });
});

describe("read · 预算与中断", () => {
  test("字符预算先于行数预算触发时，仍给出正确的 next_offset", async () => {
    // 1. 造 200 行、每行 1000 字符的文件，总字符超过 60,000
    await fs.writeFile(path.join(root, "wide.txt"), Array.from({ length: 200 }, () => "z".repeat(1000)).join("\n") + "\n", "utf8");
    const result = await run({ path: "wide.txt" });
    assert.equal(result.isError, false);
    assert.equal(result.metadata?.truncated, true);
    const next = result.metadata?.nextOffset as number;
    assert.ok(next > 1 && next <= 200);
    // 2. 用 next_offset 续读，应从头之后的某一行开始，且不重叠
    const nextPage = await run({ path: "wide.txt", offset: next });
    assert.equal(nextPage.isError, false);
    assert.match(nextPage.content, new RegExp(`显示 ${next}–`));
  });

  test("已中止的 signal 返回 E_ABORTED", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await readTool.execute({ path: "README.md" }, { root, signal: controller.signal });
    assert.equal(result.isError, true);
    assert.match(result.content, /E_ABORTED/);
  });

  test("符号链接指向根外时被拒绝", async (t) => {
    // 1. Windows 普通用户可能没有创建符号链接的权限，拿不到就跳过
    try {
      await fs.symlink(path.resolve(root, ".."), path.join(root, "escape-link"), "dir");
    } catch {
      t.skip("当前环境不允许创建符号链接");
      return;
    }
    const result = await run({ path: "escape-link" });
    assert.equal(result.isError, true);
    assert.match(result.content, /E_OUTSIDE_ROOT/);
  });
});

describe("read · 敏感文件识别", () => {
  test(".env 与私钥命中，模板与普通文件不命中", () => {
    assert.equal(isSensitivePath(".env"), true);
    assert.equal(isSensitivePath("config/.env.local"), true);
    assert.equal(isSensitivePath(".env.example"), false);
    assert.equal(isSensitivePath("keys/server.pem"), true);
    assert.equal(isSensitivePath("docs/note.md"), false);
  });
});
