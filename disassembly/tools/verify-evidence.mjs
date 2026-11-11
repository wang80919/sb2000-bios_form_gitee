// ------------------------------------------------------------------------
// 名称：verify-evidence.mjs
// 说明：生成验证证据清单：读取 out/verify/results.json 与 out/coverage/coverage.json，按用例文件汇总通过、失败、挂起、有预期值的数量，列出全部有预期值的用例及其依据，列出挂起的调用，给出各页覆盖率。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/verify-evidence.mjs [--md 输出文件]；先运行 node tools/verify-run.mjs 与 node tools/bios-coverage.mjs --json out/coverage/coverage.json。
//       结果文件是整个验证运行的快照：只跑部分用例（--only）会覆盖它，生成证据前应做一次完整运行。
// ------------------------------------------------------------------------
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { OUT_DIR } from './config.mjs';

/**
 * 汇总验证结果。
 * @param {{summary: object, results: {id: string, title: string, module: string, verdict: string, kind: string}[]}} run 验证运行结果
 * @returns {{modules: {module: string, total: number, verified: number, pass: number, fail: number, hang: number, skip: number}[]}}
 */
export function summarize(run) {
  const rows = new Map();
  for (const r of run.results) {
    const row = rows.get(r.module) ?? { module: r.module, total: 0, verified: 0, pass: 0, fail: 0, hang: 0, skip: 0 };
    row.total++;
    row[r.verdict]++;
    if (r.kind === 'verify' && r.verdict === 'pass') row.verified++;
    rows.set(r.module, row);
  }
  return { modules: [...rows.values()].sort((a, b) => a.module.localeCompare(b.module)) };
}

/** 生成 Markdown */
export function renderEvidence(run, coverage) {
  const { modules } = summarize(run);
  const total = run.results.length;
  const verified = run.results.filter((r) => r.kind === 'verify' && r.verdict === 'pass');
  const lines = ['# 验证证据清单', '', '由 `node tools/verify-evidence.mjs --md docs/generated/验证证据清单.md` 生成，不要手改。数据来自一次完整的 `node tools/verify-run.mjs` 与 `node tools/bios-coverage.mjs`；“已验证”指有预期值（`expect`、`check`）并通过的用例，预期值的来源见各用例文件的头注释。', '', '## 汇总', '', `用例 ${total} 个：已验证 ${verified.length}，只跑到 ${run.results.filter((r) => r.kind === 'run' && r.verdict === 'pass').length}，失败 ${run.summary.fail}，挂起 ${run.summary.hang}，跳过 ${run.summary.skip}。`, ''];
  if (coverage) lines.push(`实测覆盖：指令 ${coverage.total.instr} 条中执行过 ${coverage.total.instrDone} 条（${((coverage.total.instrDone / coverage.total.instr) * 100).toFixed(1)}%）；数据字节 ${coverage.total.dataBytes}，读到过 ${coverage.total.dataTouched}。`, '');
  lines.push('## 按用例文件', '', '| 用例文件 | 用例数 | 已验证 | 通过 | 失败 | 挂起 | 跳过 |', '| --- | --- | --- | --- | --- | --- | --- |');
  for (const m of modules) lines.push(`| ${m.module} | ${m.total} | ${m.verified} | ${m.pass} | ${m.fail} | ${m.hang} | ${m.skip} |`);
  if (coverage) {
    lines.push('', '## 各源文件覆盖率', '', '| 源文件 | 指令数 | 执行过 | 比例 |', '| --- | --- | --- | --- |');
    for (const p of coverage.parts) if (p.instr > 0) lines.push(`| ${p.name} | ${p.instr} | ${p.instrDone} | ${((p.instrDone / p.instr) * 100).toFixed(1)}% |`);
  }
  lines.push('', '## 已验证的用例', '', '| 编号 | 说明 | 用例文件 |', '| --- | --- | --- |');
  for (const r of verified) lines.push(`| ${r.id} | ${(r.title ?? '').replace(/\|/g, '/')} | ${r.module} |`);
  const hung = run.results.filter((r) => r.verdict === 'hang');
  lines.push('', `## 挂起的调用（${hung.length} 个，分类见 [问题与结论登记](../问题与结论登记.md) 第 4 节）`, '', hung.map((r) => r.id).join('、'), '');
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = process.argv.slice(2);
  const md = args.indexOf('--md') >= 0 ? args[args.indexOf('--md') + 1] : undefined;
  const run = JSON.parse(readFileSync(path.join(OUT_DIR, 'verify', 'results.json'), 'utf8'));
  let coverage = null;
  try {
    coverage = JSON.parse(readFileSync(path.join(OUT_DIR, 'coverage', 'coverage.json'), 'utf8'));
  } catch {
    coverage = null;
  }
  const text = renderEvidence(run, coverage);
  if (md) writeFileSync(md, text);
  else process.stdout.write(text);
}

if (process.argv[1] && path.basename(process.argv[1]) === 'verify-evidence.mjs') main();
