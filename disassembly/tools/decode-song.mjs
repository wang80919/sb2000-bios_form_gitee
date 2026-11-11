// ------------------------------------------------------------------------
// 名称：decode-song.mjs
// 说明：按 BIOS 声音引擎（页 04 的 SOUND_START_TRACKS 与音轨解释器 $C4DC-$CA9D）的格式解析曲子数据，列出各声道的音轨事件。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/decode-song.mjs <曲子的 ROM 偏移，十六进制，不含 16 字节文件头>；例如页 78 开机提示音 78445、78456。
//       曲子 = 优先级(1 字节，$00-$7F) + 若干声道项 [声道号, 音轨偏移低, 偏移高]（偏移相对曲子首字节）+ 以 $80 以上字节结尾；音轨紧随其后。
//       音轨字节：$00-$3F 时长，$40-$BF 音符（声道号小于 4 且位 7 为 1 时后跟 1 字节），$C0-$E5 命令，参数个数见 COMMANDS。
//       全部来自代码阅读，没有在模拟器里听音核对；命令的含义只写读出的内部状态变化。
// ------------------------------------------------------------------------
import { loadRom } from './decode-img.mjs';

/** 命令 $C0+序号 的参数字节数与说明（序号 = 命令字节 − $C0） */
export const COMMANDS = [
  { len: 1, text: '写 $03EF，置 $03C3 位 5' },
  { len: 1, text: '把参数加上 $03EF 后写入 $03EF，置 $03C3 位 5' },
  { len: 1, text: '写 $03F7' },
  { len: 1, text: '加到 $03F7（带进位处理）' },
  { len: 1, text: '写 $03FF' },
  { len: 1, text: '加到 $03FF' },
  { len: 1, text: '写 $0443' },
  { len: 1, text: '写 $043F 并重算长度' },
  { len: 1, text: '写 $043B' },
  { len: 0, text: '休止并置位本声道在 $03A3 里的位' },
  { len: 0, text: '置 $03C3 位 4' },
  { len: 0, text: '置 $03C3 位 7（本音轨结束标记）' },
  { len: 1, text: '写节拍 $03D4/$03D5' },
  { len: 2, text: '写噪声或音色参数（两个参数）' },
  { len: 3, text: '计数循环 1：计数、跳转偏移 16 位' },
  { len: 3, text: '计数循环 2：计数、跳转偏移 16 位' },
  { len: 0, text: '停止整首曲子' },
  { len: 4, text: '设置循环点（两个 16 位偏移）' },
  { len: 0, text: '回到循环点' },
  { len: 0, text: '停止本声道（音轨结束）' },
  { len: 1, text: '写 $0469+4×声道+1' },
  { len: 0, text: '关闭 APU、置 $0499 位 6' },
  { len: 0, text: '置 $03CB 位 3、$03C3 位 7' },
  { len: 0, text: '清 $03CB 位 3、置 $03C3 位 7' },
  { len: 1, text: '写 $0447' },
  { len: 1, text: '嵌套播放曲表中的另一首（曲号）' },
  { len: 1, text: '写 $0427，置 $03CB 位 1' },
  { len: 4, text: '包络参数（声道号小于 3）' },
  { len: 0, text: '置 $03CB 位 4' },
  { len: 0, text: '清 $03CB 位 4' },
  { len: 1, text: '写 $048F 与 $03B7' },
  { len: 2, text: '跳转：16 位偏移' },
  { len: 1, text: '音效声道（序号 ≥ 4）写 APU 寄存器 $4000+4×(声道号&3)+1' },
  { len: 1, text: '音效声道写 APU 寄存器 +2' },
  { len: 1, text: '音效声道写 APU 寄存器 +3' },
  { len: 1, text: '音效声道写 APU 寄存器 +0' },
  { len: 0, text: '置 $03C3 位 1（刷新时写音效寄存器 2、3）、清位 7（取消本次关声）' },
  { len: 0, text: '置 $0394=$80' },
];

/** 一首曲子里，这些命令之后音轨不再继续 */
const END_COMMANDS = new Set([0xd0, 0xd3]);

/**
 * 解析一首曲子
 * @param {Buffer} rom 不含文件头的 ROM
 * @param {number} offset 曲子首字节的 ROM 偏移
 * @returns {{priority: number, tracks: {channel: number, offset: number, events: object[]}[], headerEnd: number}}
 */
export function decodeSong(rom, offset) {
  const priority = rom[offset];
  if (priority >= 0x80 || rom[offset + 1] >= 0x80) throw new Error('不支持的曲子头（首字节或次字节位 7 为 1）');
  const tracks = [];
  let p = offset + 1;
  while (rom[p] < 0x80) {
    tracks.push({ channel: rom[p], offset: rom[p + 1] | (rom[p + 2] << 8), events: [] });
    p += 3;
  }
  for (const track of tracks) track.events = decodeTrack(rom, offset, track.channel, track.offset);
  return { priority, tracks, headerEnd: p + 1 };
}

/** 解析一条音轨，遇到停止类命令或超过 4096 个事件为止 */
function decodeTrack(rom, base, channel, trackOffset) {
  const events = [];
  let p = base + trackOffset;
  while (events.length < 4096) {
    const at = p - base;
    const byte = rom[p++];
    if (byte < 0x40) {
      events.push({ at, kind: 'duration', byte });
    } else if (byte < 0xc0) {
      const note = { at, kind: 'note', byte, params: [] };
      if (channel < 4 && byte & 0x80) note.params.push(rom[p++]);
      events.push(note);
    } else {
      const command = COMMANDS[byte - 0xc0];
      if (!command) {
        events.push({ at, kind: 'unknown', byte, params: [] });
        break;
      }
      const params = [];
      for (let i = 0; i < command.len; i++) params.push(rom[p++]);
      events.push({ at, kind: 'command', byte, params, text: command.text });
      if (END_COMMANDS.has(byte)) break;
    }
  }
  return events;
}

/** 把事件格式化成文本行 */
export function formatEvent(event) {
  const hex = (v) => v.toString(16).toUpperCase().padStart(2, '0');
  const params = event.params?.length ? ` ${event.params.map(hex).join(' ')}` : '';
  const label = { duration: '时长', note: '音符', command: '命令', unknown: '未知' }[event.kind];
  return `+${event.at.toString(16).toUpperCase().padStart(4, '0')}  ${hex(event.byte)}${params}  ${label}${event.text ? ` ${event.text}` : ''}`;
}

if (process.argv[1]?.endsWith('decode-song.mjs')) {
  const arg = process.argv[2];
  if (!arg) {
    console.error('用法：node tools/decode-song.mjs <曲子的 ROM 偏移（十六进制）>');
    process.exit(1);
  }
  const song = decodeSong(loadRom(), parseInt(arg, 16));
  console.log(`优先级 $${song.priority.toString(16)}，${song.tracks.length} 个声道`);
  for (const track of song.tracks) {
    console.log(`声道 ${track.channel}（音轨偏移 +${track.offset.toString(16)}）`);
    for (const event of track.events) console.log(`  ${formatEvent(event)}`);
  }
}
