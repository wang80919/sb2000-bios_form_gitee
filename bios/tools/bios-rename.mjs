// ------------------------------------------------------------------------
// 名称：bios-rename.mjs
// 说明：给 bios/ 工程里的标签与符号改名：在清单列出的所有汇编源文件（含符号定义文件）里整词替换。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-10
// 备注：用法 node tools/bios-rename.mjs <旧名> <新名> [<旧名> <新名> …]，或 --file <映射文件>；
//       映射文件每行“旧名 新名 [注释]”，# 开头为注释行；注释里用“|”分成多行，会写在新名标签定义行的上方（符号定义行写在同一行末尾）；
//       新名必须是合法标识符且工程里还没有；改名后会重新汇编，确认工程仍能构建，失败则不写入任何文件。
// ------------------------------------------------------------------------
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { assemble, isLabelName } from './asm6502.mjs';
import { BIOS_DIR } from './bios-build.mjs';
import { readManifest, sourceList } from './bios-project.mjs';

/** 清单里所有汇编源文件（符号定义文件在前） */
function sourceFiles(projectDir) {
  return sourceList(readManifest(projectDir)).map((file) => file.name);
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 把符号定义行的等号与注释对齐，名字长度不同时保持整齐 */
function alignEquates(text) {
  const pattern = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\$[0-9A-Fa-f]+)(\s*;.*)?$/;
  const lines = text.split('\n');
  const width = Math.max(0, ...lines.map((line) => pattern.exec(line)?.[1].length ?? 0)) + 1;
  return lines.map((line) => {
    const match = pattern.exec(line);
    return match ? `${match[1].padEnd(width)}= ${match[2]}${match[3] ? ` ;${match[3].replace(/^\s*;/, '')}` : ''}` : line;
  }).join('\n');
}

/** 在名字的定义行上方写注释；定义是 NAME = 值 时写在行末 */
function addComment(files, name, comment) {
  const lines = comment.split('|').map((part) => part.trim()).filter((part) => part !== '');
  const label = new RegExp(`^${escapeRegExp(name)}:`, 'm');
  const equate = new RegExp(`^(${escapeRegExp(name)}\\s*=.*)$`, 'm');
  for (const file of files) {
    if (label.test(file.text)) {
      file.text = file.text.replace(label, (match) => `${lines.map((line) => `; ${line}`).join('\n')}\n${match}`);
      return;
    }
    if (equate.test(file.text)) {
      file.text = file.text.replace(equate, (match) => `${match.replace(/\s*;.*$/, '')} ; ${lines.join('；')}`);
      return;
    }
  }
  throw new Error(`找不到 ${name} 的定义，无法写注释`);
}

/**
 * 批量改名。
 * @param {[string, string, string?][]} pairs 旧名、新名与可选的注释
 * @param {string} [projectDir] 工程目录
 * @returns {Map<string, number>} 每个旧名被替换的次数
 */
export function renameSymbols(pairs, projectDir = BIOS_DIR) {
  const files = sourceFiles(projectDir).map((name) => ({ name, text: readFileSync(path.join(projectDir, name), 'utf8') }));
  const all = files.map((f) => f.text).join('\n');
  const counts = new Map();

  for (const [from, to, comment] of pairs) {
    if (!isLabelName(to)) throw new Error(`新名不是合法标识符：${to}`);
    const fromPattern = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(from)}(?![A-Za-z0-9_])`, 'g');
    const toPattern = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(to)}(?![A-Za-z0-9_])`);
    if (!fromPattern.test(all)) throw new Error(`工程里找不到：${from}`);
    if (toPattern.test(files.map((f) => f.text.replace(/;.*$/gm, '')).join('\n'))) throw new Error(`新名已存在：${to}`);
    let count = 0;
    for (const file of files) {
      file.text = file.text.replace(fromPattern, () => {
        count++;
        return to;
      });
    }
    counts.set(from, count);
    if (comment) addComment(files, to, comment);
  }

  // 先汇编，通过了才写回
  const manifest = readManifest(projectDir);
  const manifestIncludes = new Set(manifest.includes ?? []);
  const continuing = new Set(sourceList(manifest).filter((file) => file.continues).map((file) => file.name));
  for (const file of files) if (manifestIncludes.has(file.name)) file.text = alignEquates(file.text);
  assemble(files.map((file) => ({ ...file, continues: continuing.has(file.name) })));
  for (const file of files) writeFileSync(path.join(projectDir, file.name), file.text);
  return counts;
}

if (process.argv[1]?.endsWith('bios-rename.mjs')) {
  const args = process.argv.slice(2);
  let pairs = [];
  if (args[0] === '--file') {
    pairs = readFileSync(args[1], 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'))
      .map((line) => {
        const [from, to, ...rest] = line.split(/\s+/);
        return rest.length > 0 ? [from, to, rest.join(' ')] : [from, to];
      });
  } else {
    for (let i = 0; i + 1 < args.length; i += 2) pairs.push([args[i], args[i + 1]]);
  }
  if (pairs.length === 0 || pairs.some((p) => p.length < 2)) {
    console.error('用法：node tools/bios-rename.mjs <旧名> <新名> […]  或  --file <映射文件>');
    process.exit(2);
  }
  for (const [name, count] of renameSymbols(pairs)) console.log(`${name}：${count} 处`);
}
