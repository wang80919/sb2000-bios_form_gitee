// ------------------------------------------------------------------------
// 名称：p0a-window.mjs
// 说明：窗口管理 $59 的验证用例：保存屏幕矩形、还原并释放、整理保存区、初始化。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值按 bios/src/window/（$8160-$8CD7）的代码阅读写成模型，模型直接维护扩展 RAM 页 $FC-$FF（共 16KB，窗口地址 $8000-$BFFF）与名称表缓冲页 $FA-$FB 的字节，每步都和实机逐字节比较。
//       页 $FC 的布局：$8000-$8059 是窗口表（30 项 × 3 字节：窗口号、保存数据的地址低字节与高字节，窗口号 $FF 表示空闲）；$805A/$805B 是保存区的末尾地址（初始 $8060）；$805C-$805F 是窗口号占用位图（第 1 号对应 $805C 的位 7，第 9 号对应 $805D 的位 7，依次类推，最多 30 个）；$8060 起是保存区。
//       保存区里每个窗口的数据：2 字节总长度 T（小端），然后每行一段「字节数（宽 × 2）、名称表缓冲地址低字节与高字节、内容」，最后一个 $00；T = 行数 × (字节数 + 3) + 3。名称表缓冲地址 = $8000 + 名称表号 × $800 + 行 × $40 + 列 × 2。
//       子功能 0-3：新建窗口，子功能号即名称表号，$0646/$0647 左上角列与行，$0648/$0649 右下角列与行（含），超界或右下小于左上时 $0652=$FD，无空闲窗口号 $FE，保存区装不下（新末尾地址高字节大于 $BF）$FF，成功返回窗口号；
//       子功能 4：按 $0652 的窗口号把保存的内容写回名称表缓冲，删掉表项（后面的表项前移）、清位图；只有删掉的是表里最后一项时才把保存区末尾减去它的 T，否则保存区留下空洞；返回时 $0652 变成 ((窗口号 − 1) mod 8) + 1；窗口号不小于 $1F 或表里没有时什么都不做；
//       子功能 5：整理保存区，把后面的数据前移填掉空洞；子功能 6：初始化窗口表；其他子功能什么都不做。
//       读到的整理保存区代码（$8802-$8ACB）减掉的位移是前一个窗口的长度 T，而不是空洞的大小，模型按代码写，用例用同大小与不同大小的窗口对照实机。
// ------------------------------------------------------------------------
import { runCall } from '../../tools/rom-driver.mjs';

const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const toHex = (bytes) => [...bytes].map(hexName).join('');
const FC_BASE = (0xfc - 0x80) * 0x1000;
const NT_BASE = (0xfa - 0x80) * 0x1000;
const HEAP_START = 0x8060;
const HEAP_SIZE = 0x4000;
const NT_SIZE = 0x2000;

/** 窗口管理的字节模型 */
class WindowModel {
  constructor() {
    this.fc = new Uint8Array(HEAP_SIZE).fill(0xaa);
    this.nt = Uint8Array.from({ length: NT_SIZE }, (_, i) => (i * 13 + 7) & 0xff);
    this.code = 0;
  }

  heap(address) { return this.fc[address - 0x8000] ?? 0; }

  setHeap(address, value) { this.fc[address - 0x8000] = value & 0xff; }

  word(address) { return this.heap(address) | (this.heap(address + 1) << 8); }

  get top() { return this.fc[0x5a] | (this.fc[0x5b] << 8); }

  set top(value) { this.fc[0x5a] = value & 0xff; this.fc[0x5b] = (value >> 8) & 0xff; }

  /** 子功能 6 */
  init() {
    for (let y = 0; y <= 0x5a; y += 3) this.fc[y] = 0xff;
    this.fc[0x5a] = 0x60;
    this.fc[0x5b] = 0x80;
    for (let y = 0x5c; y <= 0x5f; y++) this.fc[y] = 0;
  }

