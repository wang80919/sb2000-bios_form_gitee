// ------------------------------------------------------------------------
// 名称：lyric-model.mjs
// 说明：卡拉 OK 歌词排版（bios/src/karaoke/lyrics-scroll.asm）的字节级模型：TEXT_PARSE_LINE、TEXT_PARSE_BACK、TEXT_BUILD_NEXT_LINE 及其用到的位置栈、条带命令队列，供 verify/cases/p0f-lyrics.mjs 使用。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-10
// 备注：按代码阅读逐例程转录。所有状态放在 $0000-$07FF 的字节数组里（与实机的 $04A4-$05FF 和零页 $32-$34 逐字节比较）；歌词数据放在窗口数组里，地址 $8000 起。
//       绘制一行（功能 $3C）只记入 draws（行显示地址与缓冲内容），屏幕内容不在这里核对。
//       TEXT_FETCH_BYTE 返回的字节为 0 时例程里的 BEQ 成立，模型按“值为 0”判断。
// ------------------------------------------------------------------------
import { BIOS_DIR } from '../../tools/config.mjs';
import { assembleProject } from '../../../bios/tools/bios-project.mjs';

export const symbols = assembleProject(BIOS_DIR).assembled.symbols;
export const addr = (name) => {
  const value = symbols.get(name);
  if (value === undefined) throw new Error(`没有符号 ${name}`);
  return value;
};

/** 位置栈每层 4 个字节、两层 */
const STACK_BYTES = 8;

export class LyricModel {
  /** @param {Uint8Array} ram $0000-$07FF 的字节 @param {Uint8Array} window 歌词数据，下标 = 窗口地址 − $8000 */
  constructor(ram, window) {
    this.ram = ram;
    this.window = window;
    this.draws = [];
  }

  b(name) { return this.ram[addr(name)]; }

  set(name, value) { this.ram[addr(name)] = value & 0xff; }

  w(lo, hi) { return this.b(lo) | (this.b(hi) << 8); }

  setW(lo, hi, value) { this.set(lo, value & 0xff); this.set(hi, (value >> 8) & 0xff); }

  // ---- 指针 $32/$33 与取字节 ----
  get ptr() { return this.w('LYRIC_PTR_LO', 'LYRIC_PTR_HI'); }

  set ptr(value) { this.setW('LYRIC_PTR_LO', 'LYRIC_PTR_HI', value); }

  inc() { this.ptr = (this.ptr + 1) & 0xffff; }

  fetch() {
    const value = this.window[this.ptr - 0x8000];
    if (value === undefined) throw new Error(`歌词数据读到窗口之外：$${this.ptr.toString(16)}`);
    this.set('LYRIC_FETCHED_BYTE', value);
    return value;
  }

  // ---- 位置栈（两层，每层：指针、结束位置） ----
  push(stack, depth, ptr, end) {
    const base = addr(stack);
    for (let i = 0; i < 4; i++) this.ram[base + 4 + i] = this.ram[base + i];
    this.ram[base] = this.b(ptr);
    this.ram[base + 1] = this.b(ptr.replace('LO', 'HI'));
    this.ram[base + 2] = this.b(end);
    this.ram[base + 3] = this.b(end.replace('LO', 'HI'));
    this.ram[addr(depth)] = (this.b(depth) + 1) & 0xff;
  }

  pop(stack, depth, ptr, end) {
    const base = addr(stack);
    this.set(ptr, this.ram[base]);
    this.set(ptr.replace('LO', 'HI'), this.ram[base + 1]);
    this.set(end, this.ram[base + 2]);
    this.set(end.replace('LO', 'HI'), this.ram[base + 3]);
    for (let i = 0; i < 4; i++) this.ram[base + i] = this.ram[base + 4 + i];
    this.ram[addr(depth)] = (this.b(depth) - 1) & 0xff;
  }

  pushA() { this.push('LYRIC_STACK_A', 'LYRIC_DEPTH_A', 'LYRIC_BACK_PTR_LO', 'LYRIC_BACK_END_LO'); }

  popA() { this.pop('LYRIC_STACK_A', 'LYRIC_DEPTH_A', 'LYRIC_BACK_PTR_LO', 'LYRIC_BACK_END_LO'); }

  pushB() { this.push('LYRIC_STACK_B', 'LYRIC_DEPTH_B', 'LYRIC_LINE_PTR_LO', 'LYRIC_LINE_END_LO'); }

