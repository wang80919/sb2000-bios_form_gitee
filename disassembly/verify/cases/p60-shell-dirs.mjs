// ------------------------------------------------------------------------
// 名称：p60-shell-dirs.mjs
// 说明：DOS 命令外壳的子目录与 copy 变体验证用例：md、cd、dir 在子目录里的显示，copy 到目录、带路径、带盘符与 /a /v 开关，多文件复制、单参数复制、同名目录、删除非空目录等出错路径。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：每个用例在提示符下依次输入若干条命令（第一条用 shellText，其余用 moreText），最后保存磁盘镜像；
//       dir 的预期行由 fat12.mjs 从保存的镜像里解析出的目录项算出（子目录用 listDir），不取自 BIOS 的输出。
//       "." 与 ".." 的日期来自镜像里这两个目录项，BIOS 不显示零日期（实测）。目录行的“<DIR>”占大小的位置（右对齐 10 列）。
// ------------------------------------------------------------------------
import { before, byName, saveDisk, untouchedProblems } from '../lib/disk-check.mjs';
import { moreText, shellText } from '../lib/screen-text.mjs';

const hello = byName('HELLO   TXT');

const withCommas = (value) => value.toLocaleString('en-US');

const dateText = (word) => {
  if (word === 0) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad((word >> 5) & 15)}-${pad(word & 31)}-${pad(((word >> 9) + 1980) % 100)}`;
};

/** dir 里一个目录项的行：名称 8 列、空格、扩展名 3 列、大小或“<DIR>”右对齐 10 列、空格、日期 */
const listingLine = (entry) => {
  const isDir = (entry.attr & 0x10) !== 0;
  return `${entry.name83.slice(0, 8)} ${entry.name83.slice(8)}${(isDir ? '<DIR>' : withCommas(entry.size)).padStart(10)} ${dateText(entry.date)}`.trimEnd();
};

/** 文本行里有没有这一行（比较时去掉首尾空格） */
const hasLine = (lines, text) => lines.some((line) => line.trim() === text.trim());

/**
 * 检查一次 dir 的输出：条目行连续出现，随后的统计行与条目一致。
 * @param {string[]} lines 屏幕文字行
 * @param {object[]} entries 预期列出的目录项（按目录里的顺序）
 * @param {number} freeBytes 预期的可用字节数
 */
const listingProblems = (lines, entries, freeBytes) => {
  const expected = entries.map(listingLine);
  const trimmed = lines.map((line) => line.trimEnd());
  let at = -1;
  for (let i = 0; i + expected.length <= trimmed.length && at < 0; i++) if (expected.every((line, k) => trimmed[i + k] === line)) at = i;
  if (at < 0) return [`目录行与预期不一致；预期：${JSON.stringify(expected)}；实际：${JSON.stringify(lines)}`];
  return statsProblems(lines.slice(at + expected.length), entries, freeBytes);
};

/** 检查 dir 末尾的统计行：文件数、目录数、文件字节数、可用字节数 */
const statsProblems = (tail, entries, freeBytes) => {
  const files = entries.filter((e) => (e.attr & 0x10) === 0);
  const dirs = entries.length - files.length;
  const total = files.reduce((sum, e) => sum + e.size, 0);
  const problems = [];
  for (const item of [String(files.length).padStart(9), ' 个文件 ', String(dirs).padStart(9), ' 个目录 ', withCommas(total).padStart(9), withCommas(freeBytes).padStart(9)]) {
    if (!tail.includes(item)) problems.push(`统计部分缺少“${item}”；实际：${JSON.stringify(tail)}`);
  }
  return problems;
};

/**
 * 构造一个用例：依次输入 commands，每步检查 texts[i] 里的屏幕文字，最后保存磁盘，再用 verify(texts, after) 做总检查。
 * @param {string} id 用例编号
 * @param {string} title 说明
 * @param {string[]} commands 依次输入的命令
 * @param {(texts: string[][], after: object) => string[]} verify 对每步屏幕文字与保存后镜像的检查
 */
const session = (id, title, commands, verify) => ({
  id,
  title,
  fresh: true,
  freshAfter: true,
  steps: [
    shellText(commands[0]),
    ...commands.slice(1).map((command) => moreText(command.startsWith('~') ? command.slice(1) : `${command}\n`, 500)),
    saveDisk(() => []),
  ],
  finalCheck: (history) => {
    const texts = history.slice(0, -1).map((step) => step.data);
    return verify(texts, history.at(-1).data);
  },
});

const missing = (lines, wanted) => wanted.filter((text) => !hasLine(lines, text)).map((text) => `屏幕上没有“${text}”；实际：${JSON.stringify(lines)}`);

/** 根目录里按名称找目录项 */
const rootEntry = (after, name83) => after.listRoot().find((e) => e.name83 === name83);

const COPIED = ['A:\\HELLO.TXT', '1', '个文件被复制'];

const unchanged = (after) => {
  const problems = untouchedProblems(after);
  if (after.listRoot().length !== before.listRoot().length) problems.push(`目录项个数预期 ${before.listRoot().length}，实际 ${after.listRoot().length}`);
  if (after.freeClusters() !== before.freeClusters()) problems.push(`空闲簇预期 ${before.freeClusters()}，实际 ${after.freeClusters()}`);
  return problems;
};

/** 复制出 B.TXT 的用例共用的磁盘检查：B.TXT 内容同 HELLO.TXT，占 1 个簇 */
const copiedAsB = (after) => {
  const found = rootEntry(after, 'B       TXT');
  if (!found) return ['没有找到 B.TXT'];
  const problems = [];
  if (!after.readFile(found).equals(before.readFile(hello))) problems.push('B.TXT 的内容与 HELLO.TXT 不一致');
  if (after.freeClusters() !== before.freeClusters() - 1) problems.push(`空闲簇预期 ${before.freeClusters() - 1}，实际 ${after.freeClusters()}`);
  return [...problems, ...untouchedProblems(after)];
};

const cases = before
  ? [
      session('shell-dir.sub', 'md t、cd t、dir、cd ..、dir：提示符显示路径 \\T；T 里只有 "." 与 ".."；根目录列出 T（<DIR>、日期 01-01-98）', ['md t', 'cd t', 'dir', 'cd ..', 'dir'], (texts, after) => {
        const t = rootEntry(after, 'T          ');
        if (!t) return ['没有找到目录 T'];
        const problems = [];
        if (!texts[1].includes('\\T')) problems.push(`cd t 后提示符里没有路径 \\T；实际：${JSON.stringify(texts[1])}`);
        if (texts[3].includes('\\T')) problems.push('cd .. 后提示符里还有路径 \\T');
        const free = after.freeClusters() * after.clusterBytes;
        problems.push(...listingProblems(texts[2], after.listDir(t.cluster), free));
        problems.push(...listingProblems(texts[4], after.listRoot().filter((e) => (e.attr & 0x08) === 0), free));
        const dot = after.listDir(t.cluster);
        if (dot[0]?.cluster !== t.cluster || dot[1]?.name83 !== '..         ') problems.push('T 里的 "." 没有指向自己或缺少 ".."');
        if (t.date !== 0x2421) problems.push(`T 的日期预期 $2421（01-01-98），实际 $${t.date.toString(16)}`);
        return [...problems, ...untouchedProblems(after)];
      }),
      session('shell-dir.copy-into', 'md t、copy hello.txt t、dir t：文件复制进目录 T，名称不变，dir t 列出 ".""..""HELLO.TXT"', ['md t', 'copy hello.txt t', 'dir t'], (texts, after) => {
        const t = rootEntry(after, 'T          ');
        if (!t) return ['没有找到目录 T'];
        const problems = missing(texts[1], COPIED);
        const inside = after.listDir(t.cluster).find((e) => e.name83 === 'HELLO   TXT');
        if (!inside) problems.push('T 里没有 HELLO.TXT');
        else if (!after.readFile(inside).equals(before.readFile(hello))) problems.push('T 里 HELLO.TXT 的内容不一致');
        problems.push(...listingProblems(texts[2], after.listDir(t.cluster), after.freeClusters() * after.clusterBytes));
        if (after.freeClusters() !== before.freeClusters() - 2) problems.push(`空闲簇预期 ${before.freeClusters() - 2}，实际 ${after.freeClusters()}`);
        return [...problems, ...untouchedProblems(after)];
      }),
      session('shell-dir.copy-path', 'md t、copy hello.txt t\\x.txt、cd t、dir：带路径的目标，T 里出现 X.TXT', ['md t', 'copy hello.txt t\\x.txt', 'cd t', 'dir'], (texts, after) => {
        const t = rootEntry(after, 'T          ');
        if (!t) return ['没有找到目录 T'];
        const problems = missing(texts[1], COPIED);
        const inside = after.listDir(t.cluster).find((e) => e.name83 === 'X       TXT');
        if (!inside) problems.push('T 里没有 X.TXT');
        else if (!after.readFile(inside).equals(before.readFile(hello))) problems.push('X.TXT 的内容不一致');
        problems.push(...listingProblems(texts[3], after.listDir(t.cluster), after.freeClusters() * after.clusterBytes));
        return [...problems, ...untouchedProblems(after)];
      }),
      session('shell-dir.copy-drive', 'copy hello.txt a:b.txt：目标带盘符，根目录多出内容一致的 B.TXT', ['copy hello.txt a:b.txt'], (texts, after) => [...missing(texts[0], COPIED), ...copiedAsB(after)]),
      session('shell-dir.copy-a', 'copy /a hello.txt b.txt：文本方式复制，7 字节的文本内容一致', ['copy /a hello.txt b.txt'], (texts, after) => [...missing(texts[0], COPIED), ...copiedAsB(after)]),
      session('shell-dir.copy-v', 'copy /v hello.txt b.txt：复制后校验，结果与普通复制相同', ['copy /v hello.txt b.txt'], (texts, after) => [...missing(texts[0], COPIED), ...copiedAsB(after)]),
      session('shell-dir.copy-multi', 'copy *.txt b.txt：多文件复制到单文件，提示“多文件不能复制到单文件”，磁盘不变', ['copy *.txt b.txt'], (texts, after) => [...missing(texts[0], ['多文件不能复制到单文件']), ...unchanged(after)]),
      session('shell-dir.copy-one', 'copy hello.txt（只给源）：目标取当前目录同名文件，提示“文件不能复制到自身”，磁盘不变', ['copy hello.txt'], (texts, after) => [...missing(texts[0], ['文件不能复制到自身']), ...unchanged(after)]),
      session('shell-dir.md-twice', 'md t 两次：第二次提示“目录名已存在”，磁盘上只有一个 T', ['md t', 'md t'], (texts, after) => {
        const problems = missing(texts[1], ['目录名已存在']);
        if (after.listRoot().filter((e) => e.name83 === 'T          ').length !== 1) problems.push('T 的个数不是 1');
        if (after.freeClusters() !== before.freeClusters() - 1) problems.push(`空闲簇预期 ${before.freeClusters() - 1}，实际 ${after.freeClusters()}`);
        return [...problems, ...untouchedProblems(after)];
      }),
      session('shell-dir.rd-file', 'rd hello.txt：对文件用 rd，提示“非法路径，目录或目录不空”，磁盘不变', ['rd hello.txt'], (texts, after) => [...missing(texts[0], ['非法路径，目录或目录不空']), ...unchanged(after)]),
      session('shell-dir.rd-nonempty', 'md t、copy hello.txt t、rd t：目录不空，提示“企图删去非空目录”，T 与里面的文件都还在', ['md t', 'copy hello.txt t', 'rd t'], (texts, after) => {
        const problems = missing(texts[2], ['企图删去非空目录']);
        const t = rootEntry(after, 'T          ');
        if (!t) return [...problems, 'T 不见了'];
        if (!after.listDir(t.cluster).some((e) => e.name83 === 'HELLO   TXT')) problems.push('T 里的 HELLO.TXT 不见了');
        return [...problems, ...untouchedProblems(after)];
      }),
      session('shell-dir.type-missing', 'type nofile：提示“文件未找到”，磁盘不变', ['type nofile'], (texts, after) => [...missing(texts[0], ['文件未找到']), ...unchanged(after)]),
      session('shell-dir.page', 'dir /p：列出 8 个文件后显示“按任意键继续...”，按键后列出其余文件与统计', ['dir /p', '~x'], (texts, after) => {
        const files = after.listRoot().filter((e) => (e.attr & 0x08) === 0);
        const problems = [];
        const first = files.slice(0, 8).map(listingLine);
        const rest = files.slice(8).map(listingLine);
        for (const line of first) if (!texts[0].map((t) => t.trimEnd()).includes(line)) problems.push(`第一页缺少“${line}”`);
        if (!hasLine(texts[0], '按任意键继续...')) problems.push('第一页末尾没有“按任意键继续...”');
        if (texts[0].map((t) => t.trimEnd()).includes(rest[0])) problems.push('第一页不该已经出现第 9 个文件');
        problems.push(...statsProblems(texts[1], files, after.freeClusters() * after.clusterBytes));
        for (const line of rest) if (!texts[1].map((t) => t.trimEnd()).includes(line)) problems.push(`第二页缺少“${line}”`);
        return [...problems, ...unchanged(after)];
      }),
      session('shell-dir.dir-b-drive', 'dir b:：B: 盘符指向同一张软盘，列出同样的文件，标题行显示“B:”', ['dir b:'], (texts, after) => {
        const files = after.listRoot().filter((e) => (e.attr & 0x08) === 0);
        const problems = listingProblems(texts[0], files, after.freeClusters() * after.clusterBytes);
        if (!hasLine(texts[0], 'B:')) problems.push('标题行里没有“B:”');
        return [...problems, ...unchanged(after)];
      }),
      session('shell-dir.dir-bad-drive', 'dir x:：不存在的盘符，提示“参数无效”，磁盘不变', ['dir x:'], (texts, after) => [...missing(texts[0], ['参数无效']), ...unchanged(after)]),
      session('shell-dir.cljs', 'cljs：软盘上没有 MENU.BIN，提示“文件未找到”，磁盘不变', ['cljs'], (texts, after) => [...missing(texts[0], ['文件未找到']), ...unchanged(after)]),
      session('shell-dir.cd-root-up', 'cd ..：已在根目录，提示“非法目录”', ['cd ..'], (texts, after) => [...missing(texts[0], ['非法目录']), ...unchanged(after)]),
      session('shell-dir.args-missing', 'del、ren、copy 缺参数：提示“参数无效”，磁盘不变', ['del', 'ren', 'ren hello.txt', 'copy'], (texts, after) => [...texts.flatMap((text) => missing(text, ['参数无效'])), ...unchanged(after)]),
      session('shell-dir.md-noarg', 'md 缺参数：提示“参数错”，磁盘不变', ['md'], (texts, after) => [...missing(texts[0], ['参数错']), ...unchanged(after)]),
      session('shell-dir.ren-dir', 'md t、ren t dd：不能改目录名，提示“不可改变目录名”，T 还在', ['md t', 'ren t dd'], (texts, after) => {
        const problems = missing(texts[1], ['不可改变目录名']);
        if (!rootEntry(after, 'T          ')) problems.push('T 不见了');
        if (rootEntry(after, 'DD         ')) problems.push('不该出现 DD');
        return [...problems, ...untouchedProblems(after)];
      }),
      session('shell-dir.md-nested', 'md t、cd t、md u：子目录里不能再建目录，提示“不能创建目录”，磁盘只多 T（实测行为）', ['md t', 'cd t', 'md u'], (texts, after) => {
        const problems = missing(texts[2], ['不能创建目录']);
        const t = rootEntry(after, 'T          ');
        if (!t) return [...problems, '没有找到目录 T'];
        if (after.listDir(t.cluster).some((e) => e.name83 === 'U          ')) problems.push('T 里不该有 U');
        if (after.freeClusters() !== before.freeClusters() - 1) problems.push(`空闲簇预期 ${before.freeClusters() - 1}，实际 ${after.freeClusters()}`);
        return [...problems, ...untouchedProblems(after)];
      }),
      session('shell-dir.copy-to-file', 'copy edit.exe t（T 不是目录）：新建名为 T 的文件，内容同 EDIT.EXE，占 64 个簇', ['copy edit.exe t'], (texts, after) => {
        const found = rootEntry(after, 'T          ');
        if (!found) return ['没有找到文件 T'];
        const problems = missing(texts[0], ['A:\\EDIT.EXE', '1', '个文件被复制']);
        if ((found.attr & 0x10) !== 0) problems.push('T 不该是目录');
        if (found.size !== byName('EDIT    EXE').size || !after.readFile(found).equals(before.readFile(byName('EDIT    EXE')))) problems.push('T 的大小或内容与 EDIT.EXE 不一致');
        if (after.chain(found.cluster).length !== 64) problems.push(`T 的簇链长度预期 64，实际 ${after.chain(found.cluster).length}`);
        return [...problems, ...untouchedProblems(after)];
      }),
      session('shell-dir.copy-three', '连续 copy edit.exe 三次成 E1、E2、E3：三个 64 簇的文件内容都一致、簇互不重叠，dir 的文件数、字节数、可用字节数正确', ['copy edit.exe e1.exe', 'copy edit.exe e2.exe', 'copy edit.exe e3.exe', 'dir'], (texts, after) => {
        const problems = [];
        const edit = byName('EDIT    EXE');
        for (const name of ['E1      EXE', 'E2      EXE', 'E3      EXE']) {
          const found = rootEntry(after, name);
          if (!found || !after.readFile(found).equals(before.readFile(edit))) problems.push(`${name.trim()} 缺失或内容不一致`);
        }
        if (after.freeClusters() !== before.freeClusters() - 192) problems.push(`空闲簇预期 ${before.freeClusters() - 192}，实际 ${after.freeClusters()}`);
        problems.push(...listingProblems(texts[3], after.listRoot().filter((e) => (e.attr & 0x08) === 0), after.freeClusters() * after.clusterBytes));
        return [...problems, ...untouchedProblems(after)];
      }),
      session('shell-dir.del-wild-exe', 'del *.exe：不询问，直接提示“9 个文件被删除”，9 个 EXE 的簇全部释放，BIN、XBW、TXT 文件不变', ['del *.exe'], (texts, after) => {
        const gone = before.listRoot().filter((e) => e.name83.endsWith('EXE') && (e.attr & 0x18) === 0);
        const problems = missing(texts[0], [String(gone.length), '个文件被删除']);
        let freed = 0;
        for (const entry of gone) {
          if (after.listRoot().some((e) => e.name83 === entry.name83)) problems.push(`${entry.name83.trim()} 的目录项还在`);
          freed += before.chain(entry.cluster).length;
        }
        if (after.freeClusters() !== before.freeClusters() + freed) problems.push(`空闲簇预期 ${before.freeClusters() + freed}，实际 ${after.freeClusters()}`);
        return [...problems, ...untouchedProblems(after, gone.map((e) => e.name83))];
      }),
      session('shell-dir.del-all-n', 'del *.* 再答 n：先提示“删除目录中所有文件,确认(Y/N)?”，答 n 后什么都不删，磁盘不变', ['del *.*', 'n'], (texts, after) => [...missing(texts[0], ['删除目录中所有文件,确认(Y/N)?']), ...unchanged(after)]),
      session('shell-dir.del-all-y', 'del *.* 再答 y：提示“14 个文件被删除”，所有文件的簇全部释放（空闲簇回到 2847），卷标保留', ['del *.*', 'y'], (texts, after) => {
        const problems = missing(texts[0], ['删除目录中所有文件,确认(Y/N)?']);
        problems.push(...missing(texts[1], ['14', '个文件被删除']));
        const rest = after.listRoot().filter((e) => (e.attr & 0x08) === 0);
        if (rest.length !== 0) problems.push(`根目录里还有 ${rest.map((e) => e.name83.trim()).join('、')}`);
        if (after.freeClusters() !== after.clusterCount) problems.push(`空闲簇预期 ${after.clusterCount}，实际 ${after.freeClusters()}`);
        if (!after.fatCopiesMatch()) problems.push('两份 FAT 不一致');
        return problems;
      }),
    ]
  : [];

export { cases };
