; ------------------------------------------------------------------------
; 名称：startup-and-library.asm
; 说明：页组 0 的入口跳转与运行库：提示音、光标移动、字符与字符串显示辅助，供外壳和外部程序调用
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：占ROM 第 0-2 页，汇编地址 $8000 起，后面的文件接在它后面
; ------------------------------------------------------------------------
.org $8000
; 作用：页组 0 的入口（$8000）；开机程序经功能 $26 进入
; 调用者：全 ROM 没有指令或地址表引用它（只能由外部直接进入）
SHELL_ENTRY:
    JMP SHELL_MAIN
    .byte $AA,$55,$00,$00
    TSX
    STX SYS_SUBFUNCTION
    LDA WINDOW_SAVE_0
    STA SYS_GROUP
    LDA #<SHELL_RTS_STUB
    STA PROG_ENTRY_LO
    LDA #>SHELL_RTS_STUB
    STA PROG_ENTRY_HI
    LDA #$1C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$00
    STA CMD_TAIL
    JSR CMD_CLS
    JMP SHELL_READ_COMMAND
; 作用：只有一条 RTS 的空入口
; 引用者：SHELL_ENTRY（取地址）
SHELL_RTS_STUB:
    .byte $60
; 作用：运行库：用方波通道 2 发一声提示音
; 调用者：SHELL_COMMAND_LOOP
LIB_BEEP:
    LDA #$02
    STA APU_STATUS
    LDA #$48
    STA SQ2_VOL
    LDA #$F8
    STA SQ2_SWEEP
    LDA #$6A
    STA SQ2_LO
    LDA #$08
    STA SQ2_HI
    RTS
; 作用：运行库：把 A 显示成两位十六进制文字，保持 A 不变
; 输入：A=要显示的字节。
; 调用者：全 ROM 没有指令或地址表引用它（只能由外部直接进入）
LIB_PRINT_HEX:
    STA LIB_GROUP
    LDA LIB_GROUP
    PHA
    PHA
    LSR A
    LSR A
    LSR A
    LSR A
    ORA #$30
    CMP #$3A
    BCC @digit1_ok
    ADC #$06
@digit1_ok:
    STA LIB_TEMP_STR
    PLA
    AND #$0F
    ORA #$30
    CMP #$3A
    BCC @digit2_ok
    ADC #$06
@digit2_ok:
    STA LIB_TEMP_STR+1
    LDA #$00
    STA LIB_TEMP_STR+2
    STA LIB_GROUP
    LDA #<LIB_TEMP_STR
    STA STR_PTR_LO
    LDA #>LIB_TEMP_STR
    STA STR_PTR_HI
    JSR LIB_PRINT_STRING
    PLA
    RTS
; 作用：运行库：光标左移一列，到行首时移到上一行末尾
; 调用者：SHELL_COMMAND_LOOP、SHELL_INPUT_KEY、CALL_LIB_CURSOR_LEFT_5E（取地址）、CMD_GROUP60_TABLE（取地址）
LIB_CURSOR_LEFT:
    PHA
    LDA CURSOR_COL
    DEC CURSOR_COL
    BNE @done
    JSR LIB_CURSOR_UP
@done:
    PLA
    RTS
; 作用：运行库：光标移到上一行末尾（已在第一行时不动）；FONT_SIZE 不为 0 时每行占两格，光标行与字形行各减 2，字形行减到 0 时绕回。
; 调用者：LIB_CURSOR_LEFT、CALL_LIB_CURSOR_UP_5E（取地址）、CALL_LIB_CURSOR_UP（取地址）
LIB_CURSOR_UP:
    PHA
    LDA CURSOR_ROW
    BEQ @done
    LDA FONT_SIZE
    BNE @double_height
    DEC CURSOR_ROW
    LDA GLYPH_ROW
    BNE @glyph_dec
    LDA #$1E
    STA GLYPH_ROW
@glyph_dec:
    DEC GLYPH_ROW
    LDA #$1F
    STA CURSOR_COL
    JMP @done
@double_height:
    DEC CURSOR_ROW
    DEC CURSOR_ROW
    LDA GLYPH_ROW
    BNE @glyph_dec2
    LDA #$1C
    STA GLYPH_ROW
