; 作用：------------------------------------------------------------------------
; 名称：command-stubs.asm
; 说明：转到其他页组的命令入口桩：TYPE、REN、DEL、COPY、CLS、EXIT、DISKCOPY、CLJS、VER、HELP、DATE、TIME
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：在 ROM 里接在 dos-commands/command-sbwin.asm 之后
; ------------------------------------------------------------------------
; 命令 TYPE：CMD_SELECT 写 0 后转入页组 $60
; 调用者：DOS_CMD_TABLE（地址表）
CMD_TYPE:
    LDA #$00
    STA CMD_SELECT
    LDA #$25
    STA SYS_FUNCTION
    LDA #$60
    STA SYS_GROUP
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$80
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    RTS
; 作用：命令 REN、RENAME：CMD_SELECT 写 1 后转入页组 $60
; 调用者：DOS_CMD_TABLE（地址表）
CMD_REN:
    LDA #$01
    STA CMD_SELECT
    LDA #$25
    STA SYS_FUNCTION
    LDA #$60
    STA SYS_GROUP
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$80
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    RTS
; 作用：命令 DEL、ERASE：CMD_SELECT 写 2 后转入页组 $60，返回后清 DOS_ERROR
; 调用者：DOS_CMD_TABLE（地址表）
CMD_DEL:
    LDA #$02
    STA CMD_SELECT
    LDA #$25
    STA SYS_FUNCTION
    LDA #$60
    STA SYS_GROUP
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$80
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    LDA #$00
    STA DOS_ERROR
    RTS
; 作用：命令 COPY：CMD_SELECT 写 3 后转入页组 $60，返回后清 DOS_ERROR
; 调用者：DOS_CMD_TABLE（地址表）
CMD_COPY:
    LDA #$03
    STA CMD_SELECT
    LDA #$25
    STA SYS_FUNCTION
    LDA #$60
    STA SYS_GROUP
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$80
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    LDA #$00
    STA DOS_ERROR
    RTS
; 作用：命令 CLS：CMD_SELECT 写 4 后转入页组 $60
; 调用者：SHELL_ENTRY、DOS_CMD_TABLE（地址表）、SHELL_COMMAND_LOOP、RUN_CHECK_EXE、CMD_SBWIN
CMD_CLS:
    LDA #$04
    STA CMD_SELECT
    LDA #$25
    STA SYS_FUNCTION
    LDA #$60
    STA SYS_GROUP
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$80
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    RTS
; 作用：命令 EXIT：CMD_SELECT 写 5 后转入页组 $60
; 调用者：DOS_CMD_TABLE（地址表）
CMD_EXIT:
    LDA #$05
    STA CMD_SELECT
    LDA #$25
    STA SYS_FUNCTION
    LDA #$60
    STA SYS_GROUP
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$80
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    RTS
; 作用：命令 DISKCOPY：CMD_SELECT 写 0 后转入页组 $5E
; 调用者：DOS_CMD_TABLE（地址表）
CMD_DISKCOPY:
    LDA #$00
    STA CMD_SELECT
    LDA #$25
    STA SYS_FUNCTION
    LDA #$5E
    STA SYS_GROUP
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$80
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    RTS
; 作用：命令 CLJS：CMD_SELECT 写 1 后转入页组 $5E
; 调用者：DOS_CMD_TABLE（地址表）
CMD_CLJS:
    LDA #$01
    STA CMD_SELECT
    LDA #$25
    STA SYS_FUNCTION
    LDA #$5E
    STA SYS_GROUP
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$80
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    RTS
; 作用：命令 VER：CMD_SELECT 写 2 后转入页组 $5E
; 调用者：DOS_CMD_TABLE（地址表）
CMD_VER:
    LDA #$02
    STA CMD_SELECT
    LDA #$25
    STA SYS_FUNCTION
    LDA #$5E
    STA SYS_GROUP
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$80
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    RTS
; 作用：命令 HELP：CMD_SELECT 写 3 后转入页组 $5E
; 调用者：DOS_CMD_TABLE（地址表）
CMD_HELP:
    LDA #$03
    STA CMD_SELECT
    LDA #$25
    STA SYS_FUNCTION
    LDA #$5E
    STA SYS_GROUP
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$80
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    RTS
; 作用：命令 DATE：CMD_SELECT 写 4 后转入页组 $5E
; 调用者：DOS_CMD_TABLE（地址表）、SHELL_MAIN
CMD_DATE:
    LDA #$04
    STA CMD_SELECT
    LDA #$25
    STA SYS_FUNCTION
    LDA #$5E
    STA SYS_GROUP
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$80
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    RTS
; 作用：命令 TIME：CMD_SELECT 写 5 后转入页组 $5E
; 调用者：DOS_CMD_TABLE（地址表）、SHELL_MAIN
CMD_TIME:
    LDA #$05
    STA CMD_SELECT
    LDA #$25
    STA SYS_FUNCTION
    LDA #$5E
    STA SYS_GROUP
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$80
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    RTS
    RTS
; 作用：外壳主程序：设栈，初始化画面（SHELL_INIT_PPU、SHELL_VIDEO_SETUP_1、SHELL_INIT_VIDEO），启动会话（SHELL_START_SESSION）；把扩展 RAM 里 $B19D 处的启动命令行当文件名尝试打开：能打开就关闭，让软驱停转，把它复制到 SHELL_LINE_BUF 后直接执行（SHELL_EXECUTE_LINE）；打不开就显示日期与时间输入（CMD_DATE、CMD_TIME）后进入主循环（SHELL_MAIN_LOOP）。
; 调用者：SHELL_ENTRY
SHELL_MAIN:
    LDX #$FF
    TXS
    JSR SHELL_INIT_PPU
    JSR SHELL_VIDEO_SETUP_1
    JSR SHELL_START_SESSION
    JSR SHELL_INIT_VIDEO
    LDA #$13
    STA SYS_FUNCTION
    LDA #$80
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$29
    STA SYS_FUNCTION
    LDA #$03
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    LDY #$00
@loop:
    LDA $B19D,Y
    STA CMD_TAIL,Y
    BEQ @tail_copied
    INY
    JMP @loop
