// ------------------------------------------------------------------------
// 名称：p09-decimal.mjs
// 说明：页 09 十进制与定点转换（功能 $4D、$4E 的子功能 1、2，$4F、$50 的子功能非 0）的验证用例：40 位二进制数与十进制字符串互转，浮点运算结果转 40.40 定点数。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值来自独立的整数与小数算术（BigInt）。$4E/1 把 $06AF-$06B3 的 40 位整数（高字节在前）转成 13 位十进制数字放在 $069B-$06A7，
//       $069A 是去掉前导 0 后的有效位数，数字左对齐、右边补字符 0，大于等于 10^12 时 $0640 为 $FF；$06A8 为负时先把 $06AA-$06AE 的尾数右移相应位数；
//       $4E/2 把 $06AF-$06B3 的 40 位小数（值 = 数 ÷ 2^40）从 $069A+X（X 取 $069A 的低 4 位）起转成十进制小数位，每位取整后余数再乘 10；
//       $4D/1 把 $069B 起的 n 位十进制数字（n 为 $069A 的低 4 位，前导空格当 0）转成 40 位整数放 $06AA-$06AE。
// ------------------------------------------------------------------------
const toBytes5 = (value) => [32n, 24n, 16n, 8n, 0n].map((shift) => Number((BigInt(value) >> shift) & 0xffn));
const ascii = (text) => [...text].map((c) => c.charCodeAt(0));
const JUNK = new Array(14).fill(0xee); // $069A-$06A7

/** $4E/1 的字符串模型：返回 $069A-$06A7 的 14 字节 */
function binaryToDecimal(value) {
  const full = BigInt(value);
  const digits = full.toString().padStart(13, '0').split('').map(Number);
  let length = 12;
  for (let index = 1; index < 13 && digits[index] === 0; index++) length--;
  if (length === 0) length = 1;
  const significant = digits.slice(13 - length);
  const out = [...significant, ...new Array(13 - length).fill(0)];
  return [length, ...out.map((d) => 0x30 | d)];
}

const decimalCases = [0n, 1n, 9n, 10n, 99n, 100n, 12345n, 1000000n, 123456789n, 999999999999n, 100000000000n, 500000000000n, 1000000000000n, 1099511627775n, 4294967296n, 65535n]
  .map((value) => {
    const overflow = value >= 10n ** 12n;
    return {
      id: `p09.bin2dec.${value}`,
      title: `$4E/1 把 40 位整数 ${value} 转成十进制字符串${overflow ? '（超过 12 位，$0640 置 $FF）' : ''}`,
      func: 0x4e,
      sub: 1,
      mem: [[0x69a, JUNK], [0x6a8, [0]], [0x6af, toBytes5(value)], [0x640, [0xaa]]],
      expect: [[0x69a, binaryToDecimal(value)], [0x6af, toBytes5(value % 10n)], [0x640, [overflow ? 0xff : 0]]],
    };
  });

// $06A8 为负时先把 $06AA-$06AE 右移 |$06A8| 位并清 $06A8（与 $06AF-$06B3 无关）
const denormalizeCases = [[0xff, 1n << 39n], [0xfe, 0x123456789an], [0xf8, 0xffffffffffn], [0xd8, 0x8000000001n], [0xd7, 0x8000000000n]].map(([exponent, mantissa]) => {
  const shift = BigInt(256 - exponent);
  return {
    id: `p09.bin2dec.denorm.${exponent.toString(16)}`,
    title: `$4E/1 指数 $${exponent.toString(16).toUpperCase()}：尾数 $${mantissa.toString(16).toUpperCase()} 右移 ${shift} 位`,
    func: 0x4e,
    sub: 1,
    mem: [[0x69a, JUNK], [0x6a8, [exponent]], [0x6aa, toBytes5(mantissa)], [0x6af, toBytes5(12345n)], [0x640, [0xaa]]],
    expect: [[0x6a8, [0]], [0x6aa, toBytes5(mantissa >> shift)], [0x69a, binaryToDecimal(12345n)]],
  };
});

