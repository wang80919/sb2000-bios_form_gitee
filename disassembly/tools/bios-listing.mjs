// ------------------------------------------------------------------------
// 名称：bios-listing.mjs
// 说明：把 BIOS 按“段”（一段是汇编地址连续的若干页）生成可重新汇编的汇编源文件：指令按指令输出，
//       其余字节按 .byte 输出；段内与固定内核区的跳转、分支、读取地址都用标签表示。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：段由页的“汇编地址”划分：被换页功能映射到 $8000-$BFFF 的页，汇编地址是它被执行时所在的窗口地址；
//       ROM 第 4-7 页固定映射到 $C000-$FFFF。同一页在不同页组里可能出现在不同窗口，这里只取执行最多的窗口。
//       写入类指令（STA、STX、STY、INC、DEC、移位）的地址视为硬件或内存目标，不生成标签；
//       引用落在某条指令中间时写成“标签+偏移”，引用落在数据里时在该处切开数据并生成标签。
//       地址表（项项都指向有效指令起点的 16 位地址，来自静态追踪的内联跳转表，或在未执行字节里连续出现 4 项以上）输出成 .word；
//       成对写入相邻地址的两个立即数（LDA #低 / STA 地址 / LDA #高 / STA 地址+1）若合成的值指向 ROM 或系统 RAM，
//       输出成 #<标签 与 #>标签；低于 $8000 的内存、寄存器地址用 bios-names.mjs 提供的符号名（零页与 $0100 以下的绝对地址除外，保持原写法）。
// ------------------------------------------------------------------------
import { decodeInstruction } from './disasm.mjs';
import { CDL } from './cdl-listing.mjs';

/** 页大小 */
export const PAGE_SIZE = 4096;

/** 固定内核区：ROM 第 4-7 页，汇编地址 $C000-$FFFF */
export const KERNEL_FIRST_PAGE = 4;
export const KERNEL_BASE = 0xc000;
const BANKED_BASE = 0x8000;

/** 不为其地址生成标签的写入类助记符 */
const WRITE_MNEMONICS = new Set(['STA', 'STX', 'STY', 'INC', 'DEC', 'ASL', 'LSR', 'ROL', 'ROR', 'SAX', 'SLO', 'SRE', 'RLA', 'RRA', 'DCP', 'ISC']);

/** 载入立即数的指令与对应的存储指令 */
const LOAD_TO_STORE = { LDA: 'STA', LDX: 'STX', LDY: 'STY' };

/** 启发式识别地址表时的项数范围；项数太少的误判概率高，所以至少 4 项 */
const MIN_HEURISTIC_TABLE_ENTRIES = 4;
const MAX_HEURISTIC_TABLE_ENTRIES = 128;

/** 立即数合成的值落在系统 RAM（$0600-$07FF）或扩展 RAM（$6000-$7FFF）、且存进零页时，当作指向变量的地址 */
const isPointerRam = (value) => (value >= 0x0600 && value <= 0x07ff) || (value >= 0x6000 && value <= 0x7fff);

/** 系统调用的功能号与子功能号寄存器 */
const SYSCALL_REGISTERS = [0x063e, 0x063f];

const hex2 = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const hex4 = (value) => value.toString(16).toUpperCase().padStart(4, '0');

/**
 * @typedef {object} Segment
 * @property {number} firstPage 第一页的页号
 * @property {number} pageCount 页数
 * @property {number} base 第一页的汇编地址
 */

/**
 * 按页的汇编地址把含代码的页划分成段：页号连续、汇编地址连续，且不跨越固定内核区的边界。
 * @param {{index: number, base: number, codeBytes: number}[]} pages 每页的分析结果
 * @returns {Segment[]}
 */
