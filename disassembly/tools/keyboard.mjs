// ------------------------------------------------------------------------
// 名称：keyboard.mjs
// 说明：把可打印字符映射为模拟器使用的键盘扫描码（DirectInput 的 DIK 值），
//       并提供经调试服务向 SB-DOS 输入文本的辅助函数。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：仅覆盖美式键盘上的字母、数字、常用标点、空格与回车。
// ------------------------------------------------------------------------

/** 常用控制键扫描码 */
export const KEY = Object.freeze({
  ESC: 0x01,
  BACKSPACE: 0x0e,
  TAB: 0x0f,
  ENTER: 0x1c,
  LCTRL: 0x1d,
  LSHIFT: 0x2a,
  SPACE: 0x39,
  F1: 0x3b,
  F2: 0x3c,
  F3: 0x3d,
  F4: 0x3e,
  F5: 0x3f,
  F10: 0x44,
});

const LETTERS = {
  a: 0x1e, b: 0x30, c: 0x2e, d: 0x20, e: 0x12, f: 0x21, g: 0x22, h: 0x23, i: 0x17,
  j: 0x24, k: 0x25, l: 0x26, m: 0x32, n: 0x31, o: 0x18, p: 0x19, q: 0x10, r: 0x13,
  s: 0x1f, t: 0x14, u: 0x16, v: 0x2f, w: 0x11, x: 0x2d, y: 0x15, z: 0x2c,
};

/** 数字行：未按 Shift 与按下 Shift 的字符，下标对应扫描码 0x02..0x0D */
const NUMBER_ROW_PLAIN = '1234567890-=';
const NUMBER_ROW_SHIFT = '!@#$%^&*()_+';

/** 其余标点：字符 -> [扫描码, 是否需要 Shift] */
const PUNCTUATION = {
  '[': [0x1a, false], '{': [0x1a, true],
  ']': [0x1b, false], '}': [0x1b, true],
  ';': [0x27, false], ':': [0x27, true],
  "'": [0x28, false], '"': [0x28, true],
  '`': [0x29, false], '~': [0x29, true],
  '\\': [0x2b, false], '|': [0x2b, true],
  ',': [0x33, false], '<': [0x33, true],
  '.': [0x34, false], '>': [0x34, true],
  '/': [0x35, false], '?': [0x35, true],
  ' ': [KEY.SPACE, false],
  '\n': [KEY.ENTER, false],
};

/**
 * 查找一个字符对应的按键。
 * @param {string} ch 单个字符
 * @returns {{code: number, shift: boolean}}
 */
export function keyForChar(ch) {
  const lower = ch.toLowerCase();
  if (lower in LETTERS) return { code: LETTERS[lower], shift: ch !== lower };
  const plain = NUMBER_ROW_PLAIN.indexOf(ch);
  if (plain >= 0) return { code: 0x02 + plain, shift: false };
  const shifted = NUMBER_ROW_SHIFT.indexOf(ch);
  if (shifted >= 0) return { code: 0x02 + shifted, shift: true };
  if (ch in PUNCTUATION) return { code: PUNCTUATION[ch][0], shift: PUNCTUATION[ch][1] };
  throw new Error(`没有对应的按键：${JSON.stringify(ch)}`);
}

/**
 * 向模拟器输入一段文本，每个字符按下并松开，期间运行若干帧。
 * @param {{send: (cmd: string) => Promise<unknown>}} client 调试服务客户端
 * @param {string} text 要输入的文本，换行表示回车
 * @param {{holdFrames?: number, gapFrames?: number}} [options] 按住与间隔的帧数
 */
export async function typeText(client, text, { holdFrames = 5, gapFrames = 4 } = {}) {
  for (const ch of text) {
    const { code, shift } = keyForChar(ch);
    if (shift) await client.send(`key ${KEY.LSHIFT.toString(16)} 1`);
    await client.send(`key ${code.toString(16)} 1`);
    await client.send(`run ${holdFrames}`);
    await client.send(`key ${code.toString(16)} 0`);
    if (shift) await client.send(`key ${KEY.LSHIFT.toString(16)} 0`);
    await client.send(`run ${gapFrames}`);
  }
}