@glyph_dec2:
    DEC GLYPH_ROW
    DEC GLYPH_ROW
    LDA #$1F
    STA CURSOR_COL
@done:
    PLA
    RTS
; 作用：运行库：光标右移一列，到第 32 列时回到第 1 列并换行
; 调用者：SHELL_PUT_CHAR、SHELL_COMMAND_LOOP、SHELL_RECALL_LINE、CALL_LIB_CURSOR_RIGHT_5E（取地址）、CALL_LIB_CURSOR_RIGHT（取地址）
LIB_CURSOR_RIGHT:
    INC CURSOR_COL
    LDA CURSOR_COL
    CMP #$20
    BCC @return
    LDA #$01
    STA CURSOR_COL
    JSR LIB_NEWLINE
@return:
    RTS
; 作用：运行库：换行（行满时滚屏），保持字形缓冲行 GLYPH_ROW 与光标行同步；调用前程序要先把 CURSOR_COL 置 1
; 调用者：LIB_CURSOR_RIGHT、SHELL_PRINT_MESSAGE、SHELL_COMMAND_LOOP、RUN_CHECK_EXE、SHELL_NEWLINE、CMD_REM、CMD_SBWIN、SHELL_READ_COMMAND等 13 处
LIB_NEWLINE:
    PHA
    TXA
    PHA
    TYA
    PHA
    LDA FONT_SIZE
    BEQ @normal_font
    JMP @large_font
@normal_font:
    INC GLYPH_ROW
    LDA GLYPH_ROW
    CMP #$1E
    BCC @advance_row
    LDA #$00
    STA GLYPH_ROW
@advance_row:
    INC CURSOR_ROW
    LDA CURSOR_ROW
    CMP #$1E
    BNE @scroll_finished
    LDA #$1D
    STA CURSOR_ROW
    LDA #$29
    STA SYS_FUNCTION
    LDA #$FA
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$B0
    STA PROG_ENTRY_HI
    LDA #$40
    STA WORK_VEC_16_LO
    LDA #$B0
    STA WORK_VEC_16_HI
    LDY #$00
@loop:
    LDA (WORK_VEC_16_LO),Y
    STA (PROG_ENTRY_LO),Y
    INY
    BNE @loop
    INC WORK_VEC_16_HI
    INC PROG_ENTRY_HI
    LDA WORK_VEC_16_HI
    CMP #$B7
    BNE @loop
@scroll_tail:
    LDA (WORK_VEC_16_LO),Y
    STA (PROG_ENTRY_LO),Y
    INY
    CPY #$80
    BNE @scroll_tail
@scroll_finished:
    JMP @refresh
@large_font:
    INC GLYPH_ROW
    INC GLYPH_ROW
    LDA GLYPH_ROW
    CMP #$1C
    BCC @advance_row2
    LDA #$00
    STA GLYPH_ROW
@advance_row2:
    INC CURSOR_ROW
    INC CURSOR_ROW
    LDA CURSOR_ROW
    CMP #$1C
    BNE @refresh
    LDA #$1A
    STA CURSOR_ROW
    LDA #$29
    STA SYS_FUNCTION
    LDA #$FA
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$B0
    STA PROG_ENTRY_HI
    LDA #$80
    STA WORK_VEC_16_LO
    LDA #$B0
    STA WORK_VEC_16_HI
    LDY #$00
@scroll_copy2:
    LDA (WORK_VEC_16_LO),Y
    STA (PROG_ENTRY_LO),Y
    INY
    BNE @scroll_copy2
    INC WORK_VEC_16_HI
    INC PROG_ENTRY_HI
    LDA WORK_VEC_16_HI
    CMP #$B6
    BNE @scroll_copy2
@scroll_tail2:
    LDA (WORK_VEC_16_LO),Y
    STA (PROG_ENTRY_LO),Y
    INY
    CPY #$80
    BNE @scroll_tail2
    LDA #$80
    STA PROG_ENTRY_LO
    LDA #$B6
    STA PROG_ENTRY_HI
    LDA #$80
    STA WORK_VEC_16_LO
    LDA #$B7
    STA WORK_VEC_16_HI
    LDY #$00
