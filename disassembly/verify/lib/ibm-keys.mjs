// ------------------------------------------------------------------------
// 名称：ibm-keys.mjs
// 说明：标准 IBM PC（美式 101 键）键盘的“扫描码 + 修饰键 → ASCII、扫描码”预期表，作为键盘翻译验证的独立预期来源。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：表按 IBM PC/AT BIOS 的 INT 16h 行为写成规则：普通、Shift、CapsLock、Ctrl、Alt、小键盘（NumLock 开或关）。
//       返回 null 表示该组合不产生按键；返回 [ASCII, 扫描码]，没有字符的键 ASCII 为 0。扩展键（方向键等）用“扫描码 | $80”表示，与模拟器的按键编号一致。
// ------------------------------------------------------------------------

const LOWER = new Map();
const UPPER = new Map();
const put = (scan, lower, upper) => {
  LOWER.set(scan, lower.charCodeAt(0));
  UPPER.set(scan, upper.charCodeAt(0));
};

'1234567890'.split('').forEach((digit, i) => put(0x02 + i, digit, ')!@#$%^&*('[(i + 1) % 10]));
put(0x0c, '-', '_');
put(0x0d, '=', '+');
'qwertyuiop'.split('').forEach((letter, i) => put(0x10 + i, letter, letter.toUpperCase()));
put(0x1a, '[', '{');
put(0x1b, ']', '}');
'asdfghjkl'.split('').forEach((letter, i) => put(0x1e + i, letter, letter.toUpperCase()));
put(0x27, ';', ':');
put(0x28, "'", '"');
put(0x29, '`', '~');
put(0x2b, '\\', '|');
'zxcvbnm'.split('').forEach((letter, i) => put(0x2c + i, letter, letter.toUpperCase()));
put(0x33, ',', '<');
put(0x34, '.', '>');
put(0x35, '/', '?');

/** 是字母键（CapsLock 只影响字母） */
const isLetter = (scan) => (scan >= 0x10 && scan <= 0x19) || (scan >= 0x1e && scan <= 0x26) || (scan >= 0x2c && scan <= 0x32);

/** 小键盘：扫描码 → [NumLock 开时的 ASCII, NumLock 关时（或 Shift 时）的扩展扫描码] */
const KEYPAD = new Map([
  [0x47, ['7', 0x47]], [0x48, ['8', 0x48]], [0x49, ['9', 0x49]], [0x4b, ['4', 0x4b]], [0x4c, ['5', null]], [0x4d, ['6', 0x4d]],
  [0x4f, ['1', 0x4f]], [0x50, ['2', 0x50]], [0x51, ['3', 0x51]], [0x52, ['0', 0x52]], [0x53, ['.', 0x53]],
]);

/** 修饰键 Ctrl 加小键盘或编辑键时的扩展扫描码 */
const CTRL_NAV = new Map([[0x47, 0x77], [0x4f, 0x75], [0x49, 0x84], [0x51, 0x76], [0x4b, 0x73], [0x4d, 0x74]]);

/** 扩展键（E0 前缀）的编号 → 对应的编辑键扫描码 */
const EXTENDED = new Map([[0xc8, 0x48], [0xd0, 0x50], [0xcb, 0x4b], [0xcd, 0x4d], [0xc7, 0x47], [0xcf, 0x4f], [0xc9, 0x49], [0xd1, 0x51], [0xd2, 0x52], [0xd3, 0x53]]);

/**
 * 标准 IBM 键盘在给定修饰状态下对一个键的翻译。
 * @param {number} key 模拟器按键编号（扫描码，扩展键为扫描码 | $80）
 * @param {{shift?: boolean, caps?: boolean, ctrl?: boolean, alt?: boolean, numLock?: boolean}} state 修饰状态
 * @returns {[number, number] | null} [ASCII, 扫描码]，不产生按键时为 null
 */
