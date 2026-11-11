// ------------------------------------------------------------------------
// 名称：p08-display.mjs
// 说明：单元显示服务 $40-$46 的验证用例：$41、$43（按行）、$42、$44（按列）把递增的单元值写进屏幕缓冲，$40 线性填充或从内存复制单元，$45、$46 把字符串画成瓦片并写单元；每次刷新用 $30 的名称表 DMA。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值按 bios/src/display/cell-fill.asm（$88B8-$8F8F）与 bios/src/display/cell-display.asm（$9000-$94D2）的代码阅读写成模型：屏幕缓冲是扩展 RAM 页 $FA 偏移 0 起的 4 张名称表（每张 2KB，每行 64 字节，每个单元 2 字节：低字节在前）；
//       用例把整块缓冲预填 $EE 后调用，逐字节核对调用后的缓冲，并核对每次 $30 名称表 DMA 对 DMA 寄存器的写入次数与内容。
//       $0651 的三种方式：最高位为 1 时每写一个单元 DMA 一次，为 0 且非 0 时每 $0651 个单元 DMA 一次并在结束时再 DMA，为 0 时只在结束时 DMA 一次；
//       $42、$44 在 $0651 为正数时刷新计数达到 $0651 后不再清零，之后每写一个单元就刷新一次（原实现的特点，已按实测记录）；$40 线性填充不检查数量为 0（会按 65536 个单元处理，用例不覆盖）。
//       $41 的行步长是 $064A + 2、$42 的列步长是 $064B + 2、$43 是 $064A + 1、$44 是 $064B + 1、$40 复制行方式是 $064A + 1；不用等待的 $1B 调用不影响结果。
// ------------------------------------------------------------------------
import { runCall } from '../../tools/rom-driver.mjs';
import { drawModel } from './p08-text.mjs';

const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const toHex = (bytes) => [...bytes].map(hexName).join('');
const NT_BASE = (0xfa - 0x80) * 0x1000;
const NT_SIZE = 0x800;
const BUFFER_LENGTH = 4 * NT_SIZE;
const DMA = { ctrl: 0x4048, srcHigh: 0x4049, srcLow: 0x404a, srcMid: 0x404b, dstLo: 0x404c, dstHi: 0x404d, lenLo: 0x404e, lenHi: 0x404f };
const NAMETABLE_MID = [0xa0, 0xa8, 0xb0, 0xb8];

/** 一次 $30 子功能 k 的 DMA 寄存器写入（$062E 位 0 为 0） */
const dmaRegisters = (k) => ({ ctrl: 0xc0, srcHigh: 0x1f, srcLow: 0x00, srcMid: NAMETABLE_MID[k], dstLo: 0x00, dstHi: k * 8, lenLo: 0xff, lenHi: 0x07 });

// ---- 屏幕缓冲模型 ----
const newBuffer = () => new Uint8Array(BUFFER_LENGTH).fill(0xee);
const cellOffset = (nametable, column, row) => nametable * NT_SIZE + row * 64 + column * 2;
const putWord = (buffer, offset, value) => {
  if (offset < 0 || offset + 1 >= BUFFER_LENGTH) return;
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >> 8) & 0xff;
};
const word = (low, high) => low | (high << 8);

/** CHECK_FONT_MODE：$0652 为 0 时取 $062E 位 7（0 或 $80），随后 0 或 4 变 1，其他变 2 */
const normalizeStride = (stride, shadow062e) => {
  const value = stride === 0 ? shadow062e & 0x80 : stride;
  return value === 0 || value === 4 ? 1 : 2;
};
/** CELL_COMBINE_ATTR：高字节低 4 位保持，高 4 位由调色板号 $0654 左移 4（步长 1）或 6 位得到，高字节再按位或 */
const combineAttribute = (valueHigh, palette, strideFlag) => (valueHigh & 0x0f) | (strideFlag === 1 ? (palette << 4) & 0xff : (palette << 6) & 0xff);

/**
 * 模拟 $41-$44 一族的循环。
 * @param {object} params 输入参数
 * @param {'row'|'column'} direction 主方向：row 表示在一行里写 inner 个后换行，column 表示在一列里写 inner 个后换到下一块
 * @param {(buffer, offset, state) => number} writer 写单元的函数，返回写完后偏移的增量
 */
