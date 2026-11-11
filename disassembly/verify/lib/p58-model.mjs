// ------------------------------------------------------------------------
// 名称：p58-model.mjs
// 说明：页组 $58 文件服务里纯计算部分的模型：字节数换算扇区、簇、页（$7B/$0D），簇号换扇区号（$7B/$03），扇区号换磁道、磁头、扇区（$7B/$11），读引导扇区记下磁盘参数（$7C/$0E）。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：按 bios/src/file-system/ 转录；磁盘参数块在 ERAM $64FB 起（A 盘偏移 0，B 盘偏移 $19）：+0 每簇扇区数，+1 簇扇区数的移位数，+2 根目录项数，+3 每个 FAT 的扇区数，
//       +4 数据区起始扇区，+5 FAT 部分扇区数（含引导扇区），+6 根目录扇区数，+7/+8 簇号上限（簇总数 + 2）；卷序列号在 $64EC 起 4 字节，卷标在 $64F0 起 11 字节。
// ------------------------------------------------------------------------

/** 每簇扇区数 → 移位数（只有 1、2、4、8 合法） */
const SHIFTS = new Map([[1, 0], [2, 1], [4, 2], [8, 3]]);

/**
 * $7B/$0D：字节数 → 扇区数、簇数、页数（都向上取整，16 位）。
 * @param {number} bytes 24 位字节数
 * @param {number} sectorsPerCluster 每簇扇区数
 * @param {number} shift 每簇扇区数的移位数
 */
export function sizeToUnits(bytes, sectorsPerCluster, shift) {
  let sectors = (bytes >> 9) & 0xffff;
  if ((bytes & 0x1ff) !== 0) sectors = (sectors + 1) & 0xffff;
  let clusters = sectors >> shift;
  if (((sectorsPerCluster - 1) & (sectors & 0xff)) !== 0) clusters = (clusters + 1) & 0xffff;
  let pages = sectors >> 3;
  if ((sectors & 7) !== 0) pages = (pages + 1) & 0xffff;
  return { sectors, clusters, pages };
}

/** $7B/$03：簇号 → 该簇第一个扇区的逻辑扇区号（16 位） */
export function clusterToLba(cluster, shift, dataStart) {
  const base = (cluster - 2) & 0xffff;
  return (((base << shift) & 0xffff) + dataStart) & 0xffff;
}

/** $7B/$11：逻辑扇区号 → 磁道、磁头、扇区（磁道按 8 位回绕） */
export function lbaToChs(lba) {
  const track = Math.floor(lba / 36) & 0xff;
  const rest = lba % 36;
  return { track, head: rest >= 18 ? 1 : 0, sector: (rest % 18) + 1 };
}

/**
 * $7C/$0E：按引导扇区的字段填磁盘参数块（A 盘），遇到不合格的字段按代码的顺序停下并返回出错码 $0E，已写入的单元保留。
 * @param {Uint8Array} boot 引导扇区（至少 62 字节）
 * @param {Uint8Array} region $64EC-$6503 共 24 字节的原有内容
 * @returns {{error: number, region: Uint8Array}} 结果
 */
export function readBootParams(boot, region) {
  const out = Uint8Array.from(region);
  const set = (address, value) => { out[address - 0x64ec] = value & 0xff; };
  const get = (address) => out[address - 0x64ec];
  const fail = () => ({ error: 0x0e, region: out });
  if (boot[11] !== 0 || boot[12] !== 2) return fail();
  set(0x64fb, boot[13]);
  if (!SHIFTS.has(boot[13])) return fail();
  set(0x64fc, SHIFTS.get(boot[13]));
  if (boot[14] !== 1 || boot[15] !== 0 || boot[16] !== 2) return fail();
  if (boot[17] === 0) return fail();
  set(0x64fd, boot[17]);
  if (boot[18] !== 0 || boot[19] !== 0x40 || boot[20] !== 0x0b) return fail();
  if (boot[22] === 0) return fail();
  set(0x64fe, boot[22]);
  if (boot[23] !== 0) return fail();
  const fatDouble = boot[22] * 2;
  if (fatDouble > 0xff || fatDouble + 1 > 0xff) return fail();
  set(0x6500, fatDouble + 1);
  set(0x6501, boot[17] >> 4);
  const dataStart = get(0x6500) + get(0x6501);
  if (dataStart > 0xff) return fail();
  set(0x64ff, dataStart);
  let clusters = 0x0b40 - dataStart;
  for (let i = 0; i < SHIFTS.get(boot[13]); i++) clusters >>= 1;
  clusters += 2;
  set(0x6502, clusters);
  set(0x6503, clusters >> 8);
  [boot[0x2a], boot[0x29], boot[0x28], boot[0x27]].forEach((value, i) => set(0x64ec + i, value));
  for (let i = 0; i < 11; i++) set(0x64f0 + i, boot[0x2b + i]);
  return { error: 0, region: out };
}
