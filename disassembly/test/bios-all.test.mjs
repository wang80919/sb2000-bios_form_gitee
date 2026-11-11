// ------------------------------------------------------------------------
// 名称：bios-all.test.mjs
// 说明：测试一键流程与验证证据清单：生成文档过期检查、验证结果按用例文件汇总、证据 Markdown 的内容。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：不运行构建与验证，只测可独立运行的函数；最后一个用例核对 docs 里已提交的生成文档没有过期。
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { generatedDocs, staleDocs } from '../tools/bios-all.mjs';
import { renderEvidence, summarize } from '../tools/verify-evidence.mjs';

const RUN = {
  summary: { pass: 3, fail: 0, hang: 1, skip: 0 },
  results: [
    { id: 'a.1', title: '甲', module: 'a.mjs', verdict: 'pass', kind: 'verify' },
    { id: 'a.2', title: '乙', module: 'a.mjs', verdict: 'pass', kind: 'run' },
    { id: 'b.1', title: '丙|丁', module: 'b.mjs', verdict: 'pass', kind: 'verify' },
    { id: 'b.2', title: '戊', module: 'b.mjs', verdict: 'hang', kind: 'run' },
  ],
};

test('按用例文件汇总：总数、已验证、通过、挂起', () => {
  const { modules } = summarize(RUN);
  assert.deepEqual(modules.map((m) => [m.module, m.total, m.verified, m.pass, m.hang]), [['a.mjs', 2, 1, 2, 0], ['b.mjs', 2, 1, 1, 1]]);
});

test('证据清单含汇总、覆盖率、已验证用例（标题里的竖线被替换）与挂起列表', () => {
  const text = renderEvidence(RUN, { total: { instr: 200, instrDone: 100, dataBytes: 10, dataTouched: 5 }, parts: [{ name: 'src/p00.asm', instr: 200, instrDone: 100 }] });
  assert.match(text, /用例 4 个：已验证 2，只跑到 1，失败 0，挂起 1/);
  assert.match(text, /执行过 100 条（50\.0%）/);
  assert.match(text, /\| b\.1 \| 丙\/丁 \| b\.mjs \|/);
  assert.match(text, /## 挂起的调用（1 个/);
});

test('生成文档过期检查：不存在或内容不同的文件被列出，换行符差异不算过期', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bios-all-'));
  try {
    writeFileSync(path.join(dir, 'a.md'), '甲\r\n乙\r\n');
    writeFileSync(path.join(dir, 'b.md'), '旧');
    const docs = new Map([['a.md', '甲\n乙\n'], ['b.md', '新'], ['c.md', 'x']]);
    assert.deepEqual(staleDocs(docs, dir), ['b.md', 'c.md']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('docs 里已提交的生成文档与源码一致（过期时运行 node tools/bios-all.mjs --write）', () => {
  assert.deepEqual(staleDocs(generatedDocs()), []);
});
