; ------------------------------------------------------------------------
; 名称：cell-display.asm
; 说明：单元显示（功能 $42-$44）与单元写入辅助：按窗口矩形逐格写名称表
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：占ROM 第 9-9 页，汇编地址 $8000 起，后面的文件接在它后面
; ------------------------------------------------------------------------
.org $8000
; ---- 页内偏移 $0000-$04FF：页组 $08 的页，汇编地址 $9000 起 ----
.rorg $9000
; 作用：在 FAR_OFFSET 处写相邻两行的单元（偏移 Y 与 $40、$41 处），单元值 SYS_ARG_09/SYS_ARG_0A 每写一次加 SYS_ARG_0F，写完 FAR_OFFSET 前进 2。
; 输入：FAR_OFFSET_LO/HI、Y、SYS_ARG_09/0A（单元值）、SYS_ARG_0F（步长）。
; 调用者：TEXT_PUT_CELL（顺序执行到这里）
CELL_WRITE_PAIR:
    LDA SYS_ARG_09
    STA (FAR_OFFSET_LO),Y
    LDY #$40
    CLC
    ADC SYS_ARG_0F
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
    ADC SYS_ARG_0F
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
    RTS
; 作用：功能 $42：按列写屏幕单元：每次连写左右两格（v、v+2×步长，再按奇偶调整 v）后下移一行，列高 $064A（受 30−行 限制），列距 $064B+2，列号不小于 31 停止（用例 p08-display.mjs）；代码在页 09 前半部分，页组 $08 的窗口地址 $903B
; 调用者：text-output.asm 开头的入口代码（地址表）
API_42:
    LDA SYS_SUBFUNCTION
    STA DRAW_MODE_TEMP
    INC SYS_ARG_08
    INC SYS_ARG_08
    LDA #$1E
    SEC
    SBC SYS_ARG_06
    CMP SYS_ARG_07
    BCS @clamped
    STA SYS_ARG_07
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
    JSR CELL_PUT_PAIR
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
    CMP SYS_ARG_07
    BCC @count_next
    LDA SYS_ARG_05
    CLC
    ADC SYS_ARG_08
    STA SYS_ARG_05
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
    JSR CELL_PUT_PAIR
    INC DISPLAY_TEMP_1
    LDA DISPLAY_TEMP_1
    CMP SYS_ARG_07
    BCC @batch_counted
    LDA SYS_ARG_05
    CLC
    ADC SYS_ARG_08
    STA SYS_ARG_05
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
@batch_flushed:
    DEC SYS_ARG_0C
    BNE @batch_continue
    DEC SYS_ARG_0D
    BEQ @batch_done
@batch_continue:
    JMP @batch_loop
@batch_done:
    JMP @flush
@plain_mode:
    LDX SYS_ARG_07
@plain_loop:
    JSR CELL_PUT_PAIR
    DEX
    BNE @plain_counted
    LDA SYS_ARG_05
    CLC
    ADC SYS_ARG_08
    STA SYS_ARG_05
    CMP #$1F
    BCS @flush
    JSR TEXT_GET_NAMETABLE_ADDR
    LDX SYS_ARG_07
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
; 作用：连写两个单元：先把 SYS_ARG_09/SYS_ARG_0A 写进 FAR_OFFSET 指向的屏幕缓冲，SYS_ARG_09 加 SYS_ARG_0F 的两倍后再写一次，随后按步长调整单元值（SYS_ARG_0F 为 1 时按奇偶加减 1，否则按位 1 加减 2），FAR_OFFSET 前进 $40 字节（下一行）；显示服务 $42 使用。
; 输入：FAR_OFFSET_LO/HI、SYS_ARG_09/0A、SYS_ARG_0F。
; 调用者：API_42
CELL_PUT_PAIR:
    LDY #$00
    LDA SYS_ARG_09
    STA (FAR_OFFSET_LO),Y
    INY
    LDA SYS_ARG_0A
    STA (FAR_OFFSET_LO),Y
    INY
    LDA SYS_ARG_0F
    ASL A
    CLC
    ADC SYS_ARG_09
    STA SYS_ARG_09
    BCC @no_carry
    INC SYS_ARG_0A
@no_carry:
    LDA SYS_ARG_09
    STA (FAR_OFFSET_LO),Y
    INY
    LDA SYS_ARG_0A
    STA (FAR_OFFSET_LO),Y
    LDA SYS_ARG_0F
    CMP #$01
    BNE @step_other
    LDA SYS_ARG_09
    AND #$01
    BEQ @even_value
    INC SYS_ARG_09
    BNE @advance_ptr
    INC SYS_ARG_0A
    JMP @advance_ptr
@even_value:
    DEC SYS_ARG_09
    LDA SYS_ARG_09
    CMP #$FF
    BNE @dec_done
    DEC SYS_ARG_0A
@dec_done:
    JMP @advance_ptr
@step_other:
    LDA SYS_ARG_09
    AND #$02
    BEQ @sub_two
    LDA SYS_ARG_09
    CLC
    ADC #$02
    STA SYS_ARG_09
    LDA #$00
    ADC SYS_ARG_0A
    STA SYS_ARG_0A
    JMP @advance_ptr
@sub_two:
    LDA SYS_ARG_09
    SEC
    SBC #$02
    STA SYS_ARG_09
    LDA SYS_ARG_0A
    SBC #$00
    STA SYS_ARG_0A
@advance_ptr:
    LDA FAR_OFFSET_LO
    CLC
    ADC #$40
    STA FAR_OFFSET_LO
    LDA #$00
    ADC FAR_OFFSET_HI
    STA FAR_OFFSET_HI
    RTS
