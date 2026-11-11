; ------------------------------------------------------------------------
; 名称：zero-page.inc
; 说明：零页变量与指针（$00-$FF）的符号定义
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：符号定义，不占 ROM 空间
; ------------------------------------------------------------------------

SOUND_TEMP0        = $00 ; 声音引擎临时单元
SOUND_TEMP1        = $01 ; 声音引擎临时单元
SOUND_TRACK_PTR_LO = $02 ; 声音音轨读取指针（低）
SOUND_TRACK_PTR_HI = $03 ; 声音音轨读取指针（高）
SOUND_TEMP4        = $04 ; 音轨命令 $CD 位 7 为 1 时的指针表地址（低字节，高字节在 $05，窗口地址）：引擎只读不写，要由调用者先设置
IME_TABLE_PTR_LO   = $06 ; 输入法查表指针（低）
IME_TABLE_PTR_HI   = $07 ; 输入法查表指针（高）
LINE_BLOCK_PTR_LO  = $08 ; 功能 $53 的参数块指针（低）
LINE_BLOCK_PTR_HI  = $09 ; 功能 $53 的参数块指针（高）
PORT4302_ADDR_LO   = $0A ; $4302 外设传输的数据偏移（低）
PORT4302_ADDR_HI   = $0B ; $4302 外设传输的数据偏移（高）
PROG_ENTRY_LO      = $0C
PROG_ENTRY_HI      = $0D
GLYPH_ADDR_LO      = $0E ; 字模地址（低），功能 $3B 的结果；声音服务分发时也当跳转向量用
GLYPH_ADDR_HI      = $0F ; 字模地址（高）
CALL_VEC_LO        = $10
CALL_VEC_HI        = $11
DST_ADDR_LO        = $12 ; 目的地址（低），显示、图像与打印服务的输出指针
DST_ADDR_HI        = $13 ; 目的地址（高）
FAR_OFFSET_LO      = $14
FAR_OFFSET_HI      = $15
WORK_VEC_16_LO     = $16 ; 通用指针或回调向量（低）：外壳滚屏时是复制源指针，图像特效里是回调地址
WORK_VEC_16_HI     = $17 ; 通用指针或回调向量（高）
WORK_VEC_18_LO     = $18 ; 通用指针或钩子向量（低）：图像里是屏幕缓冲指针，文字显示里是空白瓦片钩子
WORK_VEC_18_HI     = $19 ; 通用指针或钩子向量（高）
WIN_COPY_PTR_LO    = $1A ; 窗口缓冲复制指针（低）
WIN_COPY_PTR_HI    = $1B ; 窗口缓冲复制指针（高）
DRAW_HOOK_LO       = $1C ; 画字钩子向量（低）
DRAW_HOOK_HI       = $1D ; 画字钩子向量（高）
NMI_HOOK5_VEC_LO   = $1E ; NMI 钩子 5 的向量（低）
NMI_HOOK5_VEC_HI   = $1F ; NMI 钩子 5 的向量（高）
NMI_HOOK4_VEC_LO   = $20 ; NMI 钩子 4 的向量（低）
NMI_HOOK4_VEC_HI   = $21 ; NMI 钩子 4 的向量（高）
PALETTE_PTR_LO     = $22 ; 调色板数据指针（低）
PALETTE_PTR_HI     = $23 ; 调色板数据指针（高）
TIMER_HOOK_VEC_LO  = $24 ; 定时器钩子的向量（低）
TIMER_HOOK_VEC_HI  = $25 ; 定时器钩子的向量（高）
IRQ3_HOOK_VEC_LO   = $26 ; IRQ 钩子 3 的向量（低）
IRQ3_HOOK_VEC_HI   = $27 ; IRQ 钩子 3 的向量（高）
IRQ1_HOOK_VEC_LO   = $28 ; IRQ 钩子 1 的向量（低）
IRQ1_HOOK_VEC_HI   = $29 ; IRQ 钩子 1 的向量（高）
IRQ2_HOOK_VEC_LO   = $2A ; IRQ 钩子 2 的向量（低）
IRQ2_HOOK_VEC_HI   = $2B ; IRQ 钩子 2 的向量（高）
IRQ4_HOOK_VEC_LO   = $2C ; IRQ 钩子 4 的向量（低）
IRQ4_HOOK_VEC_HI   = $2D ; IRQ 钩子 4 的向量（高）
KBD_HOOK_VEC_LO    = $2E ; 键盘钩子的向量（低）
KBD_HOOK_VEC_HI    = $2F ; 键盘钩子的向量（高）
MOUSE_HOOK_VEC_LO  = $30 ; 鼠标钩子的向量（低）
MOUSE_HOOK_VEC_HI  = $31 ; 鼠标钩子的向量（高）
LYRIC_PTR_LO       = $32 ; 歌词文字流指针（低）
LYRIC_PTR_HI       = $33 ; 歌词文字流指针（高）
LYRIC_BYTE         = $34 ; 歌词文字流当前取到的字节
PORT4302_FEED_PAGE = $35 ; NMI 里向 $4302 送数据的页号
PORT4302_FEED_LO   = $36 ; NMI 里向 $4302 送数据的偏移（低）
PORT4302_FEED_HI   = $37 ; NMI 里向 $4302 送数据的偏移（高）
DISK_BUF_PTR_LO    = $3A ; 软驱传输缓冲指针（低）
DISK_BUF_PTR_HI    = $3B ; 软驱传输缓冲指针（高）
DISK_BUF2_PTR_LO   = $3C ; 软驱传输缓冲的第二页指针（低）
DISK_BUF2_PTR_HI   = $3D ; 软驱传输缓冲的第二页指针（高）
DISK_USER_BUF_LO   = $3E ; 磁盘服务调用者给的缓冲地址（低）
DISK_USER_BUF_HI   = $3F ; 磁盘服务调用者给的缓冲地址（高）
FDC_COMMAND        = $40 ; 软驱控制器命令字节：$66 读扇区、$45 写扇区、$4D 格式化磁道
KEY_VEC_LO         = $41 ; 外壳按键处理向量（低）；文件系统里当作临时单元
KEY_VEC_HI         = $42 ; 外壳按键处理向量（高）
FS_PTR_LO          = $43 ; 文件系统与命令的通用指针（低），如目录项或缓冲
FS_PTR_HI          = $44 ; 文件系统与命令的通用指针（高）
FS_SRC_PTR_LO      = $45 ; 文件系统复制源指针（低）
FS_SRC_PTR_HI      = $46 ; 文件系统复制源指针（高）
FS_DST_PTR_LO      = $47 ; 文件系统复制目的指针（低）
FS_DST_PTR_HI      = $48 ; 文件系统复制目的指针（高）
LIST_PTR_LO        = $49 ; 名字列表指针（低），COPY 与文件系统用
LIST_PTR_HI        = $4A ; 名字列表指针（高）
STR_PTR_LO         = $4B
STR_PTR_HI         = $4C
DIR_ENTRY_PTR_LO   = $4D ; 当前目录项指针（低）
DIR_ENTRY_PTR_HI   = $4E ; 当前目录项指针（高）
BAT_LINE_PTR_LO    = $4F ; 批处理行指针（低）
BAT_LINE_PTR_HI    = $50 ; 批处理行指针（高）
