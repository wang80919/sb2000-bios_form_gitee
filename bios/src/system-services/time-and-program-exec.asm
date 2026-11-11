; ------------------------------------------------------------------------
; 名称：time-and-program-exec.asm
; 说明：页组 5C 的入口、日期与时间读取设置（功能 $7F）、运行程序
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：占ROM 第 5C-5D 页，汇编地址 $8000 起，后面的文件接在它后面
; ------------------------------------------------------------------------
.org $8000
; 作用：页组 $5C 的入口（功能 $7E-$81）：跳到分发例程
; 调用者：EXEC_PROGRAM（取地址）
GROUP_5C_ENTRY:
    JMP GROUP_5C_DISPATCH
; 作用：服务 $7F/$04：取系统时间到 FILE_TIME_LO/HI（CLOCK_SECONDS 秒、CLOCK_MINUTES 分、CLOCK_HOURS 时）
; 调用者：GROUP_5C_DISPATCH_7F（地址表）
GET_TIME:
    LDA CLOCK_MINUTES
    LSR A
    LSR A
    LSR A
    STA FILE_TIME_HI
    LDA CLOCK_HOURS
    ASL A
    ASL A
    ASL A
    ORA FILE_TIME_HI
    STA FILE_TIME_HI
    LDA CLOCK_SECONDS
    LSR A
    STA FILE_TIME_LO
    LDA CLOCK_MINUTES
    ASL A
    ASL A
    ASL A
    ASL A
    ASL A
    ORA FILE_TIME_LO
    STA FILE_TIME_LO
    CLC
    RTS
; 作用：服务 $7F/$03：把 FILE_TIME_LO/HI 设为系统时间（先校验）
; 调用者：GROUP_5C_DISPATCH_7F（地址表）
SET_TIME:
    JSR CLOCK_CHECK_TIME
    BCC @valid
    SEC
    RTS
@valid:
    LDA DOS_TEMP_0
    PHA
    LDA DOS_TEMP_1
    PHA
    LDA DOS_TEMP_2
    PHA
    LDA FILE_TIME_LO
    AND #$1F
    ASL A
    STA DOS_TEMP_0
    LDA FILE_TIME_LO
    STA DOS_TEMP_1
    LDA FILE_TIME_HI
    AND #$07
    STA DOS_TEMP_2
    ASL DOS_TEMP_1
    ROL DOS_TEMP_2
    ASL DOS_TEMP_1
    ROL DOS_TEMP_2
    ASL DOS_TEMP_1
    ROL DOS_TEMP_2
    LDA FILE_TIME_HI
    LSR A
    LSR A
    LSR A
    STA CLOCK_HOURS
    LDA DOS_TEMP_0
    STA CLOCK_SECONDS
    LDA DOS_TEMP_2
    STA CLOCK_MINUTES
    PLA
    STA DOS_TEMP_2
    PLA
    STA DOS_TEMP_1
    PLA
    STA DOS_TEMP_0
    CLC
    RTS
; 作用：服务 $7F/$01：把 FILE_DATE_LO/HI 设为系统日期（先校验）
; 调用者：GROUP_5C_DISPATCH_7F（地址表）
SET_DATE:
    JSR CLOCK_CHECK_DATE
    BCC @valid
    SEC
    RTS
@valid:
    LDA #$00
    STA CLOCK_MIDNIGHT_FLAG
    LDA FILE_DATE_LO
    AND #$1F
    STA SYS_DATE_DAY
    LDA FILE_DATE_HI
    LSR A
    STA SYS_DATE_YEAR
    LDA FILE_DATE_LO
    ROR A
    LSR A
    LSR A
    LSR A
    LSR A
    STA SYS_DATE_MONTH
    CLC
    RTS
; 作用：服务 $7F/$02：取系统日期到 FILE_DATE_LO/HI
; 调用者：GROUP_5C_DISPATCH_7F（地址表）
GET_DATE:
    JSR CLOCK_APPLY_DAY_CARRY
    LDA SYS_DATE_MONTH
    ASL A
    ASL A
    ASL A
    ASL A
    ASL A
    PHP
    ORA SYS_DATE_DAY
    STA FILE_DATE_LO
    LDA SYS_DATE_YEAR
    PLP
    ROL A
    STA FILE_DATE_HI
    CLC
    RTS
