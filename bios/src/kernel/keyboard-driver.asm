; 作用：------------------------------------------------------------------------
; 名称：keyboard-driver.asm
; 说明：键盘：中断处理、按键翻译、按键队列与各修饰状态的按键映射表
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：在 ROM 里接在 kernel/mouse-driver.asm 之后
; ------------------------------------------------------------------------
; 键盘数据处理：读 $4020 的扫描码，按修饰键状态查映射表，把（ASCII，扫描码）放入按键队列
; 按下 ESC 且 ESC_BREAK 不为 0 时，调用功能 $1D 恢复保存的上下文
; 调用者：IRQ_HANDLER
KBD_HANDLER:
    LDA #$00
    STA KBD_ACK
    LDA KBD_READY
    BNE @ready
    JMP KBD_HANDLER_RETURN
@ready:
    LDA KBD_DATA
    STA KBD_SCANCODE
    LDA #$80
    STA KBD_RESPONSE
    LDA KBD_STATE_FLAG
    BNE @check_led_state
    JMP KBD_HANDLER_RETURN
@check_led_state:
    LDA KBD_LED_PENDING
    BEQ @check_esc
    CMP #$01
    BNE @led_state2
    INC KBD_LED_PENDING
    LDA #$80
    STA KBD_DATA
    STA KBD_ACK
    RTS
@led_state2:
    CMP #$02
    BNE @led_done
    INC KBD_LED_PENDING
    LDA KBD_LEDS
    STA KBD_OUT_PORT
    LDA #$01
    STA KBD_ACK
    LDX #$01
    JSR API_1B_WAIT_FRAMES
    LDA #$A0
    STA KBD_DATA
    LDA #$85
    STA KBD_ACK
    RTS
@led_done:
    LDA #$00
    STA KBD_LED_PENDING
    LDA #$80
    STA KBD_DATA
    STA KBD_ACK
    RTS
@check_esc:
    LDA ESC_BREAK
    BEQ @check_prefix
    LDX KBD_SCANCODE
    CPX #$01
    BNE @check_prefix
    LDA #$80
    STA KBD_ACK
    CLI
    LDA #$1D
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
@check_prefix:
    LDX KBD_SCANCODE
    CPX #$E1
    BNE @check_e0
    LDA KBD_PREFIX_STATE
    BEQ @start_pause_prefix
    INC KBD_PREFIX_STATE
    JMP KBD_DONE
@start_pause_prefix:
    LDA #$02
    STA KBD_PREFIX_STATE
    JMP KBD_DONE
@check_e0:
    CPX #$E0
    BNE @check_prefix_state
    LDA #$01
    STA KBD_PREFIX_STATE
    JMP KBD_DONE
@check_prefix_state:
    LDY KBD_PREFIX_STATE
    BEQ KBD_MODIFIER_KEYS
    CPY #$01
    BEQ @extended_key
    CPY #$03
    BCS @pause_end
    INC KBD_PREFIX_STATE
    JMP KBD_DONE
@pause_end:
    LDY #$00
    STY KBD_OUT_ASCII
    LDX #$1D
    STX KBD_OUT_SCAN
    JSR KEY_ENQUEUE
    LDY #$00
    STY KBD_PREFIX_STATE
    JMP KBD_DONE
@extended_key:
    CPX #$37
    BEQ @enqueue_extended
    CPX #$47
    BEQ @enqueue_extended
    CPX #$48
    BEQ @enqueue_extended
    CPX #$49
    BEQ @enqueue_extended
    CPX #$4B
    BEQ @enqueue_extended
    CPX #$4D
    BEQ @enqueue_extended
    CPX #$4F
    BCC KBD_MODIFIER_KEYS
    CPX #$54
    BCS KBD_MODIFIER_KEYS
@enqueue_extended:
    LDA KBD_FLAGS
    AND #$04
    BEQ @enqueue_plain_extended
    TXA
    ASL A
    TAX
    LDA KEYMAP_CTRL,X
    STA KBD_OUT_ASCII
    INX
    LDA KEYMAP_CTRL,X
    STA KBD_OUT_SCAN
    JSR KEY_ENQUEUE
    LDY #$00
    STY KBD_PREFIX_STATE
    JMP KBD_DONE
