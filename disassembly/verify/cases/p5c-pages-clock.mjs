// ------------------------------------------------------------------------
// 名称：p5c-pages-clock.mjs
// 说明：页组 $5C 的内存页服务（功能 $7E 子功能 0-2）、日期时间服务（功能 $7F 子功能 1-4）与各功能子功能号越界、功能 $81 的验证用例。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值来自 verify/lib/p5c-model.mjs（按 bios/src/system-services/ 转录）：$7E 核对 32 字节位图、ALLOC_COUNT、ALLOC_START、DOS_ERROR 与 $6308-$630B 四个临时单元；
//       $7F 核对 FILE_DATE/TIME、系统时钟 $068A-$068D、系统日期 ERAM $6305-$6307 与校验用的临时单元 $6301-$6303（应当原样保留）。
//       每个用例先备份被改写的内存，调用后还原，不影响后面的用例。$7F/$00（运行程序）另见 p5c-exec.mjs。
// ------------------------------------------------------------------------
import { runCall } from '../../tools/rom-driver.mjs';
import { ClockModel, PageModel } from '../lib/p5c-model.mjs';
import { noise, withRestore } from '../lib/restore.mjs';

const DOS_ERROR = 0x6300;
const BITMAP = 0x6586;
const COUNT = 0x65a6;
const START = 0x65a7;
const TEMPS = 0x6308;
const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');

// ---- 内存页服务 ----
const pageCase = (id, title, sub, bitmap, { count, start = 0 }) => {
  const temps = [0x11, 0x22, 0x33, 0x44];
  const model = new PageModel(bitmap, { count, start, temp: temps });
  [model.alloc, model.free, model.largest][sub].call(model);
  const compare = (result) => {
    const problems = [];
    if (!result.done) return ['调用没有返回'];
    const got = result.memory.get(BITMAP);
    for (let i = 0; i < 32; i++) if (got[i] !== model.bitmap[i]) problems.push(`位图第 ${i} 字节为 ${hexName(got[i])}，预期 ${hexName(model.bitmap[i])}`);
    const scalars = [[COUNT, model.count, '$65A6 ALLOC_COUNT'], [START, model.start, '$65A7 ALLOC_START'], [DOS_ERROR, model.error, 'DOS_ERROR']];
    for (const [address, expected, name] of scalars) {
      const value = result.memory.get(address)[0];
      if (value !== expected) problems.push(`${name} 为 ${hexName(value)}，预期 ${hexName(expected)}`);
    }
    const tempsGot = result.memory.get(TEMPS);
    [model.libGroup, model.t9, model.tA, model.tB].forEach((expected, i) => {
      if (tempsGot[i] !== expected) problems.push(`$${(TEMPS + i).toString(16).toUpperCase()} 为 ${hexName(tempsGot[i])}，预期 ${hexName(expected)}`);
    });
    return problems.slice(0, 10);
  };
  return {
    id: `p5c.page.${id}`,
    title: `$7E/$${hexName(sub)} ${title}`,
    steps: [{
      host: (client) => withRestore(client, [[BITMAP, 32], [COUNT, 2], [DOS_ERROR, 1], [TEMPS, 4]], () => runCall(client, {
        func: 0x7e,
        sub,
        mem: [[BITMAP, bitmap], [COUNT, [count, start]], [DOS_ERROR, [0x5a]], [TEMPS, temps]],
        read: [[BITMAP, 32], [COUNT, 1], [START, 1], [DOS_ERROR, 1], [TEMPS, 4]],
        maxFrames: 60,
      })),
      check: ({ data }) => compare(data),
    }],
  };
};

const bitmapOf = (fn) => Array.from({ length: 32 }, (_, byte) => Array.from({ length: 8 }, (_, bit) => (fn(byte * 8 + bit) ? 1 << (7 - bit) : 0)).reduce((a, b) => a | b, 0));
const realistic = bitmapOf((page) => page >= 0x80 && page < 0xf0);
const cases = [];

