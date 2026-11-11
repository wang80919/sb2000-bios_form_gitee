; ------------------------------------------------------------------------
; 名称：hardware-registers.inc
; 说明：PPU、APU 与扩展硬件寄存器（$2000-$5FFF）的符号定义
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：符号定义，不占 ROM 空间
; ------------------------------------------------------------------------

PPU_CTRL        = $2000
PPU_MASK        = $2001
PPU_STATUS      = $2002
OAM_ADDR        = $2003
PPU_SCROLL      = $2005
PPU_ADDR        = $2006
PPU_DATA        = $2007
PPU_EXT_CTRL    = $2008 ; 扩展 PPU 控制寄存器（影子在 $062E），功能 $10 子功能 0-2 修改
PPU_EXT_PALETTE = $2040 ; 扩展调色板寄存器区（$2040 起 64 字节）：ROM 里只有写入指令，没有读取指令（模拟器的 PPU 实现该区可读可写）
SQ2_VOL         = $4004
SQ2_SWEEP       = $4005
SQ2_LO          = $4006
SQ2_HI          = $4007
OAM_DMA         = $4014
APU_STATUS      = $4015
JOY1            = $4016
JOY2_FRAME      = $4017
KBD_DATA        = $4020 ; 键盘串行数据（读收到的扫描码，写发出的命令字节）
KBD_OUT_PORT    = $4021 ; 键盘输出口：KBD_SEND_COMMAND、KBD_SET_LEDS 把要发给键盘的字节（命令、$ED、指示灯值）写到这里，再对 KBD_ACK 置位 1 触发发送（模拟器 MapperSB2K 的 $4021 是键盘输出口，$4022 位 0 为 1 且位 7 出现上升沿时发出）
KBD_ACK         = $4022 ; 键盘接收确认（写 $80 表示数据已处理，功能 $13 子功能 2、$82 写 $40、$80）
PAD_MOUSE_PORT  = $4023 ; 手柄数据读取；写 1 选择鼠标（功能 $14 用）
MOUSE_DATA      = $4024 ; 鼠标串口数据（读，取反后使用）
PRINTER_DATA    = $4025 ; 并口打印机数据寄存器
PERIPH_CTRL     = $4026 ; 外设控制：位 1 鼠标 RTS，位 2 打印机选通，位 6 复位语音端口；读时位 3、4、5 是打印机应答、缺纸、已选中
DAC_DATA        = $4027 ; 8 位 DAC 数据寄存器（播放 WAV 提示音用）
MODE_6576       = $4031
IRQ_MASK        = $4032 ; 中断屏蔽寄存器：写 1 屏蔽该中断源（位 7 定时器、位 6 鼠标、位 5 键盘、位 3 软驱），同时清除 IRQ_PENDING 对应位
IRQ_PENDING     = $4033 ; 中断状态：位为 1 表示该中断源已发出请求且未被屏蔽，位含义同 IRQ_MASK，写 IRQ_MASK 的对应位为 1 清除；ROM 只读不写（模拟器 MapperSB2K 的 $4033）
TIMER_CTRL      = $4034 ; 定时器控制：写 $AF 启动一次延时，$EF 为默认值
TIMER_COUNT     = $4035 ; 定时器间隔
WIN_PAGE_0      = $4040
WIN_PAGE_1      = $4041
WIN_PAGE_2      = $4042
WIN_PAGE_3      = $4043
DMA_CTRL        = $4048
DMA_SRC_HIGH    = $4049
DMA_SRC_LOW     = $404A
DMA_SRC_MID     = $404B
DMA_DST_LO      = $404C
DMA_DST_HI      = $404D
DMA_LEN_LO      = $404E
DMA_LEN_HI      = $404F
FDC_CONFIG      = $4100 ; 软驱控制器配置寄存器（写 0）
FDC_CONTROL     = $4101 ; 软驱控制寄存器：写 0 停转，写 $1C 启动
FDC_STATUS      = $4204 ; 软驱控制器主状态寄存器：位 7 可以收发，位 6 方向（1 为读出），位 5 非 DMA 数据传输中
FDC_DATA        = $4205 ; 软驱控制器数据寄存器
VRAM_BANK       = $4300
MODE_FC         = $4301
SPEECH_PORT     = $4302 ; 语音端口：读位 7 为 1 表示可收下一字节，写送出语音数据字节
EBANK_128K      = $5006
