// ------------------------------------------------------------------------
// 名称：p04-kernel-dma.mjs
// 说明：内核 DMA 与显存服务 $30-$34 的验证用例：名称表 DMA（$30 子功能 0-3）、单元远地址（4-7）、写单元与读单元（8、9）、清屏（10）、区域填充（$31、$32）、扩展 RAM 与显存之间的 DMA（$33、$34）。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值按 bios/src/kernel/vram-dma.asm（$EE8D-$F2AF）的代码阅读写成公式。DMA 寄存器：$4048 控制、$4049 源高、$404A 源低、$404B 源中、$404C 目的低、$404D 目的高、$404E 长度低、$404F 长度高；
//       核对用 io 记录调用期间对它们的写入。屏幕缓冲在扩展 RAM 页 $FA、$FB（四张名称表各 2KB），区域填充的中转缓冲在页 $F8 起，对应 PRAM 偏移 (页号 - $80) × 4096。
//       $31 的大区域（长度不小于 $1C00）最后一段的目的地址没有加上前一段的步长（与前一段相同），这是实测到的行为，可能是原程序的疏漏。
// ------------------------------------------------------------------------
import { runCall } from '../../tools/rom-driver.mjs';

const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const pramOffset = (page) => (page - 0x80) * 0x1000;
const REG = { ctrl: 0x4048, srcHigh: 0x4049, srcLow: 0x404a, srcMid: 0x404b, dstLo: 0x404c, dstHi: 0x404d, lenLo: 0x404e, lenHi: 0x404f };
const DMA_ADDRESSES = Object.values(REG);
const SYS_PAGE = 0x641;
const FAR_OFFSET = 0x14;
const P_0646 = 0x646;
const P_064C = 0x64c;
const P_064F = 0x64f;
const P_0652 = 0x652;

/** 一次 DMA 的寄存器写入：每个寄存器各写一次 */
const oneDma = ({ ctrl, srcHigh, srcLow, srcMid, dstLo, dstHi, lenLo, lenHi }) => [[REG.ctrl, [ctrl]], [REG.srcHigh, [srcHigh]], [REG.srcLow, [srcLow]], [REG.srcMid, [srcMid]], [REG.dstLo, [dstLo]], [REG.dstHi, [dstHi]], [REG.lenLo, [lenLo]], [REG.lenHi, [lenHi]]];

// ---- $30 子功能 0-3：页 $1F 的名称表 DMA 到显存 ----
const NAMETABLE_SOURCE_MID = [0xa0, 0xa8, 0xb0, 0xb8];
const nametableDma = [0, 1, 2, 3].flatMap((sub) => [0, 1].map((tile) => ({
  id: `dma.30.s${sub}.tile${tile}`,
  title: `$30 子功能 ${sub}：名称表 DMA（源页 $1F、中位 $${hexName(NAMETABLE_SOURCE_MID[sub])}，目的高位 $${hexName(sub * 8 + tile * 0x20)}，长度 $07FF；$062E 位 0 为 ${tile}）`,
  func: 0x30,
  sub,
  mem: [[0x62e, [tile]]],
  capture: DMA_ADDRESSES,
  expectWrites: oneDma({ ctrl: 0xc0, srcHigh: 0x1f, srcLow: 0, srcMid: NAMETABLE_SOURCE_MID[sub], dstLo: 0, dstHi: sub * 8 + tile * 0x20, lenLo: 0xff, lenHi: 0x07 }),
})));

