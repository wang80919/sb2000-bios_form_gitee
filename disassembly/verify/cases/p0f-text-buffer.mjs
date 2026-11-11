// ------------------------------------------------------------------------
// 名称：p0f-text-buffer.mjs
// 说明：页组 $0F 的 $47、$48 的验证用例：把字符串画成点阵瓦片，写进调用者指定的扩展 RAM 地址，返回写入的字节数。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值按 bios/src/display/text-to-buffer.asm（$8000-$86A8）的代码阅读写成模型，画字的规则与 $3C-$3F 相同（直接用 p08-text.mjs 的 drawModel，字模取自 ROM）：
//       $47 同 $3C/$3D（汉字与单字节字符，单字节字符为 8×8 时前面补一个空白瓦片），$48 同 $3E/$3F（只处理单字节字符，不补空白瓦片）；二平面每瓦片 16 字节，四平面每瓦片 32 字节。
//       输入：字符串在 $0C/$0D 与页组 $0642；目的地址是 $12/$13（窗口地址，高 4 位选页）与页组 $0643，页号 = ($13 的高 4 位) − 8 + $0643（同 $61）；$064E 是平面设置；$0638 位 7 为 1 画 8×16 的单字节字符；
//       $0653 是结束符（与字符串里的字节比较，汉字比较第一个字节）；$0650:$064F 是目的区还能容纳的字节数，返回时变成实际写入的字节数；不够容纳下一个字符时在该字符之前停止。
//       平面数由 $0652 决定：4 画二平面，0 先查 $062E 位 7（0 画二平面、其他画四平面），其他值画四平面；$0652 为 0 时先调用 $1E/0，会把子功能清 0（代码阅读），所以子功能最高位只在 $0652 为 4 时可能有效。
//       子功能最高位（换另一张设置表）：两张表（BUFFER_DRAW_FLAGS_NORMAL、BUFFER_DRAW_FLAGS_REVERSE）对所有 $064E 取值给出的画面完全相同（模型里两种取法的结果逐字节一致），输出区分不出来，所以子功能最高位的用例只能核对输出与不带最高位时相同。
//       目的区跨 4KB 页时窗口 2、3 的映射随之后移，输出在扩展 RAM 里线性连续；字符串超过 256 字节时分段取入，汉字的第一个字节恰在段末时重新取入。
//       没有覆盖：用户字库路径（字符码 $00-$1F、$80-$A0、$F8 区以上）、不合法的汉字码。
// ------------------------------------------------------------------------
import { runCall } from '../../tools/rom-driver.mjs';
import { drawModel } from './p08-text.mjs';

const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const toHex = (bytes) => [...bytes].map(hexName).join('');
const SOURCE_PRAM = 0x100;
const DEST_GROUP = 0x83;
const DEST_BASE = (DEST_GROUP - 0x80) * 0x1000;
const A = 0x41;
const B = 0x42;
const HAN_A = 0xb0a1;
const HAN_NI = 0xc4e3;

/** 一个字符占的字节：汉字两个字节 */
const stringBytes = (chars) => chars.flatMap((code) => (code >> 8 === 0 ? [code] : [code >> 8, code & 0xff]));

/**
 * 模型：逐个字符画，遇到结束符或容纳不下时停止。
 * @returns {number[]} 写入的全部字节
 */
function model({ func, planes, chars, term, capacity, mode, wide, alt }) {
  const drawFunc = func === 0x47 ? (planes === 2 ? 0x3c : 0x3d) : (planes === 2 ? 0x3e : 0x3f);
  let remaining = capacity;
  const out = [];
  for (const code of chars) {
    if ((code >> 8 === 0 ? code : code >> 8) === term) break;
    const bytes = drawModel(drawFunc, [code], mode, wide, alt);
    if (bytes.length > remaining) break;
    out.push(...bytes);
    remaining -= bytes.length;
  }
  return out;
}

