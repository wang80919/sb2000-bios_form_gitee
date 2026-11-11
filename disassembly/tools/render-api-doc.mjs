// ------------------------------------------------------------------------
// 名称：render-api-doc.mjs
// 说明：把系统调用分流表、已知符号与实测调用次数合并，生成 docs/generated/系统调用表.md。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/render-api-doc.mjs [ff16 调用日志，默认 out/api/full-ff16.log，不存在则不写实测列]
// ------------------------------------------------------------------------
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseCallLog } from './analyze-api-log.mjs';
import { BIOS_ROM, OUT_DIR, WORK_DIR } from './config.mjs';
import { buildDispatchMap } from './dispatch-map.mjs';
import { readAllInlineTables } from './banked-tables.mjs';
import { BANKED_SYMBOLS, KNOWN_SYMBOLS } from './symbols.mjs';
import { verifyDispatch } from './verify-dispatch.mjs';

const hex = (value, width) => value.toString(16).toUpperCase().padStart(width, '0');

const KIND_TEXT = {
  'ram-table': 'RAM 表（运行时登记）',
  'rom-table': '内核 ROM 表',
  banked: '换页后进入',
  none: '直接返回',
};

/**
 * 生成 Markdown。
 * @param {import('./dispatch-map.mjs').DispatchEntry[]} map 全部功能号的分流结果
 * @param {import('./symbols.mjs').KnownSymbol[]} symbols 已知符号
 * @param {Map<number, {count: number}>|null} observed 实测到的功能号与次数，没有则为 null
 * @param {Map<number, import('./banked-tables.mjs').BankedTarget>} [banked] 换页功能的真实处理例程，键为功能号
 * @param {{fn: number, name: string, summary: string}[]} [bankedSymbols] 换页功能的名称与说明
 * @returns {string}
 */
export function renderApiDoc(map, symbols, observed, banked = new Map(), bankedSymbols = []) {
  const byAddress = new Map(symbols.map((s) => [s.address, s]));
  const byFunction = new Map(bankedSymbols.map((s) => [s.fn, s]));
  // 入口内联表按“页组 + 入口地址”区分：同一页组里还有不走内联表的入口（如页组 $0F 的 $66 直接进 $8700）
  const tableEntries = new Set(map.filter((entry) => banked.has(entry.fn)).map((entry) => `${entry.group}:${entry.handler}`));
  const lines = [
    '# 系统调用表',
    '',
    '入口是 `JSR $FFF0`（`$FFF0` 是 `JMP $FD8E`）。调用前把功能号写入 `$063E`，子功能与参数放在 `$063F` 起的参数区和 A、X、Y 中；',
    '分发器在 `$FD8E-$FEFC`，规则见 `tools/dispatch-map.mjs`，并由 `tools/verify-dispatch.mjs` 用模拟器实测核对。',
    '本表由 `tools/render-api-doc.mjs` 生成，说明来自 `tools/symbols.mjs`；没有说明的功能尚未阅读，且不含指向“未实现”桩例程 `$E150` 的功能号。',
    '',
    '| 功能号 | 分流 | 页组 | 处理例程 | 符号 | 说明 | 实测次数 |',
    '| --- | --- | --- | --- | --- | --- | ---: |',
  ];
  for (const entry of map) {
    if (entry.stub || entry.kind === 'none') continue;
    if (entry.kind === 'ram-table') {
      // $00-$0F 共用同一条规则，合并成一行
      if (entry.fn === 0) {
        const total = observed ? [...observed].filter(([fn]) => fn < 0x10).reduce((sum, [, seen]) => sum + seen.count, 0) : '-';
        lines.push(`| $00-$0F | ${KIND_TEXT[entry.kind]} | 表项第 1 字节 | 表项第 2、3 字节 | | ${entry.note} | ${total} |`);
      }
      continue;
    }
    const count = observed ? (observed.get(entry.fn)?.count ?? 0) : '-';
    if (entry.kind === 'banked' && tableEntries.has(`${entry.group}:${entry.handler}`)) {
      // 页组入口处有内联表：用表里的真实例程；功能号落在表外时，表后面是例程代码，不会到达有效处理
      const target = banked.get(entry.fn);
      const named = byFunction.get(entry.fn);
      const where = target ? `$${hex(target.address, 4)}` : '表外';
      const detail = target ? (named?.summary ?? '') : '功能号超出入口内联表，没有对应例程';
      lines.push(`| $${hex(entry.fn, 2)} | ${KIND_TEXT.banked}（入口表） | $${hex(entry.group, 2)} | ${where} | ${named?.name ?? ''} | ${detail} | ${count} |`);
      continue;
    }
    const symbol = (entry.handler === null ? undefined : byAddress.get(entry.handler)) ?? (entry.kind === 'banked' ? byFunction.get(entry.fn) : undefined);
    const group = entry.group === null ? (entry.kind === 'banked' ? '运行时' : '-') : `$${hex(entry.group, 2)}`;
    const handler = entry.handler === null ? '运行时' : `$${hex(entry.handler, 4)}`;
    const note = symbol?.summary ?? entry.note;
    lines.push(`| $${hex(entry.fn, 2)} | ${KIND_TEXT[entry.kind]} | ${group} | ${handler} | ${symbol?.name ?? ''} | ${note} | ${count} |`);
  }
  lines.push('', '## 二级子功能表', '', '下面的功能号进入页组后，先检查 `$063F` 不超过最大子功能号（否则置 `$6300` 为出错码 1、带进位返回），再用子功能号查表。`$6300` 是这些服务的出错码，0 表示成功。', '', '| 功能号 | 子功能 | 页组 | 处理例程 | 实测次数 |', '| --- | --- | --- | --- | ---: |');
  for (const target of banked.values()) {
    for (const { sub, address } of target.subs ?? []) {
      const count = observed ? (observed.get(target.fn)?.subs?.get(sub) ?? 0) : '-';
      lines.push(`| $${hex(target.fn, 2)} | $${hex(sub, 2)} | $${hex(target.group, 2)} | $${hex(address, 4)} | ${count} |`);
    }
  }
  lines.push('', '## 内核里的辅助入口', '', '| 地址 | 符号 | 说明 |', '| --- | --- | --- |');
  for (const s of symbols.filter((x) => !x.name.startsWith('API_'))) {
    lines.push(`| $${hex(s.address, 4)} | ${s.name} | ${s.summary} |`);
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1]?.endsWith('render-api-doc.mjs')) {
  const log = process.argv[2] ?? path.join(OUT_DIR, 'api', 'full-ff16.log');
  const rom = new Uint8Array(readFileSync(BIOS_ROM)).subarray(16);
  const observed = existsSync(log) ? verifyDispatch(parseCallLog(readFileSync(log, 'utf8')), rom).observed : null;
  const target = path.join(WORK_DIR, 'docs', 'generated', '系统调用表.md');
  const map = buildDispatchMap(rom);
  writeFileSync(target, renderApiDoc(map, KNOWN_SYMBOLS, observed, readAllInlineTables(rom, map), BANKED_SYMBOLS));
  console.log(`已生成 ${target}`);
}
