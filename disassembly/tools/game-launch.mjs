// ------------------------------------------------------------------------
// 名称：game-launch.mjs
// 说明：驱动“游戏集锦”软盘分两段取证：
//       第一段，软盘里的 GAME.EXE 把菜单程序装入后，在写 $4301（进入 FC 兼容模式）处停下，导出启动桩所在的 ERAM；
//       第二段，菜单里选定游戏并按 START，记录菜单程序读取了哪些扇区，装入完成后导出各存储区与映射寄存器。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/game-launch.mjs <游戏序号，从 0 开始> [镜像，默认 reference/floppy-images 里的官方软盘 20]；需要先用 node tools/sb2kdbg.mjs --launch 启动模拟器。
//       脚本开头的“reset”是硬复位，会回到 BIOS；要模拟游戏中的软复位用调试命令 softreset。
//       产物写入 out/game/<序号>/：menu-launch-eram.bin（第一段停下时的 ERAM）、disk.log（第二段读盘记录）、
//       regs.txt、eram.bin、pram.bin、vram.bin（第二段结束时）。
//       手柄按键位：A=01、B=02、Select=04、Start=08、上=10、下=20、左=40、右=80。
// ------------------------------------------------------------------------
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { OUT_DIR, officialImage } from './config.mjs';
import { KEY } from './keyboard.mjs';
import { DEFAULT_PORT, Sb2kClient } from './sb2k-client.mjs';

const PAD = Object.freeze({ START: 0x08, UP: 0x10 });

/** 复位后 BIOS 自检并进入日期输入所需的帧数 */
const BOOT_FRAMES = 1100;

/** 菜单装入完成、可以响应手柄的上限帧数 */
const MENU_FRAMES = 2500;

/** 按下 START 后给菜单程序读盘与装入游戏的帧数 */
const LOAD_FRAMES = 800;

/** 按住手柄按键若干帧后松开 */
async function tapPad(client, mask, hold = 20, gap = 40) {
  await client.send(`pad 0 ${mask.toString(16)}`);
  await client.run(hold);
  await client.send('pad 0 00');
  await client.run(gap);
}

/** 菜单程序（ERAM $7473-$749F）轮询手柄的地址范围 */
const MENU_LOOP = Object.freeze({ from: 0x7473, to: 0x749f });

/** 每次检查之间运行的帧数与最多检查次数 */
const MENU_POLL_FRAMES = 30;
const MENU_POLL_LIMIT = 100;

/** 一直运行到菜单程序进入轮询手柄的循环；超过次数仍未进入则报错 */
async function waitMenuReady(client) {
  for (let i = 0; i < MENU_POLL_LIMIT; i++) {
    const pc = parseInt((await client.regs()).pc, 16);
    if (pc >= MENU_LOOP.from && pc <= MENU_LOOP.to) return;
    await client.run(MENU_POLL_FRAMES);
  }
  throw new Error('菜单程序没有进入轮询手柄的循环');
}

/** 菜单程序在零页 $D4 保存当前选中的游戏序号 */
const MENU_SELECTED_ADDRESS = 0xd4;

/** 选中目标游戏所允许的最多按键次数（菜单会忽略第一次按键，需要重试） */
const SELECT_TRY_LIMIT = 8;

/** 读零页 $D4 确认选中项，按“上”直到选中目标；两项菜单的“上”会在两项之间切换 */
async function selectGame(client, index) {
  for (let i = 0; i < SELECT_TRY_LIMIT; i++) {
    const [selected] = await client.read('ram', MENU_SELECTED_ADDRESS, 1);
    if (selected === index) return;
    await tapPad(client, PAD.UP);
  }
  throw new Error(`无法把菜单选到第 ${index} 项`);
}

/** 读出一个物理空间的全部内容 */
async function dumpSpace(client, space, size) {
  const chunks = [];
  for (let offset = 0; offset < size; offset += 0x10000) chunks.push(await client.read(space, offset, Math.min(0x10000, size - offset)));
  return Buffer.concat(chunks);
}

async function main() {
  const index = Number(process.argv[2]);
  if (!Number.isInteger(index) || index < 0) throw new Error('用法：game-launch.mjs <游戏序号> [镜像]');
  const image = process.argv[3] ?? officialImage(20);
  const outDir = path.join(OUT_DIR, 'game', String(index));
  mkdirSync(outDir, { recursive: true });

  const client = await Sb2kClient.connect(DEFAULT_PORT);
  try {
    await client.send('reset');
    await client.send(`disk ${image}`);
    await client.run(BOOT_FRAMES);
    await client.send('bp w 4301');
    await client.tapKey(KEY.ENTER, 8, 8);
    await client.tapKey(KEY.ENTER, 8, 40);

    // 第一段：停在 GAME.EXE 的启动桩写 $4301 处
    const stop = await client.run(MENU_FRAMES);
    await client.send('bp del all');
    if (!String(stop.stop).startsWith('write')) throw new Error(`没有在 $4301 写入处停下：${stop.stop}`);
    writeFileSync(path.join(outDir, 'menu-launch-eram.bin'), await client.read('eram', 0, 0x2000));
    await client.run(MENU_FRAMES);
    await waitMenuReady(client);

    // 第二段：选游戏、按 START，记录读盘
    await selectGame(client, index);
    await client.send(`shot ${path.join(outDir, 'menu.png')}`);
    await client.send(`disklog ${path.join(outDir, 'disk.log')}`);
    await client.send(`pad 0 ${PAD.START.toString(16).padStart(2, '0')}`);
    await client.run(20);
    await client.send('pad 0 00');
    await client.run(LOAD_FRAMES);
    await client.send('disklog off');
    await client.send(`shot ${path.join(outDir, 'game.png')}`);

    const status = await client.send('status');
    writeFileSync(path.join(outDir, 'regs.txt'), `${[status.head, ...status.lines].join('\n')}\n`);
    writeFileSync(path.join(outDir, 'eram.bin'), await client.read('eram', 0, 0x2000));
    writeFileSync(path.join(outDir, 'pram.bin'), await dumpSpace(client, 'pram', 512 * 1024));
    writeFileSync(path.join(outDir, 'vram.bin'), await dumpSpace(client, 'vram', 512 * 1024));
    console.log(`第 ${index} 个游戏已导出到 ${outDir}`);
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
