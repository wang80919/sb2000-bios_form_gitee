// ------------------------------------------------------------------------
// 名称：p04-sound-tick.mjs
// 说明：声音引擎每帧更新的验证用例：用 $65/$09 起播后，关掉 NMI 里的声音更新，直接调用 NMI_SOUND_UPDATE（$C3A2）一帧一帧推进，每帧核对 $0393-$04A3 与 SOUND_TEMP0-03 的全部字节以及写向 APU 寄存器（$4000-$4017）的字节序列。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值来自 verify/lib/sound-engine.mjs 的字节级模型（按 bios/src/kernel/sound-engine.asm $C3A2-$CF52 转录）；模型的细节见该文件头。
//       曲子用音乐格式（首字节 $80，声道项 [声道号, 偏移 16 位]，结束字节 $FF）；音轨字节：$00-$3F 时长，$40-$BF 音符，$C0-$E4 命令。
// ------------------------------------------------------------------------
import { runCall } from '../../tools/rom-driver.mjs';
import { SoundEngine } from '../lib/sound-engine.mjs';
import { REGION_LENGTH, REGION_START, ZP_LENGTH, pattern } from './p04-sound-start.mjs';

const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const toHex = (bytes) => [...bytes].map(hexName).join('');
const APU_ADDRESSES = [...Array.from({ length: 0x14 }, (_, i) => 0x4000 + i), 0x4015];

/** 把声道与音轨数据拼成音乐格式的曲子 */
export const buildSong = (tracks, extra = []) => {
  const headerLength = 1 + tracks.length * 3 + 1 + extra.length;
  const header = [0x80, ...extra];
  const body = [];
  let offset = headerLength;
  for (const { channel, data } of tracks) {
    header.push(channel, offset & 0xff, offset >> 8);
    body.push(...data);
    offset += data.length;
  }
  header.push(0xff);
  return [...header, ...body];
};

const groupWrites = (writes) => {
  const result = new Map(APU_ADDRESSES.map((address) => [address, []]));
  for (const [address, value] of writes) result.get(address).push(value);
  return result;
};

const DEFAULT_POKE = [[0x44e, [0x8b, 0x8b, 0x8b]], [0x451, [0xd1, 0xd1, 0xd1]], [0x3ff, [0x40, 0x40, 0x40, 0x40]]];

