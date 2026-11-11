; ------------------------------------------------------------------------
; 名称：command-group-5e.asm
; 说明：页组 5E 的 DOS 命令：命令表、DISKCOPY、CLJS 等
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：占ROM 第 5E-5E 页，汇编地址 $8000 起，后面的文件接在它后面
; ------------------------------------------------------------------------
.org $8000
    LDA CMD_SELECT
    ASL A
    TAX
    LDA CMD_GROUP5E_TABLE,X
    STA STR_PTR_LO
    INX
    LDA CMD_GROUP5E_TABLE,X
    STA STR_PTR_HI
    JMP (STR_PTR_LO)
; 作用：页组 $5E 的命令实现入口表：序号由 CMD_SELECT 给出，0 DISKCOPY、1 CLJS、2 VER、3 HELP、4 DATE、5 TIME
; 引用者：command-group-5e.asm 开头的入口代码
CMD_GROUP5E_TABLE:
    .word CMD_DISKCOPY_IMPL,CMD_CLJS_IMPL,CMD_VER_IMPL,CMD_HELP_IMPL,CMD_DATE_IMPL,CMD_TIME_IMPL
    STA LIB_GROUP
    LDA #$25
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_GROUP
    LDA #<CALL_LIB_CURSOR_UP_5E
    STA PROG_ENTRY_LO
    LDA #>CALL_LIB_CURSOR_UP_5E
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    RTS
; 作用：经功能 $25 调用页组 0 的 $8081（LIB_CURSOR_LEFT，光标左移一格）
; 调用者：CMD_INPUT_KEY_5E
CALL_LIB_CURSOR_LEFT_5E:
    LDA #$25
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_GROUP
    LDA #<LIB_CURSOR_LEFT
    STA PROG_ENTRY_LO
    LDA #>LIB_CURSOR_LEFT
    STA PROG_ENTRY_HI
; 作用：经功能 $25 调用页组 0 的 LIB_CURSOR_UP（光标上移）
; 调用者：CMD_GROUP5E_TABLE（取地址）、CALL_LIB_CURSOR_LEFT_5E（顺序执行到这里）
CALL_LIB_CURSOR_UP_5E:
    JSR VEC_SYSCALL
    RTS
    LDA #$25
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_GROUP
    LDA #<LIB_CURSOR_UP
    STA PROG_ENTRY_LO
    LDA #>LIB_CURSOR_UP
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    RTS
; 作用：经功能 $25 调用页组 0 的 LIB_CURSOR_RIGHT（光标右移一格）
; 调用者：CMD_PUT_CHAR_5E
CALL_LIB_CURSOR_RIGHT_5E:
    LDA #$25
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_GROUP
    LDA #<LIB_CURSOR_RIGHT
    STA PROG_ENTRY_LO
    LDA #>LIB_CURSOR_RIGHT
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    RTS
; 作用：经功能 $25 调用页组 0 的 LIB_NEWLINE（换行）；调用 20 次
; 调用者：CMD_NEWLINE_5E、CMD_DISKCOPY_IMPL、CMD_CLJS_IMPL、CMD_VER_IMPL、CMD_HELP_IMPL
CALL_LIB_NEWLINE_5E:
    LDA #$25
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_GROUP
    LDA #<LIB_NEWLINE
    STA PROG_ENTRY_LO
    LDA #>LIB_NEWLINE
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    RTS
; 作用：调用 $6B/$04 等一个键
; 调用者：CMD_FLUSH_KEYS_WAIT、CMD_HELP_IMPL
CALL_GET_KEY_WAIT_5E:
    LDA #$6B
    STA SYS_FUNCTION
    LDA #$04
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：经功能 $25 调用页组 0 的 LIB_PRINT_MESSAGE
; 调用者：CMD_VER_IMPL、CMD_HELP_IMPL
CALL_LIB_PRINT_MESSAGE_5E:
    LDA #$25
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_GROUP
    LDA #<LIB_PRINT_MESSAGE
    STA PROG_ENTRY_LO
    LDA #>LIB_PRINT_MESSAGE
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    RTS
; 作用：经功能 $25 调用页组 0 的 LIB_PRINT_STRING
; 调用者：CMD_PUT_CHAR_5E、CMD_INPUT_KEY_5E、CMD_DATE_IMPL、CMD_TIME_IMPL
CALL_LIB_PRINT_STRING_5E:
    LDA #$25
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_GROUP
    LDA #<LIB_PRINT_STRING
    STA PROG_ENTRY_LO
    LDA #>LIB_PRINT_STRING
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    RTS
; 作用：经功能 $25 调用页组 0 的 SHELL_PRINT_MESSAGE（LIB_GROUP 为消息序号）；调用 26 次
; 调用者：CMD_CHECK_ERROR_5E、CMD_DISKCOPY_IMPL、CMD_CLJS_IMPL、CMD_VER_IMPL、CMD_HELP_IMPL、CMD_DATE_IMPL、CMD_TIME_IMPL
CALL_SHELL_PRINT_MESSAGE_5E:
    LDA #$25
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_GROUP
    LDA #<SHELL_PRINT_MESSAGE
    STA PROG_ENTRY_LO
    LDA #>SHELL_PRINT_MESSAGE
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    RTS
; 作用：经功能 $25 调用页组 0 的 CMD_PARSE_PATH_ARG（解析命令行路径与开关）
; 调用者：CMD_DISKCOPY_IMPL、CMD_VER_IMPL、CMD_DATE_IMPL、CMD_TIME_IMPL
CALL_CMD_PARSE_PATH_ARG_5E:
    LDA #$25
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_GROUP
    LDA #<CMD_PARSE_PATH_ARG
    STA PROG_ENTRY_LO
    LDA #>CMD_PARSE_PATH_ARG
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    RTS
; 作用：显示字符 A：写入 LIB_TEMP_STR 后显示并让光标右移一格
; 输入：A=字符（返回时保持不变）。
; 调用者：CMD_DISKCOPY_IMPL、CMD_DATE_IMPL、CMD_TIME_IMPL
CMD_PUT_CHAR_5E:
    PHA
    STA LIB_TEMP_STR
    LDA #$00
    STA LIB_TEMP_STR+1
    STA LIB_GROUP
    LDA #<LIB_TEMP_STR
    STA STR_PTR_LO
    LDA #>LIB_TEMP_STR
    STA STR_PTR_HI
    JSR CALL_LIB_PRINT_STRING_5E
    JSR CALL_LIB_CURSOR_RIGHT_5E
    PLA
    RTS
