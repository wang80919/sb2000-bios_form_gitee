; ------------------------------------------------------------------------
; 名称：text-output.asm
; 说明：文字输出（功能 $3B-$3F）：字模位置计算、单字节与汉字字符串显示
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：占ROM 第 8-8 页，汇编地址 $8000 起，后面的文件接在它后面
; ------------------------------------------------------------------------
.org $8000
    LDA SYS_FUNCTION
    SEC
    SBC #$3B
    JSR TEXT_INLINE_JUMP
    .word API_3B_GLYPH_ADDR,API_3C_3D_PUT_STRING,API_3C_3D_PUT_STRING,API_3E_3F_PUT_STRING_ASCII,API_3E_3F_PUT_STRING_ASCII,API_40,API_41_FILL_RECT
    .word API_42,API_43,API_44,API_45_PUT_TEXT_FIELD,API_46 ; 地址表（$42-$44 的代码在页 09，窗口地址 $9000 起）
; 作用：页内的内联跳转表副本：返回地址后跟 16 位地址表，按 A 取项并跳转
; 调用者：text-output.asm 开头的入口代码
TEXT_INLINE_JUMP:
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
; 作用：功能 $3B：按字符码 $064A（高字节）、$064B（低字节）查出字模所在的页与地址，不绘制；ASCII 字符与 GB2312 汉字走不同分支
; 调用者：text-output.asm 开头的入口代码（地址表）、TEXT_DRAW_HOOK_2PLANE、TEXT_DRAW_HOOK_4PLANE
API_3B_GLYPH_ADDR:
    PHA
    TXA
    PHA
    TYA
    PHA
    LDA GLYPH_MODE
    AND #$F8
    STA GLYPH_MODE
    LDA SYS_ARG_07
    BNE @gb2312
    LDA GLYPH_MODE
    AND #$40
    BEQ @ascii_builtin_check
    JMP @user_font_addr
@ascii_builtin_check:
    LDA SYS_ARG_08
    CMP #$20
    BCC @use_registered_ascii
    CMP #$80
    BCC @builtin_ascii
@use_registered_ascii:
    JMP @registered_ascii_addr
@builtin_ascii:
    JMP @builtin_ascii_addr
@gb2312:
    LDA GLYPH_MODE
    AND #$F8
    ORA #$04
    STA GLYPH_MODE
    LDA SYS_ARG_08
    CMP #$A1
    BCC @invalid_char
    CMP #$FF
    BEQ @invalid_char
    LDA SYS_ARG_07
    CMP #$F8
    BCC @check_level1
    JMP @extended_addr
@check_level1:
    CMP #$B0
    BCC @check_symbols
    JMP @hanzi_addr
@check_symbols:
    CMP #$A1
    BCC @invalid_char
    CMP #$AA
    BCS @invalid_char
    JMP @symbol_addr
@invalid_char:
    LDA #$FF
    STA SYS_STATUS
@return:
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
@builtin_ascii_addr:
    LDX #$03
    LDY #$8E
    LDA GLYPH_MODE
    ORA #$01
    STA GLYPH_MODE
    BPL @store_hi
    AND #$F8
    ORA #$02
    STA GLYPH_MODE
    INX
    INY
    INY
    INY
@store_hi:
    STY GLYPH_ADDR_HI
    LDA SYS_ARG_08
    SEC
    SBC #$20
    STA GLYPH_ADDR_LO
    LDA #$00
@shift_loop:
    ASL GLYPH_ADDR_LO
    ROL A
    DEX
    BNE @shift_loop
    CLC
    ADC GLYPH_ADDR_HI
    STA GLYPH_ADDR_HI
    LDA #$00
    CLC
    ADC GLYPH_ADDR_LO
    STA GLYPH_ADDR_LO
    BCC @no_carry
    INC GLYPH_ADDR_HI
@no_carry:
    LDA #$14
    STA SYS_ARG_01
    JSR TEXT_FAR_ADDR_FROM_WINDOW
    JMP @return
@registered_ascii_addr:
    LDX #$03
    LDY FONT_TABLE+2
    LDA GLYPH_MODE
    ORA #$01
    STA GLYPH_MODE
    BPL @store_hi2
    AND #$F8
    ORA #$02
    STA GLYPH_MODE
    INX
    INY
    INY
    INY
    INY
    INY
@store_hi2:
    STY GLYPH_ADDR_HI
    LDA SYS_ARG_08
    BPL @store_lo
    SEC
    SBC #$60
@store_lo:
    STA GLYPH_ADDR_LO
    LDA #$00
@shift_loop2:
    ASL GLYPH_ADDR_LO
    ROL A
    DEX
    BNE @shift_loop2
    CLC
    ADC GLYPH_ADDR_HI
    STA GLYPH_ADDR_HI
    LDA FONT_TABLE+1
    CLC
    ADC GLYPH_ADDR_LO
    STA GLYPH_ADDR_LO
    BCC @no_carry2
    INC GLYPH_ADDR_HI
