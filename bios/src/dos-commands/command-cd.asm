; 作用：命令 CD、CHDIR（实现在页组 0 里）：解析命令行参数，取当前目录名（$7D/$01）存入 CMD_SAVED_PATH；没有任何参数时显示“驱动器:当前路径”；有参数时用 CMD_BUILD_PATH 逐级切换目录，失败就恢复原目录；最后换行，把 PATH_BUFFER 记入 CMD_CURRENT_DIR 并让软驱停转（$80/$07）。
; 输出：C=0 成功，C=1 失败。
; 调用者：DOS_CMD_TABLE（地址表）
CMD_CD:
    LDA #$00
    STA CMD_FULL_PATH
    JSR CMD_PARSE_PATH_ARG
    JSR DOS_CHECK_ERROR
    BCC @args_ok
    JMP CMD_PATH_FAIL
@args_ok:
    LDA #$01
    STA CURSOR_COL
    LDA #$7D
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR DOS_CHECK_ERROR
    BCC @dir_formatted
    JMP CMD_PATH_FAIL
@dir_formatted:
    LDY #$00
@loop:
    LDA PATH_BUFFER,Y
    STA CMD_SAVED_PATH,Y
    BEQ @check_args
    INY
    JMP @loop
@check_args:
    LDA CMD_ARG1_PATH
    ORA CMD_SWITCH_FLAGS
    ORA CMD_ARG1_NAME
    ORA CMD_ARG2_PATH
    ORA CMD_ARG2_NAME
    ORA CMD_ARG1_DRIVE
    ORA CMD_ARG2_DRIVE
    BNE @change_dir
    LDA FS_DRIVE_LETTER
    JSR SHELL_PUT_CHAR
    LDA #$3A
    JSR SHELL_PUT_CHAR
    LDA #$00
    STA LIB_GROUP
    PHA
    LDA #<CMD_SAVED_PATH
    STA STR_PTR_LO
    LDA #>CMD_SAVED_PATH
    STA STR_PTR_HI
    PLA
    JSR LIB_PRINT_STRING
    JSR SHELL_NEWLINE
    CLC
@finish:
    PHP
    JSR SHELL_NEWLINE
    LDY #$00
@copy_path_buffer_to_current_dir:
    LDA PATH_BUFFER,Y
    STA CMD_CURRENT_DIR,Y
    BEQ @copy_path_buffer_to_current_dir_done
    INY
    JMP @copy_path_buffer_to_current_dir
@copy_path_buffer_to_current_dir_done:
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    PLP
    RTS
@change_dir:
    JSR CMD_BUILD_PATH
    BCC @go_finish
    LDY #$00
@copy_saved_path_to_path_buffer:
    LDA CMD_SAVED_PATH,Y
    STA PATH_BUFFER,Y
    BEQ @copy_saved_path_to_path_buffer_done
    INY
    JMP @copy_saved_path_to_path_buffer
@copy_saved_path_to_path_buffer_done:
    LDY #$00
@copy_saved_path_to_current_dir:
    LDA CMD_SAVED_PATH,Y
    STA CMD_CURRENT_DIR,Y
    BEQ @copy_saved_path_to_current_dir_done
    INY
    JMP @copy_saved_path_to_current_dir
@copy_saved_path_to_current_dir_done:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0B
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
@go_finish:
    JMP @finish
; 作用：按命令行解析出的路径逐级切换目录：开关位 0 打开时显示消息 $6F 并结束；文件名 CMD_ARG1_NAME 不为空时把它接到 CMD_ARG1_PATH 后并补“\”（CD 的参数都当目录）；驱动器只能是空、A、B，第二参数必须为空，路径里不能有非法字符；然后把路径按“\”拆成一段一段（CMD_PATH_SEGMENT）：普通名称就切换进去（$7B/$0B），“.\”不动，“..\”回到根目录（只支持一级子目录，已在根目录时显示消息 $70），出错转 CMD_PATH_FAIL。
; 输入：CMD_ARG1_PATH、CMD_ARG1_NAME、CMD_ARG1_DRIVE、CMD_SWITCH_FLAGS。
; 输出：C=0 成功，C=1 失败；结束后落入 CMD_SAVE_CURRENT_DIR。
; 调用者：CMD_CD、CMD_DIR、CMD_MD、CMD_RD、CALL_CMD_BUILD_PATH（取地址）
CMD_BUILD_PATH:
    LDA CMD_SWITCH_FLAGS
    AND #$01
    BEQ @check_name
    LDA #$6F
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    JMP @done
@check_name:
    LDA CMD_ARG1_NAME
    BNE @name_to_path
    JMP @check_drive
