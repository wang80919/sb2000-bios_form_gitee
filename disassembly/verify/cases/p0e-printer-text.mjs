// ------------------------------------------------------------------------
// 名称：p0e-printer-text.mjs
// 说明：打印机服务子功能 $00、$0D（整段文字打印）的验证用例：西文文字、回车换行、两种结束方式、字宽倍率、点阵位图模式、变换模式、行满换行、页长计数。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值来自 verify/lib/printer-job-model.mjs（按 bios/src/printer/printer-service.asm 转录），核对发往 $4025 的全部字节与 $04A4-$055F 的全部字节；文字放在扩展 RAM 页 $80。
//       没有覆盖：控制码 $80-$9F（字体、倍率、行距等设置）、汉字、打印机未就绪的出错分支。
// ------------------------------------------------------------------------
import { runCall } from '../../tools/rom-driver.mjs';
import { PrintJobModel } from '../lib/printer-job-model.mjs';

const LPT_DATA = 0x4025;
const REGION_START = 0x4a4;
const REGION_LENGTH = 0x560 - 0x4a4;
const TEXT_PAGE = 0x80;
const TEXT_OFFSET = 0x100;
const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const ascii = (text) => [...text].map((char) => char.charCodeAt(0));
const pattern = (seed, length) => Array.from({ length }, (_, i) => (i * 13 + seed) & 0xff);

/**
 * 一个整段打印用例。
 * @param {string} id 用例号
 * @param {string} title 说明
 * @param {number[]} text 文字字节（含结束符）
 * @param {{ sub?: number, cells?: Record<number, number>, region?: Record<number, number> }} setup 参数单元（$0646 字宽、$0647 点数、$0648 附加列、$0649 行距、$064E 变换模式、$064F 长度）与 $04A4 起区域的覆盖值
 */
