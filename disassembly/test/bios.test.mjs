// ------------------------------------------------------------------------
// 名称：bios.test.mjs
// 说明：测试 BIOS 工程：分段规则、清单生成（标签、数据切分、重新汇编一致），以及整个工程能逐字节重建原始 ROM。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：运行 npm test；原始 ROM 或 bios/ 工程不存在时跳过最后一项
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { assemble } from '../../bios/tools/asm6502.mjs';
import { buildBios, BIOS_DIR, firstDifference, MODIFIED_MARKER } from '../../bios/tools/bios-build.mjs';
import { generateSegmentBodies, PAGE_SIZE, splitSegments } from '../tools/bios-listing.mjs';
import { ramName, renderEquates } from '../tools/bios-names.mjs';
import { BIOS_ROM } from '../tools/config.mjs';

test('splitSegments：页号与汇编地址都连续才合成一段，固定内核区单独成段', () => {
  const pages = [
    { index: 0, base: 0x8000, codeBytes: 100 },
    { index: 1, base: 0x9000, codeBytes: 100 },
    { index: 2, base: 0xa000, codeBytes: 0 },
    { index: 3, base: 0xb000, codeBytes: 100 },
    { index: 4, base: 0xc000, codeBytes: 100 },
    { index: 5, base: 0xd000, codeBytes: 100 },
    { index: 6, base: 0x8000, codeBytes: 100 },
    { index: 7, base: 0x8000, codeBytes: 100 },
  ];
  assert.deepEqual(splitSegments(pages), [
    { firstPage: 0, pageCount: 2, base: 0x8000 },
    { firstPage: 3, pageCount: 1, base: 0xb000 },
    { firstPage: 4, pageCount: 2, base: 0xc000 },
    { firstPage: 6, pageCount: 1, base: 0x8000 },
    { firstPage: 7, pageCount: 1, base: 0x8000 },
  ]);
});

/** 构造两页的小 ROM 与 CDL：$8000 起 JSR $8010 / LDA $8021,X / LDA $8011,X / RTS，$8010 起 LDA #$12 / RTS */
function tinyRom() {
  const rom = new Uint8Array(2 * PAGE_SIZE);
  rom.set([0x20, 0x10, 0x80, 0xbd, 0x21, 0x80, 0xbd, 0x11, 0x80, 0x60], 0);
  rom.set([0xa9, 0x12, 0x60], 0x10);
  rom.set([0xaa, 0xbb, 0xcc], 0x20);
  const cdl = new Uint8Array(rom.length);
  const mark = (offset, length) => {
    cdl[offset] = 0x01;
    for (let i = 1; i < length; i++) cdl[offset + i] = 0x02;
  };
  mark(0, 3);
  mark(3, 3);
  mark(6, 3);
  mark(9, 1);
  mark(0x10, 2);
  mark(0x12, 1);
  return { rom, cdl };
}

test('generateSegmentBodies：用标签表示跳转与读取，数据在被引用处切开，重新汇编后字节一致', () => {
  const { rom, cdl } = tinyRom();
  const segments = [{ firstPage: 0, pageCount: 2, base: 0x8000 }];
  const body = generateSegmentBodies(rom, cdl, { segments }).get(0);
  assert.match(body, /JSR P00_8010/);
  assert.match(body, /LDA P00_8021,X/);
  // 引用落在指令 LDA #$12 的操作数上：标签加偏移
  assert.match(body, /LDA P00_8010\+1,X/);
  assert.match(body, /^P00_8021:$/m);
  const { segments: out } = assemble([{ name: 'tiny', text: body }]);
  assert.equal(out.length, 1);
  assert.deepEqual([...out[0].bytes], [...rom]);
});

test('generateSegmentBodies：写入类指令的地址不生成标签', () => {
  const rom = new Uint8Array(PAGE_SIZE);
  rom.set([0x8d, 0x00, 0x80, 0x60]);
  const cdl = new Uint8Array(rom.length);
  cdl.set([0x01, 0x02, 0x02, 0x01]);
  const body = generateSegmentBodies(rom, cdl, { segments: [{ firstPage: 0, pageCount: 1, base: 0x8000 }] }).get(0);
  assert.match(body, /STA \$8000/);
  assert.doesNotMatch(body, /P00_8000/);
});

