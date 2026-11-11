// ------------------------------------------------------------------------
// 名称：p5c-model.mjs
// 说明：页组 $5C 里不依赖硬件的服务的字节级模型：内存页服务 $7E/$00-$02（位图分配、释放、最长连续空闲页）与日期时间服务 $7F/$01-$04。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：按 bios/src/system-services/（$8003-$83C4、$83D0-$857E）转录；位图在 ERAM $6586 起 32 字节，位 7 对应最小的页号，位为 1 表示空闲。
//       分配与释放会把 $6308-$630B 当临时变量改写，模型一并给出它们的结果。
// ------------------------------------------------------------------------
const DAYS_IN_MONTH = [0x1f, 0x1c, 0x1f, 0x1e, 0x1f, 0x1e, 0x1f, 0x1f, 0x1e, 0x1f, 0x1e, 0x1f];

/** 内存页服务的状态：位图、ALLOC_COUNT、ALLOC_START、DOS_ERROR 与 $6308-$630B 四个临时单元 */
export class PageModel {
  /** @param {number[]} bitmap 32 字节位图 @param {{count: number, start: number, temp?: number[]}} state 参数与临时单元初值 */
  constructor(bitmap, { count, start, temp = [0, 0, 0, 0] }) {
    this.bitmap = Uint8Array.from(bitmap);
    this.count = count;
    this.start = start;
    this.error = 0;
    [this.libGroup, this.t9, this.tA, this.tB] = temp;
  }

  /** 位图里从第 x 字节的第 y 位起清除（占用）或置位（释放）count 个页 */
  mark(x, y, count, release) {
    let remaining = count;
    while (remaining !== 0) {
      let first = 0xff;
      let second = 0xff;
      remaining = (remaining + y) & 0xff;
      this.count = remaining;
      first >>= y;
      if (remaining < 8) {
        second = (0xff << (8 - remaining)) & 0xff;
        remaining = 8;
        this.count = 8;
      }
      const mask = first & second;
      if (release) {
        this.tA = mask;
        this.tB = second;
        this.bitmap[x] |= mask;
      } else {
        this.tA = ~mask & 0xff;
        this.tB = second;
        this.bitmap[x] &= ~mask & 0xff;
      }
      remaining = (remaining - 8) & 0xff;
      this.count = remaining;
      y = 0;
      x++;
    }
  }

  /** $7E/$00 PAGE_ALLOC：找 count 个连续空闲页占用，起始页号放 start；没有时出错码 8、start 为 0 */
  alloc() {
    const original = this.count;
    let run = 0;
    this.start = 0;
    this.libGroup = 0;
    let found = false;
    for (let x = 0; x < 32 && !found; x++) {
      this.t9 = this.bitmap[x];
      for (let k = 0; k < 8; k++) {
        const free = this.t9 >> 7;
        this.t9 = (this.t9 << 1) & 0xff;
        if (free) {
          if (run === 0) this.start = this.libGroup;
          run++;
          if (run >= original) { found = true; break; }
        } else {
          run = 0;
          this.start = 0;
        }
        this.libGroup = (this.libGroup + 1) & 0xff;
      }
    }
    if (!found) {
      this.error = 8;
      this.start = 0;
    } else {
      this.error = 0;
      this.mark(this.start >> 3, this.start & 7, this.count, false);
    }
    this.count = original;
  }

  /** $7E/$01 PAGE_FREE：释放 start 起 count 个页；页号小于 $80 或不小于 $F0 时出错码 9 */
  free() {
    this.error = 0;
    if (this.start < 0x80 || this.start >= 0xf0) { this.error = 9; return; }
    this.mark(this.start >> 3, this.start & 7, this.count, true);
  }

