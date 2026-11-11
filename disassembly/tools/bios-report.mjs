// ------------------------------------------------------------------------
// 名称：bios-report.mjs
// 说明：报告 BIOS 里还没有被识别为指令的区域：各页的代码占比，代码段里连续的“未访问”字节，以及整页都当数据的页的像代码程度。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/bios-report.mjs [CDL 文件前缀] [--min 字节数，默认 32]；
//       “像代码程度”用线性扫描衡量：从区域起点开始连续解码出合法官方指令的条数，遇到非官方操作码或越界即停。
//       结论只供人工判断，不会改动工程。
// ------------------------------------------------------------------------
import path from 'node:path';
import { analyzeBios, DEFAULT_CDL_PREFIX } from './bios-analysis.mjs';
import { PAGE_SIZE } from './bios-listing.mjs';
import { CDL } from './cdl-listing.mjs';
import { decodeInstruction, endsFlow } from './disasm.mjs';

const hex = (value, width = 2) => value.toString(16).toUpperCase().padStart(width, '0');

/**
 * 从某处开始线性解码，统计连续合法官方指令的条数与总字节数。
 * @param {Uint8Array} rom ROM 内容
 * @param {number} start 起始 ROM 偏移
 * @param {number} end 结束 ROM 偏移（不含）
 * @returns {{count: number, bytes: number, mnemonics: string[], stoppedBy: string}}
 */
export function sweep(rom, start, end) {
  // 解码器只认 16 位地址，所以把区域起点当作 $8000 来读
  const read = (address) => rom[start + (address - 0x8000)] ?? 0;
  let at = start;
  let count = 0;
  const mnemonics = [];
  let stoppedBy = '区域结束';
  while (at < end) {
    const ins = decodeInstruction(read, 0x8000 + (at - start));
    if (!ins.info.official || !ins.canonical) {
      stoppedBy = `非官方操作码 $${hex(rom[at])}`;
      break;
    }
    if (at + ins.length > end) break;
    if (count < 4) mnemonics.push(ins.info.mnemonic);
    count++;
    at += ins.length;
  }
  return { count, bytes: at - start, mnemonics, stoppedBy };
}

/**
 * 找出段内连续未被识别为指令的字节区间。
 * @param {Uint8Array} cdl 补全后的 CDL
 * @param {number} start 起始 ROM 偏移
 * @param {number} end 结束 ROM 偏移（不含）
 * @param {number} minBytes 最小长度
 * @returns {{start: number, end: number, accessed: boolean}[]}
 */
export function unclassifiedRuns(cdl, start, end, minBytes) {
  const runs = [];
  let begin = null;
  const close = (at) => {
    if (begin !== null && at - begin >= minBytes) {
      let accessed = false;
      for (let i = begin; i < at; i++) if (cdl[i] & (CDL.READ | CDL.WRITE)) accessed = true;
      runs.push({ start: begin, end: at, accessed });
    }
    begin = null;
  };
  for (let at = start; at < end; at++) {
    if (cdl[at] & (CDL.OPCODE | CDL.OPERAND)) close(at);
    else if (begin === null) begin = at;
  }
  close(end);
  return runs;
}

if (process.argv[1]?.endsWith('bios-report.mjs')) {
  const args = process.argv.slice(2);
  const minIndex = args.indexOf('--min');
  const minBytes = minIndex >= 0 ? Number(args[minIndex + 1]) : 32;
  const prefix = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--min') ?? DEFAULT_CDL_PREFIX;
  const { rom, cdl, segments } = analyzeBios(prefix);

  console.log('== 代码段各页（指令字节 / 4096）与未识别的连续区间 ==');
  let remaining = 0;
  for (const segment of segments) {
    for (let page = segment.firstPage; page < segment.firstPage + segment.pageCount; page++) {
      const start = page * PAGE_SIZE;
      let instructionBytes = 0;
      for (let i = start; i < start + PAGE_SIZE; i++) if (cdl[i] & (CDL.OPCODE | CDL.OPERAND)) instructionBytes++;
      const base = segment.base + (page - segment.firstPage) * PAGE_SIZE;
      console.log(`第 ${hex(page)} 页 $${hex(base, 4)}：指令 ${instructionBytes} 字节`);
      for (const run of unclassifiedRuns(cdl, start, start + PAGE_SIZE, minBytes)) {
        const result = sweep(rom, run.start, run.end);
        remaining += run.end - run.start;
        console.log(`  $${hex(base + run.start - start, 4)} 长 ${run.end - run.start}${run.accessed ? '（被读写过）' : ''}：连续 ${result.count} 条（${result.mnemonics.join(' ')}…），${result.stoppedBy}`);
      }
    }
  }
  console.log(`代码段内未识别的连续区间共 ${remaining} 字节`);

  console.log('\n== 整页按数据处理的页：从页首线性解码的结果 ==');
  const inSegment = new Set(segments.flatMap((s) => Array.from({ length: s.pageCount }, (_, i) => s.firstPage + i)));
  for (let page = 0; page < rom.length / PAGE_SIZE; page++) {
    if (inSegment.has(page)) continue;
    const start = page * PAGE_SIZE;
    const result = sweep(rom, start, start + PAGE_SIZE);
    let accessed = 0;
    for (let i = start; i < start + PAGE_SIZE; i++) if (cdl[i] & (CDL.READ | CDL.WRITE)) accessed++;
    console.log(`第 ${hex(page)} 页：被读写 ${accessed} 字节，页首连续 ${result.count} 条（${result.mnemonics.join(' ')}…），${result.stoppedBy}`);
  }
  console.log(`\n（${path.basename(prefix)}）`);
}
