// ------------------------------------------------------------------------
// 名称：bios-font.mjs
// 说明：BIOS 里字库的读取、显示与修改：GB2312 汉字 16×16 点阵与 ASCII 8×16 点阵。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/bios-font.mjs show <字符，或 0x十六进制码>；
//       node tools/bios-font.mjs set <字符，或 0x十六进制码> <图案文件>（图案文件每行一行点阵，# 为亮点，. 为空，汉字 16 行 16 列，ASCII 16 行 8 列）。
//       汉字字库按 BIOS 实际使用的位置（用 verify/cases/p08-text.mjs 验证）：第 16-87 区从 ROM $1C000 起，偏移 = $1C000 + ((区-16)×94 + (位-1)) × 32；
//       第 1-9 区符号从 $51700 起，偏移 = $51700 + ((区-1)×94 + (位-1)) × 32；第 10-15 区不在字库里；每个字 32 字节，
//       前 16 字节是每行左半边的 8 个点，后 16 字节是每行右半边的 8 个点，高位在左；
//       ASCII 字库在 ROM 第 $51 页，每个字符 16 字节（每行 8 点，高位在左），第一个字符是码 $10，所以偏移 = (码 - $10) × 16。
//       set 直接改 bios/assets 里的二进制资源，字库所在的页还没转成汇编时才能用。
// ------------------------------------------------------------------------
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BIOS_DIR, buildBios } from '../../bios/tools/bios-build.mjs';
import { PAGE_SIZE } from './bios-listing.mjs';

/** 汉字区 16-87 的起始位置与最大区号；符号区 1-9 的起始位置 */
export const HANZI_FIRST_ROW = 16;
export const HANZI_BASE = 0x1c000;
export const HANZI_MAX_ROW = 87;
export const SYMBOL_LAST_ROW = 9;
export const SYMBOL_BASE = 0x51700;

/** ASCII 字库所在页与它的第一个字符码 */
export const ASCII_PAGE = 0x51;
export const ASCII_FIRST_CODE = 0x10;

const INES_HEADER = 16;

/**
 * 汉字的区位码换算为字库在 ROM 里的偏移（不含文件头）。
 * @param {number} code GB2312 内码，如 0xC4E3
 * @returns {number}
 */
export function hanziOffset(code) {
  const row = (code >> 8) - 0xa0;
  const cell = (code & 0xff) - 0xa0;
  if (row < 1 || row > HANZI_MAX_ROW || (row > SYMBOL_LAST_ROW && row < HANZI_FIRST_ROW) || cell < 1 || cell > 94) throw new Error(`不在字库范围内的汉字码：0x${code.toString(16)}`);
  if (row <= SYMBOL_LAST_ROW) return SYMBOL_BASE + ((row - 1) * 94 + (cell - 1)) * 32;
  return HANZI_BASE + ((row - HANZI_FIRST_ROW) * 94 + (cell - 1)) * 32;
}

/**
 * ASCII 字符码换算为字库在 ROM 里的偏移。
 * @param {number} code 字符码，$10-$FF
 * @returns {number}
 */
export function asciiOffset(code) {
  if (code < ASCII_FIRST_CODE || code > 0xff) throw new Error(`不在字库范围内的 ASCII 码：0x${code.toString(16)}`);
  return ASCII_PAGE * PAGE_SIZE + (code - ASCII_FIRST_CODE) * 16;
}

/**
 * 点阵字节转成图案（每行一个字符串，# 为亮点）。
 * @param {Uint8Array} bytes 汉字 32 字节或 ASCII 16 字节
 * @returns {string[]}
 */
export function decodeGlyph(bytes) {
  const bits = (byte) => [...Array(8)].map((_, i) => ((byte >> (7 - i)) & 1 ? '#' : '.')).join('');
  if (bytes.length === 32) return Array.from({ length: 16 }, (_, r) => bits(bytes[r]) + bits(bytes[16 + r]));
  if (bytes.length === 16) return Array.from({ length: 16 }, (_, r) => bits(bytes[r]));
  throw new Error(`点阵长度应为 16 或 32 字节，实际 ${bytes.length}`);
}

/**
 * 图案转成点阵字节。
 * @param {string[]} rows 16 行；汉字每行 16 列，ASCII 每行 8 列
 * @returns {Uint8Array}
 */
