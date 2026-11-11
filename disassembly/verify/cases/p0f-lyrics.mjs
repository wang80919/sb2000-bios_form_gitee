// ------------------------------------------------------------------------
// 名称：p0f-lyrics.mjs
// 说明：卡拉 OK 歌词排版（页组 $0F 的 TEXT_PARSE_LINE、TEXT_PARSE_BACK、TEXT_BUILD_NEXT_LINE，功能 $66 的主体）的验证用例：用特制的歌词文字流逐步调用，核对 $04A4-$05FF 与零页 $32-$34 的全部字节和 TEXT_BUILD_NEXT_LINE 的返回值。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-10
// 备注：预期值来自 verify/lib/lyric-model.mjs（按 bios/src/karaoke/lyrics-scroll.asm 转录）。歌词文字流的格式（读代码得到，用例逐字节核对）：
//       每项 ASCII 字符 [字符, 时长]，汉字 [GB2312 高字节, 低字节, 时长]，时长后可跟若干 [$80, 附加时长]（时长相加，可超过 255）；$00 是空白 [$00, 时长]；
//       $20 空格 [$20, 时长]，时长为 0 的空格不占条带，只把位置推进 2；$5E 是 “^”，在子段外显示成 A1F1 并按汉字算，在子段里按空白算；$9D 换行（一行最多 28 个字节，不足补空格）；
//       $8E 调用子段 [$8E, 起点偏移 2 字节, 终点偏移 2 字节]（偏移相对歌词数据起点），读到终点后回到调用之后继续，最多两层；$FF 结束。
//       逐行解析（TEXT_PARSE_LINE）与往前解析（TEXT_PARSE_BACK）各用一个位置栈走同一份数据；两行歌词显示地址交替，$9D 到达时往前解析把一条 $C0 命令排进条带队列。
//       条带命令队列在用例里不开 NMI 动画，每步前把读索引追上写索引（相当于动画取走了命令），上一步排进过 $C0 命令时再把“下一行已解析好”标志清 0（动画处理 $C0 时清它）。
//       画一行用功能 $3C，屏幕内容不核对。
// ------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { runCall, toHex } from '../../tools/rom-driver.mjs';
import { officialImage } from '../../tools/config.mjs';
import { LyricModel, addr } from '../lib/lyric-model.mjs';
import { parseFat12 } from '../lib/fat12.mjs';

const hex2 = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const WINDOW_BASE = 0x8100;
const DATA_OFFSET = WINDOW_BASE - 0x8000;
const REGION_START = 0x04a4;
const REGION_LENGTH = 0x15c;
const TRAMPOLINE = 0x7d00;
const RESULT = 0x7eff;
const ROW0 = 0x0240;
// 一行超过 28 个字节时，补空格的循环让 X 回绕，把 LYRIC_LINE_BUFFER 之后的 $05CB-$06AD（含位置栈、往前解析指针）全写成 $20，此后歌词状态已破坏，这类用例只执行第一次逐行解析
const HIGH_START = 0x0600;
const HIGH_LENGTH = 0xae;
// 系统调用的工作区（功能号、参数、页组等），调用之后会变，不比较
const SYSCALL_AREA_START = 0x0630;
const SYSCALL_AREA_END = 0x0654;

// ---- 歌词文字流的积木 ----
const ascii = (char, duration, extra = []) => [char.charCodeAt(0), duration, ...extra.flatMap((value) => [0x80, value])];
const han = (high, low, duration, extra = []) => [high, low, duration, ...extra.flatMap((value) => [0x80, value])];
const space = (duration) => [0x20, duration];
const blank = (duration, extra = []) => [0x00, duration, ...extra.flatMap((value) => [0x80, value])];
const caret = (duration) => [0x5e, duration];
const NEWLINE = [0x9d];
const END = [0xff];

