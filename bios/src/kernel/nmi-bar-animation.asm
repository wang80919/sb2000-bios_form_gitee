; 作用：------------------------------------------------------------------------
; 名称：nmi-bar-animation.asm
; 说明：NMI 里的条带动画更新
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：在 ROM 里接在 kernel/random-and-gamepad.asm 之后
; ------------------------------------------------------------------------
; NMI_FLAGS 位 7 打开：按 BAR_QUEUE 里的命令逐段向 PPU 画条带图案（图案字节取自 BAR_PATTERN_TABLE）；队列由 API_66 的 TEXT_BUILD_NEXT_LINE 排入（卡拉 OK 歌词的条带）
; 调用者：NMI_HANDLER
NMI_BAR_ANIMATION:
    LDA SOUND_TEMPO
    CLC
    ADC BAR_TEMPO_ACC
    STA BAR_TEMPO_ACC
    BCS @tick
    LDA #$00
    RTS
@tick:
    DEC BAR_DELAY
    BEQ @run
    LDA #$00
    RTS
@run:
    LDA #$00
    STA BAR_RESULT
; 作用：条带动画：取下一条命令，命令表读完时返回
; 调用者：BAR_ANIM_NEXT、BAR_ANIM_ERASE、NMI_BAR_ANIMATION（顺序执行到这里）
BAR_ANIM_NEXT:
    LDX BAR_READ_INDEX
    CPX BAR_WRITE_INDEX
    BNE @have_command
    LDA #$02
    STA BAR_DELAY
    INC BAR_FRAME
    INC BAR_FRAME
    LDA BAR_RESULT
    RTS
@have_command:
    LDA BAR_QUEUE,X
    BPL @draw_command
    JMP @control_command
@draw_command:
    TAY
    LDA BAR_ERASE_MODE
    BEQ @draw_pattern
    JMP BAR_ANIM_ERASE
@draw_pattern:
    LDA BAR_QUEUE+3,X
    STA PPU_ADDR
    LDA BAR_QUEUE+2,X
    STA PPU_ADDR
    LDA BAR_PATTERN_TABLE,Y
    STA PPU_DATA
    STA PPU_DATA
    STA PPU_DATA
    STA PPU_DATA
    STA PPU_DATA
    STA PPU_DATA
    STA PPU_DATA
    STA PPU_DATA
    LDA BAR_QUEUE+2,X
    CLC
    ADC #$10
    PHA
    LDA BAR_QUEUE+3,X
    ADC #$00
    STA PPU_ADDR
    PLA
    STA PPU_ADDR
    LDA BAR_PATTERN_TABLE,Y
    STA PPU_DATA
    STA PPU_DATA
    STA PPU_DATA
    STA PPU_DATA
    STA PPU_DATA
    STA PPU_DATA
    STA PPU_DATA
    STA PPU_DATA
    LDA BAR_READ_INDEX
    CLC
    ADC #$04
    STA BAR_READ_INDEX
    LDA BAR_QUEUE+1,X
    BNE @set_delay
    LDY #$01
    STY BAR_RESULT
    JMP BAR_ANIM_NEXT
@set_delay:
    STA BAR_DELAY
    LDA BAR_RESULT
    RTS
@control_command:
    AND #$40
    BNE @clear_line_flag
    LDA BAR_QUEUE+1,X
    STA BAR_DELAY
    LDA BAR_READ_INDEX
    CLC
    ADC #$04
    STA BAR_READ_INDEX
    LDA BAR_RESULT
    RTS
@clear_line_flag:
    LDA #$00
    STA BAR_LINE_FLAG
    LDA BAR_READ_INDEX
    CLC
    ADC #$04
    STA BAR_READ_INDEX
    JMP BAR_ANIM_NEXT
; 作用：条带动画：BAR_ERASE_MODE 非 0 时把两行条带清成 $FF
; 调用者：BAR_ANIM_NEXT
BAR_ANIM_ERASE:
    LDA BAR_QUEUE+3,X
    STA PPU_ADDR
    LDA BAR_QUEUE+2,X
    STA PPU_ADDR
    LDA #$FF
@loop:
    STA PPU_DATA
    DEY
    BPL @loop
    LDA BAR_QUEUE+2,X
    CLC
    ADC #$20
    PHA
    LDA BAR_QUEUE+3,X
    ADC #$00
    STA PPU_ADDR
    PLA
    STA PPU_ADDR
    LDA BAR_QUEUE,X
    TAY
    LDA #$FF
@erase_row2:
    STA PPU_DATA
    DEY
    BPL @erase_row2
    LDA BAR_READ_INDEX
    CLC
    ADC #$04
    STA BAR_READ_INDEX
    LDA BAR_QUEUE+1,X
    BNE @set_delay
    LDY #$01
    STA BAR_RESULT
    JMP BAR_ANIM_NEXT
@set_delay:
    STA BAR_DELAY
    LDA BAR_RESULT
    RTS
; 作用：条带图案字节：$80 $C0 $E0 $F0 $F8 $FC $FE $FF（由窄到宽的横条）
; 引用者：BAR_ANIM_NEXT
BAR_PATTERN_TABLE:
    .byte $80,$C0,$E0,$F0,$F8,$FC,$FE,$FF
; 作用：条带动画：退一步（没有找到调用者）
; 调用者：全 ROM 没有指令或地址表引用它（只能由外部直接进入）
BAR_ANIM_STEP_BACK:
    LDA BAR_FRAME
    BNE @check_delay
    RTS
@check_delay:
    LDA BAR_DELAY
    CMP #$02
    BCS @step
    RTS
@step:
    DEC BAR_DELAY
    DEC BAR_FRAME
    RTS
    RTS
