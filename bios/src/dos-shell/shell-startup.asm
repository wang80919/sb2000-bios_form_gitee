; 作用：------------------------------------------------------------------------
; 名称：shell-startup.asm
; 说明：外壳启动与外部程序运行：视频初始化、批处理文件、程序运行与按键输入
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：在 ROM 里接在 dos-shell/command-dispatch.asm 之后
; ------------------------------------------------------------------------
; 初始化外壳画面：映射页 3、把 $B11D 起 $40 字节 DMA 到显存 $2000、等 1 帧、打开精灵、清精灵缓冲 $0200、按 FONT_SIZE 设精灵尺寸
; 调用者：SHELL_COMMAND_LOOP、SHELL_MAIN
SHELL_INIT_VIDEO:
    LDA #$29
    STA SYS_FUNCTION
    LDA #$03
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    LDA #$00
    STA DMA_SRC_HIGH
    LDA #$1D
    STA DMA_SRC_LOW
    LDA #$B1
    STA DMA_SRC_MID
    LDA #$00
    STA DMA_DST_LO
    LDA #$20
    STA DMA_DST_HI
    LDA #$40
    STA DMA_LEN_LO
    LDA #$00
    STA DMA_LEN_HI
    LDA #$C0
    STA DMA_CTRL
    LDX #$01
    JSR SHELL_WAIT_FRAMES
    LDA #$10
    STA SYS_FUNCTION
    LDA #$04
    STA SYS_SUBFUNCTION
    LDA #$10
    STA SYS_ARG_0F
    JSR VEC_SYSCALL
    LDY #$00
@loop:
    LDA #$FF
    STA SPRITE0_Y,Y
    INY
    BNE @loop
    LDA #$10
    STA SYS_FUNCTION
    LDA #$05
    STA SYS_SUBFUNCTION
    LDA FONT_SIZE
    BEQ @size_8x8
    LDA #$20
    JMP @store_size
@size_8x8:
    LDA #$00
@store_size:
    STA SYS_ARG_0F
    JSR VEC_SYSCALL
    RTS
; 作用：把光标位置（行、列各乘 8）写进精灵 0（$0200-$0203），图块号取 ERAM $6427 加 1，属性 3
; 调用者：SHELL_COMMAND_LOOP、SHELL_INPUT_KEY
SHELL_UPDATE_CURSOR:
    PHA
    TXA
    PHA
    LDA CURSOR_ROW
    ASL A
    ASL A
    ASL A
    STA SPRITE0_Y
    LDX SHELL_FIRST_CHAR
    INX
    STX SPRITE0_TILE
    LDA #$03
    STA SPRITE0_ATTR
    LDA CURSOR_COL
    ASL A
    ASL A
    ASL A
    STA SPRITE0_X
    CLC
    PLA
    TAX
    PLA
    RTS
; 作用：显示库消息：LIB_GROUP 是消息序号，按 FONT_SIZE 选 $B200 或 $B500 起的消息表（每项 3 字节：页、地址），换入后显示；DOS 里调用 38 次
; 输入：LIB_GROUP=消息序号。消息里的 $0A 使光标回第 1 列，$0D 结束当前一段并换行。
; 调用者：SHELL_PRINT_PROMPT、DOS_CHECK_ERROR、CMD_BUILD_PATH、CMD_PRINT_PATH_ERROR、CMD_REM、CMD_DIR、CMD_MD、CMD_RD等 13 处
SHELL_PRINT_MESSAGE:
    PHA
    TXA
    PHA
    TYA
    PHA
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
    STA DOS_TEMP_4
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
    LDA STR_PTR_LO
    PHA
    LDA STR_PTR_HI
    PHA
    LDY #$00
    LDX #$00
    STY LIB_TEMP_STR
    STY LIB_TEMP_STR+1
@scan_text:
    LDA (STR_PTR_LO),Y
    BEQ @print_rest
    CMP #$0A
    BEQ @line_feed
    CMP #$0D
    BEQ @carriage_return
    STA LIB_TEMP_STR,X
    INX
    INY
    JMP @scan_text
@line_feed:
    LDA #$01
    STA CURSOR_COL
    INY
    JMP @scan_text
