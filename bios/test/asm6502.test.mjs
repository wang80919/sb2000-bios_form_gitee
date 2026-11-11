// ------------------------------------------------------------------------
// 名称：asm6502.test.mjs
// 说明：测试汇编器的局部标签、多文件续接与行记录里的运行地址。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-10
// 备注：只测汇编器本身，不依赖 BIOS 工程。
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import test from 'node:test';
import { assemble } from '../tools/asm6502.mjs';

test('局部标签：不同例程里可以重名，各自指向自己例程里的位置', () => {
  const { segments, symbols } = assemble([{
    name: 'a.asm',
    text: ['.org $8000', 'FIRST:', '@loop:', '    DEX', '    BNE @loop', '    RTS', 'SECOND:', '@loop:', '    DEY', '    BNE @loop', '    RTS'].join('\n'),
  }]);
  assert.deepEqual([...segments[0].bytes], [0xca, 0xd0, 0xfd, 0x60, 0x88, 0xd0, 0xfd, 0x60]);
  assert.equal(symbols.get('FIRST@loop'), 0x8000);
  assert.equal(symbols.get('SECOND@loop'), 0x8004);
});

test('局部标签：可以被 .word 与 JMP 引用，也可以向前引用', () => {
  const { segments } = assemble([{
    name: 'a.asm',
    text: ['.org $8000', 'MAIN:', '    JMP @done', '@table:', '    .word @done', '@done:', '    RTS'].join('\n'),
  }]);
  assert.deepEqual([...segments[0].bytes], [0x4c, 0x05, 0x80, 0x05, 0x80, 0x60]);
});

test('局部标签：前面没有全局标签时报错', () => {
  assert.throws(() => assemble([{ name: 'a.asm', text: '.org $8000\n@x:\n    RTS\n' }]), /局部标签 @x 前缺少全局标签/);
});

test('局部标签：同一例程里重复定义报错', () => {
  assert.throws(() => assemble([{ name: 'a.asm', text: '.org $8000\nMAIN:\n@x:\n    RTS\n@x:\n    RTS\n' }]), /标签重复定义/);
});

test('局部标签：引用不存在的局部标签报错', () => {
  assert.throws(() => assemble([{ name: 'a.asm', text: '.org $8000\nMAIN:\n    JMP @nowhere\n' }]), /未定义的标签 @nowhere/);
});

test('多文件续接：后一个文件不写 .org，接在前一个文件的末尾，标签互相可见', () => {
  const { segments, symbols } = assemble([
    { name: 'a.asm', text: '.org $8000\nSTART:\n    JSR LATER\n    RTS\n' },
    { name: 'b.asm', continues: true, text: 'LATER:\n    LDA #$01\n    RTS\n' },
  ]);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].source, 'a.asm');
  assert.deepEqual([...segments[0].bytes], [0x20, 0x04, 0x80, 0x60, 0xa9, 0x01, 0x60]);
  assert.equal(symbols.get('LATER'), 0x8004);
  assert.deepEqual(segments[0].lines.map((line) => line.where), ['a.asm:3', 'a.asm:4', 'b.asm:2', 'b.asm:3']);
});

test('多文件续接：.rorg 状态与每个文件的局部标签作用域', () => {
  const { segments } = assemble([
    { name: 'a.asm', text: '.org $8000\nONE:\n@x:\n    NOP\n.rorg $6100\n' },
    { name: 'b.asm', continues: true, text: 'TWO:\n@x:\n    JMP @x\n' },
  ]);
  assert.deepEqual([...segments[0].bytes], [0xea, 0x4c, 0x00, 0x61]);
});

test('行记录带运行地址：.rorg 期间是运行地址，存放偏移照常累加', () => {
  const { segments } = assemble([{ name: 'a.asm', text: '.org $8000\n    NOP\n.rorg $6100\n    LDA #$01\n    RTS\n.rend\n    NOP\n' }]);
  assert.deepEqual(segments[0].lines.map((line) => [line.start, line.address]), [[0, 0x8000], [1, 0x6100], [3, 0x6102], [4, 0x8004]]);
});
