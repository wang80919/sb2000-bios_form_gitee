// ------------------------------------------------------------------------
// 名称：decode-song.test.mjs
// 说明：测试 decode-song.mjs 对曲子头、音符、命令参数长度和音轨结束的解析，并核对页 78 的两段提示音。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：页 78 的曲子在 ROM 偏移 $78445、$78456，各 17 字节
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRom } from '../tools/decode-img.mjs';
import { decodeSong } from '../tools/decode-song.mjs';

test('decodeSong：曲子头、声道项与音符、命令参数', () => {
  const rom = Buffer.from([
    0x10, 0x00, 0x08, 0x00, 0x01, 0x0d, 0x00, 0xff, // 优先级 $10，声道 0 偏移 8，声道 1 偏移 $0D
    0x20, 0x45, 0xc5, 0x07, 0xd3, // 声道 0：时长 $20、音符 $45、命令 $C5（1 个参数）、命令 $D3 结束
    0x84, 0x33, 0xd3, // 声道 1：音符 $84（声道号小于 4，带 1 个附加字节 $33）、结束
  ]);
  const song = decodeSong(rom, 0);
  assert.equal(song.priority, 0x10);
  assert.deepEqual(song.tracks.map((t) => [t.channel, t.offset]), [[0, 8], [1, 13]]);
  assert.deepEqual(song.tracks[0].events.map((e) => [e.kind, e.byte, e.params ?? []]), [
    ['duration', 0x20, []], ['note', 0x45, []], ['command', 0xc5, [0x07]], ['command', 0xd3, []],
  ]);
  assert.deepEqual(song.tracks[1].events.map((e) => [e.kind, e.byte, e.params]), [['note', 0x84, [0x33]], ['command', 0xd3, []]]);
});

test('decodeSong：声道 4 以上的音符没有附加字节，计数循环取 3 个参数', () => {
  const rom = Buffer.from([0x01, 0x05, 0x05, 0x00, 0xff, 0x85, 0xce, 0x02, 0x00, 0x00, 0xd3]);
  const events = decodeSong(rom, 0).tracks[0].events;
  assert.deepEqual(events.map((e) => [e.byte, e.params]), [[0x85, []], [0xce, [2, 0, 0]], [0xd3, []]]);
});

test('页 78 的两段提示音：单声道，写 APU 寄存器 +0 至 +3 后触发、等待、结束', () => {
  const rom = loadRom();
  const first = decodeSong(rom, 0x78445);
  assert.equal(first.priority, 0x40);
  assert.deepEqual(first.tracks.map((t) => [t.channel, t.offset]), [[5, 5]]);
  assert.deepEqual(first.tracks[0].events.map((e) => [e.byte, ...(e.params ?? [])]), [
    [0xe3, 0x8f], [0xe0, 0xf9], [0xe1, 0xbf], [0xe2, 0x0b], [0xe4], [0x20], [0xcb], [0xd3],
  ]);
  const second = decodeSong(rom, 0x78456);
  assert.deepEqual(second.tracks.map((t) => [t.channel, t.offset]), [[6, 5]]);
  assert.deepEqual(second.tracks[0].events.map((e) => [e.byte, ...(e.params ?? [])]), [
    [0xe3, 0x09], [0xe0, 0x00], [0xe1, 0x40], [0xe2, 0x00], [0xe4], [0x02], [0xcb], [0xd3],
  ]);
});

test('内核里 $D321 的曲子：两个音效声道，计数循环的跳转偏移都落在事件起点上', () => {
  const song = decodeSong(loadRom(), 0x5321);
  assert.equal(song.priority, 0x4f);
  assert.deepEqual(song.tracks.map((t) => [t.channel, t.offset]), [[5, 8], [7, 0x18]]);
  for (const track of song.tracks) {
    const starts = new Set(track.events.map((e) => e.at));
    assert.equal(track.events.at(-1).byte, 0xd3);
    for (const e of track.events.filter((x) => x.byte === 0xce)) assert.ok(starts.has(e.params[1] | (e.params[2] << 8)));
  }
});
