// ------------------------------------------------------------------------
// 名称：symbols.mjs
// 说明：已经读懂的固定内核区例程的符号名与说明，供生成清单时使用，随分析推进逐步补充。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：名称只用 A-Z、0-9 与下划线；每条都来自对反汇编清单的阅读，说明里写明依据的寄存器与内存。
//       $0639-$063C 是 $4040-$4043 四个窗口页号的 RAM 影子；$14/$15 是远指针，$15 低半字节与 $14 组成 12 位页内偏移。
// ------------------------------------------------------------------------

/**
 * @typedef {object} KnownSymbol
 * @property {number} address 内核区地址
 * @property {string} name 符号名
 * @property {string} summary 一句话说明
 */

/** @type {KnownSymbol[]} */
export const KNOWN_SYMBOLS = [
  { address: 0xc000, name: 'RESET', summary: '复位入口' },
  { address: 0xc084, name: 'NMI_HANDLER', summary: 'NMI 中断入口' },
  { address: 0xc12b, name: 'IRQ_HANDLER', summary: 'IRQ 中断入口' },
  { address: 0xfd8e, name: 'SYSCALL_DISPATCH', summary: '系统调用分发器，按 $063E 功能号分流，保存并恢复 P、A、X、Y 与 $0639-$063C' },
  { address: 0xff16, name: 'CALL_VECTOR_10', summary: 'JMP ($0010)，分发器用它进入处理例程' },
  { address: 0xfefc, name: 'SYSCALL_RETURN', summary: '分发器收尾：恢复窗口页号与寄存器后 RTS' },
  { address: 0xed94, name: 'MAP_WINDOWS_8000', summary: '把 A 起连续 4 个页映射到 $8000-$BFFF（写 $4040-$4043 并同步影子 $0639-$063C）' },
  { address: 0xedb4, name: 'RESTORE_WINDOWS_8000', summary: '按影子 $0639-$063C 重写 $4040-$4043' },
  { address: 0xec61, name: 'FAR_READ_BYTE', summary: '读远字节：页号 $0641、偏移取自 $14/$15，Y 为索引，结果在 A（$FFF3 入口）' },
  { address: 0xec8a, name: 'FAR_WRITE_BYTE', summary: '写远字节：参数同 FAR_READ_BYTE，A 为写入值（$FFF6 入口）' },
  { address: 0xecb3, name: 'FAR_COPY_IN', summary: '从页组 $0642 的 ($0C) 复制 $064F 字节到 $0700+X（$FFEA 入口）' },
  { address: 0xecee, name: 'FAR_COPY_OUT', summary: '从 $0700+X 复制 $064F 字节到页组 $0642 的 ($0C)（$FFED 入口）' },
  { address: 0xee76, name: 'INLINE_JUMP_TABLE', summary: '内联跳转表：JSR 之后紧跟若干 2 字节地址，A 为下标，直接跳到表项，不会返回到 JSR 的下一条指令' },
  { address: 0xedf1, name: 'API_29_MAP_WINDOW', summary: '功能 $29：把页 $0641 记入窗口 $0653（从 0 计）的影子 $0639+窗口，调用者返回时由 SYSCALL_RETURN 恢复到 $4040-$4043' },
  { address: 0xee5a, name: 'API_2C_ADDR_TO_FAR', summary: '功能 $2C：把 $0C/$0D 的窗口地址换成远指针：$14/$15 为 12 位偏移，$0641 = $0642 + 窗口号经换算' },
  { address: 0xee8d, name: 'API_30_DMA_TO_VRAM', summary: '功能 $30：用 DMA（$4048 起）从扩展 RAM 复制 $0800 字节到显存，$4049 固定写 $1F，源地址高字节按 $063F 从表 $A0/$A8/$B0/$B8 选取，子功能用内联跳转表分流（用例 p04-kernel-dma.mjs）' },
  { address: 0xe9d8, name: 'API_6B_INPUT_SERVICE', summary: '功能 $6B：输入服务，子功能 0 初始化键盘鼠标（调用 $6B/2、$13/2、$17），1 置 $063D=$FF，2 清 $063D，3-6 调用子例程；占实测调用的绝大部分（用例 p04-keyboard.mjs）' },
  { address: 0xe95f, name: 'API_6A_GAMEPAD', summary: '功能 $6A：手柄服务，子功能 0 初始化，1 取按键码（不等待）到 $034D（$FF 无键，1 号手柄 $0F-$08、2 号 $07-$00），2 等到有按键；原始状态在 $034E、$034F' },
  { address: 0xeb18, name: 'API_6C_MOUSE', summary: '功能 $6C：鼠标服务，子功能 0 设置范围（$0646-$0649），1 保存参数，2 取坐标到 $0646、$0647，3 整理按键状态到 $0360-$0367，4 设置坐标（$0652、$0653）' },
  { address: 0xed29, name: 'API_24_FAR_READ_NEXT', summary: '功能 $24：按远指针读一字节到 $0653 并后移指针，越过页尾时 $0641 加一' },
  { address: 0xed55, name: 'API_25_CALL_BANKED', summary: '功能 $25：映射页组 $0642 后调用 ($000C)，返回本调用者' },
  { address: 0xed5e, name: 'API_26_JUMP_BANKED', summary: '功能 $26：映射页组 $0642、清栈后跳转 ($000C)，不返回' },
  { address: 0xee27, name: 'API_2A_SET_VRAM_BANK', summary: '功能 $2A：把 $0642 写入 $4300（显存 bank）' },
  { address: 0xee2e, name: 'API_2B_FAR_WRITE_NEXT', summary: '功能 $2B：把 $0653 按远指针写入并后移指针' },
  { address: 0xe153, name: 'API_10_VIDEO_OPTION', summary: '功能 $10：按 $063F 子功能 0-7（超过返回 $0640=$FF）修改显示相关影子寄存器 $062A、$062B、$0630 并写 $2000、$2001，用紧跟 JSR 的内联跳转表分流（用例 p04-kernel-basic.mjs）' },
  { address: 0xe1dd, name: 'API_11_DISPLAY_MODE', summary: '功能 $11：$063F 小于 $80 时设置 $0638 的高 2 位；否则（低 2 位为 0-2）把显示区域登记到 $067E+3×低 2 位 起，低 2 位为 3 什么都不做（用例 p04-kernel-basic.mjs）' },
  { address: 0xe23d, name: 'API_12_PPU_CONTROL', summary: '功能 $12：按 $063F 置位或清位 $062A（$2000 影子）与 $0630（用例 p04-kernel-basic.mjs）' },
  { address: 0xe2c0, name: 'API_13_IRQ_MASK', summary: '功能 $13：置位或清位中断屏蔽影子 $062F 并写 $4032；$80 还会设置定时器 $4034/$4035，$02/$82 写 $4022' },
  { address: 0xe384, name: 'API_14_MOUSE_RESET', summary: '功能 $14：鼠标复位：拉低再拉高 $4026 的 bit1（RTS），等待鼠标的标识串，结果在 $0633（写 $4023=1 选择鼠标）' },
  { address: 0xe43e, name: 'API_15_SET_FLAG_0636', summary: '功能 $15：把 $0636 置 1' },
  { address: 0xe444, name: 'API_17_KEYBOARD_INIT', summary: '功能 $17：键盘复位与识别：期待应答 $AA、再发 $F2 期待 $FA（用例 p04-keyboard.mjs）' },
  { address: 0xe7c2, name: 'API_19_DISPLAY_OFF', summary: '功能 $19：关闭 NMI，等到垂直消隐后关闭背景与精灵显示' },
  { address: 0xe7db, name: 'API_1A_WAIT_VBLANK_ON', summary: '功能 $1A：等到垂直消隐开始，开启 NMI 并恢复显示控制寄存器' },
  { address: 0xe7f2, name: 'API_1B_WAIT_FRAMES', summary: '功能 $1B：等待 X 个完整的垂直消隐周期（帧）' },
  { address: 0xe804, name: 'API_1C_SAVE_CONTEXT', summary: '功能 $1C：把页组 $0642、地址 $0C/$0D、参数 $063F 压入 $0656 起的上下文栈（最多 10 项，计数在 $0655）' },
  { address: 0xe830, name: 'API_1D_RESTORE_CONTEXT', summary: '功能 $1D：弹出上下文，关声音并屏蔽中断后换页跳转，类似 longjmp，不返回' },
  { address: 0xe86f, name: 'API_1E_QUERY_STATE', summary: '功能 $1E：按 $063F（0-$0C）查询显示与系统状态，结果在 $0652，用内联跳转表分流' },
];

