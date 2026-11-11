// ------------------------------------------------------------------------
// 名称：p0b-map.mjs
// 说明：映射流解压与屏幕过渡效果的验证用例：$5C（解压映射流并按效果写进屏幕）与 $60（用效果把一个单元值铺满矩形）。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值按 bios/src/image/（$828B-$8D40）的代码阅读写成模型。
//       映射流：先在 $064C/$064D（单元基础值）上加 $0654 左移 4 位或 6 位的调色板位（$0653 为 4 取 4 位，为 $10 取 6 位，其他值时 $0652 即效果号为 0 取 4 位、非 0 取 6 位），再按 $0C/$0D（页组 $0642）解出 16 位单元放进扩展 RAM 页 $F8 起的缓冲（$B000 窗口）；
//       指令字节高 3 位 T、低 5 位 N：$00 结束；T=0 取一个 16 位值填 N 个；T=1 取一个值，N 个单元依次加 1（只加低字节）；T=2 取 N 个 16 位值；T=3 先取一个高字节再取 N 个低字节；T>=4 取一个值，N 个单元依次加 2（只加低字节）；
//       每个单元都加基础值，加法用进位串起来（上一个单元高字节相加的进位进入下一个单元低字节相加）。
//       解完后按 $0652（效果号 0-8，不小于 9 取 0）逐行或逐列把缓冲里的单元（宽 $064B、高 $064A、原点 $0648/$0649，行距 $064B × 2）写进名称表缓冲（子功能低 2 位选名称表），并用 $30 把名称表 DMA 到显存；
//       $0651 不小于 5 时每步都 DMA 且等待 $0651 − 5 帧，小于 5 时每 6 − $0651 步 DMA 一次；矩形先限制在 32×32 个单元内，起点越界或宽高为 0 时代码把 $0640 置 $FF 并直接返回，但调度桩随后再调一次 $13 子功能 $80 把 $0640 清零，所以调用者看到的 $0640 恒为 0（成功与越界相同），越界时屏幕缓冲没有任何改动。
//       $60：把 $064C/$064D 铺满同样的矩形（不加调色板位），效果与 $5C 相同。
// ------------------------------------------------------------------------
import { runCall } from '../../tools/rom-driver.mjs';

const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const toHex = (bytes) => [...bytes].map(hexName).join('');
export const NT_BASE = (0xfa - 0x80) * 0x1000;
export const NT_SIZE = 0x800;
export const BUFFER_LENGTH = 4 * NT_SIZE;
const MAP_BUFFER = (0xf8 - 0x80) * 0x1000;
const SOURCE_PRAM = 0x400;
const DMA = { ctrl: 0x4048, srcHigh: 0x4049, srcLow: 0x404a, srcMid: 0x404b, dstLo: 0x404c, dstHi: 0x404d, lenLo: 0x404e, lenHi: 0x404f };
const NAMETABLE_MID = [0xa0, 0xa8, 0xb0, 0xb8];
export const dmaRegisters = (k) => ({ ctrl: 0xc0, srcHigh: 0x1f, srcLow: 0x00, srcMid: NAMETABLE_MID[k], dstLo: 0x00, dstHi: k * 8, lenLo: 0xff, lenHi: 0x07 });
const EFFECT_NAMES = ['逐行向下', '逐列向右', '逐列向左', '逐行向下（带等待）', '逐行向上', '边框收缩后向外扩展', '边框向内', '从中线向两边', '从两边向中线'];

// ---- 映射流解码模型 ----
/** 带进位的 16 位加法：先加低字节再加高字节，返回 [值, 进位] */
const addWithCarry = (word, base, carry) => {
  const low = (word & 0xff) + (base & 0xff) + carry;
  const high = (word >> 8) + (base >> 8) + (low > 0xff ? 1 : 0);
  return [((high & 0xff) << 8) | (low & 0xff), high > 0xff ? 1 : 0];
};

