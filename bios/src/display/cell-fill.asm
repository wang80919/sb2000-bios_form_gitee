; 作用：------------------------------------------------------------------------
; 名称：cell-fill.asm
; 说明：单元填充与文字域（功能 $40、$41、$45、$46）
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：在 ROM 里接在 display/text-output.asm 之后
; ------------------------------------------------------------------------
; 功能 $40：子功能位 2、3 为 0 时从起点线性写 $064C/$064D 常量单元，为 01 时从 $0C/$0D（页组 $0642）指向的内存按行复制单元（行宽 $064B，行距 $064A+1），其余按列复制（高度 $064A+1，列距 $064B）；先经 $94B0 合成属性字节（用例 p08-display.mjs）
; 调用者：text-output.asm 开头的入口代码（地址表）
API_40:
    LDA SYS_SUBFUNCTION
    STA DRAW_MODE_TEMP
    JSR CELL_COMBINE_ATTR
    LDA DRAW_MODE_TEMP
    AND #$0C
    BEQ @linear
    JMP @copy_modes
@linear:
    JSR TEXT_GET_NAMETABLE_MAP3
    JSR TEXT_LIMIT_LENGTH
    LDA SYS_ARG_0C
    BEQ @count_adjusted
    INC SYS_ARG_0D
@count_adjusted:
    LDA SYS_ARG_0E
    BMI @wait_mode
    JMP @check_batch
@wait_mode:
    LDA SYS_ARG_0E
    AND #$7F
    TAX
    DEX
@wait_loop:
    JSR TEXT_PUT_CELL_NEXT
    JSR TEXT_CALL_DMA_NAMETABLE
    CPX #$00
    BEQ @after_dma
    LDA #$1B
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
@after_dma:
    DEC SYS_ARG_0C
    BNE @wait_continue
    DEC SYS_ARG_0D
    BEQ @wait_done
@wait_continue:
    JMP @wait_loop
@wait_done:
    RTS
@check_batch:
    LDA SYS_ARG_0E
    BEQ @plain_fill
@batch_loop:
    LDX SYS_ARG_0E
    JSR TEXT_PUT_CELL_NEXT
    DEX
    BNE @batch_counted
    JSR TEXT_CALL_DMA_NAMETABLE
@batch_counted:
    DEC SYS_ARG_0C
    BNE @batch_continue
    DEC SYS_ARG_0D
    BEQ @batch_done
@batch_continue:
    JMP @batch_loop
@batch_done:
    JSR TEXT_CALL_DMA_NAMETABLE
    RTS
@plain_fill:
    LDY #$00
    LDX SYS_ARG_09
@fill_loop:
    TXA
    STA (FAR_OFFSET_LO),Y
    INY
    LDA SYS_ARG_0A
    STA (FAR_OFFSET_LO),Y
    INY
    BNE @no_wrap
    INC FAR_OFFSET_HI
@no_wrap:
    DEC SYS_ARG_0C
    BNE @fill_continue
    DEC SYS_ARG_0D
    BEQ @fill_done
@fill_continue:
    JMP @fill_loop
@fill_done:
    JSR TEXT_CALL_DMA_NAMETABLE
    RTS
@copy_modes:
    LDA DRAW_MODE_TEMP
    AND #$0C
    CMP #$04
    BEQ @copy_rows
    JMP @column_copy
@copy_rows:
    LDA SYS_ARG_0C
    BEQ @row_count_adjusted
    INC SYS_ARG_0D
@row_count_adjusted:
    JSR TEXT_MAP_SOURCE_STRING
    JSR TEXT_GET_NAMETABLE_MAP3
    INC SYS_ARG_07
    LDA #$20
    SEC
    SBC SYS_ARG_05
    CMP SYS_ARG_08
    BCS @width_clamped
    STA SYS_ARG_08
@width_clamped:
    LDA SYS_ARG_0D
    BNE @row_has_count
    LDA SYS_ARG_0C
    BNE @row_has_count
    JMP @return
@row_has_count:
    LDA SYS_ARG_0E
    BMI @row_wait_mode
    JMP @row_check_batch
@row_wait_mode:
    LDA SYS_ARG_0E
    AND #$7F
    TAX
    DEX
    LDA #$00
    STA DISPLAY_TEMP_1