export function splitSegments(pages) {
  const segments = [];
  let current = null;
  for (const page of pages) {
    if (page.codeBytes === 0) {
      current = null;
      continue;
    }
    const last = current && current.firstPage + current.pageCount - 1;
    const sameKind = current && (current.base < KERNEL_BASE) === (page.base < KERNEL_BASE);
    if (current && last === page.index - 1 && current.base + current.pageCount * PAGE_SIZE === page.base && sameKind) {
      current.pageCount++;
    } else {
      current = { firstPage: page.index, pageCount: 1, base: page.base };
      segments.push(current);
    }
  }
  return segments;
}

/**
 * 生成每个段的汇编正文。
 * @param {Uint8Array} rom ROM 内容（不含 iNES 文件头）
 * @param {Uint8Array} cdl 与 ROM 等长的代码数据标记
 * @param {{segments: Segment[], names?: Map<number, string>, inferred?: Set<number>, labelOffsets?: Set<number>}} options
 *   names 为固定内核区地址到符号名；inferred 为静态推断出的指令 ROM 偏移；labelOffsets 为强制生成标签的指令 ROM 偏移；
 *   inlineTables 为内联跳转表的 ROM 偏移与项数；heuristic 为启发式识别出的指令 ROM 偏移（注释标为“启发式”）；ramName 把低于 $8000 的地址换成符号名（返回 null 表示保持数字）；
 *   usedRam 若提供，用过的符号地址会加入其中（用来生成符号定义文件）
 * @returns {Map<number, string>} 键为段的第一页页号，值为不含文件头的汇编正文
 */
