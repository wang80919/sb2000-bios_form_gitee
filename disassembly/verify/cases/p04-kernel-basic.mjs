// ------------------------------------------------------------------------
// 名称：p04-kernel-basic.mjs
// 说明：内核基础功能 $10、$11、$12、$13、$15、$18、$19、$1A、$1C、$1D、$1E、$1F 的验证用例：显示与中断影子寄存器、上下文栈、状态查询、系统初始化。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值按 bios/src/kernel/ 里各例程的代码阅读写成公式（地址 $E153-$E95E、$F9C6），输入内存与调用后内存逐字节比对；
//       用例改写的是显示、中断影子寄存器，所以文件末尾的 kernel.basic.restore 重新开机恢复环境。
//       $13 子功能 $85、$86 取屏蔽值的表 $E2B4 只有 5 项，后面接着的 $FD、$80 来自相邻的另一张表，实测就是 $FD、$80（可能是原程序的疏漏）。
// ------------------------------------------------------------------------
import { runCall } from '../../tools/rom-driver.mjs';

const CTRL = 0x62a; // PPU_CTRL 影子
const MASK = 0x62b; // PPU_MASK 影子
const IRQ = 0x62f; // $4032 影子
const SHADOW_2008 = 0x62e; // $2008 影子
const FLAGS_630 = 0x630; // NMI 功能开关
const MOUSE_STATE = 0x633;
const KBD_RESULT = 0x635;
const FLAG_636 = 0x636;
const STATUS = 0x640;
const PARAM = 0x652;
const HOOK_NOP = [0xa8, 0xe7]; // $E7A8

const byte = (value) => [value & 0xff];
const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');

/** 中断处理程序也会写 $4032、$2040，只核对调用本身写的第一个值 */
const firstWrite = (address, value) => (result) => {
  const first = (result.writes.get(address) ?? [])[0];
  return first === value ? [] : [`$${address.toString(16).toUpperCase()} 第一次写入 ${first === undefined ? '无' : hexName(first)}，预期 ${hexName(value)}`];
};

/** 一个“写入输入内存、调用、核对输出内存”的用例；调用期间屏蔽 IRQ，避免定时器或键盘中断在写入与调用之间插进来（完整开机后这类中断随时会来） */
const memoryCase = (id, title, func, sub, mem, expect, extra = {}) => ({ id, title, func, sub, mem, expect, maxFrames: 120, sei: true, ...extra });

// ---- $10 显示选项：子功能 0-7 修改影子寄存器 $062A/$062B/$062E/$0630 ----
const VIDEO_PRE = { [CTRL]: 0xa9, [MASK]: 0x1e, [SHADOW_2008]: 0x0d, [FLAGS_630]: 0x35 };
const videoPre = (value) => [...Object.entries(VIDEO_PRE).map(([addr, v]) => [Number(addr), byte(v)]), [PARAM, byte(value)]];
/** 子功能 → [说明, 参数取值, 调用后各影子的预期函数] */
const VIDEO_OPTIONS = [
  ['$062E 清位 7 并入参数', [0x80, 0x00], (v) => [[SHADOW_2008, (VIDEO_PRE[SHADOW_2008] & 0x7f) | v]]],
  ['$062E 清位 0 并入参数', [0x01, 0x00], (v) => [[SHADOW_2008, (VIDEO_PRE[SHADOW_2008] & 0xfe) | v]]],
  ['$062E 清位 2、3 并入参数', [0x0c, 0x00], (v) => [[SHADOW_2008, (VIDEO_PRE[SHADOW_2008] & 0xf3) | v]]],
  ['PPU_CTRL 影子清低 2 位并入参数', [0x01, 0x00], (v) => [[CTRL, (VIDEO_PRE[CTRL] & 0xfc) | v]]],
  ['参数非 0 开 $0630 位 2，为 0 关；PPU_MASK 影子清位 4 并入参数', [0x10, 0x00], (v) => [[FLAGS_630, v ? VIDEO_PRE[FLAGS_630] | 0x04 : VIDEO_PRE[FLAGS_630] & 0xfb], [MASK, (VIDEO_PRE[MASK] & 0xef) | v]]],
  ['PPU_CTRL 影子位 5 取参数', [0x20, 0x00], (v) => [[CTRL, (VIDEO_PRE[CTRL] & 0xdf) | v]]],
  ['PPU_MASK 影子只保留位 1-4 并入参数', [0x01, 0x00], (v) => [[MASK, (VIDEO_PRE[MASK] & 0x1e) | v]]],
  ['PPU_MASK 影子清位 3 并入参数', [0x08, 0x00], (v) => [[MASK, (VIDEO_PRE[MASK] & 0xf7) | v]]],
];
const videoCases = VIDEO_OPTIONS.flatMap(([text, values, expected], sub) => values.map((value) => memoryCase(
  `kernel.10.s${sub}.v${hexName(value)}`,
  `$10 子功能 ${sub}：${text}（参数 $${hexName(value)}）`,
  0x10,
  sub,
  videoPre(value),
  expected(value).map(([addr, v]) => [addr, byte(v)]),
)));
const videoBadSub = [8, 0xff].map((sub) => memoryCase(`kernel.10.s${hexName(sub)}`, `$10 子功能 $${hexName(sub)} 超出范围：$0640 置 $FF`, 0x10, sub, [[STATUS, [0]]], [[STATUS, [0xff]]]));

