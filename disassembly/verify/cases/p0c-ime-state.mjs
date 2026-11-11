// ------------------------------------------------------------------------
// 名称：p0c-ime-state.mjs
// 说明：中文输入法服务（功能 $6D）状态类子功能的验证用例：$00 初始化、$01 选择输入法、$02-$09 设置与取回状态、状态行文字。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值来自 verify/lib/ime-model.mjs（按 bios/src/input-method/ 转录），逐字节核对 ERAM $6900-$69FF 与相关 RAM（$0640、$0652、$0653、$0392）。
//       状态行显示调用功能 $45 画屏幕，屏幕内容与 $036E/$036F 这类会被它改动的临时单元不在这里核对。
// ------------------------------------------------------------------------
import { runCall } from '../../tools/rom-driver.mjs';
import { ImeModel } from '../lib/ime-model.mjs';
import { pattern } from './p04-sound-start.mjs';

const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const ERAM_START = 0x6900;
const ERAM_LENGTH = 0x100;

/**
 * 一个状态类用例：先写入 ERAM 与 RAM 的初始值，调用 $6D 的子功能，再与模型逐字节比对。
 * @param {string} id 用例号
 * @param {string} title 说明
 * @param {number} sub 子功能号
 * @param {{ eram?: (e: number[]) => void, ram?: Record<number, number>, compare?: number[] }} setup 初始值与要额外比对的 RAM 地址
 */
const stateCase = (id, title, sub, setup = {}) => {
  const eram = pattern(sub * 7 + 3, ERAM_LENGTH);
  // 状态行位置与颜色用合法值：行 27，瓦片起点 0，子功能 0，颜色 0
  Object.assign(eram, { 0x0e: 0, 0x0f: 0, 0x10: 0, 0x11: 0, 0x12: 27 });
  setup.eram?.(eram);
  const ram = { 0x640: 0xaa, 0x652: 0, 0x653: 0, 0x392: 0, ...setup.ram };
  const model = new ImeModel(eram, ram);
  model[`sub${(setup.modelSub ?? sub).toString(16).padStart(2, '0')}`]();
  const compare = setup.compare ?? [];
  return {
    id: `ime.state.${id}`,
    title: `$6D/$${hexName(sub)} ${title}`,
    fresh: true,
    steps: [{
      host: (client) => runCall(client, {
        func: 0x6d,
        sub,
        mem: [[ERAM_START, eram], ...Object.entries(ram).map(([address, value]) => [Number(address), [value]]), [0x69a, [ram[0x69a] ?? 0, ram[0x69b] ?? 0, ram[0x69c] ?? 0, ram[0x69d] ?? 0, ram[0x69e] ?? 0, ram[0x69f] ?? 0, ram[0x6a0] ?? 0, ram[0x6a1] ?? 0]]],
        read: [[ERAM_START, ERAM_LENGTH], ...compare.map((address) => [address, 1])],
        maxFrames: 120,
      }),
      check: ({ data: result }) => {
        const problems = [];
        if (!result.done) { problems.push('调用没有返回'); return problems; }
        const got = result.memory.get(ERAM_START);
        for (let i = 0; i < ERAM_LENGTH; i++) {
          if (got[i] !== model.e[i]) problems.push(`$${(ERAM_START + i).toString(16).toUpperCase()} 为 ${hexName(got[i])}，预期 ${hexName(model.e[i])}`);
        }
        for (const address of compare) {
          const value = result.memory.get(address)[0];
          if (value !== model.r(address)) problems.push(`$${address.toString(16).toUpperCase().padStart(4, '0')} 为 ${hexName(value)}，预期 ${hexName(model.r(address))}`);
        }
        return problems.slice(0, 12);
      },
    }],
  };
};

/** 子功能 $00 的输入：$069A-$069E 是状态行位置与颜色，$069F 是输入法序号，$06A0/$06A1 是允许位与状态位 */
const initParams = (mode, ram = {}) => ({ 0x69a: 27, 0x69b: 0, 0x69c: 0, 0x69d: 0, 0x69e: 0, 0x69f: mode, 0x6a0: 0xff, 0x6a1: 0x00, ...ram });