/**
 * 转成“地址 → 名称”映射。
 * @returns {Map<number, string>}
 */
export function symbolNames() {
  return new Map(KNOWN_SYMBOLS.map((s) => [s.address, s.name]));
}

/**
 * 换页功能（$3B 起）的名称与说明，按功能号索引；处理例程地址由 banked-tables.mjs 读出。
 * 屏幕文本相关的几项来自对页组 $08 处理例程的阅读：字符码 ≥ $A1 时按两字节（GB2312 汉字区）处理。
 * @type {{fn: number, name: string, summary: string}[]}
 */
export const BANKED_SYMBOLS = [
  { fn: 0x3b, name: 'API_3B_GLYPH_ADDR', summary: '按字符码 $064A（高字节）、$064B（低字节）查出字模所在的页与地址，高字节 $A1 以上为 GB2312 汉字；字符串显示例程内部也调用它（代码阅读）' },
  { fn: 0x3c, name: 'API_3C_3D_PUT_STRING', summary: '显示以结束符 $064F 结尾的字符串，$0C/$0D 指向字符串，可混排 ASCII 与汉字；先画到屏外缓冲再整块复制到 $064C/$064D 指定的显示地址（代码阅读）' },
  { fn: 0x3d, name: 'API_3C_3D_PUT_STRING', summary: '与 $3C 共用入口，按功能号选另一套字模与绘制例程（代码阅读）' },
  { fn: 0x3e, name: 'API_3E_3F_PUT_STRING_ASCII', summary: '显示以结束符 $064F 结尾的字符串，只处理单字节字符（代码阅读）' },
  { fn: 0x3f, name: 'API_3E_3F_PUT_STRING_ASCII', summary: '与 $3E 共用入口，按功能号选另一套字模与绘制例程（代码阅读）' },
  { fn: 0x40, name: 'API_40', summary: '屏幕单元写入服务：子功能位 2、3 为 0 时从起点线性写常量单元，为 01 时从 $0C/$0D 指向的内存按行复制，其余按列复制（用例 p08-display.mjs）' },
  { fn: 0x41, name: 'API_41_FILL_RECT', summary: '矩形填充：左上角 $0648 列、$0649 行，宽 $064B，单元总数 $064F/$0650，单元值 $064C/$064D（实测）' },
  { fn: 0x42, name: 'API_42', summary: '屏幕单元写入服务：按列写，每次连写左右两格后下移一行，列高受 30−行 限制（用例 p08-display.mjs；代码在页 09 前半部分）' },
  { fn: 0x43, name: 'API_43', summary: '屏幕单元写入服务：同 $41，每次只写一格，行距 $064A+1（用例 p08-display.mjs；代码在页 09 前半部分）' },
  { fn: 0x44, name: 'API_44', summary: '屏幕单元写入服务：按列写单格，下移一行，列距 $064B+1（用例 p08-display.mjs；代码在页 09 前半部分）' },
  { fn: 0x45, name: 'API_45_PUT_TEXT_FIELD', summary: '在 $0648 列、$0649 行起显示 $0C/$0D（页组 $0642）指向的字符串，宽度限制在 32 列内；$064C/$064D 是单元的基础值，$0652 非 0 用另一套字模（实测）' },
  { fn: 0x46, name: 'API_46', summary: '与 $45 相同，但只处理单字节字符、不补空白瓦片、只写一行单元（用例 p08-display.mjs）' },
  { fn: 0x47, name: 'API_47', summary: '把字符串画成点阵瓦片写进调用者指定的扩展 RAM 地址（目的 $12/$13 与页组 $0643），规则同 $3C/$3D，返回写入的字节数（$0650:$064F）（实测）' },
  { fn: 0x48, name: 'API_48', summary: '同 $47，只处理单字节字符，规则同 $3E/$3F（实测）' },
  { fn: 0x4a, name: 'API_4A', summary: '伪随机数：子功能不为 0 步进一次 32 位移位寄存器 $0696-$0699，0 连步进 100 次（代码阅读）' },
  { fn: 0x4b, name: 'API_4B', summary: '16 位除以 8 位：$069A/$069B 除以 $069C，商回 $069A/$069B，余数回 $069C，除数 0 时 SYS_STATUS=$FF（代码阅读）' },
  { fn: 0x4c, name: 'API_4C', summary: '时、分、秒（$069A-$069C）转成 HH:MM:SS 字符放 $06AA-$06B1（代码阅读）' },
  { fn: 0x4d, name: 'API_4D', summary: '十进制字符串（$069A 起）转数值，子功能 0 完整、 1 只转 40 位整数、 2 只转定点小数（代码阅读）' },
  { fn: 0x4e, name: 'API_4E', summary: '数值转十进制字符串（$069A 起），子功能 0 浮点数、 1 、 2 为 40 位整数的两种转换方法（代码阅读）' },
  { fn: 0x4f, name: 'API_4F', summary: '浮点乘法：$069A 起与 $06A1 起的数相乘，结果在 $06A8 起（代码阅读）' },
  { fn: 0x50, name: 'API_50', summary: '浮点除法：$069A 起的数除以 $06A1 起的数，结果在 $06A8 起（代码阅读）' },
  { fn: 0x51, name: 'API_51', summary: '浮点加法：$069A 起与 $06A1 起的数相加，结果在 $06A8 起（代码阅读）' },
  { fn: 0x52, name: 'API_52', summary: '浮点减法：第二个数取反符号后调用 $51（代码阅读）' },
  { fn: 0x53, name: 'API_53', summary: '直线步进（布雷森汉姆算法）：参数块在 ZP_08 指向的 18 字节内存，从起点向终点前进指定步数（用例 p09-line-int.mjs）' },
  { fn: 0x54, name: 'API_54', summary: '3 字节整数运算：子功能 0 加、1 减、2 乘、3 除；页组 $09 入口（用例 p09-line-int.mjs）' },
  { fn: 0x59, name: 'API_59', summary: '窗口管理：窗口表在扩展 RAM 页 $FC（30 项×3 字节，$FF 为空闲）；子功能 6 初始化窗口表，子功能 0-3 新建窗口（$0646/$0647 左上角、$0648/$0649 右下角，$0652 返回窗口号，实测），子功能 4 按窗口号写回并释放（代码阅读）' },
  { fn: 0x5a, name: 'API_5A', summary: '把 $0C/$0D 指向的 $0650:$064F 个字节不解压直接 DMA 写进显存瓦片 $064C/$064D 处；页组 $0B 入口（用例 p0b-image.mjs）' },
  { fn: 0x5b, name: 'API_5B_UNPACK_TILES', summary: '解压图案流并 DMA 写进 $064C/$064D 指定的显存地址：16 字节字典加指令流，$00 结束（解码器与 ROM 里的图片头部完全吻合）' },
  { fn: 0x5c, name: 'API_5C_UNPACK_MAP', summary: '解压映射流并写到屏幕单元：$064B、$064A 为宽高，单元值加 $064C/$064D 的图块基数（解码器与 ROM 里的图片头部完全吻合）' },
  { fn: 0x5d, name: 'API_5D_WRITE_PALETTE', summary: '把 $0C/$0D 指向的 $064F 字节写进调色板寄存器区 $2040 起的 $0647 偏移处（代码阅读）' },
  { fn: 0x5e, name: 'API_5E', summary: '显示整屏图片：10 字节头加图案流、映射流、调色板，整张名称表 DMA 一次；页组 $0B 入口（用例 p0b-image.mjs）' },
  { fn: 0x5f, name: 'API_5F_SHOW_IMAGE', summary: '显示压缩图片：读 10 字节头，依次调用 $5B（图案）、$5D（调色板）、$5C（映射）；参数见页 78 的图片参数表；实测调用后图案区被改写' },
  { fn: 0x60, name: 'API_60', summary: '用与 $5C 相同的效果把一个单元值铺满矩形；页组 $0B 入口（用例 p0b-map.mjs）' },
  { fn: 0x61, name: 'API_61', summary: '解压到内存：16 字节字典加指令流（格式同 $5B）解到目的地址 $12/$13 与页组 $0643；页组 $0B 入口（用例 p0b-unpack.mjs）' },
  { fn: 0x66, name: 'API_66', summary: '卡拉 OK 歌词滚动显示（页组 $0F 的 $8700，不经入口内联表，KARAOK.EXE 调用）：先停声音、起播曲子（$65/$09），逐行解析歌词文字流并排入 NMI 条带动画队列，曲子播完后停止声音并恢复 $0630（实机验证：tools/probe-karaoke.mjs）' },
];
