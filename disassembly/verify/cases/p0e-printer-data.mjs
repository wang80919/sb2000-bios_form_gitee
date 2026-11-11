// ------------------------------------------------------------------------
// 名称：p0e-printer-data.mjs
// 说明：打印机服务（功能 $76-$7A）数据处理类子功能的验证用例：$09 点阵转置、$0A 位展开、$0B 列数据发送、$0C 空列发送（含各变换模式）、$0E、$0F，以及 $77-$7A 与 $76 同一入口、$0391 非 0 时改走页组 $0390。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值来自 verify/lib/printer-model.mjs（按 bios/src/printer/printer-service.asm 转录），核对发往 $4025 的字节序列与 $04A4-$055F 的全部字节。
//       没有覆盖：子功能 $00、$0D 的整页文字打印流程（取字、控制码、换行换页）、一行满（列计数到 $0478）的换行流程、打印机未就绪的出错分支。
// ------------------------------------------------------------------------
import { runCall } from '../../tools/rom-driver.mjs';
import { PrinterModel } from '../lib/printer-model.mjs';

const LPT_DATA = 0x4025;
const REGION_START = 0x4a4;
const REGION_LENGTH = 0x560 - 0x4a4;
const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');

/** 简单的伪随机序列，避开 $1B（ESC）以免虚拟打印机把数据当命令 */
const noise = (seed, length) => {
  let state = seed * 2654435761 >>> 0 || 1;
  return Array.from({ length }, () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    const value = state & 0xff;
    return value === 0x1b ? 0x1c : value;
  });
};

/**
 * 一个数据类用例：写入 $04A4-$055F 与几个参数，按功能号 func 调用 $76-$7A 的子功能 sub，与模型比对发送序列与内存。
 * @param {string} id 用例号
 * @param {string} title 说明
 * @param {number} sub 子功能号
 * @param {{ cells?: Record<number, number>, region?: Record<number, number>, seed?: number, func?: number }} setup 参数单元与区域内的覆盖值
 */
const dataCase = (id, title, sub, setup = {}) => {
  const region = noise(setup.seed ?? sub + 1, REGION_LENGTH);
  for (const [address, value] of Object.entries(setup.region ?? {})) region[Number(address) - REGION_START] = value;
  const cells = { 0x640: 0xaa, 0x646: 0, 0x647: 0, 0x648: 0, 0x649: 0, 0x64a: 0, 0x64e: 0, 0x652: 0, 0x38f: 1, ...setup.cells };
  const memory = new Uint8Array(0x800);
  region.forEach((value, i) => { memory[REGION_START + i] = value; });
  for (const [address, value] of Object.entries(cells)) memory[Number(address)] = value;
  const model = new PrinterModel(memory);
  model.call(sub);
  const reads = [[0x640, 1], [0x646, 4], [0x64e, 1], [0x652, 1], [0x38f, 1]];
  return {
    id: `prn.data.${id}`,
    title: `$${hexName(setup.func ?? 0x76)} 子功能 ${sub}：${title}`,
    fresh: true,
    freshAfter: true,
    steps: [{
      host: (client) => runCall(client, {
        func: setup.func ?? 0x76,
        sub,
        mem: [[REGION_START, region], ...Object.entries(cells).map(([address, value]) => [Number(address), [value]])],
        read: [[REGION_START, REGION_LENGTH], ...reads],
        capture: [LPT_DATA],
        maxFrames: 300,
      }),
      check: ({ data: result }) => {
        const problems = [];
        if (!result.done) return ['调用没有返回'];
        const out = result.writes.get(LPT_DATA);
        if (out.length !== model.out.length) problems.push(`发送了 ${out.length} 个字节，预期 ${model.out.length} 个`);
        for (let i = 0; i < Math.min(out.length, model.out.length) && problems.length < 8; i++) {
          if (out[i] !== model.out[i]) problems.push(`第 ${i} 个字节为 ${hexName(out[i])}，预期 ${hexName(model.out[i])}`);
        }
        const got = result.memory.get(REGION_START);
        for (let i = 0; i < REGION_LENGTH && problems.length < 12; i++) {
          if (got[i] !== model.m[REGION_START + i]) problems.push(`$${(REGION_START + i).toString(16).toUpperCase()} 为 ${hexName(got[i])}，预期 ${hexName(model.m[REGION_START + i])}`);
        }
        for (const [address, length] of reads) {
          const value = result.memory.get(address);
          for (let i = 0; i < length && problems.length < 12; i++) {
            if (value[i] !== model.m[address + i]) problems.push(`$${(address + i).toString(16).toUpperCase().padStart(4, '0')} 为 ${hexName(value[i])}，预期 ${hexName(model.m[address + i])}`);
          }
        }
        return problems;
      },
    }],
  };
};