@row_wait_loop:
    JSR TEXT_COPY_CELL_NEXT_COL
    JSR TEXT_CALL_DMA_NAMETABLE
    CPX #$00
    BEQ @row_after_dma
    LDA #$1B
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
@row_after_dma:
    INC DISPLAY_TEMP_1
    LDA DISPLAY_TEMP_1
    CMP SYS_ARG_08
    BCC @row_count_next
    LDA SYS_ARG_06
    CLC
    ADC SYS_ARG_07
    STA SYS_ARG_06
    CMP #$1F
    BCS @return
    JSR TEXT_GET_NAMETABLE_ADDR
    LDA #$00
    STA DISPLAY_TEMP_1
@row_count_next:
    DEC SYS_ARG_0C
    BNE @row_continue
    DEC SYS_ARG_0D
    BEQ @return
@row_continue:
    JMP @row_wait_loop
@return:
    RTS
@row_check_batch:
    LDA SYS_ARG_0E
    BEQ @row_plain
    LDA #$00
    STA DISPLAY_TEMP_1
    LDX SYS_ARG_08
@row_batch_loop:
    JSR TEXT_COPY_CELL_NEXT_COL
    DEX
    BNE @row_batch_counted
    LDA SYS_ARG_06
    CLC
    ADC SYS_ARG_07
    STA SYS_ARG_06
    CMP #$1F
    BCS @row_batch_done
    JSR TEXT_GET_NAMETABLE_ADDR
    LDX SYS_ARG_08
@row_batch_counted:
    INC DISPLAY_TEMP_1
    LDA DISPLAY_TEMP_1
    CMP SYS_ARG_0E
    BCC @row_batch_flushed
    JSR TEXT_CALL_DMA_NAMETABLE
    LDA #$00
    STA DISPLAY_TEMP_1
@row_batch_flushed:
    DEC SYS_ARG_0C
    BNE @row_batch_continue
    DEC SYS_ARG_0D
    BEQ @row_batch_done
@row_batch_continue:
    JMP @row_batch_loop
@row_batch_done:
    JSR TEXT_CALL_DMA_NAMETABLE
    RTS
@row_plain:
    LDX SYS_ARG_08
@row_plain_loop:
    JSR TEXT_COPY_CELL_NEXT_COL
    DEX
    BNE @row_plain_counted
    LDA SYS_ARG_06
    CLC
    ADC SYS_ARG_07
    STA SYS_ARG_06
    CMP #$1F
    BCS @row_plain_done
    JSR TEXT_GET_NAMETABLE_ADDR
    LDX SYS_ARG_08
@row_plain_counted:
    DEC SYS_ARG_0C
    BNE @row_plain_continue
    DEC SYS_ARG_0D
    BEQ @row_plain_done
@row_plain_continue:
    JMP @row_plain_loop
@row_plain_done:
    JSR TEXT_CALL_DMA_NAMETABLE
    RTS
@column_copy:
    LDA SYS_ARG_0C
    BEQ @col_count_adjusted
    INC SYS_ARG_0D
@col_count_adjusted:
    JSR TEXT_MAP_SOURCE_STRING
    JSR TEXT_GET_NAMETABLE_MAP3
    INC SYS_ARG_07
    LDA #$1E
    SEC
    SBC SYS_ARG_06
    CMP SYS_ARG_07
    BCS @col_height_clamped
    STA SYS_ARG_07
@col_height_clamped:
    LDA SYS_ARG_0D
    BNE @col_has_count
    LDA SYS_ARG_0C
    BNE @col_has_count
    JMP @return2
@col_has_count:
    LDA SYS_ARG_0E
    BMI @col_wait_mode
    JMP @col_check_batch
@col_wait_mode:
    LDA SYS_ARG_0E
    AND #$7F
    TAX
    DEX
    LDA #$00
    STA DISPLAY_TEMP_1
@col_wait_loop:
    JSR TEXT_COPY_CELL_NEXT_ROW
    JSR TEXT_CALL_DMA_NAMETABLE
    CPX #$00
    BEQ @col_after_dma
    LDA #$1B
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
@col_after_dma:
    INC DISPLAY_TEMP_1
    LDA DISPLAY_TEMP_1
    CMP SYS_ARG_07
    BCC @col_count_next
    LDA SYS_ARG_05
    CLC
    ADC SYS_ARG_08
    STA SYS_ARG_05
    CMP #$20
    BCS @return2
    JSR TEXT_GET_NAMETABLE_ADDR
    LDA #$00
    STA DISPLAY_TEMP_1