/** 主段 + 若干子段拼成一份数据；call(index) 是对第 index 个子段的 $8E 调用，起点与终点偏移在拼接时补上 */
const stream = (main, subs = []) => {
  const encode = (list) => {
    const body = [];
    const calls = [];
    for (const item of list) {
      if (item.call !== undefined) { calls.push({ at: body.length + 1, sub: item.call }); body.push(0x8e, 0, 0, 0, 0); } else body.push(...item);
    }
    return { body, calls };
  };
  const parts = [encode(main), ...subs.map(encode)];
  parts[0].body.push(...END);
  const ranges = [];
  let offset = parts[0].body.length;
  for (const part of parts.slice(1)) { ranges.push([offset, offset + part.body.length]); offset += part.body.length; }
  for (const part of parts) {
    for (const { at, sub } of part.calls) {
      const [from, to] = ranges[sub];
      part.body.splice(at, 4, from & 0xff, from >> 8, to & 0xff, to >> 8);
    }
  }
  return parts.flatMap((part) => part.body);
};
const call = (index) => ({ call: index });

// ---- 用例 ----
const makeRegion = (seed) => Array.from({ length: REGION_LENGTH }, (_, i) => (i * 13 + seed * 7) & 0xff);

const lyricCase = ({ id, title, bytes, erase = 0, seed = 1, maxSteps = 60, overflow = false }) => {
  const window = new Uint8Array(0x1000).fill(0xee);
  bytes.forEach((byte, i) => { window[DATA_OFFSET + i] = byte; });
  const ram = new Uint8Array(0x800);
  const region = makeRegion(seed);
  region.forEach((byte, i) => { ram[REGION_START + i] = byte; });
  ram[0x32] = 0x11; ram[0x33] = 0x22;
  const model = new LyricModel(ram, window);
  const initial = [
    ['LYRIC_BYTE', 0x80], ['BAR_ERASE_MODE', erase], ['BAR_LINE_FLAG', 0], ['BAR_READ_INDEX', 0], ['BAR_WRITE_INDEX', 0],
    ['LYRIC_END_FLAG', 0], ['LYRIC_DEPTH_A', 0], ['LYRIC_DEPTH_B', 0], ['LYRIC_BUILD_FLAG', 0],
  ];
  const words = [
    ['LYRIC_ROW0_ADDR_LO', 'LYRIC_ROW0_ADDR_HI', ROW0], ['LYRIC_ROW1_ADDR_LO', 'LYRIC_ROW1_ADDR_HI', ROW0 + 0x38],
    ['LYRIC_DATA_BASE_LO', 'LYRIC_DATA_BASE_HI', WINDOW_BASE], ['LYRIC_BACK_PTR_LO', 'LYRIC_BACK_PTR_HI', WINDOW_BASE], ['LYRIC_LINE_PTR_LO', 'LYRIC_LINE_PTR_HI', WINDOW_BASE],
    ['LYRIC_BACK_END_LO', 'LYRIC_BACK_END_HI', 0], ['LYRIC_LINE_END_LO', 'LYRIC_LINE_END_HI', 0],
    ['LYRIC_ROW_ADDR_LO', 'LYRIC_ROW_ADDR_HI', ROW0], ['LYRIC_POSITION_LO', 'LYRIC_POSITION_HI', ROW0],
  ];
  for (const [name, value] of initial) model.set(name, value);
  for (const [lo, hi, value] of words) model.setW(lo, hi, value);
  const startRegion = Uint8Array.from(ram.subarray(REGION_START, REGION_START + REGION_LENGTH));
  const startZero = [ram[0x32], ram[0x33], 0x80];
  ram[0x34] = 0x80;

  // 按初始化的顺序：先两次 PARSE_LINE，再反复 BUILD_NEXT_LINE 直到返回 $FF
  const routines = new Map([['line', addr('TEXT_PARSE_LINE')], ['build', addr('TEXT_BUILD_NEXT_LINE')]]);
  const plan = ['line', 'line'];
  const steps = [];
  let drainFlag = false;
  for (let step = 0; step < plan.length || (steps.length && steps[steps.length - 1].result !== 0xff && step < maxSteps); step++) {
    const kind = plan[step] ?? 'build';
    const writeBefore = model.b('BAR_WRITE_INDEX');
    const pokes = [[addr('BAR_READ_INDEX'), [writeBefore]]];
    model.set('BAR_READ_INDEX', writeBefore);
    if (drainFlag) { pokes.push([addr('BAR_LINE_FLAG'), [0]]); model.set('BAR_LINE_FLAG', 0); }
    const queueBefore = model.b('BAR_WRITE_INDEX');
    let result;
    try {
      result = kind === 'build' ? model.buildNextLine() : (model.parseLine(), null);
    } catch (error) {
      throw new Error(`用例 ${id} 第 ${step + 1} 步（${kind}）：${error.message}`);
    }
    const queueAfter = model.b('BAR_WRITE_INDEX');
    drainFlag = false;
    for (let at = queueBefore; at !== queueAfter; at = (at + 4) & 0xff) if (model.ram[addr('BAR_QUEUE') + at] === 0xc0) drainFlag = true;
    steps.push({ kind, pokes, result, region: Uint8Array.from(model.ram.subarray(REGION_START, REGION_START + REGION_LENGTH)), zero: [model.ram[0x32], model.ram[0x33], model.ram[0x34]], high: overflow && step === 0 ? Uint8Array.from(model.ram.subarray(HIGH_START, HIGH_START + HIGH_LENGTH)) : null });
    if (overflow || (kind === 'build' && result !== 0)) break;
  }

  return {
    id: `lyrics.${id}`,
    title: `卡拉 OK 歌词排版：${title}（${steps.length} 步）`,
    fresh: true,
    steps: [{
      host: async (client) => {
        await client.send(`write pram 0 ${toHex(window)}`);
        await client.send(`write cpu ${REGION_START.toString(16)} ${toHex(startRegion)}`);
        await client.send(`write cpu 32 ${toHex([startZero[0], startZero[1], 0x80])}`);
        const initialWrites = [...initial.map(([name, value]) => [addr(name), [value]]), ...words.flatMap(([lo, , value]) => [[addr(lo), [value & 0xff, value >> 8]]])];
        for (const [address, bytes] of initialWrites) await client.send(`write cpu ${address.toString(16)} ${toHex(bytes)}`);
        const results = [];
        for (const step of steps) {
          for (const [address, bytes] of step.pokes) await client.send(`write cpu ${address.toString(16)} ${toHex(bytes)}`);
          const target = routines.get(step.kind);
          await client.send(`write cpu ${TRAMPOLINE.toString(16)} ${toHex([0x20, target & 0xff, target >> 8, 0x8d, RESULT & 0xff, RESULT >> 8, 0x60])}`);
          results.push(await runCall(client, {
            func: 0x25,
            sub: 0,
            mem: [[0x642, [0x0f]], [0x0c, [TRAMPOLINE & 0xff, TRAMPOLINE >> 8]], [RESULT, [0xee]]],
            read: [[REGION_START, REGION_LENGTH], [0x32, 3], [RESULT, 1], [HIGH_START, HIGH_LENGTH]],
            maxFrames: 300,
          }));
        }
        return results;
      },
      check: ({ data }) => {
        const problems = [];
        for (let i = 0; i < steps.length; i++) {
          const got = data[i];
          const want = steps[i];
          const label = `第 ${i + 1} 步（${want.kind === 'build' ? 'TEXT_BUILD_NEXT_LINE' : 'TEXT_PARSE_LINE'}）`;
          if (!got.done) { problems.push(`${label}没有返回`); break; }
          const region = got.memory.get(REGION_START);
          for (let k = 0; k < REGION_LENGTH && problems.length < 12; k++) {
            if (region[k] !== want.region[k]) problems.push(`${label}：$${(REGION_START + k).toString(16).toUpperCase()} 为 ${hex2(region[k])}，预期 ${hex2(want.region[k])}`);
          }
          const zero = got.memory.get(0x32);
          for (let k = 0; k < 3; k++) if (zero[k] !== want.zero[k]) problems.push(`${label}：$${(0x32 + k).toString(16).toUpperCase()} 为 ${hex2(zero[k])}，预期 ${hex2(want.zero[k])}`);
          if (want.kind === 'build') {
            const returned = got.memory.get(RESULT)[0];
            if (returned !== want.result) problems.push(`${label}：返回值 ${hex2(returned)}，预期 ${hex2(want.result)}`);
          }
          if (want.high) {
            const high = got.memory.get(HIGH_START);
            for (let k = 0; k < HIGH_LENGTH && problems.length < 12; k++) {
              if (HIGH_START + k >= SYSCALL_AREA_START && HIGH_START + k < SYSCALL_AREA_END) continue;
              if (high[k] !== want.high[k]) problems.push(`${label}：$${(HIGH_START + k).toString(16).toUpperCase()} 为 ${hex2(high[k])}，预期 ${hex2(want.high[k])}`);
            }
          }
          if (problems.length) break;
        }
        return problems.slice(0, 12);
      },
    }],
  };
};