// ---- $30 子功能 4-7：屏幕缓冲里一个单元的远地址 ----
/** 按汇编的 8 位运算算出远指针：偏移 = 行 × 64 + 列 × 2 + 名称表基址 × 256（列 × 2 的进位参与加法），再折成页号 $F0 + 高 4 位与 12 位偏移 */
const cellFarAddress = (sub, column, row) => {
  const base = NAMETABLE_SOURCE_MID[sub - 4];
  const rowShifted = row << 6;
  const lowRow = rowShifted & 0xff;
  const highRow = (rowShifted >> 8) & 0xff;
  const columnDoubled = (column << 1) & 0xff;
  const carry = (column >> 7) & 1;
  const lowSum = columnDoubled + lowRow + carry;
  const low = lowSum & 0xff;
  const high = (highRow + base + (lowSum >> 8)) & 0xff;
  return { page: ((high >> 4) + 0xf0) & 0xff, low, high: high & 0x0f };
};
const cellAddress = [4, 5, 6, 7].flatMap((sub) => [[0, 0], [5, 3], [31, 29], [130, 2]].map(([column, row]) => {
  const want = cellFarAddress(sub, column, row);
  return {
    id: `dma.30.s${sub}.col${column}-row${row}`,
    title: `$30 子功能 ${sub}：第 ${column} 列、第 ${row} 行的单元在屏幕缓冲页 $${hexName(want.page)}、偏移 $${want.high.toString(16).toUpperCase()}${hexName(want.low)}`,
    func: 0x30,
    sub,
    mem: [[0x648, [column, row]], [SYS_PAGE, [0]], [FAR_OFFSET, [0, 0]]],
    expect: [[SYS_PAGE, [want.page]], [FAR_OFFSET, [want.low, want.high]]],
  };
}));

// ---- $30 子功能 8、9、10：单元读写与清屏（扩展 RAM 数据） ----
const SOURCE_PAGE = 0x82;
const DEST_PAGE = 0x80;
const CELLS = [0x11, 0x22, 0x33, 0x44, 0x55, 0x66];
const toHex = (bytes) => [...bytes].map(hexName).join('');

/** 子功能 8：从页组 $0642 窗口地址 PROG_ENTRY（只取低 12 位，高位被 $A0 覆盖）读 $064F 个 2 字节单元，写到远地址（页 SYS_PAGE），每个单元后目的偏移加 $0652 */
const storeCells = {
  id: 'dma.30.s8.store-cells',
  title: '$30 子功能 8：把页 $82 偏移 $010 起的 3 个 2 字节单元写到页 $80 偏移 $100、$120、$140（步长 $20）',
  steps: [{
    host: async (client) => {
      await client.send(`write pram ${(pramOffset(SOURCE_PAGE) + 0x10).toString(16)} ${toHex(CELLS)}`);
      await client.send(`write pram ${pramOffset(DEST_PAGE).toString(16)} ${toHex(new Array(0x180).fill(0xee))}`);
      return runCall(client, {
        func: 0x30,
        sub: 8,
        mem: [[0x642, [SOURCE_PAGE]], [0x0c, [0x10, 0x00]], [SYS_PAGE, [DEST_PAGE]], [FAR_OFFSET, [0x00, 0x01]], [P_064F, [3, 0]], [P_0652, [0x20]]],
        readPram: [[pramOffset(DEST_PAGE) + 0x100, 0x48]],
        maxFrames: 60,
      });
    },
    check: ({ data: result }) => {
      const got = result.pram.get(pramOffset(DEST_PAGE) + 0x100);
      const want = new Array(0x48).fill(0xee);
      CELLS.forEach((value, index) => { want[Math.floor(index / 2) * 0x20 + (index % 2)] = value; });
      return toHex(got) === toHex(want) ? [] : [`页 $80 偏移 $100 起为 ${toHex(got)}，预期 ${toHex(want)}`];
    },
  }],
};

/** 子功能 9：从远地址（页 SYS_PAGE）读 $064F 个 2 字节单元到 DST_ADDR_LO/DST_ADDR_HI 指向的内存（页组取 $0643），每读一个源偏移加 $0652 */
const loadCells = {
  id: 'dma.30.s9.load-cells',
  title: '$30 子功能 9：从页 $80 偏移 $200 起读 3 个 2 字节单元（步长 2）到页 $82 偏移 $030 起',
  steps: [{
    host: async (client) => {
      await client.send(`write pram ${(pramOffset(DEST_PAGE) + 0x200).toString(16)} ${toHex(CELLS)}`);
      await client.send(`write pram ${(pramOffset(SOURCE_PAGE) + 0x30).toString(16)} ${toHex(new Array(8).fill(0xee))}`);
      return runCall(client, {
        func: 0x30,
        sub: 9,
        mem: [[0x643, [SOURCE_PAGE]], [0x12, [0x30, 0x00]], [SYS_PAGE, [DEST_PAGE]], [FAR_OFFSET, [0x00, 0x02]], [P_064F, [3, 0]], [P_0652, [0x02]]],
        readPram: [[pramOffset(SOURCE_PAGE) + 0x30, 8]],
        maxFrames: 60,
      });
    },
    check: ({ data: result }) => {
      const got = result.pram.get(pramOffset(SOURCE_PAGE) + 0x30);
      const want = [...CELLS, 0xee, 0xee];
      return toHex(got) === toHex(want) ? [] : [`页 $82 偏移 $030 起为 ${toHex(got)}，预期 ${toHex(want)}`];
    },
  }],
};