// ---- $11 显示模式 ----
const modeSmall = [0, 1, 2, 3].flatMap((sub) => [0xff, 0x00].map((initial) => memoryCase(
  `kernel.11.s${sub}.from${hexName(initial)}`,
  `$11 子功能 ${sub}：$0638 高 2 位取 ${hexName([0x00, 0x40, 0x80, 0xc0][sub])}，低 6 位保持（初值 $${hexName(initial)}）`,
  0x11,
  sub,
  [[0x638, byte(initial)]],
  [[0x638, byte((initial & 0x3f) | [0x00, 0x40, 0x80, 0xc0][sub])]],
)));
/** 子功能 $80 以上：把 $0644 右移 2 位、$0E、加了偏移的 $0F 登记到 $067E + 3 × (子功能 & 3) 起；低 2 位为 3 不登记 */
const modeRegister = [0x80, 0x81, 0x82, 0x83, 0xa2].flatMap((sub) => [[0x37, 0x12, 0xf0], [0x04, 0x00, 0x00], [0xff, 0x55, 0x7f]].map(([v644, v0e, v0f]) => {
  const index = sub & 3;
  const bits = ((v644 & 1) << 7) | (((v644 >> 1) & 1) << 6);
  const sum1 = v0f + 0x80;
  const sum2 = (sum1 & 0xff) + (bits >> 2) + (sum1 > 0xff ? 1 : 0);
  const newF = sum2 & 0xff;
  const base = 0x67e + index * 3;
  const pre = [[0x644, byte(v644)], [0x0e, [v0e, v0f]], [0x67e, [0, 0, 0, 0, 0, 0, 0, 0, 0]]];
  const expect = index === 3 ? [[0x67e, [0, 0, 0, 0, 0, 0, 0, 0, 0]], [0x644, byte(v644)]] : [[base, [v644 >> 2, v0e, newF]]];
  return memoryCase(`kernel.11.s${hexName(sub)}.${hexName(v644)}-${hexName(v0e)}-${hexName(v0f)}`, `$11 子功能 $${hexName(sub)}：${index === 3 ? '低 2 位为 3，什么都不登记' : `登记到 $067E+${index * 3}`}（$0644=$${hexName(v644)}、$0E=$${hexName(v0e)}、$0F=$${hexName(v0f)}）`, 0x11, sub, pre, expect);
}));

