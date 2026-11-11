// ------------------------------------------------------------------------
// 名称：p00-shell-video.mjs
// 说明：外壳显示复位例程 SHELL_VIDEO_SETUP_1（页组 0 的 $8319，CLS 命令经功能 $25 调用）的验证用例：例程自己依次调用的系统功能，以及写进调色板的 $40 字节。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-10
// 备注：预期值：调用序列取自例程的代码（$3F 画空格字符串、$30 子功能 $0A 与 0 送显存、$5D 写调色板，外加最前面的 $25 本身；中间的 $29 与各功能内部的嵌套调用不核对）；
//       调色板的 $40 字节取自页组 0 窗口 $B15D 起（ROM 偏移 $315D），逐字节核对写进 $2040-$207F 的值，每个寄存器写 1 到 2 次（显示打开、NMI 开启时可能写两次，见 p0b-image.mjs 的 $5D 用例）。
// ------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BIOS_ROM } from '../../tools/config.mjs';
import { ensureOutDir, runCall, toHex } from '../../tools/rom-driver.mjs';
import { assembleProject } from '../../../bios/tools/bios-project.mjs';
import { BIOS_DIR } from '../../tools/config.mjs';

const rom = readFileSync(BIOS_ROM).subarray(16);
const PALETTE_SOURCE = 0x315d;
const palette = rom.subarray(PALETTE_SOURCE, PALETTE_SOURCE + 0x40);
const entry = assembleProject(BIOS_DIR).assembled.symbols.get('SHELL_VIDEO_SETUP_1');
const PALETTE_ADDRESSES = Array.from({ length: 0x40 }, (_, i) => 0x2040 + i);
const hex2 = (value) => value.toString(16).toUpperCase().padStart(2, '0');

/** 读调用日志里每次系统调用的 [功能号, 子功能号]（日志记的是 $063E、$063F） */
const readCalls = (file) => {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const calls = [];
  for (const line of lines) {
    const match = /^M 063E ([0-9A-F]{2}) ([0-9A-F]{2})/.exec(line);
    if (match) calls.push(`${match[1]}/${match[2]}`);
  }
  return calls;
};

export const cases = [{
  id: 'shell.video-setup-1',
  title: 'SHELL_VIDEO_SETUP_1（经 $25 调用页组 0 的 $8319）：依次调用 $3F、$30/$0A、$30/$00、$5D，把页组 0 窗口 $B15D 起的 $40 字节写进调色板',
  fresh: true,
  steps: [{
    host: async (client) => {
      const log = path.join(ensureOutDir('verify'), 'shell-video-calls.log');
      await client.send(`calllog ${log} fff0 63e:2 100`);
      const result = await runCall(client, {
        func: 0x25,
        sub: 0,
        mem: [[0x642, [0x00]], [0x0c, [entry & 0xff, entry >> 8]]],
        capture: PALETTE_ADDRESSES,
        maxFrames: 400,
      });
      await client.send('calllog off');
      return { result, calls: readCalls(log) };
    },
    check: ({ data }) => {
      const problems = [];
      const { result, calls } = data;
      if (!result.done) return ['调用没有返回'];
      const want = ['25/00', '3F/00', '30/0A', '30/00', '5D/00'];
      // $3F、$30、$5D 内部还会调用 $29（映射页）、$1B（等帧）、$1E、$12、$13（查询与保存 NMI、中断状态），这些嵌套调用不算例程自己的调用
      const got = calls.filter((call) => ['25', '3F', '30', '5D'].includes(call.slice(0, 2)));
      if (got.join(' ') !== want.join(' ')) problems.push(`系统调用序列 ${got.join(' ')}，预期 ${want.join(' ')}（全部 ${calls.join(' ')}）`);
      for (let i = 0; i < 0x40; i++) {
        const writes = result.writes.get(0x2040 + i) ?? [];
        if (writes.length < 1 || writes.length > 2 || writes.some((value) => value !== palette[i])) problems.push(`调色板 $${(0x2040 + i).toString(16).toUpperCase()} 写入 ${toHex(writes)}，预期 1 到 2 次 ${hex2(palette[i])}`);
      }
      return problems.slice(0, 12);
    },
  }],
}];
