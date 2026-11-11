// ------------------------------------------------------------------------
// 名称：fat12.mjs
// 说明：验证用例用的最小 FAT12 软盘镜像读取器：读引导扇区参数、根目录、FAT 项、簇链与文件内容，作为 BIOS 文件系统结果的独立预期来源。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：只实现读取，不依赖 BIOS 工程里的任何代码；按 FAT12 规范实现（簇号 ×1.5 取字节偏移，奇数簇取高 12 位，$FF8 以上为链尾）。
// ------------------------------------------------------------------------

/** FAT12 项的链尾下限 */
const END_OF_CHAIN = 0xff8;

/**
 * 解析 FAT12 镜像。
 * @param {Uint8Array} image 整张软盘镜像
 * @returns {object} 带 listRoot、readFile、fatEntry、chain、freeClusters 的对象，以及引导扇区参数
 */
export function parseFat12(image) {
  const view = Buffer.from(image.buffer, image.byteOffset, image.byteLength);
  const bytesPerSector = view.readUInt16LE(11);
  const sectorsPerCluster = view[13];
  const reserved = view.readUInt16LE(14);
  const fatCount = view[16];
  const rootEntries = view.readUInt16LE(17);
  const totalSectors = view.readUInt16LE(19) || view.readUInt32LE(32);
  const sectorsPerFat = view.readUInt16LE(22);
  const fatStart = reserved * bytesPerSector;
  const rootStart = (reserved + fatCount * sectorsPerFat) * bytesPerSector;
  const dataStart = rootStart + rootEntries * 32;
  const clusterBytes = bytesPerSector * sectorsPerCluster;
  const clusterCount = Math.floor((totalSectors * bytesPerSector - dataStart) / clusterBytes);

  /** 第 n 个簇的 FAT 项（n 从 0 起） */
  const fatEntry = (cluster) => {
    const offset = fatStart + Math.floor((cluster * 3) / 2);
    const word = view[offset] | (view[offset + 1] << 8);
    return cluster % 2 === 0 ? word & 0xfff : word >> 4;
  };

  /** 从起始簇沿 FAT 走到链尾，返回簇号列表 */
  const chain = (start) => {
    const list = [];
    for (let cluster = start; cluster >= 2 && cluster < END_OF_CHAIN && list.length <= clusterCount; cluster = fatEntry(cluster)) list.push(cluster);
    return list;
  };

  /** 根目录里有效的目录项（跳过空项、已删除项与长文件名项） */
  const listRoot = () => {
    const entries = [];
    for (let i = 0; i < rootEntries; i++) {
      const at = rootStart + i * 32;
      if (view[at] === 0x00) break;
      if (view[at] === 0xe5 || view[at + 11] === 0x0f) continue;
      entries.push({
        index: i,
        name83: view.toString('latin1', at, at + 11),
        attr: view[at + 11],
        time: view.readUInt16LE(at + 22),
        date: view.readUInt16LE(at + 24),
        cluster: view.readUInt16LE(at + 26),
        size: view.readUInt32LE(at + 28),
      });
    }
    return entries;
  };

  /** 读出一个文件的全部内容（按目录项里的大小截断） */
  const readFile = (entry) => {
    const parts = chain(entry.cluster).map((cluster) => {
      const at = dataStart + (cluster - 2) * clusterBytes;
      return view.subarray(at, at + clusterBytes);
    });
    return Buffer.concat(parts).subarray(0, entry.size);
  };

  /** 空闲簇的个数（簇号 2 起，FAT 项为 0） */
  const freeClusters = () => {
    let count = 0;
    for (let cluster = 2; cluster < clusterCount + 2; cluster++) if (fatEntry(cluster) === 0) count++;
    return count;
  };

  /** 第一份 FAT 与第二份 FAT 是否完全一致 */
  const fatCopiesMatch = () => {
    const size = sectorsPerFat * bytesPerSector;
    for (let copy = 1; copy < fatCount; copy++) {
      if (!view.subarray(fatStart, fatStart + size).equals(view.subarray(fatStart + copy * size, fatStart + (copy + 1) * size))) return false;
    }
    return true;
  };

  /** 读一个簇的内容（目录簇用） */
  const readCluster = (cluster) => view.subarray(dataStart + (cluster - 2) * clusterBytes, dataStart + (cluster - 1) * clusterBytes);

  /** 子目录里有效的目录项（含 "." 与 ".."），目录占多个簇时按簇链依次读 */
  const listDir = (startCluster) => {
    const entries = [];
    for (const cluster of chain(startCluster)) {
      const data = readCluster(cluster);
      for (let at = 0; at + 32 <= data.length; at += 32) {
        if (data[at] === 0x00) return entries;
        if (data[at] === 0xe5 || data[at + 11] === 0x0f) continue;
        entries.push({
          name83: data.toString('latin1', at, at + 11),
          attr: data[at + 11],
          time: data.readUInt16LE(at + 22),
          date: data.readUInt16LE(at + 24),
          cluster: data.readUInt16LE(at + 26),
          size: data.readUInt32LE(at + 28),
        });
      }
    }
    return entries;
  };

  /** 引导扇区（卷序列号、卷标等在这里） */
  const bootSector = view.subarray(0, bytesPerSector);

  return { bootSector, bytesPerSector, sectorsPerCluster, clusterBytes, clusterCount, fatStart, rootStart, dataStart, fatEntry, chain, listRoot, listDir, readFile, readCluster, freeClusters, fatCopiesMatch };
}
