// ------------------------------------------------------------------------
// 名称：p58-params.mjs
// 说明：页组 $58 文件服务里纯计算子功能的验证用例：$7B/$0D 字节数换算扇区、簇、页，$7B/$03 簇号换扇区号，$7B/$04 簇号加 1，$7B/$11 扇区号换磁道、磁头、扇区，以及 $7C/$0E 读引导扇区记下磁盘参数（含各种不合格字段）。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值来自 verify/lib/p58-model.mjs（按 bios/src/file-system/ 转录）；$7B 的计算类子功能直接改写磁盘参数块（用后还原），$7C/$0E 用改过引导扇区字段的特制镜像。
//       没有覆盖：读盘失败（无盘、未就绪）时 $7C/$0E 返回磁盘出错码；B 盘的引导扇区（没有第二个驱动器）。
// ------------------------------------------------------------------------
import { writeFileSync } from 'node:fs';
import { runCall } from '../../tools/rom-driver.mjs';
import { buildFat12Image } from '../../tools/fat12-image.mjs';
import { clusterToLba, lbaToChs, readBootParams, sizeToUnits } from '../lib/p58-model.mjs';
import { file } from '../lib/images.mjs';
import { withRestore } from '../lib/restore.mjs';

const DOS_ERROR = 0x6300;
const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const le16 = (value) => [value & 0xff, (value >> 8) & 0xff];
const RANGES = [[0x64fb, 9], [0x6514, 9], [0x652b, 1], [0x6563, 1], [0x652e, 2], [0x6536, 2], [0x69a, 9], [0x6200, 3], [DOS_ERROR, 1]];

/** 比较一批 [地址, 预期字节] */
const compareAll = (result, expected) => {
  const problems = [];
  for (const [address, want] of expected) {
    const got = result.memory.get(address);
    want.forEach((value, i) => { if (got[i] !== value) problems.push(`$${(address + i).toString(16).toUpperCase()} 为 ${hexName(got[i])}，预期 ${hexName(value)}`); });
  }
  return problems.slice(0, 10);
};

/** 一个计算类用例：写入参数，调用 $7B 的子功能，核对结果 */
const calcCase = (id, title, sub, mem, read, expected) => ({
  id: `p58.calc.${id}`,
  title: `$7B/$${hexName(sub)} ${title}`,
  steps: [{
    host: (client) => withRestore(client, RANGES, () => runCall(client, { func: 0x7b, sub, mem: [...mem, [DOS_ERROR, [0x5a]]], read: [...read, [DOS_ERROR, 1]], maxFrames: 300 })),
    check: ({ data: result }) => (result.done ? compareAll(result, [...expected, [DOS_ERROR, [0]]]) : ['调用没有返回']),
  }],
});

const cases = [];

// ---- $0D 字节数 → 扇区、簇、页 ----
for (const [spc, shift] of [[1, 0], [2, 1], [4, 2], [8, 3]]) {
  for (const bytes of [0, 1, 511, 512, 513, 1024, 4096, 4097, 5000, 32768, 65535, 70000, 0x123456, 0xffffff]) {
    const want = sizeToUnits(bytes, spc, shift);
    cases.push(calcCase(`units-${spc}-${bytes}`, `${bytes} 字节、每簇 ${spc} 扇区：扇区 ${want.sectors}、簇 ${want.clusters}、页 ${want.pages}`, 0x0d,
      [[0x64fb, [spc, shift]], [0x6563, [0]], [0x69a, [bytes & 0xff, (bytes >> 8) & 0xff, bytes >> 16]]],
      [[0x69a, 9]],
      [[0x69a, [bytes & 0xff, (bytes >> 8) & 0xff, bytes >> 16, ...le16(want.sectors), ...le16(want.clusters), ...le16(want.pages)]]]));
  }
}

// ---- $03 簇号 → 扇区号 ----
for (const spc of [1, 2, 4, 8]) {
  for (const cluster of [2, 3, 5, 100, 2000, 2848, 0x1234, 0xffff, 0, 1]) {
    const lba = clusterToLba(cluster, Math.log2(spc), 33);
    cases.push(calcCase(`cluster-lba-${spc}-${cluster}`, `A 盘每簇 ${spc} 扇区、数据区起始 33：簇 ${cluster} → 扇区 ${lba}`, 0x03,
      [[0x652b, [0x41]], [0x64fb, [spc]], [0x64ff, [33]], [0x6536, le16(cluster)]],
      [[0x652e, 2]], [[0x652e, le16(lba)]]));
  }
}
for (const [spc, dataStart, cluster] of [[1, 33, 2], [2, 40, 77], [4, 17, 300]]) {
  const lba = clusterToLba(cluster, Math.log2(spc), dataStart);
  cases.push(calcCase(`cluster-lba-b-${spc}-${cluster}`, `B 盘（参数块偏移 $19）每簇 ${spc} 扇区、数据区起始 ${dataStart}：簇 ${cluster} → 扇区 ${lba}`, 0x03,
    [[0x652b, [0x42]], [0x6514, [spc]], [0x6518, [dataStart]], [0x6536, le16(cluster)]],
    [[0x652e, 2]], [[0x652e, le16(lba)]]));
}

// ---- $04 簇号加 1 ----
for (const cluster of [0, 2, 0xff, 0x0fff, 0xfffe, 0xffff]) {
  cases.push(calcCase(`cluster-inc-${cluster}`, `簇号 ${cluster} 加 1`, 0x04,
    [[0x652b, [0x41]], [0x64fb, [1]], [0x6502, [0x21, 0x0b]], [0x6536, le16(cluster)]],
    [[0x6536, 2]], [[0x6536, le16((cluster + 1) & 0xffff)]]));
}

