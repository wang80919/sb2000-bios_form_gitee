// ------------------------------------------------------------------------
// 名称：bios-build.mjs
// 说明：把 bios/ 工程里的汇编源文件与二进制资源拼成完整的 BIOS ROM（含 16 字节 iNES 文件头），并可与原始 ROM 逐字节比对。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-10
// 备注：用法 node tools/bios-build.mjs [--out 输出文件，默认 build/SB2K_BIOS.NES] [--no-compare] [--compare]
//       工程目录里有 .modified 文件时表示工程已经有意修改过 BIOS，默认不与原始 ROM 比对（但会报告差异摘要），加 --compare 强制比对。
//       --variant 名称：在默认构建结果上套用 variants.json 里的补丁（每项 { offset: ROM 偏移（不含文件头）, expect: 原字节, value: 新字节 }），
//       输出到 build/SB2K_BIOS_<名称大写>.NES，只用于调试（如 fastboot 跳过开机画面），不与原始 BIOS 比对。
//       清单文件 bios.json：{ "ines": 文件头十六进制, "includes": [符号定义文件], "parts": [...] }，parts 按页号顺序铺满 128 页，每项为
//       { "firstPage": 起始页, "pageCount": 页数, "base": 汇编起始地址, "sources": [汇编源文件…] } 或
//       { "firstPage": 起始页, "pageCount": 页数, "binary": 二进制文件 }；
//       sources 的第一个文件写 .org（起始地址等于 base），后面的文件接在它后面继续汇编，合起来的长度必须等于页数 × 4096。
//       includes 列出只含符号定义（NAME = 值）的文件，与源文件一起汇编，不占 ROM 空间。
// ------------------------------------------------------------------------
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PAGE_SIZE, assembleProject, readManifest } from './bios-project.mjs';

/** BIOS 工程目录（本文件所在 tools 的上一级） */
export const BIOS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 构建输出目录 */
export const BUILD_DIR = path.join(BIOS_DIR, 'build');

/** 原始 BIOS ROM（含 iNES 文件头），构建结果默认与它逐字节比对 */
export const ORIGINAL_ROM = path.join(BIOS_DIR, '..', 'reference', 'rom', 'SB2K_BIOS.NES');

/** ROM 总页数（512K / 4K） */
export const PAGE_COUNT = 128;

/** 表示工程已经有意修改过 BIOS 的标记文件名（在工程目录里） */
export const MODIFIED_MARKER = '.modified';

const INES_HEADER_SIZE = 16;

/**
 * 按清单构建 ROM。
 * @param {string} [projectDir] 工程目录
 * @param {number} [totalPages] 清单应覆盖的总页数（测试用小工程时才需要改）
 * @returns {Buffer} 含 iNES 文件头的完整 ROM
 */
export function buildBios(projectDir = BIOS_DIR, totalPages = PAGE_COUNT) {
  // 所有汇编源文件一起汇编，标签在文件之间共享
  const { manifest, assembled } = assembleProject(projectDir);

  const parts = [Buffer.from(manifest.ines, 'hex')];
  let nextPage = 0;
  for (const part of manifest.parts) {
    if (part.firstPage !== nextPage) throw new Error(`清单缺页或重叠：应从第 ${nextPage} 页开始，实际从第 ${part.firstPage} 页开始`);
    const expected = part.pageCount * PAGE_SIZE;
    let bytes;
    if (part.sources) {
      const first = part.sources[0];
      const segments = assembled.segments.filter((s) => s.source === first);
      if (segments.length !== 1) throw new Error(`${first}：这一部分必须只有一个 .org 段，实际 ${segments.length} 个`);
      if (segments[0].org !== part.base) throw new Error(`${first}：起始地址应为 $${part.base.toString(16)}，实际为 $${segments[0].org.toString(16)}`);
      bytes = Buffer.from(segments[0].bytes);
    } else {
      bytes = readFileSync(path.join(projectDir, part.binary));
    }
    if (bytes.length !== expected) throw new Error(`${part.sources?.[0] ?? part.binary}：长度应为 ${expected}，实际 ${bytes.length}`);
    parts.push(bytes);
    nextPage += part.pageCount;
  }
  if (nextPage !== totalPages) throw new Error(`清单只覆盖了 ${nextPage} 页，应为 ${totalPages} 页`);
  return Buffer.concat(parts);
}