@no_carry2:
    LDA FONT_TABLE
    STA SYS_ARG_01
    JSR TEXT_FAR_ADDR_FROM_WINDOW
    JMP @return
@user_font_addr:
    LDX #$03
    LDY FONT_PAGE_INFO
    LDA GLYPH_MODE
    ORA #$01
    STA GLYPH_MODE
    BPL @store_hi3
    AND #$F8
    ORA #$02
    STA GLYPH_MODE
    INX
    INY
    INY
    INY
    INY
    INY
    INY
    INY
    INY
@store_hi3:
    STY GLYPH_ADDR_HI
    LDA SYS_ARG_08
    STA GLYPH_ADDR_LO
    LDA #$00
@shift_loop3:
    ASL GLYPH_ADDR_LO
    ROL A
    DEX
    BNE @shift_loop3
    CLC
    ADC GLYPH_ADDR_HI
    STA GLYPH_ADDR_HI
    LDA FONT_TABLE+4
    CLC
    ADC GLYPH_ADDR_LO
    STA GLYPH_ADDR_LO
    BCC @no_carry3
    INC GLYPH_ADDR_HI
@no_carry3:
    LDA FONT_TABLE+3
    STA SYS_ARG_01
    JSR TEXT_FAR_ADDR_FROM_WINDOW
    JMP @return
@symbol_addr:
    LDA SYS_ARG_07
    SEC
    SBC #$A1
    JSR GB_ROW_TIMES_94
    SEC
    LDA SYS_ARG_08
    SBC #$A1
    CLC
    ADC GLYPH_ADDR_LO
    STA GLYPH_ADDR_LO
    BCC @no_carry4
    INC GLYPH_ADDR_HI
@no_carry4:
    LDA #$B8
    CLC
    ADC GLYPH_ADDR_LO
    STA GLYPH_ADDR_LO
    LDA #$00
    ADC GLYPH_ADDR_HI
    STA GLYPH_ADDR_HI
    LSR A
    CLC
    ADC #$14
    STA SYS_ARG_01
    LDX #$05
@shift_loop4:
    ASL GLYPH_ADDR_LO
    ROL GLYPH_ADDR_HI
    DEX
    BNE @shift_loop4
    LDA GLYPH_ADDR_HI
    AND #$3F
    ORA #$80
    STA GLYPH_ADDR_HI
    JSR TEXT_FAR_ADDR_FROM_WINDOW
    JMP @return
@hanzi_addr:
    LDA SYS_ARG_07
    SEC
    SBC #$B0
    JSR GB_ROW_TIMES_94
    SEC
    LDA SYS_ARG_08
    SBC #$A1
    CLC
    ADC GLYPH_ADDR_LO
    STA GLYPH_ADDR_LO
    BCC @no_carry5
    INC GLYPH_ADDR_HI
@no_carry5:
    LDA #$00
    CLC
    ADC GLYPH_ADDR_LO
    STA GLYPH_ADDR_LO
    LDA #$00
    ADC GLYPH_ADDR_HI
    STA GLYPH_ADDR_HI
    LSR A
    CLC
    ADC #$07
    STA SYS_ARG_01
    LDX #$05
@shift_loop5:
    ASL GLYPH_ADDR_LO
    ROL GLYPH_ADDR_HI
    DEX
    BNE @shift_loop5
    LDA GLYPH_ADDR_HI
    AND #$3F
    ORA #$80
    STA GLYPH_ADDR_HI
    JSR TEXT_FAR_ADDR_FROM_WINDOW
    JMP @return
@extended_addr:
    LDA SYS_ARG_07
    SEC
    SBC #$F8
    JSR GB_ROW_TIMES_94
    LDX #$05
    SEC
    LDA SYS_ARG_08
    SBC #$A1
    CLC
    ADC GLYPH_ADDR_LO
    STA GLYPH_ADDR_LO
    BCC @shift_loop6
    INC GLYPH_ADDR_HI
@shift_loop6:
    ASL GLYPH_ADDR_LO
    ROL GLYPH_ADDR_HI
    DEX
    BNE @shift_loop6
    LDA FONT_TABLE+7
    CLC
    ADC GLYPH_ADDR_LO
    STA GLYPH_ADDR_LO
    LDA FONT_TABLE+8
    AND #$3F
    ADC GLYPH_ADDR_HI
    STA GLYPH_ADDR_HI
    ROL A
    ROL A
    ROL A
    AND #$03
    CLC
    ADC FONT_TABLE+6
    STA SYS_ARG_01
    LDA GLYPH_ADDR_HI
    AND #$3F
    ORA #$80
    STA GLYPH_ADDR_HI
    JSR TEXT_FAR_ADDR_FROM_WINDOW
    JMP @return
