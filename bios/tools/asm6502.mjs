// ------------------------------------------------------------------------
// 名称：asm6502.mjs
// 说明：与 disasm.mjs 配套的最小 6502 汇编器，用于把反汇编输出重新汇编并与原始字节逐字节比对。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：支持的语法
//   ; 注释            行内或整行
//   name:             标签，可独占一行或与指令同行
//   @name:            局部标签，作用域从前一个全局标签（不带 @ 的标签）起到下一个全局标签前；引用时也写 @name，不同例程里可以重名
//   .org $8000        设置当前地址（每个段落以 .org 开始）
//   .rorg $6100       以下代码按运行地址 $6100 汇编（标签、跳转都用这个地址），但仍紧接在前面的字节后存放；
//                     用于先存进程序文件、再复制到另一块内存（如 ERAM）里运行的代码
//   .rend             结束 .rorg，地址回到存放位置
//   .byte $01,$02     原始字节，可用 <标号、>标号 取地址的低、高字节
//   .word name,$1234  16 位小端字，可用标号、符号（可带 +n、-n）
//   .ascii "text"     ASCII 字符串（不自动加结尾 0），支持 \\ \" \n \r \0 \xHH 转义，引号里的分号不算注释
//   NAME = $0010      符号定义（常量），整个汇编范围内有效，可先使用后定义
//   LDA #$12 / LDA #<name / LDA #>name / LDA $12 / LDA $1234,X / JMP ($1234) / LDA ($12),Y / ASL A
//   操作数为 $ 十六进制字面量时，两位及以下按零页，三位及以上按绝对寻址；
//   操作数为标签（可带 +n、-n）时按绝对寻址；操作数为 NAME = 值 定义的符号时，值不超过 $FF 按零页，否则按绝对寻址；
//   分支指令的操作数是目标地址。
//   多个源文件：传给 assemble 的文件带 continues: true 时不写 .org，接在前一个文件的末尾继续汇编（地址与 .rorg 状态沿用），属于同一个段；
//   每个文件的局部标签作用域各自独立。
// ------------------------------------------------------------------------
import { MODE_LENGTH, OPCODE_BY_FORM } from './opcodes.mjs';

const BRANCH_MNEMONICS = new Set(['BPL', 'BMI', 'BVC', 'BVS', 'BCC', 'BCS', 'BNE', 'BEQ']);
const ACCUMULATOR_MNEMONICS = new Set(['ASL', 'LSR', 'ROL', 'ROR']);
const LABEL_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** 符号定义行：NAME = 表达式（已去掉注释） */
const EQUATE_LINE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/;

/**
 * 解析表达式：十六进制字面量、十进制数、标签，可带 +n / -n。
 * @param {string} text 表达式文本
 * @returns {{label: string|null, offset: number, digits: number}} digits 为十六进制字面量的位数，非字面量为 0
 */
function parseBareExpression(text) {
  const trimmed = text.trim();
  const hex = /^\$([0-9A-Fa-f]+)$/.exec(trimmed);
  if (hex) return { label: null, offset: parseInt(hex[1], 16), digits: hex[1].length };
  if (/^\d+$/.test(trimmed)) return { label: null, offset: parseInt(trimmed, 10), digits: 0 };
  const labelled = /^(@?[A-Za-z_][A-Za-z0-9_]*)\s*(?:([+-])\s*(\$[0-9A-Fa-f]+|\d+))?$/.exec(trimmed);
  if (!labelled) throw new Error(`无法解析表达式：${text}`);
  let offset = 0;
  if (labelled[3]) {
    offset = labelled[3].startsWith('$') ? parseInt(labelled[3].slice(1), 16) : parseInt(labelled[3], 10);
    if (labelled[2] === '-') offset = -offset;
  }
  return { label: labelled[1], offset, digits: 0 };
}

/**
 * 解析可带 < 或 > 前缀的表达式（< 取低字节，> 取高字节）。
 * @param {string} text 表达式文本
 * @returns {{label: string|null, offset: number, digits: number, part: 'low'|'high'|null}}
 */
