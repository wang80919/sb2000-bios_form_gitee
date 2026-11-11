; ------------------------------------------------------------------------
; 名称：tile-unpack.asm
; 说明：图案流解包（功能 $5A、$5B）：图块解压并写入显存
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：占ROM 第 B-B 页，汇编地址 $8000 起，后面的文件接在它后面
; ------------------------------------------------------------------------
.org $8000
    LDA SYS_FUNCTION
    SEC
    SBC #$5A
    JSR IMAGE_INLINE_JUMP
    .word API_5A,API_5B_UNPACK_TILES,API_5C_UNPACK_MAP,API_5D_WRITE_PALETTE,API_5E,API_5F_SHOW_IMAGE,API_60,API_61
; 作用：页内的内联跳转表副本：返回地址后跟 16 位地址表，按 A 取项并跳转
; 调用者：tile-unpack.asm 开头的入口代码、EFFECT_DISPATCH
IMAGE_INLINE_JUMP:
    ASL A
    TAY
    PLA
    STA CALL_VEC_LO
    PLA
    STA CALL_VEC_HI
    INY
    LDA (CALL_VEC_LO),Y
    PHA
    INY
    LDA (CALL_VEC_LO),Y
    STA CALL_VEC_HI
    PLA
    STA CALL_VEC_LO
    JMP (CALL_VEC_LO)
; 作用：功能 $5A：把 $0C/$0D 指向的 $0650:$064F 个字节不解压直接 DMA 写进显存瓦片 $064C/$064D 处，DMA 后按 $062B 位 3、4 等垂直消隐（用例 p0b-image.mjs）；页组 $0B 入口
; 调用者：tile-unpack.asm 开头的入口代码（地址表）
API_5A:
    LDA SYS_ARG_0D
    ORA SYS_ARG_0C
    BEQ @return
    JSR TILE_NUM_TO_VRAM_ADDR
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$28
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDX #$01
    LDA #$1E
    STA SYS_FUNCTION
    LDA #$0C
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA SYS_ARG_0F
    BEQ @set_length
    LDA SYS_ARG_0D
@loop:
    CMP #$1C
    BCC @set_length
    SBC #$1C
    INX
    JMP @loop
@set_length:
    DEC SYS_ARG_0C
    LDA SYS_ARG_0C
    CMP #$FF
    BNE @store_length
    DEC SYS_ARG_0D
@store_length:
    LDA SYS_ARG_0D
    STA DMA_LEN_HI
    LDA SYS_ARG_0C
    STA DMA_LEN_LO
    LDA SYS_PAGE
    STA DMA_SRC_HIGH
    LDA FAR_OFFSET_LO
    STA DMA_SRC_LOW
    LDA FAR_OFFSET_HI
    STA DMA_SRC_MID
    LDA SYS_ARG_0A
    STA DMA_DST_HI
    LDA SYS_ARG_09
    STA DMA_DST_LO
    LDA #$C0
    STA DMA_CTRL
    JSR WAIT_FRAMES_X
@return:
    RTS
; 作用：$064C/$064D 左移 4 位（图块序号乘 16 得到显存地址）
; 调用者：API_5A、API_5B_UNPACK_TILES
TILE_NUM_TO_VRAM_ADDR:
    LDX #$04
@loop:
    ASL SYS_ARG_09
    ROL SYS_ARG_0A
    DEX
    BNE @loop
    RTS
; 作用：等 X 个垂直消隐周期，X 为 0 时不等
; 调用者：API_5A、WAIT_FRAMES_X、TILE_DMA_FLUSH、EFFECT_COLS_RIGHT、EFFECT_COLS_LEFT、EFFECT_ROWS_DOWN_TIMED、EFFECT_ROWS_UP_TIMED、EFFECT_FRAME_SHRINK等 11 处
WAIT_FRAMES_X:
    CPX #$00
    BEQ @return
    JSR WAIT_ONE_FRAME_0B
    DEX
    BNE WAIT_FRAMES_X
@return:
    RTS
