// ------------------------------------------------------------------------
// 名称：screen-text.mjs
// 说明：验证 DOS 命令外壳屏幕文字输出用的辅助：在提示符下输入命令，记录运行库 LIB_PRINT_STRING（$8262）每次显示的字符串，还原成按显示顺序排列的文字行。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：屏幕上的文字是画进名称表的字形，不能从显存读回字符，所以改为在显示例程入口记录 $4B/$4C 指向的字符串（calllog，内存段取外壳字符串区 $6300-$6AFF 与 ROM 第 3 页映射区 $B000-$BFFF）。
//       外壳的字符串缓冲 $6312 会被同一字符串重复显示多次，连续相同的记录合并成一条；字符串按 GBK（GB2312 的超集）解码。
//       字符串不在这两段里时（目前没见到）记为“<外部 $地址>”。
// ------------------------------------------------------------------------
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { OUT_DIR } from '../../tools/config.mjs';
import { KEY } from '../../tools/rom-driver.mjs';
import { keyForChar } from '../../tools/keyboard.mjs';

/** 运行库显示字符串的入口地址 */
const LIB_PRINT_STRING = 0x8262;
/** 记录的字符串缓冲区起点与长度：ERAM 里外壳放字符串的区段 */
const TEXT_AREA = 0x6300;
const TEXT_AREA_LENGTH = 0x800;
/** ROM 第 3 页映射在 $B000 起的 4096 字节：消息字符串（LIB_PRINT_MESSAGE 取的提示文字）在这里 */
const MESSAGE_AREA = 0xb000;
const MESSAGE_AREA_LENGTH = 0x1000;
/** 单次记录的最大调用次数 */
const MAX_CALLS = 4000;
/** 小键盘乘号的扫描码：外壳里 Shift+8 打不出 *，要用这个键 */
const KEY_MULTIPLY = 0x37;

/** 输入文本：* 用小键盘乘号，其余同 typeText */
async function typeCommand(client, text) {
  for (const ch of text) {
    const { code, shift } = ch === '*' ? { code: KEY_MULTIPLY, shift: false } : keyForChar(ch);
    if (shift) {
      // 模拟器按扫描码从小到大依次发键，Shift 与键同一帧按下时可能先发键后发 Shift，所以先按 Shift 并等几帧
      await client.send(`key ${KEY.LSHIFT.toString(16)} 1`);
      await client.send('run 3');
    }
    await client.send(`key ${code.toString(16)} 1`);
    await client.send('run 5');
    await client.send(`key ${code.toString(16)} 0`);
    if (shift) {
      await client.send('run 3');
      await client.send(`key ${KEY.LSHIFT.toString(16)} 0`);
      await client.send('run 3');
    }
    await client.send('run 4');
  }
}

/**
 * 解析 calllog 文件，按调用顺序还原每次显示的字符串。
 * @param {string} text calllog 文件内容
 * @returns {string[]} 解码后的字符串（未合并重复）
 */
export function parsePrintLog(text) {
  const decoder = new TextDecoder('gbk');
  const strings = [];
  let pointer = 0;
  let windows = [];
  const flush = () => {
    if (windows.length === 0) return;
    const found = windows.find((w) => pointer >= w.address && pointer < w.address + w.data.length);
    if (!found) {
      strings.push(`<外部 $${pointer.toString(16)}>`);
      return;
    }
    const offset = pointer - found.address;
    const end = found.data.indexOf(0, offset);
    strings.push(decoder.decode(found.data.subarray(offset, end < 0 ? found.data.length : end)));
  };
  for (const line of text.split('\n')) {
    if (line.startsWith('C ')) {
      flush();
      windows = [];
    } else if (line.startsWith('M ')) {
      const [address, ...bytes] = line.slice(2).trim().split(' ');
      const data = Buffer.from(bytes.map((byte) => parseInt(byte, 16)));
      if (parseInt(address, 16) === 0x4b) pointer = data[0] | (data[1] << 8);
      else windows.push({ address: parseInt(address, 16), data });
    }
  }
  flush();
  return strings;
}

/** 连续相同的字符串合并成一条（输入回显里连续相同的字符，如 hello 的两个 l，会被合并成一个） */
export const collapseRepeats = (strings) => strings.filter((value, index) => index === 0 || value !== strings[index - 1]);

/** 在 action 执行期间记录显示的字符串，返回合并重复后的文字行 */
async function capture(client, action) {
  const log = path.join(OUT_DIR, 'verify', 'print.log');
  rmSync(log, { force: true });
  const windows = `004b:2,${TEXT_AREA.toString(16)}:${TEXT_AREA_LENGTH},${MESSAGE_AREA.toString(16)}:${MESSAGE_AREA_LENGTH}`;
  await client.send(`calllog ${log} ${LIB_PRINT_STRING.toString(16)} ${windows} ${MAX_CALLS}`);
  await action();
  await client.send('calllog off');
  return collapseRepeats(parsePrintLog(readFileSync(log, 'utf8')));
}

/**
 * 主机步骤：在提示符下输入一条命令，返回命令执行期间显示的文字行。
 * @param {string} command 要输入的命令
 * @param {number} [frames] 输入后运行的帧数
 * @returns {{host: Function}} 步骤；结果数据是合并重复后的字符串数组（包含输入回显）
 */
export const shellText = (command, frames = 600) => ({
  host: async (client) => {
    await client.run(150);
    for (let i = 0; i < 3; i++) await client.tapKey(KEY.ENTER, 8, 20);
    return capture(client, async () => {
      await typeCommand(client, `${command}\n`);
      await client.run(frames);
    });
  },
});

/**
 * 主机步骤：命令还在等输入时（如“是否覆盖”提示）继续按键，返回这之后显示的文字行。
 * @param {string} keys 要输入的按键文本，换行表示回车
 * @param {number} [frames] 输入后运行的帧数
 * @returns {{host: Function}} 步骤
 */
export const moreText = (keys, frames = 400) => ({
  host: (client) =>
    capture(client, async () => {
      await typeCommand(client, keys);
      await client.run(frames);
    }),
});
