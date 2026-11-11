// ------------------------------------------------------------------------
// 名称：p04-kernel-far.mjs
// 说明：内核跨页内存服务 $24、$26、$27、$28、$29、$2A、$2B、$2C 的验证用例：远指针读写、窗口地址与远指针换算、窗口映射影子、跳转到页组。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值按 bios/src/kernel/far-memory.asm（$ED29-$EE75）的代码阅读写成公式；扩展 RAM 页 $80 起对应 PRAM 偏移 (页号 - $80) × 4096，先用 write pram 写入测试数据再读写；
//       窗口影子 $0639-$063C 在系统调用返回时写回 $4040-$4043，所以用返回后影子的值核对映射。
// ------------------------------------------------------------------------
import { runCall } from '../../tools/rom-driver.mjs';

const SYS_PAGE = 0x641;
const GROUP = 0x642;
const FAR_OFFSET = 0x14;
const BYTE_0653 = 0x653;
const SHADOWS = 0x639;
const PROG_ENTRY = 0x0c;
const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const pramOffset = (page) => (page - 0x80) * 0x1000;
const hexBytes = (bytes) => [...bytes].map(hexName).join('');

/** 测试数据：页 $80、$81 的开头与页尾放可区分的字节 */
const PAGE_80 = Array.from({ length: 0x20 }, (_, i) => 0xa0 + i);
const PAGE_81 = Array.from({ length: 0x20 }, (_, i) => 0xc0 + i);

/** 先把测试数据写进扩展 RAM 页 $80、$81，再调用；页 $80 的末尾 2 字节是 $E1 $E2 */
const preparePram = async (client) => {
  await client.send(`write pram ${pramOffset(0x80).toString(16)} ${hexBytes(PAGE_80)}`);
  await client.send(`write pram ${(pramOffset(0x80) + 0xffe).toString(16)} e1e2`);
  await client.send(`write pram ${pramOffset(0x81).toString(16)} ${hexBytes(PAGE_81)}`);
};

/** $24 读：页 page、偏移 offset 处读一个字节到 $0653，指针后移，越过页尾时页号加 1、偏移回 0 */
const readCase = (id, title, page, offset, want, nextPage, nextOffset) => ({
  id,
  title,
  fresh: false,
  steps: [
    { host: async (client) => { await preparePram(client); return runCall(client, { func: 0x24, sub: 0, mem: [[SYS_PAGE, [page]], [FAR_OFFSET, [offset & 0xff, offset >> 8]], [BYTE_0653, [0]]], read: [[SYS_PAGE, 1], [FAR_OFFSET, 2], [BYTE_0653, 1]], maxFrames: 30 }); },
      check: ({ data: result }) => {
        const problems = [];
        const got = result.memory.get(BYTE_0653)[0];
        const [lo, hi] = result.memory.get(FAR_OFFSET);
        const nextPageGot = result.memory.get(SYS_PAGE)[0];
        if (got !== want) problems.push(`$0653 为 ${hexName(got)}，预期 ${hexName(want)}`);
        if (nextPageGot !== nextPage || lo + hi * 256 !== nextOffset) problems.push(`指针为 页 ${hexName(nextPageGot)} 偏移 ${(lo + hi * 256).toString(16)}，预期 页 ${hexName(nextPage)} 偏移 ${nextOffset.toString(16)}`);
        return problems;
      } },
  ],
});

/** $2B 写：把 $0653 写到页 page、偏移 offset，指针后移 */
const writeCase = (id, title, page, offset, value, nextPage, nextOffset) => ({
  id,
  title,
  steps: [
    { host: async (client) => { await preparePram(client); return runCall(client, { func: 0x2b, sub: 0, mem: [[SYS_PAGE, [page]], [FAR_OFFSET, [offset & 0xff, offset >> 8]], [BYTE_0653, [value]]], read: [[SYS_PAGE, 1], [FAR_OFFSET, 2]], readPram: [[pramOffset(page) + offset, 1]], maxFrames: 30 }); },
      check: ({ data: result }) => {
        const problems = [];
        const stored = result.pram.get(pramOffset(page) + offset)[0];
        const [lo, hi] = result.memory.get(FAR_OFFSET);
        const nextPageGot = result.memory.get(SYS_PAGE)[0];
        if (stored !== value) problems.push(`扩展 RAM 页 ${hexName(page)} 偏移 ${offset.toString(16)} 处为 ${hexName(stored)}，预期 ${hexName(value)}`);
        if (nextPageGot !== nextPage || lo + hi * 256 !== nextOffset) problems.push(`指针为 页 ${hexName(nextPageGot)} 偏移 ${(lo + hi * 256).toString(16)}，预期 页 ${hexName(nextPage)} 偏移 ${nextOffset.toString(16)}`);
        return problems;
      } },
  ],
});

