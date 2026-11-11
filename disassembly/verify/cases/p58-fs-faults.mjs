// ------------------------------------------------------------------------
// 名称：p58-fs-faults.mjs
// 说明：文件服务（功能 $7B、$7C）在软驱出故障时的验证用例：用模拟器的 fdc 命令让软驱出故障，检查直接读写磁盘的文件服务返回的出错码，以及读整个文件时读到哪里为止。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-11
// 备注：文件服务读写磁盘失败时，出错码（DOS_ERROR）就是磁盘服务的状态（DISK_STATUS，见 fcdev 仓库 docs/sb2000/02-系统调用手册.md 4.4 节与 5.2 节），
//       各故障的状态码取自 BIOS 出错信息表（$13 写保护、$15 未准备好、$17 循环冗余校验错、$18 没有磁盘、$1A 未知磁盘类型），对应关系见 p5c-disk-faults.mjs 的头注释。
//       读整个文件时磁盘服务按方式 $80 工作（出错立即返回），所以文件里排在坏扇区前面的扇区已经读入目的页，坏扇区及之后保持调用前填入的 $A5。
//       例外：FAT 缓存整体装入（FS_FAT_LOAD_ALL）失败时，缓存有效标志（$6585）已先置为 $80，出错码也没有写进 DOS_ERROR（读代码得到：它只返回进位），只有 DISK_STATUS 里是状态码。
//       fdc 命令的含义见 fcdev 仓库 virtuanes/README.md。
// ------------------------------------------------------------------------
import { before, byName } from '../lib/disk-check.mjs';
import { DOS_ERROR, dosName, noError, openStep, resetHandles } from '../lib/fs-steps.mjs';

const FS_LBA = 0x652e;
const DISK_STATUS = 0x6208;
const SECTOR_BUFFER = 0x6000;
const FILE_START_PAGE = 0x656b;
const ALLOC_COUNT = 0x65a6;
const ALLOC_START = 0x65a7;
const SECTOR = 512;
const SENTINEL = 0xa5;

const le16 = (value) => [value & 0xff, value >> 8];
const lbaTrack = (lba) => Math.floor(lba / 36);
const fdc = (command) => ({ host: async (client) => { await client.send(`fdc ${command}`); } });
const fresh = (spec) => ({ ...spec, fresh: true, freshAfter: true });
const expectError = (code) => [[DOS_ERROR, [code]]];

/** 故障：命令与状态码；bad 要指定出错的逻辑扇区 */
const FAULTS = {
  eject: { command: () => 'eject', code: 0x1a, label: '盘片取出（$1A）' },
  noindex: { command: () => 'noindex 1', code: 0x18, label: '没有索引脉冲（$18）' },
  dead: { command: () => 'dead 1', code: 0x15, label: '控制器不响应（$15）' },
  seek: { command: () => 'seekfail 1', code: 0x15, label: '磁头卡住（$15）' },
  wp: { command: () => 'wp 1', code: 0x13, label: '写保护（$13）' },
  bad: { command: (lba) => `bad ${lba}`, code: 0x17, label: '扇区校验错（$17）' },
};

const cases = [];

/** 一项直接读写磁盘的文件服务：setup 是故障注入之前的准备步骤，call 是被测调用，faults 列出适用的故障，lba 是调用读写的逻辑扇区（磁头卡住只在要寻道时才失败） */
const services = [
  { id: 'boot', name: '$7C/$0E 读引导扇区', setup: [], call: { func: 0x7c, sub: 0x0e, mem: [[0x6562, [0x41]]], maxFrames: 6000 }, faults: ['eject', 'noindex', 'dead', 'bad'], lba: 0 },
  { id: 'sector-read', name: '$7B/$01 读扇区 1000（不经 FAT 缓存）', setup: [], call: { func: 0x7b, sub: 0x01, mem: [[FS_LBA, le16(1000)]], maxFrames: 6000 }, faults: ['eject', 'noindex', 'dead', 'seek', 'bad'], lba: 1000 },
  { id: 'fat-load', name: '$7B/$01 读扇区 5（FAT 缓存还没装入，要先整体装入 10 个扇区）', quirk: true, setup: [{ func: 0x7b, sub: 0x07, expect: noError }], call: { func: 0x7b, sub: 0x01, mem: [[FS_LBA, le16(5)]], maxFrames: 9000 }, faults: ['eject', 'noindex', 'dead', 'bad'], lba: 4 },
  { id: 'sector-write', name: '$7B/$02 写扇区 1000（不经 FAT 缓存）', setup: [], call: { func: 0x7b, sub: 0x02, mem: [[FS_LBA, le16(1000)], [SECTOR_BUFFER, Array.from({ length: SECTOR }, (_, i) => i & 0xff)]], maxFrames: 6000 }, faults: ['eject', 'noindex', 'dead', 'seek', 'wp'], lba: 1000 },
  { id: 'fat-write-back', name: '$7B/$10 把 FAT 缓存写回磁盘', setup: [{ func: 0x7b, sub: 0x01, mem: [[FS_LBA, le16(1)]], maxFrames: 9000, expect: noError }], call: { func: 0x7b, sub: 0x10, maxFrames: 9000 }, faults: ['eject', 'noindex', 'dead', 'wp'], lba: 1 },
];

