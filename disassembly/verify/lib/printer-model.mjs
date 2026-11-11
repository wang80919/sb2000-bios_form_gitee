// ------------------------------------------------------------------------
// 名称：printer-model.mjs
// 说明：打印机服务（功能 $76-$7A，页组 $0E，入口 $8300）里各子功能的字节级模型：点阵转置、位展开、列数据发送、发送时的各种变换模式、行距计数的参数表。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：按 bios/src/printer/printer-service.asm（$8300-$8E94）转录；假设打印机一直就绪（并口握手一次成功，SYS_STATUS 保持 0）。
//       发送到 $4025 的字节按顺序记在 out 里。遇到一行满（列计数到 $0478）会走换行、换页流程，模型不覆盖，抛异常。
// ------------------------------------------------------------------------
const LINE_END_LOW = 0x78;
const LINE_END_HIGH = 0x04;

/** 列计数到 $0478：弹出两层返回地址后转到 target（$8400 换行或 $8417 打印结束） */
export class LineEnd extends Error {
  constructor(target) {
    super(`行尾，转到 $${target.toString(16)}`);
    this.target = target;
  }
}

export class PrinterModel {
  /** @param {Uint8Array | number[]} memory 0x0800 字节的 RAM（只用 $0400-$07FF） */
  constructor(memory) {
    this.m = Uint8Array.from(memory);
    this.out = [];
    this.carry = 0;
  }

  r(address) { return this.m[address]; }

  w(address, value) { this.m[address] = value & 0xff; }

  /** 带进位的左移一位（ROL） */
  rol(address) {
    const value = this.m[address];
    this.m[address] = ((value << 1) | this.carry) & 0xff;
    this.carry = value >> 7;
  }

  /** 带进位的右移一位（ROR） */
  ror(address) {
    const value = this.m[address];
    this.m[address] = (value >> 1) | (this.carry << 7);
    this.carry = value & 1;
  }

  /** 逻辑右移一位（LSR），位 0 进进位 */
  lsr(address) {
    const value = this.m[address];
    this.m[address] = value >> 1;
    this.carry = value & 1;
  }

  /** 入口 $8300：初始化并口一次，再设置 $0548、$0640、$0544、$0546、$0547 后按子功能分发 */
  call(sub) {
    if (this.r(0x38f) === 0) this.w(0x38f, 1);
    this.w(0x548, 0);
    this.w(0x640, 0);
    this.w(0x544, this.r(0x64e));
    this.w(0x546, this.r(0x648));
    this.w(0x547, this.r(0x649));
    this.sub = sub;
    const handler = { 9: 'sub09', 0x0a: 'sub0a', 0x0b: 'sub0b', 0x0c: 'sub0c', 0x0e: 'sub0e', 0x0f: 'sub0f' }[sub];
    if (!handler) throw new Error(`模型未覆盖子功能 ${sub}`);
    this[handler]();
  }

  incColumn() {
    const value = (this.r(0x4a8) | (this.r(0x4a9) << 8)) + 1;
    this.w(0x4a8, value);
    this.w(0x4a9, value >> 8);
  }

  atLineEnd() { return this.r(0x4a8) === LINE_END_LOW && this.r(0x4a9) === LINE_END_HIGH; }