@carriage_return:
    INY
    LDA #$00
    STA LIB_TEMP_STR,X
    JSR SHELL_PRINT_TEMP
    LDA CURSOR_COL
    CLC
    ADC LIB_STR_LEN
    STA CURSOR_COL
    JSR LIB_NEWLINE
    LDA #$00
    STA LIB_TEMP_STR
    STA LIB_TEMP_STR+1
    TAX
    PLA
    STA STR_PTR_HI
    PLA
    STA STR_PTR_LO
    PHA
    LDA STR_PTR_HI
    PHA
    LDA DOS_TEMP_4
    STA SYS_PAGE
    LDA #$29
    STA SYS_FUNCTION
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    JMP @scan_text
@print_rest:
    LDA #$00
    STA LIB_TEMP_STR,X
    JSR SHELL_PRINT_TEMP
    LDA CURSOR_COL
    CLC
    ADC LIB_STR_LEN
    STA CURSOR_COL
    LDA #$00
    STA LIB_TEMP_STR
    STA LIB_TEMP_STR+1
    TAX
    PLA
    STA STR_PTR_HI
    PLA
    STA STR_PTR_LO
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
; 作用：显示 LIB_TEMP_STR 里的字符串（LIB_GROUP=0）
; 调用者：SHELL_PRINT_MESSAGE、SHELL_RECALL_LINE
SHELL_PRINT_TEMP:
    LDA #<LIB_TEMP_STR
    STA STR_PTR_LO
    LDA #>LIB_TEMP_STR
    STA STR_PTR_HI
    LDA #$00
    STA LIB_GROUP
    JSR LIB_PRINT_STRING
    RTS
; 作用：显示字符 A（经 LIB_TEMP_STR），然后光标右移一格
; 输入：A=字符（返回时保持不变）。
; 调用者：SHELL_PRINT_PROMPT、SHELL_COMMAND_LOOP、SHELL_RECALL_LINE、PRINT_HEX_NIBBLE_BUF、PRINT_4_SPACES、PUT_HEX_NIBBLE、CMD_CD、SHELL_READ_BATCH_LINE
SHELL_PUT_CHAR:
    PHA
    STA LIB_TEMP_STR
    LDA #$00
    STA LIB_TEMP_STR+1
    STA LIB_GROUP
    LDA #<LIB_TEMP_STR
    STA STR_PTR_LO
    LDA #>LIB_TEMP_STR
    STA STR_PTR_HI
    JSR LIB_PRINT_STRING
    JSR LIB_CURSOR_RIGHT
    PLA
    RTS
; 作用：显示命令提示符：先显示消息 $42，再取当前目录（$7D/$01）显示路径，最后输出 >
; 调用者：SHELL_COMMAND_LOOP、SHELL_RECALL_LINE
SHELL_PRINT_PROMPT:
    LDA #$29
    STA SYS_FUNCTION
    LDA #$03
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    LDA #$01
    STA CURSOR_COL
    LDA #$42
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    LDA #$7D
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$00
    STA LIB_GROUP
    LDA #<PATH_BUFFER
    STA STR_PTR_LO
    LDA #>PATH_BUFFER
    STA STR_PTR_HI
    JSR LIB_PRINT_STRING
    LDA CURSOR_COL
    CLC
    ADC LIB_STR_LEN
    STA CURSOR_COL
    LDA #$3E
    JSR SHELL_PUT_CHAR
    RTS
; 作用：命令行输入循环：显示提示符（SHELL_PRINT_PROMPT）、初始化画面、把上一条命令从 SHELL_LINE_BUF 复制到 CMD_TAIL 作为重复输入的模板，然后反复读键（SHELL_GET_KEY）：回车（扫描码 $1C）结束并把输入行放回 CMD_TAIL；其他键先查 SHELL_KEY_SCAN_TABLE、再查 SHELL_KEY_ASCII_TABLE，查到就转到对应的编辑处理程序，查不到的可显示字符（字符码不小于 $20）追加到输入行（最多 40 个字节，满了响一声；输入法选字时按两字节一个汉字处理）。编辑处理程序在本例程范围内，没有单独的标号：F1 与右光标键从模板复制一个字符，F2 复制到指定字符之前，F3 复制模板的其余部分，F4 跳过模板到指定字符，Delete 跳过模板的一个字符，Insert 翻转插入状态（SHELL_FIRST_CHAR 位 0），退格、左光标键与 Ctrl+B 删除前一个字符，Esc、Ctrl+C 与 Ctrl+X 放弃本行（显示“\”并换行），扫描码 $64 的键切换字体大小并重绘画面。
; 输入：SHELL_LINE_BUF（上一条命令）。
; 输出：CMD_TAIL=输入的命令行。
; 调用者：SHELL_READ_COMMAND
SHELL_COMMAND_LOOP:
    JSR SHELL_PRINT_PROMPT
    JSR SHELL_INIT_VIDEO
    LDX #$00
    STX SHELL_FIRST_CHAR
@loop:
    LDA SHELL_LINE_BUF,X
    STA CMD_TAIL,X
    LDA #$00
    STA SHELL_LINE_BUF,X
    INX
    CPX #$2A
    BCC @loop
    JSR SHELL_UPDATE_CURSOR
    JSR SHELL_SET_SPRITE_SIZE
    JSR SHELL_SPRITES_ON
    LDX #$00
    LDY #$00
    STX CMD_SELECT
