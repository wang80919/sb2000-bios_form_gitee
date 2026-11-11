// ------------------------------------------------------------------------
// 名称：probe-boot-screen.mjs
// 说明：在模拟器里复位后跑完开机的硬件检测画面，核对 BOOT_CHECK_SEQUENCE 的行为：计数动画每一轮显示的字符串、各行文字与图片的显示顺序、检测结果标记与提示音的参数，并在几个关键帧截图。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-10
// 备注：用法 node tools/probe-boot-screen.mjs；需要先运行 node tools/sb2kdbg.mjs --launch。用调用日志记录 BOOT_PUT_TEXT 等例程的入口（寄存器与 $069A 起的字符串）；
//       这些例程在窗口地址 $8000-$9FFF，别的页组里同地址的代码也会命中，所以只看文字序号在 $02-$0C、帧号在开机检测期间的记录。截图与日志在 out/boot-count/。
// ------------------------------------------------------------------------
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { BIOS_DIR, OUT_DIR } from './config.mjs';
import { DEFAULT_PORT, Sb2kClient } from './sb2k-client.mjs';
import { assembleProject } from '../../bios/tools/bios-project.mjs';

const DIR = path.join(OUT_DIR, 'boot-count');
mkdirSync(DIR, { recursive: true });
const symbols = assembleProject(BIOS_DIR).assembled.symbols;
const ROUTINES = ['BOOT_PUT_TEXT', 'BOOT_SHOW_IMAGE', 'BOOT_PLAY_RESULT_TUNE', 'BOOT_SHOW_RESULT_MARK'];
const SHOTS = [300, 420, 545, 740];

/** 读一份调用日志：每次记录寄存器 A、X、帧号与 $069A 起的字符串 */
function readLog(name) {
  const lines = readFileSync(path.join(DIR, `${name}.log`), 'utf8').split(/\r?\n/);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const call = /^C pc=\w+ a=(\w\w) x=(\w\w) .* F=(\d+)/.exec(lines[i]);
    if (!call) continue;
    const memory = /^M 069A (.*)$/.exec(lines[i + 2] ?? '');
    const text = memory ? memory[1].split(' ').map((v) => String.fromCharCode(parseInt(v, 16))).join('').replace(/[^\x20-\x7e]/g, '.').replace(/\.+$/, '') : '';
    rows.push({ a: parseInt(call[1], 16), x: parseInt(call[2], 16), frame: Number(call[3]), text });
  }
  return rows;
}

const range = (count, step, width) => Array.from({ length: count }, (_, i) => `${String(i * step).padStart(width, '0')}K`);
const client = await Sb2kClient.connect(DEFAULT_PORT);
const problems = [];
try {
  await client.send('reset');
  for (const name of ROUTINES) await client.send(`calllog ${path.join(DIR, `${name}.log`)} ${symbols.get(name).toString(16)} 69a:6 100000`);
  let frame = 0;
  for (const target of SHOTS) {
    await client.run(target - frame);
    frame = target;
    await client.send(`shot ${path.join(DIR, `f${target}.png`)}`);
  }
  await client.run(1100 - frame);
  await client.send('calllog off');
} finally {
  client.close();
}

const text = readLog('BOOT_PUT_TEXT').filter((r) => r.frame >= 285 && r.frame <= 740 && r.a >= 2 && r.a <= 0x0c);
const order = text.map((r) => r.a.toString(16).padStart(2, '0').toUpperCase());
const wantOrder = ['02', ...Array(17).fill('09'), '03', ...Array(33).fill('0A'), '04', '05', '0C', '06', '07', '08'];
if (order.join(' ') !== wantOrder.join(' ')) problems.push(`文字序号顺序 ${order.join(' ')}，预期 ${wantOrder.join(' ')}`);
const first = text.filter((r) => r.a === 0x09).map((r) => r.text);
const second = text.filter((r) => r.a === 0x0a).map((r) => r.text);
if (first.join(' ') !== range(17, 32, 3).join(' ')) problems.push(`计数动画 A 的字符串 ${first.join(' ')}，预期 000K 起每轮加 32 到 512K（共 17 次，最后一次是循环结束后的补显示）`);
if (second.join(' ') !== range(33, 32, 4).join(' ')) problems.push(`计数动画 B 的字符串 ${second.join(' ')}，预期 0000K 起每轮加 32 到 1024K（共 33 次）`);

const images = readLog('BOOT_SHOW_IMAGE').filter((r) => r.frame >= 285).map((r) => r.a.toString(16).toUpperCase());
if (images.join(' ') !== '5 6 7 8 9 A B') problems.push(`图片序号顺序 ${images.join(' ')}，预期 5 6 7 8 9 A B`);
const marks = readLog('BOOT_SHOW_RESULT_MARK').map((r) => `${r.a}:${r.x}`);
if (marks.join(' ') !== '0:1 1:1 2:1 3:1 4:1') problems.push(`结果标记（序号:X）${marks.join(' ')}，预期 0:1 1:1 2:1 3:1 4:1（X 非 0 显示 OK）`);
const tunes = readLog('BOOT_PLAY_RESULT_TUNE').map((r) => r.x);
if (tunes.length !== 7 || tunes.some((x) => x !== 1)) problems.push(`提示音的 X 为 ${tunes.join(' ')}，预期 7 次都是 1`);

console.log(`计数动画 A ${first.length} 轮、B ${second.length} 轮；图片 ${images.join(' ')}；结果标记 ${marks.join(' ')}；提示音 ${tunes.length} 次；截图在 ${DIR}`);
if (problems.length) {
  console.log(`发现 ${problems.length} 个问题：`);
  for (const problem of problems) console.log(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log('全部核对通过');
}
