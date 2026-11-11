// ------------------------------------------------------------------------
// 名称：ime-model.mjs
// 说明：中文输入法服务（功能 $6D）状态类子功能与按键处理的字节级模型：$00 初始化、$01 选择输入法、$02-$09 设置与取回状态及状态行文字、$0B 处理按键（含全拼、双拼）。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：按 bios/src/input-method/（$805C-$8278、$9907-$9953、$9C36 前后的状态行例程）转录；ERAM $6900-$69FF 放在 eram 数组里，RAM 里只模拟用到的几个字节。
//       状态行显示（IME_DRAW_STATUS_LINE）会调用功能 $45 画到屏幕，模型只记它清 ERAM $6951 的副作用，屏幕内容不在这里核对。
//       全拼、双拼（输入法序号 1、2）的按键处理按 IME_KEY_PINYIN、IME_TABLE_LOOKUP、IME_LOAD_CANDIDATES 转录，词库直接读 ROM 第 10-1B 页（页组 $10 起每页 4KB 首尾相接，按线性偏移访问）。
// ------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { BIOS_ROM } from '../../tools/config.mjs';

const rom = readFileSync(BIOS_ROM).subarray(16);
/** 拼音词库：ROM 第 10-1B 页 */
const dict = rom.subarray(0x10000, 0x1c000);
/** 页组 $0C 的窗口地址 $8000-$9FFF 在 ROM 里是连续的第 12、13 页 */
export const imeRom = (address) => rom[0xc000 + (address - 0x8000)];
const OPTION_TABLE = [0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0xff, 0xff, 0x80, 0x01];

export class ImeModel {
  /** @param {number[]} eram ERAM $6900-$69FF 的 256 字节 @param {Record<number, number>} ram 用到的 RAM 字节（地址 → 值） */
  constructor(eram, ram) {
    this.e = Uint8Array.from(eram);
    this.ram = new Map(Object.entries(ram).map(([address, value]) => [Number(address), value]));
    this.drawCount = 0;
  }

  r(address) { return this.ram.get(address) ?? 0; }

  w(address, value) { this.ram.set(address, value & 0xff); }

  draw() { this.e[0x51] = 0; this.drawCount++; }

  clearStatusLine() {
    for (let y = 4; y < 0x20; y++) this.e[0x31 + y] = 0x20;
    this.draw();
  }

  showHint() {
    for (let y = 0; y < 5; y++) this.e[0x3b + y] = imeRom(0x9d99 + y);
    for (let y = 5; y < 0x16; y++) this.e[0x3b + y] = 0x20;
    this.draw();
  }

  showHintIfEmpty() {
    const e = this.e;
    if (e[0x13] === 0) { e[0x22] = 0xff; this.showHint(); return; }
    for (let y = 0x0a; y < 0x20; y++) e[0x31 + y] = 0x20;
    if (e[3] & 0x80) e[0x4f] = 0x3e;
    if (e[0x0c] !== 0 || e[0x0b] !== 0) e[0x4e] = 0x3c;
    let x = 0;
    let y = 0;
    do {
      e[0x3b + x++] = y + 0x31;
      e[0x3b + x++] = e[0x14 + 2 * y];
      e[0x3b + x++] = e[0x15 + 2 * y];
      y++;
    } while (y < e[0x13]);
    this.draw();
  }

  returnIfActive() {
    const e = this.e;
    if (e[2] & 4) return;
    const mode = e[0] & 0x0f;
    const copy = [];
    if (mode === 6) for (let y = 0; y < 4; y++) copy.push(e[0x7d + y]);
    else for (let y = 0; y < 4; y++) copy.push(imeRom(0x9cf9 + mode * 4 + y));
    copy.forEach((value, y) => { e[0x31 + y] = value; });
    this.clearStatusLine();
    if ((e[0] & 0x0f) === 9) {
      for (let x = 0; x < 0x18; x++) e[0x37 + x] = e[0x61 + x];
      this.draw();
    }
  }

  returnIfActive2() {
    const e = this.e;
    if (e[2] & 4) return;
    for (let y = 0; y < 5; y++) e[0x35 + y] = imeRom(0x9e28 + y);
    let a = e[4] + 0x30;
    if ((a & 0xff) === 0x30) a = 0x39;
    e[0x37] = a;
  }

