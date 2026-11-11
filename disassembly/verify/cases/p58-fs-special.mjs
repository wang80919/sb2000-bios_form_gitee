// ------------------------------------------------------------------------
// 名称：p58-fs-special.mjs
// 说明：用特制软盘镜像验证文件系统的特殊路径：碎片化的簇链（删除中间文件后写入更大的文件，再复制该文件）、磁盘空间不足时复制失败。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：镜像由 tools/fat12-image.mjs 现场生成并写进测试镜像（用例的 prepareImage），用完由 verify-run.mjs 还原；预期值由 fat12.mjs 从生成时的数据算出。
//       文件内容按“簇序号”填充不同的字节，簇链顺序错了内容就对不上。
// ------------------------------------------------------------------------
import { leakProblems, saveDisk } from '../lib/disk-check.mjs';
import { file, pattern, withImage } from '../lib/images.mjs';
import { moreText, shellText } from '../lib/screen-text.mjs';

const findFile = (after, name83) => after.listRoot().find((e) => e.name83 === name83);

const a = pattern(1, 64);
const b = pattern(2, 64);
const c = pattern(3, 64);
const big = pattern(4, 100);
/** 磁盘只剩 10 个空闲簇的镜像：HELLO.TXT 占 1 簇，BIG.BIN 30 簇，FILL.BIN 2806 簇，共 2847 簇 */
const fullBig = pattern(5, 30);
const fullFill = pattern(6, 2806);

const rootFiles = Array.from({ length: 223 }, (_, i) => file(`F${String(i).padStart(3, '0')}.TXT`, Buffer.from('x')));
const longLines = Array.from({ length: 150 }, (_, i) => `line ${String(i).padStart(3, '0')} abcdefghij`);