/** 解出映射流里的全部单元 */
export function decodeMap(stream, base) {
  const cells = [];
  let position = 0;
  while (stream[position] !== 0) {
    const byte = stream[position];
    const kind = byte >> 5;
    const count = byte & 31;
    if (kind === 0) {
      const [value] = addWithCarry(stream[position + 1] | (stream[position + 2] << 8), base, 0);
      for (let i = 0; i < count; i++) cells.push(value);
      position += 3;
    } else if (kind === 1 || kind >= 4) {
      let word = stream[position + 1] | (stream[position + 2] << 8);
      let carry = 0;
      for (let i = 0; i < count; i++) {
        let value;
        [value, carry] = addWithCarry(word, base, carry);
        cells.push(value);
        word = (word & 0xff00) | (((word & 0xff) + (kind === 1 ? 1 : 2)) & 0xff);
      }
      position += 3;
    } else if (kind === 2) {
      let carry = 0;
      for (let i = 0; i < count; i++) {
        let value;
        [value, carry] = addWithCarry(stream[position + 1 + i * 2] | (stream[position + 2 + i * 2] << 8), base, carry);
        cells.push(value);
      }
      position += 1 + count * 2;
    } else {
      let carry = 0;
      const high = stream[position + 1];
      for (let i = 0; i < count; i++) {
        let value;
        [value, carry] = addWithCarry(stream[position + 2 + i] | (high << 8), base, carry);
        cells.push(value);
      }
      position += 2 + count;
    }
  }
  return cells;
}

/** 循环用各种指令拼出至少 count 个单元的映射流（含结束字节） */
export function buildMapStream(count) {
  const patterns = [
    (n) => [0x00 | n, 0x34, 0x12],
    (n) => [0x20 | n, 0xf8, 0x01],
    (n) => [0x40 | n, ...Array.from({ length: n }, (_, i) => [0x10 + i * 5, 0x02 + (i & 1)]).flat()],
    (n) => [0x60 | n, 0x03, ...Array.from({ length: n }, (_, i) => 0xf0 + i)],
    (n) => [0x80 | n, 0xfd, 0x04],
  ];
  const bytes = [];
  let total = 0;
  for (let i = 0; total < count; i++) {
    const n = Math.min(1 + ((i * 7) % 11), Math.max(1, count - total + (i % 3)));
    bytes.push(...patterns[i % patterns.length](n));
    total += n;
  }
  return [...bytes, 0x00];
}

// ---- 效果模型 ----
/** 模拟一个效果，返回 { writes: 行或列写入列表, dmaCalls } */
export function simulateEffect(effect, rect, speed) {
  const state = { ...rect };
  const writes = [];
  let dmaCalls = 0;
  let timer = state.speed;
  const row = () => writes.push({ kind: 'row', column: state.c0, row: state.r0, count: state.w });
  const column = () => writes.push({ kind: 'column', column: state.c0, row: state.r0, count: state.h });
  const step = () => {
    if (speed.hold !== 0) {
      timer = (timer - 1) & 0xff;
      if (timer !== 0) return;
      timer = speed.hold;
    }
    dmaCalls++;
  };
  switch (effect) {
    case 0:
      do { row(); state.r0++; } while (state.r0 < state.r1);
      break;
    case 1:
      while (true) {
        column();
        state.c0++;
        if (state.c0 >= state.c1) break;
        step();
      }
      break;
    case 2: {
      const right = state.c1;
      state.c1 = state.c0;
      state.c0 = right - 1;
      while (true) {
        column();
        state.c0--;
        if (state.c0 < 0 || state.c0 < state.c1) break;
        step();
      }
      break;
    }
    case 3:
      while (true) {
        row();
        state.r0++;
        if (state.r0 >= state.r1) break;
        step();
      }
      break;
    case 4: {
      const bottom = state.r1;
      state.r1 = state.r0;
      state.r0 = bottom - 1;
      while (true) {
        row();
        state.r0--;
        if (state.r0 < 0 || state.r0 < state.r1) break;
        step();
      }
      break;
    }
    case 5: {
      const originalColumn = state.c0;
      do {
        state.c0++; state.r0++; state.w -= 2; state.h -= 2; state.c1--; state.r1--;
      } while (!(state.c0 >= state.c1) && state.r0 < state.r1);
      while (true) {
        state.c0--; state.r0--; state.w += 2; state.h += 2; state.r1++; state.c1++;
        if (state.c0 < 0 || state.c0 < originalColumn) break;
        row();
        column();
        const keepColumn = state.c0;
        state.c0 = state.c1 - 1;
        column();
        state.c0 = keepColumn;
        const keepRow = state.r0;
        state.r0 = state.r1 - 1;
        row();
        state.r0 = keepRow;
        step();
      }
      break;
    }
    case 6:
      while (true) {
        row();
        column();
        const keepColumn = state.c0;
        state.c1--;
        state.c0 = state.c1;
        column();
        state.c0 = keepColumn;
        const keepRow = state.r0;
        state.r1--;
        state.r0 = state.r1;
        row();
        state.r0 = keepRow;
        state.c0++; state.r0++; state.w--; state.h--;
        if (state.c0 >= state.c1 || state.r0 >= state.r1) break;
        step();
      }
      break;
    case 7: {
      const originalColumn = state.c0;
      state.w >>= 1;
      let right = state.c1 - state.w;
      let left = right - 1;
      while (true) {
        if (left === -1 || left < originalColumn) {
          if (right >= state.c1) break;
        } else {
          state.c0 = left;
          column();
          left--;
          if (right >= state.c1) continue;
        }
        state.c0 = right;
        column();
        right++;
        step();
      }
      break;
    }
    default: {
      state.w >>= 1;
      state.w += state.c0;
      while (true) {
        if (state.c0 < state.w) column();
        state.c0++;
        const keepColumn = state.c0;
        state.c1--;
        if (state.c1 < state.w) break;
        state.c0 = state.c1;
        column();
        state.c0 = keepColumn;
        step();
      }
    }
  }
  dmaCalls++;
  return { writes, dmaCalls };
}