function simulateRectangle({ nametable, column, row, count, mode, value, step, inner, outerLimit, outerStep, keepCounter }, direction, writer) {
  const buffer = newBuffer();
  let dmaCalls = 0;
  const state = { value };
  let outerPosition = direction === 'row' ? row : column;
  const position = () => (direction === 'row' ? cellOffset(nametable, column, outerPosition) : cellOffset(nametable, outerPosition, row));
  let offset = position();
  let remaining = count;
  if (remaining === 0) return { buffer, dmaCalls };
  const advanceOuter = () => {
    outerPosition += outerStep;
    if (outerPosition >= outerLimit) return false;
    offset = position();
    return true;
  };
  const dma = () => { dmaCalls++; };
  const modeValue = mode & 0x7f;
  if (mode & 0x80) {
    let c = 0;
    while (true) {
      offset += writer(buffer, offset, state);
      dma();
      c++;
      if (c >= inner) {
        if (!advanceOuter()) return { buffer, dmaCalls };
        c = 0;
      }
      remaining--;
      if (remaining === 0) return { buffer, dmaCalls };
    }
  }
  if (modeValue !== 0) {
    let c = 0;
    let d = 0;
    while (true) {
      offset += writer(buffer, offset, state);
      c++;
      if (c >= inner) {
        if (!advanceOuter()) { dma(); return { buffer, dmaCalls }; }
        c = 0;
      }
      d++;
      if (d >= modeValue) { dma(); if (!keepCounter) d = 0; }
      remaining--;
      if (remaining === 0) { dma(); return { buffer, dmaCalls }; }
    }
  }
  let x = inner;
  while (true) {
    offset += writer(buffer, offset, state);
    x--;
    if (x === 0) {
      if (!advanceOuter()) { dma(); return { buffer, dmaCalls }; }
      x = inner;
    }
    remaining--;
    if (remaining === 0) { dma(); return { buffer, dmaCalls }; }
  }
}

/** $41 的 PUT_CELL：上下两个单元（偏移 + 0 与 + $40）取 v、v + 步长，v 再加步长，偏移前进 2 */
const putCellPair = (stride) => (buffer, offset, state) => {
  putWord(buffer, offset, state.value);
  state.value = (state.value + stride) & 0xffff;
  putWord(buffer, offset + 0x40, state.value);
  state.value = (state.value + stride) & 0xffff;
  return 2;
};
/** $43：写一个单元，v 加步长，偏移前进 2 */
const putNextColumn = (stride) => (buffer, offset, state) => {
  putWord(buffer, offset, state.value);
  state.value = (state.value + stride) & 0xffff;
  return 2;
};
/** $44：写一个单元，v 加步长，偏移前进 $40（下一行） */
const putNextRow = (stride) => (buffer, offset, state) => {
  putWord(buffer, offset, state.value);
  state.value = (state.value + stride) & 0xffff;
  return 0x40;
};
/** $42：连写两个单元（v、v + 2 × 步长）并按奇偶调整 v，偏移前进 $40 */
const putPair = (stride) => (buffer, offset, state) => {
  putWord(buffer, offset, state.value);
  state.value = (state.value + 2 * stride) & 0xffff;
  putWord(buffer, offset + 2, state.value);
  if (stride === 1) state.value = (state.value & 1) !== 0 ? (state.value + 1) & 0xffff : (state.value - 1) & 0xffff;
  else state.value = (state.value & 2) !== 0 ? (state.value + 2) & 0xffff : (state.value - 2) & 0xffff;
  return 0x40;
};

// ---- 用例生成 ----
const SOURCE_PAGE = 0x80;
const SOURCE_OFFSET = 0x300;
const SOURCE_CELLS = Array.from({ length: 200 }, (_, i) => 0x1100 + i * 3);
const sourceBytes = SOURCE_CELLS.flatMap((v) => [v & 0xff, v >> 8]);

const runDisplay = async (client, spec, sourceData) => {
  await client.send(`write pram ${NT_BASE.toString(16)} ${toHex(newBuffer())}`);
  if (sourceData) await client.send(`write pram ${((SOURCE_PAGE - 0x80) * 0x1000 + SOURCE_OFFSET).toString(16)} ${toHex(sourceData)}`);
  return runCall(client, { ...spec, readPram: [[NT_BASE, BUFFER_LENGTH]], capture: Object.values(DMA), maxFrames: 600 });
};

