// ------------------------------------------------------------------------
// 名称：bios-data.test.mjs
// 说明：测试数据区清单工具 tools/bios-data.mjs：数据块解析（.byte/.word/.ascii、标签与注释、地址与标记）、内容归类、人工说明匹配、引用者与引用方式、清单汇总。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用小段合成的汇编文本测试，不依赖 bios/ 工程的实际内容；最后一个用例核对真实工程的数据字节总数与覆盖率工具一致。
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInventory, classifyContent, findNote, findReferences, parseDataBlocks, renderMarkdown } from '../tools/bios-data.mjs';

const SAMPLE = [
  '; 音高周期表（64 项）',
  'SOUND_TABLE:',
  '    .byte $FF,$9A,$2D ; $CF6D 未访问',
  '    .byte $C6,$64 ; $CF70 未访问',
  'K_NEXT:',
  '    LDA SOUND_TABLE,Y ; $C000',
  '    .word K_NEXT,K_NEXT ; $CF80 地址表',
  '    RTS ; $CF88',
  '    .ascii "AB\\r\\n\\0" ; $CF90 数据',
].join('\n');

test('连续的数据行合成一个块，记下起始地址、标签、前面的注释与标记', () => {
  const blocks = parseDataBlocks(SAMPLE, 'p04.asm');
  assert.equal(blocks.length, 3);
  const [table, words, text] = blocks;
  assert.equal(table.start, 0xcf6d);
  assert.equal(table.size, 5);
  assert.deepEqual(table.bytes, [0xff, 0x9a, 0x2d, 0xc6, 0x64]);
  assert.deepEqual(table.labels, ['SOUND_TABLE']);
  assert.equal(table.comment, '音高周期表（64 项）');
  assert.equal(table.tag, '未访问');
  assert.equal(words.size, 4);
  assert.deepEqual(words.words, ['K_NEXT', 'K_NEXT']);
  assert.deepEqual(text.bytes, [0x41, 0x42, 0x0d, 0x0a, 0x00]);
});

test('页分隔注释不算说明', () => {
  const blocks = parseDataBlocks(['; ---- ROM 第 5 页 ----', '    .byte $01 ; $D000 数据'].join('\n'), 'x.asm');
  assert.equal(blocks[0].comment, '');
});

test('内容归类：全同字节是填充，可见字符是字符串，.word 是地址表，其余是数据', () => {
  assert.equal(classifyContent({ bytes: new Array(16).fill(0), words: null, size: 16 }).kind, '填充');
  assert.equal(classifyContent({ bytes: [...'HELLO.TXT\0'].map((c) => c.charCodeAt(0)), words: null, size: 10 }).kind, '字符串');
  assert.equal(classifyContent({ bytes: [0xc4, 0xbf, 0xc2, 0xbc, 0xc4, 0xbf], words: null, size: 6 }).format, 'GB2312 汉字');
  assert.equal(classifyContent({ bytes: null, words: ['A', 'B'], size: 4 }).kind, '地址表');
  assert.equal(classifyContent({ bytes: [1, 2, 3, 4, 5, 6, 7, 8, 9], words: null, size: 9 }).kind, '数据');
});

test('块的起始地址取自汇编器的行号映射，行尾是自由格式的注释也能解析，字符串里的分号不算注释', () => {
  const text = ['TABLE:', '    .byte $01,$02 ; 两个字节', '    .ascii "A;B" ; 文字'].join('\n');
  const [block] = parseDataBlocks(text, 'x.asm', new Map([[2, { address: 0x9000, offset: 0x1000 }]]));
  assert.equal(block.start, 0x9000);
  assert.equal(block.offset, 0x1000);
  assert.equal(block.size, 5);
  assert.deepEqual(block.bytes, [1, 2, 0x41, 0x3b, 0x42]);
});

test('人工说明按 ROM 偏移的起止范围匹配块的起点，与文件名无关', () => {
  const notes = [{ from: '05F00', to: '05FFF', kind: '表' }];
  assert.equal(findNote({ offset: 0x5f6d }, notes), notes[0]);
  assert.equal(findNote({ offset: 0x6000 }, notes), null);
  assert.equal(findNote({ offset: null }, notes), null);
});

test('引用者取包含该标签的指令前最近的标签，并记下引用方式', () => {
  const sources = new Map([['p04.asm', SAMPLE.split('\n')]]);
  const refs = findReferences(sources, ['SOUND_TABLE']);
  assert.deepEqual(refs.routines, ['K_NEXT']);
  assert.deepEqual(refs.modes, ['LDA 索引读写']);
});

test('buildInventory：汇总字节数，有注释的块有说明，没有任何线索的块待说明，资源文件登记计入', () => {
  const files = [
    { name: 'p04.asm', text: SAMPLE, positions: new Map() },
    { name: 'p00.asm', text: '    .byte $01,$02,$03,$04,$05,$06,$07,$08,$09 ; $9000 未访问\n', positions: new Map() },
  ];
  const inventory = buildInventory({ input: { equatesText: '', files }, notesFile: 'none.json', assets: [{ file: 'assets/a.bin', firstPage: 0x10, pages: 2, kind: '字库', format: 'x', description: 'y' }] });
  const byFile = Object.groupBy(inventory.entries, (e) => e.file);
  assert.equal(byFile['p04.asm'][0].status, '有说明');
  assert.equal(byFile['p00.asm'][0].status, '待说明');
  assert.deepEqual(inventory.pending.map((e) => e.file), ['p00.asm', 'p04.asm']); // 9 字节的无线索块、5 字节的 .ascii 块（可见字符不足 4 个）
  assert.equal(inventory.summary['字库'].bytes, 8192);
  assert.match(renderMarkdown(inventory), /# BIOS 数据区清单/);
});

test('真实工程：数据字节总数不超过覆盖率工具最初统计的 442043（把数据改成指令只会让它变小），且各块大小都大于 0', () => {
  const inventory = buildInventory();
  const total = inventory.entries.reduce((sum, e) => sum + e.size, 0);
  assert.ok(total <= 442043 && total > 430000, `总数 ${total}`);
  assert.ok(inventory.entries.every((e) => e.size > 0));
});
