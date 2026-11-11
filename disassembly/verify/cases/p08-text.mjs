// ------------------------------------------------------------------------
// 名称：p08-text.mjs
// 说明：文字显示服务 $3B-$3F 的验证用例：$3B 按字符码求字模的位置；$3C、$3D、$3E、$3F 把字符串画成点阵写进屏外缓冲（扩展 RAM 页 $F8 起）再 DMA 到显存。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值按 bios/src/display/text-output.asm（$8038-$8671、$86D9-$88AB）的代码阅读写成公式，字模字节取自 ROM 里公式算出的位置；字模位置公式的合理性已用图案核对（$B0A1“啊”在 ROM $1C000、ASCII 的 A 在 $50F08 与 $51310）。
//       字库布局（实测）：汉字区 16-87 从 ROM $1C000 起，每字 32 字节（前 16 字节每行左半边，后 16 字节右半边），位置 = $1C000 + ((区 − 16) × 94 + (位 − 1)) × 32；
//       符号区 1-9 从 $51700 起，位置 = $51700 + ((区 − 1) × 94 + (位 − 1)) × 32；ASCII 8×8 在 $50E00 + (码 − $20) × 8，ASCII 8×16 在 $51100 + (码 − $20) × 16。
//       控制码（$00-$1F）、$80-$A0 与 $F8 区以上的码取决于 $067E-$0686 登记的用户字库表，按代码阅读的公式验证。
// ------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { BIOS_ROM } from '../../tools/config.mjs';
import { runCall } from '../../tools/rom-driver.mjs';

const rom = readFileSync(BIOS_ROM).subarray(16);
const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const toHex = (bytes) => [...bytes].map(hexName).join('');
const byte = (value) => value & 0xff;

// ---- 窗口地址折算与字模位置模型 ----
/** P08_FAR_ADDR_FROM_WINDOW：页号 ×4 加（偏移高 4 位 − 8），偏移高字节只留低 4 位 */
const farFromWindow = (page0644, high) => ({ page: byte(byte(((high & 0xf0) >> 4) - 8) + byte(page0644 << 2)), high: high & 0x0f });
/** 把 (高:低) 16 位值左移 count 位，返回 [高, 低, 移出高位的低 count 位（ROL 进累加器的值）] */
const shiftLeft16 = (high, low, count) => {
  let hi = high;
  let lo = low;
  for (let i = 0; i < count; i++) {
    hi = ((hi << 1) | (lo >> 7)) & 0xff;
    lo = (lo << 1) & 0xff;
  }
  return [hi, lo];
};
/** 汇编里 ASL 低字节后 ROL 累加器：返回 (累加器:低字节) 的 16 位结果 */
const shiftWithAccumulator = (value, count) => {
  let acc = 0;
  let lo = value;
  for (let i = 0; i < count; i++) {
    acc = ((acc << 1) | (lo >> 7)) & 0xff;
    lo = (lo << 1) & 0xff;
  }
  return [acc, lo];
};
const rowTimes94 = (row) => row * 94;

/**
 * 按 $3B 的代码计算输出：$0644、$0E、$0F 与 $0638 的低 3 位，invalid 表示 $0640 置 $FF。
 * @param {number} code 字符码（$064A 高、$064B 低）
 * @param {number} mode0638 调用前 $0638
 * @param {number[]} user $067E-$0686 的 9 个字节
 */