  popB() { this.pop('LYRIC_STACK_B', 'LYRIC_DEPTH_B', 'LYRIC_LINE_PTR_LO', 'LYRIC_LINE_END_LO'); }

  /** 8E 记录：[8E, 起点偏移 2 字节, 终点偏移 2 字节]（偏移相对 LYRIC_DATA_BASE）；返回 [起点, 终点] 绝对地址，指针停在记录之后 */
  readCall() {
    const base = this.w('LYRIC_DATA_BASE_LO', 'LYRIC_DATA_BASE_HI');
    const pair = () => {
      this.inc();
      const lo = this.fetch();
      this.set('LYRIC_LENGTH_LO', lo);
      this.inc();
      const hi = this.fetch();
      this.set('LYRIC_LENGTH_HI', hi);
      return ((hi << 8) | lo) + base;
    };
    const start = pair() & 0xffff;
    const end = pair() & 0xffff;
    this.inc();
    return [start, end];
  }

  // ---- TEXT_PARSE_LINE ($8A60)：解析一行文字放进 LYRIC_LINE_BUFFER，遇 $9D 画出这一行 ----
  parseLine() {
    const buffer = addr('LYRIC_LINE_BUFFER');
    let x = 0;
    this.ptr = this.w('LYRIC_LINE_PTR_LO', 'LYRIC_LINE_PTR_HI');
    for (;;) {
      if (this.ptr === this.w('LYRIC_LINE_END_LO', 'LYRIC_LINE_END_HI')) {
        this.popB();
        this.ptr = this.w('LYRIC_LINE_PTR_LO', 'LYRIC_LINE_PTR_HI');
      }
      const a = this.fetch();
      if (a === 0 || a === 0x80) { this.inc(); this.inc(); continue; }
      if (a === 0xff) { this.set('LYRIC_END_FLAG', 0xff); return; }
      if (a === 0x8e) {
        const [start, end] = this.readCall();
        this.setW('LYRIC_LINE_PTR_LO', 'LYRIC_LINE_PTR_HI', this.ptr);
        this.pushB();
        this.setW('LYRIC_LINE_END_LO', 'LYRIC_LINE_END_HI', end);
        this.setW('LYRIC_LINE_PTR_LO', 'LYRIC_LINE_PTR_HI', start);
        this.ptr = start;
        continue;
      }
      if (a === 0x9d) {
        this.inc();
        const overflow = x > 0x1c;
        while (x !== 0x1c) { this.ram[buffer + (x & 0xff)] = 0x20; x = (x + 1) & 0xff; }
        this.ram[buffer + x] = 0;
        // 超长行：补空格的循环绕过 X=255，把 $05CB-$06AD（含 WINDOW_SAVE_0）写成 $20；随后的功能 $3C 调用转到页组 $20，没有再回到本例程（实机该例程尾部不再执行）
        if (overflow) return;
        this.drawLine();
        return;
      }
      if (a === 0x5e) {
        if (this.b('LYRIC_DEPTH_B') !== 0) { this.inc(); this.inc(); continue; }
        for (;;) {
          this.ram[buffer + x++] = 0xa1;
          this.ram[buffer + x++] = 0xf1;
          this.inc();
          this.inc();
          if (this.fetch() !== 0x5e) break;
        }
        continue;
      }
      this.ram[buffer + x] = a;
      if (a < 0xa0) {
        x++;
        this.inc();
        this.inc();
        continue;
      }
      x++;
      this.inc();
      this.ram[buffer + x] = this.fetch();
      x++;
      this.inc();
      this.inc();
    }
  }

  /** 解析完一行：功能 $3C 画出缓冲，两行显示地址交替，置“下一行已解析好”标志 */
  drawLine() {
    const buffer = addr('LYRIC_LINE_BUFFER');
    const row = this.w('LYRIC_ROW_ADDR_LO', 'LYRIC_ROW_ADDR_HI');
    this.draws.push({ row, text: Array.from(this.ram.subarray(buffer, buffer + 0x1d)) });
    const row0 = this.w('LYRIC_ROW0_ADDR_LO', 'LYRIC_ROW0_ADDR_HI');
    const row1 = this.w('LYRIC_ROW1_ADDR_LO', 'LYRIC_ROW1_ADDR_HI');
    this.setW('LYRIC_ROW_ADDR_LO', 'LYRIC_ROW_ADDR_HI', row === row0 ? row1 : row0);
    this.set('BAR_LINE_FLAG', 0xff);
    this.setW('LYRIC_LINE_PTR_LO', 'LYRIC_LINE_PTR_HI', this.ptr);
  }