const compare = (result, expected) => {
  const problems = [];
  if (!result.done) problems.push('调用没有返回');
  const got = result.pram.get(NT_BASE);
  for (let i = 0; i < BUFFER_LENGTH; i++) {
    if (got[i] !== expected.buffer[i]) {
      problems.push(`屏幕缓冲偏移 $${i.toString(16)}（名称表 ${Math.floor(i / NT_SIZE)}、行 ${Math.floor((i % NT_SIZE) / 64)}、列 ${Math.floor((i % 64) / 2)}）处为 ${hexName(got[i])}，预期 ${hexName(expected.buffer[i])}`);
      break;
    }
  }
  const registers = dmaRegisters(expected.nametable);
  for (const [name, address] of Object.entries(DMA)) {
    const writes = result.writes.get(address) ?? [];
    const want = new Array(expected.dmaCalls).fill(registers[name]);
    if (toHex(writes) !== toHex(want)) problems.push(`DMA 寄存器 $${address.toString(16).toUpperCase()} 写入 ${writes.length} 次（${toHex(writes.slice(0, 6))}…），预期 ${expected.dmaCalls} 次 ${hexName(registers[name])}`);
  }
  return problems;
};

const modeName = (mode) => (mode & 0x80 ? `每单元刷新（$0651=$${hexName(mode)}）` : mode ? `每 ${mode} 单元刷新（$0651=$${hexName(mode)}）` : '结束时刷新一次（$0651=0）');

/** 一个用例：func 41-44，输入参数见 params */
const rectangleCase = (func, p) => {
  const strideFlag = normalizeStride(p.stride, p.shadow062e);
  const stride = strideFlag;
  const palette = p.palette ?? 0;
  const startHigh = combineAttribute(p.value >> 8, palette, strideFlag);
  const startValue = (startHigh << 8) | (p.value & 0xff);
  let model;
  const nametable = p.sub & 3;
  const common = { nametable, column: p.column, row: p.row, count: p.count, mode: p.mode, value: startValue };
  if (func === 0x41) {
    const width = Math.min(p.width, 0x20 - p.column);
    model = simulateRectangle({ ...common, step: stride, inner: width, outerLimit: 0x1f, outerStep: (p.rowStep + 2) & 0xff }, 'row', putCellPair(stride));
  } else if (func === 0x43) {
    const width = Math.min(p.width, 0x20 - p.column);
    model = simulateRectangle({ ...common, step: stride, inner: width, outerLimit: 0x1f, outerStep: (p.rowStep + 1) & 0xff }, 'row', putNextColumn(stride));
  } else if (func === 0x42) {
    const height = Math.min(p.rowStep, 0x1e - p.row);
    model = simulateRectangle({ ...common, step: stride, inner: height, outerLimit: 0x1f, outerStep: (p.width + 2) & 0xff, keepCounter: true }, 'column', putPair(stride));
  } else {
    const height = Math.min(p.rowStep, 0x1e - p.row);
    model = simulateRectangle({ ...common, step: stride, inner: height, outerLimit: 0x20, outerStep: (p.width + 1) & 0xff, keepCounter: true }, 'column', putNextRow(stride));
  }
  model.nametable = nametable;
  const description = `$${hexName(func)} 子功能 ${p.sub}：起点列 ${p.column}、行 ${p.row}，$064B=${p.width}、$064A=${p.rowStep}，共 ${p.count} 个单元，起始值 $${p.value.toString(16).toUpperCase().padStart(4, '0')}，$0652=${p.stride}（$062E=$${hexName(p.shadow062e)}），调色板 ${palette}，${modeName(p.mode)}`;
  return {
    id: `display.${hexName(func)}.s${p.sub}.c${p.column}r${p.row}.w${p.width}.h${p.rowStep}.n${p.count}.m${hexName(p.mode)}.st${p.stride}.${p.shadow062e ? 'f80' : 'f00'}.p${palette}.v${p.value.toString(16)}`,
    title: description,
    fresh: true,
    steps: [{
      host: (client) => runDisplay(client, {
        func,
        sub: p.sub,
        mem: [[0x62e, [p.shadow062e]], [0x648, [p.column, p.row]], [0x64a, [p.rowStep, p.width]], [0x64c, [p.value & 0xff, p.value >> 8]], [0x64f, [p.count & 0xff, p.count >> 8]], [0x651, [p.mode, p.stride]], [0x654, [palette]]],
      }),
      check: ({ data: result }) => compare(result, model),
    }],
  };
};

