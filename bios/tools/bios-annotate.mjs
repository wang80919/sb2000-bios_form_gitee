// ------------------------------------------------------------------------
// 名称：bios-annotate.mjs
// 说明：按映射文件批量改写例程头注释与例程内的局部标签名，改完重新构建，ROM 必须与改前逐字节一致，否则恢复原状。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-11
// 备注：用法 node tools/bios-annotate.mjs <映射文件.json> [--dry]
//       映射文件格式：{ "file": "math/math-library.asm", "routines": [ { "name": "API_54", "header": ["作用……", "输入：……"], "locals": { "@skip": "@add" } } ] }
//       name：全局标签；header：写在标签上方的注释行（不带分号），会替换标签上方紧邻的那一段注释；add：在现有注释（第一行不是“作用：”时自动补上）之后追加的行（如“输入：……”）；header、add 都省略则不改注释；
//       locals：该例程范围内（从这个全局标签到下一个全局标签之前）的局部标签改名，旧名都要存在，新名不能与范围内其他局部标签重名；
//       header 末尾自动加一行“调用者：……”（由全工程的 JSR、JMP、分支与地址表引用统计得到，header 里自己写了“调用者”或例程设 "callers": false 时不加）；
//       可以只写 header 或只写 locals；一个映射文件可以有多个例程，同一个文件可以分多次运行。
// ------------------------------------------------------------------------
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BIOS_DIR, buildBios } from './bios-build.mjs';
import { readManifest, sourceList } from './bios-project.mjs';

