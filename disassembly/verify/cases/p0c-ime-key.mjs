// ------------------------------------------------------------------------
// 名称：p0c-ime-key.mjs
// 说明：中文输入法服务（功能 $6D/$0B）处理一个按键的验证用例：按键队列取键、Alt+F1-F10 选输入法、Ctrl+F1/F8/F9、候选选择、区位码/内码输入（模式 0）、按长度翻页（模式 8）、全角符号转换。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值来自 verify/lib/ime-model.mjs（按 bios/src/input-method/ 转录），逐字节核对 ERAM $6900-$69FF 与按键、区位码相关的 RAM。
//       按键直接写进按键队列（$0336、读写指针 $0342/$0343），不经过键盘硬件；每步只放一个按键。
//       全拼、双拼（输入法 1、2）的按键处理在 p0c-ime-pinyin.mjs，复用这里的 keyCase。
//       没有覆盖：外挂输入法 3-6、联想方式（ERAM $6902 位 0）下的按键、Ctrl+F3 切换联想（要等待按键）。
// ------------------------------------------------------------------------
import { ImeModel } from '../lib/ime-model.mjs';
import { pattern } from './p04-sound-start.mjs';

const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const ERAM_START = 0x6900;
const ERAM_LENGTH = 0x100;
const COMPARE = [0x34b, 0x34c, 0x342, 0x343, 0x640];
/** 区位码解析结果，只有模式 0 的输入用例核对（状态行显示会改动这些单元，所以其他用例不核对） */
const COMPARE_PARSE = [0x64a, 0x64b, 0x69a, 0x69b, 0x69c, 0x69d];
/** 读过词库（全拼、双拼命中音节）的按键步骤还核对词库定位用的 $069A-$069E */
const COMPARE_DICT = [0x69a, 0x69b, 0x69c, 0x69d, 0x69e];

/** 一个按键：ASCII 与扫描码 */
export const ascii = (char) => [char.charCodeAt(0), 0x02];
const scanOnly = (scan) => [0x00, scan];
const NONE = null;

/** 默认状态：输入法 0，没有输入，候选 3 个（B0A1、B0A2、B0A3） */
const defaultEram = (seed) => {
  const eram = pattern(seed, ERAM_LENGTH);
  Object.assign(eram, { 0: 0, 1: 0x00, 2: 0x00, 3: 0, 4: 0, 0x0a: 0, 0x0b: 0, 0x0c: 0, 0x0d: 0, 0x13: 3, 0x0e: 0, 0x0f: 0, 0x10: 0, 0x11: 0, 0x12: 27 });
  [0xb0, 0xa1, 0xb0, 0xa2, 0xb0, 0xa3, 0xb0, 0xa4, 0xb0, 0xa5].forEach((value, i) => { eram[0x14 + i] = value; });
  return eram;
};

/**
 * 一个按键用例：初始状态由 override 指定，keys 里每项是一次调用（null 表示队列为空），模型逐步推进，每步都和模拟器比对。
 * @param {string} id 用例号
 * @param {string} title 说明
 * @param {{ eram?: Record<number, number>, ram?: Record<number, number> }} setup ERAM 偏移与 RAM 地址的初始值
 * @param {Array<number[] | null>} keys 按键序列
 */