const base = { column: 3, row: 2, width: 4, rowStep: 0, count: 10, value: 0x0100, stride: 1, shadow062e: 0x00, mode: 0x00, sub: 0 };
const rectCases = [];
for (const func of [0x41, 0x43, 0x42, 0x44]) {
  const rowStep = func === 0x41 ? 0xff : func === 0x43 ? 0x00 : func === 0x42 ? 6 : 6;
  const width = func === 0x42 ? 0 : 4;
  const variants = [
    { mode: 0x00 }, { mode: 0x03 }, { mode: 0x82 }, { mode: 0x01 }, { mode: 0x00, count: 1 }, { mode: 0x00, count: 0 }, { mode: 0x00, count: 17 },
    { mode: 0x00, sub: 2 }, { mode: 0x00, column: 28, width: 8 }, { mode: 0x00, stride: 4 }, { mode: 0x00, stride: 0, shadow062e: 0x80 }, { mode: 0x00, stride: 7 },
    { mode: 0x00, palette: 3 }, { mode: 0x00, palette: 5, stride: 2 }, { mode: 0x00, value: 0x8fff }, { mode: 0x02, rowStep: func === 0x41 ? 0 : 3, count: 12 },
  ];
  for (const variant of variants) rectCases.push(rectangleCase(func, { ...base, rowStep, width, ...variant }));
}

// ---- $40：线性填充（子功能位 2、3 为 0）与从内存复制单元 ----
/** $40 线性填充：从起点单元起，把 $064C/$064D 常量写 count 个单元，数量受名称表剩余单元数 $400 − 行 × 32 − 列 限制 */
const fillCase = (p) => {
  const buffer = newBuffer();
  const nametable = p.sub & 3;
  const strideFlag = p.stride;
  const high = combineAttribute(p.value >> 8, p.palette ?? 0, strideFlag);
  const value = (high << 8) | (p.value & 0xff);
  const available = 0x400 - (p.row * 32 + p.column);
  const total = Math.min(p.count, available);
  let offset = cellOffset(nametable, p.column, p.row);
  let dmaCalls = 0;
  const m = p.mode & 0x7f;
  for (let i = 0; i < total; i++) {
    putWord(buffer, offset, value);
    offset += 2;
    if (p.mode & 0x80) dmaCalls++;
    else if (m !== 0 && m === 1) dmaCalls++;
  }
  if (!(p.mode & 0x80) && total > 0) dmaCalls += m === 0 ? 1 : 1;
  const model = { buffer, dmaCalls: total === 0 ? 0 : dmaCalls, nametable };
  return {
    id: `display.40.fill.s${p.sub}.c${p.column}r${p.row}.n${p.count}.m${hexName(p.mode)}.st${p.stride}.p${p.palette ?? 0}.v${p.value.toString(16)}`,
    title: `$40 子功能 ${p.sub}（线性填充）：起点列 ${p.column}、行 ${p.row}，共 ${p.count} 个单元（可用 ${available}），值 $${p.value.toString(16).toUpperCase().padStart(4, '0')}，$0652=${p.stride}，调色板 ${p.palette ?? 0}，${modeName(p.mode)}`,
    fresh: true,
    steps: [{
      host: (client) => runDisplay(client, { func: 0x40, sub: p.sub, mem: [[0x648, [p.column, p.row]], [0x64a, [0, 0]], [0x64c, [p.value & 0xff, p.value >> 8]], [0x64f, [p.count & 0xff, p.count >> 8]], [0x651, [p.mode, p.stride]], [0x654, [p.palette ?? 0]]] }),
      check: ({ data: result }) => compare(result, model),
    }],
  };
};
const fillCases = [
  { sub: 0, column: 3, row: 2, count: 10, value: 0x0123, stride: 1, mode: 0 },
  { sub: 1, column: 0, row: 0, count: 1, value: 0x0456, stride: 1, mode: 0 },
  { sub: 3, column: 31, row: 5, count: 40, value: 0x00ff, stride: 2, mode: 0, palette: 2 },
  { sub: 0, column: 5, row: 30, count: 200, value: 0x1234, stride: 1, mode: 0 },
  { sub: 2, column: 4, row: 4, count: 0x0140, value: 0x0777, stride: 1, mode: 0 },
  { sub: 0, column: 3, row: 2, count: 6, value: 0x0123, stride: 1, mode: 0x83 },
  { sub: 0, column: 3, row: 2, count: 6, value: 0x0123, stride: 1, mode: 0x01 },
  { sub: 0, column: 3, row: 2, count: 6, value: 0x0123, stride: 1, mode: 0x02 },
].map(fillCase);

