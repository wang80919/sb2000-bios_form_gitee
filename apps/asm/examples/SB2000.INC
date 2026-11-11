; ------------------------------------------------------------------------
; 名称：sb2000.inc
; 说明：SB-DOS 程序接口的符号定义：系统调用变量、功能号、子功能号、出错码、文件打开方式、运行库入口，便于直接用名字写程序。
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-10
; 备注：ca65 程序用 .include "sb2000.inc" 引入，只含符号定义，不占空间；值不超过 $FF 的符号汇编时按零页寻址。
;       C 程序用的常量由 tools/gen-sb2000-header.mjs 从本文件生成到 include/sb2000-symbols.h，改本文件后要重新生成。
; ------------------------------------------------------------------------

; ---- 系统调用：JSR SYSCALL，功能号写 SYS_FUNCTION ----
SYSCALL             = $FFF0             ; 系统调用入口，JSR 到这里
SYS_FUNCTION        = $063E             ; 功能号，调用前写入
SYS_SUBFUNCTION     = $063F             ; 子功能号，有子功能的服务才用
SYS_STATUS          = $0640             ; 状态，调用开头清 0，子功能越界时为 $FF
SYS_PAGE            = $0641             ; 页号：功能 $29 要映射的页，或远指针的页
SYS_GROUP           = $0642             ; 页组的首页号，连续 4 页
SYS_WINDOW          = $0653             ; 窗口号 0-3，功能 $29 用

; ---- 零页：系统调用与运行库使用的单元 ----
PROG_ENTRY_LO       = $0C               ; 调用地址低字节，功能 $25、$26 用
PROG_ENTRY_HI       = $0D               ; 调用地址高字节
FAR_OFFSET_LO       = $14               ; 远指针的页内偏移低字节
FAR_OFFSET_HI       = $15               ; 远指针的页内偏移高字节
STR_PTR_LO          = $4B               ; 字符串地址低字节，LIB_PRINT_STRING 用
STR_PTR_HI          = $4C               ; 字符串地址高字节

; ---- 不经 SYSCALL、直接 JSR 的内核入口 ----
FAR_COPY_IN         = $FFEA             ; 把页组窗口地址处的数据复制到 $0700 缓冲
FAR_COPY_OUT        = $FFED             ; 把 $0700 缓冲的数据复制到页组窗口地址
FAR_READ_BYTE       = $FFF3             ; 读远指针加 Y 处的一个字节，结果在 A
FAR_WRITE_BYTE      = $FFF6             ; 把 A 写到远指针加 Y 处

; ---- 功能号（写入 SYS_FUNCTION）----
FN_VIDEO_OPTION     = $10               ; 显示选项：把值按位并入显示相关的硬件寄存器
FN_DISPLAY_MODE     = $11               ; 显示模式与字库区域登记
FN_PPU_CONTROL      = $12               ; 画面控制：开关 NMI 及其中的各项服务
FN_IRQ_MASK         = $13               ; 中断屏蔽：允许或屏蔽各中断源
FN_MOUSE_RESET      = $14               ; 鼠标复位，是否接入放在 $0633
FN_USER_FLAG        = $15               ; 把 $0636 置 1，用途未确认
FN_KEYBOARD_INIT    = $17               ; 键盘复位与识别
FN_SYSTEM_INIT      = $18               ; 系统硬件与状态初始化
FN_DISPLAY_OFF      = $19               ; 关闭 NMI，等到垂直消隐后关闭背景与精灵显示
FN_DISPLAY_ON       = $1A               ; 等到垂直消隐，开启 NMI 并恢复显示
FN_WAIT_FRAMES      = $1B               ; 等待 X 个垂直消隐周期（帧）
FN_SAVE_CONTEXT     = $1C               ; 保存上下文，类似 setjmp
FN_RESTORE_CONTEXT  = $1D               ; 恢复上下文并跳转，不返回，类似 longjmp
FN_QUERY_STATE      = $1E               ; 查询显示与系统状态，结果放在 $0652
FN_CLOCK_COPY       = $1F               ; 把系统时钟的时、分、秒复制到 $069A 起
FN_FAR_READ_NEXT    = $24               ; 按远指针读一个字节到 $0653，指针后移
FN_CALL_BANKED      = $25               ; 映射页组并调用 PROG_ENTRY 处的例程
FN_JUMP_BANKED      = $26               ; 同上，但直接跳转，不再返回
FN_MAP_GROUP        = $27               ; 把页组的 4 页映射到 $8000-$BFFF，调用返回后保持
FN_PAGE_CONVERT     = $28               ; 页号换算成 DMA 源地址的高字节
FN_MAP_WINDOW       = $29               ; 把页 SYS_PAGE 映射到窗口 SYS_WINDOW
FN_VRAM_BANK        = $2A               ; 把 SYS_GROUP 写到显存 bank 寄存器
FN_FAR_WRITE_NEXT   = $2B               ; 把 $0653 写到远指针处，指针后移
FN_ADDR_TO_FAR      = $2C               ; 把窗口地址换算成远指针
FN_SOUND            = $65               ; 声音服务
FN_INPUT            = $6B               ; 键盘输入服务
FN_MOUSE            = $6C               ; 鼠标服务
FN_GAMEPAD          = $6A               ; 手柄服务
FN_FILE             = $7B               ; 文件服务：打开、关闭、设置当前目录
FN_FILE_HANDLE      = $7C               ; 句柄服务：读写、大小、日期、属性
FN_DIR              = $7D               ; 目录服务：创建、删除、整理名称
FN_PAGE             = $7E               ; 内存页服务：分配、释放
FN_CLOCK            = $7F               ; 日期、时间与运行程序
FN_DISK             = $80               ; 磁盘服务：读写扇区、软驱停转

