// ------------------------------------------------------------------------
// 名称：tools.test.mjs
// 说明：FAT12 镜像、键盘映射、CDL 清单生成与重新汇编校验、调试客户端的测试。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：客户端测试使用本机临时 TCP 服务模拟 DebugServer 的应答，不依赖模拟器。
// ------------------------------------------------------------------------
import assert from 'node:assert/strict';
import net from 'node:net';
import { test } from 'node:test';
import { CDL, PAGE_SIZE, generateListings } from '../tools/cdl-listing.mjs';
import { GEOMETRY, buildFat12Image, listFat12, readFat12File, toShortName } from '../tools/fat12-image.mjs';
import { KEY, keyForChar, typeText } from '../tools/keyboard.mjs';
import { Sb2kClient, hexLinesToBytes, parseFields, parseReply } from '../tools/sb2k-client.mjs';
import { verifyListings } from '../tools/roundtrip.mjs';
import { parseCallLog, renderMarkdown, summarizeCalls } from '../tools/analyze-api-log.mjs';
import { renderUsageDoc, scanApiCalls } from '../tools/exe-api-scan.mjs';

test('8.3 文件名转换会转大写并补空格，非法名字报错', () => {
  assert.equal(toShortName('edit.exe'), 'EDIT    EXE');
  assert.equal(toShortName('AUTOEXEC.BAT'), 'AUTOEXECBAT');
  assert.equal(toShortName('README'), 'README     ');
  assert.throws(() => toShortName('toolongname.exe'), /8\.3/);
  assert.throws(() => toShortName('a.html'), /8\.3/);
  assert.throws(() => toShortName('bad name.txt'), /8\.3/);
});

test('FAT12 镜像大小固定，写入的文件能原样读回，含跨簇与空文件', () => {
  const big = Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 251));
  const image = buildFat12Image(
    [
      { name: 'big.bin', data: big },
      { name: 'empty.txt', data: Buffer.alloc(0) },
      { name: 'small.txt', data: Buffer.from('hello') },
    ],
    { label: 'TESTDISK' },
  );
  assert.equal(image.length, GEOMETRY.totalSectors * GEOMETRY.bytesPerSector);
  assert.equal(image.readUInt16LE(510), 0xaa55);
  const entries = listFat12(image);
  assert.deepEqual(entries.map((e) => e.name), ['BIG.BIN', 'EMPTY.TXT', 'SMALL.TXT']);
  assert.deepEqual(readFat12File(image, entries[0]), big);
  assert.equal(readFat12File(image, entries[1]).length, 0);
  assert.equal(readFat12File(image, entries[2]).toString(), 'hello');
});

test('文件总量超过软盘容量时报错', () => {
  const files = Array.from({ length: 3 }, (_, i) => ({ name: `F${i}.BIN`, data: Buffer.alloc(600 * 1024) }));
  assert.throws(() => buildFat12Image(files), /空间不足/);
});

test('键盘映射：大写与符号需要 Shift，数字与回车直接映射', () => {
  assert.deepEqual(keyForChar('a'), { code: 0x1e, shift: false });
  assert.deepEqual(keyForChar('A'), { code: 0x1e, shift: true });
  assert.deepEqual(keyForChar('1'), { code: 0x02, shift: false });
  assert.deepEqual(keyForChar('!'), { code: 0x02, shift: true });
  assert.deepEqual(keyForChar('.'), { code: 0x34, shift: false });
  assert.deepEqual(keyForChar('\n'), { code: KEY.ENTER, shift: false });
  assert.throws(() => keyForChar('中'), /没有对应的按键/);
});

test('输入文本时按“按下、运行、松开、运行”的顺序发送命令，大写字母带 Shift', async () => {
  const sent = [];
  await typeText({ send: async (cmd) => sent.push(cmd) }, 'A', { holdFrames: 3, gapFrames: 2 });
  assert.deepEqual(sent, ['key 2a 1', 'key 1e 1', 'run 3', 'key 1e 0', 'key 2a 0', 'run 2']);
});

/** 构造一个只含若干条指令的 ROM 与对应 CDL（每页 4K，两页） */
function buildSample() {
  const rom = new Uint8Array(PAGE_SIZE * 2).fill(0xff);
  const cdl = new Uint8Array(PAGE_SIZE * 2);
  // 第 0 页：$8000 LDA #$05 / DEX / BNE $8001 / JMP $8010 / RTS，其后是数据 $12 $34
  const code = [0xa9, 0x05, 0xca, 0xd0, 0xfd, 0x4c, 0x10, 0x80, 0x60];
  code.forEach((b, i) => { rom[i] = b; });
  const opcodeOffsets = [0, 2, 3, 5, 8];
  const lengths = { 0: 2, 2: 1, 3: 2, 5: 3, 8: 1 };
  for (const offset of opcodeOffsets) {
    cdl[offset] = CDL.OPCODE;
    for (let i = 1; i < lengths[offset]; i++) cdl[offset + i] = CDL.OPERAND;
  }
  rom[0x0f] = 0x12;
  cdl[0x0f] = CDL.READ;
  // JMP $8010 的目标是第 0 页内 $8010，放一条 RTS 让它成为有效指令起点
  rom[0x10] = 0x60;
  cdl[0x10] = CDL.OPCODE;
  return { rom, cdl };
}

