; ------------------------------------------------------------------------
; 名称：text-to-buffer.asm
; 说明：文字画到内存（功能 $47、$48）：按字模把点阵写进调用者指定的缓冲
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：占ROM 第 F-F 页，汇编地址 $8000 起，后面的文件接在它后面
; ------------------------------------------------------------------------
.org $8000
    LDA SYS_FUNCTION
    SEC
    SBC #$47
    JSR BUFFER_INLINE_JUMP
    .word API_47,API_48
; 作用：页内的内联跳转表副本：返回地址后跟 16 位地址表，按 A 取项并跳转
; 调用者：text-to-buffer.asm 开头的入口代码
BUFFER_INLINE_JUMP:
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
; 作用：跳转到 DRAW_HOOK_LO/DRAW_HOOK_HI 指向的绘制例程（API_47/API_48 在入口处装入）
; 调用者：API_47、API_48
BUFFER_CALL_HOOK_1C:
    JMP (DRAW_HOOK_LO)
; 作用：二平面的画字钩子（DRAW_HOOK_LO）：用 $3B 取字模，每个瓦片先写第一平面 8 字节再写第二平面 8 字节（常量或字模，字模可取反），写完进位目的指针（FAR_OFFSET）
; 调用者：API_47（取地址）、API_48（取地址）
BUFFER_DRAW_HOOK_2PLANE:
    TXA
    PHA
    TYA
    PHA
    LDA #$3B
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
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
; 作用：按 $064E 的位组合（低 2 位与第 4、5 位）查表 BUFFER_DRAW_FLAGS_NORMAL/8149/8159/8169，决定子功能与 $0652/$0653/$036E/$036F 等绘制选项
; 调用者：API_47、API_48
BUFFER_SELECT_DRAW_MODE:
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
    LDA BUFFER_DRAW_FLAGS_NORMAL,X
    JMP @store_flags
@reverse:
    LDA BUFFER_DRAW_FLAGS_REVERSE,X
@store_flags:
    STA SYS_SUBFUNCTION
    LDA BUFFER_PLANE2_FILL,X
    STA SYS_ARG_10
    LDA BUFFER_PLANE1_FILL,X
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
; 作用：画字方式表（子功能位 7 为 0 时用）：16 项，含义同 TEXT_DRAW_FLAGS_NORMAL
; 引用者：BUFFER_SELECT_DRAW_MODE
BUFFER_DRAW_FLAGS_NORMAL:
    .byte $00,$02,$08,$0A,$03,$01,$0B,$09,$0C,$0E,$04,$06,$0F,$0D,$07,$05
; 作用：画字方式对应的平面 2 常量（写入 $0653）：16 项
; 引用者：BUFFER_SELECT_DRAW_MODE
BUFFER_PLANE2_FILL:
    .byte $00,$00,$00,$00,$00,$00,$00,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF,$FF
; 作用：画字方式对应的平面 1 常量（写入 $0652）：16 项
; 引用者：BUFFER_SELECT_DRAW_MODE
BUFFER_PLANE1_FILL:
    .byte $00,$00,$00,$00,$FF,$FF,$FF,$FF,$00,$FF,$00,$00,$FF,$FF,$FF,$FF
; 作用：画字方式表（子功能位 7 为 1 时用）：16 项，含义同 BUFFER_DRAW_FLAGS_NORMAL
; 引用者：BUFFER_SELECT_DRAW_MODE
BUFFER_DRAW_FLAGS_REVERSE:
    .byte $05,$06,$09,$0A,$07,$05,$0B,$09,$0D,$0E,$05,$06,$0F,$0D,$07,$05
; 作用：二平面的空白瓦片钩子（WORK_VEC_18_LO，机器码）：在 FAR_OFFSET 处写 16 字节（前 8 字节填 $0652，后 8 字节填 $0653）并把目的指针进 16
; 调用者：API_47（取地址）、API_48（取地址）
BUFFER_BLANK_HOOK_2PLANE:
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
; 调用者：API_47
BUFFER_CALL_HOOK_18:
    JMP (WORK_VEC_18_LO)
