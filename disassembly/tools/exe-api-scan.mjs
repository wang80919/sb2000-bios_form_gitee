// ------------------------------------------------------------------------
// 名称：exe-api-scan.mjs
// 说明：静态扫描程序文件里的系统调用：找出“LDA #功能号 / STA $063E ... JSR $FFF0”形式的调用，
//       并识别其间的 “LDA #子功能 / STA $063F”，按（功能号，子功能）汇总次数；
//       同时汇总各软件的汇总表，输出 docs/generated/软件使用的系统调用.md。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/exe-api-scan.mjs [目录...]，默认扫描 out/images 下各软盘导出的目录（用 list-image.mjs 导出）。
//       只识别立即数形式的功能号；通过变量传递功能号的调用不会被统计，所以次数是下限。
// ------------------------------------------------------------------------
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BIOS_ROM, OUT_DIR, WORK_DIR } from './config.mjs';
import { buildDispatchMap } from './dispatch-map.mjs';
import { BANKED_SYMBOLS, KNOWN_SYMBOLS } from './symbols.mjs';

/** 功能号赋值指令 LDA #nn / STA $063E 与子功能赋值 LDA #nn / STA $063F，以及 JSR $FFF0 的字节形式 */
const STORE_FN = [0x8d, 0x3e, 0x06];
const STORE_SUB = [0x8d, 0x3f, 0x06];
const JSR_SYSCALL = [0x20, 0xf0, 0xff];

/** 从功能号赋值到 JSR 之间最多往后看的字节数 */
const LOOKAHEAD = 40;

const matchAt = (bytes, at, pattern) => pattern.every((value, i) => bytes[at + i] === value);

/**
 * 扫描一个程序文件里的系统调用。
 * @param {Uint8Array} bytes 文件内容
 * @returns {Map<string, number>} 键为“功能号/子功能”（十六进制，没有子功能时子功能为 --），值为出现次数
 */
export function scanApiCalls(bytes) {
  const result = new Map();
  for (let i = 2; i + 3 < bytes.length; i++) {
    if (!matchAt(bytes, i, STORE_FN) || bytes[i - 2] !== 0xa9) continue;
    const fn = bytes[i - 1];
    let sub = null;
    let called = false;
    for (let j = i + 3; j < Math.min(bytes.length - 2, i + LOOKAHEAD); j++) {
      if (matchAt(bytes, j, JSR_SYSCALL)) {
        called = true;
        break;
      }
      if (matchAt(bytes, j, STORE_SUB) && bytes[j - 2] === 0xa9) sub = bytes[j - 1];
      // 遇到别的功能号赋值说明这次赋值没有紧跟调用
      if (matchAt(bytes, j, STORE_FN)) break;
    }
    if (!called) continue;
    const key = `${fn.toString(16).toUpperCase().padStart(2, '0')}/${sub === null ? '--' : sub.toString(16).toUpperCase().padStart(2, '0')}`;
    result.set(key, (result.get(key) ?? 0) + 1);
  }
  return result;
}

/**
 * 生成 Markdown。
 * @param {{name: string, calls: Map<string, number>}[]} files 每个文件的扫描结果
 * @param {(fn: number) => string} describe 功能号的名称描述
 * @returns {string}
 */
export function renderUsageDoc(files, describe) {
  const used = files.filter((f) => f.calls.size > 0);
  const total = new Map();
  for (const file of used) {
    for (const [key, count] of file.calls) {
      const entry = total.get(key) ?? { count: 0, files: [] };
      entry.count += count;
      entry.files.push(file.name);
      total.set(key, entry);
    }
  }
  const lines = [
    '# 软件使用的系统调用',
    '',
    '由 `tools/exe-api-scan.mjs` 静态扫描程序文件生成：只统计功能号写成立即数的调用，次数是下限。',
    `共扫描 ${files.length} 个文件，其中 ${used.length} 个含有系统调用。`,
    '',
    '| 功能号/子功能 | 名称 | 总次数 | 出现在 |',
    '| --- | --- | ---: | --- |',
  ];
  const keys = [...total.keys()].sort();
  for (const key of keys) {
    const entry = total.get(key);
    const fn = parseInt(key.slice(0, 2), 16);
    lines.push(`| $${key.replace('/', '/$')} | ${describe(fn)} | ${entry.count} | ${[...new Set(entry.files)].join('、')} |`);
  }
  return `${lines.join('\n')}\n`;
}

/** 递归列出目录下的文件 */
function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

if (process.argv[1]?.endsWith('exe-api-scan.mjs')) {
  const roots = process.argv.length > 2 ? process.argv.slice(2) : [path.join(OUT_DIR, 'images')];
  const rom = new Uint8Array(readFileSync(BIOS_ROM)).subarray(16);
  const map = buildDispatchMap(rom);
  const byAddress = new Map(KNOWN_SYMBOLS.map((s) => [s.address, s.name]));
  const byFunction = new Map(BANKED_SYMBOLS.map((s) => [s.fn, s.name]));

  const describe = (fn) => {
    const entry = map[fn];
    if (!entry) return '超出分发器范围';
    if (entry.kind === 'ram-table') return 'RAM 表登记的服务';
    if (entry.kind === 'rom-table') return byAddress.get(entry.handler) ?? `内核例程 $${entry.handler.toString(16).toUpperCase()}`;
    return byFunction.get(fn) ?? `换页服务（页组 $${(entry.group ?? 0).toString(16).toUpperCase()}）`;
  };

  const files = [];
  for (const root of roots.filter((r) => existsSync(r))) {
    for (const file of listFiles(root)) {
      const relative = path.relative(root, file).replaceAll('\\', '/');
      files.push({ name: path.basename(root) === 'images' ? relative : `${path.basename(root)}/${relative}`, calls: scanApiCalls(new Uint8Array(readFileSync(file))) });
    }
  }
  const target = path.join(WORK_DIR, 'docs', 'generated', '软件使用的系统调用.md');
  writeFileSync(target, renderUsageDoc(files, describe));
  console.log(`已扫描 ${files.length} 个文件，输出 ${target}`);
}
