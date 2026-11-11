; 作用：------------------------------------------------------------------------
; 名称：mouse-driver.asm
; 说明：鼠标：中断处理与位移累加
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：在 ROM 里接在 kernel/speech-port-feed.asm 之后
; ------------------------------------------------------------------------
; 鼠标串口中断（$4033 位 6）：读 $4024 取反存 $0358，按 MOUSE_PACKET_STATE 依次收 3 字节包（第 1 字节位 6 为 1 且带按键位和 DX、DY 高位，第 2、3 字节低 6 位补全 DX、DY），再把坐标限制在 MOUSE_X/Y 的最小最大值内并更新左右键状态
; 调用者：IRQ_HANDLER
MOUSE_IRQ_HANDLER:
    LDA MOUSE_DATA
    EOR #$FF
    STA MOUSE_RAW_BYTE
    LDA MOUSE_ABSENT
    BNE @have_packet
    LDA MOUSE_RAW_BYTE
    AND #$40
    BNE @first_byte
    RTS
@first_byte:
    LDA #$01
    STA MOUSE_PACKET_STATE
    STA MOUSE_ABSENT
@have_packet:
    LDA MOUSE_PACKET_STATE
    BNE @check_state1
    JMP MOUSE_NEW_DATA
@check_state1:
    CMP #$01
    BNE @check_state2
    LDA MOUSE_RAW_BYTE
    AND #$40
    BNE @byte1
    LDA #$00
    STA MOUSE_ABSENT
    RTS
@byte1:
    LDA MOUSE_RAW_BYTE
    AND #$30
    STA MOUSE_BUTTON_BITS
    CLC
    LDA MOUSE_RAW_BYTE
    AND #$0C
    ASL A
    ASL A
    ASL A
    ASL A
    STA MOUSE_DY
    CLC
    LDA MOUSE_RAW_BYTE
    AND #$03
    ROR A
    ROR A
    ROR A
    STA MOUSE_DX
    INC MOUSE_PACKET_STATE
    BEQ @check_state2
    JMP MOUSE_IRQ_RETURN
@check_state2:
    CMP #$02
    BNE @byte3_check
    LDA MOUSE_RAW_BYTE
    AND #$40
    BEQ @byte2
    LDA #$00
    STA MOUSE_ABSENT
    RTS
@byte2:
    LDA MOUSE_RAW_BYTE
    AND #$3F
    ORA MOUSE_DX
    STA MOUSE_DX
    INC MOUSE_PACKET_STATE
    BEQ @byte3_check
    JMP MOUSE_IRQ_RETURN
@byte3_check:
    LDA MOUSE_RAW_BYTE
    AND #$40
    BEQ @byte3
    LDA #$00
    STA MOUSE_ABSENT
    RTS
@byte3:
    LDA MOUSE_RAW_BYTE
    AND #$3F
    ORA MOUSE_DY
    STA MOUSE_DY
    CLC
    LDA MOUSE_DY
    BMI @y_negative
    ADC MOUSE_Y
    CMP MOUSE_Y
    BCC @y_clamp_max
    CMP MOUSE_Y_MAX
    BCS @y_clamp_max
    JMP @store_y
@y_clamp_max:
    LDA MOUSE_Y_MAX
@store_y:
    STA MOUSE_Y
    JMP @x_axis
@y_negative:
    ADC MOUSE_Y
    CMP MOUSE_Y
    BCS @y_clamp_min
    CMP MOUSE_Y_MIN
    BCC @y_clamp_min
    JMP @store_y2
@y_clamp_min:
    LDA MOUSE_Y_MIN
@store_y2:
    STA MOUSE_Y
@x_axis:
    CLC
    LDA MOUSE_DX
    BMI @x_negative
    ADC MOUSE_X
    CMP MOUSE_X
    BCC @x_clamp_max
    CMP MOUSE_X_MAX
    BCS @x_clamp_max
    JMP @store_x
@x_clamp_max:
    LDA MOUSE_X_MAX
@store_x:
    STA MOUSE_X
    JMP MOUSE_BTN1_UPDATE
@x_negative:
    ADC MOUSE_X
    CMP MOUSE_X
    BCS @x_clamp_min
    CMP MOUSE_X_MIN
    BCC @x_clamp_min
    JMP @store_x2
@x_clamp_min:
    LDA MOUSE_X_MIN
@store_x2:
    STA MOUSE_X
; 作用：鼠标左键（$0356 位 5）状态机：按 DX、DY、$035F 计时与 MOUSE_PARAM 更新 $0369 的各状态位（按下、点击、双击、拖动，位的含义见手册 5.8 节）
; 调用者：MOUSE_IRQ_HANDLER
MOUSE_BTN1_UPDATE:
    LDA #$01
    STA MOUSE_PACKET_STATE
    LDA MOUSE_BUTTON_BITS
    AND #$20
    BEQ @button_up
    LDA MOUSE_BTN_TEMP
    AND #$FE
    STA MOUSE_BTN_TEMP
    LDA MOUSE_BTN1_FLAGS
    ORA #$48
    STA MOUSE_BTN1_FLAGS
    LDA MOUSE_BTN1_FLAGS
    AND #$DF
    STA MOUSE_BTN1_FLAGS
    LDA MOUSE_DX
    BEQ @down_check_dy
    LDA MOUSE_BTN1_FLAGS
    ORA #$80
    STA MOUSE_BTN1_FLAGS
    JMP MOUSE_BTN2_UPDATE