// 小汉字：啊 B0A1、阿 B0A2、爱 B0AE、我 CED2、你 C4E3
const A = [0xb0, 0xa1];
const B = [0xb0, 0xa2];
const C = [0xb0, 0xae];
const D = [0xce, 0xd2];
const E = [0xc4, 0xe3];

/** 简单的确定性随机数 */
const rng = (seed) => { let state = seed >>> 0; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; }; };

/** 随机歌词：若干行，每行 3-10 项，偶尔调用子段（子段里再调用至多一层） */
const randomStream = (seed) => {
  const next = rng(seed);
  const pick = (list) => list[Math.floor(next() * list.length)];
  const durations = [0, 1, 2, 3, 5, 7, 8, 9, 12, 16, 17, 24, 31, 40, 64, 100];
  const item = (allowCaret) => {
    const kind = next();
    const duration = pick(durations);
    const extra = next() < 0.15 ? [pick([1, 9, 50, 120, 200])] : [];
    if (kind < 0.35) return ascii(String.fromCharCode(0x41 + Math.floor(next() * 26)), duration, extra);
    if (kind < 0.6) return han(...pick([A, B, C, D, E]), duration, extra);
    if (kind < 0.72) return space(pick([0, 3, 8]));
    if (kind < 0.82) return blank(pick([1, 5, 20, 100]), extra);
    if (allowCaret && kind < 0.9) return caret(pick([2, 6, 16]));
    return ascii('x', duration, extra);
  };
  const subs = [[item(true), item(true), item(false)], [item(true), item(true), call(0), item(false)], []];
  subs[2] = [item(true), call(0), item(true)];
  const main = [];
  for (let row = 0; row < 4; row++) {
    const count = 2 + Math.floor(next() * 3);
    for (let i = 0; i < count; i++) main.push(item(true));
    if (next() < 0.7) main.push(call(Math.floor(next() * 3)));
    main.push(NEWLINE);
  }
  return stream(main, subs);
};

