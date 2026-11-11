// ------------------------------------------------------------------------
// 名称：p60-shell-messages.mjs
// 说明：DOS 命令外壳内部命令的提示文字与磁盘结果一起验证的用例：copy（含同名确认、/y、复制到自身）、del（含通配符、/p）、ren、md、rd、cd、date、time 的正常与出错路径，
//       每个用例既比对屏幕上显示的提示文字，也保存磁盘镜像用独立的 FAT12 读取器检查目录项、簇链与内容，出错路径还要检查磁盘没有任何改动。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：提示文字的预期值取自实机运行的屏幕观察（屏幕文字抓取方式见 verify/lib/screen-text.mjs），磁盘结果的预期值由 fat12.mjs 从原样镜像算出。
//       需要在“是否覆盖”“删除(Y/N)”处回答的用例，用 moreText 继续按键，只按 y、n，不按回车。
// ------------------------------------------------------------------------
import { before, byName, saveDisk, untouchedProblems } from '../lib/disk-check.mjs';
import { moreText, shellText } from '../lib/screen-text.mjs';

const hello = byName('HELLO   TXT');
const edit = byName('EDIT    EXE');

/** 屏幕文字里有没有这一行（整行相等，去掉首尾空格后比较） */
const hasLine = (lines, text) => lines.some((line) => line.trim() === text.trim());

/** 缺哪些行 */
const missingLines = (lines, wanted) => wanted.filter((text) => !hasLine(lines, text)).map((text) => `屏幕上没有“${text}”；实际：${JSON.stringify(lines)}`);

/** 磁盘完全没有改动：原有文件不变、目录项个数与空闲簇数不变 */
const unchanged = (after) => {
  const problems = untouchedProblems(after);
  if (after.listRoot().length !== before.listRoot().length) problems.push(`目录项个数预期 ${before.listRoot().length}，实际 ${after.listRoot().length}`);
  if (after.freeClusters() !== before.freeClusters()) problems.push(`空闲簇预期 ${before.freeClusters()}，实际 ${after.freeClusters()}`);
  return problems;
};

/** 构造一个用例：先输入命令（command）并检查提示文字，answers 里的按键依次回答后续提示，最后保存磁盘检查 */
const make = (id, title, command, { text = [], answers = [], disk }) => ({
  id,
  title,
  fresh: true,
  freshAfter: true,
  steps: [
    { ...shellText(command), check: ({ data }) => missingLines(data, text[0] ?? []) },
    ...answers.map((keys, index) => ({ ...moreText(keys), check: ({ data }) => missingLines(data, text[index + 1] ?? []) })),
    saveDisk(disk),
  ],
});

