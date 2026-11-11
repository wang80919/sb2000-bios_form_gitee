// ------------------------------------------------------------------------
// 名称：fat-cache.mjs
// 说明：FAT 缓存类验证用例（p58-fs-fatcache.mjs、p58-fs-fat-range.mjs）共用的地址与辅助：读缓存、调用 $7B 子功能、保存镜像、改 FAT12 项、比较缓冲。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-11
// 备注：FAT 缓存在扩展 RAM 页 $F5 起（引导扇区加 9 个 FAT 扇区，共 10 个扇区）。
// ------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { runCall } from '../../tools/rom-driver.mjs';
import { DOS_ERROR } from './fs-steps.mjs';

export const FS_LBA = 0x652e;
export const SECTOR_BUFFER = 0x6000;
export const CLUSTER = 0x6536;
export const FAT_VALUE_IN = 0x6534;
export const FAT_VALUE_OUT = 0x6532;
export const SECTOR = 512;
export const FAT_BYTES = 9 * SECTOR;
export const CACHE_PRAM = (0xf5 - 0x80) * 0x1000;
export const hex = (value) => value.toString(16).toUpperCase().padStart(2, '0');
export const le16 = (value) => [value & 0xff, (value >> 8) & 0xff];

/** 读出 FAT 缓存的 10 个扇区（页 $F5 的 8 个扇区加页 $F6 的前 2 个） */
export const readCache = async (client) => Buffer.concat([Buffer.from(await client.read('pram', CACHE_PRAM, 0x1000)), Buffer.from(await client.read('pram', CACHE_PRAM + 0x1000, 0x400))]);

/** 调用 $7B 的子功能，返回 runCall 的结果 */
export const call = (client, sub, mem = [], read = [], maxFrames = 300) => runCall(client, { func: 0x7b, sub, mem: [...mem, [DOS_ERROR, [0x5a]]], read: [...read, [DOS_ERROR, 1]], maxFrames });

/** 保存模拟器里的磁盘镜像（原始字节），并把测试镜像还原 */
export const saveRaw = async (client, ctx) => {
  await client.send('savedisk');
  const saved = readFileSync(ctx.image);
  ctx.restore();
  return saved;
};

/** 在 FAT12 字节数组里写一项（值按 12 位处理） */
export const setFat12 = (fat, cluster, value) => {
  const offset = Math.floor((cluster * 3) / 2);
  if (cluster % 2 === 0) {
    fat[offset] = value & 0xff;
    fat[offset + 1] = (fat[offset + 1] & 0xf0) | ((value >> 8) & 0x0f);
  } else {
    fat[offset] = (fat[offset] & 0x0f) | ((value & 0x0f) << 4);
    fat[offset + 1] = (value >> 4) & 0xff;
  }
};

/** 两个缓冲区第一处不同的位置说明，相同返回 null */
export const firstDifference = (actual, expected, label) => {
  if (actual.length !== expected.length) return `${label}长度 ${actual.length}，预期 ${expected.length}`;
  for (let i = 0; i < actual.length; i++) if (actual[i] !== expected[i]) return `${label}偏移 ${i}（扇区 ${Math.floor(i / SECTOR)}）为 ${hex(actual[i])}，预期 ${hex(expected[i])}`;
  return null;
};
