// ------------------------------------------------------------------------
// 名称：p0b-tiles.mjs
// 说明：图案流解压 $5B 的验证用例：把压缩图案流解成瓦片数据，按显存地址分段 DMA 写入。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值按 bios/src/image/（$80CC-$8271）的代码阅读写成模型：输入是 16 字节字典加指令流，$0C/$0D 指向字典（页组 $0642，窗口地址 $8000 起），$064C/$064D 是起始瓦片号（左移 4 位成显存地址）。
//       指令字节分高 4 位 H、低 4 位 L：$00 结束；H=1-12 把字典第 L 项重复 H 次；H=$D 后跟 L 个原样字节；H=$E 后跟 1 个字节，重复 L 次；H=$F 后跟起始字节，输出 L 个递增字节；H=$D 的 L 为 0 按 256 个原样字节。
//       输出先放在扩展 RAM 页 $F8 起的缓冲（窗口 $A000），每条指令后缓冲不少于 $1C00 字节就 DMA 到显存并把显存地址前移，结束时缓冲非空再 DMA 一次；DMA 寄存器：$4048 控制、$4049 源高、$404A 源低、$404B 源中、$404C 目的低、$404D 目的高、$404E 长度低、$404F 长度高。
//       H=$E、$F 的 L 为 0 时按 256 次写入但输出指针不前进（循环计数 Y 回绕成 0，用 Y 加指针），等于什么都没输出；H=$F 的递增用带进位加法，回绕后进位保持为 1，之后每次加 2。
// ------------------------------------------------------------------------
const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const toHex = (bytes) => [...bytes].map(hexName).join('');
const DMA = { ctrl: 0x4048, srcHigh: 0x4049, srcLow: 0x404a, srcMid: 0x404b, dstLo: 0x404c, dstHi: 0x404d, lenLo: 0x404e, lenHi: 0x404f };
const BUFFER_PRAM = (0xf8 - 0x80) * 0x1000;
const SOURCE_PRAM = 0x400;
const FLUSH_SIZE = 0x1c00;

/** 按指令流算出输出分段：每个分段是一次 DMA 写入的字节；memory 是缓冲区最后的内容（含指针没前进的写入） */
export function unpackSegments(stream) {
  const segments = [];
  const memory = new Array(0x2000).fill(0xee);
  let length = 0;
  let position = 16;
  const flush = () => { segments.push(memory.slice(0, length)); length = 0; };
  while (stream[position] !== 0) {
    const byte = stream[position];
    const high = byte >> 4;
    const low = byte & 15;
    const count = low === 0 ? 256 : low;
    if (high >= 1 && high <= 12) {
      for (let i = 0; i < high; i++) memory[length + i] = stream[low];
      length += high;
      position += 1;
    } else if (high === 0xd) {
      for (let i = 0; i < count; i++) memory[length + i] = stream[position + 1 + i];
      length += count;
      position += 1 + count;
    } else if (high === 0xe) {
      for (let i = 0; i < count; i++) memory[length + i] = stream[position + 1];
      if (low !== 0) length += count;
      position += 2;
    } else {
      let value = stream[position + 1];
      let carry = 0;
      for (let i = 0; i < count; i++) {
        memory[length + i] = value;
        const sum = value + 1 + carry;
        value = sum & 0xff;
        carry = sum > 0xff ? 1 : 0;
      }
      if (low !== 0) length += count;
      position += 2;
    }
    if (length >= FLUSH_SIZE) flush();
  }
  if (length > 0) flush();
  return { segments, memory };
}