function parseExpression(text) {
  const trimmed = text.trim();
  const part = trimmed.startsWith('<') ? 'low' : trimmed.startsWith('>') ? 'high' : null;
  return { ...parseBareExpression(part ? trimmed.slice(1) : trimmed), part };
}

/**
 * 判断表达式是否按零页寻址：两位及以下的十六进制字面量，或值不超过 $FF 的 NAME = 值 符号。
 * @param {{label: string|null, offset: number, digits: number, part: string|null}} expression 表达式
 * @param {Map<string, number>} equates NAME = 值 定义的符号
 * @returns {boolean}
 */
function isZeroPageExpression(expression, equates) {
  if (expression.label === null) return expression.digits > 0 && expression.digits <= 2;
  if (expression.part !== null || !equates.has(expression.label)) return false;
  const value = equates.get(expression.label) + expression.offset;
  return value >= 0 && value <= 0xff;
}

/**
 * 判断指令的寻址方式与操作数表达式。
 * @param {string} mnemonic 助记符
 * @param {string} operandText 操作数文本，可为空
 * @param {Map<string, number>} equates NAME = 值 定义的符号
 * @returns {{mode: string, expression: {label: string|null, offset: number, digits: number}|null}}
 */
function classifyOperand(mnemonic, operandText, equates) {
  const text = operandText.trim();
  if (text === '') return { mode: 'imp', expression: null };
  if (text.toUpperCase() === 'A' && ACCUMULATOR_MNEMONICS.has(mnemonic)) return { mode: 'acc', expression: null };
  if (text.startsWith('#')) return { mode: 'imm', expression: parseExpression(text.slice(1)) };

  let match = /^\((.+),\s*[Xx]\)$/.exec(text);
  if (match) return { mode: 'izx', expression: parseExpression(match[1]) };
  match = /^\((.+)\)\s*,\s*[Yy]$/.exec(text);
  if (match) return { mode: 'izy', expression: parseExpression(match[1]) };
  match = /^\((.+)\)$/.exec(text);
  if (match) return { mode: 'ind', expression: parseExpression(match[1]) };

  if (BRANCH_MNEMONICS.has(mnemonic)) return { mode: 'rel', expression: parseExpression(text) };

  match = /^(.+),\s*([XxYy])$/.exec(text);
  const index = match ? match[2].toUpperCase() : '';
  const expression = parseExpression(match ? match[1] : text);
  const zeroPage = isZeroPageExpression(expression, equates);
  if (index === 'X') return { mode: zeroPage ? 'zpx' : 'abx', expression };
  if (index === 'Y') return { mode: zeroPage ? 'zpy' : 'aby', expression };
  return { mode: zeroPage ? 'zp' : 'abs', expression };
}

/**
 * 按 < 或 > 前缀取值的低、高字节。
 * @param {number} value 值
 * @param {'low'|'high'|null} part 取哪一部分，null 表示原值
 * @returns {number}
 */
function applyPart(value, part) {
  if (part === 'low') return value & 0xff;
  if (part === 'high') return (value >> 8) & 0xff;
  return value;
}

/**
 * 去掉行末注释：分号在双引号字符串里时不算注释。
 * @param {string} rawLine 原始行
 * @returns {string}
 */
function stripComment(rawLine) {
  let inString = false;
  for (let i = 0; i < rawLine.length; i++) {
    const ch = rawLine[i];
    if (inString && ch === '\\') i++;
    else if (ch === '"') inString = !inString;
    else if (ch === ';' && !inString) return rawLine.slice(0, i);
  }
  return rawLine;
}

/**
 * 解析 .ascii 的双引号字符串。
 * @param {string} text 操作数文本
 * @returns {number[]} 字节
 */
function parseString(text) {
  const match = /^\s*"((?:[^"\\]|\\.)*)"\s*$/.exec(text);
  if (!match) throw new Error(`.ascii 需要一个双引号字符串：${text}`);
  const bytes = [];
  const body = match[1];
  for (let i = 0; i < body.length; i++) {
    let ch = body[i];
    if (ch === '\\') {
      const next = body[++i];
      if (next === 'x') {
        const hex = body.slice(i + 1, i + 3);
        if (!/^[0-9A-Fa-f]{2}$/.test(hex)) throw new Error(`无效的 \\x 转义：${text}`);
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
      const escapes = { n: 10, r: 13, '0': 0, '\\': 92, '"': 34 };
      if (!(next in escapes)) throw new Error(`无效的转义：\\${next}`);
      bytes.push(escapes[next]);
      continue;
    }
    if (ch.charCodeAt(0) > 0x7e || ch.charCodeAt(0) < 0x20) throw new Error(`.ascii 里只能写可见 ASCII 字符：${text}`);
    bytes.push(ch.charCodeAt(0));
  }
  return bytes;
}