@scroll_copy3:
    LDA (WORK_VEC_16_LO),Y
    STA (PROG_ENTRY_LO),Y
    INY
    CPY #$80
    BNE @scroll_copy3
@refresh:
    LDA #$29
    STA SYS_FUNCTION
    LDA WINDOW_SAVE_0
    CLC
    ADC #$03
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    LDA #$00
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
; 作用：运行库：等待按键，调用输入服务 $6B/$04，结果在 KEY_ASCII、KEY_SCAN
; 调用者：CMD_SBWIN
LIB_GET_KEY:
    LDA #$6B
    STA SYS_FUNCTION
    LDA #$04
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：运行库：显示消息号为 LIB_GROUP（$6308）的字符串
; 把 ROM 第 3 页映射到 $B000，按 FONT_SIZE 在 $B500 或 $B200 的 3 字节表（页号、地址低、高）里查字符串，再调用 LIB_PRINT_STRING
; 输入：LIB_GROUP=消息序号。
; 调用者：RUN_CHECK_EXE、CMD_SBWIN、SHELL_EXECUTE_LINE、RUN_CHECK_STATUS、CALL_LIB_PRINT_MESSAGE_5E（取地址）、CALL_GET_KEY_WAIT（取地址）
LIB_PRINT_MESSAGE:
    LDA #$29
    STA SYS_FUNCTION
    LDA #$03
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    LDA FONT_SIZE
    BEQ @normal_table
    LDA #$00
    STA STR_PTR_LO
    LDA #$B5
    STA STR_PTR_HI
    JMP @table_ready
@normal_table:
    LDA #$00
    STA STR_PTR_LO
    LDA #$B2
    STA STR_PTR_HI
@table_ready:
    LDX #$03
@loop:
    LDA LIB_GROUP
    CLC
    ADC STR_PTR_LO
    STA STR_PTR_LO
    LDA STR_PTR_HI
    ADC #$00
    STA STR_PTR_HI
    DEX
    BNE @loop
    LDY #$00
    LDA (STR_PTR_LO),Y
    STA SYS_PAGE
    STA LIB_GROUP
    INY
    LDA (STR_PTR_LO),Y
    PHA
    INY
    LDA (STR_PTR_LO),Y
    STA STR_PTR_HI
    PLA
    STA STR_PTR_LO
    LDA #$29
    STA SYS_FUNCTION
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
; 作用：运行库：在光标处显示 STR_PTR_LO/HI（$4B/$4C）指向的以 0 结尾的字符串，不移动光标
; 字符串所在的页组取 LIB_GROUP（$6308）的高 6 位；字符码不小于 $A1 的按 GB2312 两字节显示汉字
; 按 FONT_SIZE 选功能 $45 或 $46 把字符串画进名称表
; 输入：STR_PTR_LO/HI=字符串，LIB_GROUP=页组。
; 调用者：LIB_PRINT_HEX、SHELL_PRINT_TEMP、SHELL_PUT_CHAR、SHELL_PRINT_PROMPT、SHELL_COMMAND_LOOP、SHELL_INPUT_KEY、PRINT_SIZE_TOO_BIG、CMD_CD等 12 处
LIB_PRINT_STRING:
    JSR LIB_CALC_VRAM_ADDR
    LDA FONT_SIZE
    BEQ @normal_function
    LDA #$45
    STA SYS_FUNCTION
    JMP @call
@normal_function:
    LDA #$46
    STA SYS_FUNCTION
@call:
    JSR LIB_STRLEN
    LDA LIB_GROUP
    AND #$FC
    STA SYS_GROUP
    LDA STR_PTR_LO
    STA PROG_ENTRY_LO
    LDA STR_PTR_HI
    STA PROG_ENTRY_HI
    LDA LIB_VRAM_ADDR_LO
    STA SYS_ARG_09
    LDA LIB_VRAM_ADDR_HI
    STA SYS_ARG_0A
    LDA #$02
    STA SYS_ARG_0B
    LDA #$00
    STA SYS_SUBFUNCTION
    LDA CURSOR_COL
    STA SYS_ARG_05
    LDA CURSOR_ROW
    STA SYS_ARG_06
    JSR VEC_SYSCALL
    RTS
