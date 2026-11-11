// ------------------------------------------------------------------------
// 名称：bios-spec.mjs
// 说明：从 bios/ 工程的汇编源文件静态分析出每个例程的规格：入口寄存器输入、被修改的寄存器与进位结果、读写的内存与硬件寄存器、调用的例程与系统功能、返回方式，并汇总调用图、内存变量表与硬件寄存器表。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/bios-spec.mjs [--json 输出文件] [--md 输出目录]；例程 = 被 JSR 调用、被地址表引用、被其他例程 JMP 或带说明注释的具名标签，例程范围到下一个例程入口为止。
//       寄存器输入用“可能未定义”的前向数据流算出（A、X、Y、进位 C）：某条路径上先读后写即为输入；JSR 之后 A、X、Y、C 视为被被调用者改写，被调用者的输入沿调用图传递（迭代到不变）。
//       读写的地址来自操作数符号（include/*.inc）；按索引的访问记成“基址+X”；经零页指针的间接访问记成“(基址),Y”。只分析源文件里已有的指令行，仍是 .byte 的代码不在内。
// ------------------------------------------------------------------------
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { analysisInput } from '../../bios/tools/bios-project.mjs';
import { BIOS_DIR } from './config.mjs';

/** 自动生成的标签：K_XXXX、PNN_XXXX */
const AUTO_LABEL = /^(K|P[0-9A-F]{2})_[0-9A-F]{4}$/;

// 各助记符读写的寄存器（Z 不统计）。内存寻址的 ,X ,Y 另算读 X、Y。
const READS = {
  A: new Set(['ADC', 'AND', 'CMP', 'EOR', 'ORA', 'SBC', 'STA', 'PHA', 'TAX', 'TAY', 'BIT']),
  X: new Set(['CPX', 'DEX', 'INX', 'STX', 'TXA', 'TXS']),
  Y: new Set(['CPY', 'DEY', 'INY', 'STY', 'TYA']),
  C: new Set(['ADC', 'SBC', 'ROL', 'ROR', 'BCC', 'BCS', 'PHP']),
};
const WRITES = {
  A: new Set(['ADC', 'AND', 'EOR', 'LDA', 'ORA', 'PLA', 'SBC', 'TXA', 'TYA']),
  X: new Set(['DEX', 'INX', 'LDX', 'TAX', 'TSX']),
  Y: new Set(['DEY', 'INY', 'LDY', 'TAY']),
  C: new Set(['ADC', 'ASL', 'CLC', 'CMP', 'CPX', 'CPY', 'LSR', 'PLP', 'ROL', 'ROR', 'SBC', 'SEC']),
};
/** 累加器版本的移位（操作数为空或 A）读写 A */
const ACC_SHIFT = new Set(['ASL', 'LSR', 'ROL', 'ROR']);
const BRANCHES = new Set(['BCC', 'BCS', 'BEQ', 'BMI', 'BNE', 'BPL', 'BVC', 'BVS']);
const READ_MEM = new Set(['ADC', 'AND', 'BIT', 'CMP', 'CPX', 'CPY', 'EOR', 'LDA', 'LDX', 'LDY', 'ORA', 'SBC', 'ASL', 'LSR', 'ROL', 'ROR', 'INC', 'DEC']);
const WRITE_MEM = new Set(['STA', 'STX', 'STY', 'ASL', 'LSR', 'ROL', 'ROR', 'INC', 'DEC']);

/** 读取 equates.asm 的符号表：名称 → 地址 */
export function readEquates(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\$([0-9A-Fa-f]+)/.exec(line);
    if (m) map.set(m[1], parseInt(m[2], 16));
  }
  return map;
}

/**
 * 解析源文件：返回指令序列（带标签、注释、地址）和数据行里引用的标签。
 * @param {string} text 源文件内容
 * @param {string} file 文件名
 * @param {Map<number, {address: number}>} [positions] 汇编器给出的“行号→地址”映射；没有时退回到行尾的 “; $地址” 注释
 */