/** $4E/2：从 $069A+start 起生成十进制小数位，每位 = 余数 × 10 的整数部分 */
function fractionToDigits(fraction, start) {
  let remainder = BigInt(fraction);
  const digits = [];
  for (let index = start; index < 14; index++) {
    remainder *= 10n;
    digits.push(0x30 | Number(remainder >> 40n));
    remainder &= (1n << 40n) - 1n;
  }
  return { digits, remainder };
}
const fractionCases = [[1n << 39n, 1], [1n << 38n, 1], [0n, 1], [(1n << 40n) - 1n, 1], [0x3333333333n, 1], [1n << 39n, 5], [0x123456789an, 3], [(1n << 40n) / 3n, 1], [1n << 36n, 8]].map(([fraction, start]) => {
  const { digits, remainder } = fractionToDigits(fraction, start);
  return {
    id: `p09.frac2dec.${fraction.toString(16)}.s${start}`,
    title: `$4E/2 小数 $${fraction.toString(16).toUpperCase()} ÷ 2^40，从第 ${start} 位起生成 ${digits.length} 位`,
    func: 0x4e,
    sub: 2,
    mem: [[0x69a, [start, ...new Array(13).fill(0xee)]], [0x6a8, [0]], [0x6af, toBytes5(fraction)], [0x640, [0xaa]]],
    expect: [[0x69a, [start]], [0x69a + start, digits], [0x6af, toBytes5(remainder)], [0x640, [0]]],
  };
});
const noWorkCase = {
  id: 'p09.frac2dec.start-14',
  title: '$4E/2 起始位置不小于 14：不转换',
  func: 0x4e,
  sub: 2,
  mem: [[0x69a, [0x0e, ...new Array(13).fill(0xee)]], [0x6a8, [0]], [0x6af, toBytes5(12345n)]],
  expect: [[0x69a, [0x0e, ...new Array(13).fill(0xee)]], [0x6af, toBytes5(12345n)]],
};

// ---- $4D/1：十进制数字串转 40 位整数 ----
const parseCases = [['5', 1], ['12345', 5], ['0007', 4], ['  42', 4], ['9999999999999', 13], ['1000000000000', 13], ['   ', 3], ['', 0], ['1099511627775', 13]].map(([text, count]) => {
  const value = text.trim() === '' ? 0n : BigInt(text.trim());
  const mod = value & ((1n << 40n) - 1n);
  return {
    id: `p09.dec2bin.${JSON.stringify(text)}`,
    title: `$4D/1 十进制串 "${text}"（${count} 位）转 40 位整数 ${value}`,
    func: 0x4d,
    sub: 1,
    mem: [[0x69a, [count, ...ascii(text.padEnd(13, ' '))]], [0x6aa, new Array(6).fill(0xee)], [0x640, [0xaa]]],
    expect: [[0x6aa, toBytes5(mod)], [0x640, [0]]],
  };
});

// ---- $4D/2：小数点后的 n 位十进制串（前面是小数点，n 为 $069A 的低 4 位）转 40 位小数，结果在 $06AF-$06B3，$06AA-$06AE 保持原值 ----
const fixedCases = [['5', 1], ['25', 2], ['5000', 4], ['3', 1], ['123456789012', 12], ['999999999999', 12], ['000000000001', 12], ['0', 1], ['1', 1], ['75', 2], ['0625', 4], ['333333', 6]].map(([digits, count]) => {
  const padded = digits.padEnd(12, '0').slice(0, 12);
  const want = (BigInt(padded) << 40n) / 10n ** 12n;
  return {
    id: `p09.dec2frac.${digits}`,
    title: `$4D/2 小数串 ".${digits}" 转 40 位小数 $${want.toString(16).toUpperCase()}`,
    func: 0x4d,
    sub: 2,
    mem: [[0x69a, [count, ...ascii('.'), ...ascii(digits.padEnd(12, ' '))]], [0x6aa, [1, 2, 3, 4, 5]], [0x6af, new Array(5).fill(0xee)], [0x640, [0xaa]]],
    expect: [[0x6af, toBytes5(want)], [0x6aa, [1, 2, 3, 4, 5]], [0x69a, [0x0c, ...new Array(13).fill(0)]], [0x640, [0]]],
  };
});

