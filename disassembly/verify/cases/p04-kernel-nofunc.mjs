// ------------------------------------------------------------------------
// 名称：p04-kernel-nofunc.mjs
// 说明：没有处理例程的功能号的验证用例：ROM 表里指向“未实现”桩例程（NOP、NOP、RTS）的 23 个功能号，以及大于 $81 的功能号，调用后都直接返回。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值来自分发器（bios/src/kernel/syscall-dispatch.asm 的 SYSCALL_DISPATCH）：调用开头把 $0640 清 0，之后桩例程什么都不做、大于 $81 的功能号直接走返回；
//       返回时由 SYSCALL_RETURN 恢复窗口页并弹出 P、A、X、Y，所以显示参数区（$0646-$0654）与寄存器都不变。
//       页组入口内联表之外的功能号（$49、$55-$58、$62-$64）读到的是代码字节拼成的地址，不是例程，不调用，依据见 test/dispatch-real.test.mjs。
// ------------------------------------------------------------------------
import { existsSync, readFileSync } from 'node:fs';
import { BIOS_ROM } from '../../tools/config.mjs';
import { buildDispatchMap } from '../../tools/dispatch-map.mjs';

const CANARY = Array.from({ length: 15 }, (_, i) => 0xa0 + i);
const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const stubs = existsSync(BIOS_ROM) ? buildDispatchMap(new Uint8Array(readFileSync(BIOS_ROM)).subarray(16)).filter((entry) => entry.stub).map((entry) => entry.fn) : [];
const beyond = [0x82, 0x83, 0x90, 0xa5, 0xff];

const returnCase = (fn, kind) => ({
  id: `nofunc.${hexName(fn)}`,
  title: `$${hexName(fn)}（${kind}）调用后直接返回：$0640 清 0，显示参数区 $0646-$0654 与 A、X、Y 都不变`,
  func: fn,
  sub: 0x07,
  a: 0x12,
  x: 0x34,
  y: 0x56,
  mem: [[0x640, [0x55]], [0x646, CANARY]],
  expect: [[0x640, [0]], [0x646, CANARY]],
  maxFrames: 30,
  check: (result) => {
    const problems = [];
    const [a, x, y] = ['a', 'x', 'y'].map((name) => parseInt(result.regs[name], 16));
    if (a !== 0x12 || x !== 0x34 || y !== 0x56) problems.push(`A、X、Y 为 ${hexName(a)}、${hexName(x)}、${hexName(y)}，预期 12、34、56`);
    return problems;
  },
});

export const cases = [...stubs.map((fn) => returnCase(fn, '指向未实现桩例程')), ...beyond.map((fn) => returnCase(fn, '大于 $81'))];