; 作用：等一次垂直消隐
; 调用者：WAIT_FRAMES_X、WAIT_ONE_FRAME_0B、API_5D_WRITE_PALETTE
WAIT_ONE_FRAME_0B:
    LDA PPU_STATUS
    BPL WAIT_ONE_FRAME_0B
@loop:
    LDA PPU_STATUS
    BMI @loop
    RTS
; 作用：功能 $5B：解压图案流并写进显存：$0C/$0D 指向 16 字节字典加指令流（$00 结束），输出按 $064C/$064D 指定的显存地址 DMA 写入；格式见 tools/decode-img.mjs（实测解码器与页 79-7F 的 10 张图的头部完全吻合）
; 调用者：tile-unpack.asm 开头的入口代码（地址表）、API_5E、API_5F_SHOW_IMAGE
API_5B_UNPACK_TILES:
    JSR TILE_NUM_TO_VRAM_ADDR
    LDX #$00
    LDA #$10
    STA SYS_ARG_0C
    JSR VEC_FAR_COPY_IN
    LDA PROG_ENTRY_LO
    CLC
    ADC #$10
    STA PROG_ENTRY_LO
    BCC @no_carry
    INC PROG_ENTRY_HI
@no_carry:
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$01
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA FAR_OFFSET_HI
    ORA #$90
    STA FAR_OFFSET_HI
    LDA SYS_PAGE
    PHA
    LDA #$F8
    STA SYS_PAGE
    LDA #$02
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    INC SYS_PAGE
    INC SYS_ARG_10
    JSR VEC_SYSCALL
    LDA #$00
    STA WORK_VEC_18_LO
    LDA #$A0
    STA WORK_VEC_18_HI
    PLA
    STA SYS_PAGE
@loop:
    LDY #$00
    LDA (FAR_OFFSET_LO),Y
    BNE @decode_command
    JMP @end_of_stream
@decode_command:
    TAY
    AND #$0F
    TAX
    TYA
    AND #$F0
    CMP #$D0
    BCC @dict_fill
    BEQ @literal_copy
    CMP #$F0
    BEQ @ramp
    JMP @run_fill
@dict_fill:
    LSR A
    LSR A
    LSR A
    LSR A
    PHA
    TAY
    DEY
@dict_fill_loop:
    LDA COPY_BUFFER,X
    STA (WORK_VEC_18_LO),Y
    DEY
    BPL @dict_fill_loop
    PLA
    CLC
    ADC WORK_VEC_18_LO
    STA WORK_VEC_18_LO
    BCC @dict_no_carry
    INC WORK_VEC_18_HI
@dict_no_carry:
    LDA WORK_VEC_18_HI
    CMP #$BC
    BCC @dict_next
    JSR TILE_DMA_FLUSH
@dict_next:
    INC FAR_OFFSET_LO
    BNE @loop
    INC FAR_OFFSET_HI
    LDA FAR_OFFSET_HI
    CMP #$A0
    BCC @loop
    JSR TILE_MAP_NEXT_PAGE
    JMP @loop
@literal_copy:
    INC FAR_OFFSET_LO
    BNE @literal_loop
    INC FAR_OFFSET_HI
    LDA FAR_OFFSET_HI
    CMP #$A0
    BCC @literal_loop
    JSR TILE_MAP_NEXT_PAGE
@literal_loop:
    LDY #$00
    LDA (FAR_OFFSET_LO),Y
    STA (WORK_VEC_18_LO),Y
    INC FAR_OFFSET_LO
    BNE @literal_src_ok
    INC FAR_OFFSET_HI
    LDA FAR_OFFSET_HI
    CMP #$A0
    BCC @literal_src_ok
    JSR TILE_MAP_NEXT_PAGE
@literal_src_ok:
    INC WORK_VEC_18_LO
    BNE @literal_dst_ok
    INC WORK_VEC_18_HI
@literal_dst_ok:
    DEX
    BNE @literal_loop
    LDA WORK_VEC_18_HI
    CMP #$BC
    BCC @literal_done
    JSR TILE_DMA_FLUSH
