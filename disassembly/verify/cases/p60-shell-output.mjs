// ------------------------------------------------------------------------
// 名称：p60-shell-output.mjs
// 说明：DOS 命令外壳屏幕文字输出的验证用例：输入 ver、dir（含通配符、不存在的文件）、help，用运行库显示例程的调用记录还原屏幕文字，与独立 FAT12 读取器解析出的目录信息逐行比对。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期文字的来源——文件名、大小、日期、文件数、字节数、空闲字节数、卷序列号都由 fat12.mjs 从镜像里算出，不取自 BIOS 的输出；
//       版本文字取自实机屏幕截图。文字抓取方式见 verify/lib/screen-text.mjs。
// ------------------------------------------------------------------------
import { before, byName, originals } from '../lib/disk-check.mjs';
import { shellText } from '../lib/screen-text.mjs';

/** 数字加千分位逗号 */
const withCommas = (value) => value.toLocaleString('en-US');

/** FAT 目录项的日期字：月-日-年（年取后两位） */
const dateText = (word) => {
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad((word >> 5) & 15)}-${pad(word & 31)}-${pad(((word >> 9) + 1980) % 100)}`;
};

/** dir 列出一个文件的那一行：名称 8 位、空格、扩展名 3 位、大小右对齐 10 位、空格、日期 */
const dirLine = (entry) => `${entry.name83.slice(0, 8)} ${entry.name83.slice(8)}${withCommas(entry.size).padStart(10)} ${dateText(entry.date)}`;

/** 卷序列号：引导扇区偏移 39 起的 4 字节小端值，高 16 位与低 16 位用连字符隔开 */
const serialText = (image) => {
  const id = Buffer.from(image).readUInt32LE(39);
  const hex = (value) => value.toString(16).toUpperCase().padStart(4, '0');
  return `${hex(id >>> 16)}-${hex(id & 0xffff)}`;
};

/** 在 lines 里找 expected 作为连续片段的起点，找不到返回 -1 */
const findRun = (lines, expected) => {
  for (let i = 0; i + expected.length <= lines.length; i++) if (expected.every((line, k) => lines[i + k] === line)) return i;
  return -1;
};

/** 检查 dir 输出里的文件行、统计行 */
const dirProblems = (lines, files, withTotals = true) => {
  const problems = [];
  const expected = files.map(dirLine);
  const at = findRun(lines, expected);
  if (at < 0) {
    problems.push(`文件行与预期不一致；预期：\n        ${expected.join('\n        ')}\n      实际：\n        ${lines.join('\n        ')}`);
    return problems;
  }
  if (!withTotals) return problems;
  const rest = lines.slice(at + expected.length);
  const total = files.reduce((sum, entry) => sum + entry.size, 0);
  const wanted = [`${String(files.length).padStart(9)}`, ' 个文件 ', `${withCommas(total).padStart(9)}`, ' 字节'];
  const text = rest.join('|');
  for (const item of wanted) if (!text.includes(item)) problems.push(`统计部分缺少“${item}”；实际：${JSON.stringify(rest)}`);
  return problems;
};

/** 读取在 before 里的根目录文件（不含卷标与目录）的原样列表 */
const rootFiles = () => originals.filter((entry) => (entry.attr & 0x18) === 0);

/** “名称.扩展名”，去掉填充的空格 */
const dotName = (entry) => `${entry.name83.slice(0, 8).trim()}.${entry.name83.slice(8).trim()}`;

const make = (id, title, steps) => ({ id, title, fresh: true, freshAfter: true, steps });

const cases = before
  ? [
      make('shell-out.ver', 'ver：显示“小霸王中文DOS操作系统 版本2.00”（预期文字取自屏幕截图）', [
        {
          ...shellText('ver'),
          check: ({ data }) => (data.includes('小霸王中文DOS操作系统 版本2.00') ? [] : [`没有版本文字；实际：${JSON.stringify(data)}`]),
        },
      ]),
      make('shell-out.dir', 'dir：每个文件一行（名称、大小、日期），文件数与字节数、空闲字节数、卷序列号与镜像里解析的一致', [
        {
          ...shellText('dir'),
          check: ({ data }) => {
            const problems = dirProblems(data, rootFiles());
            const free = before.freeClusters() * before.clusterBytes;
            if (!data.includes(withCommas(free).padStart(9))) problems.push(`没有空闲字节数 ${withCommas(free)}`);
            if (!data.includes(serialText(before.bootSector))) problems.push(`没有卷序列号 ${serialText(before.bootSector)}`);
            return problems;
          },
        },
      ]),
      make('shell-out.dir-wild', 'dir *.exe：只列出扩展名为 EXE 的文件，文件数与字节数合计只算这些文件', [
        {
          ...shellText('dir *.exe'),
          check: ({ data }) => dirProblems(data, rootFiles().filter((entry) => entry.name83.endsWith('EXE'))),
        },
      ]),
      make('shell-out.dir-one', 'dir hello.txt：只列出 HELLO.TXT 一行', [
        {
          ...shellText('dir hello.txt'),
          check: ({ data }) => dirProblems(data, rootFiles().filter((entry) => entry.name83 === 'HELLO   TXT')),
        },
      ]),
      make('shell-out.dir-a', 'dir /a：没有隐藏文件时与 dir 的文件行一致', [
        {
          ...shellText('dir /a'),
          check: ({ data }) => dirProblems(data, rootFiles()),
        },
      ]),
      make('shell-out.dir-b', 'dir /b：只列出“名称.扩展名”，每个文件一行，仍显示统计行', [
        {
          ...shellText('dir /b'),
          check: ({ data }) => {
            const expected = rootFiles().map(dotName);
            const at = findRun(data, expected);
            if (at < 0) return [`文件名行与预期不一致；预期：${JSON.stringify(expected)}；实际：${JSON.stringify(data)}`];
            return data.some((line) => line === String(expected.length).padStart(9)) ? [] : ['没有文件个数行'];
          },
        },
      ]),
      make('shell-out.dir-w', 'dir /w：每行两个“名称.扩展名”，名称各占 18 列', [
        {
          ...shellText('dir /w'),
          check: ({ data }) => {
            const names = rootFiles().map(dotName);
            const rows = [];
            for (let i = 0; i < names.length; i += 2) rows.push(names[i + 1] === undefined ? names[i] : names[i].padEnd(18) + names[i + 1]);
            const at = findRun(data, rows);
            return at < 0 ? [`宽行与预期不一致；预期：${JSON.stringify(rows)}；实际：${JSON.stringify(data)}`] : [];
          },
        },
      ]),
      make('shell-out.type', 'type hello.txt：显示文件内容（HELLO.TXT 的文字，不含行尾换行字节）', [
        {
          ...shellText('type hello.txt'),
          check: ({ data }) => {
            const text = before.readFile(byName('HELLO   TXT')).toString('latin1').replace(/[\r\n]+$/, '');
            return data.includes(text) ? [] : [`没有文件内容 ${JSON.stringify(text)}；实际：${JSON.stringify(data)}`];
          },
        },
      ]),
      make('shell-out.dir-missing', 'dir nofile.txt：不存在的文件，提示“没有找到文件”，不列出任何文件行，仍显示空闲字节数', [
        {
          ...shellText('dir nofile.txt'),
          check: ({ data }) => {
            const problems = [];
            if (!data.includes('没有找到文件')) problems.push(`没有“没有找到文件”提示；实际：${JSON.stringify(data)}`);
            if (data.some((line) => /\d\d-\d\d-\d\d$/.test(line))) problems.push('不该列出文件行');
            if (!data.includes(withCommas(before.freeClusters() * before.clusterBytes).padStart(9))) problems.push('没有显示空闲字节数');
            return problems;
          },
        },
      ]),
      make('shell-out.unknown', 'foo（不存在的命令）：提示“命令输入错”', [
        {
          ...shellText('foo'),
          check: ({ data }) => (data.includes('命令输入错') ? [] : [`没有“命令输入错”提示；实际：${JSON.stringify(data)}`]),
        },
      ]),
      make('shell-out.help', 'help：列出 DIR 的用法与开关说明', [
        {
          ...shellText('help'),
          check: ({ data }) => {
            const problems = [];
            for (const item of ['DIR [Drive:][Path][Filename]', '/P    每显示一屏信息后暂停']) if (!data.includes(item)) problems.push(`缺少“${item}”`);
            return problems;
          },
        },
      ]),
    ]
  : [];

export { cases };
