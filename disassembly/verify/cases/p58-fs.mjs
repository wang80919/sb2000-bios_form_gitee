// ------------------------------------------------------------------------
// 名称：p58-fs.mjs
// 说明：页组 $58 文件系统（功能 $7B、$7C、$7D、$7E）的验证用例：用独立的 FAT12 读取器解析开机用的 DOS 镜像，与 BIOS 打开、读取、取大小、查 FAT、统计空闲空间的结果比对。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值全部来自 verify/lib/fat12.mjs 对镜像原样备份（out/verify/floppy-pristine.img，由 verify-run.mjs 生成）的解析，不依赖 BIOS 的输出；
//       镜像还没有生成时本文件不产生用例。变量地址见 fcdev 仓库 docs/sb2000/02-系统调用手册.md 第 4 节。
// ------------------------------------------------------------------------
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { OUT_DIR } from '../../tools/config.mjs';
import { parseFat12 } from '../lib/fat12.mjs';
import { DOS_ERROR, HANDLE_TABLE, ascii, closeHandle, dosName, le, noError, openStep, resetHandles } from '../lib/fs-steps.mjs';

const IMAGE = path.join(OUT_DIR, 'verify', 'floppy-pristine.img');
const fat = existsSync(IMAGE) ? parseFat12(readFileSync(IMAGE)) : null;
const files = fat ? fat.listRoot().filter((entry) => (entry.attr & 0x08) === 0) : [];

/** 打开后句柄表与公共变量里的目录信息，应与镜像里的目录项一致 */
const entryExpect = (entry) => [
  [DOS_ERROR, [0]],
  [0x6561, [0]],
  [HANDLE_TABLE, [0]],
  [0x643d, ascii(entry.name83)],
  [0x6448, [entry.attr]],
  [0x6449, le(entry.size, 3)],
  [0x6450, le(entry.cluster, 2)],
  [0x644c, le(entry.date, 2)],
  [0x644e, le(entry.time, 2)],
];

const openCases = files.map((entry) => ({
  id: `fs.open.${dosName(entry.name83)}`,
  title: `$7B/$09 打开 ${dosName(entry.name83)}：名称、属性、大小、起始簇、日期、时间与镜像目录项一致，再用 $7C/$0D、$7C/$0A、$7C/$08、$7C/$0C 取回并关闭`,
  steps: [
    resetHandles,
    openStep(dosName(entry.name83), 0, entryExpect(entry)),
    { func: 0x7c, sub: 0x0d, expect: [[DOS_ERROR, [0]], [0x6568, le(entry.size, 3)]] },
    { func: 0x7c, sub: 0x0c, expect: [[DOS_ERROR, [0]], [0x6572, [entry.attr]]] },
    { func: 0x7c, sub: 0x08, expect: [[DOS_ERROR, [0]], [0x656e, le(entry.date, 2)]] },
    { func: 0x7c, sub: 0x0a, expect: [[DOS_ERROR, [0]], [0x6570, le(entry.time, 2)]] },
    closeHandle,
  ],
}));

/** 读整个文件：分配页、读入、与镜像里按簇链读出的内容逐字节比较，再释放页 */
const readable = files.filter((entry) => entry.size > 0 && entry.size <= 32768);
const readCases = readable.map((entry) => {
  const pages = Math.ceil(entry.size / 4096);
  const content = fat.readFile(entry);
  return {
    id: `fs.read.${dosName(entry.name83)}`,
    title: `$7C/$0F 读入 ${dosName(entry.name83)}（${entry.size} 字节，${pages} 页），与按簇链读出的内容逐字节一致`,
    steps: [
      resetHandles,
      openStep(dosName(entry.name83), 0),
      { func: 0x7e, sub: 0x00, mem: [[0x65a6, [pages]]], read: [[0x65a7, 1]], expect: noError },
      (history) => {
        const page = history.at(-1).memory.get(0x65a7)[0];
        return {
          func: 0x7c,
          sub: 0x0f,
          mem: [[0x656b, [page]]],
          readPram: [[(page - 0x80) * 4096, entry.size]],
          expect: noError,
          check: (result) => {
            const got = result.pram.get((page - 0x80) * 4096);
            return Buffer.from(got).equals(content) ? [] : [`读入内容与镜像不一致（${got.length} 字节）`];
          },
        };
      },
      closeHandle,
      (history) => ({ func: 0x7e, sub: 0x01, mem: [[0x65a6, [pages]], [0x65a7, [history[2].memory.get(0x65a7)[0]]]], expect: noError }),
    ],
  };
});