export function parseSource(text, file, positions = new Map()) {
  const items = [];
  let pendingLabels = [];
  let comments = [];
  const wordTargets = new Set();
  // 局部标签 @名字 在例程内重名，带上所属全局标签的名字作前缀才唯一
  let scope = '';
  const scoped = (name) => (name.startsWith('@') ? scope + name : name);
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const label = /^(@?[A-Za-z_][A-Za-z0-9_]*):\s*(?:;.*)?$/.exec(raw);
    if (label) {
      if (!label[1].startsWith('@')) scope = label[1];
      pendingLabels.push(scoped(label[1]));
      continue;
    }
    if (/^\s*;\s*-{10,}\s*$/.test(raw)) {
      comments = [];
      continue;
    }
    if (/^\s*;/.test(raw)) {
      comments.push(raw.replace(/^\s*;\s?/, '').trim());
      continue;
    }
    const word = /^\s+\.word\s+(.*?)(?:\s*;.*)?$/.exec(raw);
    if (word) {
      for (const item of word[1].split(',')) wordTargets.add(item.trim().replace(/\+\d+$/, ''));
      pendingLabels = [];
      comments = [];
      continue;
    }
    const ins = /^\s+([A-Z]{3})(?:\s+(\S+(?:\s*,\s*[XY])?))?\s*(?:;(.*))?$/.exec(raw);
    if (ins && !raw.trim().startsWith('.')) {
      const note = /^\s*\$([0-9A-Fa-f]{4})(?:\s+(.*))?$/.exec(ins[3] ?? '');
      const address = positions.get(index + 1)?.address ?? (note ? parseInt(note[1], 16) : null);
      items.push({ file, mnemonic: ins[1], operand: (ins[2] ?? '').replace(/\s+/g, '').replace(/@[A-Za-z_][A-Za-z0-9_]*/g, scoped), address, tag: note?.[2] ?? '', labels: pendingLabels, comment: comments.join(' ') });
      pendingLabels = [];
      comments = [];
      continue;
    }
    if (raw.trim() !== '' && !/^\s*\./.test(raw)) {
      pendingLabels = [];
      comments = [];
    } else if (/^\s*\./.test(raw)) {
      pendingLabels = [];
      comments = [];
    }
  }
  return { items, wordTargets };
}

/** 操作数分类：{kind: 'imm'|'mem'|'ind'|'none', name, index} */
export function decodeOperand(operand, mnemonic) {
  if (operand === '') return { kind: 'none' };
  if (operand === 'A') return { kind: 'acc' };
  if (operand.startsWith('#')) return { kind: 'imm', text: operand.slice(1) };
  const ind = /^\((.+?)\),Y$/.exec(operand);
  if (ind) return { kind: 'ind', name: ind[1].replace(/\+\d+$/, ''), index: 'Y', pointer: true };
  const indx = /^\((.+?),X\)$/.exec(operand);
  if (indx) return { kind: 'ind', name: indx[1].replace(/\+\d+$/, ''), index: 'X', pointer: true };
  const jmpInd = /^\((.+)\)$/.exec(operand);
  if (jmpInd) return { kind: 'jmpind', name: jmpInd[1] };
  const m = /^(.+?)(?:,([XY]))?$/.exec(operand);
  return { kind: 'mem', name: m[1].replace(/\+\d+$/, ''), index: m[2] ?? null, offset: /\+(\d+)$/.exec(m[1])?.[1] ?? null };
}

/** 这条指令读写哪些寄存器 */
function registerEffects(ins, op) {
  const reads = new Set();
  const writes = new Set();
  for (const r of ['A', 'X', 'Y', 'C']) {
    if (READS[r].has(ins.mnemonic)) reads.add(r);
    if (WRITES[r].has(ins.mnemonic)) writes.add(r);
  }
  if (ACC_SHIFT.has(ins.mnemonic) && (op.kind === 'acc' || op.kind === 'none')) {
    reads.add('A');
    writes.add('A');
  }
  if (ins.mnemonic === 'PHP' || ins.mnemonic === 'PLP') {
    /* 标志整体入栈出栈，只按上面的 C 处理 */
  }
  if ((op.kind === 'mem' || op.kind === 'ind') && op.index) reads.add(op.index);
  if (ins.mnemonic === 'LDA' || ins.mnemonic === 'LDX' || ins.mnemonic === 'LDY') reads.delete(ins.mnemonic === 'LDA' ? 'A' : ins.mnemonic === 'LDX' ? 'X' : 'Y');
  return { reads, writes };
}

