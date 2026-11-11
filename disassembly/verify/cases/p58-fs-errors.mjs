// ------------------------------------------------------------------------
// 名称：p58-fs-errors.mjs
// 说明：文件服务出错码的验证用例（不改动磁盘）：打开不存在的文件与路径、非法名称、句柄用完、未打开的句柄、打开方式与操作不符、参数非法，以及 $7B/$0B、$7D/$00、$7D/$01 的查找与名称整理。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：出错码含义见 fcdev 仓库 docs/sb2000/02-系统调用手册.md 第 6 节；预期的出错码由 DOS 文档的出错码表与各调用的说明给出，实测不符的写进问题与结论登记。
//       名称整理 $7D/$01 的预期是“把 11 字节的 8+3 名称整理成以 0 结尾的 \NAME.EXT”。
// ------------------------------------------------------------------------
import { runCall } from '../../tools/rom-driver.mjs';
import { before } from '../lib/disk-check.mjs';
import { withRestore } from '../lib/restore.mjs';
import { DOS_ERROR, FILE_MODE, HANDLE_TABLE, PATH_BUFFER, ascii, closeHandle, le, noError, openStep, resetHandles } from '../lib/fs-steps.mjs';

const FILE_OFFSET = 0x6565;
const FILE_SIZE = 0x6568;
const FILE_START_PAGE = 0x656b;
const DIR_NAME83 = 0x651d;
const hello = 'HELLO.TXT';

const open = (name, mode, error) => openStep(name, mode, [[DOS_ERROR, [error]]]);
const call = (func, sub, expectedError, extra = {}) => ({ func, sub, expect: [[DOS_ERROR, [expectedError]]], ...extra });

/**
 * 会改 DIR_NAME83 与 $6528/$6529 的调用：它们是当前目录的名称和起始扇区，相对路径的打开都依赖它们，所以调用后要还原，否则后面的用例会在“当前目录”里找不到文件。
 */
const guarded = (step) => ({
  host: (client) => withRestore(client, [[DIR_NAME83, 11], [0x6528, 2]], () => runCall(client, { func: step.func, sub: step.sub, mem: step.mem, read: step.expect.map(([address, bytes]) => [address, bytes.length]), maxFrames: step.maxFrames ?? 60 })),
  check: ({ data }) => {
    if (!data.done) return ['调用没有返回'];
    const problems = [];
    for (const [address, want] of step.expect) {
      const got = data.memory.get(address);
      want.forEach((value, i) => { if (got[i] !== value) problems.push(`$${(address + i).toString(16).toUpperCase()} 预期 ${value.toString(16).toUpperCase()}，实际 ${got[i].toString(16).toUpperCase()}`); });
    }
    return problems;
  },
});

