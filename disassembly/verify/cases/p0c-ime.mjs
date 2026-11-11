// ------------------------------------------------------------------------
// 名称：p0c-ime.mjs
// 说明：中文输入法（功能 $6D）中算法清楚的子功能的验证用例：$0E 把两字节内码转成 4 个小写十六进制字符，$0D 把区位码或十六进制内码转成 GB2312 内码，$02/$08 设置与取回状态。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值来自 GB2312 的区位码规则（内码 = 区号 + $A0、位号 + $A0）与十六进制书写规则；按键处理与候选字查找依赖还没解读的码表，这里只跑到不校验。
//       空区位码（0000、0001）BIOS 不拒绝，输出含 $A0 的值，不是规范行为，不写进预期。
// ------------------------------------------------------------------------
const ascii = (text) => [...text].map((c) => c.charCodeAt(0));
const hex4 = (a, b) => [...(a.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0'))].map((c) => c.charCodeAt(0));

/** $6D/$0E：两字节内码 → 4 个小写十六进制字符，放 ERAM $6923 起 */
const hexCases = [[0xb0, 0xa1], [0xa1, 0x23], [0xd7, 0xf9], [0x00, 0x0f], [0xff, 0xfe]].map(([a, b]) => ({
  id: `ime.hex.${a.toString(16)}${b.toString(16)}`,
  title: `$6D/$0E 内码 $${a.toString(16).toUpperCase().padStart(2, '0')}${b.toString(16).toUpperCase().padStart(2, '0')} → 十六进制字符`,
  func: 0x6d,
  sub: 0x0e,
  mem: [[0x64a, [a, b]]],
  expect: [[0x6923, hex4(a, b)]],
  maxFrames: 60,
}));

/** $6D/$0D：输入缓冲里的 4 个字符 → 内码。全是数字按区位码，首字符是 a-f 按十六进制，其他不合法 */
const parseCases = [
  { text: '1601', want: [0xb0, 0xa1], note: '区位码 16 区 01 位（啊）' },
  { text: '1001', want: [0xaa, 0xa1], note: '区位码 10 区 01 位' },
  { text: '5589', want: [0xd7, 0xf9], note: '区位码 55 区 89 位' },
  { text: '8794', want: [0xf7, 0xfe], note: '区位码 87 区 94 位（GB2312 的最后一个字）' },
  { text: 'b0a1', want: [0xb0, 0xa1], note: '十六进制内码 b0a1' },
  { text: 'a123', want: [0xa1, 0x23], note: '十六进制内码 a123' },
  { text: 'xxxx', want: [0x00, 0x00], note: '不合法，$064A 清 0' },
].map(({ text, want, note }) => ({
  id: `ime.parse.${text}`,
  title: `$6D/$0D 输入 "${text}"：${note}`,
  func: 0x6d,
  sub: 0x0d,
  mem: [[0x6904, [4]], [0x6905, ascii(text)], [0x64a, [0, 0]]],
  expect: [[0x64a, want]],
  maxFrames: 60,
}));

/** $6D/$02 设置状态、$6D/$08 取回状态：$0652 原样存取，$0653 只保留低 7 位 */
const stateCase = {
  id: 'ime.state.set-get',
  title: '$6D/$02 设置状态（$0652=5、$0653=$C1），ERAM $6901=5、$6902=$41；$6D/$08 取回 $0652=5、$0653=$41',
  steps: [
    { func: 0x6d, sub: 0x02, mem: [[0x652, [5]], [0x653, [0xc1]]], expect: [[0x6901, [5]]], read: [[0x6902, 1]], check: (result) => ((result.memory.get(0x6902)[0] & 0x7f) === 0x41 ? [] : ['$6902 低 7 位预期 $41'])},
    { func: 0x6d, sub: 0x08, mem: [[0x652, [0]], [0x653, [0]]], expect: [[0x652, [5]], [0x653, [0x41]]] },
  ],
};

export const cases = [...hexCases, ...parseCases, stateCase];