; 作用：更新光标后等一个键；退格时 X 减 1、清 CMD_ARG1_NAME+X 并在屏幕上擦掉前一字符，A 返回键值（退格已处理时为 0）
; 输出：A=键值（退格已处理或没有键值时为 0），X=当前输入位置。
; 调用者：CMD_DATE_IMPL、CMD_TIME_IMPL
CMD_INPUT_KEY_5E:
    JSR CMD_UPDATE_CURSOR_5E
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
    JSR CALL_LIB_CURSOR_LEFT_5E
    LDA #$20
    STA LIB_TEMP_STR
    LDA #$00
    STA LIB_TEMP_STR+1
    STA LIB_GROUP
    LDA #<LIB_TEMP_STR
    STA STR_PTR_LO
    LDA #>LIB_TEMP_STR
    STA STR_PTR_HI
    JSR CALL_LIB_PRINT_STRING_5E
    LDA #$00
@return:
    RTS
; 作用：用方波 2 发一声提示音：$4015 写 2，SQ2_VOL、SQ2_SWEEP 取 $F848 起的值，SQ2_LO=$6A，SQ2_HI=$08
; 调用者：CMD_DATE_IMPL、CMD_TIME_IMPL
BEEP_SQ2:
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
; 作用：光标列置 1 后换行
; 调用者：CMD_CHECK_ERROR_5E、CMD_DATE_IMPL、CMD_TIME_IMPL
CMD_NEWLINE_5E:
    LDA #$01
    STA CURSOR_COL
    JSR CALL_LIB_NEWLINE_5E
    RTS
; 作用：把 A（0-99，位 7 忽略）显示成两位十进制，C=1 时前导 0 显示为 0，否则显示空格
; 输入：A=数值，C=是否把前导 0 显示成 0（入口先置 C=1 跳过 CLC，所以这个入口总是显示 0）。
; 调用者：CMD_DATE_IMPL、CMD_TIME_IMPL
CMD_PRINT_DEC_2DIGIT_5E:
    SEC
    BCS @body
    CLC
@body:
    PHP
    AND #$7F
    CMP #$64
    BCC @under_100
    SBC #$64
@under_100:
    PHA
    LDA #$00
    STA CMD_TEMP_1
    PLA
@loop:
    CMP #$0A
    BCC @tens_done
    INC CMD_TEMP_1
    SBC #$0A
    JMP @loop
@tens_done:
    PLP
    PHA
    BCS @tens_digit
    LDA CMD_TEMP_1
    BNE @tens_digit
    LDA #$20
    JMP @put_tens
@tens_digit:
    LDA CMD_TEMP_1
    ORA #$30
@put_tens:
    JSR CMD_OUTBUF_PUT_CHAR_5E
    PLA
    ORA #$30
    JSR CMD_OUTBUF_PUT_CHAR_5E
    RTS
; 作用：把 A 追加到字符串缓冲 CMD_FULL_PATH（以 0 结尾）
; 输入：A=字符（返回时保持不变）。
; 调用者：CMD_PRINT_DEC_2DIGIT_5E、CMD_DATE_IMPL、CMD_TIME_IMPL
CMD_OUTBUF_PUT_CHAR_5E:
    STA CMD_CHAR_TEMP
    TXA
    PHA
    LDX #$00
@loop:
    LDA CMD_FULL_PATH,X
    BEQ @append
    INX
    JMP @loop
@append:
    LDA CMD_CHAR_TEMP
    STA CMD_FULL_PATH,X
    INX
    LDA #$00
    STA CMD_FULL_PATH,X
    PLA
    TAX
    LDA CMD_CHAR_TEMP
    RTS
; 作用：把 CMD_INPUT_TEXT 里的十进制数字串转成数值放 CMD_TEMP_0（逐位乘 10 累加，只取低字节）
; 输入：CMD_INPUT_TEXT。
; 输出：CMD_TEMP_0。
; 调用者：CMD_DATE_IMPL
PARSE_DEC_BYTE:
    PHA
    TYA
    PHA
    TXA
    PHA
    LDA #$00
    STA CMD_TEMP_0
    TAX
@next_digit:
    LDA CMD_INPUT_TEXT,X
    BEQ @done
    TXA
    PHA
    CLC
    LDA CMD_TEMP_0
    TAY
    LDX #$01
@loop:
    TYA
    CLC
    ADC CMD_TEMP_0
    STA CMD_TEMP_0
    INX
    TXA
    CMP #$0A
    BNE @loop
    PLA
    TAX
    LDA CMD_INPUT_TEXT,X
    SEC
    SBC #$30
    CLC
    ADC CMD_TEMP_0
    STA CMD_TEMP_0
    INX
    JMP @next_digit
@done:
    PLA
    TAX
    PLA
    TAY
    PLA
    RTS
; 作用：DOS_ERROR 为 0 返回 C=0，否则显示出错信息并 C=1
; 输出：C=0 无错，C=1 有错。
; 调用者：CMD_DATE_IMPL、CMD_TIME_IMPL
CMD_CHECK_ERROR_5E:
    LDA DOS_ERROR
    BNE @show
    CLC
    RTS
@show:
    JSR CMD_NEWLINE_5E
    LDA DOS_ERROR
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    JSR CMD_NEWLINE_5E
    SEC
    RTS
; 作用：打开精灵（$10/$04、SYS_ARG_0F=$10），把光标位置写进精灵 0（SPRITE0_Y 起），属性 0
; 调用者：CMD_INPUT_KEY_5E
CMD_UPDATE_CURSOR_5E:
    PHA
    TXA
    PHA
    LDA #$10
    STA SYS_FUNCTION
    LDA #$04
    STA SYS_SUBFUNCTION
    LDA #$10
    STA SYS_ARG_0F
    JSR VEC_SYSCALL
    LDA CURSOR_ROW
    ASL A
    ASL A
    ASL A
    STA SPRITE0_Y
    LDX SHELL_FIRST_CHAR
    INX
    STX SPRITE0_TILE
    LDA #$00
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
; 作用：DISKCOPY 命令的实现（页组 $5E，序号 0）：解析命令行；开关位 0 或没有给出驱动器时显示帮助（消息 $4A）；必须给出源与目的两个驱动器（A、B），不能带路径与文件名；取可用页（$7E/$02、$7E/$00）作缓冲，换算出每次能复制的扇区数与磁道数；把 2880 个扇区（$0B40）按缓冲大小分块：每块先提示放入源盘（消息 $46、$3C、$47）并读入（$80/$04），读出错时询问重试、放弃或忽略（消息 $83，R、A、F），再提示放入目的盘（消息 $48、$49）并写出（$80/$05），出错同样询问；块之间推进扇区、磁头、磁道位置，磁道到 80 结束；最后释放缓冲页并让软驱停转（CALL_DISK_RESET）。保存和恢复 A、X、Y。
; 调用者：CMD_GROUP5E_TABLE（地址表）
CMD_DISKCOPY_IMPL:
    PHA
    TXA
    PHA
    TYA
    PHA
    JSR CALL_CMD_PARSE_PATH_ARG_5E
    LDA DOS_ERROR
    BEQ @args_ok
