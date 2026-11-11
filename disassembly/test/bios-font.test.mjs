// ------------------------------------------------------------------------
// 名称：bios-font.test.mjs
// 说明：测试字库的位置换算、点阵编码解码，以及用真实 ROM 核对几个字的图案。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：运行 npm test；原始 ROM 不存在时跳过核对项
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { asciiOffset, decodeGlyph, encodeGlyph, gb2312Code, hanziOffset, locateGlyph, readGlyph, writeGlyph } from '../tools/bios-font.mjs';
import { PAGE_SIZE } from '../tools/bios-listing.mjs';
import { BIOS_ROM } from '../tools/config.mjs';

test('汉字偏移按 BIOS 的布局换算：区 16 位 1（$B0A1）在 $1C000，“你”（$C4E3）在 $2B340，符号区 $A1A1 在 $51700、区 10-15 不在字库', () => {
  assert.equal(hanziOffset(0xb0a1), 0x1c000);
  assert.equal(hanziOffset(0xc4e3), 0x2b340);
  assert.equal(hanziOffset(0xa1a1), 0x51700);
  assert.equal(hanziOffset(0xa9fe), 0x51700 + (8 * 94 + 93) * 32);
  assert.throws(() => hanziOffset(0xaaa1), /不在字库范围内/);
  assert.throws(() => hanziOffset(0xf8a1), /不在字库范围内/);
  assert.throws(() => hanziOffset(0xa1a0), /不在字库范围内/);
});

test('ASCII 偏移：第 $51 页，码 $10 在页首', () => {
  assert.equal(asciiOffset(0x10), 0x51 * PAGE_SIZE);
  assert.equal(asciiOffset(0x41), 0x51 * PAGE_SIZE + 0x31 * 16);
  assert.throws(() => asciiOffset(0x0f), /不在字库范围内/);
});

test('字符到码：ASCII 字符、汉字与十六进制码', () => {
  assert.equal(gb2312Code('你'), 0xc4e3);
  assert.equal(gb2312Code('好'), 0xbac3);
  assert.equal(gb2312Code('A'), null);
  assert.deepEqual(locateGlyph('A'), { kind: 'ascii', code: 0x41, offset: asciiOffset(0x41) });
  assert.deepEqual(locateGlyph('你'), { kind: 'hanzi', code: 0xc4e3, offset: 0x2b340 });
  assert.equal(locateGlyph('0xBAC3').kind, 'hanzi');
  assert.throws(() => locateGlyph('龘'), /无法确定字符的码/);
});

test('点阵编码与解码互逆，汉字前 16 字节是左半边、后 16 字节是右半边', () => {
  const rows = Array.from({ length: 16 }, (_, r) => `#${'.'.repeat(6)}${r % 2 ? '#' : '.'}${'.'.repeat(7)}#`);
  const bytes = encodeGlyph(rows);
  assert.equal(bytes.length, 32);
  assert.equal(bytes[0], 0x80);
  assert.equal(bytes[1], 0x81);
  assert.equal(bytes[16], 0x01);
  assert.deepEqual(decodeGlyph(bytes), rows);
  const ascii = Array.from({ length: 16 }, () => '#.#.#.#.');
  assert.deepEqual(decodeGlyph(encodeGlyph(ascii)), ascii);
});

test('图案不合格时报错', () => {
  assert.throws(() => encodeGlyph(['########']), /16 行/);
  assert.throws(() => encodeGlyph(Array.from({ length: 16 }, () => '#######')), /8 列/);
  assert.throws(() => encodeGlyph(Array.from({ length: 16 }, () => '#######x')), /# 或 \./);
});

test('真实 ROM：“啊”的左上笔画、“你”的左上笔画、ASCII 的 A 与 0', { skip: !existsSync(BIOS_ROM) }, () => {
  const rom = readFileSync(BIOS_ROM).subarray(16);
  const a1 = decodeGlyph(readGlyph(rom, locateGlyph('啊')));
  assert.equal(a1[1], '....####.######.');
  assert.equal(a1[2], '###.#..#.....#..');
  const ni = decodeGlyph(readGlyph(rom, locateGlyph('你')));
  assert.equal(ni[0], '...#...#........');
  assert.equal(ni[3], '..#...#########.');
  const a = decodeGlyph(readGlyph(rom, locateGlyph('A')));
  assert.deepEqual(a.slice(2, 5), ['...#....', '..###...', '.##.##..']);
});

test('writeGlyph 改写二进制资源里对应的位置，不在二进制资源里时报错', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bios-font-'));
  try {
    mkdirSync(path.join(dir, 'assets'));
    writeFileSync(path.join(dir, 'assets', 'p10-p57.bin'), Buffer.alloc(0x48 * PAGE_SIZE));
    writeFileSync(path.join(dir, 'bios.json'), JSON.stringify({ ines: '', parts: [{ firstPage: 0x10, pageCount: 0x48, binary: 'assets/p10-p57.bin' }] }));
    const glyph = locateGlyph('你');
    const bytes = encodeGlyph(Array.from({ length: 16 }, () => '#'.repeat(16)));
    writeGlyph(glyph, bytes, dir);
    const data = readFileSync(path.join(dir, 'assets', 'p10-p57.bin'));
    const at = glyph.offset - 0x10 * PAGE_SIZE;
    assert.deepEqual([...data.subarray(at, at + 32)], new Array(32).fill(0xff));
    assert.equal(data[at - 1], 0);
    assert.equal(data[at + 32], 0);
    writeFileSync(path.join(dir, 'bios.json'), JSON.stringify({ ines: '', parts: [{ firstPage: 0x10, pageCount: 0x48, source: 'src/x.asm', base: 0x8000 }] }));
    assert.throws(() => writeGlyph(glyph, bytes, dir), /不是二进制资源/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
