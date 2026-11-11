// ------------------------------------------------------------------------
// 名称：dispatch.test.mjs
// 说明：系统调用分流表、静态追踪、分流核对与系统调用文档生成的测试。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：使用内存中构造的最小 ROM，不依赖真实 BIOS。
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCallLog } from '../tools/analyze-api-log.mjs';
import { CDL } from '../tools/cdl-listing.mjs';
import { readAllInlineTables, readInlineTable } from '../tools/banked-tables.mjs';
import { ROM_TABLE_OFFSET, UNIMPLEMENTED_STUB, buildDispatchMap, dispatchEntry } from '../tools/dispatch-map.mjs';
import { renderApiDoc } from '../tools/render-api-doc.mjs';
import { extendCdl } from '../tools/static-trace.mjs';
import { verifyDispatch } from '../tools/verify-dispatch.mjs';

/** 构造 512KB ROM，ROM 表里功能号 0x10 指向 $E153，其余指向“未实现”桩 */
function sampleRom() {
  const rom = new Uint8Array(512 * 1024);
  for (let fn = 0x10; fn <= 0x76; fn++) {
    const at = ROM_TABLE_OFFSET + (fn - 0x10) * 2;
    const target = fn === 0x10 ? 0xe153 : UNIMPLEMENTED_STUB;
    rom[at] = target & 0xff;
    rom[at + 1] = target >> 8;
  }
  return rom;
}

test('分发器对各功能号区间的分流与反汇编结果一致', () => {
  const rom = sampleRom();
  assert.equal(dispatchEntry(rom, 0x05).kind, 'ram-table');
  assert.deepEqual(
    [dispatchEntry(rom, 0x10).kind, dispatchEntry(rom, 0x10).handler, dispatchEntry(rom, 0x10).stub],
    ['rom-table', 0xe153, false],
  );
  assert.equal(dispatchEntry(rom, 0x11).stub, true);
  const first = dispatchEntry(rom, 0x3b);
  assert.deepEqual([first.kind, first.group, first.handler], ['banked', 0x08, 0x8000]);
  assert.deepEqual([dispatchEntry(rom, 0x4a).group, dispatchEntry(rom, 0x4a).handler], [0x09, 0x8500]);
  assert.deepEqual([dispatchEntry(rom, 0x59).group, dispatchEntry(rom, 0x59).handler], [0x0a, 0x8160]);
  assert.deepEqual([dispatchEntry(rom, 0x66).group, dispatchEntry(rom, 0x66).handler], [0x0f, 0x8700]);
  assert.equal(dispatchEntry(rom, 0x65).kind, 'rom-table');
  assert.equal(dispatchEntry(rom, 0x6d).group, 0x0c);
  assert.equal(dispatchEntry(rom, 0x76).group, null);
  assert.equal(dispatchEntry(rom, 0x7e).group, 0x5c);
  assert.equal(dispatchEntry(rom, 0x82).kind, 'none');
  assert.equal(buildDispatchMap(rom).length, 0x82);
});

test('静态追踪补全未执行的分支路径，遇到 JMP、RTS 与非官方指令停止', () => {
  const rom = new Uint8Array(512 * 1024);
  const kernel = 0x4000;
  // $C000: LDA #$01 / BEQ $C006 / JMP $C010 / ... $C006: RTS；$C010: NOP / 非官方 $03 / 其后字节不应被追踪
  rom.set([0xa9, 0x01, 0xf0, 0x02, 0x4c, 0x10, 0xc0, 0x60], kernel);
  rom.set([0xea, 0x03, 0xa9, 0x00], kernel + 0x10);
  rom[kernel + 5] = 0x10;
  rom[kernel + 6] = 0xc0;
  const cdl = new Uint8Array(rom.length);
  // 实测标志里要带窗口号（第 4 页在 $C000 窗口，即窗口 4）
  const window4 = 4 << 4;
  cdl[kernel] = CDL.OPCODE | window4; cdl[kernel + 1] = CDL.OPERAND | window4;
  cdl[kernel + 2] = CDL.OPCODE | window4; cdl[kernel + 3] = CDL.OPERAND | window4;
  const { cdl: extended, inferred } = extendCdl(rom, cdl, []);
  // BEQ 的目标 $C006 与顺序后继 JMP 都是推断出的指令；RTS 在 $C007
  assert.equal(extended[kernel + 4] & CDL.OPCODE, CDL.OPCODE);
  assert.ok(inferred.has(kernel + 4));
  assert.ok(inferred.has(kernel + 0x10)); // NOP
  assert.equal(extended[kernel + 0x11] & CDL.OPCODE, 0); // 非官方指令不追踪
  assert.equal(extended[kernel + 0x12] & CDL.OPCODE, 0);
  assert.equal(cdl[kernel + 4], 0); // 输入未被修改
});

