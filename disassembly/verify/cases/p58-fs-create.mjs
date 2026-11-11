// ------------------------------------------------------------------------
// 名称：p58-fs-create.mjs
// 说明：文件服务创建与整体写入的验证用例：$7B/$09 方式 1 创建文件（含覆盖已存在的文件）、$7C/$10 写入整个文件、$7B/$0A 关闭，保存磁盘镜像后用 FAT12 读取器核对目录项、簇链、内容、空闲簇数与日期。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值来自 FAT12 规范与用例自己的数据：新文件目录项名称与属性 $20、大小等于写入长度、簇链长度为 ceil(长度 / 512)、内容与写入的一致、两份 FAT 一致、空闲簇数相应减少，
//       日期等于创建前用 $7F/$02 取得的系统日期，时间与 $7F/$04 取得的系统时间相差不超过 2 分钟；其余原有文件的目录项与内容不变。
//       写入的数据放在扩展 RAM 页（页首起），页用 $7E/$00 分配、$7E/$01 释放，步骤写法同 p58-fs-handle.mjs。
// ------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { before, byName, untouchedProblems } from '../lib/disk-check.mjs';
import { parseFat12 } from '../lib/fat12.mjs';
import { closeHandle, le, noError, openStep, resetHandles, stopMotor } from '../lib/fs-steps.mjs';

const FILE_SIZE = 0x6568;
const FILE_START_PAGE = 0x656b;
const FILE_DATE = 0x656e;
const FILE_TIME = 0x6570;
const ALLOC_COUNT = 0x65a6;
const ALLOC_START = 0x65a7;
const SECTOR = 512;

const name83Of = (name) => {
  const [base, ext = ''] = name.toUpperCase().split('.');
  return `${base.padEnd(8, ' ')}${ext.padEnd(3, ' ')}`;
};

/** 按长度生成内容：每个字节依赖位置，簇链顺序错了、页内偏移错了都会对不上 */
const content = (seed, length) => Buffer.from(Array.from({ length }, (_, i) => (seed * 29 + i * 7 + Math.floor(i / SECTOR) * 3 + 1) & 0xff));

/** FAT 时间折成“秒的一半”的总数，便于比较先后 */
const timeUnits = (time) => (time >> 11) * 1800 + ((time >> 5) & 63) * 30 + (time & 31);

/** 保存模拟器里的磁盘镜像并解析，检查函数同时拿到前面各步的结果；保存后把测试镜像还原 */
const saveWithHistory = (check) => ({
  host: async (client, _history, ctx) => {
    await client.send('savedisk');
    const saved = parseFat12(readFileSync(ctx.image));
    ctx.restore();
    return saved;
  },
  check: (hostResult, history) => check(hostResult.data, history),
});

/**
 * 创建（或覆盖）文件并写入 data 的用例。
 * 步骤：0 重置句柄，1 取系统日期，2 取系统时间，3 打开（方式 1），4 分配页，5 把数据写进页，6 写整个文件，7 关闭，8 释放页，9 停转，10 保存并检查。
 */
