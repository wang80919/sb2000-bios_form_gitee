// ------------------------------------------------------------------------
// 名称：rom-driver.mjs
// 说明：用例驱动库：在模拟器里直接调用 BIOS 的系统调用或任意固定区地址，写入输入、读回结果，用来补测普通场景没有走到的例程。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：做法是在扩展 RAM 的 $7F00 放一小段桩代码（设置功能号、子功能、A/X/Y，JSR $FFF0 或 JSR 指定地址，然后原地循环），
//       把 PC 指到桩代码，运行到 PC 停在循环处即视为调用返回；没有返回（超时）记为“挂起”。
//       模拟器的 savestate/loadstate 实测会让模拟器崩溃，因此不用存档隔离；用例之间共享同一次开机，需要干净环境的用例写 fresh: true。
// ------------------------------------------------------------------------
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { EMULATOR_EXE, OUT_DIR } from './config.mjs';
import { KEY, typeText } from './keyboard.mjs';
import { DEFAULT_PORT, Sb2kClient, launchEmulator } from './sb2k-client.mjs';

/** 桩代码所在的 CPU 地址（扩展 RAM） */
export const STUB_ADDRESS = 0x7f00;

/** 开机到日期输入提示所需的帧数 */
const BOOT_FRAMES = 1100;

/** 提示符处的栈指针（实测）；每次调用前恢复，避免上一次挂起留下的栈残留 */
const PROMPT_STACK = 0xe4;

/** 每次检查是否返回之间运行的帧数 */
const POLL_FRAMES = 2;

/** 把十六进制字符串或字节数组变成字节数组；字符串里允许空格 */
export function toBytes(value) {
  if (typeof value !== 'string') return Uint8Array.from(value);
  const hex = value.replace(/\s+/g, '');
  if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) throw new Error(`不是合法的十六进制字节串：${value}`);
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

/** 字节数组转大写十六进制字符串 */
export function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join('');
}

/**
 * 生成桩代码。
 * @param {{func?: number, sub?: number, addr?: number, a?: number, x?: number, y?: number, sei?: boolean}} spec 调用说明；
 *   给 addr 时直接 JSR 到该地址（只能是固定区地址），否则设置 $063E/$063F 后 JSR $FFF0；sei 为真时桩代码开头先 PHP、SEI，调用返回后 PLP 恢复，调用期间不会被 IRQ 打断
 * @returns {{bytes: Uint8Array, loop: number}} 桩代码与结尾原地循环的地址
 */
export function buildStub(spec) {
  const { func = 0, sub = 0, addr, a = 0, x = 0, y = 0, sei = false } = spec;
  const code = [];
  if (sei) code.push(0x08, 0x78);
  if (addr === undefined) code.push(0xa9, func & 0xff, 0x8d, 0x3e, 0x06, 0xa9, sub & 0xff, 0x8d, 0x3f, 0x06);
  code.push(0xa2, x & 0xff, 0xa0, y & 0xff, 0xa9, a & 0xff);
  const target = addr ?? 0xfff0;
  code.push(0x20, target & 0xff, target >> 8);
  if (sei) code.push(0x28);
  const loop = STUB_ADDRESS + code.length;
  code.push(0x4c, loop & 0xff, loop >> 8);
  return { bytes: Uint8Array.from(code), loop };
}

/**
 * 核对预期：expect 的每项是 [地址, 十六进制字节串]，与读回的内存比较。
 * @param {Map<number, Uint8Array>} memory 地址到读回字节的映射（地址是读取的起点）
 * @param {Array<[number, string]>} expect 预期
 * @returns {string[]} 不符合的说明；空数组表示全部通过
 */
export function checkExpect(memory, expect) {
  const problems = [];
  for (const [addr, hex] of expect) {
    const want = toBytes(hex);
    const got = memory.get(addr);
    if (!got) problems.push(`$${addr.toString(16)} 没有读回数据`);
    else if (toHex(got.subarray(0, want.length)) !== toHex(want)) {
      problems.push(`$${addr.toString(16).toUpperCase()} 预期 ${toHex(want)}，实际 ${toHex(got.subarray(0, want.length))}`);
    }
  }
  return problems;
}

/** 汇总一个用例预期要读取的内存范围 */
function readRanges(spec) {
  const ranges = [...(spec.read ?? [])];
  for (const [addr, hex] of spec.expect ?? []) ranges.push([addr, toBytes(hex).length]);
  return ranges;
}