@enqueue_plain_extended:
    LDY #$00
    STY KBD_OUT_ASCII
    STX KBD_OUT_SCAN
    JSR KEY_ENQUEUE
    LDY #$00
    STY KBD_PREFIX_STATE
    JMP KBD_DONE
; 作用：处理 Shift、Ctrl、Alt 的按下与松开，以及 CapsLock、NumLock、ScrollLock 的切换，修改 KBD_FLAGS 与 KBD_LEDS
; 调用者：KBD_HANDLER
KBD_MODIFIER_KEYS:
    LDY #$00
    STY KBD_PREFIX_STATE
    CPX #$36
    BNE @check_rshift_up
    LDA #$01
    ORA KBD_FLAGS
    STA KBD_FLAGS
    JMP KBD_DONE
@check_rshift_up:
    CPX #$B6
    BNE @check_lshift_down
    LDA #$FE
    AND KBD_FLAGS
    STA KBD_FLAGS
    JMP KBD_DONE
@check_lshift_down:
    CPX #$2A
    BNE @check_lshift_up
    LDA #$02
    ORA KBD_FLAGS
    STA KBD_FLAGS
    JMP KBD_DONE
@check_lshift_up:
    CPX #$AA
    BNE @check_ctrl_down
    LDA #$FD
    AND KBD_FLAGS
    STA KBD_FLAGS
    JMP KBD_DONE
@check_ctrl_down:
    CPX #$1D
    BNE @check_ctrl_up
    LDA #$04
    ORA KBD_FLAGS
    STA KBD_FLAGS
    JMP KBD_DONE
@check_ctrl_up:
    CPX #$9D
    BNE @check_alt_down
    LDA #$FB
    AND KBD_FLAGS
    STA KBD_FLAGS
    JMP KBD_DONE
@check_alt_down:
    CPX #$38
    BNE @check_alt_up
    LDA #$08
    ORA KBD_FLAGS
    STA KBD_FLAGS
    JMP KBD_DONE
@check_alt_up:
    CPX #$B8
    BNE @check_scroll_lock
    LDA #$F7
    AND KBD_FLAGS
    STA KBD_FLAGS
    JMP KBD_DONE
@check_scroll_lock:
    CPX #$46
    BNE @check_num_lock
    LDA #$10
    EOR KBD_FLAGS
    STA KBD_FLAGS
    LDA KBD_LEDS
    EOR #$01
    STA KBD_LEDS
    JMP KBD_SET_LEDS
@check_num_lock:
    CPX #$45
    BNE @check_caps_lock
    LDA #$20
    EOR KBD_FLAGS
    STA KBD_FLAGS
    LDA KBD_LEDS
    EOR #$02
    STA KBD_LEDS
    JMP KBD_SET_LEDS
@check_caps_lock:
    CPX #$3A
    BNE KBD_TOGGLE_CAPS_LOCK
    LDA #$40
    EOR KBD_FLAGS
    STA KBD_FLAGS
    LDA KBD_LEDS
    EOR #$04
    STA KBD_LEDS
; 作用：向键盘发 $ED 命令更新指示灯，$034A 置 1 进入收发应答流程
; 调用者：KBD_MODIFIER_KEYS
KBD_SET_LEDS:
    LDA #$ED
    STA KBD_OUT_PORT
    LDA #$01
    STA KBD_ACK
    LDX #$01
    JSR API_1B_WAIT_FRAMES
    LDA #$A0
    STA KBD_DATA
    LDA #$85
    STA KBD_ACK
    LDA #$01
    STA KBD_LED_PENDING
    RTS
    JMP $DA5D