const cases = [];

// ---- $0C 发送空列，核对各变换模式（$064E 经 $0544 选择）----
const modeNames = ['不变换', '第 3 个字节置低 2 位', '取反', '或 $44', '或 $AA / $80', '或循环左移的 $04B2', '或循环右移的 $04B5', '或 $04B2 与 $04B5', '其他值（8）不变换'];
for (let mode = 0; mode <= 8; mode++) {
  for (const mono of [0, 1, 2]) {
    for (const pass of [0, 1]) {
      for (const end of [0, 1]) {
        if (end === 1 && !(mode === 2 || mode === 5 || mode === 4)) continue;
        cases.push(dataCase(`0c-m${mode}-v${mono}-p${pass}-e${end}`, `变换模式 ${mode}（${modeNames[mode]}），$0647=${mono}，$04B0=${pass}，$04BA=${end}，发 7 组空列`, 0x0c, {
          cells: { 0x64e: mode, 0x647: mono, 0x648: 7 },
          region: { 0x4b0: pass, 0x4b1: 0, 0x4ba: end, 0x4bb: 0, 0x4b2: mode === 7 ? 0xc1 : 0x41, 0x4b5: 0x81, 0x4a8: 0, 0x4a9: 0 },
          seed: mode * 7 + mono * 3 + pass + end,
        }));
      }
    }
  }
}
cases.push(dataCase('0c-m5-rotate-carry', '变换模式 5，$04B2=$C0（循环时位 7 进位，再多移一位）', 0x0c, { cells: { 0x64e: 5, 0x648: 6 }, region: { 0x4b0: 0, 0x4b1: 0, 0x4ba: 0, 0x4bb: 0, 0x4b2: 0xc0, 0x4a8: 0, 0x4a9: 0 } }));
cases.push(dataCase('0c-m6-rotate-carry', '变换模式 6，$04B5=$03', 0x0c, { cells: { 0x64e: 6, 0x648: 6 }, region: { 0x4b0: 0, 0x4b1: 0, 0x4ba: 0, 0x4bb: 0, 0x4b5: 0x03, 0x4a8: 0, 0x4a9: 0 } }));
cases.push(dataCase('0c-m7-rotate-carry', '变换模式 7，$04B2=$80、$04B5=$01', 0x0c, { cells: { 0x64e: 7, 0x648: 6 }, region: { 0x4b0: 0, 0x4b1: 0, 0x4ba: 0, 0x4bb: 0, 0x4b2: 0x80, 0x4b5: 0x01, 0x4a8: 0, 0x4a9: 0 } }));
cases.push(dataCase('0c-zero-loops', '$0648=0：循环计数从 1 数到 255 再回到 0，发 256 组', 0x0c, { cells: { 0x648: 0 }, region: { 0x4b0: 0, 0x4b1: 0, 0x4ba: 0, 0x4bb: 0, 0x4a8: 0, 0x4a9: 0 } }));
cases.push(dataCase('0c-count-carry', '$04BB=$02 时继续计数（每 3 个字节为一周期）', 0x0c, { cells: { 0x648: 4 }, region: { 0x4b0: 0, 0x4b1: 0, 0x4ba: 0, 0x4bb: 2, 0x4a8: 0xf0, 0x4a9: 0x00 } }));

// ---- $0B 发送列数据 ----
for (const mono of [0, 1, 2]) {
  for (let repeat = 0; repeat <= 5; repeat++) {
    for (const wide of [0, 1]) {
      cases.push(dataCase(`0b-v${mono}-r${repeat}-w${wide}`, `$0647=${mono}，$0646=${repeat}，$064A=${wide}：按 3 字节一列发送 $04C4 起的数据`, 0x0b, {
        cells: { 0x646: repeat, 0x647: mono, 0x64a: wide, 0x64e: 0 },
        region: { 0x4b0: 0, 0x4b1: 0, 0x4ba: 0, 0x4bb: 0, 0x4a8: 0, 0x4a9: 0 },
        seed: mono * 17 + repeat * 3 + wide,
      }));
    }
  }
}
for (let mode = 1; mode <= 7; mode++) {
  for (const pass of [0, 1]) {
    for (const mono of [0, 2]) {
      cases.push(dataCase(`0b-m${mode}-p${pass}-v${mono}`, `变换模式 ${mode}，$04B0=${pass}，$0647=${mono}，$0646=1 发送列数据`, 0x0b, {
        cells: { 0x646: 1, 0x647: mono, 0x64a: 0, 0x64e: mode },
        region: { 0x4b0: pass, 0x4b1: 0, 0x4ba: 0, 0x4bb: 0, 0x4b2: 0x41, 0x4b5: 0x81, 0x4a8: 0, 0x4a9: 0 },
        seed: mode * 11 + pass * 5 + mono,
      }));
    }
  }
}

