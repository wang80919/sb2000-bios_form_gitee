; ------------------------------------------------------------------------
; 名称：command-group-60-dir.asm
; 说明：页组 60 的 DOS 命令：命令表、字符输出辅助与 DIR 的目录读取、数字与文件名输出
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：占ROM 第 60-62 页，汇编地址 $8000 起，后面的文件接在它后面
; ------------------------------------------------------------------------
.org $8000
    LDA CMD_SELECT
    ASL A
    TAX
    LDA CMD_GROUP60_TABLE,X
    STA STR_PTR_LO
    INX
    LDA CMD_GROUP60_TABLE,X
    STA STR_PTR_HI
    JMP (STR_PTR_LO)
; 作用：页组 $60 的命令实现入口表：序号由 CMD_SELECT 给出，0 TYPE、1 REN、2 DEL、3 COPY、4 CLS、5 EXIT
; 引用者：command-group-60-dir.asm 开头的入口代码
CMD_GROUP60_TABLE:
    .word CMD_TYPE_IMPL,CMD_REN_IMPL,CMD_DEL_IMPL,CMD_COPY_IMPL,CMD_CLS_IMPL,CMD_EXIT_IMPL
    STA LIB_GROUP
    LDA #$25
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_GROUP
    LDA #<CALL_LIB_CURSOR_UP
    STA PROG_ENTRY_LO
    LDA #>CALL_LIB_CURSOR_UP
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    RTS
    LDA #$25
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_GROUP
    LDA #<LIB_CURSOR_LEFT
    STA PROG_ENTRY_LO
    LDA #>LIB_CURSOR_LEFT
    STA PROG_ENTRY_HI
; 作用：经功能 $25 调用页组 0 的 LIB_CURSOR_UP（光标上移）
; 调用者：CMD_GROUP60_TABLE（取地址）
CALL_LIB_CURSOR_UP:
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
; 调用者：CMD_PUT_CHAR
CALL_LIB_CURSOR_RIGHT:
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
; 作用：经功能 $25 调用页组 0 的 LIB_NEWLINE（换行）；调用 16 次
; 调用者：CMD_NEWLINE、CMD_TYPE_BODY、TYPE_FLUSH_LINE、CMD_COPY_IMPL、COPY_PROMPT_SOURCE_DISK、COPY_PROMPT_DEST_DISK、COPY_SHOW_ERROR、CMD_CLS_IMPL
CALL_LIB_NEWLINE:
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
; 作用：调用 $6B/$04 等一个键，结果在 KEY_ASCII/KEY_SCAN
; 输出：KEY_ASCII、KEY_SCAN。
; 调用者：GET_KEY_ASCII、CMD_TYPE_BODY、TYPE_FLUSH_LINE、CMD_COPY_IMPL、COPY_PROMPT_SOURCE_DISK、COPY_PROMPT_DEST_DISK
CALL_GET_KEY_WAIT:
    LDA #$6B
    STA SYS_FUNCTION
    LDA #$04
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    RTS
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
; 作用：经功能 $25 调用页组 0 的 LIB_PRINT_STRING（显示 STR_PTR 指向的字符串）；调用 9 次
; 调用者：CMD_PUT_CHAR、CMD_FS_LOAD_DIR_SECTOR、TYPE_FLUSH_LINE、CMD_DEL_IMPL、CMD_COPY_IMPL
CALL_LIB_PRINT_STRING:
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
; 作用：经功能 $25 调用页组 0 的 SHELL_PRINT_MESSAGE（LIB_GROUP 为消息序号）；调用 43 次
; 调用者：CMD_CHECK_ERROR、CMD_TYPE_BODY、TYPE_FLUSH_LINE、CMD_REN_IMPL、CMD_DEL_IMPL、CMD_COPY_IMPL、COPY_PROMPT_SOURCE_DISK、COPY_PROMPT_DEST_DISK等 9 处
CALL_SHELL_PRINT_MESSAGE:
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
; 作用：经功能 $25 调用页组 0 的 LIB_MAKE_FCB_NAME（把文件名转成 8+3）
; 调用者：CMD_DIR_PREPARE_SPEC、CMD_DEL_IMPL、CMD_COPY_IMPL
CALL_LIB_MAKE_FCB_NAME:
    LDA #$25
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_GROUP
    LDA #<LIB_MAKE_FCB_NAME
    STA PROG_ENTRY_LO
    LDA #>LIB_MAKE_FCB_NAME
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    RTS
; 作用：经功能 $25 调用页组 0 的 CMD_PARSE_PATH_ARG（解析命令行里的路径与开关）
; 调用者：CMD_TYPE_BODY、CMD_REN_IMPL、CMD_DEL_IMPL、CMD_COPY_IMPL、CMD_CLS_IMPL
CALL_CMD_PARSE_PATH_ARG:
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
; 作用：显示字符 A：写入 LIB_TEMP_STR，LIB_GROUP=0，显示后光标右移一格
; 输入：A=字符（返回时保持不变）。
; 调用者：CMD_PRINT_HEX_NIBBLE、CMD_PUT_HEX_NIBBLE、CMD_TYPE_BODY、CMD_DEL_IMPL、CMD_COPY_IMPL、COPY_PROMPT_SOURCE_DISK、COPY_PROMPT_DEST_DISK
CMD_PUT_CHAR:
    PHA
    STA LIB_TEMP_STR
    LDA #$00
    STA LIB_TEMP_STR+1
    STA LIB_GROUP
    LDA #<LIB_TEMP_STR
    STA STR_PTR_LO
    LDA #>LIB_TEMP_STR
    STA STR_PTR_HI
    JSR CALL_LIB_PRINT_STRING
    JSR CALL_LIB_CURSOR_RIGHT
    PLA
    RTS