  /** 发送前对字节的整理（$85F5 之前的各模式，再加 PRN_FILTER_BY_PHASE） */
  transform(raw) {
    const end = this.r(0x4ba);
    const mode = this.r(0x544);
    let value = raw;
    if (mode === 1) {
      if (!(this.r(0x647) !== 2 && this.r(0x4b0) === 0) && this.r(0x4b1) === 2) {
        this.w(0x4b1, this.r(0x4b1) - 3);
        value = end === 0 ? raw | 3 : raw;
      }
    } else if (mode === 2) {
      value = end === 0 ? raw ^ 0xff : raw;
    } else if (mode === 3) {
      if ((this.r(0x4b1) & 0x0c) === 0) value = end === 0 ? raw | 0x44 : raw;
    } else if (mode === 4) {
      if ((this.r(0x4b1) & 0x18) === 0) value = end === 0 ? raw | 0xaa : raw;
      else value = end === 0 ? raw | 0x80 : raw;
    } else if (mode === 5) {
      if ((this.r(0x4b1) & 3) === 0) { this.carry = 0; this.rol(0x4b2); if (this.carry) this.rol(0x4b2); }
      value = end === 0 ? raw | this.r(0x4b2) : raw;
    } else if (mode === 6) {
      if ((this.r(0x4b1) & 3) === 0) { this.carry = 0; this.ror(0x4b5); if (this.carry) this.ror(0x4b5); }
      value = end === 0 ? raw | this.r(0x4b5) : raw;
    } else if (mode === 7) {
      if ((this.r(0x4b1) & 3) === 0) {
        this.carry = 0; this.rol(0x4b2); if (this.carry) this.rol(0x4b2);
        this.carry = 0; this.ror(0x4b5); if (this.carry) this.ror(0x4b5);
      }
      value = end === 0 ? raw | this.r(0x4b2) | this.r(0x4b5) : raw;
    }
    // PRN_FILTER_BY_PHASE：$0647 为 0 且变换模式不是 1 时，按 $04BB 计数把每 3 个字节里的一个换成 0
    if (this.r(0x647) === 0 && this.r(0x544) !== 1) {
      this.w(0x4bb, this.r(0x4bb) + 1);
      const count = this.r(0x4bb);
      if ((this.r(0x4b0) & 1) === 0) {
        if (count === 1) value = 0;
        else if (count === 3) this.w(0x4bb, 0);
      } else if (count === 3) {
        value = 0;
        this.w(0x4bb, 0);
      }
    }
    return value;
  }

  /** PRN_SEND_BYTE：发送 $04A4（SYS_STATUS 不为 0 时什么都不做） */
  send() {
    if (this.r(0x640) !== 0) return;
    this.w(0x4a5, 0);
    this.out.push(this.transform(this.r(0x4a4)));
    this.w(0x4b1, this.r(0x4b1) + 1);
  }

  sub0c() {
    this.sendEmptyColumns();
  }

  /** PRN_SUB_12：发送 $0546 组空列（子功能 $0C 直接调用时 $0546 为 0 也发，计数从 1 数到 255 再回到 0） */
  sendEmptyColumns(direct = true) {
    if (!direct && this.r(0x546) === 0) return;
    this.w(0x4a4, 0);
    let y = 0;
    do {
      this.send(); this.send(); this.send();
      this.incColumn();
      if (this.atLineEnd()) throw new LineEnd(this.r(0x647) === 2 ? 0x8417 : 0x8400);
      y = (y + 1) & 0xff;
    } while (y !== this.r(0x546));
  }

  sub0b() {
    const bitmap = this.r(0x647) === 2;
    const repeatEnd = bitmap
      ? { 0: 1, 1: 1, 2: 2, 3: 3, 4: 4 }[this.r(0x646)] ?? 5
      : { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5 }[this.r(0x646)] ?? 6;
    const rowEnd = bitmap ? (this.r(0x64a) !== 0 ? 0x48 : 0x24) : (this.r(0x64a) !== 0 ? 0x30 : 0x18);
    let y = 0;
    do {
      let x = 0;
      do {
        for (let k = 0; k < 3; k++) { this.w(0x4a4, this.r(0x4c4 + y + k)); this.send(); }
        this.incColumn();
        if (this.atLineEnd()) throw new LineEnd(bitmap ? 0x8417 : 0x8400);
        x++;
      } while (x !== repeatEnd);
      y += 3;
    } while (y !== rowEnd);
  }

  /** 把每位重复 2 次，8 位展开成 16 位（$88D1） */
  expandX2() {
    for (let x = 0; x < 8; x++) {
      this.carry = this.r(0x4ac) & 1;
      this.ror(0x4ad); this.ror(0x4ae);
      this.lsr(0x4ac);
      this.ror(0x4ad); this.ror(0x4ae);
    }
    if (this.r(0x4b0) === 0) {
      this.w(0x4af, this.r(0x4ae));
      this.w(0x4ae, this.r(0x4ad));
      this.w(0x4ad, 0);
    } else {
      this.w(0x4af, 0);
    }
  }

