// ------------------------------------------------------------------------
// 名称：fat12-image.mjs
// 说明：构建与读取 1.44MB 的 FAT12 软盘镜像（512 字节扇区、2 面、80 磁道、每磁道 18 扇区），
//       用于把一个目录里的文件做成模拟器可挂载的 .img，并从镜像里取回文件。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：几何参数与模拟器 FDC 一致（LBA = 磁道*36 + 磁头*18 + 扇区-1，共 2880 个扇区）。
// ------------------------------------------------------------------------

/** 1.44MB 软盘的固定参数 */
export const GEOMETRY = Object.freeze({
  bytesPerSector: 512,
  sectorsPerCluster: 1,
  reservedSectors: 1,
  fatCount: 2,
  rootEntries: 224,
  totalSectors: 2880,
  mediaDescriptor: 0xf0,
  sectorsPerFat: 9,
  sectorsPerTrack: 18,
  heads: 2,
});

const ENTRY_SIZE = 32;
const END_OF_CHAIN = 0xfff;
const ATTR_VOLUME = 0x08;
const NAME_PART = /^[A-Z0-9_$~!#%&\-{}()@'`^]+$/;

/**
 * 把文件名转成 11 字节的 8.3 目录项名字。
 * @param {string} fileName 例如 "edit.exe"
 * @returns {string} 11 个字符，不足补空格
 */
export function toShortName(fileName) {
  const upper = fileName.toUpperCase();
  const dot = upper.lastIndexOf('.');
  const base = dot < 0 ? upper : upper.slice(0, dot);
  const ext = dot < 0 ? '' : upper.slice(dot + 1);
  if (base.length < 1 || base.length > 8 || ext.length > 3 || !NAME_PART.test(base) || (ext && !NAME_PART.test(ext))) {
    throw new Error(`文件名不符合 8.3 规则：${fileName}`);
  }
  return base.padEnd(8, ' ') + ext.padEnd(3, ' ');
}

/** 把 11 字节目录项名字还原成 "NAME.EXT" */
function fromShortName(raw) {
  const base = raw.slice(0, 8).trimEnd();
  const ext = raw.slice(8, 11).trimEnd();
  return ext ? `${base}.${ext}` : base;
}

/** 编码 DOS 日期与时间 */
function dosDateTime(date) {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
  };
}

/** 写入 FAT12 的一个 12 位条目 */
function setFatEntry(fat, cluster, value) {
  const offset = Math.floor((cluster * 3) / 2);
  if (cluster % 2 === 0) {
    fat[offset] = value & 0xff;
    fat[offset + 1] = (fat[offset + 1] & 0xf0) | ((value >> 8) & 0x0f);
  } else {
    fat[offset] = (fat[offset] & 0x0f) | ((value & 0x0f) << 4);
    fat[offset + 1] = (value >> 4) & 0xff;
  }
}

/** 读取 FAT12 的一个 12 位条目 */
function getFatEntry(fat, cluster) {
  const offset = Math.floor((cluster * 3) / 2);
  const pair = fat[offset] | (fat[offset + 1] << 8);
  return cluster % 2 === 0 ? pair & 0x0fff : pair >> 4;
}

/** 生成引导扇区（含 BIOS 参数块与 55 AA 签名，不含启动代码） */
function buildBootSector(label) {
  const g = GEOMETRY;
  const sector = Buffer.alloc(g.bytesPerSector);
  sector.set([0xeb, 0x3c, 0x90], 0);
  sector.write('SB2KIMG ', 3, 'ascii');
  sector.writeUInt16LE(g.bytesPerSector, 11);
  sector.writeUInt8(g.sectorsPerCluster, 13);
  sector.writeUInt16LE(g.reservedSectors, 14);
  sector.writeUInt8(g.fatCount, 16);
  sector.writeUInt16LE(g.rootEntries, 17);
  sector.writeUInt16LE(g.totalSectors, 19);
  sector.writeUInt8(g.mediaDescriptor, 21);
  sector.writeUInt16LE(g.sectorsPerFat, 22);
  sector.writeUInt16LE(g.sectorsPerTrack, 24);
  sector.writeUInt16LE(g.heads, 26);
  sector.writeUInt8(0x29, 38);
  sector.writeUInt32LE(0x20261109, 39);
  sector.write((label ?? 'NO NAME').toUpperCase().padEnd(11, ' ').slice(0, 11), 43, 'ascii');
  sector.write('FAT12   ', 54, 'ascii');
  sector.writeUInt16LE(0xaa55, 510);
  return sector;
}

/**
 * 构建 FAT12 软盘镜像。
 * @param {{name: string, data: Buffer, mtime?: Date}[]} files 要写入根目录的文件
 * @param {{label?: string}} [options] 卷标等选项
 * @returns {Buffer} 1474560 字节的镜像
 */