; 作用：不能出现在文件名里的字符表（完整表）：这里是通配符“*”“?”，后面紧接 CHAR_SET_ALLOW_WILDCARD 的字符，合起来含通配符与反斜杠；LIB_GROUP 不是 0 与 1 时用。
; 引用者：CHAR_IN_SET（取地址）
CHAR_SET_ALL:
    .byte $2A,$3F
; 作用：不能出现在文件名里的字符表（允许通配符，含反斜杠）；LIB_GROUP 为 1 时用，也是 CHAR_SET_ALL 的后半。
; 引用者：CHAR_IN_SET（取地址）
CHAR_SET_ALLOW_WILDCARD:
    .byte $5C,$20,$2C,$3C,$3E,$3A,$3B,$5B,$5D,$7C,$2B,$3D,$2F,$22,$00
; 作用：不能出现在文件名里的字符表（含通配符，允许反斜杠）；LIB_GROUP 为 0 时用
; 引用者：CHAR_IN_SET（取地址）
CHAR_SET_ALLOW_BACKSLASH:
    .byte $2A,$3F,$20,$2C,$3C,$3E,$3A,$3B,$5B,$5D,$7C,$2B,$3D,$2F,$22,$00
; 作用：判断 A 是否在字符集里：LIB_GROUP 为 0、1 或其他时分别用 CHAR_SET_ALLOW_BACKSLASH、CHAR_SET_ALLOW_WILDCARD、CHAR_SET_ALL 处的字符表，在表里 C=1
; 输入：A=要判断的字符，LIB_GROUP。
; 输出：C=1 在字符表里，C=0 不在。
; 调用者：STR_ALL_IN_SET
CHAR_IN_SET:
    STA DOS_TEMP_3
    PHA
    TYA
    PHA
    LDA LIB_GROUP
    BEQ @backslash_set
    CMP #$01
    BEQ @wildcard_set
    LDA #<CHAR_SET_ALL
    STA STR_PTR_LO
    LDA #>CHAR_SET_ALL
    STA STR_PTR_HI
    JMP @search
@wildcard_set:
    LDA #<CHAR_SET_ALLOW_WILDCARD
    STA STR_PTR_LO
    LDA #>CHAR_SET_ALLOW_WILDCARD
    STA STR_PTR_HI
    JMP @search
@backslash_set:
    LDA #<CHAR_SET_ALLOW_BACKSLASH
    STA STR_PTR_LO
    LDA #>CHAR_SET_ALLOW_BACKSLASH
    STA STR_PTR_HI
@search:
    LDY #$00
@loop:
    LDA (STR_PTR_LO),Y
    BEQ @not_found
    CMP DOS_TEMP_3
    BEQ @found
    INY
    JMP @loop
@not_found:
    CLC
    JMP @done
@found:
    SEC
@done:
    PLA
    TAY
    PLA
    RTS
; 作用：逐个检查 LIB_TEMP_STR 里的字符是否在字符表里（CHAR_IN_SET），遇到第一个在表里的字符就停，到字符串结尾仍没有则结束。
; 输入：LIB_TEMP_STR，LIB_GROUP。
; 输出：C=1 有字符在表里，C=0 没有（A、X、Y 保持不变）。
; 调用者：CMD_REN_IMPL、CMD_DEL_IMPL、CMD_COPY_IMPL
STR_ALL_IN_SET:
    PHA
    TXA
    PHA
    TYA
    PHA
    CLC
    LDX #$00
