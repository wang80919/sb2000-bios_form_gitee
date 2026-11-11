; 作用：TYPE 命令的实现（页组 $60，序号 0）：跳过后面的字符串，转到 CMD_TYPE_BODY。
; 调用者：CMD_GROUP60_TABLE（地址表）
CMD_TYPE_IMPL:
    JMP CMD_TYPE_BODY
; 作用：字符串“|MORE”（以 0 结尾），TYPE 命令行里分页管道的写法。
; 引用者：CMD_TYPE_BODY
STR_MORE_PIPE:
    .byte $7C,$4D,$4F,$52,$45,$00
; 作用：TYPE 命令的实际入口（CMD_TYPE_IMPL 跳到这里）：解析命令行；开关位 0 打开时显示帮助消息 $61；按字体大小定每屏行数 TYPE_PAGE_LINES（FONT_SIZE 不为 0 为 13，否则 29）；指定了驱动器时提示放入磁盘并等键；取命令行里的文件名，其后可以跟“|MORE”开启分页（TYPE_PAGED_FLAG），写法不对出错码 $25；以方式 0 打开文件（$7B/$09），出错码 $F3 改为 $27；取文件大小 TYPE_REMAIN，算出需要的页数，分配缓冲（$7E/$02、$7E/$00）；缓冲够放整个文件就一次读入（$7C/$0F），否则每次读一段（$7C/$05）；用 TYPE_SHOW_BUFFER 显示，释放缓冲（$7E/$01），关闭文件（$7C/$02），恢复驱动器字母，有出错码时显示出错信息，最后换行。
; 输出：C=0 成功，C=1 失败（DOS_ERROR 为出错码）。
; 调用者：CMD_TYPE_IMPL
CMD_TYPE_BODY:
    JSR CALL_LIB_NEWLINE
    LDA #$00
    STA DOS_ERROR
    LDA #$01
    STA CURSOR_COL
    JSR CALL_CMD_PARSE_PATH_ARG
    LDA CMD_SWITCH_FLAGS
    AND #$01
    BEQ @not_help
    LDA #$61
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JSR CALL_LIB_NEWLINE
    CLC
    RTS
@not_help:
    LDA FS_DRIVE_LETTER
    PHA
    LDA #$00
    STA TYPE_PAGED_FLAG
    STA TYPE_LINE_COUNT
    STA TYPE_HIGH_COUNT
    LDA FONT_SIZE
    BEQ @page_lines_29
    LDA #$0D
    BNE @set_page_lines
@page_lines_29:
    LDA #$1D
@set_page_lines:
    STA TYPE_PAGE_LINES
    LDA CMD_ARG1_DRIVE
    BEQ @parse_tail
    LDA #$62
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    LDA CMD_ARG1_DRIVE
    JSR CMD_PUT_CHAR
    LDA #$63
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JSR CALL_LIB_NEWLINE
    JSR CALL_GET_KEY_WAIT
@parse_tail:
    LDY #$00
@skip_spaces:
    LDA CMD_TAIL,Y
    CMP #$20
    BNE @copy_name_start
    INY
    BNE @skip_spaces
@copy_name_start:
    LDX #$00
@copy_name:
    LDA CMD_TAIL,Y
    BEQ @terminate_name
    CMP #$20
    BEQ @name_end
    STA PATH_BUFFER,X
    INY
    INX
    BNE @copy_name
@name_end:
    STX DOS_TEMP_5
    LDX #$00
@skip_spaces2:
    INY
    LDA CMD_TAIL,Y
    BEQ @name_ready
    CMP #$20
    BEQ @skip_spaces2
    BNE @check_more
@next_more_char:
    INY
    LDA CMD_TAIL,Y
    BEQ @more_end
    CMP #$20
    BEQ @next_more_char
@check_more:
    CMP STR_MORE_PIPE,X
    BEQ @more_char_match
    LDA #$25
    STA DOS_ERROR
    SEC
    JMP @finish
