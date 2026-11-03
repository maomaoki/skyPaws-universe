/**
 * 预算原语：单行截断与行号渲染。
 * 只负责“把一行变成可交付的一行”，总量预算由 read_file 控制。
 */

export interface LineRender {
  text: string;
  wasTruncated: boolean;
}

export function renderLine(line: string, maxWidth: number): LineRender {
  // 1. 行宽在预算内：原样返回
  if (line.length <= maxWidth) return { text: line, wasTruncated: false };
  // 2. 截断点不能落在代理对中间，否则会产出半个 emoji
  let cut = maxWidth;
  const lastCode = line.charCodeAt(cut - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) cut -= 1;
  // 3. 超宽：截断并标注原长，让模型知道这里丢了内容
  return {
    text: `${line.slice(0, cut)}…[本行原长 ${line.length} 字符，仅显示前 ${cut}]`,
    wasTruncated: true,
  };
}

export function formatLineNumber(lineNumber: number, width = 6): string {
  // 1. 行号右对齐，宽度固定，方便模型按列阅读
  return String(lineNumber).padStart(width, " ");
}