  buildCandidateList() {
    const e = this.e;
    const hi = (e[4] + 0xa0) & 0xff;
    const page = e[0x0b];
    let carry = 0;
    let value = (page << 2) & 0xff;
    let sum = value + page;
    carry = sum > 0xff ? 1 : 0;
    sum = (sum & 0xff) + 0xa1 + carry;
    let low = sum & 0xff;
    let y = 0;
    for (;;) {
      e[0x14 + y] = hi;
      y++;
      e[0x14 + y] = low;
      y++;
      if (y >= 0x0a) break;
      low = (low + 1) & 0xff;
      if (e[4] !== 0) { if (low >= 0xff) break; } else if (low >= 0xf0) break;
    }
    e[0x13] = y >> 1;
    this.w(0x36e, hi);
    this.w(0x36f, low);
  }

  loadStatusLine() {
    for (let y = 0; y < 0x20; y++) this.e[0x31 + y] = imeRom(0x828a + y);
    this.draw();
  }

  sub00() {
    const e = this.e;
    this.w(0x640, 0);
    e[0x12] = this.r(0x69a);
    e[0x0e] = this.r(0x69b);
    e[0x0f] = this.r(0x69c);
    e[0x11] = this.r(0x69d);
    e[0x10] = this.r(0x69e);
    const mode = this.r(0x69f);
    if (mode >= 0x0a) { this.w(0x640, 1); return; }
    e[0] = mode;
    e[1] = this.r(0x6a0);
    e[2] = this.r(0x6a1);
    for (let x = 0; x < 0x18; x++) e[0x61 + x] = imeRom(0x80b7 + x);
    e[0x0d] = 0;
    this.w(0x652, e[0]);
    this.sub01();
  }

  fail() { this.w(0x640, 1); }

  sub01() {
    const e = this.e;
    const choice = this.r(0x652) & 0x0f;
    if (choice >= 0x0a) { this.fail(); return; }
    const need = { 3: 1, 4: 2, 5: 4, 6: 8 }[choice];
    if (need !== undefined && (this.r(0x392) & need) === 0) { this.fail(); return; }
    if (choice === 7) { this.fail(); return; }
    if (this.r(0x652) & 0x80) {
      const wanted = OPTION_TABLE[choice];
      const allowed = wanted === 0xff ? (e[2] & 0x10) : (wanted & e[1]);
      if (allowed === 0) { this.fail(); return; }
    }
    // 清按键队列（$6B/$05）与输入状态
    this.flushKeys();
    e[4] = 0; e[0x22] = 0; e[3] = 0; e[0x0b] = 0; e[0x0c] = 0; e[0x13] = 0; e[0x52] = 0;
    this.w(0x36e, this.r(0x652) & 0x0f);
    e[0] = (e[0] & 0xf0) | this.r(0x36e);
    this.returnIfActive();
    e[2] &= 0x7f;
    if (e[0] === 8) {
      e[4]++;
      this.buildCandidateList();
      this.returnIfActive2();
      if (!(e[2] & 4)) { /* 返回后继续往下 */ }
      e[3] |= 0x80;
      this.showHintIfEmpty();
    }
    this.w(0x640, 0);
  }

  sub02() {
    this.e[1] = this.r(0x652);
    this.e[2] = (this.e[2] & 0x80) | (this.r(0x653) & 0x7f);
  }

  sub03() {
    if (this.e[2] & 4) { this.e[2] &= 0xfb; this.draw(); }
  }

  sub04() {
    const e = this.e;
    e[0x13] = 0;
    if (e[2] & 4) return;
    const keep = e[0x10];
    e[0x10] = 0;
    this.draw();
    e[0x10] = keep;
    e[2] |= 4;
  }

  sub05() {
    [0xb0, 0xeb, 0xbd, 0xc7].forEach((value, y) => { this.e[0x31 + y] = value; });
    this.draw();
    this.e[2] &= 0xfd;
  }

  sub06() {
    [0xc8, 0xab, 0xbd, 0xc7].forEach((value, y) => { this.e[0x31 + y] = value; });
    this.draw();
    this.e[2] |= 0x02;
  }

  sub07() { this.w(0x652, this.e[0] & 0x0f); }

  sub08() {
    this.w(0x652, this.e[1]);
    this.w(0x653, this.e[2] & 0x7f);
  }

