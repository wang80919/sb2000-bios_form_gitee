// ------------------------------------------------------------------------
// 名称：bios-data.mjs
// 说明：BIOS 数据区清单：解析 bios/ 工程源文件里所有 .byte/.word/.ascii 数据块与 bios/assets 里的二进制资源，给每块归类（填充、字符串、地址表、已说明的表、数据待查），列出引用它的例程，输出 JSON 与 Markdown 清单。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/bios-data.mjs [--json 输出文件] [--md 输出文件]；没有参数时只在终端打印汇总。
//       归类顺序：bios/data-notes.json 里人工登记的说明（按 ROM 偏移范围覆盖，与源文件怎么拆分无关）→ 块前的注释与标签 → 内容特征（全同字节、可见字符、地址表）→ 待说明。
//       块的起始地址取自汇编器给出的“行号→地址”映射，没有映射时退回到行尾的 “; $地址” 注释。
//       “引用者”按标签名在源文件里做文本搜索，取包含该标签的指令所在的最近的例程标签；只能找到按标签引用的数据，按数字地址或指针算出来的引用找不到。
// ------------------------------------------------------------------------
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { analysisInput } from '../../bios/tools/bios-project.mjs';
import { BIOS_DIR } from './config.mjs';

const NOTES_FILE = path.join(BIOS_DIR, 'data-notes.json');

/** 二进制资源按页登记：页号范围 → 种类、格式、说明（来源见 docs/工程说明.md 第 4 节页地图） */
export const ASSET_REGIONS = [
  { file: 'assets/p03-p03.bin', firstPage: 0x03, pages: 1, kind: '字符串与表', format: '消息号表加字符串（如 AUTOEXEC.BAT、<DIR>）', description: '页 03：DOS 外壳消息表，LIB_PRINT_MESSAGE 把它映射到 $B000，按消息号在 $B200（小字体）或 $B500（大字体）的 3 字节表（页号、地址低、地址高）里查字符串' },
  { file: 'assets/p10-p57.bin', firstPage: 0x10, pages: 0x40, kind: '字库', format: 'GB2312 汉字 16×16 点阵（每字 32 字节，前 16 字节每行左半边、后 16 字节右半边）与 ASCII 点阵：汉字区 16-87 从 $1C000、ASCII 8×8 从 $50E00、ASCII 8×16 从 $51100、符号区 1-9 从 $51700；页 10-1B 是输入法拼音词库（索引表每项 2 字节，候选字表以 $FF 结束，见 ime-dictionary-lookup.asm），不是字库', description: '页 10-4F' },
  { file: 'assets/p10-p57.bin', firstPage: 0x50, pages: 1, kind: '字库', format: 'GB2312 汉字区 16-87 的末尾（到 $50DFF）与 ASCII 8×8 点阵（从 $50E00，码 $20-$7F）', description: '页 50' },
  { file: 'assets/p10-p57.bin', firstPage: 0x51, pages: 1, kind: '字库', format: 'ASCII 8×16 点阵（从 $51100，码 $20-$7F）与符号区的开头（从 $51700）', description: '页 51' },
  { file: 'assets/p10-p57.bin', firstPage: 0x52, pages: 6, kind: '字库', format: 'GB2312 符号区 1-9 的 16×16 点阵（每字 32 字节，位置公式见 系统调用手册 $3B 一行）', description: '页 52-57' },
  { file: 'assets/p63-p77.bin', firstPage: 0x63, pages: 1, kind: '字符串', format: 'DOS 命令帮助文字（英文）', description: '页 63' },
  { file: 'assets/p63-p77.bin', firstPage: 0x64, pages: 0x14, kind: 'WAV 音频', format: 'RIFF/WAVE，单声道 8 位 PCM 22050 Hz，81277 字节，从页 64 开始', description: '页 64-77，播放见 $65/$0C' },
  { file: 'assets/p79-p7F.bin', firstPage: 0x79, pages: 7, kind: '压缩图片', format: '10 张压缩图片：10 字节头 + 图案流（16 字节字典 + 指令流）+ 映射流 + 调色板，格式见 tools/decode-img.mjs', description: '页 79-7F，与页 78 的 BOOT_IMAGE_TABLE 配套' },
];

const PAGE = 4096;

/** 十六进制字节 token */
const HEX_BYTE = /^\$([0-9A-Fa-f]{1,2})$/;

