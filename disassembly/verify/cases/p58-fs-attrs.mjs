// ------------------------------------------------------------------------
// 名称：p58-fs-attrs.mjs
// 说明：句柄的日期、时间、属性服务的验证用例：$7C/$08、$7C/$0A、$7C/$0C 取值，$7C/$07、$7C/$09、$7C/$0B 先校验再设置（含合法性扫描），方式 2 关闭时写回目录项，只读文件的删除与覆盖，卷标同名文件。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值来自 FAT 日期时间格式规范与镜像的解析：日期位 0-4 日、5-8 月、9-15 年（自 1980），时间位 0-4 秒的一半、5-10 分、11-15 时；
//       合法范围取 DOS 惯例：年不超过 2099、月 1-12、日不超过当月天数（闰年按年份能被 4 整除）、秒的一半不超过 29、分不超过 59、时不超过 23；属性不超过 $3F 且不带卷标位 $08。
//       设置类子功能直接按 FILE_HANDLE_OFFSET 访问句柄表，不检查句柄是否打开，所以扫描用例改写句柄表的字节后还原。
// ------------------------------------------------------------------------
import { runCall } from '../../tools/rom-driver.mjs';
import { before, byName, originals, saveDisk, untouchedProblems } from '../lib/disk-check.mjs';
import { DOS_ERROR, HANDLE_TABLE, PATH_BUFFER, ascii, closeHandle, dosName, noError, openStep, resetHandles, stopMotor } from '../lib/fs-steps.mjs';
import { withRestore } from '../lib/restore.mjs';

const FILE_HANDLE_OFFSET = 0x6561;
const INPUT = 0x656e; // FILE_DATE_LO 起：日期 2 字节、时间 2 字节、属性 1 字节
const GUARD = 0x6301; // 校验例程借用的三个临时单元，调用后应保持原值
const REGION = 0x0d; // 句柄里属性所在的偏移，之后依次是大小 3 字节、日期 2 字节、时间 2 字节
const HANDLE_OFFSETS = [0x00, 0x2c, 0x58, 0x84];
const SENTINEL_REGION = [0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8];
const SENTINEL_INPUT = [0x11, 0x22, 0x33, 0x44, 0x55];
const RANGES = [[FILE_HANDLE_OFFSET, 1], [INPUT, 5], [GUARD, 3], [HANDLE_TABLE, 0xb0], [DOS_ERROR, 1]];

const hex = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const le16 = (value) => [value & 0xff, value >> 8];

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const dateValid = (year, month, day) => year <= 119 && month >= 1 && month <= 12 && day >= 1 && day <= (month === 2 ? (year % 4 === 0 ? 29 : 28) : DAYS[month - 1]);
const timeValid = (second, minute, hour) => second <= 29 && minute <= 59 && hour <= 23;
const encodeDate = (year, month, day) => (year << 9) | (month << 5) | day;
const encodeTime = (hour, minute, second) => (hour << 11) | (minute << 5) | second;

/**
 * 设置类扫描用例：对每个值调用一次设置，核对句柄里只有目标字段变化、输入单元与校验用的临时单元不变、出错码正确。
 * @param {object} spec 子功能号 sub、输入在 INPUT 中的位置 inputAt、字段在句柄区域中的位置 fieldAt、字节数 length，values 是 {bytes, label, ok} 的列表
 */
