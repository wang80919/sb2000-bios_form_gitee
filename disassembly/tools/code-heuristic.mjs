// ------------------------------------------------------------------------
// 名称：code-heuristic.mjs
// 说明：在实测与静态追踪都没走到的字节里，按启发式规则找出“很像代码”的例程，补充为指令。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：只在代码段内、没有被读写过的连续区间里找。候选从区间起点（或起点之后 16 字节内）开始，
//       沿控制流（分支两路、JSR 与 JMP 的目标、顺序后继）做递归下降，并要求整个可达范围满足：
//       全是合法官方指令且没有 BRK；每条路径都以 RTS、RTI、JMP 结束，或接上已有的指令；
//       不会走出区间、不会落在别的指令中间；JSR/JMP 目标在可执行的地址范围，且在本段或内核区时必须是指令起点或未占用的位置；
//       可达的指令至少 MIN_INSTRUCTIONS 条。起点之后偏移出来的候选要求更多指令，以降低把数据误判为代码的概率。
//       结果是推测，清单里标为“启发式”。
// ------------------------------------------------------------------------
import { CDL } from './cdl-listing.mjs';
import { decodeInstruction, endsFlow } from './disasm.mjs';

const PAGE_SIZE = 4096;
const KERNEL_BASE = 0xc000;
const BANKED_BASE = 0x8000;

/** 候选可达的指令至少要有的条数；起点之后偏移出来的候选要求更多 */
const MIN_INSTRUCTIONS = 4;
const MIN_INSTRUCTIONS_SHIFTED = 10;

/** 从区间起点往后最多尝试的偏移 */
const MAX_START_SHIFT = 16;

/** JSR/JMP 可以指向的非 ROM 地址：系统 RAM 里的代码与扩展 RAM 里的代码 */
const isExecutableRam = (address) => (address >= 0x0600 && address <= 0x07ff) || (address >= 0x6000 && address <= 0x7fff);

/**
 * 在代码段里找出像代码的例程并补充到 CDL。
 * @param {Uint8Array} rom ROM 内容（不含文件头）
 * @param {Uint8Array} cdl 已有的 CDL，不会被修改
 * @param {{firstPage: number, pageCount: number, base: number}[]} segments 代码段
 * @returns {{cdl: Uint8Array, heuristic: Set<number>}} 补充后的 CDL 副本，以及新增指令首字节的 ROM 偏移
 */
