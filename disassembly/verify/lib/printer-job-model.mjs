// ------------------------------------------------------------------------
// 名称：printer-job-model.mjs
// 说明：打印机服务子功能 $00、$0D（整段文字打印）的模型：取字、字模转列数据、逐列发送、两遍打印、行末换行、进纸与页长计数。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：按 bios/src/printer/printer-service.asm（$835A-$8480、$8ABE-$8CC7、$8E95-$8EE1）转录，在 printer-model.mjs 的子功能模型之上组合。
//       只覆盖西文可打印字符（$20-$7F，$7F 当空格）、回车换行（$0D $0A）与以 $00 或 $FF 为结束符、以长度计数两种结束方式；
//       控制码 $80-$9F、汉字（$A1 起）、$8D、$1A 以外的 $00-$1F 会抛异常。字模取自 ROM $51100 起的 8×16 西文字库（功能 $3B 的结果）。
// ------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { BIOS_ROM } from '../../tools/config.mjs';
import { LineEnd, PrinterModel } from './printer-model.mjs';

const rom = readFileSync(BIOS_ROM).subarray(16);
const WIDTH_TABLE = [0x08, 0x10, 0x18, 0x20, 0x28, 0x30];
const HANZI_WIDTH_TABLE = [0x10, 0x20, 0x30, 0x40, 0x50, 0x60];

/** 页组 $0E 的代码与表在 ROM 第 14 页（偏移 $E000），汇编地址 $8000 起 */
const imeRomPrinter = (address) => rom[0xe000 + (address - 0x8000)];

export class PrintJobModel extends PrinterModel {
  /**
   * @param {Uint8Array | number[]} memory RAM 初值
   * @param {{ page: number, offset: number, text: number[] }} source 文字所在的扩展 RAM 页、页内偏移与内容（内容之后读到的字节为 0）
   */
  constructor(memory, source) {
    super(memory);
    this.source = source;
    this.pos = 0;
  }

  farLow() { return (this.source.offset + this.pos) & 0xff; }

  farHigh() { return ((this.source.offset + this.pos) >> 8) & 0xff; }

  /** 功能 $24：读一个字节到 $0653，指针后移 */
  readByte() {
    const value = this.pos < this.source.text.length ? this.source.text[this.pos] : 0;
    this.pos++;
    this.w(0x653, value);
    return value;
  }

  sendRaw(value) {
    this.w(0x4a4, value);
    this.w(0x4a5, 0);
    this.out.push(value);
  }

  /** PRN_SUB_01 */
  escInit() { this.sendRaw(0x1b); this.sendRaw(0x40); }

  /** PRN_SUB_02 */
  escHome() { this.sendRaw(0x1b); this.sendRaw(0x3c); }

  /** PRN_SUB_04：ESC J n，n 取自 $0649 */
  escFeed() { this.sendRaw(0x1b); this.sendRaw(0x4a); this.sendRaw(this.r(0x649)); }

  /** PRN_SUB_08 */
  escBitmapHeader() { [0x1b, 0x2a, 0x27, 0x78, 0x04].forEach((value) => this.sendRaw(value)); }

  /** PRN_COUNT_FEED：扣除页长计数，剩余不足时发送收尾进纸并按 $0652 重新装入页长 */
  countFeed(amount) {
    let x = amount;
    if (x === 0) return;
    const saved = this.r(0x649);
    for (;;) {
      if (this.r(0x4bd) !== 0) this.w(0x4bd, this.r(0x4bd) - 1);
      else if (this.r(0x4bc) !== 0) { this.w(0x4bc, this.r(0x4bc) - 1); this.w(0x4bd, 0xff); } else break;
      x = (x - 1) & 0xff;
      if (x === 0) break;
    }
    if (this.r(0x4bc) === 0 && this.r(0x4bd) < 0x58) {
      this.w(0x649, this.r(0x4bd));
      this.escFeed();
      this.w(0x649, 0x58);
      this.escFeed();
      this.sub0f();
    }
    this.w(0x649, saved);
  }

  feedByte(value) { this.sendRaw(0x1b); this.sendRaw(0x4a); this.sendRaw(value); this.countFeed(value); }