  /** 子功能 0-3 */
  create(sub, c0, r0, c1, r1) {
    if (c0 >= 0x20 || r0 >= 0x1e || c1 >= 0x20 || r1 >= 0x1e) { this.code = 0xfd; return; }
    // 找空闲窗口号
    let id = 1;
    let y = 0x5c;
    let a = this.fc[y];
    for (;;) {
      if (id === 9 || id === 17 || id === 25) { y++; a = this.fc[y]; } else if (id === 31) { this.code = 0xfe; return; }
      if ((a & 0x80) === 0) break;
      id++;
      a = (a << 1) & 0xff;
    }
    this.code = id;
    if (c1 < c0) { this.code = 0xfd; return; }
    const bytes = ((c1 - c0) * 2 + 2) & 0xff;
    if (r1 < r0) { this.code = 0xfd; return; }
    const rows = (r1 - r0 + 1) & 0xff;
    const total = (rows * (bytes + 3) + 3) & 0xffff;
    let pointer = this.top;
    if (((pointer + total) >> 8) > 0xbf) { this.code = 0xff; return; }
    const start = pointer;
    let nt = 0x8000 + (sub & 3) * 0x800 + r0 * 0x40 + c0 * 2;
    this.setHeap(pointer++, total & 0xff);
    this.setHeap(pointer++, total >> 8);
    for (let row = 0; row < rows; row++) {
      this.setHeap(pointer++, bytes);
      this.setHeap(pointer++, nt & 0xff);
      this.setHeap(pointer++, nt >> 8);
      for (let i = 0; i < bytes; i++) this.setHeap(pointer++, this.nt[nt - 0x8000 + i]);
      nt += 0x40;
    }
    this.setHeap(pointer++, 0);
    this.top = pointer;
    for (let slot = 0; slot < 0x5a; slot += 3) {
      if (this.fc[slot] === 0xff) {
        this.fc[slot] = id;
        this.fc[slot + 1] = start & 0xff;
        this.fc[slot + 2] = start >> 8;
        break;
      }
    }
    const index = Math.floor((id - 1) / 8);
    this.fc[0x5c + index] |= 0x80 >> ((id - 1) % 8);
    this.code = id;
  }

  /** 子功能 4 */
  restore(id) {
    this.code = id;
    if (id >= 0x1f) return;
    let index = -1;
    for (let slot = 0, count = 0; count < 30; slot += 3, count++) {
      if (this.fc[slot] === id) { index = slot; break; }
    }
    if (index < 0) return;
    let pointer = (this.fc[index + 1] | (this.fc[index + 2] << 8)) + 2;
    for (;;) {
      const length = this.heap(pointer++);
      if (length === 0) break;
      const nt = this.heap(pointer) | (this.heap(pointer + 1) << 8);
      pointer += 2;
      for (let i = 0; i < length; i++) this.nt[nt - 0x8000 + i] = this.heap(pointer + i);
      pointer += length;
    }
    // 表项前移
    let x = index;
    for (;;) {
      if (x >= 0x56) { this.fc[x] = 0xff; break; }
      const next = this.fc[x + 3];
      if (next === 0xff) { this.fc[x] = 0xff; break; }
      this.fc[x] = next;
      x++;
      this.fc[x] = this.fc[x + 3];
      x++;
      this.fc[x] = this.fc[x + 3];
      x++;
    }
    if (x === index) {
      const start = this.fc[x + 1] | (this.fc[x + 2] << 8);
      this.top = (this.top - this.word(start)) & 0xffff;
    }
    // 清位图，并把 $0652 减成 1-8
    let rest = id;
    let byte = 0x5c;
    while (rest >= 9) { rest -= 8; byte++; }
    this.fc[byte] &= ~(0x80 >> (rest - 1)) & 0xff;
    this.code = rest;
  }