; 作用：功能 $47：把字符串画成点阵瓦片写进调用者指定的扩展 RAM 地址（目的地址 $12/$13 与页组 $0643，字符串 $0C/$0D 与页组 $0642），规则同 $3C/$3D；
; 结束符 $0653，$0650:$064F 调用时是目的区容量，返回时是实际写入的字节数；$0652 为 4 画二平面，0 查 $062E 位 7，其他画四平面
; 调用者：text-to-buffer.asm 开头的入口代码（地址表）
API_47:
    LDA SYS_ARG_0D
    PHA
    LDA SYS_ARG_0C
    PHA
    LDA SYS_ARG_10
    STA DISPLAY_COUNT
    LDA SYS_ARG_0F
    BEQ @query_mode
    CMP #$04
    BEQ @two_plane
    BNE @four_plane
@query_mode:
    LDA #$00
    STA SYS_SUBFUNCTION
    LDA #$1E
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA SYS_ARG_0F
    BNE @four_plane
@two_plane:
    JSR BUFFER_SELECT_DRAW_MODE
    LDA #<BUFFER_DRAW_HOOK_2PLANE
    STA DRAW_HOOK_LO
    LDA #>BUFFER_DRAW_HOOK_2PLANE
    STA DRAW_HOOK_HI
    LDA #<BUFFER_BLANK_HOOK_2PLANE
    STA WORK_VEC_18_LO
    LDA #>BUFFER_BLANK_HOOK_2PLANE
    STA WORK_VEC_18_HI
    LDA #$20
    STA DISPLAY_TILE_BYTES
    JMP @map_buffer
@four_plane:
    JSR BUFFER_DECODE_FLAGS
    LDA #<BUFFER_DRAW_HOOK_4PLANE
    STA DRAW_HOOK_LO
    LDA #>BUFFER_DRAW_HOOK_4PLANE
    STA DRAW_HOOK_HI
    LDA #<BUFFER_BLANK_HOOK_4PLANE
    STA WORK_VEC_18_LO
    LDA #>BUFFER_BLANK_HOOK_4PLANE
    STA WORK_VEC_18_HI
    LDA #$40
    STA DISPLAY_TILE_BYTES
@map_buffer:
    JSR BUFFER_MAP_FAR_BUFFER
@loop:
    LDA SYS_ARG_0C
    PHA
    LDX #$00
    STX SYS_ARG_0C
    JSR VEC_FAR_COPY_IN
    PLA
    STA SYS_ARG_0C
    LDX #$00
@next_char:
    LDA COPY_BUFFER,X
    CMP DISPLAY_COUNT
    BNE @not_end
    JMP @finish
@not_end:
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
    LDA DISPLAY_TILE_BYTES
    ASL A
    STA DISPLAY_CHAR_BYTES
    LDA SYS_ARG_0C
    SEC
    SBC DISPLAY_CHAR_BYTES
    STA SYS_ARG_0C
    LDA SYS_ARG_0D
    SBC #$00
    STA SYS_ARG_0D
    BCC @capacity_exceeded
    JSR BUFFER_CALL_HOOK_1C
    JMP @after_draw
@single_char:
    LDA DISPLAY_TILE_BYTES
    STA DISPLAY_CHAR_BYTES
    LDA SYS_ARG_0C
    SEC
    SBC DISPLAY_CHAR_BYTES
    STA SYS_ARG_0C
    LDA SYS_ARG_0D
    SBC #$00
    STA SYS_ARG_0D
    BCC @capacity_exceeded
    LDA GLYPH_MODE
    BMI @draw_single
    JSR BUFFER_CALL_HOOK_18
@draw_single:
    LDA COPY_BUFFER,X
    STA SYS_ARG_08
    LDA #$00
    STA SYS_ARG_07
    JSR BUFFER_CALL_HOOK_1C
@after_draw:
    LDA FAR_OFFSET_HI
    CMP #$B0
    BCS @remap
@next_byte:
    INX
    BNE @continue
    INC PROG_ENTRY_HI
    JMP @loop
@continue:
    JMP @next_char
@remap:
    JSR BUFFER_REMAP_WINDOWS_23
    JMP @next_byte
@capacity_exceeded:
    LDA SYS_ARG_0C
    CLC
    ADC DISPLAY_CHAR_BYTES
    STA SYS_ARG_0C
    LDA #$00
    STA SYS_ARG_0D
