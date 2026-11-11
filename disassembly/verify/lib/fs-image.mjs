// ------------------------------------------------------------------------
// 名称：fs-image.mjs
// 说明：验证用例改写软盘镜像的辅助：改两份 FAT、构造目录项、往根目录或目录簇里放目录项、列出空闲簇。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-11
// 备注：镜像布局固定为 1.44MB：引导扇区 0、两份 FAT 各 9 扇区、根目录 19-32、数据区从扇区 33 起（每簇 1 扇区，簇 2 对应扇区 33）。
// ------------------------------------------------------------------------
import { FAT_BYTES, SECTOR, setFat12 } from './fat-cache.mjs';
import { parseFat12 } from './fat12.mjs';

/** 簇的数据在镜像里的字节偏移 */
export const clusterOffset = (cluster) => (33 + cluster - 2) * SECTOR;

/** 同时改两份 FAT 的一项 */
export const setFatBoth = (image, cluster, value) => {
  setFat12(image.subarray(SECTOR, SECTOR + FAT_BYTES), cluster, value);
  setFat12(image.subarray(SECTOR + FAT_BYTES, SECTOR + 2 * FAT_BYTES), cluster, value);
};

/** 一个 32 字节的目录项，日期时间固定 */
export const dirEntry = (name83, attr, cluster, size = 0) => {
  const entry = Buffer.alloc(32);
  entry.write(name83.padEnd(11, ' '), 0, 'latin1');
  entry[11] = attr;
  entry.writeUInt16LE(0x6000, 22);
  entry.writeUInt16LE(0x2021, 24);
  entry.writeUInt16LE(cluster, 26);
  entry.writeUInt32LE(size, 28);
  return entry;
};

/** 放进根目录第一个空位（首字节为 0 的项） */
export const addRootEntry = (image, entry) => {
  for (let at = 19 * SECTOR; at < 33 * SECTOR; at += 32) {
    if (image[at] !== 0) continue;
    entry.copy(image, at);
    return;
  }
  throw new Error('根目录已满');
};

/** 把目录项依次写进一个目录簇的开头（簇的其余部分清 0），并把簇标为链尾 */
export const writeDirCluster = (image, cluster, entries) => {
  image.fill(0, clusterOffset(cluster), clusterOffset(cluster) + SECTOR);
  entries.forEach((entry, index) => entry.copy(image, clusterOffset(cluster) + index * 32));
  setFatBoth(image, cluster, 0xfff);
};

/** 当前空闲的簇号（升序） */
export const freeClusters = (image) => {
  const fat = parseFat12(image);
  const list = [];
  for (let cluster = 2; cluster < fat.clusterCount + 2; cluster++) if (fat.fatEntry(cluster) === 0) list.push(cluster);
  return list;
};

/** 把空闲簇标成坏簇 $FF7，只留 keep 个空闲簇（取编号最小的） */
export const fillFreeClusters = (image, keep) => {
  for (const cluster of freeClusters(image).slice(keep)) setFatBoth(image, cluster, 0xff7);
};
