; 作用：------------------------------------------------------------------------
; 名称：random-and-gamepad.asm
; 说明：伪随机数与手柄读取
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：在 ROM 里接在 kernel/interrupt-handlers.asm 之后
; ------------------------------------------------------------------------
; 伪随机数：把 $0300-$0303 当 32 位移位寄存器（位 1 异或后移入），NMI 每帧调用一次
; 调用者：NMI_HANDLER
RANDOM_STEP:
    LDA RANDOM_STATE_0
    BNE @seeded
    LDA RANDOM_STATE_1
    BNE @seeded
    LDA #$FF
    STA RANDOM_STATE_1
@seeded:
    LDA RANDOM_STATE_0
    AND #$02
    STA RANDOM_TEMP
    LDA RANDOM_STATE_1
    AND #$02
    EOR RANDOM_TEMP
    CLC
    BEQ @shift_in
    SEC
@shift_in:
    ROR RANDOM_STATE_0
    ROR RANDOM_STATE_1
    ROR RANDOM_STATE_2
    ROR RANDOM_STATE_3
    RTS
; 作用：读两个手柄：每次读 JOY1 8 次，左移存入 PAD1_RAW（位 7 为 A）；鼠标未接入时再读 JOY2 存入 PAD2_RAW
; 调用者：NMI_HANDLER
READ_PADS:
    LDA PAD_MODE
    ORA #$01
    STA JOY1
    AND #$FE
    STA JOY1
    LDX #$08
@loop:
    LDA JOY1
    ROR A
    ROL PAD1_RAW
    DEX
    BNE @loop
    LDA MOUSE_PACKET_STATE
    BNE @mouse_online
    LDA PAD_MOUSE_PORT
    AND #$FE
    STA PAD_MOUSE_PORT
    LDA PAD_MODE
    ORA #$01
    STA JOY1
    AND #$FE
    STA JOY1
    LDX #$08
@read_pad2:
    LDA JOY2_FRAME
    ROR A
    ROL PAD2_RAW
    DEX
    BNE @read_pad2
    RTS
@mouse_online:
    LDA #$00
    STA PAD2_RAW
    RTS
    RTS