@loop:
    LDA LIB_TEMP_STR,X
    BEQ @done
    INX
    JSR CHAR_IN_SET
    BCC @loop
@done:
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
; 作用：等一个键并返回 KEY_ASCII 在 A
; 输出：A=KEY_ASCII。
; 调用者：CMD_DEL_IMPL、CMD_COPY_IMPL
GET_KEY_ASCII:
    JSR CALL_GET_KEY_WAIT
    LDA KEY_ASCII
    RTS
; 作用：光标列置 1 后换行（CALL_LIB_NEWLINE）；调用 33 次
; 调用者：CMD_CHECK_ERROR、CMD_REN_IMPL、CMD_DEL_IMPL、CMD_COPY_IMPL
CMD_NEWLINE:
    LDA #$01
    STA CURSOR_COL
    JSR CALL_LIB_NEWLINE
    RTS
; 作用：同 DIR_ENTRY_CHECK：检查 DIR_ENTRY_PTR 指向的目录项首字节：0 表示后面没有项，$E5 表示已删除，其余是正常项。
; 输入：DIR_ENTRY_PTR_LO/HI。
; 输出：正常项 A=1、C=0；已删除 A=1、C=1；结束 A=0、C=1。
; 调用者：CMD_DIR_PREPARE_SPEC、CMD_DEL_IMPL、CMD_COPY_IMPL
CMD_DIR_ENTRY_CHECK:
    LDY #$00
    LDA (DIR_ENTRY_PTR_LO),Y
    BEQ @end
    CMP #$E5
    BEQ @deleted
    LDA #$01
    CLC
    RTS
@end:
    LDA #$00
    SEC
    RTS
@deleted:
    LDA #$01
    SEC
    RTS
; 作用：同 DIR_ENTRY_ATTR_CHECK：看目录项属性（偏移 $0B）的卷标位（$08）、隐藏位（$02）、系统位（$04）。
; 输入：DIR_ENTRY_PTR_LO/HI。
; 输出：卷标 A=0、C=1；隐藏或系统 A=1、C=1；其余 C=0。
; 调用者：CMD_DEL_IMPL、CMD_COPY_IMPL
CMD_DIR_ENTRY_ATTR_CHECK:
    LDY #$0B
    LDA (DIR_ENTRY_PTR_LO),Y
    AND #$08
    BNE @volume
    LDA (DIR_ENTRY_PTR_LO),Y
    AND #$02
    BNE @hidden
    LDA (DIR_ENTRY_PTR_LO),Y
    AND #$04
    BNE @hidden
    CLC
    RTS
@volume:
    LDA #$00
    SEC
    RTS
@hidden:
    LDA #$01
    SEC
    RTS
; 作用：把 A 加到目录项指针 DIR_ENTRY_PTR_LO/DIR_ENTRY_PTR_HI
; 输入：A=要加的字节数。
; 调用者：CMD_DIR_PREPARE_SPEC、CMD_DEL_IMPL、CMD_COPY_IMPL
CMD_DIR_ADVANCE_PTR:
    CLC
    ADC DIR_ENTRY_PTR_LO
    STA DIR_ENTRY_PTR_LO
    LDA DIR_ENTRY_PTR_HI
    ADC #$00
    STA DIR_ENTRY_PTR_HI
    RTS
; 作用：同 FS_LOAD_DIR_SECTOR：读当前目录的第一个扇区：当前目录是根目录（PATH_BUFFER 第 2 个字符为 0）时直接读根目录的第一个扇区（LBA 取 FS_FAT_AREA_SECTORS，经 $7B/$01）；否则以方式 4 打开当前目录（$7B/$09），关闭（$7B/$0A），取句柄里的簇号换算成扇区号（$7B/$03）再读入（$7B/$01）；成功后 DIR_ENTRY_PTR 指向 DISK_BUFFER 开头。
; 输出：C=0 成功，C=1 出错（已显示出错信息）。
; 调用者：CMD_DIR_PREPARE_SPEC、CMD_DEL_IMPL、CMD_COPY_IMPL
CMD_FS_LOAD_DIR_SECTOR:
    LDX #$01
    LDA PATH_BUFFER,X
    CMP #$00
    BNE @subdirectory
    LDA FS_FAT_AREA_SECTORS
    STA FS_LBA_LO
    LDA #$00
    STA FS_LBA_HI
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @root_done
    JMP @return_set
