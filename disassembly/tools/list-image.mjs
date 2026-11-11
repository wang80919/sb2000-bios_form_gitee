// ------------------------------------------------------------------------
// 名称：list-image.mjs
// 说明：列出软盘镜像的引导扇区信息与根目录文件，并可把文件导出到目录。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/list-image.mjs <镜像> [导出目录]；只读取 FAT12 根目录，不进入子目录。
// ------------------------------------------------------------------------
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { listFat12, readFat12File } from './fat12-image.mjs';

/**
 * 读取引导扇区里的关键字段。
 * @param {Buffer} image 镜像
 * @returns {{oem: string, bytesPerSector: number, sectorsPerCluster: number, reserved: number, fats: number, rootEntries: number, totalSectors: number, media: number, sectorsPerFat: number, label: string, signature: boolean}}
 */
export function describeBootSector(image) {
  return {
    oem: image.toString('latin1', 3, 11),
    bytesPerSector: image.readUInt16LE(11),
    sectorsPerCluster: image[13],
    reserved: image.readUInt16LE(14),
    fats: image[16],
    rootEntries: image.readUInt16LE(17),
    totalSectors: image.readUInt16LE(19),
    media: image[21],
    sectorsPerFat: image.readUInt16LE(22),
    label: image.toString('latin1', 43, 54),
    signature: image.readUInt16LE(510) === 0xaa55,
  };
}

if (process.argv[1]?.endsWith('list-image.mjs')) {
  const [, , file, exportDir] = process.argv;
  const image = readFileSync(file);
  console.log(JSON.stringify(describeBootSector(image)));
  const entries = listFat12(image);
  for (const entry of entries) console.log(`${entry.name.padEnd(14)} ${String(entry.size).padStart(9)}  簇 ${entry.startCluster}`);
  console.log(`共 ${entries.length} 个文件`);
  if (exportDir) {
    mkdirSync(exportDir, { recursive: true });
    for (const entry of entries) writeFileSync(path.join(exportDir, entry.name), readFat12File(image, entry));
    console.log(`已导出到 ${exportDir}`);
  }
}
