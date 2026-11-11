// ------------------------------------------------------------------------
// 名称：decode-img.mjs
// 说明：按 BIOS 功能 $5B、$5C 的算法解压 ROM 里页 79-7F 的压缩图片（页 78 开机启动程序使用），并可输出灰度 PNG。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/decode-img.mjs [--png 序号 输出目录]；图片表在页 78 的 $827E（12 项，源地址相同的只算一张，共 10 张）。
//       图片 = 10 字节头 + 图案流（16 字节字典 + 指令流，$00 结束）+ 映射流（$00 结束）+ 调色板。
//       头：宽、高（图块数）、图案总数（16 位，每个图案 32 字节 = 2 个 16 字节图块）、调色板组数、…、映射流偏移 off1、调色板偏移 off2（均为 16 位，相对图片头）。
//       图案流指令（高 4 位 H、低 4 位 L）：H=1-12 重复字典项 L 共 H 次；H=13 后跟 L 个原样字节；H=15 后跟起始字节，输出 L 个递增字节；H=14 后跟 1 字节，重复 L 次；L=0 按 256 计。
//       映射流指令（高 3 位 T、低 5 位 N）：T=0 填充 N 个同值单元，T=1 单元低字节递增，T=2 N 个独立单元，T=3 共用高字节、N 个低字节，T=4-7 单元值每次加 2；单元为 16 位，低 10 位是 16 字节图块的序号。
//       图块像素与 NES 相同：8 字节低位平面 + 8 字节高位平面（2 位色）。调色板：每组 16 字节的 NES 颜色号（4 个 4 色子调色板），单元的 12-13 位选子调色板；渲染第 1 张图得到太空中的小霸王形象，颜色正确。解压长度与映射单元数都与头部一致（已核对）。
// ------------------------------------------------------------------------
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { BIOS_ROM } from './config.mjs';

const ROM_PATH = BIOS_ROM;
const IMAGE_BASE = 0x78 * 4096;
/** 页 78 图片参数表里不同的源地址（页组 $78 的窗口地址） */
export const IMAGE_POINTERS = [0x866c, 0xa035, 0xa1b9, 0xa8b2, 0xac8b, 0xaee2, 0xb015, 0xb190, 0xb353, 0xadf7];

/** 读入 ROM（不含 16 字节文件头） */
export function loadRom(file = ROM_PATH) {
  return readFileSync(file).subarray(16);
}

/** $5B：解压图案流，返回数据与流结束位置 */
export function decodeTiles(rom, start) {
  const table = rom.subarray(start, start + 16);
  let p = start + 16;
  const out = [];
  for (;;) {
    const op = rom[p];
    if (op === 0) return { data: Buffer.from(out), end: p + 1 };
    const h = op >> 4;
    const n = (op & 15) || 256;
    if (h < 0xd) { for (let i = 0; i < h; i++) out.push(table[op & 15]); p += 1; }
    else if (h === 0xd) { for (let i = 0; i < n; i++) out.push(rom[p + 1 + i]); p += 1 + n; }
    else if (h === 0xf) { for (let i = 0; i < n; i++) out.push((rom[p + 1] + i) & 255); p += 2; }
    else { for (let i = 0; i < n; i++) out.push(rom[p + 1]); p += 2; }
  }
}

/** $5C：解压映射流，返回 16 位单元数组（尚未加调用时的图块基数）与流结束位置 */
export function decodeMap(rom, start) {
  let p = start;
  const cells = [];
  for (;;) {
    const op = rom[p];
    if (op === 0) return { cells, end: p + 1 };
    const n = op & 0x1f;
    const type = op >> 5;
    const word = (o) => rom[o] | (rom[o + 1] << 8);
    if (type === 0) { for (let i = 0; i < n; i++) cells.push(word(p + 1)); p += 3; }
    else if (type === 1) { const v = word(p + 1); for (let i = 0; i < n; i++) cells.push((v & 0xff00) | ((v + i) & 0xff)); p += 3; }
    else if (type === 2) { for (let i = 0; i < n; i++) cells.push(word(p + 1 + i * 2)); p += 1 + n * 2; }
    else if (type === 3) { const hi = rom[p + 1]; for (let i = 0; i < n; i++) cells.push(rom[p + 2 + i] | (hi << 8)); p += 2 + n; }
    else { const v = word(p + 1); for (let i = 0; i < n; i++) cells.push((v & 0xff00) | ((v + 2 * i) & 0xff)); p += 3; }
  }
}

