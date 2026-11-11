// ------------------------------------------------------------------------
// 名称：p04-sound-start.mjs
// 说明：声音服务起播与停止的验证用例：$65/$09（载入曲子并起播，不重新打开声音更新）、$65/$02（停止）、$65/$06-$08（调整 $03FF 起的参数）。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值按 bios/src/kernel/sound-services.asm（$F43A-$F5F1 起播部分、$F3A4-$F439 停止与调整部分）的代码阅读写成模型。
//       $65/$09：关声音更新（$0630 位 6 清 0），把 $0C/$0D（页组 $0642）指向的数据经 $2C 转成窗口地址放 SOUND_TRACK_PTR_LO/03，先按曲号 0 复位并把 APU 状态写 $0F，再置 $03A6=$FF、$04A1=页号、曲号 $7F 起播（SOUND_START_TRACKS），$03A0 清 0。
//       曲数据有两种头：首字节不小于 $80 为“音乐”：$7F 与 $03BB 比较，相同则只写 APU 状态 $0F；否则 $03BB 置曲号，$03D4-$03D6 置 $FF，$0499 置位 1、清位 6，记下曲首地址（$039B/$039C、$03B3/$03B4），再按声道项初始化；
//       首字节小于 $80 为“音效”：首字节是优先级放 SOUND_TEMP0，$039D/$039E 与 $03B3/$03B4 记曲首，第 2 字节小于 $80 时是声道号，不小于 $80 时第 3 字节放 $03BD、曲号放 $03BE、$0499 置位 5；
//       声道项为 3 字节（声道号小于 $80、音轨地址偏移 16 位），声道号不小于 $80 结束；音效格式里优先级小于 $03BB+声道号时整首不起播，否则逐项登记（声道号不小于 4 时把优先级写进 $03BB+声道号）。
//       初始化声道：声道 0-2 的 $045D=$1E、$0466=$96，声道 0-3 的 $043F=$F0、$0447=0；音轨指针（$03D7/$03DF）= 曲首 + 偏移；$0407、$040F、$03F7 清 0，$03E7=1，$03C3=$80，$03CB=1，$039F=1；声道 0-3 另置 $048F=1、$03B7=1；$0491、$03AB 置 $FF。
// ------------------------------------------------------------------------
import { runCall } from '../../tools/rom-driver.mjs';

const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const toHex = (bytes) => [...bytes].map(hexName).join('');
export const REGION_START = 0x393;
export const REGION_LENGTH = 0x111;
export const ZP_LENGTH = 4;

/** 声音状态模型：内存 $0000-$07FF 与 APU 状态寄存器的写入记录 */
export class SoundModel {
  constructor(initial, song, base) {
    this.ram = new Uint8Array(0x800);
    for (let i = 0; i < ZP_LENGTH; i++) this.ram[i] = initial.zp[i];
    for (let i = 0; i < REGION_LENGTH; i++) this.ram[REGION_START + i] = initial.region[i];
    this.song = song;
    this.base = base;
    this.apu = [];
  }

  get(address) { return this.ram[address]; }

  set(address, value) { this.ram[address] = value & 0xff; }

  songByte(address) { return this.song[address - this.base] ?? 0xee; }

  reset() {
    this.apu.push(0x00);
    this.set(0x393, 0);
    for (let x = 0; x < 256; x++) this.set(0x39b + x, 0);
    this.set(0x3a1, 0);
    this.set(0x48b, 0x8d);
    this.set(0x48d, 0x40);
    this.set(0x48e, 0x60);
  }

  finishOn() { this.apu.push(0x0f); this.finishFlag(); }

  finishFlag() { this.set(0x499, this.get(0x499) | 0x80); }

  /** SOUND_PLAY_SONG */
  play(songNumber) {
    this.set(0x499, this.get(0x499) & 0x7f);
    this.set(0x49a, songNumber);
    const x = songNumber;
    if (x === 0) { this.reset(); this.finishOn(); return; }
    if (x < 0x80) { this.startOrTable(); return; }
    switch (x) {
      case 0xff: this.playResume(); return;
      case 0xfe: this.set(0x3bc, this.get(0x3bb)); this.apu.push(0x00); this.finishFlag(); return;
      case 0xfd: this.set(0x499, this.get(0x499) | 0x40); this.set(0x3bc, this.get(0x3bb)); this.apu.push(0x00); this.finishFlag(); return;
      case 0xfc: { const keep = this.get(0x3bc); this.reset(); this.set(0x3bc, keep); this.finishOn(); return; }
      case 0xfb: this.set(0x499, this.get(0x499) & 0xdf); this.finishFlag(); return;
      default: this.reset(); this.finishOn();
    }
  }