; 作用：扫描码 $52 切换 KBD_FLAGS 位 7（CapsLock）；其余小于 $80 的扫描码交给 KBD_TRANSLATE，不小于 $80 的（释放码）直接结束
; 调用者：KBD_MODIFIER_KEYS
KBD_TOGGLE_CAPS_LOCK:
    CPX #$52
    BNE @check_release
    LDA #$80
    EOR KBD_FLAGS
    STA KBD_FLAGS
    JMP KBD_TRANSLATE
@check_release:
    CPX #$80
    BCC KBD_TRANSLATE
    JMP KBD_DONE
; 作用：按 KBD_FLAGS 选 Alt、Ctrl、Shift、CapsLock 或普通映射表，把扫描码翻成（ASCII，扫描码）
; 调用者：KBD_TOGGLE_CAPS_LOCK
KBD_TRANSLATE:
    TXA
    AND #$7F
    CMP #$5B
    BCC @lookup
    JMP @extended_scan
@lookup:
    ASL A
    TAX
    LDA KBD_FLAGS
    AND #$08
    BEQ @check_ctrl
    LDA KEYMAP_ALT,X
    STA KBD_OUT_ASCII
    INX
    LDA KEYMAP_ALT,X
    STA KBD_OUT_SCAN
    DEX
    JMP @dispatch_result
@check_ctrl:
    LDA KBD_FLAGS
    AND #$04
    BEQ @check_shift
    LDA KEYMAP_CTRL,X
    STA KBD_OUT_ASCII
    INX
    LDA KEYMAP_CTRL,X
    STA KBD_OUT_SCAN
    DEX
    JMP @dispatch_result
@check_shift:
    LDA KBD_FLAGS
    AND #$03
    BEQ @check_caps
    LDA KEYMAP_SHIFT,X
    STA KBD_OUT_ASCII
    INX
    LDA KEYMAP_SHIFT,X
    STA KBD_OUT_SCAN
    DEX
    LDA KBD_OUT_ASCII
    CMP #$41
    BCC @dispatch_result
    CMP #$5B
    BCS @dispatch_result
    LDA KBD_FLAGS
    AND #$40
    BNE @normal_map
    JSR KEY_ENQUEUE
    JMP KBD_DONE
@check_caps:
    LDA KBD_FLAGS
    AND #$40
    BEQ @normal_map
    LDA KEYMAP_CAPS,X
    STA KBD_OUT_ASCII
    INX
    LDA KEYMAP_CAPS,X
    STA KBD_OUT_SCAN
    DEX
    JMP @dispatch_result
@normal_map:
    LDA KEYMAP_NORMAL,X
    STA KBD_OUT_ASCII
    INX
    LDA KEYMAP_NORMAL,X
    STA KBD_OUT_SCAN
    DEX
@dispatch_result:
    LDA KBD_OUT_ASCII
    CMP #$FF
    BEQ KBD_DONE
    CMP #$FD
    BEQ KBD_DONE
    CMP #$FE
    BEQ @numpad_key
    JSR KEY_ENQUEUE
    JMP KBD_DONE
@numpad_key:
    LDA KBD_FLAGS
    AND #$20
    BNE @numlock_map
    LDA KEYMAP_SHIFT,X
    STA KBD_OUT_ASCII
    INX
    LDA KEYMAP_SHIFT,X
    STA KBD_OUT_SCAN
    DEX
    JSR KEY_ENQUEUE
    JMP KBD_DONE
@numlock_map:
    LDA KEYMAP_NUMLOCK,X
    STA KBD_OUT_ASCII
    INX
    LDA KEYMAP_NUMLOCK,X
    STA KBD_OUT_SCAN
    DEX
    JSR KEY_ENQUEUE
    JMP KBD_DONE
@extended_scan:
    STA KBD_OUT_SCAN
    LDA #$00
    STA KBD_OUT_ASCII
    JSR KEY_ENQUEUE
; 作用：键盘处理结束：写 $4022 为 $80 后返回
; 调用者：KBD_HANDLER、KBD_MODIFIER_KEYS、KBD_TOGGLE_CAPS_LOCK、KBD_TRANSLATE
KBD_DONE:
    LDA #$80
    STA KBD_ACK
    RTS