@down_check_dy:
    LDA MOUSE_DY
    BEQ @down_stationary
    LDA MOUSE_BTN1_FLAGS
    ORA #$80
    STA MOUSE_BTN1_FLAGS
    JMP MOUSE_BTN2_UPDATE
@down_stationary:
    LDA MOUSE_BTN1_FLAGS
    AND #$04
    BNE @down_held
    LDA MOUSE_BTN1_FLAGS
    AND #$FA
    STA MOUSE_BTN1_FLAGS
    LDA #$00
    STA MOUSE_BTN1_TIMER
    JMP MOUSE_BTN2_UPDATE
@down_held:
    JMP @held_check_dx
@button_up:
    LDA MOUSE_BTN_TEMP
    AND #$FE
    STA MOUSE_BTN_TEMP
    LDA MOUSE_BTN1_FLAGS
    AND #$8B
    STA MOUSE_BTN1_FLAGS
    AND #$08
    BEQ @up_done
    LDA MOUSE_BTN_TEMP
    ORA #$01
    STA MOUSE_BTN_TEMP
    LDA MOUSE_BTN1_FLAGS
    AND #$80
    BEQ @up_check_double
    LDA MOUSE_BTN1_FLAGS
    AND #$73
    STA MOUSE_BTN1_FLAGS
    JMP MOUSE_BTN2_UPDATE
@up_check_double:
    LDA MOUSE_BTN1_FLAGS
    AND #$02
    BEQ @up_single_click
    LDA MOUSE_BTN1_FLAGS
    AND #$F1
    STA MOUSE_BTN1_FLAGS
    JMP MOUSE_BTN2_UPDATE
@up_single_click:
    LDA MOUSE_BTN1_FLAGS
    AND #$F4
    ORA #$24
    STA MOUSE_BTN1_FLAGS
@up_done:
    JMP MOUSE_BTN2_UPDATE
@held_check_dx:
    LDA MOUSE_DX
    BEQ @held_check_dy
    LDA MOUSE_BTN1_FLAGS
    AND #$EB
    STA MOUSE_BTN1_FLAGS
    LDA #$00
    STA MOUSE_BTN1_TIMER
    LDA MOUSE_BTN1_FLAGS
    AND #$FE
    STA MOUSE_BTN1_FLAGS
    JMP MOUSE_BTN2_UPDATE
@held_check_dy:
    LDA MOUSE_DY
    BEQ @held_stationary
    LDA MOUSE_BTN1_FLAGS
    AND #$EB
    STA MOUSE_BTN1_FLAGS
    LDA #$00
    STA MOUSE_BTN1_TIMER
    LDA MOUSE_BTN1_FLAGS
    AND #$FE
    STA MOUSE_BTN1_FLAGS
    JMP MOUSE_BTN2_UPDATE
@held_stationary:
    LDA MOUSE_BTN1_FLAGS
    AND #$FB
    STA MOUSE_BTN1_FLAGS
    LDA MOUSE_BTN1_FLAGS
    AND #$01
    BEQ @held_check_timer
    LDA MOUSE_BTN1_FLAGS
    AND #$EE
    STA MOUSE_BTN1_FLAGS
    LDA #$00
    STA MOUSE_BTN1_TIMER
    LDA MOUSE_BTN1_FLAGS
    AND #$FE
    STA MOUSE_BTN1_FLAGS
    JMP MOUSE_BTN2_UPDATE
@held_check_timer:
    LDA MOUSE_BTN1_TIMER
    CMP MOUSE_PARAM
    BCC @held_set_flags
    LDA MOUSE_BTN1_FLAGS
    AND #$EF
    STA MOUSE_BTN1_FLAGS
    LDA #$00
    STA MOUSE_BTN1_TIMER
    LDA MOUSE_BTN1_FLAGS
    AND #$FE
    STA MOUSE_BTN1_FLAGS
    JMP MOUSE_BTN2_UPDATE
@held_set_flags:
    LDA MOUSE_BTN1_FLAGS
    ORA #$12
    STA MOUSE_BTN1_FLAGS