@literal_done:
    JMP @loop
@ramp:
    INC FAR_OFFSET_LO
    BNE @ramp_start
    INC FAR_OFFSET_HI
    LDA FAR_OFFSET_HI
    CMP #$A0
    BCC @ramp_start
    JSR TILE_MAP_NEXT_PAGE
@ramp_start:
    LDY #$00
    LDA (FAR_OFFSET_LO),Y
    CLC
@ramp_loop:
    STA (WORK_VEC_18_LO),Y
    ADC #$01
    INY
    DEX
    BNE @ramp_loop
@advance_dst:
    TYA
    CLC
    ADC WORK_VEC_18_LO
    STA WORK_VEC_18_LO
    BCC @dst_no_carry
    INC WORK_VEC_18_HI
@dst_no_carry:
    LDA WORK_VEC_18_HI
    CMP #$BC
    BCC @dst_checked
    JSR TILE_DMA_FLUSH
@dst_checked:
    INC FAR_OFFSET_LO
    BNE @next_command
    INC FAR_OFFSET_HI
    LDA FAR_OFFSET_HI
    CMP #$A0
    BCC @next_command
    JSR TILE_MAP_NEXT_PAGE
@next_command:
    JMP @loop
@run_fill:
    INC FAR_OFFSET_LO
    BNE @run_byte
    INC FAR_OFFSET_HI
    LDA FAR_OFFSET_HI
    CMP #$A0
    BCC @run_byte
    JSR TILE_MAP_NEXT_PAGE
@run_byte:
    LDY #$00
    LDA (FAR_OFFSET_LO),Y
@run_loop:
    STA (WORK_VEC_18_LO),Y
    INY
    DEX
    BNE @run_loop
    BEQ @advance_dst
@end_of_stream:
    LDA WORK_VEC_18_LO
    BNE @flush
    LDA WORK_VEC_18_HI
    CMP #$A0
    BEQ @return
@flush:
    JSR TILE_DMA_FLUSH
@return:
    RTS
; 作用：把页 $1F 的 $8000 起、共 WORK_VEC_18_LO/WORK_VEC_18_HI 减 $A000 个字节经 DMA 写到显存 $064C/$064D，等 1 帧后把显存地址前移、缓冲指针 WORK_VEC_18_LO/WORK_VEC_18_HI 重置为 $A000
; 调用者：API_5B_UNPACK_TILES
TILE_DMA_FLUSH:
    TXA
    PHA
    LDA WORK_VEC_18_LO
    SEC
    SBC #$01
    STA DMA_LEN_LO
    LDA WORK_VEC_18_HI
    SBC #$A0
    STA DMA_LEN_HI
    LDA #$1F
    STA DMA_SRC_HIGH
    LDA #$00
    STA DMA_SRC_LOW
    LDA #$80
    STA DMA_SRC_MID
    LDA SYS_ARG_0A
    STA DMA_DST_HI
    LDA SYS_ARG_09
    STA DMA_DST_LO
    LDA #$C0
    STA DMA_CTRL
    LDX #$01
    JSR WAIT_FRAMES_X
    LDA WORK_VEC_18_HI
    SEC
    SBC #$A0
    STA WORK_VEC_18_HI
    LDA SYS_ARG_09
    CLC
    ADC WORK_VEC_18_LO
    STA SYS_ARG_09
    LDA SYS_ARG_0A
    ADC WORK_VEC_18_HI
    STA SYS_ARG_0A
    LDA #$00
    STA WORK_VEC_18_LO
    LDA #$A0
    STA WORK_VEC_18_HI
    PLA
    TAX
    RTS
; 作用：SYS_PAGE 加 1 并用 $29 映射到窗口 1，FAR_OFFSET 置 $9000
; 调用者：API_5B_UNPACK_TILES、API_61
TILE_MAP_NEXT_PAGE:
    INC SYS_PAGE
    LDA #$01
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$90
    STA FAR_OFFSET_HI
    RTS
