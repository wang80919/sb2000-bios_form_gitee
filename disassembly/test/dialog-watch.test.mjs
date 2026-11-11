// ------------------------------------------------------------------------
// 名称：dialog-watch.test.mjs
// 说明：测试对话框监视脚本的生成，以及 rom-driver 对 io 记录里端口写入的解析。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：不启动 PowerShell，也不连接模拟器。
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWatchScript } from '../tools/dialog-watch.mjs';
import { parseIoWrites } from '../tools/rom-driver.mjs';

test('监视脚本带上进程名，并分别处理打印对话框与其他对话框', () => {
  const script = buildWatchScript('VirtuaNES');
  assert.match(script, /\$name = 'VirtuaNES'/);
  assert.match(script, /Print to\*/);
  assert.match(script, /0x111/);
  assert.match(script, /0x10,/);
  // 脚本全部是 ASCII，才能放心用 -EncodedCommand 传给 PowerShell 5.1
  assert.ok(![...script].some((c) => c.charCodeAt(0) > 127));
});

test('parseIoWrites 只保留指定地址的写入，按顺序汇总，忽略读取行', () => {
  const text = ['W 4025 1B pc=8000', 'R 4017 08 pc=8003', 'W 4026 04 pc=8005', 'W 4025 40 pc=8007', 'W 2000 80 pc=8009', ''].join('\n');
  const writes = parseIoWrites(text, [0x4025, 0x4026]);
  assert.deepEqual(writes.get(0x4025), [0x1b, 0x40]);
  assert.deepEqual(writes.get(0x4026), [0x04]);
  assert.equal(writes.has(0x2000), false);
});