  // ---- TEXT_PARSE_BACK ($8BE2)：往前解析，得到下一项的类型与长度 ----
  addPosition() { this.setW('LYRIC_POSITION_LO', 'LYRIC_POSITION_HI', (this.w('LYRIC_POSITION_LO', 'LYRIC_POSITION_HI') + 1) & 0xffff); }

  parseBack() {
    this.ptr = this.w('LYRIC_BACK_PTR_LO', 'LYRIC_BACK_PTR_HI');
    // 读时长：LYRIC_LENGTH = 时长字节 + 后面各个 [$80, 附加] 的附加
    const readLength = () => {
      this.set('LYRIC_LENGTH_HI', 0);
      this.set('LYRIC_LENGTH_LO', this.fetch());
      for (;;) {
        this.inc();
        if (this.fetch() !== 0x80) { this.setW('LYRIC_BACK_PTR_LO', 'LYRIC_BACK_PTR_HI', this.ptr); return; }
        this.inc();
        const sum = this.w('LYRIC_LENGTH_LO', 'LYRIC_LENGTH_HI') + this.fetch();
        this.setW('LYRIC_LENGTH_LO', 'LYRIC_LENGTH_HI', sum);
      }
    };
    for (;;) {
      if (this.ptr === this.w('LYRIC_BACK_END_LO', 'LYRIC_BACK_END_HI')) {
        this.popA();
        this.ptr = this.w('LYRIC_BACK_PTR_LO', 'LYRIC_BACK_PTR_HI');
      }
      const a = this.fetch();
      if (a === 0) { this.set('LYRIC_ITEM_KIND', 0); this.inc(); readLength(); return; }
      if (a === 0xff) { this.set('LYRIC_ITEM_KIND', 0xff); return; }
      if (a >= 0xa0) { this.set('LYRIC_ITEM_KIND', 2); this.inc(); this.inc(); readLength(); return; }
      if (a < 0x80) {
        if (a === 0x20) {
          this.inc();
          if (this.fetch() === 0) { this.addPosition(); this.addPosition(); this.inc(); continue; }
          this.set('LYRIC_ITEM_KIND', 1);
          readLength();
          return;
        }
        if (a === 0x5e) this.set('LYRIC_ITEM_KIND', this.b('LYRIC_DEPTH_A') === 0 ? 2 : 0);
        else this.set('LYRIC_ITEM_KIND', 1);
        this.inc();
        readLength();
        return;
      }
      if (a === 0x9d) {
        const position = this.w('LYRIC_POSITION_LO', 'LYRIC_POSITION_HI');
        const row0 = this.w('LYRIC_ROW0_ADDR_LO', 'LYRIC_ROW0_ADDR_HI');
        const row1 = this.w('LYRIC_ROW1_ADDR_LO', 'LYRIC_ROW1_ADDR_HI');
        this.setW('LYRIC_POSITION_LO', 'LYRIC_POSITION_HI', position < row1 ? row1 : row0);
        if (this.b('LYRIC_END_FLAG') !== 0xff) { this.set('BAR_CMD_OP', 0xc0); this.queue(); }
        this.inc();
        continue;
      }
      if (a === 0x8e) {
        const [start, end] = this.readCall();
        this.setW('LYRIC_BACK_PTR_LO', 'LYRIC_BACK_PTR_HI', this.ptr);
        this.pushA();
        this.setW('LYRIC_BACK_END_LO', 'LYRIC_BACK_END_HI', end);
        this.setW('LYRIC_BACK_PTR_LO', 'LYRIC_BACK_PTR_HI', start);
        this.ptr = start;
        continue;
      }
      this.inc();
    }
  }

  // ---- 条带命令队列 ----
  /** BAR_QUEUE_COMMAND：把 BAR_CMD_OP 起的 4 字节追加进环形队列；队满会一直等待，模型当作错误 */
  queue() {
    const write = this.b('BAR_WRITE_INDEX');
    const next = (write + 4) & 0xff;
    if (next === this.b('BAR_READ_INDEX')) throw new Error('条带队列已满，例程会一直等待');
    const bar = addr('BAR_QUEUE');
    const cmd = addr('BAR_CMD_OP');
    for (let i = 0; i < 4; i++) this.ram[bar + write + i] = this.ram[cmd + i];
    this.set('BAR_WRITE_INDEX', next);
  }

