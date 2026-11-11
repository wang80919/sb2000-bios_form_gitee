// ------------------------------------------------------------------------
// 名称：p04-kernel-ramtable.mjs
// 说明：功能号 $00-$0F 的验证用例：由程序在 RAM 表（$05FA 起，每项 3 字节：页组、地址低字节、地址高字节）里登记处理例程，分发器按表项换入页组并调用。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值来自 bios/src/kernel/syscall-dispatch.asm 的 SYSCALL_DISPATCH（$FD8E-$FDC8）：功能号小于 $10 时取 $05FA + 3×功能号 处的三个字节，页组经窗口映射换入 $8000 起，再调用表项给出的地址；
//       用例把表项登记成页组 $08、地址 $E43E（固定区的 API_15，把 $0636 置 1），调用后核对结果并还原 RAM 表；页组只取了 $08 一个值，其他页组的窗口映射没有逐个核对。
// ------------------------------------------------------------------------
import { runCall } from '../../tools/rom-driver.mjs';
import { withRestore } from '../lib/restore.mjs';

const TABLE = 0x5fa;
const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');

const cases = Array.from({ length: 16 }, (_, fn) => ({
  id: `ramtable.${hexName(fn)}`,
  title: `$${hexName(fn)}：RAM 表项（$${(TABLE + 3 * fn).toString(16).toUpperCase()}）登记成页组 $08、地址 $E43E，调用后 $0636 被置 1，$0640 为 0，其余表项不受影响`,
  steps: [{
    host: (client) => withRestore(client, [[TABLE, 48], [0x636, 1], [0x640, 1]], async () => {
      const result = await runCall(client, { func: fn, sub: 0, mem: [[TABLE + 3 * fn, [0x08, 0x3e, 0xe4]], [0x636, [0]], [0x640, [0x55]]], read: [[0x636, 1], [0x640, 1], [TABLE, 48]], maxFrames: 60 });
      return result;
    }),
    check: ({ data: result }) => {
      const problems = [];
      if (!result.done) return ['调用没有返回'];
      if (result.memory.get(0x636)[0] !== 1) problems.push(`$0636 为 ${hexName(result.memory.get(0x636)[0])}，预期 01`);
      if (result.memory.get(0x640)[0] !== 0) problems.push(`$0640 为 ${hexName(result.memory.get(0x640)[0])}，预期 00`);
      const table = result.memory.get(TABLE);
      const entry = [...table.subarray(3 * fn, 3 * fn + 3)];
      if (entry.join() !== [0x08, 0x3e, 0xe4].join()) problems.push(`表项被改写：${entry.map(hexName).join(' ')}`);
      return problems;
    },
  }],
}));

export { cases };