/**
 * 解析 io 记录文件里的写入（形如 "W 4025 40 pc=8123"），按地址归并成写入字节序列。
 * @param {string} text io 记录文件的内容
 * @param {number[]} addresses 只保留这些地址
 * @returns {Map<number, number[]>}
 */
export function parseIoWrites(text, addresses) {
  const writes = new Map(addresses.map((addr) => [addr, []]));
  for (const line of text.split(/\r?\n/)) {
    const match = /^W ([0-9A-F]{4}) ([0-9A-F]{2})\b/.exec(line);
    if (!match) continue;
    const list = writes.get(parseInt(match[1], 16));
    if (list) list.push(parseInt(match[2], 16));
  }
  return writes;
}

/**
 * 执行一个用例：写入输入内存、放桩代码、运行到返回，读回结果。spec.capture 给出地址列表时，同时记录调用期间对它们的写入。
 * @param {Sb2kClient} client 调试客户端
 * @param {object} spec 用例，字段见 verify/README.md
 * @returns {Promise<{done: boolean, frames: number, regs: Record<string, string>, memory: Map<number, Uint8Array>, writes: Map<number, number[]>}>}
 */
export async function runCall(client, spec) {
  const ioFile = spec.capture?.length ? path.join(ensureOutDir('verify'), 'io-capture.log') : null;
  for (const [addr, value] of spec.mem ?? []) {
    await client.send(`write cpu ${addr.toString(16)} ${toHex(toBytes(value))}`);
  }
  const stub = buildStub(spec);
  await client.send(`write cpu ${STUB_ADDRESS.toString(16)} ${toHex(stub.bytes)}`);
  if (ioFile) await client.send(`io ${ioFile} 1000000 w`);
  await client.send(`regs pc=${STUB_ADDRESS.toString(16)} s=${PROMPT_STACK.toString(16)}`);
  const limit = spec.maxFrames ?? 120;
  let frames = 0;
  let regs = {};
  let done = false;
  while (frames < limit) {
    await client.run(POLL_FRAMES);
    frames += POLL_FRAMES;
    regs = await client.regs();
    if (parseInt(regs.pc, 16) === stub.loop) {
      done = true;
      break;
    }
  }
  // 调用返回后再多跑几帧，让 NMI 里的后台更新（如声音引擎）执行，并记入 capture
  if (done && spec.settle) await client.run(spec.settle);
  const memory = new Map();
  for (const [addr, length] of readRanges(spec)) memory.set(addr, await client.read('cpu', addr, length));
  const pram = new Map();
  for (const [offset, length] of spec.readPram ?? []) pram.set(offset, await client.read('pram', offset, length));
  let writes = new Map();
  if (ioFile) {
    await client.send('io off');
    writes = parseIoWrites(readFileSync(ioFile, 'utf8'), spec.capture);
  }
  return { done, frames, regs, memory, pram, writes };
}

/**
 * 启动模拟器并开机到 SB-DOS 提示符（打开 CDL 记录）。
 * @param {{rom: string, image: string}} options ROM 与软盘镜像的完整路径
 * @returns {Promise<{client: Sb2kClient, child: import('node:child_process').ChildProcess}>}
 */
export async function bootDos({ rom, image, bootFrames }) {
  if (!existsSync(image)) throw new Error(`找不到软盘镜像：${image}`);
  const session = await launchEmulator({ emulatorExe: EMULATOR_EXE, rom, port: DEFAULT_PORT });
  await resetToDos(session.client, image, bootFrames);
  return session;
}

/**
 * 复位并开机到提示符，不清 CDL（已有记录保留）；bootFrames 是复位后到达日期提示前等待的帧数。
 * 开机阶段让模拟器的声音（开机音乐与语音）最快播放，不再占用真实时间，回到提示符后恢复真实时间，
 * 之后用例里的语音、WAV 与声卡节奏同以前一致。
 */
export async function resetToDos(client, image, bootFrames = BOOT_FRAMES) {
  await client.send('cdl on');
  await client.send('audio fast');
  try {
    await client.send('reset');
    await client.send(`disk ${image}`);
    await client.run(bootFrames);
    // 日期、时间两个提示各按一次回车
    await client.tapKey(KEY.ENTER, 8, 8);
    await client.tapKey(KEY.ENTER, 8, 40);
    await client.run(60);
  } finally {
    await client.send('audio real');
  }
}

/** 确保输出目录存在 */
export function ensureOutDir(...parts) {
  const dir = path.join(OUT_DIR, ...parts);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export { KEY, typeText };