  sub09() {
    for (let y = 0; y < 5; y++) this.e[0x7c + y] = this.r(0x69a + y);
    this.w(0x392, this.r(0x392) | 8);
    this.e[2] |= 0x10;
    this.loadStatusLine();
  }

  // ---- 子功能 $0B：处理一个按键（bios/src/input-method/ $82B6-$8363、$85AF-$86D6、$86D7-$88DC、$988F-$9906、$9AA1-$9B9F） ----

  unmodelled(reason) { throw new Error(`模型未覆盖：${reason}`); }

  get mode() { return this.e[0] & 0x0f; }

  /** $6B/$03：从按键队列取一个键；队列空时两个字节都为 0 */
  getKey() {
    const read = this.r(0x342);
    if (read === this.r(0x343)) { this.w(0x34b, 0); this.w(0x34c, 0); return; }
    this.w(0x34b, this.r(0x336 + read));
    this.w(0x34c, this.r(0x336 + read + 1));
    this.w(0x342, read + 2 === 0x0c ? 0 : read + 2);
  }

  get ascii() { return this.r(0x34b); }

  get scan() { return this.r(0x34c); }

  flushKeys() { this.w(0x342, 0); this.w(0x343, 0); }

  passKey() { this.e[0x22] = 0x82; this.e[0x23] = this.ascii; this.e[0x24] = this.scan; }

  outputCandidate(index) {
    const e = this.e;
    e[0x22] = 2;
    e[0x23] = e[0x14 + 2 * index];
    e[0x24] = e[0x15 + 2 * index];
    if (this.mode !== 8) e[4] = 0;
  }

  copyCandidate() {
    const e = this.e;
    e[0x22] = (e[0x13] & 7) * 2;
    let y = 0;
    do { e[0x23 + y] = e[0x14 + y]; y++; } while (y < e[0x22]);
  }

  appendKey() { this.e[5 + this.e[4]] = this.ascii; this.e[4]++; }

  showInput() {
    const e = this.e;
    for (let y = 4; y < 0x20; y++) e[0x31 + y] = 0x20;
    let y = 0;
    do { e[0x35 + y] = e[5 + y]; y++; } while (y < e[4]);
    this.draw();
  }

  backspace() { this.e[0x13] = 0; this.e[4]--; this.clearStatusLine(); }

  keyPassOrFlush() {
    const e = this.e;
    if (this.mode === 8 || e[4] === 0) { this.passKey(); return; }
    e[4] = 0; e[3] = 0; e[0x13] = 0; e[0x52] = 0;
    this.clearStatusLine();
  }

  /** 查特殊键表，把半角键换成全角内码（$9AA1-$9B6F）；表项在 ROM 里 */
  specialKeyLookup(key) {
    const e = this.e;
    this.w(0x36e, key);
    const lookup3 = (start) => {
      for (let p = start; imeRom(p) !== 0xff; p += 3) {
        if (imeRom(p) === key) { e[0x22] = 2; e[0x23] = imeRom(p + 1); e[0x24] = imeRom(p + 2); return true; }
      }
      return false;
    };
    if (this.mode === 9) { lookup3(0x9983); return; }
    for (let p = 0x9954; imeRom(p) !== 0xff; p += 3) {
      if (imeRom(p) === key) { e[0x22] = 2; e[0x23] = imeRom(p + 1); e[0x24] = imeRom(p + 2); return; }
    }
    let mask = 1;
    for (let p = 0x9964; imeRom(p) !== 0xff; p += 5, mask = (mask << 1) & 0xff) {
      if (imeRom(p) === key) {
        const offset = (e[0x0d] & mask) ? 3 : 1;
        e[0x23] = imeRom(p + offset);
        e[0x24] = imeRom(p + offset + 1);
        e[0x22] = 2;
        e[0x0d] ^= mask;
        return;
      }
    }
    lookup3(0x9983);
  }

  /** 把 $064A/$064B 当 GB2312 内码检查（$87B9） */
  checkGb2312() {
    const a = this.r(0x64a);
    const b = this.r(0x64b);
    if (a < 0xa1) return false;
    if (a < 0xaa) {
      if (b < 0xa1 || b >= 0xff) return false;
      return !(a === 0xa9 && b >= 0xf1);
    }
    if (a < 0xb0 || a >= 0xf8) return false;
    if (b < 0xa1 || b >= 0xff) return false;
    return !(a === 0xd7 && b >= 0xfa);
  }