test('实测标志里页号小于窗口号（页组为负）时不崩溃，也不追踪', () => {
  const rom = new Uint8Array(512 * 1024).fill(0xea);
  const cdl = new Uint8Array(rom.length);
  // 第 1 页被记成在窗口 3 执行：页组 1 − 3 为负，换算不出有效偏移
  cdl[0x1000] = CDL.OPCODE | (3 << 4);
  assert.doesNotThrow(() => extendCdl(rom, cdl, []));
});

test('额外入口地址在内核区之外时被忽略', () => {
  const rom = new Uint8Array(512 * 1024);
  const { inferred } = extendCdl(rom, new Uint8Array(rom.length), [0x8000, 0x1234]);
  assert.equal(inferred.size, 0);
});

test('换页区按页组换算，并把内联跳转表里的地址当作入口、表本身不当作代码', () => {
  const rom = new Uint8Array(512 * 1024);
  const page8 = 0x8000;
  // $8000: JSR $8010 / 表：$8040、$8050 / $8010: 内联跳转表例程（23 字节）/ $8040: NOP, RTS / $8050: RTS
  rom.set([0x20, 0x10, 0x80, 0x40, 0x80, 0x50, 0x80], page8);
  rom.set([0x0a, 0xa8, 0x68, 0x85, 0x10, 0x68, 0x85, 0x11, 0xc8, 0xb1, 0x10, 0x48, 0xc8, 0xb1, 0x10, 0x85, 0x11, 0x68, 0x85, 0x10, 0x6c, 0x10, 0x00], page8 + 0x10);
  rom.set([0xea, 0x60], page8 + 0x40);
  rom[page8 + 0x50] = 0x60;
  const { inferred } = extendCdl(rom, new Uint8Array(rom.length), [{ group: 8, address: 0x8000 }]);
  for (const offset of [0x0, 0x10, 0x40, 0x41, 0x50]) assert.ok(inferred.has(page8 + offset), `偏移 ${offset.toString(16)}`);
  assert.ok(!inferred.has(page8 + 3));
  assert.ok(!inferred.has(page8 + 5));
});

test('换页区地址没有页组时无法追踪', () => {
  const rom = new Uint8Array(512 * 1024).fill(0xea);
  assert.equal(extendCdl(rom, new Uint8Array(rom.length), [0x8000]).inferred.size, 0);
});

test('JSR 到“不返回”的例程时，不再顺序追踪 JSR 之后的内联数据', () => {
  const rom = new Uint8Array(512 * 1024);
  const kernel = 0x4000;
  // $C000: JSR $C010 / 其后是内联数据 EA EA / $C010: RTS
  rom.set([0x20, 0x10, 0xc0, 0xea, 0xea], kernel);
  rom[kernel + 0x10] = 0x60;
  const withReturn = extendCdl(rom, new Uint8Array(rom.length), [0xc000]);
  assert.ok(withReturn.inferred.has(kernel + 3));
  const withoutReturn = extendCdl(rom, new Uint8Array(rom.length), [0xc000], { noReturn: [0xc010] });
  assert.ok(!withoutReturn.inferred.has(kernel + 3));
  assert.ok(withoutReturn.inferred.has(kernel + 0x10));
});

/** 构造一条 $FF16 调用记录：$0639 起 7 字节与 $0010 起 2 字节 */
function callText(fn, group, handler) {
  return [
    'C pc=FF16 a=00 x=00 y=00 s=FB p=A1 F=1',
    'STK 00 00 00 00 00 00 00 00',
    `M 0639 ${group.toString(16)} 00 00 00 00 ${fn.toString(16)} 00`,
    `M 0010 ${(handler & 0xff).toString(16)} ${(handler >> 8).toString(16)}`,
    '',
  ].join('\n');
}

test('分流核对：与规则一致时通过，处理例程或页组不符时报告', () => {
  const rom = sampleRom();
  const good = parseCallLog(callText(0x10, 0x78, 0xe153) + callText(0x3b, 0x08, 0x8000));
  const ok = verifyDispatch(good, rom);
  assert.deepEqual([ok.checked, ok.mismatches.length], [2, 0]);
  assert.equal(ok.observed.get(0x10).count, 1);

  const bad = parseCallLog(callText(0x10, 0x78, 0xe000) + callText(0x3b, 0x09, 0x8000));
  const result = verifyDispatch(bad, rom);
  assert.equal(result.mismatches.length, 2);
  assert.match(result.mismatches.join('\n'), /处理例程应为 \$E153/);
  assert.match(result.mismatches.join('\n'), /页组应为 \$8/);
});