export const keyCase = (id, title, setup, keys) => {
  const eram = defaultEram(id.length * 5 + keys.length);
  Object.assign(eram, setup.eram);
  const ram = { 0x640: 0xaa, 0x652: 0, 0x653: 0, 0x64a: 0, 0x64b: 0, 0x392: 0x0f, 0x69a: 0, 0x69b: 0, 0x69c: 0, 0x69d: 0, 0x342: 0, 0x343: 0, 0x34b: 0, 0x34c: 0, ...setup.ram };
  const model = new ImeModel(eram, ram);
  const steps = [{ func: 0x6b, sub: 0x05 }];
  keys.forEach((key, index) => {
    const mem = [];
    if (index === 0) mem.push([ERAM_START, eram], ...Object.entries(ram).map(([address, value]) => [Number(address), [value]]));
    if (key === NONE) {
      model.w(0x342, 0); model.w(0x343, 0);
      mem.push([0x342, [0, 0]]);
    } else {
      model.w(0x336, key[0]); model.w(0x337, key[1]); model.w(0x342, 0); model.w(0x343, 2);
      mem.push([0x336, key], [0x342, [0, 2]]);
    }
    model.sub0b();
    const compare = [...new Set([...COMPARE, ...(model.parsed ? COMPARE_PARSE : []), ...(model.dictUsed ? COMPARE_DICT : [])])];
    const expected = Uint8Array.from(model.e);
    const expectedRam = compare.map((address) => model.r(address));
    steps.push({
      func: 0x6d,
      sub: 0x0b,
      mem,
      read: [[ERAM_START, ERAM_LENGTH], ...compare.map((address) => [address, 1])],
      maxFrames: 120,
      check: (result) => {
        const problems = [];
        if (!result.done) return ['调用没有返回'];
        const got = result.memory.get(ERAM_START);
        const label = key === NONE ? '无键' : `键 ${hexName(key[0])}/${hexName(key[1])}`;
        for (let i = 0; i < ERAM_LENGTH; i++) {
          if (got[i] !== expected[i]) problems.push(`第 ${index + 1} 步（${label}）：$${(ERAM_START + i).toString(16).toUpperCase()} 为 ${hexName(got[i])}，预期 ${hexName(expected[i])}`);
        }
        compare.forEach((address, i) => {
          const value = result.memory.get(address)[0];
          if (value !== expectedRam[i]) problems.push(`第 ${index + 1} 步（${label}）：$${address.toString(16).toUpperCase().padStart(4, '0')} 为 ${hexName(value)}，预期 ${hexName(expectedRam[i])}`);
        });
        return problems.slice(0, 12);
      },
    });
  });
  return { id: `ime.key.${id}`, title: `$6D/$0B ${title}`, fresh: true, steps };
};

const cases = [];

// ---- 取键与按键队列 ----
cases.push(keyCase('empty', '队列为空，不产生输出', {}, [NONE]));
cases.push(keyCase('active-pass', 'ERAM $6902 位 2 置位（输入法暂停）时按键原样传回', { eram: { 2: 0x04 } }, [ascii('a'), scanOnly(0x3b), scanOnly(0x68)]));
cases.push(keyCase('ctrl-f1-pause', 'Ctrl+F1（扫描码 $5E）暂停：位 2 清除时调用 $04，位 2 置位时调用 $03', {}, [scanOnly(0x5e), scanOnly(0x5e)]));

// ---- Alt+F1-F10 选择输入法 ----
for (let n = 0; n < 10; n++) {
  const scan = 0x68 + n;
  cases.push(keyCase(`alt-f${n + 1}`, `Alt+F${n + 1}（扫描码 $${hexName(scan)}）`, { eram: { 1: 0xff, 2: 0x10 } }, [scanOnly(scan)]));
  cases.push(keyCase(`alt-f${n + 1}-denied`, `Alt+F${n + 1}（扫描码 $${hexName(scan)}）允许位缺失时不切换（$0640=1）`, { eram: { 1: 0x00, 2: 0x00 } }, [scanOnly(scan)]));
}
cases.push(keyCase('alt-f9-in-mode8', '输入法 8 时 Alt+F9（$70）：输入长度加 1 并重建候选，连按到 9 后回到 1', { eram: { 0: 8, 1: 0x80, 4: 1 } }, Array.from({ length: 10 }, () => scanOnly(0x70))));
cases.push(keyCase('alt-f9-no-bit7', 'Alt+F9 时 ERAM $6901 位 7 清除，不处理', { eram: { 0: 0, 1: 0x7f } }, [scanOnly(0x70)]));
cases.push(keyCase('alt-f9-switch', '输入法不是 8 时 Alt+F9 切到输入法 8', { eram: { 0: 0, 1: 0x80 } }, [scanOnly(0x70)]));