@tail_copied:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$09
    STA SYS_SUBFUNCTION
    LDA #$00
    STA FILE_MODE
    LDY #$00
@copy_path:
    LDA $B19D,Y
    STA PATH_BUFFER,Y
    BEQ @path_copied
    INY
    JMP @copy_path
@path_copied:
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BNE @no_startup_file
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0A
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDY #$00
@copy_line:
    LDA $B19D,Y
    STA SHELL_LINE_BUF,Y
    BEQ @line_copied
    INY
    JMP @copy_line
@line_copied:
    JMP SHELL_EXECUTE_LINE
@no_startup_file:
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$00
    STA CMD_TAIL
    JSR CMD_DATE
    LDA #$00
    STA CMD_TAIL
    JSR CMD_TIME
    JMP SHELL_MAIN_LOOP
; 作用：外壳主循环的开头：复位磁盘，SHELL_PRESET_FLAG 非 0 时转 SHELL_READ_BATCH_LINE
; 调用者：SHELL_MAIN、SHELL_READ_BATCH_LINE、SHELL_EXECUTE_LINE
SHELL_MAIN_LOOP:
    JSR SHELL_RESET_DISK
    LDA SHELL_PRESET_FLAG
    BNE SHELL_READ_BATCH_LINE
; 作用：读一行命令（SHELL_COMMAND_LOOP），然后转 SHELL_EXECUTE_LINE
; 调用者：SHELL_ENTRY、SHELL_MAIN_LOOP（顺序执行到这里）
SHELL_READ_COMMAND:
    LDA #$6B
    STA SYS_FUNCTION
    LDA #$02
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR SHELL_COMMAND_LOOP
    JSR SHELL_SPRITES_OFF
    JSR LIB_NEWLINE
    JMP SHELL_EXECUTE_LINE
; 作用：批处理方式取下一行（SHELL_RECALL_LINE）；读到 Ctrl+C（KEY_ASCII=3）时显示 ^C 并结束批处理
; 调用者：SHELL_MAIN_LOOP
SHELL_READ_BATCH_LINE:
    JSR SHELL_RECALL_LINE
    LDA #$6B
    STA SYS_FUNCTION
    LDA #$03
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA KEY_ASCII
    CMP #$03
    BNE SHELL_EXECUTE_LINE
    LDA #$5E
    JSR SHELL_PUT_CHAR
    LDA #$43
    JSR SHELL_PUT_CHAR
    JSR LIB_NEWLINE
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
    JMP SHELL_MAIN_LOOP
; 作用：解析并执行命令行，回到 SHELL_MAIN_LOOP：先解析（DOS_PARSE_COMMAND）；命令行第一个字符是驱动器字母但不是 A、B 时显示消息 $3D；有解析错误转报错；查命令（DOS_FIND_COMMAND）：序号 $FE 忽略，$FD 表示外部程序，把名称接到 DOS_CMD_BASE 后依次试 .EXE 与批处理（RUN_CHECK_EXE、RUN_CHECK_BAT），都不行则报错；其余是内部命令，调用 DOS_RUN_COMMAND。
; 调用者：SHELL_MAIN、SHELL_READ_COMMAND、SHELL_READ_BATCH_LINE
SHELL_EXECUTE_LINE:
    JSR DOS_PARSE_COMMAND
    LDA SHELL_FIRST_CHAR
    BEQ @check_error
    AND #$DF
    CMP #$41
    BEQ @check_error
    CMP #$42
    BEQ @check_error
    LDA #$01
    STA CURSOR_COL
    LDA #$3D
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    JSR LIB_NEWLINE
    JMP @next_loop
@check_error:
    LDA DOS_ERROR
    BEQ @find_command
    JMP @report_error
@find_command:
    JSR DOS_FIND_COMMAND
    LDA DOS_CMD_INDEX
    CMP #$FE
    BNE @check_external
    JMP @next_loop
@check_external:
    CMP #$FD
    BEQ @run_external
    JMP @run_internal
@run_external:
    LDX #$FF
    LDY #$00
@find_end:
    INX
    LDA DOS_CMD_BASE,X
    BNE @find_end
    DEX
    DEY
@append_name:
    INX
    INY
    LDA DOS_CMD_NAME,Y
    STA DOS_CMD_BASE,X
    BNE @append_name
    JSR RUN_CHECK_EXE
    JSR RUN_CHECK_STATUS
    BCC @external_done
    JSR RUN_CHECK_BAT
    JSR RUN_CHECK_STATUS
    BCS @report_error
@external_done:
    JSR LIB_NEWLINE
    JMP @next_loop
@run_internal:
    JSR DOS_RUN_COMMAND
    JMP SHELL_MAIN_LOOP
@report_error:
    LDA DOS_ERROR
    BEQ @next_loop
    LDA #$01
    STA CURSOR_COL
    LDA #$3D
    STA LIB_GROUP
    JSR LIB_PRINT_MESSAGE
    JSR LIB_NEWLINE
@next_loop:
    JMP SHELL_MAIN_LOOP
    .byte $B9,$B7,$BF,$B9,$CE,$D6,$BB,$BC,$CA,$D1,$D4,$D1,$D6,$00