/** 解析 .ascii "…" 里的字符串，返回字节数组（支持 \r \n \0 \xHH \\ \"） */
function asciiBytes(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '\\') {
      bytes.push(ch.charCodeAt(0));
      continue;
    }
    const next = text[++i];
    if (next === 'x') {
      bytes.push(parseInt(text.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push({ r: 13, n: 10, 0: 0, t: 9 }[next] ?? next.charCodeAt(0));
    }
  }
  return bytes;
}

/** 把一行语句拆成代码部分与行尾注释：分号在双引号字符串里不算注释 */
function splitComment(text) {
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    if (inString && text[i] === '\\') i++;
    else if (text[i] === '"') inString = !inString;
    else if (text[i] === ';' && !inString) return { code: text.slice(0, i).trimEnd(), comment: text.slice(i + 1) };
  }
  return { code: text.trimEnd(), comment: '' };
}

/**
 * 解析一个汇编源文件里的数据块。连续的数据行是一个块，标签、注释、指令都会结束上一个块。
 * @param {string} text 源文件内容
 * @param {string} file 文件名（用于报告）
 * @param {Map<number, {address: number}>} [positions] 汇编器给出的“行号→地址”映射；没有时退回到行尾的 “; $地址” 注释
 * @returns {{file: string, start: number|null, offset: number|null, line: number, size: number, bytes: number[]|null, words: string[]|null, labels: string[], comment: string, tag: string}[]} start 是运行地址，offset 是 ROM 偏移（不含文件头）
 */
export function parseDataBlocks(text, file, positions = new Map()) {
  const blocks = [];
  let current = null;
  let labels = [];
  let comments = [];
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, index) => {
    const label = /^([A-Za-z_][A-Za-z0-9_]*):/.exec(raw);
    const data = /^\s+\.(byte|word|ascii)\s+(.*)$/.exec(raw);
    if (data) {
      const kind = data[1];
      const { code: operand, comment: trailing } = splitComment(data[2]);
      const note = /^\s*\$([0-9A-Fa-f]{4})(?:\s+(.*))?$/.exec(trailing);
      const address = positions.get(index + 1)?.address ?? (note ? parseInt(note[1], 16) : null);
      const tag = note?.[2];
      if (!current) current = { file, start: address ?? null, offset: positions.get(index + 1)?.offset ?? null, line: index + 1, size: 0, bytes: [], words: [], labels, comment: comments.join(' '), tag: tag ?? '' };
      if (!current.tag && tag) current.tag = tag;
      if (kind === 'ascii') {
        const m = /^"(.*)"$/.exec(operand.trim());
        const bytes = asciiBytes(m ? m[1] : operand);
        current.bytes.push(...bytes);
        current.size += bytes.length;
      } else if (kind === 'word') {
        const items = operand.split(',').map((s) => s.trim());
        current.words.push(...items);
        current.bytes.push(...items.flatMap(() => [-1, -1]));
        current.size += items.length * 2;
      } else {
        const items = operand.split(',').map((s) => s.trim());
        for (const item of items) {
          const m = HEX_BYTE.exec(item);
          if (current.bytes) current.bytes.push(m ? parseInt(m[1], 16) : -1);
        }
        current.size += items.length;
      }
      labels = [];
      comments = [];
      return;
    }
    flush();
    if (label) labels.push(label[1]);
    else if (/^\s*;\s*-{3,}/.test(raw)) comments = [];
    else if (/^\s*;/.test(raw)) comments.push(raw.replace(/^\s*;\s?/, '').trim());
    else if (raw.trim() !== '') {
      labels = [];
      comments = [];
    }
  });
  flush();
  return blocks;
}

/** 是否可见字符或常见控制符 */
const isTextByte = (b) => (b >= 0x20 && b <= 0x7e) || b === 0 || b === 0x0d || b === 0x0a;

/**
 * 按内容特征归类（没有人工说明、没有注释时用）。
 * @param {{bytes: number[]|null, words: string[]|null, size: number}} block 数据块
 * @returns {{kind: string, format: string}}
 */