// ---- $12 PPU 控制与钩子 ----
const PPU_CLEAR_MASKS = [0x7f, 0xbf, 0xdf, 0xef, 0xf7, 0xfd]; // 子功能 1-6 清 $0630 的位
const PPU_SET_BITS = [0x80, 0x40, 0x20, 0x10, 0x08, 0x02]; // 子功能 $81-$86 置 $0630 的位
const ppuCases = [
  memoryCase('kernel.12.s00', '$12 子功能 0：PPU_CTRL 影子清位 7', 0x12, 0x00, [[CTRL, [0xff]]], [[CTRL, [0x7f]]]),
  ...PPU_CLEAR_MASKS.map((mask, i) => memoryCase(`kernel.12.s0${i + 1}`, `$12 子功能 ${i + 1}：$0630 与 $${hexName(mask)}`, 0x12, i + 1, [[FLAGS_630, [0xff]]], [[FLAGS_630, byte(mask)]])),
  memoryCase('kernel.12.s80', '$12 子功能 $80：PPU_CTRL 影子置位 7', 0x12, 0x80, [[CTRL, [0x08]]], [[CTRL, [0x88]]]),
  ...PPU_SET_BITS.map((bit, i) => memoryCase(`kernel.12.s8${i + 1}`, `$12 子功能 $8${i + 1}：$0630 置位 $${hexName(bit)}${i === 4 ? '，同时 $0634 置 $FF' : ''}`, 0x12, 0x81 + i, [[FLAGS_630, [0]], [0x634, [0]]], [[FLAGS_630, byte(bit)], [0x634, [i === 4 ? 0xff : 0]]])),
  ...[0x07, 0x0f, 0x87, 0x8f].map((sub) => memoryCase(`kernel.12.s${hexName(sub)}`, `$12 子功能 $${hexName(sub)}：低 4 位不小于 7，$0640 置 $FF`, 0x12, sub, [[STATUS, [0]]], [[STATUS, [0xff]]])),
  memoryCase('kernel.12.s88.p0', '$12 子功能 $88、参数 0：NMI 钩子 NMI_HOOK5_VEC_LO/NMI_HOOK5_VEC_HI 恢复成空钩子 $E7A8', 0x12, 0x88, [[PARAM, [0]], [0x1e, [0x34, 0x12]]], [[0x1e, HOOK_NOP]]),
  memoryCase('kernel.12.s88.p1', '$12 子功能 $88、参数非 0：NMI 钩子 NMI_HOOK4_VEC_LO/NMI_HOOK4_VEC_HI 恢复成空钩子 $E7A8', 0x12, 0x88, [[PARAM, [1]], [0x20, [0x34, 0x12]]], [[0x20, HOOK_NOP]]),
];

// ---- $13 中断屏蔽与钩子 ----
const IRQ_SET_BITS = [0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02]; // 子功能 0-6 置 $062F 的位
const IRQ_CLEAR_MASKS = [0x7f, 0xbf, 0xdf, 0xef, 0xf7, 0xfd, 0x80]; // 子功能 $80-$86 与 $062F（后两项见文件头备注）
/** $88 用参数选钩子：0→TIMER_HOOK_VEC_LO、1→IRQ3_HOOK_VEC_LO、2→IRQ1_HOOK_VEC_LO、3→IRQ4_HOOK_VEC_LO、4→MOUSE_HOOK_VEC_LO、5→KBD_HOOK_VEC_LO */
const IRQ_HOOK_SLOTS = [0x24, 0x26, 0x28, 0x2c, 0x30, 0x2e];
const irqCases = [
  ...IRQ_SET_BITS.map((bit, i) => memoryCase(`kernel.13.s0${i}`, `$13 子功能 ${i}：$062F 置位 $${hexName(bit)} 并写 $4032${i === 2 ? '，再写 $4022=$40' : ''}`, 0x13, i, [[IRQ, [0]]], [[IRQ, byte(bit)]], { capture: [0x4032, 0x4022], sei: true, expectWrites: i === 2 ? [[0x4022, [0x40]]] : undefined, check: firstWrite(0x4032, bit) })),
  ...IRQ_CLEAR_MASKS.map((mask, i) => memoryCase(`kernel.13.s8${i}`, `$13 子功能 $8${i}：$062F 与 $${hexName(mask)} 并写 $4032${[0, 2].includes(i) ? (i === 0 ? '，再写 $4034=$EF、$4035=$3C' : '，再写 $4022=$80') : ''}`, 0x13, 0x80 + i, [[IRQ, [0xff]], [MOUSE_STATE, [0]], [0x634, [0xaa]]], [[IRQ, byte(mask)], ...(i === 1 ? [[0x634, [0xff]]] : [])], {
    capture: [0x4032, 0x4034, 0x4035, 0x4022],
    sei: true,
    expectWrites: [...(i === 0 ? [[0x4034, [0xef]], [0x4035, [0x3c]]] : []), ...(i === 2 ? [[0x4022, [0x80]]] : [])],
    check: firstWrite(0x4032, mask),
  })),
  ...[0x07, 0x0f, 0x87, 0x8f].map((sub) => memoryCase(`kernel.13.s${hexName(sub)}`, `$13 子功能 $${hexName(sub)}：低 4 位不小于 7，$0640 置 $FF`, 0x13, sub, [[STATUS, [0]]], [[STATUS, [0xff]]])),
  ...IRQ_HOOK_SLOTS.map((slot, i) => memoryCase(`kernel.13.s88.p${i}`, `$13 子功能 $88、参数 ${i}：ZP_${hexName(slot)}/ZP_${hexName(slot + 1)} 恢复成空钩子 $E7A8`, 0x13, 0x88, [[PARAM, byte(i)], [slot, [0x34, 0x12]]], [[slot, HOOK_NOP]])),
  memoryCase('kernel.13.s81.mouse-on', '$13 子功能 $81：鼠标在线（$0633 非 0）时 $0634 清 0', 0x13, 0x81, [[IRQ, [0xff]], [MOUSE_STATE, [1]], [0x634, [0xaa]]], [[0x634, [0]]]),
];