export function buildFat12Image(files, options = {}) {
  const g = GEOMETRY;
  const image = Buffer.alloc(g.totalSectors * g.bytesPerSector);
  const fatBytes = g.sectorsPerFat * g.bytesPerSector;
  const rootSectors = (g.rootEntries * ENTRY_SIZE) / g.bytesPerSector;
  const fatStart = g.reservedSectors * g.bytesPerSector;
  const rootStart = fatStart + g.fatCount * fatBytes;
  const dataStart = rootStart + rootSectors * g.bytesPerSector;
  const clusterBytes = g.sectorsPerCluster * g.bytesPerSector;
  const clusterCount = Math.floor((image.length - dataStart) / clusterBytes);

  buildBootSector(options.label).copy(image, 0);

  const fat = Buffer.alloc(fatBytes);
  setFatEntry(fat, 0, 0xf00 | g.mediaDescriptor);
  setFatEntry(fat, 1, 0xfff);

  const entries = [];
  if (options.label) {
    const labelEntry = Buffer.alloc(ENTRY_SIZE);
    labelEntry.write(options.label.toUpperCase().padEnd(11, ' ').slice(0, 11), 0, 'ascii');
    labelEntry.writeUInt8(ATTR_VOLUME, 11);
    entries.push(labelEntry);
  }

  let nextCluster = 2;
  for (const file of files) {
    const need = Math.max(1, Math.ceil(file.data.length / clusterBytes));
    if (file.data.length > 0 && nextCluster - 2 + need > clusterCount) {
      throw new Error(`软盘空间不足，放不下：${file.name}`);
    }
    const entry = Buffer.alloc(ENTRY_SIZE);
    entry.write(toShortName(file.name), 0, 'ascii');
    entry.writeUInt8(0x20, 11);
    const stamp = dosDateTime(file.mtime ?? new Date(1998, 0, 1));
    entry.writeUInt16LE(stamp.time, 22);
    entry.writeUInt16LE(stamp.date, 24);
    entry.writeUInt32LE(file.data.length, 28);

    if (file.data.length > 0) {
      entry.writeUInt16LE(nextCluster, 26);
      for (let i = 0; i < need; i++) {
        const cluster = nextCluster + i;
        setFatEntry(fat, cluster, i === need - 1 ? END_OF_CHAIN : cluster + 1);
        const chunk = file.data.subarray(i * clusterBytes, (i + 1) * clusterBytes);
        chunk.copy(image, dataStart + (cluster - 2) * clusterBytes);
      }
      nextCluster += need;
    }
    entries.push(entry);
  }

  if (entries.length > g.rootEntries) throw new Error('根目录项过多');
  entries.forEach((entry, index) => entry.copy(image, rootStart + index * ENTRY_SIZE));
  for (let copy = 0; copy < g.fatCount; copy++) fat.copy(image, fatStart + copy * fatBytes);
  return image;
}

/**
 * 列出镜像根目录里的文件。
 * @param {Buffer} image FAT12 镜像
 * @returns {{name: string, size: number, startCluster: number}[]}
 */
export function listFat12(image) {
  const g = GEOMETRY;
  const rootStart = (g.reservedSectors + g.fatCount * g.sectorsPerFat) * g.bytesPerSector;
  const result = [];
  for (let i = 0; i < g.rootEntries; i++) {
    const at = rootStart + i * ENTRY_SIZE;
    const first = image[at];
    if (first === 0x00) break;
    if (first === 0xe5 || (image[at + 11] & ATTR_VOLUME) !== 0) continue;
    result.push({
      name: fromShortName(image.toString('ascii', at, at + 11)),
      size: image.readUInt32LE(at + 28),
      startCluster: image.readUInt16LE(at + 26),
    });
  }
  return result;
}

/**
 * 读取镜像中一个文件的内容。
 * @param {Buffer} image FAT12 镜像
 * @param {{size: number, startCluster: number}} entry listFat12 返回的目录项
 * @returns {Buffer}
 */
export function readFat12File(image, entry) {
  const g = GEOMETRY;
  const fatStart = g.reservedSectors * g.bytesPerSector;
  const fat = image.subarray(fatStart, fatStart + g.sectorsPerFat * g.bytesPerSector);
  const dataStart = (g.reservedSectors + g.fatCount * g.sectorsPerFat) * g.bytesPerSector + g.rootEntries * ENTRY_SIZE;
  const clusterBytes = g.sectorsPerCluster * g.bytesPerSector;
  const chunks = [];
  let cluster = entry.startCluster;
  let remaining = entry.size;
  while (remaining > 0 && cluster >= 2 && cluster < 0xff8) {
    const start = dataStart + (cluster - 2) * clusterBytes;
    chunks.push(image.subarray(start, start + Math.min(clusterBytes, remaining)));
    remaining -= clusterBytes;
    cluster = getFatEntry(fat, cluster);
  }
  return Buffer.concat(chunks);
}
