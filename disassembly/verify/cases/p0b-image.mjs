// ------------------------------------------------------------------------
// 名称：p0b-image.mjs
// 说明：调色板写入 $5D、整屏图片 $5E、显示图片 $5F 的验证用例。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值按 bios/src/image/（$8527-$87DA）的代码阅读写成模型，图案流与映射流的解码、屏幕效果沿用 p0b-tiles.mjs 与 p0b-map.mjs 里已验证的模型。
//       $5D：把 $0C/$0D 指向的 $064F 字节写进调色板寄存器 $2040+$0647 起；$064F 为 0 直接返回；先用 $1E/$0C 取 $062B 位 3、4（显示是否打开，结果覆盖 $0652，调用时的 $0652 无意义），为 0 时直接写；
//       不为 0 时再用 $1E/$07 看 NMI 是否打开：没开就等一次垂直消隐后直接写，开了就让 NMI 处理程序写（$0630 位 1 置位、等一帧后清除，写入次数等于这一帧里的 NMI 次数，实测 1 或 2 次）。调色板寄存器不能读回，用写入记录检查。
//       图片格式：10 字节头 [宽, 高, 图案数低, 图案数高, 调色板组数, 每组色数（4 或 $10）, 映射流偏移（16 位）, 调色板偏移（16 位）]（偏移相对头的起点），头后是图案流，偏移处分别是调色板与映射流。
//       $5F：图案流按 $064C/$064D 显示到显存（$5B），调色板写到 $0653（组号）左移 2 位（每组 4 色）或 4 位（每组 $10 色）的偏移处，长度为组数同样左移（$5D），映射流按宽高、原点 $0648/$0649、效果 $0652、速度 $0651、子功能（选名称表）显示（$5C，单元基础值为 $064C/$064D，调色板位用 $0653 的组号，位移取头里的每组色数）；
//       偏移加到指针上时，进位后指针高字节加 $80、页号加 8，高字节不小于 $C0 时再减 $40、页号加 4（跨 16KB 窗口）。
//       $5E：整屏图片，头里的宽高与组数不用：图案流同 $5F；映射流按行不分直接顺序解到名称表缓冲（子功能选名称表）开头，再用 $30 整张 DMA 到显存，调色板固定写 $40 字节到偏移 0。
// ------------------------------------------------------------------------
import { runCall } from '../../tools/rom-driver.mjs';
import { unpackSegments } from './p0b-tiles.mjs';
import { BUFFER_LENGTH, NT_BASE, NT_SIZE, applyWrites, clip, decodeMap, dmaRegisters, newBuffer, simulateEffect, buildMapStream } from './p0b-map.mjs';

const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const toHex = (bytes) => [...bytes].map(hexName).join('');
const DMA = { ctrl: 0x4048, srcHigh: 0x4049, srcLow: 0x404a, srcMid: 0x404b, dstLo: 0x404c, dstHi: 0x404d, lenLo: 0x404e, lenHi: 0x404f };
const PALETTE_ADDRESSES = Array.from({ length: 0x40 }, (_, i) => 0x2040 + i);
const SOURCE_PRAM = 0x400;
const DICTIONARY = Array.from({ length: 16 }, (_, i) => 0x10 + i * 3);
const TILE_INSTRUCTIONS = [0x21, 0xd3, 0xaa, 0xbb, 0xcc, 0xf4, 0x30, 0x4f, 0xe7, 0x01, 0xc5, 0x12];
const pointerBytes = (pram) => [pram & 0xff, 0x80 | ((pram >> 8) & 0x3f)];
const groupOf = (pram) => 0x80 + (pram >> 14) * 4;

const pad = (list, length) => list.concat(new Array(Math.max(0, length - list.length)).fill(0));