@read_key:
    JSR SHELL_UPDATE_CURSOR
    JSR SHELL_GET_KEY
    LDA KEY_SCAN
    CMP #$1C
    BNE @lookup_scan
    JMP @enter
@lookup_scan:
    STA DOS_TEMP_3
    STX DOS_TEMP_4
    LDX #$00
@scan_search:
    LDA SHELL_KEY_SCAN_TABLE,X
    BEQ @check_ascii
    CMP DOS_TEMP_3
    BEQ @scan_found
    INX
    INX
    INX
    JMP @scan_search
@scan_found:
    INX
    LDA SHELL_KEY_SCAN_TABLE,X
    STA KEY_VEC_LO
    INX
    LDA SHELL_KEY_SCAN_TABLE,X
    STA KEY_VEC_HI
    LDX DOS_TEMP_4
    JMP (KEY_VEC_LO)
@check_ascii:
    LDX DOS_TEMP_4
    LDA KEY_ASCII
    CMP #$00
    BEQ @read_key
    STA DOS_TEMP_3
    STX DOS_TEMP_4
    LDX #$00
@ascii_search:
    LDA SHELL_KEY_ASCII_TABLE,X
    BEQ @insert_char
    CMP DOS_TEMP_3
    BEQ @ascii_found
    INX
    INX
    INX
    JMP @ascii_search
@ascii_found:
    INX
    LDA SHELL_KEY_ASCII_TABLE,X
    STA KEY_VEC_LO
    INX
    LDA SHELL_KEY_ASCII_TABLE,X
    STA KEY_VEC_HI
    LDX DOS_TEMP_4
    JMP (KEY_VEC_LO)
@insert_char:
    LDX DOS_TEMP_4
    LDA DOS_TEMP_3
    CMP #$20
    BCC @continue
    CPX #$28
    BCC @store_key
    JSR LIB_BEEP
    JMP @read_key
@store_key:
    LDA IME_KEY_RESULT
    BPL @ime_chars
    LDA KEY_ASCII
    STA SHELL_LINE_BUF,X
    INX
    JSR SHELL_PUT_CHAR
    LDA SHELL_FIRST_CHAR
    BNE @continue
    LDA CMD_TAIL,Y
    BEQ @continue
    LDA CMD_TAIL,Y
    BPL @advance_template
    INY
@advance_template:
    INY
@continue:
    JMP @read_key
@ime_chars:
    TYA
    PHA
    LDY #$00
@ime_char_loop:
    LDA CURSOR_COL
    CMP #$1F
    BCC @ime_wrap_done
    LDA #$01
    STA CMD_SELECT
    JSR LIB_CURSOR_RIGHT
@ime_wrap_done:
    LDA IME_KEY_OUT,Y
    INY
    STA SHELL_LINE_BUF,X
    INX
    STA CMD_FULL_PATH
    LDA IME_KEY_OUT,Y
    INY
    STA SHELL_LINE_BUF,X
    INX
    STA CMD_FULL_PATH+1
    LDA #$00
    STA CMD_FULL_PATH+2
    STA LIB_GROUP
    LDA #<CMD_FULL_PATH
    STA STR_PTR_LO
    LDA #>CMD_FULL_PATH
    STA STR_PTR_HI
    JSR LIB_PRINT_STRING
    JSR LIB_CURSOR_RIGHT
    JSR LIB_CURSOR_RIGHT
    CPX #$28
    BCS @ime_done
    CPY IME_KEY_RESULT
    BNE @ime_char_loop
@ime_done:
    LDA SHELL_FIRST_CHAR
    BNE @restore_y
    PLA
    TAY
@template_skip:
    LDA CMD_TAIL,Y
    BEQ @continue
    BPL @template_next
    INY
@template_next:
    INY
    DEC IME_KEY_RESULT
    DEC IME_KEY_RESULT
    BNE @template_skip
    JMP @read_key
@restore_y:
    PLA
    TAY
    JMP @read_key
@enter:
    LDA #$00
    STA SHELL_LINE_BUF,X
    STA SHELL_LINE_BUF+41
    LDX #$FF
@copy_line:
    INX
    LDA SHELL_LINE_BUF,X
    STA CMD_TAIL,X
    BNE @copy_line
    RTS
    CPX #$28
    BCC @copy_one
    JSR LIB_BEEP
    JMP @read_key
@copy_one:
    LDA CMD_TAIL,Y
    BEQ @copy_one_done
    STA SHELL_LINE_BUF,X
    CMP #$80
    BCC @copy_one_single
    STA CMD_FULL_PATH
    LDA CURSOR_COL
    CMP #$1F
    BCC @copy_one_second
    LDA #$01
    STA CMD_SELECT
    JSR LIB_CURSOR_RIGHT