@finish:
    PLA
    SEC
    SBC SYS_ARG_0C
    STA SYS_ARG_0C
    PLA
    SBC SYS_ARG_0D
    STA SYS_ARG_0D
    RTS
; 作用：把 DST_ADDR_LO/DST_ADDR_HI、$0643 指向的数据经 $2C 换成远地址，用 $29 把相邻两页映射到窗口 2、3，FAR_OFFSET_HI 并入 $A0；保护并恢复 SYS_GROUP、PROG_ENTRY
; 调用者：API_47、API_48
BUFFER_MAP_FAR_BUFFER:
    LDA SYS_ARG_10
    PHA
    LDA SYS_GROUP
    PHA
    LDA PROG_ENTRY_LO
    PHA
    LDA PROG_ENTRY_HI
    PHA
    LDA SYS_ARG_00
    STA SYS_GROUP
    LDA DST_ADDR_LO
    STA PROG_ENTRY_LO
    LDA DST_ADDR_HI
    STA PROG_ENTRY_HI
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$02
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    INC SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA FAR_OFFSET_HI
    ORA #$A0
    STA FAR_OFFSET_HI
    PLA
    STA PROG_ENTRY_HI
    PLA
    STA PROG_ENTRY_LO
    PLA
    STA SYS_GROUP
    PLA
    STA SYS_ARG_10
    RTS
; 作用：用 $29 把 SYS_PAGE 与 SYS_PAGE+1 映射到窗口 2、3，FAR_OFFSET_HI 置 $A0
; 调用者：API_47、API_48
BUFFER_REMAP_WINDOWS_23:
    LDA SYS_ARG_10
    PHA
    LDA #$02
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    INC SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$A0
    STA FAR_OFFSET_HI
    PLA
    STA SYS_ARG_10
    RTS
; 作用：功能 $48：同 $47，但只处理单字节字符（规则同 $3E/$3F），不补空白瓦片；$0638 位 7 为 1 时每个字符占两倍字节
; 调用者：text-to-buffer.asm 开头的入口代码（地址表）
API_48:
    LDA SYS_ARG_0D
    PHA
    LDA SYS_ARG_0C
    PHA
    LDA SYS_ARG_10
    STA DISPLAY_COUNT
    LDA SYS_ARG_0F
    BEQ @query_mode
    CMP #$04
    BEQ @two_plane
    BNE @four_plane
@query_mode:
    LDA #$00
    STA SYS_SUBFUNCTION
    LDA #$1E
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA SYS_ARG_0F
    BNE @four_plane
@two_plane:
    JSR BUFFER_SELECT_DRAW_MODE
    LDA #<BUFFER_DRAW_HOOK_2PLANE
    STA DRAW_HOOK_LO
    LDA #>BUFFER_DRAW_HOOK_2PLANE
    STA DRAW_HOOK_HI
    LDA #<BUFFER_BLANK_HOOK_2PLANE
    STA WORK_VEC_18_LO
    LDA #>BUFFER_BLANK_HOOK_2PLANE
    STA WORK_VEC_18_HI
    LDA #$10
    STA DISPLAY_TILE_BYTES
    JMP @map_buffer
@four_plane:
    JSR BUFFER_DECODE_FLAGS
    LDA #<BUFFER_DRAW_HOOK_4PLANE
    STA DRAW_HOOK_LO
    LDA #>BUFFER_DRAW_HOOK_4PLANE
    STA DRAW_HOOK_HI
    LDA #<BUFFER_BLANK_HOOK_4PLANE
    STA WORK_VEC_18_LO
    LDA #>BUFFER_BLANK_HOOK_4PLANE
    STA WORK_VEC_18_HI
    LDA #$20
    STA DISPLAY_TILE_BYTES
@map_buffer:
    JSR BUFFER_MAP_FAR_BUFFER
@loop:
    LDA SYS_ARG_0C
    PHA
    LDX #$00
    STX SYS_ARG_0C
    JSR VEC_FAR_COPY_IN
    PLA
    STA SYS_ARG_0C
    LDX #$00