const cases = before
  ? [
      make('shell-msg.copy', 'copy hello.txt a2.txt：提示源文件路径与“1 个文件被复制”，磁盘上多出内容一致的 A2.TXT', 'copy hello.txt a2.txt', {
        text: [['A:\\HELLO.TXT', '1', '个文件被复制']],
        disk: (after) => {
          const found = after.listRoot().find((e) => e.name83 === 'A2      TXT');
          if (!found) return ['没有找到 A2.TXT'];
          const problems = after.readFile(found).equals(before.readFile(hello)) ? [] : ['内容与 HELLO.TXT 不一致'];
          return [...problems, ...untouchedProblems(after)];
        },
      }),
      make('shell-msg.copy-self', 'copy hello.txt hello.txt：提示“文件不能复制到自身”，磁盘不变', 'copy hello.txt hello.txt', {
        text: [['文件不能复制到自身']],
        disk: unchanged,
      }),
      make('shell-msg.copy-missing', 'copy nofile.txt x.txt：提示“没有复制文件或文件不存在”，磁盘不变', 'copy nofile.txt x.txt', {
        text: [['没有复制文件或文件不存在']],
        disk: unchanged,
      }),
      make('shell-msg.copy-over-n', 'copy hello.txt edit.exe 再答 n：先提示“文件存在，是否覆盖(Y/N)?”，答 n 后提示没有复制，磁盘不变', 'copy hello.txt edit.exe', {
        text: [['A:\\HELLO.TXT', '文件存在，是否覆盖(Y/N)?'], ['没有复制文件或文件不存在']],
        answers: ['n'],
        disk: unchanged,
      }),
      make('shell-msg.copy-over-y', 'copy hello.txt edit.exe 再答 y：EDIT.EXE 变成 7 字节、内容同 HELLO.TXT，原 64 个簇释放 63 个', 'copy hello.txt edit.exe', {
        text: [['A:\\HELLO.TXT', '文件存在，是否覆盖(Y/N)?'], ['1', '个文件被复制']],
        answers: ['y'],
        disk: (after) => {
          const found = after.listRoot().find((e) => e.name83 === 'EDIT    EXE');
          if (!found) return ['EDIT.EXE 不见了'];
          const problems = [];
          if (found.size !== hello.size) problems.push(`EDIT.EXE 大小预期 ${hello.size}，实际 ${found.size}`);
          if (!after.readFile(found).equals(before.readFile(hello))) problems.push('EDIT.EXE 的内容与 HELLO.TXT 不一致');
          if (after.chain(found.cluster).length !== 1) problems.push(`EDIT.EXE 簇链长度预期 1，实际 ${after.chain(found.cluster).length}`);
          const expectedFree = before.freeClusters() + before.chain(edit.cluster).length - 1;
          if (after.freeClusters() !== expectedFree) problems.push(`空闲簇预期 ${expectedFree}，实际 ${after.freeClusters()}`);
          return [...problems, ...untouchedProblems(after, ['EDIT    EXE'])];
        },
      }),
      make('shell-msg.copy-y-switch', 'copy /y hello.txt edit.exe：不再询问，直接覆盖并提示“1 个文件被复制”', 'copy /y hello.txt edit.exe', {
        text: [['A:\\HELLO.TXT', '1', '个文件被复制']],
        disk: (after) => {
          const found = after.listRoot().find((e) => e.name83 === 'EDIT    EXE');
          if (!found || found.size !== hello.size || !after.readFile(found).equals(before.readFile(hello))) return ['EDIT.EXE 没有被 HELLO.TXT 的内容覆盖'];
          return untouchedProblems(after, ['EDIT    EXE']);
        },
      }),
      make('shell-msg.del-missing', 'del nofile.txt：提示“没有找到文件”，磁盘不变', 'del nofile.txt', {
        text: [['没有找到文件']],
        disk: unchanged,
      }),
      make('shell-msg.del-wild', 'del *.bin：提示“3 个文件被删除”，BXM.BIN、RZM.BIN、WBX.BIN 的目录项消失、簇全部释放，其余文件不变', 'del *.bin', {
        text: [['3', '个文件被删除']],
        disk: (after) => {
          const gone = ['BXM     BIN', 'RZM     BIN', 'WBX     BIN'];
          const problems = [];
          let freed = 0;
          for (const name of gone) {
            const old = byName(name);
            if (after.listRoot().some((e) => e.name83 === name)) problems.push(`${name} 的目录项还在`);
            for (const cluster of before.chain(old.cluster)) {
              freed++;
              if (after.fatEntry(cluster) !== 0) problems.push(`${name} 的簇 ${cluster} 没有释放`);
            }
          }
          if (after.freeClusters() !== before.freeClusters() + freed) problems.push(`空闲簇预期 ${before.freeClusters() + freed}，实际 ${after.freeClusters()}`);
          return [...problems, ...untouchedProblems(after, gone)];
        },
      }),
      make('shell-msg.del-p-y', 'del hello.txt /p 再答 y：先询问“删除(Y/N)?”，答 y 后提示“1 个文件被删除”，HELLO.TXT 被删', 'del hello.txt /p', {
        text: [['删除(Y/N)?'], ['1', '个文件被删除']],
        answers: ['y'],
        disk: (after) => {
          const problems = [];
          if (after.listRoot().some((e) => e.name83 === 'HELLO   TXT')) problems.push('HELLO.TXT 还在');
          if (after.freeClusters() !== before.freeClusters() + 1) problems.push(`空闲簇预期 ${before.freeClusters() + 1}，实际 ${after.freeClusters()}`);
          return [...problems, ...untouchedProblems(after, ['HELLO   TXT'])];
        },
      }),
      make('shell-msg.del-p-n', 'del hello.txt /p 再答 n：提示“没有删除任何文件”，磁盘不变', 'del hello.txt /p', {
        text: [['删除(Y/N)?'], ['没有删除任何文件']],
        answers: ['n'],
        disk: unchanged,
      }),
      make('shell-msg.ren-missing', 'ren nofile.txt x.txt：提示“文件未找到”，磁盘不变', 'ren nofile.txt x.txt', {
        text: [['文件未找到']],
        disk: unchanged,
      }),
      make('shell-msg.ren-exist', 'ren hello.txt edit.exe：提示“文件已经存在”，磁盘不变', 'ren hello.txt edit.exe', {
        text: [['文件已经存在']],
        disk: unchanged,
      }),
      make('shell-msg.md-exist', 'md hello.txt：与现有文件同名，提示“目录名已存在”，磁盘不变', 'md hello.txt', {
        text: [['目录名已存在']],
        disk: unchanged,
      }),
      make('shell-msg.rd-missing', 'rd nofile：提示“路径未找到”，磁盘不变', 'rd nofile', {
        text: [['路径未找到']],
        disk: unchanged,
      }),
      make('shell-msg.cd-missing', 'cd nofile：提示“路径未找到”，磁盘不变', 'cd nofile', {
        text: [['路径未找到']],
        disk: unchanged,
      }),
      make('shell-msg.date', 'date：显示“当前日期：”“01-01-1998”（开机日期提示按回车保留的默认值）与输入新日期的提示，磁盘不变', 'date', {
        text: [['当前日期：', '01-01-1998', '请输入新日期(mm-dd-yy)：']],
        disk: unchanged,
      }),
      make('shell-msg.time', 'time：显示“当前时间：”与输入新时间的提示，磁盘不变', 'time', {
        text: [['当前时间：', '请输入新时间(hh:mm:ss)：']],
        disk: unchanged,
      }),
    ]
  : [];

export { cases };