@copy_one_second:
    INY
    INX
    LDA CMD_TAIL,Y
    STA SHELL_LINE_BUF,X
    STA CMD_FULL_PATH+1
    INX
    INY
    LDA #$00
    STA CMD_FULL_PATH+2
    STA LIB_GROUP
    LDA #<CMD_FULL_PATH
    STA STR_PTR_LO
    LDA #>CMD_FULL_PATH
    STA STR_PTR_HI
    JSR LIB_PRINT_STRING
    JSR LIB_CURSOR_RIGHT
    JSR LIB_CURSOR_RIGHT
    JMP @copy_one_done
@copy_one_single:
    INX
    JSR SHELL_PUT_CHAR
    INY
@copy_one_done:
    JMP @read_key
    LDA SHELL_FIRST_CHAR
    EOR #$01
    STA SHELL_FIRST_CHAR
    JMP @read_key
    CPX #$00
    BNE @erase_char
    LDY #$00
    JMP @read_key
@erase_char:
    DEX
    LDA SHELL_LINE_BUF,X
    STA LIB_GROUP
    LDA #$00
    STA SHELL_LINE_BUF,X
    LDA LIB_GROUP
    CMP #$80
    BCC @erase_single
    DEX
    LDA #$00
    STA SHELL_LINE_BUF,X
    JSR LIB_CURSOR_LEFT
    LDA #$20
    JSR SHELL_PUT_CHAR
    JSR LIB_CURSOR_LEFT
@erase_single:
    JSR LIB_CURSOR_LEFT
    LDA #$20
    JSR SHELL_PUT_CHAR
    JSR LIB_CURSOR_LEFT
    CPY #$00
    BEQ @update_template_index
    DEY
    LDA CMD_TAIL,Y
    CMP #$80
    BCC @update_template_index
    DEY
@update_template_index:
    TXA
    PHA
    LDA CURSOR_COL
    CMP #$01
    BNE @update_wrap
    LDA CMD_SELECT
    BEQ @update_wrap
    JSR LIB_CURSOR_LEFT
    DEC CMD_SELECT
@update_wrap:
    PLA
    TAX
    JMP @read_key
@copy_rest:
    CPX #$28
    BCC @copy_rest_char
    JSR LIB_BEEP
    JMP @read_key
@copy_rest_char:
    LDA CMD_TAIL,Y
    BEQ @rest_done
    STA SHELL_LINE_BUF,X
    CMP #$80
    BCC @rest_single
    STA CMD_FULL_PATH
    LDA CURSOR_COL
    CMP #$1F
    BCC @rest_second
    LDA #$01
    STA CMD_SELECT
    JSR LIB_CURSOR_RIGHT
@rest_second:
    INY
    INX
    LDA CMD_TAIL,Y
    STA SHELL_LINE_BUF,X
    STA CMD_FULL_PATH+1
    INX
    INY
    LDA #$00
    STA CMD_FULL_PATH+2
    STA LIB_GROUP
    LDA #<CMD_FULL_PATH
    STA STR_PTR_LO
    LDA #>CMD_FULL_PATH
    STA STR_PTR_HI
    JSR LIB_PRINT_STRING
    JSR LIB_CURSOR_RIGHT
    JSR LIB_CURSOR_RIGHT
    JMP @copy_rest
@rest_single:
    INX
    JSR SHELL_PUT_CHAR
    INY
    JMP @copy_rest
@rest_done:
    JMP @read_key
    LDA CMD_TAIL,Y
    BEQ @delete_done
    INY
    CMP #$80
    BCC @delete_done
    INY
@delete_done:
    JMP @read_key
    LDA #$5C
    JSR SHELL_PUT_CHAR
    JSR LIB_NEWLINE
    LDA #$01
    STA CURSOR_COL
@clear_line_buf:
    LDA #$00
    STA SHELL_LINE_BUF,X
    INX
    CPX #$2A
    BNE @clear_line_buf
    LDX #$00
    LDY #$00
    STX SHELL_FIRST_CHAR
    STX CMD_SELECT
    JMP @read_key
    CPX #$28
    BCC @copy_to_char
    JSR LIB_BEEP
    JMP @read_key
@copy_to_char:
    STY DOS_TEMP_5
    JSR SHELL_GET_KEY
    LDA KEY_ASCII
    CMP #$20
    BCC @to_char_done
    STA LIB_GROUP
@find_char:
    INY
    LDA CMD_TAIL,Y
    BEQ @to_char_done
    CMP LIB_GROUP
    BNE @find_char
    LDA DOS_TEMP_5
    STY DOS_TEMP_5
    TAY
