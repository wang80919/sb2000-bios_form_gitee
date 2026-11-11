// ------------------------------------------------------------------------
// 名称：fat12-reader.test.mjs
// 说明：测试验证用的独立 FAT12 读取器 verify/lib/fat12.mjs：用 tools/fat12-image.mjs 生成的镜像核对目录项、簇链、文件内容、空闲簇与两份 FAT 的一致性。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：读取器是写盘用例的“独立预期来源”，所以要先确认它自己是对的：这里用生成器已知的文件大小与内容反过来验证。
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFat12Image } from '../tools/fat12-image.mjs';
import { parseFat12 } from '../verify/lib/fat12.mjs';

const small = Buffer.from('hello\r\n');
const big = Buffer.alloc(1300, 0).map((_, i) => i % 251);

const image = buildFat12Image([
  { name: 'SMALL.TXT', data: small, mtime: new Date(1998, 0, 1, 0, 0, 16) },
  { name: 'BIG.BIN', data: big, mtime: new Date(1998, 0, 1, 0, 0, 16) },
], { label: 'TESTDISK' });

test('读出 1.44MB 镜像的引导扇区参数', () => {
  const fat = parseFat12(image);
  assert.equal(fat.bytesPerSector, 512);
  assert.equal(fat.sectorsPerCluster, 1);
  assert.equal(fat.clusterCount, 2847);
});

test('根目录项、大小与内容与生成时一致', () => {
  const fat = parseFat12(image);
  const files = fat.listRoot().filter((e) => (e.attr & 0x08) === 0);
  assert.deepEqual(files.map((e) => [e.name83, e.size]), [['SMALL   TXT', small.length], ['BIG     BIN', big.length]]);
  assert.ok(fat.readFile(files[0]).equals(small));
  assert.ok(fat.readFile(files[1]).equals(big));
});

test('簇链长度按 512 字节一簇向上取整，链尾项 >= $FF8，空闲簇相应减少', () => {
  const fat = parseFat12(image);
  const [, bigEntry] = fat.listRoot().filter((e) => (e.attr & 0x08) === 0);
  const chain = fat.chain(bigEntry.cluster);
  assert.equal(chain.length, Math.ceil(big.length / 512));
  assert.ok(fat.fatEntry(chain.at(-1)) >= 0xff8);
  assert.equal(fat.freeClusters(), fat.clusterCount - 1 - chain.length);
  assert.equal(fat.fatCopiesMatch(), true);
});

test('bootSector 是整个引导扇区（512 字节，末尾 $55 $AA），其中卷序列号在偏移 39', () => {
  const fat = parseFat12(image);
  assert.equal(fat.bootSector.length, 512);
  assert.equal(fat.bootSector[510], 0x55);
  assert.equal(fat.bootSector[511], 0xaa);
  assert.equal(fat.bootSector.readUInt32LE(39), Buffer.from(image).readUInt32LE(39));
});

test('listDir 读出子目录簇里的目录项（含 "." 与 ".."），遇到空项停止，跳过已删除项', () => {
  const copy = Buffer.from(image);
  const fat = parseFat12(copy);
  const cluster = 2000;
  const at = fat.dataStart + (cluster - 2) * 512;
  const put = (index, name, attr, start, size) => {
    copy.fill(0, at + index * 32, at + index * 32 + 32);
    copy.write(name, at + index * 32, 'latin1');
    copy[at + index * 32 + 11] = attr;
    copy.writeUInt16LE(start, at + index * 32 + 26);
    copy.writeUInt32LE(size, at + index * 32 + 28);
  };
  put(0, '.          ', 0x10, cluster, 0);
  put(1, '..         ', 0x10, 0, 0);
  put(2, 'GONE    TXT', 0x20, 7, 1);
  copy[at + 64] = 0xe5;
  put(3, 'X       TXT', 0x20, 5, 9);
  const entries = parseFat12(copy).listDir(cluster);
  assert.deepEqual(entries.map((e) => [e.name83, e.attr, e.cluster, e.size]), [
    ['.          ', 0x10, cluster, 0],
    ['..         ', 0x10, 0, 0],
    ['X       TXT', 0x20, 5, 9],
  ]);
});
