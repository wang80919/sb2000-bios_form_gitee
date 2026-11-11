// ------------------------------------------------------------------------
// 名称：p04-keyboard.mjs
// 说明：键盘驱动（KBD_HANDLER、KBD_TRANSLATE）的验证用例：用模拟器注入按键，在各种修饰键状态下读 ERAM 里的按键队列，与标准 IBM 键盘的翻译表比对；另检查修饰键标志与指示灯、队列指针。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值来自 verify/lib/ibm-keys.mjs（标准 IBM 美式键盘规则），不取自 BIOS 的映射表；与 IBM 不同的组合在 QUIRKS 里逐条列出并标“实测”。
//       用例先调一次 $6B/$05 让程序计数器停在桩里（外壳不再抢按键），然后直接读队列：KEY_QUEUE（$0336，12 字节）、读写指针 $0342/$0343、修饰键标志 $0344、指示灯 $0348。
//       模拟器按扫描码从小到大依次发键，修饰键要先按下并等几帧，再按普通键，先松普通键再松修饰键。
// ------------------------------------------------------------------------
import { TESTED_KEYS, ibmKey } from '../lib/ibm-keys.mjs';

const KEY_QUEUE = 0x336;
const KEY_INDEX = 0x342;
const KBD_FLAGS = 0x344;
const KBD_LEDS = 0x348;

const SHIFT = 0x2a;
const RSHIFT = 0x36;
const CTRL = 0x1d;
const ALT = 0x38;
const CAPS = 0x3a;
const NUMLOCK = 0x45;
const SCROLL = 0x46;

const hex = (value) => value.toString(16).padStart(2, '0');

/** 与标准 IBM 键盘不同的组合（实测）：键 | 状态 → [ASCII, 扫描码] 或 null（不产生按键） */
const QUIRKS = new Map();

// Ctrl 加上、下、Insert、Delete（扩展键）：映射表里这些项的 ASCII 是 $FD（文档说表示“不产生按键”），实际还是把 ($FD, 0) 放进了队列
for (const key of [0xc8, 0xd0, 0xd2, 0xd3]) QUIRKS.set(`${hex(key)}|ctrl+numLock`, [0xfd, 0x00]);
// NumLock 关时小键盘中间键（$4C）同样把 ($FD, 0) 放进队列
QUIRKS.set('4c|plain', [0xfd, 0x00]);
// Alt 加小键盘（NumLock 开）：IBM 没有按键（用于按数字输入字符），这里与普通按键一样给出数字的 ASCII 与扫描码
for (const [key, ascii] of [[0x47, 0x37], [0x48, 0x38], [0x49, 0x39], [0x4a, 0x2d], [0x4b, 0x34], [0x4c, 0x35], [0x4d, 0x36], [0x4e, 0x2b], [0x4f, 0x31], [0x50, 0x32], [0x51, 0x33], [0x52, 0x30], [0x53, 0x2e]]) QUIRKS.set(`${hex(key)}|alt+numLock`, [ascii, key]);

const press = async (client, key, frames = 4) => {
  await client.send(`key ${hex(key)} 1`);
  await client.send(`run ${frames}`);
  await client.send(`key ${hex(key)} 0`);
  await client.send(`run ${frames}`);
};

const hold = async (client, key) => {
  await client.send(`key ${hex(key)} 1`);
  await client.send('run 3');
};

const release = async (client, key) => {
  await client.send(`key ${hex(key)} 0`);
  await client.send('run 3');
};

const flags = async (client) => Buffer.from(await client.read('cpu', KBD_FLAGS, 1))[0];
const leds = async (client) => Buffer.from(await client.read('cpu', KBD_LEDS, 1))[0];

/** 读出队列里的第一个按键，没有时返回 null */
async function firstKey(client) {
  const pointers = Buffer.from(await client.read('cpu', KEY_INDEX, 2));
  if (pointers[1] === pointers[0]) return null;
  const queue = Buffer.from(await client.read('cpu', KEY_QUEUE, 12));
  return [queue[pointers[0]], queue[pointers[0] + 1]];
}

/**
 * 一种修饰状态下的全部按键用例。
 * @param {string} id 用例编号
 * @param {string} title 说明
 * @param {{shift?: boolean, caps?: boolean, ctrl?: boolean, alt?: boolean, numLock?: boolean}} state 预期状态
 * @param {{on: (client) => Promise<void>, off: (client) => Promise<void>}} mods 进入与退出该状态的操作
 */