const readCases = [
  readCase('far.24.read-start', '$24：读页 $80 偏移 $000，得 $A0，指针到偏移 $001', 0x80, 0x000, 0xa0, 0x80, 0x001),
  readCase('far.24.read-middle', '$24：读页 $80 偏移 $00A，得 $AA，指针到偏移 $00B', 0x80, 0x00a, 0xaa, 0x80, 0x00b),
  readCase('far.24.read-other-page', '$24：读页 $81 偏移 $005，得 $C5，指针到偏移 $006', 0x81, 0x005, 0xc5, 0x81, 0x006),
  readCase('far.24.read-low-carry', '$24：读页 $80 偏移 $0FE（低字节进位前）', 0x80, 0x0fe, 0x00, 0x80, 0x0ff),
  readCase('far.24.read-page-end', '$24：读页 $80 最后一个字节（偏移 $FFF），得 $E2，指针进到页 $81 偏移 0', 0x80, 0xfff, 0xe2, 0x81, 0x000),
  readCase('far.24.read-before-end', '$24：读页 $80 偏移 $FFE，得 $E1，指针到偏移 $FFF', 0x80, 0xffe, 0xe1, 0x80, 0xfff),
];
const writeCases = [
  writeCase('far.2b.write-start', '$2B：把 $77 写到页 $80 偏移 $020，指针到偏移 $021', 0x80, 0x020, 0x77, 0x80, 0x021),
  writeCase('far.2b.write-other-page', '$2B：把 $5E 写到页 $81 偏移 $100，指针到偏移 $101', 0x81, 0x100, 0x5e, 0x81, 0x101),
  writeCase('far.2b.write-page-end', '$2B：把 $9C 写到页 $80 偏移 $FFF，指针进到页 $81 偏移 0', 0x80, 0xfff, 0x9c, 0x81, 0x000),
];

/** $2C：PROG_ENTRY 的窗口地址 + 页组 → 远指针；页号 = (高 4 位 - 8) + 页组（高 4 位小于 8 时按 8 位回绕），偏移 = 低 12 位 */
const addrToFar = [[0x8000, 0x80], [0x8123, 0x80], [0x9fff, 0x80], [0xa5c3, 0x20], [0xbfff, 0x84], [0xc000, 0x00], [0xffff, 0x10]].map(([address, group]) => {
  const page = ((address >> 12) - 8 + group) & 0xff;
  const offset = address & 0x0fff;
  return {
    id: `far.2c.${address.toString(16)}-g${hexName(group)}`,
    title: `$2C：窗口地址 $${address.toString(16).toUpperCase()}、页组 $${hexName(group)} → 页 $${hexName(page)}、偏移 $${offset.toString(16).toUpperCase().padStart(3, '0')}`,
    func: 0x2c,
    sub: 0,
    mem: [[PROG_ENTRY, [address & 0xff, address >> 8]], [GROUP, [group]], [SYS_PAGE, [0]], [FAR_OFFSET, [0, 0]]],
    expect: [[SYS_PAGE, [page]], [FAR_OFFSET, [offset & 0xff, offset >> 8]]],
  };
});

/** $28：页号右移 3 位，页号低 3 位乘 $10 加上 $80 并进位加到远指针偏移高字节：SYS_PAGE ← SYS_PAGE>>3，FAR_OFFSET_HI ← FAR_OFFSET_HI + $80 + (页号 & 7) × $10 + 进位 */
const pageToWindow = [[0x00, 0x00], [0x05, 0x01], [0x0a, 0x10], [0x87, 0x20], [0xff, 0x7f]].map(([page, hi]) => {
  const bits = ((page & 1) << 6) | (((page >> 1) & 1) << 5) | (((page >> 2) & 1) << 4);
  const sum1 = hi + 0x80;
  const newHi = ((sum1 & 0xff) + bits + (sum1 > 0xff ? 1 : 0)) & 0xff;
  return {
    id: `far.28.page${hexName(page)}-hi${hexName(hi)}`,
    title: `$28：页号 $${hexName(page)}、偏移高字节 $${hexName(hi)} → 页号 $${hexName(page >> 3)}、偏移高字节 $${hexName(newHi)}`,
    func: 0x28,
    sub: 0,
    mem: [[SYS_PAGE, [page]], [FAR_OFFSET + 1, [hi]]],
    expect: [[SYS_PAGE, [page >> 3]], [FAR_OFFSET + 1, [newHi]]],
  };
});

