// ------------------------------------------------------------------------
// 名称：cdl-listing.mjs
// 说明：根据模拟器导出的代码数据标记（CDL）把 BIOS 的 4K 页生成带标签的汇编清单。
//       被执行过的指令按指令输出，其余字节按 .byte 输出，因此整页都能重新汇编成原始字节。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：CDL 每字节的位含义见 DebugServer.cpp：bit0 指令首字节，bit1 操作数，bit2 被读取，bit3 被写入，
//       bit4-6 访问时所在的 4K 窗口号（0 对应 $8000），bit7 表示曾在不同窗口访问过。
// ------------------------------------------------------------------------
import { decodeInstruction, formatInstruction } from './disasm.mjs';

/** 一页的字节数 */
export const PAGE_SIZE = 4096;

/** CDL 标志位 */
export const CDL = Object.freeze({ OPCODE: 0x01, OPERAND: 0x02, READ: 0x04, WRITE: 0x08, CONFLICT: 0x80 });

/** 固定映射的内核区：$C000-$FFFF 始终映射 ROM 第 4-7 页 */
const FIXED_START = 0xc000;
const FIRST_FIXED_PAGE = 4;

/**
 * @typedef {object} PageInfo
 * @property {number} index 页号
 * @property {number} base 汇编时使用的起始地址（页被访问时所在的窗口地址）
 * @property {boolean} touched 是否有任何 CDL 标志
 * @property {boolean} conflict 是否曾在不同窗口被访问
 * @property {number} codeBytes 属于指令的字节数
 */

/**
 * 汇总每一页的访问情况。
 * @param {Uint8Array} cdl 整个 ROM 空间的 CDL
 * @returns {PageInfo[]}
 */
export function analyzePages(cdl) {
  const pages = [];
  for (let index = 0; index < cdl.length / PAGE_SIZE; index++) {
    const votes = new Map();
    let conflict = false;
    let touched = false;
    let codeBytes = 0;
    for (let i = 0; i < PAGE_SIZE; i++) {
      const flags = cdl[index * PAGE_SIZE + i];
      if ((flags & 0x0f) === 0) continue;
      touched = true;
      if (flags & CDL.CONFLICT) conflict = true;
      if (flags & (CDL.OPCODE | CDL.OPERAND)) codeBytes++;
      const window = (flags >> 4) & 7;
      votes.set(window, (votes.get(window) ?? 0) + 1);
    }
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    pages.push({ index, base: 0x8000 + (best ? best[0] : 0) * PAGE_SIZE, touched, conflict, codeBytes });
  }
  return pages;
}

const pageName = (index) => `P${index.toString(16).toUpperCase().padStart(2, '0')}`;
const hex4 = (value) => value.toString(16).toUpperCase().padStart(4, '0');

/** 页是否位于它在固定内核区中应在的位置（第 4-7 页对应 $C000-$FFFF） */
function isFixedPage(page) {
  return page.index >= FIRST_FIXED_PAGE && page.index <= FIRST_FIXED_PAGE + 3 && page.base === FIXED_START + ((page.index - FIRST_FIXED_PAGE) << 12);
}

/** 引用方能否把 $C000 以上的地址当作固定内核区：位于高窗口的非固定页不行 */
function seesKernel(page) {
  return page.base < FIXED_START || isFixedPage(page);
}

/**
 * 为控制流目标生成符号名：固定内核区用全局名，页内目标用页内名，其余返回 null。
 * @param {number} target 目标地址
 * @param {PageInfo} page 引用该目标的页
 * @param {Map<number, string>} [names] 外部给定的符号名，仅用于固定内核区地址
 * @returns {string|null}
 */
export function symbolFor(target, page, names = new Map()) {
  if (target >= FIXED_START && seesKernel(page)) return names.get(target) ?? `K_${hex4(target)}`;
  if (target >= page.base && target < page.base + PAGE_SIZE) return `${pageName(page.index)}_${hex4(target)}`;
  return null;
}

/** 把目标地址换算为所在页号与页内偏移，无法确定时返回 null */
function locate(target, page) {
  if (target >= FIXED_START && seesKernel(page)) return { index: FIRST_FIXED_PAGE + ((target - FIXED_START) >> 12), offset: target & 0xfff };
  if (target >= page.base && target < page.base + PAGE_SIZE) return { index: page.index, offset: target - page.base };
  return null;
}

/**
 * 解码一页中所有被执行过的指令。
 * @param {Uint8Array} rom 整个 ROM 空间
 * @param {Uint8Array} cdl 整个 CDL
 * @param {PageInfo} page 页信息
 * @returns {Map<number, {ins: import('./disasm.mjs').Instruction, valid: boolean}>} 键为页内偏移
 */