  /** 输入串转内码（$8808）：4 位十进制是区位码，首字符 a-f 的 4 位十六进制是内码，其他 $064A 清 0 */
  parseCode() {
    const e = this.e;
    this.parsed = true;
    const char = (y) => e[5 + y];
    const isDigit = (c) => c >= 0x30 && c < 0x3a;
    const isHex = (c) => c >= 0x61 && c < 0x67;
    const value = (c) => (isDigit(c) ? c - 0x30 : isHex(c) ? c - 0x61 + 10 : 0);
    const hexMode = isHex(char(0));
    for (let y = hexMode ? 1 : 0; y < 4; y++) {
      const c = char(y);
      if (!(isDigit(c) || (hexMode && isHex(c)))) { this.w(0x64a, 0); return; }
    }
    const v = [0, 1, 2, 3].map((y) => value(char(y)));
    v.forEach((item, y) => this.w(0x69a + y, item));
    if (hexMode) {
      this.w(0x64a, v[0] * 16 + v[1]);
      this.w(0x64b, v[2] * 16 + v[3]);
    } else {
      this.w(0x64a, v[0] * 10 + v[1] + 0xa0);
      this.w(0x64b, v[2] * 10 + v[3] + 0xa0);
    }
  }

  isDigitKey(c) { return c >= 0x30 && c < 0x3a; }

  isHexKey(c) { return c >= 0x61 && c < 0x67; }

  /** 模式 0（区位码/内码）按键处理，$86D7 */
  mode0() {
    const e = this.e;
    const key = this.ascii;
    if (e[4] === 0) {
      if (this.isDigitKey(key)) {
        this.returnIfActive();
        e[0x0a] = 0; e[0x13] = 0;
        this.appendKey(); this.showInput();
      } else if (this.isHexKey(key)) {
        e[0x13] = 0;
        const keep = e[0];
        e[0] = 0x0a;
        this.returnIfActive();
        e[0] = keep;
        e[0x0a] = 0xff;
        this.appendKey(); this.showInput();
      } else this.passKey();
      return;
    }
    if (key === 8) { this.backspace(); if (e[4] !== 0) this.showInput(); return; }
    if (key === 0x0d) { this.keyPassOrFlush(); return; }
    let accept;
    if (e[0x0a] !== 0) accept = (e[4] !== 2 && this.isDigitKey(key)) || this.isHexKey(key);
    else accept = this.isDigitKey(key);
    if (!accept) { this.passKey(); return; }
    this.appendKey(); this.showInput();
    if (e[4] !== 4) return;
    this.parseCode();
    e[4] = 0;
    if (this.checkGb2312()) { e[0x23] = this.r(0x64a); e[0x24] = this.r(0x64b); e[0x22] = 2; } else e[0x22] = 0;
  }

  /** 模式 8（按长度翻页浏览候选）按键处理，$988F */
  mode8() {
    const e = this.e;
    const key = this.ascii;
    if (key === 0x3d || key === 0x2e) {
      const limit = e[4] === 9 ? 0x0f : 0x12;
      if (e[0x0b] >= limit) return;
      e[0x0b]++;
    } else if (key === 0x2d || key === 0x2c) {
      if (e[0x0b] === 0) return;
      e[0x0b]--;
    } else { this.passKey(); return; }
    this.buildCandidateList();
    if (e[0x0b] >= 0x12 || (e[4] === 9 && e[0x0b] >= 0x0f)) e[3] &= 0x7f;
    else e[3] |= 0x80;
    this.showHintIfEmpty();
  }

  /** 输入串（ERAM $6905 起，长 $6904）在音节表里查找（$9735）：0 没有音节以它开头、1 与某音节完全相同、2 只是前缀；命中时 ERAM $6983/$6984 是项序号乘 2 */
  tableLookup() {
    const e = this.e;
    const shuangpin = this.mode === 2;
    const length = shuangpin ? 2 : 6;
    const base = shuangpin ? 0x926d : 0x88dd;
    const count = shuangpin ? 465 : 408;
    this.w(0x371, length);
    if (length < e[4] || e[4] === 0) return 0;
    let result = 0;
    let offset = 0;
    for (let i = 0; i < count; i++) {
      let y = 0;
      while (y < e[4] && imeRom(base + i * length + y) === e[5 + y]) y++;
      if (y === e[4]) {
        if (y >= length || imeRom(base + i * length + y) === 0x20) {
          e[0x83] = offset & 0xff;
          e[0x84] = offset >> 8;
          return 1;
        }
        result = 2;
      }
      offset += 2;
    }
    e[0x83] = offset & 0xff;
    e[0x84] = offset >> 8;
    return result;
  }