const initCases = [0, 1, 2, 8, 9, 10, 0x80, 0xff].map((mode) => stateCase(`init-${hexName(mode)}`, `初始化，输入法序号 $${hexName(mode)}`, 0x00, {
  ram: initParams(mode, { 0x392: 0x0f }),
  compare: [0x640],
}));
initCases.push(stateCase('init-3-allowed', '初始化，序号 3，$0392 位 0 置位', 0x00, { ram: initParams(3, { 0x392: 0x01 }), compare: [0x640] }));
initCases.push(stateCase('init-3-denied', '初始化，序号 3，$0392 位 0 清除（失败，$0640=1，状态仍已写入）', 0x00, { ram: initParams(3, { 0x392: 0x00 }), compare: [0x640] }));
initCases.push(stateCase('init-7-denied', '初始化，序号 7 不可选（$0640=1）', 0x00, { ram: initParams(7, { 0x392: 0x0f }), compare: [0x640] }));
initCases.push(stateCase('init-6-caption', '初始化，序号 6 的状态行文字取 ERAM $697D', 0x00, { ram: initParams(6, { 0x392: 0x08 }), compare: [0x640] }));
initCases.push(stateCase('init-active', '初始化，ERAM $6902 位 2 置位时不重画状态行', 0x00, { ram: initParams(1, { 0x6a1: 0x04 }), compare: [0x640] }));
initCases.push(stateCase('init-8-active', '初始化，序号 8 且 ERAM $6902 位 2 置位', 0x00, { ram: initParams(8, { 0x6a1: 0x04 }), compare: [0x640] }));

/** 子功能 $01：$0652 低 4 位是输入法序号，位 7 置位时核对 ERAM $6901 的允许位 */
const selectCases = [];
for (let mode = 0; mode < 12; mode++) {
  selectCases.push(stateCase(`select-${hexName(mode)}`, `选择序号 $${hexName(mode)}（$0392=$0F）`, 0x01, { ram: { 0x652: mode, 0x392: 0x0f }, compare: [0x640] }));
}
for (const [mode, bit] of [[3, 1], [4, 2], [5, 4], [6, 8]]) {
  selectCases.push(stateCase(`select-${hexName(mode)}-no-bit`, `选择序号 ${mode}，$0392 位 ${Math.log2(bit)} 清除（失败）`, 0x01, { ram: { 0x652: mode, 0x392: 0x0f & ~bit }, compare: [0x640] }));
}
for (let mode = 0; mode < 10; mode++) {
  const wanted = [0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0xff, 0xff, 0x80, 0x01][mode];
  const eramOn = (e) => { e[1] = wanted === 0xff ? 0x00 : wanted; e[2] = wanted === 0xff ? e[2] | 0x10 : e[2] & ~0x10; };
  const eramOff = (e) => { e[1] = wanted === 0xff ? 0xff : ~wanted & 0xff; e[2] = e[2] & ~0x10; };
  selectCases.push(stateCase(`select-opt-${hexName(mode)}-on`, `选择序号 ${mode}，位 7 置位且允许位存在`, 0x01, { eram: eramOn, ram: { 0x652: mode | 0x80, 0x392: 0x0f }, compare: [0x640] }));
  selectCases.push(stateCase(`select-opt-${hexName(mode)}-off`, `选择序号 ${mode}，位 7 置位且允许位缺失（失败）`, 0x01, { eram: eramOff, ram: { 0x652: mode | 0x80, 0x392: 0x0f }, compare: [0x640] }));
}
selectCases.push(stateCase('select-8-high-nibble', '选择序号 8，ERAM $6900 高 4 位非 0 时不走候选分支', 0x01, { eram: (e) => { e[0] = 0x30; }, ram: { 0x652: 8, 0x392: 0x0f }, compare: [0x640] }));
selectCases.push(stateCase('select-8-active', '选择序号 8，ERAM $6902 位 2 置位', 0x01, { eram: (e) => { e[2] |= 0x04; }, ram: { 0x652: 8, 0x392: 0x0f }, compare: [0x640] }));
selectCases.push(stateCase('select-8-clear-bit2', '选择序号 8，ERAM $6902 位 2 清除', 0x01, { eram: (e) => { e[2] &= ~0x04; e[0] = 0x00; }, ram: { 0x652: 8, 0x392: 0x0f }, compare: [0x640] }));
selectCases.push(stateCase('select-9-active', '选择序号 9，ERAM $6902 位 2 置位', 0x01, { eram: (e) => { e[2] |= 0x04; }, ram: { 0x652: 9, 0x392: 0x0f }, compare: [0x640] }));
selectCases.push(stateCase('select-9-clear-bit2', '选择序号 9，ERAM $6902 位 2 清除，复制 $6961 起 24 字节', 0x01, { eram: (e) => { e[2] &= ~0x04; }, ram: { 0x652: 9, 0x392: 0x0f }, compare: [0x640] }));

