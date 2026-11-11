// ------------------------------------------------------------------------
// 名称：collect-cdl.mjs
// 说明：自动化采集场景：从硬件复位启动 SB-DOS 或软盘上的软件，依次执行若干操作，
//       同时开启代码数据标记（CDL）与 $FFF0、$FF16 调用日志，保存截图，并导出扩展 RAM 的内容。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/collect-cdl.mjs [场景名，默认 boot]；需要先运行 node tools/sb2kdbg.mjs --launch。
//       boot：用不含 AUTOEXEC.BAT 的 DOS 镜像 reference/floppy-dos.img 启动，输入日期时间、执行 dir；
//       apps：在 boot 的基础上依次运行 attrib、label、move、edit；
//       full：在 apps 之前先执行常见 DOS 内部命令（只改内存中的软盘镜像）；
//       wps：用 reference/floppy-images 里的官方软盘 1（WPS 文字处理系统）启动，AUTOEXEC 会自动进入 SB-Win98 与 WPS 文字处理；
//       game：用官方软盘 20（游戏集锦 027）启动，AUTOEXEC 会自动进入游戏集锦菜单。
//       产物：out/cdl/<场景>-rom.cdl、-pram.cdl、-pram.bin，out/api/<场景>-*.log，out/<场景>-*.png。
// ------------------------------------------------------------------------
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DOS_IMAGE, OUT_DIR, officialImage } from './config.mjs';
import { KEY, typeText } from './keyboard.mjs';
import { DEFAULT_PORT, Sb2kClient } from './sb2k-client.mjs';

/** 复位后 BIOS 自检并进入日期输入所需的帧数 */
const BOOT_FRAMES = 1100;

/** 输入一条命令前等待的帧数，避免命令开头的按键丢失 */
const PROMPT_WAIT_FRAMES = 150;

/** 输入命令前先按的空回车次数 */
const WARM_UP_ENTERS = 3;

/** 扩展 RAM 的大小 */
const PRAM_SIZE = 512 * 1024;

/** full 场景中依次执行的 DOS 内部命令，只操作内存中的软盘镜像 */
const DOS_COMMANDS = [
  'ver', 'vol', 'type hello.txt', 'copy hello.txt a2.txt', 'ren a2.txt a3.txt', 'dir',
  'del a3.txt', 'md t', 'cd t', 'cd ..', 'rd t', 'date', '\n', 'time', '\n', 'cls', 'help',
];

/**
 * 输入一条命令，等待执行完成并截图。
 * @param {Sb2kClient} client 调试客户端
 * @param {(label: string) => Promise<unknown>} shot 截图函数
 * @param {string} text 命令文本
 * @param {number} [frames] 执行后等待的帧数
 */
async function runCommand(client, shot, text, frames = 200) {
  await client.run(PROMPT_WAIT_FRAMES);
  // 程序退出后键盘要过一会儿才恢复，先用空回车把开头会丢的按键消耗掉（实测会丢 1-2 个字符）
  for (let i = 0; i < WARM_UP_ENTERS; i++) await client.tapKey(KEY.ENTER, 8, 20);
  await typeText(client, text.endsWith('\n') ? text : `${text}\n`);
  await client.run(frames);
  await shot(text.trim().replace(/[^A-Za-z0-9]+/g, '_') || 'enter');
}

/** DOS 场景依次运行的外部程序 */
const DOS_PROGRAMS = ['attrib', 'label', 'move', 'edit'];

/** label 要先确认插入软盘、再输入卷标（回车为空），不回答就会把后面的命令当成输入 */
async function answerLabelPrompts(client, shot) {
  await client.tapKey(KEY.ENTER, 8, 8);
  await client.run(150);
  await shot('label-prompt');
  await client.tapKey(KEY.ENTER, 8, 8);
  await client.run(150);
  await shot('label-done');
}

/** 依次运行 DOS_PROGRAMS */
async function runPrograms(client, shot) {
  for (const program of DOS_PROGRAMS) {
    await runCommand(client, shot, program, program === 'edit' ? 300 : 200);
    if (program === 'label') await answerLabelPrompts(client, shot);
  }
}

