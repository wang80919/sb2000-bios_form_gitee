// ------------------------------------------------------------------------
// 名称：p5e-diskcopy.mjs
// 说明：DISKCOPY 命令的验证用例：模拟器只有一个软驱，B: 与 A: 是同一张盘，所以“源盘”和“目标盘”是同一份镜像。
//       用写满互不相同内容的特制镜像，每轮读源盘后，主机在扩展 RAM 的读缓冲里改写一段字节，再让它写“目标盘”，同时验证读（缓冲内容与镜像对应区段一致）和写（镜像里出现改写的字节、其余字节不变）。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：实测每轮最多复制 $75000 字节（936 个扇区），读缓冲从扩展 RAM 偏移 0 起，1.44MB 软盘分 3 轮满的加 1 轮剩下的 $1B000 字节，共 4 轮；
//       每轮的提示顺序：将源盘插入、按任意键继续 → 正在读源盘 → 将目标盘插入、按任意键继续 → 正在写目标盘 → 下一轮（最后一轮写完回到提示符）。
//       预期的镜像内容由生成的镜像加上主机改写的字节算出，不取自 BIOS 的输出。
// ------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { file, pattern, withImage } from '../lib/images.mjs';
import { moreText, shellText } from '../lib/screen-text.mjs';

/** 实测每轮复制的最大字节数 */
const ROUND_BYTES = 0x75000;
const PATCH_AT = 0x3000;
const PATCH_LENGTH = 256;

/** 缺哪些提示行 */
const missing = (lines, wanted) => wanted.filter((text) => !lines.some((line) => line.trim() === text)).map((text) => `屏幕上没有“${text}”；实际：${JSON.stringify(lines)}`);

/** 第 round 轮改写的字节：每轮取值不同 */
const patchOf = (round) => Buffer.from(Array.from({ length: PATCH_LENGTH }, (_, i) => (0xa0 + round * 16 + i) & 0xff));

/** 读扩展 RAM 偏移 0 起的 length 字节 */
async function readPram(client, length) {
  const parts = [];
  for (let offset = 0; offset < length; offset += 0x10000) parts.push(Buffer.from(await client.read('pram', offset, Math.min(0x10000, length - offset))));
  return Buffer.concat(parts);
}

/** 两段字节第一个不同的位置，相同返回 -1 */
const firstDifference = (a, b) => {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : length;
};

const build = () => {
  const spec = withImage({ id: 'p5e.diskcopy', title: '' }, [file('FULL.BIN', pattern(7, 2847))]);
  const original = spec.image;
  const rounds = Math.ceil(original.length / ROUND_BYTES);
  // 预期的镜像：从生成的镜像开始，每轮写完后把改写的字节落到该轮的区段里
  const expected = Buffer.from(original);
  const steps = [{ ...shellText('diskcopy a: b:'), check: ({ data }) => missing(data, ['按任意键继续...']) }];
  for (let round = 0; round < rounds; round++) {
    const start = round * ROUND_BYTES;
    const length = Math.min(ROUND_BYTES, original.length - start);
    steps.push({ ...moreText('\n', 1000), check: ({ data }) => missing(data, ['正在读源盘...', '按任意键继续...']) });
    steps.push({
      host: async (client) => {
        const buffer = await readPram(client, length);
        const problems = [];
        const diff = firstDifference(buffer, expected.subarray(start, start + length));
        if (diff >= 0) problems.push(`第 ${round + 1} 轮读缓冲与镜像第 ${start} 字节起的 ${length} 字节不一致，首个差异在缓冲偏移 ${diff}`);
        const patch = patchOf(round);
        await client.send(`write pram ${PATCH_AT.toString(16)} ${patch.toString('hex')}`);
        patch.copy(expected, start + PATCH_AT);
        return problems;
      },
      check: ({ data }) => data,
    });
    steps.push({
      ...moreText('\n', 1000),
      check: ({ data }) => missing(data, round === rounds - 1 ? ['正在写目标盘...', '>'] : ['正在写目标盘...', '按任意键继续...']),
    });
  }
  steps.push({
    host: async (client, _history, ctx) => {
      await client.send('savedisk');
      const saved = readFileSync(ctx.image);
      ctx.restore();
      return saved;
    },
    check: ({ data }) => {
      const diff = firstDifference(data, expected);
      return diff < 0 ? [] : [`保存的镜像与预期不一致，首个差异在字节 ${diff}（预期 ${expected[diff]}，实际 ${data[diff]}）`];
    },
  });
  return {
    ...spec,
    title: `diskcopy a: b:（写满数据的镜像）：${rounds} 轮“读源盘、写目标盘”，每轮读缓冲与镜像对应区段一致，主机改写的 ${PATCH_LENGTH} 字节出现在镜像里，其余字节不变`,
    steps,
  };
};

const cases = [build()];

export { cases };
