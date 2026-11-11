// ------------------------------------------------------------------------
// 名称：bios-variant.test.mjs
// 说明：测试 bios-build.mjs 的 applyVariant：补丁只改指定字节、原字节不符时拒绝，以及仓库里的 fastboot 变体与源码一致。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：fastboot 的用例会真的构建一次 bios/，确认补丁位置确实是 RESET 里进入开机程序的立即数。
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { BIOS_DIR, applyVariant, buildBios } from '../tools/bios-build.mjs';

const variants = { demo: { patches: [{ offset: '0x02', expect: '0102', value: 'AABB' }] } };

test('applyVariant 只改补丁字节，不改原缓冲区', () => {
  const rom = Buffer.concat([Buffer.alloc(16), Buffer.from([0, 0, 1, 2, 3])]);
  const result = applyVariant(rom, variants, 'demo');
  assert.equal(result.patched, 2);
  assert.deepEqual([...result.rom.subarray(16)], [0, 0, 0xaa, 0xbb, 3]);
  assert.deepEqual([...rom.subarray(16)], [0, 0, 1, 2, 3]);
});

test('applyVariant 在原字节不符或变体不存在时抛出异常', () => {
  const rom = Buffer.alloc(32);
  assert.throws(() => applyVariant(rom, variants, 'demo'), /不符/);
  assert.throws(() => applyVariant(rom, variants, 'nope'), /未知的变体/);
});

test('fastboot 变体把 RESET 进入的页组从 $78 改成 $00', () => {
  const list = JSON.parse(readFileSync(path.join(BIOS_DIR, 'variants.json'), 'utf8'));
  const { rom, patched } = applyVariant(buildBios(), list, 'fastboot');
  assert.equal(patched, 1);
  // $C023 LDA #$xx、$C025 STA SYS_GROUP：偏移 0x4023 起是 A9 xx 8D
  assert.deepEqual([...rom.subarray(16 + 0x4023, 16 + 0x4026)].slice(0, 2), [0xa9, 0x00]);
});
