// ------------------------------------------------------------------------
// 名称：bios-wav.test.mjs
// 说明：测试在 ROM 里查找 WAV 头与读出格式。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：运行 npm test；用合成的小 ROM，再用真实 ROM 核对内嵌的那一段
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { findWavs } from '../tools/bios-wav.mjs';
import { BIOS_ROM } from '../tools/config.mjs';

/** 造一个 44 字节头加 dataBytes 字节采样的 WAV */
function makeWav(dataBytes, sampleRate = 22050) {
  const wav = Buffer.alloc(44 + dataBytes, 0x80);
  wav.write('RIFF', 0, 'latin1');
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write('WAVEfmt ', 8, 'latin1');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate, 28);
  wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34);
  wav.write('data', 36, 'latin1');
  wav.writeUInt32LE(dataBytes, 40);
  return wav;
}

test('findWavs：找出 WAV 的位置、长度与格式', () => {
  const rom = Buffer.alloc(1000);
  makeWav(100, 11025).copy(rom, 200);
  const [wav, ...rest] = findWavs(rom);
  assert.equal(rest.length, 0);
  assert.deepEqual(wav, { offset: 200, length: 144, channels: 1, sampleRate: 11025, bits: 8, dataBytes: 100 });
});

test('findWavs：数据长度超出 ROM、或缺少 fmt、data 标记时不算', () => {
  const rom = Buffer.alloc(300);
  makeWav(500).copy(rom, 0, 0, 300);
  assert.deepEqual(findWavs(rom), []);
  const broken = makeWav(10);
  broken.write('xxxx', 12, 'latin1');
  assert.deepEqual(findWavs(Buffer.concat([broken, Buffer.alloc(10)])), []);
});

test('真实 ROM：第 $64 页起有一段 22050 Hz、8 位、单声道、81233 字节采样的 WAV', { skip: !existsSync(BIOS_ROM) }, () => {
  const rom = readFileSync(BIOS_ROM).subarray(16);
  assert.deepEqual(findWavs(rom), [{ offset: 0x64000, length: 81277, channels: 1, sampleRate: 22050, bits: 8, dataBytes: 81233 }]);
});