@root_done:
    JMP @set_pointer
@subdirectory:
    LDA #$04
    STA FILE_MODE
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$09
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @after_open
    JMP @return_set
@after_open:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0A
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @after_close
    JMP @return_set
@after_close:
    LDX FILE_HANDLE_OFFSET
    LDA FH_CLUSTER_LO,X
    STA FS_CLUSTER_LO
    LDA FH_CLUSTER_HI,X
    STA FS_CLUSTER_HI
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$03
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @after_lba
    JMP @return_set
@after_lba:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @set_pointer
    JMP @return_set
@set_pointer:
    PHA
    LDA #<DISK_BUFFER
    STA DIR_ENTRY_PTR_LO
    LDA #>DISK_BUFFER
    STA DIR_ENTRY_PTR_HI
    PLA
    CLC
    RTS
@return_set:
    SEC
    RTS
    LDY #$1C
    LDA (DIR_ENTRY_PTR_LO),Y
    STA CMD_NUM
    INY
    LDA (DIR_ENTRY_PTR_LO),Y
    STA CMD_NUM+1
    INY
    LDA (DIR_ENTRY_PTR_LO),Y
    STA CMD_NUM+2
    LDY #$00
    JSR CMD_SUB_POW10
    BCC CMD_DIR_PRINT_SIZE_COUNT_FILE
    LDA #$00
    STA LIB_GROUP
    PHA
    LDA #<CMD_STR_SIZE_TOO_BIG
    STA STR_PTR_LO
    LDA #>CMD_STR_SIZE_TOO_BIG
    STA STR_PTR_HI
    PLA
    JSR CALL_LIB_PRINT_STRING
    RTS
; 作用：文件大小太大时显示的字符串“ >1.44M ”（以 0 结尾），其后的字节是显示它的指令（显示完返回）。
; 引用者：CMD_FS_LOAD_DIR_SECTOR（取地址）
CMD_STR_SIZE_TOO_BIG:
    .byte $20,$3E,$31,$2E,$34,$34,$4D,$20,$20,$00,$A0,$00,$20,$BF,$83,$90
    .byte $08,$B0,$DA
; 作用：DIR 显示文件大小（文件大小在范围内时）：文件计数 CMD_MATCH_COUNT 加 1，大小累加到总计（CMD_TOTAL_ADD），再把 CMD_NUM 按位显示成宽 11 列的十进制数写进输出缓冲（CMD_OUTBUF_PUT_CHAR）：百万位与千位后各跟一个“,”，高位为 0 的位置补空格。
; 输入：CMD_NUM（3 字节文件大小）。
; 调用者：CMD_FS_LOAD_DIR_SECTOR
CMD_DIR_PRINT_SIZE_COUNT_FILE:
    INC CMD_MATCH_COUNT
    JSR CMD_TOTAL_ADD
    TXA
    PHA
    LDY #$03
    JSR CMD_SUB_POW10
    BCS @millions
    LDA #$20
    JSR CMD_OUTBUF_PUT_CHAR
    JSR CMD_OUTBUF_PUT_CHAR
    LDY #$06
    JSR CMD_SUB_POW10
    BCS @hundred_thousands
    LDA #$20
    JSR CMD_OUTBUF_PUT_CHAR
    LDY #$09
    JSR CMD_SUB_POW10
    BCS @ten_thousands
    LDA #$20
    JSR CMD_OUTBUF_PUT_CHAR
    LDY #$0C
    JSR CMD_SUB_POW10
    BCS @thousands
    LDA #$20
    JSR CMD_OUTBUF_PUT_CHAR
    JSR CMD_OUTBUF_PUT_CHAR
    LDY #$0F
    JSR CMD_SUB_POW10
    BCS @hundreds
    LDA #$20
    JSR CMD_OUTBUF_PUT_CHAR
    LDY #$12
    JSR CMD_SUB_POW10
    BCS @tens
    LDA #$20
    JSR CMD_OUTBUF_PUT_CHAR
    JMP @ones
@millions:
    LDX #$00
@count_millions:
    LDY #$03
    JSR CMD_SUB_POW10
    BCC @print_millions
    JSR CMD_TMP_TO_CUR
    INX
    JMP @count_millions
@print_millions:
    JSR CMD_PRINT_DIGIT
    LDA #$2C
    JSR CMD_OUTBUF_PUT_CHAR
@hundred_thousands:
    LDX #$00