/**
 * 找出两个缓冲区第一个不同的位置。
 * @param {Buffer} a 缓冲区
 * @param {Buffer} b 缓冲区
 * @returns {number} 位置；完全相同返回 -1
 */
export function firstDifference(a, b) {
  if (a.length !== b.length) return Math.min(a.length, b.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

/**
 * 统计两个缓冲区不同的字节数与所在的 ROM 页（不含文件头）。
 * @param {Buffer} a 缓冲区
 * @param {Buffer} b 缓冲区
 * @returns {{count: number, pages: number[]}}
 */
export function diffSummary(a, b) {
  const pages = new Set();
  let count = Math.abs(a.length - b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    count++;
    pages.add(Math.floor(Math.max(0, i - INES_HEADER_SIZE) / PAGE_SIZE));
  }
  return { count, pages: [...pages] };
}

/**
 * 在构建好的 ROM 上套用变体补丁，返回新缓冲区，不改原缓冲区。
 * @param {Buffer} rom 含 iNES 文件头的完整 ROM
 * @param {Record<string, {patches: {offset: string, expect: string, value: string}[]}>} variants variants.json 的内容
 * @param {string} name 变体名
 * @returns {{rom: Buffer, patched: number}} 补丁后的 ROM与改动的字节数
 */
export function applyVariant(rom, variants, name) {
  const variant = variants[name];
  if (!variant) throw new Error(`未知的变体：${name}，可用：${Object.keys(variants).join('、')}`);
  const result = Buffer.from(rom);
  let patched = 0;
  for (const { offset, expect, value } of variant.patches) {
    const at = INES_HEADER_SIZE + Number(offset);
    const want = Buffer.from(expect, 'hex');
    const next = Buffer.from(value, 'hex');
    if (want.length !== next.length) throw new Error(`补丁 ${offset}：expect 与 value 长度不同`);
    if (!result.subarray(at, at + want.length).equals(want)) throw new Error(`补丁 ${offset}：原有内容与 expect 不符，源码可能已改动`);
    next.copy(result, at);
    patched += next.length;
  }
  return { rom: result, patched };
}

if (process.argv[1] && path.basename(process.argv[1]) === 'bios-build.mjs') {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const variantIndex = args.indexOf('--variant');
  const variantName = variantIndex >= 0 ? args[variantIndex + 1] : null;
  const defaultName = variantName ? `SB2K_BIOS_${variantName.toUpperCase()}.NES` : 'SB2K_BIOS.NES';
  const target = outIndex >= 0 ? args[outIndex + 1] : path.join(BUILD_DIR, defaultName);
  const rom = buildBios();
  if (variantName) {
    const variants = JSON.parse(readFileSync(path.join(BIOS_DIR, 'variants.json'), 'utf8'));
    const result = applyVariant(rom, variants, variantName);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, result.rom);
    console.log(`已生成变体 ${variantName}：${target}，相对默认构建改动 ${result.patched} 个字节（仅用于调试，不与原始 BIOS 比对）`);
    process.exit(0);
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, rom);
  console.log(`已生成 ${target}，${rom.length} 字节`);
  const modified = existsSync(path.join(BIOS_DIR, MODIFIED_MARKER));
  if (!args.includes('--no-compare')) {
    const original = readFileSync(ORIGINAL_ROM);
    const diff = firstDifference(rom, original);
    if (diff < 0) console.log('与原始 BIOS 逐字节一致');
    else if (modified && !args.includes('--compare')) {
      const { count, pages } = diffSummary(rom, original);
      console.log(`修改版：与原始 BIOS 有 ${count} 个字节不同，分布在 ROM 第 ${pages.map((p) => p.toString(16).toUpperCase().padStart(2, '0')).join('、')} 页`);
    } else {
      console.error(`与原始 BIOS 不一致，第一个差异在偏移 0x${diff.toString(16)}`);
      process.exitCode = 1;
    }
  }
}