// ---- $15、$1F ----
const flagCase = memoryCase('kernel.15', '$15：$0636 置 1', 0x15, 0, [[FLAG_636, [0]]], [[FLAG_636, [1]]]);
const copyCase = memoryCase('kernel.1f', '$1F：把 $068C、$068B、$068A 依次复制到 $069A、$069B、$069C', 0x1f, 0, [[0x68a, [0x11, 0x22, 0x33]], [0x69a, [0, 0, 0]]], [[0x69a, [0x33, 0x22, 0x11]]]);

// ---- $1C/$1D 上下文栈 ----
const saveCase = (id, title, count, expectedCount, saved) => memoryCase(id, title, 0x1c, 0x07, [[0x655, byte(count)], [0x642, [0xa5]], [0x0c, [0x34, 0x12]]], [[0x655, byte(expectedCount)], ...(saved ? [[0x656 + expectedCount * 4, [0xa5, 0x34, 0x12, 0x07]]] : [])]);
const contextCases = [
  saveCase('kernel.1c.empty', '$1C：栈空（$0655=$FF）时第 0 项存页组 $0642、地址 $0C/$0D、子功能', 0xff, 0, true),
  saveCase('kernel.1c.third', '$1C：已有 3 项（$0655=2）时存到第 3 项，计数加一', 2, 3, true),
  saveCase('kernel.1c.last', '$1C：$0655=8 时仍可保存（存到第 9 项）', 8, 9, true),
  saveCase('kernel.1c.full', '$1C：$0655=9 时栈已满，什么都不改', 9, 9, false),
];
/** $1D 弹出上下文后恢复栈指针与页组，跳到保存的地址，不返回：保存的地址是 $7F40 的小程序，它把 $0700 写成 $5A 后原地循环 */
const restoreCase = {
  id: 'kernel.1d.restore',
  title: '$1D：弹出上下文，关闭声音、重置 $0630/$062F，栈指针取保存值，计数减一，换入页组并跳到保存的地址',
  fresh: true,
  freshAfter: true,
  steps: [{
    host: async (client) => runCall(client, {
      func: 0x1d,
      sub: 0,
      mem: [
        [0x7f40, [0xa9, 0x5a, 0x8d, 0x00, 0x07, 0x4c, 0x45, 0x7f]],
        [0x655, [0]], [0x656, [0x80, 0x40, 0x7f, 0xe4]], [0x700, [0]], [0x630, [0xff]], [0x62f, [0]],
      ],
      read: [[0x655, 1], [0x62f, 1], [0x630, 1], [0x700, 1], [0x645, 1]],
      capture: [0x4032],
      maxFrames: 6,
    }),
    check: ({ data: result }) => {
      const problems = [];
      const memory = (address) => result.memory.get(address)[0];
      if (parseInt(result.regs.pc, 16) !== 0x7f45) problems.push(`PC 为 ${result.regs.pc}，预期停在 $7F45`);
      if (memory(0x700) !== 0x5a) problems.push(`$0700 为 ${hexName(memory(0x700))}，预期 5A（跳到了保存的地址）`);
      if (memory(0x655) !== 0xff) problems.push(`$0655 为 ${hexName(memory(0x655))}，预期 FF（计数减一）`);
      if (memory(0x62f) !== 0x1f) problems.push(`$062F 为 ${hexName(memory(0x62f))}，预期 1F`);
      if (memory(0x630) !== 0) problems.push(`$0630 为 ${hexName(memory(0x630))}，预期 0`);
      if (memory(0x645) !== 0x80) problems.push(`$0645 为 ${hexName(memory(0x645))}，预期保存的页组 80`);
      problems.push(...firstWrite(0x4032, 0x1f)(result));
      return problems;
    },
  }],
};

