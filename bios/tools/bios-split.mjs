// ------------------------------------------------------------------------
// 名称：bios-split.mjs
// 说明：把清单里的一个汇编源文件按标签拆成若干个按功能命名的文件，或把符号定义文件按取值范围拆成几份；拆完重新构建，ROM 必须与拆分前逐字节一致，否则恢复原状。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-10
// 备注：用法 node tools/bios-split.mjs <方案.json>
//       源文件方案：{ "source": "src/p04.asm", "files": [ { "path": "kernel/reset-and-boot.asm", "description": "说明" }, { "path": "kernel/interrupts.asm", "description": "说明", "from": "NMI_HANDLER" } ] }
//         第一个文件从头开始；后面的文件从 from 指定的标签所在行（连同标签上方紧挨着的注释行）开始；path 相对于 src/。
//         拆开后每个文件换上新的文件头；原来的页分隔注释（“; ---- ROM 第 N 页”）删除；.org 写在这一部分的第一个文件里，其余文件接在它后面。
//       符号文件方案：{ "equates": "src/equates.asm", "files": [ { "path": "include/zero-page.inc", "description": "说明", "min": 0, "max": 255 } ] }
//         按符号的值分到各个文件，每个文件里按值从小到大排列；有符号落不进任何范围时报错。
// ------------------------------------------------------------------------
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BIOS_DIR, PAGE_COUNT, buildBios } from './bios-build.mjs';
import { readManifest } from './bios-project.mjs';

const AUTHOR = 'sungbin';
const EMAIL = 'sungbin@3578.cn';
const HEADER_RULE = /^; -{10,}$/;
const BANNER = /^; ---- ROM 第/;
const EQUATE = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\$[0-9A-Fa-f]+|\d+)\s*(;.*)?$/;

const today = () => new Date().toISOString().slice(0, 10);
const hex = (value) => value.toString(16).toUpperCase();

/** 生成文件头 */
function renderHeader(name, description, note, date) {
  const rule = `; ${'-'.repeat(72)}`;
  return [rule, `; 名称：${name}`, `; 说明：${description}`, `; 作者：${AUTHOR}`, `; 邮箱：${EMAIL}`, `; 日期：${date}`, `; 备注：${note}`, rule];
}

/** 标签所在的行号（从 0 起）；同时向上包含紧挨着的注释行与 .rorg 行（.rorg 开启的区域从这个标签起算） */
function cutLine(lines, label) {
  const found = lines.map((line, index) => (line.startsWith(`${label}:`) ? index : -1)).filter((index) => index >= 0);
  if (found.length !== 1) throw new Error(`标签 ${label} 应当恰好出现一次，实际 ${found.length} 次`);
  let start = found[0];
  const belongsToLabel = (line) => (line.startsWith(';') && !BANNER.test(line) && !HEADER_RULE.test(line)) || /^\.rorg\b/.test(line);
  while (start > 0 && belongsToLabel(lines[start - 1])) start--;
  return start;
}

/**
 * 保存一批文件的原内容，失败时恢复。
 * @param {string[]} paths 会被改写或删除的文件
 */
function snapshot(paths) {
  const saved = paths.map((file) => {
    try {
      return [file, readFileSync(file)];
    } catch {
      return [file, null];
    }
  });
  return () => {
    for (const [file, data] of saved) {
      if (data === null) rmSync(file, { force: true });
      else writeFileSync(file, data);
    }
  };
}

/**
 * 按标签拆分一个汇编源文件。
 * @param {string} projectDir 工程目录
 * @param {{source: string, files: {path: string, description: string, from?: string, note?: string}[]}} plan 拆分方案
 * @param {{totalPages?: number, date?: string}} [options] totalPages 为构建时应覆盖的页数（测试用小工程时才需要改）
 * @returns {string[]} 新文件（相对工程目录）
 */