  /** 条带显示地址 = 位置 × 16 + 8 */
  calcAddress() {
    this.setW('LYRIC_BAR_ADDR_LO', 'LYRIC_BAR_ADDR_HI', (this.w('LYRIC_POSITION_LO', 'LYRIC_POSITION_HI') * 16 + 8) & 0xffff);
  }

  command(op, count, address) {
    this.set('BAR_CMD_OP', op);
    this.set('BAR_CMD_COUNT', count);
    this.set('BAR_CMD_ADDR_LO', address & 0xff);
    this.set('BAR_CMD_ADDR_HI', address >> 8);
    this.queue();
  }

  /** BAR_SPLIT_LENGTH：长度拆成整块（÷8，只看低字节）与零头，按条带图案入队，并推进位置 2 次 */
  splitLength() {
    let remainder = this.b('LYRIC_LENGTH_LO') & 7;
    const shifted = this.w('LYRIC_LENGTH_LO', 'LYRIC_LENGTH_HI') >> 3;
    this.setW('LYRIC_LENGTH_LO', 'LYRIC_LENGTH_HI', shifted);
    const address = this.w('LYRIC_BAR_ADDR_LO', 'LYRIC_BAR_ADDR_HI');
    if (this.b('LYRIC_LENGTH_LO') === 0) {
      let x = 0;
      while (remainder >= 2) { this.command(x, 1, address); x++; remainder--; }
      this.set('BAR_CMD_OP', 7);
      this.set('BAR_CMD_COUNT', remainder);
      this.set('BAR_CMD_ADDR_LO', address & 0xff);
      this.set('BAR_CMD_ADDR_HI', address >> 8);
      this.queue();
    } else {
      for (let x = 0; x < 8; x++) {
        let count = this.b('LYRIC_LENGTH_LO');
        if (remainder !== 0) { count = (count + 1) & 0xff; remainder--; }
        this.command(x, count, address);
      }
    }
    this.set('LYRIC_REMAINDER', remainder);
    this.addPosition();
    this.addPosition();
  }

  /** TEXT_BUILD_NEXT_LINE ($889A)：返回 A（0 继续，$FF 结束或遇到不认识的类型） */
  buildNextLine() {
    if (this.b('BAR_LINE_FLAG') === 0) {
      this.set('LYRIC_BUILD_FLAG', 0xff);
      this.parseLine();
    }
    this.parseBack();
    const kind = this.b('LYRIC_ITEM_KIND');
    if (kind === 0) {
      for (;;) {
        this.set('BAR_CMD_OP', 0x80);
        if (this.b('LYRIC_LENGTH_HI') !== 0) {
          this.set('BAR_CMD_COUNT', 0xff);
          this.setW('LYRIC_LENGTH_LO', 'LYRIC_LENGTH_HI', this.w('LYRIC_LENGTH_LO', 'LYRIC_LENGTH_HI') - 0xff);
          this.queue();
        } else {
          this.set('BAR_CMD_COUNT', this.b('LYRIC_LENGTH_LO'));
          this.queue();
          return 0;
        }
      }
    }
    if (kind === 0xff) return 0xff;
    this.calcAddress();
    if (kind === 1) { this.splitLength(); return 0; }
    if (kind !== 2) return 0xff;
    const remainder = this.b('LYRIC_LENGTH_LO') & 1;
    this.set('LYRIC_REMAINDER', remainder);
    const half = this.w('LYRIC_LENGTH_LO', 'LYRIC_LENGTH_HI') >> 1;
    this.setW('LYRIC_LENGTH_LO', 'LYRIC_LENGTH_HI', half + remainder);
    this.splitLength();
    this.setW('LYRIC_LENGTH_LO', 'LYRIC_LENGTH_HI', half);
    const bar = this.w('LYRIC_BAR_ADDR_LO', 'LYRIC_BAR_ADDR_HI');
    this.setW('LYRIC_BAR_ADDR_LO', 'LYRIC_BAR_ADDR_HI', bar + (this.b('BAR_ERASE_MODE') === 0 ? 0x20 : 0x10));
    this.splitLength();
    return 0;
  }
}
