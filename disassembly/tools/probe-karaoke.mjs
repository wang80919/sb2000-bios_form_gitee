// ------------------------------------------------------------------------
// 名称：probe-karaoke.mjs
// 说明：在模拟器里运行官方软盘上的 KARAOK.EXE（卡拉 OK），核对功能 $66（歌词滚动）的行为：调用日志里有 $66，歌曲播放期间 NMI_FLAGS 位 7（条带动画）打开，两行歌词的显示地址相差 $38，歌曲结束后位 7 清除。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-10
// 备注：用法 node tools/probe-karaoke.mjs；需要先运行 node tools/sb2kdbg.mjs --launch。镜像里只有官方软盘 1 的 WIN98 目录里的 KARAOK.EXE；截图、调用日志与采样结果在 out/karaoke/。
// ------------------------------------------------------------------------
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { OUT_DIR, officialImage } from './config.mjs';
import { buildFat12Image } from './fat12-image.mjs';
import { KEY, typeText } from './keyboard.mjs';
import { DEFAULT_PORT, Sb2kClient } from './sb2k-client.mjs';
import { parseFat12 } from '../verify/lib/fat12.mjs';

const DIR = path.join(OUT_DIR, 'karaoke');
mkdirSync(DIR, { recursive: true });

/** 只含 KARAOK.EXE 的软盘镜像（取自官方软盘 1 的 WIN98 目录） */
function buildImage() {
  const official = parseFat12(readFileSync(officialImage(1).path ?? officialImage(1)));
  const win = official.listRoot().find((e) => e.name83.startsWith('WIN98'));
  const entry = official.listDir(win.cluster ?? win.startCluster ?? win.firstCluster).find((e) => e.name83.startsWith('KARAOK'));
  const image = path.join(DIR, 'floppy-karaoke.img');
  writeFileSync(image, buildFat12Image([{ name: 'KARAOK.EXE', data: Buffer.from(official.readFile(entry)), mtime: new Date() }], { label: 'SB2KDISK' }));
  return image;
}

const SAMPLES = 12;
const FRAMES_PER_SAMPLE = 600;
const client = await Sb2kClient.connect(DEFAULT_PORT);
const shot = (label) => client.send(`shot ${path.join(DIR, `${label}.png`)}`);
const problems = [];
try {
  const image = buildImage();
  const log = path.join(DIR, 'fff0.log');
  await client.send('reset');
  await client.send(`disk ${image}`);
  await client.send(`calllog ${log} fff0 063a:16 400000 skip=063e=6b`);
  await client.run(1100);
  await client.tapKey(KEY.ENTER, 8, 8);
  await client.tapKey(KEY.ENTER, 8, 40);
  await client.run(150);
  await typeText(client, 'karaok\n');
  const samples = [];
  for (let i = 1; i <= SAMPLES; i++) {
    await client.run(FRAMES_PER_SAMPLE);
    await shot(`karaok-${i}`);
    const [flags] = await client.read('cpu', 0x630, 1);
    const rows = await client.read('cpu', 0x5a4, 4);
    const queue = await client.read('cpu', 0x4a4, 24);
    samples.push({ i, flags, rows: [...rows], queue: [...queue] });
    await client.tapKey(KEY.ENTER, 8, 8);
  }
  await client.send('calllog off');
  writeFileSync(path.join(DIR, 'samples.json'), JSON.stringify(samples, null, 1));

  const calls = readFileSync(log, 'utf8').split(/\r?\n/).filter((line) => line.startsWith('M 063A')).map((line) => line.split(' '));
  const call66 = calls.filter((fields) => fields[6] === '66');
  if (call66.length === 0) problems.push('调用日志里没有功能 $66');
  const playing = samples.filter((s) => (s.flags & 0x80) !== 0);
  if (playing.length === 0) problems.push('所有采样里 NMI_FLAGS 位 7 都是 0，条带动画没有打开');
  for (const s of playing) {
    const row0 = s.rows[0] | (s.rows[1] << 8);
    const row1 = s.rows[2] | (s.rows[3] << 8);
    if (row1 - row0 !== 0x38) problems.push(`采样 ${s.i}：两行歌词的显示地址相差 ${(row1 - row0).toString(16)}，应为 $38`);
  }
  const last = samples[samples.length - 1];
  if ((last.flags & 0x80) !== 0) problems.push('最后一个采样里位 7 还没有清除（歌曲没有结束？）');
  console.log(`$66 调用 ${call66.length} 次；条带动画打开的采样 ${playing.length}/${SAMPLES}；最后 NMI_FLAGS=$${last.flags.toString(16)}`);
  console.log(problems.length ? `发现问题：\n${problems.join('\n')}` : '核对通过');
  if (problems.length) process.exitCode = 1;
} finally {
  client.close();
}
