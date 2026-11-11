// ------------------------------------------------------------------------
// 名称：rom-driver.test.mjs
// 说明：测试用例驱动库的纯函数部分：桩代码生成、十六进制转换、预期核对、命令行参数解析，以及验证用的浮点数编码。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：不连接模拟器；与模拟器交互的部分由 verify-run.mjs 实测。
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import test from 'node:test';
import { STUB_ADDRESS, buildStub, checkExpect, toBytes, toHex } from '../tools/rom-driver.mjs';
import { parseCallArgs } from '../tools/rom-call.mjs';
import { decodeFloat, encodeFloat, nearlyEqual } from '../verify/lib/float.mjs';

test('toBytes 接受带空格的十六进制与数组，非法输入抛出异常', () => {
  assert.deepEqual([...toBytes('0A ff 01')], [0x0a, 0xff, 0x01]);
  assert.deepEqual([...toBytes([1, 2])], [1, 2]);
  assert.throws(() => toBytes('0'), /十六进制/);
  assert.throws(() => toBytes('zz'), /十六进制/);
  assert.equal(toHex([0x0a, 0xff]), '0AFF');
});

test('buildStub 按功能号调用 $FFF0，并以原地循环结尾', () => {
  const { bytes, loop } = buildStub({ func: 0x4b, sub: 2, a: 5, x: 6, y: 7 });
  assert.deepEqual([...bytes], [
    0xa9, 0x4b, 0x8d, 0x3e, 0x06, 0xa9, 0x02, 0x8d, 0x3f, 0x06,
    0xa2, 0x06, 0xa0, 0x07, 0xa9, 0x05,
    0x20, 0xf0, 0xff,
    0x4c, (STUB_ADDRESS + 19) & 0xff, (STUB_ADDRESS + 19) >> 8,
  ]);
  assert.equal(loop, STUB_ADDRESS + 19);
});

test('buildStub 给了 addr 时直接调用该地址，不设置功能号', () => {
  const { bytes, loop } = buildStub({ addr: 0xe000 });
  assert.deepEqual([...bytes.subarray(0, 8)], [0xa2, 0, 0xa0, 0, 0xa9, 0, 0x20, 0x00]);
  assert.equal(bytes[8], 0xe0);
  assert.equal(loop, STUB_ADDRESS + 9);
});

test('buildStub 的 sei 选项在调用前后用 PHP、SEI、PLP 屏蔽并恢复 IRQ', () => {
  const { bytes, loop } = buildStub({ func: 0x13, sub: 2, sei: true });
  assert.deepEqual([...bytes], [
    0x08, 0x78,
    0xa9, 0x13, 0x8d, 0x3e, 0x06, 0xa9, 0x02, 0x8d, 0x3f, 0x06,
    0xa2, 0x00, 0xa0, 0x00, 0xa9, 0x00,
    0x20, 0xf0, 0xff,
    0x28,
    0x4c, (STUB_ADDRESS + 22) & 0xff, (STUB_ADDRESS + 22) >> 8,
  ]);
  assert.equal(loop, STUB_ADDRESS + 22);
});

test('checkExpect 报告不符合的位置，缺少读回数据也算问题', () => {
  const memory = new Map([[0x100, Uint8Array.from([1, 2, 3])]]);
  assert.deepEqual(checkExpect(memory, [[0x100, '0102']]), []);
  assert.equal(checkExpect(memory, [[0x100, '0103']]).length, 1);
  assert.equal(checkExpect(memory, [[0x200, '00']]).length, 1);
});

test('parseCallArgs 解析 mem、read 与数字参数', () => {
  const spec = parseCallArgs(['func=4B', 'sub=1', 'mem=069A:640007', 'read=069A:3', 'frames=30']);
  assert.equal(spec.func, 0x4b);
  assert.equal(spec.sub, 1);
  assert.deepEqual(spec.mem, [[0x69a, '640007']]);
  assert.deepEqual(spec.read, [[0x69a, 3]]);
  assert.equal(spec.maxFrames, 30);
  assert.throws(() => parseCallArgs(['abc']), /key=value/);
  assert.throws(() => parseCallArgs(['foo=1']), /未知参数/);
});

test('浮点数编码与实测一致，并能往返', () => {
  assert.equal(toHex(encodeFloat(3.5)), '0200E000000000');
  assert.equal(toHex(encodeFloat(-100.125)), '07FFC840000000');
  assert.equal(decodeFloat(Uint8Array.from([0, 0, 0x40, 0, 0, 0, 0])), 0.25);
  assert.ok(nearlyEqual(decodeFloat(encodeFloat(123.456)), 123.456, 1e-9));
  assert.throws(() => encodeFloat(0), /非零/);
});