/** 子功能 10：$0652 的位 0-3 各决定是否用 $064C/$064D 填满屏幕缓冲里的名称表 4-7（每张 2KB，名称表 4、5 在页 $FA 偏移 $000、$800，6、7 在页 $FB 偏移 $000、$800） */
const NAMETABLE_OFFSETS = [pramOffset(0xfa), pramOffset(0xfa) + 0x800, pramOffset(0xfb), pramOffset(0xfb) + 0x800];
const clearNametables = [0b0101, 0b1010, 0b1111, 0b0000].map((mask) => ({
  id: `dma.30.s10.mask${mask.toString(2).padStart(4, '0')}`,
  title: `$30 子功能 10：位掩码 ${mask.toString(2).padStart(4, '0')}，选中的名称表缓冲填成 $064C/$064D = $AB $CD，其余保持`,
  steps: [{
    host: async (client) => {
      for (const offset of NAMETABLE_OFFSETS) await client.send(`write pram ${offset.toString(16)} ${toHex(new Array(16).fill(0xee))}`);
      for (const offset of NAMETABLE_OFFSETS) await client.send(`write pram ${(offset + 0x7f0).toString(16)} ${toHex(new Array(16).fill(0xee))}`);
      return runCall(client, { func: 0x30, sub: 10, mem: [[P_064C, [0xab, 0xcd]], [P_0652, [mask]]], readPram: NAMETABLE_OFFSETS.flatMap((offset) => [[offset, 4], [offset + 0x7fc, 4]]), maxFrames: 60 });
    },
    check: ({ data: result }) => {
      const problems = [];
      NAMETABLE_OFFSETS.forEach((offset, index) => {
        const filled = (mask >> index) & 1;
        for (const [at, want] of [[offset, filled ? 'ABCDABCD' : 'EEEEEEEE'], [offset + 0x7fc, filled ? 'ABCDABCD' : 'EEEEEEEE']]) {
          const got = toHex(result.pram.get(at));
          if (got !== want) problems.push(`名称表 ${4 + index} 缓冲偏移 $${(at - offset).toString(16)} 处为 ${got}，预期 ${want}`);
        }
      });
      return problems;
    },
  }],
}));