function glyphLocation(code, mode0638, user) {
  const high = code >> 8;
  const low = code & 0xff;
  let state = mode0638 & 0xf8;
  const alt = (mode) => (mode & 0x80) !== 0;
  const result = (page, zpHigh, zpLow, flags) => ({ page, high: zpHigh & 0x0f, low: zpLow, flags });
  if (high === 0) {
    if ((state & 0x40) !== 0) {
      let count = 3;
      let y = user[5];
      state |= 1;
      if (alt(state)) { state = (state & 0xf8) | 2; count = 4; y += 8; }
      const [acc, lo] = shiftWithAccumulator(low, count);
      let zpHigh = byte(y + acc);
      let zpLow = byte(lo + user[4]);
      if (lo + user[4] > 0xff) zpHigh = byte(zpHigh + 1);
      const far = farFromWindow(user[3], zpHigh);
      return { ...result(far.page, far.high, zpLow, state & 7), invalid: false };
    }
    if (low >= 0x20 && low < 0x80) {
      let count = 3;
      let y = 0x8e;
      state |= 1;
      if (alt(state)) { state = (state & 0xf8) | 2; count = 4; y += 3; }
      const [acc, lo] = shiftWithAccumulator(low - 0x20, count);
      let zpHigh = byte(y + acc);
      if (lo > 0xff) zpHigh += 1;
      const far = farFromWindow(0x14, zpHigh);
      return { ...result(far.page, far.high, lo, state & 7), invalid: false };
    }
    let count = 3;
    let y = user[2];
    state |= 1;
    if (alt(state)) { state = (state & 0xf8) | 2; count = 4; y += 5; }
    const index = low >= 0x80 ? low - 0x60 : low;
    const [acc, lo] = shiftWithAccumulator(index, count);
    let zpHigh = byte(y + acc);
    let zpLow = byte(lo + user[1]);
    if (lo + user[1] > 0xff) zpHigh = byte(zpHigh + 1);
    const far = farFromWindow(user[0], zpHigh);
    return { ...result(far.page, far.high, zpLow, state & 7), invalid: false };
  }
  state = (state & 0xf8) | 4;
  if (low < 0xa1 || low === 0xff || (high >= 0xaa && high < 0xb0)) return { invalid: true, flags: 4 };
  const addColumn = (n) => n + (low - 0xa1);
  if (high >= 0xf8) {
    let n = addColumn(rowTimes94(high - 0xf8));
    let [zpHigh, zpLow] = shiftLeft16(n >> 8, n & 0xff, 5);
    const sum = user[7] + zpLow;
    zpLow = sum & 0xff;
    const hiSum = (user[8] & 0x3f) + zpHigh + (sum > 0xff ? 1 : 0);
    zpHigh = hiSum & 0xff;
    let a = zpHigh;
    let carry = hiSum > 0xff ? 1 : 0;
    for (let i = 0; i < 3; i++) { const next = ((a << 1) | carry) & 0xff; carry = a >> 7; a = next; }
    const page0644 = byte((a & 3) + user[6]);
    const far = farFromWindow(page0644, (zpHigh & 0x3f) | 0x80);
    return { ...result(far.page, far.high, zpLow, 4), invalid: false };
  }
  if (high < 0xaa) {
    let n = addColumn(rowTimes94(high - 0xa1));
    n += 0xb8;
    const page0644 = byte(((n >> 8) >> 1) + 0x14);
    const [zpHigh, zpLow] = shiftLeft16(n >> 8, n & 0xff, 5);
    const far = farFromWindow(page0644, (zpHigh & 0x3f) | 0x80);
    return { ...result(far.page, far.high, zpLow, 4), invalid: false };
  }
  const n = addColumn(rowTimes94(high - 0xb0));
  const page0644 = byte(((n >> 8) >> 1) + 7);
  const [zpHigh, zpLow] = shiftLeft16(n >> 8, n & 0xff, 5);
  const far = farFromWindow(page0644, (zpHigh & 0x3f) | 0x80);
  return { ...result(far.page, far.high, zpLow, 4), invalid: false };
}

/** ROM 里字模的绝对位置（按已核对的字库布局，独立于 $3B 的位运算）：0 表示不在公共字库里（用户表） */
function publicGlyphAddress(code, wide) {
  const high = code >> 8;
  const low = code & 0xff;
  if (high === 0 && low >= 0x20 && low < 0x80) return wide ? 0x51100 + (low - 0x20) * 16 : 0x50e00 + (low - 0x20) * 8;
  if (high >= 0xa1 && high <= 0xa9 && low >= 0xa1 && low < 0xff) return 0x51700 + ((high - 0xa1) * 94 + (low - 0xa1)) * 32;
  if (high >= 0xb0 && high <= 0xf7 && low >= 0xa1 && low < 0xff) return 0x1c000 + ((high - 0xb0) * 94 + (low - 0xa1)) * 32;
  return 0;
}