; 作用：A 乘 94（GB2312 每区的字符数），结果放 GLYPH_ADDR_HI/GLYPH_ADDR_LO，用于求字模地址
; 调用者：API_3B_GLYPH_ADDR
GB_ROW_TIMES_94:
    STA GLYPH_ADDR_LO
    ASL GLYPH_ADDR_LO
    CLC
    ADC GLYPH_ADDR_LO
    STA GLYPH_ADDR_HI
    LDA #$00
    LSR GLYPH_ADDR_HI
    ROR A
    LSR GLYPH_ADDR_HI
    ROR A
    LSR GLYPH_ADDR_HI
    ROR A
    SEC
    SBC GLYPH_ADDR_LO
    STA GLYPH_ADDR_LO
    BCS @return
    DEC GLYPH_ADDR_HI
@return:
    RTS
; 作用：把窗口地址（$0644 页号与 GLYPH_ADDR_HI 高 4 位）折成页号与页内偏移，GLYPH_ADDR_HI 只留低 4 位
; 调用者：API_3B_GLYPH_ADDR
TEXT_FAR_ADDR_FROM_WINDOW:
    ASL SYS_ARG_01
    ASL SYS_ARG_01
    LDA GLYPH_ADDR_HI
    AND #$F0
    LSR A
    LSR A
    LSR A
    LSR A
    SBC #$07
    CLC
    ADC SYS_ARG_01
    STA SYS_ARG_01
    LDA GLYPH_ADDR_HI
    AND #$0F
    STA GLYPH_ADDR_HI
    RTS
; 作用：功能 $3C 与 $3D：显示以 $064F 为结束符的字符串（指针 $0C/$0D），先画到屏外缓冲再整块复制到显示地址 $064C/$064D；$3D 使用另一套绘制例程
; 调用者：text-output.asm 开头的入口代码（地址表）
API_3C_3D_PUT_STRING:
    LDA SYS_FUNCTION
    CMP #$3D
    BEQ @decode_flags_mode
    JSR TEXT_SELECT_DRAW_MODE
    LDA #<TEXT_DRAW_HOOK_2PLANE
    STA DRAW_HOOK_LO
    LDA #>TEXT_DRAW_HOOK_2PLANE
    STA DRAW_HOOK_HI
    LDA #<TEXT_BLANK_HOOK_2PLANE
    STA WORK_VEC_18_LO
    LDA #>TEXT_BLANK_HOOK_2PLANE
    STA WORK_VEC_18_HI
    JMP @modes_set
@decode_flags_mode:
    JSR TEXT_DECODE_FLAGS
    LDA #<TEXT_DRAW_HOOK_4PLANE
    STA DRAW_HOOK_LO
    LDA #>TEXT_DRAW_HOOK_4PLANE
    STA DRAW_HOOK_HI
    LDA #<TEXT_BLANK_HOOK_4PLANE
    STA WORK_VEC_18_LO
    LDA #>TEXT_BLANK_HOOK_4PLANE
    STA WORK_VEC_18_HI
@modes_set:
    JSR TEXT_MAP_TEXT_BUFFER
    LDA SYS_ARG_0C
    STA DISPLAY_COUNT
@loop:
    LDX #$00
    STX SYS_ARG_0C
    JSR VEC_FAR_COPY_IN
    LDX #$00
@next_char:
    LDA COPY_BUFFER,X
    CMP DISPLAY_COUNT
    BEQ @end_of_string
    CMP #$A1
    BCC @single_char
    STA SYS_ARG_07
    INX
    BNE @dbcs_second
    LDA PROG_ENTRY_LO
    CLC
    ADC #$FF
    STA PROG_ENTRY_LO
    LDA #$00
    ADC PROG_ENTRY_HI
    STA PROG_ENTRY_HI
    JMP @loop
@dbcs_second:
    LDA COPY_BUFFER,X
    STA SYS_ARG_08
    JSR TEXT_CALL_HOOK_1C
    JMP @after_draw
@single_char:
    LDA GLYPH_MODE
    BMI @draw_single
    JSR TEXT_CALL_HOOK_18
@draw_single:
    LDA COPY_BUFFER,X
    STA SYS_ARG_08
    LDA #$00
    STA SYS_ARG_07
    JSR TEXT_CALL_HOOK_1C
@after_draw:
    LDA FAR_OFFSET_HI
    CMP #$BC
    BCS @flush_buffer
@next_byte:
    INX
    BNE @next_char
    INC PROG_ENTRY_HI
    JMP @loop
@flush_buffer:
    JSR TEXT_DMA_BUFFER_TO_VRAM
    LDA SYS_ARG_0A
    BEQ @return
    LDA FAR_OFFSET_HI
    SEC
    SBC #$A0
    STA FAR_OFFSET_HI
    LDA FAR_OFFSET_LO
    CLC
    ADC SYS_ARG_09
    STA SYS_ARG_09
    LDA FAR_OFFSET_HI
    ADC SYS_ARG_0A
    STA SYS_ARG_0A
    LDA #$A0
    STA FAR_OFFSET_HI
    LDA #$00
    STA FAR_OFFSET_LO
    JMP @next_byte
@end_of_string:
    LDA FAR_OFFSET_HI
    SEC
    SBC #$A0
    ORA FAR_OFFSET_LO
    BEQ @return
    JSR TEXT_DMA_BUFFER_TO_VRAM
