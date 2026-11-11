// ------------------------------------------------------------------------
// 名称：p04-speech.mjs
// 说明：功能 $74（语音端口 $4302 的控制）子功能 0-13 与功能 $75 子功能 0、1、2 的验证用例：子功能 0-9 置位、清除 $032B 的各标志位（0 同时清 $4026 位 6）；$74 子功能 10-13 与 $75 子功能 0 校验向 $4302 发送的字节序列；$75 子功能 1 按序号从词条表选一段发送，子功能 2 按播放列表逐项发送。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值来自 系统调用手册与 API_74_PORT4302_CONTROL、NMI_IO4302_FEED 的代码阅读：1 开位 6、2 开位 1、3 关位 1、4 开位 2、5 关位 2、6 开位 0、7 关位 0、8 开位 3、9 关位 3。
//       $75 子功能 1 的词条表格式（读 PORT4302_PREPARE_SEND 得到，用例实测）：表头 2 字节是词条个数（低字节在前），之后每项 3 字节 [页号增量、相对表起点的偏移低字节、偏移高字节]；序号（$064A 高、$064B 低）不小于个数时什么都不发送就返回。子功能 2 及以上：从保存的 $032A（页）与 $0A/$0B（窗口地址）处读播放列表，表头 2 字节是“项数减 1”，每项 3 字节 [序号低字节、序号高字节、等待帧数 $0651]，每项按子功能 1 的规则在调用者给的词条表里选段发送，再等待。
//       子功能 10 以上在 $032B 位 6 置位时：$4026 位 6 置位，$0328 = $76 + 子功能，$0329 置 $FF；NMI 里先把 $0328 写进 $4302，再从 $0035（页）、$0036/$0037（偏移）指向的扩展 RAM 逐字节读出并写进 $4302，指针随之推进。
//       结束条件（$4302 低 4 位为 $F 时写 $0F 并清 $0328/$0329）：用最小的合法数据流（$0A 魔数、静音帧、结束帧）发送，语音合成器读到结束帧后 BIOS 返回，用例核对命令字节、数据序列、返回与清除；多项播放列表里后面的几项在模拟器里可能一发完命令字节就结束（取决于时序），所以多项用例只要求每段是预期数据的前缀。
//       多项播放列表的等待帧数：每项发完在 DELAY_FRAMES_0651 里等 $0651 次垂直消隐标志，NMI 处理程序也读状态寄存器清标志，每次等待占 1 到 3 帧，所以用调用日志的帧号核对等待了 d 到 3d+6 帧（d 为 0 时不超过 1 帧）。
// ------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BIOS_DIR } from '../../tools/config.mjs';
import { buildStub, ensureOutDir, runCall, toHex } from '../../tools/rom-driver.mjs';
import { assembleProject } from '../../../bios/tools/bios-project.mjs';

/** 子功能 → [位号, 置位还是清除] */
const FLAG_OPERATIONS = new Map([
  [1, [6, true]], [2, [1, true]], [3, [1, false]], [4, [2, true]], [5, [2, false]],
  [6, [0, true]], [7, [0, false]], [8, [3, true]], [9, [3, false]],
]);

const flagCases = [0x00, 0xff].flatMap((initial) => [...FLAG_OPERATIONS].map(([sub, [bit, set]]) => {
  const mask = 1 << bit;
  const want = set ? initial | mask : initial & ~mask & 0xff;
  return {
    id: `speech.f74.s${sub}.from${initial.toString(16).toUpperCase().padStart(2, '0')}`,
    title: `$74 子功能 ${sub}：$032B 位 ${bit} ${set ? '置位' : '清除'}（初值 $${initial.toString(16).toUpperCase().padStart(2, '0')}）`,
    func: 0x74,
    sub,
    mem: [[0x32b, [initial]]],
    expect: [[0x32b, [want]]],
    maxFrames: 60,
  };
}));

