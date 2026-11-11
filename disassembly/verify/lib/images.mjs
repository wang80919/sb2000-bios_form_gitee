// ------------------------------------------------------------------------
// 名称：images.mjs
// 说明：验证用例生成特制软盘镜像用的辅助：按簇序号填充互不相同内容的数据、构造镜像文件项。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：内容按（种子、簇序号、簇内偏移）决定，簇链顺序错了、读写位置偏了都会让内容对不上。
// ------------------------------------------------------------------------
import { writeFileSync } from 'node:fs';
import { buildFat12Image } from '../../tools/fat12-image.mjs';

/** 一个簇的字节数 */
export const CLUSTER = 512;

const DATE = new Date(1998, 0, 1, 0, 0, 16);

/**
 * 生成 clusters 个簇的内容。
 * @param {number} seed 种子，不同文件用不同值
 * @param {number} clusters 簇数
 * @returns {Buffer} clusters × 512 字节
 */
export const pattern = (seed, clusters) => Buffer.from(Array.from({ length: clusters * CLUSTER }, (_, i) => (seed * 31 + Math.floor(i / CLUSTER) * 7 + (i % CLUSTER) * 3) & 0xff));

/** buildFat12Image 要的文件项 */
export const file = (name, data) => ({ name, data, mtime: DATE });

/**
 * 给用例加上自带镜像：用例运行前把镜像写进测试镜像（verify-run 用完会还原）。
 * @param {object} spec 用例
 * @param {{name: string, data: Buffer}[]} files 镜像里的文件
 * @returns {object} 带 prepareImage、fresh、freshAfter 的用例
 */
export const withImage = (spec, files) => {
  const image = buildFat12Image(files, { label: 'SPECIAL' });
  return { ...spec, fresh: true, freshAfter: true, image, prepareImage: (ctx) => writeFileSync(ctx.image, image) };
};
