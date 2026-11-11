// ------------------------------------------------------------------------
// 名称：bios-coverage.mjs
// 说明：按汇编源文件统计原始 BIOS 的实测覆盖率：每条指令是否被模拟器执行过（来自 CDL），数据字节是否被访问过，并按例程汇总，列出没执行过的例程。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/bios-coverage.mjs [--cdl 文件1,文件2…（默认 out/cdl/all-rom.cdl）] [--page p58] [--routines [最小指令数]] [--json 输出文件]
//       例程 = 从一个有意义的标签（不是 K_xxxx、Pxx_xxxx 这类自动标签）到下一个有意义的标签；没有有意义标签的开头部分记为“(页首)”。
//       “已执行”以 CDL 的指令首字节标志为准；注释里的“推断”“启发式”只是生成工程时的来源标记，不参与统计。
// ------------------------------------------------------------------------
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assembleProject } from '../../bios/tools/bios-project.mjs';
import { CDL } from './cdl-listing.mjs';
import { mergeCdl } from './cdl-merge.mjs';
import { BIOS_DIR, OUT_DIR } from './config.mjs';

const PAGE_SIZE = 4096;

/** 自动生成的标签（K_C030、P58_8303 这类），不算例程起点 */
const AUTO_LABEL = /^(K|P[0-9A-F]{2})_[0-9A-F]{4}$/;

const LABEL_LINE = /^([A-Za-z_][A-Za-z0-9_]*):/;

/** 这三个标志任一出现就算数据字节被访问过 */
const TOUCHED = CDL.OPCODE | CDL.OPERAND | CDL.READ;

/**
 * 统计覆盖率。
 * @param {string} projectDir 工程目录（含 bios.json）
 * @param {Uint8Array} cdl 整个 ROM 空间的 CDL（不含 iNES 文件头）
 * @returns {{parts: object[], total: object}}
 */
export function computeCoverage(projectDir, cdl) {
  const { manifest, sources, assembled } = assembleProject(projectDir);
  const textOf = new Map(sources.map((s) => [s.name, s.text.split(/\r?\n/)]));
  const parts = [];
  for (const part of manifest.parts) {
    const base = part.firstPage * PAGE_SIZE;
    const row = { name: part.sources?.[0] ?? part.binary, firstPage: part.firstPage, instr: 0, instrDone: 0, instrBytes: 0, instrBytesDone: 0, dataBytes: 0, dataTouched: 0, routines: [] };
    if (!part.sources) {
      row.dataBytes = part.pageCount * PAGE_SIZE;
      for (let i = 0; i < row.dataBytes; i++) if (cdl[base + i] & TOUCHED) row.dataTouched++;
      parts.push(row);
      continue;
    }
    const segment = assembled.segments.find((s) => s.source === part.sources[0]);
    let routine = { name: '(页首)', line: 1, instr: 0, instrDone: 0, bytes: 0 };
    const finish = () => { if (routine.instr > 0 || routine.bytes > 0) row.routines.push(routine); };
    // 每个源文件各自记录扫描到哪一行
    const cursors = new Map();
    for (const item of segment.lines) {
      const colon = item.where.lastIndexOf(':');
      const file = item.where.slice(0, colon);
      const lineNo = Number(item.where.slice(colon + 1));
      const lines = textOf.get(file);
      let cursor = cursors.get(file) ?? 0;
      // 扫描到本条语句所在行为止出现的标签（标签可能与指令写在同一行）
      for (; cursor < lineNo; cursor++) {
        const m = LABEL_LINE.exec(lines[cursor]);
        if (m && !AUTO_LABEL.test(m[1])) {
          finish();
          routine = { name: m[1], line: cursor + 1, instr: 0, instrDone: 0, bytes: 0 };
        }
      }
      cursors.set(file, cursor);
      const offset = base + item.start;
      if (item.kind === 'ins') {
        const done = (cdl[offset] & CDL.OPCODE) !== 0;
        row.instr++;
        row.instrBytes += item.length;
        routine.instr++;
        routine.bytes += item.length;
        if (done) { row.instrDone++; row.instrBytesDone += item.length; routine.instrDone++; }
      } else {
        let touched = 0;
        for (let i = 0; i < item.length; i++) if (cdl[offset + i] & TOUCHED) touched++;
        row.dataBytes += item.length;
        row.dataTouched += touched;
        routine.bytes += item.length;
      }
    }
    finish();
    parts.push(row);
  }
  const total = { instr: 0, instrDone: 0, instrBytes: 0, instrBytesDone: 0, dataBytes: 0, dataTouched: 0 };
  for (const p of parts) for (const k of Object.keys(total)) total[k] += p[k];
  return { parts, total };
}

/** 读入一份或多份 CDL 并合并 */
export function loadCdl(files) {
  const list = files.map((f) => new Uint8Array(readFileSync(f)));
  return list.length === 1 ? list[0] : mergeCdl(list);
}

const percent = (a, b) => (b === 0 ? '-' : `${((a / b) * 100).toFixed(1)}%`);

if (process.argv[1]?.endsWith('bios-coverage.mjs')) {
  const args = process.argv.slice(2);
  const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const cdlFiles = (option('--cdl') ?? path.join(OUT_DIR, 'cdl', 'all-rom.cdl')).split(',');
  const onlyPage = option('--page');
  const routineArg = args.indexOf('--routines');
  const minInstr = routineArg >= 0 && /^\d+$/.test(args[routineArg + 1] ?? '') ? Number(args[routineArg + 1]) : 1;
  for (const file of cdlFiles) if (!existsSync(file)) throw new Error(`CDL 文件不存在：${file}`);
  const result = computeCoverage(BIOS_DIR, loadCdl(cdlFiles));
  console.log('文件'.padEnd(18), '指令', '已执行', '覆盖率', '  数据字节', '被访问');
  for (const p of result.parts) {
    if (!p.name.startsWith('src/') && onlyPage === undefined) continue;
    if (onlyPage && !p.name.includes(onlyPage)) continue;
    console.log(p.name.padEnd(18), String(p.instr).padStart(5), String(p.instrDone).padStart(6), percent(p.instrDone, p.instr).padStart(7), String(p.dataBytes).padStart(10), percent(p.dataTouched, p.dataBytes).padStart(7));
  }
  const t = result.total;
  console.log('合计'.padEnd(18), String(t.instr).padStart(5), String(t.instrDone).padStart(6), percent(t.instrDone, t.instr).padStart(7), String(t.dataBytes).padStart(10), percent(t.dataTouched, t.dataBytes).padStart(7));
  if (routineArg >= 0) {
    for (const p of result.parts) {
      if (onlyPage && !p.name.includes(onlyPage)) continue;
      const rows = p.routines.filter((r) => r.instr >= minInstr && r.instrDone < r.instr).sort((a, b) => (b.instr - b.instrDone) - (a.instr - a.instrDone));
      if (rows.length === 0) continue;
      console.log(`\n${p.name} 未完全执行的例程（${rows.length} 个）`);
      for (const r of rows) console.log(`  ${r.name.padEnd(36)} 行 ${String(r.line).padStart(5)}  指令 ${String(r.instr).padStart(4)}  已执行 ${String(r.instrDone).padStart(4)}  ${percent(r.instrDone, r.instr)}`);
    }
  }
  const jsonPath = option('--json');
  if (jsonPath) {
    mkdirSync(path.dirname(jsonPath), { recursive: true });
    writeFileSync(jsonPath, JSON.stringify(result, null, 1));
    console.log(`\n已写入 ${jsonPath}`);
  }
}