  /** WIN_COPY_BUFFER：从 source 起把 length 个字节前移到 destination（顺序逐字节复制） */
  copyDown(destination, source, length) {
    for (let i = 0; i < length; i++) this.setHeap(destination + i, this.heap(source + i));
  }

  /** WIN_PREV_ENTRY：从表项 start 起依次把保存地址减去 amount，遇到空闲项或 $5A 停 */
  shiftEntries(start, amount) {
    let i = start;
    for (;;) {
      if (this.fc[i] === 0xff) return;
      if (i === 0x5a) return;
      const pointer = ((this.fc[i + 1] | (this.fc[i + 2] << 8)) - amount) & 0xffff;
      this.fc[i + 1] = pointer & 0xff;
      this.fc[i + 2] = pointer >> 8;
      i += 3;
    }
  }

  /** 子功能 5 */
  compact() {
    if (this.fc[0] === 0xff) { this.top = HEAP_START; return; }
    let end = this.fc[1] | (this.fc[2] << 8);
    let next;
    let size;
    let topNow = this.top;
    if (end !== HEAP_START) {
      next = end;
      end = HEAP_START;
      size = (next - HEAP_START) & 0xffff;
      this.copyDown(end, next, topNow - next);
      this.shiftEntries(0, size);
      topNow = (topNow - size) & 0xffff;
      this.top = topNow;
    }
    if (this.fc[3] === 0xff) return;
    next = this.fc[4] | (this.fc[5] << 8);
    size = this.word(end);
    end = (end + size) & 0xffff;
    let index = 6;
    for (;;) {
      if (index === 0x5d) return;
      if (end !== next) {
        this.copyDown(end, next, (topNow - next) & 0xffff);
        this.shiftEntries(index - 3, size);
        topNow = (topNow - size) & 0xffff;
        this.top = topNow;
      }
      if (this.fc[index] === 0xff) return;
      size = this.word(end);
      end = (end + size) & 0xffff;
      next = this.fc[index + 1] | (this.fc[index + 2] << 8);
      index += 3;
    }
  }
}

// ---- 场景 ----
const rect = (c0, r0, c1, r1) => ({ c0, r0, c1, r1 });
const create = (sub, area, flag = {}) => ({ op: 'create', sub, ...area, ...flag });
const restore = (id, flag = {}) => ({ op: 'restore', id, ...flag });
const poke = (offset, value, length) => ({ op: 'poke', offset, value, length });
const init = () => ({ op: 'init' });
const compact = () => ({ op: 'compact' });
const other = (sub) => ({ op: 'other', sub });

const apply = (model, step) => {
  switch (step.op) {
    case 'init': model.code = 0x55; model.init(); break;
    case 'create': model.create(step.sub, step.c0, step.r0, step.c1, step.r1); break;
    case 'restore': model.restore(step.id); break;
    case 'compact': model.code = 0x55; model.compact(); break;
    case 'poke': for (let i = 0; i < step.length; i++) model.nt[step.offset + i] = (step.value + i * 3) & 0xff; break;
    default: model.code = 0x55; break;
  }
};

const callOf = (step) => {
  switch (step.op) {
    case 'init': return { sub: 6, mem: [[0x652, [0x55]]] };
    case 'create': return { sub: step.sub, mem: [[0x646, [step.c0, step.r0, step.c1, step.r1]], [0x652, [0x55]]] };
    case 'restore': return { sub: 4, mem: [[0x652, [step.id]]] };
    case 'compact': return { sub: 5, mem: [[0x652, [0x55]]] };
    default: return { sub: step.sub, mem: [[0x652, [0x55]]] };
  }
};

const describe = (step) => {
  switch (step.op) {
    case 'init': return '初始化';
    case 'create': return `新建（名称表 ${step.sub}，${step.c0},${step.r0} 到 ${step.c1},${step.r1}）`;
    case 'restore': return `还原窗口 ${step.id}`;
    case 'compact': return '整理保存区';
    case 'poke': return '改写名称表缓冲';
    default: return `子功能 ${step.sub}`;
  }
};