// ---- $1E 状态查询：结果放 $0652 ----
const queryPre = [[CTRL, [0xb5]], [MASK, [0x1c]], [SHADOW_2008, [0x8d]], [FLAGS_630, [0x35]], [IRQ, [0x5a]], [MOUSE_STATE, [3]], [KBD_RESULT, [0x04]]];
const queries = [
  [0, '读 $062E 位 7', 0x80], [1, '读 $062E 位 0', 0x01], [2, '读 $062E 位 2、3', 0x0c], [3, '读 PPU_CTRL 影子低 2 位', 0x01],
  [4, '读 PPU_MASK 影子位 4', 0x10], [5, '读 PPU_CTRL 影子位 5', 0x20],
  [7, '取 $0630 清位 0 后并入 PPU_CTRL 影子位 7（NMI 是否开）', 0x35 & 0xfe | 1],
  [8, '读 $062F', 0x5a], [9, '读 $0633（鼠标数据包序号）', 3], [10, '恒为 1', 1], [11, '读 $0635（键盘自检结果）', 0x04], [12, '读 PPU_MASK 影子位 3、4', 0x18],
].map(([sub, text, want]) => memoryCase(`kernel.1e.s${hexName(sub)}`, `$1E 子功能 ${sub}：${text}`, 0x1e, sub, [...queryPre, [PARAM, [0xee]]], [[PARAM, byte(want)]]));
/** 子功能 6：按 $0638 位 6、7 取显示区域；位 6 为 0 用固定值，为 1 用 $0681-$0683 */
const query6 = [0x00, 0x80, 0x40, 0xc0, 0xe0].flatMap((mode) => [[0x10, 0x20, 0x30], [0x00, 0x40, 0xa0]].map(([v681, v682, v683]) => {
  let v644;
  let zp0e;
  let zp0f;
  if ((mode & 0x40) === 0) {
    v644 = 0x14;
    zp0e = 0;
    zp0f = (mode & 0x80) !== 0 ? 0x91 : 0x8e;
  } else {
    v644 = v681;
    zp0e = v682;
    if ((mode & 0x80) !== 0) {
      zp0f = (v683 + 8) & 0xff;
      if (zp0f >= 0xc0) {
        v644 += 1;
        zp0f -= 0x40;
      }
    } else zp0f = v683;
  }
  return memoryCase(`kernel.1e.s06.m${hexName(mode)}.${hexName(v683)}`, `$1E 子功能 6：$0638=$${hexName(mode)}、$0681-$0683=${hexName(v681)} ${hexName(v682)} ${hexName(v683)}，取显示区域放 $0644、$0E、$0F，模式号放 $0652`, 0x1e, 6, [[0x638, byte(mode)], [0x681, [v681, v682, v683]], [0x644, [0xee]], [0x0e, [0xee, 0xee]], [PARAM, [0xee]]], [[0x644, byte(v644)], [0x0e, [zp0e, zp0f]], [PARAM, byte(mode >> 6)]]);
}));
const querySub = memoryCase('kernel.1e.s0d', '$1E 子功能 $0D 超出范围：$0640 置 $FF', 0x1e, 0x0d, [[STATUS, [0]]], [[STATUS, [0xff]]]);