@copy_to_loop:
    CPX #$28
    BCS @to_char_done
    LDA CMD_TAIL,Y
    STA SHELL_LINE_BUF,X
    CMP #$80
    BCC @to_char_single
    STA CMD_FULL_PATH
    LDA CURSOR_COL
    CMP #$1F
    BCC @to_char_second
    LDA #$01
    STA CMD_SELECT
    JSR LIB_CURSOR_RIGHT
@to_char_second:
    INY
    INX
    LDA CMD_TAIL,Y
    STA SHELL_LINE_BUF,X
    STA CMD_FULL_PATH+1
    INX
    INY
    LDA #$00
    STA CMD_FULL_PATH+2
    STA LIB_GROUP
    LDA #<CMD_FULL_PATH
    STA STR_PTR_LO
    LDA #>CMD_FULL_PATH
    STA STR_PTR_HI
    JSR LIB_PRINT_STRING
    JSR LIB_CURSOR_RIGHT
    JSR LIB_CURSOR_RIGHT
    CPY DOS_TEMP_5
    BEQ @to_char_done
    JMP @copy_to_loop
@to_char_single:
    INX
    JSR SHELL_PUT_CHAR
    INY
    CPY DOS_TEMP_5
    BEQ @to_char_done
    JMP @copy_to_loop
@to_char_done:
    LDY DOS_TEMP_5
    JMP @read_key
    CPX #$28
    BCC @skip_to_char
    JSR LIB_BEEP
    JMP @read_key
@skip_to_char:
    STY DOS_TEMP_5
    JSR SHELL_GET_KEY
    LDA KEY_ASCII
    CMP #$20
    BCC @skip_to_char_done
    STA LIB_GROUP
@find_skip_char:
    INY
    LDA CMD_TAIL,Y
    BEQ @skip_to_char_done
    CMP LIB_GROUP
    BNE @find_skip_char
    STY DOS_TEMP_5
@skip_to_char_done:
    LDY DOS_TEMP_5
    JMP @read_key
    LDA FONT_SIZE
    BEQ @set_large_font
    LDA #$00
    STA FONT_SIZE
    LDA #$00
    STA CMD_TAIL
    JSR CMD_CLS
    RTS
@set_large_font:
    LDA #$01
    STA FONT_SIZE
    JSR SHELL_VIDEO_SETUP_1
    LDA #$11
    STA SYS_FUNCTION
    LDA #$02
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$7C
    STA SYS_GROUP
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$A1
    STA PROG_ENTRY_HI
    LDA #$90
    STA SYS_ARG_09
    LDA #$00
    STA SYS_ARG_0A
    LDA #$01
    STA SYS_ARG_0F
    LDA #$00
    STA SYS_ARG_10
    LDA #$00
    STA SYS_ARG_05
    LDA #$00
    STA SYS_ARG_06
    LDA #$00
    STA SYS_ARG_0E
    LDA #$00
    STA SYS_SUBFUNCTION
    LDA #$5F
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JSR SHELL_INIT_INPUT
    LDA #$0C
    STA CURSOR_ROW
    STA GLYPH_ROW
    LDA #$29
    STA SYS_FUNCTION
    LDA #$FA
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    LDA #$80
    STA PROG_ENTRY_LO
    LDA #$B7
    STA PROG_ENTRY_HI
    LDA #$80
    STA WORK_VEC_16_LO
    LDA #$B6
    STA WORK_VEC_16_HI
    LDY #$00
@copy_row:
    LDA (WORK_VEC_16_LO),Y
    STA (PROG_ENTRY_LO),Y
    INY
    CPY #$80
    BNE @copy_row
    RTS
; 作用：命令行输入的扫描码处理表：每项 3 字节（扫描码，处理程序地址低、高），以 0 结尾
; 引用者：SHELL_COMMAND_LOOP
SHELL_KEY_SCAN_TABLE:
    .byte $64
    .byte $6E,$8E
    .byte $3B
    .byte $63,$8C
    .byte $3C
    .byte $B3,$8D
    .byte $3D
    .byte $25,$8D
    .byte $3E
    .byte $40,$8E
    .byte $0E
    .byte $C7,$8C
    .byte $01
    .byte $8F,$8D
    .byte $4B
    .byte $C7,$8C
    .byte $4D
    .byte $63,$8C
    .byte $52
    .byte $BC,$8C
    .byte $53
    .byte $81,$8D
    .byte $00
; 作用：命令行输入的 ASCII 处理表：格式同 SHELL_KEY_SCAN_TABLE
; 引用者：SHELL_COMMAND_LOOP
SHELL_KEY_ASCII_TABLE:
    .byte $03
    .byte $8F,$8D
    .byte $18
    .byte $8F,$8D
    .byte $02
    .byte $C7,$8C
    .byte $08
    .byte $C7,$8C
    .byte $00