const windowCase = (id, title, steps) => {
  const model = new WindowModel();
  const expected = [];
  steps.forEach((step, index) => {
    apply(model, step);
    const last = index === steps.length - 1;
    expected.push({ code: model.code, full: step.full ?? last, fc: step.full ?? last ? model.fc.slice() : null, nt: step.full ?? last ? model.nt.slice() : null });
  });
  const initial = new WindowModel();
  return {
    id: `p0a.59.${id}`,
    title: `$59 ${title}`,
    fresh: true,
    steps: [{
      host: async (client) => {
        await client.send(`write pram ${FC_BASE.toString(16)} ${toHex(initial.fc)}`);
        await client.send(`write pram ${NT_BASE.toString(16)} ${toHex(initial.nt)}`);
        const results = [];
        for (let index = 0; index < steps.length; index++) {
          const step = steps[index];
          if (step.op === 'poke') {
            const bytes = Array.from({ length: step.length }, (_, i) => (step.value + i * 3) & 0xff);
            await client.send(`write pram ${(NT_BASE + step.offset).toString(16)} ${toHex(bytes)}`);
            results.push(null);
            continue;
          }
          const call = callOf(step);
          const full = expected[index].full;
          results.push(await runCall(client, { func: 0x59, sub: call.sub, mem: call.mem, read: [[0x652, 1]], readPram: full ? [[FC_BASE, HEAP_SIZE], [NT_BASE, NT_SIZE]] : [], maxFrames: 900 }));
        }
        return results;
      },
      check: ({ data: results }) => {
        const problems = [];
        for (let index = 0; index < steps.length; index++) {
          const result = results[index];
          if (!result) continue;
          const label = `第 ${index + 1} 步（${describe(steps[index])}）`;
          if (!result.done) { problems.push(`${label}调用没有返回`); break; }
          const code = result.memory.get(0x652)[0];
          if (code !== expected[index].code) problems.push(`${label}$0652 为 ${hexName(code)}，预期 ${hexName(expected[index].code)}`);
          if (expected[index].full) {
            const fc = result.pram.get(FC_BASE);
            for (let i = 0; i < HEAP_SIZE; i++) {
              if (fc[i] !== expected[index].fc[i]) { problems.push(`${label}保存区在 $${(0x8000 + i).toString(16)} 处为 ${hexName(fc[i])}，预期 ${hexName(expected[index].fc[i])}`); break; }
            }
            const nt = result.pram.get(NT_BASE);
            for (let i = 0; i < NT_SIZE; i++) {
              if (nt[i] !== expected[index].nt[i]) { problems.push(`${label}名称表缓冲偏移 $${i.toString(16)} 处为 ${hexName(nt[i])}，预期 ${hexName(expected[index].nt[i])}`); break; }
            }
          }
          if (problems.length) break;
        }
        return problems;
      },
    }],
  };
};

const many = (count, make) => Array.from({ length: count }, (_, i) => make(i));