for (const count of [0, 1, 3, 7, 8, 9, 15, 16, 17, 40, 100, 112, 113]) {
  cases.push(pageCase(`alloc-real-${count}`, `位图只有页 $80-$EF 空闲，申请 ${count} 页`, 0, realistic, { count, start: 0x55 }));
}
cases.push(pageCase('alloc-none', '没有空闲页，申请 1 页：出错码 8，起始页号清 0', 0, bitmapOf(() => false), { count: 1, start: 0x55 }));
cases.push(pageCase('alloc-none-zero', '没有空闲页，申请 0 页：同样出错码 8', 0, bitmapOf(() => false), { count: 0, start: 0x55 }));
cases.push(pageCase('alloc-all-1', '全部空闲，申请 1 页', 0, bitmapOf(() => true), { count: 1 }));
cases.push(pageCase('alloc-all-255', '全部空闲，申请 255 页', 0, bitmapOf(() => true), { count: 255 }));
cases.push(pageCase('alloc-zero-count', '申请 0 页：返回第一个空闲页号，位图不变', 0, realistic, { count: 0, start: 0x55 }));
cases.push(pageCase('alloc-last', '只有最后一页空闲，申请 1 页', 0, bitmapOf((page) => page === 255), { count: 1 }));
cases.push(pageCase('alloc-first', '只有第一页空闲，申请 1 页', 0, bitmapOf((page) => page === 0), { count: 1 }));
cases.push(pageCase('alloc-span-byte', '空闲页跨字节边界（页 $0D-$14），申请 8 页', 0, bitmapOf((page) => page >= 13 && page <= 20), { count: 8 }));
cases.push(pageCase('alloc-skip-short-run', '前面有长度 3 的空闲段，申请 5 页：跳到后面的空闲段', 0, bitmapOf((page) => (page >= 10 && page < 13) || (page >= 100 && page < 110)), { count: 5 }));
cases.push(pageCase('alloc-run-ends-bitmap', '空闲段到位图末尾刚好够用', 0, bitmapOf((page) => page >= 250), { count: 6 }));
cases.push(pageCase('alloc-run-too-short-end', '位图末尾的空闲段差 1 页不够', 0, bitmapOf((page) => page >= 251), { count: 6 }));
for (let seed = 1; seed <= 24; seed++) {
  const bits = noise(seed, 32);
  const dense = bits.map((byte, i) => (seed % 3 === 0 ? byte | noise(seed + 50, 32)[i] : byte));
  cases.push(pageCase(`alloc-random-${seed}`, `随机位图 ${seed}，申请 ${1 + (seed % 12)} 页`, 0, dense, { count: 1 + (seed % 12), start: seed }));
}

// 释放
const freeStarts = [[0x80, 1], [0x80, 8], [0x83, 5], [0x87, 9], [0x90, 16], [0xa5, 20], [0xe8, 8], [0xef, 1], [0xf0 - 17, 17], [0x80, 0], [0xb9, 3], [0xbf, 2], [0xc0, 64]];
for (const [start, count] of freeStarts) {
  cases.push(pageCase(`free-${hexName(start)}-${count}`, `释放页 $${hexName(start)} 起 ${count} 页`, 1, noise(start + count, 32).map((byte) => byte & 0x55), { count, start }));
}
for (const start of [0x00, 0x20, 0x7f, 0xf0, 0xf1, 0xff]) {
  cases.push(pageCase(`free-bad-${hexName(start)}`, `起始页号 $${hexName(start)} 不在 $80-$EF 之内：出错码 9，位图不变`, 1, noise(start + 3, 32), { count: 4, start }));
}

// 最长连续空闲页
cases.push(pageCase('largest-real', '页 $80-$EF 空闲：最长连续 112 页', 2, realistic, { count: 0x77 }));
cases.push(pageCase('largest-none', '没有空闲页：0', 2, bitmapOf(() => false), { count: 0x77 }));
cases.push(pageCase('largest-all', '全部空闲：256 取低 8 位为 0', 2, bitmapOf(() => true), { count: 0x77 }));
cases.push(pageCase('largest-all-but-one', '除页 $7F 外全部空闲：最长 128 页', 2, bitmapOf((page) => page !== 0x7f), { count: 0x77 }));
cases.push(pageCase('largest-end-run', '位图末尾的空闲段最长', 2, bitmapOf((page) => page >= 200 || (page > 10 && page < 20)), { count: 0 }));
for (let seed = 1; seed <= 16; seed++) cases.push(pageCase(`largest-random-${seed}`, `随机位图 ${seed}`, 2, noise(seed * 3, 32).map((byte, i) => (seed % 2 ? byte | noise(seed, 32)[i] : byte)), { count: 0x77 }));