/** MAP_CLIP_PARAMS：返回限制后的矩形与等待参数；失败返回 null */
export function clip(rect, speedParam, effect) {
  let hold;
  let adjusted;
  if (speedParam >= 5) { adjusted = speedParam - 5; hold = 0; } else { adjusted = 6 - speedParam; hold = adjusted; }
  const type = effect >= 9 ? 0 : effect;
  if (rect.c0 >= 0x20) return null;
  const c1 = Math.min(rect.c0 + rect.w, 0x20);
  const w = c1 - rect.c0;
  if (w === 0) return null;
  if (rect.r0 >= 0x20) return null;
  const r1 = Math.min(rect.r0 + rect.h, 0x20);
  const h = r1 - rect.r0;
  if (h === 0) return null;
  return { rect: { c0: rect.c0, r0: rect.r0, w, h, c1, r1, speed: adjusted }, speed: { hold }, type };
}

// ---- 屏幕缓冲模型 ----
export const newBuffer = () => new Uint8Array(BUFFER_LENGTH).fill(0xee);
export const cellOffset = (nametable, column, row) => nametable * NT_SIZE + row * 64 + column * 2;
const putWord = (buffer, offset, value) => {
  if (offset < 0 || offset + 1 >= BUFFER_LENGTH) return;
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >> 8) & 0xff;
};

/** 把效果的写入应用到缓冲：cellAt(列, 行) 给出该位置的单元值 */
export function applyWrites(buffer, nametable, writes, cellAt) {
  for (const write of writes) {
    for (let i = 0; i < write.count; i++) {
      const column = write.kind === 'row' ? write.column + i : write.column;
      const row = write.kind === 'row' ? write.row : write.row + i;
      putWord(buffer, cellOffset(nametable, column, row), cellAt(column, row));
    }
  }
}

const speedTitle = (speed) => (speed >= 5 ? `每步 DMA 并等 ${speed - 5} 帧` : `每 ${6 - speed} 步 DMA 一次`);

const runEffectCase = async (client, spec, mapData) => {
  await client.send(`write pram ${NT_BASE.toString(16)} ${toHex(newBuffer())}`);
  await client.send(`write pram ${MAP_BUFFER.toString(16)} ${toHex(new Array(0x1000).fill(0xee))}`);
  if (mapData) await client.send(`write pram ${SOURCE_PRAM.toString(16)} ${toHex(mapData)}`);
  return runCall(client, { ...spec, read: [[0x640, 1]], readPram: [[NT_BASE, BUFFER_LENGTH], [MAP_BUFFER, 0x1000]], capture: Object.values(DMA), maxFrames: 1500 });
};

