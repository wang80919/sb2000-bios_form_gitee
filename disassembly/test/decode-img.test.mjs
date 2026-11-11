// ------------------------------------------------------------------------
// 名称：decode-img.test.mjs
// 说明：测试 decode-img.mjs 对 BIOS 压缩图片（功能 $5B、$5C）的解压：先用手造数据测每种指令，再用 ROM 里的 10 张图核对头部。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：ROM 里的核对要求图案流、映射流的结束位置恰好等于头部给出的偏移，且解压长度、单元数与头部一致
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import test from 'node:test';
import { IMAGE_POINTERS, decodeImage, decodeMap, decodeTiles, imagePalette, loadRom, renderColor, renderGray } from '../tools/decode-img.mjs';

test('decodeTiles：字典重复、原样字节、填充字节与递增字节', () => {
  const dict = Array.from({ length: 16 }, (_, i) => 0xa0 + i);
  const rom = Buffer.from([
    ...dict,
    0x31, // 字典项 1（$A1）重复 3 次
    0xd2, 0x11, 0x22, // 原样 2 字节
    0xe3, 0x55, // 填充 $55 共 3 次
    0xf4, 0x10, // 递增：$10 $11 $12 $13
    0x00,
  ]);
  const { data, end } = decodeTiles(rom, 0);
  assert.deepEqual([...data], [0xa1, 0xa1, 0xa1, 0x11, 0x22, 0x55, 0x55, 0x55, 0x10, 0x11, 0x12, 0x13]);
  assert.equal(end, rom.length);
});

test('decodeMap：同值填充、低字节递增、独立单元、共用高字节、步长 2', () => {
  const rom = Buffer.from([
    0x02, 0x34, 0x12, // 填充 2 个 $1234
    0x23, 0xfe, 0x01, // 低字节递增 3 个：$01FE $01FF $0100
    0x41, 0x78, 0x56, // 1 个独立单元 $5678
    0x62, 0x07, 0x09, 0x0a, // 共用高字节 $07，低字节 $09 $0A
    0x82, 0x10, 0x00, // 步长 2：$0010 $0012
    0x00,
  ]);
  const { cells, end } = decodeMap(rom, 0);
  assert.deepEqual(cells, [0x1234, 0x1234, 0x01fe, 0x01ff, 0x0100, 0x5678, 0x0709, 0x070a, 0x0010, 0x0012]);
  assert.equal(end, rom.length);
});

test('ROM 里的 10 张图：流结束位置与头部偏移一致，解压长度与单元数与头部一致', () => {
  const rom = loadRom();
  for (const pointer of IMAGE_POINTERS) {
    const image = decodeImage(rom, pointer);
    assert.equal(image.tiles.end - image.start, image.off1, `源地址 $${pointer.toString(16)} 的图案流`);
    assert.equal(image.map.end - image.start, image.off2, `源地址 $${pointer.toString(16)} 的映射流`);
    assert.equal(image.tiles.data.length, image.count * 32);
    assert.equal(image.map.cells.length, image.width * image.height);
    assert.equal(renderGray(image).length, image.width * 8 * image.height * 8);
  }
  // 第 1 张图带 2 组调色板，第 5 张起不带
  const first = decodeImage(rom, IMAGE_POINTERS[0]);
  assert.equal(imagePalette(rom, first, 0).length, 16);
  assert.equal(imagePalette(rom, first, 1).length, 16);
  assert.equal(imagePalette(rom, first, 2), null);
  assert.equal(imagePalette(rom, decodeImage(rom, IMAGE_POINTERS[4])), null);
  assert.equal(renderColor(first, imagePalette(rom, first)).length, 256 * 240 * 3);
});