@name_to_path:
    LDY #$00
@loop:
    LDA CMD_ARG1_PATH,Y
    STA CMD_FULL_PATH,Y
    BEQ @append_name
    INY
    JMP @loop
@append_name:
    TXA
    PHA
    TYA
    PHA
    LDX #$00
@append_arg1_name_to_full_path_find_end:
    LDA CMD_FULL_PATH,X
    CMP #$00
    BEQ @append_arg1_name_to_full_path_start
    INX
    JMP @append_arg1_name_to_full_path_find_end
@append_arg1_name_to_full_path_start:
    LDY #$00
@append_arg1_name_to_full_path:
    LDA CMD_ARG1_NAME,Y
    STA CMD_FULL_PATH,X
    BNE @append_arg1_name_to_full_path_next
    PLA
    TAY
    PLA
    TAX
    JMP @append_arg1_name_to_full_path_done
@append_arg1_name_to_full_path_next:
    INX
    INY
    JMP @append_arg1_name_to_full_path
@append_arg1_name_to_full_path_done:
    LDA #$5C
    JSR OUTBUF_PUT_CHAR
    LDY #$00
@copy_full_path_to_arg1_path:
    LDA CMD_FULL_PATH,Y
    STA CMD_ARG1_PATH,Y
    BEQ @copy_full_path_to_arg1_path_done
    INY
    JMP @copy_full_path_to_arg1_path
@copy_full_path_to_arg1_path_done:
    LDA #$00
    STA CMD_FULL_PATH
    STA CMD_ARG1_NAME
@check_drive:
    LDA CMD_ARG1_DRIVE
    CMP #$00
    BEQ @check_arg2
    LDA CMD_ARG1_DRIVE
    CMP #$41
    BEQ @check_arg2
    LDA CMD_ARG1_DRIVE
    CMP #$42
    BEQ @check_arg2
@path_error:
    JMP CMD_PRINT_PATH_ERROR
@check_arg2:
    LDA CMD_ARG2_DRIVE
    ORA CMD_ARG2_PATH
    ORA CMD_ARG2_NAME
    BNE @path_error
    LDY #$00
@copy_arg1_path_to_temp_str:
    LDA CMD_ARG1_PATH,Y
    STA LIB_TEMP_STR,Y
    BEQ @copy_arg1_path_to_temp_str_done
    INY
    JMP @copy_arg1_path_to_temp_str
@copy_arg1_path_to_temp_str_done:
    LDA #$00
    STA LIB_GROUP
    JSR LIB_CHECK_NAME
    BCS @path_error
    LDX #$00
    LDA CMD_ARG1_PATH,X
    BEQ @path_empty
    JMP @next_segment_start
@path_empty:
    JMP @done
@next_segment_start:
    LDX #$00
    LDY #$00
@copy_segment:
    LDA CMD_ARG1_PATH,X
    STA CMD_PATH_SEGMENT,Y
    CMP #$5C
    BEQ @segment_copied
    INX
    INY
    JMP @copy_segment
@segment_copied:
    INY
    LDA #$00
    STA CMD_PATH_SEGMENT,Y
    LDY #$00
    LDA CMD_PATH_SEGMENT,Y
    CMP #$2E
    BNE @normal_segment
    INY
    LDA CMD_PATH_SEGMENT,Y
    CMP #$2E
    BNE @check_dot_slash
    INY
    LDA CMD_PATH_SEGMENT,Y
    CMP #$5C
    BEQ @parent_dir
    LDA #$70
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    JMP CMD_PATH_FAIL
@normal_segment:
    LDY #$00
