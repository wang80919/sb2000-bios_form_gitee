// ------------------------------------------------------------------------
// 名称：p58-fs-fat-range.mjs
// 说明：FAT 项读写在边界输入下的验证用例：$7B/$05 读超出 FAT 范围的簇号、$7B/$0F 写超出 FAT 范围的簇号、$7B/$0F 写超过 12 位的值。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-11
// 备注：FAT 缓存只装了 9 个 FAT 扇区（4608 字节，簇号 0-3071），FAT 项的字节偏移是簇号 × 1.5 取整（16 位，进位丢弃）。预期按汇编逻辑转录：
//       读：偏移所在扇区序号（偏移高字节与 $FE 右移一位）不小于 9 就失败，$6532/$6533 里留的是这个偏移本身（FS_FAT_ENTRY_ADDR 用它们暂存偏移），DOS_ERROR 保持 0；
//       写：偏移所在扇区加 1 不小于 10 时装不进缓存，什么也不写，DOS_ERROR 保持 0；
//       写超过 12 位的值：偶数簇把新值高字节整个或进相邻字节（相邻簇低半字节的位置被污染），奇数簇新值左移 4 位，最高半字节被丢弃。
//       用例直接读页内字节与按上述规则改写的原样镜像比对。
// ------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { PRISTINE_PATH, before } from '../lib/disk-check.mjs';
import { CLUSTER, FAT_VALUE_IN, FAT_VALUE_OUT, SECTOR, call, firstDifference, hex, le16, readCache } from '../lib/fat-cache.mjs';
import { DOS_ERROR } from '../lib/fs-steps.mjs';

const OUT_OF_RANGE = [3072, 3073, 3500, 4095, 4096, 5000, 20000, 65535];

/** 按汇编逻辑改写 FAT 字节数组里的一项（值不限 12 位） */
const setWide = (fat, cluster, value) => {
  const offset = Math.floor((cluster * 3) / 2);
  if (cluster % 2 === 0) {
    fat[offset] = value & 0xff;
    fat[offset + 1] = (fat[offset + 1] & 0xf0) | ((value >> 8) & 0xff);
  } else {
    const shifted = (value << 4) & 0xffff;
    fat[offset] = (fat[offset] & 0x0f) | (shifted & 0xff);
    fat[offset + 1] = shifted >> 8;
  }
};

const cases = [];

if (before) {
  const pristineCache = readFileSync(PRISTINE_PATH).subarray(0, 10 * SECTOR);
  const loadCache = async (client) => {
    await call(client, 0x07);
    await call(client, 0x01, [[0x652e, [1, 0]]], [], 900);
  };

  cases.push({
    id: 'fs.fatr.get-out-of-range',
    title: '$7B/$05 读簇号超出 FAT 范围的 FAT 项（簇 3072、3073、3500、4095、4096、5000、20000、65535）：DOS_ERROR 为 0，$6532/$6533 留的是簇号 × 1.5 的偏移，缓存不变',
    fresh: true,
    steps: [{
      host: async (client) => {
        const problems = [];
        await loadCache(client);
        for (const cluster of OUT_OF_RANGE) {
          const result = await call(client, 0x05, [[CLUSTER, le16(cluster)], [FAT_VALUE_OUT, [0xee, 0xee]]], [[FAT_VALUE_OUT, 2]]);
          if (!result.done) { problems.push(`簇 ${cluster}：调用没有返回`); break; }
          const got = [...result.memory.get(FAT_VALUE_OUT)];
          const want = le16(Math.floor((cluster * 3) / 2) & 0xffff);
          if (got.join() !== want.join()) problems.push(`簇 ${cluster}：$6532/$6533 为 ${got.map(hex).join(' ')}，预期 ${want.map(hex).join(' ')}`);
          if (result.memory.get(DOS_ERROR)[0] !== 0) problems.push(`簇 ${cluster}：出错码 $${hex(result.memory.get(DOS_ERROR)[0])}`);
        }
        const diff = firstDifference(await readCache(client), pristineCache, '读越界后的缓存');
        if (diff) problems.push(diff);
        return problems.slice(0, 8);
      },
      check: ({ data }) => data,
    }],
  });

  cases.push({
    id: 'fs.fatr.set-out-of-range',
    title: '$7B/$0F 写簇号超出 FAT 范围的 FAT 项（簇 3072、3073、3500、4095、4096、5000、20000、65535）：DOS_ERROR 为 0，缓存完全不变',
    fresh: true,
    steps: [{
      host: async (client) => {
        const problems = [];
        await loadCache(client);
        for (const cluster of OUT_OF_RANGE) {
          const result = await call(client, 0x0f, [[CLUSTER, le16(cluster)], [FAT_VALUE_IN, le16(0xabc)]]);
          if (!result.done) { problems.push(`簇 ${cluster}：调用没有返回`); break; }
          if (result.memory.get(DOS_ERROR)[0] !== 0) problems.push(`簇 ${cluster}：出错码 $${hex(result.memory.get(DOS_ERROR)[0])}`);
          const diff = firstDifference(await readCache(client), pristineCache, `写簇 ${cluster} 后的缓存`);
          if (diff) problems.push(diff);
        }
        return problems.slice(0, 8);
      },
      check: ({ data }) => data,
    }],
  });

  cases.push({
    id: 'fs.fatr.set-wide-value',
    title: '$7B/$0F 写超过 12 位的值（簇 100、101、340、341、342，值 $1000、$1234、$8123、$F000、$FFFF）：偶数簇的高字节整个或进相邻字节，奇数簇最高半字节被丢弃，缓存与按此规则改写的 FAT 一致',
    fresh: true,
    steps: [{
      host: async (client) => {
        const problems = [];
        await loadCache(client);
        const model = Buffer.from(pristineCache);
        for (const cluster of [100, 101, 340, 341, 342]) {
          for (const value of [0x1000, 0x1234, 0x8123, 0xf000, 0xffff]) {
            const result = await call(client, 0x0f, [[CLUSTER, le16(cluster)], [FAT_VALUE_IN, le16(value)]]);
            setWide(model.subarray(SECTOR), cluster, value);
            const label = `簇 ${cluster} 写 $${value.toString(16)}`;
            if (!result.done) { problems.push(`${label}：调用没有返回`); return problems; }
            if (result.memory.get(DOS_ERROR)[0] !== 0) problems.push(`${label}：出错码 $${hex(result.memory.get(DOS_ERROR)[0])}`);
            const diff = firstDifference(await readCache(client), model, `${label} 后的缓存`);
            if (diff) problems.push(diff);
            if (problems.length >= 8) return problems;
          }
        }
        return problems;
      },
      check: ({ data }) => data,
    }],
  });
}

export { cases };
