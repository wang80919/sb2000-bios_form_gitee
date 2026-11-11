// ------------------------------------------------------------------------
// 名称：export-image-tree.mjs
// 说明：把软盘镜像里的全部文件（含各级子目录）导出到目录，目录结构与镜像一致。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/export-image-tree.mjs <镜像路径或官方软盘盘号> <导出目录>，或 node tools/export-image-tree.mjs --all [导出目录，默认 out/official]（把全部官方软盘导出到 <目录>/disk<两位盘号>）；
//       只读镜像，文件名取 8.3 名称。list-image.mjs 只导出根目录，这个工具进入子目录。
// ------------------------------------------------------------------------
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseFat12 } from '../verify/lib/fat12.mjs';
import { OUT_DIR, officialImage, officialImages } from './config.mjs';

const ATTR_DIRECTORY = 0x10;
const ATTR_VOLUME = 0x08;

/** 8.3 名称转文件名（去掉空格，有扩展名时加点） */
const toFileName = (name83) => {
  const base = name83.slice(0, 8).trimEnd();
  const extension = name83.slice(8, 11).trimEnd();
  return extension ? `${base}.${extension}` : base;
};

/**
 * 导出镜像里的全部文件。
 * @param {string} imagePath 镜像路径
 * @param {string} targetDir 导出目录
 * @returns {{files: number, directories: number, bytes: number}} 导出的文件数、目录数、字节数
 */
export function exportImageTree(imagePath, targetDir) {
  const fat = parseFat12(new Uint8Array(readFileSync(imagePath)));
  const total = { files: 0, directories: 0, bytes: 0 };
  const visit = (entries, dir) => {
    mkdirSync(dir, { recursive: true });
    for (const entry of entries) {
      if (entry.attr & ATTR_VOLUME) continue;
      const name = toFileName(entry.name83);
      if (name === '.' || name === '..') continue;
      const target = path.join(dir, name);
      if (entry.attr & ATTR_DIRECTORY) {
        total.directories++;
        visit(fat.listDir(entry.cluster), target);
      } else {
        const data = fat.readFile(entry);
        writeFileSync(target, data);
        total.files++;
        total.bytes += data.length;
      }
    }
  };
  visit(fat.listRoot(), targetDir);
  return total;
}

if (process.argv[1]?.endsWith('export-image-tree.mjs')) {
  const [first, second] = process.argv.slice(2);
  if (first === '--all') {
    const base = second ?? path.join(OUT_DIR, 'official');
    for (const { number, file } of officialImages()) {
      const total = exportImageTree(file, path.join(base, `disk${String(number).padStart(2, '0')}`));
      console.log(`盘 ${number}：${total.files} 个文件、${total.directories} 个子目录、${total.bytes} 字节`);
    }
  } else {
    if (!first || !second) {
      console.error('用法：node tools/export-image-tree.mjs <镜像路径或官方软盘盘号> <导出目录> 或 --all [导出目录]');
      process.exit(2);
    }
    const imagePath = /^\d+$/.test(first) ? officialImage(Number(first)) : first;
    const total = exportImageTree(imagePath, second);
    console.log(`已导出 ${total.files} 个文件、${total.directories} 个子目录、${total.bytes} 字节到 ${second}`);
  }
}
