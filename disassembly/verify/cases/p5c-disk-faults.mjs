// ------------------------------------------------------------------------
// 名称：p5c-disk-faults.mjs
// 说明：磁盘服务（功能 $80）在软驱出故障时的验证用例：用模拟器的 fdc 命令让软驱控制器出各种故障，检查 DISK_STATUS 与数据是否符合预期。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-11
// 备注：fdc 命令见 fcdev 仓库 virtuanes/README.md：eject（控制器对 READ ID 报“找不到地址标志”）、noindex（READ ID 一直没有中断，相当于盘里没有索引脉冲）、
//       wp（写保护）、seekfail（磁头卡住，不能移到别的磁道）、dead（控制器收到命令字节后不再处理）、bad（指定逻辑扇区读时报数据校验错）。
//       预期状态码取自 BIOS 出错信息表（fcdev 仓库 docs/sb2000/02-系统调用手册.md 第 6 节）：$13 写保护、$15 驱动器未准备好、$17 循环冗余校验错、$18 驱动器中没有磁盘、$1A 未知磁盘类型；
//       控制器报告与状态码的对应来自 uPD765 结果寄存器的含义：READ ID 没有中断=没有盘；ST1 位 0（找不到地址标志）=盘型不对；ST1 位 1（不可写）=写保护；ST1 位 5（数据错误）=校验错；寻道不到位或命令无响应=未准备好。
//       坏扇区读出的内容预期取自原样镜像，没读到的扇区保持调用前填入的 $A5。逻辑扇区号 = (磁道 × 2 + 面) × 18 + 扇区 − 1。
// ------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { PRISTINE_PATH, before } from '../lib/disk-check.mjs';

const HEAD = 0x6200;
const DISK_STATUS = 0x6208;
const BAD_MAP = 0x6237;
const SECTOR = 512;
const SENTINEL = 0xa5;

const lba = (track, head, sector) => (track * 2 + head) * 18 + sector - 1;
const params = (head, sector, track, count, { page = 0x80, pageSector = 0, mode = 0x80 } = {}) => [[HEAD, [head, sector, track, page, pageSector, count & 0xff, count >> 8, mode]]];
const fdc = (command) => ({ host: async (client) => { await client.send(`fdc ${command}`); } });
const call = (sub, mem, status, maxFrames = 3000) => ({ func: 0x80, sub, maxFrames, mem: [[DISK_STATUS, [0x77]], ...mem], expect: [[DISK_STATUS, [status]]] });
const fresh = (spec) => ({ ...spec, fresh: true, freshAfter: true });

const cases = [];

// ---- 各种故障下每个服务给出的状态码 ----
const services = [
  { key: 'read', name: '$80/$04 读一个扇区', sub: 0x04, mem: params(0, 1, 0, 1), writes: false },
  { key: 'write', name: '$80/$05 写一个扇区', sub: 0x05, mem: params(0, 1, 0, 1), writes: true },
  { key: 'bufread', name: '$80/$02 读一个扇区到缓冲', sub: 0x02, mem: params(0, 1, 0, 1), writes: false },
  { key: 'bufwrite', name: '$80/$03 把缓冲写入一个扇区', sub: 0x03, mem: params(0, 1, 0, 1), writes: true },
  { key: 'format', name: '$80/$01 格式化磁道', sub: 0x01, mem: params(0, 1, 0, 1), writes: true },
];

for (const [fault, command, status, label] of [
  ['eject', 'eject', 0x1a, '盘片取出（控制器对 READ ID 报找不到地址标志）'],
  ['noindex', 'noindex 1', 0x18, '没有索引脉冲（READ ID 一直没有中断）'],
]) {
  for (const service of services) {
    cases.push(fresh({
      id: `disk.fault.${fault}.${service.key}`,
      title: `${service.name}：${label}，状态 $${status.toString(16).toUpperCase()}`,
      steps: [fdc(command), call(service.sub, service.mem, status, 3000)],
    }));
  }
}

for (const service of services.filter((s) => s.writes)) {
  cases.push(fresh({
    id: `disk.fault.wp.${service.key}`,
    title: `${service.name}：写保护，状态 $13`,
    steps: [fdc('wp 1'), call(service.sub, service.mem, 0x13, 6000)],
  }));
}
for (const service of services.filter((s) => !s.writes)) {
  cases.push(fresh({
    id: `disk.fault.wp.${service.key}`,
    title: `${service.name}：写保护不影响读，状态 0`,
    steps: [fdc('wp 1'), call(service.sub, service.mem, 0, 3000)],
  }));
}

for (const service of services) {
  cases.push(fresh({
    id: `disk.fault.seek.${service.key}`,
    title: `${service.name}：磁头卡住，目标磁道 3 要寻道，状态 $15`,
    steps: [fdc('seekfail 1'), call(service.sub, params(0, 1, 3, 1), 0x15, 6000)],
  }));
}
cases.push(fresh({
  id: 'disk.fault.seek.track0',
  title: '$80/$04 磁头卡住时读 0 磁道（不用寻道）：状态 0',
  steps: [fdc('seekfail 1'), call(0x04, params(0, 1, 0, 1), 0, 3000)],
}));

for (const [sub, name] of [[0x00, '$80/$00 初始化'], [0x06, '$80/$06 启动软驱'], [0x04, '$80/$04 读一个扇区'], [0x05, '$80/$05 写一个扇区']]) {
  cases.push(fresh({
    id: `disk.fault.dead.${sub.toString(16).padStart(2, '0')}`,
    title: `${name}：控制器不响应，状态 $15`,
    steps: [fdc('dead 1'), call(sub, params(0, 1, 0, 1), 0x15, 6000)],
  }));
}

