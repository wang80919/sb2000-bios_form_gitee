// ------------------------------------------------------------------------
// 名称：p58-fs-fatcache.mjs
// 说明：FAT 缓存与扇区服务的验证用例：$7B/$07 重置缓存、$7B/$01 取扇区（缓存内与直接读盘）、$7B/$02 写扇区（缓存内与直接写盘）、$7B/$0F 写 FAT 项、$7B/$10 写回两份 FAT、$7B/$05 读 FAT 项、$7B/$00 前进到下一扇区。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：FAT 缓存在扩展 RAM 页 $F5 起（引导扇区加 9 个 FAT 扇区，共 10 个扇区），用例直接读页内字节与原样镜像对照；预期的 FAT 字节按 FAT12 规范（簇号 ×1.5，奇数簇取高 12 位）独立计算。
//       $7B/$00 的预期由 verify 里按汇编逻辑转录的模型给出：扇区号分成 引导扇区、第一份 FAT、其余 FAT 间隙、根目录、数据区几个区域，数据区里按簇链前进；簇链来自（特制的）镜像解析。
//       读写软驱出错状态见 p58-fs-faults.mjs；FAT 项值超过 12 位的输入与簇号超过 FAT 范围的 $7B/$0F、$7B/$05 见 p58-fs-fat-range.mjs。
// ------------------------------------------------------------------------
import { readFileSync, writeFileSync } from 'node:fs';
import { PRISTINE_PATH, before } from '../lib/disk-check.mjs';
import { CACHE_PRAM, CLUSTER, FAT_BYTES, FAT_VALUE_IN, FAT_VALUE_OUT, FS_LBA, SECTOR, SECTOR_BUFFER, call, firstDifference, hex, le16, readCache, saveRaw, setFat12 } from '../lib/fat-cache.mjs';
import { parseFat12 } from '../lib/fat12.mjs';
import { DOS_ERROR } from '../lib/fs-steps.mjs';
import { noise, withRestore } from '../lib/restore.mjs';

const cases = [];