; ---- 子功能号（写入 SYS_SUBFUNCTION）----
; ---- 子功能：键盘输入（FN_INPUT）----
SUB_KEY_INIT        = $00               ; 复位键盘与鼠标，清空按键队列
SUB_KEY_ESC_ON      = $01               ; 之后按 ESC 会中断程序
SUB_KEY_ESC_OFF     = $02               ; 按 ESC 不再中断程序
SUB_KEY_GET_NOWAIT  = $03               ; 取一个按键，没有按键时结果为 0
SUB_KEY_GET_WAIT    = $04               ; 等到有按键再取
SUB_KEY_FLUSH       = $05               ; 清空按键队列
SUB_KEY_COUNT       = $06               ; 队列里的按键数，放在 KEY_ASCII

; ---- 子功能：画面与中断控制（FN_PPU_CONTROL、FN_IRQ_MASK）----
SUB_NMI_PAD_ON      = $85               ; FN_PPU_CONTROL：打开 NMI 中读手柄
SUB_NMI_PAD_OFF     = $05               ; FN_PPU_CONTROL：关闭 NMI 中读手柄
SUB_IRQ_MOUSE_ON    = $81               ; FN_IRQ_MASK：允许鼠标中断

; ---- 子功能：手柄（FN_GAMEPAD）----
SUB_PAD_INIT        = $00               ; 初始化手柄状态
SUB_PAD_GET         = $01               ; 取按键码，不等待，没有键时为 $FF
SUB_PAD_WAIT        = $02               ; 等到有按键再返回

; ---- 子功能：鼠标（FN_MOUSE）----
SUB_MOUSE_SET_LIMITS = $00              ; 设置坐标范围，上下限在 $0646-$0649
SUB_MOUSE_GET_POS   = $02               ; 取坐标：X 在 $0646，Y 在 $0647
SUB_MOUSE_GET_BUTTONS = $03             ; 整理按键状态到 MOUSE_BTN_BASE 起
SUB_MOUSE_SET_POS   = $04               ; 设置坐标：X 取自 $0652，Y 取自 $0653

; ---- 子功能：文件服务（FN_FILE）----
SUB_FS_OPEN         = $09               ; 按 FILE_MODE 打开 PATH_BUFFER 里的路径
SUB_FS_CLOSE        = $0A               ; 关闭 FILE_HANDLE_OFFSET 指定的句柄
SUB_FS_FIND_ENTRY   = $0B               ; 设置当前目录，相当于 CD
SUB_FS_RESET        = $13               ; 把 4 个句柄全部置为空闲
SUB_FS_NEXT_SECTOR  = $00               ; 前进到下一扇区，结果在 FS_NEXT_LBA，区域结束时 FS_REGION_END 为 1
SUB_FS_FAT_LOAD     = $01               ; 读 FS_LBA 号扇区到 DISK_BUFFER，必要时先把 FAT 装入缓存
SUB_FS_CLUSTER_LBA  = $03               ; 把 FS_CLUSTER 的简号换算成该簇第一个扇区 FS_LBA
SUB_FS_FREE_SPACE   = $06               ; 从 FS_FREE_START 起统计空闲空间，字节数累加到 ARG_069A