@invalid_args:
    LDA #$01
    STA CURSOR_COL
    LDA #$25
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    JSR CALL_LIB_NEWLINE_5E
    JMP @finish
@args_ok:
    LDA CMD_SWITCH_FLAGS
    AND #$01
    BEQ @check_drives
@show_help:
    LDA #$01
    STA CURSOR_COL
    LDA #$4A
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    JMP @finish
@check_drives:
    LDA CMD_ARG1_DRIVE
    ORA CMD_ARG2_DRIVE
    BEQ @show_help
    LDA CMD_ARG1_DRIVE
    AND CMD_ARG2_DRIVE
    BEQ @invalid_args
    LDA CMD_ARG1_DRIVE
    CMP #$41
    BEQ @check_dest_drive
    CMP #$42
    BNE @invalid_args
@check_dest_drive:
    LDA CMD_ARG2_DRIVE
    CMP #$41
    BEQ @alloc_buffer
    CMP #$42
    BNE @invalid_args
@alloc_buffer:
    LDA CMD_ARG1_PATH
    ORA CMD_ARG2_PATH
    ORA CMD_ARG1_NAME
    ORA CMD_ARG2_NAME
    BNE @invalid_args
    LDA #$7E
    STA SYS_FUNCTION
    LDA #$02
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA ALLOC_COUNT
    STA EXEC_PAGE_COUNT
    LDA #$7E
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA ALLOC_START
    STA EXEC_START_PAGE
    LDA #$00
    STA DISKCOPY_WORK_0
    STA CMD_SELECT
    STA DISKCOPY_WORK_1
    LDA EXEC_PAGE_COUNT
    ASL A
@count_tracks:
    CMP #$09
    BCC @calc_remainder
    INC DISKCOPY_WORK_0
    SEC
    SBC #$09
    JMP @count_tracks
@calc_remainder:
    ASL A
    ASL A
    CMP #$12
    BCC @store_remainder
    INC CMD_SELECT
    SEC
    SBC #$12
@store_remainder:
    STA DISKCOPY_WORK_1
    LDA #$40
    STA DISKCOPY_WORK_5
    LDA #$0B
    STA DISKCOPY_WORK_6
    LDA EXEC_START_PAGE
    STA DISK_PAGE
    LDA EXEC_PAGE_COUNT
    STA DISK_COUNT_LO
    LDA #$00
    STA DISK_COUNT_HI
    STA DISK_PAGE_SECTOR
    STA DISKCOPY_WORK_2
    STA DISKCOPY_WORK_3
    STA DISKCOPY_WORK_4
    ASL DISK_COUNT_LO
    ROL DISK_COUNT_HI
    ASL DISK_COUNT_LO
    ROL DISK_COUNT_HI
    ASL DISK_COUNT_LO
    ROL DISK_COUNT_HI
    LDA DISK_COUNT_LO
    STA DISKCOPY_COUNT_LO
    LDA DISK_COUNT_HI
    STA DISKCOPY_COUNT_HI
@next_chunk:
    LDA DISKCOPY_WORK_6
    CMP DISKCOPY_COUNT_HI
    BEQ @compare_low
    BCS @remaining_ge_chunk
    CLC
    JMP @chunk_decided
@compare_low:
    LDA DISKCOPY_WORK_5
    CMP DISKCOPY_COUNT_LO
    BCS @remaining_ge_chunk
    CLC
    JMP @chunk_decided
@remaining_ge_chunk:
    SEC
@chunk_decided:
    BCC @last_chunk
    LDA DISKCOPY_WORK_5
    SEC
    SBC DISKCOPY_COUNT_LO
    STA DISKCOPY_WORK_5
    LDA DISKCOPY_WORK_6
    SBC DISKCOPY_COUNT_HI
    STA DISKCOPY_WORK_6
    JMP @prompt_source
@last_chunk:
    LDA DISKCOPY_WORK_5
    STA DISKCOPY_COUNT_LO
    LDA DISKCOPY_WORK_6
    STA DISKCOPY_COUNT_HI
@prompt_source:
    LDA #$01
    STA CURSOR_COL
    LDA #$46
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    LDA CMD_ARG1_DRIVE
    JSR CMD_PUT_CHAR_5E
    LDA #$3A
    JSR CMD_PUT_CHAR_5E
    JSR CALL_LIB_NEWLINE_5E
    LDA #$01
    STA CURSOR_COL
    LDA #$3C
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    JSR CALL_LIB_NEWLINE_5E
    JSR CMD_FLUSH_KEYS_WAIT
    LDA #$01
    STA CURSOR_COL
    LDA #$47
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    JSR CALL_LIB_NEWLINE_5E
@read_source:
    LDA #$80
    STA SYS_FUNCTION
    LDA #$04
    STA SYS_SUBFUNCTION
    LDA #$81
    STA DISK_MODE
    LDA DISKCOPY_COUNT_LO
    STA DISK_COUNT_LO
    LDA DISKCOPY_COUNT_HI
    STA DISK_COUNT_HI
    LDA DISKCOPY_WORK_2
    STA DISK_HEAD
    LDA DISKCOPY_WORK_3
    STA DISK_TRACK
    LDA DISKCOPY_WORK_4
    STA DISK_SECTOR
    INC DISK_SECTOR
    JSR VEC_SYSCALL
    LDA DISK_STATUS
    BEQ @prompt_dest
    STA LIB_GROUP
    LDA #$01
    STA CURSOR_COL
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    JSR CALL_LIB_NEWLINE_5E
@read_error_prompt:
    LDA #$01
    STA CURSOR_COL
    LDA #$83
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE_5E
@read_error_key:
    JSR CMD_FLUSH_KEYS_WAIT
    LDA KEY_ASCII
    CMP #$20
    BCC @read_error_key
    CMP #$7F
    BCS @read_error_key
    PHA
    JSR CMD_PUT_CHAR_5E
    JSR CALL_LIB_NEWLINE_5E
    PLA
    CMP #$52
    BEQ @read_source
    CMP #$72
    BEQ @read_source
    CMP #$41
    BEQ @abort_jump
    CMP #$61
    BEQ @abort_jump
    CMP #$46
    BEQ @prompt_dest
    CMP #$66
    BEQ @prompt_dest
    JMP @read_error_prompt
@abort_jump:
    JMP @cleanup
