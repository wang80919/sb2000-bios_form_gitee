// ------------------------------------------------------------------------
// 名称：p58-fs-handle.mjs
// 说明：页组 $58 文件系统“按句柄操作”服务的验证用例：$7C/$05 按偏移读、$7C/$06 按偏移写、$7C/$07-$0C 设置日期、时间、属性及其非法值检查。
//       读的预期来自 FAT12 读取器解析的原样镜像；写与设置类用例保存磁盘镜像后，用读取器核对改动的字节、目录项，其余文件与簇链不变。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：参数单元：偏移 FILE_OFFSET（$6565-$6567）、长度 FILE_SIZE（$6568-$656A）、目的页 FILE_START_PAGE（$656B），日期 $656E/$656F、时间 $6570/$6571、属性 $6572；
//       出错码 $14 是越界、$25 是参数非法、$28 是打开方式不符（见 fcdev 仓库 docs/sb2000/02-系统调用手册.md 4.5、第 6 节）。
//       读写的页用 $7E/$00 分配、$7E/$01 释放，数据在页首（扩展 RAM 偏移 = (页号 - $80) × 4096）。
//       读取步骤的帧数上限是 300：软驱按真实速度传输，打开文件后的第一次读含电机启动约 98 帧，读整个文件（32768 字节）约 130 帧，默认的 120 帧不够。
// ------------------------------------------------------------------------
import { before, byName, saveDisk, untouchedProblems } from '../lib/disk-check.mjs';
import { DOS_ERROR, closeHandle, dosName, le, noError, openStep, resetHandles, stopMotor } from '../lib/fs-steps.mjs';

const FILE_OFFSET = 0x6565;
const FILE_SIZE = 0x6568;
const FILE_START_PAGE = 0x656b;
const FILE_DATE = 0x656e;
const FILE_TIME = 0x6570;
const FILE_ATTR = 0x6572;
const ALLOC_COUNT = 0x65a6;
const ALLOC_START = 0x65a7;

const edit = byName('EDIT    EXE');
const editName = before ? dosName(edit.name83) : '';

/** 分配 pages 页，页号放在 $65A7 */
const allocate = (pages) => ({ func: 0x7e, sub: 0x00, mem: [[ALLOC_COUNT, [pages]]], read: [[ALLOC_START, 1]], expect: noError });

/** 释放第 allocIndex 步分配的 pages 页 */
const release = (allocIndex, pages) => (history) => ({ func: 0x7e, sub: 0x01, mem: [[ALLOC_COUNT, [pages]], [ALLOC_START, [history[allocIndex].memory.get(ALLOC_START)[0]]]], expect: noError });

/** 第 allocIndex 步分配的起始页号对应的扩展 RAM 偏移 */
const pramOffset = (history, allocIndex) => (history[allocIndex].memory.get(ALLOC_START)[0] - 0x80) * 4096;

// ---- 按偏移读 ----

/**
 * 按偏移读的用例：打开 EDIT.EXE（方式 mode），读 [offset, offset+length)，与原样镜像里按簇链读出的内容比较。
 * 步骤编号：0 重置句柄，1 打开，2 分配页，3 读，4 关闭，5 释放页。
 */
const readAt = (id, offset, length, title, { mode = 0, error = 0 } = {}) => {
  const pages = Math.max(1, Math.ceil(length / 4096));
  const content = before.readFile(edit);
  return {
    id,
    title,
    steps: [
      resetHandles,
      openStep(editName, mode),
      allocate(pages),
      (history) => ({
        func: 0x7c,
        sub: 0x05,
        maxFrames: 300,
        mem: [[FILE_OFFSET, le(offset, 3)], [FILE_SIZE, le(length, 3)], [FILE_START_PAGE, [history[2].memory.get(ALLOC_START)[0]]]],
        readPram: error === 0 ? [[pramOffset(history, 2), length]] : undefined,
        expect: [[DOS_ERROR, [error]]],
        check: (result) => {
          if (error !== 0) return [];
          const got = Buffer.from(result.pram.get(pramOffset(history, 2)));
          return got.equals(content.subarray(offset, offset + length)) ? [] : [`读出的 ${length} 字节与镜像里偏移 ${offset} 起的内容不一致`];
        },
      }),
      closeHandle,
      release(2, pages),
    ],
  };
};