; 作用：把 KBD_OUT_ASCII、KBD_OUT_SCAN 两个字节放入按键队列，队列满（12 字节，6 个按键）时丢弃
; 调用者：KBD_HANDLER、KBD_TRANSLATE
KEY_ENQUEUE:
    LDX KEY_WRITE_INDEX
    INX
    INX
    CPX #$0C
    BNE @wrap_done
    LDX #$00
@wrap_done:
    CPX KEY_READ_INDEX
    BEQ @return
    LDY KEY_WRITE_INDEX
    LDA KBD_OUT_ASCII
    STA KEY_QUEUE,Y
    LDA KBD_OUT_SCAN
    INY
    STA KEY_QUEUE,Y
    STX KEY_WRITE_INDEX
@return:
    RTS
; 作用：映射表：按住 Alt
; 引用者：KBD_TRANSLATE
KEYMAP_ALT:
    .byte $20,$00,$FD,$00,$00,$78,$00,$79,$00,$7A,$00,$7B,$00,$7C,$00,$7D
    .byte $00,$7E,$00,$7F,$00,$80,$00,$81,$00,$82,$00,$83,$FD,$00,$FD,$00
    .byte $00,$10,$00,$11,$00,$12,$00,$13,$00,$14,$00,$15,$00,$16,$00,$17
    .byte $00,$18,$00
    .byte $19,$FD,$00,$FD,$00,$FD,$00,$FF
    .byte $00,$00,$1E,$00,$1F,$00,$20,$00,$21,$00,$22,$00,$23,$00,$24,$00
    .byte $25,$00
    .byte $26,$FD,$00,$FD,$00,$FD,$00,$FF,$00,$FD
    .byte $00,$00,$2C,$00,$2D,$00,$2E,$00,$2F,$00,$30,$00,$31,$00
    .byte $32,$FD,$00,$FD,$00,$FD,$00,$FF,$00,$FD,$00,$FF
    .byte $00,$20,$39,$FF,$00,$00,$68,$00,$69,$00,$6A,$00,$6B,$00,$6C,$00
    .byte $6D
; 作用：ALT 映射表偏移 $82 处（第 $41 项）；全 ROM 没有指令引用这个标签
; 引用者：全 ROM 没有指令或地址表引用它
KEYMAP_ALT_MID:
    .byte $00,$6E,$00,$6F,$00,$70,$00,$71,$FF
    .byte $00,$FF,$00,$FE,$00,$FE,$00,$FE,$00,$FE,$00,$FE,$00,$FE,$00,$FE
    .byte $00,$FE,$00,$FE,$00,$FE,$00,$FE,$00,$FE,$00,$FE,$00,$FD,$00,$FD
    .byte $00,$5C,$56,$FF,$00,$FF,$00
; 作用：映射表：普通状态，每个扫描码 2 字节（ASCII，扫描码）
; ASCII 为 0 表示没有字符（功能键等），$FE 表示按小键盘规则处理，$FD、$FF 表示不产生按键
; 引用者：KBD_TRANSLATE
KEYMAP_NORMAL:
    .byte $20,$00,$1B,$01,$31,$02
    .byte $32,$03,$33,$04
    .byte $34,$05,$35,$06,$36,$07,$37,$08,$38,$09,$39,$0A,$30,$0B,$2D,$0C
    .byte $3D,$0D,$08,$0E,$09,$0F,$71,$10,$77,$11
    .byte $65,$12,$72,$13,$74,$14,$79,$15
    .byte $75,$16
    .byte $69,$17,$6F,$18,$70,$19
    .byte $5B,$1A,$5D,$1B
    .byte $0D,$1C
    .byte $FF,$00
    .byte $61,$1E,$73,$1F,$64,$20
    .byte $66,$21,$67,$22
    .byte $68,$23
    .byte $6A,$24,$6B,$25
    .byte $6C,$26
    .byte $3B,$27,$27,$28,$60,$29,$FF,$00,$5C,$2B,$7A,$2C
    .byte $78,$2D,$63,$2E,$76,$2F,$62,$30,$6E,$31,$6D,$32
    .byte $2C,$33
    .byte $2E,$34
    .byte $2F,$35,$FF,$00,$2A,$37,$FF,$00
    .byte $20,$39
    .byte $FF,$00,$00,$3B,$00,$3C,$00,$3D,$00,$3E,$00,$3F,$00,$40,$00,$41
    .byte $00,$42,$00,$43,$00,$44,$FF
    .byte $00,$FF,$00,$FE,$00,$FE,$00,$FE
    .byte $00,$2D,$4A,$FE,$00,$FE,$00,$FE,$00,$2B,$4E,$FE
    .byte $00,$FE,$00,$FE,$00,$FE,$00,$FE,$00,$FD,$00,$FD
    .byte $00,$5C,$56,$FF,$00,$FF,$00