; ---- 子功能：句柄服务（FN_FILE_HANDLE）----
SUB_FH_CLOSE_FLUSH  = $02               ; 关闭句柄，并让软驱停转
SUB_FH_READ_AT      = $05               ; 按偏移与长度读到扩展 RAM 页
SUB_FH_WRITE_AT     = $06               ; 按偏移与长度从扩展 RAM 页写入
SUB_FH_GET_SIZE     = $0D               ; 取文件大小到 FILE_SIZE
SUB_FH_READ_FILE    = $0F               ; 把整个文件读入扩展 RAM 页
SUB_FH_WRITE_FILE   = $10               ; 把扩展 RAM 页的内容整个写入文件
SUB_FH_DELETE       = $03               ; 删除 PATH_BUFFER 里的文件
SUB_FH_RENAME       = $04               ; 把句柄的文件改名为 PATH_BUFFER 里的新名称
SUB_FH_SET_DATE     = $07               ; 设置句柄的日期（FILE_DATE）
SUB_FH_GET_DATE     = $08               ; 取得句柄的日期到 FILE_DATE
SUB_FH_SET_TIME     = $09               ; 设置句柄的时间（FILE_TIME）
SUB_FH_GET_TIME     = $0A               ; 取得句柄的时间到 FILE_TIME
SUB_FH_SET_ATTR     = $0B               ; 设置句柄的属性（FILE_ATTR）
SUB_FH_GET_ATTR     = $0C               ; 取得句柄的属性到 FILE_ATTR

; ---- 子功能：目录服务（FN_DIR）----
SUB_DIR_FORMAT_NAME = $01               ; 把当前目录名整理成 \NAME.EXT 放入 PATH_BUFFER
SUB_DIR_MAKE        = $02               ; 创建目录
SUB_DIR_DELETE      = $03               ; 删除目录，目录必须为空

; ---- 子功能：内存页服务（FN_PAGE）----
SUB_PAGE_ALLOC      = $00               ; 按 ALLOC_COUNT 分配连续页，起始页号在 ALLOC_START
SUB_PAGE_FREE       = $01               ; 释放 ALLOC_START 起的 ALLOC_COUNT 个页
SUB_PAGE_LARGEST    = $02               ; 求最长连续空闲页数，放在 ALLOC_COUNT

; ---- 子功能：日期、时间与运行程序（FN_CLOCK）----
SUB_CLOCK_EXEC      = $00               ; 运行 PATH_BUFFER 里的程序
SUB_CLOCK_SET_DATE  = $01               ; 用 FILE_DATE 设置系统日期
SUB_CLOCK_GET_DATE  = $02               ; 取系统日期到 FILE_DATE
SUB_CLOCK_SET_TIME  = $03               ; 用 FILE_TIME 设置系统时间
SUB_CLOCK_GET_TIME  = $04               ; 取系统时间到 FILE_TIME

; ---- 子功能：磁盘服务（FN_DISK）----
SUB_DISK_READ       = $04               ; 按 DISK_ 参数连续读扇区
SUB_DISK_WRITE      = $05               ; 按 DISK_ 参数连续写扇区
SUB_DISK_STOP       = $07               ; 软驱停转，每次文件操作之后都要调用
SUB_DISK_INIT       = $00               ; 启动软驱、复位到 0 磁道，读出状态后停转
SUB_DISK_FORMAT     = $01               ; 格式化一个磁道
SUB_DISK_READ_ONE   = $02               ; 读一个扇区到 DISK_BUFFER
SUB_DISK_WRITE_ONE  = $03               ; 把 DISK_BUFFER 写到一个扇区
SUB_DISK_START      = $06               ; 启动软驱
SUB_DISK_SCAN       = $08               ; 逐个读一条磁道的 18 个扇区，读不出的在位图里置位

; ---- 子功能：声音服务（FN_SOUND）----
SUB_SOUND_PLAY_WAV  = $0C               ; 播放内存里的 WAV，播完才返回

; ---- 变量：出错码、命令行与显示（扩展 RAM）----
DOS_ERROR           = $6300             ; 出错码，0 为成功，每次调用开头清 0
LIB_GROUP           = $6308             ; 运行库显示字符串所在的页组，高 6 位有效
CURSOR_COL          = $630C             ; 光标列，从 1 起，每行 32 列
CURSOR_ROW          = $630D             ; 光标所在的显示行
GLYPH_ROW           = $630E             ; 字形缓冲行，由运行库维护，程序不要改
CMD_TAIL            = $6364             ; 命令行参数的起点，大写、0 结尾，首字节是空格
FONT_SIZE           = $6428             ; 字号

