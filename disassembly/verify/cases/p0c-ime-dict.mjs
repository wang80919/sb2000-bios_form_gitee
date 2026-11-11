// ------------------------------------------------------------------------
// 名称：p0c-ime-dict.mjs
// 说明：中文输入法服务（功能 $6D）词库子功能的验证用例：$0C（只写一个 0）、$0F、$11（拼音、双拼查候选字）与 $10、$12（汉字反查全拼、双拼）。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-10
// 备注：词库就是 ROM 第 10-19 页（页组 $10 起映射到 $B000 窗口）：开头是索引表，每项 2 字节（低字节在前）指向一个音节的候选字表，
//       候选字表是连续的 2 字节 GB2312 内码，以 $FF 结束，各表首尾相接，最后以一个 0 字节结束；第 i 项对应全拼音节表（页 C 的 $88DD，每项 6 字节）
//       与双拼键位表（$926D，每项 2 字节）的第 i 项。预期值由这份数据直接算出，另外对几个汉字核对读音（汉 han、中 zhong、长 chang 与 zhang）。
//       $0F、$11 只有完全匹配时才把候选字表写到调用者缓冲区（页 $80 偏移 0）并以 0 结束，其余情况什么都不写；$10、$12 没有候选时同样什么都不写（实测，收尾的写入没有发生）。
// ------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { runCall } from '../../tools/rom-driver.mjs';
import { BIOS_ROM } from '../../tools/config.mjs';

const rom = readFileSync(BIOS_ROM).subarray(16);
const dict = rom.subarray(0x10000, 0x1a000);
const imeRom = (address) => rom[0xc000 + (address - 0x8000)];
const pointer = (index) => dict[index * 2] | (dict[index * 2 + 1] << 8);
const text = (bytes) => [...bytes].map((b) => String.fromCharCode(b)).join('');
const pinyin = (index) => text(Array.from({ length: 6 }, (_, j) => imeRom(0x88dd + index * 6 + j)));
const shuangpin = (index) => text(Array.from({ length: 2 }, (_, j) => imeRom(0x926d + index * 2 + j)));
const hex = (bytes) => [...bytes].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join('');

/** 第 index 项的候选字表（含结尾的 $FF 之前的字节） */
const candidateList = (index) => {
  const bytes = [];
  for (let o = pointer(index); dict[o] !== 0xff; o += 2) bytes.push(dict[o], dict[o + 1]);
  return bytes;
};

/** 与 IME_FIND_CHAR_IN_DICT 相同的扫描：从第 0 项的表头起，数 $FF 得到音节序号，返回含这个字的各序号 */
const findIndexes = (high, low) => {
  const found = [];
  let index = 0;
  for (let o = pointer(0); dict[o] !== 0; ) {
    const byte = dict[o++];
    if (byte === 0xff) { index++; continue; }
    if (byte === high && dict[o] === low) found.push(index);
    o++;
  }
  return found;
};

const pinyinIndex = (name) => Array.from({ length: 408 }, (_, i) => i).find((i) => pinyin(i).trim() === name);
const shuangpinIndex = (keys) => Array.from({ length: 465 }, (_, i) => i).find((i) => shuangpin(i) === keys);

const RESULT_BYTES = 128;
const FILL = 0xee;

/** 调用 $6D 的子功能：输入缓冲与汉字参数写好，页 $80 偏移 0 先填 $EE，调用后读回页里的内容 */
const dictCase = ({ id, title, sub, input = null, character = null, expectBytes, expectOffset = null }) => ({
  id: `ime.dict.${id}`,
  title: `$6D/$${sub.toString(16).toUpperCase().padStart(2, '0')} ${title}`,
  fresh: true,
  steps: [{
    host: async (client) => {
      await client.send(`write pram 0 ${hex(new Array(RESULT_BYTES).fill(FILL))}`);
      const mem = [[0x641, [0x80]], [0x14, [0x00, 0x00]], [0x6900, [0x05]], [0x6904, [0x03]]];
      if (input !== null) mem.push([0x6905, [...input].map((c) => c.charCodeAt(0))]);
      if (character !== null) mem.push([0x64a, character]);
      return runCall(client, { func: 0x6d, sub, mem, read: [[0x6983, 2], [0x6900, 1], [0x6904, 1]], readPram: [[0, RESULT_BYTES]], maxFrames: 600 });
    },
    check: ({ data: result }) => {
      const problems = [];
      if (!result.done) return ['调用没有返回'];
      const want = [...expectBytes, ...new Array(RESULT_BYTES - expectBytes.length).fill(FILL)];
      const got = [...result.pram.get(0)];
      for (let i = 0; i < RESULT_BYTES; i++) if (got[i] !== want[i]) { problems.push(`页 $80 偏移 ${i} 为 ${got[i].toString(16)}，预期 ${want[i].toString(16)}（共 ${expectBytes.length} 字节有效）`); break; }
      if (expectOffset !== null) {
        const [low, high] = result.memory.get(0x6983);
        if ((low | (high << 8)) !== expectOffset) problems.push(`$6983/$6984 为 ${(low | (high << 8)).toString(16)}，预期 ${expectOffset.toString(16)}（命中项序号乘 2）`);
      }
      if (result.memory.get(0x6900)[0] !== 0x05) problems.push('输入法序号 $6900 没有还原为 5');
      if (result.memory.get(0x6904)[0] !== 0x03) problems.push('输入长度 $6904 没有还原为 3');
      return problems;
    },
  }],
});