// ---- $0A 位展开 ----
for (const mono of [0, 1]) {
  for (const pass of [0, 1]) {
    for (const seed of [1, 2]) {
      cases.push(dataCase(`0a-v${mono}-p${pass}-s${seed}`, `$0647=${mono}（${mono === 0 ? '每位重复 2 次' : '每位重复 3 次'}），$04B0=${pass}，取 $0524 起的${pass === 0 ? '偶数' : '奇数'}字节`, 0x0a, { cells: { 0x647: mono }, region: { 0x4b0: pass }, seed: seed * 13 + pass }));
    }
  }
}
for (const seed of [1, 2, 3]) {
  cases.push(dataCase(`0a-bitmap-s${seed}`, '$0647=2：把 32 字节字模展开、缩放、合并成 8 组 9 字节的位图', 0x0a, { cells: { 0x647: 2 }, seed: seed * 29 }));
}
cases.push(dataCase('0a-ones', '$0524 起 32 字节全为 $FF：展开后全 1', 0x0a, { cells: { 0x647: 1 }, region: Object.fromEntries(Array.from({ length: 32 }, (_, i) => [0x524 + i, 0xff])) }));
cases.push(dataCase('0a-single-bits', '$0524 起每个字节只有一位，位置依次移动', 0x0a, { cells: { 0x647: 0 }, region: Object.fromEntries(Array.from({ length: 32 }, (_, i) => [0x524 + i, 1 << (i % 8)])) }));

// ---- $09 点阵转置 ----
for (const wide of [0, 1]) {
  for (const seed of [1, 2, 3]) {
    cases.push(dataCase(`09-w${wide}-s${seed}`, `$064A=${wide}：复制 ${wide ? 32 : 16} 字节后按位转置回 $0524 起`, 0x09, { cells: { 0x64a: wide }, seed: seed * 31 }));
  }
}
cases.push(dataCase('09-identity', '$0524 起 16 字节依次为 $80、$40、…（每行一个点），转置后每列一个点', 0x09, { cells: { 0x64a: 0 }, region: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [0x524 + i, 0x80 >> (i % 8)])) }));

// ---- $0F 行距参数表、$0E 初始化并口 ----
for (const choice of [0, 1, 2, 3, 4, 5, 6, 7, 0xff]) {
  cases.push(dataCase(`0f-${hexName(choice)}`, `$0652=${hexName(choice)}：选行距计数的初值写入 $04BC/$04BD`, 0x0f, { cells: { 0x652: choice } }));
}
cases.push(dataCase('0e-first', '$038F 为 0 时初始化并口并置 1', 0x0e, { cells: { 0x38f: 0 } }));
cases.push(dataCase('0e-again', '$038F 为 1 时不再初始化', 0x0e, { cells: { 0x38f: 1 } }));

// ---- $77-$7A 与 $76 同一入口 ----
const fixedBytes = new Map([[1, '1B40'], [2, '1B3C'], [4, '1B4A07'], [7, '41'], [8, '1B2A277804']]);
for (const func of [0x77, 0x78, 0x79, 0x7a]) {
  for (const [sub, bytes] of fixedBytes) {
    cases.push({
      id: `prn.alias.${hexName(func)}-${hexName(sub)}`,
      title: `$${hexName(func)} 子功能 ${sub}：与 $76 同一入口，发送 ${bytes}`,
      func,
      sub,
      mem: [[0x649, [0x07]], [0x4a4, [0x41]]],
      capture: [LPT_DATA],
      expectWrites: [[LPT_DATA, bytes]],
      maxFrames: 3000,
    });
  }
}

// ---- $0391 非 0：改走页组 $0390 的 $8000（这里把 $0390 设成输入法的页组 $0C，调用的就是输入法的子功能）----
for (const func of [0x76, 0x77, 0x78, 0x79, 0x7a]) {
  cases.push({
    id: `prn.reroute.${hexName(func)}`,
    title: `$${hexName(func)}：$0391 非 0 时换入页组 $0390（=$0C）从 $8000 进入，子功能 7 取输入法序号（ERAM $6900 低 4 位）到 $0652`,
    fresh: true,
    freshAfter: true,
    func,
    sub: 7,
    mem: [[0x391, [1]], [0x390, [0x0c]], [0x6900, [0xa7]], [0x652, [0]]],
    expect: [[0x652, [7]]],
    capture: [LPT_DATA],
    expectWrites: [[LPT_DATA, '']],
    maxFrames: 120,
  });
}

export { cases };