; 作用：服务 $7F/$00：运行程序：打开 PATH_BUFFER 里的文件，按大小分配页并读入
; 检查文件第 3、4 字节（偏移 3、4）是否为 $AA、$55，不是则出错码 $3E
; 把起始页号与页数写进程序的第 5、6 字节，经功能 $25 从 $8000 调用，返回后释放页并关闭
; 调用者：GROUP_5C_DISPATCH_7F（地址表）
EXEC_PROGRAM:
    PHA
    TXA
    PHA
    TYA
    PHA
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$09
    STA SYS_SUBFUNCTION
    LDA #$00
    STA FILE_MODE
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BEQ @opened
    JMP @finish
@opened:
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$0D
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BEQ @got_size
    JMP @close_and_finish
@got_size:
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
    LDA DOS_ERROR
    BEQ @allocated
    JMP @close_and_finish
@allocated:
    LDA ALLOC_START
    STA EXEC_START_PAGE
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$0F
    STA SYS_SUBFUNCTION
    LDA EXEC_START_PAGE
    STA FILE_START_PAGE
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BEQ @loaded
@close_on_error:
    PHA
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0A
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    PLA
    STA DOS_ERROR
    JMP @free_pages
@loaded:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0A
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BNE @close_on_error
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
    LDA #<GROUP_5C_ENTRY
    STA PROG_ENTRY_LO
    LDA #>GROUP_5C_ENTRY
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    PLA
    STA EXEC_PAGE_COUNT
    PLA
    STA EXEC_START_PAGE
    LDA #$00
    STA DOS_ERROR
    JMP @free_pages
@close_and_finish:
    LDA DOS_ERROR
    PHA
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0A
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    PLA
    STA DOS_ERROR
    JMP @finish
@bad_signature:
    LDA #$3E
    STA DOS_ERROR
@free_pages:
    LDA DOS_ERROR
    PHA
    LDA #$7E
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    LDA EXEC_START_PAGE
    STA ALLOC_START
    LDA EXEC_PAGE_COUNT
    STA ALLOC_COUNT
    JSR VEC_SYSCALL
    PLA
    STA DOS_ERROR
    JMP @finish
@finish:
    LDA DOS_ERROR
    PHA
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    PLA
    CMP #$2D
    BNE @store_error
    LDA #$02
@store_error:
    STA DOS_ERROR
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
; 作用：校验 FILE_DATE_LO/HI 是否是合法日期，非法时出错码 $25
; 调用者：SET_DATE
CLOCK_CHECK_DATE:
    LDA DOS_TEMP_0
    PHA
    LDA DOS_TEMP_1
    PHA
    LDA DOS_TEMP_2
    PHA
    LDA FILE_DATE_LO
    AND #$1F
    STA DOS_TEMP_0
    LDA FILE_DATE_HI
    LSR A
    STA DOS_TEMP_2
    LDA FILE_DATE_LO
    ROR A
    LSR A
    LSR A
    LSR A
    LSR A
    STA DOS_TEMP_1
    LDA #$77
    CMP DOS_TEMP_2
    BCS @check_month
    JMP @invalid
@check_month:
    LDA DOS_TEMP_1
    BNE @check_month_max
    JMP @invalid
@check_month_max:
    LDA #$0C
    CMP DOS_TEMP_1
    BCS @check_day
    JMP @invalid
@check_day:
    LDA DOS_TEMP_0
    BNE @check_days
    JMP @invalid
@check_days:
    LDX DOS_TEMP_1
    CPX #$02
    BEQ @february
    DEX
    LDA CLOCK_DAYS_IN_MONTH,X
@compare_day:
    CMP DOS_TEMP_0
    BCS @valid
    JMP @invalid
