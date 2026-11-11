// ------------------------------------------------------------------------
// 名称：sound-engine.mjs
// 说明：声音引擎每帧更新（bios/src/kernel/sound-engine.asm 的 NMI_SOUND_UPDATE、SOUND_TICK 及其音轨解释器、包络、颤音、寄存器输出）的字节级模型，供 verify/cases/p04-sound-tick.mjs 使用。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：按代码阅读逐例程转录（$C3A2-$CF52），所有状态都放在 $0000-$07FF 的字节数组里，与实机的 $0393-$04A3 和 SOUND_TEMP0-03 逐字节比较；写 APU 的动作记入 writes（经 SOUND_APU_STUB 写 $4000 + $048C）。
//       表数据（周期表、音量表、噪声与乐器表、命令入口表）从 ROM 固定区读取，窗口地址 $8000-$BFFF 读扩展 RAM 镜像。
//       命令 $D0 在曲子重播（$03A0 非 0）时代码弹出 4 个返回地址，等于结束整个 SOUND_TICK，模型用异常模拟；命令 $D9 与音轨命令 $E5 以上不在模型范围。
// ------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { BIOS_ROM } from '../../tools/config.mjs';
import { SoundModel } from '../cases/p04-sound-start.mjs';

const rom = readFileSync(BIOS_ROM).subarray(16);
const romByte = (address) => rom[0x4000 + (address - 0xc000)];
const LO = (index) => romByte(0xcf6d + index);
const LO_NEXT = (index) => romByte(0xcf6e + index);
const HI = (index) => romByte(0xcfae + index);
const VOLUME_SCALE = (index) => romByte(0xd21b + index);

class TickAbort extends Error {}

/** 声音引擎模型 */
export class SoundEngine extends SoundModel {
  constructor(initial, pram, pages) {
    super(initial, [], 0);
    this.pram = pram;
    this.window = pages.music;
    this.writes = [];
  }

  r(address) { return this.ram[address]; }

  w(address, value) { this.ram[address] = value & 0xff; }

  songByte(address) { return this.read(address); }

  read(address) {
    const a = address & 0xffff;
    if (a >= 0xc000) return romByte(a);
    if (a >= 0x8000) return this.pram[(this.window - 0x80) * 0x1000 + (a - 0x8000)] ?? 0;
    return this.ram[a];
  }

  /** (SOUND_TRACK_PTR_LO),Y */
  ptr(y) { return this.read(((this.r(3) << 8) | this.r(2)) + y); }

  mulHigh() {
    const a = this.r(0);
    if (a === 0) return;
    let acc = 0;
    let multiplier = a;
    for (let i = 0; i < 8; i++) {
      const bit = multiplier & 1;
      multiplier >>= 1;
      let carry = 0;
      if (bit) {
        const sum = acc + this.r(1);
        carry = sum > 0xff ? 1 : 0;
        acc = sum & 0xff;
      }
      acc = (carry << 7) | (acc >> 1);
    }
    this.w(0, acc);
  }

  // ---- 入口 ----
  /** NMI_SOUND_UPDATE ($C3A2) */
  update() {
    if ((this.r(0x499) & 0x80) === 0) return;
    if ((this.r(0x499) & 0x20) !== 0 && (this.r(0x499) & 0x40) === 0) {
      this.w(0x3bd, this.r(0x3bd) - 1);
      if (this.r(0x3bd) === 0) throw new Error('自动切歌路径不在模型范围');
    }
    this.tick();
  }

  tick() {
    try { this.tickBody(); } catch (error) { if (!(error instanceof TickAbort)) throw error; }
  }

  tickBody() {
    if (this.r(0x39f) === 0) return;
    let x = 7;
    do {
      this.w(0x3d3, x);
      if (this.r(0x3cb + x) !== 0) {
        this.window = this.r(0x4a3);
        this.w(0x3e7 + x, this.r(0x3e7 + x) - 1);
        if (this.r(0x3e7 + x) === 0) x = this.trackRun(x);
      }
      if (this.r(0x3c3 + x) !== 0) this.flush(x);
      x--;
    } while (x !== 3);
    if (this.r(0x499) & 0x40) return;
    for (x = 3; x >= 0; x--) {
      this.w(0x3d3, x);
      this.vibratoTick(x);
      this.flush(x);
      this.envelopeTick(x);
    }
    const sum = this.r(0x3d4) + this.r(0x3d6);
    this.w(0x3d6, sum);
    if (sum <= 0xff) return;
    for (x = 3; x >= 0; x--) {
      if (this.r(0x3cb + x) === 0) continue;
      this.w(0x3d3, x);
      this.window = this.r(0x4a1);
      x = this.musicCountdown(x);
    }
  }