// 官方软盘 1 里 WIN98 目录的 KARAOK.EXE 带的歌词文字流：实机在 $66 入口时 LYRIC_PTR 为 $B40B、页组为 $88（调用日志），文字流以下面这段字节开头（空白、“^”、括号与汉字）
const OFFICIAL_MARK = [0x00, 0x40, 0x00, 0x40, 0x5e, 0x20, 0x5e, 0x20, 0x28, 0x00, 0xc5, 0xae, 0x00, 0x29];

/** 从官方软盘的 KARAOK.EXE 里取歌词文字流（找开头的字节段，取后面最多 $E00 字节，模型读到 $FF 结束项就停） */
const officialLyricBytes = () => {
  const official = parseFat12(readFileSync(officialImage(1).path ?? officialImage(1)));
  const win = official.listRoot().find((e) => e.name83.startsWith('WIN98'));
  const entry = official.listDir(win.cluster ?? win.startCluster ?? win.firstCluster).find((e) => e.name83.startsWith('KARAOK'));
  const file = Buffer.from(official.readFile(entry));
  const at = file.indexOf(Buffer.from(OFFICIAL_MARK));
  if (at < 0) throw new Error('KARAOK.EXE 里找不到歌词文字流的开头');
  return Array.from(file.subarray(at, at + 0xe00));
};