const stateCase = (id, title, state, mods) => ({
  id,
  title,
  fresh: true,
  freshAfter: true,
  steps: [
    { func: 0x6b, sub: 0x05 },
    {
      host: async (client) => {
        const problems = [];
        await mods.on(client);
        for (const key of TESTED_KEYS) {
          await client.send(`write cpu ${hex(KEY_INDEX)} 0000`);
          await press(client, key);
          const got = await firstKey(client);
          const name = `${hex(key)}|${Object.entries(state).filter(([, v]) => v).map(([k]) => k).join('+') || 'plain'}`;
          const expected = QUIRKS.has(name) ? QUIRKS.get(name) : ibmKey(key, state);
          const same = expected === null ? got === null : got !== null && got[0] === expected[0] && got[1] === expected[1];
          if (!same) problems.push(`${name} 预期 ${expected ? `${hex(expected[0])},${hex(expected[1])}` : '无按键'}，实际 ${got ? `${hex(got[0])},${hex(got[1])}` : '无按键'}`);
        }
        await mods.off(client);
        return problems;
      },
      check: ({ data }) => data,
    },
  ],
});

const none = { on: async () => {}, off: async () => {} };
const holding = (...keys) => ({
  on: async (client) => { for (const key of keys) await hold(client, key); },
  off: async (client) => { for (const key of [...keys].reverse()) await release(client, key); },
});
const toggling = (key) => ({
  on: async (client) => press(client, key),
  off: async (client) => press(client, key),
});

