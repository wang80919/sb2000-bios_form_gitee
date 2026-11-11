// ------------------------------------------------------------------------
// 名称：p58-fs-dir-edge.mjs
// 说明：目录服务的边界情形验证用例：只读目录不能删（$7D/$03）、子目录写满时创建文件要给它再分配一个簇（空闲簇够与不够两种）。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-11
// 备注：镜像由原样镜像改写得到（verify/lib/fs-image.mjs）：目录项、目录簇与 FAT 的字节都是用例自己写的，预期值不取自 BIOS 的输出。
//       预期的出错码来自 fcdev 仓库 docs/sb2000/02-系统调用手册.md：只读目录删除出错码 5（4.6 节 $7D/$03），磁盘空间不够出错码 $2C（第 6 节）。
//       空闲簇只剩 1 个时，创建文件需要 1 个簇扩展写满的目录、1 个簇给文件，所以必然失败（出错码 $2C）。先试错得到的事实：目录扩展在先、文件分配在后，后者失败时前者不回滚，
//       预期磁盘只多出目录的第二个簇（FAT 两份一致、簇清 0），读代码（fs-open-and-io.asm 的 FS_FIND_FREE_DIR_ENTRY 与 FS_OPEN 的分配）与此相符。
// ------------------------------------------------------------------------
import { readFileSync, writeFileSync } from 'node:fs';
import { PRISTINE_PATH, before } from '../lib/disk-check.mjs';
import { parseFat12 } from '../lib/fat12.mjs';
import { DOS_ERROR, FILE_MODE, PATH_BUFFER, ascii, noError, resetHandles } from '../lib/fs-steps.mjs';
import { addRootEntry, clusterOffset, dirEntry, fillFreeClusters, freeClusters, setFatBoth, writeDirCluster } from '../lib/fs-image.mjs';

const stopMotor = { func: 0x80, sub: 0x07, maxFrames: 200 };
const cases = [];

/** 保存模拟器里的磁盘镜像（原始字节），并把测试镜像还原 */
const saveRaw = (check) => ({
  host: async (client, _history, ctx) => {
    await client.send('savedisk');
    const saved = readFileSync(ctx.image);
    ctx.restore();
    return saved;
  },
  check: ({ data }) => check(data),
});

const imageCase = (spec, image) => ({ ...spec, fresh: true, freshAfter: true, prepareImage: (ctx) => writeFileSync(ctx.image, image) });