@col_count_next:
    DEC SYS_ARG_0C
    BNE @col_continue
    DEC SYS_ARG_0D
    BEQ @return2
@col_continue:
    JMP @col_wait_loop
@return2:
    RTS
@col_check_batch:
    LDA SYS_ARG_0E
    BEQ @col_plain
    LDA #$00
    STA DISPLAY_TEMP_1
    LDX SYS_ARG_07
@col_batch_loop:
    JSR TEXT_COPY_CELL_NEXT_ROW
    DEX
    BNE @col_batch_counted
    LDA SYS_ARG_05
    CLC
    ADC SYS_ARG_08
    STA SYS_ARG_05
    CMP #$20
    BCS @col_batch_counted
    JSR TEXT_GET_NAMETABLE_ADDR
    LDX SYS_ARG_07
@col_batch_counted:
    INC DISPLAY_TEMP_1
    LDA DISPLAY_TEMP_1
    CMP SYS_ARG_0E
    BCC @col_batch_flushed
    JSR TEXT_CALL_DMA_NAMETABLE
    LDA #$00
    STA DISPLAY_TEMP_1
@col_batch_flushed:
    DEC SYS_ARG_0C
    BNE @col_batch_continue
    DEC SYS_ARG_0D
    BEQ @col_batch_done
@col_batch_continue:
    JMP @col_batch_loop
@col_batch_done:
    JSR TEXT_CALL_DMA_NAMETABLE
    JMP @wait_done
@col_plain:
    LDX SYS_ARG_07
@col_plain_loop:
    JSR TEXT_COPY_CELL_NEXT_ROW
    DEX
    BNE @col_plain_counted
    LDA SYS_ARG_05
    CLC
    ADC SYS_ARG_08
    STA SYS_ARG_05
    CMP #$20
    BCS @col_plain_done
    JSR TEXT_GET_NAMETABLE_ADDR
    LDX SYS_ARG_07
@col_plain_counted:
    DEC SYS_ARG_0C
    BNE @col_plain_continue
    DEC SYS_ARG_0D
    BEQ @col_plain_done
@col_plain_continue:
    JMP @col_plain_loop
@col_plain_done:
    JSR TEXT_CALL_DMA_NAMETABLE
    RTS
; 作用：起点单元序号取 SYS_ARG_06×32 加 SYS_ARG_05，用 $0400 减去后与 SYS_ARG_0C/SYS_ARG_0D（单元总数）取较小者，限制字符串不越出屏幕缓冲。
; 输入：SYS_ARG_05、SYS_ARG_06、SYS_ARG_0C/0D。
; 输出：SYS_ARG_0C/0D。
; 调用者：API_40
TEXT_LIMIT_LENGTH:
    LDA SYS_ARG_06
    STA DISPLAY_TEMP_3
    LDA #$00
    LSR DISPLAY_TEMP_3
    ROR A
    LSR DISPLAY_TEMP_3
    ROR A
    LSR DISPLAY_TEMP_3
    ROR A
    ORA SYS_ARG_05
    STA DISPLAY_TEMP_2
    LDA #$00
    SEC
    SBC DISPLAY_TEMP_2
    STA DISPLAY_TEMP_2
    LDA #$04
    SBC DISPLAY_TEMP_3
    STA DISPLAY_TEMP_3
    CMP SYS_ARG_0D
    BEQ @compare_low
    BCS @return
    BCC @limit
@compare_low:
    LDA DISPLAY_TEMP_2
    CMP SYS_ARG_0C
    BCS @return
@limit:
    LDA DISPLAY_TEMP_3
    STA SYS_ARG_0D
    LDA DISPLAY_TEMP_2
    STA SYS_ARG_0C
@return:
    RTS
