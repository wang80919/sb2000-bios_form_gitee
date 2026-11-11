; 作用：看 DIR_ENTRY_PTR 指向的目录项首字节：0 表示后面没有项，$E5 表示已删除，其余是正常项。
; 输入：DIR_ENTRY_PTR_LO/HI。
; 输出：正常项 A=1、C=0；已删除 A=1、C=1；结束 A=0、C=1。
; 调用者：DIR_PREPARE_SPEC、CMD_DIR
DIR_ENTRY_CHECK:
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
; 作用：看目录项属性（偏移 $0B）的卷标位（$08）、隐藏位（$02）、系统位（$04），DIR 用它决定是否列出。
; 输入：DIR_ENTRY_PTR_LO/HI。
; 输出：卷标 A=0、C=1；隐藏或系统 A=1、C=1；其余 C=0。
; 调用者：CMD_DIR
DIR_ENTRY_ATTR_CHECK:
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
; 调用者：DIR_PREPARE_SPEC、CMD_DIR
DIR_ADVANCE_PTR:
    CLC
    ADC DIR_ENTRY_PTR_LO
    STA DIR_ENTRY_PTR_LO
    LDA DIR_ENTRY_PTR_HI
    ADC #$00
    STA DIR_ENTRY_PTR_HI
    RTS
; 作用：读当前目录的第一个扇区：当前目录是根目录（PATH_BUFFER 第 2 个字符为 0）时直接读根目录的第一个扇区（LBA 取 FS_FAT_AREA_SECTORS，经 $7B/$01）；否则以方式 4 打开当前目录（$7B/$09），关闭（$7B/$0A），取句柄里的簇号换算成扇区号（$7B/$03）再读入（$7B/$01）；成功后 DIR_ENTRY_PTR 指向 DISK_BUFFER 开头。
; 输出：C=0 成功，C=1 出错（已显示出错信息）。
; 调用者：DIR_PREPARE_SPEC、CMD_DIR
FS_LOAD_DIR_SECTOR:
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
    JSR DOS_CHECK_ERROR
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
    JSR DOS_CHECK_ERROR
    BCC @after_open
    JMP @return_set
@after_open:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0A
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR DOS_CHECK_ERROR
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
    JSR DOS_CHECK_ERROR
    BCC @after_lba
    JMP @return_set
@after_lba:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR DOS_CHECK_ERROR
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
; 作用：取目录项的文件大小（偏移 $1C-$1E，3 字节）并以十进制显示
; 输入：DIR_ENTRY_PTR_LO/HI。
; 调用者：CMD_DIR
DIR_PRINT_SIZE:
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
    JSR SUB_POW10
    BCC DIR_PRINT_SIZE_COUNT_FILE
; 作用：数字超出显示范围时显示 STR_SIZE_TOO_BIG 后返回
; 调用者：PRINT_DECIMAL_24、DIR_PRINT_SIZE（顺序执行到这里）
PRINT_SIZE_TOO_BIG:
    LDA #$00
    STA LIB_GROUP
    PHA
    LDA #<STR_SIZE_TOO_BIG
    STA STR_PTR_LO
    LDA #>STR_SIZE_TOO_BIG
    STA STR_PTR_HI
    PLA
    JSR LIB_PRINT_STRING
    RTS
; 作用：文件大小太大时显示的字符串“ >1.44M ”
; 引用者：PRINT_SIZE_TOO_BIG（取地址）
STR_SIZE_TOO_BIG:
    .byte $20,$3E,$31,$2E,$34,$34,$4D,$20,$20,$00
; 作用：把 CMD_NUM 的 3 字节数以十进制写进输出缓冲（逐位减 SUB_POW10 的 10 的幂表，前导零显示为空格）；超过表的第 0 项时显示“>1.44M”。
; 输入：CMD_NUM。
; 调用者：CMD_DIR
PRINT_DECIMAL_24:
    LDY #$00
    JSR SUB_POW10
    BCC PRINT_DECIMAL_DIGITS
    BCS PRINT_SIZE_TOO_BIG
; 作用：文件大小在范围内：文件计数加 1，大小累加到总计，再按位显示
; 调用者：DIR_PRINT_SIZE、PRINT_DECIMAL_24（顺序执行到这里）
DIR_PRINT_SIZE_COUNT_FILE:
    INC CMD_MATCH_COUNT
    JSR TOTAL_ADD
