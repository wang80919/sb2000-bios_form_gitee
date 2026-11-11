// ------------------------------------------------------------------------
// 名称：banked-tables.mjs
// 说明：读出换页功能（$3B 起）页内入口处的跳转表，得到每个功能号（以及二级子功能）在页组里的真实处理例程地址。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：一级入口形如 LDA $063E / SEC / SBC #起始功能号 / JSR 内联表例程，表紧跟在 JSR 之后。
//       表项数有两种判定：内联表例程紧跟在表后时取例程位置；例程在别处时取“表项指向的最小地址”，
//       因为第一个处理例程通常紧接在表后面。
//       二级入口形如 LDA #最大子功能号 / CMP $063F / BCS / JMP 出错 / ... / LDA $063F / JSR 内联表例程，
//       子功能表的项数为最大子功能号加一。
//       按 $063F 子功能直接查表的入口（如页组 $0C）不在此列。
// ------------------------------------------------------------------------
import { physicalOffset } from './static-trace.mjs';

/**
 * @typedef {object} BankedTarget
 * @property {number} fn 功能号
 * @property {number} group 页组
 * @property {number} address 处理例程地址（$8000-$BFFF）；有二级子功能表时为二级分发入口
 * @property {{sub: number, address: number}[]} [subs] 二级子功能表
 */

/** 在入口之后的一小段字节里找字节序列，找到返回起始地址，否则返回 -1 */
function findBytes(rom, group, from, length, pattern) {
  for (let address = from; address < from + length; address++) {
    let match = true;
    for (let i = 0; i < pattern.length && match; i++) {
      const at = physicalOffset(group, address + i, rom.length);
      match = at !== null && rom[at] === pattern[i];
    }
    if (match) return address;
  }
  return -1;
}

/** 按小端读两个字节，地址无法换算时返回 null */
function readWord(rom, group, address) {
  const low = physicalOffset(group, address, rom.length);
  const high = physicalOffset(group, address + 1, rom.length);
  return low === null || high === null ? null : rom[low] | (rom[high] << 8);
}

/**
 * 定位一个页组入口处的跳转表：返回起始功能号、表起始地址与内联表例程地址，入口不是预期形式时返回 null。
 * @param {Uint8Array} rom BIOS ROM（不含文件头）
 * @param {number} group 页组
 * @param {number} entry 入口地址
 * @returns {{base: number, tableStart: number, routine: number}|null}
 */
function locateInlineTable(rom, group, entry) {
  let code = entry;
  const first = physicalOffset(group, entry, rom.length);
  if (first !== null && rom[first] === 0x4c) code = readWord(rom, group, entry + 1) ?? entry;

  // 一级入口：... AD 3E 06 (LDA $063E) ... E9 nn (SBC #nn) 20 lo hi (JSR)
  const load = findBytes(rom, group, code, 12, [0xad, 0x3e, 0x06]);
  if (load < 0) return null;
  const sbc = findBytes(rom, group, load + 3, 3, [0xe9]);
  const jsr = sbc < 0 ? -1 : sbc + 2;
  const jsrOffset = jsr < 0 ? null : physicalOffset(group, jsr, rom.length);
  if (jsrOffset === null || rom[jsrOffset] !== 0x20) return null;

  return { base: rom[physicalOffset(group, sbc + 1, rom.length)], tableStart: jsr + 3, routine: readWord(rom, group, jsr + 1) };
}

/**
 * 读出跳转表里第 fn 个槽位的地址，功能号可以在表外（表后面是代码，读到的是代码字节拼成的地址）。
 * @param {Uint8Array} rom BIOS ROM（不含文件头）
 * @param {number} group 页组
 * @param {number} entry 入口地址
 * @param {number} fn 功能号
 * @returns {{slot: number, target: number}|null} 槽位地址与槽里的地址；入口不是预期形式或槽位无法换算时为 null
 */
export function readInlineSlot(rom, group, entry, fn) {
  const located = locateInlineTable(rom, group, entry);
  if (!located || fn < located.base) return null;
  const slot = located.tableStart + (fn - located.base) * 2;
  const target = readWord(rom, group, slot);
  return target === null ? null : { slot, target };
}

/**
 * 读取一个页组入口处的跳转表。入口可以直接是一级入口代码，也可以是一条 JMP（先跳到真正的一级入口代码）。
 * @param {Uint8Array} rom BIOS ROM（不含文件头）
 * @param {number} group 页组
 * @param {number} entry 入口地址（如 $8000）
 * @returns {BankedTarget[]} 入口不是预期形式时返回空数组
 */
export function readInlineTable(rom, group, entry) {
  const located = locateInlineTable(rom, group, entry);
  if (!located) return [];
  const { base, tableStart, routine } = located;
  const entries = [];
  let limit = routine > tableStart && routine <= tableStart + 128 ? routine : Infinity;
  for (let address = tableStart; address + 1 < limit && entries.length < 64; address += 2) {
    const target = readWord(rom, group, address);
    if (target === null || target < 0x8000 || target >= 0xc000) break;
    entries.push(target);
    limit = Math.min(limit, target);
  }

  return entries.map((address, i) => {
    const target = { fn: base + i, group, address };
    const subs = readSubTable(rom, group, address);
    if (subs.length > 0) target.subs = subs;
    return target;
  });
}

/**
 * 读取二级子功能表：LDA #max / CMP $063F / BCS / JMP 出错 / ... / LDA $063F / JSR 内联表例程。
 * @param {Uint8Array} rom BIOS ROM
 * @param {number} group 页组
 * @param {number} address 二级分发入口
 * @returns {{sub: number, address: number}[]} 不是这种形式时返回空数组
 */
function readSubTable(rom, group, address) {
  const check = findBytes(rom, group, address, 1, [0xa9]);
  if (check < 0) return [];
  const max = rom[physicalOffset(group, check + 1, rom.length)];
  if (findBytes(rom, group, check + 2, 3, [0xcd, 0x3f, 0x06]) < 0) return [];
  const load = findBytes(rom, group, check + 5, 12, [0xad, 0x3f, 0x06, 0x20]);
  if (load < 0) return [];

  const tableStart = load + 6;
  const subs = [];
  for (let sub = 0; sub <= max; sub++) {
    const target = readWord(rom, group, tableStart + sub * 2);
    if (target === null || target < 0x8000 || target >= 0xc000) break;
    subs.push({ sub, address: target });
  }
  return subs;
}

/**
 * 读取所有已知换页入口的跳转表。
 * @param {Uint8Array} rom BIOS ROM（不含文件头）
 * @param {{group: number|null, handler: number|null}[]} entries 分流表里换页功能的页组与入口
 * @returns {Map<number, BankedTarget>} 键为功能号
 */
export function readAllInlineTables(rom, entries) {
  const result = new Map();
  const seen = new Set();
  for (const { group, handler } of entries) {
    if (group === null || handler === null) continue;
    const key = `${group}:${handler}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const target of readInlineTable(rom, group, handler)) result.set(target.fn, target);
  }
  return result;
}