// ---- $5A ----
const tileLoadCase = ({ id, title, tile, length, pointer, group = 0x80, mask = 0x00 }) => {
  const page = (((pointer[1] >> 4) - 8 + group) & 0xff);
  const total = ((tile << 4) & 0xffff);
  const dmaLength = (length - 1) & 0xffff;
  const waits = 1 + (mask === 0 ? 0 : Math.floor((length >> 8) / 0x1c));
  const want = { ctrl: 0xc0, srcHigh: page >> 3, srcLow: pointer[0], srcMid: 0x80 + ((page & 7) << 4) + (pointer[1] & 0x0f), dstLo: total & 0xff, dstHi: total >> 8, lenLo: dmaLength & 0xff, lenHi: dmaLength >> 8 };
  return {
    id: `p0b.5a.${id}`,
    title: `$5A ${title}：起始瓦片 $${tile.toString(16).toUpperCase()}，长度 ${length}，源指针 $${hexName(pointer[1])}${hexName(pointer[0])}、页组 $${hexName(group)}，$062B=$${hexName(mask)}（等 ${waits} 帧）`,
    fresh: true,
    steps: [{
      host: (client) => runCall(client, { func: 0x5a, sub: 0, mem: [[0x62b, [mask]], [0x642, [group]], [0x0c, pointer], [0x64c, [tile & 0xff, tile >> 8]], [0x64f, [length & 0xff, length >> 8]]], capture: Object.values(DMA), maxFrames: 400 }),
      check: ({ data: result }) => {
        const problems = [];
        if (!result.done) problems.push('调用没有返回');
        for (const [name, address] of Object.entries(DMA)) {
          const writes = result.writes.get(address) ?? [];
          const expected = length === 0 ? [] : [want[name]];
          if (toHex(writes) !== toHex(expected)) problems.push(`DMA 寄存器 $${address.toString(16).toUpperCase()} 写入 ${toHex(writes)}，预期 ${toHex(expected)}`);
        }
        if (length !== 0 && result.frames < waits) problems.push(`只用了 ${result.frames} 帧，预期至少等 ${waits} 帧`);
        if (length !== 0 && result.frames > waits * 2 + 3) problems.push(`用了 ${result.frames} 帧，预期不超过 ${waits * 2 + 3} 帧（等 ${waits} 次垂直消隐，每次不到 2 帧）`);
        return problems;
      },
    }],
  };
};

const tileLoadCases = [
  tileLoadCase({ id: 'basic', title: '把源数据直接 DMA 到图案区', tile: 0x0010, length: 0x40, pointer: [0x00, 0x84] }),
  tileLoadCase({ id: 'one-byte', title: '长度 1（DMA 长度寄存器写 0）', tile: 0x0020, length: 1, pointer: [0x10, 0x84] }),
  tileLoadCase({ id: 'len256', title: '长度 $0100（低字节为 0，减 1 向高字节借位）', tile: 0x0030, length: 0x100, pointer: [0x00, 0x85] }),
  tileLoadCase({ id: 'len257', title: '长度 $0101', tile: 0x0030, length: 0x101, pointer: [0x34, 0x86] }),
  tileLoadCase({ id: 'len-4k', title: '长度 $1000', tile: 0x0100, length: 0x1000, pointer: [0x00, 0x84] }),
  tileLoadCase({ id: 'tile-wrap', title: '瓦片号 $0FFF（左移 4 位后显存地址 $FFF0）', tile: 0x0fff, length: 0x10, pointer: [0x00, 0x84] }),
  tileLoadCase({ id: 'tile-overflow', title: '瓦片号 $1234（左移 4 位后高位丢弃，地址 $2340）', tile: 0x1234, length: 0x20, pointer: [0x00, 0x84] }),
  tileLoadCase({ id: 'pointer', title: '源指针在第三个 4KB 页内', tile: 0x0040, length: 0x20, pointer: [0x45, 0xa3] }),
  tileLoadCase({ id: 'group', title: '页组 $85', tile: 0x0040, length: 0x20, pointer: [0x45, 0x93], group: 0x85 }),
  tileLoadCase({ id: 'zero', title: '长度为 0：直接返回', tile: 0x0040, length: 0, pointer: [0x00, 0x84] }),
  tileLoadCase({ id: 'display-on', title: '显示打开：等一帧', tile: 0x0050, length: 0x40, pointer: [0x00, 0x84], mask: 0x18 }),
  tileLoadCase({ id: 'display-off-large', title: '显示关闭且长度大：只等一帧', tile: 0x0100, length: 0x7000, pointer: [0x00, 0x84] }),
  tileLoadCase({ id: 'display-on-large', title: '显示打开且长度大：高字节每 $1C 块多等一帧', tile: 0x0100, length: 0x7000, pointer: [0x00, 0x84], mask: 0x18 }),
];

// ---- $5D ----
const paletteBytes = (count) => Array.from({ length: count }, (_, i) => (0x0f + i * 5) & 0x3f);