test('RAM 表功能号只记录不核对', () => {
  const result = verifyDispatch(parseCallLog(callText(0x05, 0x40, 0x9000)), sampleRom());
  assert.deepEqual([result.checked, result.skipped, result.mismatches.length], [0, 1, 0]);
});

/** 构造页组 8 的入口：$8000 处的 LDA $063E / SEC / SBC #$3B / JSR $8011，其后是 4 项地址表 */
function bankedEntryRom() {
  const rom = new Uint8Array(512 * 1024);
  rom.set([0xad, 0x3e, 0x06, 0x38, 0xe9, 0x3b, 0x20, 0x11, 0x80, 0x00, 0x81, 0x00, 0x82, 0x00, 0x83, 0x00, 0x84], 0x8000);
  return rom;
}

test('读取换页入口的内联表，项数由表后的例程位置决定', () => {
  const targets = readInlineTable(bankedEntryRom(), 8, 0x8000);
  assert.deepEqual(targets.map((t) => [t.fn, t.address]), [[0x3b, 0x8100], [0x3c, 0x8200], [0x3d, 0x8300], [0x3e, 0x8400]]);
  assert.deepEqual(readInlineTable(new Uint8Array(512 * 1024), 8, 0x8000), []);
});

test('读取二级子功能表，入口可以先 JMP 到真正的一级入口', () => {
  const rom = new Uint8Array(512 * 1024);
  // $8000: JMP $8100 / $8100: 一级入口（表只有一项，指向 $8110）
  rom.set([0x4c, 0x00, 0x81], 0x8000);
  rom.set([0xa9, 0x00, 0x8d, 0x00, 0x63, 0x38, 0xad, 0x3e, 0x06, 0xe9, 0x7b, 0x20, 0x00, 0xac, 0x10, 0x81], 0x8100);
  // $8110: 二级入口，最大子功能号 2，子功能表在 $8120
  rom.set([0xa9, 0x02, 0xcd, 0x3f, 0x06, 0xb0, 0x03, 0x4c, 0x00, 0x90, 0xad, 0x3f, 0x06, 0x20, 0x00, 0xac], 0x8110);
  rom.set([0x00, 0x91, 0x00, 0x92, 0x00, 0x93], 0x8116 + 10);
  const [target] = readInlineTable(rom, 8, 0x8000);
  assert.deepEqual([target.fn, target.address], [0x7b, 0x8110]);
  assert.deepEqual(target.subs, [{ sub: 0, address: 0x9100 }, { sub: 1, address: 0x9200 }, { sub: 2, address: 0x9300 }]);
});

test('系统调用文档里换页功能使用入口表里的例程，表外的功能号单独标明', () => {
  const rom = bankedEntryRom();
  const map = [dispatchEntry(rom, 0x3b), dispatchEntry(rom, 0x3f)].map((e) => ({ ...e, group: 8 }));
  const banked = readAllInlineTables(rom, map);
  const text = renderApiDoc(map, [], null, banked, [{ fn: 0x3b, name: 'API_3B_X', summary: '示例' }]);
  assert.match(text, /\| \$3B \| 换页后进入（入口表） \| \$08 \| \$8100 \| API_3B_X \| 示例 \| - \|/);
  assert.match(text, /\| \$3F \| 换页后进入（入口表） \| \$08 \| 表外 \|/);
});

test('系统调用文档包含有说明的功能、不含桩例程，并带上实测次数', () => {
  const rom = sampleRom();
  const symbols = [{ address: 0xe153, name: 'API_10_X', summary: '示例说明' }, { address: 0xfd8e, name: 'SYSCALL_DISPATCH', summary: '分发器' }];
  const text = renderApiDoc(buildDispatchMap(rom), symbols, new Map([[0x10, { count: 7 }]]));
  assert.match(text, /\| \$10 \| 内核 ROM 表 \| - \| \$E153 \| API_10_X \| 示例说明 \| 7 \|/);
  assert.doesNotMatch(text, /\| \$11 \|/);
  assert.match(text, /\| \$FD8E \| SYSCALL_DISPATCH \| 分发器 \|/);
});