@prompt_dest:
    LDA #$01
    STA CURSOR_COL
    LDA #$48
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    LDA CMD_ARG2_DRIVE
    JSR CMD_PUT_CHAR_5E
    LDA #$3A
    JSR CMD_PUT_CHAR_5E
    JSR CALL_LIB_NEWLINE_5E
    LDA #$01
    STA CURSOR_COL
    LDA #$3C
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    JSR CALL_LIB_NEWLINE_5E
    JSR CMD_FLUSH_KEYS_WAIT
    LDA #$01
    STA CURSOR_COL
    LDA #$49
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    JSR CALL_LIB_NEWLINE_5E
@write_dest:
    LDA #$80
    STA SYS_FUNCTION
    LDA #$81
    STA DISK_MODE
    LDA #$05
    STA SYS_SUBFUNCTION
    LDA DISKCOPY_COUNT_LO
    STA DISK_COUNT_LO
    LDA DISKCOPY_COUNT_HI
    STA DISK_COUNT_HI
    LDA DISKCOPY_WORK_2
    STA DISK_HEAD
    LDA DISKCOPY_WORK_3
    STA DISK_TRACK
    LDA DISKCOPY_WORK_4
    STA DISK_SECTOR
    INC DISK_SECTOR
    JSR VEC_SYSCALL
    LDA DISK_STATUS
    BEQ @advance_position
    STA LIB_GROUP
    LDA #$01
    STA CURSOR_COL
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    JSR CALL_LIB_NEWLINE_5E
@write_error_prompt:
    LDA #$01
    STA CURSOR_COL
    LDA #$83
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE_5E
@write_error_key:
    JSR CMD_FLUSH_KEYS_WAIT
    LDA KEY_ASCII
    CMP #$20
    BCC @write_error_key
    CMP #$7F
    BCS @write_error_key
    PHA
    JSR CMD_PUT_CHAR_5E
    JSR CALL_LIB_NEWLINE_5E
    PLA
    CMP #$52
    BEQ @write_dest
    CMP #$72
    BEQ @write_dest
    CMP #$41
    BEQ @cleanup
    CMP #$61
    BEQ @cleanup
    CMP #$46
    BEQ @advance_position
    CMP #$66
    BEQ @advance_position
    JMP @write_error_prompt
@advance_position:
    CLC
    LDA DISKCOPY_WORK_4
    ADC DISKCOPY_WORK_1
    CMP #$12
    BCC @store_sector
    SEC
    SBC #$12
    SEC
@store_sector:
    STA DISKCOPY_WORK_4
    LDA DISKCOPY_WORK_2
    ADC CMD_SELECT
    CMP #$02
    BCC @store_head
    SEC
    SBC #$02
    SEC
@store_head:
    STA DISKCOPY_WORK_2
    LDA DISKCOPY_WORK_3
    ADC DISKCOPY_WORK_0
    STA DISKCOPY_WORK_3
    CMP #$50
    BCS @cleanup
    JMP @next_chunk
@cleanup:
    LDA EXEC_PAGE_COUNT
    STA ALLOC_COUNT
    LDA EXEC_START_PAGE
    STA ALLOC_START
    LDA #$7E
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CALL_DISK_RESET
@finish:
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
; 作用：调用 $80/$07（软驱复位）
; 调用者：CMD_DISKCOPY_IMPL
CALL_DISK_RESET:
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：先 $6B/$05 清空按键队列，再等一个键
; 输出：KEY_ASCII、KEY_SCAN。
; 调用者：CMD_DISKCOPY_IMPL
CMD_FLUSH_KEYS_WAIT:
    LDA #$6B
    STA SYS_FUNCTION
    LDA #$05
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CALL_GET_KEY_WAIT_5E
    RTS
; 作用：CLJS 命令的实现（页组 $5E，序号 1）：打开 MENU.BIN（STR_MENU_BIN 起的字符串），失败时显示出错信息；成功则初始化显示并显示提示“正在装入大型游戏软件”，之后装入运行（像是游戏集锦菜单）
; 调用者：CMD_GROUP5E_TABLE（地址表）
CMD_CLJS_IMPL:
    LDY #$00
@loop:
    LDA STR_MENU_BIN,Y
    STA PATH_BUFFER,Y
    BEQ @name_copied
    INY
    JMP @loop
@name_copied:
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    LDA #$00
    STA FILE_MODE
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BEQ @opened
    STA LIB_GROUP
    JSR CALL_LIB_NEWLINE_5E
    LDA #$01
    STA CURSOR_COL
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    JSR CALL_LIB_NEWLINE_5E
    JSR CALL_LIB_NEWLINE_5E
    RTS
@opened:
    LDA #$FF
    STA SPRITE0_Y
    STA SPRITE0_TILE
    STA SPRITE0_ATTR
    STA SPRITE0_X
    LDA #$10
    STA SYS_FUNCTION
    LDA #$04
    STA SYS_SUBFUNCTION
    LDA #$00
    STA SYS_ARG_0F
    JSR VEC_SYSCALL
    LDA #$3F
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_ARG_0B
    STA SYS_ARG_0C
    LDA WINDOW_SAVE_0
    STA SYS_GROUP
    LDA #<STR_BLANK_5E
    STA PROG_ENTRY_LO
    LDA #>STR_BLANK_5E
    STA PROG_ENTRY_HI
    LDA #$00
    STA SYS_ARG_09
    LDA #$08
    STA SYS_ARG_0A
    JSR VEC_SYSCALL
    LDA #$0A
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_ARG_09
    LDA #$08
    STA SYS_ARG_0A
    LDA #$01
    STA SYS_ARG_0F
    JSR VEC_SYSCALL
    LDA #$00
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$08
    STA PPU_EXT_CTRL_SHADOW
    STA PPU_EXT_CTRL
    LDA #$7C
    STA SYS_GROUP
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$80
    STA PROG_ENTRY_HI
    LDA #$80
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
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$0F
    STA SYS_SUBFUNCTION
    LDA #$80
    STA FILE_START_PAGE
    JSR VEC_SYSCALL
    LDA #$10
    STA DMA_SRC_HIGH
    LDA #$00
    STA DMA_SRC_LOW
    LDA #$80
    STA DMA_SRC_MID
    LDA #$12
    STA DMA_DST_LO
    LDA #$70
    STA DMA_DST_HI
    LDA #$00
    STA DMA_LEN_LO
    LDA #$0F
    STA DMA_LEN_HI
    LDA #$A0
    STA DMA_CTRL
    LDX #$01
    LDA #$1B
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$80
    STA DISK_MODE
    LDA #$80
    STA SYS_FUNCTION
    LDA #$04
    STA SYS_SUBFUNCTION
    LDA #$80
    STA DISK_PAGE
    LDA #$00
    STA DISK_PAGE_SECTOR
    LDA #$01
    STA DISK_HEAD
    LDA #$00
    STA DISK_TRACK
    LDA #$10
    STA DISK_SECTOR
    LDA #$00
    STA DISK_COUNT_LO
    LDA #$04
    STA DISK_COUNT_HI
    JSR VEC_SYSCALL
    LDA #$10
    STA SHELL_PRESET_FLAG
    LDA #$00
    STA BAT_START_PAGE
    STA VRAM_BANK