const sweepCase = ({ id, title, sub, inputAt, fieldAt, values }) => ({
  id,
  title,
  steps: [{
    host: (client) => withRestore(client, RANGES, async () => {
      const problems = [];
      for (const [index, value] of values.entries()) {
        const offset = HANDLE_OFFSETS[index % 4];
        const input = [...SENTINEL_INPUT];
        input.splice(inputAt, value.bytes.length, ...value.bytes);
        const result = await runCall(client, {
          func: 0x7c,
          sub,
          mem: [[FILE_HANDLE_OFFSET, [offset]], [INPUT, input], [GUARD, [0x11, 0x22, 0x33]], [HANDLE_TABLE + offset + REGION, SENTINEL_REGION], [DOS_ERROR, [0x5a]]],
          read: [[HANDLE_TABLE + offset + REGION, 8], [INPUT, 5], [GUARD, 3], [DOS_ERROR, 1]],
          maxFrames: 80,
        });
        if (!result.done) { problems.push(`${value.label}：调用没有返回`); break; }
        const region = [...result.memory.get(HANDLE_TABLE + offset + REGION)];
        const wantRegion = [...SENTINEL_REGION];
        if (value.ok) wantRegion.splice(fieldAt, value.bytes.length, ...value.bytes);
        const error = result.memory.get(DOS_ERROR)[0];
        const wantError = value.ok ? 0 : 0x25;
        if (error !== wantError) problems.push(`${value.label}：出错码 $${hex(error)}，预期 $${hex(wantError)}`);
        if (region.join() !== wantRegion.join()) problems.push(`${value.label}（句柄偏移 $${hex(offset)}）：句柄字段 ${region.map(hex).join(' ')}，预期 ${wantRegion.map(hex).join(' ')}`);
        if ([...result.memory.get(INPUT)].join() !== input.join()) problems.push(`${value.label}：输入单元被改写`);
        if ([...result.memory.get(GUARD)].join() !== [0x11, 0x22, 0x33].join()) problems.push(`${value.label}：$6301-$6303 没有还原`);
        if (problems.length >= 10) break;
      }
      return problems;
    }),
    check: ({ data }) => data,
  }],
});

const cases = [];

// ---- 设置日期：年 × 月 × 日 ----
for (const year of [0, 1, 2, 3, 4, 20, 119, 120, 127]) {
  const values = [];
  for (let month = 0; month <= 15; month++) {
    for (const day of [0, 1, 28, 29, 30, 31]) {
      values.push({ bytes: le16(encodeDate(year, month, day)), label: `${1980 + year} 年 ${month} 月 ${day} 日`, ok: dateValid(year, month, day) });
    }
  }
  cases.push(sweepCase({ id: `fs.attr.set-date-y${year}`, title: `$7C/$07 设置日期：${1980 + year} 年的各月（0-15）与 0、1、28-31 日，合法才写入句柄，非法出错码 $25`, sub: 0x07, inputAt: 0, fieldAt: 4, values }));
}

// ---- 设置时间：每个字段单独扫描，再取边界值组合 ----
{
  const values = [];
  for (let second = 0; second <= 31; second++) values.push({ bytes: le16(encodeTime(9, 17, second)), label: `9:17:${second * 2}（秒字段 ${second}）`, ok: timeValid(second, 17, 9) });
  for (let minute = 0; minute <= 63; minute++) values.push({ bytes: le16(encodeTime(9, minute, 1)), label: `9:${minute}:02`, ok: timeValid(1, minute, 9) });
  for (let hour = 0; hour <= 31; hour++) values.push({ bytes: le16(encodeTime(hour, 17, 1)), label: `${hour}:17:02`, ok: timeValid(1, 17, hour) });
  for (const hour of [0, 1, 12, 23, 24, 31]) {
    for (const minute of [0, 1, 30, 59, 60, 63]) {
      for (const second of [0, 1, 28, 29, 30, 31]) values.push({ bytes: le16(encodeTime(hour, minute, second)), label: `${hour}:${minute}:${second * 2}（秒字段 ${second}）`, ok: timeValid(second, minute, hour) });
    }
  }
  cases.push(sweepCase({ id: 'fs.attr.set-time', title: '$7C/$09 设置时间：秒、分、时各自扫描全部取值，再取边界值组合，合法才写入句柄，非法出错码 $25', sub: 0x09, inputAt: 2, fieldAt: 6, values }));
}