const textCase = (id, title, text, setup = {}) => {
  const sub = setup.sub ?? 0;
  const region = pattern(id.length, REGION_LENGTH);
  Object.assign(region, { [0x4bc - REGION_START]: 0x07, [0x4bd - REGION_START]: 0x6c });
  for (const [address, value] of Object.entries(setup.region ?? {})) region[Number(address) - REGION_START] = value;
  const cells = { 0x640: 0xaa, 0x641: TEXT_PAGE, 0x646: 0, 0x647: 0, 0x648: 0, 0x649: 0, 0x64a: 0x11, 0x64b: 0x22, 0x64e: 0, 0x64f: 0, 0x652: 0, 0x38f: 1, ...setup.cells };
  const memory = new Uint8Array(0x800);
  region.forEach((value, i) => { memory[REGION_START + i] = value; });
  for (const [address, value] of Object.entries(cells)) memory[Number(address)] = value;
  const model = new PrintJobModel(memory, { page: TEXT_PAGE, offset: TEXT_OFFSET, text });
  model.call(sub);
  const reads = [[0x640, 1], [0x646, 4], [0x64a, 2], [0x64e, 2], [0x652, 2], [0x38f, 1], [0x641, 1]];
  const pramOffset = (TEXT_PAGE - 0x80) * 0x1000 + TEXT_OFFSET;
  return {
    id: `prn.text.${id}`,
    title: `$76 子功能 ${sub}：${title}`,
    fresh: true,
    freshAfter: true,
    steps: [{
      host: async (client) => {
        const bytes = [...text, ...new Array(64).fill(0)];
        await client.send(`write pram ${pramOffset.toString(16)} ${bytes.map(hexName).join('').toLowerCase()}`);
        return runCall(client, {
          func: 0x76,
          sub,
          mem: [[0x14, [TEXT_OFFSET & 0xff, TEXT_OFFSET >> 8]], [REGION_START, region], ...Object.entries(cells).map(([address, value]) => [Number(address), [value]])],
          read: [[REGION_START, REGION_LENGTH], ...reads],
          capture: [LPT_DATA],
          maxFrames: 20000,
        });
      },
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

const cases = [
  textCase('one-char', '一个字符 "A"，以 $00 结束', [...ascii('A'), 0]),
  textCase('word', '"Hello" 以 $00 结束', [...ascii('Hello'), 0]),
  textCase('terminator-ff', '"Hi" 以 $FF 结束', [...ascii('Hi'), 0xff], { cells: { 0x64f: 0xff } }),
  textCase('length-mode', '按长度 5 打印 "Hello"', ascii('Hello'), { cells: { 0x64f: 5 } }),
  textCase('length-two-lines', '按长度 5 打印 "AB" 回车换行 "CDEFG"：换行后长度计数重新从 5 数起（回车换行只算 1 个字节），所以第二行打满 5 个字符', [...ascii('AB'), 0x0d, 0x0a, ...ascii('CDEFG')], { cells: { 0x64f: 5 } }),
  textCase('length-zero-text', '空文字（第一个字节就是结束符）', [0]),
  textCase('space-and-7f', '空格与 $7F（当空格）', [0x41, 0x20, 0x7f, 0x42, 0]),
  textCase('two-lines', '两行 "AB"、"CD"（回车换行分行），以 $00 结束', [...ascii('AB'), 0x0d, 0x0a, ...ascii('CD'), 0]),
  textCase('cr-only', '回车后不是换行：回车被吃掉，后一个字符照常打印', [...ascii('A'), 0x0d, ...ascii('B'), 0]),
  textCase('skip-1a', '$1A 被跳过', [0x41, 0x1a, 0x42, 0]),
  textCase('dot-width-1', '$0646=1（字宽 2 倍）"AB"', [...ascii('AB'), 0], { cells: { 0x646: 1 } }),
  textCase('dot-width-3', '$0646=3 "AB"', [...ascii('AB'), 0], { cells: { 0x646: 3 } }),
  textCase('mono-1', '$0647=1（每位重复 3 次）"AB"', [...ascii('AB'), 0], { cells: { 0x647: 1 } }),
  textCase('bitmap-2', '$0647=2（位图模式，只打一遍）"AB"', [...ascii('AB'), 0], { cells: { 0x647: 2 } }),
  textCase('bitmap-2-width', '$0647=2、$0646=2 "AB"', [...ascii('AB'), 0], { cells: { 0x647: 2, 0x646: 2 } }),
  textCase('extra-columns', '$0648=2（每个字符后加 2 列空白）"AB"', [...ascii('AB'), 0], { cells: { 0x648: 2 } }),
  textCase('line-spacing', '$0649=12（行距）"AB"', [...ascii('AB'), 0], { cells: { 0x649: 12 } }),
  textCase('wrap', '150 个字符，一行放不下，143 个字后换行', [...ascii('A'.repeat(150)), 0]),
  textCase('wrap-wide', '$0646=1，80 个字符，一行放 71 个字后换行', [...ascii('B'.repeat(80)), 0], { cells: { 0x646: 1 } }),
  textCase('page-end', '页长计数不足（$04BC=0、$04BD=$40）：收尾进纸并按 $0652 重新装入', [...ascii('AB'), 0], { region: { 0x4bc: 0, 0x4bd: 0x40 }, cells: { 0x652: 2 } }),
  textCase('page-end-bitmap', '位图模式下页长计数不足', [...ascii('AB'), 0], { region: { 0x4bc: 0, 0x4bd: 0x30 }, cells: { 0x647: 2, 0x652: 1 } }),
  textCase('sub-0d', '子功能 $0D 与 $00 相同', [...ascii('Hi'), 0], { sub: 0x0d }),
];
for (const mode of [1, 2, 3, 4, 5, 6, 7]) {
  cases.push(textCase(`mode-${mode}`, `变换模式 ${mode} 打印 "Ab"`, [...ascii('Ab'), 0], { cells: { 0x64e: mode } }));
}

// ---- 控制码 $80-$9F（中途改变字宽、点数、变换模式、附加列、行距）----
for (const argument of [0x80, 0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x8c, 0x90, 0x97, 0x98]) {
  cases.push(textCase(`ctl-92-${hexName(argument)}`, `控制码 $92 $${hexName(argument)}：由表设置字宽 $0646 与点数 $0647，再打 "AB"`, [0x41, 0x92, argument, ...ascii('AB'), 0]));
}
for (const argument of [0x80, 0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88]) {
  cases.push(textCase(`ctl-95-${hexName(argument)}`, `控制码 $95 $${hexName(argument)}：由表设置变换模式 $0544（只在本遍有效，第二遍恢复），再打 "AB"`, [0x41, 0x95, argument, ...ascii('AB'), 0]));
}
cases.push(
  textCase('ctl-99', '控制码 $99 $82：$0546 设为 2（每个字符后加 2 列）', [0x41, 0x99, 0x82, ...ascii('AB'), 0]),
  textCase('ctl-9b', '控制码 $9B $8A：$0547 设为 10（换行后的走纸量）', [0x41, 0x9b, 0x8a, ...ascii('AB'), 0]),
  textCase('ctl-9b-two-lines', '控制码 $9B $85，再换行打两行', [0x9b, 0x85, ...ascii('AB'), 0x0d, 0x0a, ...ascii('CD'), 0]),
  textCase('ctl-94', '控制码 $94 $80（带一个参数但什么都不做）', [0x41, 0x94, 0x80, 0x42, 0]),
  textCase('ctl-93', '控制码 $93（不带参数，什么都不做）', [0x41, 0x93, 0x42, 0]),
  textCase('ctl-9a', '控制码 $9A $81（带一个参数但什么都不做）', [0x41, 0x9a, 0x81, 0x42, 0]),
  textCase('ctl-92-out-of-range', '控制码 $92 $99（参数超出表范围）', [0x41, 0x92, 0x99, 0x42, 0]),
  textCase('ctl-length', '长度计数时控制码的参数字节不计入长度：长度 3 打 "A" 控制码 "B"', [0x41, 0x99, 0x82, 0x42, 0x43, 0x44], { cells: { 0x64f: 3 } }),
  textCase('ctl-8d-8a', '$8D $8A 当作换行', [...ascii('AB'), 0x8d, 0x8a, ...ascii('CD'), 0]),
  textCase('ctl-8d-other', '$8D 后面不是 $8A：$8D 被吃掉，后一个字符照常打印', [0x41, 0x8d, 0x42, 0]),
  textCase('ff-lf', '换页符 $0C 后跟换行也当作换行', [...ascii('AB'), 0x0c, 0x0a, ...ascii('CD'), 0]),
);

// ---- 汉字（GB2312）----
const gb = (...codes) => codes.flatMap((code) => [code >> 8, code & 0xff]);
cases.push(
  textCase('hanzi-one', '一个汉字“啊”（$B0A1）', [...gb(0xb0a1), 0]),
  textCase('hanzi-mixed', '西文与汉字混排："A" 啊 "B" 一 "C"', [0x41, ...gb(0xb0a1), 0x42, ...gb(0xd2bb), 0x43, 0]),
  textCase('hanzi-symbol', '符号区（$A1A1 全角空格、$A3C1 全角 A、$A9F0）', [...gb(0xa1a1, 0xa3c1, 0xa9f0), 0]),
  textCase('hanzi-last', '最后一个汉字（$F7FE）与第一个汉字 $B0A1', [...gb(0xf7fe, 0xb0a1), 0]),
  textCase('hanzi-width-1', '$0646=1 时的汉字', [...gb(0xb0a1, 0xd2bb), 0], { cells: { 0x646: 1 } }),
  textCase('hanzi-mono-1', '$0647=1 时的汉字', [...gb(0xb0a1, 0xd2bb), 0], { cells: { 0x647: 1 } }),
  textCase('hanzi-bitmap', '$0647=2（位图模式）的汉字', [...gb(0xb0a1, 0xd2bb), 0], { cells: { 0x647: 2 } }),
  textCase('hanzi-wrap', '80 个汉字，一行放 71 个（每个 16 列）后换行', [...gb(...Array.from({ length: 80 }, (_, i) => 0xb0a1 + i)), 0]),
  textCase('hanzi-wrap-ascii-before', '行末先有西文再有汉字，汉字放不下时整个汉字移到下一行', [...ascii('A'.repeat(140)), ...gb(0xb0a1, 0xb0a2), 0]),
  textCase('hanzi-length', '长度计数（汉字的两个字节都计入）：长度 5 打 "A" 啊啊 "B"', [0x41, ...gb(0xb0a1, 0xb0a1), 0x42], { cells: { 0x64f: 5 } }),
);

export { cases };