@copy_pages:
    LDA SHELL_PRESET_FLAG
    STA DMA_SRC_HIGH
    LDA #$00
    STA DMA_SRC_LOW
    LDA #$80
    STA DMA_SRC_MID
    LDA #$00
    STA DMA_DST_LO
    LDA #$80
    STA DMA_DST_HI
    LDA #$00
    STA DMA_LEN_LO
    LDA #$80
    STA DMA_LEN_HI
    LDA #$C0
    STA DMA_CTRL
    LDX #$05
    LDA #$1B
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    INC SHELL_PRESET_FLAG
    LDA SHELL_PRESET_FLAG
    CMP #$20
    BEQ @pages_loaded
    INC BAT_START_PAGE
    LDA BAT_START_PAGE
    STA VRAM_BANK
    JMP @copy_pages
@pages_loaded:
    LDA #$80
    STA DISK_MODE
    LDA #$80
    STA SYS_FUNCTION
    LDA #$04
    STA SYS_SUBFUNCTION
    LDA #$80
    STA DISK_PAGE
    LDA #$00
    STA DISK_PAGE_SECTOR
    LDA #$00
    STA DISK_HEAD
    LDA #$1D
    STA DISK_TRACK
    LDA #$0E
    STA DISK_SECTOR
    LDA #$00
    STA DISK_COUNT_LO
    LDA #$04
    STA DISK_COUNT_HI
    JSR VEC_SYSCALL
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$29
    STA SYS_FUNCTION
    LDA #$9F
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    LDA $BFFA
    STA CLJS_SAVED_VECTORS_9F
    LDA $BFFB
    STA CLJS_SAVED_VECTORS_9F+1
    LDA $BFFC
    STA CLJS_SAVED_VECTORS_9F+2
    LDA $BFFD
    STA CLJS_SAVED_VECTORS_9F+3
    LDA $BFFE
    STA CLJS_SAVED_VECTORS_9F+4
    LDA $BFFF
    STA CLJS_SAVED_VECTORS_9F+5
    LDA #$15
    STA $BFFC
    LDA #$70
    STA $BFFD
    LDA #$29
    STA SYS_FUNCTION
    LDA #$BF
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    LDA $BFFA
    STA CLJS_SAVED_VECTORS_BF
    LDA $BFFB
    STA CLJS_SAVED_VECTORS_BF+1
    LDA $BFFC
    STA CLJS_SAVED_VECTORS_BF+2
    LDA $BFFD
    STA CLJS_SAVED_VECTORS_BF+3
    LDA $BFFE
    STA CLJS_SAVED_VECTORS_BF+4
    LDA $BFFF
    STA CLJS_SAVED_VECTORS_BF+5
    LDA #$15
    STA $BFFC
    LDA #$70
    STA $BFFD
    LDA #$29
    STA SYS_FUNCTION
    LDA #$DF
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    LDA $BFFA
    STA CLJS_SAVED_VECTORS_DF
    LDA $BFFB
    STA CLJS_SAVED_VECTORS_DF+1
    LDA $BFFC
    STA CLJS_SAVED_VECTORS_DF+2
    LDA $BFFD
    STA CLJS_SAVED_VECTORS_DF+3
    LDA $BFFE
    STA CLJS_SAVED_VECTORS_DF+4
    LDA $BFFF
    STA CLJS_SAVED_VECTORS_DF+5
    LDA #$15
    STA $BFFC
    LDA #$70
    STA $BFFD
    LDA #$29
    STA SYS_FUNCTION
    LDA #$FF
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    LDA #$15
    STA $BFFC
    LDA #$70
    STA $BFFD
    LDA #$55
    STA EBANK_128K
    STA MODE_FC
; 作用：只有一个空格的字符串
; 引用者：CMD_CLJS_IMPL（取地址）
STR_BLANK_5E:
    .byte $20,$00
; 作用：VER 命令的实现（页组 $5E，序号 2）：解析命令行，出错显示消息 $25；开关位 0 打开时显示帮助消息 $4D；否则显示版本消息 $4C。
; 调用者：CMD_GROUP5E_TABLE（地址表）
CMD_VER_IMPL:
    JSR CALL_CMD_PARSE_PATH_ARG_5E
    LDA DOS_ERROR
    BEQ @args_ok
    LDA #$01
    STA CURSOR_COL
    LDA #$25
    STA LIB_GROUP
    JSR CALL_LIB_PRINT_MESSAGE_5E
    JSR CALL_LIB_NEWLINE_5E
    RTS
@args_ok:
    LDA CMD_SWITCH_FLAGS
    AND #$01
    BEQ @show_version
    LDA #$01
    STA CURSOR_COL
    LDA #$4D
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    JSR CALL_LIB_NEWLINE_5E
    RTS
@show_version:
    LDA #$01
    STA CURSOR_COL
    LDA #$4C
    STA LIB_GROUP
    JSR CALL_LIB_PRINT_MESSAGE_5E
    JSR CALL_LIB_NEWLINE_5E
    RTS
; 作用：HELP 命令的实现（页组 $5E，序号 3）：按 HELP_MESSAGE_IDS 依次显示各条帮助消息；每显示完一屏（第 1、3 条之外的每条）显示提示（消息 $38），查键：Ctrl+C 结束，Ctrl+P（$10）等一个键后继续，其他直接继续。
; 调用者：CMD_GROUP5E_TABLE（地址表）
CMD_HELP_IMPL:
    LDX #$00
    TXA
    STA SHELL_FIRST_CHAR
    PHA
@loop:
    TAX
    LDA HELP_MESSAGE_IDS,X
    BEQ @done
    STA LIB_GROUP
    LDA #$01
    STA CURSOR_COL
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    INC SHELL_FIRST_CHAR
    LDA SHELL_FIRST_CHAR
    CMP #$01
    BEQ @next_index
    CMP #$03
    BEQ @next_index
    JSR CALL_LIB_NEWLINE_5E
    LDA #$38
    STA LIB_GROUP
    LDA #$01
    STA CURSOR_COL
    JSR CALL_LIB_PRINT_MESSAGE_5E
    JSR CALL_LIB_NEWLINE_5E
    LDA #$6B
    STA SYS_FUNCTION
    LDA #$03
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA KEY_ASCII
    CMP #$03
    BEQ @done
    CMP #$10
    BEQ @wait_key
@next_index:
    PLA
    TAX
    INX
    TXA
    PHA
    JMP @loop
@wait_key:
    JSR CALL_GET_KEY_WAIT_5E
    JMP @next_index