export function classifyContent(block) {
  if (block.words?.length && (block.bytes ?? []).every((b) => b < 0)) return { kind: '地址表', format: `${block.words.length} 项 16 位地址（.word）` };
  const bytes = (block.bytes ?? []).filter((b) => b >= 0);
  if (bytes.length >= 8 && bytes.every((b) => b === bytes[0])) return { kind: '填充', format: `全部为 $${bytes[0].toString(16).toUpperCase().padStart(2, '0')}` };
  const printable = bytes.filter((b) => b >= 0x20 && b <= 0x7e).length;
  if (bytes.length >= 4 && printable >= 4 && bytes.every(isTextByte)) return { kind: '字符串', format: 'ASCII 文字' };
  const hanzi = bytes.filter((b) => b >= 0xa1 && b <= 0xfe).length;
  if (bytes.length >= 4 && hanzi >= bytes.length * 0.6) return { kind: '字符串', format: 'GB2312 汉字' };
  if (bytes.length >= 8 && bytes.length % 2 === 0) {
    const pairs = bytes.length / 2;
    let addresses = 0;
    for (let i = 0; i < bytes.length; i += 2) if ((bytes[i + 1] ?? 0) >= 0x80) addresses++;
    if (pairs >= 4 && addresses === pairs) return { kind: '地址表', format: `约 ${pairs} 项小端 16 位地址（按内容归类）` };
  }
  return { kind: '数据', format: '' };
}

/** 读取人工登记的说明；文件不存在时为空 */
export function readNotes(file = NOTES_FILE) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
}

/**
 * 找覆盖该块起点的人工说明。
 * @param {{offset: number|null}} block 数据块
 * @param {{from: string, to: string}[]} notes 人工说明，起止是 ROM 偏移的十六进制字符串（含起止）
 */
export function findNote(block, notes) {
  if (block.offset === null) return null;
  return notes.find((n) => block.offset >= parseInt(n.from, 16) && block.offset <= parseInt(n.to, 16)) ?? null;
}

/**
 * 在所有源文件里按标签名找引用者：包含该标签（整词）的非定义行，取它之前最近的标签作为例程，并记下引用方式（索引读、取地址、序列读等）。
 * @param {Map<string, string[]>} sources 文件名 → 行
 * @param {string[]} labels 数据块自己的标签
 * @returns {{routines: string[], modes: string[]}} 引用者例程标签（去重，最多 6 个）与引用方式（去重）
 */