; 作用：映射表：CapsLock 打开时的字母大写
; 引用者：KBD_TRANSLATE
KEYMAP_CAPS:
    .byte $20,$00,$1B,$01,$31,$02,$32,$03,$33,$04,$34,$05,$35,$06,$36,$07
    .byte $37,$08,$38,$09,$39,$0A,$30,$0B,$2D,$0C,$3D,$0D,$08,$0E,$09,$0F
    .byte $51,$10,$57,$11,$45,$12,$52,$13,$54,$14,$59,$15,$55,$16,$49,$17
    .byte $4F,$18,$50,$19,$5B,$1A,$5D,$1B,$0D,$1C,$FF,$00,$41,$1E,$53,$1F
    .byte $44,$20,$46,$21,$47,$22,$48,$23,$4A,$24,$4B,$25,$4C,$26,$3B,$27
    .byte $27,$28,$60,$29,$FF,$00,$5C,$2B,$5A,$2C,$58,$2D,$43,$2E,$56,$2F
    .byte $42,$30,$4E,$31,$4D,$32,$2C,$33,$2E,$34,$2F,$35,$FF,$00,$2A,$37
    .byte $FF,$00,$20,$39,$FF,$00,$00,$3B,$00,$3C,$00,$3D,$00,$3E,$00,$3F
    .byte $00,$40,$00,$41,$00,$42,$00,$43,$00,$44,$FF
    .byte $00,$FF,$00,$FE,$00,$FE,$00,$FE
    .byte $00,$2D,$4A,$FE,$00,$FE,$00,$FE,$00,$2B,$4E,$FE
    .byte $00,$FE,$00,$FE,$00,$FE,$00,$FE,$00,$FD,$00,$FD
    .byte $00,$5C,$56,$00,$57,$00,$58
; 作用：映射表：按住 Ctrl，如 Ctrl+A 是 $01，功能键是 IBM 扩展码
; 引用者：KBD_HANDLER、KBD_TRANSLATE
KEYMAP_CTRL:
    .byte $20,$00,$1B,$01,$FD,$00,$00,$03,$FD,$00,$FD,$00,$FD,$00,$1E,$07
    .byte $FD,$00,$FD,$00,$FD,$00,$FD,$00,$1F,$0C,$FD,$00,$7F,$0E,$FF,$00
    .byte $11,$10,$17,$11,$05,$12,$12,$13,$14,$14,$19,$15,$15,$16,$09,$17
    .byte $0F,$18,$10,$19,$1B,$1A,$1D,$1B,$0A,$1C,$FF,$00,$01,$1E,$13,$1F
    .byte $04,$20,$06,$21,$07,$22,$08,$23,$0A,$24,$0B,$25,$0C
    .byte $26,$FD,$00,$FD,$00,$FD,$00,$FF
    .byte $00,$1C,$2B,$1A,$2C,$18,$2D,$03,$2E,$16,$2F,$02,$30,$0E,$31,$0D
    .byte $32,$FD,$00,$FD,$00,$FD,$00,$FF,$00,$FD,$00,$FF
    .byte $00,$20,$39,$FF,$00,$00,$5E,$00,$5F,$00,$60,$00,$61,$00,$62,$00
    .byte $63,$00,$64,$00,$65,$00,$66,$00,$67,$FD,$00,$FD,$00,$00,$77,$FD
    .byte $00,$00,$84,$FD,$00,$00,$73,$FD,$00,$00,$74,$FD,$00,$00,$75,$FD
    .byte $00,$00
    .byte $76,$FD,$00,$FD,$00,$FD,$00,$FD
    .byte $00,$5C,$00,$FF,$00,$FF,$00