export function ibmKey(key, { shift = false, caps = false, ctrl = false, alt = false, numLock = true } = {}) {
  // 扩展键：方向键等，与小键盘 NumLock 关时一致，但 Shift、NumLock 不影响
  if (EXTENDED.has(key)) {
    const scan = EXTENDED.get(key);
    if (ctrl) return CTRL_NAV.has(scan) ? [0, CTRL_NAV.get(scan)] : null;
    return [0, scan];
  }
  if (key === 0x9c) return ctrl ? [0x0a, 0x1c] : alt ? null : [0x0d, 0x1c];
  if (key === 0xb5) return ctrl || alt ? null : shift ? [0x3f, 0x35] : [0x2f, 0x35];
  // 功能键 F1-F10
  if (key >= 0x3b && key <= 0x44) {
    const n = key - 0x3b;
    if (alt) return [0, 0x68 + n];
    if (ctrl) return [0, 0x5e + n];
    if (shift) return [0, 0x54 + n];
    return [0, key];
  }
  if (KEYPAD.has(key)) {
    const [digit, nav] = KEYPAD.get(key);
    if (ctrl) return CTRL_NAV.has(key) ? [0, CTRL_NAV.get(key)] : null;
    if (alt) return null;
    const asDigit = numLock !== shift;
    if (asDigit) return [digit.charCodeAt(0), key];
    return nav === null ? null : [0, nav];
  }
  switch (key) {
    case 0x01: return alt ? null : [0x1b, 0x01];
    case 0x0e: return alt ? null : [ctrl ? 0x7f : 0x08, 0x0e];
    case 0x0f: return alt || ctrl ? null : shift ? [0, 0x0f] : [0x09, 0x0f];
    case 0x1c: return alt ? null : [ctrl ? 0x0a : 0x0d, 0x1c];
    case 0x39: return [0x20, 0x39];
    case 0x37: return ctrl || alt ? null : [0x2a, 0x37];
    case 0x4a: return ctrl || alt ? null : [0x2d, 0x4a];
    case 0x4e: return ctrl || alt ? null : [0x2b, 0x4e];
    default: break;
  }
  if (!LOWER.has(key)) return null;
  if (alt) {
    // Alt+数字行与字母给 0 加扫描码，数字行的扫描码是 $78 起
    if (key >= 0x02 && key <= 0x0d) return [0, 0x78 + (key - 0x02)];
    return isLetter(key) ? [0, key] : null;
  }
  if (ctrl) {
    if (isLetter(key)) return [LOWER.get(key) - 0x60, key];
    if (key === 0x03) return [0x00, 0x03];
    if (key === 0x07) return [0x1e, 0x07];
    if (key === 0x0c) return [0x1f, 0x0c];
    if (key === 0x1a) return [0x1b, 0x1a];
    if (key === 0x1b) return [0x1d, 0x1b];
    if (key === 0x2b) return [0x1c, 0x2b];
    return null;
  }
  const upper = isLetter(key) ? shift !== caps : shift;
  return [(upper ? UPPER : LOWER).get(key), key];
}

/** 要测试的按键：普通键、功能键 F1-F10、小键盘、扩展键（不含修饰键与锁定键） */
export const TESTED_KEYS = [
  0x01, ...Array.from({ length: 0x0e - 0x02 + 1 }, (_, i) => 0x02 + i), 0x0f,
  ...Array.from({ length: 0x1c - 0x10 + 1 }, (_, i) => 0x10 + i),
  ...Array.from({ length: 0x29 - 0x1e + 1 }, (_, i) => 0x1e + i), 0x2b,
  ...Array.from({ length: 0x35 - 0x2c + 1 }, (_, i) => 0x2c + i), 0x37, 0x39,
  ...Array.from({ length: 0x44 - 0x3b + 1 }, (_, i) => 0x3b + i),
  0x47, 0x48, 0x49, 0x4a, 0x4b, 0x4c, 0x4d, 0x4e, 0x4f, 0x50, 0x51, 0x52, 0x53,
  0xc8, 0xd0, 0xcb, 0xcd, 0xc7, 0xcf, 0xc9, 0xd1, 0xd2, 0xd3, 0x9c, 0xb5,
];