/**
 * 构造一页的小 ROM 与 CDL：代码按字节数组依次放在 $8000 起，其后的数据由调用者按偏移写入。
 * @param {number[][]} instructions 每条指令的字节
 * @param {Record<number, number[]>} [data] 偏移到数据字节
 */
function pageWith(instructions, data = {}) {
  const rom = new Uint8Array(PAGE_SIZE);
  const cdl = new Uint8Array(PAGE_SIZE);
  let offset = 0;
  for (const bytes of instructions) {
    rom.set(bytes, offset);
    cdl[offset] = 0x01;
    for (let i = 1; i < bytes.length; i++) cdl[offset + i] = 0x02;
    offset += bytes.length;
  }
  for (const [at, bytes] of Object.entries(data)) rom.set(bytes, Number(at));
  return { rom, cdl };
}

const ONE_PAGE = [{ firstPage: 0, pageCount: 1, base: 0x8000 }];

/** 生成正文，并连同符号定义一起重新汇编，返回正文与汇编出的字节 */
function listAndReassemble(rom, cdl, options = {}) {
  const usedRam = new Set();
  const body = generateSegmentBodies(rom, cdl, { segments: ONE_PAGE, ramName, usedRam, ...options }).get(0);
  const { segments } = assemble([{ name: 'equates', text: renderEquates(usedRam) }, { name: 'body', text: body }]);
  return { body, bytes: [...segments[0].bytes] };
}

test('硬件与系统变量用符号名；零页写法保持零页，绝对寻址的低地址保持数字', () => {
  const { rom, cdl } = pageWith([[0xa5, 0x10], [0x8d, 0x42, 0x06], [0xad, 0x10, 0x00], [0x8d, 0x01, 0x20], [0x6c, 0x10, 0x00], [0x60]]);
  const { body, bytes } = listAndReassemble(rom, cdl);
  assert.match(body, /LDA CALL_VEC_LO/);
  assert.match(body, /STA SYS_GROUP/);
  assert.match(body, /LDA \$0010 ;/);
  assert.match(body, /STA PPU_MASK/);
  assert.match(body, /JMP \(CALL_VEC_LO\)/);
  assert.deepEqual(bytes, [...rom]);
});