; 作用：读一个键到 KEY_ASCII/KEY_SCAN：FONT_SIZE 非 0 用 $6D/$0A（带输入法），否则用 $6B/$04
; 输出：KEY_ASCII、KEY_SCAN；无输入法时 IME_KEY_RESULT 置 $80。
; 调用者：SHELL_COMMAND_LOOP
SHELL_GET_KEY:
    LDA FONT_SIZE
    BEQ @no_ime
    LDA #$6D
    STA SYS_FUNCTION
    LDA #$0A
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA IME_KEY_OUT
    STA KEY_ASCII
    LDA IME_KEY_OUT+1
    STA KEY_SCAN
    JMP @return
@no_ime:
    LDA #$80
    STA IME_KEY_RESULT
    LDA #$6B
    STA SYS_FUNCTION
    LDA #$04
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
@return:
    RTS
; 作用：把 BAT_LINE_PTR_LO 指向的上一条命令（以 $0D 结尾，汉字为两字节）重新显示并复制到 CMD_TAIL
; 调用者：SHELL_READ_BATCH_LINE
SHELL_RECALL_LINE:
    PHA
    TXA
    PHA
    TYA
    PHA
    JSR SHELL_NEWLINE
    JSR SHELL_PRINT_PROMPT
    LDA #$00
    TAY
@loop:
    STA CMD_TAIL,Y
    INY
    CPY #$2A
    BNE @loop
    LDY #$00
@read_byte:
    LDA #$29
    STA SYS_FUNCTION
    LDA BAT_START_PAGE
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    LDA (BAT_LINE_PTR_LO),Y
    CMP #$0D
    BEQ @line_end
    STA CMD_TAIL,Y
    INY
    CMP #$80
    BCS @dbcs
    JSR SHELL_PUT_CHAR
    JMP @next_byte
@dbcs:
    STA LIB_TEMP_STR
    LDA CURSOR_COL
    CMP #$1F
    BCC @dbcs_wrap_done
    JSR SHELL_NEWLINE
@dbcs_wrap_done:
    LDA (BAT_LINE_PTR_LO),Y
    INY
    STA LIB_TEMP_STR+1
    JSR BAT_BYTE_COUNTDOWN
    LDA #$00
    STA LIB_TEMP_STR+2
    JSR SHELL_PRINT_TEMP
    JSR LIB_CURSOR_RIGHT
    JSR LIB_CURSOR_RIGHT
@next_byte:
    JSR BAT_BYTE_COUNTDOWN
    BCS @line_end
    JMP @read_byte
@line_end:
    CMP #$0D
    BEQ @skip_crlf
    LDA #$00
    STA CMD_TAIL,Y
    STA CMD_TAIL+41
    JMP @map_rom
@skip_crlf:
    JSR BAT_BYTE_COUNTDOWN
    JSR BAT_BYTE_COUNTDOWN
    LDA #$00
    STA CMD_TAIL,Y
    STA CMD_TAIL+41
    INY
    INY
    TYA
    CLC
    ADC BAT_LINE_PTR_LO
    STA BAT_LINE_PTR_LO
    LDA BAT_LINE_PTR_HI
    ADC #$00
    STA BAT_LINE_PTR_HI
@map_rom:
    LDA #$29
    STA SYS_FUNCTION
    LDA WINDOW_SAVE_0
    CLC
    ADC #$03
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    LDA BAT_REMAIN_LO
    BNE @finish
    LDA BAT_REMAIN_HI
    BNE @finish
    LDA #$00
    STA SHELL_PRESET_FLAG
    LDA #$7E
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    LDA BAT_START_PAGE
    STA ALLOC_START
    LDA #$01
    STA ALLOC_COUNT
    JSR VEC_SYSCALL
@finish:
    JSR SHELL_NEWLINE
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
; 作用：批处理或脚本的剩余字节数 ERAM $65E5/$65E6 减 1；用完时清 ERAM $65E3 并调用 $7E/$01 释放缓冲页（页号 ERAM $65E4）；调用 4 次
; 输出：C=0 还有剩余字节，C=1 已用完（已释放缓冲页）。
; 调用者：SHELL_RECALL_LINE
BAT_BYTE_COUNTDOWN:
    PHA
    LDA BAT_REMAIN_LO
    BEQ @check_high
    DEC BAT_REMAIN_LO
    CLC
    PLA
    RTS
@check_high:
    LDA BAT_REMAIN_HI
    BEQ @exhausted
    DEC BAT_REMAIN_HI
    DEC BAT_REMAIN_LO
    CLC
    PLA
    RTS
@exhausted:
    LDA #$00
    STA SHELL_PRESET_FLAG
    LDA #$7E
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    LDA BAT_START_PAGE
    STA ALLOC_START
    LDA #$01
    STA ALLOC_COUNT
    JSR VEC_SYSCALL
    SEC
    PLA
    RTS
