// ------------------------------------------------------------------------
// 名称：bios-split.test.mjs
// 说明：测试 bios-split.mjs 按标签拆分源文件与按取值范围拆分符号文件：文件头、页分隔注释、.org 位置、清单更新、构建结果不变与出错时恢复。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-10
// 备注：在临时目录里建一个 1 页的小工程，不碰真正的 bios/。
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildBios } from '../tools/bios-build.mjs';
import { splitEquates, splitSource } from '../tools/bios-split.mjs';

const OLD_HEADER = ['; ------------------------------------------------------------------------', '; 名称：p00.asm', '; 说明：旧文件头', '; ------------------------------------------------------------------------'];
// 三个例程共 6 字节，其后用 .byte 填满一页
const SOURCE = [
  ...OLD_HEADER,
  '.org $8000',
  '; ---- ROM 第 0 页（偏移 0x0，地址 $8000）----',
  '; 第一个例程',
  'FIRST:',
  '    RTS',
  '; 第二个例程：先 NOP 再返回',
  '; 第二行说明',
  'SECOND:',
  '    NOP',
  '    RTS',
  'THIRD:',
  '    JMP FIRST',
  ...Array.from({ length: 255 }, () => `    .byte ${new Array(16).fill('$00').join(',')}`),
  `    .byte ${new Array(4096 - 6 - 255 * 16).fill('$00').join(',')}`,
].join('\n');

function makeProject(source = SOURCE) {
  const dir = mkdtempSync(path.join(tmpdir(), 'bios-split-'));
  mkdirSync(path.join(dir, 'src'));
  writeFileSync(path.join(dir, 'bios.json'), JSON.stringify({ ines: '', includes: ['src/equates.asm'], parts: [{ firstPage: 0, pageCount: 1, base: 0x8000, sources: ['src/p00.asm'] }] }));
  writeFileSync(path.join(dir, 'src', 'equates.asm'), ['HIGH_ONE = $0300', 'ZP_TWO    = $10 ; 零页', 'IO_THREE = $4000', 'ZP_ONE = $02'].join('\n'));
  writeFileSync(path.join(dir, 'src', 'p00.asm'), source);
  return dir;
}

const PLAN = {
  source: 'src/p00.asm',
  files: [
    { path: 'demo/first.asm', description: '第一个例程' },
    { path: 'demo/second.asm', description: '第二个例程', from: 'SECOND' },
    { path: 'demo/third.asm', description: '第三个例程及填充', from: 'THIRD' },
  ],
};

