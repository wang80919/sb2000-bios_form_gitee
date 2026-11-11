// ------------------------------------------------------------------------
// 名称：bios-names.mjs
// 说明：BIOS 汇编工程里硬件寄存器、系统变量（零页、RAM、扩展 RAM）的符号名，以及符号定义文件的生成。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：已确认含义的地址用有意义的名称（依据 fcdev 仓库 docs/sb2000/03-硬件说明.md）；其余地址按区域用通用名称，
//       名称里带十六进制地址，因此一个地址只对应一个名称，随着研究深入逐步改为有意义的名称。
// ------------------------------------------------------------------------

/** 已确认含义的地址与名称 */
const KNOWN_NAMES = new Map([
  // 零页
  [0x0c, 'PROG_ENTRY_LO'], [0x0d, 'PROG_ENTRY_HI'],
  [0x10, 'CALL_VEC_LO'], [0x11, 'CALL_VEC_HI'],
  [0x14, 'FAR_OFFSET_LO'], [0x15, 'FAR_OFFSET_HI'],
  [0x4b, 'STR_PTR_LO'], [0x4c, 'STR_PTR_HI'],
  // 键盘队列
  [0x0336, 'KEY_QUEUE'], [0x0342, 'KEY_READ_INDEX'], [0x0343, 'KEY_WRITE_INDEX'],
  [0x034b, 'KEY_RESULT_LO'], [0x034c, 'KEY_RESULT_HI'],
  // 系统调用
  [0x05fa, 'SYS_RAM_TABLE'],
  [0x0639, 'WINDOW_SAVE_0'], [0x063a, 'WINDOW_SAVE_1'], [0x063b, 'WINDOW_SAVE_2'], [0x063c, 'WINDOW_SAVE_3'],
  [0x063e, 'SYS_FUNCTION'], [0x063f, 'SYS_SUBFUNCTION'], [0x0641, 'SYS_PAGE'], [0x0642, 'SYS_GROUP'],
  [0x0700, 'COPY_BUFFER'],
  // 标准 PPU 与 APU 寄存器
  [0x2000, 'PPU_CTRL'], [0x2001, 'PPU_MASK'], [0x2002, 'PPU_STATUS'], [0x2003, 'OAM_ADDR'],
  [0x2004, 'OAM_DATA'], [0x2005, 'PPU_SCROLL'], [0x2006, 'PPU_ADDR'], [0x2007, 'PPU_DATA'],
  [0x4000, 'SQ1_VOL'], [0x4001, 'SQ1_SWEEP'], [0x4002, 'SQ1_LO'], [0x4003, 'SQ1_HI'],
  [0x4004, 'SQ2_VOL'], [0x4005, 'SQ2_SWEEP'], [0x4006, 'SQ2_LO'], [0x4007, 'SQ2_HI'],
  [0x4008, 'TRI_LINEAR'], [0x400a, 'TRI_LO'], [0x400b, 'TRI_HI'],
  [0x400c, 'NOISE_VOL'], [0x400e, 'NOISE_LO'], [0x400f, 'NOISE_HI'],
  [0x4010, 'DMC_FREQ'], [0x4011, 'DMC_RAW'], [0x4012, 'DMC_START'], [0x4013, 'DMC_LEN'],
  [0x4014, 'OAM_DMA'], [0x4015, 'APU_STATUS'], [0x4016, 'JOY1'], [0x4017, 'JOY2_FRAME'],
  // 小霸王学生电脑的扩展寄存器
  [0x4031, 'MODE_6576'],
  [0x4040, 'WIN_PAGE_0'], [0x4041, 'WIN_PAGE_1'], [0x4042, 'WIN_PAGE_2'], [0x4043, 'WIN_PAGE_3'],
  [0x4044, 'WIN_PAGE_4'], [0x4045, 'WIN_PAGE_5'], [0x4046, 'WIN_PAGE_6'], [0x4047, 'WIN_PAGE_7'],
  [0x4048, 'DMA_CTRL'], [0x4049, 'DMA_SRC_HIGH'], [0x404a, 'DMA_SRC_LOW'], [0x404b, 'DMA_SRC_MID'],
  [0x404c, 'DMA_DST_LO'], [0x404d, 'DMA_DST_HI'], [0x404e, 'DMA_LEN_LO'], [0x404f, 'DMA_LEN_HI'],
  [0x4300, 'VRAM_BANK'], [0x4301, 'MODE_FC'], [0x5006, 'EBANK_128K'],
  // 扩展 RAM 里的 DOS 状态变量
  [0x6200, 'DISK_PARAM_0'], [0x6201, 'DISK_PARAM_1'], [0x6202, 'DISK_PARAM_2'], [0x6203, 'DISK_PARAM_3'],
  [0x6204, 'DISK_PARAM_4'], [0x6205, 'DISK_PARAM_5'], [0x6206, 'DISK_PARAM_6'], [0x6207, 'DISK_PARAM_7'],
  [0x6208, 'DISK_STATUS'],
  [0x6300, 'DOS_ERROR'], [0x6308, 'LIB_GROUP'],
  [0x630c, 'CURSOR_COL'], [0x630d, 'CURSOR_ROW'], [0x630e, 'GLYPH_ROW'],
  [0x6364, 'CMD_TAIL'], [0x6428, 'FONT_SIZE'], [0x643b, 'FILE_HANDLES'], [0x651d, 'DIR_NAME83'],
  [0x652e, 'FS_LBA_LO'], [0x652f, 'FS_LBA_HI'], [0x6543, 'PATH_BUFFER'],
  [0x6560, 'FILE_MODE'], [0x6561, 'FILE_HANDLE_OFFSET'],
  [0x6568, 'FILE_SIZE_0'], [0x6569, 'FILE_SIZE_1'], [0x656a, 'FILE_SIZE_2'], [0x656b, 'FILE_START_PAGE'],
  [0x6586, 'PAGE_BITMAP'], [0x65a6, 'ALLOC_COUNT'], [0x65a7, 'ALLOC_START'],
]);