// $5A～$64 的调度桩在功能返回后还会调一次 $13 子功能 $80，把 $0640 清零，所以越界时代码里置的 $FF 看不到，$0640 恒为 0
const verifyEffect = (result, expected) => {
  const problems = [];
  if (!result.done) problems.push('调用没有返回');
  const status = result.memory.get(0x640)?.[0];
  if (status !== expected.status) problems.push(`$0640 为 ${hexName(status ?? 0)}，预期 ${hexName(expected.status)}`);
  const got = result.pram.get(NT_BASE);
  for (let i = 0; i < BUFFER_LENGTH; i++) {
    if (got[i] !== expected.buffer[i]) {
      problems.push(`名称表缓冲偏移 $${i.toString(16)}（名称表 ${Math.floor(i / NT_SIZE)}、行 ${Math.floor((i % NT_SIZE) / 64)}、列 ${Math.floor((i % 64) / 2)}）处为 ${hexName(got[i])}，预期 ${hexName(expected.buffer[i])}`);
      break;
    }
  }
  if (expected.mapBytes) {
    const map = result.pram.get(MAP_BUFFER);
    for (let i = 0; i < expected.mapBytes.length; i++) {
      if (map[i] !== expected.mapBytes[i]) {
        problems.push(`解出的映射缓冲在字节 ${i} 处为 ${hexName(map[i])}，预期 ${hexName(expected.mapBytes[i])}`);
        break;
      }
    }
  }
  const registers = dmaRegisters(expected.nametable);
  for (const [name, address] of Object.entries(DMA)) {
    const writes = result.writes.get(address) ?? [];
    const want = new Array(expected.dmaCalls).fill(registers[name]);
    if (toHex(writes) !== toHex(want)) problems.push(`DMA 寄存器 $${address.toString(16).toUpperCase()} 写入 ${writes.length} 次，预期 ${expected.dmaCalls} 次 ${hexName(registers[name])}`);
  }
  return problems;
};

/** 一个 $5C 用例 */
const mapCase = (p) => {
  const { effect, column, row, width, height, sub, speed } = p;
  const base = p.base ?? 0x0100;
  const stream = buildMapStream(width * height);
  const clipped = clip({ c0: column, r0: row, w: width, h: height }, speed, effect);
  // $0653 为 4 取 4 位；为 $10 取 6 位；其他值先调 $1E 再看 $0652（即效果号），非 0 取 6 位，为 0 取 4 位
  const paletteShift = p.shift0653 === 0x10 || (p.shift0653 !== 4 && effect !== 0) ? 6 : 4;
  const adjustedBase = (((base >> 8) + ((p.palette ?? 0) << paletteShift)) & 0xff) << 8 | (base & 0xff);
  const cells = decodeMap(stream, adjustedBase);
  const buffer = newBuffer();
  const nametable = sub & 3;
  let dmaCalls = 0;
  if (clipped) {
    const simulated = simulateEffect(clipped.type, clipped.rect, clipped.speed);
    dmaCalls = simulated.dmaCalls;
    applyWrites(buffer, nametable, simulated.writes, (c, r) => cells[(r - row) * width + (c - column)] ?? 0xeeee);
  }
  const mapBytes = cells.flatMap((cell) => [cell & 0xff, cell >> 8]);
  return {
    id: `p0b.5c.e${effect}.c${column}r${row}.w${width}h${height}.s${sub}.v${speed}.b${base.toString(16)}.p${p.palette ?? 0}.${p.shadow ? 'f80' : 'f00'}`,
    title: `$5C 子功能 ${sub}：效果 ${effect}（${EFFECT_NAMES[effect] ?? '不小于 9 取 0'}），起点列 ${column}、行 ${row}，宽 ${width}、高 ${height}，${speedTitle(speed)}（$0651=${speed}），基础值 $${base.toString(16).toUpperCase().padStart(4, '0')}，$0653=$${hexName(p.shift0653)}，调色板 ${p.palette ?? 0}${clipped ? '' : '，起点越界或宽高为 0'}`,
    fresh: true,
    steps: [{
      host: (client) => runEffectCase(client, {
        func: 0x5c,
        sub,
        mem: [[0x62e, [p.shadow ? 0x80 : 0]], [0x642, [0x80]], [0x0c, [SOURCE_PRAM & 0xff, 0x80 | (SOURCE_PRAM >> 8)]], [0x648, [column, row]], [0x64a, [height, width]], [0x64c, [base & 0xff, base >> 8]], [0x651, [speed, effect, p.shift0653]], [0x654, [p.palette ?? 0]], [0x640, [0xaa]]],
      }, stream),
      check: ({ data: result }) => verifyEffect(result, { status: 0, buffer, mapBytes, nametable, dmaCalls }),
    }],
  };
};

