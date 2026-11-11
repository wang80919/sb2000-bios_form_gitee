// ------------------------------------------------------------------------
// 名称：static-trace.mjs
// 说明：从给定入口出发沿控制流静态追踪代码，把执行场景没有覆盖到、但可从已知入口到达的指令补进 CDL，
//       并记录哪些是推断出来的。覆盖固定内核区（$C000-$FFFF，ROM 第 4-7 页）和已知页组的换页区（$8000-$BFFF）。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：换页区的地址要结合页组才能换算成 ROM 偏移：页组 g 表示 ROM 第 g..g+3 页映射到 $8000-$BFFF。
//       追踪遇到非官方指令、地址无法换算、与已执行代码边界冲突、间接跳转时停止这条路径。
//       JSR 之后默认继续顺序追踪；JSR 到“内联跳转表”例程（见 INLINE_TABLE_SIGNATURE）时，
//       不再顺序追踪，而是把紧跟在 JSR 之后的地址表当作跳转目标。
// ------------------------------------------------------------------------
import { CDL } from './cdl-listing.mjs';
import { decodeInstruction, endsFlow } from './disasm.mjs';

const KERNEL_START = 0xc000;
const KERNEL_ROM_OFFSET = 0x4000;
const KERNEL_SIZE = 0x4000;
const PAGE = 0x1000;

/** 内联跳转表例程的特征字节：ASL A / TAY / PLA / STA $10 / PLA / STA $11 / INY / LDA ($10),Y / PHA / INY / LDA ($10),Y / STA $11 / PLA / STA $10 / JMP ($0010) */
const INLINE_TABLE_SIGNATURE = [0x0a, 0xa8, 0x68, 0x85, 0x10, 0x68, 0x85, 0x11, 0xc8, 0xb1, 0x10, 0x48, 0xc8, 0xb1, 0x10, 0x85, 0x11, 0x68, 0x85, 0x10, 0x6c, 0x10, 0x00];

/** 一张内联跳转表最多读取的表项数 */
const MAX_TABLE_ENTRIES = 64;

/**
 * 把（页组, 地址）换算成 ROM 偏移。
 * @param {number|null} group 页组；null 表示只认固定内核区
 * @param {number} address CPU 地址
 * @param {number} romLength ROM 空间字节数
 * @returns {number|null}
 */
export function physicalOffset(group, address, romLength) {
  if (address >= KERNEL_START && address <= 0xffff) return KERNEL_ROM_OFFSET + (address - KERNEL_START);
  if (group !== null && address >= 0x8000 && address < KERNEL_START) {
    const offset = (group + ((address - 0x8000) >> 12)) * PAGE + (address & 0xfff);
    return offset >= 0 && offset < romLength ? offset : null;
  }
  return null;
}

/**
 * 静态追踪并补全 CDL。
 * @param {Uint8Array} rom 整个 ROM 空间（不含 iNES 文件头）
 * @param {Uint8Array} cdl 实测得到的 CDL，不会被修改
 * @param {(number|{group: number|null, address: number})[]} seeds 额外的追踪入口；数字表示固定内核区地址，对象可指定页组。已执行指令的跳转目标与顺序后继会自动作为入口
 * @param {{noReturn?: number[]}} [options] noReturn 为“JSR 调用后不会回到下一条指令”的例程地址（除自动识别的内联跳转表外）
 * @returns {{cdl: Uint8Array, inferred: Set<number>, tableTargets: Set<number>, inlineTables: Map<number, number>}}
 *   补全后的 CDL 副本、推断出的指令首字节的 ROM 偏移、内联跳转表目标的 ROM 偏移，
 *   以及内联跳转表本身的位置（ROM 偏移 → 地址项数）
 */
export function extendCdl(rom, cdl, seeds, { noReturn = [] } = {}) {
  const result = Uint8Array.from(cdl);
  const inferred = new Set();
  const tableTargets = new Set();
  const inlineTables = new Map();
  const noReturnSet = new Set(noReturn);
  const queue = seeds.map((s) => (typeof s === 'number' ? { group: null, address: s } : s));
  const phys = (group, address) => physicalOffset(group, address & 0xffff, rom.length);
  const reader = (group) => (address) => rom[phys(group, address) ?? 0];

  /** 目标处的字节是否与内联跳转表例程的特征一致 */
  const isInlineTable = (group, target) =>
    INLINE_TABLE_SIGNATURE.every((byte, i) => {
      const at = phys(group, target + i);
      return at !== null && rom[at] === byte;
    });

  /** 指令之后的后继位置（含内联跳转表目标） */
  const successors = (ins, group) => {
    const next = [];
    if (ins.target !== null) next.push({ group, address: ins.target });
    const isJsr = ins.info.mnemonic === 'JSR';
    if (isJsr && isInlineTable(group, ins.target)) {
      // 表项是 JSR 之后紧跟的小端地址，遇到已被标成代码的字节或不可解码的目标就结束
      let at = ins.pc + 3;
      let count = 0;
      for (let n = 0; n < MAX_TABLE_ENTRIES; n++, at += 2) {
        const low = phys(group, at);
        const high = phys(group, at + 1);
        if (low === null || high === null || (result[low] | result[high]) & (CDL.OPCODE | CDL.OPERAND)) break;
        const entry = rom[low] | (rom[high] << 8);
        if (entry < 0x8000) break;
        const probe = decodeInstruction(reader(group), entry);
        if (!probe.info.official || phys(group, entry) === null) break;
        next.push({ group, address: entry });
        tableTargets.add(phys(group, entry));
        count++;
      }
      const tableStart = phys(group, ins.pc + 3);
      if (count > 0 && tableStart !== null) inlineTables.set(tableStart, Math.max(inlineTables.get(tableStart) ?? 0, count));
      return next;
    }
    if (!endsFlow(ins) && !(isJsr && noReturnSet.has(ins.target))) next.push({ group, address: ins.pc + ins.length });
    return next;
  };

  // 实测执行过的指令：换页区的页组由“页号 − 窗口号”推出，其后继（含没走到的分支）作为入口
  for (let offset = 0; offset < rom.length; offset++) {
    if (!(cdl[offset] & CDL.OPCODE)) continue;
    const page = offset >> 12;
    const window = (cdl[offset] >> 4) & 7;
    const kernel = page >= 4 && page <= 7 && window === page;
    if (!kernel && window > 3) continue;
    const group = kernel ? null : page - window;
    const address = 0x8000 + window * PAGE + (offset & 0xfff);
    queue.push(...successors(decodeInstruction(reader(group), address), group));
  }

  while (queue.length > 0) {
    const { group, address } = queue.pop();
    const offset = phys(group, address);
    if (offset === null || result[offset] & (CDL.OPCODE | CDL.OPERAND)) continue;

    const ins = decodeInstruction(reader(group), address);
    if (!ins.canonical || !ins.info.official) continue;

    // 每个字节都要能换算，且不能已被当作指令首字节，否则说明这里的边界与实测矛盾
    let usable = true;
    for (let i = 1; i < ins.length && usable; i++) {
      const at = phys(group, address + i);
      if (at === null || at !== offset + i || result[at] & CDL.OPCODE) usable = false;
    }
    if (!usable) continue;

    const window = ((address >> 12) & 7) << 4;
    result[offset] = (result[offset] & ~0x70) | window | CDL.OPCODE;
    for (let i = 1; i < ins.length; i++) result[offset + i] = (result[offset + i] & ~0x70) | window | CDL.OPERAND;
    inferred.add(offset);
    queue.push(...successors(ins, group));
  }
  return { cdl: result, inferred, tableTargets, inlineTables };
}
