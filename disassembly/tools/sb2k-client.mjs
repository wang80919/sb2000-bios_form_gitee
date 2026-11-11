// ------------------------------------------------------------------------
// 名称：sb2k-client.mjs
// 说明：SB2K 调试服务（fcdev 仓库 virtuanes/ 的 DebugServer）的 Node 客户端库，
//       负责启动带调试服务的模拟器、连接、发送命令并解析应答。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：协议为一行一个命令，应答若干行文本，以单独的“.”行结束；错误应答以“ERR ”开头。
// ------------------------------------------------------------------------
import net from 'node:net';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

/** 默认调试端口 */
export const DEFAULT_PORT = 5677;

/**
 * 解析以“.”行结尾的应答文本。
 * @param {string} text 完整应答，不含结尾“.”行
 * @returns {{ok: boolean, head: string, lines: string[]}} head 为首行；lines 为其后的各行
 */
export function parseReply(text) {
  const all = text.split('\n').filter((line) => line.length > 0);
  const head = all[0] ?? '';
  return { ok: head.startsWith('OK'), head, lines: all.slice(1) };
}

/**
 * 把“key=value key=value”形式的一行解析为对象。
 * @param {string} line 形如 "OK frames=3 stop=none pc=8000" 的文本
 * @returns {Record<string, string>}
 */
export function parseFields(line) {
  const fields = {};
  for (const part of line.split(/\s+/)) {
    const eq = part.indexOf('=');
    if (eq > 0) fields[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return fields;
}

/**
 * 把读取命令返回的 HEX 行合并为字节数组。
 * @param {string[]} lines 应答中的行
 * @returns {Uint8Array}
 */
export function hexLinesToBytes(lines) {
  const hex = lines.filter((l) => l.startsWith('HEX ')).map((l) => l.slice(4)).join('');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

/** 调试服务客户端 */
export class Sb2kClient {
  /** @param {net.Socket} socket 已连接的套接字 */
  constructor(socket) {
    this.socket = socket;
    this.buffer = '';
    this.waiter = null;
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      this.buffer += chunk;
      this.#flush();
    });
    socket.on('close', () => {
      if (this.waiter) this.waiter.reject(new Error('调试连接已关闭'));
    });
  }

  /**
   * 连接到本机调试服务。
   * @param {number} port 端口
   * @returns {Promise<Sb2kClient>}
   */
  static connect(port = DEFAULT_PORT) {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host: '127.0.0.1', port }, () => resolve(new Sb2kClient(socket)));
      socket.once('error', reject);
    });
  }

  #flush() {
    if (!this.waiter) return;
    const end = this.buffer.indexOf('\n.\n');
    if (end < 0) return;
    const text = this.buffer.slice(0, end + 1);
    this.buffer = this.buffer.slice(end + 3);
    const { resolve } = this.waiter;
    this.waiter = null;
    resolve(parseReply(text));
  }

  /**
   * 发送一条命令并等待应答；应答为 ERR 时抛出异常。
   * @param {string} command 命令文本
   * @returns {Promise<{ok: boolean, head: string, lines: string[]}>}
   */
  async send(command) {
    if (this.waiter) throw new Error('上一条命令尚未返回');
    const pending = new Promise((resolve, reject) => {
      this.waiter = { resolve, reject };
    });
    this.socket.write(`${command}\n`);
    const reply = await pending;
    if (!reply.ok) throw new Error(`${command} -> ${reply.head}`);
    return reply;
  }

  /** 运行 n 帧，返回停止信息与寄存器 */
  async run(frames) {
    return parseFields((await this.send(`run ${frames}`)).head);
  }

  /** 单步 n 条指令 */
  async step(count = 1) {
    return parseFields((await this.send(`step ${count}`)).head);
  }

  /** 读取寄存器 */
  async regs() {
    return parseFields((await this.send('regs')).head);
  }

  /**
   * 读取内存。
   * @param {string} space 空间名：cpu、rom、pram、vram、cram、eram、wram、ram
   * @param {number} addr 起始地址
   * @param {number} length 字节数
   * @returns {Promise<Uint8Array>}
   */
  async read(space, addr, length) {
    const reply = await this.send(`read ${space} ${addr.toString(16)} ${length}`);
    return hexLinesToBytes(reply.lines);
  }

  /** 按下并松开一个键，期间各运行若干帧让 BIOS 读取到 */
  async tapKey(scancode, holdFrames = 6, releaseFrames = 6) {
    await this.send(`key ${scancode.toString(16)} 1`);
    await this.run(holdFrames);
    await this.send(`key ${scancode.toString(16)} 0`);
    await this.run(releaseFrames);
  }

  /** 关闭连接 */
  close() {
    this.socket.end();
  }
}

/**
 * 启动带调试服务的模拟器并连接；模拟器窗口会显示出来。
 * @param {object} options 选项
 * @param {string} options.emulatorExe VirtuaNES.exe 的完整路径
 * @param {string} options.rom 要加载的 ROM 完整路径
 * @param {number} [options.port] 调试端口
 * @param {number} [options.timeoutMs] 等待模拟器就绪的毫秒数
 * @returns {Promise<{client: Sb2kClient, child: import('node:child_process').ChildProcess}>}
 */
export async function launchEmulator({ emulatorExe, rom, port = DEFAULT_PORT, timeoutMs = 30000 }) {
  if (!existsSync(emulatorExe)) throw new Error(`找不到模拟器：${emulatorExe}`);
  if (!existsSync(rom)) throw new Error(`找不到 ROM：${rom}`);

  const cwd = emulatorExe.replace(/[\\/][^\\/]+$/, '');
  const child = spawn(emulatorExe, [rom], {
    cwd,
    env: { ...process.env, FCDEV_DEBUG_PORT: String(port) },
    stdio: 'ignore',
    detached: false,
  });

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const client = await Sb2kClient.connect(port);
      const status = await client.send('status');
      if (parseFields(status.head).running === '1') return { client, child };
      client.close();
    } catch {
      // 服务尚未就绪，稍后重试
    }
    await delay(300);
  }
  child.kill();
  throw new Error('等待模拟器就绪超时');
}
