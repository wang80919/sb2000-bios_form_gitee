// ------------------------------------------------------------------------
// 名称：p04-sound-ctl.mjs
// 说明：声音服务的停止（$65/$02）与参数调整（$65/$06、$07、$08）的验证用例，核对 $0393-$04A3 的全部字节。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值按 bios/src/kernel/sound-services.asm（$F3A4-$F439）的代码阅读写成模型。
//       $65/$02：先以曲号 $FC 复位（保留 $03BC，APU 状态写 $00 与 $0F），再以曲号 $FD 起播（$0499 置位 6，$03BC 取 $03BB 即 0，APU 状态写 $00），$0499 位 7 清 0，关声音更新，$03A1 置 $FF。
//       $65/$06-$08：$03A4 分别置 0、1、3，$0499 位 7 先清后置（净结果置位），把 $0653 加到 $03FF + 2×子功能号（即 $040B、$040D、$040F，与声道号无关）。
// ------------------------------------------------------------------------
import { runCall } from '../../tools/rom-driver.mjs';
import { REGION_LENGTH, REGION_START, SoundModel, ZP_LENGTH, pattern } from './p04-sound-start.mjs';

const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const toHex = (bytes) => [...bytes].map(hexName).join('');

const controlCase = (id, title, sub, seed, extra = {}) => {
  const zp = [0x11, 0x22, 0x33, 0x44];
  const region = pattern(seed, REGION_LENGTH);
  if (extra.region) extra.region(region);
  const model = new SoundModel({ zp, region }, [], 0);
  const add = extra.add ?? 0;
  if (sub === 0x02) {
    model.play(0xfc);
    model.play(0xfd);
    model.set(0x499, model.get(0x499) & 0x7f);
    model.set(0x3a1, 0xff);
  } else {
    model.set(0x3a4, { 6: 0, 7: 1, 8: 3 }[sub]);
    model.set(0x499, (model.get(0x499) & 0x7f) | 0x80);
    const address = 0x3ff + sub * 2;
    model.set(address, model.get(address) + add);
  }
  return {
    id: `sound.ctl.${id}`,
    title: `$65/$${hexName(sub)} ${title}`,
    fresh: true,
    steps: [{
      host: (client) => runCall(client, {
        func: 0x65,
        sub,
        mem: [[0x0, zp], [REGION_START, region], [0x653, [add]]],
        read: [[0x0, ZP_LENGTH], [REGION_START, REGION_LENGTH], [0x630, 1]],
        capture: [0x4015],
        maxFrames: 120,
      }),
      check: ({ data: result }) => {
        const problems = [];
        if (!result.done) { problems.push('调用没有返回'); return problems; }
        const got = result.memory.get(REGION_START);
        for (let i = 0; i < REGION_LENGTH; i++) {
          if (got[i] !== model.ram[REGION_START + i]) problems.push(`$${(REGION_START + i).toString(16).toUpperCase()} 为 ${hexName(got[i])}，预期 ${hexName(model.ram[REGION_START + i])}`);
        }
        if (toHex(result.writes.get(0x4015)) !== toHex(model.apu)) problems.push(`$4015 写入 ${toHex(result.writes.get(0x4015))}，预期 ${toHex(model.apu)}`);
        if (sub === 0x02 && (result.memory.get(0x630)[0] & 0x40) !== 0) problems.push('$0630 位 6 没有清除');
        return problems.slice(0, 12);
      },
    }],
  };
};

export const cases = [
  controlCase('stop', '停止播放', 0x02, 5),
  controlCase('stop-keep-3bc', '停止播放保留 $03BC 之前的值后再取 $03BB（$03BC 预设非 0）', 0x02, 9, { region: (region) => { region[0x3bc - REGION_START] = 0x66; region[0x3bb - REGION_START] = 0x77; } }),
  controlCase('adjust-06', '$03A4 置 0，$0653（$05）加到 $040B', 0x06, 2, { add: 5 }),
  controlCase('adjust-07', '$03A4 置 1，$0653（$FE）加到 $040D（溢出丢弃）', 0x07, 4, { add: 0xfe }),
  controlCase('adjust-08', '$03A4 置 3，$0653（$10）加到 $040F', 0x08, 6, { add: 0x10 }),
];