; 作用：把命令名复制到 PATH_BUFFER，检查扩展名是否为 BAT；ERAM $65DD 返回 $80 或 $81（扩展名不符）
; 输出：SHELL_RUN_STATE、DOS_ERROR。
; 调用者：SHELL_EXECUTE_LINE
RUN_CHECK_BAT:
    PHA
    TXA
    PHA
    TYA
    PHA
    LDA #$80
    STA SHELL_RUN_STATE
    LDA SHELL_PRESET_FLAG
    BEQ @build_name
    INC SHELL_RUN_STATE
    JMP @finish
@build_name:
    LDY #$00
    LDX #$00
@loop:
    LDA DOS_CMD_BASE,Y
    STA PATH_BUFFER,Y
    BEQ @check_ext
    INY
    CMP #$2E
    BNE @loop
@check_ext:
    LDA DOS_CMD_BASE,Y
    STA PATH_BUFFER,Y
    BEQ @add_ext
    CMP #$42
    BNE @bad_ext
    INY
    LDA DOS_CMD_BASE,Y
    STA PATH_BUFFER,Y
    CMP #$41
    BNE @bad_ext
    INY
    LDA DOS_CMD_BASE,Y
    STA PATH_BUFFER,Y
    CMP #$54
    BNE @bad_ext
    INY
    LDA #$00
    STA PATH_BUFFER,Y
    JMP @open_file
@bad_ext:
    LDA #$81
    STA SHELL_RUN_STATE
    LDA #$80
    STA DOS_ERROR
    JMP @finish
@add_ext:
    LDA #$2E
    STA PATH_BUFFER,Y
    INY
    LDA #$42
    STA PATH_BUFFER,Y
    INY
    LDA #$41
    STA PATH_BUFFER,Y
    INY
    LDA #$54
    STA PATH_BUFFER,Y
    INY
    LDA #$00
    STA PATH_BUFFER,Y
@open_file:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$09
    STA SYS_SUBFUNCTION
    LDA #$00
    STA FILE_MODE
    JSR VEC_SYSCALL
    LDA #$81
    STA SHELL_RUN_STATE
    LDA DOS_ERROR
    BEQ @alloc_buffer
    JMP @finish
@alloc_buffer:
    LDA #$7E
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    LDA #$01
    STA ALLOC_COUNT
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BNE @close_file
    LDA ALLOC_START
    STA BAT_START_PAGE
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$0F
    STA SYS_SUBFUNCTION
    LDA BAT_START_PAGE
    STA FILE_START_PAGE
    JSR VEC_SYSCALL
    LDA #$83
    STA SHELL_RUN_STATE
    LDA DOS_ERROR
    BNE @close_file
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$0D
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BNE @close_file
    LDA FILE_SIZE_0
    STA BAT_REMAIN_LO
    LDA FILE_SIZE_1
    STA BAT_REMAIN_HI
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0A
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BNE @finish
    LDA #$01
    STA SHELL_PRESET_FLAG
    LDA #$00
    STA BAT_LINE_PTR_LO
    LDA #$B0
    STA BAT_LINE_PTR_HI
    LDA #$80
    STA SHELL_RUN_STATE
    JMP @finish
@close_file:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0A
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
@finish:
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$29
    STA SYS_FUNCTION
    LDA WINDOW_SAVE_0
    CLC
    ADC #$03
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
; 作用：把命令名复制到 PATH_BUFFER，检查扩展名是否为 .EXE，没有则补上 .EXE
; 输出：SHELL_RUN_STATE（$80 成功，$81 打不开，$82 内存不足，$83 读入出错，$00 与 $01 为临时值）、DOS_ERROR。
; 调用者：SHELL_EXECUTE_LINE
RUN_CHECK_EXE:
    PHA
    TXA
    PHA
    TYA
    PHA
    LDA #$80
    STA SHELL_RUN_STATE
    LDY #$00
    LDX #$00
@loop:
    LDA DOS_CMD_BASE,Y
    STA PATH_BUFFER,Y
    BEQ @name_copied
    INY
    BNE @loop
@name_copied:
    STY DOS_TEMP_5
    DEY
    DEY
    DEY
    DEY
    LDA DOS_CMD_BASE,Y
    INY
    CMP #$2E
    BNE @add_ext
    LDA DOS_CMD_BASE,Y
    INY
    CMP #$45
    BNE @add_ext
    LDA DOS_CMD_BASE,Y
    INY
    CMP #$58
    BNE @add_ext
    LDA DOS_CMD_BASE,Y
    INY
    CMP #$45
    BNE @add_ext
    JMP @open_file
