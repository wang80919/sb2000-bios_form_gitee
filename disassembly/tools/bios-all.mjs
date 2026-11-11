// ------------------------------------------------------------------------
// 名称：bios-all.mjs
// 说明：一条命令完成构建、测试、文档生成与检查：构建 bios/ 工程并与原始 ROM 逐字节比对 → 运行工程与分析工具的全部单元测试 → 重新生成数据区清单、例程规格表、内存变量表、调用图、待补充清单 → 检查 docs/generated 里的这些生成文档与源码一致；加 --verify 时再完整运行验证用例、统计覆盖率并生成验证证据清单。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/bios-all.mjs [--verify] [--write]。默认只检查生成文档是否过期（过期则失败）；加 --write 时直接更新 docs/generated 里的生成文档。
//       --verify 需要模拟器环境，约 45 分钟，运行期间不要同时改动 bios/ 或操作模拟器。
// ------------------------------------------------------------------------
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInventory, renderMarkdown } from './bios-data.mjs';
import { buildSpec, renderCallGraph, renderOpenItems, renderRoutineTable, renderVariableTable } from './bios-spec.mjs';
import { BIOS_DIR } from './config.mjs';

const WORK_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(WORK_DIR, 'docs', 'generated');

/** 生成文档：文件名 → 内容生成函数 */
export function generatedDocs() {
  const spec = buildSpec();
  return new Map([
    ['BIOS数据区清单.md', renderMarkdown(buildInventory())],
    ['例程规格表.md', renderRoutineTable(spec)],
    ['内存变量与硬件寄存器表.md', renderVariableTable(spec)],
    ['调用图.md', renderCallGraph(spec)],
    ['待补充清单.md', renderOpenItems(spec)],
  ]);
}

/**
 * 比对 docs 里的生成文档与现在生成的内容。
 * @param {Map<string, string>} docs 文件名 → 新内容
 * @param {string} dir docs 目录
 * @returns {string[]} 过期（内容不同或不存在）的文件名
 */
export function staleDocs(docs, dir = DOCS) {
  const stale = [];
  for (const [name, text] of docs) {
    const file = path.join(dir, name);
    if (!existsSync(file) || readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== text) stale.push(name);
  }
  return stale;
}

const run = (label, command, args, cwd = WORK_DIR) => {
  console.log(`\n== ${label}`);
  execFileSync(command, args, { cwd, stdio: 'inherit' });
};

function main() {
  const args = process.argv.slice(2);
  const node = process.execPath;
  run('构建并与原始 BIOS 比对', node, ['tools/bios-build.mjs'], BIOS_DIR);
  const docs = generatedDocs();
  if (args.includes('--write')) {
    // 先更新生成文档，否则单元测试里“生成文档没有过期”的检查会先失败
    mkdirSync(DOCS, { recursive: true });
    for (const [name, text] of docs) writeFileSync(path.join(DOCS, name), text);
    console.log('\n== 已更新生成文档：' + [...docs.keys()].join('、'));
  }
  run('工程单元测试（bios/）', node, ['--test', 'test/**/*.test.mjs'], BIOS_DIR);
  run('分析工具单元测试（disassembly/）', node, ['--test', 'test/**/*.test.mjs']);
  if (!args.includes('--write')) {
    const stale = staleDocs(docs);
    if (stale.length > 0) {
      console.error(`\n生成文档已过期：${stale.join('、')}；运行 node tools/bios-all.mjs --write 更新`);
      process.exitCode = 1;
      return;
    }
    console.log('\n== 生成文档与源码一致');
  }
  if (args.includes('--verify')) {
    run('完整运行验证用例', node, ['tools/verify-run.mjs']);
    run('覆盖率', node, ['tools/bios-coverage.mjs', '--json', 'out/coverage/coverage.json']);
    run('验证证据清单', node, ['tools/verify-evidence.mjs', '--md', 'docs/generated/验证证据清单.md']);
  }
  console.log('\n全部通过');
}

if (process.argv[1] && path.basename(process.argv[1]) === 'bios-all.mjs') main();