const paletteCase = ({ id, title, offset, length, mask, control, repeats }) => {
  const data = paletteBytes(Math.max(length, 1));
  return {
    id: `p0b.5d.${id}`,
    title: `$5D ${title}`,
    fresh: true,
    steps: [{
      host: async (client) => {
        await client.send(`write pram ${SOURCE_PRAM.toString(16)} ${toHex(data)}`);
        return runCall(client, { func: 0x5d, sub: 0, mem: [[0x642, [0x80]], [0x0c, pointerBytes(SOURCE_PRAM)], [0x647, [offset]], [0x64f, [length]], [0x652, [0x00]], [0x62a, [control]], [0x62b, [mask]]], capture: PALETTE_ADDRESSES, maxFrames: 400 });
      },
      check: ({ data: result }) => {
        const problems = [];
        if (!result.done) problems.push('调用没有返回');
        for (let i = 0; i < 0x40; i++) {
          const writes = result.writes.get(0x2040 + i) ?? [];
          const inside = i >= offset && i < offset + length;
          if (!inside) {
            if (writes.length) problems.push(`调色板 $${(0x2040 + i).toString(16)} 不该写入，实际写入 ${toHex(writes)}`);
            continue;
          }
          const want = data[i - offset];
          const allowed = repeats ?? [1];
          if (!allowed.includes(writes.length) || writes.some((value) => value !== want)) problems.push(`调色板 $${(0x2040 + i).toString(16)} 写入 ${toHex(writes)}，预期 ${allowed.join(' 或 ')} 次 ${hexName(want)}`);
        }
        return problems;
      },
    }],
  };
};

const paletteCases = [
  paletteCase({ id: 'direct', title: '显示关闭：直接写，偏移 4、长度 8', offset: 4, length: 8, mask: 0x00, control: 0xa8 }),
  paletteCase({ id: 'full', title: '显示关闭：偏移 0、长度 $40', offset: 0, length: 0x40, mask: 0x00, control: 0xa8 }),
  paletteCase({ id: 'last', title: '显示关闭：偏移 $3F、长度 1', offset: 0x3f, length: 1, mask: 0x00, control: 0xa8 }),
  paletteCase({ id: 'zero', title: '长度为 0：直接返回，不写', offset: 4, length: 0, mask: 0x18, control: 0xa8 }),
  paletteCase({ id: 'vblank', title: '显示打开、NMI 关闭：等垂直消隐后直接写', offset: 8, length: 16, mask: 0x18, control: 0x00 }),
  paletteCase({ id: 'vblank-bg', title: '只开背景（$062B=$08）、NMI 关闭：等垂直消隐后直接写', offset: 0, length: 12, mask: 0x08, control: 0x00 }),
  paletteCase({ id: 'vblank-sprite', title: '只开精灵（$062B=$10）、NMI 关闭：等垂直消隐后直接写', offset: 16, length: 16, mask: 0x10, control: 0x00 }),
  paletteCase({ id: 'nmi', title: '显示打开、NMI 打开：由 NMI 处理程序写（1 或 2 次）', offset: 8, length: 16, mask: 0x18, control: 0x80, repeats: [1, 2] }),
  paletteCase({ id: 'nmi-full', title: '显示打开、NMI 打开：整张 $40 字节（1 或 2 次）', offset: 0, length: 0x40, mask: 0x18, control: 0x80, repeats: [1, 2] }),
];

// ---- 图片 ----
/** 拼一张图片：头 + 图案流 + 间隔 + 调色板 + 映射流 */
const buildImage = ({ width, height, dictionary = DICTIONARY, instructions = TILE_INSTRUCTIONS, groups, colors, palette, mapStream, gap = 0 }) => {
  const tileStream = [...dictionary, ...instructions, 0x00];
  const paletteOffset = 10 + tileStream.length + gap;
  const mapOffset = paletteOffset + palette.length;
  const header = [width, height, 0x10, 0x00, groups, colors, mapOffset & 0xff, mapOffset >> 8, paletteOffset & 0xff, paletteOffset >> 8];
  return { bytes: [...header, ...tileStream, ...new Array(gap).fill(0x5a), ...palette, ...mapStream], tileStream };
};

/** 图案流的 DMA 寄存器值列表（按 $5B 的模型） */
const tileDmaLists = (tileStream, tile) => {
  const { segments } = unpackSegments(tileStream);
  const lists = Object.fromEntries(Object.keys(DMA).map((name) => [name, []]));
  let destination = (tile << 4) & 0xffff;
  for (const segment of segments) {
    const length = segment.length - 1;
    const values = { ctrl: 0xc0, srcHigh: 0x1f, srcLow: 0x00, srcMid: 0x80, dstLo: destination & 0xff, dstHi: destination >> 8, lenLo: length & 0xff, lenHi: length >> 8 };
    for (const name of Object.keys(DMA)) lists[name].push(values[name]);
    destination = (destination + segment.length) & 0xffff;
  }
  return lists;
};