test('按标签拆分：文件头、.org 位置、页分隔注释、标签上方的注释随标签走，构建结果不变，清单更新', () => {
  const dir = makeProject();
  try {
    const before = buildBios(dir, 1);
    const written = splitSource(dir, PLAN, { totalPages: 1, date: '2026-11-10' });
    assert.deepEqual(written, ['src/demo/first.asm', 'src/demo/second.asm', 'src/demo/third.asm']);
    assert.equal(existsSync(path.join(dir, 'src', 'p00.asm')), false);
    const first = readFileSync(path.join(dir, 'src', 'demo', 'first.asm'), 'utf8');
    const second = readFileSync(path.join(dir, 'src', 'demo', 'second.asm'), 'utf8');
    const third = readFileSync(path.join(dir, 'src', 'demo', 'third.asm'), 'utf8');
    assert.match(first, /^; -+\n; 名称：first\.asm\n; 说明：第一个例程\n; 作者：sungbin\n; 邮箱：sungbin@3578\.cn\n; 日期：2026-11-10\n/);
    assert.match(first, /备注：占ROM 第 0-0 页，汇编地址 \$8000 起/);
    assert.match(first, /\n\.org \$8000\n; 第一个例程\nFIRST:\n {4}RTS\n$/);
    assert.doesNotMatch(first, /ROM 第 0 页（偏移/);
    assert.match(second, /备注：在 ROM 里接在 demo\/first\.asm 之后/);
    assert.match(second, /\n; 第二个例程：先 NOP 再返回\n; 第二行说明\nSECOND:\n/);
    assert.doesNotMatch(second, /\.org/);
    assert.match(third, /\nTHIRD:\n {4}JMP FIRST\n/);
    const manifest = JSON.parse(readFileSync(path.join(dir, 'bios.json'), 'utf8'));
    assert.deepEqual(manifest.parts[0].sources, ['src/demo/first.asm', 'src/demo/second.asm', 'src/demo/third.asm']);
    assert.ok(before.equals(buildBios(dir, 1)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('按标签拆分：标签前紧挨着的 .rorg 随标签进入新文件，构建结果不变', () => {
  const source = SOURCE.replace('THIRD:', '.rorg $9000\nTHIRD:');
  const dir = makeProject(source);
  try {
    const before = buildBios(dir, 1);
    splitSource(dir, PLAN, { totalPages: 1, date: '2026-11-10' });
    const second = readFileSync(path.join(dir, 'src', 'demo', 'second.asm'), 'utf8');
    const third = readFileSync(path.join(dir, 'src', 'demo', 'third.asm'), 'utf8');
    assert.doesNotMatch(second, /\.rorg/);
    assert.match(third, /; -+\n\.rorg \$9000\nTHIRD:\n/);
    assert.ok(before.equals(buildBios(dir, 1)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('按标签拆分：标签不存在时报错并保持原状', () => {
  const dir = makeProject();
  try {
    const plan = { source: 'src/p00.asm', files: [{ path: 'a.asm', description: 'x' }, { path: 'b.asm', description: 'y', from: 'NOWHERE' }] };
    assert.throws(() => splitSource(dir, plan, { totalPages: 1 }), /标签 NOWHERE 应当恰好出现一次/);
    assert.equal(readFileSync(path.join(dir, 'src', 'p00.asm'), 'utf8'), SOURCE);
    assert.equal(existsSync(path.join(dir, 'src', 'a.asm')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('符号文件按取值范围拆分：每份按值从小到大、等号对齐，清单 includes 更新，构建不变', () => {
  const dir = makeProject();
  try {
    const plan = {
      equates: 'src/equates.asm',
      files: [
        { path: 'include/zero-page.inc', description: '零页', min: 0, max: 0xff },
        { path: 'include/rest.inc', description: '其余', min: 0x100, max: 0xffff },
      ],
    };
    const written = splitEquates(dir, plan, { totalPages: 1, date: '2026-11-10' });
    assert.deepEqual(written, ['src/include/zero-page.inc', 'src/include/rest.inc']);
    const zero = readFileSync(path.join(dir, 'src', 'include', 'zero-page.inc'), 'utf8');
    assert.match(zero, /\nZP_ONE = \$02\nZP_TWO = \$10 ; 零页\n$/);
    const rest = readFileSync(path.join(dir, 'src', 'include', 'rest.inc'), 'utf8');
    assert.match(rest, /\nHIGH_ONE = \$0300\nIO_THREE = \$4000\n$/);
    const manifest = JSON.parse(readFileSync(path.join(dir, 'bios.json'), 'utf8'));
    assert.deepEqual(manifest.includes, ['src/include/zero-page.inc', 'src/include/rest.inc']);
    assert.equal(existsSync(path.join(dir, 'src', 'equates.asm')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('符号文件拆分：有符号不在任何范围里时报错并保持原状', () => {
  const dir = makeProject();
  try {
    const plan = { equates: 'src/equates.asm', files: [{ path: 'include/zero-page.inc', description: '零页', min: 0, max: 0xff }] };
    assert.throws(() => splitEquates(dir, plan, { totalPages: 1 }), /不在任何范围里/);
    assert.equal(existsSync(path.join(dir, 'src', 'equates.asm')), true);
    assert.equal(existsSync(path.join(dir, 'src', 'include')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
