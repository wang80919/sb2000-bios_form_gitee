// ------------------------------------------------------------------------
// 名称：disasm.test.mjs
// 说明：指令表、反汇编与汇编器的测试，包含“所有操作码反汇编再汇编必须还原”的全量校验。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：无
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assemble } from '../../bios/tools/asm6502.mjs';
import { decodeInstruction, endsFlow, formatInstruction } from '../tools/disasm.mjs';
import { OPCODES } from '../../bios/tools/opcodes.mjs';

/** 把字节数组包装成按地址读取的函数 */
const reader = (bytes, base) => (addr) => bytes[addr - base] ?? 0;

test('指令表有 256 项且长度与寻址方式一致', () => {
  assert.equal(OPCODES.length, 256);
  assert.deepEqual([OPCODES[0xa9].mnemonic, OPCODES[0xa9].mode, OPCODES[0xa9].length], ['LDA', 'imm', 2]);
  assert.deepEqual([OPCODES[0x4c].mnemonic, OPCODES[0x4c].length], ['JMP', 3]);
  assert.equal(OPCODES[0x6c].mode, 'ind');
  assert.equal(OPCODES[0xea].official, true);
  assert.equal(OPCODES[0x1a].official, false);
  assert.equal(OPCODES[0xeb].official, false);
});

test('反汇编常见指令并给出控制流目标', () => {
  const code = [0x20, 0x34, 0x12, 0xd0, 0xfb, 0xb1, 0x10, 0x0a, 0x6c, 0x00, 0x30];
  const read = reader(code, 0x8000);
  const jsr = decodeInstruction(read, 0x8000);
  assert.equal(formatInstruction(jsr), 'JSR $1234');
  assert.equal(jsr.target, 0x1234);
  const bne = decodeInstruction(read, 0x8003);
  assert.equal(bne.target, 0x8000);
  assert.equal(formatInstruction(bne, (t) => (t === 0x8000 ? 'loop' : null)), 'BNE loop');
  assert.equal(formatInstruction(decodeInstruction(read, 0x8005)), 'LDA ($10),Y');
  assert.equal(formatInstruction(decodeInstruction(read, 0x8007)), 'ASL A');
  assert.equal(formatInstruction(decodeInstruction(read, 0x8008)), 'JMP ($3000)');
});

test('RTS、RTI、JMP 结束控制流，条件分支与 JSR 不结束', () => {
  const ends = (code) => endsFlow(decodeInstruction(reader([code, 0, 0], 0), 0));
  assert.equal(ends(0x60), true);
  assert.equal(ends(0x40), true);
  assert.equal(ends(0x4c), true);
  assert.equal(ends(0x20), false);
  assert.equal(ends(0xd0), false);
});

test('汇编器按字面量位数区分零页与绝对寻址', () => {
  const { segments } = assemble([{ name: 't', text: '.org $8000\nLDA $12\nLDA $0012\nLDA $12,X\nLDA $0012,X\nLDX $12,Y\n' }]);
  assert.deepEqual([...segments[0].bytes], [0xa5, 0x12, 0xad, 0x12, 0x00, 0xb5, 0x12, 0xbd, 0x12, 0x00, 0xb6, 0x12]);
});

test('汇编器支持跨文件标签、标签偏移与分支', () => {
  const { segments, symbols } = assemble([
    { name: 'a', text: '.org $8000\nstart: LDA #$01\nBNE far\nJSR other+2\n' },
    { name: 'b', text: '.org $8010\nother: RTS\nfar: NOP\n' },
  ]);
  assert.equal(symbols.get('other'), 0x8010);
  assert.deepEqual([...segments[0].bytes], [0xa9, 0x01, 0xd0, 0x0d, 0x20, 0x12, 0x80]);
});

test('NAME = 值 定义的符号：值不超过 $FF 按零页，否则按绝对寻址，可先使用后定义', () => {
  const { segments, symbols } = assemble([
    { name: 'a', text: '.org $8000\nLDA ZP_VAR\nSTA RAM_VAR\nLDA ZP_VAR+1,X\nLDA ZP_VAR2\nJMP (ZP_VAR)\nLDA #<RAM_VAR\nLDA #>RAM_VAR\n' },
    { name: 'b', text: 'ZP_VAR = $10\nZP_VAR2 = ZP_VAR + 4 ; 引用其他符号\nRAM_VAR = $0640\n' },
  ]);
  assert.equal(symbols.get('ZP_VAR2'), 0x14);
  assert.deepEqual([...segments[0].bytes], [
    0xa5, 0x10, 0x8d, 0x40, 0x06, 0xb5, 0x11, 0xa5, 0x14, 0x6c, 0x10, 0x00, 0xa9, 0x40, 0xa9, 0x06,
  ]);
});

