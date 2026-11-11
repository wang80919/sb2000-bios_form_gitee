// ------------------------------------------------------------------------
// 名称：verify-run.mjs
// 说明：运行 verify/cases/ 里的用例：开机到 SB-DOS 提示符，逐个调用系统调用或固定区例程，核对结果，并把本次运行的 CDL 保存为 out/cdl/verify-rom.cdl。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/verify-run.mjs [--attach] [--only 用例编号前缀] [--rom ROM 路径] [--image 软盘镜像] [--fast]
//       --fast 用快速开机 ROM（先 npm run build:fast），只用于调试：开机等待缩短、不保存 CDL，结论仍以默认 ROM 的完整运行为准；
//       --attach 表示连接已在运行的模拟器（node tools/sb2kdbg.mjs --launch 启动的），结束后不关闭它；
//       默认自己启动模拟器，结束后关闭。用例文件格式见 verify/README.md。
//       结果写入 out/verify/results.json；有预期值的用例（expect、check）失败或挂起会让退出码为 1，没有预期值的“只跑到”用例挂起只记录；结束时把 out/cdl 里所有场景的 CDL（含本次的 verify-rom.cdl）合并成 out/cdl/all-rom.cdl。
// ------------------------------------------------------------------------
import { copyFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BIOS_BUILD_DIR, DOS_IMAGE, OUT_DIR, WORK_DIR } from './config.mjs';
import { mergeFiles } from './cdl-merge.mjs';
import { bootDos, checkExpect, ensureOutDir, resetToDos, runCall, toBytes, toHex } from './rom-driver.mjs';
import { startDialogWatcher } from './dialog-watch.mjs';
import { DEFAULT_PORT, Sb2kClient } from './sb2k-client.mjs';

const CASE_DIR = path.join(WORK_DIR, 'verify', 'cases');

/** 读取所有用例模块，返回展平后的用例清单（每项带所属模块名） */
export async function loadCases(only) {
  const list = [];
  for (const file of readdirSync(CASE_DIR).filter((f) => f.endsWith('.mjs')).sort()) {
    const module = await import(pathToFileURL(path.join(CASE_DIR, file)).href);
    for (const spec of module.cases) {
      if (only && !spec.id.startsWith(only)) continue;
      list.push({ ...spec, module: file });
    }
  }
  const ids = new Set();
  for (const spec of list) {
    if (ids.has(spec.id)) throw new Error(`用例编号重复：${spec.id}`);
    ids.add(spec.id);
  }
  return list;
}

/** 检查一次调用的结果，返回问题列表 */
function checkStep(spec, result, history) {
  const problems = checkExpect(result.memory, spec.expect ?? []);
  for (const [addr, want] of spec.expectWrites ?? []) {
    const got = toHex(result.writes.get(addr) ?? []);
    const expected = toHex(toBytes(want));
    if (got !== expected) problems.push(`写入 $${addr.toString(16).toUpperCase()} 的序列预期 ${expected}，实际 ${got}`);
  }
  if (spec.check) problems.push(...spec.check(result, history));
  return problems;
}

/**
 * 执行一个用例并给出结论：pass、fail、hang。
 * 用例可以是单次调用，也可以有 steps：按顺序执行的步骤数组，每一步是调用说明（字段同单次调用）、
 * 以前面各步结果为参数返回调用说明的函数，或 { host: async (client, history, ctx) => 结果 } 形式的主机端动作（如保存磁盘镜像）。
 * ctx 里有 image（模拟器加载的测试镜像）、pristine（原样备份）和 restore()（把测试镜像还原，写盘用例保存镜像后调用）。
 */
