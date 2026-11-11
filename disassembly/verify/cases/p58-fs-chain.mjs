// ------------------------------------------------------------------------
// 名称：p58-fs-chain.mjs
// 说明：簇链相关文件服务的验证用例：$7B/$08 按偏移定位扇区、$7C/$0F 读整个文件、$7C/$05 与 $7C/$06 按偏移读写（簇链不连续的文件）、$7C/$0F 在簇链太短或中断时的出错、
//       $7C/$10 与 $7B/$0C 在空闲簇不连续的磁盘上分配簇链并写入、$7B/$06 统计空闲空间、根目录写满时的创建（$12）。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：特制镜像由原样镜像改写 FAT（两份）、数据扇区与根目录项得到；文件内容、簇链与空闲簇都来自镜像字节，预期值不依赖 BIOS 的输出：
//       定位的扇区号按“簇链里第 n 个簇 × 每簇扇区数”换算；读出的内容与按簇链拼出的字节比较；写入后保存镜像，按簇链把新字节放回原镜像后逐字节比较；
//       分配的簇链必须是空闲簇按编号从小到大的顺序。每簇扇区数不是 1 的情形只在 $7B/$08 用例里改写磁盘参数块模拟。
//       簇链中间遇到坏簇（$FF7）时核对读到哪里为止（链里的簇读入目的页，之后保持原样，见问题与结论登记 Q20）；软驱读写失败见 p58-fs-faults.mjs。
// ------------------------------------------------------------------------
import { readFileSync, writeFileSync } from 'node:fs';
import { runCall } from '../../tools/rom-driver.mjs';
import { PRISTINE_PATH, before, untouchedProblems } from '../lib/disk-check.mjs';
import { parseFat12 } from '../lib/fat12.mjs';
import { DOS_ERROR, FILE_MODE, PATH_BUFFER, ascii } from '../lib/fs-steps.mjs';
import { noise } from '../lib/restore.mjs';

const SECTOR = 512;
const FAT_BYTES = 9 * SECTOR;
const FILE_OFFSET = 0x6565;
const FILE_SIZE = 0x6568;
const FILE_START_PAGE = 0x656b;
const ALLOC_COUNT = 0x65a6;
const ALLOC_START = 0x65a7;
const HANDLE_OFFSET = 0x6561;
const HANDLE_ZERO_CLUSTER = 0x643b + 0x15;
const hex = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const le = (value, length) => Array.from({ length }, (_, i) => (value >> (8 * i)) & 0xff);

/** 调用文件服务，DOS_ERROR 预先写成非 0，调用后一并读回 */
const callFs = (client, func, sub, mem = [], read = [], maxFrames = 900) => runCall(client, { func, sub, mem: [...mem, [DOS_ERROR, [0x5a]]], read: [...read, [DOS_ERROR, 1]], maxFrames });
const errorOf = (result) => result.memory.get(DOS_ERROR)[0];
const openFile = async (client, name, mode) => {
  await callFs(client, 0x7b, 0x13);
  return callFs(client, 0x7b, 0x09, [[FILE_MODE, [mode]], [PATH_BUFFER, [...ascii(name), 0]]], [[HANDLE_OFFSET, 1]], 1500);
};
const closeFile = (client) => callFs(client, 0x7b, 0x0a, [[HANDLE_OFFSET, [0]]], [], 900);
const allocPages = async (client, count) => (await callFs(client, 0x7e, 0x00, [[ALLOC_COUNT, [count]]], [[ALLOC_START, 1]])).memory.get(ALLOC_START)[0];
const pageBase = (page) => (page - 0x80) * 0x1000;
const readPages = async (client, page, length) => Buffer.from(await client.read('pram', pageBase(page), length));
const writePages = async (client, page, data) => {
  for (let done = 0; done < data.length; done += 1024) await client.send(`write pram ${(pageBase(page) + done).toString(16)} ${data.subarray(done, done + 1024).toString('hex')}`);
};
const stopMotor = (client) => callFs(client, 0x80, 0x07, [], [], 300);