; 作用：映射表：NumLock 打开时的小键盘
; 引用者：KBD_TRANSLATE
KEYMAP_NUMLOCK:
    .byte $20,$00,$1B,$01,$31,$02,$32,$03,$33,$04,$34,$05,$35,$06,$36,$07
    .byte $37,$08,$38,$09,$39,$0A,$30,$0B,$2D,$0C,$3D,$0D,$08,$0E,$09,$0F
    .byte $71,$10,$77,$11,$65,$12,$72,$13,$74,$14,$79,$15,$75,$16,$69,$17
    .byte $6F,$18,$70,$19,$5B,$1A,$5D,$1B,$0D,$1C,$FF,$00,$61,$1E,$73,$1F
    .byte $64,$20,$66,$21,$67,$22,$68,$23,$6A,$24,$6B,$25,$6C,$26,$3B,$27
    .byte $60,$28,$27,$29,$FF,$00,$5C,$2B,$7A,$2C,$78,$2D,$63,$2E,$76,$2F
    .byte $62,$30,$6E,$31,$6D,$32,$2C,$33,$2E,$34,$2F,$35,$FF,$00,$2A,$37
    .byte $FF,$00,$20,$39,$FF,$00,$00,$3B,$00,$3C,$00,$3D,$00,$3E,$00,$3F
    .byte $00,$40,$00,$41,$00,$42,$00,$43,$00,$44,$FF,$00,$FF,$00,$37,$47
    .byte $38,$48,$39,$49,$2D,$4A,$34,$4B,$35,$4C,$36,$4D,$2B,$4E,$31,$4F
    .byte $32,$50,$33,$51,$30,$52,$2E,$53,$FD,$00,$FD,$00,$7C,$56,$00,$57
    .byte $00,$58
; 作用：映射表：按住 Shift
; 引用者：KBD_TRANSLATE
KEYMAP_SHIFT:
    .byte $20,$00,$1B,$01,$21,$02,$40,$03,$23,$04,$24,$05,$25,$06,$5E,$07
    .byte $26,$08,$2A,$09,$28,$0A,$29,$0B,$5F,$0C,$2B,$0D,$08,$0E,$00,$0F
    .byte $51,$10,$57,$11,$45,$12,$52,$13,$54,$14,$59,$15,$55,$16,$49,$17
    .byte $4F,$18,$50,$19,$7B,$1A,$7D,$1B,$0D,$1C,$FF,$00,$41,$1E,$53,$1F
    .byte $44,$20,$46,$21,$47,$22,$48,$23,$4A,$24,$4B,$25,$4C,$26,$3A,$27
    .byte $22,$28,$7E,$29,$FF,$00,$7C,$2B,$5A,$2C,$58,$2D,$43,$2E,$56,$2F
    .byte $42,$30,$4E,$31,$4D,$32,$3C,$33,$3E,$34,$3F,$35,$FF,$00,$2A,$37
    .byte $FF,$00,$20,$39,$FF,$00,$00,$54,$00,$55,$00,$56,$00,$57,$00,$58
    .byte $00,$59,$00,$5A,$00,$5B,$00,$5C,$00,$5D,$FF,$00,$FF,$00,$00,$47
    .byte $00,$48,$00,$49,$2D,$4A,$00,$4B,$FD,$00,$00,$4D,$2B,$4E,$00,$4F
    .byte $00,$50,$00,$51,$00,$52,$00,$53,$FD,$00,$FD,$00,$7C,$56,$FF,$00
    .byte $FF,$00
; 作用：键盘中断处理的返回（RTS）
; 调用者：KBD_HANDLER
KBD_HANDLER_RETURN:
    RTS