/** 解析并解压一张图片；pointer 是页组 $78 的窗口地址 */
export function decodeImage(rom, pointer) {
  const o = IMAGE_BASE + (pointer - 0x8000);
  const header = rom.subarray(o, o + 10);
  const width = header[0];
  const height = header[1];
  const count = header[2] | (header[3] << 8);
  const off1 = header[6] | (header[7] << 8);
  const off2 = header[8] | (header[9] << 8);
  const tiles = decodeTiles(rom, o + 10);
  const map = decodeMap(rom, o + off1);
  return { width, height, count, off1, off2, tiles, map, header, start: o };
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** 写 8 位灰度 PNG */
export function writeGrayPng(file, width, height, pixels) {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) pixels.copy(raw, y * (width + 1) + 1, y * width, (y + 1) * width);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

/** 把图片渲染成灰度像素（2 位色映射到 0、85、170、255） */
export function renderGray(image) {
  const { width, height, tiles, map } = image;
  const pixels = Buffer.alloc(width * 8 * height * 8);
  map.cells.forEach((cell, i) => {
    const tile = tiles.data.subarray((cell & 0x3ff) * 16, (cell & 0x3ff) * 16 + 16);
    if (tile.length < 16) return;
    const cx = (i % width) * 8;
    const cy = Math.floor(i / width) * 8;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const bit = 7 - x;
        const value = ((tile[y] >> bit) & 1) | (((tile[8 + y] >> bit) & 1) << 1);
        pixels[(cy + y) * width * 8 + cx + x] = value * 85;
      }
    }
  });
  return pixels;
}

/** 标准 NES（2C02）调色板的 RGB */
const NES_RGB = [
  0x7c7c7c, 0x0000fc, 0x0000bc, 0x4428bc, 0x940084, 0xa80020, 0xa81000, 0x881400, 0x503000, 0x007800, 0x006800, 0x005800, 0x004058, 0x000000, 0x000000, 0x000000,
  0xbcbcbc, 0x0078f8, 0x0058f8, 0x6844fc, 0xd800cc, 0xe40058, 0xf83800, 0xe45c10, 0xac7c00, 0x00b800, 0x00a800, 0x00a844, 0x008888, 0x000000, 0x000000, 0x000000,
  0xf8f8f8, 0x3cbcfc, 0x6888fc, 0x9878f8, 0xf878f8, 0xf85898, 0xf87858, 0xfca044, 0xf8b800, 0xb8f818, 0x58d854, 0x58f898, 0x00e8d8, 0x787878, 0x000000, 0x000000,
  0xfcfcfc, 0xa4e4fc, 0xb8b8f8, 0xd8b8f8, 0xf8b8f8, 0xf8a4c0, 0xf0d0b0, 0xfce0a8, 0xf8d878, 0xd8f878, 0xb8f8b8, 0xb8f8d8, 0x00fcfc, 0xf8d8f8, 0x000000, 0x000000,
];

/** 写 24 位 RGB PNG */
export function writeRgbPng(file, width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

/** 取图片自带的调色板（每组 16 字节的 NES 颜色号，组数在头的第 5 字节），没有则返回 null */
export function imagePalette(rom, image, group = 0) {
  if (group >= image.header[4]) return null;
  const o = image.start + image.off2 + group * 16;
  return rom.subarray(o, o + 16);
}

/** 按调色板渲染：单元的 12-13 位选 4 色子调色板 */
export function renderColor(image, palette) {
  const { width, height, tiles, map } = image;
  const rgb = Buffer.alloc(width * 8 * height * 8 * 3);
  map.cells.forEach((cell, i) => {
    const tile = tiles.data.subarray((cell & 0x3ff) * 16, (cell & 0x3ff) * 16 + 16);
    if (tile.length < 16) return;
    const sub = (cell >> 12) & 3;
    const cx = (i % width) * 8;
    const cy = Math.floor(i / width) * 8;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const bit = 7 - x;
        const value = ((tile[y] >> bit) & 1) | (((tile[8 + y] >> bit) & 1) << 1);
        const color = NES_RGB[palette[sub * 4 + value] & 0x3f];
        const o = ((cy + y) * width * 8 + cx + x) * 3;
        rgb[o] = color >> 16;
        rgb[o + 1] = (color >> 8) & 255;
        rgb[o + 2] = color & 255;
      }
    }
  });
  return rgb;
}

if (process.argv[1]?.endsWith('decode-img.mjs')) {
  const args = process.argv.slice(2);
  const pngAt = args.indexOf('--png');
  const rom = loadRom();
  IMAGE_POINTERS.forEach((pointer, index) => {
    const image = decodeImage(rom, pointer);
    const h = image.header;
    console.log(`#${index} 源地址 $${pointer.toString(16)} ${image.width}×${image.height} 图案 ${image.count}（解压 ${image.tiles.data.length} 字节）映射单元 ${image.map.cells.length}，图案流结束 $${(image.tiles.end - image.start).toString(16)}（off1 $${image.off1.toString(16)}），映射流结束 $${(image.map.end - image.start).toString(16)}（off2 $${image.off2.toString(16)}），头 ${[...h].map((x) => x.toString(16).padStart(2, '0')).join(' ')}`);
    if (pngAt >= 0 && Number(args[pngAt + 1]) === index) {
      const dir = args[pngAt + 2];
      mkdirSync(dir, { recursive: true });
      writeGrayPng(path.join(dir, `img${index}.png`), image.width * 8, image.height * 8, renderGray(image));
      const palette = imagePalette(rom, image);
      if (palette) writeRgbPng(path.join(dir, `img${index}-color.png`), image.width * 8, image.height * 8, renderColor(image, palette));
    }
  });
}
