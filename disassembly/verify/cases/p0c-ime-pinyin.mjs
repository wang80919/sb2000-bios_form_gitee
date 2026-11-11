// ------------------------------------------------------------------------
// 名称：p0c-ime-pinyin.mjs
// 说明：中文输入法服务（功能 $6D/$0B）在全拼（输入法 1）、双拼（输入法 2）下处理按键的验证用例。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-10
// 备注：预期值来自 verify/lib/ime-model.mjs 的 pinyinKey 等（按 IME_KEY_PINYIN、IME_TABLE_LOOKUP、IME_LOAD_CANDIDATES 转录，词库直接读 ROM 第 10-1B 页），
//       逐步核对 ERAM $6900-$69FF 与 $069A-$069E、$034B/$034C、$0640。用例由 p0c-ime-key.mjs 的 keyCase 驱动，按键直接写进按键队列。
//       覆盖：输入串逐字符追加与前缀匹配、完全匹配读候选字、翻页、数字与空格选字、下一个字母使输入串无匹配时自动输出第 1 个候选字并重新开始、输入过长、非字母键、退格；
//       “全部全拼音节（408 个）与双拼键位（465 个）逐个输入并选字”分成若干组扫描。
//       IME_KEY_PINYIN 里“输入串非空且有候选字时空格输出第 1 个候选字”这一支不会被执行到：按键流程在到达这里之前，空格已经由通用的候选字选择处理（用例 space-* 给出这一结果）。
// ------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { BIOS_ROM } from '../../tools/config.mjs';
import { ascii, keyCase } from './p0c-ime-key.mjs';

const rom = readFileSync(BIOS_ROM).subarray(16);
const imeRom = (address) => rom[0xc000 + (address - 0x8000)];
const text = (base, index, length) => Array.from({ length }, (_, j) => String.fromCharCode(imeRom(base + index * length + j))).join('');
const PINYIN_COUNT = 408;
const SHUANGPIN_COUNT = 465;
const pinyin = (index) => text(0x88dd, index, 6).trimEnd();
const shuangpin = (index) => text(0x926d, index, 2).trimEnd();

const type = (word) => [...word].map(ascii);
const setup = (mode, extra = {}) => ({ eram: { 0: mode, 4: 0, 0x13: 0, 0x0b: 0, 0x0c: 0, 3: 0, ...extra }, ram: { 0x69e: 0 } });
const cases = [];

// ---- 全拼 ----
const full = setup(1);
cases.push(keyCase('pinyin-han', '全拼：依次输入 h、a、n（前缀、完全匹配、完全匹配），再用数字 1、2 选字', full, [...type('han'), ascii('1'), ...type('han'), ascii('2')]));
cases.push(keyCase('pinyin-space', '全拼：输入完整音节后空格选第 1 个候选字；只输入前缀时空格不选', full, [...type('han'), ascii(' '), ...type('zh'), ascii(' ')]));
cases.push(keyCase('pinyin-digit-over', '全拼：数字超过候选字个数时当作无匹配的字符传回，输入串保持', full, [...type('a'), ascii('5'), ascii('9'), ascii('0')]));
cases.push(keyCase('pinyin-page', '全拼：候选字很多的音节用 = . 翻下一页、- , 翻上一页，到头后不再翻', full, [...type('shi'), ...'==..-,--,-'.split('').map(ascii), ascii('3')]));
cases.push(keyCase('pinyin-page-select', '全拼：翻页后用数字选字', full, [...type('yi'), ascii('='), ascii('='), ascii('2')]));
cases.push(keyCase('pinyin-auto-commit', '全拼：输入 han 后再输入 x，“hanx”不是任何音节的前缀，自动输出第 1 个候选字并以 x 重新开始', full, [...type('hanx'), ascii('i'), ascii('a')]));
cases.push(keyCase('pinyin-auto-commit-none', '全拼：前缀无候选字时再输入使无匹配的字母，只丢掉这个字母', full, [...type('zh'), ascii('x'), ascii('z')]));
cases.push(keyCase('pinyin-too-long', '全拼：输入串比 6 个字符长时查表直接无匹配', full, [...type('zhonggu'), ascii('o')]));
cases.push(keyCase('pinyin-max-length', '全拼：6 个字符的音节（zhuang、chuang、shuang）完全匹配', full, [...type('zhuang'), ascii('1'), ...type('chuang'), ascii('1'), ...type('shuang'), ascii('1')]));
cases.push(keyCase('pinyin-non-letter-first', '全拼：没有输入时第一键不是小写字母，原样传回', full, [ascii('1'), ascii('5'), ascii(';'), ascii(','), ascii('='), ascii('H'), ascii('-'), ascii('\''), [0x00, 0x3b]]));
cases.push(keyCase('pinyin-non-letter-mid', '全拼：输入中途的非小写字母键（大写、符号）无匹配，原样传回并丢掉', full, [...type('ha'), ascii('H'), ascii(';'), ascii('\''), ascii('8'), ascii('n')]));
cases.push(keyCase('pinyin-backspace', '全拼：输入 zhong 后逐个退格到空，再退格（空输入）传回', full, [...type('zhong'), ...Array.from({ length: 6 }, () => ascii('\b'))]));
cases.push(keyCase('pinyin-backspace-retype', '全拼：退格后换一个字母继续输入', full, [...type('han'), ascii('\b'), ascii('\b'), ...type('ao'), ascii('1')]));
cases.push(keyCase('pinyin-enter', '全拼：输入中途回车清输入，空输入回车传回', full, [...type('han'), ascii('\r'), ascii('\r')]));
cases.push(keyCase('pinyin-flags80', '全拼：ERAM $6902 位 7 置位时数字键也先走选字，字母输入照常', setup(1, { 2: 0x80 }), [...type('han'), ascii('1'), ascii('2'), ...type('a')]));
cases.push(keyCase('pinyin-fullwidth', '全拼：全角（ERAM $6902 位 1）时输出汉字与传回的符号', setup(1, { 2: 0x02 }), [...type('han'), ascii('1'), ascii(','), ascii('.'), ...type('zhong'), ascii('3')]));
cases.push(keyCase('pinyin-paused', '全拼：输入法暂停（ERAM $6902 位 2）时按键原样传回', setup(1, { 2: 0x04 }), type('han')));
cases.push(keyCase('pinyin-fkeys', '全拼：音节输入后用 Alt+1-5（$78-$7C）选字', full, [...type('han'), [0x00, 0x78], ...type('han'), [0x00, 0x7a], ...type('han'), [0x00, 0x7c]]));
cases.push(keyCase('pinyin-pending-state', '全拼：已有候选字、页序号等旧状态时输入新的首字母', setup(1, { 4: 0, 0x13: 4, 0x0b: 3, 0x0c: 1, 3: 0xc0 }), [...type('ha'), ascii('1')]));