// ---- 坏扇区 ----
if (before) {
  const image = readFileSync(PRISTINE_PATH);
  const sentinel = Buffer.alloc(5 * SECTOR, SENTINEL);
  const fillPages = {
    host: async (client) => { await client.send(`write pram 0 ${sentinel.toString('hex')}`); },
  };
  const readBack = (count) => ({ readPram: [[0, count * SECTOR]] });

  /** 读 count 个扇区（磁道 2 面 0 扇区 1 起），第 badIndex 个（从 0 起）是坏扇区 */
  const badRead = (id, title, mode, status, goodIndexes) => {
    const start = lba(2, 0, 1);
    const badIndex = 2;
    return fresh({
      id,
      title,
      steps: [
        fdc(`bad ${start + badIndex}`),
        fillPages,
        {
          ...call(0x04, params(0, 1, 2, 5, { mode }), status, 12000),
          ...readBack(5),
          check: (result) => {
            const got = Buffer.from(result.pram.get(0));
            const problems = [];
            for (let i = 0; i < 5; i++) {
              const part = got.subarray(i * SECTOR, (i + 1) * SECTOR);
              const want = goodIndexes.includes(i) ? image.subarray((start + i) * SECTOR, (start + i + 1) * SECTOR) : Buffer.alloc(SECTOR, SENTINEL);
              if (!part.equals(want)) problems.push(`第 ${i + 1} 个扇区的内容${goodIndexes.includes(i) ? '应与镜像一致' : '应保持调用前的 $A5'}`);
            }
            return problems;
          },
        },
      ],
    });
  };
  cases.push(badRead('disk.fault.bad.read-stop', '$80/$04 方式 $80 连读 5 个扇区，第 3 个校验错：状态 $17，前两个读好，第 3 个及之后不读', 0x80, 0x17, [0, 1]));
  cases.push(badRead('disk.fault.bad.read-skip', '$80/$04 方式 0 连读 5 个扇区，第 3 个校验错：跳过它继续读，状态 0，其余 4 个读好', 0x00, 0x00, [0, 1, 3, 4]));
  cases.push(fresh({
    id: 'disk.fault.bad.bufread',
    title: '$80/$02 读校验错的扇区到缓冲：状态 $17',
    steps: [fdc(`bad ${lba(5, 1, 7)}`), call(0x02, params(1, 7, 5, 1), 0x17, 12000)],
  }));

  // $80/$08 逐扇区扫描：位图第 1-8 个扇区在 $6237（扇区 1 是位 7），9-16 在 $6238，17-18 在 $6239（扇区 17 是位 7）
  const bitmap = (sectors) => {
    const bytes = [0, 0, 0];
    for (const s of sectors) bytes[s <= 8 ? 0 : s <= 16 ? 1 : 2] |= 0x80 >> ((s - 1) % 8);
    return bytes;
  };
  for (const [name, track, head, sectors] of [
    ['one', 7, 0, [5]],
    ['edges', 9, 1, [1, 8, 9, 16, 17, 18]],
    ['all', 12, 0, Array.from({ length: 18 }, (_, i) => i + 1)],
  ]) {
    cases.push(fresh({
      id: `disk.fault.bad.scan-${name}`,
      title: `$80/$08 扫描磁道 ${track} 面 ${head}，扇区 ${sectors.join('、')} 校验错：坏扇区位图 ${bitmap(sectors).map((b) => `$${b.toString(16).toUpperCase().padStart(2, '0')}`).join(' ')}`,
      steps: [
        fdc(`bad ${sectors.map((s) => lba(track, head, s)).join(' ')}`),
        { func: 0x80, sub: 0x08, maxFrames: 30000, mem: [[HEAD, [head, 1, track]], [BAD_MAP, [0xaa, 0xbb, 0xcc]]], expect: [[BAD_MAP, bitmap(sectors)]] },
      ],
    }));
  }

  // ---- $80/$01 格式化磁道：整条磁道 18 个扇区写成填充字节（磁道 0 用 0，其余磁道用 $F6，见 FDC_FORMAT_TRACK），其余扇区不变 ----
  for (const [track, head, fill] of [[20, 1, 0xf6], [0, 0, 0x00], [79, 0, 0xf6]]) {
    cases.push(fresh({
      id: `disk.format.t${track}h${head}`,
      title: `$80/$01 格式化磁道 ${track} 面 ${head}：状态 0，镜像里这条磁道的 18 个扇区都变成 $${fill.toString(16).toUpperCase().padStart(2, '0')}，其余不变`,
      steps: [
        { func: 0x80, sub: 0x01, maxFrames: 3000, mem: [[DISK_STATUS, [0x77]], [HEAD, [head, 1, track]]], expect: [[DISK_STATUS, [0]]] },
        { func: 0x80, sub: 0x07, maxFrames: 200 },
        {
          host: async (client, _history, ctx) => {
            await client.send('savedisk');
            const saved = readFileSync(ctx.image);
            ctx.restore();
            return saved;
          },
          check: ({ data: saved }) => {
            const expected = Buffer.from(image);
            expected.fill(fill, lba(track, head, 1) * SECTOR, (lba(track, head, 1) + 18) * SECTOR);
            if (saved.equals(expected)) return [];
            let at = 0;
            while (saved[at] === expected[at]) at++;
            return [`保存的镜像与预期不一致，首个差异在字节 ${at}（扇区 ${Math.floor(at / SECTOR)}，格式化区段是 ${lba(track, head, 1)}-${lba(track, head, 18)}）`];
          },
        },
      ],
    }));
  }
}

export { cases };
