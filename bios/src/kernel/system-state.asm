; 作用：------------------------------------------------------------------------
; 名称：system-state.asm
; 说明：DOS 状态初始化、填充空格与功能 $1F
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：在 ROM 里接在 kernel/sound-services.asm 之后
; ------------------------------------------------------------------------
; 内核启动时初始化 DOS 状态：磁盘参数默认值、扩展 RAM 页位图、当前路径与文件句柄表
; 调用者：API_18
DOS_INIT_STATE:
    JSR DOS_INIT_DISK_PARAMS
    JSR DOS_INIT_PAGE_BITMAP
    JSR DOS_INIT_PATH
    RTS
; 作用：磁盘参数默认值：ERAM $6305、$6306 写 1，$6307 写 $12（每磁道 18 扇区），清 $64EB 起的标志
; 调用者：DOS_INIT_STATE
DOS_INIT_DISK_PARAMS:
    LDA #$01
    STA SYS_DATE_DAY
    STA SYS_DATE_MONTH
    LDA #$12
    STA SYS_DATE_YEAR
    LDA #$00
    STA FS_DRIVE_STATE
    LDX #$19
    STA FS_DRIVE_STATE,X
    CLC
    RTS
; 作用：初始化扩展 RAM 页位图 PAGE_BITMAP：前 16 字节清 0，之后 14 字节写 $FF，再写 $F8 与 0
; 调用者：DOS_INIT_STATE
DOS_INIT_PAGE_BITMAP:
    LDX #$00
@loop:
    CPX #$1E
    BEQ @finish
    CPX #$10
    BCS @fill_ff
    LDA #$00
    JMP @store
@fill_ff:
    LDA #$FF
@store:
    STA PAGE_BITMAP,X
    INX
    JMP @loop
@finish:
    LDA #$F8
    STA PAGE_BITMAP,X
    INX
    LDA #$00
    STA PAGE_BITMAP,X
    CLC
    RTS
; 作用：当前驱动器写 $41（A），当前路径写成 \，$6528 取 $6500，$6530/$6531 置 2，再清空文件句柄表
; 调用者：DOS_INIT_STATE
DOS_INIT_PATH:
    LDA #$41
    STA FS_DRIVE_LETTER
    LDA #<DIR_NAME83
    STA FS_PTR_LO
    LDA #>DIR_NAME83
    STA FS_PTR_HI
    JSR FILL_SPACES_11
    LDA #$5C
    STA DIR_NAME83
    LDA FS_FAT_AREA_SECTORS
    STA FS_CWD_LBA_LO
    LDA #$02
    STA FS_FREE_HINT_LO
    LDA #$00
    STA FS_FREE_HINT_HI
    JSR DOS_INIT_HANDLES
    RTS
; 作用：把 4 个文件句柄（每个 $2C 字节）的首字节都置 $FF（空闲）
; 调用者：DOS_INIT_PATH
DOS_INIT_HANDLES:
    LDX #$00
    LDY #$00
@loop:
    LDA #$FF
    STA FILE_HANDLES,X
    TXA
    CLC
    ADC #$2C
    TAX
    INY
    CPY #$04
    BCC @loop
    RTS
; 作用：把 FS_PTR_LO/FS_PTR_HI 指向的 11 字节填成空格（8+3 文件名的空白）
; 调用者：DOS_INIT_PATH
FILL_SPACES_11:
    LDY #$00
    LDA #$20
@loop:
    STA (FS_PTR_LO),Y
    INY
    CPY #$0B
    BNE @loop
    RTS
; 作用：系统功能 $1F：取当前时间：CLOCK_SECONDS 放到 MATH_ARG_02，CLOCK_MINUTES 放到 MATH_ARG_01，CLOCK_HOURS 放到 MATH_ARG_00。
; 输出：MATH_ARG_00 至 MATH_ARG_02。
; 调用者：SYSCALL_TABLE（地址表）
API_1F:
    LDA CLOCK_SECONDS
    STA MATH_ARG_02
    LDA CLOCK_MINUTES
    STA MATH_ARG_01
    LDA CLOCK_HOURS
    STA MATH_ARG_00
    RTS
; 作用：功能 $74：$4302 外设控制：子功能 0 关闭（清 $4026 位 6、$032B 位 6）；子功能 1-9 置位或清除 $032B 的各标志位（1 开 位 6、2 开 位 1、3 关 位 1、4 开 位 2、5 关 位 2、6 开 位 0、7 关 位 0、8 开 位 3、9 关 位 3），子功能 10 以上向设备发命令字节（$76＋子功能）；外设具体是什么没有确认（SB-WIN.EXE 调用过一次子功能 0）
; 调用者：SYSCALL_TABLE（地址表）
API_74_PORT4302_CONTROL:
    LDA SYS_SUBFUNCTION
    CMP #$0E
    BCC @dispatch
    JMP WAIT_VBLANK_RETURN
@dispatch:
    ASL A
    TAX
    LDA #$4C
    STA PORT4302_WORK_0
    LDA API74_JUMP_TABLE,X
    STA PORT4302_WORK_1
    LDA API74_JUMP_TABLE+1,X
    STA PORT4302_WORK_2
    JMP PORT4302_WORK_0
; 作用：功能 $74 的子功能入口表，下标 = 子功能号 × 2；10-13 都发命令字节
; 引用者：API_74_PORT4302_CONTROL
API74_JUMP_TABLE:
    .word API74_SUB_0,API74_SUB_1,API74_SUB_2,API74_SUB_3,API74_SUB_4,API74_SUB_5,API74_SUB_6,API74_SUB_7,API74_SUB_8
    .word API74_SUB_9,API74_SEND_COMMAND,API74_SEND_COMMAND,API74_SEND_COMMAND,API74_SEND_COMMAND
; 作用：功能 $74 子功能 0：清 $4026 与 $0332 的位 6，清 $032B 的位 6
; 调用者：API74_JUMP_TABLE（地址表）
API74_SUB_0:
    LDA PERIPH_CTRL_SHADOW
    AND #$BF
    STA PERIPH_CTRL_SHADOW
    STA PERIPH_CTRL
    LDA PORT4302_FLAGS
    AND #$BF
    STA PORT4302_FLAGS
    JMP WAIT_VBLANK_RETURN