; ---- 变量：文件与目录（扩展 RAM）----
DIR_NAME83          = $651D             ; 当前目录的 11 字节名称，不要随便改写
PATH_BUFFER         = $6543             ; 路径，0 结尾的 ASCII，可带 A: 与 \
FILE_MODE           = $6560             ; 打开方式，0-5
FILE_HANDLE_OFFSET  = $6561             ; 当前句柄在句柄表里的偏移
FILE_OFFSET_0       = $6565             ; 文件内偏移，3 字节，低字节在前
FILE_OFFSET_1       = $6566             ; 文件内偏移第 2 字节
FILE_OFFSET_2       = $6567             ; 文件内偏移第 3 字节
FILE_SIZE_0         = $6568             ; 文件大小或读写长度，3 字节，低字节在前
FILE_SIZE_1         = $6569             ; 文件大小或读写长度第 2 字节
FILE_SIZE_2         = $656A             ; 文件大小或读写长度第 3 字节
FILE_START_PAGE     = $656B             ; 读写整个文件或一段数据时的扩展 RAM 起始页号
FILE_DATE_LO        = $656E             ; 日期低字节，FAT 格式：年（自 1980）、月、日
FILE_DATE_HI        = $656F             ; 日期高字节
FILE_TIME_LO        = $6570             ; 时间低字节，FAT 格式：时、分、秒的一半
FILE_TIME_HI        = $6571             ; 时间高字节
FILE_ATTR           = $6572             ; 属性：位 0 只读，位 3 卷标，位 4 目录，位 5 存档

; ---- 变量：文件系统内部（扩展 RAM）----
DISK_BUFFER         = $6000             ; 扇区缓冲，512 字节
FS_CURRENT_DIR_LBA  = $6528             ; 当前目录的第一个扇区号，16 位，根目录为 19
FS_LBA              = $652E             ; 要读写的扇区号，16 位，低字节在前
FS_FREE_START       = $6530             ; 统计空闲空间的起始簇号，16 位
FS_CLUSTER          = $6536             ; 簇号，16 位
FILE_HANDLES        = $643B             ; 句柄表起点，共 4 项，每项 $2C 字节
FH_CLUSTER_OFFSET   = $15               ; 句柄表项里起始簇号的偏移，16 位
FH_SIZE_OFFSET      = $0E               ; 句柄表项里文件大小的偏移，3 字节，低字节在前
FS_NEXT_LBA         = $65A9             ; 前进到下一扇区的结果，16 位
FS_REGION_END       = $65C5             ; 下一扇区越出区域或簇链到尾时为 1
ARG_069A            = $069A             ; 数学与空闲空间统计的参数区起点

; ---- 变量：内存页分配（扩展 RAM）----
ALLOC_COUNT         = $65A6             ; 要分配或释放的页数
ALLOC_START         = $65A7             ; 分配得到的起始页号，或要释放的起始页号

; ---- 变量：磁盘参数（扩展 RAM）----
DISK_HEAD           = $6200             ; 面，0 或 1
DISK_SECTOR         = $6201             ; 起始扇区，1-18
DISK_TRACK          = $6202             ; 磁道，0-79
DISK_PAGE           = $6203             ; 缓冲所在的扩展 RAM 页号
DISK_PAGE_SECTOR    = $6204             ; 缓冲从页内第几个 512 字节起，0-7
DISK_COUNT_LO       = $6205             ; 扇区数低字节
DISK_COUNT_HI       = $6206             ; 扇区数高字节
DISK_MODE           = $6207             ; 方式：$80 出错时立即返回
DISK_STATUS         = $6208             ; 结果状态，0 为成功
DISK_BAD_MAP        = $6237             ; 扫描磁道的坏扇区位图，3 字节，位 7 起对应扇区 1-8、9-16、17-18

; ---- 变量：键盘、手柄、鼠标（内核 RAM）----
KEY_ASCII           = $034B             ; 取到的按键的 ASCII 码，没有字符的键为 0
KEY_SCAN            = $034C             ; 取到的按键的扫描码
PAD_KEY             = $034D             ; 手柄按键码，$FF 为没有键
PAD1_BITS           = $034E             ; 1 号手柄的原始状态，位 7 是 A，位 0 是右
PAD2_BITS           = $034F             ; 2 号手柄的原始状态
MOUSE_X             = $0354             ; 鼠标光标的 X 坐标
MOUSE_Y             = $0355             ; 鼠标光标的 Y 坐标
MOUSE_PARAM         = $035E             ; 鼠标双击的间隔参数，默认 $0A
KBD_FLAGS           = $0344             ; 键盘修饰键状态：位 0 右 Shift，1 左 Shift，2 Ctrl，3 Alt，4 ScrollLock，5 NumLock，6 CapsLock，7 Insert
KBD_LEDS            = $0348             ; 键盘指示灯状态：位 0 ScrollLock，1 NumLock，2 CapsLock
KBD_SELF_TEST_RESULT = $0635            ; 键盘复位与识别（FN_KEYBOARD_INIT）的结果，1 为通过
MOUSE_BTN_BASE      = $0360             ; 鼠标按键状态的起点，共 8 个字节
MOUSE_PRESENT       = $0633             ; 鼠标复位后非 0 表示检测到鼠标，0 为没有（BIOS 里它是鼠标数据包的字节序号）