  /** 读当前页的候选字（$97E2）：按 ERAM $6981/$6982 的序号乘 2 查索引表，再读候选字表，跳过 $690B 页，每页 5 个；后面还有候选字时 $6903 置 $C0 */
  loadCandidates() {
    const e = this.e;
    this.dictUsed = true;
    const saved = e[0x81] | (e[0x82] << 8);
    this.w(0x69a, 0x10);
    this.w(0x69b, 0);
    this.w(0x69c, 0);
    this.w(0x69d, e[0x81]);
    this.w(0x69e, e[0x82]);
    let position = dict[saved] | (dict[saved + 1] << 8);
    let last = 0;
    const read = () => { last = dict[position++]; return last; };
    let page = 0;
    let x = 0;
    for (;;) {
      x = 0;
      let ended = false;
      for (;;) {
        const value = read();
        if (value === 0xff) { ended = true; break; }
        e[0x14 + x] = value;
        x++;
        if (x >= 10) break;
      }
      if (ended || page >= e[0x0b]) break;
      page++;
    }
    this.w(0x646, page);
    if (x === 0) return;
    e[0x13] = x >> 1;
    if (last === 0xff) return;
    if (read() !== 0xff) e[3] |= 0xc0;
  }

  isLowerLetter(key) { return key >= 0x61 && key < 0x7b; }

  /** 全拼、双拼的按键处理（$960F，IME_KEY_HANDLER_TABLE 序号 1、2） */
  pinyinKey() {
    const e = this.e;
    const key = this.ascii;
    if (key === 8) {
      this.backspace();
      if (e[4] !== 0) this.pinyinLookup();
      return;
    }
    if (e[4] !== 0) {
      let handled = false;
      if (key === 0x20) {
        if (e[0x13] !== 0) {
          e[0x22] = 2;
          e[0x23] = e[0x14];
          e[0x24] = e[0x15];
          e[4] = 0;
          return;
        }
      } else if (e[0x13] !== 0) {
        if (key === 0x3d || key === 0x2e) { this.pageNext(); handled = true; }
        else if (key === 0x2d || key === 0x2c) { this.pagePrevious(); handled = true; }
      }
      if (handled) return;
    }
    if (e[4] === 0) this.pinyinFirstKey(); else this.pinyinAppend();
  }

  pinyinAppend() { this.appendKey(); this.pinyinLookup(); }

  /** 追加或回删后重查音节表（$9690） */
  pinyinLookup() {
    const e = this.e;
    const result = this.tableLookup();
    if (result !== 0) { this.pinyinShow(result); return; }
    if (!this.isLowerLetter(this.ascii)) { this.passKey(); e[4]--; return; }
    if (e[0x13] === 0) { e[4]--; return; }
    if (!(e[2] & 0x80)) {
      e[0x23] = e[0x14];
      e[0x24] = e[0x15];
      e[0x22] = 2;
    }
    e[4] = 0;
    this.pinyinRestart();
  }

  pinyinFirstKey() {
    if (!this.isLowerLetter(this.ascii)) { this.passKey(); return; }
    this.pinyinRestart();
  }

  pinyinRestart() {
    this.returnIfActive();
    this.clearStatusLine();
    this.e[0x13] = 0;
    this.pinyinAppend();
  }

  pinyinShow(result) {
    const e = this.e;
    this.showInput();
    if (result !== 1) return;
    e[0x0b] = 0;
    e[0x0c] = 0;
    e[3] = 0;
    e[0x81] = e[0x83];
    e[0x82] = e[0x84];
    this.loadCandidates();
    this.showHintIfEmpty();
    if (e[0x13] !== 1) e[3] |= 0x40;
  }

  pageNext() {
    const e = this.e;
    if (!(e[3] & 0x80)) return;
    e[3] &= 0x7f;
    e[0x0b]++;
    this.loadCandidates();
    this.showHintIfEmpty();
  }

  pagePrevious() {
    const e = this.e;
    if (e[0x0b] === 0) return;
    e[0x0b]--;
    this.loadCandidates();
    this.showHintIfEmpty();
  }