; 作用：按位显示十进制数：每组三位之间加逗号，前导零显示为空格
; 输入：CMD_NUM。
; 调用者：PRINT_DECIMAL_24、DIR_PRINT_SIZE_COUNT_FILE（顺序执行到这里）
PRINT_DECIMAL_DIGITS:
    TXA
    PHA
    LDY #$03
    JSR SUB_POW10
    BCS @millions
    LDA #$20
    JSR OUTBUF_PUT_CHAR
    JSR OUTBUF_PUT_CHAR
    LDY #$06
    JSR SUB_POW10
    BCS @hundred_thousands
    LDA #$20
    JSR OUTBUF_PUT_CHAR
    LDY #$09
    JSR SUB_POW10
    BCS @ten_thousands
    LDA #$20
    JSR OUTBUF_PUT_CHAR
    LDY #$0C
    JSR SUB_POW10
    BCS @thousands
    LDA #$20
    JSR OUTBUF_PUT_CHAR
    JSR OUTBUF_PUT_CHAR
    LDY #$0F
    JSR SUB_POW10
    BCS @hundreds
    LDA #$20
    JSR OUTBUF_PUT_CHAR
    LDY #$12
    JSR SUB_POW10
    BCS @tens
    LDA #$20
    JSR OUTBUF_PUT_CHAR
    JMP @ones
@millions:
    LDX #$00
@count_millions:
    LDY #$03
    JSR SUB_POW10
    BCC @print_millions
    JSR TMP_TO_CUR
    INX
    JMP @count_millions
@print_millions:
    JSR PRINT_DIGIT
    LDA #$2C
    JSR OUTBUF_PUT_CHAR
@hundred_thousands:
    LDX #$00
@count_100k:
    LDY #$06
    JSR SUB_POW10
    BCC @print_100k
    JSR TMP_TO_CUR
    INX
    JMP @count_100k
@print_100k:
    JSR PRINT_DIGIT
@ten_thousands:
    LDX #$00
@count_10k:
    LDY #$09
    JSR SUB_POW10
    BCC @print_10k
    JSR TMP_TO_CUR
    INX
    JMP @count_10k
@print_10k:
    JSR PRINT_DIGIT
@thousands:
    LDX #$00
@count_1k:
    LDY #$0C
    JSR SUB_POW10
    BCC @print_1k
    JSR TMP_TO_CUR
    INX
    JMP @count_1k
@print_1k:
    JSR PRINT_DIGIT
    LDA #$2C
    JSR OUTBUF_PUT_CHAR
@hundreds:
    LDX #$00
@count_100:
    LDY #$0F
    JSR SUB_POW10
    BCC @print_100
    JSR TMP_TO_CUR
    INX
    JMP @count_100
@print_100:
    JSR PRINT_DIGIT
@tens:
    LDX #$00
@count_10:
    LDY #$12
    JSR SUB_POW10
    BCC @print_10
    JSR TMP_TO_CUR
    INX
    JMP @count_10
@print_10:
    JSR PRINT_DIGIT
@ones:
    LDX CMD_NUM
    JSR PRINT_DIGIT
    PLA
    TAX
    RTS
; 作用：把 X 加 $30 作为字符追加到输出缓冲
; 输入：X=数字 0-9。
; 调用者：PRINT_DECIMAL_DIGITS
PRINT_DIGIT:
    TXA
    CLC
    ADC #$30
    JSR OUTBUF_PUT_CHAR
    RTS
; 作用：CMD_NUM_TEMP（3 字节）等于 CMD_NUM 减去扩展 RAM $B100 起 10 的幂表第 Y 项（每项 3 字节），不改 CMD_NUM。
; 输入：CMD_NUM，Y=表项偏移。
; 输出：CMD_NUM_TEMP，C=1 表示 CMD_NUM 不小于该项。
; 调用者：DIR_PRINT_SIZE、PRINT_DECIMAL_24、PRINT_DECIMAL_DIGITS
SUB_POW10:
    SEC
    LDA CMD_NUM
    SBC $B102,Y
    STA CMD_NUM_TEMP
    LDA CMD_NUM+1
    SBC $B101,Y
    STA CMD_NUM_TEMP+1
    LDA CMD_NUM+2
    SBC $B100,Y
    STA CMD_NUM_TEMP+2
    RTS