const readCases = before
  ? [
      readAt('fs.handle.read-0-1', 0, 1, '$7C/$05 偏移 0 读 1 字节'),
      readAt('fs.handle.read-5-5', 5, 5, '$7C/$05 偏移 5 读 5 字节（不对齐扇区）'),
      readAt('fs.handle.read-sector-cross', 510, 4, '$7C/$05 偏移 510 读 4 字节（跨扇区）'),
      readAt('fs.handle.read-page-cross', 4090, 20, '$7C/$05 偏移 4090 读 20 字节（跨 4096 边界）'),
      readAt('fs.handle.read-page', 0, 4096, '$7C/$05 偏移 0 读 4096 字节（正好一页）'),
      readAt('fs.handle.read-two-pages', 1000, 5000, '$7C/$05 偏移 1000 读 5000 字节（要 2 页）'),
      readAt('fs.handle.read-tail', edit.size - 10, 10, '$7C/$05 读文件最后 10 字节'),
      readAt('fs.handle.read-last-byte', edit.size - 1, 1, '$7C/$05 读文件最后 1 字节'),
      readAt('fs.handle.read-whole', 0, edit.size, `$7C/$05 偏移 0 读整个文件（${edit.size} 字节，${edit.size / 4096} 页）`),
      readAt('fs.handle.read-at-end', edit.size, 1, '$7C/$05 偏移等于文件大小：越界，出错码 $14', { error: 0x14 }),
      readAt('fs.handle.read-over-end', edit.size - 5, 10, '$7C/$05 偏移加长度超过文件大小：出错码 $14', { error: 0x14 }),
      readAt('fs.handle.read-zero-length', 0, 0, '$7C/$05 长度 0：出错码 $25', { error: 0x25 }),
      { id: 'fs.handle.open-mode4-exists', title: '$7B/$09 方式 4 打开已存在的文件：出错码 $2D（方式 4 要求文件不存在），句柄表仍为空', steps: [resetHandles, openStep(editName, 4, [[DOS_ERROR, [0x2d]], [0x643b, [0xff]]])] },
    ]
  : [];

// ---- 按偏移写 ----

/** 要写入的字节：每次不同，且与原内容不会碰巧一样 */
const patchBytes = (seed, length) => Buffer.from(Array.from({ length }, (_, i) => (seed * 37 + i * 11 + 1) & 0xff));

/**
 * 按偏移写的用例：以方式 2 打开 EDIT.EXE，把 patch 写到 offset，关闭后保存镜像，检查内容只在该区段变化。
 * 步骤编号：0 重置句柄，1 打开，2 分配页，3 把数据写进页（主机），4 写，5 关闭，6 释放页，7 停转，8 保存检查。
 */
const writeAt = (id, offset, patch, title) => {
  const pages = Math.max(1, Math.ceil(patch.length / 4096));
  const expected = Buffer.from(before.readFile(edit));
  patch.copy(expected, offset);
  return {
    id,
    title,
    fresh: true,
    freshAfter: true,
    steps: [
      resetHandles,
      openStep(editName, 2),
      allocate(pages),
      {
        host: async (client, history) => {
          const base = pramOffset(history, 2);
          for (let done = 0; done < patch.length; done += 1024) await client.send(`write pram ${(base + done).toString(16)} ${patch.subarray(done, done + 1024).toString('hex')}`);
        },
      },
      (history) => ({
        func: 0x7c,
        sub: 0x06,
        maxFrames: 600,
        mem: [[FILE_OFFSET, le(offset, 3)], [FILE_SIZE, le(patch.length, 3)], [FILE_START_PAGE, [history[2].memory.get(ALLOC_START)[0]]]],
        expect: noError,
      }),
      { ...closeHandle, maxFrames: 300 },
      release(2, pages),
      stopMotor,
      saveDisk((after) => {
        const found = after.listRoot().find((e) => e.name83 === edit.name83);
        if (!found) return ['EDIT.EXE 不见了'];
        const problems = [];
        if (found.size !== edit.size || found.cluster !== edit.cluster) problems.push('大小或起始簇变了');
        const got = after.readFile(found);
        if (!got.equals(expected)) {
          let at = 0;
          while (got[at] === expected[at]) at++;
          problems.push(`内容与预期不一致，首个差异在偏移 ${at}（预期 ${expected[at]}，实际 ${got[at]}）`);
        }
        if (after.freeClusters() !== before.freeClusters()) problems.push(`空闲簇预期 ${before.freeClusters()}，实际 ${after.freeClusters()}`);
        return [...problems, ...untouchedProblems(after, [edit.name83])];
      }),
    ],
  };
};

