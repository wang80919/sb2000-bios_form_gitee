// ------------------------------------------------------------------------
// 名称：p09-line-int.mjs
// 说明：页 09 的 $53（直线步进）与 $54（3 字节整数运算：加、减、乘、除）的验证用例。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：$53 的预期值按 bios/src/math/math-library.asm（$8D7A-$8F21）的布雷森汉姆步进写成模型，逐字节核对 18 字节参数块；
//       $54 的整数运算预期值来自独立的整数算术（BigInt），符号字节只取 $00（正）与 $FF（负），3 字节数高位在前（$069B-$069D、$069F-$06A1），结果符号在 $06A2、进位在 $06A3、结果在 $06A4 起。
//       乘法 48 位结果在 $06A3-$06A8，除法的商在 $06A4-$06A6、余数在 $06A7-$06A9、符号在 $06A3（除数为 0 时 $06A2 为 $FF）。
// ------------------------------------------------------------------------
const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const BLOCK = 0x0740;
const BLOCK_LENGTH = 0x12;

// ---- $53：按参数块模拟 ----
/** 参数块 0-3 为起点与终点（x0、y0、x1、y1），4 为本次前进的步数（0 按 256 步），返回执行后的 18 字节 */
function stepModel(input) {
  const b = [...input];
  b[0x10] = b[0];
  b[0x11] = b[1];
  const dx = b[2] - b[0];
  if (dx >= 0) { b[5] = dx; b[7] = 1; } else { b[5] = -dx & 0xff; b[7] = 0xff; }
  const dy = b[3] - b[1];
  if (dy >= 0) { b[6] = dy; b[8] = 1; } else { b[6] = -dy & 0xff; b[8] = 0xff; }
  b[0x0f] = 1;
  if (b[5] < b[6]) {
    [b[5], b[6]] = [b[6], b[5]];
    [b[7], b[8]] = [b[8], b[7]];
    [b[0x10], b[0x11]] = [b[0x11], b[0x10]];
    b[0x0f] = 0;
  }
  if (b[4] >= b[5]) {
    b[0] = b[2];
    b[1] = b[3];
    return b;
  }
  let error = (b[6] << 1) & 0xffff;
  b[9] = error & 0xff;
  b[0x0a] = error >> 8;
  b[0x0d] = b[9];
  b[0x0e] = b[0x0a];
  error = (error - b[5]) & 0xffff;
  const down = (((b[6] - b[5]) & 0xffff) << 1) & 0xffff;
  b[0x0b] = down & 0xff;
  b[0x0c] = down >> 8;
  const double = b[0x0d] | (b[0x0e] << 8);
  let steps = b[4] === 0 ? 256 : b[4];
  while (steps-- > 0) {
    b[0x10] = (b[0x10] + b[7]) & 0xff;
    if ((error & 0x8000) !== 0) error = (error + double) & 0xffff;
    else {
      b[0x11] = (b[0x11] + b[8]) & 0xff;
      error = (error + down) & 0xffff;
    }
  }
  b[9] = error & 0xff;
  b[0x0a] = error >> 8;
  if (b[0x0f] !== 0) { b[0] = b[0x10]; b[1] = b[0x11]; } else { b[1] = b[0x10]; b[0] = b[0x11]; }
  return b;
}

const stepCase = ([x0, y0, x1, y1, steps]) => {
  const input = [x0, y0, x1, y1, steps, ...new Array(BLOCK_LENGTH - 5).fill(0xaa)];
  const want = stepModel(input);
  return {
    id: `p09.line.${x0}-${y0}.${x1}-${y1}.n${steps}`,
    title: `$53 从 (${x0}, ${y0}) 向 (${x1}, ${y1}) 前进 ${steps} 步，落点 (${want[0]}, ${want[1]})`,
    func: 0x53,
    mem: [[0x08, [BLOCK & 0xff, BLOCK >> 8]], [BLOCK, input]],
    expect: [[BLOCK, want]],
  };
};
const lineInputs = [
  [10, 10, 50, 20, 1], [10, 10, 50, 20, 5], [10, 10, 50, 20, 20], [10, 10, 50, 20, 39], [10, 10, 50, 20, 40], [10, 10, 50, 20, 100],
  [50, 20, 10, 10, 7], [50, 10, 10, 20, 13], [10, 20, 50, 10, 13],
  [10, 10, 20, 50, 1], [10, 10, 20, 50, 17], [20, 50, 10, 10, 17], [10, 50, 20, 10, 23], [50, 10, 10, 50, 11],
  [0, 0, 100, 100, 30], [100, 100, 0, 0, 30], [0, 100, 100, 0, 64], [5, 5, 5, 5, 3], [5, 5, 5, 5, 0], [5, 5, 40, 5, 12], [5, 5, 5, 40, 12],
  [0, 0, 255, 128, 100], [255, 128, 0, 0, 200], [0, 0, 200, 3, 0], [0, 0, 3, 200, 0], [0, 0, 255, 255, 254], [0, 0, 1, 255, 77],
  [30, 30, 33, 31, 2], [30, 30, 31, 33, 2], [128, 127, 129, 200, 50],
];
const lineCases = lineInputs.map(stepCase);