const hex2 = (value) => value.toString(16).toUpperCase().padStart(2, '0');
const hex4 = (value) => value.toString(16).toUpperCase().padStart(4, '0');

/** 通用名称的区域划分：[起始地址, 结束地址（含）, 前缀, 地址位数] */
const REGIONS = [
  [0x0000, 0x00ff, 'ZP_', 2, '零页'],
  [0x0100, 0x01ff, 'STACK_', 4, '栈'],
  [0x0200, 0x1fff, 'RAM_', 4, '内部 RAM'],
  [0x2000, 0x3fff, 'PPU_', 4, 'PPU 寄存器'],
  [0x4000, 0x4fff, 'IO_', 4, '扩展寄存器'],
  [0x5000, 0x5fff, 'WRAM_', 4, '工作 RAM 与映射寄存器'],
  [0x6000, 0x7fff, 'ERAM_', 4, '扩展 RAM'],
];

/**
 * 取得地址对应的符号名。
 * @param {number} address 低于 $8000 的地址
 * @returns {string|null} 符号名；高于等于 $8000 的地址是 ROM 空间，返回 null
 */
export function ramName(address) {
  const known = KNOWN_NAMES.get(address);
  if (known) return known;
  for (const [start, end, prefix, digits] of REGIONS) {
    if (address >= start && address <= end) return `${prefix}${digits === 2 ? hex2(address) : hex4(address)}`;
  }
  return null;
}

/**
 * 生成符号定义文件（NAME = $值），按地址排序，并按区域加分组注释。
 * @param {Iterable<number>} addresses 工程里用到的地址
 * @returns {string}
 */
export function renderEquates(addresses) {
  const sorted = [...new Set(addresses)].sort((a, b) => a - b);
  const lines = [
    '; ------------------------------------------------------------------------',
    '; 名称：equates.asm',
    '; 说明：硬件寄存器与系统变量的符号定义，不占 ROM 空间',
    '; 作者：sungbin',
    '; 邮箱：sungbin@3578.cn',
    '; 日期：2026-11-09',
    '; 备注：由 tools/bios-gen.mjs 生成后手工维护；值不超过 $FF 的符号汇编时按零页寻址，其余按绝对寻址',
    '; ------------------------------------------------------------------------',
  ];
  let regionTitle = null;
  for (const address of sorted) {
    const region = REGIONS.find(([start, end]) => address >= start && address <= end);
    if (region && region[4] !== regionTitle) {
      regionTitle = region[4];
      lines.push('', `; ---- ${regionTitle} ----`);
    }
    lines.push(`${ramName(address).padEnd(20)}= $${address < 0x100 ? hex2(address) : hex4(address)}`);
  }
  return `${lines.join('\n')}\n`;
}