/** 子功能 0：关闭，$032B 与 $0332 的位 6 清 0，并把 $0332 写进 $4026 */
const closeCase = {
  id: 'speech.f74.s0',
  title: '$74 子功能 0：关闭，$032B、$0332 位 6 清 0，$4026 写入清位后的 $0332',
  func: 0x74,
  sub: 0,
  mem: [[0x32b, [0xff]], [0x332, [0xff]]],
  capture: [0x4026],
  expect: [[0x32b, [0xbf]], [0x332, [0xbf]]],
  expectWrites: [[0x4026, [0xbf]]],
  maxFrames: 60,
};

/** 子功能 10-13 与 $75：整段发送。数据是最小的合法语音流 $0A（开头标志，$75 由 BIOS 自己写）、静音帧、结束帧，后面跟若干无关字节；语音合成器读到结束帧后 $4302 低 4 位变 $F，BIOS 写 $0F、清 $0328/$0329 并返回 */
const DATA = Array.from({ length: 40 }, (_, i) => 0x11 + i);
const STREAM = [0x0a, 0x00, 0x0f, ...DATA];
const SEND_DATA = [0x00, 0x0f, ...DATA];
const SEND_FRAMES = 3000;

/** 核对整段发送：命令字节、数据逐字节一致（最后一个字节是结束时写的 $0F）、BIOS 返回、$0328/$0329 清 0、$4026 位 6 置位；pointer 为 true 时再核对 $0035-$0037 指针的推进 */
function checkFullSend(result, command, data, pointer) {
  const problems = [];
  if (!result.done) problems.push(`${SEND_FRAMES} 帧内没有返回，PC=${result.regs.pc}`);
  const sent = result.writes.get(0x4302) ?? [];
  const want = [command, ...data];
  const body = sent.slice(0, -1);
  if (sent.length < 4 || sent[sent.length - 1] !== 0x0f) problems.push(`$4302 最后一次写入应是 $0F，实际序列末尾 ${toHex(sent.slice(-2))}`);
  if (body.length < 4 || toHex(body.slice(0, 4)) !== toHex(want.slice(0, 4))) problems.push(`$4302 开头 ${toHex(body.slice(0, 4))}，预期 ${toHex(want.slice(0, 4))}`);
  else if (toHex(body) !== toHex(want.slice(0, body.length))) problems.push(`$4302 写入序列 ${toHex(body)}，预期是 ${toHex(want)} 的前 ${body.length} 字节`);
  const [cmd328, flag329] = result.memory.get(0x328);
  if (cmd328 !== 0 || flag329 !== 0) problems.push(`$0328/$0329 为 ${cmd328.toString(16)}/${flag329.toString(16)}，预期都被清 0`);
  if (pointer) {
    const [offsetLow, offsetHigh] = result.memory.get(0x36);
    const advanced = offsetLow + offsetHigh * 256;
    if (advanced !== body.length - 1) problems.push(`数据指针推进到 ${advanced}，预期等于已写数据字节数 ${body.length - 1}`);
  }
  const port4026 = result.writes.get(0x4026) ?? [];
  if (!port4026.some((value) => (value & 0x40) !== 0)) problems.push(`$4026 没有写入位 6 置位的值（实际写入 ${toHex(port4026)}）`);
  return problems;
}

const streamCases = [10, 11, 12, 13].map((sub) => ({
  id: `speech.f74.s${sub}`,
  title: `$74 子功能 ${sub}：先写命令字节 $${(0x76 + sub).toString(16).toUpperCase()}，再按 $0035-$0037 指针逐字节写数据到 $4302，播完后写 $0F、清 $0328/$0329 并返回`,
  fresh: true,
  freshAfter: true,
  steps: [
    {
      host: async (client) => {
        await client.send(`write pram 0 ${toHex(STREAM)}`);
        return runCall(client, {
          func: 0x74,
          sub,
          mem: [[0x32b, [0x40]], [0x332, [0x40]], [0x328, [0, 0]], [0x35, [0x80, 0x00, 0x00]]],
          capture: [0x4302, 0x4026],
          read: [[0x328, 2], [0x36, 2]],
          maxFrames: SEND_FRAMES,
        });
      },
      check: ({ data: result }) => checkFullSend(result, 0x76 + sub, STREAM, true),
    },
  ],
}));

