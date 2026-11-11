// ------------------------------------------------------------------------
// 名称：bios-localize.test.mjs
// 说明：测试 bios-localize.mjs 把只在例程内部被分支引用的自动名标签改成局部标签：改名条件、角色名、重名加序号、跨例程与被 JSR 引用的保留、构建结果不变。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-10
// 备注：在临时目录里建一个 1 页的小工程，不碰真正的 bios/。
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildBios } from '../tools/bios-build.mjs';
import { localizeLabels, planLocalLabels } from '../tools/bios-localize.mjs';

const BODY = [
  '.org $8000',
  'COUNT:',
  '    LDX #$00',
  'P00_8002:',
  '    INX',
  '    CPX #$05',
  '    BNE P00_8002',
  '    BEQ P00_800B ; 向前跳到 RTS',
  '    NOP',
  'P00_8009:',
  '    CLC',
  '    RTS',
  'P00_800B:',
  '    RTS',
  'OTHER:',
  '    BNE P00_8009 ; 跳进别的例程，P00_8009 必须保留全局',
  '    JSR P00_8020',
  '    RTS',
  'P00_8020:',
  '    BEQ P00_8024',
  '    NOP',
  'P00_8024:',
  '    BEQ P00_8002 ; 引用别的例程里的标签，P00_8002 也要保留',
  '    RTS',
].join('\n');

const files = (text) => [{ name: 'src/main.asm', text }];

test('可以局部化的标签只被同一例程内的分支引用；跨例程引用与 JSR 目标保留', () => {
  const { renames, kept, total } = planLocalLabels(files(BODY));
  assert.equal(total, 5);
  assert.equal(renames.get('P00_800B'), undefined);
  assert.equal(renames.get('P00_8024'), '@skip');
  assert.equal(renames.has('P00_8020'), false);
  assert.equal(renames.has('P00_8009'), false);
  assert.equal(renames.has('P00_8002'), false);
  assert.equal(kept, 4);
});

test('名字按位置与后续指令给出：往回跳是 loop，后面是 RTS 的是 return，SEC RTS 与 CLC RTS 分别是 return_set 与 return_clear，同名加序号', () => {
  const text = [
    'WORK:',
    '    LDX #$00',
    'P00_8002:',
    '    INX',
    '    BNE P00_8002',
    '    BEQ P00_8009',
    '    BCC P00_800A',
    '    BCS P00_800D',
    '    NOP',
    'P00_8009:',
    '    RTS',
    'P00_800A:',
    '    CLC',
    '    RTS',
    'P00_800D:',
    '    SEC',
    '    RTS',
    '    BNE P00_8010',
    'P00_8010:',
    '    NOP',
    '    BEQ P00_8013',
    'P00_8013:',
    '    RTS',
  ].join('\n');
  const { renames } = planLocalLabels(files(text));
  assert.deepEqual([...renames], [
    ['P00_8002', '@loop'],
    ['P00_8009', '@return'],
    ['P00_800A', '@return_clear'],
    ['P00_800D', '@return_set'],
    ['P00_8010', '@skip'],
    ['P00_8013', '@return2'],
  ]);
});

test('没有任何引用的自动名只是位置标记：选项打开时删除，且不再把作用域切开；保留名单里的除外', () => {
  const text = [
    'WORK:',
    '    BEQ P00_8004',
    '    NOP',
    'P00_8004:',
    '    NOP',
    'P00_8005:',
    '    BEQ P00_8008',
    '    NOP',
    'P00_8008:',
    '    NOP',
  ].join('\n');
  const plan = planLocalLabels(files(text), { dropUnreferenced: true });
  assert.deepEqual([...plan.renames], [['P00_8004', '@skip'], ['P00_8008', '@skip2']]);
  assert.deepEqual([...plan.drops], ['P00_8005']);
  assert.equal(plan.kept, 0);
  const kept = planLocalLabels(files(text), { dropUnreferenced: true, keep: ['P00_8005'] });
  assert.equal(kept.drops.size, 0);
  assert.equal(kept.kept, 1);
});

test('删除标签使两个作用域合并后，已有的同名局部标签后一个加序号', () => {
  const text = [
    'WORK:',
    '    BEQ @skip',
    '    NOP',
    '@skip:',
    '    NOP',
    'P00_8005:',
    '    BEQ @skip',
    '    NOP',
    '@skip:',
    '    NOP',
  ].join('\n');
  const plan = planLocalLabels(files(text), { dropUnreferenced: true });
  assert.deepEqual([...plan.localRenames[0]], [['5:@skip', '@skip2']]);
});

test('注释和字符串里的名字不改；局部化后重新构建，ROM 不变', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bios-localize-'));
  try {
    mkdirSync(path.join(dir, 'src'));
    writeFileSync(path.join(dir, 'bios.json'), JSON.stringify({ ines: '', includes: ['src/equates.asm'], parts: [{ firstPage: 0, pageCount: 1, base: 0x8000, sources: ['src/main.asm'] }] }));
    writeFileSync(path.join(dir, 'src', 'equates.asm'), 'ZP_ONE = $02\n');
    const text = [
      '.org $8000',
      'COUNT:',
      '    LDX #$00',
      'P00_8002:',
      '    INX',
      '    CPX #$05',
      '    BNE P00_8002 ; 回到 P00_8002 再数',
      '    RTS',
      '    .ascii "P00_8002"',
      `    .byte ${new Array(4096 - 16).fill('$00').join(',')}`,
    ].join('\n');
    writeFileSync(path.join(dir, 'src', 'main.asm'), text);
    const before = buildBios(dir, 1);
    const result = localizeLabels(dir, { totalPages: 1 });
    assert.deepEqual(result, { converted: 1, dropped: 0, kept: 0, total: 1 });
    const after = readFileSync(path.join(dir, 'src', 'main.asm'), 'utf8');
    assert.match(after, /\n@loop:\n {4}INX\n {4}CPX #\$05\n {4}BNE @loop ; 回到 P00_8002 再数\n/);
    assert.match(after, /\.ascii "P00_8002"/);
    assert.ok(before.equals(buildBios(dir, 1)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