/**
 * 入口保存寄存器的序言：开头连续的 PHA（保存 A）、TXA+PHA（保存 X）、TYA+PHA（保存 Y）、PHP。
 * @param {object[]} body 例程指令
 * @returns {{indexes: Set<number>, saved: Set<string>}} 序言里的指令序号与被保存的寄存器
 */
export function findPrologue(body) {
  const indexes = new Set();
  const saved = new Set();
  let i = 0;
  while (i < body.length) {
    const m = body[i].mnemonic;
    if (m === 'PHA') {
      saved.add('A');
      indexes.add(i++);
    } else if (m === 'PHP') {
      indexes.add(i++);
    } else if ((m === 'TXA' || m === 'TYA') && body[i + 1]?.mnemonic === 'PHA') {
      saved.add(m === 'TXA' ? 'X' : 'Y');
      indexes.add(i);
      indexes.add(i + 1);
      i += 2;
    } else break;
  }
  return { indexes, saved };
}

/** 返回前的恢复：RTS 之前 8 条指令里有 PLA（恢复 A）、TAX（恢复 X）、TAY（恢复 Y） */
function restoredRegisters(body) {
  const restored = new Set();
  body.forEach((ins, index) => {
    if (ins.mnemonic !== 'RTS') return;
    const tail = body.slice(Math.max(0, index - 8), index).map((x) => x.mnemonic);
    if (tail.includes('PLA')) restored.add('A');
    if (tail.includes('TAX')) restored.add('X');
    if (tail.includes('TAY')) restored.add('Y');
  });
  return restored;
}

/**
 * 分析一个例程的指令序列。
 * @param {object[]} body 例程的指令
 * @param {Map<string, number>} labelIndex 标签 → 指令序号（例程内）
 * @param {(name: string) => {inputs: Set<string>}|undefined} calleeSpec 被调用例程的规格（取输入用）
 */
function analyzeFlow(body, labelIndex, calleeSpec) {
  const prologue = findPrologue(body).indexes;
  const inputs = new Set();
  const state = new Array(body.length).fill(null);
  const start = new Set(['A', 'X', 'Y', 'C']);
  const queue = [0];
  state[0] = new Set(start);
  const merge = (index, set) => {
    if (index < 0 || index >= body.length) return;
    if (!state[index]) {
      state[index] = new Set(set);
      queue.push(index);
      return;
    }
    let changed = false;
    for (const r of set) if (!state[index].has(r)) { state[index].add(r); changed = true; }
    if (changed) queue.push(index);
  };
  let guard = 0;
  while (queue.length && guard++ < 200000) {
    const index = queue.pop();
    const ins = body[index];
    const op = decodeOperand(ins.operand, ins.mnemonic);
    const current = new Set(state[index]);
    const { reads, writes } = registerEffects(ins, op);
    for (const r of reads) if (current.has(r) && !prologue.has(index)) inputs.add(r);
    if (ins.mnemonic === 'JSR') {
      const spec = calleeSpec(op.name);
      if (spec) for (const r of spec.inputs) if (current.has(r)) inputs.add(r);
      for (const r of ['A', 'X', 'Y', 'C']) current.delete(r);
      merge(index + 1, current);
      continue;
    }
    for (const r of writes) current.delete(r);
    if (ins.mnemonic === 'RTS' || ins.mnemonic === 'RTI' || ins.mnemonic === 'BRK') continue;
    if (ins.mnemonic === 'JMP') {
      if (op.kind === 'mem' && labelIndex.has(op.name)) merge(labelIndex.get(op.name), current);
      else if (op.kind === 'mem') {
        const spec = calleeSpec(op.name);
        if (spec) for (const r of spec.inputs) if (current.has(r)) inputs.add(r);
      }
      continue;
    }
    if (BRANCHES.has(ins.mnemonic) && op.kind === 'mem' && labelIndex.has(op.name)) merge(labelIndex.get(op.name), current);
    merge(index + 1, current);
  }
  return inputs;
}