const USER_TABLE = [0x14, 0x23, 0x8e, 0x15, 0x45, 0x92, 0x0a, 0x6b, 0x31]; // $067E-$0686
const locationCases = [
  ...[0x20, 0x41, 0x7e].flatMap((code) => [0x00, 0x80].map((mode) => ({ code, mode }))),
  ...[0xa1a1, 0xa1fe, 0xa9a1, 0xa9fe, 0xb0a1, 0xb0fe, 0xb1a1, 0xc4e3, 0xd7f9, 0xf7fe].map((code) => ({ code, mode: 0x00 })),
  ...[0x0000, 0x001f, 0x0080, 0x00a0, 0x00ff].flatMap((code) => [0x00, 0x80].map((mode) => ({ code, mode }))),
  ...[0xf8a1, 0xf8fe, 0xfea1, 0xfefe].map((code) => ({ code, mode: 0x00 })),
  ...[0x0020, 0x0041, 0x0000].map((code) => ({ code, mode: 0x40 })),
  ...[0xaaa1, 0xaffe, 0xb0a0, 0xb0ff, 0xa1ff].map((code) => ({ code, mode: 0x00 })),
].map(({ code, mode }) => {
  const want = glyphLocation(code, mode, USER_TABLE);
  const id = `text.3b.${code.toString(16).padStart(4, '0')}.m${hexName(mode)}`;
  const title = want.invalid ? `$3B：字符码 $${code.toString(16).toUpperCase().padStart(4, '0')} 不合法，$0640 置 $FF` : `$3B：字符码 $${code.toString(16).toUpperCase().padStart(4, '0')}、$0638=$${hexName(mode)}，字模在页 $${hexName(want.page)} 偏移 $${((want.high << 8) | want.low).toString(16).toUpperCase().padStart(3, '0')}`;
  const common = { id, title, func: 0x3b, sub: 0, maxFrames: 60 };
  const memory = [[0x64a, [code >> 8, code & 0xff]], [0x638, [mode]], [0x640, [0]], [0x644, [0xee]], [0x0e, [0xee, 0xee]], [0x67e, USER_TABLE]];
  if (want.invalid) return { ...common, mem: memory, expect: [[0x640, [0xff]], [0x638, [(mode & 0xf8) | 4]]] };
  const expect = [[0x644, [want.page]], [0x0e, [want.low, want.high]], [0x638, [(mode & 0xf8) | want.flags]], [0x640, [0]]];
  const known = publicGlyphAddress(code, (mode & 0x80) !== 0);
  if (known && (mode & 0x40) === 0) {
    return { ...common, mem: memory, expect, check: (result) => {
      const [page] = result.memory.get(0x644);
      const [low, high] = result.memory.get(0x0e);
      const absolute = page * 0x1000 + high * 0x100 + low;
      return absolute === known ? [] : [`字模绝对位置 $${absolute.toString(16).toUpperCase()}，预期 $${known.toString(16).toUpperCase()}`];
    } };
  }
  return { ...common, mem: memory, expect };
});

// ---- $3C-$3F 画字符串 ----
const BUFFER_OFFSET = (0xf8 - 0x80) * 0x1000;
const STRING_OFFSET = 0x100;
const DMA = { ctrl: 0x4048, srcHigh: 0x4049, srcLow: 0x404a, srcMid: 0x404b, dstLo: 0x404c, dstHi: 0x404d, lenLo: 0x404e, lenHi: 0x404f };
const FLAG_CONST = [0x00, 0x00, 0xff, 0xff]; // TEXT_PLANE_FILL_TABLE
const FLAG_GLYPH = [0x00, 0xff, 0xff, 0x00]; // TEXT_PLANE_INVERT_TABLE
const MODE_SUB = [0x00, 0x02, 0x08, 0x0a, 0x03, 0x01, 0x0b, 0x09, 0x0c, 0x0e, 0x04, 0x06, 0x0f, 0x0d, 0x07, 0x05]; // TEXT_DRAW_FLAGS_NORMAL
const MODE_SUB_ALT = [0x05, 0x06, 0x09, 0x0a, 0x07, 0x05, 0x0b, 0x09, 0x0d, 0x0e, 0x05, 0x06, 0x0f, 0x0d, 0x07, 0x05]; // TEXT_DRAW_FLAGS_REVERSE（子功能最高位为 1 时用）
const MODE_PLANE1_CONST = [0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]; // TEXT_PLANE2_FILL
const MODE_PLANE0_CONST = [0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 0, 0xff, 0, 0, 0xff, 0xff, 0xff, 0xff]; // TEXT_PLANE1_FILL

