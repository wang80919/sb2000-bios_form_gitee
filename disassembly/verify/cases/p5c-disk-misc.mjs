// ------------------------------------------------------------------------
// 名称：p5c-disk-misc.mjs
// 说明：磁盘服务（功能 $80）中读写之外的子功能的验证用例：$00 初始化、$06 启动、$08 逐扇区扫描磁道（读得出的扇区位图），以及参数越界时的状态码。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：镜像是完好的软盘，所以扫描任何一个合法磁道都应读出全部 18 个扇区，坏扇区位图 $6237-$6239 保持 0；磁头不小于 2 或磁道不小于 80 时状态 $10。
//       无盘（$18）、未就绪（$15）、未知盘片（$1A）、写保护、坏扇区与 $80/$01 见 p5c-disk-faults.mjs（用模拟器的 fdc 命令注入故障）。
// ------------------------------------------------------------------------
const HEAD = 0x6200;
const DISK_STATUS = 0x6208;
const BAD_SECTORS = 0x6237;

const stop = { func: 0x80, sub: 0x07, maxFrames: 200 };

const cases = [
  { id: 'disk.init', title: '$80/$00 初始化：启动软驱、复位到 0 磁道，状态 0', steps: [{ func: 0x80, sub: 0x00, maxFrames: 600, mem: [[DISK_STATUS, [0x77]]], expect: [[DISK_STATUS, [0]]] }, stop] },
  { id: 'disk.start', title: '$80/$06 启动软驱，状态 0', steps: [{ func: 0x80, sub: 0x06, maxFrames: 600, mem: [[DISK_STATUS, [0x77]]], expect: [[DISK_STATUS, [0]]] }, stop] },
  { id: 'disk.start-twice', title: '$80/$06 连续启动两次，状态都是 0', steps: [{ func: 0x80, sub: 0x06, maxFrames: 600, expect: [[DISK_STATUS, [0]]] }, { func: 0x80, sub: 0x06, maxFrames: 600, expect: [[DISK_STATUS, [0]]] }, stop] },
];

for (const [head, track] of [[0, 0], [1, 0], [0, 1], [1, 1], [0, 17], [1, 40], [0, 79], [1, 79]]) {
  cases.push({
    id: `disk.scan.h${head}t${track}`,
    title: `$80/$08 扫描磁头 ${head}、磁道 ${track}：18 个扇区都读得出，坏扇区位图全 0，状态 0`,
    steps: [{ func: 0x80, sub: 0x08, maxFrames: 1500, mem: [[HEAD, [head, 1, track]], [BAD_SECTORS, [0xaa, 0xbb, 0xcc]]], expect: [[DISK_STATUS, [0]], [BAD_SECTORS, [0, 0, 0]]] }, stop],
  });
}
for (const [head, track, label] of [[2, 0, '磁头 2'], [0, 80, '磁道 80'], [1, 0xff, '磁道 $FF'], [0xff, 0, '磁头 $FF']]) {
  cases.push({
    id: `disk.scan.bad-${head}-${track}`,
    title: `$80/$08 参数越界（${label}）：状态 $10`,
    steps: [{ func: 0x80, sub: 0x08, maxFrames: 300, mem: [[HEAD, [head, 1, track]], [DISK_STATUS, [0]]], expect: [[DISK_STATUS, [0x10]]] }, stop],
  });
}

export { cases };