/**
 * 构建全部例程的规格。
 * @param {{input?: ReturnType<typeof analysisInput>}} [options] 分析输入（符号定义文本与各源文件），默认读 bios/ 工程；测试时可直接传入
 */
export function buildSpec({ input = analysisInput(BIOS_DIR) } = {}) {
  const equates = readEquates(input.equatesText);
  const files = input.files.map((file) => file.name);
  const parsed = input.files.map((file) => parseSource(file.text, file.name, file.positions));
  // 例程入口：被 JSR 调用、被地址表引用、被其他处 JMP 的具名标签，以及带说明注释的具名标签
  const entryCandidates = new Set();
  for (const { items, wordTargets } of parsed) {
    for (const t of wordTargets) if (!AUTO_LABEL.test(t)) entryCandidates.add(t);
    for (const ins of items) {
      if (ins.mnemonic === 'JSR') {
        const op = decodeOperand(ins.operand);
        if (op.kind === 'mem') entryCandidates.add(op.name);
      }
    }
  }
  const routines = [];
  parsed.forEach(({ items }, fileIndex) => {
    let current = null;
    for (const ins of items) {
      const named = ins.labels.filter((l) => !AUTO_LABEL.test(l) && !l.includes('@'));
      const entry = named.find((l) => entryCandidates.has(l)) ?? (named.length && ins.comment ? named[0] : null);
      if (entry) {
        current = { name: entry, file: files[fileIndex], address: ins.address, comment: ins.comment, body: [], labels: new Map(), aliases: named.filter((l) => l !== entry) };
        routines.push(current);
      }
      if (!current) continue;
      for (const l of ins.labels) current.labels.set(l, current.body.length);
      current.body.push(ins);
    }
  });
  const byName = new Map(routines.map((r) => [r.name, r]));
  for (const r of routines) for (const a of r.aliases) byName.set(a, r);

  const specs = new Map();
  for (const r of routines) specs.set(r.name, { inputs: new Set() });
  // 迭代传递被调用者的输入
  for (let round = 0; round < 6; round++) {
    let changed = false;
    for (const r of routines) {
      const inputs = analyzeFlow(r.body, r.labels, (name) => specs.get(byName.get(name)?.name ?? name));
      const old = specs.get(r.name).inputs;
      if (inputs.size !== old.size || [...inputs].some((x) => !old.has(x))) {
        specs.get(r.name).inputs = inputs;
        changed = true;
      }
    }
    if (!changed) break;
  }

  const addressOf = (name) => (equates.has(name) ? equates.get(name) : null);
  const result = [];
  for (const r of routines) {
    const reads = new Set();
    const writes = new Set();
    const calls = new Set();
    const tails = new Set();
    const syscalls = [];
    const clobbers = new Set();
    let ends = new Set();
    let func = null;
    let sub = null;
    let carryResult = false;
    let prev = null;
    for (const ins of r.body) {
      const op = decodeOperand(ins.operand, ins.mnemonic);
      const { writes: regWrites } = registerEffects(ins, op);
      for (const w of regWrites) if (w !== 'C') clobbers.add(w);
      if (ins.mnemonic === 'JSR' && op.kind === 'mem') {
        const target = byName.get(op.name)?.name ?? op.name;
        if (/^(VEC_SYSCALL|K_FFF0)$/.test(op.name) || op.name === '$FFF0') syscalls.push({ func, sub });
        else calls.add(target);
      }
      if (ins.mnemonic === 'JMP' && op.kind === 'mem' && !r.labels.has(op.name)) tails.add(byName.get(op.name)?.name ?? op.name);
      if (ins.mnemonic === 'JMP' && op.kind === 'jmpind') ends.add('间接跳转');
      if (ins.mnemonic === 'RTS') {
        ends.add('RTS');
        if (prev && (prev.mnemonic === 'SEC' || prev.mnemonic === 'CLC')) carryResult = true;
      }
      if (ins.mnemonic === 'RTI') ends.add('RTI');
      // 记录系统功能号与子功能号
      if (ins.mnemonic === 'LDA' && op.kind === 'imm') prev = { ...ins, imm: op.text };
      if (ins.mnemonic === 'STA' && op.kind === 'mem' && prev?.mnemonic === 'LDA') {
        const a = addressOf(op.name);
        const m = /^\$([0-9A-Fa-f]+)$/.exec(prev.imm ?? '');
        if (a === 0x063e && m) func = parseInt(m[1], 16);
        if (a === 0x063f && m) sub = parseInt(m[1], 16);
      }
      if (op.kind === 'mem' || op.kind === 'ind') {
        const name = op.name;
        if (name && !r.labels.has(name) && !AUTO_LABEL.test(name) || (name && equates.has(name))) {
          if (equates.has(name)) {
            const text = op.kind === 'ind' ? `(${name}),${op.index}` : op.index ? `${name}+${op.index}` : name;
            if (op.kind !== 'ind' || op.pointer) {
              if (READ_MEM.has(ins.mnemonic) || op.kind === 'ind') if (!(ins.mnemonic === 'STA' || ins.mnemonic === 'STX' || ins.mnemonic === 'STY')) reads.add(text);
              if (WRITE_MEM.has(ins.mnemonic) || (op.kind === 'ind' && /^ST/.test(ins.mnemonic))) writes.add(text);
            }
          }
        }
      }
      prev = ins.mnemonic === 'LDA' && op.kind === 'imm' ? { ...ins, imm: op.text } : ins;
    }
    const last = r.body.at(-1);
    const { saved } = findPrologue(r.body);
    const restored = restoredRegisters(r.body);
    for (const reg of saved) if (restored.has(reg)) clobbers.delete(reg);
    const fallsThrough = last && !['RTS', 'RTI', 'JMP', 'BRK'].includes(last.mnemonic);
    result.push({
      name: r.name,
      aliases: r.aliases,
      file: r.file,
      address: r.address,
      comment: r.comment,
      instructions: r.body.length,
      inputs: [...specs.get(r.name).inputs].sort(),
      clobbers: [...clobbers].sort(),
      carryResult,
      reads: [...reads].sort(),
      writes: [...writes].sort(),
      calls: [...calls].sort(),
      tailCalls: [...tails].sort(),
      syscalls: syscalls.filter((s) => s.func !== null).map((s) => `$${s.func.toString(16).toUpperCase().padStart(2, '0')}${s.sub === null ? '' : `/$${s.sub.toString(16).toUpperCase().padStart(2, '0')}`}`),
      ends: [...ends].sort(),
      fallsThrough: fallsThrough ? true : false,
      equatesAddress: undefined,
    });
  }
  return { routines: result, equates, files: input.files };
}

