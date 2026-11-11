// ------------------------------------------------------------------------
// 名称：p58-fs-dirs.mjs
// 说明：目录相关服务的验证用例：$7D/$02 建目录（含嵌套、已存在、重名、父目录不存在）、在子目录里创建与读取文件、目录增长、$7D/$03 删目录（空目录、非空目录、文件、不存在）、$7C/$03 删子目录里的文件、$7B/$0B 取子目录的目录项。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值来自 FAT12 规范与保存后的镜像：子目录项属性 $10、大小 0、占 1 个簇，目录簇里第一项是“.”（指向自己）、第二项是“..”（指向上一级，根目录写 0），其余为空；
//       目录里的文件按路径放进去；删除后目录项首字节为 $E5、簇链释放、其余原有文件不变、两份 FAT 一致、没有簇泄漏。
//       出错码由 DOS 文档的出错码表给出：已存在的目录 $26，已存在的文件名 $2D，父目录不存在 3，非空目录 $29。
// ------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { before } from '../lib/disk-check.mjs';
import { untouchedProblems } from '../lib/disk-check.mjs';
import { parseFat12 } from '../lib/fat12.mjs';
import { DOS_ERROR, PATH_BUFFER, ascii, closeHandle, le, noError, openStep, resetHandles } from '../lib/fs-steps.mjs';

/** 出错的调用之后 DOS_ERROR 保留出错码，所以停转步骤不要求 DOS_ERROR 为 0 */
const stopMotor = { func: 0x80, sub: 0x07, maxFrames: 200 };

const FILE_SIZE = 0x6568;
const FILE_START_PAGE = 0x656b;
const ALLOC_COUNT = 0x65a6;
const ALLOC_START = 0x65a7;
const DIR_NAME83 = 0x651d;
const SECTOR = 512;

const name83Of = (name) => {
  const [base, ext = ''] = name.toUpperCase().split('.');
  return `${base.padEnd(8, ' ')}${ext.padEnd(3, ' ')}`;
};
const content = (seed, length) => Buffer.from(Array.from({ length }, (_, i) => (seed * 29 + i * 7 + Math.floor(i / SECTOR) * 3 + 1) & 0xff));

/** 保存磁盘镜像并解析，检查函数同时拿到前面各步的结果 */
const saveWithHistory = (check) => ({
  host: async (client, _history, ctx) => {
    await client.send('savedisk');
    const saved = parseFat12(readFileSync(ctx.image));
    ctx.restore();
    return saved;
  },
  check: (hostResult, history) => check(hostResult.data, history),
});

const pathMem = (path) => [PATH_BUFFER, [...ascii(path), 0]];
const mkdir = (path, error = 0) => ({ func: 0x7d, sub: 0x02, mem: [pathMem(path)], expect: [[DOS_ERROR, [error]]], maxFrames: 1200 });
const rmdir = (path, error = 0) => ({ func: 0x7d, sub: 0x03, mem: [pathMem(path)], expect: [[DOS_ERROR, [error]]], maxFrames: 1200 });
const deleteFile = (path, error = 0) => ({ func: 0x7c, sub: 0x03, mem: [pathMem(path)], expect: [[DOS_ERROR, [error]]], maxFrames: 1200 });

/** 创建文件并写入内容的一组步骤（分配页、写页、写文件、关闭、释放页） */
const createFile = (path, data) => {
  const pages = Math.max(1, Math.ceil(data.length / 4096));
  let allocAt = -1;
  return [
    { ...openStep(path, 1), maxFrames: 1200 },
    (history) => { allocAt = history.length; return { func: 0x7e, sub: 0x00, mem: [[ALLOC_COUNT, [pages]]], read: [[ALLOC_START, 1]], expect: noError }; },
    {
      host: async (client, history) => {
        const base = (history[allocAt].memory.get(ALLOC_START)[0] - 0x80) * 4096;
        for (let done = 0; done < data.length; done += 1024) await client.send(`write pram ${(base + done).toString(16)} ${data.subarray(done, done + 1024).toString('hex')}`);
      },
    },
    (history) => ({ func: 0x7c, sub: 0x10, maxFrames: 3000, mem: [[FILE_SIZE, le(data.length, 3)], [FILE_START_PAGE, [history[allocAt].memory.get(ALLOC_START)[0]]]], expect: noError }),
    { ...closeHandle, maxFrames: 900 },
    (history) => ({ func: 0x7e, sub: 0x01, mem: [[ALLOC_COUNT, [pages]], [ALLOC_START, [history[allocAt].memory.get(ALLOC_START)[0]]]], expect: noError }),
  ];
};