/**
 * 一个用例。
 * @param {object} spec func（$47 或 $48）、sel（$0652）、bit7（$062E 位 7）、mode（$064E）、wide、chars、term、capacity、alt、destOffset（页内偏移）
 */
const textCase = ({ id, title, func, sel = 4, bit7 = 0, mode = 0x01, wide = false, chars, term = 0, capacity = 0x3000, alt = false, destOffset = 0 }) => {
  const planes = sel === 4 || (sel === 0 && bit7 === 0) ? 2 : 4;
  // $0652 为 0 时 $1E/0 会把子功能清 0，换表标志失效
  const effectiveAlt = alt && sel === 4;
  const want = model({ func, planes, chars, term, capacity, mode, wide, alt: effectiveAlt });
  const dest = DEST_BASE + destOffset;
  return {
    id: `f${hexName(func)}.${id}`,
    title: `$${hexName(func)}${alt ? '/$80' : ''} ${title}：${planes} 平面、$064E=$${hexName(mode)}、$0638 位 7=${wide ? 1 : 0}、容量 ${capacity}，写入 ${want.length} 字节`,
    fresh: true,
    steps: [{
      host: async (client) => {
        await client.send(`write pram ${SOURCE_PRAM.toString(16)} ${toHex([...stringBytes(chars), term])}`);
        for (let done = 0; done < want.length + 16; done += 1024) await client.send(`write pram ${(dest + done).toString(16)} ${toHex(new Array(Math.min(1024, want.length + 16 - done)).fill(0xee))}`);
        return runCall(client, {
          func,
          sub: alt ? 0x80 : 0,
          mem: [[0x642, [0x80]], [0x0c, [SOURCE_PRAM & 0xff, 0x80 | (SOURCE_PRAM >> 8)]], [0x643, [DEST_GROUP]], [0x12, [destOffset & 0xff, 0x80 | (destOffset >> 8)]], [0x64e, [mode]], [0x64f, [capacity & 0xff, capacity >> 8]], [0x653, [term]], [0x652, [sel]], [0x638, [wide ? 0x80 : 0]], [0x62e, [bit7 ? 0x80 : 0]]],
          read: [[0x64f, 2]],
          readPram: [[dest, want.length + 16]],
          maxFrames: 400,
        });
      },
      check: ({ data: result }) => {
        const problems = [];
        if (!result.done) return ['调用没有返回'];
        const count = result.memory.get(0x64f)[0] | (result.memory.get(0x64f)[1] << 8);
        if (count !== want.length) problems.push(`返回的字节数 ${count}，预期 ${want.length}`);
        const got = result.pram.get(dest);
        const expected = [...want, ...new Array(16).fill(0xee)];
        if (toHex(got) !== toHex(expected)) {
          let at = 0;
          while (got[at] === expected[at]) at++;
          problems.push(`缓冲在字节 ${at} 处不同（实际 ${hexName(got[at])}，预期 ${hexName(expected[at])}）`);
        }
        return problems;
      },
    }],
  };
};

const cases = [];

// ---- $47 二平面 ----
for (const mode of [0x00, 0x01, 0x02, 0x03, 0x10, 0x11, 0x13, 0x20, 0x22, 0x31]) cases.push(textCase({ id: `two-ascii-m${hexName(mode)}`, title: '单字节字符前补空白瓦片', func: 0x47, mode, chars: [A, B] }));
for (const mode of [0x01, 0x13, 0x22]) cases.push(textCase({ id: `two-wide-m${hexName(mode)}`, title: '8×16 单字节字符', func: 0x47, mode, wide: true, chars: [A, B] }));
for (const mode of [0x01, 0x22, 0x31]) cases.push(textCase({ id: `two-hanzi-m${hexName(mode)}`, title: '汉字', func: 0x47, mode, chars: [HAN_NI] }));
for (const mode of [0x00, 0x13]) cases.push(textCase({ id: `two-mixed-m${hexName(mode)}`, title: '汉字与单字节字符混排', func: 0x47, mode, chars: [A, HAN_A, B, HAN_NI] }));
for (const mode of [0x00, 0x01, 0x12, 0x33]) cases.push(textCase({ id: `two-alt-m${hexName(mode)}`, title: '子功能最高位为 1 换另一张设置表', func: 0x47, mode, chars: [A, HAN_NI, B], alt: true }));

