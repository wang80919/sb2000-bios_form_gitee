// ------------------------------------------------------------------------
// 名称：p04-mouse.mjs
// 说明：鼠标驱动（功能 $14、$6C，以及中断里的数据包解析 MOUSE_BTN1_UPDATE、MOUSE_BTN2_UPDATE 等）的验证用例：用调试命令 mouse 注入位移与按键，检查坐标累加与限幅、按键状态字节的变化。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值来自 系统调用手册 5.8 节（已由 fcdev 的 examples/sb2000/mouse 实机确认的用法）与鼠标协议本身：位移按 1:1 累加到坐标，并限制在上下限之间。
//       使用顺序：$14 复位（$0633 为鼠标存在标志），$13/$81 允许鼠标中断，$6C/$00 设范围（X 下限 $0646、Y 下限 $0647、X 上限 $0648、Y 上限 $0649，$0652 不要是 1-4），$6C/$04 设坐标（$0652 为 X，$0653 为 Y），$6C/$02 取坐标。
//       按键状态：$6C/$03 把标志整理到 $0360-$0367（按键 1：状态 $0360、双击 $0362、点击 $0364、拖动 $0366；按键 2 依次是 $0361、$0363、$0365、$0367）；模拟器里 mouse btn 4 是按键 1，mouse btn 1 是按键 2。
// ------------------------------------------------------------------------
const MOUSE_PRESENT = 0x633;

const prepare = (x, y, range = [0x00, 0x00, 0xff, 0xff], doubleClickTime = 0x00) => [
  { func: 0x14, maxFrames: 200 },
  { func: 0x13, sub: 0x81 },
  { func: 0x6c, sub: 0x00, mem: [[0x646, range], [0x652, [doubleClickTime]]] },
  { func: 0x6c, sub: 0x04, mem: [[0x652, [x, y]]] },
];

const move = (dx, dy) => ({ host: async (client) => { await client.send(`mouse move ${dx} ${dy}`); await client.run(20); } });
const buttons = (mask) => ({ host: async (client) => { await client.send(`mouse btn ${mask}`); await client.run(20); } });
const position = (x, y) => ({ func: 0x6c, sub: 0x02, expect: [[0x646, [x, y]]] });
/** 取按键状态并核对 $0360-$0367 */
const state = (expected) => ({ func: 0x6c, sub: 0x03, expect: [[0x360, expected]] });

const cases = [
  {
    id: 'mouse.reset',
    title: '$14 鼠标复位：$0633 鼠标存在标志非 0（模拟器接着鼠标）',
    steps: [{ func: 0x14, maxFrames: 200, check: () => [] }, { func: 0x6c, sub: 0x01, read: [[MOUSE_PRESENT, 1]], check: (result) => (result.memory.get(MOUSE_PRESENT)[0] !== 0 ? [] : ['$0633 为 0']) }],
  },
  {
    id: 'mouse.coords',
    title: '设坐标 ($80,$64) 后依次移动 (10,5)、(10,5)、(-4,-3)：坐标 ($90,$6B)；$6C/$02 取到的与设置时一致',
    steps: [...prepare(0x80, 0x64), position(0x80, 0x64), move(10, 5), move(10, 5), move(-4, -3), position(0x90, 0x6b)],
  },
  {
    id: 'mouse.clamp-high',
    title: '范围 X、Y 都是 [$10,$20]，坐标 ($18,$18) 后移动 (100,100)：限制在上限 ($20,$20)',
    steps: [...prepare(0x18, 0x18, [0x10, 0x10, 0x20, 0x20]), move(100, 100), position(0x20, 0x20)],
  },
  {
    id: 'mouse.clamp-low',
    title: '范围 X、Y 都是 [$10,$20]，坐标 ($18,$18) 后移动 (-100,-100)：限制在下限 ($10,$10)',
    steps: [...prepare(0x18, 0x18, [0x10, 0x10, 0x20, 0x20]), move(-100, -100), position(0x10, 0x10)],
  },
  {
    id: 'mouse.axes-independent',
    title: '范围 X 为 [$10,$30]、Y 为 [$40,$50]，坐标 ($20,$48) 后移动 (5,-3)：只按各自的范围累加，得 ($25,$45)',
    steps: [...prepare(0x20, 0x48, [0x10, 0x40, 0x30, 0x50]), move(5, -3), position(0x25, 0x45)],
  },
  {
    id: 'mouse.btn1-hold',
    title: '按键 1 按住不放：状态 1、点击 0、拖动 0',
    steps: [...prepare(0x80, 0x64), buttons(4), state([1, 0, 0, 0, 0, 0, 0, 0]), buttons(0)],
  },
  {
    id: 'mouse.btn2-hold',
    title: '按键 2 按住不放：状态 1、点击 0、拖动 0',
    steps: [...prepare(0x80, 0x64), buttons(1), state([0, 1, 0, 0, 0, 0, 0, 0]), buttons(0)],
  },
  {
    id: 'mouse.btn2-click',
    title: '按键 2 按下并松开后查询：状态 2、点击 1；点击与松开状态读走后都清零，再查全为 0',
    steps: [...prepare(0x80, 0x64), buttons(1), buttons(0), state([0, 2, 0, 0, 0, 1, 0, 0]), state([0, 0, 0, 0, 0, 0, 0, 0])],
  },
  {
    id: 'mouse.btn1-drag',
    title: '按键 1 按住并移动：状态 1、拖动 1；松开后状态 2、点击 0（拖动不产生点击）',
    steps: [...prepare(0x80, 0x64), buttons(4), move(5, 5), state([1, 0, 0, 0, 0, 0, 1, 0]), buttons(0), state([2, 0, 0, 0, 0, 0, 0, 0])],
  },
  {
    id: 'mouse.btn1-double',
    title: '双击间隔参数 $FF：按键 1 按下、松开、查询点击（状态 2、点击 1）、再按下：状态 1、点击 0、双击 1；再松开：状态 2、点击 0（不再产生点击）',
    steps: [...prepare(0x80, 0x64, undefined, 0xff), buttons(4), buttons(0), state([2, 0, 0, 0, 1, 0, 0, 0]), buttons(4), state([1, 0, 1, 0, 0, 0, 0, 0]), buttons(0), state([2, 0, 0, 0, 0, 0, 0, 0])],
  },
  {
    id: 'mouse.btn1-double-zero',
    title: '双击间隔参数 0（计时器不可能小于 0）：同样的操作不算双击，第二次按下后双击字节为 0，再松开又产生一次点击',
    steps: [...prepare(0x80, 0x64), buttons(4), buttons(0), state([2, 0, 0, 0, 1, 0, 0, 0]), buttons(4), state([1, 0, 0, 0, 0, 0, 0, 0]), buttons(0), state([2, 0, 0, 0, 1, 0, 0, 0])],
  },
  {
    id: 'mouse.btn2-twice',
    title: '按键 2 按下、松开、再按下（实测：按键 2 不产生双击）：第二次按下状态 1、双击 0；再松开：状态 2、点击 1',
    steps: [...prepare(0x80, 0x64), buttons(1), buttons(0), buttons(1), state([0, 1, 0, 0, 0, 0, 0, 0]), buttons(0), state([0, 2, 0, 0, 0, 1, 0, 0])],
  },
];

export { cases };