  /** $7E/$02 PAGE_LARGEST_FREE：最长的连续空闲页数放 count */
  largest() {
    let run = 0;
    this.libGroup = 0;
    this.tB = 0;
    for (let x = 0; x < 32; x++) {
      this.t9 = this.bitmap[x];
      for (let k = 0; k < 8; k++) {
        const free = this.t9 >> 7;
        this.t9 = (this.t9 << 1) & 0xff;
        if (free) run = (run + 1) & 0xff;
        else {
          if (run >= this.tB) this.tB = run;
          run = 0;
        }
        this.libGroup = (this.libGroup + 1) & 0xff;
      }
    }
    if (run >= this.tB) this.tB = run;
    this.count = this.tB;
  }
}

/** 日期时间服务的状态：系统时钟 $068A-$068D、系统日期 ERAM $6305-$6307、FILE_DATE/TIME */
export class ClockModel {
  /** @param {{seconds: number, minutes: number, hours: number, dayCarry: number, day: number, month: number, year: number, fileDate: number, fileTime: number, temp?: number[]}} state */
  constructor(state) {
    Object.assign(this, state);
    this.temp = state.temp ?? [0, 0, 0];
    this.error = 0;
  }

  /** $7F/$04 GET_TIME */
  getTime() {
    const high = ((this.minutes >> 3) | ((this.hours << 3) & 0xff)) & 0xff;
    const low = ((this.seconds >> 1) | ((this.minutes << 5) & 0xff)) & 0xff;
    this.fileTime = (high << 8) | low;
  }

  /** 检查 FILE_TIME：秒的一半不大于 29、分不大于 59、时不大于 23 */
  timeValid() {
    const low = this.fileTime & 0xff;
    const high = this.fileTime >> 8;
    const halfSeconds = low & 0x1f;
    const minutes = (low >> 5) | ((high & 7) << 3);
    const hours = high >> 3;
    return halfSeconds <= 0x1d && minutes <= 0x3b && hours <= 0x17;
  }

  /** $7F/$03 SET_TIME */
  setTime() {
    if (!this.timeValid()) { this.error = 0x25; return; }
    const low = this.fileTime & 0xff;
    const high = this.fileTime >> 8;
    this.hours = high >> 3;
    this.seconds = (low & 0x1f) << 1;
    this.minutes = (low >> 5) | ((high & 7) << 3);
  }

  /** 检查 FILE_DATE：年不大于 $77、月 1-12、日 1 到当月天数（二月按年号能被 4 整除算 29 天） */
  dateValid() {
    const low = this.fileDate & 0xff;
    const high = this.fileDate >> 8;
    const day = low & 0x1f;
    const year = high >> 1;
    const month = (low >> 5) | ((high & 1) << 3);
    if (year > 0x77 || month === 0 || month > 12 || day === 0) return false;
    const limit = month === 2 ? ((year & 3) === 0 ? 0x1d : 0x1c) : DAYS_IN_MONTH[month - 1];
    return day <= limit;
  }

  /** $7F/$01 SET_DATE */
  setDate() {
    if (!this.dateValid()) { this.error = 0x25; return; }
    const low = this.fileDate & 0xff;
    const high = this.fileDate >> 8;
    this.dayCarry = 0;
    this.day = low & 0x1f;
    this.year = high >> 1;
    this.month = (low >> 5) | ((high & 1) << 3);
  }

  /** 过了午夜（$068D 非 0）时系统日期加一天，含月、年进位，年最大 $77 */
  applyDayCarry() {
    if (this.dayCarry === 0) return;
    this.dayCarry = 0;
    this.day = (this.day + 1) & 0xff;
    const limit = this.month === 2 ? ((this.year & 3) === 0 ? 0x1d : 0x1c) : DAYS_IN_MONTH[this.month - 1];
    if (limit >= this.day) return;
    this.day = 1;
    this.month++;
    if (this.month <= 12) return;
    this.month = 1;
    this.year++;
    if (this.year > 0x77) this.year = 0x77;
  }

  /** $7F/$02 GET_DATE */
  getDate() {
    this.applyDayCarry();
    const shifted = this.month << 5;
    const low = (shifted & 0xff) | this.day;
    const high = ((this.year << 1) | ((shifted >> 8) & 1)) & 0xff;
    this.fileDate = (high << 8) | (low & 0xff);
  }
}