@done:
    PLA
    RTS
; 作用：HELP 命令依次显示的消息号表，以 0 结尾
; 引用者：CMD_HELP_IMPL
HELP_MESSAGE_IDS:
    .byte $84,$85,$7C,$7D,$6F,$43,$65,$4A,$77,$73,$71,$75,$6A,$61,$4D,$40
    .byte $41,$4B,$00
; 作用：DATE 命令的实现（页组 $5E，序号 4）：解析命令行；开关位 0 打开时显示帮助消息 $65；命令行没有日期时先用 $7F/$02 取当前日期并显示（消息 $66、$67，月-日-年），再让用户输入新日期（回车结束，最多 10 个字符，满了响一声），输入为空则不改；日期格式为“月-日-年”，月 1-12、日 1-31，年可写两位（80-99 按 19xx，00-79 按 20xx）或四位（1980-2099）；合法就用 $7F/$01 设置，不合法显示消息 $68 或 $69。
; 输出：C=0 成功，C=1 失败。
; 调用者：CMD_GROUP5E_TABLE（地址表）
CMD_DATE_IMPL:
    JSR CALL_CMD_PARSE_PATH_ARG_5E
    LDA DOS_ERROR
    BEQ @args_ok
    JMP @fail
@args_ok:
    LDA #$01
    STA CURSOR_COL
    LDA #$00
    STA CMD_FULL_PATH
    LDA CMD_SWITCH_FLAGS
    AND #$01
    BEQ @check_args
    LDA #$65
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    JMP @success_newline
@invalid_jump:
    JMP @invalid_format
@check_args:
    LDA CMD_ARG1_DRIVE
    ORA CMD_ARG2_DRIVE
    ORA CMD_ARG1_PATH
    ORA CMD_ARG2_PATH
    ORA CMD_ARG2_NAME
    BNE @invalid_jump
    LDX #$00
    LDA CMD_ARG1_NAME,X
    BNE @has_arg_jump
    JMP @read_date
@has_arg_jump:
    JMP @parse_date
@read_date:
    LDA #$7F
    STA SYS_FUNCTION
    LDA #$02
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR_5E
    BCC @date_read
    JMP @fail
@date_read:
    LDA FILE_DATE_LO
    AND #$1F
    STA CMD_DATE_DAY
    LDA FILE_DATE_LO
    LSR A
    LSR A
    LSR A
    LSR A
    LSR A
    CLC
    STA CMD_DATE_MONTH
    LDA FILE_DATE_HI
    AND #$01
    ASL A
    ASL A
    ASL A
    CLC
    ADC CMD_DATE_MONTH
    STA CMD_DATE_MONTH
    LDA FILE_DATE_HI
    AND #$FE
    LSR A
    STA CMD_DATE_YEAR
    LDA #$66
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    LDA CMD_DATE_MONTH
    JSR CMD_PRINT_DEC_2DIGIT_5E
    LDA #$2D
    JSR CMD_OUTBUF_PUT_CHAR_5E
    LDA CMD_DATE_DAY
    JSR CMD_PRINT_DEC_2DIGIT_5E
    LDA #$2D
    JSR CMD_OUTBUF_PUT_CHAR_5E
    LDA CMD_DATE_YEAR
    CLC
    ADC #$50
    STA CMD_DATE_YEAR
    CMP #$64
    BCS @year_2000s
    LDA #$13
    JSR CMD_PRINT_DEC_2DIGIT_5E
@print_year:
    LDA CMD_DATE_YEAR
    JSR CMD_PRINT_DEC_2DIGIT_5E
    JMP @print_prompt
@year_2000s:
    LDA CMD_DATE_YEAR
    SEC
    SBC #$64
    STA CMD_DATE_YEAR
    LDA #$14
    JSR CMD_PRINT_DEC_2DIGIT_5E
    JMP @print_year
@print_prompt:
    LDA #$00
    STA LIB_GROUP
    PHA
    LDA #<CMD_FULL_PATH
    STA STR_PTR_LO
    LDA #>CMD_FULL_PATH
    STA STR_PTR_HI
    PLA
    JSR CALL_LIB_PRINT_STRING_5E
    LDA #$00
    STA CMD_FULL_PATH
    LDA #$67
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    JMP @input_date
@success_newline:
    JSR CMD_NEWLINE_5E
@finish:
    JSR CMD_NEWLINE_5E
    RTS
@fail:
    SEC
    JMP @finish
@input_date:
    LDX #$00
@input_char:
    JSR CMD_INPUT_KEY_5E
    CMP #$0D
    BNE @check_key
    LDA #$00
    STA CMD_ARG1_NAME,X
    JMP @input_done
@check_key:
    CMP #$00
    BEQ @input_char
    CPX #$0A
    BCS @beep
    STA CMD_ARG1_NAME,X
    JSR CMD_PUT_CHAR_5E
    INX
    JMP @input_char
@beep:
    JSR BEEP_SQ2
    JMP @input_char
@input_done:
    LDX #$00
    LDA CMD_ARG1_NAME,X
    BEQ @success_newline
    JMP @parse_date
@parse_date:
    LDX #$00
    LDY #$00
@check_chars:
    LDA CMD_ARG1_NAME,X
    BEQ @check_dashes
    CMP #$2D
    BNE @check_digit
    INY
    INX
    JMP @check_chars
@invalid_jump2:
    JMP @invalid_format
@check_digit:
    CMP #$30
    BCC @invalid_jump2
    CMP #$3A
    BCS @invalid_jump2
    INX
    JMP @check_chars
@check_dashes:
    TYA
    CMP #$02
    BNE @invalid_jump2
    LDA #$00
    STA CMD_DATE_MONTH
    STA CMD_DATE_DAY
    STA CMD_DATE_YEAR
    LDX #$00
@parse_month:
    LDA CMD_ARG1_NAME,X
    CMP #$2D
    BEQ @month_done
    TXA
    PHA
    CLC
    LDA CMD_DATE_MONTH
    TAY
    LDX #$01
@month_multiply:
    TYA
    CLC
    ADC CMD_DATE_MONTH
    STA CMD_DATE_MONTH
    INX
    TXA
    CMP #$0A
    BNE @month_multiply
    PLA
    TAX
    LDA CMD_ARG1_NAME,X
    SEC
    SBC #$30
    CLC
    ADC CMD_DATE_MONTH
    STA CMD_DATE_MONTH
    CMP #$0D
    BCS @invalid_jump3
    INX
    JMP @parse_month
@invalid_jump3:
    JMP @invalid_date
@month_done:
    LDA CMD_DATE_MONTH
    CMP #$00
    BEQ @invalid_jump3
    INX