/** 目录项（目录簇里）按名称找 */
const findIn = (entries, name83) => entries.find((e) => e.name83 === name83);

/** 子目录里“.”与“..”的检查：点项指向自己，两点项指向上一级（根目录为 0），其余字节为 0 */
const dotProblems = (after, entry, parentCluster) => {
  const problems = [];
  const data = Buffer.from(after.readCluster(entry.cluster));
  if (data.toString('latin1', 0, 11) !== '.          ') problems.push('第 1 项不是 "."');
  if (data.toString('latin1', 32, 43) !== '..         ') problems.push('第 2 项不是 ".."');
  if (data[11] !== 0x10 || data[43] !== 0x10) problems.push('"." 或 ".." 的属性不是 $10');
  if (data.readUInt16LE(26) !== entry.cluster) problems.push(`"." 指向 ${data.readUInt16LE(26)}，预期 ${entry.cluster}`);
  if (data.readUInt16LE(58) !== parentCluster) problems.push(`".." 指向 ${data.readUInt16LE(58)}，预期 ${parentCluster}`);
  if (data.readUInt32LE(28) !== 0 || data.readUInt32LE(60) !== 0) problems.push('"." 或 ".." 的大小不是 0');
  if (!data.subarray(64).every((byte) => byte === 0)) problems.push('目录簇里第 3 项起不是全 0');
  return problems;
};