; 作用：把 SYS_ARG_09/SYS_ARG_0A 写进 FAR_OFFSET 处，FAR_OFFSET 前进 2 字节。
; 输入：FAR_OFFSET_LO/HI、SYS_ARG_09/0A。
; 调用者：API_40
TEXT_PUT_CELL_NEXT:
    LDY #$00
    LDA SYS_ARG_09
    STA (FAR_OFFSET_LO),Y
    LDY #$01
    LDA SYS_ARG_0A
    STA (FAR_OFFSET_LO),Y
    LDA FAR_OFFSET_LO
    CLC
    ADC #$02
    STA FAR_OFFSET_LO
    LDA #$00
    ADC FAR_OFFSET_HI
    STA FAR_OFFSET_HI
    RTS
; 作用：把 WORK_VEC_18_LO 指向的 2 字节复制到 FAR_OFFSET 处，两个指针各前进 2 字节
; 调用者：API_40
TEXT_COPY_CELL_NEXT_COL:
    LDY #$00
    LDA (WORK_VEC_18_LO),Y
    STA (FAR_OFFSET_LO),Y
    INY
    LDA (WORK_VEC_18_LO),Y
    STA (FAR_OFFSET_LO),Y
    LDA WORK_VEC_18_LO
    CLC
    ADC #$02
    STA WORK_VEC_18_LO
    LDA #$00
    ADC WORK_VEC_18_HI
    STA WORK_VEC_18_HI
    LDA FAR_OFFSET_LO
    CLC
    ADC #$02
    STA FAR_OFFSET_LO
    LDA #$00
    ADC FAR_OFFSET_HI
    STA FAR_OFFSET_HI
    RTS
; 作用：把 WORK_VEC_18_LO 指向的 2 字节复制到 FAR_OFFSET 处，WORK_VEC_18_LO 前进 2、FAR_OFFSET 前进 $40（下一行）
; 调用者：API_40
TEXT_COPY_CELL_NEXT_ROW:
    LDY #$00
    LDA (WORK_VEC_18_LO),Y
    STA (FAR_OFFSET_LO),Y
    LDY #$01
    LDA (WORK_VEC_18_LO),Y
    STA (FAR_OFFSET_LO),Y
    LDA WORK_VEC_18_LO
    CLC
    ADC #$02
    STA WORK_VEC_18_LO
    LDA #$00
    ADC WORK_VEC_18_HI
    STA WORK_VEC_18_HI
    LDA FAR_OFFSET_LO
    CLC
    ADC #$40
    STA FAR_OFFSET_LO
    LDA #$00
    ADC FAR_OFFSET_HI
    STA FAR_OFFSET_HI
    RTS
; 作用：以 DRAW_MODE_TEMP 低 2 位作子功能调用功能 $30（名称表写显存的 DMA）。
; 调用者：API_40
TEXT_CALL_DMA_NAMETABLE:
    LDA DRAW_MODE_TEMP
    AND #$03
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：经功能 $2C 把字符串地址换成远地址，FAR_OFFSET 并入 $A0 存 WORK_VEC_18_LO/WORK_VEC_18_HI，再映射到窗口 2。
; 调用者：API_40
TEXT_MAP_SOURCE_STRING:
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA FAR_OFFSET_LO
    STA WORK_VEC_18_LO
    LDA FAR_OFFSET_HI
    ORA #$A0
    STA WORK_VEC_18_HI
    LDA #$29
    STA SYS_FUNCTION
    LDA #$02
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    RTS
; 作用：功能 $46：与 $45 相同，但只处理单字节字符、不补空白瓦片、只写一行单元：第 i 列值为 $064D:$064C + 步长×i（用例 p08-display.mjs）
; 调用者：text-output.asm 开头的入口代码（地址表）
API_46:
    LDA SYS_ARG_09
    STA FIELD_TILE_LO
    LDA SYS_ARG_0A
    STA FIELD_TILE_HI
    AND #$0F
    STA SYS_ARG_0A
    LDA SYS_SUBFUNCTION
    STA FIELD_SUBFUNCTION
    LDA #$1E
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA SYS_ARG_0F
    BNE @mode_4plane
    LDA #$01
    STA FIELD_TILE_STEP
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
@mode_4plane:
    LDA #$02
    STA FIELD_TILE_STEP
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
    LDX #$00
    LDA #$20
    STA SYS_ARG_0C
    JSR VEC_FAR_COPY_IN
    LDA #$20
    SEC
    SBC SYS_ARG_05
    STA SYS_ARG_0C
    LDX #$00
    LDY #$00
