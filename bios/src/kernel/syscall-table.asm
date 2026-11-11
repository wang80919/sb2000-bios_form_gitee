; 作用：------------------------------------------------------------------------
; 名称：syscall-table.asm
; 说明：系统调用地址表：功能号 $10-$76 的入口地址，由系统调用分发器查表调用
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-10
; 备注：在 ROM 里接在 kernel/floppy-interrupt.asm 之后，占 $E082-$E152
; ------------------------------------------------------------------------
; 每项 2 字节（低字节在前），下标 = (功能号 - $10) × 2；功能 $3B-$64、$66 等走分发器里的换页路径，不查本表；未实现的功能指向 SYSCALL_STUB
; 引用者：SYSCALL_DISPATCH
SYSCALL_TABLE:
    .word API_10_VIDEO_OPTION ; $10
    .word API_11_DISPLAY_MODE ; $11
    .word API_12_PPU_CONTROL ; $12
    .word API_13_IRQ_MASK ; $13
    .word API_14_MOUSE_RESET ; $14
    .word API_15_SET_FLAG_0636 ; $15
    .word SYSCALL_STUB ; $16
    .word API_17_KEYBOARD_INIT ; $17
    .word API_18 ; $18
    .word API_19_DISPLAY_OFF ; $19
    .word API_1A_WAIT_VBLANK_ON ; $1A
    .word API_1B_WAIT_FRAMES ; $1B
    .word API_1C_SAVE_CONTEXT ; $1C
    .word API_1D_RESTORE_CONTEXT ; $1D
    .word API_1E_QUERY_STATE ; $1E
    .word API_1F ; $1F
    .word SYSCALL_STUB ; $20
    .word SYSCALL_STUB ; $21
    .word SYSCALL_STUB ; $22
    .word SYSCALL_STUB ; $23
    .word API_24_FAR_READ_NEXT ; $24
    .word API_25_CALL_BANKED ; $25
    .word API_26_JUMP_BANKED ; $26
    .word API_27 ; $27
    .word API_28 ; $28
    .word API_29_MAP_WINDOW ; $29
    .word API_2A_SET_VRAM_BANK ; $2A
    .word API_2B_FAR_WRITE_NEXT ; $2B
    .word API_2C_ADDR_TO_FAR ; $2C
    .word SYSCALL_STUB ; $2D
    .word SYSCALL_STUB ; $2E
    .word SYSCALL_STUB ; $2F
    .word API_30_DMA_TO_VRAM ; $30
    .word API_31 ; $31
    .word API_32 ; $32
    .word API_33 ; $33
    .word API_34 ; $34
    .word SYSCALL_STUB ; $35
    .word SYSCALL_STUB ; $36
    .word SYSCALL_STUB ; $37
    .word SYSCALL_STUB ; $38
    .word SYSCALL_STUB ; $39
    .word SYSCALL_STUB ; $3A
    .word SYSCALL_STUB ; $3B
    .word SYSCALL_STUB ; $3C
    .word SYSCALL_STUB ; $3D
    .word SYSCALL_STUB ; $3E
    .word SYSCALL_STUB ; $3F
    .word SYSCALL_STUB ; $40
    .word SYSCALL_STUB ; $41
    .word SYSCALL_STUB ; $42
    .word SYSCALL_STUB ; $43
    .word SYSCALL_STUB ; $44
    .word SYSCALL_STUB ; $45
    .word SYSCALL_STUB ; $46
    .word SYSCALL_STUB ; $47
    .word SYSCALL_STUB ; $48
    .word SYSCALL_STUB ; $49
    .word SYSCALL_STUB ; $4A
    .word SYSCALL_STUB ; $4B
    .word SYSCALL_STUB ; $4C
    .word SYSCALL_STUB ; $4D
    .word SYSCALL_STUB ; $4E
    .word SYSCALL_STUB ; $4F
    .word SYSCALL_STUB ; $50
    .word SYSCALL_STUB ; $51
    .word SYSCALL_STUB ; $52
    .word SYSCALL_STUB ; $53
    .word SYSCALL_STUB ; $54
    .word SYSCALL_STUB ; $55
    .word SYSCALL_STUB ; $56
    .word SYSCALL_STUB ; $57
    .word SYSCALL_STUB ; $58
    .word SYSCALL_STUB ; $59
    .word SYSCALL_STUB ; $5A
    .word SYSCALL_STUB ; $5B
    .word SYSCALL_STUB ; $5C
    .word SYSCALL_STUB ; $5D
    .word SYSCALL_STUB ; $5E
    .word SYSCALL_STUB ; $5F
    .word SYSCALL_STUB ; $60
    .word SYSCALL_STUB ; $61
    .word SYSCALL_STUB ; $62
    .word SYSCALL_STUB ; $63
    .word SYSCALL_STUB ; $64
    .word API_65_SOUND_SERVICE ; $65
    .word SYSCALL_STUB ; $66
    .word SYSCALL_STUB ; $67
    .word SYSCALL_STUB ; $68
    .word SYSCALL_STUB ; $69
    .word API_6A_GAMEPAD ; $6A
    .word API_6B_INPUT_SERVICE ; $6B
    .word API_6C_MOUSE ; $6C
    .word SYSCALL_STUB ; $6D
    .word SYSCALL_STUB ; $6E
    .word SYSCALL_STUB ; $6F
    .word SYSCALL_STUB ; $70
    .word SYSCALL_STUB ; $71
    .word SYSCALL_STUB ; $72
    .word SYSCALL_STUB ; $73
    .word API_74_PORT4302_CONTROL ; $74
    .word API_75_PORT4302_SEND ; $75
    .word SYSCALL_STUB ; $76
; 作用：未实现功能的空桩：只有两个 NOP 和一个 RTS。
; 调用者：SYSCALL_TABLE（地址表）
SYSCALL_STUB:
    NOP
    NOP
    RTS