/** 变量表：每个符号（RAM、ERAM、硬件寄存器）被哪些例程读写 */
export function buildVariableTable(spec) {
  const table = new Map();
  const touch = (text, routine, kind) => {
    const name = text.replace(/\+[XY]$/, '').replace(/^\((.*)\),[XY]$/, '$1');
    const row = table.get(name) ?? { name, readers: new Set(), writers: new Set() };
    row[kind].add(routine);
    table.set(name, row);
  };
  for (const r of spec.routines) {
    for (const t of r.reads) touch(t, r.name, 'readers');
    for (const t of r.writes) touch(t, r.name, 'writers');
  }
  return [...table.values()].map((row) => ({ name: row.name, address: spec.equates.get(row.name) ?? null, readers: [...row.readers].sort(), writers: [...row.writers].sort() })).sort((a, b) => (a.address ?? 0) - (b.address ?? 0));
}

/** 地址所属区域 */
export function regionOf(address) {
  if (address === null) return '?';
  if (address < 0x100) return '零页';
  if (address < 0x800) return '系统 RAM';
  if (address < 0x2000) return '镜像 RAM';
  if (address < 0x4020) return 'PPU/APU/手柄寄存器';
  if (address < 0x6000) return '扩展 I/O 寄存器';
  if (address < 0x8000) return '扩展 RAM（ERAM）';
  return 'ROM';
}