  /** PRN_FEED_PAPER_A / B / C */
  feedA() { this.feedByte(0x17); this.feedByte(this.r(0x547)); }

  feedB() { this.feedByte(0x08); this.feedByte(this.r(0x547)); }

  feedC() { this.feedByte(0x18); }

  blank() { for (let i = 0; i < 0x20; i++) this.w(0x524 + i, 0); }

  /** $8B22：一行文字到回车换行为止，后面补空白列直到行满 */
  endOfText() {
    this.w(0x4c2, 1);
    this.w(0x545, this.r(0x544));
    this.w(0x544, 0);
    this.saveFar();
    this.blank();
  }

  saveFar() {
    this.w(0x4bf, this.farLow());
    this.w(0x4c0, this.farHigh());
    this.w(0x4c1, this.source.page);
  }

  /** PRN_FETCH_DATA_BYTE */
  fetch() {
    for (;;) {
      if (this.r(0x4ba) !== 0 || this.r(0x4c2) !== 0) { this.blank(); return; }
      this.saveFar();
      let value = this.readByte();
      const terminator = this.r(0x4b9);
      if (terminator === 0 || terminator === 0xff) {
        if (value === terminator) { this.w(0x4ba, 1); this.blank(); return; }
      } else if (this.r(0x64f) === 0) { this.w(0x4ba, 1); this.blank(); return; }
      this.w(0x64a, value);
      this.w(0x64f, this.r(0x64f) - 1);
      if (value === 0x0c || value === 0x0d) {
        value = this.readByte();
        if (value === 0x0a) { this.endOfText(); return; }
      }
      if (value === 0x8d) {
        value = this.readByte();
        if (value === 0x8a) { this.endOfText(); return; }
      }
      if (value >= 0x80 && value < 0xa0) { this.parseControl(value); continue; }
      if (value === 0x1a) continue;
      if (value >= 0xa0) { this.hanzi(); return; }
      if (value < 0x20) throw new Error('模型未覆盖：$00-$1F 控制字符（用户字库）');
      this.glyph(value);
      return;
    }
  }

  /** PRN_PARSE_CONTROL：$80-$9F 控制码，部分带一个参数字节 */
  parseControl(code) {
    this.w(0x652, code);
    if (code < 0x94) {
      if (code !== 0x92) return;
      const argument = this.readByte();
      if (argument < 0x80 || argument >= 0x98) return;
      const index = (argument - 0x80) * 2;
      this.w(0x646, imeRomPrinter(0x8a8b + index));
      this.w(0x647, imeRomPrinter(0x8a8c + index));
      return;
    }
    const argument = this.readByte();
    if (code >= 0x99) {
      if (code === 0x99) this.w(0x546, argument - 0x80);
      else if (code === 0x9b) this.w(0x547, argument - 0x80);
    } else if (code === 0x95 && argument >= 0x80 && argument < 0x88) {
      this.w(0x544, imeRomPrinter(0x8a83 + argument - 0x80));
    }
  }

  /** 汉字（第一个字节不小于 $A0）：行尾放不下时结束本行，否则读第二个字节并取 32 字节字模；返回是否真的画了字 */
  hanzi() {
    if (this.r(0x4a9) === 4) {
      const index = this.r(0x4a8) >= 5 ? 5 : this.r(0x646);
      const sum = this.r(0x4a8) + HANZI_WIDTH_TABLE[index];
      const high = this.r(0x4a9) + (sum > 0xff ? 1 : 0);
      const low = sum & 0xff;
      if (high > 4 || (high === 4 && low >= 0x78)) {
        this.w(0x4c2, 1);
        this.blank();
        return false;
      }
    }
    const second = this.readByte();
    this.w(0x64b, second);
    if (second === 0 || second === 0xff) { this.w(0x4ba, 1); this.blank(); return false; }
    this.w(0x64f, this.r(0x64f) - 1);
    const first = this.r(0x64a);
    const zone = first - 0xa0;
    const position = second - 0xa0;
    let base;
    if (first >= 0xa1 && first <= 0xa9) base = 0x51700 + ((zone - 1) * 94 + (position - 1)) * 32;
    else if (first >= 0xb0 && first <= 0xf7) base = 0x1c000 + ((zone - 16) * 94 + (position - 1)) * 32;
    else throw new Error('模型未覆盖：用户字库的汉字');
    if (position < 1 || position > 94) throw new Error('模型未覆盖：不合法的 GB2312 码');
    this.w(0x638, 0x80);
    for (let i = 0; i < 32; i++) this.w(0x524 + i, rom[base + i]);
    this.w(0x653, rom[base + 31]);
    this.saveFar();
    return true;
  }