// ---- $47 四平面 ----
for (const mode of [0x00, 0x01, 0x12, 0x21, 0x5a, 0xa5, 0xff]) cases.push(textCase({ id: `four-mixed-m${hexName(mode)}`, title: '汉字与单字节字符混排', func: 0x47, sel: 2, mode, chars: [A, HAN_NI, B] }));
cases.push(textCase({ id: 'four-wide', title: '8×16 单字节字符', func: 0x47, sel: 2, mode: 0x12, wide: true, chars: [A, HAN_A] }));

// ---- 平面数的选择 ----
cases.push(textCase({ id: 'select-0-bit7-0', title: '$0652=0、$062E 位 7 为 0 画二平面', func: 0x47, sel: 0, bit7: 0, mode: 0x13, chars: [A, HAN_A] }));
cases.push(textCase({ id: 'select-0-bit7-1', title: '$0652=0、$062E 位 7 为 1 画四平面', func: 0x47, sel: 0, bit7: 1, mode: 0x13, chars: [A, HAN_A] }));
for (const sel of [1, 2, 3, 5, 0x80, 0xff]) cases.push(textCase({ id: `select-${hexName(sel)}`, title: `$0652=$${hexName(sel)} 画四平面（不看 $062E）`, func: 0x47, sel, mode: 0x12, chars: [A, HAN_NI] }));
cases.push(textCase({ id: 'select-0-alt-ignored', title: '$0652=0 时子功能最高位为 1：输出与子功能 0 相同（两张设置表的输出相同，区分不出）', func: 0x47, sel: 0, mode: 0x01, chars: [A, HAN_NI], alt: true }));

// ---- 结束符与容量 ----
cases.push(textCase({ id: 'term-b', title: '结束符 $42：画到 B 之前', func: 0x47, term: B, chars: [A, B, A] }));
cases.push(textCase({ id: 'term-first', title: '结束符 $41：第一个字符就是结束符，什么都不画', func: 0x47, term: A, chars: [A, B] }));
cases.push(textCase({ id: 'term-hanzi-byte', title: '结束符 $B0：汉字的第一个字节等于结束符时停止', func: 0x47, term: 0xb0, chars: [A, HAN_A, B] }));
cases.push(textCase({ id: 'term-space', title: '结束符 $20', func: 0x47, term: 0x20, chars: [A, 0x20, B] }));
for (const capacity of [128, 127, 100, 96, 64, 63, 32, 31, 0, 0x0180]) cases.push(textCase({ id: `cap-${capacity}`, title: '容量不足时在字符之前停止（A、B 各 32 字节，汉字 64 字节）', func: 0x47, mode: 0x13, chars: [A, B, HAN_A], capacity }));
for (const capacity of [255, 256, 300, 512]) cases.push(textCase({ id: `cap-four-${capacity}`, title: '容量不足时在字符之前停止（四平面：单字节 64、汉字 128 字节）', func: 0x47, sel: 2, mode: 0x12, chars: [A, HAN_A, B, A], capacity }));