/** $75 子功能 0，$032B 位 0 为 0（同步发送）：先写 $0A，再从 $0642 页组、$0C/$0D 窗口地址指向的数据逐字节写 $4302 */
const sendCase = {
  id: 'speech.f75.s0.sync',
  title: '$75 子功能 0：先写命令 $0A，再把窗口地址 $8000（页组 $80）起的数据逐字节写进 $4302，播完后写 $0F、清 $0328/$0329 并返回',
  fresh: true,
  freshAfter: true,
  steps: [
    {
      host: async (client) => {
        await client.send(`write pram 0 ${toHex(SEND_DATA)}`);
        return runCall(client, {
          func: 0x75,
          sub: 0,
          mem: [[0x32b, [0x00]], [0x328, [0, 0]], [0x642, [0x80]], [0x0c, [0x00, 0x80]]],
          capture: [0x4302, 0x4026],
          read: [[0x328, 2]],
          maxFrames: SEND_FRAMES,
        });
      },
      check: ({ data: result }) => checkFullSend(result, 0x0a, SEND_DATA, false),
    },
  ],
};

/** $75 子功能 1、2 用的词条表：表头 2 字节个数、每项 3 字节 [页号增量、偏移低、偏移高]，词条数据紧随其后 */
const PHRASE_A = [0x00, 0x0f, ...Array.from({ length: 40 }, (_, i) => 0x11 + i)];
const PHRASE_B = [0x00, 0x0f, ...Array.from({ length: 40 }, (_, i) => 0x51 + i)];
const TABLE_TAIL = Array.from({ length: 40 }, (_, i) => 0x71 + i);
const TABLE_HEADER_LENGTH = 2 + 3 * 2;
const PHRASE_TABLE = [
  0x02, 0x00,
  0x00, TABLE_HEADER_LENGTH, 0x00,
  0x00, TABLE_HEADER_LENGTH + PHRASE_A.length, 0x00,
  ...PHRASE_A,
  ...PHRASE_B,
  ...TABLE_TAIL,
];
const LIST_OFFSET = 0x100;
/** 从词条表偏移 offset 起的全部字节（发送不会在词条末尾停，要到语音合成器读到结束帧），后面补 0 */
const fromOffset = (offset) => [...PHRASE_TABLE.slice(offset), ...new Array(40).fill(0)];

/** 调用者给的词条表在窗口地址 $8000（页组 $80）；$75 子功能 1 按序号 index 选词条，sync 发送 */
const tableCase = (id, index, phrase, title) => ({
  id,
  title,
  fresh: true,
  freshAfter: true,
  steps: [
    {
      host: async (client) => {
        await client.send(`write pram 0 ${toHex(PHRASE_TABLE)}`);
        return runCall(client, {
          func: 0x75,
          sub: 1,
          mem: [[0x32b, [0x00]], [0x328, [0, 0]], [0x642, [0x80]], [0x0c, [0x00, 0x80]], [0x64a, [index >> 8, index & 0xff]]],
          capture: [0x4302, 0x4026],
          read: [[0x328, 2]],
          maxFrames: SEND_FRAMES,
        });
      },
      check: ({ data: result }) => (phrase === null
        ? [...(result.done ? [] : [`${SEND_FRAMES} 帧内没有返回，PC=${result.regs.pc}`]), ...((result.writes.get(0x4302) ?? []).length === 0 ? [] : [`序号越界时不应写 $4302，实际 ${toHex(result.writes.get(0x4302))}`])]
        : checkFullSend(result, 0x0a, phrase, false)),
    },
  ],
});

const tableCases = [
  tableCase('speech.f75.s1.index0', 0, fromOffset(TABLE_HEADER_LENGTH), '$75 子功能 1：序号 0 选词条表第 1 项，先写命令 $0A，再发送它指向的数据，播完后写 $0F、清 $0328/$0329 并返回'),
  tableCase('speech.f75.s1.index1', 1, fromOffset(TABLE_HEADER_LENGTH + PHRASE_A.length), '$75 子功能 1：序号 1 选词条表第 2 项'),
  tableCase('speech.f75.s1.out-of-range', 2, null, '$75 子功能 1：序号等于词条个数时什么都不发送就返回'),
];