// ---- 日期时间 ----
const CLOCK_RANGES = [[0x689, 5], [0x6301, 7], [0x656e, 4], [DOS_ERROR, 1]];

const clockCase = (id, title, sub, setup) => {
  const state = { seconds: 0, minutes: 0, hours: 0, dayCarry: 0, day: 1, month: 1, year: 0, fileDate: 0x1234, fileTime: 0x5678, ...setup };
  const temps = [0x61, 0x62, 0x63];
  const model = new ClockModel({ ...state, temp: temps });
  [null, model.setDate, model.getDate, model.setTime, model.getTime][sub].call(model);
  const mem = [
    [0x689, [0, state.seconds, state.minutes, state.hours, state.dayCarry]],
    [0x6301, temps],
    [0x6305, [state.day, state.month, state.year]],
    [0x656e, [state.fileDate & 0xff, state.fileDate >> 8, state.fileTime & 0xff, state.fileTime >> 8]],
    [DOS_ERROR, [0x5a]],
  ];
  return {
    id: `p5c.clock.${id}`,
    title: `$7F/$${hexName(sub)} ${title}`,
    steps: [{
      host: (client) => withRestore(client, CLOCK_RANGES, () => runCall(client, {
        func: 0x7f,
        sub,
        mem,
        read: [[0x68a, 4], [0x6301, 7], [0x656e, 4], [DOS_ERROR, 1]],
        maxFrames: 60,
      })),
      check: ({ data: result }) => {
        if (!result.done) return ['调用没有返回'];
        const problems = [];
        const clock = result.memory.get(0x68a);
        const system = result.memory.get(0x6301);
        const file = result.memory.get(0x656e);
        const expected = [
          [clock[0], model.seconds, '$068A 秒'], [clock[1], model.minutes, '$068B 分'], [clock[2], model.hours, '$068C 时'], [clock[3], model.dayCarry, '$068D 过午夜标志'],
          [system[0], temps[0], '$6301'], [system[1], temps[1], '$6302'], [system[2], temps[2], '$6303'],
          [system[4], model.day, '$6305 日'], [system[5], model.month, '$6306 月'], [system[6], model.year, '$6307 年'],
          [file[0], model.fileDate & 0xff, 'FILE_DATE_LO'], [file[1], model.fileDate >> 8, 'FILE_DATE_HI'], [file[2], model.fileTime & 0xff, 'FILE_TIME_LO'], [file[3], model.fileTime >> 8, 'FILE_TIME_HI'],
          [result.memory.get(DOS_ERROR)[0], sub === 1 || sub === 3 ? model.error : 0, 'DOS_ERROR'],
        ];
        for (const [got, want, name] of expected) if (got !== want) problems.push(`${name} 为 ${hexName(got)}，预期 ${hexName(want)}`);
        return problems;
      },
    }],
  };
};

const fatTime = (hours, minutes, halfSeconds) => (hours << 11) | (minutes << 5) | halfSeconds;
const fatDate = (year, month, day) => (year << 9) | (month << 5) | day;