const appendDma = (lists, registers, times) => {
  for (const name of Object.keys(DMA)) for (let i = 0; i < times; i++) lists[name].push(registers[name]);
};

const runImage = async (client, { image, start, call }) => {
  await client.send(`write pram ${NT_BASE.toString(16)} ${toHex(newBuffer())}`);
  await client.send(`write pram ${start.toString(16)} ${toHex(image)}`);
  return runCall(client, { ...call, readPram: [[NT_BASE, BUFFER_LENGTH]], capture: [...Object.values(DMA), ...PALETTE_ADDRESSES], maxFrames: 1500 });
};

const checkImage = (result, expected) => {
  const problems = [];
  if (!result.done) problems.push('调用没有返回');
  for (const [name, address] of Object.entries(DMA)) {
    const writes = result.writes.get(address) ?? [];
    if (toHex(writes) !== toHex(expected.dma[name])) problems.push(`DMA 寄存器 $${address.toString(16).toUpperCase()} 写入 ${toHex(writes)}，预期 ${toHex(expected.dma[name])}`);
  }
  for (let i = 0; i < 0x40; i++) {
    const writes = result.writes.get(0x2040 + i) ?? [];
    const want = expected.palette[i] === undefined ? [] : [expected.palette[i]];
    if (toHex(writes) !== toHex(want)) problems.push(`调色板 $${(0x2040 + i).toString(16)} 写入 ${toHex(writes)}，预期 ${toHex(want)}`);
  }
  const got = result.pram.get(NT_BASE);
  for (let i = 0; i < BUFFER_LENGTH; i++) {
    if (got[i] !== expected.buffer[i]) {
      problems.push(`名称表缓冲偏移 $${i.toString(16)}（名称表 ${Math.floor(i / NT_SIZE)}、行 ${Math.floor((i % NT_SIZE) / 64)}、列 ${Math.floor((i % 64) / 2)}）处为 ${hexName(got[i])}，预期 ${hexName(expected.buffer[i])}`);
      break;
    }
  }
  return problems;
};

const speedTitle = (speed) => (speed >= 5 ? `每步 DMA 并等 ${speed - 5} 帧` : `每 ${6 - speed} 步 DMA 一次`);

// ---- $5F ----
const showCase = (p) => {
  const { tile = 0x0100, group = 0, groups = 2, colors = 4, effect = 0, column = 3, row = 2, speed = 5, sub = 0, start = SOURCE_PRAM, gap = 0 } = p;
  const width = p.width ?? 8;
  const height = p.height ?? 6;
  const shift = colors === 4 ? 2 : 4;
  const palette = paletteBytes((groups << shift) & 0xff);
  const stream = buildMapStream(width * height);
  const { bytes, tileStream } = buildImage({ width, height, groups, colors, palette, mapStream: stream, gap });
  const dma = tileDmaLists(tileStream, tile);
  const expectedPalette = {};
  const paletteOffset = (group << shift) & 0xff;
  palette.forEach((value, i) => { expectedPalette[paletteOffset + i] = value; });
  const paletteShift = colors === 0x10 || (colors !== 4 && effect !== 0) ? 6 : 4;
  const base = (((tile >> 8) + ((group << paletteShift) & 0xff)) & 0xff) << 8 | (tile & 0xff);
  const cells = decodeMap(stream, base);
  const buffer = newBuffer();
  const clipped = clip({ c0: column, r0: row, w: width, h: height }, speed, effect);
  if (clipped) {
    const simulated = simulateEffect(clipped.type, clipped.rect, clipped.speed);
    applyWrites(buffer, sub & 3, simulated.writes, (c, r) => cells[(r - row) * width + (c - column)] ?? 0xeeee);
    appendDma(dma, dmaRegisters(sub & 3), simulated.dmaCalls);
  }
  return {
    id: `p0b.5f.${p.id}`,
    title: `$5F ${p.title}：显示起点列 ${column}、行 ${row}，图案起始瓦片 $${tile.toString(16).toUpperCase()}，调色板组 ${group}（共 ${groups} 组，每组 ${colors} 色），效果 ${effect}，${speedTitle(speed)}`,
    fresh: true,
    steps: [{
      host: (client) => runImage(client, {
        image: bytes,
        start,
        call: { func: 0x5f, sub, mem: [[0x62b, [0x00]], [0x642, [groupOf(start)]], [0x0c, pointerBytes(start)], [0x648, [column, row]], [0x64c, [tile & 0xff, tile >> 8]], [0x651, [speed, effect, group]]] },
      }),
      check: ({ data: result }) => checkImage(result, { dma, palette: expectedPalette, buffer }),
    }],
  };
};

