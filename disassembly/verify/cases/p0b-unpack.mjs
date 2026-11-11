// ------------------------------------------------------------------------
// 名称：p0b-unpack.mjs
// 说明：解压到内存 $61 的验证用例：把图案流格式的压缩数据解到指定的扩展 RAM 地址，并返回解出的长度。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值按 bios/src/image/（$8D41-$8F08）的代码阅读写成模型。
//       输入：$0C/$0D 与页组 $0642 指向压缩数据（16 字节字典加指令流，$00 结束，格式与 $5B 相同）；目的地址是 $12/$13（窗口地址 $8000-$FFFF，高 4 位选页，低 12 位是页内偏移）与页组 $0643，页号 = ($13 的高 4 位) − 8 + $0643；
//       解压前把目的页与下一页映射到窗口 2、3（$A000-$BFFF），目的指针的高字节落在 $A0-$AF；每条指令后目的指针高字节不小于 $B0 时 $0643 加 1、重新映射并把高字节退回 $A0，所以目的地址是线性连续的；
//       指令字节高 4 位 H、低 4 位 L：H=1-12 把字典第 L 项重复 H 次；H=$D 后跟 L 个原样字节（L=0 为 256 个）；H=$E 后跟 1 个字节重复 L 次；H=$F 后跟起始字节输出 L 个递增字节（带进位加法，回绕后每次加 2）；
//       H=$E、$F 的 L 为 0 时写 256 个字节但目的指针不前进；H=0（指令字节 $01-$0F）只在目的指针后 $FF 处写入字典第 L 项一个字节，指针不前进。
//       返回：$064F/$0650 为解出的字节数（目的指针前进的总量），$0643 为目的指针最后所在的页，$0642 变成原 $0643 的值，$12/$13 为目的指针的最终位置。
// ------------------------------------------------------------------------
import { runCall } from '../../tools/rom-driver.mjs';

const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const toHex = (bytes) => [...bytes].map(hexName).join('');
const SOURCE_PRAM = 0x400;
const DICTIONARY = Array.from({ length: 16 }, (_, i) => 0x10 + i * 3);

/** 按 $61 的代码模拟解压：返回目的页内线性内存的写入结果、解出长度、最后的页与指针 */
export function simulateUnpack(stream, { destGroup, destHigh, destLow }) {
  const nibble = destHigh & 0x0f;
  const firstPage = (((destHigh >> 4) - 8 + destGroup) & 0xff);
  const startOffset = (nibble << 8) | destLow;
  let page = firstPage;
  let high = 0xa0 | nibble;
  let low = destLow;
  const memory = new Map();
  const address = (y) => (page - 0x80) * 0x1000 + (((high - 0xa0) << 8) | low) + y;
  const put = (y, value) => memory.set(address(y), value);
  const advance = (count) => {
    const total = low + count;
    low = total & 0xff;
    high += total >> 8;
  };
  const crossCheck = () => {
    if (high >= 0xb0) { page++; high = 0xa0; }
  };
  const dictionary = stream.slice(0, 16);
  let position = 16;
  while (stream[position] !== 0) {
    const byte = stream[position];
    const kind = byte >> 4;
    const count = byte & 15;
    if (kind < 0xd) {
      // H=0 时 Y 从 $FF 开始，只写一次且不前进
      if (kind === 0) put(0xff, dictionary[count]);
      else for (let y = kind - 1; y >= 0; y--) put(y, dictionary[count]);
      advance(kind);
      crossCheck();
      position += 1;
    } else if (kind === 0xd) {
      const total = count === 0 ? 256 : count;
      for (let i = 0; i < total; i++) {
        put(0, stream[position + 1 + i]);
        advance(1);
      }
      crossCheck();
      position += 1 + total;
    } else {
      const total = count === 0 ? 256 : count;
      let value = stream[position + 1];
      let carry = 0;
      for (let y = 0; y < total; y++) {
        put(y, value);
        if (kind === 0xf) {
          const sum = value + 1 + carry;
          value = sum & 0xff;
          carry = sum > 0xff ? 1 : 0;
        }
      }
      advance(count === 0 ? 0 : count);
      crossCheck();
      position += 2;
    }
  }
  const length = ((((high - 0xa0) << 8) | low) + ((page - firstPage) << 12) - startOffset) & 0xffff;
  return { memory, length, page, high, low, firstPage, startOffset };
}

const largeStream = Array.from({ length: 480 }, (_, i) => [0xef, 0x40 + (i & 0x3f)]).flat();

