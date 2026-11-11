// ------------------------------------------------------------------------
// 名称：dispatch-real.test.mjs
// 说明：用真实 BIOS ROM 核对系统调用分流：指向“未实现”桩例程的功能号、桩例程的代码、页组入口内联表之外的功能号读到的跳转目标，以及 $66 不经内联表直接进入页组 $0F 的 $8700。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：表外功能号（$49、$55-$58、$62-$64）读到的“地址”是内联表例程自己的代码字节拼成的，不是有效的处理例程入口，所以没有合法例程，用例不调用它们；
//       ROM 文件不存在时（没有原版 BIOS）整组测试跳过。
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { readAllInlineTables, readInlineSlot } from '../tools/banked-tables.mjs';
import { BIOS_ROM } from '../tools/config.mjs';
import { ROM_TABLE_OFFSET, UNIMPLEMENTED_STUB, buildDispatchMap } from '../tools/dispatch-map.mjs';
import { renderApiDoc } from '../tools/render-api-doc.mjs';
import { BANKED_SYMBOLS, KNOWN_SYMBOLS } from '../tools/symbols.mjs';

const skip = !existsSync(BIOS_ROM);
const rom = skip ? null : new Uint8Array(readFileSync(BIOS_ROM)).subarray(16);

/** 指向桩例程的功能号（$10 起的 ROM 表项） */
const STUB_FUNCTIONS = [0x16, 0x20, 0x21, 0x22, 0x23, 0x2d, 0x2e, 0x2f, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x67, 0x68, 0x69, 0x6e, 0x6f, 0x70, 0x71, 0x72, 0x73];

test('ROM 表里指向“未实现”桩例程的功能号就是这 23 个，桩例程是 NOP、NOP、RTS', { skip }, () => {
  const stubs = buildDispatchMap(rom).filter((entry) => entry.stub).map((entry) => entry.fn);
  assert.deepEqual(stubs, STUB_FUNCTIONS);
  // $E150 在固定映射的第 6 页（ROM 偏移 $6000），页内偏移 $150；ROM 表在 $E082
  assert.equal(ROM_TABLE_OFFSET, 0x6082);
  const offset = 0x6000 + (UNIMPLEMENTED_STUB - 0xe000);
  assert.deepEqual([...rom.subarray(offset, offset + 3)], [0xea, 0xea, 0x60]);
});

test('页组入口内联表之外的功能号读到的是内联表例程的代码字节，不是处理例程', { skip }, () => {
  const groups = [
    { group: 0x0f, entry: 0x8000, tableFunctions: [0x47, 0x48], outside: { 0x49: [0x800d, 0xa80a] } },
    { group: 0x09, entry: 0x8500, tableFunctions: [0x4a, 0x4b, 0x4c, 0x4d, 0x4e, 0x4f, 0x50, 0x51, 0x52, 0x53, 0x54], outside: { 0x55: [0x851f, 0xa80a], 0x56: [0x8521, 0x8568], 0x57: [0x8523, 0x6810], 0x58: [0x8525, 0x1185] } },
    { group: 0x0b, entry: 0x8000, tableFunctions: [0x5a, 0x5b, 0x5c, 0x5d, 0x5e, 0x5f, 0x60, 0x61], outside: { 0x62: [0x8019, 0xa80a], 0x63: [0x801b, 0x8568], 0x64: [0x801d, 0x6810] } },
  ];
  const entries = groups.map(({ group, entry }) => ({ group, handler: entry }));
  const table = readAllInlineTables(rom, entries);
  for (const { group, entry, tableFunctions, outside } of groups) {
    assert.deepEqual([...table.values()].filter((target) => target.group === group).map((target) => target.fn), tableFunctions);
    const validEntries = new Set([...table.values()].filter((target) => target.group === group).map((target) => target.address));
    for (const [fn, [slot, target]] of Object.entries(outside)) {
      assert.deepEqual(readInlineSlot(rom, group, entry, Number(fn)), { slot, target });
      assert.equal(validEntries.has(target), false, `$${Number(fn).toString(16)} 的目标 $${target.toString(16)} 是某个有效入口`);
    }
  }
});

test('$66 不经页组 $0F 的内联表，系统调用表里直接指向 $8700', { skip }, () => {
  const map = buildDispatchMap(rom);
  const table = readAllInlineTables(rom, map);
  assert.equal(table.has(0x66), false);
  const text = renderApiDoc(map, KNOWN_SYMBOLS, null, table, BANKED_SYMBOLS);
  assert.match(text, /\| \$66 \| 换页后进入 \| \$0F \| \$8700 \| API_66 \|/);
  assert.match(text, /\| \$49 \| 换页后进入（入口表） \| \$0F \| 表外 \|/);
});
