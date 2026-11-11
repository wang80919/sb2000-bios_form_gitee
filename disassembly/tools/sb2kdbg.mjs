// ------------------------------------------------------------------------
// 名称：sb2kdbg.mjs
// 说明：调试服务的命令行入口。可启动模拟器，或向已运行的模拟器依次发送命令并打印应答。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法
//   node tools/sb2kdbg.mjs --launch [rom]      启动模拟器（后台常驻，窗口可见）
//   node tools/sb2kdbg.mjs "run 60" "shot out/a.png"   依次发送命令
// ------------------------------------------------------------------------
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { BIOS_ROM, EMULATOR_EXE, OUT_DIR, WORK_DIR } from './config.mjs';
import { DEFAULT_PORT, Sb2kClient } from './sb2k-client.mjs';
import { typeText } from './keyboard.mjs';

/** 以后台常驻方式启动带调试服务的模拟器 */
function launchDetached(rom) {
  const cwd = EMULATOR_EXE.replace(/[\\/][^\\/]+$/, '');
  const child = spawn(EMULATOR_EXE, [rom], {
    cwd,
    env: { ...process.env, FCDEV_DEBUG_PORT: String(DEFAULT_PORT) },
    stdio: 'ignore',
    detached: true,
  });
  child.unref();
  console.log(`已启动模拟器 pid=${child.pid}，调试端口 ${DEFAULT_PORT}`);
}

async function main() {
  const args = process.argv.slice(2);
  mkdirSync(OUT_DIR, { recursive: true });

  if (args[0] === '--launch') {
    launchDetached(args[1] ?? BIOS_ROM);
    return;
  }
  if (args.length === 0) {
    console.error('用法：sb2kdbg.mjs --launch [rom] | <命令> [<命令> ...]');
    process.exitCode = 2;
    return;
  }

  const client = await Sb2kClient.connect(DEFAULT_PORT);
  try {
    for (const raw of args) {
      // 模拟器的工作目录不同，命令里以 out/ 开头的路径要换成绝对路径
      const command = raw.replace(/(^|\s)(out[\\/]\S+)/g, (_, lead, rel) => `${lead}${path.join(WORK_DIR, rel)}`);
      // type 由客户端把文本拆成按键与帧；\n 表示回车
      if (command.startsWith('type ')) {
        await typeText(client, command.slice(5).replaceAll('\\n', '\n'));
        console.log(`> ${command}\nOK`);
        continue;
      }
      const reply = await client.send(command);
      console.log(`> ${command}`);
      console.log([reply.head, ...reply.lines].join('\n'));
    }
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