test('成对写入相邻地址的立即数合成 ROM 或 RAM 地址时，改写成 #<符号、#>符号', () => {
  const { rom, cdl } = pageWith(
    [[0xa9, 0x20], [0x85, 0x4b], [0xa9, 0x80], [0x85, 0x4c], [0xa9, 0x34], [0x8d, 0x00, 0x03], [0xa9, 0x12], [0x8d, 0x01, 0x03], [0x60]],
    { 0x20: [0x41, 0x42, 0x00] },
  );
  // 第二组合成 $1234，不在“指向变量”的范围内，保持数字
  const { body, bytes } = listAndReassemble(rom, cdl);
  assert.match(body, /LDA #<P00_8020/);
  assert.match(body, /LDA #>P00_8020/);
  assert.match(body, /^P00_8020:$/m);
  assert.match(body, /LDA #\$12/);
  assert.deepEqual(bytes, [...rom]);

  const ram = pageWith([[0xa9, 0x00], [0x85, 0x4b], [0xa9, 0x63], [0x85, 0x4c], [0x60]]);
  const listed = listAndReassemble(ram.rom, ram.cdl);
  assert.match(listed.body, /LDA #<DOS_ERROR/);
  assert.match(listed.body, /LDA #>DOS_ERROR/);
  assert.deepEqual(listed.bytes, [...ram.rom]);
});

test('写入功能号与子功能号（$063E、$063F）的立即数不当作地址；RAM 值存进绝对地址时也不当作地址', () => {
  const syscall = pageWith([[0xa9, 0x80], [0x8d, 0x3e, 0x06], [0xa9, 0x07], [0x8d, 0x3f, 0x06], [0x60]]);
  const listedSyscall = listAndReassemble(syscall.rom, syscall.cdl);
  assert.doesNotMatch(listedSyscall.body, /#[<>]/);
  assert.deepEqual(listedSyscall.bytes, [...syscall.rom]);

  const absolute = pageWith([[0xa9, 0x00], [0x8d, 0x00, 0x03], [0xa9, 0x63], [0x8d, 0x01, 0x03], [0x60]]);
  const listedAbsolute = listAndReassemble(absolute.rom, absolute.cdl);
  assert.doesNotMatch(listedAbsolute.body, /#[<>]/);
  assert.deepEqual(listedAbsolute.bytes, [...absolute.rom]);
});

test('高字节先写时低字节仍取在较低的地址', () => {
  const { rom, cdl } = pageWith([[0xa9, 0x80], [0x85, 0x4c], [0xa9, 0x20], [0x85, 0x4b], [0x60]], { 0x20: [0xaa] });
  const { body, bytes } = listAndReassemble(rom, cdl);
  assert.match(body, /LDA #>P00_8020/);
  assert.match(body, /LDA #<P00_8020/);
  assert.deepEqual(bytes, [...rom]);
});

test('连续 4 项以上指向指令起点的地址输出 .word，不足 4 项时保持 .byte', () => {
  const nops = Array.from({ length: 8 }, () => [0xea]);
  const four = pageWith(nops, { 0x10: [0x00, 0x80, 0x01, 0x80, 0x02, 0x80, 0x03, 0x80] });
  const listedFour = listAndReassemble(four.rom, four.cdl);
  assert.match(listedFour.body, /\.word P00_8000,P00_8001,P00_8002,P00_8003 ; \$8010/);
  assert.deepEqual(listedFour.bytes, [...four.rom]);

  const three = pageWith(nops, { 0x10: [0x00, 0x80, 0x01, 0x80, 0x02, 0x80] });
  const listedThree = listAndReassemble(three.rom, three.cdl);
  assert.doesNotMatch(listedThree.body, /\.word/);
  assert.deepEqual(listedThree.bytes, [...three.rom]);
});

test('多数项低字节为 0 的连续“地址”不当作地址表（按键映射之类的数据）', () => {
  const nops = Array.from({ length: 8 }, () => [0xea]);
  const code = pageWith(nops, { 0x10: [0x00, 0x80, 0x00, 0x80, 0x00, 0x80, 0x02, 0x80] });
  const listed = listAndReassemble(code.rom, code.cdl);
  assert.doesNotMatch(listed.body, /\.word/);
  assert.deepEqual(listed.bytes, [...code.rom]);
});

test('静态追踪给出的内联跳转表按项数输出 .word', () => {
  const nops = Array.from({ length: 4 }, () => [0xea]);
  const { rom, cdl } = pageWith(nops, { 0x10: [0x02, 0x80, 0x03, 0x80] });
  const listed = listAndReassemble(rom, cdl, { inlineTables: new Map([[0x10, 2]]) });
  assert.match(listed.body, /\.word P00_8002,P00_8003 ; \$8010/);
  assert.deepEqual(listed.bytes, [...rom]);
});

test('被其他指令引用的位置落在地址表中间时，表在该处截断', () => {
  const nops = Array.from({ length: 8 }, () => [0xea]);
  // 表第 3 项的高字节（$8025）被 LDA 引用，表在该处截断，剩余项数不足 4 项，保持 .byte
  const code = [[0xad, 0x25, 0x80], ...nops];
  const { rom, cdl } = pageWith(code, { 0x20: [0x03, 0x80, 0x04, 0x80, 0x05, 0x80, 0x06, 0x80, 0x07, 0x80] });
  const listed = listAndReassemble(rom, cdl);
  assert.doesNotMatch(listed.body, /\.word/);
  assert.match(listed.body, /^P00_8025:$/m);
  assert.deepEqual(listed.bytes, [...rom]);
});

const HAS_PROJECT = existsSync(path.join(BIOS_DIR, 'bios.json'));
const IS_MODIFIED = existsSync(path.join(BIOS_DIR, MODIFIED_MARKER));

test('bios/ 工程能逐字节重建原始 BIOS（工程没有标记为修改版时）', { skip: !existsSync(BIOS_ROM) || !HAS_PROJECT || IS_MODIFIED }, () => {
  const rebuilt = buildBios();
  const original = readFileSync(BIOS_ROM);
  assert.equal(firstDifference(rebuilt, original), -1);
});

test('bios/ 工程能构建出完整的 ROM：iNES 文件头加 128 页', { skip: !HAS_PROJECT }, () => {
  const rom = buildBios();
  assert.equal(rom.length, 16 + 128 * PAGE_SIZE);
  assert.equal(rom.subarray(0, 4).toString('latin1'), 'NES\x1a');
});