/** $40 复制单元：位 2 为 1、位 3 为 0 时按行复制（行步长 $064A + 1，宽 $064B 受 $20 − 列限制），否则按列复制（高度 $064A + 1 受 $1E − 行限制，列步长 $064B）；单元取自页组 $0642 窗口地址指向的内存 */
const copyCase = (p) => {
  const buffer = newBuffer();
  const nametable = p.sub & 3;
  const byRows = (p.sub & 0x0c) === 0x04;
  let dmaCalls = 0;
  let remaining = p.count;
  let sourceIndex = 0;
  let offset;
  let outer;
  let inner;
  let outerLimit;
  let outerStep;
  if (byRows) {
    inner = Math.min(p.width, 0x20 - p.column);
    outer = p.row;
    outerLimit = 0x1f;
    outerStep = (p.rowStep + 1) & 0xff;
  } else {
    inner = Math.min((p.rowStep + 1) & 0xff, 0x1e - p.row);
    outer = p.column;
    outerLimit = 0x20;
    outerStep = p.width;
  }
  const pos = () => (byRows ? cellOffset(nametable, p.column, outer) : cellOffset(nametable, outer, p.row));
  offset = pos();
  const copyOne = () => {
    putWord(buffer, offset, SOURCE_CELLS[sourceIndex++]);
    offset += byRows ? 2 : 0x40;
  };
  const advance = () => {
    outer += outerStep;
    if (outer >= outerLimit) return false;
    offset = pos();
    return true;
  };
  const m = p.mode & 0x7f;
  if (remaining > 0) {
    if (p.mode & 0x80) {
      let c = 0;
      let live = true;
      while (live) {
        copyOne(); dmaCalls++; c++;
        if (c >= inner) { if (!advance()) break; c = 0; }
        remaining--; if (remaining === 0) break;
      }
    } else if (m !== 0) {
      let c = 0;
      let d = 0;
      while (true) {
        copyOne(); c++;
        if (c >= inner) { if (!advance()) { dmaCalls++; break; } c = 0; }
        d++; if (d >= m) { dmaCalls++; d = 0; }
        remaining--; if (remaining === 0) { dmaCalls++; break; }
      }
    } else {
      let x = inner;
      while (true) {
        copyOne(); x--;
        if (x === 0) { if (!advance()) { dmaCalls++; break; } x = inner; }
        remaining--; if (remaining === 0) { dmaCalls++; break; }
      }
    }
  }
  const model = { buffer, dmaCalls, nametable };
  return {
    id: `display.40.copy.s${p.sub}.c${p.column}r${p.row}.w${p.width}.h${p.rowStep}.n${p.count}.m${hexName(p.mode)}`,
    title: `$40 子功能 ${p.sub}（${byRows ? '按行' : '按列'}复制单元）：起点列 ${p.column}、行 ${p.row}，$064B=${p.width}、$064A=${p.rowStep}，共 ${p.count} 个单元，${modeName(p.mode)}`,
    fresh: true,
    steps: [{
      host: (client) => runDisplay(client, { func: 0x40, sub: p.sub, mem: [[0x642, [SOURCE_PAGE]], [0x0c, [SOURCE_OFFSET & 0xff, 0x80 | (SOURCE_OFFSET >> 8)]], [0x648, [p.column, p.row]], [0x64a, [p.rowStep, p.width]], [0x64c, [0, 0]], [0x64f, [p.count & 0xff, p.count >> 8]], [0x651, [p.mode, 1]], [0x654, [0]]] }, sourceBytes),
      check: ({ data: result }) => compare(result, model),
    }],
  };
};
const copyCases = [
  { sub: 4, column: 3, row: 2, width: 4, rowStep: 0, count: 10, mode: 0 },
  { sub: 5, column: 3, row: 2, width: 4, rowStep: 1, count: 9, mode: 0 },
  { sub: 4, column: 28, row: 2, width: 8, rowStep: 0, count: 12, mode: 0 },
  { sub: 4, column: 3, row: 2, width: 4, rowStep: 0, count: 10, mode: 0x82 },
  { sub: 4, column: 3, row: 2, width: 4, rowStep: 0, count: 10, mode: 0x03 },
  { sub: 8, column: 3, row: 2, width: 2, rowStep: 3, count: 10, mode: 0 },
  { sub: 9, column: 3, row: 2, width: 2, rowStep: 3, count: 10, mode: 0 },
  { sub: 8, column: 3, row: 20, width: 2, rowStep: 15, count: 14, mode: 0 },
  { sub: 12, column: 3, row: 2, width: 3, rowStep: 2, count: 11, mode: 0x82 },
  { sub: 8, column: 3, row: 2, width: 2, rowStep: 3, count: 10, mode: 0x03 },
  { sub: 4, column: 3, row: 2, width: 4, rowStep: 0, count: 0, mode: 0 },
].map(copyCase);