@valid:
    PLA
    STA DOS_TEMP_2
    PLA
    STA DOS_TEMP_1
    PLA
    STA DOS_TEMP_0
    CLC
    RTS
@invalid:
    LDA #$25
    STA DOS_ERROR
    PLA
    STA DOS_TEMP_2
    PLA
    STA DOS_TEMP_1
    PLA
    STA DOS_TEMP_0
    SEC
    RTS
@february:
    LDA DOS_TEMP_2
    AND #$03
    BEQ @leap_year
    LDA #$1C
    JMP @compare_day
@leap_year:
    LDA #$1D
    JMP @compare_day
; 作用：校验 FILE_TIME_LO/HI 是否是合法时间，非法时出错码 $25
; 调用者：SET_TIME
CLOCK_CHECK_TIME:
    LDA DOS_TEMP_0
    PHA
    LDA DOS_TEMP_1
    PHA
    LDA DOS_TEMP_2
    PHA
    LDA FILE_TIME_LO
    AND #$1F
    STA DOS_TEMP_0
    LDA FILE_TIME_LO
    STA DOS_TEMP_1
    LDA FILE_TIME_HI
    STA DOS_TEMP_2
    LSR DOS_TEMP_2
    ROR DOS_TEMP_1
    LSR DOS_TEMP_2
    ROR DOS_TEMP_1
    LSR DOS_TEMP_2
    ROR DOS_TEMP_1
    LSR DOS_TEMP_1
    LSR DOS_TEMP_1
    LDA FILE_TIME_HI
    LSR A
    LSR A
    LSR A
    STA DOS_TEMP_2
    LDA #$1D
    CMP DOS_TEMP_0
    BCS @check_minute
    JMP @invalid
@check_minute:
    LDA #$3B
    CMP DOS_TEMP_1
    BCS @check_hour
    JMP @invalid
@check_hour:
    LDA #$17
    CMP DOS_TEMP_2
    BCC @invalid
    PLA
    STA DOS_TEMP_2
    PLA
    STA DOS_TEMP_1
    PLA
    STA DOS_TEMP_0
    CLC
    RTS
@invalid:
    LDA #$25
    STA DOS_ERROR
    PLA
    STA DOS_TEMP_2
    PLA
    STA DOS_TEMP_1
    PLA
    STA DOS_TEMP_0
    SEC
    RTS
; 作用：若 CLOCK_MIDNIGHT_FLAG 置位（过了午夜），把系统日期加一天，含月与年的进位
; 调用者：GET_DATE
CLOCK_APPLY_DAY_CARRY:
    LDA CLOCK_MIDNIGHT_FLAG
    BNE @add_day
    JMP @return_clear
@add_day:
    LDA #$00
    STA CLOCK_MIDNIGHT_FLAG
    INC SYS_DATE_DAY
    LDX SYS_DATE_MONTH
    CPX #$02
    BEQ @february
    DEX
    LDA CLOCK_DAYS_IN_MONTH,X
@compare:
    CMP SYS_DATE_DAY
    BCS @return_clear
    LDA #$01
    STA SYS_DATE_DAY
    INC SYS_DATE_MONTH
    LDA #$0C
    CMP SYS_DATE_MONTH
    BCS @return_clear
    LDA #$01
    STA SYS_DATE_MONTH
    INC SYS_DATE_YEAR
    LDA #$77
    CMP SYS_DATE_YEAR
    BCS @return_clear
    STA SYS_DATE_YEAR
@return_clear:
    CLC
    RTS
@february:
    LDA SYS_DATE_YEAR
    AND #$03
    BEQ @leap
    LDA #$1C
    JMP @compare
@leap:
    LDA #$1D
    JMP @compare
; 作用：每月天数表（二月 28 天，闰年在代码里处理）
; 引用者：CLOCK_CHECK_DATE、CLOCK_APPLY_DAY_CARRY
CLOCK_DAYS_IN_MONTH:
    .byte $1F,$1C,$1F,$1E,$1F,$1E,$1F,$1F,$1E,$1F,$1E,$1F
