// ------------------------------------------------------------------------
// 名称：bios-localize.mjs
// 说明：把反汇编留下的自动名标签（K_C030、P58_8303 这类）里“只被同一例程内的分支和跳转引用”的，改成局部标签 @名字，其余自动名原样保留，留给人工命名。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-10
// 备注：用法 node tools/bios-localize.mjs [--dry] [--drop-unreferenced] [--keep=名字,名字]；--dry 只统计，不写文件；--drop-unreferenced 把没有任何引用的自动名（只是位置标记）一并删除，--keep 列出要保留的。
//       可以改成局部标签的条件：自动名，被引用过，每处引用都是同一文件里的 Bxx 或 JMP，且引用处与定义处在同一个作用域（作用域按“前一个保留的全局标签”划分，保留的标签增加后重新判断，直到稳定）。
//       局部标签的名字只按位置与后续指令给出通用的角色名（@loop 往回跳的目标；@return、@return_set、@return_clear 后面是 RTS、SEC RTS、CLC RTS；@skip 其余向前跳的目标），同一作用域里重名时加序号；含义更具体的名字在整理各模块时手工改。
//       改完重新构建，ROM 必须与改前逐字节一致，否则恢复原状。
// ------------------------------------------------------------------------
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BIOS_DIR, buildBios } from './bios-build.mjs';
import { readManifest, sourceList } from './bios-project.mjs';

const AUTO_LABEL = /^(K|P[0-9A-F]{2})_[0-9A-F]{4}$/;
const BRANCHES = new Set(['BCC', 'BCS', 'BEQ', 'BMI', 'BNE', 'BPL', 'BVC', 'BVS']);
const LABEL_DEF = /^([A-Za-z_@][A-Za-z0-9_]*):/;
const IDENTIFIER = /(?<![A-Za-z0-9_@$])[A-Za-z_][A-Za-z0-9_]*/g;
const TOKEN = /(?<![A-Za-z0-9_$])@?[A-Za-z_][A-Za-z0-9_]*/g;

/** 一行里注释开始的位置（字符串里的分号不算）；没有注释时返回行长 */
function commentStart(line) {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inString = !inString;
    else if (line[i] === ';' && !inString) return i;
  }
  return line.length;
}

/**
 * 判断哪些自动名可以改成局部标签，并给出新名。
 * @param {{name: string, text: string}[]} files 汇编源文件（不含符号定义文件）
 * @param {{dropUnreferenced?: boolean, keep?: string[]}} [options] dropUnreferenced：没有任何引用的自动名只是位置标记，直接删掉（keep 里的除外）
 * @returns {{renames: Map<string, string>, drops: Set<string>, kept: number, total: number}} renames：旧名 → 新名（写作 @名字）；drops：要删除的无引用标签；kept：保留为全局的自动名数；total：自动名总数
 */
export function planLocalLabels(files, { dropUnreferenced = false, keep = [] } = {}) {
  const lines = files.map((file) => file.text.split('\n'));
  const defs = new Map();
  const refs = new Map();
  const keptLines = lines.map(() => new Set());
  const existingLocals = [];
  lines.forEach((fileLines, fileIndex) => {
    let oldScope = -1;
    fileLines.forEach((line, lineIndex) => {
      const def = LABEL_DEF.exec(line);
      if (def && def[1].startsWith('@')) existingLocals.push({ fileIndex, lineIndex, name: def[1], oldScope });
      if (def && !def[1].startsWith('@')) {
        oldScope = lineIndex;
        if (AUTO_LABEL.test(def[1])) defs.set(def[1], { fileIndex, lineIndex });
        else keptLines[fileIndex].add(lineIndex);
      }
      const code = line.slice(0, commentStart(line)).replace(LABEL_DEF, '').replace(/"[^"]*"/g, (text) => ' '.repeat(text.length));
      const ins = /^\s*([A-Z]{3})\s+(\S+)\s*$/.exec(code);
      const branchOperand = ins && (BRANCHES.has(ins[1]) || ins[1] === 'JMP') ? ins[2] : null;
      for (const [name] of code.matchAll(IDENTIFIER)) {
        if (!AUTO_LABEL.test(name)) continue;
        if (!refs.has(name)) refs.set(name, []);
        refs.get(name).push({ fileIndex, lineIndex, branch: branchOperand === name });
      }
    });
  });

  const candidates = new Set();
  const drops = new Set();
  for (const [name, def] of defs) {
    const list = refs.get(name) ?? [];
    if (list.length === 0 && dropUnreferenced && !keep.includes(name)) drops.add(name);
    else if (list.length > 0 && list.every((ref) => ref.branch && ref.fileIndex === def.fileIndex)) candidates.add(name);
    else keptLines[def.fileIndex].add(def.lineIndex);
  }

  const scopeOf = (fileIndex, lineIndex) => {
    let best = -1;
    for (const line of keptLines[fileIndex]) if (line < lineIndex && line > best) best = line;
    return best;
  };
  for (let changed = true; changed;) {
    changed = false;
    for (const name of [...candidates]) {
      const def = defs.get(name);
      const scope = scopeOf(def.fileIndex, def.lineIndex);
      if (scope < 0 || refs.get(name).some((ref) => scopeOf(ref.fileIndex, ref.lineIndex) !== scope)) {
        candidates.delete(name);
        keptLines[def.fileIndex].add(def.lineIndex);
        changed = true;
      }
    }
  }

  // 同一作用域里的局部标签不能重名：已有的局部标签先定名（删掉全局标签后两个作用域合并，重名的后一个加序号），再给新改成局部的定名
  const usedNames = new Map();
  const take = (scopeKey, desired) => {
    const used = usedNames.get(scopeKey) ?? new Set();
    usedNames.set(scopeKey, used);
    let name = desired;
    for (let n = 2; used.has(name); n++) name = `${desired.replace(/\d+$/, '')}${n}`;
    used.add(name);
    return name;
  };
  const localRenames = lines.map(() => new Map());
  for (const local of existingLocals) {
    const final = take(`${local.fileIndex}:${scopeOf(local.fileIndex, local.lineIndex)}`, local.name);
    if (final !== local.name) localRenames[local.fileIndex].set(`${local.oldScope}:${local.name}`, final);
  }
  const renames = new Map();
  const ordered = [...candidates].sort((a, b) => {
    const da = defs.get(a);
    const db = defs.get(b);
    return da.fileIndex - db.fileIndex || da.lineIndex - db.lineIndex;
  });
  for (const name of ordered) {
    const def = defs.get(name);
    const fileLines = lines[def.fileIndex];
    const backward = refs.get(name).some((ref) => ref.lineIndex > def.lineIndex);
    const next = [];
    for (let i = def.lineIndex + 1; i < fileLines.length && next.length < 2; i++) {
      const code = fileLines[i].slice(0, commentStart(fileLines[i])).trim();
      if (code === '' || LABEL_DEF.test(code)) continue;
      next.push(code.split(/\s+/)[0]);
    }
    let base = 'skip';
    if (backward) base = 'loop';
    else if (next[0] === 'RTS' || next[0] === 'RTI') base = 'return';
    else if ((next[0] === 'SEC' || next[0] === 'CLC') && next[1] === 'RTS') base = next[0] === 'SEC' ? 'return_set' : 'return_clear';
    renames.set(name, take(`${def.fileIndex}:${scopeOf(def.fileIndex, def.lineIndex)}`, `@${base}`));
  }
  return { renames, localRenames, drops, kept: defs.size - renames.size - drops.size, total: defs.size };
}