/** 保存模拟器里的磁盘镜像（原始字节），并把测试镜像还原 */
const saveRaw = async (client, ctx) => {
  await client.send('savedisk');
  const saved = readFileSync(ctx.image);
  ctx.restore();
  return saved;
};

const setFat12 = (fat, cluster, value) => {
  const offset = Math.floor((cluster * 3) / 2);
  if (cluster % 2 === 0) {
    fat[offset] = value & 0xff;
    fat[offset + 1] = (fat[offset + 1] & 0xf0) | ((value >> 8) & 0x0f);
  } else {
    fat[offset] = (fat[offset] & 0x0f) | ((value & 0x0f) << 4);
    fat[offset + 1] = (value >> 4) & 0xff;
  }
};
const setFatBoth = (image, cluster, value) => {
  setFat12(image.subarray(SECTOR, SECTOR + FAT_BYTES), cluster, value);
  setFat12(image.subarray(SECTOR + FAT_BYTES, SECTOR + 2 * FAT_BYTES), cluster, value);
};
const clusterData = (cluster) => Buffer.from(noise(cluster * 7 + 3, SECTOR));
const dataOffset = (cluster) => (33 + cluster - 2) * SECTOR;

/** 在镜像里加一个文件：簇链 clusters（最后一簇接 endValue）、数据扇区填内容、根目录里加目录项 */
const addFile = (image, name83, clusters, size, endValue = 0xfff) => {
  clusters.forEach((cluster, index) => {
    setFatBoth(image, cluster, index + 1 < clusters.length ? clusters[index + 1] : endValue);
    clusterData(cluster).copy(image, dataOffset(cluster));
  });
  for (let at = 19 * SECTOR; at < 33 * SECTOR; at += 32) {
    if (image[at] !== 0) continue;
    image.fill(0, at, at + 32);
    image.write(name83, at, 'latin1');
    image[at + 11] = 0x20;
    image.writeUInt16LE(clusters[0], at + 26);
    image.writeUInt32LE(size, at + 28);
    return;
  }
  throw new Error('根目录已满');
};

/** 按簇链拼出文件字节（数据取自镜像） */
const fileBytes = (image, clusters, size) => Buffer.concat(clusters.map((cluster) => image.subarray(dataOffset(cluster), dataOffset(cluster) + SECTOR))).subarray(0, size);

const FRAG = [1000, 1001, 1002, 1010, 1020, 1021, 1019, 1500, 1501, 1502, 1503, 1504, 2000, 2001, 1200];
const FRAG_SIZE = FRAG.length * SECTOR - 100;
const ALT = Array.from({ length: 40 }, (_, i) => 1600 + 2 * i);
const ALT_SIZE = ALT.length * SECTOR - 37;
const SHORT = [1300, 1301];
const SHORT_SIZE = 4096;
const MID = [1400, 1401, 1402];
const MID_SIZE = 3000;
const BAD = [1450, 1451];
const BAD_SIZE = 3000;

const cases = [];

