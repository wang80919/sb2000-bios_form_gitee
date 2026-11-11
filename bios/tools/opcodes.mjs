// ------------------------------------------------------------------------
// 名称：opcodes.mjs
// 说明：6502 指令表（含常见非官方指令），给出每个操作码的助记符、寻址方式与字节数。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：BRK 按带一个填充字节处理（字节数 2，寻址方式 imm），与模拟器 CPU 核心的取指行为一致。
// ------------------------------------------------------------------------

/** 各寻址方式的指令总字节数 */
export const MODE_LENGTH = Object.freeze({
  imp: 1, acc: 1, imm: 2, zp: 2, zpx: 2, zpy: 2, rel: 2, izx: 2, izy: 2, abs: 3, abx: 3, aby: 3, ind: 3,
});

// 16 行（高半字节）×16 列（低半字节）的指令矩阵；每格为“助记符 寻址方式”
const MATRIX = [
  'BRK imm|ORA izx|JAM imp|SLO izx|NOP zp|ORA zp|ASL zp|SLO zp|PHP imp|ORA imm|ASL acc|ANC imm|NOP abs|ORA abs|ASL abs|SLO abs',
  'BPL rel|ORA izy|JAM imp|SLO izy|NOP zpx|ORA zpx|ASL zpx|SLO zpx|CLC imp|ORA aby|NOP imp|SLO aby|NOP abx|ORA abx|ASL abx|SLO abx',
  'JSR abs|AND izx|JAM imp|RLA izx|BIT zp|AND zp|ROL zp|RLA zp|PLP imp|AND imm|ROL acc|ANC imm|BIT abs|AND abs|ROL abs|RLA abs',
  'BMI rel|AND izy|JAM imp|RLA izy|NOP zpx|AND zpx|ROL zpx|RLA zpx|SEC imp|AND aby|NOP imp|RLA aby|NOP abx|AND abx|ROL abx|RLA abx',
  'RTI imp|EOR izx|JAM imp|SRE izx|NOP zp|EOR zp|LSR zp|SRE zp|PHA imp|EOR imm|LSR acc|ALR imm|JMP abs|EOR abs|LSR abs|SRE abs',
  'BVC rel|EOR izy|JAM imp|SRE izy|NOP zpx|EOR zpx|LSR zpx|SRE zpx|CLI imp|EOR aby|NOP imp|SRE aby|NOP abx|EOR abx|LSR abx|SRE abx',
  'RTS imp|ADC izx|JAM imp|RRA izx|NOP zp|ADC zp|ROR zp|RRA zp|PLA imp|ADC imm|ROR acc|ARR imm|JMP ind|ADC abs|ROR abs|RRA abs',
  'BVS rel|ADC izy|JAM imp|RRA izy|NOP zpx|ADC zpx|ROR zpx|RRA zpx|SEI imp|ADC aby|NOP imp|RRA aby|NOP abx|ADC abx|ROR abx|RRA abx',
  'NOP imm|STA izx|NOP imm|SAX izx|STY zp|STA zp|STX zp|SAX zp|DEY imp|NOP imm|TXA imp|XAA imm|STY abs|STA abs|STX abs|SAX abs',
  'BCC rel|STA izy|JAM imp|AHX izy|STY zpx|STA zpx|STX zpy|SAX zpy|TYA imp|STA aby|TXS imp|TAS aby|SHY abx|STA abx|SHX aby|AHX aby',
  'LDY imm|LDA izx|LDX imm|LAX izx|LDY zp|LDA zp|LDX zp|LAX zp|TAY imp|LDA imm|TAX imp|LAX imm|LDY abs|LDA abs|LDX abs|LAX abs',
  'BCS rel|LDA izy|JAM imp|LAX izy|LDY zpx|LDA zpx|LDX zpy|LAX zpy|CLV imp|LDA aby|TSX imp|LAS aby|LDY abx|LDA abx|LDX aby|LAX aby',
  'CPY imm|CMP izx|NOP imm|DCP izx|CPY zp|CMP zp|DEC zp|DCP zp|INY imp|CMP imm|DEX imp|AXS imm|CPY abs|CMP abs|DEC abs|DCP abs',
  'BNE rel|CMP izy|JAM imp|DCP izy|NOP zpx|CMP zpx|DEC zpx|DCP zpx|CLD imp|CMP aby|NOP imp|DCP aby|NOP abx|CMP abx|DEC abx|DCP abx',
  'CPX imm|SBC izx|NOP imm|ISC izx|CPX zp|SBC zp|INC zp|ISC zp|INX imp|SBC imm|NOP imp|SBC imm|CPX abs|SBC abs|INC abs|ISC abs',
  'BEQ rel|SBC izy|JAM imp|ISC izy|NOP zpx|SBC zpx|INC zpx|ISC zpx|SED imp|SBC aby|NOP imp|ISC aby|NOP abx|SBC abx|INC abx|ISC abx',
];

/** 非官方助记符；NOP 与 0xEB 的 SBC 另行判断 */
const UNOFFICIAL = new Set([
  'SLO', 'RLA', 'SRE', 'RRA', 'SAX', 'LAX', 'DCP', 'ISC', 'ANC', 'ALR', 'ARR', 'XAA', 'AHX', 'TAS', 'SHY', 'SHX', 'LAS', 'AXS', 'JAM',
]);

/**
 * @typedef {object} OpInfo
 * @property {number} code 操作码
 * @property {string} mnemonic 助记符，大写
 * @property {string} mode 寻址方式
 * @property {number} length 指令总字节数
 * @property {boolean} official 是否官方指令
 */

/** 256 项指令表，下标为操作码 @type {OpInfo[]} */
export const OPCODES = MATRIX.flatMap((row, high) =>
  row.split('|').map((cell, low) => {
    const [mnemonic, mode] = cell.split(' ');
    const code = high * 16 + low;
    const official = !UNOFFICIAL.has(mnemonic) && !(mnemonic === 'NOP' && code !== 0xea) && code !== 0xeb;
    return Object.freeze({ code, mnemonic, mode, length: MODE_LENGTH[mode], official });
  }),
);

/** 按“助记符 + 寻址方式”反查操作码；同一组合有多个操作码时取官方的、再取最小的 */
export const OPCODE_BY_FORM = (() => {
  const table = new Map();
  for (const info of OPCODES) {
    const key = `${info.mnemonic} ${info.mode}`;
    const existing = table.get(key);
    if (!existing || (info.official && !existing.official)) table.set(key, info);
  }
  return table;
})();

/** 条件分支与跳转类助记符，用于识别控制流 */
export const BRANCHES = new Set(['BPL', 'BMI', 'BVC', 'BVS', 'BCC', 'BCS', 'BNE', 'BEQ']);