@loop:
    LDA COPY_BUFFER,X
    BEQ @text_done
    LDA COPY_BUFFER,X
    STA SYS_ARG_08
    LDA #$00
    STA SYS_ARG_07
    JSR TEXT_CALL_HOOK_1C
    INX
    INY
    CPY SYS_ARG_0C
    BCC @loop
@text_done:
    LDA FAR_OFFSET_HI
    SEC
    SBC #$A0
    ORA FAR_OFFSET_LO
    BEQ @return
    JSR TEXT_DMA_BUFFER_TO_VRAM
    JSR TEXT_FILL_ROW_CELLS
@return:
    RTS
; 作用：按 Y 个单元把 SYS_ARG_09/SYS_ARG_0A 每次递增 FIELD_TILE_STEP 写进一行屏幕缓冲，然后调用 $30 刷新到显存（API_45/API_46 的收尾）。
; 输入：Y=单元个数，FIELD_TILE_LO/HI、FIELD_TILE_STEP、FIELD_SUBFUNCTION。
; 调用者：API_46
TEXT_FILL_ROW_CELLS:
    LDA FIELD_TILE_LO
    STA SYS_ARG_09
    LDA FIELD_TILE_HI
    STA SYS_ARG_0A
    LDA FIELD_SUBFUNCTION
    STA DRAW_MODE_TEMP
    JSR TEXT_GET_NAMETABLE_MAP3
    TYA
    TAX
    LDY #$00
@loop:
    LDA SYS_ARG_09
    STA (FAR_OFFSET_LO),Y
    INY
    LDA SYS_ARG_0A
    STA (FAR_OFFSET_LO),Y
    INY
    LDA SYS_ARG_09
    CLC
    ADC FIELD_TILE_STEP
    STA SYS_ARG_09
    LDA #$00
    ADC SYS_ARG_0A
    STA SYS_ARG_0A
    DEX
    BNE @loop
    LDA FIELD_SUBFUNCTION
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：功能 $45：在 $0648 列、$0649 行起显示 $0C/$0D（页组 $0642）指向的字符串，宽度限制在 32 列内；$064C/$064D 是单元的基础值（DOS 用 $6F80 画状态栏），$0652 非 0 用另一套字模（实测）
; 调用者：text-output.asm 开头的入口代码（地址表）
API_45_PUT_TEXT_FIELD:
    LDA SYS_SUBFUNCTION
    STA FIELD_SUBFUNCTION
    LDA SYS_ARG_09
    STA FIELD_TILE_LO
    LDA SYS_ARG_0A
    STA FIELD_TILE_HI
    AND #$0F
    STA SYS_ARG_0A
    LDA #$1E
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA SYS_ARG_0F
    BNE @mode_4plane
    LDA #$01
    STA FIELD_TILE_STEP
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
@mode_4plane:
    LDA #$02
    STA FIELD_TILE_STEP
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
    LDX #$00
    LDA #$20
    STA SYS_ARG_0C
    JSR VEC_FAR_COPY_IN
    LDA #$20
    SEC
    SBC SYS_ARG_05
    STA SYS_ARG_0C
    LDX #$00
    LDY #$00
@loop:
    LDA COPY_BUFFER,X
    BEQ @text_done
    CMP #$A1
    BCC @single_byte
    STA SYS_ARG_07
    INX
    LDA COPY_BUFFER,X
    STA SYS_ARG_08
    INX
    INY
    CPY SYS_ARG_0C
    BCS @dbcs_overflow
    JSR TEXT_CALL_HOOK_1C
    INY
    JMP @loop
@dbcs_overflow:
    DEY
    JMP @text_done
@single_byte:
    LDA GLYPH_MODE
    BMI @hook_1c
    JSR TEXT_CALL_HOOK_18
@hook_1c:
    LDA COPY_BUFFER,X
    STA SYS_ARG_08
    LDA #$00
    STA SYS_ARG_07
    JSR TEXT_CALL_HOOK_1C
    INX
    INY
    CPY SYS_ARG_0C
    BCC @loop
@text_done:
    LDA FAR_OFFSET_HI
    SEC
    SBC #$A0
    ORA FAR_OFFSET_LO
    BEQ @return
    JSR TEXT_DMA_BUFFER_TO_VRAM
    JSR TEXT_FILL_TWO_ROW_CELLS
