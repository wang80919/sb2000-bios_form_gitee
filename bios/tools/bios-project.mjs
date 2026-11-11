// ------------------------------------------------------------------------
// 名称：bios-project.mjs
// 说明：BIOS 工程的公共读取：清单、源文件列表、整个工程的汇编结果，以及“源码行 → ROM 地址”的映射。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-10
// 备注：清单 bios.json 的每个汇编部分用 sources 列出若干个源文件，第一个文件写 .org，后面的文件接在它后面继续汇编，合起来占满该部分的页数；
//       构建、覆盖率、规格表等工具都从这里取源文件与地址，不再靠源码行尾的地址注释。
// ------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { assemble } from './asm6502.mjs';

/** ROM 一页的字节数 */
export const PAGE_SIZE = 4096;

/**
 * 读取清单。
 * @param {string} projectDir 工程目录（含 bios.json）
 * @returns {{ines: string, includes?: string[], parts: {firstPage: number, pageCount: number, base?: number, sources?: string[], binary?: string}[]}}
 */
export function readManifest(projectDir) {
  return JSON.parse(readFileSync(path.join(projectDir, 'bios.json'), 'utf8'));
}

/**
 * 清单里所有汇编源文件，顺序是：符号定义文件在前，再按部分与文件顺序。
 * @param {ReturnType<typeof readManifest>} manifest 清单
 * @returns {{name: string, continues: boolean}[]} continues 为 true 表示接在同一部分前一个文件之后
 */
export function sourceList(manifest) {
  const list = (manifest.includes ?? []).map((name) => ({ name, continues: false }));
  for (const part of manifest.parts) (part.sources ?? []).forEach((name, index) => list.push({ name, continues: index > 0 }));
  return list;
}

/**
 * 读入清单里所有汇编源文件的内容。
 * @param {string} projectDir 工程目录
 * @param {ReturnType<typeof readManifest>} [manifest] 已读入的清单
 * @returns {{name: string, continues: boolean, text: string}[]}
 */
export function loadSources(projectDir, manifest = readManifest(projectDir)) {
  return sourceList(manifest).map((file) => ({ ...file, text: readFileSync(path.join(projectDir, file.name), 'utf8') }));
}

/**
 * 按文件与行号建立映射：每条产生字节的语句对应的运行地址、ROM 偏移（不含 iNES 文件头）、长度与种类。
 * @param {ReturnType<typeof readManifest>} manifest 清单
 * @param {ReturnType<typeof assemble>} assembled 汇编结果
 * @returns {Map<string, Map<number, {address: number, offset: number, length: number, kind: string}>>} 文件名 → 行号（从 1 起）→ 位置
 */
export function buildLineMap(manifest, assembled) {
  const map = new Map();
  for (const part of manifest.parts) {
    if (!part.sources) continue;
    const segment = assembled.segments.find((s) => s.source === part.sources[0]);
    if (!segment) continue;
    const base = part.firstPage * PAGE_SIZE;
    for (const item of segment.lines) {
      const colon = item.where.lastIndexOf(':');
      const file = item.where.slice(0, colon);
      if (!map.has(file)) map.set(file, new Map());
      map.get(file).set(Number(item.where.slice(colon + 1)), { address: item.address, offset: base + item.start, length: item.length, kind: item.kind });
    }
  }
  return map;
}

/**
 * 汇编整个工程。
 * @param {string} projectDir 工程目录
 * @returns {{manifest: ReturnType<typeof readManifest>, sources: ReturnType<typeof loadSources>, assembled: ReturnType<typeof assemble>, lineMap: ReturnType<typeof buildLineMap>}}
 */
export function assembleProject(projectDir) {
  const manifest = readManifest(projectDir);
  const sources = loadSources(projectDir, manifest);
  const assembled = assemble(sources);
  return { manifest, sources, assembled, lineMap: buildLineMap(manifest, assembled) };
}

/**
 * 供分析工具（规格表、数据区清单）使用的输入：符号定义文本，以及每个汇编源文件的文本与“行号 → 位置”映射。
 * @param {string} projectDir 工程目录
 * @returns {{equatesText: string, files: {name: string, text: string, positions: Map<number, {address: number, offset: number, length: number, kind: string}>}[]}} name 是相对 src/ 的文件名
 */
export function analysisInput(projectDir) {
  const { manifest, sources, lineMap } = assembleProject(projectDir);
  const includes = new Set(manifest.includes ?? []);
  return {
    equatesText: sources.filter((s) => includes.has(s.name)).map((s) => s.text).join('\n'),
    files: sources.filter((s) => !includes.has(s.name)).map((s) => ({ name: s.name.replace(/^src\//, ''), text: s.text, positions: lineMap.get(s.name) ?? new Map() })),
  };
}