function decodePage(rom, cdl, page) {
  const start = page.index * PAGE_SIZE;
  const result = new Map();
  for (let offset = 0; offset < PAGE_SIZE; offset++) {
    if (!(cdl[start + offset] & CDL.OPCODE)) continue;
    const ins = decodeInstruction((addr) => rom[start + ((addr - page.base) & 0xfff)], page.base + offset);
    let valid = ins.canonical && offset + ins.length <= PAGE_SIZE;
    // 操作数字节必须都被标为操作数，否则说明指令边界与实际执行不一致
    for (let i = 1; valid && i < ins.length; i++) {
      const flags = cdl[start + offset + i];
      if (flags & CDL.OPCODE || !(flags & CDL.OPERAND)) valid = false;
    }
    result.set(offset, { ins, valid });
  }
  return result;
}

/**
 * 生成所有页的汇编清单。
 * @param {Uint8Array} rom 整个 ROM 空间（不含 iNES 文件头）
 * @param {Uint8Array} cdl 整个 CDL
 * @param {{inferred?: Set<number>, names?: Map<number, string>, labelOffsets?: Set<number>}} [options] inferred 为静态推断出的指令首字节的 ROM 偏移，清单里会标注；names 为内核区地址到符号名的映射，即使没有指令引用也会生成标签；labelOffsets 为需要强制生成标签的指令 ROM 偏移（如内联跳转表的目标）
 * @returns {{pages: PageInfo[], listings: Map<number, string>}} listings 键为页号，值为汇编文本；只含被访问过的页
 */
export function generateListings(rom, cdl, { inferred = new Set(), names = new Map(), labelOffsets = new Set() } = {}) {
  const pages = analyzePages(cdl);
  const decoded = new Map(pages.filter((p) => p.touched).map((p) => [p.index, decodePage(rom, cdl, p)]));

  // 只对确实是指令起点的目标生成符号，避免汇编时出现指向指令中间的标签
  const labels = new Set();
  for (const page of pages) {
    for (const { ins, valid } of decoded.get(page.index)?.values() ?? []) {
      if (!valid || ins.target === null) continue;
      const where = locate(ins.target, page);
      const targetDecoded = where && decoded.get(where.index)?.get(where.offset);
      const name = symbolFor(ins.target, page, names);
      if (name && targetDecoded?.valid) labels.add(name);
    }
  }
  for (const [address, name] of names) {
    const index = FIRST_FIXED_PAGE + ((address - FIXED_START) >> 12);
    const page = pages[index];
    if (page && isFixedPage(page) && decoded.get(index)?.get(address & 0xfff)?.valid) labels.add(name);
  }
  for (const offset of labelOffsets) {
    const page = pages[offset >> 12];
    if (page?.touched && decoded.get(page.index)?.get(offset & 0xfff)?.valid) labels.add(symbolFor(page.base + (offset & 0xfff), page, names));
  }

  const listings = new Map();
  for (const page of pages) {
    if (!page.touched) continue;
    const start = page.index * PAGE_SIZE;
    const insMap = decoded.get(page.index);
    const lines = [
      `; ROM 第 ${page.index} 页（偏移 0x${(start).toString(16).toUpperCase()}），汇编地址 $${hex4(page.base)}`,
      page.conflict ? '; 注意：这一页曾在不同窗口被访问过，地址以多数访问为准' : null,
      `.org $${hex4(page.base)}`,
    ].filter(Boolean);

    let offset = 0;
    while (offset < PAGE_SIZE) {
      const address = page.base + offset;
      const here = insMap.get(offset);
      const label = symbolFor(address, page, names);
      if (label && labels.has(label) && here?.valid) lines.push(`${label}:`);

      if (here?.valid) {
        const text = formatInstruction(here.ins, (target) => {
          const name = symbolFor(target, page, names);
          return name && labels.has(name) ? name : null;
        });
        lines.push(`    ${text} ; $${hex4(address)}${inferred.has(start + offset) ? ' 推断' : ''}`);
        offset += here.ins.length;
        continue;
      }

      // 其余字节：同一类别连续输出到下一条有效指令之前，每行最多 16 字节
      const kindAt = (at) => {
        const flags = cdl[start + at];
        if (insMap.get(at)) return '指令边界不一致';
        if (flags & (CDL.READ | CDL.WRITE)) return '数据';
        return flags & 0x0f ? '指令残留' : '未访问';
      };
      const kind = kindAt(offset);
      let end = offset + 1;
      while (end < PAGE_SIZE && end - offset < 16 && !insMap.get(end)?.valid && kindAt(end) === kind) end++;
      const bytes = [...rom.subarray(start + offset, start + end)].map((b) => `$${b.toString(16).toUpperCase().padStart(2, '0')}`);
      lines.push(`    .byte ${bytes.join(',')} ; $${hex4(address)} ${kind}`);
      offset = end;
    }
    listings.set(page.index, `${lines.join('\n')}\n`);
  }
  return { pages, listings };
}