; 作用：取目录项日期（偏移 $18/$19）到 CMD_NUM、CMD_NUM+1，为 0 则不显示，否则按“月-日-年”显示（年加 1980 的低两位）。
; 输入：DIR_ENTRY_PTR_LO/HI。
; 调用者：CMD_DIR
DIR_PRINT_DATE:
    LDY #$18
    LDA (DIR_ENTRY_PTR_LO),Y
    STA CMD_NUM
    INY
    LDA (DIR_ENTRY_PTR_LO),Y
    STA CMD_NUM+1
    ORA CMD_NUM
    BNE @has_date
    RTS
@has_date:
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
    JSR PRINT_DEC_2DIGIT
    LDA #$2D
    JSR OUTBUF_PUT_CHAR
    LDA CMD_NUM
    AND #$1F
    JSR PRINT_DEC_2DIGIT
    LDA #$2D
    JSR OUTBUF_PUT_CHAR
    LDA CMD_NUM+1
    LSR A
    CLC
    ADC #$50
    JSR PRINT_DEC_2DIGIT
    RTS
; 作用：读目录的下一个扇区：先前进到下一扇区（$7B/$00），目录区已结束就返回，否则按 FS_NEXT_LBA 读入（$7B/$01）并让 DIR_ENTRY_PTR 指向 DISK_BUFFER 开头。
; 输出：C=0、A=1 读到了下一扇区，C=0、A=0 没有更多扇区，C=1 出错（已显示出错信息）。
; 调用者：DIR_PREPARE_SPEC、CMD_DIR
FS_NEXT_DIR_SECTOR:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR DOS_CHECK_ERROR
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
    JSR DOS_CHECK_ERROR
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
; 作用：把 A 与 Y 两个字节各显示成两位十六进制
; 调用者：CMD_DIR
PRINT_HEX16:
    JSR PRINT_HEX8
    TYA
    JSR PRINT_HEX8
    RTS
; 作用：把 A 显示成两位十六进制（经 OUTBUF_PUT_CHAR）
; 调用者：PRINT_HEX16
PRINT_HEX8:
    PHA
    LSR A
    LSR A
    LSR A
    LSR A
    JSR PRINT_HEX_NIBBLE_BUF
    PLA
    AND #$0F
; 作用：A 低 4 位转十六进制字符并追加到输出缓冲
; 调用者：PRINT_HEX8
PRINT_HEX_NIBBLE_BUF:
    ORA #$B0
    CMP #$BA
    BCC @letter
    ADC #$06
@letter:
    AND #$7F
    JSR OUTBUF_PUT_CHAR
    RTS
    LDA #$20
    JSR SHELL_PUT_CHAR
; 作用：显示 4 个空格
; 调用者：CMD_DIR、PRINT_HEX_NIBBLE_BUF（顺序执行到这里）
PRINT_4_SPACES:
    LDA #$20
    JSR SHELL_PUT_CHAR
    LDA #$20
    JSR SHELL_PUT_CHAR
    LDA #$20
    JSR SHELL_PUT_CHAR
    LDA #$20
    JSR SHELL_PUT_CHAR
    RTS
; 作用：把累计值 CMD_TOTAL（3 字节）复制到 CMD_NUM。
; 调用者：CMD_DIR
TOTAL_TO_CUR:
    LDA CMD_TOTAL
    STA CMD_NUM
    LDA CMD_TOTAL+1
    STA CMD_NUM+1
    LDA CMD_TOTAL+2
    STA CMD_NUM+2
    RTS
; 作用：把 CMD_NUM 加进累计值 CMD_TOTAL（均为 3 字节）。
; 调用者：DIR_PRINT_SIZE_COUNT_FILE、CMD_DIR
TOTAL_ADD:
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
; 作用：把 CMD_NUM_TEMP 复制到 CMD_NUM。
; 调用者：PRINT_DECIMAL_DIGITS
TMP_TO_CUR:
    LDA CMD_NUM_TEMP
    STA CMD_NUM
    LDA CMD_NUM_TEMP+1
    STA CMD_NUM+1
    LDA CMD_NUM_TEMP+2
    STA CMD_NUM+2
    RTS