@return:
    RTS
; 作用：功能 $3E 与 $3F：同 $3C/$3D，只处理单字节字符
; 调用者：text-output.asm 开头的入口代码（地址表）
API_3E_3F_PUT_STRING_ASCII:
    LDA SYS_FUNCTION
    CMP #$3F
    BEQ @decode_flags_mode
    JSR TEXT_SELECT_DRAW_MODE
    LDA #<TEXT_DRAW_HOOK_2PLANE
    STA DRAW_HOOK_LO
    LDA #>TEXT_DRAW_HOOK_2PLANE
    STA DRAW_HOOK_HI
    LDA #<TEXT_BLANK_HOOK_2PLANE
    STA WORK_VEC_18_LO
    LDA #>TEXT_BLANK_HOOK_2PLANE
    STA WORK_VEC_18_HI
    JMP @modes_set
@decode_flags_mode:
    JSR TEXT_DECODE_FLAGS
    LDA #<TEXT_DRAW_HOOK_4PLANE
    STA DRAW_HOOK_LO
    LDA #>TEXT_DRAW_HOOK_4PLANE
    STA DRAW_HOOK_HI
    LDA #<TEXT_BLANK_HOOK_4PLANE
    STA WORK_VEC_18_LO
    LDA #>TEXT_BLANK_HOOK_4PLANE
    STA WORK_VEC_18_HI
@modes_set:
    JSR TEXT_MAP_TEXT_BUFFER
    LDA SYS_ARG_0C
    STA DISPLAY_COUNT
@loop:
    LDX #$00
    STX SYS_ARG_0C
    JSR VEC_FAR_COPY_IN
    LDX #$00
@next_char:
    LDA COPY_BUFFER,X
    CMP DISPLAY_COUNT
    BEQ @end_of_string
    LDA COPY_BUFFER,X
    STA SYS_ARG_08
    LDA #$00
    STA SYS_ARG_07
    JSR TEXT_CALL_HOOK_1C
    LDA FAR_OFFSET_HI
    CMP #$BC
    BCS @flush_buffer
@next_byte:
    INX
    BNE @next_char
    INC PROG_ENTRY_HI
    JMP @loop
@flush_buffer:
    JSR TEXT_DMA_BUFFER_TO_VRAM
    LDA SYS_ARG_0A
    BEQ @return
    LDA FAR_OFFSET_HI
    SEC
    SBC #$A0
    STA FAR_OFFSET_HI
    LDA FAR_OFFSET_LO
    CLC
    ADC SYS_ARG_09
    STA SYS_ARG_09
    LDA FAR_OFFSET_HI
    ADC SYS_ARG_0A
    STA SYS_ARG_0A
    LDA #$A0
    STA FAR_OFFSET_HI
    LDA #$00
    STA FAR_OFFSET_LO
    JMP @next_byte
@end_of_string:
    LDA FAR_OFFSET_HI
    SEC
    SBC #$A0
    ORA FAR_OFFSET_LO
    BEQ @return
    JSR TEXT_DMA_BUFFER_TO_VRAM
@return:
    RTS
; 作用：跳转到 DRAW_HOOK_LO/DRAW_HOOK_HI 指向的绘制例程（功能 $3C 等在入口处装入）
; 调用者：API_3C_3D_PUT_STRING、API_3E_3F_PUT_STRING_ASCII、API_46、API_45_PUT_TEXT_FIELD
TEXT_CALL_HOOK_1C:
    JMP (DRAW_HOOK_LO)
; 作用：二平面的画字钩子（DRAW_HOOK_LO）：用 $3B 取字模，每个瓦片先写第一平面 8 字节再写第二平面 8 字节，写完 FAR_OFFSET 前进 16
; 调用者：API_3C_3D_PUT_STRING（取地址）、API_3E_3F_PUT_STRING_ASCII（取地址）、API_46（取地址）、API_45_PUT_TEXT_FIELD（取地址）
TEXT_DRAW_HOOK_2PLANE:
    TXA
    PHA
    TYA
    PHA
    JSR API_3B_GLYPH_ADDR
    LDA SYS_ARG_01
    STA WINDOW_SAVE_1
    STA WIN_PAGE_1
    LDA GLYPH_ADDR_HI
    ORA #$90
    STA GLYPH_ADDR_HI
    LDA GLYPH_MODE
    AND #$07
    STA DISPLAY_TEMP_3
    LDY #$00
@loop:
    LDX #$08
    TYA
    PHA
    LDA DRAW_MODE_TEMP
    BEQ @plane1_fill
    LDA SYS_ARG_0F
    BEQ @plane1_copy
@plane1_invert:
    LDA (GLYPH_ADDR_LO),Y
    EOR #$FF
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @plane1_invert
    JMP @plane2
@plane1_fill:
    LDA SYS_ARG_0F
@plane1_fill_loop:
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @plane1_fill_loop
    JMP @plane2