@count_100k:
    LDY #$06
    JSR CMD_SUB_POW10
    BCC @print_100k
    JSR CMD_TMP_TO_CUR
    INX
    JMP @count_100k
@print_100k:
    JSR CMD_PRINT_DIGIT
@ten_thousands:
    LDX #$00
@count_10k:
    LDY #$09
    JSR CMD_SUB_POW10
    BCC @print_10k
    JSR CMD_TMP_TO_CUR
    INX
    JMP @count_10k
@print_10k:
    JSR CMD_PRINT_DIGIT
@thousands:
    LDX #$00
@count_1k:
    LDY #$0C
    JSR CMD_SUB_POW10
    BCC @print_1k
    JSR CMD_TMP_TO_CUR
    INX
    JMP @count_1k
@print_1k:
    JSR CMD_PRINT_DIGIT
    LDA #$2C
    JSR CMD_OUTBUF_PUT_CHAR
@hundreds:
    LDX #$00
@count_100:
    LDY #$0F
    JSR CMD_SUB_POW10
    BCC @print_100
    JSR CMD_TMP_TO_CUR
    INX
    JMP @count_100
@print_100:
    JSR CMD_PRINT_DIGIT
@tens:
    LDX #$00
@count_10:
    LDY #$12
    JSR CMD_SUB_POW10
    BCC @print_10
    JSR CMD_TMP_TO_CUR
    INX
    JMP @count_10
@print_10:
    JSR CMD_PRINT_DIGIT
@ones:
    LDX CMD_NUM
    JSR CMD_PRINT_DIGIT
    PLA
    TAX
    RTS
; 作用：把 X 加 $30 作为字符显示进输出缓冲
; 输入：X=数字 0-9。
; 调用者：CMD_DIR_PRINT_SIZE_COUNT_FILE
CMD_PRINT_DIGIT:
    TXA
    CLC
    ADC #$30
    JSR CMD_OUTBUF_PUT_CHAR
    RTS
; 作用：CMD_NUM_TEMP（3 字节）等于 CMD_NUM 减去 10 的幂表（CMD_POW10_TABLE）第 Y 项，不改 CMD_NUM。
; 输入：CMD_NUM，Y=表项偏移（每项 3 字节）。
; 输出：CMD_NUM_TEMP，C=1 表示 CMD_NUM 不小于该项。
; 调用者：CMD_FS_LOAD_DIR_SECTOR、CMD_DIR_PRINT_SIZE_COUNT_FILE
CMD_SUB_POW10:
    SEC
    LDA CMD_NUM
    SBC CMD_POW10_TABLE+2,Y
    STA CMD_NUM_TEMP
    LDA CMD_NUM+1
    SBC CMD_POW10_TABLE+1,Y
    STA CMD_NUM_TEMP+1
    LDA CMD_NUM+2
    SBC CMD_POW10_TABLE,Y
    STA CMD_NUM_TEMP+2
    RTS
    LDY #$18
    LDA (DIR_ENTRY_PTR_LO),Y
    STA CMD_NUM
    INY
    LDA (DIR_ENTRY_PTR_LO),Y
    STA CMD_NUM+1
    ORA CMD_NUM
    BNE @date_set
    RTS
@date_set:
    LDA CMD_NUM
    LSR A
    LSR A
    LSR A
    LSR A
    LSR A
    STA DOS_TEMP_3
    LDA CMD_NUM+1
    AND #$01
    ASL A
    ASL A
    ASL A
    ORA DOS_TEMP_3
    JSR CMD_PRINT_DEC_2DIGIT_C1
    LDA #$2D
    JSR CMD_OUTBUF_PUT_CHAR
    LDA CMD_NUM
    AND #$1F
    JSR CMD_PRINT_DEC_2DIGIT_C1
    LDA #$2D
    JSR CMD_OUTBUF_PUT_CHAR
    LDA CMD_NUM+1
    LSR A
    CLC
    ADC #$50
    JSR CMD_PRINT_DEC_2DIGIT_C1
    RTS
; 作用：同 FS_NEXT_DIR_SECTOR：读目录的下一个扇区：先前进到下一扇区（$7B/$00），目录区已结束就返回，否则读入（$7B/$01）并让 DIR_ENTRY_PTR 指向 DISK_BUFFER 开头。
; 输出：C=0、A=1 读到了下一扇区，C=0、A=0 没有更多扇区，C=1 出错（已显示出错信息）。
; 调用者：CMD_DIR_PREPARE_SPEC、CMD_DEL_IMPL、CMD_COPY_IMPL
CMD_FS_NEXT_DIR_SECTOR:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @check_end
    JMP @return_set
