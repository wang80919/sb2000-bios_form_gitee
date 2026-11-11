// ------------------------------------------------------------------------
// 名称：float.mjs
// 说明：验证用例用的 BIOS 浮点数编码与解码（7 字节：阶码、符号、5 字节尾数）。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：数值 = (符号为 $FF 取负) × (尾数 40 位整数 / 2^40) × 2^阶码；实测 3.5 编码为 02 00 E0 00 00 00 00，-100.125 编码为 07 FF C8 40 00 00 00，
//       0.25 编码为 00 00 40 00 00 00 00（尾数不一定规格化）；阶码按有符号字节处理：0.1 乘 0.2 的结果阶码字节在 $80 以上（负阶码），按有符号字节解码与数值一致（用例 p09.fp.mul.0.1_0.2）。
// ------------------------------------------------------------------------

/**
 * 把一个数编码成 7 字节（尾数规格化，最高位为 1）。
 * @param {number} value 非零的有限数
 * @returns {Uint8Array}
 */
export function encodeFloat(value) {
  if (value === 0 || !Number.isFinite(value)) throw new Error('只能编码非零有限数');
  const sign = value < 0 ? 0xff : 0x00;
  const magnitude = Math.abs(value);
  const exponent = Math.floor(Math.log2(magnitude)) + 1;
  let mantissa = BigInt(Math.floor((magnitude / 2 ** exponent) * 2 ** 40));
  const bytes = [exponent & 0xff, sign];
  for (let shift = 32n; shift >= 0n; shift -= 8n) bytes.push(Number((mantissa >> shift) & 0xffn));
  return Uint8Array.from(bytes);
}

/**
 * 把 7 字节解码成数。
 * @param {Uint8Array} bytes 至少 7 字节：阶码、符号、尾数
 * @returns {number}
 */
export function decodeFloat(bytes) {
  let mantissa = 0n;
  for (let i = 2; i < 7; i++) mantissa = (mantissa << 8n) | BigInt(bytes[i]);
  const exponent = bytes[0] > 0x7f ? bytes[0] - 256 : bytes[0];
  const magnitude = (Number(mantissa) / 2 ** 40) * 2 ** exponent;
  return bytes[1] === 0xff ? -magnitude : magnitude;
}

/**
 * 判断两个数是否在相对误差内相等；预期为 0 时用绝对误差。
 * @param {number} actual 实际值
 * @param {number} expected 预期值
 * @param {number} [tolerance] 容差，默认 2e-6
 */
export function nearlyEqual(actual, expected, tolerance = 2e-6) {
  return Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected));
}