// ---- $31 区域填充（位掩码选区域）、$32 单段填充 ----
/** 区域表：位 0-6 → 显存目的高位、长度高位 */
const FILL_REGIONS = [[0x00, 0x08], [0x08, 0x08], [0x10, 0x08], [0x18, 0x08], [0x20, 0x08], [0x28, 0x58], [0x80, 0x80]];
/** 一段不超过 $1C00 字节的填充：先把 $064C 填满中转缓冲，再用一次 DMA（长度 = 长度 - 1）写到显存 $0646/$0647 */
const fillSingle = (dstHi, dstLo, length) => oneDma({ ctrl: 0xc0, srcHigh: 0x1f, srcLow: 0, srcMid: 0x80, dstLo, dstHi, lenLo: (length - 1) & 0xff, lenHi: (length - 1) >> 8 });
const regionCases = [0, 1, 2, 3, 4].map((bit) => ({
  id: `dma.31.bit${bit}`,
  title: `$31 子功能 $${hexName(1 << bit)}：填充显存 $${hexName(FILL_REGIONS[bit][0])}00 起 $0800 字节（一次 DMA，长度 $07FF）`,
  func: 0x31,
  sub: 1 << bit,
  mem: [[P_064C, [0x5a]]],
  capture: DMA_ADDRESSES,
  expectWrites: fillSingle(FILL_REGIONS[bit][0], 0, 0x800),
  maxFrames: 60,
}));
/** 长度不小于 $1C00 的区域按 $1C00 字节一段 DMA（长度 $1BFF），目的高位每段加 $1C；剩余不足一段的最后一段目的高位与上一段相同（见文件头备注） */
const bigRegionDma = (dstHi, lengthHigh) => {
  const starts = [];
  let high = dstHi;
  let remaining = lengthHigh;
  while (remaining >= 0x1c) {
    starts.push({ dst: high, lenHi: 0x1b, lenLo: 0xff });
    remaining -= 0x1c;
    if (remaining >= 0x1c) high += 0x1c;
  }
  if (remaining > 0) starts.push({ dst: high, lenHi: remaining - 1, lenLo: 0xff });
  const column = (key) => starts.map((entry) => entry[key]);
  return [[REG.ctrl, starts.map(() => 0xc0)], [REG.srcHigh, starts.map(() => 0x1f)], [REG.srcLow, starts.map(() => 0)], [REG.srcMid, starts.map(() => 0x80)], [REG.dstLo, starts.map(() => 0)], [REG.dstHi, column('dst')], [REG.lenLo, column('lenLo')], [REG.lenHi, column('lenHi')]];
};
const bigRegionCases = [5, 6].map((bit) => ({
  id: `dma.31.bit${bit}`,
  title: `$31 子功能 $${hexName(1 << bit)}：填充显存 $${hexName(FILL_REGIONS[bit][0])}00 起 $${hexName(FILL_REGIONS[bit][1])}00 字节，分段 DMA`,
  func: 0x31,
  sub: 1 << bit,
  mem: [[P_064C, [0x5a]]],
  capture: DMA_ADDRESSES,
  expectWrites: bigRegionDma(FILL_REGIONS[bit][0], FILL_REGIONS[bit][1]),
  maxFrames: 120,
}));
const regionsTogether = {
  id: 'dma.31.bits0-1',
  title: '$31 子功能 $03：同时填充区域 0、1，两次 DMA（目的高位 $00、$08），缓冲只填一次',
  func: 0x31,
  sub: 0x03,
  mem: [[P_064C, [0x5a]]],
  capture: DMA_ADDRESSES,
  expectWrites: [[REG.ctrl, [0xc0, 0xc0]], [REG.srcHigh, [0x1f, 0x1f]], [REG.srcLow, [0, 0]], [REG.srcMid, [0x80, 0x80]], [REG.dstLo, [0, 0]], [REG.dstHi, [0x00, 0x08]], [REG.lenLo, [0xff, 0xff]], [REG.lenHi, [0x07, 0x07]]],
  maxFrames: 60,
};
/** $31 子功能位 7：用 $064C 填满 64 字节的调色板缓冲 $2040 起；显示关闭（$062B 位 3、4 为 0）或 NMI 关闭时直接写，NMI 打开时经 $0700 缓冲交给 NMI 上传 */
const PALETTE_ADDRESSES = Array.from({ length: 0x40 }, (_, i) => 0x2040 + i);
const paletteDirect = [[0x00, 0x00], [0x18, 0x00]].map(([mask, ctrl]) => ({
  id: `dma.31.palette.mask${hexName(mask)}-ctrl${hexName(ctrl)}`,
  title: `$31 子功能 $80：$062B=$${hexName(mask)}、$062A=$${hexName(ctrl)}，直接把 $064C=$21 写进 $2040 起 64 字节`,
  func: 0x31,
  sub: 0x80,
  mem: [[0x62b, [mask]], [0x62a, [ctrl]], [P_064C, [0x21]]],
  capture: PALETTE_ADDRESSES,
  maxFrames: 60,
  check: (result) => {
    const bad = PALETTE_ADDRESSES.filter((address) => (result.writes.get(address) ?? [])[0] !== 0x21);
    return bad.length === 0 ? [] : [`$2040 起有 ${bad.length} 个调色板字节第一次写入不是 $21`];
  },
}));
const paletteViaNmi = {
  id: 'dma.31.palette.nmi',
  title: '$31 子功能 $80：NMI 打开且显示开启时，把 64 字节 $21 放进缓冲 $0700，$0309=$40、$030A=0、PALETTE_PTR_LO/PALETTE_PTR_HI 指向 $0700，并经 $12 打开再关闭 $0630 位 1（NMI 上传）',
  func: 0x31,
  sub: 0x80,
  mem: [[0x62b, [0x18]], [0x62a, [0x80]], [0x630, [0x00]], [P_064C, [0x21]], [0x700, new Array(0x40).fill(0)]],
  read: [[0x700, 0x40], [0x309, 2], [0x22, 2], [0x630, 1]],
  maxFrames: 60,
  freshAfter: true,
  check: (result) => {
    const problems = [];
    const buffer = [...result.memory.get(0x700)];
    if (buffer.some((value) => value !== 0x21)) problems.push(`$0700 起 64 字节不全是 $21：${buffer.map(hexName).join('')}`);
    const [length, offset] = result.memory.get(0x309);
    if (length !== 0x40 || offset !== 0) problems.push(`$0309/$030A 为 ${hexName(length)}/${hexName(offset)}，预期 40/00`);
    const [low, high] = result.memory.get(0x22);
    if (low !== 0x00 || high !== 0x07) problems.push(`PALETTE_PTR_LO/PALETTE_PTR_HI 为 ${hexName(low)} ${hexName(high)}，预期 00 07`);
    const flags = result.memory.get(0x630)[0];
    if ((flags & 0x02) !== 0) problems.push(`$0630 为 ${hexName(flags)}，位 1 应已清除`);
    return problems;
  },
};

