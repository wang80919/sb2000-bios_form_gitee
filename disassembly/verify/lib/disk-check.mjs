// ------------------------------------------------------------------------
// 名称：disk-check.mjs
// 说明：写盘类验证用例共用的辅助：读入镜像原样备份，提供“保存模拟器里的磁盘镜像并解析”的主机步骤，以及检查“其余文件没被改动、两份 FAT 一致、簇不重叠”的函数。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：镜像原样备份是 out/verify/floppy-pristine.img，由 verify-run.mjs 在加载用例前生成；还没有生成时 before 为 null，调用方不应产生用例。
// ------------------------------------------------------------------------
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { OUT_DIR } from '../../tools/config.mjs';
import { parseFat12 } from './fat12.mjs';

const IMAGE = path.join(OUT_DIR, 'verify', 'floppy-pristine.img');

/** 镜像原样备份的路径 */
export const PRISTINE_PATH = IMAGE;

/** 镜像原样备份的解析结果；备份不存在时为 null */
export const before = existsSync(IMAGE) ? parseFat12(readFileSync(IMAGE)) : null;

/** 原样备份里的文件（不含卷标） */
export const originals = before ? before.listRoot().filter((entry) => (entry.attr & 0x08) === 0) : [];

/** 按 11 字节名称找原有文件 */
export const byName = (name83) => originals.find((entry) => entry.name83 === name83);

/**
 * 主机步骤：让模拟器保存磁盘镜像并解析，然后把测试镜像还原成原样备份。
 * @param {(after: object) => string[]} check 对解析结果的检查，返回问题说明数组
 */
export const saveDisk = (check) => ({
  host: async (client, _history, ctx) => {
    await client.send('savedisk');
    const saved = parseFat12(readFileSync(ctx.image));
    ctx.restore();
    return saved;
  },
  check: (hostResult) => check(hostResult.data),
});

/**
 * 簇归属一致性：FAT 里非空闲的簇正好是根目录与所有子目录里各文件、目录的簇链所含的簇，没有泄漏（占用却无人使用），也没有文件用了空闲簇。
 * @param {object} after parseFat12 的结果
 * @returns {string[]} 问题说明
 */
export function leakProblems(after) {
  const used = new Set();
  const walk = (entries) => {
    for (const entry of entries) {
      if (entry.name83.startsWith('.') || (entry.attr & 0x08) !== 0) continue;
      for (const cluster of after.chain(entry.cluster)) used.add(cluster);
      if ((entry.attr & 0x10) !== 0) walk(after.listDir(entry.cluster));
    }
  };
  walk(after.listRoot());
  const problems = [];
  for (let cluster = 2; cluster < after.clusterCount + 2 && problems.length < 5; cluster++) {
    const value = after.fatEntry(cluster);
    if (value === 0xff7) continue;
    if (value !== 0 && !used.has(cluster)) problems.push(`簇 ${cluster} 被占用但不属于任何文件`);
    if (value === 0 && used.has(cluster)) problems.push(`簇 ${cluster} 属于某个文件但 FAT 标为空闲`);
  }
  return problems;
}

/**
 * 除 exceptions（11 字节名称）以外的原有文件，目录项、簇链与内容都不变；两份 FAT 一致；所有文件的簇互不重叠。
 * @param {object} after 保存后镜像的解析结果
 * @param {string[]} [exceptions] 允许变化的文件
 * @returns {string[]} 问题说明
 */
export function untouchedProblems(after, exceptions = []) {
  const problems = [];
  const entries = after.listRoot();
  for (const old of originals.filter((entry) => !exceptions.includes(entry.name83))) {
    const now = entries.find((entry) => entry.name83 === old.name83);
    if (!now) problems.push(`${old.name83} 不见了`);
    else if (now.size !== old.size || now.cluster !== old.cluster || now.attr !== old.attr) problems.push(`${old.name83} 的目录项变了`);
    else if (!after.readFile(now).equals(before.readFile(old))) problems.push(`${old.name83} 的内容变了`);
  }
  if (!after.fatCopiesMatch()) problems.push('两份 FAT 不一致');
  problems.push(...leakProblems(after));
  const seen = new Map();
  for (const entry of entries) {
    for (const cluster of after.chain(entry.cluster)) {
      if (seen.has(cluster)) problems.push(`簇 ${cluster} 同时属于 ${seen.get(cluster)} 与 ${entry.name83}`);
      seen.set(cluster, entry.name83);
    }
  }
  return problems;
}
