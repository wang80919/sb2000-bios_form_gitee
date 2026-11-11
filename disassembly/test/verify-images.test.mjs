// ------------------------------------------------------------------------
// 名称：verify-images.test.mjs
// 说明：测试验证用例的特制镜像辅助 verify/lib/images.mjs：簇内容互不相同、withImage 生成能被 FAT12 读取器读回的镜像并带上 prepareImage。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：这些镜像是 diskcopy、碎片、磁盘写满等用例的输入，先确认它们自己是对的。
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CLUSTER, file, pattern, withImage } from '../verify/lib/images.mjs';
import { parseFat12 } from '../verify/lib/fat12.mjs';

test('pattern 长度是簇数 × 512，相同种子结果相同，不同种子或不同簇的内容不同', () => {
  const a = pattern(1, 3);
  assert.equal(a.length, 3 * CLUSTER);
  assert.ok(a.equals(pattern(1, 3)));
  assert.ok(!a.equals(pattern(2, 3)));
  assert.ok(!a.subarray(0, CLUSTER).equals(a.subarray(CLUSTER, 2 * CLUSTER)));
});

test('withImage 生成的镜像能读回文件内容，并带上 fresh、freshAfter 与写镜像的 prepareImage', () => {
  const data = pattern(5, 4);
  const spec = withImage({ id: 'x' }, [file('A.BIN', data)]);
  assert.equal(spec.fresh, true);
  assert.equal(spec.freshAfter, true);
  const fat = parseFat12(spec.image);
  const [entry] = fat.listRoot().filter((e) => (e.attr & 0x08) === 0);
  assert.ok(fat.readFile(entry).equals(data));
  const dir = mkdtempSync(path.join(tmpdir(), 'images-test-'));
  try {
    const target = path.join(dir, 'disk.img');
    spec.prepareImage({ image: target });
    assert.ok(readFileSync(target).equals(spec.image));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