@check_end:
    LDA FS_AREA_END_FLAG
    BNE @no_more
    LDA FS_NEXT_LBA_LO
    STA FS_LBA_LO
    LDA FS_NEXT_LBA_HI
    STA FS_LBA_HI
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @sector_read
    JMP @return_set
@no_more:
    CLC
    LDA #$00
    RTS
@sector_read:
    PHA
    LDA #<DISK_BUFFER
    STA DIR_ENTRY_PTR_LO
    LDA #>DISK_BUFFER
    STA DIR_ENTRY_PTR_HI
    PLA
    CLC
    LDA #$01
    RTS
@return_set:
    SEC
    RTS
    JSR CMD_PRINT_HEX8
    TYA
    JSR CMD_PRINT_HEX8
    RTS
; 作用：把 A 显示成两位十六进制
; 调用者：CMD_FS_NEXT_DIR_SECTOR
CMD_PRINT_HEX8:
    PHA
    LSR A
    LSR A
    LSR A
    LSR A
    JSR CMD_PRINT_HEX_NIBBLE
    PLA
    AND #$0F
; 作用：A 低 4 位转十六进制字符并显示
; 调用者：CMD_PRINT_HEX8
CMD_PRINT_HEX_NIBBLE:
    ORA #$B0
    CMP #$BA
    BCC @letter
    ADC #$06
@letter:
    AND #$7F
    JSR CMD_OUTBUF_PUT_CHAR
    RTS
    LDA #$20
    JSR CMD_PUT_CHAR
    LDA #$20
    JSR CMD_PUT_CHAR
    LDA #$20
    JSR CMD_PUT_CHAR
    LDA #$20
    JSR CMD_PUT_CHAR
    LDA #$20
    JSR CMD_PUT_CHAR
    RTS
    LDA CMD_TOTAL
    STA CMD_NUM
    LDA CMD_TOTAL+1
    STA CMD_NUM+1
    LDA CMD_TOTAL+2
    STA CMD_NUM+2
    RTS
; 作用：把 CMD_NUM 加进累计值 CMD_TOTAL（均为 3 字节）
; 调用者：CMD_DIR_PRINT_SIZE_COUNT_FILE
CMD_TOTAL_ADD:
    CLC
    LDA CMD_NUM
    ADC CMD_TOTAL
    STA CMD_TOTAL
    LDA CMD_NUM+1
    ADC CMD_TOTAL+1
    STA CMD_TOTAL+1
    LDA CMD_NUM+2
    ADC CMD_TOTAL+2
    STA CMD_TOTAL+2
    RTS
; 作用：把 CMD_NUM_TEMP 复制到 CMD_NUM
; 调用者：CMD_DIR_PRINT_SIZE_COUNT_FILE
CMD_TMP_TO_CUR:
    LDA CMD_NUM_TEMP
    STA CMD_NUM
    LDA CMD_NUM_TEMP+1
    STA CMD_NUM+1
    LDA CMD_NUM_TEMP+2
    STA CMD_NUM+2
    RTS
; 作用：同 CMD_PRINT_DEC_2DIGIT，但先置 C=1（前导 0 显示成 0）
; 调用者：CMD_SUB_POW10
CMD_PRINT_DEC_2DIGIT_C1:
    SEC
    BCS CMD_PRINT_DEC_BODY
; 作用：把 A（0-99）显示成两位十进制，C=1 时前导 0 显示为 0，否则显示空格
; 调用者：CMD_DEL_IMPL、CMD_COPY_IMPL、CMD_PRINT_DEC_2DIGIT_C1（顺序执行到这里）
CMD_PRINT_DEC_2DIGIT:
    CLC
; 作用：显示两位十进制数的主体：进位决定前导 0 显示成 0 还是空格
; 输入：A=数值（超过 99 时先对 100 取余），C=是否把前导 0 显示成 0。
; 调用者：CMD_PRINT_DEC_2DIGIT_C1、CMD_PRINT_DEC_2DIGIT（顺序执行到这里）
CMD_PRINT_DEC_BODY:
    PHP
@sub_hundreds:
    CMP #$64
    BCC @count_tens
    SBC #$64
    JMP @sub_hundreds
@count_tens:
    PHA
    LDA #$00
    STA CMD_TEMP_1
    PLA
@sub_tens:
    CMP #$0A
    BCC @print_tens
    INC CMD_TEMP_1
    SBC #$0A
    JMP @sub_tens