; 作用：把 A（0-99，超过 99 时先对 100 取余）显示成两位十进制写进输出缓冲：入口先置 C=1 跳过 CLC，所以前导 0 显示为 0。
; 输入：A=数值。
; 调用者：DIR_PRINT_DATE
PRINT_DEC_2DIGIT:
    SEC
    BCS @body
    CLC
@body:
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
    JSR OUTBUF_PUT_CHAR
    PLA
    CLC
    ADC #$30
    JSR OUTBUF_PUT_CHAR
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
; 作用：把 A 追加到字符串缓冲 CMD_FULL_PATH（以 0 结尾），A 与 X 保持不变。
; 输入：A=字符。
; 调用者：PRINT_DECIMAL_DIGITS、PRINT_DIGIT、DIR_PRINT_DATE、PRINT_HEX_NIBBLE_BUF、PRINT_DEC_2DIGIT、CMD_BUILD_PATH、CMD_DIR
OUTBUF_PUT_CHAR:
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
    JSR PUT_HEX_NIBBLE
    PLA
    AND #$0F
; 作用：A 低 4 位转十六进制字符并直接显示（SHELL_PUT_CHAR）
; 调用者：OUTBUF_PUT_CHAR
PUT_HEX_NIBBLE:
    ORA #$B0
    CMP #$BA
    BCC @letter
    ADC #$06
@letter:
    AND #$7F
    JSR SHELL_PUT_CHAR
    RTS
; 作用：DOS_ERROR 为 0 返回 C=0；不为 0 时显示出错信息并返回 C=1。
; 输出：C=0 无错，C=1 有错。
; 调用者：FS_LOAD_DIR_SECTOR、FS_NEXT_DIR_SECTOR、DIR_PREPARE_SPEC、CMD_CD、CMD_BUILD_PATH、CMD_DIR、CMD_MD、CMD_RD
DOS_CHECK_ERROR:
    LDA DOS_ERROR
    BNE @show
    CLC
    RTS
@show:
    JSR SHELL_NEWLINE
    LDA DOS_ERROR
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    JSR SHELL_NEWLINE
    SEC
    RTS
; 作用：检查 CMD_INPUT_TEXT 的文件名是否带“*”或“?”：带通配符直接返回 C=0、A=1；否则转成 8+3 名称（LIB_MAKE_FCB_NAME，写回 CMD_INPUT_TEXT），整理当前目录名（$7D/$01），读当前目录（FS_LOAD_DIR_SECTOR）并逐项（每扇区 16 项，必要时读下一扇区）找同名目录项。
; 输入：CMD_INPUT_TEXT。
; 输出：C=0、A=0 找到的是目录；C=0、A=1 找到的是文件或带通配符；C=1、A=0 没找到；C=1、A=1 出错（已显示出错信息）。X 保持不变。
; 调用者：CMD_DIR、CMD_MD
DIR_PREPARE_SPEC:
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
@copy_input_text_to_temp_str:
    LDA CMD_INPUT_TEXT,Y
    STA LIB_TEMP_STR,Y
    BEQ @copy_input_text_to_temp_str_done
    INY
    JMP @copy_input_text_to_temp_str
@copy_input_text_to_temp_str_done:
    PHA
    LDA #<CMD_INPUT_TEXT
    STA STR_PTR_LO
    LDA #>CMD_INPUT_TEXT
    STA STR_PTR_HI
    PLA
    LDA #$20
    STA LIB_GROUP
    JSR LIB_MAKE_FCB_NAME
    JSR DOS_CHECK_ERROR
    BCC @format_dir
    JMP @error
@format_dir:
    LDA #$7D
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR DOS_CHECK_ERROR
    BCC @load_dir
    JMP @error
@load_dir:
    JSR FS_LOAD_DIR_SECTOR
    BCC @next_sector
    JMP @error
@next_sector:
    LDX #$10
@next_entry:
    JSR DIR_ENTRY_CHECK
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
    JSR DIR_ADVANCE_PTR
    DEX
    BEQ @next_dir_sector
    JMP @next_entry
@next_dir_sector:
    JSR FS_NEXT_DIR_SECTOR
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