@plane1_copy:
    LDA (GLYPH_ADDR_LO),Y
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @plane1_copy
@plane2:
    LDX #$08
    PLA
    TAY
    LDA FAR_OFFSET_LO
    CLC
    ADC #$08
    STA FAR_OFFSET_LO
    LDA #$00
    ADC FAR_OFFSET_HI
    STA FAR_OFFSET_HI
    LDA DISPLAY_TEMP_1
    BEQ @plane2_fill
    LDA SYS_ARG_10
    BEQ @plane2_copy
@plane2_invert:
    LDA (GLYPH_ADDR_LO),Y
    EOR #$FF
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @plane2_invert
    JMP @tile_done
@plane2_fill:
    LDA SYS_ARG_10
@plane2_fill_loop:
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @plane2_fill_loop
    JMP @tile_done
@plane2_copy:
    LDA (GLYPH_ADDR_LO),Y
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @plane2_copy
@tile_done:
    DEC DISPLAY_TEMP_3
    BEQ @advance_ptr
    JMP @loop
@advance_ptr:
    LDA GLYPH_MODE
    AND #$07
    ASL A
    ASL A
    ASL A
    ADC FAR_OFFSET_LO
    STA FAR_OFFSET_LO
    BCC @finish
    INC FAR_OFFSET_HI
@finish:
    PLA
    TAY
    PLA
    TAX
    RTS
; 作用：四平面的画字钩子（DRAW_HOOK_LO）：用 $3B 取字模，每个瓦片写 32 字节（四个平面各 8 字节），写完 FAR_OFFSET 前进 32
; 调用者：API_3C_3D_PUT_STRING（取地址）、API_3E_3F_PUT_STRING_ASCII（取地址）、API_46（取地址）、API_45_PUT_TEXT_FIELD（取地址）
TEXT_DRAW_HOOK_4PLANE:
    TXA
    PHA
    TYA
    PHA
    JSR API_3B_GLYPH_ADDR
    LDA SYS_ARG_01
    STA WINDOW_SAVE_1
    STA WIN_PAGE_1
    LDA GLYPH_ADDR_HI
    ORA #$90
    STA GLYPH_ADDR_HI
    LDA GLYPH_MODE
    AND #$07
    STA DISPLAY_TEMP_4
    LDA SYS_ARG_0B
    CMP #$01
    BEQ @mode_1
    CMP #$12
    BEQ @mode_12
    JMP @general_mode
@mode_1:
    LDY #$00
@mode1_tile:
    TYA
    PHA
    LDX #$08
@mode1_copy_plane:
    LDA (GLYPH_ADDR_LO),Y
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @mode1_copy_plane
    LDA FAR_OFFSET_LO
    CLC
    ADC #$08
    STA FAR_OFFSET_LO
    LDA #$00
    ADC FAR_OFFSET_HI
    STA FAR_OFFSET_HI
    PLA
    TAY
    LDA #$00
    LDX #$18
@mode1_zero_planes:
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @mode1_zero_planes
    TYA
    SEC
    SBC #$10
    TAY
    LDA FAR_OFFSET_LO
    CLC
    ADC #$10
    STA FAR_OFFSET_LO
    LDA #$00
    ADC FAR_OFFSET_HI
    STA FAR_OFFSET_HI
    DEC DISPLAY_TEMP_4
    BNE @mode1_tile
    JMP @advance_ptr
@mode_12:
    LDY #$00
@mode12_tile:
    TYA
    PHA
    PHA
    LDX #$08
@mode12_invert_plane:
    LDA (GLYPH_ADDR_LO),Y
    EOR #$FF
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @mode12_invert_plane
    LDA FAR_OFFSET_LO
    CLC
    ADC #$08
    STA FAR_OFFSET_LO
    LDA #$00
    ADC FAR_OFFSET_HI
    STA FAR_OFFSET_HI
    PLA
    TAY
    LDX #$08
@mode12_copy_plane:
    LDA (GLYPH_ADDR_LO),Y
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @mode12_copy_plane
    LDA FAR_OFFSET_LO
    CLC
    ADC #$08
    STA FAR_OFFSET_LO
    LDA #$00
    ADC FAR_OFFSET_HI
    STA FAR_OFFSET_HI
    PLA
    TAY
    LDX #$10
@mode12_zero_plane:
    LDA #$00
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @mode12_zero_plane
    TYA
    SEC
    SBC #$08
    TAY
    LDA FAR_OFFSET_LO
    CLC
    ADC #$08
    STA FAR_OFFSET_LO
    LDA #$00
    ADC FAR_OFFSET_HI
    STA FAR_OFFSET_HI
    DEC DISPLAY_TEMP_4
    BNE @mode12_tile
    JMP @advance_ptr
@general_mode:
    LDY #$00
@general_tile:
    LDX #$08
    TYA
    PHA
    PHA
    PHA
    LDA DRAW_MODE_TEMP
    BEQ @plane1_fill
    LDA SYS_ARG_0F
    BEQ @plane1_copy
@plane1_invert:
    LDA (GLYPH_ADDR_LO),Y
    EOR #$FF
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @plane1_invert
    JMP @plane2