const fillCases = [
  { id: 'dma.32.len0', title: '$32：长度为 0 时什么都不做（没有 DMA）', func: 0x32, sub: 0, mem: [[P_0646, [0x12, 0x34]], [P_064F, [0, 0]]], capture: DMA_ADDRESSES, expectWrites: DMA_ADDRESSES.map((address) => [address, []]) },
  { id: 'dma.32.len16', title: '$32：显存 $1234 起填 $10 字节 $5A（长度 - 1 = $000F）', func: 0x32, sub: 0, mem: [[P_0646, [0x12, 0x34]], [P_064C, [0x5a]], [P_064F, [0x10, 0x00]]], capture: DMA_ADDRESSES, expectWrites: fillSingle(0x12, 0x34, 0x10), maxFrames: 60 },
  { id: 'dma.32.len291', title: '$32：显存 $0A00 起填 $0123 字节（长度 - 1 = $0122）', func: 0x32, sub: 0, mem: [[P_0646, [0x0a, 0x00]], [P_064C, [0x77]], [P_064F, [0x23, 0x01]]], capture: DMA_ADDRESSES, expectWrites: fillSingle(0x0a, 0x00, 0x123), maxFrames: 60 },
];
/** 中转缓冲（页 $F8 起）被 $064C 填满：$32 先填一页（长度高位 + 1 页），核对缓冲内容 */
const fillBuffer = {
  id: 'dma.32.buffer',
  title: '$32：长度 $10 时中转缓冲（页 $F8）的第一页被 $064C = $5A 填满',
  steps: [{
    host: async (client) => {
      await client.send(`write pram ${pramOffset(0xf8).toString(16)} ${toHex(new Array(16).fill(0xee))}`);
      await client.send(`write pram ${(pramOffset(0xf8) + 0xfc).toString(16)} ${toHex(new Array(8).fill(0xee))}`);
      return runCall(client, { func: 0x32, sub: 0, mem: [[P_0646, [0x12, 0x34]], [P_064C, [0x5a]], [P_064F, [0x10, 0x00]]], readPram: [[pramOffset(0xf8), 4], [pramOffset(0xf8) + 0xfc, 8]], maxFrames: 60 });
    },
    check: ({ data: result }) => {
      const problems = [];
      if (toHex(result.pram.get(pramOffset(0xf8))) !== '5A5A5A5A') problems.push(`缓冲开头为 ${toHex(result.pram.get(pramOffset(0xf8)))}，预期 5A5A5A5A`);
      if (toHex(result.pram.get(pramOffset(0xf8) + 0xfc)) !== '5A5A5A5AEEEEEEEE') problems.push(`缓冲偏移 $0FC 起为 ${toHex(result.pram.get(pramOffset(0xf8) + 0xfc))}，预期 5A5A5A5AEEEEEEEE（只填一页）`);
      return problems;
    },
  }],
};