const cases = before
  ? [
      { id: 'fs.err.missing-root', title: '$7B/$09 方式 0 打开不存在的文件：出错码 2', steps: [resetHandles, open('NOFILE.TXT', 0, 0x02)] },
      { id: 'fs.err.missing-dir', title: '$7B/$09 打开不存在的目录下的文件 \\NODIR\\X.TXT：出错码 3', steps: [resetHandles, open('\\NODIR\\X.TXT', 0, 0x03)] },
      { id: 'fs.err.file-as-dir', title: '$7B/$09 把文件当目录 HELLO.TXT\\X.TXT：路径未找到（3）', steps: [resetHandles, open('HELLO.TXT\\X.TXT', 0, 0x03)] },
      { id: 'fs.err.mode-6', title: '$7B/$09 打开方式 6：出错码 $28', steps: [resetHandles, open(hello, 6, 0x28)] },
      { id: 'fs.err.mode-ff', title: '$7B/$09 打开方式 $FF：出错码 $28', steps: [resetHandles, open(hello, 0xff, 0x28)] },
      ...['A?B.TXT', 'A*B.TXT', 'A B.TXT', 'A,B.TXT', 'A+B.TXT', 'A=B.TXT', 'A;B.TXT', 'A[B.TXT', 'A|B.TXT', 'A"B.TXT'].map((name, i) => ({
        id: `fs.err.bad-name-${i}`,
        title: `$7B/$09 名称 "${name}" 含不允许的字符：出错码 $27`,
        steps: [resetHandles, open(name, 0, 0x27)],
      })),
      {
        id: 'fs.err.too-many-handles',
        title: '$7B/$09 已打开 4 个文件，再打开第 5 个：出错码 4；关闭一个后又能打开',
        steps: [
          resetHandles,
          ...[0, 1, 2, 3].map(() => ({ ...openStep(hello, 0), maxFrames: 300 })),
          open(hello, 0, 0x04),
          { func: 0x7b, sub: 0x0a, mem: [[0x6561, [0]]], expect: noError },
          openStep(hello, 0),
          { ...resetHandles },
        ],
      },
      {
        id: 'fs.err.handle-offsets',
        title: '$7B/$09 连续打开 4 个文件，句柄偏移依次是 $00、$2C、$58、$84，句柄表首字节为打开方式',
        steps: [
          resetHandles,
          ...[0, 1, 2, 3].map((i) => ({ ...openStep(hello, 0, [[DOS_ERROR, [0]], [0x6561, [i * 0x2c]], [HANDLE_TABLE + i * 0x2c, [0]]]), maxFrames: 300 })),
          resetHandles,
        ],
      },
      { id: 'fs.err.close-free', title: '$7B/$0A 关闭没有打开的句柄：什么都不做，出错码 0，句柄仍空闲', steps: [resetHandles, { func: 0x7b, sub: 0x0a, mem: [[0x6561, [0]]], expect: [[DOS_ERROR, [0]], [HANDLE_TABLE, [0xff]]] }] },
      { id: 'fs.err.reset-closes', title: '$7B/$13 把 4 个句柄全部置为空闲（不写回目录项）', steps: [resetHandles, openStep(hello, 0), openStep(hello, 0), resetHandles, { func: 0x7b, sub: 0x0a, mem: [[0x6561, [0]]], expect: [[DOS_ERROR, [0]], [HANDLE_TABLE, [0xff]], [HANDLE_TABLE + 0x2c, [0xff]]] }] },
      {
        id: 'fs.err.read-file-needs-mode-0',
        title: '$7C/$0F 读整个文件要求方式 0：句柄方式 2 时出错码 $28',
        steps: [resetHandles, openStep(hello, 2), call(0x7c, 0x0f, 0x28, { mem: [[FILE_START_PAGE, [0x80]]] }), { ...closeHandle, maxFrames: 300 }],
      },
      {
        id: 'fs.err.write-file-needs-mode-1',
        title: '$7C/$10 写整个文件要求方式 1：句柄方式 0 时出错码 $28',
        steps: [resetHandles, openStep(hello, 0), call(0x7c, 0x10, 0x28, { mem: [[FILE_SIZE, le(5, 3)], [FILE_START_PAGE, [0x80]]] }), closeHandle],
      },
      {
        id: 'fs.err.write-at-mode-0',
        title: '$7C/$06 按偏移写要求方式 1 或 2：句柄方式 0 时出错码 $28',
        steps: [resetHandles, openStep(hello, 0), call(0x7c, 0x06, 0x28, { mem: [[FILE_OFFSET, le(0, 3)], [FILE_SIZE, le(1, 3)], [FILE_START_PAGE, [0x80]]] }), closeHandle],
      },
      {
        id: 'fs.err.read-at-needs-low-mode',
        title: '$7C/$05 按偏移读要求句柄方式小于 3：方式 1 打开的句柄可读，见 p58-fs-handle.mjs；这里核对 $7C/$05 长度为 0 出错码 $25',
        steps: [resetHandles, openStep(hello, 0), call(0x7c, 0x05, 0x25, { mem: [[FILE_OFFSET, le(0, 3)], [FILE_SIZE, le(0, 3)], [FILE_START_PAGE, [0x80]]] }), closeHandle],
      },
      // $7B/$0B 取得目录项（以方式 4 打开）：只对根目录与已存在的子目录成功；文件与不存在的路径都是出错码 3
      ...['\\', 'A:\\', '.'].map((path, i) => ({
        id: `fs.find.root-${i}`,
        title: `$7B/$0B 路径 "${path}" 表示根目录：成功，DIR_NAME83 首字节 $5C，目录起始扇区 $6528/$6529 为根目录起始扇区 19`,
        steps: [resetHandles, guarded({ func: 0x7b, sub: 0x0b, mem: [[PATH_BUFFER, [...ascii(path), 0]], [DIR_NAME83, ascii('xxxxxxxxxxx')], [0x6528, [0, 0]]], expect: [[DOS_ERROR, [0]], [DIR_NAME83, [0x5c]], [0x6528, [19, 0]]], maxFrames: 400 }), resetHandles],
      })),
      ...[['HELLO.TXT', '文件'], ['NEWFILE.TXT', '不存在的文件'], ['\\NODIR\\X', '不存在的目录下的文件']].map(([path, what], i) => ({
        id: `fs.find.not-dir-${i}`,
        title: `$7B/$0B ${what} "${path}"：出错码 3，DIR_NAME83 不变`,
        steps: [resetHandles, guarded({ func: 0x7b, sub: 0x0b, mem: [[PATH_BUFFER, [...ascii(path), 0]], [DIR_NAME83, ascii('xxxxxxxxxxx')]], expect: [[DOS_ERROR, [0x03]], [DIR_NAME83, ascii('xxxxxxxxxxx')]], maxFrames: 400 }), resetHandles],
      })),
      { id: 'fs.find.dotdot', title: '$7B/$0B 路径 ".."：出错码 $27', steps: [resetHandles, guarded({ func: 0x7b, sub: 0x0b, mem: [[PATH_BUFFER, [...ascii('..'), 0]]], expect: [[DOS_ERROR, [0x27]]], maxFrames: 400 }), resetHandles] },
      // $7D/$01 名称整理
      ...[['HELLO   TXT', '\\HELLO.TXT'], ['ATTRIB  EXE', '\\ATTRIB.EXE'], ['ABCDEFGHXYZ', '\\ABCDEFGH.XYZ'], ['A       B  ', '\\A.B'], ['NOEXT      ', '\\NOEXT'], ['X          ', '\\X']].map(([name83, text], i) => ({
        id: `fs.format-name.${i}`,
        title: `$7D/$01 把 "${name83}" 整理成 "${text}"`,
        steps: [guarded({ func: 0x7d, sub: 0x01, mem: [[DIR_NAME83, ascii(name83)], [PATH_BUFFER, new Array(20).fill(0x77)]], expect: [[DOS_ERROR, [0]], [PATH_BUFFER, [...ascii(text), 0]]] })],
      })),
      // $7C/$04 重命名的出错路径（成功路径见 p58-fs-write.mjs）：句柄要以方式 2 打开，新名称放 PATH_BUFFER
      {
        id: 'fs.rename.exists',
        title: '$7C/$04 新名称已存在（ATTRIB.EXE）：出错码 $20',
        steps: [resetHandles, openStep(hello, 2), call(0x7c, 0x04, 0x20, { mem: [[PATH_BUFFER, [...ascii('ATTRIB.EXE'), 0]]], maxFrames: 900 }), { ...closeHandle, maxFrames: 900 }],
      },
      {
        id: 'fs.rename.bad-name',
        title: '$7C/$04 新名称含非法字符 "A?B.TXT"：出错码 $27',
        steps: [resetHandles, openStep(hello, 2), call(0x7c, 0x04, 0x27, { mem: [[PATH_BUFFER, [...ascii('A?B.TXT'), 0]]], maxFrames: 900 }), { ...closeHandle, maxFrames: 900 }],
      },
      {
        id: 'fs.rename.mode-0',
        title: '$7C/$04 句柄以方式 0 打开：出错码 $28',
        steps: [resetHandles, openStep(hello, 0), call(0x7c, 0x04, 0x28, { mem: [[PATH_BUFFER, [...ascii('NEWNAME.TXT'), 0]]], maxFrames: 900 }), closeHandle],
      },
      {
        id: 'fs.rename.free-handle',
        title: '$7C/$04 句柄空闲：出错码 $2E',
        steps: [resetHandles, call(0x7c, 0x04, 0x2e, { mem: [[0x6561, [0]], [PATH_BUFFER, [...ascii('NEWNAME.TXT'), 0]]], maxFrames: 900 })],
      },
      { id: 'fs.open-call-and-close-flush', title: '$7C/$00 按 FILE_MODE 打开，$7C/$02 关闭并停转：句柄恢复空闲', steps: [resetHandles, { func: 0x7c, sub: 0x00, mem: [[FILE_MODE, [0]], [PATH_BUFFER, [...ascii(hello), 0]]], expect: noError, maxFrames: 600 }, { func: 0x7c, sub: 0x02, mem: [[0x6561, [0]]], expect: [[DOS_ERROR, [0]], [HANDLE_TABLE, [0xff]]], maxFrames: 600 }] },
    ]
  : [];

export { cases };
