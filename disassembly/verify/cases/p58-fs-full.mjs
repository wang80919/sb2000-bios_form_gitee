// ------------------------------------------------------------------------
// 名称：p58-fs-full.mjs
// 说明：创建文件的其他入口与磁盘写满的验证用例：$7C/$01 以方式 1 打开并用 $7C/$02 关闭（空文件）、$7B/$12 删除文件（不停转）、写满磁盘时的出错码 $2C 与磁盘一致性。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：写满磁盘要写两个 400000 字节（782 个簇）的文件再写第三个，用掉大约 1.5MB 的软盘写入，耗时较长；失败后核对已写入的两个文件内容不变、两份 FAT 一致、没有簇泄漏。
//       预期的出错码 $2C 来自 DOS 文档的出错码表（磁盘空间不够）。
// ------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { before, untouchedProblems, leakProblems } from '../lib/disk-check.mjs';
import { parseFat12 } from '../lib/fat12.mjs';
import { DOS_ERROR, PATH_BUFFER, ascii, le, noError, openStep, resetHandles } from '../lib/fs-steps.mjs';

const FILE_SIZE = 0x6568;
const FILE_START_PAGE = 0x656b;
const ALLOC_COUNT = 0x65a6;
const ALLOC_START = 0x65a7;
const SECTOR = 512;
const stopMotor = { func: 0x80, sub: 0x07, maxFrames: 200 };

const name83Of = (name) => {
  const [base, ext = ''] = name.toUpperCase().split('.');
  return `${base.padEnd(8, ' ')}${ext.padEnd(3, ' ')}`;
};
const content = (seed, length) => Buffer.from(Array.from({ length }, (_, i) => (seed * 29 + i * 7 + Math.floor(i / SECTOR) * 3 + 1) & 0xff));

const saveWithHistory = (check) => ({
  host: async (client, _history, ctx) => {
    await client.send('savedisk');
    const saved = parseFat12(readFileSync(ctx.image));
    ctx.restore();
    return saved;
  },
  check: (hostResult, history) => check(hostResult.data, history),
});

/** 创建文件并写入内容；writeError 为 0 表示写入应成功，否则是预期的出错码（写入失败后仍要关闭句柄、释放页） */
const createFile = (path, data, writeError = 0) => {
  const pages = Math.max(1, Math.ceil(data.length / 4096));
  let allocAt = -1;
  return [
    { ...openStep(path, 1), maxFrames: 1500 },
    (history) => { allocAt = history.length; return { func: 0x7e, sub: 0x00, mem: [[ALLOC_COUNT, [pages]]], read: [[ALLOC_START, 1]], expect: noError }; },
    {
      host: async (client, history) => {
        const base = (history[allocAt].memory.get(ALLOC_START)[0] - 0x80) * 4096;
        for (let done = 0; done < data.length; done += 2048) await client.send(`write pram ${(base + done).toString(16)} ${data.subarray(done, done + 2048).toString('hex')}`);
      },
    },
    (history) => ({ func: 0x7c, sub: 0x10, maxFrames: 60000, mem: [[FILE_SIZE, le(data.length, 3)], [FILE_START_PAGE, [history[allocAt].memory.get(ALLOC_START)[0]]]], expect: [[DOS_ERROR, [writeError]]] }),
    { func: 0x7b, sub: 0x0a, maxFrames: 3000 },
    (history) => ({ func: 0x7e, sub: 0x01, mem: [[ALLOC_COUNT, [pages]], [ALLOC_START, [history[allocAt].memory.get(ALLOC_START)[0]]]] }),
  ];
};

const cases = [];
if (before) {
  cases.push({
    id: 'fs.create.empty-via-7c01',
    title: '$7C/$01 以方式 1 打开 EMPTY.TXT，$7C/$02 关闭：得到大小 0 的空文件，但打开时已分配的 1 个簇仍然占着（起始簇非 0，簇链长 1）',
    fresh: true,
    freshAfter: true,
    steps: [
      resetHandles,
      { func: 0x7c, sub: 0x01, mem: [[PATH_BUFFER, [...ascii('EMPTY.TXT'), 0]]], expect: noError, maxFrames: 1500 },
      { func: 0x7c, sub: 0x02, mem: [[0x6561, [0]]], expect: noError, maxFrames: 1500 },
      stopMotor,
      saveWithHistory((after) => {
        const entry = after.listRoot().find((e) => e.name83 === name83Of('EMPTY.TXT'));
        if (!entry) return ['没有找到 EMPTY.TXT'];
        const problems = [];
        if (entry.size !== 0 || entry.attr !== 0x20) problems.push(`大小 ${entry.size}、属性 ${entry.attr.toString(16)}`);
        if (after.chain(entry.cluster).length !== 1) problems.push(`起始簇 ${entry.cluster}，簇链长 ${after.chain(entry.cluster).length}，预期 1`);
        if (after.freeClusters() !== before.freeClusters() - 1) problems.push(`空闲簇预期 ${before.freeClusters() - 1}，实际 ${after.freeClusters()}`);
        return [...problems, ...untouchedProblems(after, [name83Of('EMPTY.TXT')])];
      }),
    ],
  });
  cases.push({
    id: 'fs.delete.7b12',
    title: '$7B/$12 以方式 3 打开再关闭（删除文件，不停转）：目录项首字节 $E5、簇释放，之后停转',
    fresh: true,
    freshAfter: true,
    steps: [
      resetHandles,
      { func: 0x7b, sub: 0x12, mem: [[PATH_BUFFER, [...ascii('SOFT.XBW'), 0]]], expect: noError, maxFrames: 1500 },
      stopMotor,
      saveWithHistory((after) => {
        const problems = [];
        if (after.listRoot().find((e) => e.name83 === name83Of('SOFT.XBW'))) problems.push('SOFT.XBW 还在目录里');
        if (after.freeClusters() !== before.freeClusters() + 1) problems.push(`空闲簇预期 ${before.freeClusters() + 1}，实际 ${after.freeClusters()}`);
        return [...problems, ...untouchedProblems(after, [name83Of('SOFT.XBW')])];
      }),
    ],
  });
  const big = 400000;
  cases.push({
    id: 'fs.create.disk-full',
    title: '写满磁盘：先写两个 400000 字节的文件，第三个 400000 字节放不下，$7C/$10 出错码 $2C；已写入的文件完好，FAT 一致，没有簇泄漏',
    fresh: true,
    freshAfter: true,
    steps: [
      resetHandles,
      ...createFile('BIG1.BIN', content(1, big)),
      ...createFile('BIG2.BIN', content(2, big)),
      ...createFile('BIG3.BIN', content(3, big), 0x2c),
      resetHandles,
      stopMotor,
      saveWithHistory((after) => {
        const problems = [];
        for (const [name, seed] of [['BIG1.BIN', 1], ['BIG2.BIN', 2]]) {
          const entry = after.listRoot().find((e) => e.name83 === name83Of(name));
          if (!entry) problems.push(`${name} 不见了`);
          else if (entry.size !== big || !after.readFile(entry).equals(content(seed, big))) problems.push(`${name} 大小或内容不对`);
        }
        problems.push(...leakProblems(after));
        if (!after.fatCopiesMatch()) problems.push('两份 FAT 不一致');
        return problems.slice(0, 8);
      }),
    ],
  });
}

export { cases };
