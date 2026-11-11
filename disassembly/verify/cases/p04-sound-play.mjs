// ------------------------------------------------------------------------
// 名称：p04-sound-play.mjs
// 说明：载入并起播后打开声音更新的子功能的验证用例：$65/$00、$01（载入曲子起播）、$0A、$0B（按曲目号或直接按指针起播音效）。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值来自 verify/lib/sound-engine.mjs 的模型：起播部分按 bios/src/kernel/sound-services.asm $F2EE-$F716 转录，起播后 $0630 位 6 打开，NMI 每帧执行一次声音更新，
//       调用返回到读取内存之间过了几帧不固定，所以用例让模型再推进 0-3 帧，实机状态与其中一种完全相等即通过。
//       $00/$01：同 $09，最后打开声音更新，$03A0 分别为 0、$FF；
//       $0A/$0B：$0653 为 $FF 时曲子地址取自 $0C/$0D（页组 $0642）经 $2C 的结果；否则 $0C/$0D 指向 3 字节一项的曲目表 [页数÷4, 偏移低, 偏移高（高 4 位加页数、低 4 位加地址高字节）]，曲子相对表首；$0A 在 $0499 位 7 为 1（正在播放）时不复位，$0B 总是先复位；音效用的页放 $04A3。
//       起播用 SOUND_START_TRACKS，曲号 $049A 为 0：音乐格式的曲子（首字节不小于 $80）在 $03BB 也为 0 时不会起播，只写 APU 状态。
// ------------------------------------------------------------------------
import { runCall } from '../../tools/rom-driver.mjs';
import { SoundEngine } from '../lib/sound-engine.mjs';
import { REGION_LENGTH, REGION_START, ZP_LENGTH, pattern } from './p04-sound-start.mjs';
import { buildSong } from './p04-sound-tick.mjs';

const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const toHex = (bytes) => [...bytes].map(hexName).join('');
const APU_ADDRESSES = [...Array.from({ length: 0x14 }, (_, i) => 0x4000 + i), 0x4015];
const CD1 = [0xcd, 0x01, 0x00];

const groupWrites = (writes, status) => {
  const result = new Map(APU_ADDRESSES.map((address) => [address, []]));
  for (const [address, value] of writes) result.get(address).push(value);
  result.set(0x4015, [...status]);
  return result;
};

/**
 * 一个起播用例
 * @param {object} p 说明：sub 子功能号；song 曲子字节；songOffset 曲子在扩展 RAM 页 $80 起的偏移；table 曲目表字节与偏移；index 曲目号（$0653，$FF 为直接指针）；region 预置内存
 */
const playCase = (p) => {
  const { id, title, sub, song, songOffset = 0x500, table = null, tableOffset = 0x300, index = 0xff, clean = false, extra = null } = p;
  const page = 0x80;
  const zp = [0x11, 0x22, 0x33, 0x44];
  const region = clean ? new Array(REGION_LENGTH).fill(0) : pattern(5, REGION_LENGTH);
  if (clean) { region[0x48b - REGION_START] = 0x8d; region[0x48d - REGION_START] = 0x40; region[0x48e - REGION_START] = 0x60; }
  if (extra) extra(region);
  const pram = new Uint8Array(0x10000).fill(0xee);
  song.forEach((byte, i) => { pram[songOffset + i] = byte; });
  if (table) table.forEach((byte, i) => { pram[tableOffset + i] = byte; });
  const pointerOffset = table ? tableOffset : songOffset;
  const make = () => {
    const engine = new SoundEngine({ zp, region }, pram, { music: page });
    const lo = pointerOffset & 0xff;
    const hi = pointerOffset >> 8;
    if (sub === 0x00 || sub === 0x01) {
      engine.set(2, lo);
      engine.set(3, 0x80 | hi);
      engine.play(0);
      engine.set(0x3a6, 0xff);
      engine.set(0x4a1, page);
      engine.play(0x7f);
      engine.set(0x3a0, sub === 0 ? 0 : 0xff);
    } else {
      if (sub === 0x0b || (engine.get(0x499) & 0x80) === 0) engine.play(0);
      if (index === 0xff) {
        engine.set(0x4a3, page);
        engine.set(2, lo);
        engine.set(3, 0x80 | hi);
      } else {
        const entry = index * 3;
        const b0 = pram[pointerOffset + entry];
        const b1 = pram[pointerOffset + entry + 1];
        const b2 = pram[pointerOffset + entry + 2];
        const sum = b1 + lo;
        engine.set(2, sum);
        engine.set(3, ((b2 & 0x0f) + hi + (sum > 0xff ? 1 : 0)) | 0x80);
        engine.set(0x4a3, ((b0 * 4) & 0xff) + (b2 >> 4) + page);
      }
      engine.window = engine.get(0x4a3);
      engine.set(0x499, engine.get(0x499) & 0x7f);
      engine.startTracks();
    }
    return engine;
  };
  const expected = [];
  const engine = make();
  for (let ticks = 0; ticks <= 3; ticks++) {
    expected.push({
      region: Array.from(engine.ram.slice(REGION_START, REGION_START + REGION_LENGTH)),
      zp: Array.from(engine.ram.slice(0, ZP_LENGTH)),
      writes: groupWrites(engine.writes, engine.apu),
    });
    engine.update();
  }
  return {
    id: `sound.play.${id}`,
    title: `$65/$${hexName(sub)} ${title}`,
    fresh: true,
    steps: [{
      host: async (client) => {
        const image = new Array(0x4000).fill(0xee);
        song.forEach((byte, i) => { image[songOffset + i] = byte; });
        if (table) table.forEach((byte, i) => { image[tableOffset + i] = byte; });
        await client.send(`write pram 0 ${toHex(image)}`);
        return runCall(client, {
          func: 0x65,
          sub,
          mem: [[0x0, zp], [REGION_START, region], [0x642, [page]], [0x0c, [pointerOffset & 0xff, 0x80 | (pointerOffset >> 8)]], [0x653, [index]], [0x630, [0x00]]],
          read: [[0x0, ZP_LENGTH], [REGION_START, REGION_LENGTH], [0x630, 1]],
          capture: APU_ADDRESSES,
          settle: 0,
          maxFrames: 120,
        });
      },
      check: ({ data: result }) => {
        if (!result.done) return ['调用没有返回'];
        const zpGot = result.memory.get(0x0);
        const got = result.memory.get(REGION_START);
        const mismatch = (want) => {
          const problems = [];
          for (let i = 0; i < ZP_LENGTH; i++) if (zpGot[i] !== want.zp[i]) problems.push(`ZP_${hexName(i)} 为 ${hexName(zpGot[i])}，预期 ${hexName(want.zp[i])}`);
          for (let i = 0; i < REGION_LENGTH; i++) if (got[i] !== want.region[i]) problems.push(`$${(REGION_START + i).toString(16).toUpperCase()} 为 ${hexName(got[i])}，预期 ${hexName(want.region[i])}`);
          for (const address of APU_ADDRESSES) {
            const gotWrites = result.writes.get(address) ?? [];
            const wantWrites = want.writes.get(address);
            if (toHex(gotWrites) !== toHex(wantWrites)) problems.push(`$${address.toString(16)} 写入 ${toHex(gotWrites)}，预期 ${toHex(wantWrites)}`);
          }
          return problems;
        };
        let best = null;
        for (let ticks = 0; ticks <= 3; ticks++) {
          const problems = mismatch(expected[ticks]);
          if (problems.length === 0) {
            if ((result.memory.get(0x630)[0] & 0x40) === 0) return ['$0630 位 6（声音更新）没有打开'];
            return [];
          }
          if (best === null || problems.length < best.problems.length) best = { ticks, problems };
        }
        return [`与起播后 0-3 帧的模型都不一致（以差异最少的 ${best.ticks} 帧为准）：`, ...best.problems.slice(0, 12)];
      },
    }],
  };
};

