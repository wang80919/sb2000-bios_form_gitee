// ------------------------------------------------------------------------
// 名称：config.test.mjs
// 说明：测试官方软盘的取用：reference/floppy-images 里 22 张镜像都是 1.44MB 的原始镜像（引导签名 55AA），能按盘号取到。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：读取仓库里真实的 reference/floppy-images。
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { officialImage, officialImages } from '../tools/config.mjs';

const FLOPPY_BYTES = 1474560;
const BOOT_SIGNATURE_OFFSET = 510;

test('官方软盘共 22 张，盘号 0-21', () => {
  assert.deepEqual(officialImages().map((image) => image.number), Array.from({ length: 22 }, (_, i) => i));
});

test('每张官方软盘都是 1.44MB 的原始镜像，引导扇区签名正确', () => {
  for (const { number, file } of officialImages()) {
    const image = readFileSync(file);
    assert.equal(image.length, FLOPPY_BYTES, `盘 ${number} 大小`);
    assert.equal(image.readUInt16LE(BOOT_SIGNATURE_OFFSET), 0xaa55, `盘 ${number} 引导签名`);
  }
});

test('按盘号取镜像路径，盘号不存在时报错', () => {
  assert.match(officialImage(1), /FLPPY1WPS/);
  assert.match(officialImage(20), /FLPPY20/);
  assert.throws(() => officialImage(99), /官方软盘 99/);
});