export const cases = [
  windowCase('init', '子功能 6 初始化窗口表', [init()]),
  windowCase('create-one', '新建一个窗口，窗口号 1', [init(), create(0, rect(2, 3, 9, 7))]),
  windowCase('restore-one', '新建后改写屏幕再还原', [init(), create(0, rect(2, 3, 9, 7)), poke(3 * 0x40, 0x11, 0x180), restore(1)]),
  windowCase('single-cell', '1×1 的窗口', [init(), create(0, rect(5, 5, 5, 5)), poke(5 * 0x40 + 10, 0x99, 2), restore(1)]),
  windowCase('full-screen', '整屏窗口', [init(), create(0, rect(0, 0, 31, 29)), poke(0, 0x21, 0x780), restore(1)]),
  windowCase('sub1', '名称表 1', [init(), create(1, rect(1, 1, 6, 4)), poke(0x800 + 0x40, 0x31, 0x100), restore(1)]),
  windowCase('sub2', '名称表 2（缓冲在页 $FB）', [init(), create(2, rect(4, 6, 20, 12)), poke(0x1000, 0x41, 0x600), restore(1)]),
  windowCase('sub3', '名称表 3', [init(), create(3, rect(0, 28, 31, 29)), poke(0x1800 + 28 * 0x40, 0x51, 0x80), restore(1)]),
  windowCase('lifo', '先进后出：新建三个再倒序还原', [init(), create(0, rect(1, 1, 10, 5)), create(0, rect(4, 3, 14, 8)), create(0, rect(2, 6, 12, 10)), poke(0x40, 0x61, 0x400), restore(3), restore(2), restore(1)]),
  windowCase('fifo', '先进先出：先还原最早的，保存区留下空洞', [init(), create(0, rect(1, 1, 10, 5)), create(0, rect(4, 3, 14, 8)), create(0, rect(2, 6, 12, 10)), restore(1), restore(2), restore(3)]),
  windowCase('middle', '还原中间的窗口，保存区留下空洞，再新建', [init(), create(0, rect(1, 1, 5, 3)), create(0, rect(6, 1, 9, 3)), create(0, rect(10, 1, 14, 3)), restore(2), create(0, rect(0, 10, 3, 12)), restore(4), restore(3), restore(1)]),
  windowCase('id-reuse', '窗口号取最小的空闲号', [init(), create(0, rect(1, 1, 2, 2)), create(0, rect(3, 1, 4, 2)), create(0, rect(5, 1, 6, 2)), restore(2, { full: false }), create(0, rect(7, 1, 8, 2)), restore(1), create(0, rect(9, 1, 10, 2))]),
  windowCase('ids-over-8', '窗口号跨过 8、16、24', [init(), ...many(26, (i) => create(0, rect(i, 0, i, 0), { full: false })), restore(9), restore(17), restore(25), create(0, rect(0, 1, 0, 1)), create(0, rect(1, 1, 1, 1)), create(0, rect(2, 1, 2, 1)), create(0, rect(3, 1, 3, 1))]),
  windowCase('thirty', '新建 30 个窗口后第 31 个返回 $FE', [init(), ...many(31, (i) => create(0, rect(i % 32, Math.floor(i / 8), i % 32, Math.floor(i / 8)), { full: false }))]),
  windowCase('thirty-restore', '30 个窗口再逐个还原', [init(), ...many(30, (i) => create(i & 3, rect(i % 32, i % 29, i % 32, i % 29), { full: false })), ...many(30, (i) => restore(30 - i, { full: false })), create(0, rect(0, 0, 3, 3))]),
  windowCase('heap-full', '保存区装不下返回 $FF，再还原一个后又能装下', [init(), ...many(8, () => create(0, rect(0, 0, 31, 29), { full: false })), create(0, rect(0, 0, 31, 29)), restore(8), create(0, rect(0, 0, 31, 29))]),
  windowCase('heap-edge', '保存区刚好装满到 $BFFF，再装一个 1×1 的返回 $FF', [init(), ...many(8, () => create(0, rect(0, 0, 31, 29), { full: false })), create(0, rect(0, 0, 5, 11)), create(0, rect(0, 0, 0, 0))]),
  windowCase('error-col', '左上列不小于 32 返回 $FD', [init(), create(0, rect(32, 1, 33, 2))]),
  windowCase('error-row', '左上行不小于 30 返回 $FD', [init(), create(0, rect(1, 30, 2, 31))]),
  windowCase('error-col-end', '右下列不小于 32 返回 $FD', [init(), create(0, rect(1, 1, 32, 2))]),
  windowCase('error-row-end', '右下行不小于 30 返回 $FD', [init(), create(0, rect(1, 1, 2, 30))]),
  windowCase('error-col-order', '右下列小于左上列返回 $FD', [init(), create(0, rect(5, 1, 4, 2))]),
  windowCase('error-row-order', '右下行小于左上行返回 $FD', [init(), create(0, rect(1, 5, 2, 4))]),
  windowCase('error-no-change', '出错后窗口表不变', [init(), create(0, rect(2, 2, 3, 3)), create(0, rect(40, 2, 3, 3)), create(0, rect(2, 2, 1, 3)), create(0, rect(1, 1, 2, 2))]),
  windowCase('restore-bad', '还原不存在或越界的窗口号：什么都不做', [init(), create(0, rect(2, 2, 6, 6)), restore(5), restore(0), restore(0x1e), restore(0x1f), restore(0x20), restore(0xff), restore(1)]),
  windowCase('restore-twice', '同一窗口还原两次，第二次什么都不做', [init(), create(0, rect(2, 2, 6, 6)), poke(0x80, 0x71, 0x80), restore(1), restore(1)]),
  windowCase('other-sub', '子功能 7、$80 什么都不做', [init(), create(0, rect(2, 2, 6, 6)), other(7), other(0x80), other(0xff)]),
  windowCase('compact-empty', '没有窗口时整理：保存区末尾回到 $8060', [init(), create(0, rect(2, 2, 6, 6)), restore(1), compact()]),
  windowCase('compact-none', '没有空洞时整理：保持不变', [init(), create(0, rect(1, 1, 4, 3)), create(0, rect(6, 1, 9, 3)), create(0, rect(11, 1, 14, 3)), compact()]),
  windowCase('compact-front', '最早的窗口还原后整理（前面有空洞）', [init(), create(0, rect(1, 1, 4, 3)), create(0, rect(6, 1, 9, 3)), create(0, rect(11, 1, 14, 3)), restore(1), compact(), restore(2), restore(3)]),
  windowCase('compact-middle-same', '中间的窗口还原后整理，三个窗口一样大', [init(), create(0, rect(1, 1, 4, 3)), create(0, rect(6, 1, 9, 3)), create(0, rect(11, 1, 14, 3)), create(0, rect(16, 1, 19, 3)), restore(2), compact(), restore(4), restore(3), restore(1)]),
  windowCase('compact-middle-diff', '中间的窗口还原后整理，窗口大小不同：表里的保存地址按前一个窗口的长度减，与空洞大小不符（之后还原窗口 4 会读到乱数据而不返回，所以只比较整理后的状态）', [init(), create(0, rect(1, 1, 4, 3)), create(0, rect(6, 1, 12, 6)), create(0, rect(11, 8, 14, 9)), create(0, rect(16, 1, 20, 2)), restore(2), compact()]),
  windowCase('compact-front-diff', '最早的窗口还原后整理，窗口大小不同', [init(), create(0, rect(1, 1, 8, 6)), create(0, rect(6, 1, 9, 2)), create(0, rect(11, 8, 20, 12)), restore(1), compact(), restore(2), restore(3)]),
  windowCase('compact-multi', '前面与中间都有空洞后整理', [init(), create(0, rect(0, 0, 3, 3)), create(0, rect(4, 0, 7, 3)), create(0, rect(8, 0, 11, 3)), create(0, rect(12, 0, 15, 3)), create(0, rect(16, 0, 19, 3)), restore(1), restore(3), compact(), restore(2), restore(4), restore(5)]),
  windowCase('compact-big', '保存区跨过多个页时整理', [init(), create(0, rect(0, 0, 31, 29)), create(0, rect(0, 0, 31, 29)), create(0, rect(0, 0, 31, 29)), create(0, rect(0, 0, 31, 29)), restore(1), compact(), restore(2), restore(3), restore(4)]),
  windowCase('compact-full-table', '30 个窗口时整理', [init(), ...many(30, (i) => create(i & 3, rect(i % 32, i % 29, i % 32, i % 29), { full: false })), restore(1, { full: false }), compact()]),
];