const cases = [
  stateCase('kbd.plain', '无修饰键（开机后 NumLock 开）：普通键、功能键、小键盘数字与扩展键的翻译与标准 IBM 键盘一致', { numLock: true }, none),
  stateCase('kbd.shift', '按住 Shift：符号、大写字母、Shift+功能键、Shift+小键盘（NumLock 开时变成编辑键）', { shift: true, numLock: true }, holding(SHIFT)),
  stateCase('kbd.rshift', '按住右 Shift：与左 Shift 相同', { shift: true, numLock: true }, holding(RSHIFT)),
  stateCase('kbd.caps', 'CapsLock 开：字母大写，符号与数字不变', { caps: true, numLock: true }, toggling(CAPS)),
  stateCase('kbd.shift-caps', 'CapsLock 开并按住 Shift：字母变小写，符号仍按 Shift', { shift: true, caps: true, numLock: true }, {
    on: async (client) => { await press(client, CAPS); await hold(client, SHIFT); },
    off: async (client) => { await release(client, SHIFT); await press(client, CAPS); },
  }),
  stateCase('kbd.ctrl', '按住 Ctrl：Ctrl+字母得 1-26，Ctrl+功能键、Ctrl+编辑键得扩展码', { ctrl: true, numLock: true }, holding(CTRL)),
  stateCase('kbd.alt', '按住 Alt：Alt+字母、Alt+数字行、Alt+功能键得 0 加扩展码', { alt: true, numLock: true }, holding(ALT)),
  stateCase('kbd.numlock-off', 'NumLock 关：小键盘数字键变成编辑键（ASCII 为 0）', { numLock: false }, toggling(NUMLOCK)),
  {
    id: 'kbd.flags',
    title: '修饰键标志 $0344 与指示灯 $0348：Shift、右 Shift、Ctrl、Alt 按下与松开，CapsLock、NumLock、ScrollLock 切换',
    fresh: true,
    freshAfter: true,
    steps: [
      { func: 0x6b, sub: 0x05 },
      {
        host: async (client) => {
          const problems = [];
          const base = await flags(client);
          const baseLeds = await leds(client);
          const expectBits = async (what, mask, set) => {
            const now = await flags(client);
            if (((now & mask) !== 0) !== set) problems.push(`${what}：标志 $0344 预期位 $${hex(mask)} 为 ${set ? 1 : 0}，实际 $${hex(now)}`);
          };
          for (const [name, key, mask] of [['左 Shift', SHIFT, 0x02], ['右 Shift', RSHIFT, 0x01], ['Ctrl', CTRL, 0x04], ['Alt', ALT, 0x08]]) {
            await hold(client, key);
            await expectBits(`${name} 按下`, mask, true);
            await release(client, key);
            await expectBits(`${name} 松开`, mask, false);
          }
          for (const [name, key, flagMask, ledMask] of [['CapsLock', CAPS, 0x40, 0x04], ['NumLock', NUMLOCK, 0x20, 0x02], ['ScrollLock', SCROLL, 0x10, 0x01]]) {
            const wasOn = (base & flagMask) !== 0;
            await press(client, key);
            await expectBits(`${name} 第一次`, flagMask, !wasOn);
            if ((((await leds(client)) & ledMask) !== 0) === wasOn) problems.push(`${name} 第一次：指示灯 $0348 没有跟着变（实际 $${hex(await leds(client))}）`);
            await press(client, key);
            await expectBits(`${name} 第二次`, flagMask, wasOn);
            if ((await leds(client)) !== baseLeds) problems.push(`${name} 第二次：指示灯没有回到原来的 $${hex(baseLeds)}（实际 $${hex(await leds(client))}）`);
          }
          return problems;
        },
        check: ({ data }) => data,
      },
    ],
  },
  {
    id: 'kbd.wait-key',
    title: '$6B/$04 等待按键：队列里已有按键时立即返回第一个按键（先进先出），随后队列里剩下的按键还在',
    fresh: true,
    freshAfter: true,
    steps: [
      { func: 0x6b, sub: 0x05 },
      { host: async (client) => { await press(client, 0x1e); await press(client, 0x30); } },
      { func: 0x6b, sub: 0x04, expect: [[0x34b, [0x61, 0x1e]]] },
      { func: 0x6b, sub: 0x06, expect: [[0x34b, [1]]] },
    ],
  },
  {
    id: 'kbd.esc-break',
    title: '$6B/$01 置 ESC_BREAK（$063D）为 $FF，$6B/$02 清为 0',
    fresh: true,
    freshAfter: true,
    steps: [
      { func: 0x6b, sub: 0x01, expect: [[0x63d, [0xff]]] },
      { func: 0x6b, sub: 0x02, expect: [[0x63d, [0x00]]] },
    ],
  },
  {
    id: 'kbd.init-17',
    title: '$17 键盘复位与识别：调用返回（约 42 帧），但键盘复位后停止上报按键（实测，之后按键进不了队列）；再调 $6B/$00 重新初始化后按键恢复',
    fresh: true,
    freshAfter: true,
    steps: [
      { func: 0x6b, sub: 0x05 },
      { func: 0x17, maxFrames: 1500 },
      { host: async (client) => { await client.send(`write cpu ${hex(KEY_INDEX)} 0000`); await press(client, 0x1e); } },
      { func: 0x6b, sub: 0x03, expect: [[0x34b, [0x00, 0x00]]] },
      { func: 0x6b, sub: 0x00, maxFrames: 1500 },
      { host: async (client) => { await press(client, 0x1e); } },
      { func: 0x6b, sub: 0x03, expect: [[0x34b, [0x61, 0x1e]]] },
    ],
  },
  {
    id: 'kbd.init-6b0',
    title: '$6B/$00 初始化键盘与鼠标：清空队列里原有的按键，之后按键仍能进入队列并正确翻译',
    fresh: true,
    freshAfter: true,
    steps: [
      { func: 0x6b, sub: 0x05 },
      { host: async (client) => { await press(client, 0x30); await press(client, 0x2e); } },
      { func: 0x6b, sub: 0x00, maxFrames: 1500 },
      { func: 0x6b, sub: 0x06, expect: [[0x34b, [0]]] },
      { host: async (client) => { await press(client, 0x1e); } },
      { func: 0x6b, sub: 0x03, expect: [[0x34b, [0x61, 0x1e]]] },
    ],
  },
  {
    id: 'kbd.queue',
    title: '按键队列：12 字节的环形队列实际只能存 5 个按键（留一个空位区分满与空），第 6、7 个被丢弃；$6B/$06 返回个数，$6B/$03 逐个取出（先进先出），取完再取得 0，$6B/$05 清空',
    fresh: true,
    freshAfter: true,
    steps: [
      { func: 0x6b, sub: 0x05 },
      { host: async (client) => { for (const key of [0x1e, 0x30, 0x2e, 0x20, 0x12, 0x21, 0x22]) await press(client, key); } },
      { func: 0x6b, sub: 0x06, read: [[0x34b, 1]], expect: [[0x34b, [5]]] },
      ...[[0x61, 0x1e], [0x62, 0x30], [0x63, 0x2e], [0x64, 0x20], [0x65, 0x12]].map(([ascii, scan]) => ({ func: 0x6b, sub: 0x03, expect: [[0x34b, [ascii, scan]]] })),
      { func: 0x6b, sub: 0x03, expect: [[0x34b, [0, 0]]] },
      { host: async (client) => { await press(client, 0x1e); await press(client, 0x30); } },
      { func: 0x6b, sub: 0x06, expect: [[0x34b, [2]]] },
      { func: 0x6b, sub: 0x05 },
      { func: 0x6b, sub: 0x06, expect: [[0x34b, [0]]] },
    ],
  },
];

export { cases };