; ---- 常量：NMI 服务号、中断源号（传给 FN_PPU_CONTROL、FN_IRQ_MASK 的子功能）----
NMI_SERVICE_BAR_ANIM = $01              ; NMI 服务：条带动画（卡拉 OK 歌词滚动）
NMI_SERVICE_SOUND   = $02               ; NMI 服务：声音引擎每帧更新
NMI_SERVICE_HOOK5   = $03               ; NMI 服务：调用登记的钩子 5
NMI_SERVICE_HOOK4   = $04               ; NMI 服务：调用登记的钩子 4
NMI_SERVICE_PAD     = $05               ; NMI 服务：读手柄
NMI_SERVICE_PALETTE = $06               ; NMI 服务：把 $0700 缓冲上传到调色板
IRQ_SOURCE_TIMER    = $00               ; 中断源：定时器
IRQ_SOURCE_MOUSE    = $01               ; 中断源：鼠标
IRQ_SOURCE_KEYBOARD = $02               ; 中断源：键盘
IRQ_SOURCE_IRQ4     = $03               ; 中断源：中断 4（只有钩子）
IRQ_SOURCE_FLOPPY   = $04               ; 中断源：软驱
IRQ_SOURCE_IRQ2     = $05               ; 中断源：中断 2（只有钩子）
IRQ_SOURCE_IRQ1     = $06               ; 中断源：中断 1（只有钩子）

; ---- 程序文件头里由 DOS 写入的单元 ----
PROGRAM_START_PAGE  = $8005             ; 程序装入的起始扩展 RAM 页号，也就是程序所在页组的首页
PROGRAM_PAGE_COUNT  = $8006             ; 程序占用的页数

; ---- 变量：显示、中断与窗口的影子（内核 RAM）----
PPU_CTRL_SHADOW     = $062A             ; PPU 控制寄存器（$2000）的影子，位 7 是 NMI 开关
PPU_MASK_SHADOW     = $062B             ; PPU 显示寄存器（$2001）的影子，位 3 背景，位 4 精灵
PPU_EXT_CTRL_SHADOW = $062E             ; 扩展控制寄存器（$2008）的影子
IRQ_MASK_SHADOW     = $062F             ; 中断屏蔽（$4032）的影子，位为 1 表示屏蔽
NMI_FLAGS           = $0630             ; NMI 里各项服务的开关
GLYPH_MODE          = $0638             ; 字形模式，高 2 位是显示模式
WINDOW_SAVE_0       = $0639             ; 窗口 0（$8000）页号的影子
WINDOW_SAVE_1       = $063A             ; 窗口 1（$9000）页号的影子
WINDOW_SAVE_2       = $063B             ; 窗口 2（$A000）页号的影子
WINDOW_SAVE_3       = $063C             ; 窗口 3（$B000）页号的影子
COPY_BUFFER         = $0700             ; 跨页复制用的中转缓冲
NMI_HOOK5_VEC_LO    = $1E               ; NMI 钩子 5 的地址（低），地址在零页，钩子由 NMI_FLAGS 位 5 打开
NMI_HOOK4_VEC_LO    = $20               ; NMI 钩子 4 的地址（低），钩子由 NMI_FLAGS 位 4 打开
TIMER_HOOK_VEC_LO   = $24               ; 定时器钩子的地址（低）
IRQ3_HOOK_VEC_LO    = $26               ; 中断 3 钩子的地址（低），系统不会调用它
IRQ1_HOOK_VEC_LO    = $28               ; 中断 1 钩子的地址（低）
IRQ2_HOOK_VEC_LO    = $2A               ; 中断 2 钩子的地址（低）
IRQ4_HOOK_VEC_LO    = $2C               ; 中断 4 钩子的地址（低）
KBD_HOOK_VEC_LO     = $2E               ; 键盘钩子的地址（低）
MOUSE_HOOK_VEC_LO   = $30               ; 鼠标钩子的地址（低）
NMI_HOOK5_PAGE      = $0306             ; NMI 钩子 5 所在页组的首页号
NMI_HOOK4_PAGE      = $0307             ; NMI 钩子 4 所在页组的首页号
KBD_HOOK_PAGE       = $068E             ; 键盘钩子所在页组的首页号
MOUSE_HOOK_PAGE     = $068F             ; 鼠标钩子所在页组的首页号
TIMER_HOOK_PAGE     = $0690             ; 定时器钩子所在页组的首页号
IRQ3_HOOK_PAGE      = $0691             ; 中断 3 钩子所在页组的首页号
IRQ1_HOOK_PAGE      = $0692             ; 中断 1 钩子所在页组的首页号
IRQ2_HOOK_PAGE      = $0693             ; 中断 2 钩子所在页组的首页号
IRQ4_HOOK_PAGE      = $0694             ; 中断 4 钩子所在页组的首页号
NMI_COUNTER_UP      = $0304             ; 每次 NMI 加 1 的计数
MOUSE_ABSENT        = $0634             ; 鼠标不可用标志：允许鼠标中断后，在线清 0，否则 $FF
ESC_BREAK           = $063D             ; 按 ESC 中断开关：非 0 时按 ESC 会恢复上下文栈顶的恢复点
CONTEXT_COUNT       = $0655             ; 上下文栈里的恢复点个数减 1，空栈为 $FF
CLOCK_SECONDS       = $068A             ; 软件时钟：秒
CLOCK_MINUTES       = $068B             ; 软件时钟：分
CLOCK_HOURS         = $068C             ; 软件时钟：时
CLOCK_MIDNIGHT_FLAG = $068D             ; 软件时钟过午夜标志：设置日期时清 0，非 0 时取日期要先加 1 天

