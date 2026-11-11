// ------------------------------------------------------------------------
// 名称：p60-shell.mjs
// 说明：DOS 命令外壳内部命令的验证用例：在提示符下用键盘输入 copy、ren、del、md、rd，保存磁盘镜像后用独立的 FAT12 读取器检查目录项、簇链与内容。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：每个用例前后都重新开机（fresh、freshAfter）；用例第一步就在提示符下输入命令，不能先用桩代码调用（桩会让外壳主循环停下）。
//       输入方式同 tools/collect-cdl.mjs：先等待、按几下空回车吃掉开头会丢的按键，再输入命令。
// ------------------------------------------------------------------------
import { KEY, typeText } from '../../tools/rom-driver.mjs';
import { before, byName, saveDisk, untouchedProblems } from '../lib/disk-check.mjs';

/** 在提示符下输入一条命令并等待执行完成 */
const shell = (text, frames = 300) => ({
  host: async (client) => {
    await client.run(150);
    for (let i = 0; i < 3; i++) await client.tapKey(KEY.ENTER, 8, 20);
    await typeText(client, `${text}\n`);
    await client.run(frames);
  },
});

const hello = byName('HELLO   TXT');
const edit = byName('EDIT    EXE');

const make = (id, title, steps) => ({ id, title, fresh: true, freshAfter: true, steps });

const cases = before
  ? [
      make('shell.copy', 'copy hello.txt a2.txt：新文件 A2.TXT 与 HELLO.TXT 内容一致，占 1 个簇，其余文件不变', [
        shell('copy hello.txt a2.txt'),
        saveDisk((after) => {
          const found = after.listRoot().find((e) => e.name83 === 'A2      TXT');
          if (!found) return ['没有找到 A2.TXT'];
          const problems = [];
          if (found.size !== hello.size) problems.push(`大小预期 ${hello.size}，实际 ${found.size}`);
          if (!after.readFile(found).equals(before.readFile(hello))) problems.push('内容与 HELLO.TXT 不一致');
          if (after.freeClusters() !== before.freeClusters() - 1) problems.push(`空闲簇预期 ${before.freeClusters() - 1}，实际 ${after.freeClusters()}`);
          return [...problems, ...untouchedProblems(after)];
        }),
      ]),
      make('shell.copy-big', 'copy edit.exe e2.exe：32768 字节、64 个簇的链，内容一致', [
        shell('copy edit.exe e2.exe', 900),
        saveDisk((after) => {
          const found = after.listRoot().find((e) => e.name83 === 'E2      EXE');
          if (!found) return ['没有找到 E2.EXE'];
          const problems = [];
          if (found.size !== edit.size) problems.push(`大小预期 ${edit.size}，实际 ${found.size}`);
          if (!after.readFile(found).equals(before.readFile(edit))) problems.push('内容与 EDIT.EXE 不一致');
          if (after.chain(found.cluster).length !== 64) problems.push(`簇链长度预期 64，实际 ${after.chain(found.cluster).length}`);
          return [...problems, ...untouchedProblems(after)];
        }),
      ]),
      make('shell.ren', 'ren hello.txt h2.txt：旧名消失、新名保留起始簇、大小与内容', [
        shell('ren hello.txt h2.txt'),
        saveDisk((after) => {
          const entries = after.listRoot();
          const found = entries.find((e) => e.name83 === 'H2      TXT');
          if (!found) return ['没有找到 H2.TXT'];
          const problems = [];
          if (entries.some((e) => e.name83 === 'HELLO   TXT')) problems.push('旧名 HELLO.TXT 还在');
          if (found.cluster !== hello.cluster || found.size !== hello.size) problems.push('起始簇或大小变了');
          return [...problems, ...untouchedProblems(after, ['HELLO   TXT'])];
        }),
      ]),
      make('shell.del', 'del hello.txt：目录项消失、簇 727 释放、空闲簇加 1', [
        shell('del hello.txt'),
        saveDisk((after) => {
          const problems = [];
          if (after.listRoot().some((e) => e.name83 === 'HELLO   TXT')) problems.push('HELLO.TXT 的目录项还在');
          if (after.fatEntry(hello.cluster) !== 0) problems.push(`簇 ${hello.cluster} 的 FAT 项预期 0，实际 ${after.fatEntry(hello.cluster)}`);
          if (after.freeClusters() !== before.freeClusters() + 1) problems.push(`空闲簇预期 ${before.freeClusters() + 1}，实际 ${after.freeClusters()}`);
          return [...problems, ...untouchedProblems(after, ['HELLO   TXT'])];
        }),
      ]),
      make('shell.md', 'md t：创建目录 T（属性 $10、1 个簇、含 "." 与 ".."）', [
        shell('md t'),
        saveDisk((after) => {
          const found = after.listRoot().find((e) => e.name83 === 'T          ');
          if (!found) return ['没有找到目录 T'];
          const problems = [];
          if (found.attr !== 0x10) problems.push(`属性预期 $10，实际 $${found.attr.toString(16)}`);
          if (after.chain(found.cluster).length !== 1) problems.push('目录应占 1 个簇');
          const data = Buffer.from(after.readCluster(found.cluster));
          if (data.toString('latin1', 0, 11) !== '.          ' || data.toString('latin1', 32, 43) !== '..         ') problems.push('目录里缺少 "." 或 ".."');
          return [...problems, ...untouchedProblems(after)];
        }),
      ]),
      make('shell.md-rd', 'md t 再 rd t：目录项消失，空闲簇数回到原来的值', [
        shell('md t'),
        shell('rd t'),
        saveDisk((after) => {
          const problems = [];
          if (after.listRoot().some((e) => e.name83 === 'T          ')) problems.push('目录 T 还在');
          if (after.freeClusters() !== before.freeClusters()) problems.push(`空闲簇预期 ${before.freeClusters()}，实际 ${after.freeClusters()}`);
          return [...problems, ...untouchedProblems(after)];
        }),
      ]),
    ]
  : [];

export { cases };