export function encodeGlyph(rows) {
  if (rows.length !== 16) throw new Error(`图案应有 16 行，实际 ${rows.length} 行`);
  const width = rows[0].length;
  if (width !== 8 && width !== 16) throw new Error(`图案每行应为 8 列（ASCII）或 16 列（汉字），实际 ${width} 列`);
  const toByte = (text) => [...text].reduce((value, ch, i) => value | (ch === '#' ? 0x80 >> i : 0), 0);
  const result = new Uint8Array(width * 2);
  rows.forEach((row, r) => {
    if (row.length !== width || /[^#.]/.test(row)) throw new Error(`第 ${r + 1} 行应是 ${width} 个 # 或 .：${row}`);
    result[r] = toByte(row.slice(0, 8));
    if (width === 16) result[16 + r] = toByte(row.slice(8));
  });
  return result;
}

let gb2312Table = null;

/**
 * 汉字（或符号）的 GB2312 内码。
 * @param {string} char 单个字符
 * @returns {number|null} 内码；GB2312 里没有时为 null
 */
export function gb2312Code(char) {
  if (!gb2312Table) {
    const decoder = new TextDecoder('gb18030');
    gb2312Table = new Map();
    for (let high = 0xa1; high <= 0xf7; high++) {
      for (let low = 0xa1; low <= 0xfe; low++) {
        const text = decoder.decode(Uint8Array.from([high, low]));
        if (text.length === 1 && text !== '\ufffd' && !gb2312Table.has(text)) gb2312Table.set(text, (high << 8) | low);
      }
    }
  }
  return gb2312Table.get(char) ?? null;
}

/**
 * 解析命令行里的字符：单个字符，或 0x 开头的十六进制码。
 * @param {string} text 参数
 * @returns {{kind: 'hanzi'|'ascii', code: number, offset: number}}
 */
export function locateGlyph(text) {
  let code;
  if (/^0x[0-9a-f]+$/i.test(text)) code = parseInt(text, 16);
  else if ([...text].length === 1) code = text.charCodeAt(0) < 0x80 ? text.charCodeAt(0) : gb2312Code(text);
  if (code === null || code === undefined) throw new Error(`无法确定字符的码：${text}`);
  return code >= 0x100 ? { kind: 'hanzi', code, offset: hanziOffset(code) } : { kind: 'ascii', code, offset: asciiOffset(code) };
}

/**
 * 取字符的点阵字节。
 * @param {Uint8Array} rom ROM 内容（不含文件头）
 * @param {{kind: string, offset: number}} glyph 字符位置
 * @returns {Uint8Array}
 */
export function readGlyph(rom, glyph) {
  return rom.subarray(glyph.offset, glyph.offset + (glyph.kind === 'hanzi' ? 32 : 16));
}

/**
 * 把点阵写进工程里对应的二进制资源。
 * @param {{kind: string, offset: number}} glyph 字符位置
 * @param {Uint8Array} bytes 点阵字节
 * @param {string} [projectDir] 工程目录
 */
export function writeGlyph(glyph, bytes, projectDir = BIOS_DIR) {
  const page = Math.floor(glyph.offset / PAGE_SIZE);
  const manifest = JSON.parse(readFileSync(path.join(projectDir, 'bios.json'), 'utf8'));
  const part = manifest.parts.find((p) => p.firstPage <= page && page < p.firstPage + p.pageCount);
  if (!part?.binary) throw new Error(`第 ${page.toString(16).toUpperCase()} 页不是二进制资源，请直接改对应的汇编源文件`);
  const file = path.join(projectDir, part.binary);
  const data = readFileSync(file);
  data.set(bytes, glyph.offset - part.firstPage * PAGE_SIZE);
  writeFileSync(file, data);
}

if (process.argv[1]?.endsWith('bios-font.mjs')) {
  const [command, glyphText, patternFile] = process.argv.slice(2);
  if (!['show', 'set'].includes(command) || !glyphText || (command === 'set' && !patternFile)) {
    console.error('用法：node tools/bios-font.mjs show <字符|0x码>  或  set <字符|0x码> <图案文件>');
    process.exit(2);
  }
  const glyph = locateGlyph(glyphText);
  if (command === 'show') {
    const rom = buildBios().subarray(INES_HEADER);
    console.log(`${glyph.kind === 'hanzi' ? '汉字' : 'ASCII'} 码 0x${glyph.code.toString(16).toUpperCase()}，ROM 偏移 0x${glyph.offset.toString(16).toUpperCase()}`);
    console.log(decodeGlyph(readGlyph(rom, glyph)).join('\n'));
  } else {
    const rows = readFileSync(patternFile, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '');
    writeGlyph(glyph, encodeGlyph(rows));
    console.log('已写入字库，请重新构建');
  }
}