// ---- 设置属性：0-255 全部 ----
cases.push(sweepCase({
  id: 'fs.attr.set-attr',
  title: '$7C/$0B 设置属性：$00-$FF 全部取值，不超过 $3F 且不带卷标位 $08 才写入句柄，否则出错码 $25',
  sub: 0x0b,
  inputAt: 4,
  fieldAt: 0,
  values: Array.from({ length: 256 }, (_, attr) => ({ bytes: [attr], label: `属性 $${hex(attr)}`, ok: attr <= 0x3f && (attr & 0x08) === 0 })),
}));

// ---- 取日期、时间、属性：四个句柄，各字段互不串扰 ----
cases.push({
  id: 'fs.attr.get-handles',
  title: '$7C/$08、$7C/$0A、$7C/$0C 从四个句柄取日期、时间、属性：只写目标输入单元，句柄内容不变',
  steps: [{
    host: (client) => withRestore(client, RANGES, async () => {
      const problems = [];
      for (const [handle, offset] of HANDLE_OFFSETS.entries()) {
        const region = SENTINEL_REGION.map((value) => value + handle * 8);
        for (const [sub, inputAt, length, fieldAt] of [[0x08, 0, 2, 4], [0x0a, 2, 2, 6], [0x0c, 4, 1, 0]]) {
          const result = await runCall(client, {
            func: 0x7c,
            sub,
            mem: [[FILE_HANDLE_OFFSET, [offset]], [INPUT, SENTINEL_INPUT], [HANDLE_TABLE + offset + REGION, region], [DOS_ERROR, [0x5a]]],
            read: [[HANDLE_TABLE + offset + REGION, 8], [INPUT, 5], [DOS_ERROR, 1]],
            maxFrames: 80,
          });
          if (!result.done) { problems.push(`句柄 ${handle} 的 $7C/$${hex(sub)}：调用没有返回`); continue; }
          const want = [...SENTINEL_INPUT];
          want.splice(inputAt, length, ...region.slice(fieldAt, fieldAt + length));
          if ([...result.memory.get(INPUT)].join() !== want.join()) problems.push(`句柄 ${handle} 的 $7C/$${hex(sub)}：输入单元 ${[...result.memory.get(INPUT)].map(hex).join(' ')}，预期 ${want.map(hex).join(' ')}`);
          if ([...result.memory.get(HANDLE_TABLE + offset + REGION)].join() !== region.join()) problems.push(`句柄 ${handle} 的 $7C/$${hex(sub)}：句柄内容被改写`);
          if (result.memory.get(DOS_ERROR)[0] !== 0) problems.push(`句柄 ${handle} 的 $7C/$${hex(sub)}：出错码不为 0`);
        }
      }
      return problems;
    }),
    check: ({ data }) => data,
  }],
});