// ---- $11 扇区号 → 磁道、磁头、扇区 ----
for (const lba of [0, 1, 17, 18, 19, 35, 36, 37, 53, 54, 100, 1000, 2879, 3000, 9215, 65535]) {
  const { track, head, sector } = lbaToChs(lba);
  cases.push(calcCase(`lba-chs-${lba}`, `扇区号 ${lba} → 磁道 ${track}、磁头 ${head}、扇区 ${sector}（FS_LBA 不变）`, 0x11,
    [[0x652e, le16(lba)], [0x6200, [0xee, 0xee, 0xee]]],
    [[0x6200, 3], [0x652e, 2]], [[0x6200, [head, sector, track]], [0x652e, le16(lba)]]));
}

// ---- $7C/$0E 读引导扇区 ----
const baseImage = buildFat12Image([file('A.TXT', Buffer.from('hello'))], { label: 'SPECIAL' });
const REGION = 0x64ec;
const REGION_LENGTH = 24;

const bootCase = (id, title, patch, { letter = 0x41 } = {}) => {
  const image = Buffer.from(baseImage);
  patch(image);
  return {
    id: `p58.boot.${id}`,
    title: `$7C/$0E ${title}`,
    fresh: true,
    freshAfter: true,
    image,
    prepareImage: (ctx) => writeFileSync(ctx.image, image),
    steps: [{
      host: async (client) => {
        const before = Buffer.from(await client.read('cpu', REGION, REGION_LENGTH));
        await runCall(client, { func: 0x7b, sub: 0x13, maxFrames: 60 });
        const result = await runCall(client, { func: 0x7c, sub: 0x0e, mem: [[0x6562, [letter]]], read: [[REGION, REGION_LENGTH], [DOS_ERROR, 1], [0x6563, 1]], maxFrames: 900 });
        return { before, result };
      },
      check: ({ data: { before, result } }) => {
        if (!result.done) return ['调用没有返回'];
        const letterOk = [0x41, 0x61].includes(letter);
        const model = letterOk ? readBootParams(image, before) : { error: 0x0f, region: before };
        const problems = [];
        const error = result.memory.get(DOS_ERROR)[0];
        if (error !== model.error) problems.push(`DOS_ERROR 为 ${hexName(error)}，预期 ${hexName(model.error)}`);
        const region = result.memory.get(REGION);
        for (let i = 0; i < REGION_LENGTH; i++) if (region[i] !== model.region[i]) problems.push(`$${(REGION + i).toString(16).toUpperCase()} 为 ${hexName(region[i])}，预期 ${hexName(model.region[i])}`);
        return problems.slice(0, 10);
      },
    }],
  };
};

cases.push(
  bootCase('good', '正常的 1.44MB 引导扇区：每簇 1 扇区、数据区起始 33、簇号上限 $0B21，卷序列号与卷标记入参数块', () => {}),
  bootCase('letter-lower', '驱动器字母 "a" 与 "A" 一样', () => {}, { letter: 0x61 }),
  bootCase('letter-c', '驱动器字母 "C"：出错码 $0F', () => {}, { letter: 0x43 }),
  bootCase('letter-zero', '驱动器字母为 0：出错码 $0F', () => {}, { letter: 0 }),
);
for (const spc of [2, 4, 8]) cases.push(bootCase(`spc-${spc}`, `每簇 ${spc} 扇区：移位数 ${Math.log2(spc)}，簇号上限按右移后加 2`, (b) => { b[13] = spc; }));
for (const spc of [0, 3, 6, 16, 255]) cases.push(bootCase(`spc-bad-${spc}`, `每簇 ${spc} 扇区不合法：出错码 $0E，$64FB 已写入`, (b) => { b[13] = spc; }));
const fieldCases = [
  [11, 1, '每扇区字节数低字节不为 0'], [12, 1, '每扇区字节数高字节不是 2'], [12, 4, '每扇区字节数 1024'], [14, 2, '保留扇区数 2'], [15, 1, '保留扇区数高字节不为 0'],
  [16, 1, 'FAT 份数 1'], [16, 3, 'FAT 份数 3'], [17, 0, '根目录项数低字节为 0'], [18, 1, '根目录项数高字节不为 0'], [19, 0x41, '总扇区数低字节 $41'], [19, 0x00, '总扇区数低字节 0'],
  [20, 0x0a, '总扇区数高字节 $0A'], [22, 0, '每个 FAT 的扇区数为 0'], [23, 1, '每个 FAT 的扇区数高字节不为 0'],
];
for (const [offset, value, label] of fieldCases) cases.push(bootCase(`field-${offset}-${value}`, `${label}：出错码 $0E`, (b) => { b[offset] = value; }));
for (const spf of [1, 100, 120, 121, 127, 128, 200]) cases.push(bootCase(`spf-${spf}`, `每个 FAT ${spf} 扇区（FAT 部分 ${spf * 2 + 1} 扇区加根目录 14 扇区）`, (b) => { b[22] = spf; }));
for (const root of [16, 112, 240, 255]) cases.push(bootCase(`root-${root}`, `根目录 ${root} 项（${root >> 4} 扇区）`, (b) => { b[17] = root; }));
cases.push(bootCase('serial-label', '卷序列号与卷标（含全 $FF）原样记入', (b) => { b.set([0x01, 0x02, 0x03, 0xff], 0x27); b.set(Buffer.from('ABCDEFGHIJK'), 0x2b); }));

export { cases };