@more_char_match:
    INX
    BNE @next_more_char
@more_end:
    LDA STR_MORE_PIPE,X
    BEQ @paged
    LDA #$25
    STA DOS_ERROR
    SEC
    JMP @finish
@paged:
    LDA #$01
    STA TYPE_PAGED_FLAG
@name_ready:
    LDX DOS_TEMP_5
@terminate_name:
    LDA #$00
    STA PATH_BUFFER,X
    CPX #$00
    BNE @open_file
    SEC
    JMP @finish
@open_file:
    LDA #$00
    STA FILE_MODE
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$09
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BEQ @opened
    CMP #$F3
    BNE @open_failed
    LDA #$27
    STA DOS_ERROR
@open_failed:
    SEC
    JMP @close_file
@opened:
    LDX FILE_HANDLE_OFFSET
    LDA FH_SIZE_0,X
    STA TYPE_REMAIN_0
    LDA FH_SIZE_1,X
    STA TYPE_REMAIN_1
    LDA FH_SIZE_2,X
    STA TYPE_REMAIN_2
    ORA TYPE_REMAIN_1
    ORA TYPE_REMAIN_0
    BNE @size_nonzero
    CLC
    JMP @close_file
@size_nonzero:
    LDA TYPE_REMAIN_2
    STA TYPE_PAGES_HI
    LDA TYPE_REMAIN_1
    AND #$F0
    STA TYPE_PAGES_LO
    LSR TYPE_PAGES_HI
    ROR TYPE_PAGES_LO
    LSR TYPE_PAGES_HI
    ROR TYPE_PAGES_LO
    LSR TYPE_PAGES_HI
    ROR TYPE_PAGES_LO
    LSR TYPE_PAGES_HI
    ROR TYPE_PAGES_LO
    LDA TYPE_REMAIN_1
    AND #$0F
    ORA TYPE_REMAIN_0
    BEQ @pages_ready
    LDA TYPE_PAGES_LO
    CLC
    ADC #$01
    STA TYPE_PAGES_LO
    LDA TYPE_PAGES_HI
    ADC #$00
    STA TYPE_PAGES_HI
@pages_ready:
    LDA #$7E
    STA SYS_FUNCTION
    LDA #$02
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BEQ @can_alloc
    SEC
    JMP @close_file
@can_alloc:
    LDA #$7E
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BEQ @allocated
    SEC
    JMP @close_file
@allocated:
    LDA ALLOC_COUNT
    STA TYPE_PAGES_LEFT
    STA TYPE_CHUNK_PAGES
    LDA TYPE_PAGES_HI
    BNE @read_in_chunks
    LDA TYPE_PAGES_LEFT
    CMP TYPE_PAGES_LO
    BCC @read_in_chunks
    LDA ALLOC_START
    STA FILE_START_PAGE
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$0F
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BEQ @show_file
    SEC
    JMP @free_buffer
@read_in_chunks:
    LDA #$00
    STA FILE_START_OFFSET_LO
    STA FILE_START_OFFSET_HI
    STA FILE_OFFSET_0
    STA FILE_OFFSET_1
    STA FILE_OFFSET_2
    STA FILE_SIZE_0
    STA FILE_SIZE_2
    LDA TYPE_PAGES_LEFT
    STA FILE_SIZE_1
    ASL FILE_SIZE_1
    ROL FILE_SIZE_2
    ASL FILE_SIZE_1
    ROL FILE_SIZE_2
    ASL FILE_SIZE_1
    ROL FILE_SIZE_2
    ASL FILE_SIZE_1
    ROL FILE_SIZE_2
    LDA ALLOC_START
    STA FILE_START_PAGE
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$05
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BEQ @show_file
    SEC
    JMP @free_buffer