; ---- 变量：系统调用的参数单元，含义随服务而定（内核 RAM）----
PARAM_0646          = $0646             ; 鼠标 X 下限，或显存地址高字节
PARAM_0647          = $0647             ; 鼠标 Y 下限，或显存地址低字节
PARAM_0648          = $0648             ; 鼠标 X 上限，或屏幕缓冲的列
PARAM_0649          = $0649             ; 鼠标 Y 上限，或屏幕缓冲的行
PARAM_064F          = $064F             ; 个数、长度或字节数，含义随服务而定
PARAM_0652          = $0652             ; 通用参数，多数服务从这里取输入
PARAM_0653          = $0653             ; 通用参数或返回值，如读到的字节

; ---- 文件打开方式（FILE_MODE）----
MODE_OPEN           = $00               ; 打开已有文件
MODE_CREATE         = $01               ; 创建文件，已存在则覆盖
MODE_UPDATE         = $02               ; 打开已有文件，可按偏移写，关闭时写回目录项
MODE_DELETE_ENTRY   = $03               ; 删除文件：标为已删除并释放簇链
MODE_ENTRY          = $04               ; 取得目录项，只对根目录与子目录成功
MODE_MAKE_DIR       = $05               ; 创建目录项

; ---- 出错码（DOS_ERROR）----
ERR_NONE            = $00               ; 无错
ERR_BAD_FUNCTION    = $01               ; 无效的功能调用号
ERR_FILE_NOT_FOUND  = $02               ; 文件未找到
ERR_PATH_NOT_FOUND  = $03               ; 路径未找到
ERR_TOO_MANY_FILES  = $04               ; 打开的文件过多，4 个句柄都在用
ERR_ACCESS_DENIED   = $05               ; 访问被拒绝，如写只读文件
ERR_NO_MEMORY       = $08               ; 无足够内存，没有足够的连续空闲页
ERR_BAD_ADDRESS     = $09               ; 无效的内存地址，页号不合法
ERR_NOT_READY       = $15               ; 驱动器未准备好
ERR_BAD_DISK_PARAM  = $10               ; 磁盘操作参数错，面、磁道超出范围
ERR_WRITE_PROTECT   = $13               ; 磁盘写保护，写操作失败
ERR_BAD_POSITION    = $14               ; 文件读写位置错误
ERR_CRC             = $17               ; 循环冗余校验错
ERR_NO_DISK         = $18               ; 驱动器中没有磁盘
ERR_UNKNOWN_DISK    = $1A               ; 未知磁盘类型
ERR_FILE_EXISTS     = $20               ; 文件已经存在
ERR_BAD_PARAMETER   = $25               ; 参数无效
ERR_DIR_EXISTS      = $26               ; 目录已经存在
ERR_BAD_NAME        = $27               ; 文件名或目录名错误
ERR_BAD_OPEN_MODE   = $28               ; 文件打开方式错误
ERR_DIR_NOT_EMPTY   = $29               ; 企图删除非空目录
ERR_DIR_TOO_DEEP    = $2A               ; 目录嵌套层数过多
ERR_NO_SPACE        = $2C               ; 磁盘空间不够
ERR_DUPLICATE_NAME  = $2D               ; 文件名重复，如要建的目录与文件同名
ERR_NOT_OPEN        = $2E               ; 文件未打开