const base5c = { effect: 0, column: 3, row: 2, width: 8, height: 6, sub: 0, speed: 5, shift0653: 4 };
const mapCases = [
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((effect) => mapCase({ ...base5c, effect })),
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((effect) => mapCase({ ...base5c, effect, column: 6, row: 5, width: 9, height: 7, speed: 3 })),
  mapCase({ ...base5c, effect: 9 }),
  mapCase({ ...base5c, sub: 2, speed: 1 }),
  mapCase({ ...base5c, column: 28, width: 8, effect: 1 }),
  mapCase({ ...base5c, row: 28, height: 6, effect: 3, speed: 0 }),
  mapCase({ ...base5c, base: 0x01f0, palette: 2 }),
  mapCase({ ...base5c, base: 0x01f0, palette: 3, shift0653: 0x10 }),
  mapCase({ ...base5c, base: 0x0ff0, palette: 5, shift0653: 7, shadow: true }),
  mapCase({ ...base5c, base: 0x0ff0, palette: 5, shift0653: 7, shadow: false }),
  mapCase({ ...base5c, effect: 1, base: 0x0ff0, palette: 5, shift0653: 7, shadow: true }),
  mapCase({ ...base5c, effect: 1, base: 0x0ff0, palette: 5, shift0653: 7, shadow: false }),
  mapCase({ ...base5c, effect: 2, base: 0x01f0, palette: 2, shift0653: 0 }),
  mapCase({ ...base5c, column: 32 }),
  mapCase({ ...base5c, row: 32 }),
];

// ---- $60：铺满矩形 ----
const fillCase = (p) => {
  const { effect, column, row, width, height, sub, speed, value } = p;
  const clipped = clip({ c0: column, r0: row, w: width, h: height }, speed, effect);
  const buffer = newBuffer();
  const nametable = sub & 3;
  let dmaCalls = 0;
  if (clipped) {
    const simulated = simulateEffect(clipped.type, clipped.rect, clipped.speed);
    dmaCalls = simulated.dmaCalls;
    applyWrites(buffer, nametable, simulated.writes, () => value);
  }
  return {
    id: `p0b.60.e${effect}.c${column}r${row}.w${width}h${height}.s${sub}.v${speed}.${value.toString(16)}`,
    title: `$60 子功能 ${sub}：效果 ${effect}（${EFFECT_NAMES[effect] ?? '不小于 9 取 0'}）把 $${value.toString(16).toUpperCase().padStart(4, '0')} 铺满起点列 ${column}、行 ${row}、宽 ${width}、高 ${height} 的矩形，${speedTitle(speed)}${clipped ? '' : '，起点越界或宽高为 0'}`,
    fresh: true,
    steps: [{
      host: (client) => runEffectCase(client, {
        func: 0x60,
        sub,
        mem: [[0x648, [column, row]], [0x64a, [height, width]], [0x64c, [value & 0xff, value >> 8]], [0x651, [speed, effect]], [0x640, [0xaa]]],
      }, null),
      check: ({ data: result }) => verifyEffect(result, { status: 0, buffer, nametable, dmaCalls }),
    }],
  };
};

const base60 = { effect: 0, column: 3, row: 2, width: 8, height: 6, sub: 0, speed: 5, value: 0x1234 };
const fillCases = [
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((effect) => fillCase({ ...base60, effect })),
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((effect) => fillCase({ ...base60, effect, column: 5, row: 4, width: 11, height: 9, speed: 2, sub: 1 })),
  fillCase({ ...base60, effect: 9 }),
  fillCase({ ...base60, column: 28, width: 10, effect: 2 }),
  fillCase({ ...base60, row: 30, height: 5, effect: 4, speed: 7 }),
  fillCase({ ...base60, column: 33 }),
  fillCase({ ...base60, width: 0 }),
];

export const cases = [...mapCases, ...fillCases];