@add_ext:
    LDY DOS_TEMP_5
    LDA #$2E
    STA PATH_BUFFER,Y
    INY
    LDA #$45
    STA PATH_BUFFER,Y
    INY
    LDA #$58
    STA PATH_BUFFER,Y
    INY
    LDA #$45
    STA PATH_BUFFER,Y
    INY
    LDA #$00
    STA PATH_BUFFER,Y
@open_file:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$09
    STA SYS_SUBFUNCTION
    LDA #$00
    STA FILE_MODE
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BEQ @opened
    LDA #$81
    STA SHELL_RUN_STATE
    JMP @finish
@opened:
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$0D
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BEQ @compute_size
    JMP @finish
@compute_size:
    LDA #$00
    STA SHELL_RUN_STATE
    LDA FILE_SIZE_0
    BEQ @check_size_1
    LDA #$01
    STA SHELL_RUN_STATE
@check_size_1:
    LDA FILE_SIZE_1
    AND #$0F
    BEQ @compute_pages
    LDA #$01
    STA SHELL_RUN_STATE
@compute_pages:
    LSR FILE_SIZE_2
    ROR FILE_SIZE_1
    LSR FILE_SIZE_2
    ROR FILE_SIZE_1
    LSR FILE_SIZE_2
    ROR FILE_SIZE_1
    LSR FILE_SIZE_2
    ROR FILE_SIZE_1
    LDA FILE_SIZE_1
    CLC
    ADC SHELL_RUN_STATE
    STA EXEC_PAGE_COUNT
    STA ALLOC_COUNT
    LDA #$7E
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$82
    STA SHELL_RUN_STATE
    LDA DOS_ERROR
    BEQ @alloc_ok
    JMP @finish
@alloc_ok:
    LDA ALLOC_START
    STA EXEC_START_PAGE
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$0F
    STA SYS_SUBFUNCTION
    LDA EXEC_START_PAGE
    STA FILE_START_PAGE
    JSR VEC_SYSCALL
    LDA #$83
    STA SHELL_RUN_STATE
    LDA DOS_ERROR
    BEQ @loaded
@fail_jump:
    JMP @finish
@loaded:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0A
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BNE @fail_jump
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$29
    STA SYS_FUNCTION
    LDA EXEC_START_PAGE
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    LDA $B003
    CMP #$AA
    BNE @bad_signature
    LDA $B004
    CMP #$55
    BNE @bad_signature
    LDA EXEC_START_PAGE
    STA $B005
    PHA
    LDA EXEC_PAGE_COUNT
    STA $B006
    PHA
    LDA #$25
    STA SYS_FUNCTION
    LDA EXEC_START_PAGE
    STA SYS_GROUP
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$80
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    PLA
    STA EXEC_PAGE_COUNT
    PLA
    STA EXEC_START_PAGE
    LDA #$00
    STA CMD_TAIL
    JSR CMD_CLS
    LDA #$80
    STA SHELL_RUN_STATE
    JMP @free_pages
@bad_signature:
    LDA #$01
    STA CURSOR_COL
    LDA #$3E
    STA LIB_GROUP
    JSR LIB_PRINT_MESSAGE
    JSR LIB_NEWLINE
@free_pages:
    LDA #$7E
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    LDA EXEC_START_PAGE
    STA ALLOC_START
    LDA EXEC_PAGE_COUNT
    STA ALLOC_COUNT
    JSR VEC_SYSCALL
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
@finish:
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
; 作用：阻塞读一个键（$6B/$04）；退格时 X 减 1、清 ERAM $63F4+X 并在屏幕上擦掉前一个字符，A 返回键值（退格已处理时为 0）
; 调用者：CMD_DIR
SHELL_INPUT_KEY:
    JSR SHELL_UPDATE_CURSOR
@loop:
    LDA #$6B
    STA SYS_FUNCTION
    LDA #$04
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA KEY_ASCII
    BEQ @loop
    CMP #$08
    BNE @return
    LDA #$00
    CPX #$00
    BEQ @return
    DEX
    LDA #$00
    STA CMD_ARG1_NAME,X
    JSR LIB_CURSOR_LEFT
    LDA #$20
    STA LIB_TEMP_STR
    LDA #$00
    STA LIB_TEMP_STR+1
    STA LIB_GROUP
    LDA #<LIB_TEMP_STR
    STA STR_PTR_LO
    LDA #>LIB_TEMP_STR
    STA STR_PTR_HI
    JSR LIB_PRINT_STRING
    LDA #$00
@return:
    RTS
; 作用：光标列置 1 后调用 LIB_NEWLINE，调用 34 次
; 调用者：SHELL_RECALL_LINE、DOS_CHECK_ERROR、CMD_CD、CMD_DIR、CMD_MD、CMD_RD
SHELL_NEWLINE:
    LDA #$01
    STA CURSOR_COL
    JSR LIB_NEWLINE
    RTS