const cases = [
  withImage(
    {
      id: 'fs-special.rootfull',
      title: '根目录写满（223 个文件加卷标共 224 项）后 copy f000.txt zz.txt：提示“无可用文件”“放弃A,重试R,失败F ?”，按 f 回到提示符，没有 ZZ.TXT、空闲簇与目录项个数不变、簇无泄漏',
      steps: [
        { ...shellText('copy f000.txt zz.txt'), check: ({ data }) => ['A:\\F000.TXT', '无可用文件', '放弃A,重试R,失败F ?'].filter((text) => !data.includes(text)).map((text) => `屏幕上没有“${text}”；实际：${JSON.stringify(data)}`) },
        { ...moreText('f', 400), check: ({ data }) => (data.includes('>') ? [] : [`回到提示符后没有“>”；实际：${JSON.stringify(data)}`]) },
        saveDisk(() => []),
      ],
      finalCheck: (history) => {
        const after = history.at(-1).data;
        const problems = [];
        if (findFile(after, 'ZZ      TXT')) problems.push('不该出现 ZZ.TXT');
        if (after.listRoot().length !== 224) problems.push(`根目录项个数预期 224，实际 ${after.listRoot().length}`);
        if (after.freeClusters() !== after.clusterCount - 223) problems.push(`空闲簇预期 ${after.clusterCount - 223}，实际 ${after.freeClusters()}`);
        if (!after.fatCopiesMatch()) problems.push('两份 FAT 不一致');
        return [...problems, ...leakProblems(after)];
      },
    },
    rootFiles,
  ),
  withImage(
    {
      id: 'fs-special.type-long',
      title: 'type long.txt（150 行、3150 字节，跨 7 个簇）：每行按顺序完整显示，没有缺行、重复或截断',
      steps: [
        {
          ...shellText('type long.txt', 4000),
          check: ({ data }) => {
            const at = data.indexOf(longLines[0]);
            if (at < 0) return [`没有找到第一行；实际：${JSON.stringify(data.slice(0, 20))}`];
            const shown = data.slice(at, at + longLines.length);
            const wrong = longLines.findIndex((line, index) => shown[index] !== line);
            return wrong < 0 ? [] : [`第 ${wrong} 行预期 ${JSON.stringify(longLines[wrong])}，实际 ${JSON.stringify(shown[wrong])}`];
          },
        },
      ],
    },
    [file('LONG.TXT', Buffer.from(`${longLines.join('\r\n')}\r\n`))],
  ),
  withImage(
    {
      id: 'fs-special.fragment',
      title: '删除中间的 B.BIN 后 copy big.bin new.bin（100 簇，先填 64 簇的空洞再接到末尾）、再 copy new.bin copy2.bin：新文件与复制件内容都与 BIG.BIN 一致，簇无泄漏',
      steps: [
        shellText('del b.bin'),
        { ...moreText('copy big.bin new.bin\n', 1500), check: () => [] },
        { ...moreText('copy new.bin copy2.bin\n', 1500), check: () => [] },
        saveDisk(() => []),
      ],
      finalCheck: (history) => {
        const after = history.at(-1).data;
        const problems = [];
        const original = findFile(after, 'BIG     BIN');
        for (const name of ['NEW     BIN', 'COPY2   BIN']) {
          const found = findFile(after, name);
          if (!found) {
            problems.push(`没有找到 ${name.trim()}`);
            continue;
          }
          if (found.size !== big.length || !after.readFile(found).equals(big)) problems.push(`${name.trim()} 的大小或内容与 BIG.BIN 不一致`);
          if (after.chain(found.cluster).length !== 100) problems.push(`${name.trim()} 的簇链长度预期 100，实际 ${after.chain(found.cluster).length}`);
        }
        if (!original || !after.readFile(original).equals(big)) problems.push('BIG.BIN 被改动');
        if (findFile(after, 'B       BIN')) problems.push('B.BIN 没有被删除');
        for (const [name, data] of [['A       BIN', a], ['C       BIN', c]]) {
          const found = findFile(after, name);
          if (!found || !after.readFile(found).equals(data)) problems.push(`${name.trim()} 被改动`);
        }
        const fragmented = findFile(after, 'NEW     BIN');
        if (fragmented) {
          const chain = after.chain(fragmented.cluster);
          if (chain.every((cluster, index) => index === 0 || cluster === chain[index - 1] + 1)) problems.push('NEW.BIN 的簇是连续的，没有走到碎片路径');
        }
        if (!after.fatCopiesMatch()) problems.push('两份 FAT 不一致');
        return [...problems, ...leakProblems(after)];
      },
    },
    [file('A.BIN', a), file('B.BIN', b), file('C.BIN', c), file('BIG.BIN', big)],
  ),
  ...[
    ['f', '失败 F：回到提示符'],
    ['a', '放弃 A：回到提示符'],
    ['rf', '先重试 R（再次显示同样的提示），再失败 F'],
  ].map(([keys, what]) => withImage(
    {
      id: `fs-special.full-${keys}`,
      title: `磁盘只剩 10 个空闲簇时 copy big.bin x.bin（30 簇）：提示“磁盘空间不够”“放弃A,重试R,失败F ?”，按 ${keys}（${what}），磁盘上没有 X.BIN、已有文件不变、空闲簇仍为 10、簇无泄漏`,
      steps: [
        { ...shellText('copy big.bin x.bin'), check: ({ data }) => ['A:\\BIG.BIN', '磁盘空间不够', '放弃A,重试R,失败F ?'].filter((text) => !data.includes(text)).map((text) => `屏幕上没有“${text}”；实际：${JSON.stringify(data)}`) },
        ...[...keys].map((key, index) => ({
          ...moreText(key, 600),
          check: ({ data }) => {
            const last = index === keys.length - 1;
            if (!last) return ['磁盘空间不够', '放弃A,重试R,失败F ?'].filter((text) => !data.includes(text)).map((text) => `重试后屏幕上没有“${text}”；实际：${JSON.stringify(data)}`);
            return data.includes('>') ? [] : [`回到提示符后没有“>”；实际：${JSON.stringify(data)}`];
          },
        })),
        saveDisk(() => []),
      ],
      finalCheck: (history) => {
        const after = history.at(-1).data;
        const problems = [];
        if (findFile(after, 'X       BIN')) problems.push('不该出现 X.BIN');
        if (after.freeClusters() !== 10) problems.push(`空闲簇预期 10，实际 ${after.freeClusters()}`);
        for (const [name, data] of [['HELLO   TXT', Buffer.from('hello\r\n')], ['BIG     BIN', fullBig], ['FILL    BIN', fullFill]]) {
          const found = findFile(after, name);
          if (!found || !after.readFile(found).equals(data)) problems.push(`${name.trim()} 缺失或被改动`);
        }
        if (after.listRoot().length !== 4) problems.push(`根目录项个数预期 4（含卷标），实际 ${after.listRoot().length}`);
        if (!after.fatCopiesMatch()) problems.push('两份 FAT 不一致');
        return [...problems, ...leakProblems(after)];
      },
    },
    [file('HELLO.TXT', Buffer.from('hello\r\n')), file('BIG.BIN', fullBig), file('FILL.BIN', fullFill)],
  )),
];

export { cases };