/**
 * 把一行文本拆成标签、指令（或伪指令）与操作数。
 * @param {string} rawLine 原始行
 * @returns {{labels: string[], op: string|null, operand: string}}
 */
function splitLine(rawLine) {
  let line = stripComment(rawLine).trim();
  const labels = [];
  for (;;) {
    const match = /^(@?[A-Za-z_][A-Za-z0-9_]*):\s*/.exec(line);
    if (!match) break;
    labels.push(match[1]);
    line = line.slice(match[0].length);
  }
  if (line === '') return { labels, op: null, operand: '' };
  const space = line.search(/\s/);
  return space < 0
    ? { labels, op: line, operand: '' }
    : { labels, op: line.slice(0, space), operand: line.slice(space + 1) };
}

/**
 * 收集所有源文件中的 NAME = 值 定义。表达式可引用其他符号定义，因此允许先使用后定义。
 * @param {{name: string, text: string}[]} sources 源文件
 * @returns {Map<string, number>}
 */
function collectEquates(sources) {
  const pending = [];
  for (const source of sources) {
    source.text.split(/\r?\n/).forEach((rawLine, index) => {
      const match = EQUATE_LINE.exec(stripComment(rawLine));
      if (match) pending.push({ name: match[1], text: match[2], where: `${source.name}:${index + 1}` });
    });
  }
  const equates = new Map();
  let remaining = pending;
  while (remaining.length > 0) {
    const unresolved = [];
    for (const item of remaining) {
      const expression = parseExpression(item.text);
      if (expression.label !== null && !equates.has(expression.label)) {
        unresolved.push(item);
        continue;
      }
      if (equates.has(item.name)) throw new Error(`${item.where}: 符号重复定义：${item.name}`);
      const base = expression.label === null ? expression.offset : equates.get(expression.label) + expression.offset;
      equates.set(item.name, applyPart(base, expression.part));
    }
    if (unresolved.length === remaining.length) {
      throw new Error(`${unresolved[0].where}: 符号 ${unresolved[0].name} 的值引用了未定义的符号`);
    }
    remaining = unresolved;
  }
  return equates;
}

/**
 * 汇编若干个源文件。所有文件共用一张符号表，因此文件之间可以互相引用标签。
 * @param {{name: string, text: string}[]} sources 源文件
 * @returns {{segments: {source: string, org: number, bytes: Uint8Array}[], symbols: Map<string, number>}}
 */
