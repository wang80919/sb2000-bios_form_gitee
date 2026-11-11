// ------------------------------------------------------------------------
// 名称：p09-math.mjs
// 说明：页 09 数学库（功能 $4A-$52）的验证用例：伪随机数、16 位除法、时分秒转字符串、十进制字符串与浮点数互转、浮点四则运算。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值来自独立的计算（整数除法、十进制算术），不是把 BIOS 的输出抄回来；浮点数允许 2e-6 的相对误差，因为 BIOS 的十进制转换实测是截断而不是舍入。
// ------------------------------------------------------------------------
import { decodeFloat, encodeFloat, nearlyEqual } from '../lib/float.mjs';
import { toHex } from '../../tools/rom-driver.mjs';

const hex = (bytes) => toHex(bytes);
const ascii = (text) => [...text].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase();

/** 按 RAND32_STEP 的算法算一步（把算法写在这里是为了核对：代码阅读的结论与模拟器实际执行一致） */
function randStep(state) {
  const s = [...state];
  if (s[0] === 0 && s[1] === 0) s[1] = 0xff;
  const carryIn = ((s[0] & 2) ^ (s[1] & 2)) !== 0 ? 1 : 0;
  let carry = carryIn;
  for (let i = 0; i < 4; i++) {
    const next = s[i] & 1;
    s[i] = (s[i] >> 1) | (carry << 7);
    carry = next;
  }
  return s;
}

const randCases = [
  { id: 'p09.rand.one', title: '$4A 子功能非 0：步进一次', seed: [0x12, 0x34, 0x56, 0x78], steps: 1, sub: 1 },
  { id: 'p09.rand.zero-seed', title: '$4A 种子全 0（两个高字节为 0）：先把 $0697 置 $FF 再步进', seed: [0, 0, 0, 0], steps: 1, sub: 1 },
  { id: 'p09.rand.hundred', title: '$4A 子功能 0：连续步进 100 次', seed: [0xa5, 0x5a, 0xc3, 0x3c], steps: 100, sub: 0 },
].map(({ id, title, seed, steps, sub }) => {
  let state = seed;
  for (let i = 0; i < steps; i++) state = randStep(state);
  return { id, title, func: 0x4a, sub, mem: [[0x696, seed]], expect: [[0x696, state]] };
});

const divCases = [[100, 7], [0x1234, 0x56], [65535, 1], [0, 5], [255, 255], [40000, 200]].map(([dividend, divisor]) => {
  const quotient = Math.floor(dividend / divisor);
  return {
    id: `p09.div16.${dividend}-${divisor}`,
    title: `$4B ${dividend} ÷ ${divisor}`,
    func: 0x4b,
    mem: [[0x69a, [dividend & 0xff, dividend >> 8, divisor]], [0x640, [0xaa]]],
    expect: [[0x69a, [quotient & 0xff, quotient >> 8, dividend % divisor]], [0x640, [0]]],
  };
});

const timeCases = [[12, 34, 56], [0, 0, 0], [23, 59, 59], [7, 8, 9]].map(([h, m, s]) => {
  const two = (n) => String(n).padStart(2, '0');
  return { id: `p09.time.${two(h)}${two(m)}${two(s)}`, title: `$4C ${two(h)}:${two(m)}:${two(s)}`, func: 0x4c, mem: [[0x69a, [h, m, s]]], expect: [[0x6aa, ascii(`${two(h)}:${two(m)}:${two(s)}`)]] };
});

const parseCases = [[' ', '3.5', 3.5], ['-', '100.125', -100.125], [' ', '0.25', 0.25], [' ', '123.456', 123.456], [' ', '0.001', 0.001], [' ', '99999.5', 99999.5]].map(([sign, text, value]) => ({
  id: `p09.str2num.${text}${sign === '-' ? '.neg' : ''}`,
  title: `$4D 字符串 "${sign}${text}" 转浮点数`,
  func: 0x4d,
  mem: [[0x69a, ascii(sign + text.padEnd(13, ' '))]],
  read: [[0x6a8, 7]],
  check: (result) => {
    const got = decodeFloat(result.memory.get(0x6a8));
    return nearlyEqual(got, value, 1e-6) ? [] : [`解码值 ${got}，预期 ${value}（原始 ${hex(result.memory.get(0x6a8))}）`];
  },
}));

const formatCases = [
  { id: 'p09.num2str.1_5', title: '$4E 1.5 转字符串', value: 1.5, text: ' 1.5000000000' },
  { id: 'p09.num2str.neg100', title: '$4E -100.125 转字符串', value: -100.125, text: '-100.125000000' },
  { id: 'p09.num2str.quarter', title: '$4E 0.25（尾数未规格化）转字符串', raw: [0x00, 0x00, 0x40, 0, 0, 0, 0], text: ' 0.25000000000' },
  { id: 'p09.num2str.zero', title: '$4E 0 转字符串', raw: [0, 0, 0, 0, 0, 0, 0], text: ' 0.00000000000' },
].map(({ id, title, value, raw, text }) => ({
  id,
  title,
  func: 0x4e,
  mem: [[0x6a8, raw ?? encodeFloat(value)]],
  expect: [[0x69a, ascii(text)]],
}));

const pairs = [[3.5, 2], [0.1, 0.2], [-7.25, 3], [1000, 0.001], [123.5, -4.5], [1, 3]];
const arithmetic = [
  { name: 'mul', func: 0x4f, label: '乘', op: (a, b) => a * b },
  { name: 'div', func: 0x50, label: '除', op: (a, b) => a / b },
  { name: 'add', func: 0x51, label: '加', op: (a, b) => a + b },
  { name: 'sub', func: 0x52, label: '减', op: (a, b) => a - b },
];
const arithmeticCases = arithmetic.flatMap(({ name, func, label, op }) => pairs.map(([a, b]) => ({
  id: `p09.fp.${name}.${a}_${b}`,
  title: `$${func.toString(16).toUpperCase()} 浮点${label}：${a} 与 ${b}`,
  func,
  mem: [[0x69a, encodeFloat(a)], [0x6a1, encodeFloat(b)]],
  read: [[0x6a8, 7]],
  check: (result) => {
    const got = decodeFloat(result.memory.get(0x6a8));
    const want = op(a, b);
    const problems = nearlyEqual(got, want) ? [] : [`解码值 ${got}，预期 ${want}（原始 ${hex(result.memory.get(0x6a8))}）`];
    // 0.1（阶码 -3）乘 0.2（阶码 -2）得 0.02：输入与结果的阶码都是负数（字节 $80 以上），按有符号字节解码才与数值一致
    if (name === 'mul' && a === 0.1 && b === 0.2 && result.memory.get(0x6a8)[0] < 0x80) problems.push(`0.1 乘 0.2 的阶码字节为 ${hex(result.memory.get(0x6a8).subarray(0, 1))}，预期是负阶码（$80 以上）`);
    return problems;
  },
})));

export const cases = [...randCases, ...divCases, ...timeCases, ...parseCases, ...formatCases, ...arithmeticCases];