test('符号重复定义或引用未定义符号时汇编报错', () => {
  assert.throws(() => assemble([{ name: 't', text: 'A = $01\nA = $02\n' }]), /符号重复定义/);
  assert.throws(() => assemble([{ name: 't', text: 'A = B\n' }]), /未定义的符号/);
});

test('.word 输出小端 16 位字，可用标签、符号与偏移', () => {
  const { segments } = assemble([{ name: 't', text: '.org $8000\nstart: .word start, start+2, VEC\n.byte $FF\nVEC = $1234\n' }]);
  assert.deepEqual([...segments[0].bytes], [0x00, 0x80, 0x02, 0x80, 0x34, 0x12, 0xff]);
});

test('.ascii 输出字符串字节，支持转义，引号里的分号不是注释', () => {
  const { segments } = assemble([{ name: 't', text: '.org $8000\n.ascii "A;B\\r\\n\\x7F\\\\\\"" ; 注释\nx: NOP\n.ascii "" \n' }]);
  assert.deepEqual([...segments[0].bytes], [0x41, 0x3b, 0x42, 0x0d, 0x0a, 0x7f, 0x5c, 0x22, 0xea]);
});

test('.ascii 只接受可见 ASCII 与双引号字符串', () => {
  assert.throws(() => assemble([{ name: 't', text: '.org $8000\n.ascii 你好\n' }]), /双引号字符串/);
  assert.throws(() => assemble([{ name: 't', text: '.org $8000\n.ascii "你"\n' }]), /可见 ASCII/);
  assert.throws(() => assemble([{ name: 't', text: '.org $8000\n.ascii "\\q"\n' }]), /无效的转义/);
});

test('分支超出范围或标签未定义时汇编报错', () => {
  assert.throws(() => assemble([{ name: 't', text: '.org $8000\nBNE $9000\n' }]), /分支超出范围/);
  assert.throws(() => assemble([{ name: 't', text: '.org $8000\nJMP nowhere\n' }]), /未定义的标签/);
  assert.throws(() => assemble([{ name: 't', text: 'LDA #$01\n' }]), /缺少 \.org/);
});

test('.rorg 让代码按另一个地址汇编但仍依次存放，.rend 后回到存放地址', () => {
  const { segments, symbols } = assemble([{
    name: 't',
    text: '.org $8000\nNOP\n.rorg $6100\nrun: LDA table\nBNE run\nJMP run\ntable: .byte $07\n.rend\nafter: RTS\n',
  }]);
  assert.equal(symbols.get('run'), 0x6100);
  assert.equal(symbols.get('table'), 0x6108);
  assert.equal(symbols.get('after'), 0x800a);
  // NOP / LDA $6108 / BNE run（回到 $6100：偏移 -5）/ JMP $6100 / .byte 7 / RTS
  assert.deepEqual([...segments[0].bytes], [0xea, 0xad, 0x08, 0x61, 0xd0, 0xfb, 0x4c, 0x00, 0x61, 0x07, 0x60]);
});

test('汇编器用 < 与 > 取标号的低、高字节，.byte 里也可使用', () => {
  const { segments } = assemble([{
    name: 't',
    text: '.org $8000\nLDA #<data\nLDX #>data\nLDY #<data+1\n.byte <data,>data\ndata: .byte $00\n',
  }]);
  // data 位于 $8000 + 2 + 2 + 2 + 2 = $8008
  assert.deepEqual([...segments[0].bytes], [0xa9, 0x08, 0xa2, 0x80, 0xa0, 0x09, 0x08, 0x80, 0x00]);
});

test('所有可还原的操作码反汇编再汇编后字节完全一致', () => {
  let checked = 0;
  for (const info of OPCODES) {
    for (const operandSeed of [0x00, 0x7f, 0x80, 0xfe, 0x35]) {
      const bytes = [info.code, operandSeed, (operandSeed * 7 + 3) & 0xff].slice(0, info.length);
      const ins = decodeInstruction(reader(bytes, 0x9000), 0x9000);
      if (!ins.canonical) continue;
      const text = `.org $9000\n${formatInstruction(ins)}\n`;
      const { segments } = assemble([{ name: 'rt', text }]);
      assert.deepEqual([...segments[0].bytes], bytes, `${info.mnemonic} ${info.mode} ${text}`);
      checked++;
    }
  }
  assert.ok(checked > 800);
});