; ---- 运行库入口（ROM 页组 0，经 FN_CALL_BANKED 且 SYS_GROUP=0 调用）----
LIB_PRINT_HEX       = $8047             ; 显示 A 的十六进制，经功能 $25 调用时 A 传不进去，不能用
LIB_BEEP            = $802D             ; 发一声提示音
LIB_CURSOR_LEFT     = $8081             ; 光标左移一列，到行首移到上一行末尾
LIB_CURSOR_UP       = $808F             ; 光标移到上一行末尾，已在第一行时不动
LIB_CURSOR_RIGHT    = $80CF             ; 光标右移一列，到第 32 列换行
LIB_NEWLINE         = $80E2             ; 换行，行满滚屏；调用前 CURSOR_COL 要置 1
LIB_GET_KEY         = $81F4             ; 等待按键，结果在 KEY_ASCII、KEY_SCAN
LIB_PRINT_MESSAGE   = $8202             ; 显示消息号为 LIB_GROUP 值的内置消息
LIB_PRINT_STRING    = $8262             ; 在光标处显示 STR_PTR 指向的字符串，不移动光标
FN_RANDOM           = $4A               ; 伪随机数：32 位移位寄存器 RANDOM_STATE
FN_DIV16            = $4B               ; 16 位除以 8 位
FN_TIME_TEXT        = $4C               ; 时、分、秒转成 HH:MM:SS 文字
FN_DECIMAL_PARSE    = $4D               ; 十进制文字转数值
FN_DECIMAL_FORMAT   = $4E               ; 数值转十进制文字
FN_FLOAT_MUL        = $4F               ; 浮点乘
FN_FLOAT_DIV        = $50               ; 浮点除
FN_FLOAT_ADD        = $51               ; 浮点加
FN_FLOAT_SUB        = $52               ; 浮点减
FN_LINE_STEP        = $53               ; 直线步进（布雷森汉姆算法）
FN_INT24            = $54               ; 3 字节整数的加、减、乘、除
RANDOM_STATE        = $0696             ; 伪随机数的 32 位寄存器，低字节在前
ARG_069E            = $069E             ; 第二个 3 字节整数的起点
ARG_06A1            = $06A1             ; 第二个浮点数的起点
ARG_06A8            = $06A8             ; 浮点运算结果的起点
ARG_06AA            = $06AA             ; 40 位整数结果与时间文字的起点
ARG_06AF            = $06AF             ; 40 位整数转文字的输入起点
LINE_BLOCK_PTR      = $0008             ; 零页：直线步进参数块的指针，低字节在前
LINE_BLOCK_BUFFER   = $7EE0             ; 扩展 RAM 高端的 18 字节，放直线步进的参数块：功能 $53 换页后程序窗口里的内容不可见，参数块必须放在任何映射下都可见的地方
SUB_SOUND_PLAY      = $00               ; 载入并播放曲子，先关声音更新，播完前再打开
SUB_SOUND_STOP      = $02               ; 停止播放
SUB_SOUND_STATUS    = $03               ; 把 SOUND_STATUS 取到 PARAM_0653
SUB_SOUND_TRANSPOSE = $04               ; 把 PARAM_0653 加到 4 个声道的移调值
SUB_SOUND_TEMPO     = $05               ; 把 PARAM_0653 加到拍速
SUB_SOUND_WAV       = $0C               ; 播放内存里的 WAV
SUB_SOUND_WAV_LOOP  = $0D               ; 重复播放 WAV，次数在 PARAM_0652
SUB_SOUND_EFFECT    = $0B               ; 先复位再按曲目号播放音效曲子
SOUND_STATUS        = $03A1             ; 播放状态：停止后为 $FF
SOUND_TRANSPOSE     = $0447             ; 4 个声道的移调值，连续 4 个字节
SOUND_TEMPO         = $03D4             ; 拍速
FN_SPEECH_FLAGS     = $74               ; 语音控制标志的开关
FN_SPEECH_SEND      = $75               ; 发送语音数据
SPEECH_FLAGS        = $032B             ; 语音控制标志，位 0 为 0 同步发送、为 1 交给 NMI 发送
PARAM_064A          = $064A             ; 显示与语音服务的参数：字符码高字节、行距、词条序号高字节等
PARAM_064B          = $064B             ; 显示与语音服务的参数：字符码低字节、宽、词条序号低字节等
PARAM_064E          = $064E             ; 打印机发送变换模式等参数
FN_PRINTER          = $76               ; 打印机服务，$76-$7A 是同一个入口，只看子功能
FN_IME              = $6D               ; 中文输入法服务
PRN_PAGE_LEFT       = $04BC             ; 本页剩余走纸量，16 位，高字节在前（单位 1/216 英寸）
PRN_BYTE            = $04A4             ; 子功能 7 要发送的字节
PRN_POS_LO          = $04B3             ; 子功能 5、6 的位置参数低字节
PRN_POS_HI          = $04B4             ; 子功能 5、6 的位置参数高字节
IME_STATE           = $6900             ; 输入法状态区起点：低 4 位是输入法序号
IME_ALLOW           = $6901             ; 输入法允许位
IME_FLAGS           = $6902             ; 输入法标志位：位 1 全角、位 2 暂停、位 4 自定义输入法可选
IME_KEY_RESULT      = $6922             ; 处理一个键的结果：0 无输出、2 输出汉字内码、$82 按键原样传回
IME_KEY_OUT         = $6923             ; 输入得到的字符或汉字，从这里起
IME_INPUT_COUNT     = $6904             ; 已输入的字符个数
IME_INPUT_BUFFER    = $6905             ; 输入缓冲，最多 6 个字符
PARAM_064C          = $064C             ; 显示参数：单元值或显示地址低字节
PARAM_064D          = $064D             ; 显示参数：单元值或显示地址高字节
PARAM_0650          = $0650             ; 单元个数或长度的高字节
PARAM_0651          = $0651             ; 刷新方式或等待帧数
PARAM_0654          = $0654             ; 调色板号
SYS_GROUP_2         = $0643             ; 第二个页组：解压到内存的目的页组、文字缓冲的目的页组
DEST_ADDR_LO        = $0012             ; 零页：目的窗口地址低字节
DEST_ADDR_HI        = $0013             ; 零页：目的窗口地址高字节
GLYPH_PAGE          = $0644             ; 字模所在的页，功能 $3B 的结果
GLYPH_OFFSET_LO     = $000E             ; 零页：字模页内偏移低字节，功能 $3B 的结果
GLYPH_OFFSET_HI     = $000F             ; 零页：字模页内偏移高字节（高 4 位是窗口位），功能 $3B 的结果
DISPLAY_MODE        = $0638             ; 显示模式影子：低 3 位是字模形式，位 7 为 1 取 8×16 字模
FN_DMA_NAMETABLE    = $30               ; 名称表 DMA 与屏幕缓冲服务
FN_VRAM_FILL        = $32               ; 用一个字节填充显存的一段
FN_VRAM_LOAD        = $33               ; 把扩展 RAM 的一段 DMA 到显存
FN_GLYPH_ADDR       = $3B               ; 查字模的页与地址
FN_PUT_STRING_C     = $3C               ; 画二平面字符串到显存瓦片（汉字与西文）
FN_PUT_STRING_D     = $3D               ; 画四平面字符串到显存瓦片（汉字与西文）
FN_PUT_ASCII_C      = $3E               ; 画二平面字符串到显存瓦片（只处理单字节字符）
FN_PUT_ASCII_D      = $3F               ; 画四平面字符串到显存瓦片（只处理单字节字符）
FN_CELLS            = $40               ; 把单元写进名称表缓冲并刷新
FN_TEXT_FIELD       = $45               ; 在屏幕上显示一行文字（汉字与西文）
FN_TEXT_FIELD_ASCII = $46               ; 在屏幕上显示一行文字（只处理单字节字符）
FN_TEXT_BUFFER      = $47               ; 把字符串画成点阵瓦片写进内存（汉字与西文）
FN_TEXT_BUFFER_ASCII = $48              ; 把字符串画成点阵瓦片写进内存（只处理单字节字符）
FN_WINDOW           = $59               ; 窗口管理：保存与还原屏幕矩形
FN_IMAGE_RAW        = $5A               ; 不解压直接把一段图案 DMA 进显存
FN_UNPACK_TILES     = $5B               ; 解压图案流进显存
FN_UNPACK_MAP       = $5C               ; 解压映射流并写到屏幕
FN_PALETTE          = $5D               ; 写调色板
FN_IMAGE_FULL       = $5E               ; 显示整屏图片
FN_IMAGE_SHOW       = $5F               ; 显示压缩图片
FN_FILL_RECT        = $60               ; 用一个单元值按效果铺满矩形
FN_UNPACK_MEMORY    = $61               ; 解压到内存
