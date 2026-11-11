// ------------------------------------------------------------------------
// 名称：p5c-disk.mjs
// 说明：磁盘服务（功能 $80，页组 $5C 里的软驱控制器驱动）的验证用例：按面、磁道、扇区读写，读缓冲与镜像比对，写入后保存镜像核对改动的扇区，以及参数越界与扇区缓冲读写。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值来自 1.44MB 软盘的几何（每磁道 18 扇区、2 个磁头、80 个磁道，扇区号从 1 起，逻辑扇区号 = (磁道 × 2 + 面) × 18 + 扇区 − 1）与原样镜像的字节，不取自 BIOS 的输出。
//       参数单元：DISK_HEAD $6200、DISK_SECTOR $6201、DISK_TRACK $6202、DISK_PAGE $6203（扩展 RAM 页号，$80 即扩展 RAM 偏移 0）、DISK_PAGE_SECTOR $6204（缓冲在页内从第几个 512 字节起）、
//       DISK_COUNT $6205/$6206、DISK_MODE $6207（$80 出错时立即返回）、DISK_STATUS $6208（0 成功，$10 参数超出范围，见 fcdev 仓库 docs/sb2000/02-系统调用手册.md 5.2 节）。
// ------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { PRISTINE_PATH, before } from '../lib/disk-check.mjs';

const HEAD = 0x6200;
const DISK_STATUS = 0x6208;
const SECTOR_BYTES = 512;

const image = before ? readFileSync(PRISTINE_PATH) : null;

/** 逻辑扇区号 */
const lba = (track, head, sector) => (track * 2 + head) * 18 + sector - 1;

/** 读扇区的调用参数：面、扇区、磁道、页号、页内扇区、扇区数、方式 */
const params = (head, sector, track, count, { page = 0x80, pageSector = 0, mode = 0x80 } = {}) => [[HEAD, [head, sector, track, page, pageSector, count & 0xff, count >> 8, mode]]];

/** 读 count 个扇区到扩展 RAM 页首（偏移 pageSector × 512），与镜像对应区段比较 */
const readCase = (id, title, head, sector, track, count, options = {}) => {
  const pageSector = options.pageSector ?? 0;
  const start = lba(track, head, sector) * SECTOR_BYTES;
  return {
    id,
    title,
    steps: [
      {
        func: 0x80,
        sub: 0x04,
        maxFrames: 900,
        mem: params(head, sector, track, count, options),
        readPram: [[pageSector * SECTOR_BYTES, count * SECTOR_BYTES]],
        expect: [[DISK_STATUS, [0]]],
        check: (result) => {
          const got = Buffer.from(result.pram.get(pageSector * SECTOR_BYTES));
          const want = image.subarray(start, start + count * SECTOR_BYTES);
          if (got.equals(want)) return [];
          let at = 0;
          while (got[at] === want[at]) at++;
          return [`读入的内容与镜像从逻辑扇区 ${lba(track, head, sector)} 起的 ${count} 个扇区不一致，首个差异在字节 ${at}`];
        },
      },
      { func: 0x80, sub: 0x07, maxFrames: 200 },
    ],
  };
};

/** 非法参数：状态码预期 $10 */
const badCase = (id, title, head, sector, track, count) => ({
  id,
  title,
  steps: [{ func: 0x80, sub: 0x04, maxFrames: 300, mem: params(head, sector, track, count), expect: [[DISK_STATUS, [0x10]]] }, { func: 0x80, sub: 0x07, maxFrames: 200 }],
});

/** 写 count 个扇区：先在扩展 RAM 页首（偏移 pageSector × 512）填好数据，调用后保存镜像，只有这些扇区变成数据，其余不变 */
const writeCase = (id, title, head, sector, track, count, seed) => {
  const data = Buffer.from(Array.from({ length: count * SECTOR_BYTES }, (_, i) => (seed * 53 + i * 7 + Math.floor(i / SECTOR_BYTES)) & 0xff));
  const start = lba(track, head, sector) * SECTOR_BYTES;
  return {
    id,
    title,
    fresh: true,
    freshAfter: true,
    steps: [
      { func: 0x6b, sub: 0x05 },
      {
        host: async (client) => {
          for (let done = 0; done < data.length; done += 2048) await client.send(`write pram ${done.toString(16)} ${data.subarray(done, done + 2048).toString('hex')}`);
        },
      },
      { func: 0x80, sub: 0x05, maxFrames: 1500, mem: params(head, sector, track, count), expect: [[DISK_STATUS, [0]]] },
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
          data.copy(expected, start);
          if (saved.equals(expected)) return [];
          let at = 0;
          while (saved[at] === expected[at]) at++;
          return [`保存的镜像与预期不一致，首个差异在字节 ${at}（扇区 ${Math.floor(at / SECTOR_BYTES)}，写入区段是 ${start / SECTOR_BYTES}-${start / SECTOR_BYTES + count - 1}）`];
        },
      },
    ],
  };
};