// ---- $45、$46：把字符串画成瓦片并写一行（$45 为上下两行）单元 ----
const TILE_BUFFER = (0xf8 - 0x80) * 0x1000;
const STRING_OFFSET = 0x100;
const HAN_A = 0xb0a1;
const HAN_NI = 0xc4e3;
const A = 0x41;
const B = 0x42;
const C = 0x43;

/** 按 $45/$46 的代码计算：返回实际画出的字符与占用的单元列数 */
const fitCharacters = (func, characters, column) => {
  const limit = 0x20 - column;
  const drawn = [];
  let columns = 0;
  for (const code of characters) {
    const wideChar = code >> 8 !== 0;
    if (func === 0x45 && wideChar) {
      if (columns + 1 >= limit) break;
      drawn.push(code);
      columns += 2;
      continue;
    }
    drawn.push(code);
    columns++;
    if (columns >= limit) break;
  }
  return { drawn, columns };
};

const textFieldCase = (func, p) => {
  const four = (p.shadow062e & 0x80) !== 0;
  const stride = four ? 2 : 1;
  const { drawn, columns } = fitCharacters(func, p.chars, p.column);
  const tiles = drawn.length === 0 ? [] : drawModel(func === 0x45 ? (four ? 0x3d : 0x3c) : (four ? 0x3f : 0x3e), drawn, p.mode, p.wide);
  const nametable = p.sub & 3;
  const buffer = newBuffer();
  let value = p.base;
  for (let i = 0; i < columns; i++) {
    putWord(buffer, cellOffset(nametable, p.column + i, p.row), value);
    if (func === 0x45) {
      putWord(buffer, cellOffset(nametable, p.column + i, p.row + 1), value + stride);
      value += 2 * stride;
    } else value += stride;
  }
  const tileDestination = (((p.base >> 8) & 0x0f) << 12 | (p.base & 0xff) << 4) & 0xffff;
  const stringBytes = p.chars.flatMap((code) => (code >> 8 === 0 ? [code] : [code >> 8, code & 0xff]));
  const nametableRegisters = dmaRegisters(nametable);
  const tileRegisters = { ctrl: 0xc0, srcHigh: 0x1f, srcLow: 0x00, srcMid: 0x80, dstLo: tileDestination & 0xff, dstHi: tileDestination >> 8, lenLo: (tiles.length - 1) & 0xff, lenHi: (tiles.length - 1) >> 8 };
  const clippedLength = 0xffff - tileDestination;
  const clipped = tiles.length > 0 && tileDestination + tiles.length - 1 > 0xffff;
  const names = p.chars.map((c) => c.toString(16)).join('-');
  return {
    id: `display.${hexName(func)}.s${p.sub}.c${p.column}r${p.row}.${names || 'empty'}.m${hexName(p.mode)}.${four ? 'p4' : 'p2'}${p.wide ? '.wide' : ''}.b${p.base.toString(16)}`,
    title: `$${hexName(func)} 子功能 ${p.sub}：起点列 ${p.column}、行 ${p.row}，字符串 ${p.chars.map((c) => `$${c.toString(16).toUpperCase()}`).join(' ') || '（空）'}，$064E=$${hexName(p.mode)}，${four ? '四平面' : '二平面'}${p.wide ? '、8×16 半角' : ''}，单元基础值 $${p.base.toString(16).toUpperCase().padStart(4, '0')}；画出 ${drawn.length} 个字符、${columns} 列、${tiles.length} 字节瓦片数据`,
    fresh: true,
    steps: [{
      host: async (client) => {
        await client.send(`write pram ${STRING_OFFSET.toString(16)} ${toHex([...stringBytes, 0])}`);
        await client.send(`write pram ${TILE_BUFFER.toString(16)} ${toHex(new Array(tiles.length + 8).fill(0xee))}`);
        await client.send(`write pram ${NT_BASE.toString(16)} ${toHex(newBuffer())}`);
        return runCall(client, {
          func,
          sub: p.sub,
          mem: [[0x62e, [p.shadow062e]], [0x638, [p.wide ? 0x80 : 0]], [0x642, [0x80]], [0x0c, [STRING_OFFSET & 0xff, 0x80 | (STRING_OFFSET >> 8)]], [0x648, [p.column, p.row]], [0x64c, [p.base & 0xff, p.base >> 8]], [0x64e, [p.mode]], [0x652, [0]]],
          readPram: [[NT_BASE, BUFFER_LENGTH], [TILE_BUFFER, tiles.length + 8]],
          capture: Object.values(DMA),
          maxFrames: 600,
        });
      },
      check: ({ data: result }) => {
        const problems = [];
        if (!result.done) problems.push('调用没有返回');
        const gotCells = result.pram.get(NT_BASE);
        for (let i = 0; i < BUFFER_LENGTH; i++) {
          if (gotCells[i] !== buffer[i]) {
            problems.push(`屏幕缓冲偏移 $${i.toString(16)}（名称表 ${Math.floor(i / NT_SIZE)}、行 ${Math.floor((i % NT_SIZE) / 64)}、列 ${Math.floor((i % 64) / 2)}）处为 ${hexName(gotCells[i])}，预期 ${hexName(buffer[i])}`);
            break;
          }
        }
        const gotTiles = result.pram.get(TILE_BUFFER);
        const wantTiles = [...tiles, ...new Array(8).fill(0xee)];
        if (toHex(gotTiles) !== toHex(wantTiles)) {
          let at = 0;
          while (gotTiles[at] === wantTiles[at]) at++;
          problems.push(`瓦片缓冲在字节 ${at} 处不同（实际 ${hexName(gotTiles[at])}，预期 ${hexName(wantTiles[at])}），预期长度 ${tiles.length}`);
        }
        for (const [name, address] of Object.entries(DMA)) {
          const writes = result.writes.get(address) ?? [];
          const want = tiles.length === 0 ? [] : clipped && (name === 'lenLo' || name === 'lenHi') ? [tileRegisters[name], name === 'lenLo' ? clippedLength & 0xff : clippedLength >> 8, nametableRegisters[name]] : [tileRegisters[name], nametableRegisters[name]];
          if (toHex(writes) !== toHex(want)) problems.push(`DMA 寄存器 $${address.toString(16).toUpperCase()} 写入 ${toHex(writes)}，预期 ${toHex(want)}`);
        }
        return problems;
      },
    }],
  };
};