/** FAT 项：对比 FS_FAT_GET 的结果（下一簇号在 $6532/$6533，链尾为 $0FFF） */
const fatCases = [];
for (const entry of files.filter((f) => f.size > 4096).slice(0, 4)) {
  const chain = fat.chain(entry.cluster);
  const picks = [...new Set([0, 1, Math.floor(chain.length / 2), chain.length - 1])];
  for (const index of picks) {
    const cluster = chain[index];
    const next = fat.fatEntry(cluster);
    const isEnd = next >= 0xff8;
    fatCases.push({
      id: `fs.fat.${dosName(entry.name83)}.c${cluster}`,
      title: `$7B/$05 读簇 ${cluster} 的 FAT 项：${isEnd ? '链尾' : `下一簇 ${next}`}（${dosName(entry.name83)} 的第 ${index + 1}/${chain.length} 簇）`,
      steps: [
        resetHandles,
        openStep(dosName(entry.name83), 0),
        {
          func: 0x7b,
          sub: 0x05,
          mem: [[0x6536, le(cluster, 2)]],
          read: [[0x6532, 2]],
          expect: noError,
          check: (result) => {
            // 经 $FFF0 调用时分发器会恢复 A、X、Y，A 里的“有效/链尾”标志看不到，只核对 $6532/$6533 里的 FAT 项原值
            const got = result.memory.get(0x6532);
            const value = got[0] | (got[1] << 8);
            return value === next ? [] : [`FAT 项预期 $${next.toString(16).toUpperCase()}，实际 $${value.toString(16).toUpperCase()}`];
          },
        },
        closeHandle,
      ],
    });
  }
}

/** 空闲空间：从簇 2 起统计，字节数写入 $069A-$069C */
const freeCase = fat && {
  id: 'fs.free',
  title: `$7B/$06 统计空闲空间：${fat.freeClusters()} 个空闲簇 × ${fat.clusterBytes} 字节`,
  steps: [
    resetHandles,
    openStep(dosName(files[0].name83), 0),
    { func: 0x7b, sub: 0x06, mem: [[0x6530, [0x02, 0x00]]], maxFrames: 600, expect: [[DOS_ERROR, [0]], [0x69a, le(fat.freeClusters() * fat.clusterBytes, 3)]] },
    closeHandle,
  ],
};

/** 出错码：文件不存在 2；打开方式不小于 6 为 $28 */
const errorCases = [
  { id: 'fs.err.missing', title: '$7B/$09 打开不存在的文件，出错码 2', steps: [resetHandles, { ...openStep('NOFILE.TXT', 0, []), expect: [[DOS_ERROR, [0x02]]] }] },
  { id: 'fs.err.mode6', title: '$7B/$09 打开方式 6，出错码 $28', steps: [resetHandles, { ...openStep(dosName(files[0]?.name83 ?? 'A.B  '), 6, []), expect: [[DOS_ERROR, [0x28]]] }] },
];

/** 句柄重置：4 个句柄全部置为空闲 */
const resetCase = {
  id: 'fs.reset-handles',
  title: '$7B/$13 把 4 个句柄全部置为空闲（每项 $2C 字节，首字节 $FF）',
  steps: [
    { func: 0x7b, sub: 0x13, expect: [[HANDLE_TABLE, [0xff]], [HANDLE_TABLE + 0x2c, [0xff]], [HANDLE_TABLE + 0x58, [0xff]], [HANDLE_TABLE + 0x84, [0xff]]] },
  ],
};

export const cases = fat ? [resetCase, ...openCases, ...readCases, ...fatCases, freeCase, ...errorCases] : [];