// ---- $4F/$50 子功能不为 0：两个操作数的阶码都置为（子功能高 4 位右移一位）、符号置正，运算后把结果右移成 40.40 定点数放 $06AA-$06B3 ----
const fromBytes = (bytes) => bytes.reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);
const mantissas = [[0x8000000000n, 0xc000000000n], [0xc000000000n, 0xa000000000n], [0xb504f333f9n, 0x9234567890n], [0xffffffffffn, 0xffffffffffn], [0x8000000001n, 0xfffffffffen]];
const fixedOperation = ({ func, label, subs, exact }) => subs.flatMap((sub) => mantissas.map(([ma, mb]) => {
  const exponent = (sub & 0xf0) >> 1;
  const want = exact(ma, mb, exponent);
  const tolerance = want >> 36n > 4n ? want >> 36n : 4n;
  return {
    id: `p09.fixed.${label}.${sub.toString(16)}.${ma.toString(16)}-${mb.toString(16)}`,
    title: `$${func.toString(16).toUpperCase()}/$${sub.toString(16).toUpperCase().padStart(2, '0')} 尾数 $${ma.toString(16).toUpperCase()} 与 $${mb.toString(16).toUpperCase()}（阶码 ${exponent}）运算后转 40.40 定点数`,
    func,
    sub,
    mem: [[0x69a, [0x55, 0x55, ...toBytes5(ma)]], [0x6a1, [0x55, 0x55, ...toBytes5(mb)]], [0x640, [0xaa]]],
    read: [[0x6aa, 10], [0x640, 1]],
    check: (result) => {
      const got = fromBytes(result.memory.get(0x6aa));
      const problems = [];
      const difference = got > want ? got - want : want - got;
      if (difference > tolerance) problems.push(`定点结果 $${got.toString(16)}，预期 $${want.toString(16)}（允许误差 ${tolerance}）`);
      if (result.memory.get(0x640)[0] !== 0) problems.push(`$0640 为 ${result.memory.get(0x640)[0]}，预期 0`);
      return problems;
    },
  };
}));
const fixedMulCases = fixedOperation({ func: 0x4f, label: 'mul', subs: [0x01, 0x10, 0x20], exact: (ma, mb, e) => (ma * mb * (1n << BigInt(2 * e))) >> 40n });
const fixedDivCases = fixedOperation({ func: 0x50, label: 'div', subs: [0x01, 0x10, 0x40, 0x70, 0xf0], exact: (ma, mb) => (ma << 40n) / mb });
const fixedDivZero = {
  id: 'p09.fixed.div.zero-divisor',
  title: '$50/$10 除数尾数为 0：$06A8 置 $80，$0640 置 $80',
  func: 0x50,
  sub: 0x10,
  mem: [[0x69a, [0x55, 0x55, ...toBytes5(0xc000000000n)]], [0x6a1, [0x55, 0x55, 0, 0, 0, 0, 0]], [0x640, [0xaa]]],
  expect: [[0x640, [0x80]], [0x6a8, [0x80]]],
};
const floatDivZero = {
  id: 'p09.fp.div.zero-divisor',
  title: '$50/0 除数尾数为 0：$06A8 置 $80',
  func: 0x50,
  sub: 0,
  mem: [[0x69a, [0x02, 0x00, ...toBytes5(0xc000000000n)]], [0x6a1, [0x01, 0x00, 0, 0, 0, 0, 0]]],
  expect: [[0x6a8, [0x80]]],
};

export const cases = [...decimalCases, ...denormalizeCases, ...fractionCases, noWorkCase, ...parseCases, ...fixedCases, ...fixedMulCases, ...fixedDivCases, fixedDivZero, floatDivZero];