for (const [hours, minutes, seconds] of [[0, 0, 0], [23, 59, 58], [12, 30, 31], [1, 2, 3], [9, 7, 59], [16, 8, 1], [5, 63 - 4, 20]]) {
  cases.push(clockCase(`get-time-${hours}-${minutes}-${seconds}`, `取系统时间 ${hours}:${minutes}:${seconds}`, 4, { hours, minutes, seconds }));
}
for (const [hours, minutes, halfSeconds, valid] of [[0, 0, 0, true], [23, 59, 29, true], [12, 30, 15, true], [24, 0, 0, false], [31, 0, 0, false], [23, 60, 0, false], [0, 63, 0, false], [0, 0, 30, false], [0, 0, 31, false], [8, 45, 7, true]]) {
  cases.push(clockCase(`set-time-${hours}-${minutes}-${halfSeconds}`, `设置系统时间 ${hours}:${minutes}:${halfSeconds * 2}（${valid ? '合法' : '非法，出错码 $25'}）`, 3, { fileTime: fatTime(hours, minutes, halfSeconds), hours: 3, minutes: 4, seconds: 5 }));
}
for (const [year, month, day] of [[0, 1, 1], [18, 11, 9], [119, 12, 31], [20, 2, 29], [44, 2, 29], [6, 7, 31], [37, 9, 30]]) {
  cases.push(clockCase(`get-date-${year}-${month}-${day}`, `取系统日期 ${1980 + year}-${month}-${day}（不跨日）`, 2, { year, month, day }));
}
for (const [year, month, day, label] of [[18, 1, 31, '1 月 31 日 → 2 月 1 日'], [17, 2, 28, '平年 2 月 28 日 → 3 月 1 日'], [16, 2, 28, '闰年 2 月 28 日 → 2 月 29 日'], [16, 2, 29, '闰年 2 月 29 日 → 3 月 1 日'], [18, 4, 30, '4 月 30 日 → 5 月 1 日'], [18, 12, 31, '12 月 31 日 → 次年 1 月 1 日'], [0x77, 12, 31, '年号到上限 $77 的 12 月 31 日 → 年号保持 $77、1 月 1 日'], [18, 7, 14, '7 月 14 日 → 15 日'], [20, 2, 29, '2000 年 2 月 29 日 → 3 月 1 日（年号 20，能被 4 整除）']]) {
  cases.push(clockCase(`carry-${year}-${month}-${day}`, `过午夜进位：${label}`, 2, { year, month, day, dayCarry: 1 }));
}
for (const [year, month, day, valid, label] of [
  [0, 1, 1, true, '1980-1-1'], [0x77, 12, 31, true, '年号上限 $77'], [0x78, 1, 1, false, '年号 $78'], [18, 0, 5, false, '月 0'], [18, 13, 5, false, '月 13'], [18, 15, 5, false, '月 15'],
  [18, 1, 0, false, '日 0'], [18, 1, 31, true, '1 月 31 日'], [18, 4, 31, false, '4 月 31 日'], [18, 4, 30, true, '4 月 30 日'],
  [17, 2, 29, false, '平年 2 月 29 日'], [16, 2, 29, true, '闰年 2 月 29 日'], [17, 2, 28, true, '平年 2 月 28 日'], [16, 2, 30, false, '闰年 2 月 30 日'], [18, 12, 31, true, '12 月 31 日'], [18, 9, 31, false, '9 月 31 日'],
]) {
  cases.push(clockCase(`set-date-${year}-${month}-${day}`, `设置系统日期 ${label}（${valid ? '合法' : '非法，出错码 $25'}）`, 1, { fileDate: fatDate(year, month, day), year: 5, month: 6, day: 7, dayCarry: 1 }));
}

// ---- 子功能号越界与 $81 ----
const rangeCase = (id, title, func, sub, options = {}) => ({
  id: `p5c.range.${id}`,
  title,
  steps: [{
    host: (client) => withRestore(client, [[DOS_ERROR, 1], [0x6208, 1]], () => runCall(client, {
      func,
      sub,
      mem: [[DOS_ERROR, [options.preset ?? 0x5a]], [0x6208, [0x77]]],
      read: [[DOS_ERROR, 1], [0x6208, 1]],
      maxFrames: 60,
    })),
    check: ({ data: result }) => {
      if (!result.done) return ['调用没有返回'];
      const problems = [];
      const error = result.memory.get(DOS_ERROR)[0];
      if (error !== options.expectError) problems.push(`DOS_ERROR 为 ${hexName(error)}，预期 ${hexName(options.expectError)}`);
      if (result.memory.get(0x6208)[0] !== 0x77) problems.push('DISK_STATUS 被改动');
      return problems;
    },
  }],
});
for (const [func, firstBad] of [[0x7b, 0x14], [0x7c, 0x11], [0x7d, 0x04], [0x7e, 0x03], [0x7f, 0x05], [0x80, 0x09], [0x81, 0x01]]) {
  for (const sub of [firstBad, firstBad + 1, 0x7f, 0xff]) {
    cases.push(rangeCase(`${hexName(func)}-${hexName(sub)}`, `$${hexName(func)}/$${hexName(sub)} 子功能号越界：出错码 1，DISK_STATUS 不变`, func, sub, { expectError: 1 }));
  }
}
cases.push(rangeCase('81-00', '$81/$00 什么都不做：DOS_ERROR 保持原值', 0x81, 0, { preset: 0x5a, expectError: 0x5a }));

export { cases };