/**
 * 把代码部分里的旧名换成新名，注释与字符串不动。
 * @param {string} line 一行
 * @param {Map<string, string>} renames 自动名 → 新名
 * @param {Map<string, string>} localRenames “原作用域行号:局部标签” → 新名
 * @param {number} oldScope 这一行所在的原作用域（前一个全局标签的行号）
 */
function rewriteLine(line, renames, localRenames, oldScope) {
  const end = commentStart(line);
  const code = line.slice(0, end).split(/("[^"]*")/).map((part, index) => (index % 2 === 1 ? part : part.replace(TOKEN, (name) => (name.startsWith('@') ? localRenames.get(`${oldScope}:${name}`) : renames.get(name)) ?? name))).join('');
  return code + line.slice(end);
}

/**
 * 对清单里的全部源文件做局部化，构建结果必须不变。
 * @param {string} [projectDir] 工程目录
 * @param {{dry?: boolean, totalPages?: number, dropUnreferenced?: boolean, keep?: string[]}} [options] dry 只统计；totalPages 为构建时应覆盖的页数（测试用小工程才需要改）；dropUnreferenced 与 keep 见 planLocalLabels
 * @returns {{converted: number, dropped: number, kept: number, total: number}}
 */
export function localizeLabels(projectDir = BIOS_DIR, { dry = false, totalPages, dropUnreferenced = false, keep = [] } = {}) {
  const manifest = readManifest(projectDir);
  const includes = new Set(manifest.includes ?? []);
  const names = sourceList(manifest).map((file) => file.name).filter((name) => !includes.has(name));
  const originals = names.map((name) => readFileSync(path.join(projectDir, name), 'utf8'));
  const files = names.map((name, index) => ({ name, text: originals[index].replace(/\r\n/g, '\n') }));
  const { renames, localRenames, drops, kept, total } = planLocalLabels(files, { dropUnreferenced, keep });
  if (dry || renames.size + drops.size === 0) return { converted: renames.size, dropped: drops.size, kept, total };

  const before = buildBios(projectDir, totalPages);
  names.forEach((name, index) => {
    let oldScope = -1;
    const text = files[index].text
      .split('\n')
      .map((line, lineIndex) => {
        const def = LABEL_DEF.exec(line);
        if (def && !def[1].startsWith('@')) oldScope = lineIndex;
        if (def && drops.has(def[1])) return line.slice(def[0].length).trim() === '' ? null : line.slice(def[0].length);
        if (def && renames.has(def[1])) return `${renames.get(def[1])}:${rewriteLine(line.slice(def[0].length), renames, localRenames[index], oldScope)}`;
        return rewriteLine(line, renames, localRenames[index], oldScope);
      })
      .filter((line) => line !== null)
      .join('\n');
    writeFileSync(path.join(projectDir, name), text);
  });
  let same = false;
  try {
    same = before.equals(buildBios(projectDir, totalPages));
  } catch (error) {
    names.forEach((name, index) => writeFileSync(path.join(projectDir, name), originals[index]));
    throw error;
  }
  if (!same) {
    names.forEach((name, index) => writeFileSync(path.join(projectDir, name), originals[index]));
    throw new Error('局部化后 ROM 与改前不一致，已恢复原状');
  }
  return { converted: renames.size, dropped: drops.size, kept, total };
}

if (process.argv[1]?.endsWith('bios-localize.mjs')) {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const keepArg = args.find((arg) => arg.startsWith('--keep='));
  const result = localizeLabels(BIOS_DIR, { dry, dropUnreferenced: args.includes('--drop-unreferenced'), keep: keepArg ? keepArg.slice(7).split(',') : [] });
  console.log(`自动名 ${result.total} 个：改成局部标签 ${result.converted} 个，删除无引用标签 ${result.dropped} 个，保留 ${result.kept} 个${dry ? '（只统计，未写文件）' : ''}`);
}