; 作用：功能 $43：按行写屏幕单元，与 $41 相同但每次只写一格，行距 $064A+1（用例 p08-display.mjs）；代码在页 09 前半部分，页组 $08 的窗口地址 $91F7
; 调用者：text-output.asm 开头的入口代码（地址表）
API_43:
    LDA SYS_SUBFUNCTION
    STA DRAW_MODE_TEMP
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
    JSR CELL_PUT_NEXT_COL
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
    JSR CELL_PUT_NEXT_COL
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
    JSR CELL_PUT_NEXT_COL
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
; 作用：把 SYS_ARG_09/SYS_ARG_0A 写进 FAR_OFFSET 处，SYS_ARG_09 加 SYS_ARG_0F，FAR_OFFSET 前进 2 字节（同一行的下一个单元）。
; 输入：FAR_OFFSET_LO/HI、SYS_ARG_09/0A、SYS_ARG_0F。
; 调用者：API_43
CELL_PUT_NEXT_COL:
    LDY #$00
    LDA SYS_ARG_09
    STA (FAR_OFFSET_LO),Y
    INY
    LDA SYS_ARG_0A
    STA (FAR_OFFSET_LO),Y
    LDA SYS_ARG_09
    CLC
    ADC SYS_ARG_0F
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
    RTS
; 作用：功能 $44：按列写单格，每次下移一行，列距 $064B+1，列号不小于 32 停止（用例 p08-display.mjs）；代码在页 09 前半部分，页组 $08 的窗口地址 $9362
; 调用者：text-output.asm 开头的入口代码（地址表）
API_44:
    LDA SYS_SUBFUNCTION
    STA DRAW_MODE_TEMP
    INC SYS_ARG_08
    LDA #$1E
    SEC
    SBC SYS_ARG_06
    CMP SYS_ARG_07
    BCS @clamped
    STA SYS_ARG_07
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
    JSR CELL_PUT_NEXT_ROW
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
    CMP SYS_ARG_07
    BCC @count_next
    LDA SYS_ARG_05
    CLC
    ADC SYS_ARG_08
    STA SYS_ARG_05
    CMP #$20
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
    STA DISPLAY_TEMP_1
    LDX SYS_ARG_07
@batch_loop:
    JSR CELL_PUT_NEXT_ROW
    DEX
    BNE @batch_counted
    LDA SYS_ARG_05
    CLC
    ADC SYS_ARG_08
    STA SYS_ARG_05
    CMP #$20
    BCS @batch_done
    JSR TEXT_GET_NAMETABLE_ADDR
    LDX SYS_ARG_07
@batch_counted:
    INC DISPLAY_TEMP_1
    LDA DISPLAY_TEMP_1
    CMP SYS_ARG_0E
    BCC @batch_flushed
    LDA DRAW_MODE_TEMP
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
@batch_flushed:
    DEC SYS_ARG_0C
    BNE @batch_continue
    DEC SYS_ARG_0D
    BEQ @batch_done
@batch_continue:
    JMP @batch_loop
@batch_done:
    JMP @flush
@plain_mode:
    LDX SYS_ARG_07
@plain_loop:
    JSR CELL_PUT_NEXT_ROW
    DEX
    BNE @plain_counted
    LDA SYS_ARG_05
    CLC
    ADC SYS_ARG_08
    STA SYS_ARG_05
    CMP #$20
    BCS @flush
    JSR TEXT_GET_NAMETABLE_ADDR
    LDX SYS_ARG_07
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
; 作用：把 SYS_ARG_09/SYS_ARG_0A 写进 FAR_OFFSET 处，SYS_ARG_09 加 SYS_ARG_0F，FAR_OFFSET 前进 $40 字节（下一行同一列）。
; 输入：FAR_OFFSET_LO/HI、SYS_ARG_09/0A、SYS_ARG_0F。
; 调用者：API_44
CELL_PUT_NEXT_ROW:
    LDY #$00
    LDA SYS_ARG_09
    STA (FAR_OFFSET_LO),Y
    INY
    LDA SYS_ARG_0A
    STA (FAR_OFFSET_LO),Y
    LDA SYS_ARG_09
    CLC
    ADC SYS_ARG_0F
    STA SYS_ARG_09
    LDA #$00
    ADC SYS_ARG_0A
    STA SYS_ARG_0A
    LDA FAR_OFFSET_LO
    CLC
    ADC #$40
    STA FAR_OFFSET_LO
    LDA #$00
    ADC FAR_OFFSET_HI
    STA FAR_OFFSET_HI
    RTS
; 作用：把 SYS_ARG_11（调色板号）左移 4 位（SYS_ARG_0F 不为 1 时再左移 2 位）并入 SYS_ARG_0A 的高半字节，合成单元的属性。
; 输入：SYS_ARG_0A、SYS_ARG_11、SYS_ARG_0F。
; 输出：SYS_ARG_0A。
; 调用者：API_40、API_41_FILL_RECT、API_42、API_43、API_44
CELL_COMBINE_ATTR:
    TXA
    PHA
    LDA SYS_ARG_0A
    AND #$0F
    STA SYS_ARG_0A
    LDA SYS_ARG_11
    ASL A
    ASL A
    ASL A
    ASL A
    LDX SYS_ARG_0F
    CPX #$01
    BEQ @shift_done
    ASL A
    ASL A
@shift_done:
    ORA SYS_ARG_0A
    STA SYS_ARG_0A
    PLA
    TAX
    RTS
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
.rend
; ---- 页内偏移 $0500 起：回到本页原来的汇编地址 ----
    LDA SYS_FUNCTION
    SEC
    SBC #$4A
    JSR MATH_INLINE_JUMP
    .word API_4A,API_4B,API_4C,API_4D,API_4E,API_4F,API_50,API_51
    .word API_52,API_53,API_54
