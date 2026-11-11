// ------------------------------------------------------------------------
// 名称：verify-dispatch.mjs
// 说明：用模拟器在 $FF16（分发器最后的 JMP ($0010)）记录的调用，核对 dispatch-map.mjs 还原的分流规则。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/verify-dispatch.mjs [日志，默认 out/api/apps-ff16.log]
//       日志由 collect-cdl.mjs 生成，每次调用记录 $0639-$063F 与 $0010-$0011。
// ------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCallLog } from './analyze-api-log.mjs';
import { BIOS_ROM, OUT_DIR } from './config.mjs';
import { dispatchEntry } from './dispatch-map.mjs';

/**
 * 核对实测调用与还原的分流规则。
 * @param {ReturnType<typeof parseCallLog>} calls $FF16 处的调用记录
 * @param {Uint8Array} rom BIOS ROM（不含文件头）
 * @returns {{checked: number, skipped: number, mismatches: string[], observed: Map<number, {count: number, handlers: Set<number>, groups: Set<number>, subs: Map<number, number>}>}}
 */
export function verifyDispatch(calls, rom) {
  const observed = new Map();
  const mismatches = [];
  let checked = 0;
  let skipped = 0;

  for (const call of calls) {
    const banks = call.memory.get(0x0639);
    const target = call.memory.get(0x0010);
    if (call.fn === null || !banks || !target) {
      skipped++;
      continue;
    }
    const handler = target[0] | (target[1] << 8);
    const group = banks[0];
    const seen = observed.get(call.fn) ?? { count: 0, handlers: new Set(), groups: new Set(), subs: new Map() };
    seen.count++;
    seen.handlers.add(handler);
    seen.groups.add(group);
    if (call.sub !== null) seen.subs.set(call.sub, (seen.subs.get(call.sub) ?? 0) + 1);
    observed.set(call.fn, seen);

    const expected = dispatchEntry(rom, call.fn);
    if (expected.kind === 'ram-table' || (expected.kind === 'banked' && expected.handler === null)) {
      skipped++;
      continue;
    }
    checked++;
    const hex = (v) => v.toString(16).toUpperCase();
    if (expected.kind === 'none') mismatches.push(`功能号 $${hex(call.fn)} 应直接返回，却到达了 $FF16`);
    else if (expected.handler !== handler) mismatches.push(`功能号 $${hex(call.fn)} 处理例程应为 $${hex(expected.handler)}，实测 $${hex(handler)}`);
    else if (expected.kind === 'banked' && expected.group !== group) mismatches.push(`功能号 $${hex(call.fn)} 页组应为 $${hex(expected.group)}，实测 $${hex(group)}`);
  }
  return { checked, skipped, mismatches: [...new Set(mismatches)], observed };
}

if (process.argv[1]?.endsWith('verify-dispatch.mjs')) {
  const input = process.argv[2] ?? path.join(OUT_DIR, 'api', 'apps-ff16.log');
  const rom = new Uint8Array(readFileSync(BIOS_ROM)).subarray(16);
  const result = verifyDispatch(parseCallLog(readFileSync(input, 'utf8')), rom);
  console.log(`核对 ${result.checked} 次调用，跳过 ${result.skipped} 次（RAM 表或页组在运行时决定）`);
  const hex = (v, n) => v.toString(16).toUpperCase().padStart(n, '0');
  for (const [fn, seen] of [...result.observed].sort((p, q) => p[0] - q[0])) {
    const handlers = [...seen.handlers].map((h) => `$${hex(h, 4)}`).join(' ');
    const groups = [...seen.groups].map((g) => `$${hex(g, 2)}`).join(' ');
    console.log(`  $${hex(fn, 2)}  ${seen.count} 次  例程 ${handlers}  页组 ${groups}`);
  }
  if (result.mismatches.length === 0) console.log('分流规则与实测一致');
  else {
    console.error(result.mismatches.join('\n'));
    process.exitCode = 1;
  }
}