for (const service of services) {
  for (const key of service.faults) {
    const fault = FAULTS[key];
    const call = { ...service.call, expect: [...(service.call.expect ?? []), ...(service.quirk ? [[DOS_ERROR, [0]], [0x6585, [0x80]], [DISK_STATUS, [fault.code]]] : expectError(fault.code))] };
    cases.push(fresh({
      id: `fs.fault.${service.id}.${key}`,
      title: service.quirk
        ? `${service.name}：${fault.label}，出错码没有传出来（DOS_ERROR 仍为 0），缓存有效标志已置 $80，磁盘状态 $${fault.code.toString(16).toUpperCase()}`
        : `${service.name}：${fault.label}，出错码 $${fault.code.toString(16).toUpperCase()}`,
      steps: [...service.setup, fdc(fault.command(service.lba)), call],
    }));
  }
}

// ---- 读整个文件、写整个文件 ----
if (before) {
  const edit = byName('EDIT    EXE');
  const editName = dosName(edit.name83);
  const sectors = before.chain(edit.cluster).map((cluster) => 31 + cluster);
  const content = before.readFile(edit);
  const pages = Math.ceil(edit.size / 4096);
  const pramOffset = (history) => (history[2].memory.get(ALLOC_START)[0] - 0x80) * 4096;

  const readSteps = (fault) => [
    resetHandles,
    openStep(editName, 0),
    { func: 0x7e, sub: 0x00, mem: [[ALLOC_COUNT, [pages]]], read: [[ALLOC_START, 1]], expect: noError },
    (history) => ({
      host: async (client) => {
        const fill = Buffer.alloc(pages * 4096, SENTINEL);
        for (let done = 0; done < fill.length; done += 2048) await client.send(`write pram ${(pramOffset(history) + done).toString(16)} ${fill.subarray(done, done + 2048).toString('hex')}`);
      },
    }),
    fdc(fault),
  ];

  /** 读整个文件：failAt 是文件里第几个扇区（从 0 起）出错，undefined 表示不是校验错 */
  const readWhole = (id, title, fault, code, readable) => fresh({
    id,
    title,
    steps: [
      ...readSteps(fault),
      (history) => ({
        func: 0x7c,
        sub: 0x0f,
        maxFrames: 20000,
        mem: [[FILE_START_PAGE, [history[2].memory.get(ALLOC_START)[0]]]],
        readPram: [[pramOffset(history), pages * 4096]],
        expect: expectError(code),
        check: (result) => {
          const got = Buffer.from(result.pram.get(pramOffset(history)));
          const problems = [];
          for (let i = 0; i < pages * 8; i++) {
            const part = got.subarray(i * SECTOR, (i + 1) * SECTOR);
            const want = i < readable ? content.subarray(i * SECTOR, (i + 1) * SECTOR) : Buffer.alloc(SECTOR, SENTINEL);
            if (!part.equals(want)) { problems.push(`目的页里第 ${i} 个扇区${i < readable ? '应与文件内容一致' : '应保持调用前的 $A5'}`); if (problems.length >= 3) break; }
          }
          return problems;
        },
      }),
    ],
  });

  for (const key of ['eject', 'noindex', 'dead', 'seek']) {
    const fault = FAULTS[key];
    cases.push(readWhole(`fs.fault.read-file.${key}`, `$7C/$0F 读整个文件（EDIT.EXE，已打开）：${fault.label}，出错码 $${fault.code.toString(16).toUpperCase()}，目的页没有数据`, fault.command(), fault.code, 0));
  }
  for (const index of [0, 40, sectors.length - 1]) {
    cases.push(readWhole(`fs.fault.read-file.bad-${index}`, `$7C/$0F 读整个文件（EDIT.EXE，${sectors.length} 个扇区）：文件里第 ${index + 1} 个扇区校验错，出错码 $17，前 ${index} 个扇区已读入目的页，其余保持 $A5`, `bad ${sectors[index]}`, 0x17, index));
  }
  cases.push(readWhole('fs.fault.read-file.wp', '$7C/$0F 读整个文件：写保护不影响读，出错码 0，整个文件读入', 'wp 1', 0, pages * 8));

  // 写整个文件：新建文件打开（方式 1）后再出故障，写文件时的磁盘出错码就是状态码
  const FILE_SIZE = 0x6568;
  for (const key of ['wp', 'eject', 'noindex', 'dead', 'seek']) {
    const fault = FAULTS[key];
    cases.push(fresh({
      id: `fs.fault.write-file.${key}`,
      title: `$7C/$10 把一页数据写入新建文件（方式 1，已打开）：${fault.label}，出错码 $${fault.code.toString(16).toUpperCase()}`,
      steps: [
        resetHandles,
        openStep('FAULT.BIN', 1),
        { func: 0x7e, sub: 0x00, mem: [[ALLOC_COUNT, [1]]], read: [[ALLOC_START, 1]], expect: noError },
        fdc(fault.command()),
        (history) => ({ func: 0x7c, sub: 0x10, maxFrames: 20000, mem: [[FILE_SIZE, [0x00, 0x02, 0x00]], [FILE_START_PAGE, [history[2].memory.get(ALLOC_START)[0]]]], expect: expectError(fault.code) }),
      ],
    }));
  }
}

export { cases };
