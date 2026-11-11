// ------------------------------------------------------------------------
// 名称：bios-rename.test.mjs
// 说明：测试 bios-rename.mjs 的整词改名、冲突检查与失败时不写文件。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：在临时目录里建一个小工程，不碰真正的 bios/
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { renameSymbols } from '../tools/bios-rename.mjs';

function makeProject() {
  const dir = mkdtempSync(path.join(tmpdir(), 'bios-rename-'));
  mkdirSync(path.join(dir, 'src'));
  writeFileSync(path.join(dir, 'bios.json'), JSON.stringify({
    ines: '', includes: ['src/equates.asm'], parts: [{ firstPage: 0, pageCount: 1, base: 0x8000, sources: ['src/a.asm'] }],
  }));
  writeFileSync(path.join(dir, 'src', 'equates.asm'), 'RAM_0640 = $0640\n');
  writeFileSync(path.join(dir, 'src', 'a.asm'), '.org $8000\nP00_8000:\n    LDA RAM_0640\n    JMP P00_8000\nP00_80001:\n    RTS\n');
  return dir;
}

test('整词替换：只改完整的名字，不改包含它的更长名字', () => {
  const dir = makeProject();
  try {
    const counts = renameSymbols([['P00_8000', 'MAIN_LOOP'], ['RAM_0640', 'SYS_FLAG']], dir);
    assert.equal(counts.get('P00_8000'), 2);
    const source = readFileSync(path.join(dir, 'src', 'a.asm'), 'utf8');
    assert.match(source, /^MAIN_LOOP:$/m);
    assert.match(source, /JMP MAIN_LOOP/);
    assert.match(source, /P00_80001:/);
    assert.match(readFileSync(path.join(dir, 'src', 'equates.asm'), 'utf8'), /^SYS_FLAG = \$0640$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('带注释的改名：标签的注释写在定义行上方，符号定义的注释写在行末', () => {
  const dir = makeProject();
  try {
    renameSymbols([['P00_8000', 'MAIN_LOOP', '主循环|读取变量后无限跳转'], ['RAM_0640', 'SYS_FLAG', '系统标志']], dir);
    const source = readFileSync(path.join(dir, 'src', 'a.asm'), 'utf8');
    assert.match(source, /^; 主循环\n; 读取变量后无限跳转\nMAIN_LOOP:$/m);
    assert.match(readFileSync(path.join(dir, 'src', 'equates.asm'), 'utf8'), /^SYS_FLAG = \$0640 ; 系统标志$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('旧名不存在、新名已存在或不合法时报错，且不修改文件', () => {
  const dir = makeProject();
  try {
    const before = readFileSync(path.join(dir, 'src', 'a.asm'), 'utf8');
    assert.throws(() => renameSymbols([['NOWHERE', 'X']], dir), /找不到/);
    assert.throws(() => renameSymbols([['P00_8000', 'RAM_0640']], dir), /已存在/);
    assert.throws(() => renameSymbols([['P00_8000', '1BAD']], dir), /不是合法标识符/);
    assert.equal(readFileSync(path.join(dir, 'src', 'a.asm'), 'utf8'), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
