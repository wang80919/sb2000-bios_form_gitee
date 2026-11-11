// ------------------------------------------------------------------------
// 名称：verify-watch.mjs
// 说明：带读写断点跑验证用例，记录指定内存地址被谁读、被谁写，给“只读、只写、没有访问”的结论提供运行证据
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-10
// 备注：用法 node tools/verify-watch.mjs --watch 地址[-结束][:r|w|rw] [--watch ...] [--only 用例编号前缀] [--out 文件]
// ------------------------------------------------------------------------
import { copyFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BIOS_BUILD_DIR, BIOS_DIR, DOS_IMAGE, OUT_DIR } from './config.mjs';
import { bootDos, ensureOutDir, resetToDos } from './rom-driver.mjs';
import { startDialogWatcher } from './dialog-watch.mjs';
import { parseFields } from './sb2k-client.mjs';
import { evaluateCase, loadCases } from './verify-run.mjs';
import { assembleProject } from '../../bios/tools/bios-project.mjs';

/** 同一地址、同一类访问的命中次数超过它就撤掉断点，避免高频访问拖慢运行 */
const HIT_LIMIT = 400;

/** 解析 --watch 参数：地址[-结束][:r|w|rw] */
function parseWatch(text) {
  const [range, kind = 'rw'] = text.split(':');
  const [lo, hi = lo] = range.split('-').map((part) => parseInt(part.replace('$', ''), 16));
  return { lo, hi, kinds: kind === 'rw' ? ['r', 'w'] : [kind], text };
}

/** 建立“ROM 偏移 → 源文件与行号”的查找表，用来把命中的 PC 还原成例程 */
function buildOffsetIndex() {
  const { lineMap } = assembleProject(BIOS_DIR);
  const entries = [];
  for (const [file, lines] of lineMap) {
    for (const [line, pos] of lines) entries.push({ file, line, offset: pos.offset, length: pos.length });
  }
  entries.sort((a, b) => a.offset - b.offset);
  return entries;
}

/** 在偏移表里二分查找包含该偏移的源码行 */
function lookupOffset(entries, offset) {
  let lo = 0;
  let hi = entries.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const entry = entries[mid];
    if (offset < entry.offset) hi = mid - 1;
    else if (offset >= entry.offset + Math.max(entry.length, 1)) lo = mid + 1;
    else return entry;
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const watches = [];
  let only;
  let outFile = path.join(OUT_DIR, 'verify', 'watch.json');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--watch') watches.push(parseWatch(args[++i]));
    else if (args[i] === '--only') only = args[++i];
    else if (args[i] === '--out') outFile = args[++i];
  }
  if (watches.length === 0) throw new Error('至少要有一个 --watch');
  const entries = buildOffsetIndex();
  const rom = path.join(BIOS_BUILD_DIR, 'SB2K_BIOS.NES');
  const verifyDir = ensureOutDir('verify');
  const image = path.join(verifyDir, 'floppy-watch.img');
  const pristine = path.join(verifyDir, 'floppy-pristine.img');
  copyFileSync(DOS_IMAGE, pristine);
  copyFileSync(pristine, image);
  const ctx = { image, pristine, restore: () => copyFileSync(pristine, image) };
  const cases = await loadCases(only);
  const session = await bootDos({ rom, image });
  const client = session.client;
  const hits = new Map();
  let currentCase = '(开机)';
  const counts = new Map();
  const installed = new Map();

  const install = async () => {
    installed.clear();
    for (const watch of watches) {
      for (const kind of watch.kinds) {
        const reply = await client.send(`bp ${kind} ${watch.lo.toString(16)} ${watch.hi.toString(16)}`);
        installed.set(parseFields(reply.head).id, { watch, kind });
      }
    }
  };
  await install();

  // 命中断点后记下现场并接着跑完剩下的帧；用例本身看到的运行结果不变
  const originalSend = client.send.bind(client);
  client.send = async (command) => {
    if (!/^(run|step) /.test(command)) return originalSend(command);
    let reply = await originalSend(command);
    for (;;) {
      const fields = parseFields(reply.head);
      if (fields.stop !== 'read' && fields.stop !== 'write') return reply;
      const kind = fields.stop === 'read' ? 'r' : 'w';
      const addr = parseInt(fields.addr, 16);
      const pc = parseInt(fields.stoppc, 16);
      const resolved = parseFields((await originalSend(`resolve ${pc.toString(16)}`)).head);
      const offset = resolved.space === 'rom' ? parseInt(resolved.offset, 16) : null;
      const source = offset === null ? null : lookupOffset(entries, offset);
      const where = source ? `${source.file}:${source.line}` : `pc=${pc.toString(16)}(${resolved.space})`;
      const key = `${kind} ${addr.toString(16).toUpperCase().padStart(4, '0')} ${offset === null ? where : offset.toString(16)}`;
      const record = hits.get(key) ?? { kind, addr, offset, where, count: 0, cases: new Set() };
      record.count++;
      record.cases.add(currentCase);
      hits.set(key, record);
      const total = (counts.get(`${kind}${addr}`) ?? 0) + 1;
      counts.set(`${kind}${addr}`, total);
      if (total === HIT_LIMIT) {
        for (const [id, info] of installed) {
          if (info.kind === kind && addr >= info.watch.lo && addr <= info.watch.hi) await originalSend(`bp del ${id}`);
        }
      }
      const done = Number(fields.frames);
      const left = command.startsWith('run ') ? Number(command.split(' ')[1]) - done : 0;
      if (command.startsWith('run ') && left <= 0) return reply;
      reply = await originalSend(command.startsWith('run ') ? `run ${left}` : 'step 1');
    }
  };

  const watcher = startDialogWatcher(undefined, () => {});
  try {
    for (const [index, spec] of cases.entries()) {
      currentCase = spec.id;
      if (index % 100 === 0) console.log(`进度 ${index}/${cases.length} ${spec.id}`);
      if (spec.prepareImage) spec.prepareImage(ctx);
      if (spec.fresh) await resetToDos(client, image);
      const outcome = await evaluateCase(client, spec, ctx);
      if (outcome.verdict === 'hang') await resetToDos(client, image);
      if (spec.prepareImage) ctx.restore();
      if (spec.freshAfter && outcome.verdict !== 'hang') await resetToDos(client, image);
    }
  } finally {
    watcher.stop();
    client.close();
    session.child.kill();
  }
  const rows = [...hits.values()].map((r) => ({ ...r, cases: [...r.cases].slice(0, 6), caseCount: r.cases.size }));
  rows.sort((a, b) => a.addr - b.addr || a.kind.localeCompare(b.kind) || a.where.localeCompare(b.where));
  writeFileSync(outFile, JSON.stringify({ watches: watches.map((w) => w.text), cases: cases.length, rows }, null, 1));
  console.log(`跑了 ${cases.length} 个用例，记录到 ${rows.length} 类访问，写入 ${outFile}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
