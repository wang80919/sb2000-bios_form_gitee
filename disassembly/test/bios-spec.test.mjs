// ------------------------------------------------------------------------
// 名称：bios-spec.test.mjs
// 说明：测试例程规格分析工具 tools/bios-spec.mjs：寄存器输入的数据流、保存与恢复寄存器的序言、进位结果、读写的符号、调用与系统功能、被调用者输入的传递。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用合成的源文件文本测试，地址与例程名都是虚构的。
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSpec, buildVariableTable, decodeOperand, findPrologue, readEquates, regionOf, renderCallGraph, renderRoutineTable, renderVariableTable } from '../tools/bios-spec.mjs';

const EQUATES = ['ZP_10 = $10', 'RAM_0300 = $0300', 'SYS_FUNCTION = $063E', 'SYS_SUBFUNCTION = $063F', 'VEC_SYSCALL = $FFF0', 'IO_4000 = $4000'].join('\n');

const SOURCE = [
  '; 读 ZP_10 加 X 指针，进位结果',
  'ADD_X:',
  '    CLC ; $8000',
  '    LDA ZP_10 ; $8001',
  '    ADC RAM_0300,X ; $8003',
  '    STA RAM_0300 ; $8006',
  '    RTS ; $8009',
  '; 不读任何输入寄存器：先写 A 再用',
  'WRITE_FIRST:',
  '    LDA #$05 ; $800A',
  '    STA IO_4000 ; $800C',
  '    SEC ; $800F',
  '    RTS ; $8010',
  '; 保存并恢复寄存器，调用 ADD_X，再发系统调用',
  'CALLER:',
  '    PHA ; $8011',
  '    TXA ; $8012',
  '    PHA ; $8013',
  '    JSR ADD_X ; $8014',
  '    LDA #$25 ; $8017',
  '    STA SYS_FUNCTION ; $8019',
  '    LDA #$03 ; $801C',
  '    STA SYS_SUBFUNCTION ; $801E',
  '    JSR VEC_SYSCALL ; $8021',
  '    PLA ; $8024',
  '    TAX ; $8025',
  '    PLA ; $8026',
  '    RTS ; $8027',
].join('\n');

function withSource(callback) {
  return callback(buildSpec({ input: { equatesText: EQUATES, files: [{ name: 'p00.asm', text: SOURCE, positions: new Map() }] } }));
}

test('地址取自汇编器给出的行号映射，源码行尾没有地址注释也一样', () => {
  const text = SOURCE.replace(/ ; \$[0-9A-F]{4}/g, '');
  const positions = new Map();
  SOURCE.split('\n').forEach((line, index) => {
    const m = /; \$([0-9A-F]{4})$/.exec(line);
    if (m) positions.set(index + 1, { address: parseInt(m[1], 16) });
  });
  const spec = buildSpec({ input: { equatesText: EQUATES, files: [{ name: 'p00.asm', text, positions }] } });
  assert.equal(spec.routines.find((r) => r.name === 'ADD_X').address, 0x8000);
  assert.equal(spec.routines.find((r) => r.name === 'CALLER').address, 0x8011);
});

test('equates 与操作数解析', () => {
  assert.equal(readEquates(EQUATES).get('RAM_0300'), 0x300);
  assert.deepEqual(decodeOperand('RAM_0300,X'), { kind: 'mem', name: 'RAM_0300', index: 'X', offset: null });
  assert.deepEqual(decodeOperand('(ZP_10),Y'), { kind: 'ind', name: 'ZP_10', index: 'Y', pointer: true });
  assert.equal(decodeOperand('#$05').kind, 'imm');
  assert.equal(decodeOperand('A').kind, 'acc');
});

test('入口先读 X 作索引：输入是 X，A 先写后用不算输入；改写 A，进位由 CLC 之后的 ADC 产生', () => {
  withSource(({ routines }) => {
    const add = routines.find((r) => r.name === 'ADD_X');
    assert.deepEqual(add.inputs, ['X']);
    assert.deepEqual(add.clobbers, ['A']);
    assert.deepEqual(add.reads, ['RAM_0300+X', 'ZP_10']);
    assert.deepEqual(add.writes, ['RAM_0300']);
    assert.equal(add.carryResult, false);
  });
});