; 作用：按 GLYPH_ROW、CURSOR_COL、FONT_SIZE 算出名称表里的显示地址，放到 LIB_VRAM_ADDR_LO/HI
; 输入：GLYPH_ROW、CURSOR_COL、FONT_SIZE。
; 输出：LIB_VRAM_ADDR_LO/HI。
; 调用者：LIB_PRINT_STRING
LIB_CALC_VRAM_ADDR:
    PHA
    TXA
    PHA
    TYA
    PHA
    LDA GLYPH_ROW
    AND #$1F
    STA LIB_VRAM_ADDR_LO
    LDA #$00
    STA LIB_VRAM_ADDR_HI
    ASL LIB_VRAM_ADDR_LO
    ROL LIB_VRAM_ADDR_HI
    ASL LIB_VRAM_ADDR_LO
    ROL LIB_VRAM_ADDR_HI
    ASL LIB_VRAM_ADDR_LO
    ROL LIB_VRAM_ADDR_HI
    ASL LIB_VRAM_ADDR_LO
    ROL LIB_VRAM_ADDR_HI
    LDA FONT_SIZE
    BNE @row_done
    ASL LIB_VRAM_ADDR_LO
    ROL LIB_VRAM_ADDR_HI
@row_done:
    LDA CURSOR_COL
    CLC
    ADC LIB_VRAM_ADDR_LO
    STA LIB_VRAM_ADDR_LO
    LDA LIB_VRAM_ADDR_HI
    ADC #$00
    STA LIB_VRAM_ADDR_HI
    ASL LIB_VRAM_ADDR_LO
    ROL LIB_VRAM_ADDR_HI
    LDA FONT_SIZE
    BEQ @addr_done
    ASL LIB_VRAM_ADDR_LO
    ROL LIB_VRAM_ADDR_HI
@addr_done:
    LDA LIB_VRAM_ADDR_HI
    CLC
    ADC #$48
    STA LIB_VRAM_ADDR_HI
    PLA
    TAY
    PLA
    TXA
    PLA
    RTS
; 作用：只有一个空格的字符串
; 引用者：SHELL_VIDEO_SETUP_1（取地址）
STR_BLANK:
    .byte $20,$00
; 作用：依次调用功能 $3F（画字符串 STR_BLANK，SYS_ARG_09/0A 为 $80/$40）、$29（窗口映射页 3）、$30（DMA 到显存，子功能 $0A 与 0），再调用功能 $5D 把页组 WINDOW_SAVE_0 里 $B15D 处的 $40 字节写进调色板（偏移 0）；从外壳其他位置与 SHELL_MAIN 调用（用例 p00-shell-video.mjs 核对调用序列与 $40 字节的写入）
; 调用者：SHELL_COMMAND_LOOP、SHELL_MAIN、CLS_RESET_VIDEO（取地址）
SHELL_VIDEO_SETUP_1:
    PHA
    TXA
    PHA
    TYA
    PHA
    LDA #$3F
    STA SYS_FUNCTION
    LDA #$02
    STA SYS_ARG_0B
    LDA #$80
    STA SYS_ARG_09
    LDA #$40
    STA SYS_ARG_0A
    LDA WINDOW_SAVE_0
    STA SYS_GROUP
    LDA #<STR_BLANK
    STA PROG_ENTRY_LO
    LDA #>STR_BLANK
    STA PROG_ENTRY_HI
    LDA #$00
    STA SYS_ARG_0C
    JSR VEC_SYSCALL
    LDA #$29
    STA SYS_FUNCTION
    LDA #$03
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    LDA #$80
    STA SYS_ARG_09
    LDA #$00
    STA SYS_ARG_0A
    LDA #$30
    STA SYS_FUNCTION
    LDA #$0A
    STA SYS_SUBFUNCTION
    LDA #$0F
    STA SYS_ARG_0F
    JSR VEC_SYSCALL
    LDA #$30
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$5D
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_ARG_04
    LDA #$40
    STA SYS_ARG_0C
    LDA WINDOW_SAVE_0
    STA SYS_GROUP
    LDA #$5D
    STA PROG_ENTRY_LO
    LDA #$B1
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