/** 其他子功能 */
const otherCases = [
  stateCase('02-a', '设置状态（$0652=$5A、$0653=$C3，ERAM $6902 位 7 置位）', 0x02, { eram: (e) => { e[2] = 0xff; }, ram: { 0x652: 0x5a, 0x653: 0xc3 } }),
  stateCase('02-b', '设置状态（$0652=$00、$0653=$7F，ERAM $6902 位 7 清除）', 0x02, { eram: (e) => { e[2] = 0x7f; }, ram: { 0x652: 0x00, 0x653: 0x7f } }),
  stateCase('03-set', '清除 ERAM $6902 位 2 并重画（位 2 原为置位）', 0x03, { eram: (e) => { e[2] |= 0x04; } }),
  stateCase('03-clear', 'ERAM $6902 位 2 本来清除时不改动', 0x03, { eram: (e) => { e[2] &= ~0x04; } }),
  stateCase('04-clear', '清候选数，位 2 清除时重画并置位', 0x04, { eram: (e) => { e[2] &= ~0x04; e[0x13] = 4; } }),
  stateCase('04-set', '清候选数，位 2 置位时直接返回', 0x04, { eram: (e) => { e[2] |= 0x04; e[0x13] = 4; } }),
  stateCase('05', '状态行文字“半角”，位 1 清除', 0x05, { eram: (e) => { e[2] |= 0x02; } }),
  stateCase('06', '状态行文字“全角”，位 1 置位', 0x06, { eram: (e) => { e[2] &= ~0x02; } }),
  stateCase('07', '取当前输入法序号（ERAM $6900=$A7 → $0652=7）', 0x07, { eram: (e) => { e[0] = 0xa7; }, compare: [0x652] }),
  stateCase('08', '取状态（ERAM $6901=$5C、$6902=$F3 → $0652=$5C、$0653=$73）', 0x08, { eram: (e) => { e[1] = 0x5c; e[2] = 0xf3; }, compare: [0x652, 0x653] }),
  stateCase('09', '保存 $069A 起 5 字节并显示输入法说明，$0392 位 3 与 ERAM $6902 位 4 置位', 0x09, { ram: { 0x69a: 0x01, 0x69b: 0x02, 0x69c: 0x03, 0x69d: 0x04, 0x69e: 0x05, 0x392: 0x01 }, compare: [0x392] }),
];

/**
 * 子功能 $13-$24：把子功能 1-6 转发给外挂输入法模块 1-3（页组在 ERAM $6979-$697B）。
 * 把三个页组都设成 $0C（输入法自己所在的页组），转发后进入的就是本模块的子功能 1-6，效果应与直接调用 $01-$06 相同。
 */
const extCases = [];
for (let module = 0; module < 3; module++) {
  for (let k = 1; k <= 6; k++) {
    const sub = 0x13 + module * 6 + (k - 1);
    const eram = (e) => { e[0x79] = 0x0c; e[0x7a] = 0x0c; e[0x7b] = 0x0c; if (k === 3 || k === 4) e[2] |= 0x04; };
    const ram = k === 1 ? { 0x652: 5, 0x392: 0x0f } : {};
    extCases.push(stateCase(`ext${module + 1}-${k}`, `转发给外挂输入法模块 ${module + 1} 的子功能 ${k}（页组 $0C 指向本模块，效果同 $0${k}）`, sub, { eram, ram, modelSub: k, compare: k === 1 ? [0x640] : [] }));
  }
}

export const cases = [...initCases, ...selectCases, ...otherCases, ...extCases];