@show_file:
    LDA WINDOW_SAVE_0
    CLC
    ADC #$03
    PHA
    JSR TYPE_SHOW_BUFFER
    PLA
    STA FILE_START_PAGE
    LDA FILE_START_PAGE
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    CLC
@free_buffer:
    PHP
    LDA DOS_ERROR
    PHA
    LDA #$7E
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    PLA
    STA DOS_ERROR
    PLP
@close_file:
    PHP
    LDA DOS_ERROR
    PHA
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$02
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    PLA
    STA DOS_ERROR
    PLP
@finish:
    PLA
    STA FS_DRIVE_LETTER
    LDA DOS_ERROR
    BEQ @done_newline
    PHP
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JSR CALL_LIB_NEWLINE
    PLP
@done_newline:
    JSR CALL_LIB_NEWLINE
    RTS
; 作用：TYPE 命令的显示循环：把文件内容（ERAM 页 FILE_START_PAGE 起，窗口 $B000）逐字符显示，$0D、$0A 换行，制表符显示为空格
; 调用者：CMD_TYPE_BODY
TYPE_SHOW_BUFFER:
    LDA #$01
    STA CURSOR_COL
    LDA FILE_START_PAGE
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$00
    STA FS_PTR_LO
    LDA #$B0
    STA FS_PTR_HI
@loop:
    LDY #$00
    LDX #$00
@next_char:
    LDA (FS_PTR_LO),Y
    CMP #$0D
    BNE @check_tab
    JSR TYPE_NEXT_BYTE
    BCS @flush_line
    LDA (FS_PTR_LO),Y
    CMP #$0A
    BNE @check_tab
    JSR TYPE_FLUSH_LINE
    BCS @return
    JSR TYPE_NEXT_BYTE
    BCS @return
    JMP @advance_ptr
@check_tab:
    CMP #$09
    BNE @push_char
    LDA #$20
@push_char:
    PHA
    BPL @check_width
    INC TYPE_HIGH_COUNT
@check_width:
    CPX #$1D
    BNE @store_char
    LDA TYPE_HIGH_COUNT
    LSR A
    BCC @store_char
    PLA
    CLC
    BCC @flush_line
@store_char:
    PLA
    STA CMD_TAIL,X
    INX
    JSR TYPE_NEXT_BYTE
    BCS @flush_line
    CPX #$1E
    BNE @next_char
    CLC
@flush_line:
    PHP
    JSR TYPE_FLUSH_LINE
    BCC @flush_done
    PLP
    JMP @return
@flush_done:
    PLP
    BCS @return
@advance_ptr:
    TYA
    CLC
    ADC FS_PTR_LO
    STA FS_PTR_LO
    LDA FS_PTR_HI
    ADC #$00
    STA FS_PTR_HI
    LDA #$00
    STA TYPE_HIGH_COUNT
    JMP @loop
@return:
    RTS
; 作用：TYPE 把已累积的一行（CMD_TAIL）显示出来；TYPE_PAGED_FLAG 打开分页时，满一屏后显示消息 $60 并等键，按 Q 或 q 结束
; 输出：C=1 要求结束显示（按了 Q、q 或 Ctrl+C），C=0 继续。
; 调用者：TYPE_SHOW_BUFFER
TYPE_FLUSH_LINE:
    TYA
    PHA
    CPX #$00
    BEQ @newline
    LDA #$00
    STA CMD_TAIL,X
    LDA #<CMD_TAIL
    STA STR_PTR_LO
    LDA #>CMD_TAIL
    STA STR_PTR_HI
    LDA #$00
    STA LIB_GROUP
    JSR CALL_LIB_PRINT_STRING
@newline:
    JSR CALL_LIB_NEWLINE
    CLC
    LDA TYPE_PAGED_FLAG
    BEQ @check_break
    LDA TYPE_LINE_COUNT
    CLC
    ADC #$01
    CMP TYPE_PAGE_LINES
    BNE @store_count
    LDA #$60
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JSR CALL_LIB_NEWLINE
    LDA #$01
    STA CURSOR_COL
    JSR CALL_GET_KEY_WAIT
    LDA KEY_ASCII
    CMP #$51
    BNE @check_q_lower
    SEC
    BEQ @restore_page