const field = { sub: 0, column: 3, row: 2, mode: 0x01, shadow062e: 0x00, wide: false, base: 0x0100, chars: [A, B] };
const textFieldCases = [
  ...[
    {},
    { wide: true },
    { chars: [HAN_A, A, HAN_NI, B], mode: 0x13 },
    { chars: [HAN_A, A, HAN_NI, B], shadow062e: 0x80, mode: 0x12, sub: 1 },
    { chars: [A, B, C], shadow062e: 0x80, mode: 0x5a, wide: true },
    { chars: [HAN_A, HAN_NI], column: 29 },
    { chars: [HAN_A, A, B], column: 28 },
    { chars: [A, HAN_A, B, C], column: 29 },
    { chars: [HAN_A], column: 31 },
    { chars: [A, B], column: 31 },
    { chars: [] },
    { base: 0x2345, mode: 0x22 },
    { base: 0x2345, shadow062e: 0x80, sub: 2 },
    { base: 0x0ffe, chars: [A, B, C], sub: 3 },
    { sub: 1, mode: 0x31, chars: [HAN_NI, HAN_A] },
  ].map((variant) => textFieldCase(0x45, { ...field, ...variant })),
  ...[
    {},
    { wide: true },
    { shadow062e: 0x80, mode: 0x12 },
    { chars: [A, B, C], column: 30 },
    { chars: [A], column: 31, sub: 1 },
    { chars: [] },
    { base: 0x2345, mode: 0x22, sub: 2 },
    { base: 0x0ffe, chars: [A, B, C], shadow062e: 0x80, mode: 0x5a },
  ].map((variant) => textFieldCase(0x46, { ...field, ...variant })),
];

export const cases = [...rectCases, ...fillCases, ...copyCases, ...textFieldCases];