/** $75 子功能 2：播放列表（只有 1 项：序号 1、等待 0 帧，表头写“项数减 1”即 0）在页内偏移 $0100，按保存的 $032A、$0A/$0B 取得 */
const listCase = {
  id: 'speech.f75.s2.list',
  title: '$75 子功能 2：从保存的页与偏移处读播放列表，按列表里的序号在词条表选段发送（只有一项：序号 1）',
  fresh: true,
  freshAfter: true,
  steps: [
    {
      host: async (client) => {
        const image = [...PHRASE_TABLE, ...new Array(LIST_OFFSET - PHRASE_TABLE.length).fill(0), 0x00, 0x00, 0x01, 0x00, 0x00];
        await client.send(`write pram 0 ${toHex(image)}`);
        return runCall(client, {
          func: 0x75,
          sub: 2,
          mem: [[0x32b, [0x00]], [0x328, [0, 0]], [0x642, [0x80]], [0x0c, [0x00, 0x80]], [0x32a, [0x80]], [0x0a, [LIST_OFFSET & 0xff, 0x80 | (LIST_OFFSET >> 8)]]],
          capture: [0x4302, 0x4026],
          read: [[0x328, 2]],
          maxFrames: SEND_FRAMES,
        });
      },
      check: ({ data: result }) => checkFullSend(result, 0x0a, fromOffset(TABLE_HEADER_LENGTH + PHRASE_A.length), false),
    },
  ],
};

/**
 * $75 子功能 2 的多项播放列表：列表表头 2 字节是“项数减 1”，每项 3 字节 [序号低字节、序号高字节、等待帧数]；逐项按子功能 1 的规则发送，发送完（序号越界时什么都不发）等待该项的帧数再取下一项。
 * 等待帧数用调用日志核对：每项在 DELAY_FRAMES_0651 入口记录 $0651 与帧号，下一项的 PORT4302_PREPARE_SEND 入口帧号减去它就是等待的帧数，最后一项用桩代码返回处的帧号。
 */
const symbols = assembleProject(BIOS_DIR).assembled.symbols;
const DELAY_ENTRY = symbols.get('DELAY_FRAMES_0651');
const PREPARE_ENTRY = symbols.get('PORT4302_PREPARE_SEND');
const STUB_LOOP = buildStub({ func: 0x75, sub: 2 }).loop;

/** 读调用日志里每次记录的 [帧号, 首个内存字节] */
const readCallLog = (file) => {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const records = [];
  for (let i = 0; i < lines.length; i++) {
    const frame = /^C pc=[0-9A-F]{4} .* F=(\d+)/.exec(lines[i]);
    if (!frame) continue;
    const memory = /^M [0-9A-F]{4} ([0-9A-F]{2})/.exec(lines[i + 2] ?? '');
    records.push([Number(frame[1]), memory ? parseInt(memory[1], 16) : null]);
  }
  return records;
};

/** 把 $4302 的写入序列按命令字节 $0A 切成每项一段 */
const splitSegments = (sent) => {
  const segments = [];
  for (const value of sent) {
    if (value === 0x0a) segments.push([]);
    if (segments.length) segments[segments.length - 1].push(value);
  }
  return segments;
};