@return:
    RTS
; 作用：一次写上下两行的单元（行距 $40），SYS_ARG_09 每次加 FIELD_TILE_STEP，再调用 $30 刷新到显存。
; 输入：Y=单元个数，FIELD_TILE_LO/HI、FIELD_TILE_STEP、FIELD_SUBFUNCTION。
; 调用者：API_45_PUT_TEXT_FIELD
TEXT_FILL_TWO_ROW_CELLS:
    LDA FIELD_TILE_LO
    STA SYS_ARG_09
    LDA FIELD_TILE_HI
    STA SYS_ARG_0A
    LDA FIELD_SUBFUNCTION
    STA DRAW_MODE_TEMP
    JSR TEXT_GET_NAMETABLE_MAP3
    TYA
    TAX
@loop:
    LDY #$01
    LDA SYS_ARG_0A
    STA (FAR_OFFSET_LO),Y
    DEY
    LDA SYS_ARG_09
    STA (FAR_OFFSET_LO),Y
    LDY #$40
    CLC
    ADC FIELD_TILE_STEP
    STA SYS_ARG_09
    STA (FAR_OFFSET_LO),Y
    BCC @no_carry
    INC SYS_ARG_0A
@no_carry:
    INY
    LDA SYS_ARG_0A
    STA (FAR_OFFSET_LO),Y
    LDA SYS_ARG_09
    CLC
    ADC FIELD_TILE_STEP
    STA SYS_ARG_09
    LDA #$00
    ADC SYS_ARG_0A
    STA SYS_ARG_0A
    LDA FAR_OFFSET_LO
    CLC
    ADC #$02
    STA FAR_OFFSET_LO
    LDA #$00
    ADC FAR_OFFSET_HI
    STA FAR_OFFSET_HI
    DEX
    BNE @loop
    LDA FIELD_SUBFUNCTION
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：功能 $41：矩形填充：左上角 $0648 列、$0649 行，宽 $064B 个单元，总共 $064F/$0650 个单元（高 = 总数 ÷ 宽），每个单元的值取 $064C/$064D，宽度限制在 32 列内；EDIT 用它整块清出编辑区（实测重放 30 列×12 行）
; 调用者：text-output.asm 开头的入口代码（地址表）
API_41_FILL_RECT:
    LDA SYS_SUBFUNCTION
    STA DRAW_MODE_TEMP
    INC SYS_ARG_07
    INC SYS_ARG_07
    LDA #$20
    SEC
    SBC SYS_ARG_05
    CMP SYS_ARG_08
    BCS @clamped
    STA SYS_ARG_08
@clamped:
    JSR TEXT_CHECK_FONT_MODE
    JSR CELL_COMBINE_ATTR
    JSR TEXT_GET_NAMETABLE_MAP3
    LDA SYS_ARG_0C
    BEQ @count_adjusted
    INC SYS_ARG_0D
@count_adjusted:
    LDA SYS_ARG_0D
    BNE @has_count
    LDA SYS_ARG_0C
    BNE @has_count
    JMP @return
@has_count:
    LDA SYS_ARG_0E
    BMI @wait_mode
    JMP @check_batch
@wait_mode:
    LDA SYS_ARG_0E
    AND #$7F
    TAX
    DEX
    LDA #$00
    STA DISPLAY_TEMP_1
@loop:
    JSR TEXT_PUT_CELL
    LDA DRAW_MODE_TEMP
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    CPX #$00
    BEQ @after_wait
    LDA #$1B
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
@after_wait:
    INC DISPLAY_TEMP_1
    LDA DISPLAY_TEMP_1
    CMP SYS_ARG_08
    BCC @count_next
    LDA SYS_ARG_06
    CLC
    ADC SYS_ARG_07
    STA SYS_ARG_06
    CMP #$1F
    BCS @return
    JSR TEXT_GET_NAMETABLE_ADDR
    LDA #$00
    STA DISPLAY_TEMP_1
@count_next:
    DEC SYS_ARG_0C
    BNE @continue
    DEC SYS_ARG_0D
    BEQ @return
@continue:
    JMP @loop
@return:
    RTS
@check_batch:
    LDA SYS_ARG_0E
    BNE @batch_mode
    JMP @plain_mode
