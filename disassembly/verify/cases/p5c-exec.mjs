// ------------------------------------------------------------------------
// 名称：p5c-exec.mjs
// 说明：功能 $7F 子功能 0（运行程序）的验证用例：特制镜像里放小程序，核对分配的页号与页数写进程序偏移 5、6、程序被调用并返回、页被释放、句柄被关闭，以及魔数不符与文件不存在的出错码。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：程序格式见 fcdev 仓库 docs/sb2000/02-系统调用手册.md 5.1 节：偏移 3、4 是魔数 AA 55，偏移 5、6 由系统填入起始页号与页数，从偏移 0（映射在 $8000）调用；
//       预期的起始页号来自 verify/lib/p5c-model.mjs 的位图分配模型（取调用前读出的位图），页数按文件大小向上取整到 4096 字节。
// ------------------------------------------------------------------------
import { runCall } from '../../tools/rom-driver.mjs';
import { PageModel } from '../lib/p5c-model.mjs';
import { PATH_BUFFER, HANDLE_TABLE, DOS_ERROR, ascii } from '../lib/fs-steps.mjs';
import { file, withImage } from '../lib/images.mjs';

const BITMAP = 0x6586;
const MARK = 0x7f0;
const hexName = (value) => value.toString(16).toUpperCase().padStart(2, '0');

/** 小程序：把页号、页数、偏移 3 的魔数字节与固定值 $5A 写到 $07F0-$07F3 后返回 */
const program = (size, { magic = [0xaa, 0x55] } = {}) => {
  const data = Buffer.alloc(size);
  data.set([0x4c, 0x10, 0x80, magic[0], magic[1]], 0);
  data.set([
    0xad, 0x05, 0x80, 0x8d, 0xf0, 0x07, // LDA $8005 ; STA $07F0（起始页号）
    0xad, 0x06, 0x80, 0x8d, 0xf1, 0x07, // LDA $8006 ; STA $07F1（页数）
    0xad, 0x03, 0x80, 0x8d, 0xf3, 0x07, // LDA $8003 ; STA $07F3（魔数第一个字节）
    0xa9, 0x5a, 0x8d, 0xf2, 0x07, // LDA #$5A ; STA $07F2
    0x60, // RTS
  ], 0x10);
  for (let i = 0x30; i < size; i++) data[i] = (i * 5) & 0xff;
  return data;
};

const execCase = (id, title, files, name, expect) => withImage({
  id: `p5c.exec.${id}`,
  title: `$7F/$00 ${title}`,
  steps: [{
    host: async (client) => {
      const before = Buffer.from(await client.read('cpu', BITMAP, 32));
      await runCall(client, { func: 0x7b, sub: 0x13, maxFrames: 60 });
      const result = await runCall(client, {
        func: 0x7f,
        sub: 0,
        mem: [[PATH_BUFFER, [...ascii(name), 0]], [MARK, [0, 0, 0, 0]]],
        read: [[MARK, 4], [DOS_ERROR, 1], [BITMAP, 32], [HANDLE_TABLE, 1]],
        maxFrames: 1500,
      });
      return { before, result };
    },
    check: ({ data: { before, result } }) => {
      if (!result.done) return ['调用没有返回'];
      const problems = [];
      const error = result.memory.get(DOS_ERROR)[0];
      if (error !== expect.error) problems.push(`DOS_ERROR 为 ${hexName(error)}，预期 ${hexName(expect.error)}`);
      const mark = result.memory.get(MARK);
      const model = new PageModel(before, { count: expect.pages ?? 1, start: 0 });
      model.alloc();
      const wanted = expect.runs ? [model.start, expect.pages, 0x5a, 0xaa] : [0, 0, 0, 0];
      wanted.forEach((value, i) => { if (mark[i] !== value) problems.push(`$${(MARK + i).toString(16).toUpperCase()} 为 ${hexName(mark[i])}，预期 ${hexName(value)}`); });
      if (!Buffer.from(result.memory.get(BITMAP)).equals(before)) problems.push('调用后页位图与调用前不同（页没有释放）');
      if (result.memory.get(HANDLE_TABLE)[0] !== 0xff) problems.push('句柄 0 没有关闭');
      return problems;
    },
  }],
}, files);

const cases = [
  execCase('one-page', '运行 100 字节的小程序（1 页）：页号、页数与魔数传给程序，返回后释放页、关闭句柄', [file('TEST.EXE', program(100))], 'TEST.EXE', { error: 0, pages: 1, runs: true }),
  execCase('exact-page', '运行恰好 4096 字节的程序：页数 1', [file('TEST.EXE', program(4096))], 'TEST.EXE', { error: 0, pages: 1, runs: true }),
  execCase('page-plus-one', '运行 4097 字节的程序：页数 2', [file('TEST.EXE', program(4097))], 'TEST.EXE', { error: 0, pages: 2, runs: true }),
  execCase('three-pages', '运行 9000 字节的程序：页数 3', [file('TEST.EXE', program(9000))], 'TEST.EXE', { error: 0, pages: 3, runs: true }),
  execCase('bad-magic-1', '偏移 3 的魔数不是 $AA：出错码 $3E，不运行，页已释放', [file('TEST.EXE', program(100, { magic: [0xab, 0x55] }))], 'TEST.EXE', { error: 0x3e, pages: 1 }),
  execCase('bad-magic-2', '偏移 4 的魔数不是 $55：出错码 $3E', [file('TEST.EXE', program(100, { magic: [0xaa, 0x54] }))], 'TEST.EXE', { error: 0x3e, pages: 1 }),
  execCase('missing', '文件不存在：出错码 2', [file('OTHER.EXE', program(100))], 'TEST.EXE', { error: 0x02 }),
];

export { cases };
