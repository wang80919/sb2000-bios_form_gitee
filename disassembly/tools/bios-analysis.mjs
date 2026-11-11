// ------------------------------------------------------------------------
// 名称：bios-analysis.mjs
// 说明：对原始 BIOS ROM 做代码范围分析：读入实测 CDL、静态追踪补全、划分代码段，并给出内核例程的符号名。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：bios-report.mjs（未分类区域报告）使用这一流水线；原来的 bios-gen.mjs（生成工程）已经删除。
// ------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { splitSegments } from './bios-listing.mjs';
import { BIOS_ROM, OUT_DIR } from './config.mjs';
import { analyzePages } from './cdl-listing.mjs';
import { findHeuristicCode } from './code-heuristic.mjs';
import { buildDispatchMap } from './dispatch-map.mjs';
import { extendCdl } from './static-trace.mjs';
import { symbolNames } from './symbols.mjs';

/** iNES 文件头长度 */
export const INES_HEADER = 16;

/** 固定内核区末尾的向量表与系统调用入口地址 */
const VECTORS = [0xfffa, 0xfffc, 0xfffe];
const SYSCALL_ENTRIES = [0xffea, 0xffed, 0xfff0, 0xfff3, 0xfff6];

/** 含代码的页至少要有这么多指令字节才按代码处理；只有零星几十个字节的“代码”多半是静态追踪误入数据 */
const MIN_CODE_BYTES = 128;

/** 默认的 CDL 文件前缀（五个场景合并后的结果） */
export const DEFAULT_CDL_PREFIX = path.join(OUT_DIR, 'cdl', 'all');

/**
 * 分析原始 BIOS。
 * @param {string} [prefix] CDL 文件前缀，读取 `${prefix}-rom.cdl`
 * @returns {{file: Uint8Array, rom: Uint8Array, cdl: Uint8Array, extended: ReturnType<typeof extendCdl>, heuristic: Set<number>, names: Map<number, string>, segments: import('./bios-listing.mjs').Segment[]}}
 *   file 含 iNES 文件头；rom 不含；cdl 为静态追踪与启发式识别补全后的标记；heuristic 是启发式新增的指令 ROM 偏移
 */
export function analyzeBios(prefix = DEFAULT_CDL_PREFIX) {
  const file = new Uint8Array(readFileSync(BIOS_ROM));
  const rom = file.subarray(INES_HEADER);
  const measured = new Uint8Array(readFileSync(`${prefix}-rom.cdl`)).subarray(0, rom.length);

  // 已读懂的例程用 symbols.mjs 的名字，其余系统调用处理例程用 API_<功能号>
  const names = symbolNames();
  const dispatch = buildDispatchMap(rom);
  for (const entry of dispatch) {
    if (entry.kind !== 'rom-table' || entry.stub || names.has(entry.handler)) continue;
    names.set(entry.handler, `API_${entry.fn.toString(16).toUpperCase().padStart(2, '0')}`);
  }

  const seeds = [
    ...VECTORS.map((v) => rom[0x4000 + (v - 0xc000)] | (rom[0x4000 + (v - 0xc000) + 1] << 8)),
    ...SYSCALL_ENTRIES,
    ...dispatch.filter((e) => e.kind === 'rom-table' && !e.stub).map((e) => e.handler),
    ...dispatch.filter((e) => e.kind === 'banked' && e.group !== null).map((e) => ({ group: e.group, address: e.handler })),
  ];
  const extended = extendCdl(rom, measured, seeds);
  const traced = extended.cdl;

  const pages = analyzePages(traced).map((p) => ({ index: p.index, base: p.base, codeBytes: p.codeBytes >= MIN_CODE_BYTES ? p.codeBytes : 0 }));
  const segments = splitSegments(pages);
  const { cdl, heuristic } = findHeuristicCode(rom, traced, segments);
  return { file, rom, cdl, extended, heuristic, names, segments };
}