const GLOBAL_LABEL = /^([A-Za-z_][A-Za-z0-9_]*):/;
const LOCAL_LABEL = /^\s*(@[A-Za-z_][A-Za-z0-9_]*):/;
const LOCAL_NAME = /^@[a-z][a-z0-9_]*$/;
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const NO_FALLTHROUGH = new Set(['RTS', 'RTI', 'JMP', 'BRK']);
const BRANCH_OR_JUMP = /^\s*(?:JSR|JMP|B(?:CC|CS|EQ|MI|NE|PL|VC|VS))\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*[+-]\s*(?:\$[0-9A-Fa-f]+|\d+))?\s*(?:;.*)?$/;
const WORD_LINE = /^\s*\.word\s+([^;]*)/;
const IMMEDIATE_ADDRESS = /(?:#|\.byte\s+)[<>]([A-Za-z_][A-Za-z0-9_]*)/;
const INSTRUCTION = /^\s*(?:@[A-Za-z_][A-Za-z0-9_]*:\s*)?([A-Z]{3})\b/;

/**
 * 统计全工程里谁引用了每个全局标签：指令跳转（JSR、JMP、分支）、.word 地址表项、#<名字 与 #>名字。
 * @param {string} projectDir 工程目录
 * @returns {{callers: Map<string, Map<string, Set<string>>>, previous: Map<string, string|null>}}
 *   callers：被引用的名字 → 引用者名字 → 引用方式（jsr、jmp、branch、table、address）；
 *   previous：标签 → 紧挨着它上方、会顺序执行到它的例程名（上一条指令是 RTS、JMP 等时为 null）
 */
export function buildCallerIndex(projectDir = BIOS_DIR) {
  const callers = new Map();
  const previous = new Map();
  const dataLabels = new Set();
  let pendingLabels = [];
  const add = (target, owner, kind) => {
    if (!callers.has(target)) callers.set(target, new Map());
    const byOwner = callers.get(target);
    if (!byOwner.has(owner)) byOwner.set(owner, new Set());
    byOwner.get(owner).add(kind);
  };
  let owner = null;
  let lastInstruction = null;
  for (const source of sourceList(readManifest(projectDir))) {
    const lines = readFileSync(path.join(projectDir, source.name), 'utf8').split(/\r?\n/);
    // 文件开头、第一个全局标签之前的代码（页入口分发等）不属于上一个文件的最后一个例程
    owner = `${path.basename(source.name)} 开头的入口代码`;
    for (const raw of lines) {
      const line = raw.replace(/;.*$/, '');
      const label = GLOBAL_LABEL.exec(line);
      if (label) {
        previous.set(label[1], lastInstruction && !NO_FALLTHROUGH.has(lastInstruction.mnemonic) ? lastInstruction.owner : null);
        owner = label[1];
        pendingLabels.push(label[1]);
      }
      const instruction = INSTRUCTION.exec(line);
      if (instruction) {
        lastInstruction = { mnemonic: instruction[1], owner };
        pendingLabels = [];
        // 指令操作数里出现的名字（LDA 表名,X、STA 变量 等）都算引用
        for (const [name] of line.replace(/^\s*(?:@[A-Za-z_][A-Za-z0-9_]*:\s*)?[A-Z]{3}\b/, '').matchAll(/(?<![A-Za-z0-9_@$#<>])[A-Za-z_][A-Za-z0-9_]*/g)) add(name, owner, 'data');
      } else if (/^\s*\.(byte|word|ascii)\b/.test(line)) {
        lastInstruction = null;
        for (const name of pendingLabels) dataLabels.add(name);
        pendingLabels = [];
      }
      if (!owner) continue;
      const jump = BRANCH_OR_JUMP.exec(raw);
      if (jump) {
        const mnemonic = INSTRUCTION.exec(raw)?.[1];
        add(jump[1], owner, mnemonic === 'JSR' ? 'jsr' : mnemonic === 'JMP' ? 'jmp' : 'branch');
      }
      const word = WORD_LINE.exec(line);
      if (word) for (const item of word[1].split(',')) {
        const name = /^\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(item)?.[1];
        if (name) add(name, owner, 'table');
      }
      const immediate = IMMEDIATE_ADDRESS.exec(line);
      if (immediate) add(immediate[1], owner, 'address');
    }
  }
  return { callers, previous, dataLabels };
}

/**
 * 生成“调用者”一行。
 * @param {string} name 例程名
 * @param {ReturnType<typeof buildCallerIndex>} index 引用索引
 * @returns {string}
 */
export function callersLine(name, index) {
  const byOwner = index.callers.get(name) ?? new Map();
  const isData = index.dataLabels.has(name);
  const parts = [];
  for (const [owner, kinds] of byOwner) {
    if (owner === name && (isData || (kinds.size === 1 && kinds.has('branch')))) continue;
    const table = kinds.has('table') && ![...kinds].some((kind) => kind !== 'table');
    parts.push(table ? `${owner}（地址表）` : kinds.has('address') && kinds.size === 1 ? `${owner}（取地址）` : owner);
  }
  const fall = index.previous.get(name);
  if (!isData && fall && fall !== name && !byOwner.has(fall)) parts.push(`${fall}（顺序执行到这里）`);
  if (parts.length === 0) return isData ? '引用者：全 ROM 没有指令或地址表引用它' : '调用者：全 ROM 没有指令或地址表引用它（只能由外部直接进入）';
  const shown = parts.slice(0, 8);
  return `${isData ? '引用者' : '调用者'}：${shown.join('、')}${parts.length > shown.length ? `等 ${parts.length} 处` : ''}`;
}

/**
 * 在文本行数组里应用一个例程的改动。
 * @param {string[]} lines 文件的行
 * @param {{name: string, header?: string[], locals?: Record<string, string>}} routine 例程改动
 * @returns {string[]} 新的行
 */
export function applyRoutine(lines, routine, callerIndex = null) {
  const start = lines.findIndex((line) => GLOBAL_LABEL.exec(line)?.[1] === routine.name);
  if (start < 0) throw new Error(`找不到全局标签：${routine.name}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (GLOBAL_LABEL.test(lines[i])) {
      end = i;
      break;
    }
  }

  let body = lines.slice(start, end);
  if (routine.locals && Object.keys(routine.locals).length > 0) {
    const existing = body.map((line) => LOCAL_LABEL.exec(line)?.[1]).filter(Boolean);
    const renames = Object.entries(routine.locals);
    for (const [from, to] of renames) {
      if (!existing.includes(from)) throw new Error(`${routine.name}：范围内没有局部标签 ${from}`);
      if (!LOCAL_NAME.test(to)) throw new Error(`${routine.name}：局部标签名不合法 ${to}（要小写字母开头，只含小写字母、数字、下划线）`);
    }
    const finalNames = existing.map((name) => routine.locals[name] ?? name);
    const duplicated = finalNames.filter((name, index) => finalNames.indexOf(name) !== index);
    if (duplicated.length > 0) throw new Error(`${routine.name}：改名后局部标签重名：${[...new Set(duplicated)].join('、')}`);
    // 一次替换，避免 A→B、B→C 这样的链式改名互相覆盖
    const pattern = new RegExp(`(?<![A-Za-z0-9_@$])(${renames.map(([from]) => escapeRegExp(from)).join('|')})(?![A-Za-z0-9_])`, 'g');
    body = body.map((line) => line.replace(pattern, (name) => routine.locals[name]));
  }

  let before = lines.slice(0, start);
  if (routine.header || routine.add) {
    let commentStart = before.length;
    while (commentStart > 0 && /^\s*;/.test(before[commentStart - 1])) commentStart--;
    const existing = before.slice(commentStart).map((line) => line.replace(/^\s*;\s?/, ''));
    let header = routine.header ?? existing;
    // 沿用现有注释时，第一行还不是“作用：……”就补上“作用：”
    if (!routine.header && header.length > 0 && !/^(作用|输入|输出|副作用|调用者|引用者)：/.test(header[0])) header = [`作用：${header[0]}`, ...header.slice(1)];
    header = [...header, ...(routine.add ?? []).filter((line) => !header.includes(line))];
    if (header.some((line) => /待确认|推断|启发式/.test(line))) throw new Error(`${routine.name}：头注释里不能写“待确认、推断、启发式”`);
    if (callerIndex && routine.callers !== false) header = [...header.filter((line) => !/^(调用者|引用者)：/.test(line)), callersLine(routine.name, callerIndex)];
    before = [...before.slice(0, commentStart), ...header.map((line) => `; ${line}`)];
  }
  return [...before, ...body, ...lines.slice(end)];
}

/**
 * 应用映射文件，重新构建并核对 ROM 不变。
 * @param {{file: string, routines: object[]}} mapping 映射
 * @param {{dry?: boolean, projectDir?: string}} [options] dry 只检查不写入
 * @returns {{routines: number, locals: number, headers: number}}
 */
export function annotate(mapping, { dry = false, projectDir = BIOS_DIR } = {}) {
  const file = path.join(projectDir, 'src', mapping.file);
  const original = readFileSync(file, 'utf8');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  let lines = original.split(/\r?\n/);
  const callerIndex = mapping.routines.some((routine) => routine.header || routine.add) ? buildCallerIndex(projectDir) : null;
  for (const routine of mapping.routines) lines = applyRoutine(lines, routine, callerIndex);
  const text = lines.join(eol);

  const baseline = buildBios(projectDir);
  writeFileSync(file, text);
  try {
    if (!baseline.equals(buildBios(projectDir))) throw new Error('改动后 ROM 与改前不一致');
    if (dry) writeFileSync(file, original);
  } catch (error) {
    writeFileSync(file, original);
    throw error;
  }
  return {
    routines: mapping.routines.length,
    locals: mapping.routines.reduce((sum, r) => sum + Object.keys(r.locals ?? {}).length, 0),
    headers: mapping.routines.filter((r) => r.header || r.add).length,
  };
}

/** 刷新全工程所有已有“调用者/引用者”行的例程（引用关系变了之后用） */
export function refreshCallers(projectDir = BIOS_DIR) {
  const srcDir = path.join(projectDir, 'src');
  const manifest = readManifest(projectDir);
  const files = sourceList(manifest).map((file) => file.name).filter((name) => name.endsWith('.asm') && name.startsWith('src/'));
  let count = 0;
  for (const name of files) {
    const text = readFileSync(path.join(projectDir, name), 'utf8');
    const routines = [];
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const label = GLOBAL_LABEL.exec(line);
      if (label && index > 0 && /^;\s*(调用者|引用者)：/.test(lines[index - 1])) routines.push({ name: label[1], add: [] });
    });
    if (routines.length === 0) continue;
    annotate({ file: name.slice('src/'.length), routines }, { projectDir });
    count += routines.length;
  }
  return count;
}

if (process.argv[1]?.endsWith('bios-annotate.mjs')) {
  const args = process.argv.slice(2);
  if (args.includes('--refresh')) {
    console.log(`已刷新 ${refreshCallers()} 个例程的调用者行，ROM 不变`);
    process.exit(0);
  }
  const mappingFile = args.find((arg) => !arg.startsWith('--'));
  if (!mappingFile) {
    console.error('用法：node tools/bios-annotate.mjs <映射文件.json> [--dry]');
    process.exit(2);
  }
  const result = annotate(JSON.parse(readFileSync(mappingFile, 'utf8')), { dry: args.includes('--dry') });
  console.log(`已处理 ${result.routines} 个例程：改头注释 ${result.headers} 个，局部标签改名 ${result.locals} 个，ROM 不变`);
}