const bufferRead = {
  id: 'disk.buffer.read',
  title: '$80/$02 读一个扇区到 ERAM $6000 缓冲：磁道 3 面 1 扇区 7，512 字节与镜像一致',
  steps: [
    {
      func: 0x80,
      sub: 0x02,
      maxFrames: 600,
      mem: params(1, 7, 3, 1),
      read: [[0x6000, SECTOR_BYTES]],
      expect: [[DISK_STATUS, [0]]],
      check: (result) => {
        const start = lba(3, 1, 7) * SECTOR_BYTES;
        return Buffer.from(result.memory.get(0x6000)).equals(image.subarray(start, start + SECTOR_BYTES)) ? [] : ['缓冲内容与镜像扇区不一致'];
      },
    },
    { func: 0x80, sub: 0x07, maxFrames: 200 },
  ],
};

const bufferWrite = (() => {
  const data = Buffer.from(Array.from({ length: SECTOR_BYTES }, (_, i) => (i * 5 + 0x31) & 0xff));
  const start = lba(40, 1, 3) * SECTOR_BYTES;
  return {
    id: 'disk.buffer.write',
    title: '$80/$03 把 ERAM $6000 缓冲写入一个扇区：磁道 40 面 1 扇区 3，镜像里只有这个扇区变成缓冲内容',
    fresh: true,
    freshAfter: true,
    steps: [
      { func: 0x6b, sub: 0x05 },
      { func: 0x80, sub: 0x03, maxFrames: 900, mem: [[0x6000, data], ...params(1, 3, 40, 1)], expect: [[DISK_STATUS, [0]]] },
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
          data.copy(expected, start);
          return saved.equals(expected) ? [] : ['保存的镜像与预期不一致（只应有磁道 40 面 1 扇区 3 变化）'];
        },
      },
    ],
  };
})();

const cases = before
  ? [
      bufferRead,
      bufferWrite,
      readCase('disk.read.boot', '$80/$04 读磁道 0 面 0 扇区 1（引导扇区）：512 字节与镜像一致，状态 0', 0, 1, 0, 1),
      readCase('disk.read.track', '$80/$04 读磁道 0 面 0 整个磁道 18 个扇区', 0, 1, 0, 18),
      readCase('disk.read.head-cross', '$80/$04 从磁道 0 面 0 扇区 10 起读 20 个扇区：越过扇区 18 换到面 1', 0, 10, 0, 20),
      readCase('disk.read.track-cross', '$80/$04 从磁道 1 面 1 扇区 17 起读 5 个扇区：满 18 换磁道', 1, 17, 1, 5),
      readCase('disk.read.last', '$80/$04 读最后一个扇区（磁道 79 面 1 扇区 18）', 1, 18, 79, 1),
      readCase('disk.read.page-offset', '$80/$04 缓冲从页内第 3 个 512 字节起：读磁道 0 面 0 扇区 1 起 2 个扇区放到页内偏移 $600', 0, 1, 0, 2, { pageSector: 3 }),
      readCase('disk.read.long', '$80/$04 连续读 100 个扇区（磁道 2 面 0 扇区 1 起）', 0, 1, 2, 100),
      badCase('disk.bad.track', '$80/$04 磁道 80：状态 $10（参数超出范围）', 0, 1, 80, 1),
      badCase('disk.bad.sector0', '$80/$04 扇区 0：状态 $10', 0, 0, 0, 1),
      badCase('disk.bad.sector19', '$80/$04 扇区 19：状态 $10', 0, 19, 0, 1),
      badCase('disk.bad.head', '$80/$04 面 2：状态 $10', 2, 1, 0, 1),
      writeCase('disk.write.one', '$80/$05 写磁道 20 面 0 扇区 5 一个扇区：镜像里只有这个扇区变成写入的内容', 0, 5, 20, 1, 1),
      writeCase('disk.write.cross', '$80/$05 从磁道 30 面 1 扇区 10 起写 40 个扇区（跨磁道）：只有这 40 个扇区变化', 1, 10, 30, 40, 2),
    ]
  : [];

export { cases };