@print_tens:
    PLP
    PHA
    BCS @tens_digit
    LDA CMD_TEMP_1
    BNE @tens_digit
    LDA #$20
    JMP @put_tens
@tens_digit:
    LDA CMD_TEMP_1
    CLC
    ADC #$30
@put_tens:
    JSR CMD_OUTBUF_PUT_CHAR
    PLA
    CLC
    ADC #$30
    JSR CMD_OUTBUF_PUT_CHAR
    RTS
    PHA
    TYA
    PHA
    LDA #$00
    STA CMD_TEMP_0
    TXA
    PHA
    LDX #$00
@parse_digit:
    LDA CMD_INPUT_TEXT,X
    CMP #$00
    BEQ @parse_end
    TXA
    PHA
    CLC
    LDA CMD_TEMP_0
    TAY
    LDX #$01
@multiply_ten:
    TYA
    CLC
    ADC CMD_TEMP_0
    STA CMD_TEMP_0
    INX
    TXA
    CMP #$0A
    BNE @multiply_ten
    PLA
    TAX
    LDA CMD_INPUT_TEXT,X
    SEC
    SBC #$30
    CLC
    ADC CMD_TEMP_0
    STA CMD_TEMP_0
    INX
    JMP @parse_digit
@parse_end:
    PLA
    TAX
    PLA
    TAY
    PLA
    RTS
; 作用：把 A 追加到字符串缓冲 CMD_FULL_PATH（以 0 结尾）；调用 29 次
; 输入：A=字符（返回时保持不变）。
; 调用者：CMD_DIR_PRINT_SIZE_COUNT_FILE、CMD_PRINT_DIGIT、CMD_SUB_POW10、CMD_PRINT_HEX_NIBBLE、CMD_PRINT_DEC_BODY、CMD_DEL_IMPL、CMD_COPY_IMPL
CMD_OUTBUF_PUT_CHAR:
    STA CMD_CHAR_TEMP
    TXA
    PHA
    LDX #$00
@find_end:
    LDA CMD_FULL_PATH,X
    CMP #$00
    BEQ @append
    INX
    JMP @find_end
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
    PHA
    LSR A
    LSR A
    LSR A
    LSR A
    JSR CMD_PUT_HEX_NIBBLE
    PLA
    AND #$0F
; 作用：A 低 4 位转十六进制字符并直接显示
; 调用者：CMD_OUTBUF_PUT_CHAR
CMD_PUT_HEX_NIBBLE:
    ORA #$B0
    CMP #$BA
    BCC @letter
    ADC #$06
@letter:
    AND #$7F
    JSR CMD_PUT_CHAR
    RTS
; 作用：DOS_ERROR 为 0 返回 C=0，否则显示出错信息并 C=1；调用 36 次
; 输出：C=0 无错，C=1 有错。
; 调用者：CMD_FS_LOAD_DIR_SECTOR、CMD_FS_NEXT_DIR_SECTOR、CMD_DIR_PREPARE_SPEC、CMD_REN_IMPL、CMD_DEL_IMPL、CMD_COPY_IMPL
CMD_CHECK_ERROR:
    LDA DOS_ERROR
    BNE @show
    CLC
    RTS
@show:
    JSR CMD_NEWLINE
    LDA DOS_ERROR
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JSR CMD_NEWLINE
    SEC
    RTS
; 作用：检查 CMD_INPUT_TEXT 的文件名是否带“*”或“?”：带通配符直接返回 C=0、A=1；否则转成 8+3 名称（LIB_MAKE_FCB_NAME，写回 CMD_INPUT_TEXT），整理当前目录名（$7D/$01），读当前目录（CMD_FS_LOAD_DIR_SECTOR）并逐项（每扇区 16 项，必要时读下一扇区）找同名目录项。
; 输入：CMD_INPUT_TEXT。
; 输出：C=0、A=0 找到的是目录；C=0、A=1 找到的是文件或带通配符；C=1、A=0 没找到；C=1、A=1 出错（已显示出错信息）。X 保持不变。
; 调用者：CMD_REN_IMPL、CMD_DEL_IMPL、CMD_COPY_IMPL
CMD_DIR_PREPARE_SPEC:
    TXA
    STA CMD_CHAR_TEMP
    LDX #$00
@scan_wildcard:
    LDA CMD_INPUT_TEXT,X
    CMP #$2A
    BEQ @has_wildcard
    CMP #$3F
    BEQ @has_wildcard
    CMP #$00
    BEQ @no_wildcard
    INX
    JMP @scan_wildcard
