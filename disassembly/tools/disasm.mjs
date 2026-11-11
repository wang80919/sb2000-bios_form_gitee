// ------------------------------------------------------------------------
// 名称：disasm.mjs
// 说明：6502 反汇编核心：解码单条指令并按本工具链约定的汇编语法输出文本。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：语法约定见 asm6502.mjs。零页操作数写两位十六进制，绝对地址写四位，
//       汇编器据此区分寻址宽度，保证反汇编输出再汇编后字节完全一致。
// ------------------------------------------------------------------------
import { BRANCHES, OPCODES, OPCODE_BY_FORM } from '../../bios/tools/opcodes.mjs';

/**
 * @typedef {object} Instruction
 * @property {number} pc 指令地址
 * @property {number} code 操作码
 * @property {import('../../bios/tools/opcodes.mjs').OpInfo} info 指令信息
 * @property {number} operand 操作数原始值（无操作数为 0；rel 为带符号偏移）
 * @property {number} length 总字节数
 * @property {number|null} target 控制流目标地址（JMP/JSR 绝对、条件分支），其余为 null
 * @property {boolean} canonical 汇编器能否从文本还原出同一操作码
 */

/**
 * 解码一条指令。
 * @param {(addr: number) => number} read 按地址读取字节
 * @param {number} pc 指令地址
 * @returns {Instruction}
 */
export function decodeInstruction(read, pc) {
  const code = read(pc & 0xffff);
  const info = OPCODES[code];
  let operand = 0;
  if (info.length === 2) operand = read((pc + 1) & 0xffff);
  if (info.length === 3) operand = read((pc + 1) & 0xffff) | (read((pc + 2) & 0xffff) << 8);

  let target = null;
  if (info.mode === 'rel') target = (pc + 2 + (operand > 127 ? operand - 256 : operand)) & 0xffff;
  else if ((info.mnemonic === 'JMP' && info.mode === 'abs') || info.mnemonic === 'JSR') target = operand;

  const canonical = OPCODE_BY_FORM.get(`${info.mnemonic} ${info.mode}`)?.code === code;
  return { pc, code, info, operand, length: info.length, target, canonical };
}

const hex2 = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const hex4 = (value) => value.toString(16).toUpperCase().padStart(4, '0');

/**
 * 把指令格式化为汇编文本（不含标签与注释）。
 * @param {Instruction} ins 解码结果
 * @param {(address: number) => string|null} [labelFor] 控制流目标的符号名，没有则返回 null
 * @returns {string}
 */
export function formatInstruction(ins, labelFor = () => null) {
  const { mnemonic, mode } = ins.info;
  const absolute = () => (ins.target !== null ? (labelFor(ins.target) ?? `$${hex4(ins.target)}`) : `$${hex4(ins.operand)}`);

  switch (mode) {
    case 'imp': return mnemonic;
    case 'acc': return `${mnemonic} A`;
    case 'imm': return `${mnemonic} #$${hex2(ins.operand)}`;
    case 'zp': return `${mnemonic} $${hex2(ins.operand)}`;
    case 'zpx': return `${mnemonic} $${hex2(ins.operand)},X`;
    case 'zpy': return `${mnemonic} $${hex2(ins.operand)},Y`;
    case 'izx': return `${mnemonic} ($${hex2(ins.operand)},X)`;
    case 'izy': return `${mnemonic} ($${hex2(ins.operand)}),Y`;
    case 'rel': return `${mnemonic} ${absolute()}`;
    case 'abs': return `${mnemonic} ${absolute()}`;
    case 'abx': return `${mnemonic} $${hex4(ins.operand)},X`;
    case 'aby': return `${mnemonic} $${hex4(ins.operand)},Y`;
    case 'ind': return `${mnemonic} ($${hex4(ins.operand)})`;
    default: throw new Error(`未知寻址方式：${mode}`);
  }
}

/**
 * 指令是否无条件结束当前控制流（之后的字节不会顺序执行到）。
 * @param {Instruction} ins 解码结果
 * @returns {boolean}
 */
export function endsFlow(ins) {
  const m = ins.info.mnemonic;
  return m === 'JMP' || m === 'RTS' || m === 'RTI' || m === 'JAM' || m === 'BRK';
}

/**
 * 指令是否为条件分支。
 * @param {Instruction} ins 解码结果
 * @returns {boolean}
 */
export function isBranch(ins) {
  return BRANCHES.has(ins.info.mnemonic);
}