// ---- Ctrl+F8/F9 切换全角、半角 ----
cases.push(keyCase('ctrl-f8-toggle', 'Ctrl+F8（$65）、Ctrl+F9（$66）：ERAM $6902 位 5 置位时切换全角与半角', { eram: { 2: 0x20 } }, [scanOnly(0x65), scanOnly(0x66), scanOnly(0x65)]));
cases.push(keyCase('ctrl-f8-off', 'Ctrl+F8 位 5 清除时当作普通无字符键', { eram: { 2: 0x00 } }, [scanOnly(0x65)]));
cases.push(keyCase('ctrl-f3-off', 'Ctrl+F3（$60）位 6 清除时当作普通无字符键', { eram: { 2: 0x00 } }, [scanOnly(0x60)]));

// ---- 候选选择 ----
for (const mode of [0, 8, 9, 7]) {
  cases.push(keyCase(`cand-digit-${mode}`, `输入法 ${mode}，已有输入，数字键 1-5 选候选（候选 3 个）`, { eram: { 0: mode, 4: 1, 0x13: 3 } }, ['1', '2', '3', '4', '5'].map(ascii)));
  cases.push(keyCase(`cand-space-${mode}`, `输入法 ${mode}，已有输入，空格选第 1 个候选`, { eram: { 0: mode, 4: 1, 0x13: 3 } }, [ascii(' ')]));
  cases.push(keyCase(`cand-space-none-${mode}`, `输入法 ${mode}，已有输入但没有候选，空格显示提示并清输入`, { eram: { 0: mode, 4: 1, 0x13: 0 } }, [ascii(' ')]));
}
cases.push(keyCase('cand-flag80', 'ERAM $6902 位 7 置位时即使没有输入也能选候选', { eram: { 0: 7, 4: 0, 2: 0x80, 0x13: 3 } }, [ascii('2'), ascii('9')]));
cases.push(keyCase('cand-fkeys', '无字符键 $78-$7C（Alt+1-5）选候选（候选 3 个，ERAM $6902 位 7 清除）', { eram: { 0: 0, 0x13: 3 } }, [0x78, 0x79, 0x7a, 0x7b, 0x7c].map(scanOnly)));
cases.push(keyCase('cand-fkeys-flag13', 'ERAM $6913 位 7 置位时 $78 复制整个候选区', { eram: { 0: 0, 0x13: 0x83 } }, [scanOnly(0x78), scanOnly(0x79)]));

// ---- 回车与退格 ----
for (const mode of [0, 7, 8, 9]) {
  cases.push(keyCase(`enter-${mode}`, `输入法 ${mode}：回车，输入长度非 0 时清输入，为 0 时传回`, { eram: { 0: mode, 4: 2 } }, [ascii('\r'), ascii('\r')]));
  cases.push(keyCase(`backspace-empty-${mode}`, `输入法 ${mode}：没有输入时退格传回`, { eram: { 0: mode, 4: 0 } }, [ascii('\b')]));
}

