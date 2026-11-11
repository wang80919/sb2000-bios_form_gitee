// ------------------------------------------------------------------------
// 名称：make-floppy.mjs
// 说明：把一个目录里的所有文件做成 1.44MB 的 FAT12 软盘镜像，默认输出到 out/floppy.img。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/make-floppy.mjs <源目录> [输出镜像]
// ------------------------------------------------------------------------
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { OUT_DIR } from './config.mjs';
import { buildFat12Image } from './fat12-image.mjs';

/**
 * 读取目录下的所有文件（不含子目录）。
 * @param {string} dir 源目录
 * @returns {{name: string, data: Buffer, mtime: Date}[]}
 */
export function readDirectoryFiles(dir) {
  return readdirSync(dir)
    .map((name) => ({ name, full: path.join(dir, name) }))
    .filter(({ full }) => statSync(full).isFile())
    .map(({ name, full }) => ({ name, data: readFileSync(full), mtime: statSync(full).mtime }));
}

if (process.argv[1]?.endsWith('make-floppy.mjs')) {
  const source = process.argv[2];
  if (!source) throw new Error('用法：node tools/make-floppy.mjs <源目录> [输出镜像]');
  const target = process.argv[3] ?? path.join(OUT_DIR, 'floppy.img');
  mkdirSync(path.dirname(target), { recursive: true });
  const files = readDirectoryFiles(source);
  writeFileSync(target, buildFat12Image(files, { label: 'SB2KDISK' }));
  console.log(`已生成 ${target}，共 ${files.length} 个文件`);
}