// ---- $33（显存读到 DMA 源为扩展 RAM）、$34 ----
/** $33、$34：先用 $28 把页号与偏移高字节换成 DMA 源地址，再 DMA；长度 - 1 写长度寄存器 */
const farToDma = (page, offsetHigh) => {
  const bits = ((page & 1) << 6) | (((page >> 1) & 1) << 5) | (((page >> 2) & 1) << 4);
  const sum1 = offsetHigh + 0x80;
  return { high: page >> 3, mid: ((sum1 & 0xff) + bits + (sum1 > 0xff ? 1 : 0)) & 0xff };
};
const toVram = [[0x80, 0x0123, 0x0200, 0x01c0], [0x85, 0x0abc, 0x1000, 0x0010]].map(([page, offset, dst, length]) => {
  const source = farToDma(page, offset >> 8);
  return {
    id: `dma.33.page${hexName(page)}-off${offset.toString(16)}`,
    title: `$33：页 $${hexName(page)} 偏移 $${offset.toString(16).toUpperCase()} 起 $${length.toString(16).toUpperCase()} 字节 DMA 到显存 $${dst.toString(16).toUpperCase()}`,
    func: 0x33,
    sub: 0,
    mem: [[SYS_PAGE, [page]], [FAR_OFFSET, [offset & 0xff, offset >> 8]], [P_0646, [dst >> 8, dst & 0xff]], [P_064F, [length & 0xff, length >> 8]], [0x62b, [0]]],
    capture: DMA_ADDRESSES,
    expectWrites: oneDma({ ctrl: 0xc0, srcHigh: source.high, srcLow: offset & 0xff, srcMid: source.mid, dstLo: dst & 0xff, dstHi: dst >> 8, lenLo: (length - 1) & 0xff, lenHi: (length - 1) >> 8 }),
    maxFrames: 60,
  };
});
const noLength = { id: 'dma.33.len0', title: '$33：长度为 0 时什么都不做', func: 0x33, sub: 0, mem: [[P_064F, [0, 0]]], capture: DMA_ADDRESSES, expectWrites: DMA_ADDRESSES.map((address) => [address, []]) };
const fromVram = [[0x80, 0x0123, 0x0400, 0x0040]].map(([page, offset, dst, length]) => {
  const source = farToDma(page, offset >> 8);
  return {
    id: `dma.34.page${hexName(page)}-off${offset.toString(16)}`,
    title: `$34：页 $${hexName(page)} 偏移 $${offset.toString(16).toUpperCase()} 起 $${length.toString(16).toUpperCase()} 字节，DMA 控制 $A0，目的取 DST_ADDR_LO/DST_ADDR_HI = $${dst.toString(16).toUpperCase()}`,
    func: 0x34,
    sub: 0,
    mem: [[SYS_PAGE, [page]], [FAR_OFFSET, [offset & 0xff, offset >> 8]], [0x12, [dst & 0xff, dst >> 8]], [P_064F, [length & 0xff, length >> 8]]],
    capture: DMA_ADDRESSES,
    expectWrites: oneDma({ ctrl: 0xa0, srcHigh: source.high, srcLow: offset & 0xff, srcMid: source.mid, dstLo: dst & 0xff, dstHi: dst >> 8, lenLo: (length - 1) & 0xff, lenHi: (length - 1) >> 8 }),
    maxFrames: 60,
  };
});
const noLength34 = { id: 'dma.34.len0', title: '$34：长度为 0 时什么都不做', func: 0x34, sub: 0, mem: [[P_064F, [0, 0]]], capture: DMA_ADDRESSES, expectWrites: DMA_ADDRESSES.map((address) => [address, []]) };

export const cases = [...nametableDma, ...cellAddress, storeCells, loadCells, ...clearNametables, ...regionCases, ...bigRegionCases, regionsTogether, ...paletteDirect, paletteViaNmi, ...fillCases, fillBuffer, ...toVram, noLength, ...fromVram, noLength34];