export function splitSource(projectDir, plan, { totalPages = PAGE_COUNT, date = today() } = {}) {
  const manifestFile = path.join(projectDir, 'bios.json');
  const manifest = readManifest(projectDir);
  const part = manifest.parts.find((p) => p.sources?.includes(plan.source));
  if (!part) throw new Error(`清单里没有 ${plan.source}`);
  const isFirst = part.sources[0] === plan.source;
  const sourceFile = path.join(projectDir, plan.source);
  const original = readFileSync(sourceFile, 'utf8');
  const lines = original.split('\n');

  // 去掉旧文件头，找出 .org 行
  const rules = lines.map((line, index) => (HEADER_RULE.test(line) ? index : -1)).filter((index) => index >= 0);
  if (rules.length < 2 || rules[0] !== 0) throw new Error(`${plan.source} 缺少文件头`);
  let bodyStart = rules[1] + 1;
  let orgLine = null;
  if (/^\.org\b/.test(lines[bodyStart] ?? '')) orgLine = lines[bodyStart++];
  if (isFirst && orgLine === null) throw new Error(`${plan.source} 是这一部分的第一个文件，文件头后应紧跟 .org`);
  const body = lines.slice(bodyStart).filter((line) => !BANNER.test(line));

  const cuts = [0, ...plan.files.slice(1).map((file) => cutLine(body, file.from))];
  for (let i = 1; i < cuts.length; i++) if (cuts[i] <= cuts[i - 1]) throw new Error(`${plan.files[i].from} 的位置不在前一个文件之后`);

  const before = buildBios(projectDir, totalPages);
  const targets = plan.files.map((file) => path.join(projectDir, 'src', file.path));
  const restore = snapshot([manifestFile, sourceFile, ...targets]);
  try {
    const pages = `ROM 第 ${hex(part.firstPage)}-${hex(part.firstPage + part.pageCount - 1)} 页`;
    plan.files.forEach((file, index) => {
      const slice = body.slice(cuts[index], cuts[index + 1] ?? body.length);
      while (slice.length > 0 && slice.at(-1) === '') slice.pop();
      const note = file.note ?? (index > 0 ? `在 ROM 里接在 ${plan.files[index - 1].path} 之后` : isFirst ? `占${pages}，汇编地址 $${hex(part.base)} 起，后面的文件接在它后面` : '无');
      const head = renderHeader(path.basename(file.path), file.description, note, date);
      const text = [...head, ...(index === 0 && orgLine !== null ? [orgLine] : []), ...slice, ''].join('\n');
      mkdirSync(path.dirname(targets[index]), { recursive: true });
      writeFileSync(targets[index], text);
    });
    if (!targets.includes(sourceFile)) rmSync(sourceFile);
    part.sources.splice(part.sources.indexOf(plan.source), 1, ...plan.files.map((file) => `src/${file.path}`));
    writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    const after = buildBios(projectDir, totalPages);
    if (!before.equals(after)) throw new Error('拆分后构建结果与拆分前不一致');
  } catch (error) {
    restore();
    throw error;
  }
  return plan.files.map((file) => `src/${file.path}`);
}

/**
 * 把符号定义文件按取值范围拆成几份。
 * @param {string} projectDir 工程目录
 * @param {{equates: string, files: {path: string, description: string, min: number, max: number, note?: string}[]}} plan 拆分方案
 * @param {{totalPages?: number, date?: string}} [options] 同 splitSource
 * @returns {string[]} 新文件（相对工程目录）
 */
export function splitEquates(projectDir, plan, { totalPages = PAGE_COUNT, date = today() } = {}) {
  const manifestFile = path.join(projectDir, 'bios.json');
  const manifest = readManifest(projectDir);
  if (!manifest.includes?.includes(plan.equates)) throw new Error(`清单的 includes 里没有 ${plan.equates}`);
  const sourceFile = path.join(projectDir, plan.equates);
  const entries = [];
  for (const line of readFileSync(sourceFile, 'utf8').split('\n')) {
    const match = EQUATE.exec(line);
    if (!match) continue;
    const value = match[2].startsWith('$') ? parseInt(match[2].slice(1), 16) : Number(match[2]);
    entries.push({ name: match[1], text: match[2], value, comment: match[3] ?? '' });
  }
  const groups = plan.files.map(() => []);
  for (const entry of entries) {
    const index = plan.files.findIndex((file) => entry.value >= file.min && entry.value <= file.max);
    if (index < 0) throw new Error(`符号 ${entry.name} = ${entry.text} 不在任何范围里`);
    groups[index].push(entry);
  }

  const before = buildBios(projectDir, totalPages);
  const targets = plan.files.map((file) => path.join(projectDir, 'src', file.path));
  const restore = snapshot([manifestFile, sourceFile, ...targets]);
  try {
    plan.files.forEach((file, index) => {
      const sorted = groups[index].map((entry, order) => ({ entry, order })).sort((a, b) => a.entry.value - b.entry.value || a.order - b.order).map((item) => item.entry);
      const width = Math.max(0, ...sorted.map((entry) => entry.name.length)) + 1;
      const rows = sorted.map((entry) => `${entry.name.padEnd(width)}= ${entry.text}${entry.comment ? ` ${entry.comment}` : ''}`);
      const head = renderHeader(path.basename(file.path), file.description, file.note ?? '符号定义，不占 ROM 空间', date);
      mkdirSync(path.dirname(targets[index]), { recursive: true });
      writeFileSync(targets[index], [...head, '', ...rows, ''].join('\n'));
    });
    if (!targets.includes(sourceFile)) rmSync(sourceFile);
    manifest.includes.splice(manifest.includes.indexOf(plan.equates), 1, ...plan.files.map((file) => `src/${file.path}`));
    writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    const after = buildBios(projectDir, totalPages);
    if (!before.equals(after)) throw new Error('拆分后构建结果与拆分前不一致');
  } catch (error) {
    restore();
    throw error;
  }
  return plan.files.map((file) => `src/${file.path}`);
}

if (process.argv[1] && path.basename(process.argv[1]) === 'bios-split.mjs') {
  const planFile = process.argv[2];
  if (!planFile) {
    console.error('用法：node tools/bios-split.mjs <方案.json>');
    process.exit(2);
  }
  const plan = JSON.parse(readFileSync(planFile, 'utf8'));
  const written = plan.equates ? splitEquates(BIOS_DIR, plan) : splitSource(BIOS_DIR, plan);
  console.log(`已拆成 ${written.length} 个文件，构建结果不变：\n${written.join('\n')}`);
}