  musicCountdown(x) {
    if (this.r(0x3b7 + x) === 1) {
      this.w(0x437 + x, this.r(0x437 + x) - 1);
      if (this.r(0x437 + x) === 0) this.w(0x3c3 + x, this.r(0x3c3 + x) | 0x80);
      this.w(0x3e7 + x, this.r(0x3e7 + x) - 1);
      if (this.r(0x3e7 + x) !== 0) return x;
    } else {
      this.w(0x3e7 + x, this.r(0x3e7 + x) - 1);
      if (this.r(0x3e7 + x) !== 0) return x;
      this.w(0x3e7 + x, this.r(0x42f + x));
      this.w(0x3b7 + x, this.r(0x3b7 + x) - 1);
      return x;
    }
    let mask = 0xfe;
    let carry = 1;
    for (let i = 0; i < this.r(0x3d3); i++) {
      const out = mask >> 7;
      mask = ((mask << 1) | carry) & 0xff;
      carry = out;
    }
    this.w(0x3a3, this.r(0x3a3) & mask);
    this.w(0x3b7 + x, this.r(0x48f));
    this.w(0x3cb + x, this.r(0x3cb + x) & 0xfb);
    return this.trackRun(x);
  }

  // ---- 音轨解释 ----
  trackRun(x) {
    this.w(2, this.r(0x3d7 + x));
    this.w(3, this.r(0x3df + x));
    if (this.r(3) >= this.r(0x3ab + x) && this.r(2) >= this.r(0x491 + x)) {
      this.w(2, this.r(0x417 + x));
      this.w(3, this.r(0x41f + x));
      this.w(0x491 + x, 0xff);
      this.w(0x3ab + x, 0xff);
    }
    const s = { y: 0, c: 0, x };
    do { this.trackStep(s.x, s); } while (s.c === 0);
    this.advance(s);
    this.w(0x3d7 + s.x, this.r(2));
    this.w(0x3df + s.x, this.r(3));
    return s.x;
  }

  advance(s) {
    const sum = s.y + this.r(2);
    this.w(2, sum);
    if (sum > 0xff) this.w(3, this.r(3) + 1);
    s.y = 0;
  }

  trackStep(x, s) {
    if ((this.r(0x3cb + x) & 2) === 0) { this.trackByte(x, s); return; }
    const saved = s.y;
    this.trackByte(x, s);
    // 命令 $CD 在噪声声道上会改写 X，之后的重复计数用改写后的 X
    this.w(0x427 + s.x, this.r(0x427 + s.x) - 1);
    if (this.r(0x427 + s.x) === 0) this.w(0x3cb + s.x, this.r(0x3cb + s.x) & 0xfd);
    else s.y = saved;
  }

  trackByte(x, s) {
    const a = this.ptr(s.y);
    if (a < 0x40) {
      if (x >= 4) { this.w(0x3e7 + x, a); s.y++; s.c = 1; return; }
      this.w(0x42f + x, a);
      this.durationScale(x, a, s);
      return;
    }
    if (a < 0xc0) { if (x >= 4) this.noteFx(x, a, s); else this.noteMusic(x, a, s); return; }
    this.command(x, a, s);
  }

  /** SOUND_STORE_SCALED_DURATION：时长乘 $043F 的高字节放 $0433，0 取 1 */
  durationScale(x, a, s) {
    this.w(0, a);
    this.w(1, this.r(0x43f + x));
    this.mulHigh();
    let value = this.r(0);
    if (value === 0) value = 1;
    this.w(0x433 + x, value);
    s.y++;
    s.c = 0;
  }

  noteFx(x, a, s) {
    this.w(0x3ef + x, a);
    this.w(0x3c3 + x, this.r(0x3c3 + x) | 0x20);
    s.y++;
    s.c = 0;
  }