const tickCase = ({ id, title, song, ticks, offset = 0x400, poke: extraPoke = [], preset = null, seed = 3, extraPram = [] }) => {
  const poke = [...DEFAULT_POKE, ...extraPoke];
  const page = 0x80 + (offset >> 12);
  const zp = [0x11, 0x22, 0x33, 0x44];
  const region = pattern(seed, REGION_LENGTH);
  region[0x4a2 - REGION_START] = page;
  region[0x4a3 - REGION_START] = page;
  if (preset) preset(region);
  const pram = new Uint8Array(0x10000).fill(0xee);
  song.forEach((byte, i) => { pram[offset + i] = byte; });
  for (const { base, image } of extraPram) image.forEach((byte, i) => { pram[base + i] = byte; });
  const engine = new SoundEngine({ zp, region }, pram, { music: page });
  engine.set(2, offset & 0xff);
  engine.set(3, 0x80 | ((offset >> 8) & 0x0f));
  engine.play(0);
  engine.set(0x3a6, 0xff);
  engine.set(0x4a1, page);
  engine.play(0x7f);
  engine.set(0x3a0, 0);
  for (const [address, bytes] of poke) bytes.forEach((byte, i) => engine.set(address + i, byte));
  const expected = [];
  for (let t = 0; t < ticks; t++) {
    const before = engine.writes.length;
    const apuBefore = engine.apu.length;
    engine.update();
    expected.push({
      region: Array.from(engine.ram.slice(REGION_START, REGION_START + REGION_LENGTH)),
      zp: Array.from(engine.ram.slice(0, ZP_LENGTH)),
      writes: groupWrites(engine.writes.slice(before)),
      status: engine.apu.slice(apuBefore),
    });
  }
  return {
    id: `sound.tick.${id}`,
    title: `声音引擎 ${title}（${ticks} 帧）`,
    fresh: true,
    steps: [{
      host: async (client) => {
        const windowBase = (page - 0x80) * 0x1000;
        const windowImage = new Array(0x4000).fill(0xee);
        song.forEach((byte, i) => { windowImage[offset - windowBase + i] = byte; });
        await client.send(`write pram ${windowBase.toString(16)} ${toHex(windowImage)}`);
        for (const { base, image } of extraPram) await client.send(`write pram ${base.toString(16)} ${toHex(image)}`);
        const first = await runCall(client, {
          func: 0x65,
          sub: 0x09,
          mem: [[0x0, zp], [REGION_START, region], [0x642, [page]], [0x0c, [offset & 0xff, 0x80 | ((offset >> 8) & 0x0f)]]],
          maxFrames: 120,
        });
        for (const [address, bytes] of poke) await client.send(`write cpu ${address.toString(16)} ${toHex(bytes)}`);
        const results = [];
        for (let t = 0; t < ticks; t++) {
          results.push(await runCall(client, {
            addr: 0xc3a2,
            read: [[0x0, ZP_LENGTH], [REGION_START, REGION_LENGTH]],
            capture: [...APU_ADDRESSES],
            maxFrames: 60,
          }));
        }
        return { first, results };
      },
      check: ({ data }) => {
        const problems = [];
        if (!data.first.done) return ['起播调用没有返回'];
        for (let t = 0; t < ticks; t++) {
          const result = data.results[t];
          const label = `第 ${t + 1} 帧`;
          if (!result.done) { problems.push(`${label}没有返回`); break; }
          const want = expected[t];
          const zpGot = result.memory.get(0x0);
          for (let i = 0; i < ZP_LENGTH; i++) if (zpGot[i] !== want.zp[i]) problems.push(`${label}ZP_${hexName(i)} 为 ${hexName(zpGot[i])}，预期 ${hexName(want.zp[i])}`);
          const got = result.memory.get(REGION_START);
          for (let i = 0; i < REGION_LENGTH; i++) {
            if (got[i] !== want.region[i]) problems.push(`${label}$${(REGION_START + i).toString(16).toUpperCase()} 为 ${hexName(got[i])}，预期 ${hexName(want.region[i])}`);
          }
          for (const address of APU_ADDRESSES) {
            const gotWrites = result.writes.get(address) ?? [];
            const wantWrites = address === 0x4015 ? want.status : want.writes.get(address);
            if (toHex(gotWrites) !== toHex(wantWrites)) problems.push(`${label}$${address.toString(16)} 写入 ${toHex(gotWrites)}，预期 ${toHex(wantWrites)}`);
          }
          if (problems.length) break;
        }
        return problems.slice(0, 60);
      },
    }],
  };
};

// 乐器 1 的第 0 项（$CD 命令：表号 1、项号 0）
const CD1 = [0xcd, 0x01, 0x00];
const solo = (channel, data) => buildSong([{ channel, data }]);

// 命令 $CD 位 7 用的第二页：页 $88（窗口 $8000-$BFFF 对应 PRAM $8000 起），指针表在 $A000，表 t 在 $A100 + t × $20，每项 4 字节
const PAGE2 = 0x88;
const page2Image = () => {
  const image = new Array(0x4000).fill(0xee);
  const put = (address, bytes) => bytes.forEach((byte, i) => { image[address - 0x8000 + i] = byte; });
  for (let table = 0; table < 4; table++) {
    const at = 0xa100 + table * 0x20;
    put(0xa000 + table * 2, [at & 0xff, at >> 8]);
    for (let item = 0; item < 8; item++) put(at + item * 4, [0x8b, 0xd1, 0x05 + table * 0x10 + item, 0x80 + table * 8 + item]);
  }
  return image;
};
/** 零页 $04/$05 是指针表地址，由调用者设置；声音引擎不写它 */
const PAGE2_OPTIONS = { extraPram: [{ base: (PAGE2 - 0x80) * 0x1000, image: page2Image() }], poke: [[0x4a2, [PAGE2]], [0x4, [0x00, 0xa0]]] };
/** 音效页 $84 里的曲子副本（与音乐页 $80 里的不同：$CD 之后是音符而不是停止声道） */
const fxPageImage = (() => {
  const image = new Array(0x4000).fill(0xee);
  solo(5, [0xcd, 0x81, 0x01, 0x50, 0x05, 0xd3]).forEach((byte, i) => { image[0x400 + i] = byte; });
  return image;
})();

