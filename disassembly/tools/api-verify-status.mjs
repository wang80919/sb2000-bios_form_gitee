// ------------------------------------------------------------------------
// 名称：api-verify-status.mjs
// 说明：统计系统调用功能号的验证状态：有例程的功能号里，哪些已有带预期值的验证用例，哪些还没有。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/api-verify-status.mjs；功能号清单取自 docs/generated/系统调用表.md（不含标“表外”的功能号），
//       “带预期值”指用例（或其某一步）有 expect、check 或 expectWrites，且该用例的步骤里出现过该功能号或标题以 $XX 开头；统计以功能号为单位，子功能的覆盖情况看验证证据清单。
// ------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { WORK_DIR } from './config.mjs';
import { loadCases } from './verify-run.mjs';

const CALL_TABLE = path.join(WORK_DIR, 'docs', 'generated', '系统调用表.md');
const FIRST_ROUTINE_FUNCTION = 0x10;

/** 判断一个用例步骤是否带预期值 */
const hasExpectation = (step) => typeof step !== 'function' && Boolean(step.expect?.length || step.check || step.expectWrites);

/** 从系统调用表读出有例程的功能号（不含“表外”） */
export function routineFunctions(markdown) {
  const functions = [];
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^\| \$([0-9A-F]{2}) \|/.exec(line);
    if (!match || line.includes('| 表外 |')) continue;
    const code = parseInt(match[1], 16);
    if (code >= FIRST_ROUTINE_FUNCTION) functions.push(code);
  }
  return [...new Set(functions)];
}

/** 收集带预期值用例涉及的功能号：步骤里写明的 func，以及标题以 $XX 开头的用例（主机步骤里自己发起调用的用例） */
export function verifiedFunctions(cases) {
  const verified = new Set();
  for (const spec of cases) {
    const steps = spec.steps ?? [spec];
    if (!steps.some(hasExpectation)) continue;
    for (const step of steps) if (typeof step !== 'function' && step.func !== undefined) verified.add(step.func);
    const titled = /^\$([0-9A-F]{2})\b/.exec(spec.title ?? '');
    if (titled) verified.add(parseInt(titled[1], 16));
  }
  return verified;
}

const hex = (codes) => codes.map((code) => code.toString(16).toUpperCase().padStart(2, '0')).join(' ');

async function main() {
  const cases = await loadCases();
  const withRoutine = routineFunctions(readFileSync(CALL_TABLE, 'utf8'));
  const verified = verifiedFunctions(cases);
  const done = withRoutine.filter((code) => verified.has(code));
  const todo = withRoutine.filter((code) => !verified.has(code));
  const expected = cases.filter((spec) => (spec.steps ?? [spec]).some(hasExpectation)).length;
  console.log(`验证用例 ${cases.length} 个，其中带预期值 ${expected} 个`);
  console.log(`有例程的功能号 ${withRoutine.length} 个：已有带预期值用例 ${done.length} 个，还没有 ${todo.length} 个`);
  console.log(`已有：${hex(done)}`);
  console.log(`还没有：${hex(todo)}`);
}

if (process.argv[1] && path.basename(process.argv[1]) === 'api-verify-status.mjs') await main();
