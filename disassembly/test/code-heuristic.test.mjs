// ------------------------------------------------------------------------
// 名称：code-heuristic.test.mjs
// 说明：测试启发式代码识别与未识别区域报告。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：运行 npm test
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import test from 'node:test';
import { PAGE_SIZE } from '../tools/bios-listing.mjs';
import { sweep, unclassifiedRuns } from '../tools/bios-report.mjs';
import { CDL } from '../tools/cdl-listing.mjs';
import { findHeuristicCode } from '../tools/code-heuristic.mjs';

const SEGMENTS = [{ firstPage: 0, pageCount: 1, base: 0x8000 }];

/** 一页 ROM：偏移 0 是已有的 RTS（实测执行过），其后从偏移 1 起写入 bytes */
function pageAfterRts(bytes) {
  const rom = new Uint8Array(PAGE_SIZE);
  rom.set([0x60, ...bytes]);
  const cdl = new Uint8Array(PAGE_SIZE);
  cdl[0] = CDL.OPCODE;
  return { rom, cdl };
}

test('分支跳过中间的 RTS 的例程：沿控制流整体识别，指令与操作数都被标记', () => {
  // CPX #3 / BEQ +2 / INY / RTS / DEX / RTS
  const { rom, cdl } = pageAfterRts([0xe0, 0x03, 0xf0, 0x02, 0xc8, 0x60, 0xca, 0x60]);
  const { cdl: out, heuristic } = findHeuristicCode(rom, cdl, SEGMENTS);
  assert.deepEqual([...heuristic].sort((a, b) => a - b), [1, 3, 5, 6, 7, 8]);
  assert.equal(out[1] & CDL.OPCODE, CDL.OPCODE);
  assert.equal(out[2] & CDL.OPERAND, CDL.OPERAND);
  assert.equal(out[8] & CDL.OPCODE, CDL.OPCODE);
  assert.equal(cdl[1], 0, '不修改传入的 CDL');
});

test('全零的填充区不是代码', () => {
  const { rom, cdl } = pageAfterRts([]);
  assert.equal(findHeuristicCode(rom, cdl, SEGMENTS).heuristic.size, 0);
});

test('指令条数不足时不识别', () => {
  const { rom, cdl } = pageAfterRts([0xa9, 0x01, 0x60]);
  assert.equal(findHeuristicCode(rom, cdl, SEGMENTS).heuristic.size, 0);
});

test('包含非官方操作码的区间不识别', () => {
  const { rom, cdl } = pageAfterRts([0xa9, 0x01, 0x85, 0x10, 0xa9, 0x02, 0x03, 0x60]);
  assert.equal(findHeuristicCode(rom, cdl, SEGMENTS).heuristic.size, 0);
});

test('JSR 指向 PPU 寄存器区等不可执行的地址时不识别', () => {
  const { rom, cdl } = pageAfterRts([0xa9, 0x01, 0x85, 0x10, 0xa9, 0x02, 0x20, 0x00, 0x20, 0x60]);
  assert.equal(findHeuristicCode(rom, cdl, SEGMENTS).heuristic.size, 0);
});

test('JSR 指向本段内的指令中间时不识别，指向已有指令起点时识别', () => {
  const base = [0xa9, 0x01, 0x85, 0x10, 0xa9, 0x02, 0x85, 0x11];
  // 目标 $8000 是已有的 RTS：识别
  const ok = pageAfterRts([...base, 0x20, 0x00, 0x80, 0x60]);
  assert.equal(findHeuristicCode(ok.rom, ok.cdl, SEGMENTS).heuristic.size, 6);
  // 目标 $8002 落在候选自己的指令中间（$8001 的操作数）：不识别
  const bad = pageAfterRts([...base, 0x20, 0x02, 0x80, 0x60]);
  assert.equal(findHeuristicCode(bad.rom, bad.cdl, SEGMENTS).heuristic.size, 0);
});

test('被读写过的字节是数据，不会被当作代码', () => {
  const { rom, cdl } = pageAfterRts([0xa9, 0x01, 0x85, 0x10, 0xa9, 0x02, 0x85, 0x11, 0x60]);
  cdl[5] |= CDL.READ;
  assert.equal(findHeuristicCode(rom, cdl, SEGMENTS).heuristic.size, 0);
});

test('例程前有一小段数据时，从偏移之后的位置开始识别（要求指令条数更多）', () => {
  const routine = [];
  for (let i = 0; i < 10; i++) routine.push(0xe8); // 10 条 INX
  routine.push(0x60);
  const { rom, cdl } = pageAfterRts([0x00, 0x00, 0x00, ...routine]);
  const { heuristic } = findHeuristicCode(rom, cdl, SEGMENTS);
  assert.equal(heuristic.size, 11);
  assert.ok(heuristic.has(4));

  // 只有 5 条指令的话，偏移出来的候选不够长
  const short = pageAfterRts([0x00, 0x00, 0x00, 0xe8, 0xe8, 0xe8, 0xe8, 0x60]);
  assert.equal(findHeuristicCode(short.rom, short.cdl, SEGMENTS).heuristic.size, 0);
});

test('unclassifiedRuns 只返回足够长的未占用区间，并标明是否被读写过', () => {
  const cdl = new Uint8Array(64);
  cdl[0] = CDL.OPCODE;
  cdl[1] = CDL.OPERAND;
  cdl[20] = CDL.OPCODE;
  cdl[30] |= CDL.READ;
  assert.deepEqual(unclassifiedRuns(cdl, 0, 64, 10), [
    { start: 2, end: 20, accessed: false },
    { start: 21, end: 64, accessed: true },
  ]);
  assert.deepEqual(unclassifiedRuns(cdl, 0, 64, 30), [{ start: 21, end: 64, accessed: true }]);
});

test('sweep 统计连续合法官方指令，遇到非官方操作码即停', () => {
  const rom = Uint8Array.from([0xa9, 0x01, 0xe8, 0x03, 0xea]);
  const result = sweep(rom, 0, rom.length);
  assert.equal(result.count, 2);
  assert.equal(result.bytes, 3);
  assert.match(result.stoppedBy, /\$03/);
});
