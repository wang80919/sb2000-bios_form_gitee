// ------------------------------------------------------------------------
// 名称：bios-wav.mjs
// 说明：找出 BIOS ROM 里内嵌的 WAV 语音，并导出成 .wav 文件。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/bios-wav.mjs list；node tools/bios-wav.mjs extract <输出文件>（只有一段时直接导出，多段时输出文件名加序号）。
//       目前 ROM 里只有一段：从第 $64 页起，单声道、8 位 PCM、22050 Hz，约 3.7 秒，占到第 $77 页。
//       只做读取与导出，不修改工程：播放代码怎么确定语音长度还没读懂，所以暂不支持替换。
// ------------------------------------------------------------------------
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildBios } from '../../bios/tools/bios-build.mjs';

const INES_HEADER = 16;

/**
 * @typedef {object} WavInfo
 * @property {number} offset ROM 偏移（不含文件头）
 * @property {number} length 整个 WAV 文件的字节数
 * @property {number} channels 声道数
 * @property {number} sampleRate 采样率
 * @property {number} bits 位数
 * @property {number} dataBytes 采样数据的字节数
 */

/**
 * 在 ROM 里找 RIFF/WAVE 头，并读出格式。
 * @param {Uint8Array} rom ROM 内容（不含文件头）
 * @returns {WavInfo[]}
 */
export function findWavs(rom) {
  const buffer = Buffer.from(rom.buffer, rom.byteOffset, rom.byteLength);
  const found = [];
  for (let at = 0; at + 44 <= buffer.length; at++) {
    if (buffer.toString('latin1', at, at + 4) !== 'RIFF' || buffer.toString('latin1', at + 8, at + 12) !== 'WAVE') continue;
    if (buffer.toString('latin1', at + 12, at + 16) !== 'fmt ' || buffer.toString('latin1', at + 36, at + 40) !== 'data') continue;
    const dataBytes = buffer.readUInt32LE(at + 40);
    const length = 44 + dataBytes;
    if (at + length > buffer.length) continue;
    found.push({
      offset: at,
      length,
      channels: buffer.readUInt16LE(at + 22),
      sampleRate: buffer.readUInt32LE(at + 24),
      bits: buffer.readUInt16LE(at + 34),
      dataBytes,
    });
  }
  return found;
}

if (process.argv[1]?.endsWith('bios-wav.mjs')) {
  const [command, outFile] = process.argv.slice(2);
  const rom = buildBios().subarray(INES_HEADER);
  const wavs = findWavs(rom);
  if (command === 'list') {
    for (const wav of wavs) {
      console.log(`ROM 偏移 0x${wav.offset.toString(16)}（第 ${(wav.offset >> 12).toString(16).toUpperCase()} 页起），${wav.length} 字节，${wav.channels} 声道，${wav.bits} 位，${wav.sampleRate} Hz，约 ${(wav.dataBytes / (wav.sampleRate * wav.channels * wav.bits / 8)).toFixed(1)} 秒`);
    }
    if (wavs.length === 0) console.log('没有找到 WAV');
  } else if (command === 'extract' && outFile) {
    wavs.forEach((wav, index) => {
      const target = wavs.length === 1 ? outFile : outFile.replace(/(\.wav)?$/i, `-${index + 1}.wav`);
      writeFileSync(path.resolve(target), rom.subarray(wav.offset, wav.offset + wav.length));
      console.log(`已导出 ${target}`);
    });
  } else {
    console.error('用法：node tools/bios-wav.mjs list  或  extract <输出文件>');
    process.exit(2);
  }
}
