// ------------------------------------------------------------------------
// 名称：p58-fs-write.mjs
// 说明：页组 $58 文件系统写入类服务的验证用例：复制文件、删除、重命名、创建目录、按偏移写；调用后让模拟器保存磁盘镜像，用独立的 FAT12 读取器检查目录项、簇链、空闲簇数与文件内容。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：每个用例前后都重新开机（freshAfter）并由 verify-run.mjs 把镜像还原，互不影响；预期来自 FAT12 规范与原镜像的解析，不依赖 BIOS 的输出。
//       保存镜像用模拟器的 savedisk 命令；调用顺序见 fcdev 仓库 docs/sb2000/02-系统调用手册.md 4.7、4.8 节，delete 实测用 $7C/$03（见该手册对应行的更正）。
// ------------------------------------------------------------------------
import { before, byName, saveDisk, untouchedProblems } from '../lib/disk-check.mjs';
import { FILE_MODE, PATH_BUFFER, ascii, closeHandle, le, noError, openStep as open, resetHandles, stopMotor } from '../lib/fs-steps.mjs';

/** 把一个原有文件读进新分配的页，返回后续步骤要用的页号（放在 history 对应步骤的 $65A7） */
const loadIntoPages = (name83) => {
  const entry = byName(name83);
  const pages = Math.ceil(entry.size / 4096);
  const dosName = `${name83.slice(0, 8).trim()}.${name83.slice(8).trim()}`;
  return { entry, pages, steps: [open(dosName, 0), { func: 0x7e, sub: 0x00, mem: [[0x65a6, [pages]]], read: [[0x65a7, 1]], expect: noError }, (history) => ({ func: 0x7c, sub: 0x0f, mem: [[0x656b, [history.at(-1).memory.get(0x65a7)[0]]]], expect: noError }), closeHandle] };
};

const copyCase = (id, source83, target, title) => {
  const { entry, steps: loadSteps } = loadIntoPages(source83);
  const targetName83 = `${target.split('.')[0].padEnd(8, ' ')}${target.split('.')[1].padEnd(3, ' ')}`;
  return {
    id,
    title,
    fresh: true,
    freshAfter: true,
    steps: [
      resetHandles,
      ...loadSteps,
      // 步骤 0 重置句柄，1-4 是读入源文件（打开、分配页、读、关闭），分配得到的页号在步骤 2 的 $65A7
      { func: 0x7b, sub: 0x09, mem: [[FILE_MODE, [1]], [PATH_BUFFER, [...ascii(target), 0]]], expect: noError },
      (history) => ({ func: 0x7c, sub: 0x10, maxFrames: 600, mem: [[0x6568, le(entry.size, 3)], [0x656b, [history[2].memory.get(0x65a7)[0]]]], expect: noError }),
      { ...closeHandle, maxFrames: 300 },
      stopMotor,
      saveDisk((after) => {
        const found = after.listRoot().find((e) => e.name83 === targetName83);
        if (!found) return [`没有找到新文件 ${targetName83}`];
        const problems = [];
        if (found.size !== entry.size) problems.push(`大小预期 ${entry.size}，实际 ${found.size}`);
        if (!after.readFile(found).equals(before.readFile(entry))) problems.push('新文件内容与源文件不一致');
        const clusters = Math.ceil(entry.size / before.clusterBytes);
        if (after.chain(found.cluster).length !== clusters) problems.push(`簇链长度预期 ${clusters}，实际 ${after.chain(found.cluster).length}`);
        if (after.freeClusters() !== before.freeClusters() - clusters) problems.push(`空闲簇预期 ${before.freeClusters() - clusters}，实际 ${after.freeClusters()}`);
        return [...problems, ...untouchedProblems(after)];
      }),
    ],
  };
};