@plane1_fill:
    LDA SYS_ARG_0F
@plane1_fill_loop:
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @plane1_fill_loop
    JMP @plane2
@plane1_copy:
    LDA (GLYPH_ADDR_LO),Y
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @plane1_copy
@plane2:
    LDX #$08
    PLA
    TAY
    LDA FAR_OFFSET_LO
    CLC
    ADC #$08
    STA FAR_OFFSET_LO
    LDA #$00
    ADC FAR_OFFSET_HI
    STA FAR_OFFSET_HI
    LDA DISPLAY_TEMP_1
    BEQ @plane2_fill
    LDA SYS_ARG_10
    BEQ @plane2_copy
@plane2_invert:
    LDA (GLYPH_ADDR_LO),Y
    EOR #$FF
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @plane2_invert
    JMP @plane3
@plane2_fill:
    LDA SYS_ARG_10
@plane2_fill_loop:
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @plane2_fill_loop
    JMP @plane3
@plane2_copy:
    LDA (GLYPH_ADDR_LO),Y
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @plane2_copy
@plane3:
    LDX #$08
    PLA
    TAY
    LDA FAR_OFFSET_LO
    CLC
    ADC #$08
    STA FAR_OFFSET_LO
    LDA #$00
    ADC FAR_OFFSET_HI
    STA FAR_OFFSET_HI
    LDA DISPLAY_TEMP_2
    BEQ @plane3_fill
    LDA DISPLAY_PLANE2_FILL
    BEQ @plane3_copy
@plane3_invert:
    LDA (GLYPH_ADDR_LO),Y
    EOR #$FF
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @plane3_invert
    JMP @plane4
@plane3_fill:
    LDA DISPLAY_PLANE2_FILL
@plane3_fill_loop:
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @plane3_fill_loop
    JMP @plane4
@plane3_copy:
    LDA (GLYPH_ADDR_LO),Y
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @plane3_copy
@plane4:
    LDX #$08
    PLA
    TAY
    LDA FAR_OFFSET_LO
    CLC
    ADC #$08
    STA FAR_OFFSET_LO
    LDA #$00
    ADC FAR_OFFSET_HI
    STA FAR_OFFSET_HI
    LDA DISPLAY_TEMP_3
    BEQ @plane4_fill
    LDA DISPLAY_PLANE3_FILL
    BEQ @plane4_copy
@plane4_invert:
    LDA (GLYPH_ADDR_LO),Y
    EOR #$FF
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @plane4_invert
    JMP @tile_done
@plane4_fill:
    LDA DISPLAY_PLANE3_FILL
@plane4_fill_loop:
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @plane4_fill_loop
    JMP @tile_done
@plane4_copy:
    LDA (GLYPH_ADDR_LO),Y
    STA (FAR_OFFSET_LO),Y
    INY
    DEX
    BNE @plane4_copy
@tile_done:
    DEC DISPLAY_TEMP_4
    BEQ @advance_ptr
    JMP @general_tile
@advance_ptr:
    LDA GLYPH_MODE
    AND #$07
    ASL A
    ASL A
    ASL A
    ADC FAR_OFFSET_LO
    STA FAR_OFFSET_LO
    BCC @finish
    INC FAR_OFFSET_HI
@finish:
    PLA
    TAY
    PLA
    TAX
    RTS
; 作用：把屏外缓冲（页 $1F，$8000 起）的内容经 DMA 写到显存 $064C/$064D，长度为 FAR_OFFSET 减 $A001，超出显存范围时截断，等 1 帧
; 调用者：API_3C_3D_PUT_STRING、API_3E_3F_PUT_STRING_ASCII、API_46、API_45_PUT_TEXT_FIELD
TEXT_DMA_BUFFER_TO_VRAM:
    TXA
    PHA
    TYA
    PHA
    LDA #$1F
    STA DMA_SRC_HIGH
    LDA #$80
    STA DMA_SRC_MID
    LDA #$00
    STA DMA_SRC_LOW
    LDA SYS_ARG_0A
    STA DMA_DST_HI
    LDA SYS_ARG_09
    STA DMA_DST_LO
    LDA FAR_OFFSET_LO
    SEC
    SBC #$01
    STA DMA_LEN_LO
    LDA FAR_OFFSET_HI
    SBC #$A0
    STA DMA_LEN_HI
    LDA SYS_ARG_09
    CLC
    ADC DMA_LEN_LO
    LDA SYS_ARG_0A
    ADC DMA_LEN_HI
    BCC @start_dma
    LDA #$FF
    SEC
    SBC SYS_ARG_09
    STA DMA_LEN_LO
    LDA #$FF
    SBC SYS_ARG_0A
    STA DMA_LEN_HI
    LDA #$00
    STA SYS_ARG_0A
@start_dma:
    LDA #$C0
    STA DMA_CTRL
    LDX #$01
    LDA #$1B
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    PLA
    TAY
    PLA
    TAX
    RTS
