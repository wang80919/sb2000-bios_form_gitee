// ------------------------------------------------------------------------
// 名称：dispatch-map.mjs
// 说明：还原 SB-DOS 系统调用分发器（$FFF0 → $FD8E）的分流规则，给出每个功能号（$063E）
//       对应的处理方式、页组与处理例程地址。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：规则来自对 $FD8E-$FEFC 的阅读，运行时用 verify-dispatch.mjs 与模拟器实测对照。
//       页组 g 表示把 ROM 第 g..g+3 页映射到 $8000-$BFFF（$ED94 依次写 $4040-$4043）。
// ------------------------------------------------------------------------

/** ROM 表 $E082 在 BIOS ROM 中的偏移（固定映射的第 6 页，页内偏移 $082） */
export const ROM_TABLE_OFFSET = 0x6082;

/** 功能号小于该值时走 RAM 表（$05FA 起，每项 3 字节：页组、地址低、地址高） */
export const RAM_TABLE_LIMIT = 0x10;

/** 分发器认识的最大功能号，更大的直接返回 */
export const MAX_FUNCTION = 0x81;

/** 未实现的功能在 ROM 表里都指向这个桩例程 */
export const UNIMPLEMENTED_STUB = 0xe150;

/**
 * 换页后进入固定入口的功能号区间，按分发器中的比较顺序整理。
 * group 为 null 表示页组取自运行时变量。
 */
const BANKED_RANGES = [
  { from: 0x3b, to: 0x46, group: 0x08, handler: 0x8000 },
  { from: 0x47, to: 0x49, group: 0x0f, handler: 0x8000 },
  { from: 0x4a, to: 0x58, group: 0x09, handler: 0x8500 },
  { from: 0x59, to: 0x59, group: 0x0a, handler: 0x8160 },
  { from: 0x5a, to: 0x64, group: 0x0b, handler: 0x8000, after: '随后以功能号 $13、子功能 $80 再次调用 $FFF0' },
  { from: 0x66, to: 0x66, group: 0x0f, handler: 0x8700 },
  { from: 0x6d, to: 0x6d, group: 0x0c, handler: 0x8000 },
  { from: 0x76, to: 0x7a, group: null, handler: null, note: '$0391 为 0 时是页组 $0E、入口 $8300（打印机服务），否则页组取 $0390、入口 $8000' },
  { from: 0x7b, to: 0x7d, group: 0x58, handler: 0x8000 },
  { from: 0x7e, to: 0x81, group: 0x5c, handler: 0x8000 },
];

/**
 * @typedef {object} DispatchEntry
 * @property {number} fn 功能号
 * @property {'ram-table'|'rom-table'|'banked'|'none'} kind 分流方式
 * @property {number|null} group 页组；固定映射或运行时才确定时为 null
 * @property {number|null} handler 处理例程地址；运行时才确定时为 null
 * @property {boolean} stub 是否指向“未实现”桩例程
 * @property {string} note 补充说明
 */

/**
 * 求某个功能号的分流结果。
 * @param {Uint8Array} rom BIOS ROM（不含文件头）
 * @param {number} fn 功能号
 * @returns {DispatchEntry}
 */
export function dispatchEntry(rom, fn) {
  if (fn > MAX_FUNCTION) return { fn, kind: 'none', group: null, handler: null, stub: false, note: '超出范围，直接返回' };
  if (fn < RAM_TABLE_LIMIT) {
    return { fn, kind: 'ram-table', group: null, handler: null, stub: false, note: '由运行时写入 $05FA + 3×功能号 的表项决定' };
  }
  const range = BANKED_RANGES.find((r) => fn >= r.from && fn <= r.to);
  if (range) {
    return { fn, kind: 'banked', group: range.group, handler: range.handler, stub: false, note: range.note ?? range.after ?? '' };
  }
  const at = ROM_TABLE_OFFSET + (fn - 0x10) * 2;
  const handler = rom[at] | (rom[at + 1] << 8);
  return { fn, kind: 'rom-table', group: null, handler, stub: handler === UNIMPLEMENTED_STUB, note: '' };
}

/**
 * 生成 $00-$81 全部功能号的分流表。
 * @param {Uint8Array} rom BIOS ROM（不含文件头）
 * @returns {DispatchEntry[]}
 */
export function buildDispatchMap(rom) {
  return Array.from({ length: MAX_FUNCTION + 1 }, (_, fn) => dispatchEntry(rom, fn));
}