export const cases = [
  tickCase({ id: 'basic-note', title: '声道 0 设乐器后一个音符，然后停曲', song: buildSong([{ channel: 0, data: [...CD1, 0x08, 0x50, 0xd0] }]), ticks: 14 }),
  tickCase({
    id: 'three-channels',
    title: '声道 0、1、2（含三角波）各播几个音符后停声道',
    song: buildSong([
      { channel: 0, data: [...CD1, 0x08, 0x50, 0x08, 0x54, 0xd3] },
      { channel: 1, data: [0xcd, 0x02, 0x01, 0x06, 0x4a, 0x06, 0x4e, 0x06, 0x52, 0xd3] },
      { channel: 2, data: [0x06, 0x40, 0x06, 0x44, 0x06, 0x48, 0xd3] },
    ]),
    ticks: 30,
  }),
  tickCase({ id: 'noise-channel', title: '噪声声道 3（噪声表指针指向 ROM $CFFB，只用第 0 项，其后的项指向不可预测的地址）', song: solo(3, [0x08, 0x40, 0x08, 0x40, 0x08, 0x40, 0xd3]), ticks: 30, poke: [[0x489, [0xfb, 0xcf]]] }),
  tickCase({ id: 'fx-pulse', title: '音效声道 4：设寄存器后两个音符', song: solo(4, [0xe3, 0xbf, 0xe0, 0x08, 0xe1, 0x20, 0xe2, 0x08, 0x50, 0x05, 0x54, 0x05, 0xd3]), ticks: 20 }),
  tickCase({
    id: 'fx-over-music',
    title: '音效声道 4 压住音乐声道 0 的寄存器写入',
    song: buildSong([
      { channel: 0, data: [...CD1, 0x20, 0x50, 0x20, 0x54, 0xd3] },
      { channel: 4, data: [0xe3, 0xbf, 0xe0, 0x08, 0xe1, 0x20, 0xe2, 0x08, 0x50, 0x05, 0xd3] },
    ]),
    ticks: 30,
  }),
  tickCase({ id: 'fx-triangle', title: '音效声道 6（三角波）与触发命令 $E4', song: solo(6, [0xe3, 0x08, 0xe1, 0x00, 0xe2, 0x08, 0x50, 0x04, 0xe4, 0x06, 0x54, 0x04, 0xd3]), ticks: 25 }),
  tickCase({ id: 'fx-noise', title: '音效声道 7（噪声）', song: solo(7, [0xe3, 0x3f, 0xe1, 0x05, 0xe2, 0x08, 0x42, 0x05, 0xd3]), ticks: 20 }),
  tickCase({ id: 'pitch-commands', title: '命令 $C2、$C3 调整音高偏移', song: solo(0, [...CD1, 0x08, 0xc2, 0x10, 0x50, 0xc3, 0x04, 0x50, 0xc3, 0xfc, 0x50, 0xc3, 0x90, 0x50, 0xd3]), ticks: 45 }),
  tickCase({ id: 'volume-commands', title: '命令 $C4-$C8 设置音量与时长参数', song: solo(0, [...CD1, 0x08, 0xc4, 0x20, 0x50, 0xc5, 0x08, 0x50, 0xc6, 0x05, 0xc7, 0x80, 0xc8, 0x04, 0x54, 0xd3]), ticks: 40 }),
  tickCase({ id: 'rest-c9', title: '命令 $C9 休止', song: solo(0, [...CD1, 0x08, 0x50, 0xc9, 0x54, 0xd3]), ticks: 30 }),
  tickCase({ id: 'ext-notes', title: '带扩展字节的音符（$80 以上的音符）', song: solo(0, [...CD1, 0x08, 0x90, 0x40, 0x94, 0x80, 0x98, 0x20, 0x9c, 0xe0, 0xa0, 0x00, 0xd3]), ticks: 60 }),
  tickCase({ id: 'tempo-cc', title: '命令 $CC 降低拍速（每帧累加的进位决定几帧走一拍）', song: solo(0, [...CD1, 0xcc, 0x80, 0x08, 0x50, 0x08, 0x54, 0xd3]), ticks: 40 }),
  tickCase({ id: 'loop-ce', title: '命令 $CE 计数循环 3 次', song: solo(0, [...CD1, 0x08, 0x50, 0xce, 0x03, 0x08, 0x00, 0xd3]), ticks: 45 }),
  tickCase({ id: 'loop-cf', title: '命令 $CF 计数循环 2 次', song: solo(0, [...CD1, 0x08, 0x50, 0xcf, 0x02, 0x08, 0x00, 0xd3]), ticks: 35 }),
  tickCase({ id: 'jump-df', title: '命令 $DF 跳转（跳过 $D3）', song: solo(0, [...CD1, 0x08, 0xdf, 0x0d, 0x00, 0xd3, 0x50, 0xd3]), ticks: 25 }),
  tickCase({ id: 'loop-d1', title: '命令 $D1 设循环点与终点，到终点回到循环点', song: solo(0, [...CD1, 0xd1, 0x0d, 0x00, 0x0f, 0x00, 0x08, 0x50, 0xd2, 0xd3]), ticks: 45 }),
  tickCase({ id: 'loop-d2', title: '命令 $D2 回到 $DF 记下的位置', song: solo(0, [...CD1, 0x08, 0xdf, 0x0a, 0x00, 0x50, 0xd2, 0xd3]), ticks: 40 }),
  tickCase({ id: 'vibrato', title: '颤音：命令 $DB 设参数、$DC 打开', song: solo(0, [...CD1, 0x08, 0xdb, 0x01, 0x01, 0x02, 0x08, 0xdc, 0x50, 0x50, 0x50, 0xd3]), ticks: 60 }),
  tickCase({ id: 'repeat-da', title: '命令 $DA 让下一个字节重复 3 次', song: solo(0, [...CD1, 0x08, 0xda, 0x03, 0x50, 0x54, 0xd3]), ticks: 50 }),
  tickCase({ id: 'gate-de', title: '命令 $DE 设置释放计数', song: solo(0, [...CD1, 0x08, 0xde, 0x03, 0x50, 0x54, 0xd3]), ticks: 40 }),
  tickCase({ id: 'misc-d4-d8', title: '命令 $D4、$D8、$D6、$D7', song: solo(0, [...CD1, 0x08, 0xd4, 0x12, 0xd8, 0x03, 0x50, 0xd6, 0x54, 0xd7, 0x58, 0xd3]), ticks: 45 }),
  tickCase({ id: 'apu-off-d5', title: '命令 $D5 关 APU 并暂停音乐声道', song: solo(0, [...CD1, 0x08, 0x50, 0xd5, 0x54, 0xd3]), ticks: 25 }),
  tickCase({ id: 'loop-restart-d0', title: '$03A0 非 0 时命令 $D0 重新初始化并结束本帧', song: solo(0, [...CD1, 0x08, 0x50, 0xd0]), ticks: 25, poke: [[0x3a0, [1]]] }),
  tickCase({
    id: 'fx-stop-channel',
    title: '音效声道用 $D3 结束时把音乐声道的寄存器影子写出',
    song: buildSong([
      { channel: 0, data: [...CD1, 0x20, 0x50, 0x20, 0x54, 0xd3] },
      { channel: 4, data: [0xe3, 0xbf, 0xe0, 0x08, 0xe1, 0x20, 0xe2, 0x08, 0x50, 0x05, 0xd3] },
    ]),
    ticks: 30,
  }),
  tickCase({ id: 'envelope-run', title: '包络表（$03B5 位 6）逐级推进', song: solo(0, [0xcd, 0x41, 0x00, 0x08, 0x50, 0x54, 0xd3]), ticks: 45 }),
  tickCase({ id: 'transpose', title: '全局移调 $0393 与声道移调 $0447', song: solo(0, [...CD1, 0x08, 0x50, 0x54, 0xd3]), ticks: 25, poke: [[0x393, [3]], [0x447, [2]]] }),
  tickCase({ id: 'note-commands', title: '命令 $C0、$C1 直接设置音符值', song: solo(0, [...CD1, 0x08, 0xc0, 0x50, 0x50, 0xc1, 0x04, 0x50, 0xd3]), ticks: 30 }),
  tickCase({ id: 'music-e-commands', title: '命令 $E3 在音乐声道上什么都不做，参数当作下一个字节', song: solo(0, [...CD1, 0x08, 0xe3, 0x10, 0x50, 0xd3]), ticks: 20 }),
  tickCase({ id: 'fx-commands', title: '音效声道 5 上的 $C2-$C5 与音符', song: solo(5, [0xe3, 0xbf, 0xc2, 0x10, 0xc4, 0x20, 0x50, 0x05, 0xc3, 0x04, 0x54, 0x05, 0xc5, 0x04, 0x58, 0x05, 0xd3]), ticks: 30 }),
  tickCase({ id: 'cd-fx', title: '命令 $CD 在音效声道 5 上只写寄存器影子', song: solo(5, [0xcd, 0x02, 0x01, 0x50, 0x05, 0xd3]), ticks: 15 }),
  tickCase({ id: 'vibrato-ff', title: '颤音：$0460 为 $FF（偏移初值 $F8）、$045D 为负', song: solo(0, [...CD1, 0x08, 0xdb, 0x01, 0xff, 0xfe, 0x10, 0xdc, 0x50, 0x50, 0xd3]), ticks: 50 }),
  tickCase({ id: 'vibrato-fe', title: '颤音：$0460 为 $FE（偏移初值 $F0）', song: solo(0, [...CD1, 0x08, 0xdb, 0x02, 0xfe, 0x03, 0x20, 0xdc, 0x50, 0x50, 0xd3]), ticks: 50 }),
  tickCase({ id: 'vibrato-fd', title: '颤音：$0460 为 $FD（偏移初值 $10）', song: solo(0, [...CD1, 0x08, 0xdb, 0x01, 0xfd, 0x02, 0x10, 0xdc, 0x50, 0x50, 0xd3]), ticks: 50 }),
  tickCase({ id: 'rest-ch1', title: '声道 1 上的 $C9 休止', song: solo(1, [0xcd, 0x02, 0x01, 0x08, 0x50, 0xc9, 0x54, 0xd3]), ticks: 30 }),
  tickCase({ id: 'db-noise', title: '命令 $DB 在噪声声道上多跳过 1 字节', song: solo(3, [0x08, 0x40, 0xdb, 0x01, 0x01, 0x02, 0x08, 0x00, 0x40, 0xd3]), ticks: 30, poke: [[0x489, [0xfb, 0xcf]]] }),
  tickCase({
    id: 'effect-format',
    title: '音效格式的曲子（首字节是优先级）里的音效声道 5',
    song: [0x20, 0x05, 0x05, 0x00, 0xff, 0xe3, 0xbf, 0xe0, 0x08, 0xe1, 0x20, 0xe2, 0x08, 0x50, 0x05, 0xd3],
    ticks: 20,
  }),
  tickCase({ id: 'update-gated', title: '$0499 位 7 为 0 时整个更新不执行', song: solo(0, [...CD1, 0x08, 0x50, 0xd3]), ticks: 5, poke: [[0x499, [0x02]]] }),
  tickCase({ id: 'duration-scale', title: '时长与 $043F 相乘取高字节（$C7 重算）', song: solo(0, [...CD1, 0x30, 0xc7, 0x20, 0x50, 0x01, 0xc7, 0xff, 0x54, 0xd3]), ticks: 70 }),
  // ---- 命令 $CD 的位 7：音色表取自第二页 $04A2 的指针表 ----
  tickCase({ id: 'cd-page2-ch0', title: '命令 $CD 位 7：声道 0，表 1 第 2 项取自第二页', song: solo(0, [0xcd, 0x81, 0x02, 0x08, 0x50, 0x54, 0xd3]), ticks: 25, ...PAGE2_OPTIONS }),
  tickCase({ id: 'cd-page2-table0', title: '命令 $CD 位 7：声道 0，表 0 第 0 项', song: solo(0, [0xcd, 0x80, 0x00, 0x08, 0x50, 0x54, 0xd3]), ticks: 25, ...PAGE2_OPTIONS }),
  tickCase({ id: 'cd-page2-ch1', title: '命令 $CD 位 7：声道 1，表 3 第 5 项', song: solo(1, [0xcd, 0x83, 0x05, 0x08, 0x50, 0x54, 0xd3]), ticks: 25, ...PAGE2_OPTIONS }),
  tickCase({ id: 'cd-page2-wrap', title: '命令 $CD 位 7：项号 $41 乘 4 只取低 8 位，等于第 1 项', song: solo(0, [0xcd, 0x82, 0x41, 0x08, 0x50, 0x54, 0xd3]), ticks: 25, ...PAGE2_OPTIONS }),
  tickCase({ id: 'cd-page2-fx', title: '命令 $CD 位 7：音效声道 5 只写寄存器影子与更新标志', song: solo(5, [0xcd, 0x81, 0x01, 0x50, 0x05, 0xd3]), ticks: 15, ...PAGE2_OPTIONS }),
  tickCase({ id: 'cd-page2-fx7', title: '命令 $CD 位 7：音效声道 7（噪声音效）', song: solo(7, [0xcd, 0x80, 0x03, 0x42, 0x05, 0xd3]), ticks: 15, ...PAGE2_OPTIONS }),
  tickCase({ id: 'cd-page2-ch2', title: '命令 $CD 位 7：声道 2（三角波）只跳过两个参数', song: solo(2, [0xcd, 0x81, 0x01, 0x08, 0x50, 0xd3]), ticks: 20, ...PAGE2_OPTIONS }),
  tickCase({
    id: 'cd-page2-fx-window',
    title: '命令 $CD 位 7：结束时窗口换回音乐页 $04A1，音效页 $04A3 与它不同时，音效声道后面的字节取自音乐页',
    song: solo(5, [0xcd, 0x81, 0x01, 0xd3, 0xd3, 0xd3]),
    ticks: 15,
    extraPram: [...PAGE2_OPTIONS.extraPram, { base: 0x4000, image: fxPageImage }],
    poke: [...PAGE2_OPTIONS.poke, [0x4a3, [0x84]]],
  }),
  // ---- 命令 $CD 在噪声声道 3 上：X 被改成（参数 & $3F）× 2 ----
  tickCase({ id: 'cd-noise-x0', title: '命令 $CD 在噪声声道：参数 0，X 变成 0，之后的字节按声道 0 解释', song: solo(3, [0xcd, 0x00, 0x00, 0x08, 0x50, 0xd3]), ticks: 30 }),
  tickCase({ id: 'cd-noise-x2', title: '命令 $CD 在噪声声道：参数 1，X 变成 2', song: solo(3, [0xcd, 0x01, 0x00, 0x08, 0x50, 0xd3]), ticks: 30 }),
  tickCase({ id: 'cd-noise-flags', title: '命令 $CD 在噪声声道：参数 $41（低 6 位 1），X 变成 2，另置位噪声寄存器 0 的 $30', song: solo(3, [0xcd, 0x41, 0x00, 0x08, 0x50, 0xd3]), ticks: 30 }),
  tickCase({ id: 'cd-noise-x4', title: '命令 $CD 在噪声声道：参数 2，X 变成 4，之后的字节按音效声道 4 解释', song: solo(3, [0xcd, 0x02, 0x00, 0x08, 0x50, 0xd3]), ticks: 30 }),
  tickCase({ id: 'cd-noise-x6', title: '命令 $CD 在噪声声道：参数 3，X 变成 6', song: solo(3, [0xcd, 0x03, 0x00, 0x08, 0x50, 0xd3]), ticks: 30 }),
];