export function generateSegmentBodies(rom, cdl, {
  segments,
  names = new Map(),
  inferred = new Set(),
  heuristic = new Set(),
  labelOffsets = new Set(),
  inlineTables = new Map(),
  ramName = () => null,
  usedRam = new Set(),
}) {
  // ROM 偏移 -> 所在的段
  const segmentOfPage = new Map();
  for (const segment of segments) for (let i = 0; i < segment.pageCount; i++) segmentOfPage.set(segment.firstPage + i, segment);
  const segmentAt = (offset) => segmentOfPage.get(Math.floor(offset / PAGE_SIZE));
  const addressOf = (offset) => {
    const segment = segmentAt(offset);
    return segment.base + (offset - segment.firstPage * PAGE_SIZE);
  };
  const kernelSegment = segments.find((s) => s.base === KERNEL_BASE && s.firstPage === KERNEL_FIRST_PAGE);

  // 解码被标为指令的位置
  const decoded = new Map();
  for (const segment of segments) {
    const start = segment.firstPage * PAGE_SIZE;
    const end = start + segment.pageCount * PAGE_SIZE;
    for (let offset = start; offset < end; offset++) {
      if (!(cdl[offset] & CDL.OPCODE)) continue;
      const ins = decodeInstruction((addr) => rom[start + (addr - segment.base)] ?? 0, addressOf(offset));
      let valid = ins.canonical && offset + ins.length <= end;
      // 操作数字节必须都被标为操作数，否则说明指令边界与实际执行不一致
      for (let i = 1; valid && i < ins.length; i++) {
        const flags = cdl[offset + i];
        if (flags & CDL.OPCODE || !(flags & CDL.OPERAND)) valid = false;
      }
      decoded.set(offset, { ins, valid });
    }
  }

  // 把某处（ROM 偏移）使用的地址换算为 ROM 偏移：固定内核区的地址总能换算，$8000-$BFFF 的地址只在同一段内能换算；否则返回 null
  const resolveTarget = (fromOffset, address) => {
    if (address < BANKED_BASE) return null;
    if (address >= KERNEL_BASE) return kernelSegment ? kernelSegment.firstPage * PAGE_SIZE + (address - KERNEL_BASE) : null;
    const segment = segmentAt(fromOffset);
    if (segment.base >= KERNEL_BASE) return null;
    const inside = address >= segment.base && address < segment.base + segment.pageCount * PAGE_SIZE;
    return inside ? segment.firstPage * PAGE_SIZE + (address - segment.base) : null;
  };

  // 把指令的地址操作数换算为 ROM 偏移；不适合用标签表示时返回 null
  const referencedOffset = (offset, ins) => {
    const { mnemonic, mode } = ins.info;
    let address;
    if (mode === 'rel') address = ins.target;
    else if (['abs', 'abx', 'aby', 'ind'].includes(mode)) address = ins.operand;
    else return null;
    const isFlow = mode === 'rel' || mnemonic === 'JMP' || mnemonic === 'JSR';
    if (!isFlow && WRITE_MNEMONICS.has(mnemonic)) return null;
    return resolveTarget(offset, address);
  };

  // 找到包含某个 ROM 偏移的有效指令起点
  const containing = (offset) => {
    for (let back = 0; back < 3; back++) {
      const hit = decoded.get(offset - back);
      if (hit?.valid && offset - back + hit.ins.length > offset) return offset - back;
    }
    return null;
  };

  // 收集被引用的位置：锚点（有效指令起点或数据位置）与每条引用
  const anchors = new Set();
  const references = new Map();
  for (const [offset, { ins, valid }] of decoded) {
    if (!valid) continue;
    const target = referencedOffset(offset, ins);
    if (target === null) continue;
    const anchor = containing(target) ?? target;
    anchors.add(anchor);
    references.set(offset, { anchor, delta: target - anchor });
  }
  for (const offset of labelOffsets) if (decoded.get(offset)?.valid) anchors.add(offset);
  if (kernelSegment) {
    for (const address of names.keys()) {
      const offset = kernelSegment.firstPage * PAGE_SIZE + (address - KERNEL_BASE);
      if (decoded.get(offset)?.valid) anchors.add(offset);
    }
  }

  // 被有效指令占用的字节
  const covered = new Uint8Array(rom.length);
  for (const [offset, { ins, valid }] of decoded) {
    if (valid) for (let i = 0; i < ins.length; i++) covered[offset + i] = 1;
  }

  // 地址表：每项是指向有效指令起点的 16 位地址，输出成 .word。wordEntries：项所在 ROM 偏移 -> 目标 ROM 偏移
  const wordEntries = new Map();
  const tableBytes = new Uint8Array(rom.length);
  const addTable = (start, end, minEntries, maxEntries) => {
    const found = [];
    for (let at = start; found.length < maxEntries; at += 2) {
      if (at + 1 >= end || at % PAGE_SIZE === PAGE_SIZE - 1) break;
      if (covered[at] || covered[at + 1] || tableBytes[at] || tableBytes[at + 1] || anchors.has(at + 1)) break;
      const target = resolveTarget(at, rom[at] | (rom[at + 1] << 8));
      if (target === null || !decoded.get(target)?.valid) break;
      found.push({ at, target });
    }
    if (found.length < minEntries) return 0;
    // 启发式找到的表里，多数项落在整页边界（低字节为 0）的多半是按键码之类的数据对，不是地址
    if (minEntries > 1 && found.filter(({ at }) => rom[at] === 0).length * 2 > found.length) return 0;
    for (const { at, target } of found) {
      wordEntries.set(at, target);
      tableBytes[at] = 1;
      tableBytes[at + 1] = 1;
      anchors.add(target);
    }
    return found.length;
  };

  // 成对写入相邻地址的立即数：合成的值指向 ROM 或系统 RAM 时，立即数改用 #<符号、#>符号
  const immediateRefs = new Map();
  const nextValid = (offset) => {
    const here = decoded.get(offset);
    if (!here?.valid) return null;
    const next = offset + here.ins.length;
    const hit = decoded.get(next);
    return hit?.valid ? { offset: next, ins: hit.ins } : null;
  };
  for (const [offset, { ins, valid }] of decoded) {
    if (!valid || ins.info.mode !== 'imm' || !LOAD_TO_STORE[ins.info.mnemonic] || immediateRefs.has(offset)) continue;
    const store1 = nextValid(offset);
    const load2 = store1 && nextValid(store1.offset);
    const store2 = load2 && nextValid(load2.offset);
    if (!store2) continue;
    const [s1, l2, s2] = [store1.ins.info, load2.ins.info, store2.ins.info];
    if (s1.mnemonic !== LOAD_TO_STORE[ins.info.mnemonic] || l2.mode !== 'imm' || !LOAD_TO_STORE[l2.mnemonic]) continue;
    if (s2.mnemonic !== LOAD_TO_STORE[l2.mnemonic] || s1.mode !== s2.mode || !['zp', 'abs'].includes(s1.mode)) continue;
    const [address1, address2] = [store1.ins.operand, store2.ins.operand];
    if (Math.abs(address1 - address2) !== 1) continue;
    // 功能号与子功能号写进 $063E、$063F，不是地址
    if (SYSCALL_REGISTERS.includes(address1) || SYSCALL_REGISTERS.includes(address2)) continue;
    // 先写的值放在 address1；低字节存放在较低的地址
    const low = address2 > address1 ? ins.operand : load2.ins.operand;
    const high = address2 > address1 ? load2.ins.operand : ins.operand;
    const value = low | (high << 8);
    let reference;
    if (value >= BANKED_BASE) {
      const target = resolveTarget(offset, value);
      if (target === null) continue;
      const anchor = containing(target) ?? target;
      anchors.add(anchor);
      reference = { anchor, delta: target - anchor };
    } else if (s1.mode === 'zp' && isPointerRam(value)) {
      reference = { ram: value };
    } else {
      continue;
    }
    const firstIsLow = address2 > address1;
    immediateRefs.set(offset, { ...reference, part: firstIsLow ? 'low' : 'high' });
    immediateRefs.set(load2.offset, { ...reference, part: firstIsLow ? 'high' : 'low' });
  }

  // 先登记内联跳转表，再在未执行的字节里找连续的地址；表不能吞掉被其他指令引用的位置
  for (const [offset, count] of inlineTables) {
    const segment = segmentAt(offset);
    if (segment) addTable(offset, (segment.firstPage + segment.pageCount) * PAGE_SIZE, 1, count);
  }
  for (const segment of segments) {
    const end = (segment.firstPage + segment.pageCount) * PAGE_SIZE;
    for (let at = segment.firstPage * PAGE_SIZE; at < end - 1;) {
      if (covered[at] || tableBytes[at]) {
        at++;
        continue;
      }
      const count = addTable(at, end, MIN_HEURISTIC_TABLE_ENTRIES, MAX_HEURISTIC_TABLE_ENTRIES);
      at += count > 0 ? count * 2 : 1;
    }
  }

  const labelName = (offset) => {
    const address = addressOf(offset);
    if (kernelSegment && segmentAt(offset) === kernelSegment) return names.get(address) ?? `K_${hex4(address)}`;
    return `P${hex2(Math.floor(offset / PAGE_SIZE))}_${hex4(address)}`;
  };

  const ramSymbol = (address) => {
    const name = ramName(address);
    if (name !== null) usedRam.add(address);
    return name;
  };

  const formatInstruction = (offset, ins) => {
    const { mnemonic, mode } = ins.info;
    const ref = references.get(offset);
    const symbol = ref ? `${labelName(ref.anchor)}${ref.delta ? `+${ref.delta}` : ''}` : null;
    // 零页符号汇编时按零页寻址，所以绝对寻址的地址低于 $0100 时保持数字写法；间接 JMP 总是 3 字节，不受限制
    const abs = (value) => {
      if (symbol !== null) return symbol;
      const named = value >= 0x100 || mode === 'ind' ? ramSymbol(value) : null;
      return named ?? `$${hex4(value)}`;
    };
    const zeroPage = (value) => ramSymbol(value) ?? `$${hex2(value)}`;
    switch (mode) {
      case 'imp': return mnemonic;
      case 'acc': return `${mnemonic} A`;
      case 'imm': {
        const imm = immediateRefs.get(offset);
        if (!imm) return `${mnemonic} #$${hex2(ins.operand)}`;
        const target = imm.ram !== undefined ? ramSymbol(imm.ram) : `${labelName(imm.anchor)}${imm.delta ? `+${imm.delta}` : ''}`;
        return `${mnemonic} #${imm.part === 'low' ? '<' : '>'}${target}`;
      }
      case 'zp': return `${mnemonic} ${zeroPage(ins.operand)}`;
      case 'zpx': return `${mnemonic} ${zeroPage(ins.operand)},X`;
      case 'zpy': return `${mnemonic} ${zeroPage(ins.operand)},Y`;
      case 'izx': return `${mnemonic} (${zeroPage(ins.operand)},X)`;
      case 'izy': return `${mnemonic} (${zeroPage(ins.operand)}),Y`;
      case 'rel': return `${mnemonic} ${abs(ins.target)}`;
      case 'abs': return `${mnemonic} ${abs(ins.target ?? ins.operand)}`;
      case 'abx': return `${mnemonic} ${abs(ins.operand)},X`;
      case 'aby': return `${mnemonic} ${abs(ins.operand)},Y`;
      case 'ind': return `${mnemonic} (${abs(ins.operand)})`;
      default: throw new Error(`未知寻址方式：${mode}`);
    }
  };

  const bodies = new Map();
  for (const segment of segments) {
    const start = segment.firstPage * PAGE_SIZE;
    const length = segment.pageCount * PAGE_SIZE;
    const lines = [`.org $${hex4(segment.base)}`];
    let position = 0;
    while (position < length) {
      const offset = start + position;
      const address = segment.base + position;
      if (position % PAGE_SIZE === 0) lines.push(`; ---- ROM 第 ${segment.firstPage + position / PAGE_SIZE} 页（偏移 0x${offset.toString(16).toUpperCase()}，地址 $${hex4(address)}）----`);
      if (anchors.has(offset)) lines.push(`${labelName(offset)}:`);

      const here = decoded.get(offset);
      if (here?.valid) {
        lines.push(`    ${formatInstruction(offset, here.ins)} ; $${hex4(address)}${inferred.has(offset) ? ' 推断' : heuristic.has(offset) ? ' 启发式' : ''}`);
        position += here.ins.length;
        continue;
      }

      // 地址表：每行最多 8 项，遇到被引用的位置、表尾或页边界换行
      if (wordEntries.has(offset)) {
        const items = [];
        let at = offset;
        while (wordEntries.has(at) && items.length < 8 && (at === offset || (!anchors.has(at) && (at - start) % PAGE_SIZE !== 0))) {
          items.push(labelName(wordEntries.get(at)));
          at += 2;
        }
        lines.push(`    .word ${items.join(',')} ; $${hex4(address)} 地址表`);
        position += at - offset;
        continue;
      }

      // 其余字节：同一类别连续输出，遇到下一条有效指令、页边界、被引用的位置或满 16 字节为止
      const kindAt = (at) => {
        const flags = cdl[start + at];
        if (decoded.get(start + at)) return '指令边界不一致';
        if (flags & (CDL.READ | CDL.WRITE)) return '数据';
        return flags & 0x0f ? '指令残留' : '未访问';
      };
      const kind = kindAt(position);
      let end = position + 1;
      while (end < length && end - position < 16 && end % PAGE_SIZE !== 0 && !decoded.get(start + end)?.valid && !anchors.has(start + end) && !wordEntries.has(start + end) && kindAt(end) === kind) end++;
      const bytes = [...rom.subarray(start + position, start + end)].map((b) => `$${hex2(b)}`);
      lines.push(`    .byte ${bytes.join(',')} ; $${hex4(address)} ${kind}`);
      position = end;
    }
    bodies.set(segment.firstPage, `${lines.join('\n')}\n`);
  }
  return bodies;
}