  noteMusic(x, note, s) {
    let a = (note + this.r(0x447 + x)) & 0x3f;
    this.w(0x3ef + x, a);
    if (x < 3) { a = (a + this.r(0x393)) & 0xff; this.w(0x3ef + x, a); }
    this.w(0x437 + x, (this.r(0x3cb + x) & 8) !== 0 ? 0xff : this.r(0x433 + x));
    this.w(0x3e7 + x, this.r(0x42f + x));
    let next = 'C58C';
    if (note >= 0x80) {
      s.y++;
      const ext = this.ptr(s.y);
      this.w(0, ext);
      if (ext & 0x40) {
        let v = this.r(0x42f + x);
        if (v >= this.r(0x43b + x)) v = this.r(0x43b + x);
        this.w(0x437 + x, v);
      }
      if (ext & 0x80) {
        this.w(0x437 + x, 0xff);
        if (this.r(0x394 + x) === 0) this.w(0x457 + x, 0);
      }
      if (ext & 0x20) this.w(0x3cb + x, this.r(0x3cb + x) | 4);
      else next = 'C59A';
    }
    if (next === 'C58C') {
      if (x >= 3) next = 'C59A';
      else if (this.r(0x394 + x) !== 0) next = 'C5A8';
      else { this.w(0x457 + x, 0); next = 'C59A'; }
    }
    if (next === 'C59A') {
      if (x >= 3 || (this.r(0x3cb + x) & 0x80) !== 0) next = 'C5AD';
      else { this.vibratoReset(x); next = 'C5A8'; }
    }
    if (next === 'C5A8') this.w(0x394 + x, 0);
    this.w(0x3c3 + x, this.r(0x3c3 + x) | 0x30);
    s.y++;
    s.c = 1;
  }