if (before) {
  // ---- 打开真实文件后取日期、时间、属性，与目录项一致 ----
  for (const entry of originals.filter((item) => (item.attr & 0x10) === 0)) {
    const name = dosName(entry.name83);
    cases.push({
      id: `fs.attr.get-${entry.name83.trim().replace(/\s+/g, '.').toLowerCase()}`,
      title: `打开 ${name}（方式 0）后 $7C/$08、$7C/$0A、$7C/$0C 取到目录项里的日期 ${entry.date}、时间 ${entry.time}、属性 $${hex(entry.attr)}`,
      steps: [
        resetHandles,
        openStep(name, 0),
        { func: 0x7c, sub: 0x08, mem: [[INPUT, [0xaa, 0xaa]]], expect: [[DOS_ERROR, [0]], [INPUT, le16(entry.date)]] },
        { func: 0x7c, sub: 0x0a, mem: [[INPUT + 2, [0xaa, 0xaa]]], expect: [[DOS_ERROR, [0]], [INPUT + 2, le16(entry.time)]] },
        { func: 0x7c, sub: 0x0c, mem: [[INPUT + 4, [0xaa]]], expect: [[DOS_ERROR, [0]], [INPUT + 4, [entry.attr]]] },
        closeHandle,
      ],
    });
  }

  // ---- 方式 2 打开后设置，关闭时写回目录项 ----
  const hello = byName('HELLO   TXT');
  const newDate = encodeDate(46, 11, 9);
  const newTime = encodeTime(13, 45, 15);
  const setStep = (sub, at, bytes, error = 0) => ({ func: 0x7c, sub, mem: [[at, bytes]], expect: [[DOS_ERROR, [error]]] });
  const helloEntry = (after) => after.listRoot().find((item) => item.name83 === 'HELLO   TXT');
  const sameContent = (after) => (after.readFile(helloEntry(after)).equals(before.readFile(hello)) ? [] : ['HELLO.TXT 内容变了']);

  cases.push({
    id: 'fs.attr.write-back',
    title: '方式 2 打开 HELLO.TXT，设置日期 2026-11-09、时间 13:45:30、属性 $27，关闭后目录项里的日期、时间、属性已更新，大小、起始簇与内容不变',
    fresh: true,
    freshAfter: true,
    steps: [
      resetHandles,
      openStep('HELLO.TXT', 2),
      setStep(0x07, INPUT, le16(newDate)),
      setStep(0x09, INPUT + 2, le16(newTime)),
      setStep(0x0b, INPUT + 4, [0x27]),
      { ...closeHandle, maxFrames: 900 },
      stopMotor,
      saveDisk((after) => {
        const entry = helloEntry(after);
        if (!entry) return ['没有找到 HELLO.TXT'];
        const problems = [];
        if (entry.date !== newDate) problems.push(`日期 ${entry.date}，预期 ${newDate}`);
        if (entry.time !== newTime) problems.push(`时间 ${entry.time}，预期 ${newTime}`);
        if (entry.attr !== 0x27) problems.push(`属性 $${hex(entry.attr)}，预期 $27`);
        if (entry.size !== hello.size || entry.cluster !== hello.cluster) problems.push('大小或起始簇变了');
        return [...problems, ...sameContent(after), ...untouchedProblems(after, ['HELLO   TXT'])];
      }),
    ],
  });

  cases.push({
    id: 'fs.attr.invalid-keeps',
    title: '方式 2 打开后设置非法日期（13 月）、时间（24 时）、属性（$08、$40）都出错码 $25，关闭后目录项的日期、时间、属性仍是原值',
    fresh: true,
    freshAfter: true,
    steps: [
      resetHandles,
      openStep('HELLO.TXT', 2),
      setStep(0x07, INPUT, le16(encodeDate(46, 13, 9)), 0x25),
      setStep(0x09, INPUT + 2, le16(encodeTime(24, 0, 0)), 0x25),
      setStep(0x0b, INPUT + 4, [0x08], 0x25),
      setStep(0x0b, INPUT + 4, [0x40], 0x25),
      { ...closeHandle, maxFrames: 900 },
      stopMotor,
      saveDisk((after) => {
        const entry = helloEntry(after);
        if (!entry) return ['没有找到 HELLO.TXT'];
        const problems = [];
        if (entry.date !== hello.date || entry.time !== hello.time || entry.attr !== hello.attr) problems.push(`日期 ${entry.date}、时间 ${entry.time}、属性 $${hex(entry.attr)} 变了`);
        return [...problems, ...untouchedProblems(after)];
      }),
    ],
  });

  cases.push({
    id: 'fs.attr.mode0-no-write-back',
    title: '方式 0 打开后设置日期、时间、属性再关闭：不写回目录项，磁盘上 HELLO.TXT 不变',
    fresh: true,
    freshAfter: true,
    steps: [
      resetHandles,
      openStep('HELLO.TXT', 0),
      setStep(0x07, INPUT, le16(newDate)),
      setStep(0x09, INPUT + 2, le16(newTime)),
      setStep(0x0b, INPUT + 4, [0x27]),
      closeHandle,
      stopMotor,
      saveDisk((after) => {
        const entry = helloEntry(after);
        if (!entry) return ['没有找到 HELLO.TXT'];
        const problems = [];
        if (entry.date !== hello.date || entry.time !== hello.time || entry.attr !== hello.attr) problems.push(`日期 ${entry.date}、时间 ${entry.time}、属性 $${hex(entry.attr)} 变了`);
        return [...problems, ...untouchedProblems(after)];
      }),
    ],
  });

  // ---- 只读文件 ----
  const makeReadOnly = [resetHandles, openStep('HELLO.TXT', 2), setStep(0x0b, INPUT + 4, [0x21]), { ...closeHandle, maxFrames: 900 }];
  cases.push({
    id: 'fs.attr.readonly-delete',
    title: '把 HELLO.TXT 设为只读（属性 $21）后用 $7C/$03 删除：出错码 5，文件、簇链、其余文件都不变',
    fresh: true,
    freshAfter: true,
    steps: [
      ...makeReadOnly,
      { func: 0x7c, sub: 0x03, maxFrames: 900, mem: [[PATH_BUFFER, [...ascii('HELLO.TXT'), 0]]], expect: [[DOS_ERROR, [5]]] },
      resetHandles,
      stopMotor,
      saveDisk((after) => {
        const entry = helloEntry(after);
        if (!entry) return ['HELLO.TXT 被删除了'];
        const problems = [];
        if (entry.attr !== 0x21) problems.push(`属性 $${hex(entry.attr)}，预期 $21`);
        if (entry.cluster !== hello.cluster || entry.size !== hello.size) problems.push('大小或起始簇变了');
        if (after.freeClusters() !== before.freeClusters()) problems.push('空闲簇数变了');
        return [...problems, ...sameContent(after), ...untouchedProblems(after, ['HELLO   TXT'])];
      }),
    ],
  });

  cases.push({
    id: 'fs.attr.readonly-delete-mode3',
    title: '把 HELLO.TXT 设为只读后以方式 3 打开（$7B/$09）：出错码 5，文件不变',
    fresh: true,
    freshAfter: true,
    steps: [
      ...makeReadOnly,
      openStep('HELLO.TXT', 3, [[DOS_ERROR, [5]]]),
      resetHandles,
      stopMotor,
      saveDisk((after) => {
        const entry = helloEntry(after);
        return entry && entry.attr === 0x21 && entry.cluster === hello.cluster ? untouchedProblems(after, ['HELLO   TXT']) : ['HELLO.TXT 变了或被删除'];
      }),
    ],
  });

  cases.push({
    id: 'fs.attr.readonly-overwrite',
    title: '把 HELLO.TXT 设为只读后以方式 1 打开再关闭：不检查只读，文件被覆盖成空文件，属性恢复为 $20，簇链重新分配且没有泄漏',
    fresh: true,
    freshAfter: true,
    steps: [
      ...makeReadOnly,
      { ...openStep('HELLO.TXT', 1), maxFrames: 1200 },
      { ...closeHandle, maxFrames: 900 },
      stopMotor,
      saveDisk((after) => {
        const entry = helloEntry(after);
        if (!entry) return ['没有找到 HELLO.TXT'];
        const problems = [];
        if (entry.attr !== 0x20 || entry.size !== 0) problems.push(`属性 $${hex(entry.attr)}、大小 ${entry.size}，预期 $20、0`);
        if (after.chain(entry.cluster).length !== 1) problems.push('簇链长度不是 1');
        if (after.freeClusters() !== before.freeClusters()) problems.push(`空闲簇预期 ${before.freeClusters()}，实际 ${after.freeClusters()}`);
        return [...problems, ...untouchedProblems(after, ['HELLO   TXT'])];
      }),
    ],
  });

  // ---- 与卷标同名的文件名 ----
  for (const mode of [0, 1, 2, 3]) {
    cases.push({
      id: `fs.attr.label-name-mode${mode}`,
      title: `以方式 ${mode} 打开与卷标同名的 SB2KDISK：目录里匹配到卷标项，出错码 5，磁盘不变`,
      fresh: true,
      freshAfter: true,
      steps: [
        resetHandles,
        openStep('SB2KDISK', mode, [[DOS_ERROR, [5]]]),
        resetHandles,
        stopMotor,
        saveDisk((after) => untouchedProblems(after)),
      ],
    });
  }
}

export { cases };