const dictionary = Array.from({ length: 16 }, (_, i) => 0x10 + i * 3);
const tileCase = (id, title, instructions, { tile = 0x0100, offset = SOURCE_PRAM, dict = dictionary } = {}) => {
  const stream = [...dict, ...instructions, 0x00];
  const { segments, memory } = unpackSegments(stream);
  let destination = (tile << 4) & 0xffff;
  const dmaWrites = Object.fromEntries(Object.keys(DMA).map((name) => [name, []]));
  for (const segment of segments) {
    const length = segment.length - 1;
    const values = { ctrl: 0xc0, srcHigh: 0x1f, srcLow: 0x00, srcMid: 0x80, dstLo: destination & 0xff, dstHi: destination >> 8, lenLo: length & 0xff, lenHi: length >> 8 };
    for (const name of Object.keys(DMA)) dmaWrites[name].push(values[name]);
    destination = (destination + segment.length) & 0xffff;
  }
  const last = segments.at(-1) ?? [];
  const readLength = (last.length || 256) + 4;
  return {
    id: `p0b.5b.${id}`,
    title: `$5B ${title}（${segments.length} 次 DMA，共 ${segments.reduce((sum, s) => sum + s.length, 0)} 字节）`,
    fresh: true,
    steps: [{
      host: async (client) => {
        const { runCall } = await import('../../tools/rom-driver.mjs');
        await client.send(`write pram ${offset.toString(16)} ${toHex(stream)}`);
        await client.send(`write pram ${BUFFER_PRAM.toString(16)} ${toHex(new Array(0x2000).fill(0xee))}`);
        return runCall(client, {
          func: 0x5b,
          sub: 0,
          mem: [[0x642, [0x80]], [0x0c, [offset & 0xff, 0x80 | (offset >> 8)]], [0x64c, [tile & 0xff, tile >> 8]], [0x653, [0]]],
          readPram: [[BUFFER_PRAM, readLength]],
          capture: Object.values(DMA),
          maxFrames: 900,
        });
      },
      check: ({ data: result }) => {
        const problems = [];
        if (!result.done) problems.push('调用没有返回');
        for (const [name, address] of Object.entries(DMA)) {
          const writes = result.writes.get(address) ?? [];
          if (toHex(writes) !== toHex(dmaWrites[name])) problems.push(`DMA 寄存器 $${address.toString(16).toUpperCase()} 写入 ${toHex(writes)}，预期 ${toHex(dmaWrites[name])}`);
        }
        const got = result.pram.get(BUFFER_PRAM);
        const want = memory.slice(0, readLength);
        if (toHex(got) !== toHex(want)) {
          let at = 0;
          while (got[at] === want[at]) at++;
          problems.push(`缓冲在字节 ${at} 处不同（实际 ${hexName(got[at])}，预期 ${hexName(want[at])}），最后一段长度 ${last.length}`);
        }
        return problems;
      },
    }],
  };
};

const largeStream = Array.from({ length: 480 }, (_, i) => [0xef, 0x40 + (i & 0x3f)]).flat();

export const cases = [
  tileCase('dictionary', '字典项重复 1-12 次', [0x10, 0x25, 0x3f, 0xc7, 0x8a]),
  tileCase('raw', '原样字节：L=4', [0xd4, 0x01, 0x02, 0x03, 0x04]),
  tileCase('raw256', '原样字节：L=0 按 256 个', [0xd0, ...Array.from({ length: 256 }, (_, i) => (i * 7) & 0xff)]),
  tileCase('repeat', '重复一个字节：L=5', [0xe5, 0x77]),
  tileCase('repeat256', '重复一个字节：L=0 写 256 个但指针不前进，没有输出', [0xe0, 0x5a, 0x21]),
  tileCase('increment', '递增字节：L=3，起始 $A0', [0xf3, 0xa0]),
  tileCase('increment-wrap', '递增字节：L=6，起始 $FD 回绕', [0xf6, 0xfd]),
  tileCase('increment256', '递增字节：L=0 写 256 个但指针不前进，没有输出', [0xf0, 0x10, 0x32]),
  tileCase('mixed', '各种指令混合', [0x21, 0xd3, 0xaa, 0xbb, 0xcc, 0xf4, 0x30, 0x4f, 0xe7, 0x01, 0xc0 | 5, 0x12]),
  tileCase('tile-high', '起始瓦片号 $0FFF（显存地址 $FFF0）', [0xd4, 0x01, 0x02, 0x03, 0x04, 0x84], { tile: 0x0fff }),
  tileCase('tile-wrap', '起始瓦片号 $0FFF，分段后显存地址回绕', largeStream, { tile: 0x0fff }),
  tileCase('large', '输出超过 $1C00 字节，分两次 DMA', largeStream),
  tileCase('page-cross', '指令流跨过扩展 RAM 页边界', [0xd4, 0x11, 0x22, 0x33, 0x44, 0x91, 0xe3, 0x55], { offset: 0x1000 - 24 }),
];