// ---- 双拼 ----
const double = setup(2);
cases.push(keyCase('shuangpin-first', '双拼：键位表第 0 项与第 1 项逐键输入并选字', double, [...type(shuangpin(0)), ascii('1'), ...type(shuangpin(1)), ascii('1')]));
cases.push(keyCase('shuangpin-single', '双拼：单个字母 a、b（表中“a ”这类单字母项）与前缀', double, [...type('a'), ascii('1'), ...type('b'), ascii('2'), ...type('j'), ascii('1')]));
cases.push(keyCase('shuangpin-too-long', '双拼：输入串超过 2 个字符时查表无匹配，自动输出第 1 个候选字并重新开始', double, [...type(shuangpin(100)), ...type('k'), ascii('1')]));
cases.push(keyCase('shuangpin-semicolon', '双拼：分号键参与键位（如 l;、j;）', double, [...type('l;'), ascii('1'), ...type('j;'), ascii('1'), ascii(';'), ascii('l')]));
const shi = Array.from({ length: PINYIN_COUNT }, (_, i) => i).find((i) => pinyin(i) === 'shi');
cases.push(keyCase('shuangpin-page', '双拼：候选字很多的键位（与全拼 shi 同序号）用 = . - , 翻页', double, [...type(shuangpin(shi)), ...'==..-,--,-'.split('').map(ascii), ascii('3')]));
cases.push(keyCase('shuangpin-non-letter', '双拼：非字母键与大写字母传回，输入中途也丢弃', double, [ascii('1'), ascii('H'), ...type('j'), ascii('H'), ascii('5'), ascii('x')]));
cases.push(keyCase('shuangpin-backspace', '双拼：输入两键后退格', double, [...type(shuangpin(200)), ascii('\b'), ascii('\b'), ascii('\b')]));

// ---- 全部音节扫描：每个音节输入后换一种方式选字（空格、数字 1、翻页后空格、数字 5 后空格） ----
const finish = (i) => [[ascii(' ')], [ascii('1')], [ascii('='), ascii(' ')], [ascii('5'), ascii(' ')]][i % 4];
const sweep = (prefix, label, count, name, groupSize) => {
  for (let start = 0; start < count; start += groupSize) {
    const keys = [];
    const end = Math.min(start + groupSize, count);
    for (let i = start; i < end; i++) keys.push(...type(name(i)), ...finish(i));
    cases.push(keyCase(`${prefix}-${String(start).padStart(3, '0')}`, `${label}第 ${start}-${end - 1} 项逐个输入并选字（${end - start} 个）`, label === '全拼' ? full : double, keys));
  }
};
sweep('pinyin-sweep', '全拼', PINYIN_COUNT, pinyin, 24);
sweep('shuangpin-sweep', '双拼', SHUANGPIN_COUNT, shuangpin, 24);

export { cases };