  command(x, command, s) {
    const index = command - 0xc0;
    this.w(0, romByte(0xc5ce + 2 * index));
    this.w(1, romByte(0xc5cf + 2 * index));
    s.y++;
    s.c = 0;
    const param = () => this.ptr(s.y);
    const set3c3 = (bits) => this.w(0x3c3 + x, this.r(0x3c3 + x) | bits);
    const set3cb = (bits) => this.w(0x3cb + x, this.r(0x3cb + x) | bits);
    const clr3cb = (bits) => this.w(0x3cb + x, this.r(0x3cb + x) & ~bits);
    switch (command) {
      case 0xc0: this.noteFx(x, param(), s); return;
      case 0xc1: this.noteFx(x, (param() + this.r(0x3ef + x)) & 0xff, s); return;
      case 0xc2: this.w(0x3f7 + x, param()); set3c3(0x20); s.y++; s.c = 0; return;
      case 0xc3: {
        const p = param();
        const sum = p + this.r(0x3f7 + x);
        if (p < 0x80) { if (sum > 0xff) this.w(0x3ef + x, this.r(0x3ef + x) + 1); } else if (sum <= 0xff) this.w(0x3ef + x, this.r(0x3ef + x) - 1);
        this.w(0x3f7 + x, sum);
        set3c3(0x20); s.y++; s.c = 0; return;
      }
      case 0xc4: this.w(0x3ff + x, param()); set3c3(0x08); s.y++; s.c = 0; return;
      case 0xc5: this.w(0x3ff + x, param() + this.r(0x3ff + x)); set3c3(0x08); s.y++; s.c = 0; return;
      case 0xc6: this.w(0x443 + x, param()); s.y++; return;
      case 0xc7: this.w(0x43f + x, param()); this.durationScale(x, this.r(0x42f + x), s); return;
      case 0xc8: this.w(0x43b + x, param()); s.y++; return;
      case 0xc9:
        this.w(0x3e7 + x, this.r(0x42f + x));
        this.w(0x3a3, this.r(0x3a3) | (1 << x));
        s.c = 1;
        this.w(0x3c3 + x, this.r(0x3c3 + x) | 0x80);
        return;
      case 0xca: set3c3(0x10); return;
      case 0xcb: set3c3(0x80); return;
      case 0xcc: this.w(0x3d4, param()); this.w(0x3d5, param()); s.y++; return;
      case 0xcd: this.commandCd(x, s); return;
      case 0xce: this.counterLoop(x, s, 0x407); return;
      case 0xcf: this.counterLoop(x, s, 0x40f); return;
      case 0xd0: this.stopSong(x, s); return;
      case 0xd1: this.setLoop(x, s); return;
      case 0xd2: this.w(2, this.r(0x417 + x)); this.w(3, this.r(0x41f + x)); s.y = 0; return;
      case 0xd3: this.stopChannel(x, s); return;
      case 0xd4: this.w(0x469 + 4 * x + 1, param()); set3c3(0x04); s.y++; return;
      case 0xd5: this.apu.push(0x00); this.w(0x499, this.r(0x499) | 0x40); return;
      case 0xd6: set3cb(0x08); set3c3(0x80); return;
      case 0xd7: clr3cb(0x08); set3c3(0x80); return;
      case 0xd8: this.w(0x447 + x, param()); s.y++; return;
      case 0xda: this.w(0x427 + x, param()); set3cb(0x02); s.y++; s.c = 0; return;
      case 0xdb:
        if (x < 3) {
          this.w(0x49b + x, this.ptr(s.y));
          this.w(0x460 + x, this.ptr(s.y + 1));
          this.w(0x45d + x, this.ptr(s.y + 2));
          this.w(0x466 + x, this.ptr(s.y + 3));
          set3cb(0x10); s.y += 1 + 3; s.c = 0; return;
        }
        s.y += 5; set3cb(0x10); s.c = 0; return;
      case 0xdc: set3cb(0x10); s.c = 0; return;
      case 0xdd: clr3cb(0x10); s.c = 0; return;
      case 0xde: this.w(0x48f, param()); this.w(0x3b7 + x, param()); s.y++; s.c = 0; return;
      case 0xdf: this.absoluteJump(x, s); return;
      case 0xe0: if (x >= 4) { this.w(0x469 + 4 * x + 1, param()); set3c3(0x40); s.c = 0; s.y++; } return;
      case 0xe1: if (x >= 4) { this.w(0x469 + 4 * x + 2, param()); set3c3(0x40); s.y++; s.c = 0; } return;
      case 0xe2: if (x >= 4) { this.w(0x469 + 4 * x + 3, param()); s.y++; s.c = 0; } return;
      case 0xe3: if (x >= 4) { this.w(0x469 + 4 * x, param()); set3c3(0x40); s.y++; s.c = 0; } return;
      case 0xe4: this.w(0x3c3 + x, (this.r(0x3c3 + x) & 0x7f) | 0x02); return;
      default: throw new Error(`命令 $${command.toString(16)} 不在模型范围`);
    }
  }

  counterLoop(x, s, counter) {
    if (this.r(counter + x) === 0) this.w(counter + x, this.ptr(s.y));
    s.y++;
    this.w(counter + x, this.r(counter + x) - 1);
    if (this.r(counter + x) === 0) { s.y += 2; return; }
    this.jumpTo(x, s);
  }

  /** SOUND_JUMP_TRACK：取 16 位偏移，加上曲首（声道 0-3 用 $039B，其余 $039D） */
  jumpTo(x, s) {
    const lo = this.ptr(s.y);
    this.w(3, this.ptr(s.y + 1));
    this.w(2, lo);
    const base = x < 4 ? 0x39b : 0x39d;
    const sum = this.r(2) + this.r(base);
    this.w(2, sum);
    this.w(3, this.r(3) + this.r(base + 1) + (sum > 0xff ? 1 : 0));
    s.c = 0;
    s.y = 0;
  }

  absoluteJump(x, s) {
    const lo = this.ptr(s.y);
    const hi = this.ptr(s.y + 1);
    s.y += 2;
    this.advance(s);
    this.w(0x417 + x, this.r(2));
    this.w(0x41f + x, this.r(3));
    this.w(3, hi);
    this.w(2, lo);
    const sum = lo + this.r(0x39b);
    this.w(2, sum);
    this.w(3, hi + this.r(0x39c) + (sum > 0xff ? 1 : 0));
    s.c = 0;
  }