  playResume() {
    throw new Error('曲号 $FF 的路径在本文件不测');
  }

  startOrTable() {
    if (this.get(0x3a6) === 0) throw new Error('按曲表起播的路径在本文件不测');
    this.startTracks();
  }

  /** SOUND_START_TRACKS */
  startTracks() {
    let y = 0;
    const lo = this.get(2);
    const hi = this.get(3);
    const at = (index) => this.songByte(((hi << 8) | lo) + index);
    const first = at(0);
    if (first >= 0x80) {
      if (this.get(0x49a) === this.get(0x3bb)) { this.apu.push(0x0f); this.finishFlag(); return; }
      this.set(0x3bb, this.get(0x49a));
      this.set(0x3d6, 0xff); this.set(0x3d4, 0xff); this.set(0x3d5, 0xff);
      this.set(0x499, (this.get(0x499) | 0x02) & 0xbf);
      this.set(0x39b, lo); this.set(0x3b3, lo);
      this.set(0x39c, hi); this.set(0x3b4, hi);
      this.initTracks();
      return;
    }
    this.set(0, first);
    this.set(0x39d, lo); this.set(0x3b3, lo);
    this.set(0x39e, hi); this.set(0x3b4, hi);
    y = 1;
    let value = at(y);
    if (value >= 0x80) {
      y = 2;
      this.set(0x3bd, at(y));
      this.set(0x3be, this.get(0x49a));
      this.set(0x499, this.get(0x499) | 0x20);
      for (;;) {
        y++;
        value = at(y);
        if (value >= 0x80) { this.initTracks(); return; }
        if (this.get(0) < this.get(0x3bb + value)) { this.finishFlag(); return; }
        y += 2;
      }
    }
    for (;;) {
      if (this.get(0) < this.get(0x3bb + value)) { this.finishFlag(); return; }
      y += 3;
      value = at(y);
      if (value >= 0x80) { this.initTracks(); return; }
    }
  }

  /** SOUND_INIT_TRACKS */
  initTracks() {
    const lo = this.get(2);
    const hi = this.get(3);
    const at = (index) => this.songByte(((hi << 8) | lo) + index);
    let y = 1;
    if (at(y) >= 0x80) y += 2;
    for (;;) {
      const x = at(y);
      if (x >= 0x80) { this.apu.push(0x0f); this.finishFlag(); return; }
      let skip = false;
      if (x >= 4) {
        this.set(0x3bb + x, this.get(0));
        if (this.get(0) !== 0) skip = true;
      }
      if (!skip) {
        if (x < 3) { this.set(0x45d + x, 0x1e); this.set(0x466 + x, 0x96); }
        this.set(0x43f + x, 0xf0);
        this.set(0x447 + x, 0);
      }
      y++;
      const low = at(y) + this.get(0x3b3);
      this.set(0x3d7 + x, low);
      y++;
      this.set(0x3df + x, at(y) + this.get(0x3b4) + (low > 0xff ? 1 : 0));
      this.set(0x407 + x, 0); this.set(0x40f + x, 0); this.set(0x3f7 + x, 0);
      this.set(0x3e7 + x, 1);
      this.set(0x3c3 + x, 0x80);
      this.set(0x3cb + x, 1);
      this.set(0x39f, 1);
      if (x < 4) { this.set(0x48f, 1); this.set(0x3b7 + x, 1); }
      this.set(0x491 + x, 0xff);
      this.set(0x3ab + x, 0xff);
      y++;
    }
  }
}

export const pattern = (seed, length) => Array.from({ length }, (_, i) => (i * 7 + seed) & 0xff);

/** 构造一次调用的模型与期望 */
const runModel = (kind, song, base, initial, page) => {
  const model = new SoundModel(initial, song, base);
  if (kind === 'start') {
    // SOUND_SUB_09
    model.set(2, base & 0xff);
    model.set(3, 0x80 | (base >> 8 & 0x0f));
    model.play(0);
    model.set(0x3a6, 0xff);
    model.set(0x4a1, page);
    model.play(0x7f);
    model.set(0x3a0, 0);
  }
  return model;
};

