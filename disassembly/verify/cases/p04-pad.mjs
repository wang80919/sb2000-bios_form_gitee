// ------------------------------------------------------------------------
// 名称：p04-pad.mjs
// 说明：手柄服务（功能 $6A）的验证用例：用调试命令 pad 注入按键，$12/$85 打开 NMI 里的手柄读取后，核对 $6A/$01 得到的键码 $034D 与原始状态 $034E/$034F。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：预期值来自 系统调用手册 5.8 节（已由 fcdev 的 examples/sb2000/pad 实机确认的键码表）：1 号手柄 A、B、选择、开始、上、下、左、右 = $0F-$08，没有键 $FF，多键取最高位。
//       pad 命令的掩码位顺序：位 0 A、位 1 B、位 2 选择、位 3 开始、位 4 上、位 5 下、位 6 左、位 7 右（实测），而 BIOS 的原始状态 $034E 是位 7 A、位 0 右。
//       2 号手柄不测：机器上接着鼠标时第二个端口被鼠标占用，NMI 不读 2 号手柄（实测 2 号的键码总是 $FF）。
// ------------------------------------------------------------------------
const BUTTONS = ['A', 'B', '选择', '开始', '上', '下', '左', '右'];

/** 注入按键并等待 NMI 读到 */
const press = (pad, mask) => ({
  host: async (client) => {
    await client.send(pad === null ? 'pad clear' : `pad ${pad} ${mask.toString(16)}`);
    await client.run(6);
  },
});

const readKey = (keyCode, rawPad1, rawPad2) => ({
  func: 0x6a,
  sub: 0x01,
  maxFrames: 60,
  expect: [[0x34d, [keyCode]], [0x34e, [rawPad1]], [0x34f, [rawPad2]]],
});

const prepare = [{ func: 0x12, sub: 0x85, maxFrames: 60 }, { func: 0x6a, sub: 0x00, maxFrames: 60 }];

const single = BUTTONS.map((name, index) => {
  const mask = 1 << index;
  const raw = 0x80 >> index;
  const keyCode = 0x0f - index;
  return {
    id: `pad.p1.${index}`,
    title: `$6A/$01 1 号手柄按 ${name}：键码 $${keyCode.toString(16).toUpperCase().padStart(2, '0')}，原始状态 $${raw.toString(16).toUpperCase().padStart(2, '0')}`,
    steps: [...prepare, press(0, mask), readKey(keyCode, raw, 0), press(null, 0)],
  };
});

const none = {
  id: 'pad.none',
  title: '$6A/$01 没有按键：键码 $FF，原始状态都是 0',
  steps: [...prepare, press(null, 0), readKey(0xff, 0, 0)],
};

const chord = {
  id: 'pad.chord',
  title: '$6A/$01 1 号手柄同时按 A 与右（注入掩码 $81）：取最高位的键 A，键码 $0F，原始状态 $81',
  steps: [...prepare, press(0, 0x81), readKey(0x0f, 0x81, 0), press(null, 0)],
};

const wait = {
  id: 'pad.wait',
  title: '$6A/$02 等待按键：按键已按下时立即返回，键码 $0F（A）、原始状态 $80',
  steps: [...prepare, press(0, 0x01), { func: 0x6a, sub: 0x02, maxFrames: 60, expect: [[0x34d, [0x0f]], [0x34e, [0x80]]] }, press(null, 0)],
};

export const cases = [...single, none, chord, wait];