@check_q_lower:
    CMP #$71
    BNE @check_ctrl_c
    SEC
    BEQ @restore_page
@check_ctrl_c:
    CMP #$03
    BNE @reset_count
    SEC
    BEQ @restore_page
@reset_count:
    LDA #$00
@store_count:
    STA TYPE_LINE_COUNT
@check_break:
    JSR CALL_GET_KEY_NOWAIT
    LDA KEY_ASCII
    CMP #$03
    BNE @no_break
    SEC
    BCS @restore_page
@no_break:
    CLC
@restore_page:
    LDA FILE_START_PAGE
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    PLA
    TAY
    RTS
; 作用：TYPE 取下一字节：剩余长度 TYPE_REMAIN 减 1，减到 0 结束；指针到 $C000 时换下一页
; 输出：C=0 取到下一字节（Y 加 1），C=1 文件结束或读盘出错。
; 调用者：TYPE_SHOW_BUFFER
TYPE_NEXT_BYTE:
    TXA
    PHA
    LDA TYPE_REMAIN_0
    SEC
    SBC #$01
    STA TYPE_REMAIN_0
    LDA TYPE_REMAIN_1
    SBC #$00
    STA TYPE_REMAIN_1
    LDA TYPE_REMAIN_2
    SBC #$00
    STA TYPE_REMAIN_2
    ORA TYPE_REMAIN_1
    BNE @advance
    ORA TYPE_REMAIN_0
    BNE @advance
    JMP @end_of_file
@advance:
    INY
    TYA
    CLC
    ADC FS_PTR_LO
    LDA #$00
    ADC FS_PTR_HI
    CMP #$C0
    BCS @next_page
    JMP @ok
@next_page:
    INC FILE_START_PAGE
    DEC TYPE_PAGES_LEFT
    BNE @chunk_loaded
    LDA ALLOC_START
    STA FILE_START_PAGE
    LDA #$00
    STA FILE_START_OFFSET_LO
    STA FILE_START_OFFSET_HI
    LDA TYPE_CHUNK_PAGES
    STA TYPE_PAGES_LEFT
    LDA FILE_OFFSET_0
    CLC
    ADC FILE_SIZE_0
    STA FILE_OFFSET_0
    LDA FILE_OFFSET_1
    ADC FILE_SIZE_1
    STA FILE_OFFSET_1
    LDA FILE_OFFSET_2
    ADC FILE_SIZE_2
    STA FILE_OFFSET_2
    LDA FILE_SIZE_0
    SEC
    SBC TYPE_REMAIN_0
    LDA FILE_SIZE_1
    SBC TYPE_REMAIN_1
    LDA FILE_SIZE_2
    SBC TYPE_REMAIN_2
    BCC @size_clamped
    LDA TYPE_REMAIN_0
    STA FILE_SIZE_0
    LDA TYPE_REMAIN_1
    STA FILE_SIZE_1
    LDA TYPE_REMAIN_2
    STA FILE_SIZE_2
@size_clamped:
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$05
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BEQ @chunk_loaded
    BNE @end_of_file
@chunk_loaded:
    LDA FILE_START_PAGE
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$00
    STA FS_PTR_LO
    LDA #$B0
    STA FS_PTR_HI
    LDY #$00
@ok:
    PLA
    TAX
    CLC
    RTS
@end_of_file:
    PLA
    TAX
    SEC
    RTS
; 作用：调用 $6B/$03 取一个键（不等待）
; 输出：KEY_ASCII、KEY_SCAN（没有键时为 0）。
; 调用者：TYPE_FLUSH_LINE
CALL_GET_KEY_NOWAIT:
    LDA #$6B
    STA SYS_FUNCTION
    LDA #$03
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    RTS