if (before) {
  const pristine = readFileSync(PRISTINE_PATH);
  const dotEntries = (cluster) => [dirEntry('.', 0x10, cluster), dirEntry('..', 0x10, 0)];
  const same = (saved, expected, label) => {
    if (saved.equals(expected)) return [];
    const now = parseFat12(saved);
    const old = parseFat12(expected);
    const changed = [];
    for (let cluster = 2; cluster < old.clusterCount + 2 && changed.length < 6; cluster++) {
      if (now.fatEntry(cluster) !== old.fatEntry(cluster)) changed.push(`簇 ${cluster}：$${old.fatEntry(cluster).toString(16)} → $${now.fatEntry(cluster).toString(16)}`);
    }
    let at = 0;
    while (saved[at] === expected[at]) at++;
    return [`${label}：首个差异在字节 ${at}（扇区 ${Math.floor(at / 512)}）；FAT 项变化：${changed.length ? changed.join('、') : '无'}；两份 FAT ${now.fatCopiesMatch() ? '一致' : '不一致'}`];
  };

  // ---- 只读目录 ----
  const roImage = Buffer.from(pristine);
  const freeList = freeClusters(roImage);
  const [roCluster, rwCluster] = freeList;
  addRootEntry(roImage, dirEntry('ROD', 0x11, roCluster));
  writeDirCluster(roImage, roCluster, dotEntries(roCluster));
  addRootEntry(roImage, dirEntry('RWD', 0x10, rwCluster));
  writeDirCluster(roImage, rwCluster, dotEntries(rwCluster));

  cases.push(imageCase({
    id: 'fs.dedge.rmdir-readonly',
    title: '$7D/$03 删只读目录 ROD（属性 $11）：出错码 5，目录与磁盘一个字节都不变',
    steps: [
      resetHandles,
      { func: 0x7d, sub: 0x03, mem: [[PATH_BUFFER, [...ascii('ROD'), 0]]], expect: [[DOS_ERROR, [5]]], maxFrames: 1500 },
      stopMotor,
      saveRaw((saved) => same(saved, roImage, '保存的镜像与原镜像不同')),
    ],
  }, roImage));

  cases.push(imageCase({
    id: 'fs.dedge.rmdir-normal',
    title: '$7D/$03 删不是只读的空目录 RWD（属性 $10，对照）：出错码 0，目录项首字节 $E5，它的簇释放，其余不变',
    steps: [
      resetHandles,
      { func: 0x7d, sub: 0x03, mem: [[PATH_BUFFER, [...ascii('RWD'), 0]]], expect: noError, maxFrames: 1500 },
      stopMotor,
      saveRaw((saved) => {
        const after = parseFat12(saved);
        const problems = [];
        const entries = after.listRoot();
        if (entries.some((e) => e.name83.startsWith('RWD'))) problems.push('RWD 的目录项还在');
        if (after.fatEntry(rwCluster) !== 0) problems.push(`簇 ${rwCluster} 没有释放`);
        if (!entries.some((e) => e.name83.startsWith('ROD') && e.attr === 0x11)) problems.push('ROD 变了');
        return problems;
      }),
    ],
  }, roImage));

  // ---- 子目录写满时创建文件 ----
  /** 子目录 FULLDIR：16 个目录项（含 . 与 ..）把一个簇占满，只留 keepFree 个空闲簇 */
  const fullDirImage = (keepFree) => {
    const image = Buffer.from(pristine);
    const dirCluster = freeClusters(image)[0];
    addRootEntry(image, dirEntry('FULLDIR', 0x10, dirCluster));
    const files = Array.from({ length: 14 }, (_, i) => dirEntry(`F${String(i + 1).padStart(2, '0')}     TXT`, 0x20, 0, 0));
    writeDirCluster(image, dirCluster, [...dotEntries(dirCluster), ...files]);
    fillFreeClusters(image, keepFree);
    return { image, dirCluster };
  };
  const create = (maxFrames) => ({ func: 0x7b, sub: 0x09, mem: [[FILE_MODE, [1]], [PATH_BUFFER, [...ascii('FULLDIR\\NEW.TXT'), 0]]], maxFrames });

  {
    // 创建文件时先给写满的目录扩展一个簇（扩展的簇清 0、写盘），再给文件分配簇；后一步失败时目录扩展不回滚（FS_FIND_FREE_DIR_ENTRY 在前、$7B/$09 里的 FS_ALLOC_CHAIN 在后）
    const { image, dirCluster } = fullDirImage(1);
    const spare = freeClusters(image)[0];
    const expected = Buffer.from(image);
    setFatBoth(expected, dirCluster, spare);
    setFatBoth(expected, spare, 0xfff);
    expected.fill(0, clusterOffset(spare), clusterOffset(spare) + 512);
    cases.push(imageCase({
      id: 'fs.dedge.create-dir-full-disk-full',
      title: '子目录 FULLDIR 已写满 16 项且磁盘只剩 1 个空闲簇：$7B/$09 方式 1 创建 FULLDIR\\NEW.TXT，出错码 $2C；目录已先用掉最后一个簇扩展成 2 个簇（不回滚，新簇清 0），文件没有创建，其余一个字节都不变',
      steps: [
        resetHandles,
        { ...create(6000), expect: [[DOS_ERROR, [0x2c]]] },
        stopMotor,
        saveRaw((saved) => same(saved, expected, '保存的镜像与预期不同')),
      ],
    }, image));
  }
  {
    const { image, dirCluster } = fullDirImage(2);
    cases.push(imageCase({
      id: 'fs.dedge.create-dir-full-extend',
      title: '子目录 FULLDIR 已写满 16 项，磁盘有 2 个空闲簇（对照）：创建 FULLDIR\\NEW.TXT 成功，目录扩展成 2 个簇，新目录项在第二个簇里，空闲簇用完',
      steps: [
        resetHandles,
        { ...create(6000), expect: noError },
        { func: 0x7b, sub: 0x0a, mem: [[0x6561, [0]]], maxFrames: 3000 },
        stopMotor,
        saveRaw((saved) => {
          const after = parseFat12(saved);
          const problems = [];
          const chain = after.chain(dirCluster);
          if (chain.length !== 2) return [`FULLDIR 的簇链长 ${chain.length}，预期 2`];
          const entries = after.listDir(dirCluster);
          const index = entries.findIndex((e) => e.name83 === 'NEW     TXT');
          if (index < 0) problems.push('没有找到 NEW.TXT');
          else if (index !== 16) problems.push(`NEW.TXT 是目录里第 ${index + 1} 项，预期第 17 项（第二个簇的第一项）`);
          if (entries.length !== 17) problems.push(`目录共 ${entries.length} 项，预期 17`);
          if (freeClusters(saved).length !== 0) problems.push(`还剩 ${freeClusters(saved).length} 个空闲簇，预期 0`);
          return problems;
        }),
      ],
    }, image));
  }
}

export { cases };