@batch_mode:
    LDA #$00
    STA DISPLAY_TEMP_2
    LDA #$00
    STA DISPLAY_TEMP_1
@batch_loop:
    JSR TEXT_PUT_CELL
    INC DISPLAY_TEMP_1
    LDA DISPLAY_TEMP_1
    CMP SYS_ARG_08
    BCC @batch_counted
    LDA SYS_ARG_06
    CLC
    ADC SYS_ARG_07
    STA SYS_ARG_06
    CMP #$1F
    BCS @batch_done
    JSR TEXT_GET_NAMETABLE_ADDR
    LDA #$00
    STA DISPLAY_TEMP_1
@batch_counted:
    INC DISPLAY_TEMP_2
    LDA DISPLAY_TEMP_2
    CMP SYS_ARG_0E
    BCC @batch_flushed
    LDA DRAW_MODE_TEMP
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$00
    STA DISPLAY_TEMP_2
@batch_flushed:
    DEC SYS_ARG_0C
    BNE @batch_continue
    DEC SYS_ARG_0D
    BEQ @batch_done
@batch_continue:
    JMP @batch_loop
@batch_done:
    LDA DRAW_MODE_TEMP
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
@plain_mode:
    LDX SYS_ARG_08
@plain_loop:
    JSR TEXT_PUT_CELL
    DEX
    BNE @plain_counted
    LDA SYS_ARG_06
    CLC
    ADC SYS_ARG_07
    STA SYS_ARG_06
    CMP #$1F
    BCS @flush
    JSR TEXT_GET_NAMETABLE_ADDR
    LDX SYS_ARG_08
@plain_counted:
    DEC SYS_ARG_0C
    BNE @plain_continue
    DEC SYS_ARG_0D
    BEQ @flush
@plain_continue:
    JMP @plain_loop
@flush:
    LDA DRAW_MODE_TEMP
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：SYS_ARG_0F 为 0 时先调用 $1E 取状态；随后把 SYS_ARG_0F 整理成 1（原值为 0 或 4）或 2。
; 输入：SYS_ARG_0F。
; 输出：SYS_ARG_0F。
; 调用者：API_41_FILL_RECT、API_42、API_43、API_44
TEXT_CHECK_FONT_MODE:
    LDA SYS_ARG_0F
    BNE @check_value
    LDA #$00
    STA SYS_SUBFUNCTION
    LDA #$1E
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
@check_value:
    LDA SYS_ARG_0F
    BEQ @mode_1
    CMP #$04
    BEQ @mode_1
    LDA #$02
    STA SYS_ARG_0F
    JMP @return
@mode_1:
    LDA #$01
    STA SYS_ARG_0F
@return:
    RTS
; 作用：用 $30（子功能为 DRAW_MODE_TEMP 低 2 位加 4）取名称表缓冲的远地址，映射到窗口 3，FAR_OFFSET 并入 $B0。
; 输入：DRAW_MODE_TEMP。
; 输出：FAR_OFFSET_LO/HI。
; 调用者：API_40、TEXT_FILL_ROW_CELLS、TEXT_FILL_TWO_ROW_CELLS、API_41_FILL_RECT、API_42、API_43、API_44
TEXT_GET_NAMETABLE_MAP3:
    LDA DRAW_MODE_TEMP
    AND #$03
    ORA #$04
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA FAR_OFFSET_HI
    ORA #$B0
    STA FAR_OFFSET_HI
    RTS
; 作用：同 TEXT_GET_NAMETABLE_MAP3，但不做窗口映射；调用 18 次
; 调用者：API_40、API_41_FILL_RECT、API_42、API_43、API_44
TEXT_GET_NAMETABLE_ADDR:
    LDA DRAW_MODE_TEMP
    AND #$03
    ORA #$04
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA FAR_OFFSET_HI
    ORA #$B0
    STA FAR_OFFSET_HI
    RTS
; 作用：把 SYS_ARG_09/SYS_ARG_0A 写进 FAR_OFFSET 处的两个字节（先高后低），用于逐单元写屏幕缓冲。
; 输入：FAR_OFFSET_LO/HI、SYS_ARG_09/0A。
; 调用者：API_41_FILL_RECT
TEXT_PUT_CELL:
    LDY #$01
    LDA SYS_ARG_0A
    STA (FAR_OFFSET_LO),Y
    DEY
