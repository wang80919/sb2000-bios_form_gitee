; ------------------------------------------------------------------------
; 名称：reset-and-boot.asm
; 说明：复位入口与开机初始化：启动外设、进入开机程序
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：占ROM 第 4-7 页，汇编地址 $C000 起，后面的文件接在它后面
; ------------------------------------------------------------------------
.org $C000
; 作用：复位入口（$C000）：关中断、清十进制标志、设栈，等 2 帧，进入 6576 模式（MODE_6576 先后写 $65、$76），系统初始化（API_18）与外设初始化（BOOT_INIT_DEVICES），然后经功能 $26 跳到页组 $78 的 $8000 处（开机程序）；功能 $26 若返回则顺序落入 BOOT_INIT_DEVICES。
; 调用者：全 ROM 没有指令或地址表引用它（只能由外部直接进入）
RESET:
    SEI
    CLD
    CLC
    LDX #$FF
    TXS
    LDX #$02
    JSR API_1B_WAIT_FRAMES
    LDA #$65
    LDX #$76
    STA MODE_6576
    STX MODE_6576
    JSR API_18
    JSR BOOT_INIT_DEVICES
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$80
    STA PROG_ENTRY_HI
    LDA #$78
    STA SYS_GROUP
    LDA #$26
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
; 作用：复位后初始化外设：鼠标复位、键盘初始化、计时器 $4034/$4035、清 $062F 位 7 并写 $4032、调功能 $13 子功能 $82 与 $81；RESET 调用
; 调用者：RESET
BOOT_INIT_DEVICES:
    JSR API_14_MOUSE_RESET
    JSR API_17_KEYBOARD_INIT
    LDA #$FF
    STA KBD_READY
    STA KBD_STATE_FLAG
    LDA #$EF
    STA TIMER_CTRL
    LDA #$3C
    STA TIMER_COUNT
    LDA #$00
    STA CLOCK_TICKS
    STA CLOCK_SECONDS
    STA CLOCK_MINUTES
    STA CLOCK_HOURS
    LDA #<HOOK_NOP
    STA TIMER_HOOK_VEC_LO
    LDA #>HOOK_NOP
    STA TIMER_HOOK_VEC_HI
    LDA IRQ_MASK_SHADOW
    AND #$7F
    STA IRQ_MASK_SHADOW
    STA IRQ_MASK
    LDA #$13
    STA SYS_FUNCTION
    LDA #$82
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$13
    STA SYS_FUNCTION
    LDA #$81
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    RTS