  setLoop(x, s) {
    const p1 = this.ptr(s.y);
    const p2 = this.ptr(s.y + 1);
    const p3 = this.ptr(s.y + 2);
    const p4 = this.ptr(s.y + 3);
    const sum = p3 + this.r(0x39b);
    this.w(0x491 + x, sum);
    this.w(0x3ab + x, p4 + this.r(0x39c) + (sum > 0xff ? 1 : 0));
    s.y += 4;
    this.advance(s);
    this.w(0x417 + x, this.r(2));
    this.w(0x41f + x, this.r(3));
    this.w(3, p2);
    this.w(2, p1);
    const lo = p1 + this.r(0x39b);
    this.w(2, lo);
    this.w(3, p2 + this.r(0x39c) + (lo > 0xff ? 1 : 0));
    this.w(0x3e7 + x, this.r(0x42f + x));
    s.y = 0;
    s.c = 0;
  }

  stopSong(x, s) {
    if (this.r(0x3a0) === 0) {
      let a = 0x0f;
      let xx = this.r(0x3d3);
      do { a >>= 1; xx++; } while (xx < 4);
      this.apu.push(a);
      s.x = xx;
      this.w(0x39f, 0);
      this.w(0x3a1, 0xff);
      this.w(0x630, this.r(0x630) & 0xbf);
      this.w(0x499, this.r(0x499) & 0x7f);
      s.c = 1;
      return;
    }
    this.w(0x3b3, this.r(0x39b));
    this.w(2, this.r(0x39b));
    this.w(0x3b4, this.r(0x39c));
    this.w(3, this.r(0x39c));
    const keep = this.window;
    this.window = this.r(0x4a1);
    this.w(0x499, this.r(0x499) & 0x7f);
    this.initTracks();
    this.window = keep;
    throw new TickAbort();
  }

  stopChannel(x, s) {
    this.w(0x3c3 + x, 0x80);
    this.w(0x3cb + x, 0);
    s.c = 1;
    if (x < 4) {
      if ((this.r(0x3cb) | this.r(0x3cc) | this.r(0x3cd) | this.r(0x3ce)) === 0) this.w(0x499, this.r(0x499) & 0xfd);
      return;
    }
    if ((this.r(0x499) & 0x40) === 0) {
      const music = x & 3;
      if (this.r(0x3cb + music) !== 0) {
        let y = music * 4;
        for (let i = 0; i < 4; i++) { this.writeReg(music, y, this.r(0x469 + y)); if (i < 3) y++; }
        s.y = y;
        this.w(0x3c3 + this.r(0x3d3), 0);
      }
    }
    this.w(0x3bb + this.r(0x3d3), 0);
  }

  commandCd(x, s) {
    if (x === 3) {
      // DEX 之后 X 被改成（参数 & $3F）× 2：本命令之后的字节按这个“声道”解释，音轨位置也存到这个“声道”的位置单元
      const index = (this.ptr(s.y) & 0x3f) * 2;
      this.w(0x489, romByte(0xcfef + index));
      this.w(0x48a, romByte(0xcff0 + index));
      this.w(0x475, this.r(0x475) | 0x30);
      s.y += 2;
      s.c = 0;
      s.x = index;
      return;
    }
    if ((x & 3) === 2) { s.y += 2; s.c = 0; return; }
    const p1 = this.ptr(s.y);
    this.w(0x3a7, p1);
    if (x < 4) this.w(0x3b5 + x, p1);
    s.y++;
    const p2 = this.ptr(s.y);
    this.w(0x3a5, p2);
    s.y++;
    let table;
    if (p1 & 0x80) {
      // 位 7：换入第二页 $04A2，指针表地址在零页 $04/$05，表项 2 字节
      this.window = this.r(0x4a2);
      const base = this.r(4) | (this.r(5) << 8);
      const index = (p1 & 0x3f) * 2;
      table = this.read(base + index) | (this.read(base + index + 1) << 8);
    } else if (p1 & 0x40) {
      const index = (p1 & 0x3f) * 2;
      table = romByte(0xcfef + index) | (romByte(0xcff0 + index) << 8);
    } else {
      const index = p1 * 2;
      table = romByte(0xd0d3 + index) | (romByte(0xd0d4 + index) << 8);
    }
    table = (table + ((p2 << 2) & 0xff)) & 0xffff;
    this.w(0, table & 0xff);
    this.w(1, table >> 8);
    const channel = this.r(0x3d3);
    if (channel < 4) {
      this.w(0x44e + channel, this.read(table));
      this.w(0x451 + channel, this.read(table + 1));
    }
    const reg0 = this.read(table + 2) | 0x30;
    const reg1 = this.read(table + 3);
    const y = channel * 4;
    this.w(0x46a + y, reg1);
    this.w(0x469 + y, reg0);
    this.w(0x3c3 + channel, this.r(0x3c3 + channel) | 0x40);
    if (p1 & 0x80) this.window = this.r(0x4a1);
    s.c = 0;
  }