@parse_day:
    LDA CMD_ARG1_NAME,X
    CMP #$2D
    BEQ @day_done
    TXA
    PHA
    CLC
    LDA CMD_DATE_DAY
    TAY
    LDX #$01
@day_multiply:
    TYA
    CLC
    ADC CMD_DATE_DAY
    STA CMD_DATE_DAY
    INX
    TXA
    CMP #$0A
    BNE @day_multiply
    PLA
    TAX
    LDA CMD_ARG1_NAME,X
    SEC
    SBC #$30
    CLC
    ADC CMD_DATE_DAY
    STA CMD_DATE_DAY
    CMP #$20
    BCS @invalid_jump4
    INX
    JMP @parse_day
@invalid_jump4:
    JMP @invalid_date
@day_done:
    LDA CMD_DATE_DAY
    CMP #$00
    BEQ @invalid_jump4
    INX
    LDY #$00
@copy_year:
    LDA CMD_ARG1_NAME,X
    STA CMD_DATE_TEXT,Y
    CMP #$00
    BEQ @check_year_len
    INY
    INX
    JMP @copy_year
@check_year_len:
    TYA
    CMP #$02
    BNE @year4
    LDX #$00
@parse_year2:
    LDA CMD_DATE_TEXT,X
    CMP #$00
    BEQ @year2_done
    TXA
    PHA
    CLC
    LDA CMD_DATE_YEAR
    TAY
    LDX #$01
@year_multiply:
    TYA
    CLC
    ADC CMD_DATE_YEAR
    STA CMD_DATE_YEAR
    INX
    TXA
    CMP #$0A
    BNE @year_multiply
    PLA
    TAX
    LDA CMD_DATE_TEXT,X
    SEC
    SBC #$30
    CLC
    ADC CMD_DATE_YEAR
    STA CMD_DATE_YEAR
    CMP #$64
    BCS @invalid_jump5
    INX
    JMP @parse_year2
@year2_done:
    LDA CMD_DATE_YEAR
    CMP #$50
    BCC @invalid_jump5
    LDA CMD_DATE_YEAR
    SEC
    SBC #$50
    STA CMD_DATE_YEAR
    JMP @store_date
@invalid_jump5:
    JMP @invalid_date
@year4:
    TYA
    CMP #$04
    BNE @invalid_jump5
    LDY #$00
    LDA CMD_DATE_TEXT,Y
    STA CMD_INPUT_TEXT,Y
    INY
    LDA CMD_DATE_TEXT,Y
    STA CMD_INPUT_TEXT,Y
    INY
    LDA #$00
    STA CMD_INPUT_TEXT,Y
    JSR PARSE_DEC_BYTE
    LDA CMD_TEMP_0
    CMP #$13
    BEQ @year4_tail
    LDA CMD_TEMP_0
    CMP #$14
    BNE @invalid_jump5
    LDA #$64
    STA CMD_DATE_YEAR
@year4_tail:
    TXA
    PHA
    LDX #$00
    LDA CMD_DATE_TEXT,Y
    STA CMD_INPUT_TEXT,X
    INY
    INX
    LDA CMD_DATE_TEXT,Y
    STA CMD_INPUT_TEXT,X
    INX
    LDA #$00
    STA CMD_INPUT_TEXT,X
    PLA
    TAX
    JSR PARSE_DEC_BYTE
    CLC
    LDA CMD_TEMP_0
    ADC CMD_DATE_YEAR
    SEC
    SBC #$50
    STA CMD_DATE_YEAR
    BCC @invalid_date
    JMP @store_date
@invalid_date:
    LDA #$68
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    JMP @fail
@store_date:
    LDA CMD_DATE_MONTH
    AND #$07
    ASL A
    ASL A
    ASL A
    ASL A
    ASL A
    STA FILE_DATE_LO
    LDA CMD_DATE_DAY
    AND #$1F
    CLC
    ADC FILE_DATE_LO
    STA FILE_DATE_LO
    LDA CMD_DATE_MONTH
    AND #$08
    LSR A
    LSR A
    LSR A
    STA FILE_DATE_HI
    LDA CMD_DATE_YEAR
    AND #$7F
    ASL A
    CLC
    ADC FILE_DATE_HI
    STA FILE_DATE_HI
    LDA #$7F
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR_5E
    BCC @date_stored
    JMP @fail
@date_stored:
    JMP @success_newline
@invalid_format:
    LDA #$69
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    JMP @fail
; 作用：TIME 命令的实现（页组 $5E，序号 5）：解析命令行；开关位 0 打开时显示帮助消息 $6A；命令行没有时间时先用 $7F/$04 取当前时间并显示（消息 $6B、$6C，时:分:秒），再让用户输入新时间（回车结束，最多 10 个字符，满了响一声），输入为空则不改；时间格式为“时:分:秒”，时小于 24，分与秒小于 60；合法就用 $7F/$03 设置，不合法显示消息 $6D 或 $6E。
; 输出：C=0 成功，C=1 失败。
; 调用者：CMD_GROUP5E_TABLE（地址表）
CMD_TIME_IMPL:
    JSR CALL_CMD_PARSE_PATH_ARG_5E
    LDA DOS_ERROR
    BEQ @args_ok
    JMP @fail
@args_ok:
    LDA #$00
    STA CMD_FULL_PATH
    LDA #$01
    STA CURSOR_COL
    LDA CMD_SWITCH_FLAGS
    AND #$01
    BEQ @check_args
    LDA #$6A
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    JMP @success
@invalid_jump:
    JMP @invalid_format
@check_args:
    LDA CMD_ARG1_DRIVE
    ORA CMD_ARG2_DRIVE
    ORA CMD_ARG1_PATH
    ORA CMD_ARG2_PATH
    ORA CMD_ARG2_NAME
    BNE @invalid_jump
    LDX #$00
    LDA CMD_ARG1_NAME,X
    BNE @has_arg_jump
    JMP @read_time
@has_arg_jump:
    JMP @parse_time
@read_time:
    LDA #$7F
    STA SYS_FUNCTION
    LDA #$04
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR_5E
    BCC @time_read
    JMP @fail