export function findReferences(sources, labels) {
  const routines = new Set();
  const modes = new Set();
  for (const label of labels) {
    const pattern = new RegExp(`(?<![A-Za-z0-9_])${label}(?![A-Za-z0-9_])`);
    for (const [, lines] of sources) {
      let routine = null;
      for (const line of lines) {
        const def = /^([A-Za-z_][A-Za-z0-9_]*):/.exec(line);
        if (def) {
          routine = def[1];
          continue;
        }
        const code = line.replace(/;.*$/, '');
        if (!routine || /^\s*;/.test(line) || !pattern.test(code)) continue;
        if (routines.size < 6) routines.add(routine);
        const ins = /^\s+([A-Z]{3})\s+(\S+)/.exec(code);
        if (ins) modes.add(/#[<>]/.test(ins[2]) ? '取地址（#<、#>）' : /,\s*[XY]\)?$/.test(ins[2]) ? `${ins[1]} 索引读写` : /^\.word/.test(code.trim()) ? '地址表里的项' : `${ins[1]} 直接寻址`);
        else if (/\.word/.test(code)) modes.add('地址表里的项');
      }
    }
  }
  return { routines: [...routines], modes: [...modes] };
}

/**
 * 生成清单。
 * @param {{input?: ReturnType<typeof analysisInput>, notesFile?: string, assets?: typeof ASSET_REGIONS}} [options] 分析输入（默认读 bios/ 工程）、人工说明文件与资源登记（测试用）
 * @returns {{entries: object[], summary: Record<string, {blocks: number, bytes: number}>, pending: object[]}}
 */
export function buildInventory({ input = analysisInput(BIOS_DIR), notesFile = NOTES_FILE, assets = ASSET_REGIONS } = {}) {
  const notes = readNotes(notesFile);
  const sources = new Map();
  const entries = [];
  for (const file of input.files) sources.set(file.name, file.text.split(/\r?\n/));
  for (const [name, lines] of sources) {
    const positions = input.files.find((file) => file.name === name).positions;
    for (const block of parseDataBlocks(lines.join('\n'), name, positions)) {
      const note = findNote(block, notes);
      const auto = classifyContent(block);
      const residue = /指令残留|指令边界不一致/.test(block.tag);
      let kind = auto.kind;
      let format = auto.format;
      let description = block.comment;
      const refs = findReferences(sources, block.labels);
      let status = block.comment ? '有说明' : refs.routines.length ? '按引用归类' : '待说明';
      if (!block.comment && refs.modes.length && kind === '数据') format = `被例程读取：${refs.modes.join('、')}`;
      if (note) {
        kind = note.kind;
        format = note.format ?? format;
        description = note.description ?? description;
        status = '已登记';
      }
      if ((kind === '填充' || kind === '字符串' || kind === '地址表') && status === '待说明') status = '按内容归类';
      if (residue && !note) {
        kind = '指令残留';
        status = '待说明';
      }
      entries.push({
        file: name,
        start: block.start,
        size: block.size,
        kind,
        format,
        description,
        status,
        tag: block.tag,
        labels: block.labels,
        referrers: refs.routines,
      });
    }
  }
  for (const region of assets) {
    entries.push({
      file: region.file,
      start: region.firstPage * PAGE,
      size: region.pages * PAGE,
      kind: region.kind,
      format: region.format,
      description: region.description,
      status: '已登记',
      tag: '资源文件',
      labels: [],
      referrers: [],
    });
  }
  const summary = {};
  for (const entry of entries) {
    const row = (summary[entry.kind] ??= { blocks: 0, bytes: 0 });
    row.blocks++;
    row.bytes += entry.size;
  }
  const pending = entries.filter((e) => e.status === '待说明').sort((a, b) => b.size - a.size);
  return { entries, summary, pending };
}

const hex4 = (value) => (value === null ? '----' : value.toString(16).toUpperCase().padStart(4, '0'));

/** 生成 Markdown 清单 */
export function renderMarkdown({ entries, summary, pending }) {
  const lines = ['# BIOS 数据区清单', '', '由 `node tools/bios-data.mjs --md docs/generated/BIOS数据区清单.md` 生成，不要手改；人工说明写在 `bios/data-notes.json`。', '', '## 汇总', '', '| 种类 | 块数 | 字节数 |', '| --- | --- | --- |'];
  for (const [kind, row] of Object.entries(summary).sort((a, b) => b[1].bytes - a[1].bytes)) lines.push(`| ${kind} | ${row.blocks} | ${row.bytes} |`);
  const unknown = pending;
  lines.push('', `还没有任何说明（没有注释、没有引用、内容也看不出类别）的数据块 ${unknown.length} 个，共 ${unknown.reduce((sum, e) => sum + e.size, 0)} 字节；尚未归到具体类别（种类仍是“数据”）的数据块 ${entries.filter((e) => e.kind === '数据').length} 个。`, '', '## 待说明的数据块（按大小）', '', '| 文件 | 地址 | 长度 | 种类 | 说明或线索 | 引用者 |', '| --- | --- | --- | --- | --- | --- |');
  for (const e of unknown.slice(0, 80)) lines.push(`| ${e.file} | $${hex4(e.start)} | ${e.size} | ${e.kind} | ${(e.description || e.labels.join('、') || e.tag).replace(/\|/g, '/')} | ${e.referrers.join('、')} |`);
  lines.push('', '## 全部数据块', '', '| 文件 | 地址 | 长度 | 种类 | 格式或用途 | 状态 | 引用者 |', '| --- | --- | --- | --- | --- | --- | --- |');
  for (const e of entries) lines.push(`| ${e.file} | $${hex4(e.start)} | ${e.size} | ${e.kind} | ${(e.description ? `${e.description}；` : '') + e.format}`.replace(/\|/g, (m, offset) => (offset < 40 ? m : '/')) + ` | ${e.status} | ${e.referrers.join('、')} |`);
  return `${lines.join('\n')}\n`;
}

/** 命令行入口 */
function main() {
  const args = process.argv.slice(2);
  const option = (name) => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : undefined);
  const inventory = buildInventory();
  const json = option('--json');
  const md = option('--md');
  if (json) writeFileSync(json, JSON.stringify(inventory, null, 1));
  if (md) writeFileSync(md, renderMarkdown(inventory));
  const total = inventory.entries.reduce((sum, e) => sum + e.size, 0);
  console.log(`数据块 ${inventory.entries.length} 个，共 ${total} 字节`);
  for (const [kind, row] of Object.entries(inventory.summary).sort((a, b) => b[1].bytes - a[1].bytes)) console.log(`${kind.padEnd(10)} ${String(row.blocks).padStart(5)} 块 ${String(row.bytes).padStart(8)} 字节`);
  const unknown = inventory.pending;
  console.log(`待说明的数据块 ${unknown.length} 个，共 ${unknown.reduce((sum, e) => sum + e.size, 0)} 字节；尚未归到具体类别（种类是“数据”）${inventory.entries.filter((e) => e.kind === '数据').length} 块`);
}

if (process.argv[1] && statSync(process.argv[1]).isFile() && path.basename(process.argv[1]) === 'bios-data.mjs') main();