/** $29：把页 SYS_PAGE 记入窗口 $0653 的影子，调用返回后这个映射保持（$0639 + 窗口号） */
const mapWindow = [0, 1, 2, 3].map((window) => ({
  id: `far.29.window${window}`,
  title: `$29：把页 $85 映射到窗口 ${window}，返回后 $063${9 + window} 为 $85，其余窗口影子不变`,
  func: 0x29,
  sub: 0,
  mem: [[SHADOWS, [0x10, 0x11, 0x12, 0x13]], [SYS_PAGE, [0x85]], [BYTE_0653, [window]]],
  expect: [[SHADOWS, [0, 1, 2, 3].map((i) => (i === window ? 0x85 : 0x10 + i))]],
}));

/** $27：把窗口影子设成页组 $0642 起的 4 个连续页，返回后保持 */
const mapGroup = [0x80, 0x20].map((group) => ({
  id: `far.27.group${hexName(group)}`,
  title: `$27：页组 $${hexName(group)}，返回后窗口影子 $0639-$063C 为 ${[0, 1, 2, 3].map((i) => `$${hexName(group + i)}`).join(' ')}`,
  func: 0x27,
  sub: 0,
  mem: [[SHADOWS, [0x10, 0x11, 0x12, 0x13]], [GROUP, [group]]],
  expect: [[SHADOWS, [0, 1, 2, 3].map((i) => group + i)]],
}));

/** $2A：把 $0642 写进显存 bank 寄存器 $4300（中断程序也会写，所以只核对第一个值） */
const vramBank = [0x03, 0x0c].map((bank) => ({
  id: `far.2a.bank${hexName(bank)}`,
  title: `$2A：把 $0642=$${hexName(bank)} 写进 $4300`,
  func: 0x2a,
  sub: 0,
  mem: [[GROUP, [bank]]],
  capture: [0x4300],
  check: (result) => {
    const first = (result.writes.get(0x4300) ?? [])[0];
    return first === bank ? [] : [`$4300 第一次写入 ${first === undefined ? '无' : hexName(first)}，预期 ${hexName(bank)}`];
  },
}));

/** $26：映射页组 $0642 后丢掉本次调用的栈帧，跳到 $0C/$0D 的地址，不再回来：目标是 $7F40 的小程序（把 $0700 写成 $5A 后原地循环），栈指针恢复成调用前 */
const jumpBanked = {
  id: 'far.26.jump',
  title: '$26：页组 $80，窗口影子变 $80-$83，栈指针回到调用前的值，跳到 $0C/$0D 的地址 $7F40 并不再返回',
  fresh: true,
  freshAfter: true,
  steps: [{
    host: async (client) => runCall(client, {
      func: 0x26,
      sub: 0,
      mem: [[0x7f40, [0xa9, 0x5a, 0x8d, 0x00, 0x07, 0x4c, 0x45, 0x7f]], [0x700, [0]], [PROG_ENTRY, [0x40, 0x7f]], [GROUP, [0x80]]],
      read: [[0x700, 1], [SHADOWS, 4]],
      maxFrames: 6,
    }),
    check: ({ data: result }) => {
      const problems = [];
      if (parseInt(result.regs.pc, 16) !== 0x7f45) problems.push(`PC 为 ${result.regs.pc}，预期停在 $7F45`);
      if (result.memory.get(0x700)[0] !== 0x5a) problems.push(`$0700 为 ${hexName(result.memory.get(0x700)[0])}，预期 5A（跳到了 $7F40）`);
      if (hexBytes(result.memory.get(SHADOWS)) !== '80818283') problems.push(`窗口影子为 ${hexBytes(result.memory.get(SHADOWS))}，预期 80818283`);
      if (parseInt(result.regs.s, 16) !== 0xe4) problems.push(`栈指针为 ${result.regs.s}，预期 E4（调用前的值）`);
      return problems;
    },
  }],
};

export const cases = [...readCases, ...writeCases, ...addrToFar, ...pageToWindow, ...mapWindow, ...mapGroup, ...vramBank, jumpBanked];