const createCase = (id, title, path, data, { replaces } = {}) => {
  const pages = Math.max(1, Math.ceil(data.length / 4096));
  const name83 = name83Of(path.split('\\').pop());
  const old = replaces ? byName(replaces) : null;
  const oldClusters = old ? Math.ceil(old.size / SECTOR) : 0;
  const newClusters = Math.ceil(data.length / SECTOR);
  return {
    id,
    title,
    fresh: true,
    freshAfter: true,
    steps: [
      resetHandles,
      { func: 0x7f, sub: 0x02, read: [[FILE_DATE, 2]], expect: noError },
      { func: 0x7f, sub: 0x04, read: [[FILE_TIME, 2]], expect: noError },
      { ...openStep(path, 1), maxFrames: 900 },
      { func: 0x7e, sub: 0x00, mem: [[ALLOC_COUNT, [pages]]], read: [[ALLOC_START, 1]], expect: noError },
      {
        host: async (client, history) => {
          const base = (history[4].memory.get(ALLOC_START)[0] - 0x80) * 4096;
          for (let done = 0; done < data.length; done += 1024) await client.send(`write pram ${(base + done).toString(16)} ${data.subarray(done, done + 1024).toString('hex')}`);
        },
      },
      (history) => ({
        func: 0x7c,
        sub: 0x10,
        maxFrames: 3000,
        mem: [[FILE_SIZE, le(data.length, 3)], [FILE_START_PAGE, [history[4].memory.get(ALLOC_START)[0]]]],
        expect: noError,
      }),
      { ...closeHandle, maxFrames: 900 },
      (history) => ({ func: 0x7e, sub: 0x01, mem: [[ALLOC_COUNT, [pages]], [ALLOC_START, [history[4].memory.get(ALLOC_START)[0]]]], expect: noError }),
      stopMotor,
      saveWithHistory((after, history) => {
        const problems = [];
        const entry = after.listRoot().find((e) => e.name83 === name83);
        if (!entry) return [`没有找到新文件 ${name83}`];
        if (entry.attr !== 0x20) problems.push(`属性为 ${entry.attr.toString(16)}，预期 20`);
        if (entry.size !== data.length) problems.push(`大小为 ${entry.size}，预期 ${data.length}`);
        const chain = after.chain(entry.cluster);
        if (chain.length !== newClusters) problems.push(`簇链长 ${chain.length}，预期 ${newClusters}`);
        const got = after.readFile(entry);
        if (!got.equals(data)) {
          let at = 0;
          while (got[at] === data[at]) at++;
          problems.push(`内容与写入的不一致，首个差异在偏移 ${at}`);
        }
        const wantFree = before.freeClusters() - newClusters + oldClusters;
        if (after.freeClusters() !== wantFree) problems.push(`空闲簇预期 ${wantFree}，实际 ${after.freeClusters()}`);
        const date = Buffer.from(history[1].memory.get(FILE_DATE)).readUInt16LE(0);
        const time = Buffer.from(history[2].memory.get(FILE_TIME)).readUInt16LE(0);
        if (entry.date !== date) problems.push(`日期为 ${entry.date.toString(16)}，预期系统日期 ${date.toString(16)}`);
        const elapsed = timeUnits(entry.time) - timeUnits(time);
        if (elapsed < 0 || elapsed > 120) problems.push(`时间 ${entry.time.toString(16)} 与创建前的系统时间 ${time.toString(16)} 相差 ${elapsed}（单位 2 秒）`);
        return [...problems, ...untouchedProblems(after, [name83, ...(old ? [old.name83] : [])])];
      }),
    ],
  };
};

const cases = before
  ? [
      ...[1, 100, 511, 512, 513, 1024, 2000, 4095, 4096, 4097, 8192, 10000, 20000].map((length) => createCase(`fs.create.new-${length}`, `$7B/$09 方式 1 创建 NEW.BIN，$7C/$10 写入 ${length} 字节，关闭：目录项、簇链、内容、空闲簇数都对`, 'NEW.BIN', content(length, length))),
      createCase('fs.create.replace-bigger', '方式 1 覆盖已存在的 HELLO.TXT（7 字节）为 5000 字节：旧簇释放、新内容完整', 'HELLO.TXT', content(11, 5000), { replaces: 'HELLO   TXT' }),
      createCase('fs.create.replace-smaller', '方式 1 覆盖已存在的 ATTRIB.EXE（4160 字节）为 100 字节：多余的簇释放', 'ATTRIB.EXE', content(12, 100), { replaces: 'ATTRIB  EXE' }),
      createCase('fs.create.replace-same', '方式 1 覆盖已存在的 SOFT.XBW（424 字节）为 424 字节新内容', 'SOFT.XBW', content(13, 424), { replaces: 'SOFT    XBW' }),
      createCase('fs.create.lowercase', '路径用小写 "new.bin"：目录项名称是大写的 NEW     BIN', 'new.bin', content(14, 700)),
      createCase('fs.create.with-drive', '路径带驱动器 "A:\\NEW.BIN"', 'A:\\NEW.BIN', content(15, 700)),
      createCase('fs.create.short-name', '没有扩展名的 "NOEXT"', 'NOEXT', content(16, 600)),
      createCase('fs.create.long-name', '8 个字符的名称与 3 个字符的扩展名 "ABCDEFGH.XYZ"', 'ABCDEFGH.XYZ', content(17, 600)),
    ]
  : [];

export { cases };
