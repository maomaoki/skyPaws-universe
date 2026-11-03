# skyPaws-universe

LLM 工具层。当前只做 read（读文件 + 读目录），glob / grep 留了结构位，分发层（计时、调用 id、日志、工具路由）不在这里——它出现时从 `src/index.ts` 取走工具函数即可。

## 结构

```
packages/core/src/
├─ index.ts          # 唯一出口
├─ vo.ts             # ToolsResultVo：唯一的结果契约
├─ config/
│  ├─ config.yaml    # 阈值 + 模型能力表（动态配置，换模型只改这里）
│  └─ config.ts      # 加载 + 启动即炸校验 + mtime 热重载
├─ fsx/              # 原语层：纯函数，不知道 VO，不知道面向模型的文案
│  ├─ probe.ts       #   魔数 / NUL / BOM / UTF-16 / UTF-8 → FileKind
│  ├─ text.ts        #   解码、切行、行尾、humanSize
│  ├─ budget.ts      #   行数/字符/行宽三重截断 + 行号渲染
│  ├─ gitignore.ts   #   目录收集和结构树共用的唯一来源
│  └─ path.ts        #   root 相对化 + 越界判定
└─ read/
   ├─ read_main.ts   # LLM 入口：越界检查 → 参数校验 → 分流
   ├─ read_file.ts   # 文件子工具：体积/类型门禁 → 按 kind 分通道交付
   └─ read_dir.ts    # 目录子工具：预算收集 + 结构树（full / partial / tree）
```

**fsx 与 read 的分界**：所有「给模型看的话」（message/hint）只出现在 `read/` 层；`fsx/` 返回窄结果或抛错。审计「模型到底看到了什么」只需要看一个目录。

## 关键行为约定

- **错误是教程**：每个 error 的 `hint` 写成「模型下一步会做的事」；错误码有 `E_NOT_FOUND / E_TOO_LARGE / E_KIND_UNSUPPORTED / E_DELIVERY_UNSUPPORTED / E_DECODE / E_OUTSIDE_ROOT / E_INVALID_PARAM / E_IO / E_NOT_FILE`。
- **能力表必须说实话**：`readable` 只能是工具层有交付通道的类别（text / image）。image 走 base64 内容块（`data: { kind:'image', mime, base64 }`）；写 pdf/binary 进配置启动就报。
- **行号**：read_file 内容带行号前缀（可配 `line_numbers`）。行号是工具算出的字节事实、读取时刻的坐标——响应带 `mtime`/`size` 供回写前核对新鲜度，编辑回写按内容匹配、不按行号。
- **截断必须自报**：`truncated` 标记 + `next_offset` 续读 + 单行宽度截断说明；目录 partial 模式附完整结构树并点名被预算挤出的文件。
- **预算红线**：行数 / 字符总量 / 单行宽度三重截断；目录整读受 `max_dir_files` / `max_dir_bytes` 约束；skipped 列表有硬上限（超出折成 `skipped_more`）。
- **不静默**：路径越界显式拒绝、offset 非法显式报错、混合行尾报 `mixed`、IO 异常收敛成 `E_IO` VO 而不是裸抛。

## 开发

```bash
cd packages/core
npm install
npm test          # node --test
npm run typecheck
```

要求 Node ≥ 22.18（原生 TS 类型剥离）。