const cases = [];
if (before) {
  cases.push({
    id: 'fs.dir.mkdir',
    title: '$7D/$02 建目录 \\SUB：根目录里多一项（属性 $10、大小 0、占 1 个簇），目录簇里有 "." 与 ".."',
    fresh: true,
    freshAfter: true,
    steps: [resetHandles, mkdir('\\SUB'), stopMotor, saveWithHistory((after) => {
      const entry = findIn(after.listRoot(), name83Of('SUB'));
      if (!entry) return ['没有找到 SUB'];
      const problems = [];
      if (entry.attr !== 0x10 || entry.size !== 0) problems.push(`属性 ${entry.attr.toString(16)}、大小 ${entry.size}`);
      if (after.chain(entry.cluster).length !== 1) problems.push('簇链长度不是 1');
      if (after.freeClusters() !== before.freeClusters() - 1) problems.push(`空闲簇预期 ${before.freeClusters() - 1}，实际 ${after.freeClusters()}`);
      return [...problems, ...dotProblems(after, entry, 0), ...untouchedProblems(after, [name83Of('SUB')])];
    })],
  });
  cases.push({
    id: 'fs.dir.mkdir-nested',
    title: '$7D/$02 只支持一级子目录：\\A 能建，\\A\\B 出错码 $2A（目录嵌套层数过多），\\A\\B\\C 出错码 $27，磁盘上只有 A',
    fresh: true,
    freshAfter: true,
    steps: [resetHandles, mkdir('\\A'), mkdir('\\A\\B', 0x2a), mkdir('\\A\\B\\C', 0x27), stopMotor, saveWithHistory((after) => {
      const a = findIn(after.listRoot(), name83Of('A'));
      if (!a) return ['没有找到 A'];
      const problems = [];
      if (after.listDir(a.cluster).some((e) => e.name83 !== '.          ' && e.name83 !== '..         ')) problems.push('A 里出现了子目录');
      if (after.freeClusters() !== before.freeClusters() - 1) problems.push(`空闲簇预期 ${before.freeClusters() - 1}，实际 ${after.freeClusters()}`);
      return [...problems, ...dotProblems(after, a, 0), ...untouchedProblems(after, [name83Of('A')])];
    })],
  });
  cases.push({
    id: 'fs.dir.mkdir-exists',
    title: '$7D/$02 建已存在的目录 \\SUB：出错码 $26，磁盘上只有第一次建的那个目录',
    fresh: true,
    freshAfter: true,
    steps: [resetHandles, mkdir('\\SUB'), mkdir('\\SUB', 0x26), stopMotor, saveWithHistory((after) => {
      const entries = after.listRoot().filter((e) => e.name83 === name83Of('SUB'));
      const problems = entries.length === 1 ? [] : [`SUB 有 ${entries.length} 项`];
      if (after.freeClusters() !== before.freeClusters() - 1) problems.push(`空闲簇预期 ${before.freeClusters() - 1}，实际 ${after.freeClusters()}`);
      return [...problems, ...untouchedProblems(after, [name83Of('SUB')])];
    })],
  });
  cases.push({ id: 'fs.dir.mkdir-file-name', title: '$7D/$02 建与已有文件同名的目录 HELLO.TXT：出错码 $2D', fresh: true, freshAfter: true, steps: [resetHandles, mkdir('HELLO.TXT', 0x2d), stopMotor, saveWithHistory((after) => untouchedProblems(after))] });
  cases.push({ id: 'fs.dir.mkdir-no-parent', title: '$7D/$02 父目录不存在 \\NOPE\\X：出错码 3', fresh: true, freshAfter: true, steps: [resetHandles, mkdir('\\NOPE\\X', 0x03), stopMotor, saveWithHistory((after) => untouchedProblems(after))] });
  cases.push({ id: 'fs.dir.mkdir-bad-name', title: '$7D/$02 名称含非法字符 \\A?B：出错码 $27', fresh: true, freshAfter: true, steps: [resetHandles, mkdir('\\A?B', 0x27), stopMotor, saveWithHistory((after) => untouchedProblems(after))] });

  // 子目录里的文件：创建、读回、删除
  const inner = content(21, 700);
  cases.push({
    id: 'fs.dir.file-inside',
    title: '在 \\SUB 里创建 F.TXT（700 字节）：目录项在 SUB 的目录簇里，内容完整；再用 $7B/$09 方式 0、$7C/$0D、$7C/$0F 读回与写入一致',
    fresh: true,
    freshAfter: true,
    steps: [
      resetHandles,
      mkdir('\\SUB'),
      ...createFile('\\SUB\\F.TXT', inner),
      resetHandles,
      { ...openStep('\\SUB\\F.TXT', 0), maxFrames: 900 },
      { func: 0x7c, sub: 0x0d, expect: [[DOS_ERROR, [0]], [0x6568, le(700, 3)]] },
      { func: 0x7e, sub: 0x00, mem: [[ALLOC_COUNT, [1]]], read: [[ALLOC_START, 1]], expect: noError },
      (history) => {
        const page = history.at(-1).memory.get(ALLOC_START)[0];
        return { func: 0x7c, sub: 0x0f, maxFrames: 900, mem: [[FILE_START_PAGE, [page]]], readPram: [[(page - 0x80) * 4096, 700]], expect: noError, check: (r) => (Buffer.from(r.pram.get((page - 0x80) * 4096)).equals(inner) ? [] : ['读回的内容与写入的不一致']) };
      },
      { ...closeHandle, maxFrames: 900 },
      (history) => ({ func: 0x7e, sub: 0x01, mem: [[ALLOC_COUNT, [1]], [ALLOC_START, [history.at(-3).memory.get(ALLOC_START)[0]]]], expect: noError }),
      stopMotor,
      saveWithHistory((after) => {
        const sub = findIn(after.listRoot(), name83Of('SUB'));
        if (!sub) return ['没有找到 SUB'];
        const file = findIn(after.listDir(sub.cluster), name83Of('F.TXT'));
        if (!file) return ['SUB 里没有 F.TXT'];
        const problems = [];
        if (file.size !== 700 || file.attr !== 0x20) problems.push(`F.TXT 大小 ${file.size}、属性 ${file.attr.toString(16)}`);
        if (!after.readFile(file).equals(inner)) problems.push('F.TXT 的内容不对');
        if (after.freeClusters() !== before.freeClusters() - 3) problems.push(`空闲簇预期 ${before.freeClusters() - 3}，实际 ${after.freeClusters()}`);
        if (findIn(after.listRoot(), name83Of('F.TXT'))) problems.push('F.TXT 误放进了根目录');
        return [...problems, ...untouchedProblems(after, [name83Of('SUB')])];
      }),
    ],
  });
  cases.push({
    id: 'fs.dir.file-in-missing-dir',
    title: '在不存在的目录里创建文件 \\NOPE\\F.TXT：出错码 3，磁盘不变',
    fresh: true,
    freshAfter: true,
    steps: [resetHandles, { ...openStep('\\NOPE\\F.TXT', 1, [[DOS_ERROR, [0x03]]]), maxFrames: 900 }, stopMotor, saveWithHistory((after) => untouchedProblems(after))],
  });

  // 目录增长：每簇 512 字节放 16 项，“.”“..”占 2 项，建 17 个文件后目录要占 2 个簇
  const many = Array.from({ length: 17 }, (_, i) => `F${i.toString().padStart(2, '0')}.TXT`);
  cases.push({
    id: 'fs.dir.grow',
    title: '\\BIG 里创建 17 个文件：目录项超过一个簇（16 项）时目录簇链扩到 2 个簇，每个文件都在目录里',
    fresh: true,
    freshAfter: true,
    steps: [
      resetHandles,
      mkdir('\\BIG'),
      ...many.flatMap((name, i) => createFile(`\\BIG\\${name}`, content(i + 40, 10 + i))),
      stopMotor,
      saveWithHistory((after) => {
        const dir = findIn(after.listRoot(), name83Of('BIG'));
        if (!dir) return ['没有找到 BIG'];
        const problems = [];
        const chain = after.chain(dir.cluster);
        if (chain.length !== 2) problems.push(`BIG 的簇链长度 ${chain.length}，预期 2`);
        const listed = after.listDir(dir.cluster);
        many.forEach((name, i) => {
          const file = findIn(listed, name83Of(name));
          if (!file) problems.push(`缺少 ${name}`);
          else if (!after.readFile(file).equals(content(i + 40, 10 + i))) problems.push(`${name} 内容不对`);
        });
        return [...problems.slice(0, 8), ...untouchedProblems(after, [name83Of('BIG')])];
      }),
    ],
  });

  // 删除
  cases.push({
    id: 'fs.dir.rmdir-empty',
    title: '$7D/$03 删空目录 \\SUB：目录项首字节 $E5，簇释放，磁盘回到原样',
    fresh: true,
    freshAfter: true,
    steps: [resetHandles, mkdir('\\SUB'), rmdir('\\SUB'), stopMotor, saveWithHistory((after) => {
      const problems = [];
      if (findIn(after.listRoot(), name83Of('SUB'))) problems.push('SUB 还在目录里');
      if (after.freeClusters() !== before.freeClusters()) problems.push(`空闲簇预期 ${before.freeClusters()}，实际 ${after.freeClusters()}`);
      return [...problems, ...untouchedProblems(after)];
    })],
  });
  cases.push({
    id: 'fs.dir.rmdir-nonempty',
    title: '$7D/$03 删非空目录 \\SUB（里面有 F.TXT）：出错码 $29，目录与文件都在',
    fresh: true,
    freshAfter: true,
    steps: [resetHandles, mkdir('\\SUB'), ...createFile('\\SUB\\F.TXT', content(22, 100)), rmdir('\\SUB', 0x29), stopMotor, saveWithHistory((after) => {
      const sub = findIn(after.listRoot(), name83Of('SUB'));
      if (!sub) return ['SUB 不见了'];
      const file = findIn(after.listDir(sub.cluster), name83Of('F.TXT'));
      const problems = file && after.readFile(file).equals(content(22, 100)) ? [] : ['F.TXT 不见了或内容变了'];
      return [...problems, ...untouchedProblems(after, [name83Of('SUB')])];
    })],
  });
  cases.push({
    id: 'fs.dir.rmdir-after-delete-file',
    title: '先用 $7C/$03 删掉 \\SUB\\F.TXT，再 $7D/$03 删 \\SUB：都成功，磁盘回到原样',
    fresh: true,
    freshAfter: true,
    steps: [resetHandles, mkdir('\\SUB'), ...createFile('\\SUB\\F.TXT', content(23, 100)), deleteFile('\\SUB\\F.TXT'), rmdir('\\SUB'), stopMotor, saveWithHistory((after) => {
      const problems = [];
      if (after.freeClusters() !== before.freeClusters()) problems.push(`空闲簇预期 ${before.freeClusters()}，实际 ${after.freeClusters()}`);
      return [...problems, ...untouchedProblems(after)];
    })],
  });
  cases.push({ id: 'fs.dir.rmdir-file', title: '$7D/$03 对普通文件 HELLO.TXT：出错码 $2D（只能删目录，删文件用 $7C/$03）', fresh: true, freshAfter: true, steps: [resetHandles, rmdir('HELLO.TXT', 0x2d), stopMotor, saveWithHistory((after) => untouchedProblems(after))] });
  cases.push({ id: 'fs.dir.rmdir-missing', title: '$7D/$03 不存在的路径 \\NOPE：出错码 3', fresh: true, freshAfter: true, steps: [resetHandles, rmdir('\\NOPE', 0x03), stopMotor, saveWithHistory((after) => untouchedProblems(after))] });
  cases.push({ id: 'fs.dir.delete-file-missing', title: '$7C/$03 删除不存在的文件 NOFILE.TXT：出错码 2', fresh: true, freshAfter: true, steps: [resetHandles, deleteFile('NOFILE.TXT', 0x02), stopMotor, saveWithHistory((after) => untouchedProblems(after))] });

  // $7B/$0B 取子目录的目录项：DIR_NAME83 与目录起始扇区
  cases.push({
    id: 'fs.dir.find-subdir',
    title: '$7B/$0B 取已存在的子目录 \\SUB 的目录项：成功，起始扇区 $6528/$6529 是 SUB 目录簇的第一个扇区',
    fresh: true,
    freshAfter: true,
    steps: [
      resetHandles,
      mkdir('\\SUB'),
      resetHandles,
      { func: 0x7b, sub: 0x0b, mem: [pathMem('\\SUB'), [DIR_NAME83, ascii('xxxxxxxxxxx')]], read: [[DOS_ERROR, 1], [DIR_NAME83, 11], [0x6528, 2]], maxFrames: 900 },
      resetHandles,
      stopMotor,
      saveWithHistory((after, history) => {
        const sub = findIn(after.listRoot(), name83Of('SUB'));
        if (!sub) return ['没有找到 SUB'];
        const found = history[3];
        const problems = [];
        if (found.memory.get(DOS_ERROR)[0] !== 0) problems.push(`DOS_ERROR 为 ${found.memory.get(DOS_ERROR)[0].toString(16)}`);
        const lba = (sub.cluster - 2) + 33;
        const got = found.memory.get(0x6528);
        if (got[0] + got[1] * 256 !== lba) problems.push(`起始扇区为 ${got[0] + got[1] * 256}，预期 ${lba}`);
        const name = Buffer.from(found.memory.get(DIR_NAME83)).toString('latin1');
        if (name !== name83Of('SUB')) problems.push(`DIR_NAME83 为 "${name}"，预期 "${name83Of('SUB')}"`);
        return problems;
      }),
    ],
  });
  // DIR_NAME83 与 $6528/$6529 是“当前目录”的名称与起始扇区：$7B/$0B 取子目录后，相对路径在那个子目录里找；取根目录后回到根目录
  cases.push({
    id: 'fs.dir.current-dir',
    title: '$7B/$0B 取 \\SUB 后相对路径 F.TXT 在 SUB 里找到（根目录里没有 F.TXT）；再取 "\\" 回到根目录，F.TXT 找不到（出错码 2）',
    fresh: true,
    freshAfter: true,
    steps: [
      resetHandles,
      mkdir('\\SUB'),
      ...createFile('\\SUB\\F.TXT', content(31, 100)),
      resetHandles,
      { ...openStep('F.TXT', 0, [[DOS_ERROR, [0x02]]]), maxFrames: 900 },
      { func: 0x7b, sub: 0x0b, mem: [pathMem('\\SUB')], expect: noError, maxFrames: 900 },
      resetHandles,
      { ...openStep('F.TXT', 0), maxFrames: 900 },
      { func: 0x7c, sub: 0x0d, expect: [[DOS_ERROR, [0]], [0x6568, le(100, 3)]] },
      { ...closeHandle, maxFrames: 900 },
      { func: 0x7b, sub: 0x0b, mem: [pathMem('\\')], expect: noError, maxFrames: 900 },
      resetHandles,
      { ...openStep('F.TXT', 0, [[DOS_ERROR, [0x02]]]), maxFrames: 900 },
      stopMotor,
      saveWithHistory(() => []),
    ],
  });
}

export { cases };