export async function evaluateCase(client, spec, ctx = {}) {
  const steps = spec.steps ?? [spec];
  const history = [];
  const problems = [];
  let frames = 0;
  let regs;
  for (const [index, step] of steps.entries()) {
    const current = typeof step === 'function' ? step(history, ctx) : step;
    if (current.host) {
      const data = await current.host(client, history, ctx);
      history.push({ host: true, data, memory: new Map(), pram: new Map(), writes: new Map() });
      if (current.check) problems.push(...current.check(history.at(-1), history).map((p) => `步骤 ${index + 1}：${p}`));
      continue;
    }
    const result = await runCall(client, current);
    history.push(result);
    frames += result.frames;
    regs = result.regs;
    if (!result.done) return { id: spec.id, verdict: 'hang', frames, problems: [`步骤 ${index + 1}：${result.frames} 帧内没有返回，PC=${result.regs.pc}`] };
    problems.push(...checkStep(current, result, history).map((p) => (steps.length > 1 ? `步骤 ${index + 1}：${p}` : p)));
  }
  if (spec.finalCheck) problems.push(...spec.finalCheck(history));
  return { id: spec.id, verdict: problems.length === 0 ? 'pass' : 'fail', frames, problems, regs };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const fast = args.includes('--fast');
  const defaultRom = path.join(BIOS_BUILD_DIR, 'SB2K_BIOS.NES');
  const rom = option('--rom') ?? (fast ? path.join(BIOS_BUILD_DIR, 'SB2K_BIOS_FASTBOOT.NES') : defaultRom);
  // 快速开机 ROM 只跳过开机程序，到日期提示约 120 帧
  const bootFrames = fast ? 150 : undefined;
  // 用不是默认构建的 ROM 跑用例时不保存 CDL，避免污染总覆盖
  const recordCdl = rom === defaultRom && !option('--only');
  // 用镜像副本跑：写盘用例会把修改保存到测试镜像，用完由 ctx.restore() 还原，原始镜像不动
  const sourceImage = option('--image') ?? DOS_IMAGE;
  const verifyDir = ensureOutDir('verify');
  const image = path.join(verifyDir, 'floppy-test.img');
  const pristine = path.join(verifyDir, 'floppy-pristine.img');
  copyFileSync(sourceImage, pristine);
  copyFileSync(pristine, image);
  const ctx = { image, pristine, restore: () => copyFileSync(pristine, image) };
  const cases = await loadCases(option('--only'));
  let session;
  let client;
  if (args.includes('--attach')) {
    client = await Sb2kClient.connect(DEFAULT_PORT);
    await client.send('cdl on');
    await client.send('cdl clear');
    await resetToDos(client, image, bootFrames);
  } else {
    session = await bootDos({ rom, image, bootFrames });
    client = session.client;
  }
  const results = [];
  // 模拟器的虚拟打印机会弹模态对话框，运行期间自动应答
  const watcher = startDialogWatcher(undefined, (line) => console.log(`[对话框] ${line}`));
  // 同一组（spec.group）里有两个用例挂起后，组里剩下的用例跳过，避免反复挂起反复重启
  const hungGroups = new Map();
  try {
    for (const spec of cases) {
      if (spec.group && (hungGroups.get(spec.group) ?? 0) >= 2) {
        results.push({ id: spec.id, verdict: 'skip', title: spec.title, module: spec.module, kind: 'run', problems: [] });
        continue;
      }
      if (spec.prepareImage) spec.prepareImage(ctx);
      if (spec.fresh) await resetToDos(client, image, bootFrames);
      let outcome = await evaluateCase(client, spec, ctx);
      // 挂起后系统状态不可信，重新开机，让后面的用例不受影响
      if (outcome.verdict === 'hang') {
        if (spec.group) hungGroups.set(spec.group, (hungGroups.get(spec.group) ?? 0) + 1);
        await resetToDos(client, image, bootFrames);
      }
      outcome = { ...outcome, title: spec.title, module: spec.module, kind: spec.steps || spec.expect || spec.check || spec.expectWrites ? 'verify' : 'run' };
      // 写盘用例用完后重新开机，让模拟器重新加载已还原的镜像；自带镜像的用例先把测试镜像还原
      if (spec.prepareImage) ctx.restore();
      if (spec.freshAfter && outcome.verdict !== 'hang') await resetToDos(client, image, bootFrames);
      results.push(outcome);
      if (!spec.quiet || outcome.verdict !== 'pass') console.log(`${outcome.verdict.padEnd(5)} ${spec.id.padEnd(28)} ${spec.title ?? ''}${outcome.problems.length ? `\n      ${outcome.problems.join('\n      ')}` : ''}`);
    }
    // 只跑部分用例或不是默认 ROM 时不保存 CDL，避免总覆盖里混进完整运行复现不了的记录
    if (recordCdl) {
      await client.send(`cdl save ${path.join(ensureOutDir('cdl'), 'verify')}`);
      mergeFiles(path.join(OUT_DIR, 'cdl', 'all-rom.cdl'), [path.join(OUT_DIR, 'cdl')]);
    }
  } finally {
    watcher.stop();
    client.close();
    session?.child.kill();
  }
  const summary = { pass: 0, fail: 0, hang: 0, skip: 0 };
  for (const r of results) summary[r.verdict]++;
  const verified = results.filter((r) => r.kind === 'verify' && r.verdict === 'pass').length;
  writeFileSync(path.join(ensureOutDir('verify'), 'results.json'), JSON.stringify({ summary, results }, null, 1));
  console.log(`\n通过 ${summary.pass}（其中有预期值校验的 ${verified}，只跑到、没有校验的 ${summary.pass - verified}），失败 ${summary.fail}，挂起 ${summary.hang}，跳过 ${summary.skip}（共 ${results.length}）`);
  if (summary.fail > 0 || results.some((r) => r.verdict === 'hang' && r.kind === 'verify')) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('verify-run.mjs')) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