const unpackCase = (id, title, instructions, { destGroup = 0x84, destHigh = 0xa0, destLow = 0x00, offset = SOURCE_PRAM, dictionary = DICTIONARY } = {}) => {
  const stream = [...dictionary, ...instructions, 0x00];
  const model = simulateUnpack(stream, { destGroup, destHigh, destLow });
  const destinationBase = (model.firstPage - 0x80) * 0x1000 + model.startOffset;
  const readStart = Math.max(0, destinationBase - 8);
  const readLength = model.length + 0x300;
  return {
    id: `p0b.61.${id}`,
    title: `$61 ${title}：目的 $${hexName(destHigh)}${hexName(destLow)}、页组 $${hexName(destGroup)}，解出 ${model.length} 字节`,
    fresh: true,
    steps: [{
      host: async (client) => {
        await client.send(`write pram ${offset.toString(16)} ${toHex(stream)}`);
        await client.send(`write pram ${readStart.toString(16)} ${toHex(new Array(readLength + 8).fill(0xee))}`);
        // 源数据可能与目的区重叠时先写目的区再写源数据，这里把源数据重新写一遍
        await client.send(`write pram ${offset.toString(16)} ${toHex(stream)}`);
        return runCall(client, {
          func: 0x61,
          sub: 0,
          mem: [[0x642, [0x80 + (offset >> 14) * 4]], [0x0c, [offset & 0xff, 0x80 | ((offset >> 8) & 0x3f)]], [0x643, [destGroup]], [0x12, [destLow, destHigh]]],
          read: [[0x642, 2], [0x12, 2], [0x64f, 2]],
          readPram: [[readStart, readLength + 8]],
          maxFrames: 900,
        });
      },
      check: ({ data: result }) => {
        const problems = [];
        if (!result.done) problems.push('调用没有返回');
        const got = result.pram.get(readStart);
        for (let i = 0; i < readLength + 8; i++) {
          const want = model.memory.get(readStart + i) ?? 0xee;
          if (got[i] !== want) { problems.push(`目的区在 $${(readStart + i).toString(16)}（距起点 ${readStart + i - destinationBase}）处为 ${hexName(got[i])}，预期 ${hexName(want)}`); break; }
        }
        const length = result.memory.get(0x64f)[0] | (result.memory.get(0x64f)[1] << 8);
        if (length !== model.length) problems.push(`返回长度 ${length}，预期 ${model.length}`);
        const [group, page] = result.memory.get(0x642);
        const [low, high] = result.memory.get(0x12);
        if (page !== model.page) problems.push(`$0643 为 ${hexName(page)}，预期 ${hexName(model.page)}`);
        if (group !== destGroup) problems.push(`$0642 为 ${hexName(group)}，预期 ${hexName(destGroup)}`);
        if (low !== model.low || high !== model.high) problems.push(`$12/$13 为 ${hexName(high)}${hexName(low)}，预期 ${hexName(model.high)}${hexName(model.low)}`);
        return problems;
      },
    }],
  };
};

export const cases = [
  unpackCase('dictionary', '字典项重复 1-12 次', [0x10, 0x25, 0x3f, 0xc7, 0x8a]),
  unpackCase('raw', '原样字节：L=4', [0xd4, 0x01, 0x02, 0x03, 0x04]),
  unpackCase('raw256', '原样字节：L=0 按 256 个', [0xd0, ...Array.from({ length: 256 }, (_, i) => (i * 7) & 0xff)]),
  unpackCase('repeat', '重复一个字节：L=5', [0xe5, 0x77]),
  unpackCase('repeat256', '重复一个字节：L=0 写 256 个但指针不前进', [0xe0, 0x5a, 0x21]),
  unpackCase('increment', '递增字节：L=3，起始 $A0', [0xf3, 0xa0]),
  unpackCase('increment-wrap', '递增字节：L=6，起始 $FD 回绕', [0xf6, 0xfd]),
  unpackCase('increment256', '递增字节：L=0 写 256 个但指针不前进', [0xf0, 0x10, 0x32]),
  unpackCase('high-zero', '高 4 位为 0：只在指针后 $FF 处写一个字节，指针不前进', [0x05, 0x21]),
  unpackCase('mixed', '各种指令混合', [0x21, 0xd3, 0xaa, 0xbb, 0xcc, 0xf4, 0x30, 0x4f, 0xe7, 0x01, 0xc5, 0x12]),
  unpackCase('dest-offset', '目的指针不在页首', [0xd4, 0x01, 0x02, 0x03, 0x04, 0x84], { destHigh: 0xa5, destLow: 0x34 }),
  unpackCase('dest-group', '目的页组 $85、窗口地址 $93xx', [0xd4, 0x01, 0x02, 0x03, 0x04, 0x84, 0xe6, 0x44], { destGroup: 0x85, destHigh: 0x93, destLow: 0x7c }),
  unpackCase('dest-high-window', '目的窗口地址 $E8xx', [0xd3, 0x0a, 0x0b, 0x0c, 0xf5, 0x50], { destGroup: 0x80, destHigh: 0xe8, destLow: 0x00 }),
  unpackCase('dest-cross-end', '目的指针刚好走到页尾', [0xd0, ...Array.from({ length: 256 }, (_, i) => i), 0xd5, 1, 2, 3, 4, 5], { destHigh: 0xaf, destLow: 0x00 }),
  unpackCase('dest-cross', '目的跨过 4KB 页边界（两次）', largeStream, { destHigh: 0xa8, destLow: 0x00 }),
  unpackCase('dest-cross-overshoot', '页尾处的字典写入越过页边界', [0xc3, 0x84, 0xc4, 0x84], { destHigh: 0xaf, destLow: 0xf8 }),
  unpackCase('source-cross', '指令流跨过源页边界', [0xd4, 0x11, 0x22, 0x33, 0x44, 0x91, 0xe3, 0x55], { offset: 0x1000 - 24 }),
  unpackCase('source-cross-dictionary', '字典跨过源页边界', [0xd4, 0x11, 0x22, 0x33, 0x44, 0x91, 0xe3, 0x55], { offset: 0x1000 - 8 }),
  unpackCase('large', '解出约 7KB', largeStream),
];