// ---- $48 ----
for (const mode of [0x00, 0x01, 0x02, 0x13, 0x22]) cases.push(textCase({ id: `two-ascii-m${hexName(mode)}`, title: '单字节字符，不补空白瓦片', func: 0x48, mode, chars: [A, B] }));
cases.push(textCase({ id: 'two-wide', title: '8×16 单字节字符', func: 0x48, mode: 0x01, wide: true, chars: [A, B] }));
for (const mode of [0x00, 0x01, 0x13]) cases.push(textCase({ id: `two-alt-m${hexName(mode)}`, title: '子功能最高位为 1 换另一张设置表', func: 0x48, mode, chars: [A, B], alt: true }));
for (const mode of [0x01, 0x12, 0x5a, 0xa5]) cases.push(textCase({ id: `four-ascii-m${hexName(mode)}`, title: '单字节字符', func: 0x48, sel: 2, mode, chars: [A, B] }));
cases.push(textCase({ id: 'four-wide', title: '8×16 单字节字符', func: 0x48, sel: 2, mode: 0x12, wide: true, chars: [A, B] }));
cases.push(textCase({ id: 'select-0-bit7-1', title: '$0652=0、$062E 位 7 为 1 画四平面', func: 0x48, sel: 0, bit7: 1, mode: 0x12, chars: [A, B] }));
cases.push(textCase({ id: 'select-0-bit7-0', title: '$0652=0、$062E 位 7 为 0 画二平面', func: 0x48, sel: 0, bit7: 0, mode: 0x13, chars: [A, B] }));
cases.push(textCase({ id: 'term-b', title: '结束符 $42', func: 0x48, term: B, chars: [A, B, A] }));
for (const capacity of [48, 47, 32, 31, 16, 15, 0]) cases.push(textCase({ id: `cap-${capacity}`, title: '容量不足时在字符之前停止（每个 8×8 字符 16 字节）', func: 0x48, mode: 0x13, chars: [A, B, A], capacity }));
for (const capacity of [64, 63, 31]) cases.push(textCase({ id: `cap-wide-${capacity}`, title: '容量不足时在字符之前停止（每个 8×16 字符 32 字节）', func: 0x48, mode: 0x13, wide: true, chars: [A, B, A], capacity }));

// ---- 目的区跨 4KB 页、窗口后移 ----
for (const destOffset of [0x0ff0, 0x0fc0, 0x0fff, 0x0fe0, 0x0f80, 0x0800]) cases.push(textCase({ id: `cross-${destOffset.toString(16)}`, title: `目的区从页内偏移 $${destOffset.toString(16)} 起，汉字与单字节字符跨页`, func: 0x47, mode: 0x13, chars: [HAN_NI, HAN_A, A, B, HAN_NI], destOffset }));
for (const destOffset of [0x0fb0, 0x0f00, 0x0ff8]) cases.push(textCase({ id: `cross-four-${destOffset.toString(16)}`, title: `目的区从页内偏移 $${destOffset.toString(16)} 起，四平面汉字跨页`, func: 0x47, sel: 2, mode: 0x12, chars: [HAN_NI, A, HAN_A, B], destOffset }));
for (const destOffset of [0x0fe0, 0x0ff0, 0x0f01]) cases.push(textCase({ id: `cross-${destOffset.toString(16)}`, title: `目的区从页内偏移 $${destOffset.toString(16)} 起，单字节字符跨页`, func: 0x48, mode: 0x13, chars: [A, B, A, B, A, B], destOffset }));

// ---- 字符串超过 256 字节、跨多页 ----
const longAscii = (count) => Array.from({ length: count }, (_, i) => 0x41 + (i % 26));
cases.push(textCase({ id: 'long-300', title: '300 个单字节字符（字符串分两段取入，输出 4800 字节跨页）', func: 0x48, mode: 0x13, chars: longAscii(300) }));
cases.push(textCase({ id: 'long-hanzi-edge', title: '255 个单字节字符后接汉字（汉字的第一个字节恰在分段末尾）再接单字节字符', func: 0x47, mode: 0x13, chars: [...longAscii(255), HAN_A, A, B] }));
cases.push(textCase({ id: 'long-hanzi-edge-2', title: '254 个单字节字符后接汉字、汉字、单字节字符', func: 0x47, mode: 0x13, chars: [...longAscii(254), HAN_NI, HAN_A, A] }));
cases.push(textCase({ id: 'long-300-cap', title: '300 个单字节字符，容量只够 100 个', func: 0x48, mode: 0x13, chars: longAscii(300), capacity: 1600 }));

export { cases };