  /** 把每位重复 3 次，8 位展开成 24 位（$8908） */
  expandX3() {
    for (let x = 0; x < 8; x++) {
      for (let k = 0; k < 2; k++) {
        this.carry = this.r(0x4ac) & 1;
        this.ror(0x4ad); this.ror(0x4ae); this.ror(0x4af);
      }
      this.lsr(0x4ac);
      this.ror(0x4ad); this.ror(0x4ae); this.ror(0x4af);
    }
  }

  sub0a() {
    if (this.r(0x647) === 2) { this.buildBitmap(); return; }
    let y = this.r(0x4b0) === 0 ? 0 : 1;
    for (let x = 0; x !== 0x30; x += 3) {
      this.w(0x4ac, this.r(0x524 + y));
      if (this.r(0x647) === 0) this.expandX2(); else this.expandX3();
      this.w(0x4c4 + x, this.r(0x4ad));
      this.w(0x4c5 + x, this.r(0x4ae));
      this.w(0x4c6 + x, this.r(0x4af));
      y += 2;
    }
  }

  buildBitmap() {
    for (let y = 0, x = 0; y < 0x20; y++, x += 3) {
      this.w(0x4ac, this.r(0x524 + y));
      this.expandX3();
      this.w(0x4c4 + x, this.r(0x4ad));
      this.w(0x4c5 + x, this.r(0x4ae));
      this.w(0x4c6 + x, this.r(0x4af));
    }
    for (let x = 0, y = 0; y < 0x30; x += 2, y++) {
      this.w(0x4ad, this.r(0x4c4 + x));
      this.w(0x4ae, this.r(0x4c5 + x));
      for (let i = 0; i < 8; i++) {
        this.lsr(0x4ad); this.ror(0x4ae); this.ror(0x4ac);
        this.lsr(0x4ad); this.ror(0x4ae);
      }
      this.w(0x4c4 + y, this.r(0x4ac));
    }
    for (let x = 0; x < 0x30; x++) this.w(0x4f4 + x, this.r(0x4c4 + x));
    for (let x = 0, y = 0x30; y !== 0x60; x += 9, y += 6) {
      const a = (offset) => this.r(0x4c4 + y + offset);
      this.w(0x4c4 + x, a(0));
      this.w(0x4c7 + x, a(0) | a(3));
      this.w(0x4ca + x, a(3));
      this.w(0x4c5 + x, a(1));
      this.w(0x4c8 + x, a(1) | a(4));
      this.w(0x4cb + x, a(4));
      this.w(0x4c6 + x, a(2));
      this.w(0x4c9 + x, a(2) | a(5));
      this.w(0x4cc + x, a(5));
    }
  }

  /** 点阵转置（$86EC）：16 或 32 字节的字模，按位转成打印用的列数据放回 $0524 起 */
  sub09() {
    const size = this.r(0x64a) !== 0 ? 0x20 : 0x10;
    for (let y = 0; y < size; y++) this.w(0x4c4 + y, this.r(0x524 + y));
    let base = 0x4c4;
    let shift = 8;
    let pointer = base;
    let index = 0;
    for (;;) {
      for (let y = 0; y < 8; y++) {
        this.carry = (this.r(pointer + y) >> (shift - 1)) & 1;
        this.rol(0x524 + index);
      }
      index++;
      if (index === 0x20) {
        this.w(0x4a6, shift); this.w(0x4a7, index); this.w(0x4aa, base); this.w(0x4ab, base >> 8);
        return;
      }
      if (index === 0x10) { base = 0x4d4; shift = 8; pointer = base; continue; }
      if (index & 1) pointer += 8;
      else { shift--; pointer = base; }
    }
  }

  sub0e() { /* 只改 $038F，其余是并口与延时 */ }

  sub0f() {
    const choice = this.r(0x652);
    this.w(0x4bc, choice);
    const table = { 0: [0x07, 0x6c], 1: [0x09, 0xdb], 2: [0x08, 0x3a], 3: [0x05, 0xd0], 4: [0x08, 0x1d], 5: [0x07, 0x1d] }[choice];
    if (table) { this.w(0x4bc, table[0]); this.w(0x4bd, table[1]); }
  }
}