const cases = [
  lyricCase({ id: 'basic', title: '两行：英文、汉字、不同时长', bytes: stream([ascii('A', 3), ascii('B', 5), han(...A, 4), ascii('C', 2), NEWLINE, ascii('D', 1), ascii('E', 1), han(...B, 9), NEWLINE]) }),
  lyricCase({ id: 'durations', title: '时长 0、1、7、8、9、15、16、17、40、200 与附加时长（总时长超过 255）', bytes: stream([
    ascii('a', 0), ascii('b', 1), ascii('c', 7), ascii('d', 8), ascii('e', 9), ascii('f', 15), ascii('g', 16), ascii('h', 17), ascii('i', 40), ascii('j', 200), NEWLINE,
    han(...A, 0), han(...B, 1), han(...C, 7), han(...D, 8), han(...E, 9), han(...A, 17), han(...B, 40), NEWLINE,
    ascii('k', 200, [100]), ascii('l', 255, [255]), han(...C, 200, [100, 7]), NEWLINE,
  ]) }),
  lyricCase({ id: 'spaces-blanks', title: '空格（时长 0 与非 0）与空白项（长时长拆成每块 255）', bytes: stream([
    ascii('a', 2), space(0), ascii('b', 2), space(5), ascii('c', 2), space(0), space(0), ascii('d', 1), NEWLINE,
    blank(5), ascii('e', 3), blank(250, [250]), ascii('f', 3), blank(0), blank(255), blank(1, [254]), NEWLINE,
  ]) }),
  lyricCase({ id: 'caret', title: '“^”：子段外显示成 A1F1 并按汉字算（连续出现一并处理），子段里按空白算', bytes: stream([
    caret(4), caret(6), ascii('a', 2), caret(8), call(0), ascii('b', 2), NEWLINE, caret(3), call(0), NEWLINE,
  ], [[caret(5), ascii('s', 3), caret(7)]]) }),
  lyricCase({ id: 'call', title: '$8E 调用子段（一层与两层嵌套，同一子段被调用两次）', bytes: stream([
    ascii('a', 2), call(0), ascii('b', 3), NEWLINE, call(1), ascii('c', 4), call(0), NEWLINE,
  ], [[ascii('x', 5), han(...A, 6)], [ascii('y', 7), call(0), ascii('z', 8)]]) }),
  lyricCase({ id: 'erase-mode', title: '擦除模式（BAR_ERASE_MODE 非 0）：汉字的第二块地址加 $10', bytes: stream([ascii('A', 3), han(...A, 4), han(...B, 9), NEWLINE, han(...C, 17), ascii('E', 8), NEWLINE]), erase: 1 }),
  lyricCase({ id: 'full-line', title: '一行正好 28 个字节（14 个汉字，以及 28 个英文字符）', bytes: stream([
    ...Array.from({ length: 14 }, (_, i) => han(0xb0, 0xa1 + i, 2 + i)), NEWLINE,
    ...Array.from({ length: 28 }, (_, i) => ascii(String.fromCharCode(0x41 + (i % 26)), 1 + (i % 5))), NEWLINE,
  ]) }),
  lyricCase({ id: 'overflow-ascii', title: '一行 29 个英文字符：补空格的循环绕过 X=255，$05CB-$06AD 被写成 $20', overflow: true, bytes: stream([
    ...Array.from({ length: 29 }, (_, i) => ascii(String.fromCharCode(0x41 + (i % 26)), 1 + (i % 4))), NEWLINE, ascii('a', 3), NEWLINE,
  ]) }),
  lyricCase({ id: 'overflow-han', title: '一行 15 个汉字（30 个字节）超长', overflow: true, bytes: stream([
    ...Array.from({ length: 15 }, (_, i) => han(0xb0, 0xa1 + i, 3)), NEWLINE, han(...A, 5), NEWLINE,
  ]) }),
  lyricCase({ id: 'overflow-chars', title: '一行 60 个英文字符超长', overflow: true, bytes: stream([
    ...Array.from({ length: 60 }, (_, i) => ascii(String.fromCharCode(0x61 + (i % 26)), 2)), NEWLINE, ascii('b', 3), NEWLINE,
  ]) }),
  lyricCase({ id: 'control-codes', title: '$81-$9C 的不认识的控制码：逐行解析当 1 字节字符，往前解析只跳过 1 字节', bytes: [
    ...stream([ascii('a', 2), [0x85, 3], ascii('b', 2), NEWLINE, ascii('c', 1), [0x9c, 2, 4], ascii('d', 6), NEWLINE, [0x81, 5], [0x90, 5], ascii('e', 4), NEWLINE]),
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
  ] }),
  lyricCase({ id: 'empty-lines', title: '空行、只有一项的行、结尾没有换行', bytes: stream([NEWLINE, ascii('a', 4), NEWLINE, NEWLINE, han(...D, 6)]) }),
  lyricCase({ id: 'official-karaok', title: '官方 KARAOK.EXE 自带的歌词文字流（整首，逐步对照模型）', bytes: officialLyricBytes(), maxSteps: 2000 }),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((seed) => lyricCase({ id: `random-${seed}`, title: `随机歌词 ${seed}（含子段、附加时长、空格、空白、“^”）`, bytes: randomStream(seed), erase: seed % 2, seed })),
];

export { cases };