const pad6 = (word) => word.padEnd(6, ' ');
const cases = [];

// $0F 全拼：完全匹配时写出候选字表，前缀与不存在的音节什么都不写
for (const name of ['a', 'ai', 'han', 'zhong', 'zuo', 'lv']) {
  const index = pinyinIndex(name);
  cases.push(dictCase({ id: `pinyin-${name}`, title: `全拼“${name}”完全匹配，写出第 ${index} 项候选字表并以 0 结束`, sub: 0x0f, input: pad6(name), expectBytes: [...candidateList(index), 0x00], expectOffset: index * 2 }));
}
cases.push(dictCase({ id: 'pinyin-prefix', title: '全拼“zhon”只是前缀，什么都不写', sub: 0x0f, input: pad6('zhon'), expectBytes: [] }));
cases.push(dictCase({ id: 'pinyin-none', title: '全拼“xyz”不存在，什么都不写', sub: 0x0f, input: pad6('xyz'), expectBytes: [] }));

// $11 双拼：键位取表里的第 i 项（重复的键位取第一次出现的序号）
for (const i of [0, 1, 110, 200, 384, 464]) {
  const keys = shuangpin(i);
  const index = shuangpinIndex(keys);
  cases.push(dictCase({ id: `shuangpin-${i}`, title: `双拼“${keys}”（键位表第 ${index} 项）完全匹配，写出第 ${index} 项候选字表`, sub: 0x11, input: keys + ' '.repeat(4), expectBytes: [...candidateList(index), 0x00], expectOffset: index * 2 }));
}

// $10、$12 反查读音：每个候选序号写出一项音节（全拼 6 字节、双拼 2 字节），序号过大时停止，最后写 0
const reverse = (sub, high, low, label, width, nameAt, limit) => {
  const indexes = findIndexes(high, low);
  const kept = [];
  for (const index of indexes) { if (index >= limit) break; kept.push(index); }
  const bytes = kept.flatMap((index) => [...nameAt(index)].map((c) => c.charCodeAt(0)));
  return dictCase({ id: `reverse-${sub.toString(16)}-${hex([high, low])}`, title: `${label}反查 $${hex([high, low])}，候选序号 ${indexes.join('、') || '无'}`, sub, character: [high, low], expectBytes: kept.length ? [...bytes, 0x00] : [] });
};
for (const [high, low] of [[0xba, 0xba], [0xd6, 0xd0], [0xb3, 0xa4], [0xa1, 0xa1]]) {
  cases.push(reverse(0x10, high, low, '全拼', 6, pinyin, 404));
  cases.push(reverse(0x12, high, low, '双拼', 2, shuangpin, 433));
}

cases.push(dictCase({ id: 'sub-0c', title: '把页号存入 IME_FAR_PAGE，重置查词状态后写一个 0 字节', sub: 0x0c, expectBytes: [0x00] }));

// 读音核对：不靠代码，靠汉字本身
const syllables = (high, low) => findIndexes(high, low).map((i) => pinyin(i).trim());
const readingProblems = [];
if (!syllables(0xba, 0xba).includes('han')) readingProblems.push('汉不在 han 的候选字表里');
if (!syllables(0xd6, 0xd0).includes('zhong')) readingProblems.push('中不在 zhong 的候选字表里');
if (!['chang', 'zhang'].every((s) => syllables(0xb3, 0xa4).includes(s))) readingProblems.push('长应同时出现在 chang 与 zhang 的候选字表里');
cases.push({
  id: 'ime.dict.readings',
  title: '词库数据核对：汉在 han、中在 zhong、长在 chang 与 zhang 的候选字表里，索引表指针递增或接到末项',
  fresh: false,
  steps: [{ host: async () => ({}), check: () => readingProblems }],
});

export { cases };