if (before) {
  const pristine = readFileSync(PRISTINE_PATH);
  const pristineCache = pristine.subarray(0, 10 * SECTOR);
  const sectorOf = (image, lba) => image.subarray(lba * SECTOR, (lba + 1) * SECTOR);

  // ---- $07 重置缓存状态 ----
  cases.push({
    id: 'fs.fatc.reset-state',
    title: '$7B/$07 重置 FAT 缓存状态：$6584、$6585 清 0，$657E、$657F 置 $0A',
    steps: [{ func: 0x7b, sub: 0x07, mem: [[0x6584, [0xff, 0xff]], [0x657e, [0x55, 0x66]]], expect: [[DOS_ERROR, [0]], [0x6584, [0, 0]], [0x657e, [0x0a, 0x0a]]] }],
  });

  // ---- $01 取扇区：缓存内与直接读盘 ----
  cases.push({
    id: 'fs.fatc.load-sectors',
    title: '$7B/$01 取扇区：重置后第一次装入整个缓存（$6585 变 $80）；扇区 0-9 从缓存取出，并算出缓存位置（$6580-$6583）；扇区 10 起直接读盘；内容与镜像逐字节一致',
    fresh: true,
    steps: [{
      host: async (client) => {
        const problems = [];
        await call(client, 0x07);
        const lbas = [1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 17, 18, 19, 20, 32, 33, 34, 727 + 31, 1000, 2879];
        for (const [index, lba] of lbas.entries()) {
          const result = await call(client, 0x01, [[FS_LBA, le16(lba)], [SECTOR_BUFFER, noise(lba + 1, SECTOR)]], [[SECTOR_BUFFER, SECTOR], [0x6580, 4], [0x6585, 1]], 900);
          if (!result.done) { problems.push(`扇区 ${lba}：调用没有返回`); break; }
          const error = result.memory.get(DOS_ERROR)[0];
          if (error !== 0) problems.push(`扇区 ${lba}：出错码 $${hex(error)}`);
          const diff = firstDifference(Buffer.from(result.memory.get(SECTOR_BUFFER)), sectorOf(pristine, lba), `扇区 ${lba} 的内容`);
          if (diff) problems.push(diff);
          if (lba <= 9) {
            const got = [...result.memory.get(0x6580)];
            const want = [lba, 0x00, 0xb0 + 2 * (lba & 7), 0xf5 + (lba >> 3)];
            if (got.join() !== want.join()) problems.push(`扇区 ${lba}：$6580-$6583 为 ${got.map(hex).join(' ')}，预期 ${want.map(hex).join(' ')}`);
          }
          if (index === 0 && result.memory.get(0x6585)[0] !== 0x80) problems.push(`第一次装入后 $6585 为 ${hex(result.memory.get(0x6585)[0])}，预期 80`);
          if (problems.length >= 8) break;
        }
        const diff = firstDifference(await readCache(client), pristineCache, '装入后的缓存');
        if (diff) problems.push(diff);
        return problems;
      },
      check: ({ data }) => data,
    }],
  });

  // ---- $01 / $0F / $07：缓存里的修改在没有重置时保留，重置后重新装入 ----
  cases.push({
    id: 'fs.fatc.dirty-kept-reset-reload',
    title: '$7B/$0F 改缓存里的 FAT 项后：再次 $7B/$01 不重新装入（修改保留）；$7B/$07 重置后再 $7B/$01 重新从磁盘装入（修改消失）',
    fresh: true,
    steps: [{
      host: async (client) => {
        const problems = [];
        const model = Buffer.from(pristine.subarray(0, 10 * SECTOR));
        setFat12(model.subarray(SECTOR), 100, 0x555);
        await call(client, 0x07);
        await call(client, 0x01, [[FS_LBA, [1, 0]]], [], 900);
        await call(client, 0x0f, [[CLUSTER, le16(100)], [FAT_VALUE_IN, le16(0x555)]]);
        let diff = firstDifference(await readCache(client), model, '改 FAT 项后的缓存');
        if (diff) problems.push(diff);
        await call(client, 0x01, [[FS_LBA, [2, 0]]], [], 900);
        diff = firstDifference(await readCache(client), model, '再次取扇区后的缓存（应保留修改）');
        if (diff) problems.push(diff);
        const read = await call(client, 0x05, [[CLUSTER, le16(100)]], [[FAT_VALUE_OUT, 2]]);
        if ([...read.memory.get(FAT_VALUE_OUT)].join() !== le16(0x555).join()) problems.push(`读簇 100 得到 ${[...read.memory.get(FAT_VALUE_OUT)].map(hex).join(' ')}，预期 55 05`);
        await call(client, 0x07);
        await call(client, 0x01, [[FS_LBA, [3, 0]]], [[0x6585, 1]], 900);
        diff = firstDifference(await readCache(client), pristineCache, '重置并重新装入后的缓存（应与磁盘一致）');
        if (diff) problems.push(diff);
        return problems;
      },
      check: ({ data }) => data,
    }],
  });

  // ---- $02 写扇区 ----
  {
    const storeLbas = [0, 1, 5, 9, 10, 15, 19, 2000, 2879];
    cases.push({
      id: 'fs.fatc.store-sectors',
      title: '$7B/$02 把 $6000 起的扇区缓冲写到扇区 0、1、5、9、10、15、19、2000、2879：磁盘上只有该扇区被改写；扇区 0-9 同时更新缓存，其余扇区缓存不变',
      fresh: true,
      freshAfter: true,
      steps: [{
        host: async (client, _history, ctx) => {
          const problems = [];
          await call(client, 0x01, [[FS_LBA, [1, 0]]], [], 900);
          const expectedDisk = Buffer.from(pristine);
          const expectedCache = Buffer.from(pristineCache);
          for (const lba of storeLbas) {
            const pattern = Buffer.from(noise(lba + 100, SECTOR));
            const result = await call(client, 0x02, [[FS_LBA, le16(lba)], [SECTOR_BUFFER, [...pattern]]], [], 900);
            if (!result.done) { problems.push(`扇区 ${lba}：调用没有返回`); break; }
            if (result.memory.get(DOS_ERROR)[0] !== 0) problems.push(`扇区 ${lba}：出错码 $${hex(result.memory.get(DOS_ERROR)[0])}`);
            pattern.copy(expectedDisk, lba * SECTOR);
            if (lba <= 9) pattern.copy(expectedCache, lba * SECTOR);
            const diff = firstDifference(await readCache(client), expectedCache, `写扇区 ${lba} 后的缓存`);
            if (diff) problems.push(diff);
          }
          const saved = await saveRaw(client, ctx);
          const diff = firstDifference(saved, expectedDisk, '保存后的磁盘镜像');
          if (diff) problems.push(diff);
          return problems.slice(0, 8);
        },
        check: ({ data }) => data,
      }],
    });
  }

  // ---- $0F 写 FAT 项（缓存）→ $05 读回 → $10 写回两份 FAT ----
  {
    const clusters = [2, 3, 4, 5, 339, 340, 341, 342, 343, 681, 682, 683, 1023, 1024, 1365, 2848, 2849, 3070, 3071];
    const values = [0x000, 0x001, 0xfff, 0xff7, 0x123, 0xabc, 0x800, 0x0f0, 0xf00];
    cases.push({
      id: 'fs.fatc.set-get-writeback',
      title: '$7B/$0F 写 FAT 项（偶数、奇数、跨扇区的簇号 × 9 种值）：缓存与按 FAT12 规范改写的 FAT 逐字节一致，$7B/$05 读回同值；$7B/$10 写回后磁盘上两份 FAT 与缓存一致，其余扇区不变',
      fresh: true,
      freshAfter: true,
      steps: [{
        host: async (client, _history, ctx) => {
          const problems = [];
          await call(client, 0x01, [[FS_LBA, [1, 0]]], [], 900);
          const modelFat = Buffer.from(pristine.subarray(SECTOR, SECTOR + FAT_BYTES));
          for (const cluster of clusters) {
            for (const value of values) {
              const result = await call(client, 0x0f, [[CLUSTER, le16(cluster)], [FAT_VALUE_IN, le16(value)]]);
              setFat12(modelFat, cluster, value);
              const label = `簇 ${cluster} 写 $${value.toString(16)}`;
              if (!result.done) { problems.push(`${label}：调用没有返回`); break; }
              if (result.memory.get(DOS_ERROR)[0] !== 0) problems.push(`${label}：出错码 $${hex(result.memory.get(DOS_ERROR)[0])}`);
              const cache = await readCache(client);
              const diff = firstDifference(cache.subarray(SECTOR), modelFat, `${label} 后的 FAT 缓存`) ?? firstDifference(cache.subarray(0, SECTOR), pristineCache.subarray(0, SECTOR), `${label} 后的引导扇区缓存`);
              if (diff) problems.push(diff);
              const read = await call(client, 0x05, [[CLUSTER, le16(cluster)]], [[FAT_VALUE_OUT, 2]]);
              const got = read.memory.get(FAT_VALUE_OUT)[0] | (read.memory.get(FAT_VALUE_OUT)[1] << 8);
              if (got !== value) problems.push(`${label}：$7B/$05 读回 $${got.toString(16)}`);
              if (problems.length >= 8) return problems;
            }
          }
          const result = await call(client, 0x10, [], [], 3000);
          if (!result.done) return ['$7B/$10 没有返回'];
          if (result.memory.get(DOS_ERROR)[0] !== 0) problems.push(`$7B/$10 出错码 $${hex(result.memory.get(DOS_ERROR)[0])}`);
          const expected = Buffer.from(pristine);
          modelFat.copy(expected, SECTOR);
          modelFat.copy(expected, SECTOR + FAT_BYTES);
          const diff = firstDifference(await saveRaw(client, ctx), expected, '写回后的磁盘镜像');
          if (diff) problems.push(diff);
          return problems;
        },
        check: ({ data }) => data,
      }],
    });
  }

  // ---- $10 以缓存里的 FAT 为准，把两份 FAT 写成一致 ----
  {
    const patched = Buffer.from(pristine);
    const spare = Buffer.from(noise(7, FAT_BYTES));
    spare.copy(patched, SECTOR + FAT_BYTES);
    cases.push({
      id: 'fs.fatc.write-back-heals',
      title: '$7B/$10 第二份 FAT 与第一份不同（填入杂乱字节）时：写回后两份 FAT 都等于缓存里装入的第一份，其余扇区不变',
      fresh: true,
      freshAfter: true,
      prepareImage: (ctx) => writeFileSync(ctx.image, patched),
      steps: [{
        host: async (client, _history, ctx) => {
          await call(client, 0x07);
          await call(client, 0x01, [[FS_LBA, [1, 0]]], [], 900);
          const result = await call(client, 0x10, [], [], 3000);
          const problems = [];
          if (!result.done) return ['$7B/$10 没有返回'];
          if (result.memory.get(DOS_ERROR)[0] !== 0) problems.push(`$7B/$10 出错码 $${hex(result.memory.get(DOS_ERROR)[0])}`);
          const expected = Buffer.from(patched);
          patched.copy(expected, SECTOR + FAT_BYTES, SECTOR, SECTOR + FAT_BYTES);
          const diff = firstDifference(await saveRaw(client, ctx), expected, '写回后的磁盘镜像');
          if (diff) problems.push(diff);
          return problems;
        },
        check: ({ data }) => data,
      }],
    });
  }

  // ---- $05 读 FAT 项：与镜像逐项一致 ----
  {
    const clusters = new Set();
    for (let c = 0; c <= 60; c++) clusters.add(c);
    for (const around of [341, 682, 1023, 1365, 1706, 2047, 2389, 2730, 2849, 3071]) for (let c = around - 6; c <= around + 6 && c <= 3071; c++) clusters.add(c);
    for (let c = 61; c <= 3071; c += 13) clusters.add(c);
    const fat = parseFat12(pristine);
    cases.push({
      id: 'fs.fatc.get-sweep',
      title: '$7B/$05 读 FAT 项：簇 0-60、各扇区边界附近、每隔 13 个簇直到 3071，读到的 12 位值与镜像的 FAT 一致（簇 0 不读，保持原值）',
      fresh: true,
      steps: [{
        host: async (client) => {
          const problems = [];
          await call(client, 0x01, [[FS_LBA, [1, 0]]], [], 900);
          for (const cluster of [...clusters].sort((a, b) => a - b)) {
            const result = await call(client, 0x05, [[CLUSTER, le16(cluster)], [FAT_VALUE_OUT, [0xee, 0xee]]], [[FAT_VALUE_OUT, 2]]);
            if (!result.done) { problems.push(`簇 ${cluster}：调用没有返回`); break; }
            const got = result.memory.get(FAT_VALUE_OUT)[0] | (result.memory.get(FAT_VALUE_OUT)[1] << 8);
            const want = cluster === 0 ? 0xeeee : fat.fatEntry(cluster);
            if (got !== want) problems.push(`簇 ${cluster}：读到 $${got.toString(16)}，预期 $${want.toString(16)}`);
            if (problems.length >= 8) break;
          }
          return problems;
        },
        check: ({ data }) => data,
      }],
    });
  }

  // ---- $00 前进到下一扇区 ----
  {
    /** 特制镜像：两份 FAT 里放各种特殊的链项 */
    const special = Buffer.from(pristine);
    const specialEntries = [[2000, 0xff7], [2001, 0xb30], [2002, 0xff0], [2003, 2004], [2004, 0xff8], [2005, 0xfff], [2006, 1], [2007, 0xffe], [2008, 0xb21], [2009, 0xb22], [2010, 2], [2011, 2012], [2012, 0xfff]];
    for (const base of [SECTOR, SECTOR + FAT_BYTES]) {
      const fatView = special.subarray(base, base + FAT_BYTES);
      for (const [cluster, value] of specialEntries) setFat12(fatView, cluster, value);
    }

    /** 按汇编逻辑转录的 $7B/$00 模型 */
    const nextSector = (lba, p, fat) => {
      const boundary = (low, high) => {
        if (high !== 0) return { carry: 1, a: 1 };
        if (low === 0) return { carry: 0, a: 0 };
        if (p.fatSectors >= low) return { carry: 0, a: 1 };
        if (p.rootStart - 1 >= low) return { carry: 1, a: 0 };
        if (p.rootStart - 1 + p.rootSectors >= low) return { carry: 0, a: 0xff };
        return { carry: 1, a: 1 };
      };
      const fail = (next) => ({ error: 0x1f, flag: 0, next });
      const area = boundary(lba & 0xff, lba >> 8);
      if (area.carry) {
        if (area.a === 0) return fail(lba);
        if (lba < p.dataStart) return fail(lba);
        const index = (lba - p.dataStart) % p.spc;
        const cluster = (Math.floor((lba - p.dataStart) / p.spc) + 2) & 0xffff;
        if (index + 1 < p.spc) return { error: 0, flag: 0, next: (lba + 1) & 0xffff };
        let entry;
        if (cluster === 0) entry = 'free';
        else {
          const offset = (cluster + (cluster >> 1)) & 0xffff;
          const sector = ((offset >> 8) & 0xfe) >> 1;
          const value = sector >= p.fatSectors ? -1 : fat.fatEntry(cluster);
          if (value === -1) entry = 'bad';
          else if (value === 0) entry = 'free';
          else if (value >= 0xff0) entry = value >= 0xff8 ? 'end' : 'bad';
          else entry = value <= p.limit ? value : 'bad';
        }
        if (entry === 'free' || entry === 'bad') return fail(lba);
        if (entry === 'end') return { error: 0, flag: 1, next: lba };
        return { error: 0, flag: 0, next: (((entry - 2) * p.spc) + p.dataStart) & 0xffff };
      }
      if (area.a === 0) return fail(lba);
      const next = lba + 1;
      return boundary(next & 0xff, next >> 8).carry ? { error: 0, flag: 1, next } : { error: 0, flag: 0, next };
    };

    const baseLbas = [...Array(45).keys(), 64, 100, 255, 256, 257, 298, 299, 360, 361, 362, 700, 758, 759, 1000, 2000, 2878, 2879, 2880, 3000, 3100, 3200, 4000, 65535];
    const nextCase = (id, title, image, spc, extra) => ({
      id,
      title,
      fresh: true,
      freshAfter: image !== pristine,
      ...(image === pristine ? {} : { prepareImage: (ctx) => writeFileSync(ctx.image, image) }),
      steps: [{
        host: (client) => withRestore(client, [[0x64fb, 9], [0x6536, 2], [0x652e, 2], [0x65a9, 2], [0x65c5, 1]], async () => {
          const problems = [];
          const fat = parseFat12(image);
          await call(client, 0x01, [[FS_LBA, [1, 0]]], [], 900);
          const params = Buffer.from(await client.read('cpu', 0x64fb, 9));
          if (spc !== 1) { params[0] = spc; params[1] = Math.log2(spc); }
          await client.send(`write cpu 64fb ${params.subarray(0, 2).toString('hex')}`);
          const p = { spc: params[0], fatSectors: params[3], dataStart: params[4], rootStart: params[5], rootSectors: params[6], limit: params[7] | (params[8] << 8) };
          const lbas = [...baseLbas, ...extra(p)];
          for (const lba of lbas) {
            const want = nextSector(lba, p, fat);
            const result = await call(client, 0x00, [[FS_LBA, le16(lba)], [0x65c5, [0x77]], [0x65a9, [0xee, 0xee]]], [[0x65a9, 2], [0x65c5, 1]]);
            if (!result.done) { problems.push(`扇区 ${lba}：调用没有返回`); break; }
            const got = { error: result.memory.get(DOS_ERROR)[0], flag: result.memory.get(0x65c5)[0], next: result.memory.get(0x65a9)[0] | (result.memory.get(0x65a9)[1] << 8) };
            if (got.error !== want.error || got.flag !== want.flag || got.next !== want.next) problems.push(`扇区 ${lba}：出错码 $${hex(got.error)}、链尾标志 ${got.flag}、下一扇区 ${got.next}，预期 $${hex(want.error)}、${want.flag}、${want.next}`);
            if (problems.length >= 8) break;
          }
          return problems;
        }),
        check: ({ data }) => data,
      }],
    });

    for (const spc of [1, 2, 4, 8]) {
      cases.push(nextCase(`fs.fatc.next-pristine-${spc}`, `$7B/$00 前进到下一扇区（原样镜像，每簇 ${spc} 扇区）：引导扇区与 FAT 区、根目录区、数据区的簇内与簇间、链尾、空闲簇、越界簇号，与按汇编转录的模型一致`, pristine, spc, () => []));
    }
    for (const spc of [1, 2, 4, 8]) {
      cases.push(nextCase(`fs.fatc.next-special-${spc}`, `$7B/$00 前进到下一扇区（特制 FAT：坏簇 $FF7、超出簇号上限的链项、$FF0、$FF8、$FFE、值 1、等于上限的链项，每簇 ${spc} 扇区）`, special, spc, (p) => {
        const lbas = [];
        for (let cluster = 1999; cluster <= 2013; cluster++) for (let index = 0; index < p.spc; index++) lbas.push(p.dataStart + (cluster - 2) * p.spc + index);
        return lbas;
      }));
    }
  }
}

export { cases };