/** 一个平面的 8 字节：glyphFlag 为 0 取常量，否则取字模（常量非 0 时取反） */
const plane = (glyphFlag, constant, glyph) => glyph.map((value) => (glyphFlag === 0 ? constant : constant === 0 ? value : byte(~value)));
/** $3C、$3E 的平面设置：$064E → 两个平面（常量与是否用字模），按 P08_SELECT_DRAW_MODE */
const twoPlaneFlags = (mode, alt = false) => {
  const index = (mode & 3) | ((mode & 0x30) >> 2);
  const sub = (alt ? MODE_SUB_ALT : MODE_SUB)[index];
  return { const0: sub & 1 ? MODE_PLANE0_CONST[index] : 0, glyph0: sub & 2 ? 0xff : 0, const1: sub & 4 ? MODE_PLANE1_CONST[index] : 0, glyph1: sub & 8 ? 0xff : 0 };
};
/** $3D、$3F 的平面设置：$064E 的位对 (b0,b4)、(b1,b5)、(b2,b6)、(b3,b7) 各折成 0-3 */
const fourPlaneFlags = (mode) => [0, 1, 2, 3].map((i) => {
  const index = ((mode >> i) & 1) | (((mode >> (i + 4)) & 1) << 1);
  return { constant: FLAG_CONST[index], glyph: FLAG_GLYPH[index] };
});

/** 取一个字符的字模：返回按 8 字节一组分块的瓦片列表（8×8 一块，8×16 两块，16×16 四块）与是否为单字节 */
const glyphTiles = (code, wide) => {
  const known = publicGlyphAddress(code, wide);
  const size = code >> 8 === 0 ? (wide ? 16 : 8) : 32;
  const bytes = [...rom.subarray(known, known + size)];
  return Array.from({ length: size / 8 }, (_, i) => bytes.slice(i * 8, i * 8 + 8));
};

/** 按字符串模拟 $3C/$3E（二平面）或 $3D/$3F（四平面），返回缓冲内容 */
function drawModel(func, characters, mode, wide, alt = false) {
  const out = [];
  const twoPlanes = func === 0x3c || func === 0x3e;
  const hanziAllowed = func === 0x3c || func === 0x3d;
  const flags2 = twoPlaneFlags(mode, alt);
  const flags4 = fourPlaneFlags(mode);
  const blankTile = () => (twoPlanes ? [...new Array(8).fill(flags2.const0), ...new Array(8).fill(flags2.const1)] : flags4.flatMap((f) => new Array(8).fill(f.constant)));
  for (const code of characters) {
    const isHanzi = code >> 8 !== 0;
    if (!isHanzi && hanziAllowed && !wide) out.push(...blankTile());
    for (const glyph of glyphTiles(code, isHanzi ? false : wide)) {
      if (twoPlanes) out.push(...plane(flags2.glyph0, flags2.const0, glyph), ...plane(flags2.glyph1, flags2.const1, glyph));
      else out.push(...flags4.flatMap((f) => plane(f.glyph, f.constant, glyph)));
    }
  }
  return out;
}

