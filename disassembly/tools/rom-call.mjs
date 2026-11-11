// ------------------------------------------------------------------------
// 名称：rom-call.mjs
// 说明：命令行下临时调用一次系统调用或固定区例程，并读回内存，用来摸清某个功能的输入输出。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/rom-call.mjs func=4D sub=0 a=0 x=0 y=0 mem=069A:2033 2E35 read=0696:32 [addr=FFxx] [frames=120]
//       mem=地址:十六进制字节串，可重复；read=地址:字节数，可重复；capture=地址，记录调用期间对该地址的写入（如 capture=4025 看打印机数据）；所有数字都是十六进制；
//       需要先用 node tools/sb2kdbg.mjs --launch 启动模拟器并开机到提示符（或先运行 verify-run.mjs --attach）。
// ------------------------------------------------------------------------
import { runCall, toHex } from './rom-driver.mjs';
import { DEFAULT_PORT, Sb2kClient } from './sb2k-client.mjs';

/**
 * 把命令行参数解析成用例。
 * @param {string[]} args 形如 key=value 的参数
 * @returns {object} 用例
 */
export function parseCallArgs(args) {
  const spec = { mem: [], read: [] };
  const hex = (text) => parseInt(text, 16);
  for (const arg of args) {
    const eq = arg.indexOf('=');
    if (eq < 0) throw new Error(`参数格式应为 key=value：${arg}`);
    const key = arg.slice(0, eq);
    const value = arg.slice(eq + 1);
    if (key === 'mem') {
      const [addr, bytes] = value.split(':');
      spec.mem.push([hex(addr), bytes]);
    } else if (key === 'read') {
      const [addr, length] = value.split(':');
      spec.read.push([hex(addr), hex(length)]);
    } else if (key === 'pram') {
      const [offset, length] = value.split(':');
      (spec.readPram ??= []).push([hex(offset), hex(length)]);
    } else if (key === 'capture') {
      (spec.capture ??= []).push(hex(value));
    } else if (['func', 'sub', 'a', 'x', 'y', 'addr'].includes(key)) {
      spec[key] = hex(value);
    } else if (key === 'frames') {
      spec.maxFrames = Number(value);
    } else {
      throw new Error(`未知参数：${key}`);
    }
  }
  return spec;
}

async function main() {
  const spec = parseCallArgs(process.argv.slice(2));
  const client = await Sb2kClient.connect(DEFAULT_PORT);
  try {
    const result = await runCall(client, spec);
    console.log(result.done ? `已返回（${result.frames} 帧） a=${result.regs.a} x=${result.regs.x} y=${result.regs.y} p=${result.regs.p}` : `没有返回，PC=${result.regs.pc}`);
    for (const [addr, bytes] of result.memory) console.log(`${addr.toString(16).toUpperCase().padStart(4, '0')}: ${toHex(bytes).replace(/(..)/g, '$1 ').trim()}`);
    for (const [offset, bytes] of result.pram) console.log(`pram ${offset.toString(16).toUpperCase()}: ${toHex(bytes).replace(/(..)/g, '$1 ').trim()}`);
    for (const [addr, bytes] of result.writes) console.log(`写入 $${addr.toString(16).toUpperCase()}: ${toHex(bytes).replace(/(..)/g, '$1 ').trim()}`);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('rom-call.mjs')) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