const showCases = [
  showCase({ id: 'basic', title: '基本图片（4 色组）' }),
  showCase({ id: 'colors16', title: '每组 16 色', colors: 0x10, groups: 2, group: 1, effect: 0 }),
  showCase({ id: 'colors16-effect', title: '每组 16 色、效果 3', colors: 0x10, groups: 1, group: 2, effect: 3, tile: 0x0120 }),
  showCase({ id: 'colors-other', title: '色数既不是 4 也不是 $10（取 16 色写调色板）、效果 0', colors: 8, groups: 2, group: 1, effect: 0 }),
  showCase({ id: 'colors-other-effect', title: '色数既不是 4 也不是 $10、效果 1', colors: 8, groups: 1, group: 1, effect: 1 }),
  showCase({ id: 'group-shift', title: '调色板组号 5 写到偏移 20', groups: 3, group: 5 }),
  showCase({ id: 'no-palette', title: '调色板组数为 0：不写调色板', groups: 0, group: 1 }),
  ...[1, 2, 4, 6, 7, 8].map((effect) => showCase({ id: `effect${effect}`, title: `效果 ${effect}`, effect, width: 9, height: 7, column: 5, row: 4, speed: 3, sub: 1 })),
  showCase({ id: 'sub2', title: '名称表 2', sub: 2, tile: 0x0fff, group: 3, groups: 4 }),
  showCase({ id: 'clipped', title: '起点越界：只显示图案与调色板', column: 33 }),
  showCase({ id: 'clip-edge', title: '右下超出屏幕被截短', column: 28, row: 28, width: 8, height: 6 }),
  showCase({ id: 'page-cross', title: '图片跨过 16KB 窗口，偏移处于下一个窗口', start: 0x3f00, gap: 0x180, group: 1 }),
];

// ---- $5E ----
const fullCase = (p) => {
  const { tile = 0x0100, sub = 0, effect = 0, start = SOURCE_PRAM, gap = 0, count = 960 } = p;
  const palette = paletteBytes(0x40);
  const stream = buildMapStream(count);
  const { bytes, tileStream } = buildImage({ width: 32, height: 30, groups: 4, colors: 0x10, palette, mapStream: stream, gap });
  const dma = tileDmaLists(tileStream, tile);
  appendDma(dma, dmaRegisters(sub & 3), 1);
  const cells = decodeMap(stream, tile);
  const buffer = newBuffer();
  cells.forEach((cell, i) => {
    const offset = (sub & 3) * NT_SIZE + i * 2;
    if (offset + 1 < BUFFER_LENGTH) { buffer[offset] = cell & 0xff; buffer[offset + 1] = cell >> 8; }
  });
  const expectedPalette = {};
  palette.forEach((value, i) => { expectedPalette[i] = value; });
  return {
    id: `p0b.5e.${p.id}`,
    title: `$5E ${p.title}：名称表 ${sub & 3}，图案起始瓦片 $${tile.toString(16).toUpperCase()}，映射流 ${cells.length} 个单元，$0652=${effect}`,
    fresh: true,
    steps: [{
      host: (client) => runImage(client, {
        image: bytes,
        start,
        call: { func: 0x5e, sub, mem: [[0x62b, [0x00]], [0x642, [groupOf(start)]], [0x0c, pointerBytes(start)], [0x64c, [tile & 0xff, tile >> 8]], [0x652, [effect]]] },
      }),
      check: ({ data: result }) => checkImage(result, { dma, palette: expectedPalette, buffer }),
    }],
  };
};

const fullCases = [
  fullCase({ id: 'basic', title: '整屏图片' }),
  fullCase({ id: 'sub1', title: '整屏图片', sub: 1, tile: 0x0200 }),
  fullCase({ id: 'sub2', title: '整屏图片', sub: 2, tile: 0x0300, effect: 3 }),
  fullCase({ id: 'sub3', title: '整屏图片', sub: 3, tile: 0x0f10 }),
  fullCase({ id: 'short', title: '映射流只有 100 个单元，其余保持不变', count: 100 }),
  fullCase({ id: 'effect-nonzero', title: '$0652 非 0 时调色板位按 6 位移（本例 $0654 为 0，无影响）', effect: 5 }),
  fullCase({ id: 'page-cross', title: '图片跨过 16KB 窗口', start: 0x3f00, gap: 0x180 }),
];

export const cases = [...tileLoadCases, ...paletteCases, ...showCases, ...fullCases];
