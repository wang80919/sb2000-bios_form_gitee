// ------------------------------------------------------------------------
// 名称：screen-text.test.mjs
// 说明：测试屏幕文字抓取辅助 verify/lib/screen-text.mjs 的解析：从 calllog 文件还原每次显示的字符串，覆盖外壳字符串区、ROM 消息区、GBK 汉字、区外指针与重复合并。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：calllog 文件是按调用顺序的文本记录，格式见 fcdev 仓库 virtuanes/VirtuaNES/DebugServer.cpp 的 CmdCallLog；这里按同一格式手工拼出样例。
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import test from 'node:test';
import { collapseRepeats, parsePrintLog } from '../verify/lib/screen-text.mjs';

/** 拼一条调用记录：指针、外壳字符串区（$6300 起 64 字节）、消息区（$B000 起 64 字节） */
function record(pointer, shell, message) {
  const hex = (bytes, size) => [...Buffer.concat([Buffer.from(bytes), Buffer.alloc(size)]).subarray(0, size)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  return [
    'C pc=8262 a=00 x=00 y=00 s=FF p=00 F=1',
    'STK 00 00 00 00 00 00 00 00',
    `M 004B ${(pointer & 0xff).toString(16).padStart(2, '0')} ${(pointer >> 8).toString(16).padStart(2, '0')}`,
    `M 6300 ${hex(shell, 64)}`,
    `M B000 ${hex(message, 64)}`,
  ].join('\n');
}

/** UTF-8 的汉字转 GBK 字节（样例用 GB2312 编码的“目录”） */
const GBK_MULU = [0xc4, 0xbf, 0xc2, 0xbc];

test('指针在外壳字符串区时取该处到 0 结尾的字符串', () => {
  const shell = Buffer.alloc(64);
  Buffer.from('abc\0').copy(shell, 0x12);
  const text = record(0x6312, shell, []);
  assert.deepEqual(parsePrintLog(text), ['abc']);
});

test('指针在 ROM 消息区时从消息区取字符串，并按 GBK 解码汉字', () => {
  const message = Buffer.alloc(64);
  Buffer.from([...GBK_MULU, 0]).copy(message, 4);
  assert.deepEqual(parsePrintLog(record(0xb004, [], message)), ['目录']);
});

test('指针不在两个窗口里时记为外部', () => {
  assert.deepEqual(parsePrintLog(record(0x9000, [], [])), ['<外部 $9000>']);
});

test('按调用顺序还原多条记录', () => {
  const shell = Buffer.alloc(64);
  Buffer.from('one\0two\0').copy(shell, 0);
  const text = [record(0x6300, shell, []), record(0x6304, shell, [])].join('\n');
  assert.deepEqual(parsePrintLog(text), ['one', 'two']);
});

test('连续相同的字符串合并成一条，不相邻的相同字符串保留', () => {
  assert.deepEqual(collapseRepeats(['a', 'a', 'a', 'b', 'a', 'a']), ['a', 'b', 'a']);
  assert.deepEqual(collapseRepeats([]), []);
});