const startCase = (id, title, song, { offset = 0x400, zp = [0x11, 0x22, 0x33, 0x44], seed = 3 } = {}) => {
  const region = pattern(seed, REGION_LENGTH);
  const initial = { zp, region };
  const base = 0x8000 | (offset & 0x0fff);
  const page = 0x80 + (offset >> 12);
  const model = runModel('start', song, base, initial, page);
  return {
    id: `sound.start.${id}`,
    title: `$65/$09 ${title}`,
    fresh: true,
    steps: [{
      host: async (client) => {
        await client.send(`write pram ${offset.toString(16)} ${toHex([...song, ...new Array(0x40).fill(0xee)])}`);
        return runCall(client, {
          func: 0x65,
          sub: 0x09,
          mem: [[0x0, zp], [REGION_START, region], [0x642, [0x80 + (offset >> 12)]], [0x0c, [offset & 0xff, 0x80 | ((offset >> 8) & 0x0f)]]],
          read: [[0x0, ZP_LENGTH], [REGION_START, REGION_LENGTH], [0x630, 1]],
          capture: [0x4015],
          maxFrames: 120,
        });
      },
      check: ({ data: result }) => {
        const problems = [];
        if (!result.done) { problems.push('调用没有返回'); return problems; }
        const zpGot = result.memory.get(0x0);
        for (let i = 2; i < ZP_LENGTH; i++) {
          if (zpGot[i] !== model.ram[i]) problems.push(`ZP_${hexName(i)} 为 ${hexName(zpGot[i])}，预期 ${hexName(model.ram[i])}`);
        }
        if (zpGot[0] !== model.ram[0] || zpGot[1] !== model.ram[1]) problems.push(`SOUND_TEMP0/01 为 ${toHex(zpGot.slice(0, 2))}，预期 ${toHex(model.ram.slice(0, 2))}`);
        const got = result.memory.get(REGION_START);
        for (let i = 0; i < REGION_LENGTH; i++) {
          if (got[i] !== model.ram[REGION_START + i]) problems.push(`$${(REGION_START + i).toString(16).toUpperCase()} 为 ${hexName(got[i])}，预期 ${hexName(model.ram[REGION_START + i])}`);
        }
        if ((result.memory.get(0x630)[0] & 0x40) !== 0) problems.push('$0630 位 6 没有清除');
        if (toHex(result.writes.get(0x4015)) !== toHex(model.apu)) problems.push(`$4015 写入 ${toHex(result.writes.get(0x4015))}，预期 ${toHex(model.apu)}`);
        return problems.slice(0, 12);
      },
    }],
  };
};

// 音乐格式的曲子：$80、声道项（声道号、偏移 16 位）…、结束字节
const music = (entries, head = [0x80]) => [...head, ...entries.flatMap(([track, offset]) => [track, offset & 0xff, offset >> 8]), 0xff];
// 音效格式的曲子：优先级、（可选的 3 字节头）、声道项…、结束字节
const effect = (priority, entries, head = []) => [priority, ...head, ...entries.flatMap(([track, offset]) => [track, offset & 0xff, offset >> 8]), 0xff];

export const cases = [
  startCase('music-one', '音乐格式，一个声道（声道 0）', music([[0, 0x10]])),
  startCase('music-three', '音乐格式，三个声道（0、1、2）', music([[0, 0x20], [1, 0x30], [2, 0x40]])),
  startCase('music-noise', '音乐格式，噪声声道 3', music([[3, 0x28]])),
  startCase('music-fx', '音乐格式含音效声道 5：优先级取 SOUND_TEMP0 的旧值（非 0）', music([[0, 0x20], [5, 0x30]])),
  startCase('music-fx-zero', '音乐格式含音效声道 5：SOUND_TEMP0 旧值为 0 时不写 $03BB+5，按声道 5 的默认值初始化', music([[0, 0x20], [5, 0x30]]), { zp: [0x00, 0x22, 0x33, 0x44] }),
  startCase('music-head', '音乐格式带 2 字节头（第 2 字节不小于 $80）：声道项从第 4 字节起', music([[0, 0x44], [2, 0x55]], [0x80, 0x90, 0x01])),
  startCase('music-carry', '音轨偏移与曲首地址相加有进位（曲首低字节 $F0）', music([[0, 0x30], [1, 0x7f0]]), { offset: 0x4f0 }),
  startCase('music-page', '曲子放在第 3 个 4KB 页内（页组随之变化）', music([[0, 0x10], [1, 0x20]]), { offset: 0x2300 }),
  startCase('music-none', '音乐格式没有声道项', [0x80, 0xff]),
  startCase('effect-one', '音效格式，声道 4', effect(0x10, [[4, 0x18]])),
  startCase('effect-two', '音效格式，声道 4 与 5', effect(0x20, [[4, 0x18], [5, 0x28]])),
  startCase('effect-head', '音效格式带 3 字节头（第 2 字节不小于 $80，第 3 字节放 $03BD）', effect(0x30, [[4, 0x18]], [0x85, 0x07])),
  startCase('effect-zero-priority', '音效格式优先级为 0（声道 5 的 $03BB 写 0）', effect(0x00, [[5, 0x18]])),
  startCase('mixed', '音效格式混合音乐声道与音效声道', effect(0x40, [[1, 0x18], [6, 0x28], [3, 0x38]])),
];