// ---- 模式 0：区位码与十六进制内码 ----
const typeCode = (text) => [...text].map(ascii);
for (const [text, note] of [
  ['1601', '区位码 16 区 01 位 → B0A1'],
  ['8794', '区位码 87 区 94 位 → F7FE'],
  ['0101', '区位码 01 区 01 位 → A1A1'],
  ['0000', '区位码 00 区 00 位 → A0A0（不合法）'],
  ['9999', '区位码 99 99 → 内码超出范围（不合法）'],
  ['1011', '区位码 10 区 11 位 → AAAB（A9 区以后到 B0 区前，不合法）'],
  ['5589', '区位码 55 区 89 位 → D7F9'],
  ['5590', '区位码 55 区 90 位 → D7FA（超出，不合法）'],
  ['0994', '区位码 09 区 94 位 → A9FE（A9F1 以上，不合法）'],
  ['0993', '区位码 09 区 93 位 → A9FD（不合法）'],
  ['0980', '区位码 09 区 80 位 → A9F0（合法边界）'],
  ['b0a1', '十六进制 B0A1'],
  ['a1a1', '十六进制 A1A1'],
  ['f7fe', '十六进制 F7FE'],
  ['d7fa', '十六进制 D7FA（超出，不合法）'],
  ['a9f1', '十六进制 A9F1（超出，不合法）'],
  ['a9f0', '十六进制 A9F0（合法）'],
  ['b0ff', '十六进制 B0FF（第二字节超范围，不合法）'],
  ['b0a0', '十六进制 B0A0（第二字节不足，不合法）'],
  ['a0a1', '十六进制 A0A1（第一字节不足，不合法）'],
  ['f8a1', '十六进制 F8A1（第一字节超范围，不合法）'],
]) {
  cases.push(keyCase(`mode0-${text}`, `输入法 0 输入 ${note}`, { eram: { 0: 0 } }, typeCode(text)));
}
cases.push(keyCase('mode0-hex-digit-first', '输入法 0：首字符为 a-f 后第三位只接受数字或 a-f，第二位只接受 a-f', { eram: { 0: 0 } }, typeCode('a1g')));
cases.push(keyCase('mode0-hex-letter-third', '输入法 0 十六进制：第 2 位输入字母后，第 3 位可以再输入字母', { eram: { 0: 0 } }, typeCode('ab1f')));
cases.push(keyCase('mode0-dec-letter', '输入法 0 十进制：中途输入字母传回', { eram: { 0: 0 } }, typeCode('12a')));
cases.push(keyCase('mode0-other-first', '输入法 0：没有输入时第一键是其他字符，传回', { eram: { 0: 0 } }, [ascii('x'), ascii('+'), scanOnly(0x3b)]));
cases.push(keyCase('mode0-backspace', '输入法 0：输入 12 后退格两次，再退格传回', { eram: { 0: 0 } }, [...typeCode('12'), ascii('\b'), ascii('\b'), ascii('\b')]));
cases.push(keyCase('mode0-enter-mid', '输入法 0：输入 12 后回车清输入', { eram: { 0: 0 } }, [...typeCode('12'), ascii('\r')]));
cases.push(keyCase('mode0-two-chars', '输入法 0 连续输入两个汉字的区位码', { eram: { 0: 0 } }, [...typeCode('1601'), ...typeCode('b0a2')]));

// ---- 模式 8：按长度翻页浏览候选 ----
for (const [name, eram, keyList] of [
  ['page-up', { 0: 8, 4: 1, 0x0b: 0 }, ['=', '.', '=', '-', ',', '-', '-', '-']],
  ['page-up-len9', { 0: 8, 4: 9, 0x0b: 0 }, Array.from({ length: 18 }, () => '=')],
  ['page-up-len1-limit', { 0: 8, 4: 1, 0x0b: 0x11 }, ['=', '=', '-']],
  ['page-len2', { 0: 8, 4: 2, 0x0b: 3 }, ['=', '-', 'x']],
  ['page-other', { 0: 8, 4: 3, 0x0b: 0 }, ['x', '1', 'a', ' ']],
]) {
  cases.push(keyCase(`mode8-${name}`, `输入法 8 翻页：${name}`, { eram }, keyList.map(ascii)));
}

// ---- 全角符号转换 ----
const printable = Array.from({ length: 0x5f }, (_, i) => 0x20 + i);
const toKeys = (codes) => codes.map((code) => [code, 0x02]);
cases.push(keyCase('fullwidth-mode7-a', '全角（ERAM $6902 位 1）：输入法 7（直通）下 $20-$4F 的键换成全角内码（含 [ ] { } " \' 成对符号轮流取左右）', { eram: { 0: 7, 2: 0x02 } }, toKeys(printable.slice(0, 0x30))));
cases.push(keyCase('fullwidth-mode7-b', '全角：输入法 7 下 $50-$7E 的键', { eram: { 0: 7, 2: 0x02 } }, toKeys(printable.slice(0x30))));
cases.push(keyCase('fullwidth-pairs', '全角：成对符号（[ ] { } " \'）连按两次，奇数次取左、偶数次取右', { eram: { 0: 7, 2: 0x02 } }, toKeys([0x5b, 0x5b, 0x5d, 0x5d, 0x7b, 0x7b, 0x7d, 0x7d, 0x22, 0x22, 0x27, 0x27, 0x2f, 0x2f, 0x2e, 0x2e, 0x2a, 0x5c, 0x7c])));
cases.push(keyCase('fullwidth-mode9-a', '全角：输入法 9（英文）下全部符号取全角表', { eram: { 0: 9, 2: 0x02 } }, toKeys(printable.slice(0, 0x30))));
cases.push(keyCase('fullwidth-mode9-b', '全角：输入法 9 下 $50-$7E 的键', { eram: { 0: 9, 2: 0x02 } }, toKeys(printable.slice(0x30))));
cases.push(keyCase('fullwidth-high-ascii', '全角：ASCII 不小于 $80 的键不转换', { eram: { 0: 7, 2: 0x02 } }, toKeys([0x80, 0xb0, 0xff])));
cases.push(keyCase('fullwidth-scan-only', '全角：无字符键（ASCII 为 0）也查表，查不到时保持传回内容', { eram: { 0: 7, 2: 0x02 } }, [scanOnly(0x3b), scanOnly(0x48)]));