@next_char:
    LDA COPY_BUFFER,X
    CMP DISPLAY_COUNT
    BEQ @finish
    LDA COPY_BUFFER,X
    STA SYS_ARG_08
    LDA #$00
    STA SYS_ARG_07
    LDA GLYPH_MODE
    BPL @single_width
    LDA DISPLAY_TILE_BYTES
    ASL A
    JMP @set_char_bytes
@single_width:
    LDA DISPLAY_TILE_BYTES
@set_char_bytes:
    STA DISPLAY_CHAR_BYTES
    LDA SYS_ARG_0C
    SEC
    SBC DISPLAY_CHAR_BYTES
    STA SYS_ARG_0C
    LDA SYS_ARG_0D
    SBC #$00
    STA SYS_ARG_0D
    BCC @capacity_exceeded
    JSR BUFFER_CALL_HOOK_1C
    LDA FAR_OFFSET_HI
    CMP #$B0
    BCS @remap
@next_byte:
    INX
    BNE @next_char
    INC PROG_ENTRY_HI
    JMP @loop
@remap:
    JSR BUFFER_REMAP_WINDOWS_23
    JMP @next_byte
@capacity_exceeded:
    LDA SYS_ARG_0C
    CLC
    ADC DISPLAY_CHAR_BYTES
    STA SYS_ARG_0C
    LDA #$00
    STA SYS_ARG_0D
@finish:
    PLA
    SEC
    SBC SYS_ARG_0C
    STA SYS_ARG_0C
    PLA
    SBC SYS_ARG_0D
    STA SYS_ARG_0D
    RTS
; 作用：位对序号 0-3 对应的平面常量：$00、$00、$FF、$FF
; 引用者：BUFFER_DECODE_FLAGS
BUFFER_PLANE_FILL_TABLE:
    .byte $00,$00,$FF,$FF
; 作用：位对序号 0-3 对应的取反掩码：$00、$FF、$FF、$00
; 引用者：BUFFER_DECODE_FLAGS
BUFFER_PLANE_INVERT_TABLE:
    .byte $00,$FF,$FF,$00
; 作用：把 $064E 的三组位对（$11、$22、$44）各折成 0-3 的序号，查表 BUFFER_PLANE_FILL_TABLE/BUFFER_PLANE_INVERT_TABLE 得到 $0652、$0653、$0376 与 $036E、$036F 等
; 调用者：API_47、API_48
BUFFER_DECODE_FLAGS:
    LDA SYS_ARG_0B
    AND #$11
    STA DISPLAY_TEMP_4
    LSR A
    LSR A
    LSR A
    ORA DISPLAY_TEMP_4
    AND #$03
    TAX
    LDA BUFFER_PLANE_FILL_TABLE,X
    STA SYS_ARG_0F
    LDA BUFFER_PLANE_INVERT_TABLE,X
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
    LDA BUFFER_PLANE_FILL_TABLE,X
    STA SYS_ARG_10
    LDA BUFFER_PLANE_INVERT_TABLE,X
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
    LDA BUFFER_PLANE_FILL_TABLE,X
    STA DISPLAY_PLANE2_FILL
    LDA BUFFER_PLANE_INVERT_TABLE,X
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
    LDA BUFFER_PLANE_FILL_TABLE,X
    STA DISPLAY_PLANE3_FILL
    LDA BUFFER_PLANE_INVERT_TABLE,X
    STA DISPLAY_TEMP_3
    RTS
; 作用：四平面的空白瓦片钩子（WORK_VEC_18_LO）：在 FAR_OFFSET 处写 32 字节，四个平面各 8 字节，分别填 $0652、$0653、$0376、$0377，目的指针进 32
; 调用者：API_47（取地址）、API_48（取地址）
BUFFER_BLANK_HOOK_4PLANE:
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
; 作用：四平面的画字钩子（DRAW_HOOK_LO）：用 $3B 取字模，每个瓦片写 32 字节（四个平面各 8 字节，常量或字模，字模可取反）；$064E 为 $01、$12 时走省去判断的快速写法，结果与一般写法相同
; 调用者：API_47（取地址）、API_48（取地址）
BUFFER_DRAW_HOOK_4PLANE:
    TXA
    PHA
    TYA
    PHA
    LDA #$3B
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
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
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00