; 作用：把页 $F8、$F9 映射到窗口 2、3，FAR_OFFSET 置 $A000，$064C/$064D 左移 4 位（乘 16），保持 $0653
; 调用者：API_3C_3D_PUT_STRING、API_3E_3F_PUT_STRING_ASCII、API_46、API_45_PUT_TEXT_FIELD
TEXT_MAP_TEXT_BUFFER:
    LDA SYS_ARG_10
    PHA
    LDA #$F8
    STA SYS_PAGE
    LDA #$02
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$F8
    STA SYS_PAGE
    INC SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$A0
    STA FAR_OFFSET_HI
    ASL SYS_ARG_09
    ROL SYS_ARG_0A
    ASL SYS_ARG_09
    ROL SYS_ARG_0A
    ASL SYS_ARG_09
    ROL SYS_ARG_0A
    ASL SYS_ARG_09
    ROL SYS_ARG_0A
    PLA
    STA SYS_ARG_10
    RTS
; 作用：按 $064E 的位组合（低 2 位与第 4、5 位）查表 TEXT_DRAW_FLAGS_NORMAL/879E/87AE/87BE，决定子功能与 $0652/$0653/$036E/$036F 等绘制选项
; 调用者：API_3C_3D_PUT_STRING、API_3E_3F_PUT_STRING_ASCII、API_46、API_45_PUT_TEXT_FIELD
TEXT_SELECT_DRAW_MODE:
    TXA
    PHA
    LDA SYS_ARG_0B
    AND #$03
    STA DISPLAY_TEMP_1
    LDA SYS_ARG_0B
    AND #$30
    LSR A
    LSR A
    ORA DISPLAY_TEMP_1
    TAX
    LDA SYS_SUBFUNCTION
    BMI @reverse
    LDA TEXT_DRAW_FLAGS_NORMAL,X
    JMP @store_flags
@reverse:
    LDA TEXT_DRAW_FLAGS_REVERSE,X
@store_flags:
    STA SYS_SUBFUNCTION
    LDA TEXT_PLANE2_FILL,X
    STA SYS_ARG_10
    LDA TEXT_PLANE1_FILL,X
    STA SYS_ARG_0F
    LDA SYS_SUBFUNCTION
    AND #$01
    BNE @check_plane2
    STA SYS_ARG_0F
@check_plane2:
    LDA SYS_SUBFUNCTION
    AND #$04
    BNE @check_invert1
    STA SYS_ARG_10
@check_invert1:
    LDA #$FF
    STA DRAW_MODE_TEMP
    STA DISPLAY_TEMP_1
    LDA SYS_SUBFUNCTION
    AND #$02
    BNE @check_invert2
    STA DRAW_MODE_TEMP
@check_invert2:
    LDA SYS_SUBFUNCTION
    AND #$08
    BNE @done
    STA DISPLAY_TEMP_1
@done:
    PLA
    TAX
    RTS
; 作用：画字方式表（子功能位 7 为 0 时用）：16 项，下标由 $064E 的位对折成，值写入 SYS_SUBFUNCTION，其位 0-3 控制两个平面的常量与取反是否生效
; 引用者：TEXT_SELECT_DRAW_MODE
TEXT_DRAW_FLAGS_NORMAL:
    .byte $00,$02,$08,$0A,$03,$01,$0B,$09,$0C,$0E,$04,$06,$0F,$0D,$07,$05
; 作用：画字方式对应的平面 2 常量（写入 $0653）：16 项
; 引用者：TEXT_SELECT_DRAW_MODE
TEXT_PLANE2_FILL:
    .byte $00,$00,$00,$00,$00,$00,$00,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF
; 作用：画字方式对应的平面 1 常量（写入 $0652）：16 项
; 引用者：TEXT_SELECT_DRAW_MODE
TEXT_PLANE1_FILL:
    .byte $00,$00,$00,$00,$FF,$FF,$FF,$FF,$00,$FF,$00,$00,$FF,$FF,$FF,$FF
; 作用：画字方式表（子功能位 7 为 1 时用）：16 项，含义同 TEXT_DRAW_FLAGS_NORMAL
; 引用者：TEXT_SELECT_DRAW_MODE
TEXT_DRAW_FLAGS_REVERSE:
    .byte $05,$06,$09,$0A,$07,$05,$0B,$09,$0D,$0E,$05,$06,$0F,$0D,$07,$05
; 作用：二平面的空白瓦片钩子（WORK_VEC_18_LO）：写 16 字节（前 8 字节填 $0652，后 8 字节填 $0653），FAR_OFFSET 前进 16
; 调用者：API_3C_3D_PUT_STRING（取地址）、API_3E_3F_PUT_STRING_ASCII（取地址）、API_46（取地址）、API_45_PUT_TEXT_FIELD（取地址）
TEXT_BLANK_HOOK_2PLANE:
    TYA
    PHA
    LDY #$07
    LDA SYS_ARG_0F
@loop:
    STA (FAR_OFFSET_LO),Y
    DEY
    BPL @loop
    LDA SYS_ARG_10
    LDY #$08