/**
 * $6D/$0A 等待并处理按键：反复调用 $0B 直到 ERAM $6922 不为 0。队列里一次放好全部按键，最后一个按键必须让 $6922 不为 0，否则会一直等下去。
 * @param {string} id 用例号
 * @param {string} title 说明
 * @param {{ eram?: Record<number, number> }} setup 初始状态
 * @param {number[][]} keys 队列里的按键（最多 5 个）
 */
const waitCase = (id, title, setup, keys) => {
  const eram = defaultEram(id.length * 3 + keys.length);
  Object.assign(eram, setup.eram);
  const ram = { 0x640: 0xaa, 0x652: 0, 0x653: 0, 0x392: 0x0f, 0x342: 0, 0x343: keys.length * 2, 0x34b: 0, 0x34c: 0 };
  const model = new ImeModel(eram, ram);
  const queue = keys.flat();
  queue.forEach((value, i) => model.w(0x336 + i, value));
  let rounds = 0;
  do { model.sub0b(); rounds++; } while (model.e[0x22] === 0 && rounds <= keys.length);
  if (model.e[0x22] === 0) throw new Error(`用例 ${id} 的按键没有让 $6922 变为非 0`);
  const expected = Uint8Array.from(model.e);
  const expectedRam = COMPARE.map((address) => model.r(address));
  return {
    id: `ime.key.${id}`,
    title: `$6D/$0A ${title}`,
    fresh: true,
    steps: [
      { func: 0x6b, sub: 0x05 },
      {
        func: 0x6d,
        sub: 0x0a,
        mem: [[ERAM_START, eram], [0x336, queue], [0x342, [0, keys.length * 2]], [0x392, [0x0f]]],
        read: [[ERAM_START, ERAM_LENGTH], ...COMPARE.map((address) => [address, 1])],
        maxFrames: 240,
        check: (result) => {
          if (!result.done) return ['调用没有返回'];
          const problems = [];
          const got = result.memory.get(ERAM_START);
          for (let i = 0; i < ERAM_LENGTH; i++) {
            if (got[i] !== expected[i]) problems.push(`$${(ERAM_START + i).toString(16).toUpperCase()} 为 ${hexName(got[i])}，预期 ${hexName(expected[i])}`);
          }
          COMPARE.forEach((address, i) => {
            const value = result.memory.get(address)[0];
            if (value !== expectedRam[i]) problems.push(`$${address.toString(16).toUpperCase().padStart(4, '0')} 为 ${hexName(value)}，预期 ${hexName(expectedRam[i])}`);
          });
          return problems.slice(0, 12);
        },
      },
    ],
  };
};

cases.push(waitCase('wait-first', '第一个按键就有结果（输入法 7 直通）', { eram: { 0: 7 } }, [ascii('a')]));
cases.push(waitCase('wait-skip', '输入法 0 先收到数字（只累计输入，$6922 仍为 0），再收到字母（传回）：处理了两个按键', { eram: { 0: 0 } }, [ascii('1'), ascii('x')]));
cases.push(waitCase('wait-code', '输入法 0 输入四位区位码，第四个按键后输出汉字', { eram: { 0: 0 } }, [ascii('1'), ascii('6'), ascii('0'), ascii('1')]));
cases.push(waitCase('wait-empty-keys', '队列里先有 Ctrl+F1（暂停，$6922 为 0）再有普通键', { eram: { 0: 7 } }, [scanOnly(0x5e), ascii('b')]));

export { cases };