  dispatchMode() {
    const mode = this.mode;
    if (mode === 0) this.mode0();
    else if (mode === 1 || mode === 2) this.pinyinKey();
    else if (mode === 7 || mode === 9) this.passKey();
    else if (mode === 8) this.mode8();
    else this.unmodelled(`输入法 ${mode} 的按键处理依赖外挂模块`);
  }

  after861f() {
    const e = this.e;
    if (this.ascii !== 0) {
      e[2] &= 0x7f;
      if (this.ascii === 0x0d) { this.keyPassOrFlush(); return; }
      if (this.ascii === 8 && e[4] === 0) { this.passKey(); return; }
    }
    this.dispatchMode();
  }

  handleCandidateKey() {
    const e = this.e;
    if (e[0x13] & 0x80) {
      if (this.scan === 0x78) this.copyCandidate(); else this.passKey();
      return;
    }
    if (this.scan >= 0x78 && this.scan < 0x7d) {
      const index = this.scan - 0x78;
      if (index < e[0x13]) { this.outputCandidate(index); return; }
    }
    this.passKey();
  }

  after85af() {
    const e = this.e;
    if (!(e[2] & 0x80)) {
      if ([4, 5, 6].includes(this.mode)) { this.after861f(); return; }
      if (this.ascii === 0) { this.handleCandidateKey(); return; }
      if (e[4] === 0) { this.after861f(); return; }
    }
    let key = this.ascii;
    if (key === 0x20) key = 0x31;
    if (key < 0x31 || key >= 0x36) { this.after861f(); return; }
    const index = key - 0x31;
    if (index < e[0x13]) {
      this.outputCandidate(index);
      if (this.mode !== 8) { e[0x4e] = 0x20; e[0x4f] = 0x20; this.draw(); }
      return;
    }
    if (this.ascii === 0x20) { this.showHint(); e[4] = 0; return; }
    this.after861f();
  }

  after8531() {
    if (this.e[2] & 1) this.unmodelled('联想方式（ERAM $6902 位 0）下的按键处理依赖词库');
    this.after85af();
  }

  pollKey() {
    const e = this.e;
    this.getKey();
    const scan = this.scan;
    if (scan === 0) return;
    if (this.ascii === 0 && scan === 0x5e) { if (e[2] & 4) this.sub03(); else this.sub04(); return; }
    if (e[2] & 4) { this.passKey(); return; }
    e[0x23] = 0;
    if (this.ascii !== 0) { this.after8531(); return; }
    if (scan >= 0x68 && scan < 0x72) {
      if (scan === 0x70) {
        this.w(0x652, 8);
        if (!(e[1] & 0x80)) return;
        if (this.mode !== 8) { this.sub01(); return; }
        this.clearStatusLine();
        e[0x0b] = 0;
        e[4]++;
        if (e[4] === 0x0a) e[4] = 1;
        this.buildCandidateList();
        this.flushKeys();
        this.returnIfActive2();
        e[3] |= 0x80;
        this.showHintIfEmpty();
        e[2] &= 0x7f;
        return;
      }
      this.w(0x652, ((scan - 0x68) | 0x80) & 0xff);
      this.sub01();
      return;
    }
    if (scan === 0x60 && (e[2] & 0x40)) this.unmodelled('Ctrl+F3 切换联想方式要等待按键');
    if ((scan === 0x66 || scan === 0x65) && (e[2] & 0x20)) { if (e[2] & 2) this.sub05(); else this.sub06(); return; }
    this.after8531();
  }

  sub0b() {
    const e = this.e;
    this.w(0x640, 0);
    this.parsed = false;
    this.dictUsed = false;
    e[0x22] = 0;
    this.w(0x34b, 0);
    this.w(0x34c, 0);
    this.pollKey();
    if (e[2] & 4) return;
    if ((e[2] & 1) && this.mode < 7 && e[0x22] === 2 && e[4] === 0) {
      if (e[0x23] >= 0xb0 && e[0x23] < 0xd9) this.unmodelled('联想方式下输出汉字后的联想词查找');
      const keep = e[0];
      e[0] = 0x0b;
      this.returnIfActive();
      e[0] = keep;
    }
    if ((e[2] & 2) && !(e[0x23] & 0x80)) this.specialKeyLookup(e[0x23]);
  }
}