test('先写后用没有输入，RTS 之前是 SEC 时标为进位结果，写硬件寄存器记入写集合', () => {
  withSource(({ routines }) => {
    const write = routines.find((r) => r.name === 'WRITE_FIRST');
    assert.deepEqual(write.inputs, []);
    assert.equal(write.carryResult, true);
    assert.deepEqual(write.writes, ['IO_4000']);
  });
});

test('序言保存的 A、X 在返回前恢复：不算输入也不算改写；调用记在 calls，系统功能号与子功能号被记下；被调用者的输入沿调用传递', () => {
  withSource(({ routines }) => {
    const caller = routines.find((r) => r.name === 'CALLER');
    assert.deepEqual(findPrologue(caller ? [{ mnemonic: 'PHA' }, { mnemonic: 'TXA' }, { mnemonic: 'PHA' }, { mnemonic: 'LDA' }] : []).saved, new Set(['A', 'X']));
    assert.deepEqual(caller.calls, ['ADD_X']);
    assert.deepEqual(caller.syscalls, ['$25/$03']);
    assert.deepEqual(caller.clobbers, []);
    assert.deepEqual(caller.inputs, ['X']); // ADD_X 要 X 作索引，调用前没有定义过 X，所以传递成自己的输入
  });
});

test('局部标签：不同例程里同名的 @loop 互不干扰，局部标签前的说明注释不会让它变成例程', () => {
  const text = [
    '; 数 Y 次',
    'COUNT_Y:',
    '    LDX #$00',
    '; 往回跳的循环',
    '@loop:',
    '    INX',
    '    DEY',
    '    BNE @loop',
    '    RTS',
    '; 数 X 次',
    'COUNT_X:',
    '    LDY #$00',
    '@loop:',
    '    INY',
    '    DEX',
    '    BNE @loop',
    '    RTS',
  ].join('\n');
  const spec = buildSpec({ input: { equatesText: EQUATES, files: [{ name: 'p00.asm', text, positions: new Map() }] } });
  assert.deepEqual(spec.routines.map((r) => r.name), ['COUNT_Y', 'COUNT_X']);
  assert.deepEqual(spec.routines[0].inputs, ['Y']);
  assert.deepEqual(spec.routines[1].inputs, ['X']);
});

test('文件头注释不算第一个例程的说明，例程上方紧挨着的注释才算', () => {
  const text = [
    '; ------------------------------------------------------------------------',
    '; 名称：demo.asm',
    '; 说明：演示文件',
    '; ------------------------------------------------------------------------',
    '; 返回 A=0',
    'ZERO_A:',
    '    LDA #$00',
    '    RTS',
  ].join('\n');
  const spec = buildSpec({ input: { equatesText: EQUATES, files: [{ name: 'demo.asm', text, positions: new Map() }] } });
  assert.equal(spec.routines[0].comment, '返回 A=0');
});

test('变量表、区域划分与三份 Markdown 都能生成', () => {
  withSource((spec) => {
    const table = buildVariableTable(spec);
    assert.deepEqual(table.map((v) => v.name), ['ZP_10', 'RAM_0300', 'SYS_FUNCTION', 'SYS_SUBFUNCTION', 'IO_4000']);
    assert.deepEqual(table.find((v) => v.name === 'RAM_0300').readers, ['ADD_X']);
    assert.equal(regionOf(0x10), '零页');
    assert.equal(regionOf(0x4000), 'PPU/APU/手柄寄存器');
    assert.equal(regionOf(0x6300), '扩展 RAM（ERAM）');
    assert.match(renderRoutineTable(spec), /\| ADD_X \|/);
    assert.match(renderVariableTable(spec), /内存变量与硬件寄存器表/);
    assert.match(renderCallGraph(spec), /\| CALLER \| ADD_X/);
  });
});