// ---- $19、$1A 显示开关（等垂直消隐） ----
const displayCases = [
  memoryCase('kernel.19', '$19：关闭 NMI（PPU_CTRL 影子位 7 清 0）', 0x19, 0, [[CTRL, [0xff]], [MASK, [0x1e]]], [[CTRL, [0x7f]]]),
  memoryCase('kernel.1a', '$1A：开启 NMI（PPU_CTRL 影子位 7 置 1）', 0x1a, 0, [[CTRL, [0x08]], [MASK, [0x1e]]], [[CTRL, [0x88]]]),
];

// ---- $18 系统初始化：影子寄存器、键盘鼠标状态、钩子复位为默认值 ----
const initCase = {
  id: 'kernel.18',
  title: '$18：系统初始化，影子寄存器、NMI/IRQ 钩子、键鼠状态、手柄状态与上下文栈复位成默认值',
  fresh: true,
  freshAfter: true,
  steps: [{
    func: 0x18,
    sub: 0,
    maxFrames: 600,
    mem: [[0x62f, [0]], [0x631, [0x11]], [0x635, [0x22]], [0x329, [0x33]], [0x32b, [0x44]], [0x328, [0x55]], [0x638, [0x66]], [0x655, [0x00]], [0x24, [0x34, 0x12]], [0x68c, [0x00]], [0x68b, [0x77]], [0x68a, [0x88]]],
    expect: [
      [IRQ, [0xff]], [0x631, [0]], [KBD_RESULT, [0]], [0x329, [0]], [0x32b, [0]], [0x328, [0]], [0x638, [0]], [0x655, [0xff]],
      [SHADOW_2008, [0x08]], [0x637, [0x4f]], [CTRL, [0x88]], [MASK, [0x0e]], [FLAGS_630, [0]], [0x68c, [0x0c]], [0x68b, [0]], [0x68a, [0]],
      [0x24, HOOK_NOP], [0x26, HOOK_NOP], [0x28, HOOK_NOP], [0x2a, HOOK_NOP], [0x2c, HOOK_NOP], [0x2e, HOOK_NOP], [0x30, HOOK_NOP], [0x1e, HOOK_NOP], [0x20, HOOK_NOP],
    ],
    capture: [0x2040],
    check: (result) => {
      const palette = result.writes.get(0x2040) ?? [];
      return palette.length >= 1 && palette[0] === 0x0e ? [] : [`$2040 第一次写入 ${palette.length ? hexName(palette[0]) : '无'}，预期 0E（调色板缓冲清成黑色）`];
    },
  }],
};

/** $1B 等 X 个垂直消隐周期（X=0 等 256 个）；实测每次等待占 1 到 3 个模拟器帧（取决于消隐标志被读到的时刻与开机方式，快速开机约 1-2 帧、完整开机约 2-3 帧），所以总帧数在 X 到 3X+6 之间 */
const waitCases = [1, 3, 10, 0].map((x) => {
  const want = x === 0 ? 256 : x;
  return {
    id: `kernel.1b.x${x}`,
    title: `$1B：X=${x}，等 ${want} 个垂直消隐周期后返回`,
    func: 0x1b,
    sub: 0,
    x,
    maxFrames: 900,
    check: (result) => (result.done && result.frames >= want && result.frames <= 3 * want + 6 ? [] : [`返回 ${result.done}，用了 ${result.frames} 帧，预期 ${want}-${3 * want + 6}`]),
  };
});

const restoreEnvironment = { id: 'kernel.basic.restore', title: '重新开机，恢复本文件用例改写的影子寄存器', fresh: true, steps: [{ func: 0x15, sub: 0, expect: [[FLAG_636, [1]]] }] };

export const cases = [...videoCases, ...videoBadSub, ...modeSmall, ...modeRegister, ...ppuCases, ...irqCases, flagCase, copyCase, ...contextCases, ...queries, ...query6, querySub, ...displayCases, ...waitCases, restoreCase, initCase, restoreEnvironment];