const hex = (value, width = 4) => (value === null || value === undefined ? '----' : value.toString(16).toUpperCase().padStart(width, '0'));
const cell = (list, limit = 8) => (list.length === 0 ? '—' : list.length > limit ? `${list.slice(0, limit).join('、')} 等 ${list.length} 项` : list.join('、')).replace(/\|/g, '/');

/** 例程规格表 Markdown */
export function renderRoutineTable(spec) {
  const lines = ['# 例程规格表', '', '由 `node tools/bios-spec.mjs --md docs` 生成，不要手改。说明见 `tools/bios-spec.mjs` 文件头；“输入”是入口处被读取的寄存器（A、X、Y、C 进位），“改写”是例程里写过的 A、X、Y，“进位结果”表示 RTS 之前是 SEC 或 CLC（常用进位标志返回成功或失败）；读写的地址是例程自己直接访问的符号（不含被调用者）。', '', `共 ${spec.routines.length} 个例程。`, ''];
  const byFile = Object.groupBy(spec.routines, (r) => r.file);
  for (const [file, list] of Object.entries(byFile)) {
    lines.push(`## ${file}`, '', '| 例程 | 地址 | 说明 | 输入 | 改写 | 读 | 写 | 调用 | 系统功能 | 返回 |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const r of list) {
      const returns = [...r.ends, ...(r.carryResult ? ['进位结果'] : []), ...(r.fallsThrough ? ['顺序进入下一段'] : []), ...(r.tailCalls.length ? [`跳转 ${r.tailCalls.join('、')}`] : [])];
      lines.push(`| ${r.name} | $${hex(r.address)} | ${(r.comment || '—').replace(/\|/g, '/').slice(0, 120)} | ${cell(r.inputs)} | ${cell(r.clobbers)} | ${cell(r.reads, 6)} | ${cell(r.writes, 6)} | ${cell(r.calls, 6)} | ${cell([...new Set(r.syscalls)])} | ${cell(returns)} |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

/** 内存变量与硬件寄存器表 Markdown */
export function renderVariableTable(spec) {
  const variables = buildVariableTable(spec).filter((v) => v.address !== null);
  const lines = ['# 内存变量与硬件寄存器表', '', '由 `node tools/bios-spec.mjs --md docs` 生成，不要手改。只列被例程直接读写的符号；名字是 `ZP_xx`、`RAM_xxxx`、`ERAM_xxxx`、`IO_xxxx` 的表示含义还没有确认。', ''];
  const groups = Object.groupBy(variables, (v) => regionOf(v.address));
  for (const region of ['零页', '系统 RAM', '镜像 RAM', 'PPU/APU/手柄寄存器', '扩展 I/O 寄存器', '扩展 RAM（ERAM）']) {
    const list = groups[region] ?? [];
    const unnamed = list.filter((v) => /^(ZP|RAM|ERAM|IO|PPU|WRAM)_[0-9A-F]+$/.test(v.name)).length;
    lines.push(`## ${region}（${list.length} 个符号，其中含义未确认 ${unnamed} 个）`, '', '| 地址 | 符号 | 读它的例程 | 写它的例程 |', '| --- | --- | --- | --- |');
    for (const v of list) lines.push(`| $${hex(v.address)} | ${v.name} | ${cell(v.readers, 5)} | ${cell(v.writers, 5)} |`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

/** 调用图（例程 → 被它调用的例程）Markdown */
export function renderCallGraph(spec) {
  const callers = new Map();
  for (const r of spec.routines) for (const callee of [...r.calls, ...r.tailCalls]) (callers.get(callee) ?? callers.set(callee, new Set()).get(callee)).add(r.name);
  const lines = ['# 调用图', '', '由 `node tools/bios-spec.mjs --md docs` 生成，不要手改。“调用”含 JSR 与跳到别的例程的 JMP；经地址表、系统调用分发器的间接调用不在内。', '', '| 例程 | 调用 | 被调用 |', '| --- | --- | --- |'];
  for (const r of spec.routines) lines.push(`| ${r.name} | ${cell([...r.calls, ...r.tailCalls], 10)} | ${cell([...(callers.get(r.name) ?? [])].sort(), 8)} |`);
  return `${lines.join('\n')}\n`;
}

/**
 * 待补充清单：源文件注释里的“待确认”、没有说明的例程、含义未确认的变量（按被访问的例程数排序）。
 * @param {ReturnType<typeof buildSpec>} spec 规格（带源文件与行号→地址映射）
 */
export function renderOpenItems(spec) {
  const open = [];
  for (const { name: file, text, positions } of spec.files) {
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!/待确认/.test(line)) return;
      // 地址取这一行之后最近一条产生字节的语句（最多往后看 12 行），没有时退回到行尾的 “; $地址” 注释
      let address = null;
      for (let i = index; i < Math.min(lines.length, index + 12) && address === null; i++) {
        address = positions.get(i + 1)?.address ?? null;
        const m = /;\s*\$([0-9A-Fa-f]{4})\b/.exec(lines[i]);
        if (address === null && m) address = parseInt(m[1], 16);
      }
      open.push({ file, line: index + 1, address, text: line.replace(/^\s*;\s?/, '').replace(/\s*;\s*\$[0-9A-Fa-f]{4}.*$/, '').trim() });
    });
  }
  const variables = buildVariableTable(spec).filter((v) => /^(ZP|RAM|ERAM|IO|PPU|WRAM)_[0-9A-F]+$/.test(v.name));
  const usage = (v) => new Set([...v.readers, ...v.writers]).size;
  variables.sort((a, b) => usage(b) - usage(a));
  const lines = ['# 待补充清单', '', '由 `node tools/bios-spec.mjs --md docs` 生成，不要手改。已确认的结论写在源文件注释和 系统调用手册，没有确认的列在这里；每解决一项，就在源文件里把“待确认”改成结论并重新生成。', '', `## 源文件里标了“待确认”的地方（${open.length} 处）`, '', '| 文件 | 行 | 地址 | 内容 |', '| --- | --- | --- | --- |'];
  for (const o of open) lines.push(`| ${o.file} | ${o.line} | $${hex(o.address)} | ${o.text.replace(/\|/g, '/').slice(0, 200)} |`);
  const noComment = spec.routines.filter((r) => !r.comment);
  lines.push('', `## 没有说明注释的例程（${noComment.length} 个）`, '', noComment.map((r) => `${r.name}（${r.file} $${hex(r.address)}）`).join('、'), '', `## 含义未确认的变量（${variables.length} 个，按被访问的例程数排序，列前 150 个）`, '', '| 地址 | 符号 | 访问它的例程数 | 读 | 写 |', '| --- | --- | --- | --- | --- |');
  for (const v of variables.slice(0, 150)) lines.push(`| $${hex(v.address)} | ${v.name} | ${usage(v)} | ${v.readers.length} | ${v.writers.length} |`);
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = process.argv.slice(2);
  const option = (name) => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : undefined);
  const spec = buildSpec();
  const json = option('--json');
  const md = option('--md');
  if (json) writeFileSync(json, JSON.stringify(spec.routines, null, 1));
  if (md) {
    mkdirSync(md, { recursive: true });
    writeFileSync(path.join(md, '例程规格表.md'), renderRoutineTable(spec));
    writeFileSync(path.join(md, '内存变量与硬件寄存器表.md'), renderVariableTable(spec));
    writeFileSync(path.join(md, '调用图.md'), renderCallGraph(spec));
    writeFileSync(path.join(md, '待补充清单.md'), renderOpenItems(spec));
  }
  const withInput = spec.routines.filter((r) => r.inputs.length).length;
  console.log(`例程 ${spec.routines.length} 个，其中有寄存器输入的 ${withInput} 个`);
}

if (process.argv[1] && path.basename(process.argv[1]) === 'bios-spec.mjs') main();