@copy_path_segment_to_path_buffer:
    LDA CMD_PATH_SEGMENT,Y
    STA PATH_BUFFER,Y
    BEQ @copy_path_segment_to_path_buffer_done
    INY
    JMP @copy_path_segment_to_path_buffer
@copy_path_segment_to_path_buffer_done:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0B
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR DOS_CHECK_ERROR
    BCC @dir_changed
    JMP CMD_PATH_FAIL
@dir_changed:
    JMP @next_segment
@check_dot_slash:
    LDA CMD_PATH_SEGMENT,Y
    CMP #$5C
    BNE @bad_segment
    JMP @dot_ok
@bad_segment:
    LDA #$70
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    JMP CMD_PATH_FAIL
@dot_ok:
    JMP @next_segment
@parent_dir:
    LDA #$7D
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR DOS_CHECK_ERROR
    BCC @check_root
    JMP CMD_PATH_FAIL
@check_root:
    LDA PATH_BUFFER
    CMP #$5C
    BNE @go_root
    LDA PATH_BUFFER+1
    CMP #$00
    BNE @go_root
    JMP @bad_segment
@go_root:
    LDA #$5C
    STA PATH_BUFFER
    LDA #$00
    STA PATH_BUFFER+1
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0B
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR DOS_CHECK_ERROR
    BCC @root_set
    JMP CMD_PATH_FAIL
@root_set:
    JMP @next_segment
@next_segment:
    INX
    LDA CMD_ARG1_PATH,X
    CMP #$00
    BEQ @done
    LDA #$00
    TAY
    STA CMD_PATH_SEGMENT
    JMP @copy_segment
@done:
    LDA #$00
    STA CMD_PATH_SEGMENT
    CLC
; 作用：调用功能 $7D 子功能 1 后，把 PATH_BUFFER 复制到 CMD_CURRENT_DIR（当前目录路径），保持进位返回
; 调用者：CMD_PATH_FAIL、CMD_BUILD_PATH（顺序执行到这里）
CMD_SAVE_CURRENT_DIR:
    PHP
    LDA #$7D
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDY #$00
@loop:
    LDA PATH_BUFFER,Y
    STA CMD_CURRENT_DIR,Y
    BEQ @done
    INY
    JMP @loop
@done:
    PLP
    RTS
; 作用：路径处理失败：CMD_PATH_FAILED 置 1，C=1，仍走 CMD_SAVE_CURRENT_DIR。
; 调用者：CMD_CD、CMD_BUILD_PATH
CMD_PATH_FAIL:
    LDA #$01
    STA CMD_PATH_FAILED
    SEC
    JMP CMD_SAVE_CURRENT_DIR
; 作用：显示消息 $5F，CMD_PATH_FAILED 置 1，C=1 返回。
; 调用者：CMD_BUILD_PATH、CMD_MD
CMD_PRINT_PATH_ERROR:
    LDA #$5F
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    LDA #$01
    STA CMD_PATH_FAILED
    SEC
    RTS
; 作用：命令 REM（实现在页组 0 里）
; 调用者：DOS_CMD_TABLE（地址表）
CMD_REM:
    LDY #$FF
@loop:
    INY
    LDA CMD_TAIL,Y
    BEQ @return
    CMP #$20
    BEQ @loop
    CMP #$2F
    BNE @return
    INY
    LDA CMD_TAIL,Y
    BEQ @return
    CMP #$3F
    BNE @return
    LDA #$01
    STA CURSOR_COL
    LDA #$40
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    JSR LIB_NEWLINE
@return:
    RTS
; 作用：把目录项（LIST_PTR_LO）的 8+3 名称整理成带点的文件名放进 PATH_BUFFER，同时统计末尾空格数
; 输入：LIST_PTR_LO/HI 指向目录项。
; 输出：PATH_BUFFER=以 0 结尾的文件名，DIR_NAME_COLUMN=名称里空格的个数。
; 调用者：CMD_DIR
DIR_ENTRY_TO_NAME:
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
@loop:
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
    JMP @loop
@check_ext_end:
    CPY #$0B
    BNE @loop
    LDA #$00
    STA PATH_BUFFER,X
    PLA
    TAY
    PLA
    TAX
    RTS
