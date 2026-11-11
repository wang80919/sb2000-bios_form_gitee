// ------------------------------------------------------------------------
// 名称：p04-wav.mjs
// 说明：播放 WAV（功能 $65/$0C）与重复播放（$65/$0D）的验证用例，用写入记录核对 DAC、定时器与 APU 状态寄存器。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值按 bios/src/kernel/sound-services.asm（$F7D6-$F934）的代码阅读写成模型。
//       入口：页组 $0642 与 $0C/$0D 指向 WAV 文件头；偏移 $18 的低字节是采样率（$44 取定时器 $4035=$28，$22 取 $51，其他取 $A2），偏移 $28 起 4 字节是数据长度；数据从偏移 $2C 起。
//       长度计数器 $0396-$0399 是长度各字节分别加 1（带进位串联，先 CLC），播放循环逐级递减：总采样数 = n0 + 256×(n1−1) + 65536×(n2−1) + …，其中 nk 为该字节加 1 的结果（0 算 256），所以通常播放“长度 + 1”个采样（多播一个文件尾后的字节）。
//       每个采样：等 $4033 非 0，写 $4032 为 $FF 再 $7F，把采样写 DAC $4027；每次播放开始写 $4034=$C0、$4015=$00，结束写 $4034=$00，再还原中断屏蔽、置 $0499 位 7、$4015=$FF，最后 $4034=$EF、$4035=$3C。
//       $65/$0D：$0652 为重复次数，不为 0 时先调一次 $1B，再重复播放；播完（含次数为 0）再写 $4015=$FF。
// ------------------------------------------------------------------------
import { runCall } from '../../tools/rom-driver.mjs';

const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const toHex = (bytes) => [...bytes].map(hexName).join('');
const SOURCE_PRAM = 0x400;
const WATCH = [0x4027, 0x4032, 0x4034, 0x4035, 0x4015];

/** 按代码里的串联递减循环算出总采样数 */
export function totalSamples(sizeBytes) {
  const counters = [];
  let carry = 0;
  for (const byte of sizeBytes) {
    const sum = byte + 1 + carry;
    counters.push(sum & 0xff);
    carry = sum > 0xff ? 1 : 0;
  }
  let total = 0;
  let weight = 1;
  counters.forEach((counter, index) => {
    const count = counter === 0 ? 256 : counter;
    total += index === 0 ? count : weight * (count - 1);
    if (index === 0) weight = 256;
    else weight *= 256;
  });
  return total;
}

const buildWav = ({ rate, size, samples }) => {
  const header = new Array(44).fill(0);
  header[0x18] = rate;
  size.forEach((byte, i) => { header[0x28 + i] = byte; });
  return [...header, ...samples];
};

const wavCase = (id, title, { rate, size, samples, repeat }) => {
  const wav = buildWav({ rate, size, samples });
  const total = totalSamples(size);
  const timer = rate === 0x44 ? 0x28 : rate === 0x22 ? 0x51 : 0xa2;
  const padded = [...samples, ...new Array(Math.max(0, total - samples.length) + 8).fill(0xee)];
  const plays = repeat ?? 1;
  return {
    id: `wav.${id}`,
    title: `$65/$${repeat === undefined ? '0C' : '0D'} ${title}：采样率字节 $${hexName(rate)}（定时器 $${hexName(timer)}），数据长度字节 ${toHex(size)}，播放 ${total} 个采样${repeat === undefined ? '' : `，重复 ${repeat} 次`}`,
    fresh: true,
    steps: [{
      host: async (client) => {
        await client.send(`write pram ${SOURCE_PRAM.toString(16)} ${toHex([...wav, ...new Array(8).fill(0xee)])}`);
        return runCall(client, {
          func: 0x65,
          sub: repeat === undefined ? 0x0c : 0x0d,
          mem: [[0x642, [0x80]], [0x0c, [SOURCE_PRAM & 0xff, 0x80 | (SOURCE_PRAM >> 8)]], [0x652, [repeat ?? 0]], [0x62f, [0x5a]]],
          read: [[0x499, 1], [0x62f, 1]],
          capture: WATCH,
          maxFrames: 2400,
        });
      },
      check: ({ data: result }) => {
        const problems = [];
        if (!result.done) { problems.push('调用没有返回'); return problems; }
        const dac = result.writes.get(0x4027);
        const want = [];
        for (let i = 0; i < plays; i++) want.push(...padded.slice(0, total));
        if (toHex(dac) !== toHex(want)) problems.push(`DAC $4027 写入 ${dac.length} 个字节，前 16 个 ${toHex(dac.slice(0, 16))}，预期 ${want.length} 个，前 16 个 ${toHex(want.slice(0, 16))}`);
        const timer4034 = result.writes.get(0x4034);
        if (toHex(timer4034) !== toHex(new Array(plays).fill(0).flatMap(() => [0xc0, 0x00, 0xef]))) problems.push(`$4034 写入 ${toHex(timer4034)}`);
        const timer4035 = result.writes.get(0x4035);
        if (toHex(timer4035) !== toHex(new Array(plays).fill(0).flatMap(() => [timer, 0x3c]))) problems.push(`$4035 写入 ${toHex(timer4035)}`);
        const status = result.writes.get(0x4015);
        const wantStatus = repeat === undefined ? [0x00, 0xff] : [...new Array(plays).fill(0).flatMap(() => [0x00, 0xff]), 0xff];
        if (toHex(status) !== toHex(wantStatus)) problems.push(`$4015 写入 ${toHex(status)}，预期 ${toHex(wantStatus)}`);
        if (plays > 0 && (result.memory.get(0x499)[0] & 0x80) === 0) problems.push('$0499 位 7 没有置位');
        return problems;
      },
    }],
  };
};

export const cases = [
  wavCase('rate44', '采样率 44100 Hz', { rate: 0x44, size: [3, 0, 0, 0], samples: [0x10, 0x20, 0x30, 0x40] }),
  wavCase('rate22', '采样率 22050 Hz', { rate: 0x22, size: [5, 0, 0, 0], samples: [0x80, 0x01, 0xfe, 0x7f, 0x55, 0xaa] }),
  wavCase('rate-other', '其他采样率按 11025 Hz', { rate: 0x2b, size: [2, 0, 0, 0], samples: [0x11, 0x22, 0x33] }),
  wavCase('one', '长度 0（实际播放 1 个采样）', { rate: 0x44, size: [0, 0, 0, 0], samples: [0x99] }),
  wavCase('len256', '长度 $0100（播放 257 个采样）', { rate: 0x44, size: [0, 1, 0, 0], samples: Array.from({ length: 257 }, (_, i) => (i * 5 + 3) & 0xff) }),
  wavCase('carry', '长度低字节 $FF：加 1 溢出进位串到下一字节', { rate: 0x44, size: [0xff, 0, 0, 0], samples: Array.from({ length: 520 }, (_, i) => (i * 3 + 1) & 0xff) }),
  wavCase('repeat', '重复播放 3 次', { rate: 0x44, size: [3, 0, 0, 0], samples: [0x10, 0x20, 0x30, 0x40], repeat: 3 }),
  wavCase('repeat0', '重复 0 次：只写 APU 状态', { rate: 0x44, size: [3, 0, 0, 0], samples: [0x10, 0x20, 0x30, 0x40], repeat: 0 }),
];