const fxTrack = [0xe3, 0xbf, 0xe0, 0x08, 0xe1, 0x20, 0xe2, 0x08, 0x50, 0x05, 0xd3];
const effectSong = (priority, channel) => [priority, channel, 0x05, 0x00, 0xff, ...fxTrack];

export const cases = [
  playCase({ id: 'load-0', title: '载入音乐格式曲子起播（$03A0=0，三角波声道）', sub: 0x00, song: buildSong([{ channel: 2, data: [0x06, 0x40, 0x06, 0x44, 0xd3] }]) }),
  playCase({ id: 'load-1', title: '载入音乐格式曲子起播（$03A0=$FF，三角波声道）', sub: 0x01, song: buildSong([{ channel: 2, data: [0x06, 0x40, 0x06, 0x44, 0xd3] }]) }),
  playCase({ id: 'effect-direct', title: '直接按指针起播音效（先复位）', sub: 0x0b, song: effectSong(0x20, 5) }),
  playCase({ id: 'a-reset', title: '$0499 位 7 为 0 时先复位再起播音效', sub: 0x0a, song: effectSong(0x20, 5), extra: (region) => { region[0x499 - REGION_START] &= 0x7f; } }),
  playCase({ id: 'a-keep', title: '正在播放（$0499 位 7 为 1）时不复位，优先级不低于当前声道的才起播', sub: 0x0a, song: effectSong(0x20, 5), clean: true, extra: (region) => { region[0x499 - REGION_START] = 0x80; region[0x3bb + 5 - REGION_START] = 0x10; } }),
  playCase({ id: 'a-lower', title: '正在播放时优先级低于当前声道的音效不起播', sub: 0x0a, song: effectSong(0x08, 5), clean: true, extra: (region) => { region[0x499 - REGION_START] = 0x80; region[0x3bb + 5 - REGION_START] = 0x10; } }),
  playCase({
    id: 'table-1',
    title: '按曲目表第 1 项起播（页数 0，偏移 $0200）',
    sub: 0x0b,
    index: 1,
    table: [0x00, 0x00, 0x01, 0x00, 0x00, 0x02, 0x00, 0x00, 0x03],
    song: effectSong(0x20, 6),
    songOffset: 0x500,
  }),
  playCase({
    id: 'table-0',
    title: '按曲目表第 0 项起播（偏移带进位）',
    sub: 0x0b,
    index: 0,
    table: [0x00, 0xf0, 0x01],
    tableOffset: 0x310,
    song: effectSong(0x30, 4),
    songOffset: 0x500,
  }),
  playCase({ id: 'music-format', title: '音乐格式的曲子（曲号 0 与 $03BB 相同）不起播，只写 APU 状态', sub: 0x0b, song: buildSong([{ channel: 0, data: [...CD1, 0x08, 0x50, 0xd3] }]) }),
];