test('清单只输出被访问过的页，控制流目标变成标签，数据按 .byte 输出', () => {
  const { rom, cdl } = buildSample();
  const { listings } = generateListings(rom, cdl);
  assert.deepEqual([...listings.keys()], [0]);
  const text = listings.get(0);
  assert.match(text, /\.org \$8000/);
  assert.match(text, /P00_8002:\n    DEX/);
  assert.match(text, /BNE P00_8002/);
  assert.match(text, /\.byte \$12 ; \$800F 数据\n/);
  assert.doesNotMatch(text, /P00_8001/);
});

test('分支目标是指令起点时才生成标签', () => {
  const { rom, cdl } = buildSample();
  rom[4] = 0xfb; // BNE 改为跳到 $8000
  const text = generateListings(rom, cdl).listings.get(0);
  assert.match(text, /P00_8000:/);
  assert.match(text, /BNE P00_8000/);
  assert.match(text, /JMP P00_8010/);
});

test('清单重新汇编后与原始 ROM 逐字节一致', () => {
  const { rom, cdl } = buildSample();
  const { listings } = generateListings(rom, cdl);
  const result = verifyListings(listings, rom);
  assert.equal(result.ok, true, JSON.stringify(result.mismatches));
  assert.equal(result.pagesChecked, 1);
});

test('指令边界与实际执行不一致时降级为 .byte，仍能还原字节', () => {
  const { rom, cdl } = buildSample();
  cdl[1] = CDL.OPCODE; // 把 LDA 的操作数也标成指令首字节，制造冲突
  const { listings } = generateListings(rom, cdl);
  assert.match(listings.get(0), /指令边界不一致/);
  assert.equal(verifyListings(listings, rom).ok, true);
});

test('API 调用日志按 $063E 功能号汇总，返回地址等于栈上地址加一', () => {
  const log = [
    'C pc=FFF0 a=25 x=01 y=02 s=FB p=A1 F=1',
    'STK 75 C0 00 00 00 00 00 00',
    'M 063A 00 00 00 FF 25 00 00 00',
    'C pc=FFF0 a=26 x=03 y=02 s=FB p=A1 F=2',
    'STK 80 90 00 00 00 00 00 00',
    'M 063A 00 00 00 FF 25 00 00 00',
    'C pc=FFF0 a=30 x=01 y=00 s=FB p=A1 F=3',
    'STK 10 80 00 00 00 00 00 00',
    'M 063A 00 00 00 FF 30 00 00 00',
    '',
  ].join('\n');
  const calls = parseCallLog(log);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].caller, 0xc076);
  assert.equal(calls[0].fn, 0x25);
  const groups = summarizeCalls(calls);
  assert.deepEqual(groups.map((g) => [g.fn, g.count]), [[0x25, 2], [0x30, 1]]);
  assert.deepEqual(groups[0].as, [0x25, 0x26]);
  assert.deepEqual(groups[0].callers, [0x9081, 0xc076].sort((p, q) => p - q));
  assert.match(renderMarkdown(groups, calls.length), /\| \$25 \| 2 \|/);
});

test('解析应答与字段', () => {
  const reply = parseReply('OK frames=3 stop=none pc=8000\nHEX 0102\nHEX 03\n');
  assert.equal(reply.ok, true);
  assert.deepEqual(parseFields(reply.head), { frames: '3', stop: 'none', pc: '8000' });
  assert.deepEqual([...hexLinesToBytes(reply.lines)], [1, 2, 3]);
  assert.equal(parseReply('ERR bad\n').ok, false);
});

test('静态扫描程序里的系统调用，识别子功能，没有紧跟 JSR 的赋值不统计', () => {
  const bytes = Uint8Array.from([
    0xa9, 0x25, 0x8d, 0x3e, 0x06, 0xa9, 0x00, 0x8d, 0x3f, 0x06, 0x20, 0xf0, 0xff, // 25/00
    0xa9, 0x25, 0x8d, 0x3e, 0x06, 0xa9, 0x00, 0x8d, 0x3f, 0x06, 0x20, 0xf0, 0xff, // 25/00 再一次
    0xa9, 0x45, 0x8d, 0x3e, 0x06, 0x20, 0xf0, 0xff, // 45/--
    0xa9, 0x50, 0x8d, 0x3e, 0x06, 0xa9, 0x10, 0x8d, 0x3e, 0x06, 0x20, 0xf0, 0xff, // 50 没有紧跟调用，只有 10/--
  ]);
  assert.deepEqual([...scanApiCalls(bytes)], [['25/00', 2], ['45/--', 1], ['10/--', 1]]);
});

test('软件使用的系统调用文档汇总各文件并给出名称', () => {
  const text = renderUsageDoc(
    [{ name: 'A.EXE', calls: new Map([['25/--', 2]]) }, { name: 'B.EXE', calls: new Map([['25/--', 1]]) }, { name: 'C.BIN', calls: new Map() }],
    (fn) => `功能 ${fn}`,
  );
  assert.match(text, /共扫描 3 个文件，其中 2 个含有系统调用/);
  assert.match(text, /\| \$25\/\$-- \| 功能 37 \| 3 \| A\.EXE、B\.EXE \|/);
});

test('客户端发送命令并收到以点号结尾的应答，ERR 应答会抛出异常', async () => {
  const server = net.createServer((socket) => {
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        socket.write(line === 'bad' ? 'ERR nope\n.\n' : `OK echo=${line}\n.\n`);
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const client = await Sb2kClient.connect(server.address().port);
  try {
    assert.equal((await client.send('ping')).head, 'OK echo=ping');
    await assert.rejects(() => client.send('bad'), /ERR nope/);
  } finally {
    client.close();
    server.close();
  }
});