  // ---- 寄存器输出 ----
  writeReg(x, y, a) {
    this.w(0x469 + y, a);
    if (x < 4) {
      if (this.r(0x3cf + x) !== 0) return;
      this.w(0x48c, y);
    } else {
      this.w(0x48c, y & 0x0f);
    }
    this.writes.push([0x4000 + this.r(0x48c), a]);
  }

  writeReg23(x) {
    let y = (4 * x + 2) & 0xff;
    this.writeReg(x, y, this.r(0x469 + y));
    y++;
    this.writeReg(x, y, this.r(0x469 + y));
  }

  setPhase(x, value) {
    this.w(0, x);
    this.w(0x454 + (x === 3 ? 2 : x), value);
  }

  flush(x) {
    const flags = () => this.r(0x3c3 + x);
    if (flags() & 0x80) this.keyOff(x);
    if (flags() & 0x40) this.applyReg01(x);
    if (flags() & 0x20) this.applyPitch(x);
    if (flags() & 0x08) this.applyLevel(x);
    if (flags() & 0x04) this.applyReg1(x);
    if (flags() & 0x10) this.noteOn(x);
    if (flags() & 0x02) this.applyFxReg23();
    if (flags() & 0x01) this.pitchBend(x);
    this.w(0x3c3 + x, 0);
  }

  keyOff(x) {
    this.w(0x3cb + x, this.r(0x3cb + x) & 0x7f);
    if ((x & 3) === 2) { this.writeReg(x, 4 * x, 0x80); return; }
    if (x >= 4) { this.writeReg(x, 4 * x, this.r(0x469 + 4 * x) & 0xf0); return; }
    this.setPhase(x, 2);
  }

  applyReg01(x) {
    let y = 4 * x;
    this.writeReg(x, y, this.r(0x469 + y));
    y++;
    this.writeReg(x, y, this.r(0x469 + y));
  }

  /** 求出周期放 SOUND_TRACK_PTR_LO/03，写寄存器 2；返回寄存器 1 影子的位 7 */
  periodWrite(x, index, zp00, withZeroCheck) {
    this.w(0, zp00);
    this.w(2, LO(index));
    this.w(3, HI(index));
    if (!withZeroCheck || zp00 !== 0) {
      this.w(1, (LO(index) - LO_NEXT(index)) & 0xff);
      this.mulHigh();
      const lo = this.r(2) - this.r(0);
      this.w(2, lo);
      this.w(3, this.r(3) - (lo < 0 ? 1 : 0));
    }
  }

  bendBase(x) {
    const bend = this.r(0x45a + x);
    const sum = bend + this.r(0x3f7 + x);
    const carry = sum > 0xff ? 1 : 0;
    if (bend < 0x80) return [sum & 0xff, this.r(0x3ef + x) + carry];
    return [sum & 0xff, this.r(0x3ef + x) - (1 - carry)];
  }

  applyPitch(x) {
    if ((x & 3) === 3) {
      let a;
      if (x === 3) {
        this.w(0, this.r(0x489));
        this.w(1, this.r(0x48a));
        const base = (this.r(1) << 8) | this.r(0);
        let y = (this.r(0x3ef + x) << 2) & 0xff;
        this.w(0x450, this.read(base + y));
        y = (y + 1) & 0xff;
        this.w(0x453, this.read(base + y));
        y = (y + 1) & 0xff;
        a = this.read(base + y);
      } else {
        a = this.r(0x3ef + x);
      }
      this.writeReg(x, (4 * x + 2) & 0xff, a);
      return;
    }
    let zp00;
    let note;
    if (x < 4) [zp00, note] = this.bendBase(x);
    else { zp00 = this.r(0x3f7 + x); note = this.r(0x3ef + x); }
    this.periodWrite(x, note & 0x3f, zp00, true);
    let y = (4 * x + 2) & 0xff;
    this.writeReg(x, y, this.r(2));
    y++;
    if (this.r(0x467 + y) & 0x80) this.writeReg(x, y, this.r(3));
    else this.w(0x469 + y, this.r(3));
  }