@has_wildcard:
    JMP @found_file
@no_wildcard:
    LDY #$00
@copy_name:
    LDA CMD_INPUT_TEXT,Y
    STA LIB_TEMP_STR,Y
    BEQ @make_fcb
    INY
    JMP @copy_name
@make_fcb:
    PHA
    LDA #<CMD_INPUT_TEXT
    STA STR_PTR_LO
    LDA #>CMD_INPUT_TEXT
    STA STR_PTR_HI
    PLA
    LDA #$20
    STA LIB_GROUP
    JSR CALL_LIB_MAKE_FCB_NAME
    JSR CMD_CHECK_ERROR
    BCC @format_dir
    JMP @error
@format_dir:
    LDA #$7D
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @load_dir
    JMP @error
@load_dir:
    JSR CMD_FS_LOAD_DIR_SECTOR
    BCC @next_sector
    JMP @error
@next_sector:
    LDX #$10
@next_entry:
    JSR CMD_DIR_ENTRY_CHECK
    BCC @compare
    JMP @entry_mismatch
@compare:
    LDY #$00
@compare_byte:
    LDA CMD_INPUT_TEXT,Y
    CMP (DIR_ENTRY_PTR_LO),Y
    BEQ @byte_match
    LDA #$01
    JMP @entry_mismatch
@byte_match:
    INY
    CPY #$0B
    BCC @compare_byte
    LDY #$0B
    LDA (DIR_ENTRY_PTR_LO),Y
    AND #$10
    BEQ @found_file
    CLC
    LDA #$00
    JMP @done
@found_file:
    CLC
    LDA #$01
    JMP @done
@entry_mismatch:
    BEQ @not_found
    LDA #$20
    JSR CMD_DIR_ADVANCE_PTR
    DEX
    BEQ @next_dir_sector
    JMP @next_entry
@next_dir_sector:
    JSR CMD_FS_NEXT_DIR_SECTOR
    BCS @error
    BEQ @not_found
    JMP @next_sector
@error:
    SEC
    LDA #$01
    JMP @done
@not_found:
    SEC
    LDA #$00
    JMP @done
@done:
    PHP
    LDA CMD_CHAR_TEMP
    TAX
    PLP
    RTS
; 作用：把目录项（LIST_PTR_LO）的 8+3 名称整理成带点的文件名放进 PATH_BUFFER
; 输入：LIST_PTR_LO/HI 指向目录项。
; 输出：PATH_BUFFER=以 0 结尾的文件名。
; 调用者：CMD_DEL_IMPL、CMD_COPY_IMPL
CMD_DIR_ENTRY_TO_NAME:
    TXA
    PHA
    TYA
    PHA
    LDY #$08
    LDA (LIST_PTR_LO),Y
    CMP #$20
    BEQ @no_extension
    LDA #$01
    STA DIR_NAME_FLAG
    JMP @start_copy
@no_extension:
    LDA #$00
    STA DIR_NAME_FLAG
@start_copy:
    LDY #$00
    LDX #$00
    LDA #$00
    STA DIR_NAME_COLUMN
@copy_next:
    LDA (LIST_PTR_LO),Y
    CMP #$20
    BNE @store_char
    INY
    INC DIR_NAME_COLUMN
    JMP @check_name_end
@store_char:
    STA PATH_BUFFER,X
    INX
    INY
@check_name_end:
    CPY #$08
    BNE @check_ext_end
    LDA DIR_NAME_FLAG
    BEQ @no_dot
    LDA #$2E
    STA PATH_BUFFER,X
    JMP @dot_stored
@no_dot:
    INC DIR_NAME_COLUMN
    JMP @next_char
@dot_stored:
    INX
@next_char:
    JMP @copy_next
@check_ext_end:
    CPY #$0B
    BNE @copy_next
    LDA #$00
    STA PATH_BUFFER,X
    PLA
    TAY
    PLA
    TAX
    RTS
; 作用：经功能 $25 调用页组 0 的 CMD_BUILD_PATH（拼完整路径），A 在调用后保持；调用 10 次
; 调用者：CMD_REN_IMPL、CMD_DEL_IMPL、CMD_COPY_IMPL
CALL_CMD_BUILD_PATH:
    PHA
    LDA #$25
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_GROUP
    LDA #<CMD_BUILD_PATH
    STA PROG_ENTRY_LO
    LDA #>CMD_BUILD_PATH
    STA PROG_ENTRY_HI
    PLA
    JSR VEC_SYSCALL
    RTS