export function assemble(sources) {
  const symbols = new Map();
  const parsed = [];
  const equates = collectEquates(sources);
  for (const [name, value] of equates) symbols.set(name, value);

  // 第一遍：分行、计算每条指令的长度并登记标签
  let carry = { pc: null, shift: 0 };
  for (const source of sources) {
    // continues 的文件接着前一个文件的地址状态往下汇编
    let pc = source.continues ? carry.pc : null;
    // 运行地址减去存放地址；.rorg 期间不为 0
    let shift = source.continues ? carry.shift : 0;
    // 当前所在的全局标签，局部标签 @名字 以它为作用域
    let scope = '';
    const items = [];
    source.text.split(/\r?\n/).forEach((rawLine, index) => {
      const where = `${source.name}:${index + 1}`;
      try {
        if (EQUATE_LINE.test(stripComment(rawLine))) return;
        const { labels, op, operand } = splitLine(rawLine);
        for (const label of labels) {
          if (pc === null) throw new Error('标签前缺少 .org');
          let name = label;
          if (label.startsWith('@')) {
            if (scope === '') throw new Error(`局部标签 ${label} 前缺少全局标签`);
            name = scope + label;
          } else {
            scope = label;
          }
          if (symbols.has(name)) throw new Error(`标签重复定义：${name}`);
          symbols.set(name, pc);
        }
        if (op === null) return;
        if (op.toLowerCase() === '.org') {
          pc = parseExpression(operand).offset;
          shift = 0;
          items.push({ kind: 'org', pc, where });
          return;
        }
        if (pc === null) throw new Error('缺少 .org');
        if (op.toLowerCase() === '.rorg') {
          const target = parseExpression(operand).offset;
          shift = target - (pc - shift);
          pc = target;
          return;
        }
        if (op.toLowerCase() === '.rend') {
          pc -= shift;
          shift = 0;
          return;
        }
        if (op.toLowerCase() === '.byte') {
          const expressions = operand.split(',').map((part) => parseExpression(part));
          items.push({ kind: 'byte', pc, expressions, scope, where });
          pc += expressions.length;
          return;
        }
        if (op.toLowerCase() === '.ascii') {
          const bytes = parseString(operand);
          items.push({ kind: 'raw', pc, bytes, where });
          pc += bytes.length;
          return;
        }
        if (op.toLowerCase() === '.word') {
          const expressions = operand.split(',').map((part) => parseExpression(part));
          items.push({ kind: 'word', pc, expressions, scope, where });
          pc += expressions.length * 2;
          return;
        }
        const mnemonic = op.toUpperCase();
        const { mode, expression } = classifyOperand(mnemonic, operand, equates);
        const form = OPCODE_BY_FORM.get(`${mnemonic} ${mode}`);
        if (!form) throw new Error(`不支持的指令形式：${mnemonic} ${mode}`);
        items.push({ kind: 'ins', pc, form, mode, expression, scope, where });
        pc += MODE_LENGTH[mode];
      } catch (error) {
        throw new Error(`${where}: ${error.message}`);
      }
    });
    parsed.push({ source: source.name, items, continues: Boolean(source.continues) });
    carry = { pc, shift };
  }

  // 第二遍：生成字节
  const segments = [];
  const resolve = (expression, where, scope) => {
    if (expression.label === null) return applyPart(expression.offset, expression.part);
    const name = expression.label.startsWith('@') ? scope + expression.label : expression.label;
    if (!symbols.has(name)) throw new Error(`${where}: 未定义的标签 ${expression.label}`);
    return applyPart(symbols.get(name) + expression.offset, expression.part);
  };

  let segment = null;
  for (const { source, items, continues } of parsed) {
    if (!continues) segment = null;
    for (const item of items) {
      if (item.kind === 'org') {
        segment = { source, org: item.pc, bytes: [], lines: [] };
        segments.push(segment);
        continue;
      }
      const start = segment.bytes.length;
      if (item.kind === 'byte') {
        segment.bytes.push(...item.expressions.map((e) => resolve(e, item.where, item.scope) & 0xff));
      } else if (item.kind === 'raw') {
        segment.bytes.push(...item.bytes);
      } else if (item.kind === 'word') {
        for (const e of item.expressions) {
          const value = resolve(e, item.where, item.scope);
          segment.bytes.push(value & 0xff, (value >> 8) & 0xff);
        }
      } else {
        const value = item.expression ? resolve(item.expression, item.where, item.scope) : 0;
        segment.bytes.push(item.form.code);
        if (item.mode === 'rel') {
          const offset = value - (item.pc + 2);
          if (offset < -128 || offset > 127) throw new Error(`${item.where}: 分支超出范围`);
          segment.bytes.push(offset & 0xff);
        } else if (MODE_LENGTH[item.mode] === 2) {
          segment.bytes.push(value & 0xff);
        } else if (MODE_LENGTH[item.mode] === 3) {
          segment.bytes.push(value & 0xff, (value >> 8) & 0xff);
        }
      }
      segment.lines.push({ where: item.where, kind: item.kind, start, length: segment.bytes.length - start, address: item.pc });
    }
  }

  return { segments: segments.map((s) => ({ ...s, bytes: Uint8Array.from(s.bytes) })), symbols };
}

/** 判断一个字符串是否是合法的标签名 */
export function isLabelName(name) {
  return LABEL_NAME.test(name);
}