/** items：[序号, 等待帧数]；phrases：每项预期发送的数据（序号越界为 null） */
const playlistCase = (id, title, items, phrases) => ({
  id,
  title,
  fresh: true,
  freshAfter: true,
  steps: [
    {
      host: async (client) => {
        const list = [(items.length - 1) & 0xff, (items.length - 1) >> 8, ...items.flatMap(([index, delay]) => [index & 0xff, index >> 8, delay])];
        const image = [...PHRASE_TABLE, ...new Array(LIST_OFFSET - PHRASE_TABLE.length).fill(0), ...list];
        await client.send(`write pram 0 ${toHex(image)}`);
        const dir = ensureOutDir('verify');
        const files = { delay: path.join(dir, 'speech-delay.log'), prepare: path.join(dir, 'speech-prepare.log'), done: path.join(dir, 'speech-done.log') };
        await client.send(`calllog ${files.delay} ${DELAY_ENTRY.toString(16)} 651:1`);
        await client.send(`calllog ${files.prepare} ${PREPARE_ENTRY.toString(16)} 651:1`);
        await client.send(`calllog ${files.done} ${STUB_LOOP.toString(16)} 651:1 1`);
        const result = await runCall(client, {
          func: 0x75,
          sub: 2,
          mem: [[0x32b, [0x00]], [0x328, [0, 0]], [0x642, [0x80]], [0x0c, [0x00, 0x80]], [0x32a, [0x80]], [0x0a, [LIST_OFFSET & 0xff, 0x80 | (LIST_OFFSET >> 8)]]],
          capture: [0x4302, 0x4026],
          read: [[0x328, 2]],
          maxFrames: SEND_FRAMES * items.length,
        });
        await client.send('calllog off');
        return { result, delays: readCallLog(files.delay), prepares: readCallLog(files.prepare), done: readCallLog(files.done) };
      },
      check: ({ data }) => {
        const { result, delays, prepares, done } = data;
        const problems = [];
        if (!result.done) return [`${SEND_FRAMES * items.length} 帧内没有返回，PC=${result.regs.pc}`];
        const segments = splitSegments(result.writes.get(0x4302) ?? []);
        const wantPhrases = phrases.filter((phrase) => phrase !== null);
        if (segments.length !== wantPhrases.length) problems.push(`$4302 的发送段数为 ${segments.length}，预期 ${wantPhrases.length}`);
        wantPhrases.forEach((phrase, k) => {
          const segment = segments[k] ?? [];
          const want = [0x0a, ...phrase];
          const body = segment.slice(0, -1);
          if (segment[segment.length - 1] !== 0x0f) problems.push(`第 ${k + 1} 段发送的末尾应是 $0F`);
          // 模拟器里语音合成器的“播完”状态取决于时序：后面几项可能一发完命令字节就结束（段只有 $0A、$0F），所以只要求每段是预期数据的前缀，第 1 段至少 4 字节
          if (body.length < (k === 0 ? 4 : 1) || toHex(body) !== toHex(want.slice(0, body.length))) problems.push(`第 ${k + 1} 段发送 ${toHex(body.slice(0, 6))}…，预期以 ${toHex(want.slice(0, 6))} 开头`);
        });
        if (delays.length !== items.length) problems.push(`DELAY_FRAMES_0651 被调用 ${delays.length} 次，预期 ${items.length}`);
        if (prepares.length !== items.length) problems.push(`PORT4302_PREPARE_SEND 被调用 ${prepares.length} 次，预期 ${items.length}`);
        items.forEach(([, delay], k) => {
          if (delays[k]?.[1] !== delay) problems.push(`第 ${k + 1} 项等待帧数 $0651 为 ${delays[k]?.[1]}，预期 ${delay}`);
          const next = k + 1 < items.length ? prepares[k + 1]?.[0] : done[0]?.[0];
          const waited = next - (delays[k]?.[0] ?? NaN);
          const upper = delay === 0 ? 1 : 3 * delay + 6;
          if (waited < delay || waited > upper) problems.push(`第 ${k + 1} 项之后等待了 ${waited} 帧，预期 ${delay} 到 ${upper}`);
        });
        const [cmd328, flag329] = result.memory.get(0x328);
        if (cmd328 !== 0 || flag329 !== 0) problems.push(`$0328/$0329 为 ${cmd328.toString(16)}/${flag329.toString(16)}，预期都被清 0`);
        if (problems.length) problems.push(`各段长度 ${segments.map((s) => s.length).join('、')}，各段前 8 字节 ${segments.map((s) => toHex(s.slice(0, 8))).join(' | ')}；DELAY 帧号 ${delays.map((d) => d[0]).join('、')}，PREPARE 帧号 ${prepares.map((d) => d[0]).join('、')}，返回帧号 ${done[0]?.[0]}`);
        return problems;
      },
    },
  ],
});