  applyLevel(x) {
    if ((x & 3) === 2 || x < 4) return;
    if ((this.r(0x3cb + x) & 0x80) === 0) return;
    this.levelTail(x);
  }

  levelTail(x) {
    const a = ((this.r(0x3ff + x) >> 3) & 0x0f) | 0x30;
    const y = 4 * x;
    this.w(0x469 + y, this.r(0x469 + y) & 0xf0);
    this.writeReg(x, y, a | this.r(0x469 + y));
  }

  applyReg1(x) {
    const y = 4 * x + 1;
    this.writeReg(x, y, this.r(0x469 + y));
  }

  noteOn(x) {
    const flags = this.r(0x3cb + x);
    if (flags & 0x80) return;
    this.w(0x3cb + x, flags | 0x80);
    if ((x & 3) === 2) { this.writeReg23(x); this.writeReg(x, 4 * x, 0x81); return; }
    if (x >= 4) { this.writeReg23(x); this.levelTail(x); return; }
    this.writeReg23(x);
    this.setPhase(x, 1);
  }

  applyFxReg23() {
    const x = this.r(0x3d3);
    if (x < 4) return;
    this.writeReg23(x);
    const y = 4 * x;
    this.writeReg(x, y, x === 6 ? 0x81 : this.r(0x469 + y));
  }

  pitchBend(x) {
    if (x >= 3) return;
    const [zp00, note] = this.bendBase(x);
    this.periodWrite(x, note & 0x3f, zp00, false);
    let y = 4 * x + 2;
    this.writeReg(x, y, this.r(2));
    y++;
    if (this.r(3) !== this.r(0x469 + y)) this.writeReg(x, y, this.r(3));
  }

  // ---- 颤音 ----
  vibratoTick(x) {
    if (x === 3) return;
    if ((this.r(0x3cb + x) & 0x10) === 0) return;
    this.w(0x49e + x, this.r(0x49e + x) - 1);
    if ((this.r(0x49e + x) & 0x80) === 0) return;
    this.w(0x49e + x, 0);
    this.w(0x463 + x, this.r(0x463 + x) - 1);
    if (this.r(0x463 + x) & 0x80) {
      // 计数用完：重装并推进偏移
      this.w(0x463 + x, this.r(0x460 + x));
      const half = this.r(0x466 + x) >> 1;
      this.w(1, half);
      const zp00 = (half + this.r(0x45a + x)) & 0xff;
      this.w(0, zp00);
      let a = this.r(0x45d + x);
      if (a & 0x80) {
        const sum = a + zp00;
        if (sum > 0xff) a = sum & 0xff;
        else { a = (0 - this.r(0x45d + x)) & 0xff; this.w(0x45d + x, a); }
      } else {
        const sum = (a + zp00) & 0xff;
        if (sum < this.r(0x466 + x)) a = sum;
        else { this.w(0x45d + x, (0 - this.r(0x45d + x)) & 0xff); a = this.r(0x466 + x); }
      }
      this.w(0x45a + x, a - half);
    }
    this.w(0x3c3 + x, this.r(0x3c3 + x) | 1);
  }

  vibratoReset(x) {
    this.w(0x49e + x, this.r(0x49b + x));
    const value = this.r(0x460 + x);
    this.w(0x463 + x, value);
    let a = 0;
    if (value === 0xff) a = 0xf8;
    else if (value === 0xfe) a = 0xf0;
    else if (value === 0xfd) a = 0x10;
    this.w(0x45a + x, a);
    const sign = this.r(0x45d + x);
    if (sign & 0x80) {
      this.w(0x45d + x, (0 - sign) & 0xff);
      this.w(0x3c3 + x, this.r(0x3c3 + x) | 0x20);
    }
  }