const writeCases = before
  ? [
      writeAt('fs.handle.write-5-5', 5, patchBytes(1, 5), '$7C/$06 方式 2 偏移 5 写 5 字节：只有这 5 个字节变'),
      writeAt('fs.handle.write-sector-cross', 0x1fe, patchBytes(2, 3), '$7C/$06 偏移 $1FE 写 3 字节（跨扇区）'),
      writeAt('fs.handle.write-page-cross', 4090, patchBytes(3, 20), '$7C/$06 偏移 4090 写 20 字节（跨 4096 边界）'),
      writeAt('fs.handle.write-middle', 20000, patchBytes(4, 1000), '$7C/$06 偏移 20000 写 1000 字节（跨多个扇区）'),
      writeAt('fs.handle.write-two-pages', 1000, patchBytes(5, 5000), '$7C/$06 偏移 1000 写 5000 字节（要 2 页）'),
      writeAt('fs.handle.write-tail', edit.size - 3, patchBytes(6, 3), '$7C/$06 写文件最后 3 字节'),
      writeAt('fs.handle.write-whole', 0, patchBytes(7, edit.size), `$7C/$06 偏移 0 写整个文件（${edit.size} 字节）：内容全部替换，大小与簇链不变`),
    ]
  : [];

// ---- 设置日期、时间、属性 ----

/** 以方式 2 打开 EDIT.EXE，依次执行 calls（设置调用），关闭并保存镜像，用 check 检查目录项 */
const setCase = (id, title, calls, check) => ({
  id,
  title,
  fresh: true,
  freshAfter: true,
  steps: [resetHandles, openStep(editName, 2), ...calls, { ...closeHandle, maxFrames: 300 }, stopMotor, saveDisk((after) => check(after.listRoot().find((e) => e.name83 === edit.name83), after))],
});

/** FAT 日期字：年（相对 1980）、月、日 */
const dateWord = (year, month, day) => ((year - 1980) << 9) | (month << 5) | day;
/** FAT 时间字：时、分、秒（秒取一半） */
const timeWord = (hour, minute, second) => (hour << 11) | (minute << 5) | (second >> 1);

const GOOD_DATE = dateWord(2002, 6, 15);
const GOOD_TIME = timeWord(13, 45, 30);

const setCases = before
  ? [
      setCase(
        'fs.handle.set-date-time-attr',
        '$7C/$07、$09、$0B 设置日期 2002-06-15、时间 13:45:30、属性 $21 后关闭：目录项里的日期、时间、属性与设置的一致，大小与起始簇不变',
        [
          { func: 0x7c, sub: 0x07, mem: [[FILE_DATE, le(GOOD_DATE, 2)]], expect: noError },
          { func: 0x7c, sub: 0x09, mem: [[FILE_TIME, le(GOOD_TIME, 2)]], expect: noError },
          { func: 0x7c, sub: 0x0b, mem: [[FILE_ATTR, [0x21]]], expect: noError },
        ],
        (entry, after) => {
          if (!entry) return ['EDIT.EXE 不见了'];
          const problems = [];
          if (entry.date !== GOOD_DATE) problems.push(`日期预期 $${GOOD_DATE.toString(16)}，实际 $${entry.date.toString(16)}`);
          if (entry.time !== GOOD_TIME) problems.push(`时间预期 $${GOOD_TIME.toString(16)}，实际 $${entry.time.toString(16)}`);
          if (entry.attr !== 0x21) problems.push(`属性预期 $21，实际 $${entry.attr.toString(16)}`);
          if (entry.size !== edit.size || entry.cluster !== edit.cluster) problems.push('大小或起始簇变了');
          return [...problems, ...untouchedProblems(after, [edit.name83])];
        },
      ),
      ...[
        ['fs.handle.bad-date-month', '月份 13', 0x07, FILE_DATE, le(dateWord(2002, 13, 1), 2)],
        ['fs.handle.bad-date-day', '日 0', 0x07, FILE_DATE, le(dateWord(2002, 6, 0), 2)],
        ['fs.handle.bad-time-hour', '小时 24', 0x09, FILE_TIME, le(timeWord(24, 0, 0), 2)],
        ['fs.handle.bad-time-minute', '分钟 60', 0x09, FILE_TIME, le(timeWord(1, 60, 0), 2)],
        ['fs.handle.bad-attr-label', '属性带卷标位 $08', 0x0b, FILE_ATTR, [0x08]],
        ['fs.handle.bad-attr-high', '属性 $40（大于 $3F）', 0x0b, FILE_ATTR, [0x40]],
      ].map(([id, what, sub, address, bytes]) =>
        setCase(
          id,
          `$7C/$${sub.toString(16).padStart(2, '0').toUpperCase()} 设置非法值（${what}）：出错码 $25，目录项不变`,
          [{ func: 0x7c, sub, mem: [[address, bytes]], expect: [[DOS_ERROR, [0x25]]] }],
          (entry, after) => {
            const problems = [];
            if (!entry || entry.date !== edit.date || entry.time !== edit.time || entry.attr !== edit.attr) problems.push('目录项的日期、时间或属性被改了');
            return [...problems, ...untouchedProblems(after)];
          },
        ),
      ),
    ]
  : [];

export const cases = [...readCases, ...writeCases, ...setCases];