const PHRASE_A_FROM = fromOffset(TABLE_HEADER_LENGTH);
const PHRASE_B_FROM = fromOffset(TABLE_HEADER_LENGTH + PHRASE_A.length);
const playlistCases = [
  playlistCase('speech.f75.s2.list-three', '$75 子功能 2：三项播放列表（序号 0、1、0，等待 0、7、12 帧）按顺序发送，每项发完等待它的帧数', [[0, 0], [1, 7], [0, 12]], [PHRASE_A_FROM, PHRASE_B_FROM, PHRASE_A_FROM]),
  playlistCase('speech.f75.s2.list-skip', '$75 子功能 2：中间一项序号越界（等于词条个数）时什么都不发送，仍然等待它的帧数', [[1, 3], [2, 9], [0, 5]], [PHRASE_B_FROM, null, PHRASE_A_FROM]),
  playlistCase('speech.f75.s2.list-two', '$75 子功能 2：两项播放列表（表头写 1），第二项等待 20 帧后返回', [[0, 4], [1, 20]], [PHRASE_A_FROM, PHRASE_B_FROM]),
];

/** $75 子功能 0 的 $032B 位 0、2、3：位 0 为 1 时交给 NMI 逐字节送出，位 2 为 1 时再等到送完才返回，位 3 为 1 时命令字节改用 $0B；ends 为 false 时只核对命令字节与数据开头，不等播完 */
const modeCase = (id, flags, command, returnsEarly, ends, title) => ({
  id,
  title,
  fresh: true,
  freshAfter: true,
  steps: [
    {
      host: async (client) => {
        await client.send(`write pram 0 ${toHex(SEND_DATA)}`);
        return runCall(client, {
          func: 0x75,
          sub: 0,
          mem: [[0x32b, [flags]], [0x328, [0, 0]], [0x642, [0x80]], [0x0c, [0x00, 0x80]]],
          capture: [0x4302, 0x4026],
          read: [[0x328, 2]],
          maxFrames: ends ? SEND_FRAMES : 300,
          settle: returnsEarly ? (ends ? 600 : 100) : 0,
        });
      },
      check: ({ data: result }) => {
        if (!ends) {
          const sent = result.writes.get(0x4302) ?? [];
          const want = [command, ...SEND_DATA.slice(0, 3)];
          const problems = [];
          if (toHex(sent.slice(0, 4)) !== toHex(want)) problems.push(`$4302 开头 ${toHex(sent.slice(0, 4))}，预期 ${toHex(want)}`);
          if (result.memory.get(0x328)[0] !== command) problems.push(`$0328 为 ${result.memory.get(0x328)[0].toString(16)}，预期命令字节 ${command.toString(16)}`);
          if (!returnsEarly === result.done) problems.push(`调用${result.done ? '返回了' : '没有返回'}，预期${returnsEarly ? '登记后就返回' : '一直等待送完'}`);
          return problems;
        }
        const problems = checkFullSend(result, command, SEND_DATA, false);
        if (returnsEarly && result.frames > 4) problems.push(`调用应在发送开始前就返回，实际用了 ${result.frames} 帧`);
        if (!returnsEarly && result.frames <= 4) problems.push(`调用应等到送完才返回，实际只用了 ${result.frames} 帧`);
        return problems;
      },
    },
  ],
});

const modeCases = [
  modeCase('speech.f75.s0.nmi', 0x01, 0x0a, true, true, '$75 子功能 0，$032B 位 0 为 1：只登记数据位置就返回，由 NMI 逐字节送出，播完后写 $0F、清 $0328/$0329'),
  modeCase('speech.f75.s0.nmi-wait', 0x05, 0x0a, false, true, '$75 子功能 0，$032B 位 0、2 为 1：NMI 逐字节送出，等送完才返回'),
  modeCase('speech.f75.s0.cmd0b', 0x08, 0x0b, false, true, '$75 子功能 0，$032B 位 3 为 1：同步发送，命令字节是 $0B，等送完与播完后返回'),
  modeCase('speech.f75.s0.nmi-cmd0b', 0x09, 0x0b, true, true, '$75 子功能 0，$032B 位 0、3 为 1：登记后就返回，NMI 以命令字节 $0B 开始逐字节送出，播完后写 $0F、清 $0328/$0329'),
];

export const cases = [closeCase, ...flagCases, ...streamCases, sendCase, ...tableCases, listCase, ...playlistCases, ...modeCases];