/** 通过日期、时间两个提示 */
async function passDateTime(client) {
  await client.tapKey(KEY.ENTER, 8, 8);
  await client.tapKey(KEY.ENTER, 8, 40);
}

/** 内置软盘镜像场景的公共步骤 */
const boot = async (client, shot) => {
  await passDateTime(client);
  await typeText(client, 'dir\n');
  await client.run(100);
  await shot('dir');
};

/**
 * 采集场景：image 为挂载的软盘镜像，run 为操作步骤。
 * @type {Record<string, {image: string, run: (client: Sb2kClient, shot: (label: string) => Promise<unknown>) => Promise<void>}>}
 */
const SCENARIOS = {
  boot: { image: DOS_IMAGE, run: boot },
  apps: {
    image: DOS_IMAGE,
    async run(client, shot) {
      await boot(client, shot);
      await runPrograms(client, shot);
    },
  },
  full: {
    image: DOS_IMAGE,
    async run(client, shot) {
      await boot(client, shot);
      for (const command of DOS_COMMANDS) await runCommand(client, shot, command);
      await runPrograms(client, shot);
    },
  },
  wps: {
    image: officialImage(1),
    async run(client, shot) {
      await passDateTime(client);
      // 软盘读取很慢：SB-Win98 装载约 4000 帧后才进入 WPS 主菜单
      await client.run(2500);
      await shot('loading');
      await client.run(2500);
      await shot('menu');
      // 主菜单 D-编辑文件
      await client.tapKey(0x20, 8, 8);
      await client.run(600);
      await shot('edit');
      await typeText(client, 'abc');
      await client.run(200);
      await shot('typed');
    },
  },
  game: {
    image: officialImage(20),
    async run(client, shot) {
      await passDateTime(client);
      await client.run(1500);
      await shot('menu');
      // 手柄 START 对应回车，方向键下选择第二个游戏
      await client.tapKey(KEY.ENTER, 8, 8);
      await client.run(900);
      await shot('game1');
      await client.run(900);
      await shot('game2');
    },
  },
};

/** 读出整块扩展 RAM */
async function dumpPram(client) {
  const chunks = [];
  for (let offset = 0; offset < PRAM_SIZE; offset += 0x10000) chunks.push(await client.read('pram', offset, 0x10000));
  return Buffer.concat(chunks);
}

async function main() {
  const name = process.argv[2] ?? 'boot';
  const scenario = SCENARIOS[name];
  if (!scenario) throw new Error(`未知场景：${name}，可用：${Object.keys(SCENARIOS).join('、')}`);

  const cdlDir = path.join(OUT_DIR, 'cdl');
  const apiDir = path.join(OUT_DIR, 'api');
  mkdirSync(cdlDir, { recursive: true });
  mkdirSync(apiDir, { recursive: true });

  const client = await Sb2kClient.connect(DEFAULT_PORT);
  const shot = (label) => client.send(`shot ${path.join(OUT_DIR, `${name}-${label}.png`)}`);
  try {
    await client.send('cdl on');
    await client.send('cdl clear');
    await client.send('reset');
    await client.send(`disk ${scenario.image}`);
    // $6B 是输入轮询，次数极多，跳过它才不会把日志上限占满
    const skipPolling = 'skip=063e=6b';
    await client.send(`calllog ${path.join(apiDir, `${name}-fff0.log`)} fff0 063a:16 400000 ${skipPolling}`);
    await client.send(`calllog ${path.join(apiDir, `${name}-ff16.log`)} ff16 0639:7,0010:2 400000 ${skipPolling}`);
    await client.run(BOOT_FRAMES);
    await scenario.run(client, shot);
    await client.send(`cdl save ${path.join(cdlDir, name)}`);
    writeFileSync(path.join(cdlDir, `${name}-pram.bin`), await dumpPram(client));
    await client.send('calllog off');
    console.log(`场景 ${name} 采集完成`);
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