; 作用：鼠标右键（$0356 位 4）状态机：同 MOUSE_BTN1_UPDATE，状态放 $036A、计时 $0368
; 调用者：MOUSE_BTN1_UPDATE
MOUSE_BTN2_UPDATE:
    LDA MOUSE_BUTTON_BITS
    AND #$10
    BEQ @button_up
    LDA MOUSE_BTN_TEMP
    AND #$FD
    STA MOUSE_BTN_TEMP
    LDA MOUSE_BTN2_FLAGS
    ORA #$48
    AND #$DF
    STA MOUSE_BTN2_FLAGS
    LDA MOUSE_DX
    BEQ @down_check_dy
    LDA MOUSE_BTN2_FLAGS
    ORA #$80
    STA MOUSE_BTN2_FLAGS
    JMP MOUSE_NEW_DATA
@down_check_dy:
    LDA MOUSE_DY
    BEQ @down_stationary
    LDA MOUSE_BTN2_FLAGS
    ORA #$80
    STA MOUSE_BTN2_FLAGS
    JMP MOUSE_NEW_DATA
@down_stationary:
    LDA MOUSE_BTN2_FLAGS
    AND #$04
    BNE @held_check_dx
    LDA MOUSE_BTN2_FLAGS
    AND #$FA
    STA MOUSE_BTN2_FLAGS
    LDA #$00
    STA MOUSE_BTN2_TIMER
    JMP MOUSE_NEW_DATA
@button_up:
    LDA MOUSE_BTN_TEMP
    AND #$FD
    STA MOUSE_BTN_TEMP
    LDA MOUSE_BTN2_FLAGS
    AND #$8B
    STA MOUSE_BTN2_FLAGS
    AND #$08
    BEQ @up_done
    LDA MOUSE_BTN_TEMP
    ORA #$02
    STA MOUSE_BTN_TEMP
    LDA MOUSE_BTN2_FLAGS
    AND #$80
    BEQ @up_check_double
    LDA MOUSE_BTN2_FLAGS
    AND #$73
    STA MOUSE_BTN2_FLAGS
    JMP MOUSE_NEW_DATA
@up_check_double:
    LDA MOUSE_BTN2_FLAGS
    AND #$02
    BEQ @up_single_click
    LDA MOUSE_BTN2_FLAGS
    AND #$F1
    STA MOUSE_BTN2_FLAGS
    JMP MOUSE_NEW_DATA
@up_single_click:
    LDA MOUSE_BTN2_FLAGS
    AND #$F4
    ORA #$24
    STA MOUSE_BTN2_FLAGS
@up_done:
    JMP MOUSE_NEW_DATA
@held_check_dx:
    LDA MOUSE_DX
    BEQ @held_check_dy
    LDA MOUSE_BTN2_FLAGS
    AND #$EB
    STA MOUSE_BTN2_FLAGS
    LDA #$00
    STA MOUSE_BTN2_TIMER
    LDA MOUSE_BTN2_FLAGS
    AND #$FE
    STA MOUSE_BTN2_FLAGS
    JMP MOUSE_NEW_DATA
@held_check_dy:
    LDA MOUSE_DY
    BEQ @held_stationary
    LDA MOUSE_BTN2_FLAGS
    AND #$EB
    STA MOUSE_BTN2_FLAGS
    LDA #$00
    STA MOUSE_BTN2_TIMER
    LDA MOUSE_BTN2_FLAGS
    AND #$FE
    STA MOUSE_BTN2_FLAGS
    JMP MOUSE_NEW_DATA
@held_stationary:
    LDA MOUSE_BTN2_FLAGS
    AND #$FB
    STA MOUSE_BTN2_FLAGS
    LDA MOUSE_BTN2_FLAGS
    AND #$01
    BEQ @held_check_timer
    LDA MOUSE_BTN2_FLAGS
    AND #$EE
    STA MOUSE_BTN2_FLAGS
    LDA #$00
    STA MOUSE_BTN2_TIMER
    LDA MOUSE_BTN2_FLAGS
    AND #$FE
    STA MOUSE_BTN2_FLAGS
    JMP MOUSE_NEW_DATA
@held_check_timer:
    LDA MOUSE_BTN2_TIMER
    CMP MOUSE_PARAM
    BCC @held_set_flags
    LDA MOUSE_BTN2_FLAGS
    AND #$EF
    STA MOUSE_BTN2_FLAGS
    LDA #$00
    STA MOUSE_BTN2_TIMER
    LDA MOUSE_BTN2_FLAGS
    AND #$FE
    STA MOUSE_BTN2_FLAGS
    JMP MOUSE_NEW_DATA
@held_set_flags:
    LDA MOUSE_BTN2_FLAGS
    ORA #$12
    STA MOUSE_BTN2_FLAGS
; 作用：置 $0357 为 $FF，表示有新的鼠标数据
; 调用者：MOUSE_IRQ_HANDLER、MOUSE_BTN2_UPDATE
MOUSE_NEW_DATA:
    LDA #$FF
    STA MOUSE_NEW_DATA_FLAG
; 作用：鼠标中断处理的返回（RTS）
; 调用者：MOUSE_IRQ_HANDLER、MOUSE_NEW_DATA（顺序执行到这里）
MOUSE_IRQ_RETURN:
    RTS