const cases = [
  copyCase('fs.write.copy-small', 'HELLO   TXT', 'NEWHELLO.TXT', '复制 HELLO.TXT（7 字节）为 NEWHELLO.TXT：新目录项、1 个簇、内容一致，其余文件不变，两份 FAT 一致'),
  copyCase('fs.write.copy-big', 'EDIT    EXE', 'EDITCOPY.EXE', '复制 EDIT.EXE（32768 字节）为 EDITCOPY.EXE：64 个簇的链、内容一致，空闲簇减少 64'),
  {
    id: 'fs.write.delete',
    title: '$7C/$03 删除 HELLO.TXT：目录项消失、簇 727 的 FAT 项清 0、空闲簇加 1，其余文件不变',
    fresh: true,
    freshAfter: true,
    steps: [
      resetHandles,
      { func: 0x7c, sub: 0x03, maxFrames: 300, mem: [[PATH_BUFFER, [...ascii('HELLO.TXT'), 0]]], expect: noError },
      saveDisk((after) => {
        const problems = [];
        if (after.listRoot().some((e) => e.name83 === 'HELLO   TXT')) problems.push('HELLO.TXT 的目录项还在');
        if (after.fatEntry(727) !== 0) problems.push(`簇 727 的 FAT 项预期 0，实际 ${after.fatEntry(727)}`);
        if (after.freeClusters() !== before.freeClusters() + 1) problems.push(`空闲簇预期 ${before.freeClusters() + 1}，实际 ${after.freeClusters()}`);
        return [...problems, ...untouchedProblems(after, ['HELLO   TXT'])];
      }),
    ],
  },
  {
    id: 'fs.write.rename',
    title: '$7C/$04 把 EDIT.EXE 改名为 NEWNAME.EXE：起始簇、大小、内容不变，旧名消失',
    fresh: true,
    freshAfter: true,
    steps: [
      resetHandles,
      open('EDIT.EXE', 2),
      { func: 0x7c, sub: 0x04, maxFrames: 300, mem: [[PATH_BUFFER, [...ascii('NEWNAME.EXE'), 0]]], expect: noError },
      { ...closeHandle, maxFrames: 300 },
      stopMotor,
      saveDisk((after) => {
        const old = byName('EDIT    EXE');
        const entries = after.listRoot();
        const found = entries.find((e) => e.name83 === 'NEWNAME EXE');
        const problems = [];
        if (!found) return ['没有找到 NEWNAME.EXE'];
        if (entries.some((e) => e.name83 === 'EDIT    EXE')) problems.push('旧名 EDIT.EXE 还在');
        if (found.cluster !== old.cluster || found.size !== old.size) problems.push('改名后起始簇或大小变了');
        if (!after.readFile(found).equals(before.readFile(old))) problems.push('改名后内容变了');
        return [...problems, ...untouchedProblems(after, ['EDIT    EXE'])];
      }),
    ],
  },
  {
    id: 'fs.write.mkdir',
    title: '$7D/$02 创建目录 NEWDIR：属性 $10、占 1 个簇，簇里有 "." 与 ".." 两项',
    fresh: true,
    freshAfter: true,
    steps: [
      resetHandles,
      { func: 0x7d, sub: 0x02, maxFrames: 300, mem: [[PATH_BUFFER, [...ascii('NEWDIR'), 0, 0]]], expect: noError },
      stopMotor,
      saveDisk((after) => {
        const found = after.listRoot().find((e) => e.name83 === 'NEWDIR     ');
        if (!found) return ['没有找到目录 NEWDIR'];
        const problems = [];
        if (found.attr !== 0x10) problems.push(`属性预期 $10，实际 $${found.attr.toString(16)}`);
        if (after.chain(found.cluster).length !== 1) problems.push(`簇链长度预期 1，实际 ${after.chain(found.cluster).length}`);
        const data = Buffer.from(after.readCluster(found.cluster));
        const dot = data.toString('latin1', 0, 11);
        const dotdot = data.toString('latin1', 32, 43);
        if (dot !== '.          ') problems.push(`第 1 项预期 "."，实际 ${JSON.stringify(dot)}`);
        if (dotdot !== '..         ') problems.push(`第 2 项预期 ".."，实际 ${JSON.stringify(dotdot)}`);
        if (data.readUInt16LE(26) !== found.cluster) problems.push('"." 的起始簇应是目录自己的簇');
        if (data.readUInt16LE(32 + 26) !== 0) problems.push('".." 的起始簇应是 0（根目录）');
        if (after.freeClusters() !== before.freeClusters() - 1) problems.push(`空闲簇预期 ${before.freeClusters() - 1}，实际 ${after.freeClusters()}`);
        return [...problems, ...untouchedProblems(after)];
      }),
    ],
  },
];

export { cases };