@time_read:
    LDA FILE_TIME_LO
    AND #$1F
    STA CMD_TIME_SECOND
    LDA CMD_TIME_SECOND
    ASL A
    STA CMD_TIME_SECOND
    INC CMD_TIME_SECOND
    LDA FILE_TIME_LO
    LSR A
    LSR A
    LSR A
    LSR A
    LSR A
    CLC
    STA CMD_TIME_MINUTE
    LDA FILE_TIME_HI
    AND #$07
    ASL A
    ASL A
    ASL A
    CLC
    ADC CMD_TIME_MINUTE
    STA CMD_TIME_MINUTE
    LDA FILE_TIME_HI
    AND #$F0
    LSR A
    LSR A
    LSR A
    STA CMD_TIME_HOUR
    LDA FILE_TIME_HI
    AND #$08
    LSR A
    LSR A
    LSR A
    CLC
    ADC CMD_TIME_HOUR
    STA CMD_TIME_HOUR
    LDA #$6B
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    LDA CMD_TIME_HOUR
    JSR CMD_PRINT_DEC_2DIGIT_5E
    LDA #$3A
    JSR CMD_OUTBUF_PUT_CHAR_5E
    LDA CMD_TIME_MINUTE
    JSR CMD_PRINT_DEC_2DIGIT_5E
    LDA #$3A
    JSR CMD_OUTBUF_PUT_CHAR_5E
    LDA CMD_TIME_SECOND
    JSR CMD_PRINT_DEC_2DIGIT_5E
    LDA #$00
    STA LIB_GROUP
    PHA
    LDA #<CMD_FULL_PATH
    STA STR_PTR_LO
    LDA #>CMD_FULL_PATH
    STA STR_PTR_HI
    PLA
    JSR CALL_LIB_PRINT_STRING_5E
    LDA #$00
    STA CMD_FULL_PATH
    LDA #$6C
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    JMP @input_time
@success:
    CLC
@finish:
    JSR CMD_NEWLINE_5E
    RTS
@fail:
    SEC
    JMP @finish
@input_time:
    LDX #$00
@input_char:
    JSR CMD_INPUT_KEY_5E
    CMP #$0D
    BNE @check_key
    LDA #$00
    STA CMD_ARG1_NAME,X
    JMP @input_done
@check_key:
    CMP #$00
    BEQ @input_char
    CPX #$0A
    BCS @beep
    STA CMD_ARG1_NAME,X
    JSR CMD_PUT_CHAR_5E
    INX
    JMP @input_char
@beep:
    JSR BEEP_SQ2
    JMP @input_char
@input_done:
    LDX #$00
    LDA CMD_ARG1_NAME,X
    BEQ @success
    JMP @parse_time
@parse_time:
    LDX #$00
    LDY #$00
@check_chars:
    LDA CMD_ARG1_NAME,X
    BEQ @check_colons
    CMP #$3A
    BNE @check_digit
    INY
    INX
    JMP @check_chars
@invalid_jump2:
    JMP @invalid_format
@check_digit:
    CMP #$30
    BCC @invalid_jump2
    CMP #$3A
    BCS @invalid_jump2
    INX
    JMP @check_chars
@check_colons:
    TYA
    CMP #$02
    BNE @invalid_jump2
    LDA #$00
    STA CMD_TIME_HOUR
    STA CMD_TIME_MINUTE
    STA CMD_TIME_SECOND
    LDX #$00
@parse_hour:
    LDA CMD_ARG1_NAME,X
    CMP #$3A
    BEQ @hour_done
    TXA
    PHA
    CLC
    LDA CMD_TIME_HOUR
    TAY
    LDX #$01
@hour_multiply:
    TYA
    CLC
    ADC CMD_TIME_HOUR
    STA CMD_TIME_HOUR
    INX
    TXA
    CMP #$0A
    BNE @hour_multiply
    PLA
    TAX
    LDA CMD_ARG1_NAME,X
    SEC
    SBC #$30
    CLC
    ADC CMD_TIME_HOUR
    STA CMD_TIME_HOUR
    CMP #$18
    BCS @hour_invalid_jump
    INX
    JMP @parse_hour
@hour_invalid_jump:
    JMP @invalid_time
@hour_done:
    INX
@parse_minute:
    LDA CMD_ARG1_NAME,X
    CMP #$3A
    BEQ @minute_done
    TXA
    PHA
    CLC
    LDA CMD_TIME_MINUTE
    TAY
    LDX #$01
@minute_multiply:
    TYA
    CLC
    ADC CMD_TIME_MINUTE
    STA CMD_TIME_MINUTE
    INX
    TXA
    CMP #$0A
    BNE @minute_multiply
    PLA
    TAX
    LDA CMD_ARG1_NAME,X
    SEC
    SBC #$30
    CLC
    ADC CMD_TIME_MINUTE
    STA CMD_TIME_MINUTE
    CMP #$3C
    BCS @minute_invalid_jump
    INX
    JMP @parse_minute
@minute_invalid_jump:
    JMP @invalid_time
@minute_done:
    INX
@parse_second:
    LDA CMD_ARG1_NAME,X
    CMP #$00
    BEQ @store_time
    TXA
    PHA
    CLC
    LDA CMD_TIME_SECOND
    TAY
    LDX #$01
@second_multiply:
    TYA
    CLC
    ADC CMD_TIME_SECOND
    STA CMD_TIME_SECOND
    INX
    TXA
    CMP #$0A
    BNE @second_multiply
    PLA
    TAX
    LDA CMD_ARG1_NAME,X
    SEC
    SBC #$30
    CLC
    ADC CMD_TIME_SECOND
    STA CMD_TIME_SECOND
    CMP #$3C
    BCS @second_invalid_jump
    INX
    JMP @parse_second
@second_invalid_jump:
    JMP @invalid_time
@invalid_time:
    LDA #$6D
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    JMP @fail
@store_time:
    LDA CMD_TIME_MINUTE
    ASL A
    ASL A
    ASL A
    ASL A
    ASL A
    STA FILE_TIME_LO
    LDA CMD_TIME_SECOND
    LSR A
    STA CMD_TIME_SECOND
    AND #$1F
    CLC
    ADC FILE_TIME_LO
    STA FILE_TIME_LO
    LDA CMD_TIME_MINUTE
    AND #$38
    LSR A
    LSR A
    LSR A
    STA FILE_TIME_HI
    LDA CMD_TIME_HOUR
    AND #$1F
    ASL A
    ASL A
    ASL A
    CLC
    ADC FILE_TIME_HI
    STA FILE_TIME_HI
    LDA #$7F
    STA SYS_FUNCTION
    LDA #$03
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR_5E
    BCC @time_stored
    JMP @fail
@time_stored:
    JMP @success
@invalid_format:
    LDA #$6E
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE_5E
    JMP @fail
; 作用：字符串“MENU.BIN”（CLJS 命令要打开的文件，以 0 结尾），其后是 GB2312 的“正在装入大型游戏软件”（以 0 结尾）与页组末尾的零填充。
; 引用者：CMD_CLJS_IMPL
STR_MENU_BIN:
    .byte $4D,$45,$4E,$55,$2E,$42,$49,$4E,$00,$D5,$FD,$D4,$DA,$D7,$B0,$C8
    .byte $EB,$B4,$F3,$D0,$CD,$D3,$CE,$CF,$B7,$C8,$ED,$BC,$FE,$00,$20,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00