  /** 西文字符：$7F 当空格；行尾放不下时结束本行；取 16 字节字模放到 $0524 起 */
  glyph(value) {
    this.w(0x64b, value === 0x7f ? 0x20 : value);
    this.w(0x64a, 0);
    if (this.r(0x4a9) === 4) {
      const lowByte = this.r(0x4a8);
      const index = lowByte >= 5 ? 5 : this.r(0x646);
      const sum = this.r(0x4a8) + WIDTH_TABLE[index];
      const high = this.r(0x4a9) + (sum > 0xff ? 1 : 0);
      const low = sum & 0xff;
      if (high > 4 || (high === 4 && low >= 0x78)) {
        this.w(0x4c2, 1);
        this.blank();
        return;
      }
    }
    const code = this.r(0x64b);
    this.w(0x638, 0x80);
    const base = 0x51100 + (code - 0x20) * 16;
    for (let i = 0; i < 16; i++) this.w(0x524 + i, rom[base + i]);
    this.w(0x653, rom[base + 15]);
    this.saveFar();
  }

  /** PRN_START_JOB：打印一行（两遍或位图一遍），从当前数据位置起 */
  startJob() {
    this.w(0x4b1, 0);
    this.w(0x4b0, 0);
    this.w(0x4b5, 0x80);
    this.w(0x4b6, this.source.page);
    this.w(0x4b7, this.farLow());
    this.w(0x4b8, this.farHigh());
    this.w(0x4b9, this.r(0x64f));
    this.w(0x4be, this.r(0x64f));
    this.w(0x545, this.r(0x544));
    const startPos = this.pos;
    for (;;) {
      this.w(0x544, this.r(0x545));
      this.w(0x4ba, 0);
      this.w(0x4bb, 0);
      this.w(0x4c2, 0);
      this.w(0x4b2, 0x10);
      this.escInit();
      this.escBitmapHeader();
      this.w(0x4a8, 0);
      this.w(0x4a9, 0);
      this.pos = startPos;
      this.w(0x64f, this.r(0x4b9));
      let target;
      try {
        for (;;) {
          this.fetch();
          this.sub09();
          this.sub0a();
          this.sub0b();
          this.sendEmptyColumns(false);
        }
      } catch (error) {
        if (!(error instanceof LineEnd)) throw error;
        target = error.target;
      }
      if (target === 0x8400) {
        if (this.r(0x4b0) === 0) this.feedC();
        this.w(0x4b1, 0);
        this.w(0x4b0, this.r(0x4b0) ^ 1);
        if (this.r(0x4b0) !== 0) continue;
      }
      if (this.r(0x647) !== 0) { this.feedA(); this.escHome(); } else { this.feedB(); this.escHome(); }
      return;
    }
  }

  /** PRN_SUB_00（子功能 $00、$0D）：一行一行地打印，直到数据结束 */
  sub00() {
    for (;;) {
      this.w(0x4c2, 0);
      this.startJob();
      if (this.r(0x640) === 0xff) return;
      if (this.r(0x4ba) !== 0) return;
      this.w(0x64f, this.r(0x4be));
      this.pos = ((this.r(0x4c0) << 8) | this.r(0x4bf)) - this.source.offset;
    }
  }

  call(sub) {
    if (sub === 0 || sub === 0x0d) {
      if (this.r(0x38f) === 0) this.w(0x38f, 1);
      this.w(0x548, 0);
      this.w(0x640, 0);
      this.w(0x544, this.r(0x64e));
      this.w(0x546, this.r(0x648));
      this.w(0x547, this.r(0x649));
      this.sub00();
      return;
    }
    super.call(sub);
  }
}
