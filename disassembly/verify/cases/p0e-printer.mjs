// ------------------------------------------------------------------------
// 名称：p0e-printer.mjs
// 说明：页组 $0E 打印机服务（功能 $76，子功能 0-15）的验证用例：记录调用期间发往并口数据端口 $4025 的字节序列，与预期的 Epson ESC/P 命令比对。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：模拟器的虚拟打印机收到 ESC @ 会弹“Print to...”对话框，verify-run.mjs 会自动应答；预期序列来自 ESC/P 命令定义与 系统调用手册 5.11 节的代码阅读，
//       这里用实测的写入序列核对它们。子功能 0、$0D 是整屏输出，只核对开头的命令头，数据部分不逐字节核对。
// ------------------------------------------------------------------------
const LPT_DATA = 0x4025;

/** 一次调用只发固定字节的子功能 */
const fixed = [
  { sub: 0x01, mem: [], bytes: '1B40', title: '初始化打印机 ESC @' },
  { sub: 0x02, mem: [], bytes: '1B3C', title: '打印头回左端 ESC <' },
  { sub: 0x03, mem: [], bytes: '1B400D', title: '初始化后回车' },
  { sub: 0x04, mem: [[0x649, [0x05]]], bytes: '1B4A05', title: '进纸 n/216 英寸 ESC J n，n 取自 $0649' },
  { sub: 0x05, mem: [[0x4b3, [0x01, 0x02]]], bytes: '1B240102', title: '绝对横向定位 ESC $ nL nH，参数取自 $04B3、$04B4' },
  { sub: 0x06, mem: [[0x4b3, [0x01, 0x02]]], bytes: '1B5C0102', title: '相对横向定位 ESC \\ nL nH，参数取自 $04B3、$04B4' },
  { sub: 0x07, mem: [[0x4a4, [0x41]]], bytes: '41', title: '发送 $04A4 里的一个字节' },
  { sub: 0x08, mem: [], bytes: '1B2A277804', title: '位图命令头 ESC * 39 nL nH（0x0478 = 1144 列）' },
  { sub: 0x09, mem: [], bytes: '', title: '整理点阵缓冲，不发送数据' },
  { sub: 0x0e, mem: [], bytes: '', title: '初始化并口，不发送数据' },
].map(({ sub, mem, bytes, title }) => ({
  id: `prn.sub${sub.toString(16).toUpperCase().padStart(2, '0')}`,
  title: `$76 子功能 ${sub}：${title}`,
  func: 0x76,
  sub,
  mem,
  capture: [LPT_DATA],
  expectWrites: [[LPT_DATA, bytes]],
  maxFrames: 3000,
}));

/** 整屏输出：核对命令头 ESC @ 加 ESC * 39 1144 */
const header = [0x1b, 0x40, 0x1b, 0x2a, 0x27, 0x78, 0x04];
const wholeScreen = [0x00, 0x0d].map((sub) => ({
  id: `prn.sub${sub.toString(16).toUpperCase().padStart(2, '0')}`,
  title: `$76 子功能 ${sub}：整屏输出，核对命令头`,
  func: 0x76,
  sub,
  capture: [LPT_DATA],
  maxFrames: 3000,
  check: (result) => {
    const data = result.writes.get(LPT_DATA);
    const problems = header.some((byte, i) => data[i] !== byte) ? [`命令头预期 ${header.map((b) => b.toString(16)).join(' ')}，实际 ${data.slice(0, 7).map((b) => b.toString(16)).join(' ')}`] : [];
    if (data.length < 1000) problems.push(`整屏输出只有 ${data.length} 个字节`);
    return problems;
  },
}));

/** 子功能 $0C 按 $0648（入口 PRN_ENTRY 把它复制到 $0546）个循环，每次发 3 字节 */
const columnLoops = [2, 5].map((loops) => ({
  id: `prn.sub0C.loops${loops}`,
  title: `$76 子功能 12：$0648=${loops}，发送 ${loops * 3} 字节`,
  func: 0x76,
  sub: 0x0c,
  mem: [[0x648, [loops]]],
  capture: [LPT_DATA],
  maxFrames: 120,
  check: (result) => {
    const data = result.writes.get(LPT_DATA);
    return data.length === loops * 3 ? [] : [`预期 ${loops * 3} 字节，实际 ${data.length}`];
  },
}));

export const cases = [...fixed, ...wholeScreen, ...columnLoops];