@fill_plane2:
    STA (FAR_OFFSET_LO),Y
    INY
    CPY #$10
    BCC @fill_plane2
    LDA FAR_OFFSET_LO
    CLC
    ADC #$10
    STA FAR_OFFSET_LO
    LDA #$00
    ADC FAR_OFFSET_HI
    STA FAR_OFFSET_HI
    PLA
    TAY
    RTS
; 作用：跳转到 WORK_VEC_18_LO/WORK_VEC_18_HI 指向的例程
; 调用者：API_3C_3D_PUT_STRING、API_45_PUT_TEXT_FIELD
TEXT_CALL_HOOK_18:
    JMP (WORK_VEC_18_LO)
; 作用：位对序号 0-3 对应的平面常量：$00、$00、$FF、$FF
; 引用者：TEXT_DECODE_FLAGS
TEXT_PLANE_FILL_TABLE:
    .byte $00,$00,$FF,$FF
; 作用：位对序号 0-3 对应的取反掩码：$00、$FF、$FF、$00
; 引用者：TEXT_DECODE_FLAGS
TEXT_PLANE_INVERT_TABLE:
    .byte $00,$FF,$FF,$00
; 作用：把 $064E 的三组位对（$11、$22、$44）各折成 0-3 的序号，查表 TEXT_PLANE_FILL_TABLE/TEXT_PLANE_INVERT_TABLE 得到 $0652、$0653、$0376 与 $036E、$036F 等
; 调用者：API_3C_3D_PUT_STRING、API_3E_3F_PUT_STRING_ASCII、API_46、API_45_PUT_TEXT_FIELD
TEXT_DECODE_FLAGS:
    LDA SYS_ARG_0B
    AND #$11
    STA DISPLAY_TEMP_4
    LSR A
    LSR A
    LSR A
    ORA DISPLAY_TEMP_4
    AND #$03
    TAX
    LDA TEXT_PLANE_FILL_TABLE,X
    STA SYS_ARG_0F
    LDA TEXT_PLANE_INVERT_TABLE,X
    STA DRAW_MODE_TEMP
    LDA SYS_ARG_0B
    AND #$22
    LSR A
    STA DISPLAY_TEMP_4
    LSR A
    LSR A
    LSR A
    ORA DISPLAY_TEMP_4
    AND #$03
    TAX
    LDA TEXT_PLANE_FILL_TABLE,X
    STA SYS_ARG_10
    LDA TEXT_PLANE_INVERT_TABLE,X
    STA DISPLAY_TEMP_1
    LDA SYS_ARG_0B
    AND #$44
    LSR A
    LSR A
    STA DISPLAY_TEMP_4
    LSR A
    LSR A
    LSR A
    ORA DISPLAY_TEMP_4
    AND #$03
    TAX
    LDA TEXT_PLANE_FILL_TABLE,X
    STA DISPLAY_PLANE2_FILL
    LDA TEXT_PLANE_INVERT_TABLE,X
    STA DISPLAY_TEMP_2
    LDA SYS_ARG_0B
    AND #$88
    LSR A
    LSR A
    LSR A
    STA DISPLAY_TEMP_4
    LSR A
    LSR A
    LSR A
    ORA DISPLAY_TEMP_4
    AND #$03
    TAX
    LDA TEXT_PLANE_FILL_TABLE,X
    STA DISPLAY_PLANE3_FILL
    LDA TEXT_PLANE_INVERT_TABLE,X
    STA DISPLAY_TEMP_3
    RTS
; 作用：四平面的空白瓦片钩子（WORK_VEC_18_LO）：写 32 字节，四个平面各 8 字节，分别填 $0652、$0653、$0376、$0377，FAR_OFFSET 前进 32
; 调用者：API_3C_3D_PUT_STRING（取地址）、API_3E_3F_PUT_STRING_ASCII（取地址）、API_46（取地址）、API_45_PUT_TEXT_FIELD（取地址）
TEXT_BLANK_HOOK_4PLANE:
    TYA
    PHA
    LDY #$07
    LDA SYS_ARG_0F
@loop:
    STA (FAR_OFFSET_LO),Y
    DEY
    BPL @loop
    LDA SYS_ARG_10
    LDY #$08
@fill_plane2:
    STA (FAR_OFFSET_LO),Y
    INY
    CPY #$10
    BCC @fill_plane2
    LDA DISPLAY_PLANE2_FILL
@fill_plane3:
    STA (FAR_OFFSET_LO),Y
    INY
    CPY #$18
    BCC @fill_plane3
    LDA DISPLAY_PLANE3_FILL
@fill_plane4:
    STA (FAR_OFFSET_LO),Y
    INY
    CPY #$20
    BCC @fill_plane4
    LDA FAR_OFFSET_LO
    CLC
    ADC #$20
    STA FAR_OFFSET_LO
    LDA #$00
    ADC FAR_OFFSET_HI
    STA FAR_OFFSET_HI
    PLA
    TAY
    RTS