const drawCase = (func, characters, mode, wide, vramTile = 0x0010, title = '', alt = false) => {
  const stringBytes = characters.flatMap((code) => (code >> 8 === 0 ? [code] : [code >> 8, code & 0xff]));
  const want = drawModel(func, characters, mode, wide, alt);
  const destination = (vramTile << 4) & 0xffff;
  const clipped = destination + want.length - 1 > 0xffff;
  const dmaLength = clipped ? 0xffff - destination : want.length - 1;
  const fullLength = want.length - 1;
  const dmaWrites = [[DMA.ctrl, [0xc0]], [DMA.srcHigh, [0x1f]], [DMA.srcLow, [0x00]], [DMA.srcMid, [0x80]], [DMA.dstLo, [destination & 0xff]], [DMA.dstHi, [destination >> 8]], [DMA.lenLo, clipped ? [fullLength & 0xff, dmaLength & 0xff] : [dmaLength & 0xff]], [DMA.lenHi, clipped ? [fullLength >> 8, dmaLength >> 8] : [dmaLength >> 8]]];
  return {
    id: `text.${hexName(func)}.${characters.map((c) => c.toString(16)).join('-')}.m${hexName(mode)}${wide ? '.wide' : ''}${clipped ? '.clip' : ''}${alt ? '.alt' : ''}`,
    title: `$${hexName(func)}${alt ? '/$80' : ''} ${title}：字符串 ${characters.map((c) => `$${c.toString(16).toUpperCase()}`).join(' ')}、$064E=$${hexName(mode)}、$0638=$${hexName(wide ? 0x80 : 0)}，写 ${want.length} 字节瓦片数据到缓冲，DMA 到显存 $${destination.toString(16).toUpperCase().padStart(4, '0')}`,
    fresh: true,
    steps: [{
      host: async (client) => {
        await client.send(`write pram ${STRING_OFFSET.toString(16)} ${toHex([...stringBytes, 0])}`);
        await client.send(`write pram ${BUFFER_OFFSET.toString(16)} ${toHex(new Array(want.length + 8).fill(0xee))}`);
        return runCall(client, {
          func,
          sub: alt ? 0x80 : 0,
          mem: [[0x642, [0x80]], [0x0c, [STRING_OFFSET & 0xff, 0x80 | (STRING_OFFSET >> 8)]], [0x64c, [vramTile & 0xff, vramTile >> 8]], [0x64e, [mode]], [0x64f, [0]], [0x638, [wide ? 0x80 : 0]]],
          readPram: [[BUFFER_OFFSET, want.length + 8]],
          capture: Object.values(DMA),
          maxFrames: 120,
        });
      },
      check: ({ data: result }) => {
        const problems = [];
        if (!result.done) problems.push('调用没有返回');
        const got = result.pram.get(BUFFER_OFFSET);
        const expected = [...want, ...new Array(8).fill(0xee)];
        if (toHex(got) !== toHex(expected)) {
          let at = 0;
          while (got[at] === expected[at]) at++;
          problems.push(`缓冲在字节 ${at} 处不同（实际 ${hexName(got[at])}，预期 ${hexName(expected[at])}），预期长度 ${want.length}`);
        }
        for (const [address, values] of dmaWrites) {
          const writes = result.writes.get(address) ?? [];
          if (toHex(writes) !== toHex(values)) problems.push(`DMA 寄存器 $${address.toString(16).toUpperCase()} 写入 ${toHex(writes)}，预期 ${toHex(values)}`);
        }
        return problems;
      },
    }],
  };
};

const A = 0x41;
const B = 0x42;
const HAN_A = 0xb0a1;
const HAN_NI = 0xc4e3;
const drawCases = [
  ...[0x00, 0x01, 0x02, 0x03, 0x10, 0x11, 0x20, 0x22, 0x31, 0x13].flatMap((mode) => [drawCase(0x3e, [A, B], mode, false, 0x0010, '8×8 ASCII')]),
  drawCase(0x3e, [A], 0x01, true, 0x0010, '8×16 ASCII'),
  drawCase(0x3c, [A], 0x01, false, 0x0010, '半角字符前补空白瓦片'),
  drawCase(0x3c, [A, B], 0x13, true, 0x0010, '8×16 ASCII'),
  drawCase(0x3c, [HAN_A], 0x01, false, 0x0010, '汉字 4 瓦片'),
  drawCase(0x3c, [HAN_NI, A, HAN_A], 0x22, false, 0x0020, '汉字与 ASCII 混排'),
  drawCase(0x3c, [HAN_NI], 0x31, false, 0x0030, '汉字'),
  drawCase(0x3c, [A], 0x01, false, 0x0fff, '显存末尾处截断 DMA 长度'),
  ...[0x01, 0x12, 0x00, 0xff, 0x5a, 0xa5, 0x0f, 0x21].map((mode) => drawCase(0x3f, [A, B], mode, false, 0x0010, '8×8 ASCII 四平面')),
  drawCase(0x3f, [A], 0x12, true, 0x0010, '8×16 ASCII 四平面'),
  ...[0x01, 0x12, 0x5a, 0xa5].map((mode) => drawCase(0x3d, [HAN_A], mode, false, 0x0010, '汉字四平面')),
  drawCase(0x3d, [A, HAN_NI], 0x12, false, 0x0040, '半角字符前补空白瓦片'),
  ...[0x00, 0x01, 0x02, 0x03, 0x10, 0x11, 0x20, 0x22, 0x31, 0x13].map((mode) => drawCase(0x3e, [A, B], mode, false, 0x0010, '8×8 ASCII', true)),
  ...[0x00, 0x01, 0x12, 0x33].map((mode) => drawCase(0x3c, [A, HAN_NI, B], mode, false, 0x0010, '汉字与 ASCII 混排', true)),
  drawCase(0x3c, [A], 0x13, true, 0x0010, '8×16 ASCII', true),
];

export const cases = [...locationCases, ...drawCases];

export { drawModel };