export function findHeuristicCode(rom, cdl, segments) {
  const result = Uint8Array.from(cdl);
  const heuristic = new Set();
  const kernel = segments.find((s) => s.base === KERNEL_BASE);

  const isCode = (offset) => (result[offset] & (CDL.OPCODE | CDL.OPERAND)) !== 0;
  const isAccessed = (offset) => (result[offset] & (CDL.READ | CDL.WRITE)) !== 0;
  const isOccupied = (offset) => isCode(offset) || isAccessed(offset);

  /** 目标地址换算为 ROM 偏移；不在可换算的范围时返回 null */
  const resolve = (segment, address) => {
    if (address >= KERNEL_BASE) return kernel ? kernel.firstPage * PAGE_SIZE + (address - KERNEL_BASE) : null;
    if (segment.base >= KERNEL_BASE) return null;
    const inside = address >= segment.base && address < segment.base + segment.pageCount * PAGE_SIZE;
    return inside ? segment.firstPage * PAGE_SIZE + (address - segment.base) : null;
  };

  /**
   * 从 start 开始沿控制流解码，整个可达范围都合格才返回。
   * @param {{firstPage: number, pageCount: number, base: number}} segment 所在的段
   * @param {number} start 候选入口的 ROM 偏移
   * @param {number} runEnd 候选所在的未占用区间的结束偏移（不含）
   * @param {number} minInstructions 至少要有多少条指令
   * @returns {{offset: number, ins: object}[]|null}
   */
  const tryRoutine = (segment, start, runEnd, minInstructions) => {
    const segmentBase = segment.firstPage * PAGE_SIZE;
    const read = (address) => rom[segmentBase + (address - segment.base)] ?? 0;
    const inRun = (offset) => offset >= start && offset < runEnd;
    const visited = new Map();
    const covered = new Set();
    const work = [start];

    /** 控制流目标：已有指令起点直接接受，区间内的继续解码，其余不接受 */
    const follow = (target) => {
      if (target === null) return false;
      if (result[target] & CDL.OPCODE) return true;
      if (!inRun(target)) return false;
      work.push(target);
      return true;
    };

    /** JSR 与绝对 JMP 的目标：可以在别的页组或可执行 RAM 里（无法核对），在本段或内核区时要核对 */
    const callable = (address) => {
      if (isExecutableRam(address)) return true;
      if (address < BANKED_BASE) return false;
      const target = resolve(segment, address);
      if (target === null) return true;
      if (result[target] & CDL.OPCODE) return true;
      if (inRun(target)) {
        work.push(target);
        return true;
      }
      return !isOccupied(target);
    };

    while (work.length > 0) {
      const at = work.pop();
      if (visited.has(at)) continue;
      if (!inRun(at)) {
        if (result[at] & CDL.OPCODE) continue;
        return null;
      }
      const ins = decodeInstruction(read, segment.base + (at - segmentBase));
      if (!ins.canonical || !ins.info.official || ins.code === 0x00) return null;
      for (let i = 0; i < ins.length; i++) {
        if (at + i >= runEnd || covered.has(at + i) || isOccupied(at + i)) return null;
      }
      visited.set(at, ins);
      for (let i = 0; i < ins.length; i++) covered.add(at + i);

      const { mnemonic, mode } = ins.info;
      if (mode === 'rel') {
        if (!follow(resolve(segment, ins.target))) return null;
      } else if (mnemonic === 'JSR' || (mnemonic === 'JMP' && mode === 'abs')) {
        if (!callable(ins.target)) return null;
      }
      if (!endsFlow(ins)) {
        // 顺序后继：区间内继续解码，走出区间时必须接上已有的指令
        const next = at + ins.length;
        if (inRun(next)) work.push(next);
        else if (!(result[next] & CDL.OPCODE)) return null;
      }
    }
    if (visited.size < minInstructions) return null;
    return [...visited].map(([offset, ins]) => ({ offset, ins }));
  };

  const commit = (segment, instructions) => {
    for (const { offset, ins } of instructions) {
      // 访问窗口号取这条指令在本段里的汇编地址所在的 4K 窗口，与静态追踪的写法一致
      const home = (((segment.base + (offset - segment.firstPage * PAGE_SIZE)) >> 12) & 7) << 4;
      result[offset] = (result[offset] & ~0x70) | home | CDL.OPCODE;
      for (let i = 1; i < ins.length; i++) result[offset + i] = (result[offset + i] & ~0x70) | home | CDL.OPERAND;
      heuristic.add(offset);
    }
  };

  // 每找到一个例程，区间就被切开，所以反复扫描到没有新发现为止
  for (let changed = true; changed;) {
    changed = false;
    for (const segment of segments) {
      const segmentStart = segment.firstPage * PAGE_SIZE;
      const segmentEnd = segmentStart + segment.pageCount * PAGE_SIZE;
      for (let at = segmentStart; at < segmentEnd; at++) {
        // 只从“前一个字节是代码或已读写的数据”之后的未占用区间起点尝试
        if (isOccupied(at) || (at > segmentStart && !isOccupied(at - 1))) continue;
        let runEnd = at;
        while (runEnd < segmentEnd && !isOccupied(runEnd)) runEnd++;
        for (let shift = 0; shift <= MAX_START_SHIFT && at + shift < runEnd; shift++) {
          const routine = tryRoutine(segment, at + shift, runEnd, shift === 0 ? MIN_INSTRUCTIONS : MIN_INSTRUCTIONS_SHIFTED);
          if (!routine) continue;
          commit(segment, routine);
          changed = true;
          break;
        }
        at = runEnd;
      }
    }
  }
  return { cdl: result, heuristic };
}