if (before) {
  const pristine = readFileSync(PRISTINE_PATH);

  /** 簇链不连续的文件、簇链过短的文件、簇链中断的文件 */
  const fragImage = Buffer.from(pristine);
  addFile(fragImage, 'FRAG    BIN', FRAG, FRAG_SIZE);
  addFile(fragImage, 'ALT     BIN', ALT, ALT_SIZE);
  addFile(fragImage, 'SHORT   BIN', SHORT, SHORT_SIZE);
  addFile(fragImage, 'MID     BIN', MID, MID_SIZE, 0x000);
  addFile(fragImage, 'BADMID  BIN', BAD, BAD_SIZE, 0xff7);

  /** 空闲簇不连续的磁盘：728-927 里偶数簇标为坏簇，只剩奇数簇空闲 */
  const gapImage = Buffer.from(pristine);
  for (let cluster = 728; cluster < 928; cluster += 2) setFatBoth(gapImage, cluster, 0xff7);

  const imageCase = (id, title, image, host) => ({
    id,
    title,
    fresh: true,
    freshAfter: true,
    prepareImage: (ctx) => writeFileSync(ctx.image, image),
    steps: [{ host, check: ({ data }) => data }],
  });

  // ---- $7B/$08 按偏移定位扇区 ----
  const seekOffsets = [0, 1, 511, 512, 513, 1023, 1024, 1025, 1535, 1536, 1537, 2047, 2048, 2049, 2559, 2560, 3071, 3072, 3583, 3584, 4096, 4607, 4608, 5119, 5120, 5631, 5632, 6143, 6144, 6655, 6656, 7167, 7168, 7579, 7580, 7679, 7680, 7681, 8191, 8192, 15359, 15360, 100000, 0xffffff];
  for (const spc of [1, 2, 4]) {
    cases.push(imageCase(`fs.chain.seek-spc${spc}`, `$7B/$08 按偏移定位扇区（FRAG.BIN 的 15 个簇不连续，每簇 ${spc} 扇区）：偏移 0、各扇区与簇的边界、越过簇链的偏移；扇区号、扇区内偏移与出错码 $11 与按簇链算出的一致`, fragImage, async (client) => {
      const problems = [];
      const open = await openFile(client, 'FRAG.BIN', 0);
      if (errorOf(open) !== 0) return [`打开 FRAG.BIN 出错码 $${hex(errorOf(open))}`];
      if (spc !== 1) await client.send(`write cpu 64fb ${hex(spc)}${hex(Math.log2(spc))}`);
      const sectors = FRAG.flatMap((cluster) => Array.from({ length: spc }, (_, index) => 33 + (cluster - 2) * spc + index));
      for (const offset of seekOffsets) {
        const result = await callFs(client, 0x7b, 0x08, [[0x6564, [0]], [FILE_OFFSET, le(offset, 3)]], [[0x653c, 4]], 600);
        if (!result.done) { problems.push(`偏移 ${offset}：调用没有返回`); break; }
        const index = offset >> 9;
        const error = errorOf(result);
        const wantError = index < sectors.length ? 0 : 0x11;
        if (error !== wantError) { problems.push(`偏移 ${offset}：出错码 $${hex(error)}，预期 $${hex(wantError)}`); continue; }
        if (wantError === 0) {
          const got = [...result.memory.get(0x653c)];
          const want = [...le(sectors[index], 2), ...le(offset & 0x1ff, 2)];
          if (got.join() !== want.join()) problems.push(`偏移 ${offset}：$653C-$653F 为 ${got.map(hex).join(' ')}，预期 ${want.map(hex).join(' ')}`);
        }
        if (problems.length >= 8) break;
      }
      return problems;
    }));
  }

  // ---- $7C/$0F 读整个文件、$7C/$05 按偏移读 ----
  cases.push(imageCase('fs.chain.read-whole', '$7C/$0F 读整个文件：FRAG.BIN（15 个簇不连续，含倒退）与 ALT.BIN（40 个簇，每个簇单独一段）的内容与按簇链拼出的字节一致，$7C/$0D 取到的大小正确', fragImage, async (client) => {
    const problems = [];
    for (const [name, clusters, size] of [['FRAG.BIN', FRAG, FRAG_SIZE], ['ALT.BIN', ALT, ALT_SIZE]]) {
      const open = await openFile(client, name, 0);
      if (errorOf(open) !== 0) { problems.push(`${name}：打开出错码 $${hex(errorOf(open))}`); continue; }
      const sizeResult = await callFs(client, 0x7c, 0x0d, [], [[FILE_SIZE, 3]]);
      const got = [...sizeResult.memory.get(FILE_SIZE)];
      if (got.join() !== le(size, 3).join()) problems.push(`${name}：$7C/$0D 得到 ${got.map(hex).join(' ')}，预期 ${le(size, 3).map(hex).join(' ')}`);
      const page = await allocPages(client, Math.ceil(size / 4096));
      const read = await callFs(client, 0x7c, 0x0f, [[FILE_START_PAGE, [page]]], [], 3000);
      if (!read.done || errorOf(read) !== 0) problems.push(`${name}：读整个文件出错码 $${hex(errorOf(read))}`);
      const content = await readPages(client, page, size);
      const want = fileBytes(fragImage, clusters, size);
      const at = content.findIndex((byte, i) => byte !== want[i]);
      if (at >= 0) problems.push(`${name}：内容偏移 ${at} 为 ${hex(content[at])}，预期 ${hex(want[at])}`);
      await callFs(client, 0x7e, 0x01, [[ALLOC_COUNT, [Math.ceil(size / 4096)]], [ALLOC_START, [page]]]);
      await closeFile(client);
    }
    return problems;
  }));

  cases.push(imageCase('fs.chain.read-at', '$7C/$05 按偏移读 FRAG.BIN：长度与偏移跨扇区、跨不连续的簇、读到文件末尾，内容与按簇链拼出的字节一致', fragImage, async (client) => {
    const problems = [];
    const open = await openFile(client, 'FRAG.BIN', 0);
    if (errorOf(open) !== 0) return [`打开出错码 $${hex(errorOf(open))}`];
    const page = await allocPages(client, 2);
    const whole = fileBytes(fragImage, FRAG, FRAG_SIZE);
    for (const [offset, length] of [[0, 1], [1000, 100], [500, 600], [1500, 600], [1536, 512], [3000, 3000], [5100, 2000], [0, FRAG_SIZE], [7000, 580], [FRAG_SIZE - 1, 1], [100, FRAG_SIZE - 100], [1024, 1536], [2500, 1]]) {
      await writePages(client, page, Buffer.from(noise(offset + length, 4096)));
      const result = await callFs(client, 0x7c, 0x05, [[FILE_OFFSET, le(offset, 3)], [FILE_SIZE, le(length, 3)], [FILE_START_PAGE, [page]]], [], 3000);
      if (!result.done || errorOf(result) !== 0) { problems.push(`偏移 ${offset} 长度 ${length}：出错码 $${hex(errorOf(result))}`); continue; }
      // 一页放不下时只核对前 4096 字节
      const checked = Math.min(length, 4096);
      const content = await readPages(client, page, checked);
      const at = content.findIndex((byte, i) => byte !== whole[offset + i]);
      if (at >= 0) problems.push(`偏移 ${offset} 长度 ${length}：读出内容偏移 ${at} 为 ${hex(content[at])}，预期 ${hex(whole[offset + at])}`);
    }
    return problems.slice(0, 8);
  }));

  // ---- $7C/$0F、$7C/$05 遇到簇链太短或中断 ----
  cases.push(imageCase('fs.chain.broken-chain', '簇链与文件大小不符：SHORT.BIN（大小 4096，簇链只有 2 个簇）与 MID.BIN（簇链里有空闲簇）用 $7C/$0F 读整个文件出错码 $11；$7C/$05 偏移落在簇链之外出错码 $11，落在簇链之内正常', fragImage, async (client) => {
    const problems = [];
    for (const name of ['SHORT.BIN', 'MID.BIN']) {
      await openFile(client, name, 0);
      const page = await allocPages(client, 1);
      const read = await callFs(client, 0x7c, 0x0f, [[FILE_START_PAGE, [page]]], [], 3000);
      if (errorOf(read) !== 0x11) problems.push(`${name}：$7C/$0F 出错码 $${hex(errorOf(read))}，预期 $11`);
      await callFs(client, 0x7e, 0x01, [[ALLOC_COUNT, [1]], [ALLOC_START, [page]]]);
      await closeFile(client);
    }
    await openFile(client, 'SHORT.BIN', 0);
    const page = await allocPages(client, 1);
    const whole = fileBytes(fragImage, SHORT, 1024);
    for (const [offset, length, wantError] of [[0, 100, 0], [900, 100, 0], [1024, 10, 0x11], [4000, 10, 0x11], [4090, 10, 0x14], [4096, 1, 0x14]]) {
      const result = await callFs(client, 0x7c, 0x05, [[FILE_OFFSET, le(offset, 3)], [FILE_SIZE, le(length, 3)], [FILE_START_PAGE, [page]]], [], 3000);
      if (errorOf(result) !== wantError) problems.push(`SHORT.BIN 偏移 ${offset} 长度 ${length}：出错码 $${hex(errorOf(result))}，预期 $${hex(wantError)}`);
      else if (wantError === 0) {
        const content = await readPages(client, page, length);
        if (!content.equals(whole.subarray(offset, offset + length))) problems.push(`SHORT.BIN 偏移 ${offset} 长度 ${length}：内容不一致`);
      }
    }
    return problems;
  }));

  cases.push(imageCase('fs.chain.bad-cluster', '簇链里的下一簇是坏簇 $FF7（BADMID.BIN：大小 3000，簇链 1450、1451 后接 $FF7）：$7C/$0F 读整个文件不会死循环，返回非 0 出错码（实测为磁盘出错码 $10，不是 $11）；链里的两个簇已读入目的页，之后的扇区保持调用前的 $A5', fragImage, async (client) => {
    const problems = [];
    await openFile(client, 'BADMID.BIN', 0);
    const page = await allocPages(client, 1);
    await writePages(client, page, Buffer.alloc(4096, 0xa5));
    const read = await callFs(client, 0x7c, 0x0f, [[FILE_START_PAGE, [page]]], [], 6000);
    if (!read.done) problems.push('调用没有返回');
    else if (errorOf(read) === 0) problems.push('出错码为 0，预期读文件失败');
    else if (errorOf(read) !== 0x10) problems.push(`出错码 $${hex(errorOf(read))}，实测为 $10`);
    else {
      // 簇链 1450、1451 是连续扇区，合成一次磁盘调用读入；下一簇 $FF7 换算的扇区在盘外，参数检查不过，什么也没读
      const got = await readPages(client, page, 4096);
      const want = Buffer.concat([fileBytes(fragImage, BAD, BAD.length * SECTOR), Buffer.alloc(4096 - BAD.length * SECTOR, 0xa5)]);
      if (!got.equals(want)) problems.push('目的页内容与预期不符：前 1024 字节应是簇 1450、1451 的内容，其余保持 $A5');
    }
    return problems;
  }));

  // ---- $7C/$06 按偏移写（簇链不连续） ----
  cases.push(imageCase('fs.chain.write-at', '$7C/$06 按偏移写 FRAG.BIN（方式 2）：跨扇区、跨不连续的簇的 8 段写入，关闭后镜像只有这些字节变化，目录项、FAT 与其余文件不变', fragImage, async (client, _history, ctx) => {
    const problems = [];
    const open = await openFile(client, 'FRAG.BIN', 2);
    if (errorOf(open) !== 0) return [`打开出错码 $${hex(errorOf(open))}`];
    const expected = Buffer.from(fragImage);
    const page = await allocPages(client, 2);
    for (const [offset, length] of [[0, 10], [505, 20], [1020, 10], [1530, 20], [3070, 10], [7570, 10], [2000, 3000], [4095, 2]]) {
      const pattern = Buffer.from(noise(offset * 3 + length, length));
      await writePages(client, page, pattern);
      const result = await callFs(client, 0x7c, 0x06, [[FILE_OFFSET, le(offset, 3)], [FILE_SIZE, le(length, 3)], [FILE_START_PAGE, [page]]], [], 3000);
      if (!result.done || errorOf(result) !== 0) { problems.push(`偏移 ${offset} 长度 ${length}：出错码 $${hex(errorOf(result))}`); continue; }
      for (let k = 0; k < length; k++) expected[dataOffset(FRAG[(offset + k) >> 9]) + ((offset + k) & 0x1ff)] = pattern[k];
    }
    await closeFile(client);
    await stopMotor(client);
    const saved = await saveRaw(client, ctx);
    const at = saved.findIndex((byte, i) => byte !== expected[i]);
    if (at >= 0) problems.push(`镜像偏移 ${at}（扇区 ${Math.floor(at / SECTOR)}）为 ${hex(saved[at])}，预期 ${hex(expected[at])}`);
    return problems.slice(0, 8);
  }));

  // ---- 空闲簇不连续时的 $7B/$0C 与 $7C/$10 ----
  const freeList = (image) => {
    const fat = parseFat12(image);
    const list = [];
    for (let cluster = 2; cluster < fat.clusterCount + 2; cluster++) if (fat.fatEntry(cluster) === 0) list.push(cluster);
    return list;
  };
  const gapFree = freeList(gapImage);
  const readHint = async (client) => {
    const result = await callFs(client, 0x7b, 0x01, [[0x652e, [1, 0]]], [[0x6530, 2]], 900);
    return result.memory.get(0x6530)[0] | (result.memory.get(0x6530)[1] << 8);
  };

  cases.push(imageCase('fs.chain.write-gaps', '$7C/$10 在空闲簇不连续的磁盘上写 3000 与 20000 字节的新文件：簇链是空闲簇按编号递增的顺序，内容完整，空闲簇减少 6 与 40，两份 FAT 一致，其余文件不变', gapImage, async (client, _history, ctx) => {
    const problems = [];
    const hint = await readHint(client);
    const pool = gapFree.filter((cluster) => cluster >= hint);
    let used = 0;
    const made = [];
    for (const [name, length] of [['WR1.BIN', 3000], ['WR2.BIN', 20000]]) {
      const data = Buffer.from(noise(length, length));
      const open = await openFile(client, name, 1);
      if (errorOf(open) !== 0) { problems.push(`${name}：创建出错码 $${hex(errorOf(open))}`); break; }
      const pages = Math.ceil(length / 4096);
      const page = await allocPages(client, pages);
      await writePages(client, page, data);
      const write = await callFs(client, 0x7c, 0x10, [[FILE_SIZE, le(length, 3)], [FILE_START_PAGE, [page]]], [], 4000);
      if (!write.done || errorOf(write) !== 0) problems.push(`${name}：写文件出错码 $${hex(errorOf(write))}`);
      await closeFile(client);
      await callFs(client, 0x7e, 0x01, [[ALLOC_COUNT, [pages]], [ALLOC_START, [page]]]);
      const clusters = Math.ceil(length / SECTOR);
      made.push({ name, data, want: pool.slice(used, used + clusters) });
      used += clusters;
    }
    await stopMotor(client);
    const saved = parseFat12(await saveRaw(client, ctx));
    for (const { name, data, want } of made) {
      const entry = saved.listRoot().find((item) => item.name83 === `${name.slice(0, 3)}     ${name.slice(4)}`);
      if (!entry) { problems.push(`没有找到 ${name}`); continue; }
      const chain = saved.chain(entry.cluster);
      if (chain.join() !== want.join()) problems.push(`${name} 的簇链 ${chain.slice(0, 8).join(',')}…，预期 ${want.slice(0, 8).join(',')}…`);
      if (entry.size !== data.length || !saved.readFile(entry).equals(data)) problems.push(`${name} 的大小或内容不对`);
    }
    if (saved.freeClusters() !== gapFree.length - used) problems.push(`空闲簇预期 ${gapFree.length - used}，实际 ${saved.freeClusters()}`);
    if (!saved.fatCopiesMatch()) problems.push('两份 FAT 不一致');
    return [...problems, ...untouchedProblems(saved, ['WR1     BIN', 'WR2     BIN'])];
  }));

  cases.push(imageCase('fs.chain.alloc-for-size', '$7B/$0C 按大小补足簇链：方式 1 新建文件已有 1 个簇，FILE_SIZE 取 1、512、513、1024、1025、3000、4096 字节时，句柄的簇链长度等于所需簇数，簇取自空闲簇的递增顺序，末尾接链尾 $FFF', gapImage, async (client, _history, ctx) => {
    const problems = [];
    const hint = await readHint(client);
    const pool = gapFree.filter((cluster) => cluster >= hint);
    let used = 0;
    const sizes = [1, 512, 513, 1024, 1025, 3000, 4096];
    for (const [index, size] of sizes.entries()) {
      const open = await openFile(client, `A${index}.BIN`, 1);
      if (errorOf(open) !== 0) { problems.push(`大小 ${size}：创建出错码 $${hex(errorOf(open))}`); break; }
      const first = pool[used++];
      const result = await callFs(client, 0x7b, 0x0c, [[FILE_SIZE, le(size, 3)], [HANDLE_OFFSET, [0]]], [[HANDLE_ZERO_CLUSTER, 2]], 900);
      if (!result.done || errorOf(result) !== 0) { problems.push(`大小 ${size}：$7B/$0C 出错码 $${hex(errorOf(result))}`); continue; }
      const handleCluster = result.memory.get(HANDLE_ZERO_CLUSTER)[0] | (result.memory.get(HANDLE_ZERO_CLUSTER)[1] << 8);
      if (handleCluster !== first) problems.push(`大小 ${size}：起始簇 ${handleCluster}，预期 ${first}`);
      const needed = Math.ceil(size / SECTOR);
      const want = pool.slice(used - 1, used - 1 + needed);
      used += needed - 1;
      // 读缓存里的 FAT 沿簇链走
      const cache = Buffer.concat([Buffer.from(await client.read('pram', (0xf5 - 0x80) * 0x1000, 0x1000)), Buffer.from(await client.read('pram', (0xf5 - 0x80) * 0x1000 + 0x1000, 0x400))]).subarray(SECTOR);
      const entryOf = (cluster) => {
        const offset = Math.floor((cluster * 3) / 2);
        const word = cache[offset] | (cache[offset + 1] << 8);
        return cluster % 2 === 0 ? word & 0xfff : word >> 4;
      };
      const chain = [];
      let cluster = first;
      while (cluster >= 2 && cluster < 0xff8 && chain.length < 100) { chain.push(cluster); cluster = entryOf(cluster); }
      if (chain.join() !== want.join()) problems.push(`大小 ${size}：簇链 ${chain.join(',')}，预期 ${want.join(',')}`);
      else if (cluster < 0xff8) problems.push(`大小 ${size}：簇链没有以链尾结束（${cluster}）`);
      await closeFile(client);
    }
    await stopMotor(client);
    await saveRaw(client, ctx);
    return problems.slice(0, 8);
  }));

  // ---- $7B/$06 统计空闲空间 ----
  for (const [name, image] of [['pristine', pristine], ['gaps', gapImage]]) {
    cases.push(imageCase(`fs.chain.free-space-${name}`, `$7B/$06 统计空闲空间（${name === 'gaps' ? '空闲簇不连续的磁盘' : '原样镜像'}）：从不同的起始簇统计到簇号上限，字节数等于空闲簇数乘每簇字节数（每簇 1、2 扇区）`, image, async (client) => {
      const problems = [];
      const fat = parseFat12(image);
      await callFs(client, 0x7b, 0x01, [[0x652e, [1, 0]]], [], 900);
      const limit = (await client.read('cpu', 0x6502, 2)).reduce((sum, byte, i) => sum + (byte << (8 * i)), 0);
      for (const spc of [1, 2]) {
        if (spc === 2) await client.send(`write cpu 64fb 0201`);
        for (const start of [2, 3, 100, 727, 728, 729, 1000, 2000, 2380, 2389, 2390, 2846, limit - 1, limit, limit + 1, 3000]) {
          let count = 0;
          for (let cluster = start; cluster < limit; cluster++) if (fat.fatEntry(cluster) === 0) count++;
          const result = await callFs(client, 0x7b, 0x06, [[0x6530, le(start, 2)], [0x69a, [0xee, 0xee, 0xee]]], [[0x69a, 3]], 3000);
          if (!result.done) { problems.push(`起始簇 ${start}：调用没有返回`); break; }
          const bytes = result.memory.get(0x69a);
          const got = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16);
          const want = count * spc * SECTOR;
          if (got !== want) problems.push(`每簇 ${spc} 扇区、起始簇 ${start}：${got} 字节，预期 ${want}`);
          if (problems.length >= 8) return problems;
        }
      }
      return problems;
    }));
  }

  // ---- 根目录写满 ----
  const fullRoot = Buffer.from(pristine);
  let fullCount = 0;
  for (let at = 19 * SECTOR; at < 33 * SECTOR; at += 32) {
    if (fullRoot[at] !== 0 && fullRoot[at] !== 0xe5) continue;
    fullRoot.fill(0, at, at + 32);
    fullRoot.write(`X${String(fullCount++).padStart(3, '0')}    TXT`, at, 'latin1');
    fullRoot[at + 11] = 0x20;
  }
  const holeRoot = Buffer.from(fullRoot);
  const HOLE = 100;
  holeRoot[19 * SECTOR + HOLE * 32] = 0xe5;

  cases.push(imageCase('fs.chain.root-full', '根目录 224 项全部占满：方式 1 创建 NEW.TXT 与 $7D/$02 建目录 NEWDIR 都出错码 $12，磁盘上没有任何变化', fullRoot, async (client, _history, ctx) => {
    const problems = [];
    await callFs(client, 0x7b, 0x13);
    const create = await callFs(client, 0x7b, 0x09, [[FILE_MODE, [1]], [PATH_BUFFER, [...ascii('NEW.TXT'), 0]]], [], 1500);
    if (errorOf(create) !== 0x12) problems.push(`创建文件出错码 $${hex(errorOf(create))}，预期 $12`);
    await callFs(client, 0x7b, 0x13);
    const mkdir = await callFs(client, 0x7d, 0x02, [[PATH_BUFFER, [...ascii('NEWDIR'), 0]]], [], 1500);
    if (errorOf(mkdir) !== 0x12) problems.push(`建目录出错码 $${hex(errorOf(mkdir))}，预期 $12`);
    await stopMotor(client);
    const saved = await saveRaw(client, ctx);
    const at = saved.findIndex((byte, i) => byte !== fullRoot[i]);
    if (at >= 0) problems.push(`镜像偏移 ${at}（扇区 ${Math.floor(at / SECTOR)}）有变化`);
    return problems;
  }));

  cases.push(imageCase('fs.chain.root-hole', '根目录只剩第 100 项是已删除的空位：创建 NEW.TXT 成功并占用这一项，其余目录项不变', holeRoot, async (client, _history, ctx) => {
    const problems = [];
    await callFs(client, 0x7b, 0x13);
    const create = await callFs(client, 0x7b, 0x09, [[FILE_MODE, [1]], [PATH_BUFFER, [...ascii('NEW.TXT'), 0]]], [], 1500);
    if (errorOf(create) !== 0) problems.push(`创建文件出错码 $${hex(errorOf(create))}`);
    await closeFile(client);
    await stopMotor(client);
    const saved = await saveRaw(client, ctx);
    const at = 19 * SECTOR + HOLE * 32;
    if (saved.toString('latin1', at, at + 11) !== 'NEW     TXT') problems.push(`第 100 项是 "${saved.toString('latin1', at, at + 11)}"`);
    for (let entry = 0; entry < 224; entry++) {
      if (entry === HOLE) continue;
      const base = 19 * SECTOR + entry * 32;
      if (!saved.subarray(base, base + 32).equals(holeRoot.subarray(base, base + 32))) { problems.push(`第 ${entry} 项变了`); break; }
    }
    return problems;
  }));
}

export { cases };
