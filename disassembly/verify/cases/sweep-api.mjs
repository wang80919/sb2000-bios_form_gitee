// ------------------------------------------------------------------------
// 名称：sweep-api.mjs
// 说明：对分发表里每个已实现的功能号（$10 起）、每个子功能 0-7，用两组通用参数各调用一次，只记录是否返回，用来让例程被执行到（不校验结果）。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：参数 A：全 0；参数 B：$0640-$0653 依次填 00 01 02…，$0C/$0D 指向扩展 RAM $7C00（里面放着 "HELLO   TXT" 和递增字节）。
//       挂起后重启开机；同一功能号、同一组参数的子功能连续挂起两次就跳过其余子功能；这里的“通过”只表示调用返回了，不代表结果正确，
//       有预期值的验证用例在其他文件里。
// ------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildDispatchMap } from '../../tools/dispatch-map.mjs';
import { BIOS_BUILD_DIR } from '../../tools/config.mjs';

const rom = readFileSync(path.join(BIOS_BUILD_DIR, 'SB2K_BIOS.NES')).subarray(16);
/** 打印机服务（功能 $76-$7A）会触发模拟器的“Print to...”对话框（verify-run.mjs 自动应答），整屏输出要很多帧，给更长的等待 */
const isPrinter = (fn) => fn >= 0x76 && fn <= 0x7a;
const handled = buildDispatchMap(rom).filter((entry) => entry.fn >= 0x10 && !entry.stub && entry.kind !== 'ram-table');

/** 扩展 RAM 里的缓冲区内容：一个 8.3 文件名，其后是递增字节 */
const BUFFER = [...'HELLO   TXT'].map((c) => c.charCodeAt(0)).concat(Array.from({ length: 53 }, (_, i) => i));

const patterns = [
  { name: 'a', mem: [] },
  { name: 'b', mem: [[0x640, Array.from({ length: 20 }, (_, i) => i)], [0x0c, [0x00, 0x7c]], [0x7c00, BUFFER]] },
];

export const cases = [];
for (const entry of handled) {
  for (const pattern of patterns) {
    for (let sub = 0; sub < 8; sub++) {
      const fn = entry.fn.toString(16).toUpperCase().padStart(2, '0');
      cases.push({
        id: `sweep.${fn}.${pattern.name}.s${sub}`,
        title: `功能 $${fn} 子功能 ${sub}，参数 ${pattern.name}（只跑到，不校验）`,
        func: entry.fn,
        sub,
        mem: pattern.mem,
        maxFrames: isPrinter(entry.fn) ? 300 : 30,
        group: `sweep.${fn}.${pattern.name}`,
        quiet: true,
      });
    }
  }
}
