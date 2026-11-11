// ------------------------------------------------------------------------
// 名称：fs-steps.mjs
// 说明：文件系统（功能 $7B、$7C、$7D、$7E）验证用例共用的地址与调用步骤：出错码、路径缓冲、打开方式单元、句柄表地址，打开、关闭、重置句柄、停转马达的步骤。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：地址含义见 fcdev 仓库 docs/sb2000/02-系统调用手册.md 第 4 节；步骤的写法见 verify/README.md。
// ------------------------------------------------------------------------

export const DOS_ERROR = 0x6300;
export const PATH_BUFFER = 0x6543;
export const FILE_MODE = 0x6560;
export const HANDLE_TABLE = 0x643b;

/** 字符串转字节数组 */
export const ascii = (text) => [...text].map((c) => c.charCodeAt(0));

/** 整数转 length 字节的小端数组 */
export const le = (value, length) => Array.from({ length }, (_, i) => (value >> (8 * i)) & 0xff);

/** "ATTRIB  EXE" → "ATTRIB.EXE" */
export const dosName = (name83) => `${name83.slice(0, 8).trim()}.${name83.slice(8).trim()}`;

/** 每次调用后 DOS_ERROR 应为 0 */
export const noError = [[DOS_ERROR, [0]]];

export const resetHandles = { func: 0x7b, sub: 0x13, expect: noError };
export const closeHandle = { func: 0x7b, sub: 0x0a, expect: [[DOS_ERROR, [0]], [HANDLE_TABLE, [0xff]]] };
export const stopMotor = { func: 0x80, sub: 0x07, maxFrames: 200, expect: noError };

/** 按方式 mode 打开 name（"HELLO.TXT" 形式），expect 默认只要求无错 */
export const openStep = (name, mode, expect = noError) => ({ func: 0x7b, sub: 0x09, mem: [[FILE_MODE, [mode]], [PATH_BUFFER, [...ascii(name), 0]]], expect });
