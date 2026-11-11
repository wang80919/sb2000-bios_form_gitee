// ------------------------------------------------------------------------
// 名称：analyze-api-log.mjs
// 说明：解析模拟器 calllog 命令导出的 $FFF0 调用日志，按功能号（$063E）汇总调用次数、A/X/Y 取值、
//       调用者地址与调用时的参数内存，输出 Markdown 表供整理 DOS 接口。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/analyze-api-log.mjs [日志文件，默认 out/api/fff0.log] [输出文件，默认 out/api/fff0-summary.md]
//       日志每次调用占若干行：C 行为寄存器，STK 行为栈顶 8 字节，M 行为内存段。
// ------------------------------------------------------------------------
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { OUT_DIR } from './config.mjs';

const hex2 = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const hex4 = (value) => value.toString(16).toUpperCase().padStart(4, '0');

/**
 * 解析调用日志。
 * @param {string} text 日志全文
 * @returns {{a: number, x: number, y: number, caller: number, fn: number|null, sub: number|null, memory: Map<number, number[]>}[]}
 *   caller 为 JSR 之后的返回地址（栈上保存的是返回地址减一）；fn、sub 为调用时 $063E、$063F 的值（没有记录对应内存时为 null）
 */
export function parseCallLog(text) {
  const calls = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('C ')) {
      const fields = Object.fromEntries(line.slice(2).split(' ').map((part) => part.split('=')));
      current = { a: parseInt(fields.a, 16), x: parseInt(fields.x, 16), y: parseInt(fields.y, 16), caller: 0, fn: null, sub: null, memory: new Map() };
      calls.push(current);
    } else if (line.startsWith('STK ') && current) {
      const [low, high] = line.slice(4).split(' ').map((v) => parseInt(v, 16));
      current.caller = (((high << 8) | low) + 1) & 0xffff;
    } else if (line.startsWith('M ') && current) {
      const [address, ...values] = line.slice(2).split(' ');
      const start = parseInt(address, 16);
      const bytes = values.map((v) => parseInt(v, 16));
      current.memory.set(start, bytes);
      if (start <= 0x063e && start + bytes.length > 0x063e) current.fn = bytes[0x063e - start];
      if (start <= 0x063f && start + bytes.length > 0x063f) current.sub = bytes[0x063f - start];
    }
  }
  return calls;
}

/**
 * 按功能号汇总。
 * @param {ReturnType<typeof parseCallLog>} calls 解析后的调用
 * @returns {{fn: number|null, count: number, as: number[], xs: number[], ys: number[], callers: number[], sample: ReturnType<typeof parseCallLog>[number]}[]}
 */
export function summarizeCalls(calls) {
  const groups = new Map();
  for (const call of calls) {
    if (!groups.has(call.fn)) groups.set(call.fn, { fn: call.fn, count: 0, as: new Set(), xs: new Set(), ys: new Set(), callers: new Set(), sample: call });
    const group = groups.get(call.fn);
    group.count++;
    group.as.add(call.a);
    group.xs.add(call.x);
    group.ys.add(call.y);
    group.callers.add(call.caller);
  }
  const sorted = (set) => [...set].sort((p, q) => p - q);
  return [...groups.values()]
    .sort((p, q) => (p.fn ?? -1) - (q.fn ?? -1))
    .map((g) => ({ ...g, as: sorted(g.as), xs: sorted(g.xs), ys: sorted(g.ys), callers: sorted(g.callers) }));
}

/**
 * 把汇总结果写成 Markdown。
 * @param {ReturnType<typeof summarizeCalls>} groups 汇总
 * @param {number} total 调用总数
 * @returns {string}
 */
export function renderMarkdown(groups, total) {
  const lines = [
    '# $FFF0 调用汇总',
    '',
    `共 ${total} 次调用，${groups.length} 种功能号（$063E）。调用者为 JSR 之后的返回地址。`,
    '',
    '| $063E | 次数 | A 取值 | X 取值 | Y 取值 | 调用者（最多 6 个） | 首次调用时的 $063A-$0649 |',
    '| --- | ---: | --- | --- | --- | --- | --- |',
  ];
  for (const g of groups) {
    const callers = g.callers.slice(0, 6).map((c) => `$${hex4(c)}`).join(' ');
    const params = (g.sample.memory.get(0x063a) ?? []).map(hex2).join(' ');
    const fn = g.fn === null ? '-' : `$${hex2(g.fn)}`;
    lines.push(`| ${fn} | ${g.count} | ${g.as.map(hex2).join(' ')} | ${g.xs.map(hex2).join(' ')} | ${g.ys.map(hex2).join(' ')} | ${callers} | ${params} |`);
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1]?.endsWith('analyze-api-log.mjs')) {
  const input = process.argv[2] ?? path.join(OUT_DIR, 'api', 'fff0.log');
  const output = process.argv[3] ?? path.join(OUT_DIR, 'api', 'fff0-summary.md');
  const calls = parseCallLog(readFileSync(input, 'utf8'));
  writeFileSync(output, renderMarkdown(summarizeCalls(calls), calls.length));
  console.log(`已汇总 ${calls.length} 次调用，输出 ${output}`);
}
