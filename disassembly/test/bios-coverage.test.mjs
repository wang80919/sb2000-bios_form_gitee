// ------------------------------------------------------------------------
// 名称：bios-coverage.test.mjs
// 说明：测试 bios-coverage.mjs 的覆盖率统计：指令是否被执行、数据字节是否被访问、按例程汇总，以及自动标签不算例程起点。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：在临时目录里建一个 1 页的小工程，不碰真正的 bios/
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { computeCoverage } from '../tools/bios-coverage.mjs';
import { CDL } from '../tools/cdl-listing.mjs';

const SOURCE = [
  '.org $8000',
  'ROUTINE_A:',
  '    LDA #$01',
  '    BNE P00_8005',
  '    NOP',
  'P00_8005:',
  '    RTS',
  'ROUTINE_B:',
  '    NOP',
  '    RTS',
  'TABLE:',
  '    .byte $01,$02,$03',
  '',
].join('\n');

/** 建一个只有 1 页汇编源文件的小工程，返回目录 */
function makeProject() {
  const dir = mkdtempSync(path.join(tmpdir(), 'bios-coverage-'));
  mkdirSync(path.join(dir, 'src'));
  writeFileSync(path.join(dir, 'bios.json'), JSON.stringify({ ines: '', parts: [{ firstPage: 0, pageCount: 1, base: 0x8000, sources: ['src/a.asm'] }] }));
  writeFileSync(path.join(dir, 'src', 'a.asm'), SOURCE);
  return dir;
}

test('按指令首字节统计执行情况，并按有意义的标签划分例程', () => {
  const dir = makeProject();
  try {
    const cdl = new Uint8Array(4096);
    // LDA #$01（偏移 0）、BNE（偏移 2）与 RTS（偏移 5）被执行；NOP（偏移 4）没有
    cdl[0] = CDL.OPCODE;
    cdl[2] = CDL.OPCODE;
    cdl[5] = CDL.OPCODE;
    // 数据表只被读了一个字节
    cdl[8] = CDL.READ;
    const { parts, total } = computeCoverage(dir, cdl);
    assert.equal(total.instr, 6);
    assert.equal(total.instrDone, 3);
    assert.equal(total.dataBytes, 3);
    assert.equal(total.dataTouched, 1);
    const names = parts[0].routines.map((r) => r.name);
    assert.deepEqual(names, ['ROUTINE_A', 'ROUTINE_B', 'TABLE']);
    const a = parts[0].routines[0];
    assert.equal(a.instr, 4);
    assert.equal(a.instrDone, 3);
    assert.equal(parts[0].routines[1].instrDone, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