  // ---- 包络 ----
  envelopeTick(x) {
    let index = x;
    if (x >= 2) { if (x !== 3) return; index = 2; }
    if (this.r(0x454 + index) === 0) return;
    if (x === 3) { this.envelopeRun(2, this.r(0x454 + 2), 1); return; }
    const flags = this.r(0x3b5 + x);
    // 位 7：先换入第二页 $04A2，处理完再换回音乐页 $04A1
    if (flags & 0x80) this.window = this.r(0x4a2);
    if ((flags & 0x40) === 0) this.volumeEnvelope(x);
    else this.envelopeRun(x, this.r(0x454 + x), 0);
    if (flags & 0x80) this.window = this.r(0x4a1);
  }

  envelopeRun(x, phase, carryIn) {
    let y = phase;
    this.w(2, this.r(0x44e + x));
    this.w(3, this.r(0x451 + x));
    const table = (index) => this.ptr(index);
    const level = () => this.r(0x44b + x);
    let next = 'tail';
    if (y & 0x80) {
      y &= 0x7f;
      const delta = table(y);
      if (delta & 0x80) {
        const sum = delta + level() + carryIn;
        if (sum > 0xff) { this.w(0x44b + x, sum); } else { this.w(0x44b + x, 0); this.w(0x454 + x, 0); }
      } else {
        const sum = delta + level();
        if (sum > 0xff) { this.w(0x44b + x, 0xff); this.w(0x454 + x, 0); } else { this.w(0x44b + x, sum); next = 'load'; }
      }
    } else if (y === 2) {
      y = 1;
      const floor = table(y);
      if (floor < level()) this.w(0x44b + x, floor);
      y = 2;
      this.w(0x454 + x, y | 0x80);
    } else if (y === 1) {
      this.w(0x44b + x, table(0));
      y = 3;
      next = 'load';
    } else {
      this.w(0x44b + x, table(y) + level());
      this.w(0x457 + x, this.r(0x457 + x) - 1);
      if (this.r(0x457 + x) === 0) { y += 2; next = 'load'; }
    }
    if (next === 'load') {
      this.w(0x454 + x, y);
      y++;
      const count = table(y);
      this.w(0x457 + x, count);
      if (count === 0) {
        y--;
        if (table(y) !== 0) this.w(0x454 + x, this.r(0x454 + x) | 0x80);
        else this.w(0x454 + x, 0);
      }
    }
    this.envelopeOutput(x);
  }

  envelopeOutput(x) {
    this.w(2, x);
    const channel = this.r(0x3d3);
    const base = (this.r(0x3cb + channel) & 4) !== 0 ? this.r(0x443 + channel) : 0;
    this.w(1, base + 1 + this.r(0x3ff + channel));
    this.w(0, this.r(0x44b + x));
    this.mulHigh();
    this.w(0, this.r(0) >> 3);
    const y = 4 * channel;
    this.writeReg(channel, y, (this.r(0x469 + y) & 0xf0) | this.r(0));
  }

  volumeEnvelope(x) {
    const silenced = x < 2 && (((x + 1) & this.r(0x3a3)) !== 0);
    this.w(0x44b + x, silenced ? 0 : this.r(0x3ff + x) & 0x0f);
    this.w(2, this.r(0x44e + x));
    this.w(3, this.r(0x451 + x));
    this.w(0x490, 0);
    const original = this.r(0x457 + x);
    const m = this.r(0x3ff + x);
    let a = original;
    for (let i = 0; i < 4; i++) {
      const out = a >> 7;
      a = (a << 1) & 0xff;
      let bit;
      if (out) { a = (a - m) & 0xff; bit = 1; } else if (a >= m) { a -= m; bit = 1; } else bit = 0;
      this.w(0x490, (this.r(0x490) << 1) | bit);
    }
    this.w(0x457 + x, original + 1);
    if (this.r(0x457 + x) >= m) this.w(0x457 + x, m);
    const index = this.ptr(this.r(0x490)) | this.r(0x44b + x);
    const scale = VOLUME_SCALE(index);
    this.w(0, scale);
    const channel = this.r(0x3d3);
    const y = 4 * channel;
    this.writeReg(channel, y, (this.r(0x469 + y) & 0xf0) | scale);
  }
}