// ---- $54：3 字节整数运算 ----
const toBytes3 = (input) => {
  const value = BigInt(input);
  return [Number((value >> 16n) & 0xffn), Number((value >> 8n) & 0xffn), Number(value & 0xffn)];
};
const signByte = (negative) => (negative ? 0xff : 0x00);
const RESULT_JUNK = new Array(9).fill(0xee); // $06A2-$06AA

/** 一个整数运算用例：negativeA、negativeB 为两个数的符号，result 为 { reads, expect } 的模型输出 */
const intCase = (sub, a, negativeA, b, negativeB, extraTitle = '') => {
  const aBytes = toBytes3(a);
  const bBytes = toBytes3(b);
  const memory = [[0x69a, [signByte(negativeA), ...aBytes]], [0x69e, [signByte(negativeB), ...bBytes]], [0x6a2, RESULT_JUNK]];
  const base = {
    id: `p09.int.${sub}.${negativeA ? 'n' : 'p'}${a}.${negativeB ? 'n' : 'p'}${b}`,
    title: `$54/${sub} ${negativeA ? '-' : ''}${a} 与 ${negativeB ? '-' : ''}${b}${extraTitle}`,
    func: 0x54,
    sub,
    mem: memory,
  };
  if (sub === 0 || sub === 1) {
    const secondNegative = sub === 1 ? !negativeB : negativeB;
    // 符号相同做加法（进位放 $06A3），不同则大数减小数（结果符号取大数的符号，相等时全 0）
    let sign = 0;
    let carry = 0;
    let magnitude = 0n;
    if (negativeA === secondNegative) {
      const sum = BigInt(a) + BigInt(b);
      magnitude = sum & 0xffffffn;
      carry = sum > 0xffffffn ? 1 : 0;
      sign = signByte(negativeA);
    } else if (a > b) {
      magnitude = BigInt(a - b);
      sign = signByte(negativeA);
    } else if (b > a) {
      magnitude = BigInt(b - a);
      sign = signByte(secondNegative);
    }
    const expect = [[0x6a2, [sign, carry, ...toBytes3(magnitude), 0x00, 0xee]]];
    if (sub === 1) expect.push([0x69e, [signByte(!negativeB)]]);
    return { ...base, expect };
  }
  if (sub === 2) {
    const product = BigInt(a) * BigInt(b);
    const productBytes = [40n, 32n, 24n, 16n, 8n, 0n].map((shift) => Number((product >> shift) & 0xffn));
    return { ...base, expect: [[0x6a2, [signByte(negativeA !== negativeB), ...productBytes, 0xee, 0xee]]] };
  }
  if (b === 0) return { ...base, expect: [[0x6a2, [0xff, 0, 0, 0, 0, 0, 0, 0, 0]]] };
  const quotient = BigInt(a) / BigInt(b);
  const remainder = BigInt(a) % BigInt(b);
  return { ...base, expect: [[0x6a2, [0, signByte(negativeA !== negativeB), ...toBytes3(quotient), ...toBytes3(remainder)]], [0x69a, [signByte(negativeA)]], [0x69e, [signByte(negativeB)]]] };
};

const operands = [[0, 0], [1, 1], [100, 7], [7, 100], [123456, 789], [0xffffff, 1], [0xffffff, 0xffffff], [0x800000, 0x800000], [0x010000, 0x0100], [50000, 50000], [1000, 1000], [0, 77], [77, 0], [0x7fffff, 3], [255, 256]];
const signs = [[false, false], [true, false], [false, true], [true, true]];
const addCases = [0, 1].flatMap((sub) => operands.flatMap(([a, b]) => signs.map(([sa, sb]) => intCase(sub, a, sa, b, sb))));
const mulOperands = [[0, 0], [1, 1], [100, 7], [123456, 789], [0xffffff, 0xffffff], [0xffffff, 1], [0x800000, 2], [0x010000, 0x010000], [255, 255], [65535, 65537]];
const mulCases = mulOperands.flatMap(([a, b]) => [[false, false], [true, false], [true, true]].map(([sa, sb]) => intCase(2, a, sa, b, sb)));
const divOperands = [[100, 7], [7, 100], [123456, 789], [1000, 10], [0xffffff, 1], [0xffffff, 0xffffff], [0x800000, 3], [65535, 255], [1, 1], [0, 5], [99, 0], [0xffffff, 0], [1000000, 999], [5000000, 12345], [16777215, 4096]];
const divCases = divOperands.flatMap(([a, b]) => [[false, false], [true, false], [true, true]].map(([sa, sb]) => intCase(3, a, sa, b, sb)));
const outOfRange = [4, 5, 0xff].map((sub) => ({
  id: `p09.int.sub${hexName(sub)}`,
  title: `$54/$${hexName(sub)} 子功能超出 0-3：什么都不做`,
  func: 0x54,
  sub,
  mem: [[0x69a, [0, 0, 0, 5, 0, 0, 0, 7]], [0x6a2, RESULT_JUNK]],
  expect: [[0x6a2, RESULT_JUNK], [0x69a, [0, 0, 0, 5, 0, 0, 0, 7]]],
}));

export const cases = [...lineCases, ...addCases, ...mulCases, ...divCases, ...outOfRange];
