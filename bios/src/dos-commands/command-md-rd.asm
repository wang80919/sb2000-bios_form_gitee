; 作用：命令 MD、MKDIR（实现在页组 0 里）：解析命令行；开关位 0 打开时显示帮助消息 $71；检查驱动器（空、A、B）、第二参数为空、路径与名称里没有非法字符，名称不能为空或以“.”开头；记下当前目录；路径不为空时先切到该路径（CMD_BUILD_PATH）；目录名已存在时显示消息 $8F；否则取当前目录名（$7D/$01），与扩展 RAM $B1BA 处的字符串（应为根目录名）比较，相同才用 $7D/$02 创建目录，不同显示消息 $72（只支持一级子目录）；最后恢复原来的当前目录并让软驱停转。
; 输出：C=0 成功，C=1 失败。
; 调用者：DOS_CMD_TABLE（地址表）
CMD_MD:
    JSR CMD_PARSE_PATH_ARG
    JSR DOS_CHECK_ERROR
    BCC @args_ok
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    SEC
    RTS
@args_ok:
    LDA #$01
    STA CURSOR_COL
    LDA CMD_SWITCH_FLAGS
    AND #$01
    BEQ @not_help
    JMP @show_help
@not_help:
    JMP @check_drive
@show_help:
    LDA #$71
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    CLC
    RTS
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
    LDY #$00
@copy_arg1_name_to_temp_str:
    LDA CMD_ARG1_NAME,Y
    STA LIB_TEMP_STR,Y
    BEQ @copy_arg1_name_to_temp_str_done
    INY
    JMP @copy_arg1_name_to_temp_str
@copy_arg1_name_to_temp_str_done:
    LDA #$02
    STA LIB_GROUP
    JSR LIB_CHECK_NAME
    BCS @path_error
    LDA #$7D
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR DOS_CHECK_ERROR
    BCC @dir_saved
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    SEC
    RTS
@dir_saved:
    LDY #$00
@copy_path_buffer_to_saved_path2:
    LDA PATH_BUFFER,Y
    STA CMD_SAVED_PATH2,Y
    BEQ @copy_path_buffer_to_saved_path2_done
    INY
    JMP @copy_path_buffer_to_saved_path2
@copy_path_buffer_to_saved_path2_done:
    LDA CMD_ARG1_NAME
    BEQ @bad_name
    CMP #$2E
    BEQ @bad_name
    JMP @check_path
@bad_name:
    JMP CMD_PRINT_PATH_ERROR
@check_path:
    LDA CMD_ARG1_PATH
    BEQ @copy_saved_name1_to_arg1_name_done
    LDY #$00
@copy_arg1_name_to_saved_name1:
    LDA CMD_ARG1_NAME,Y
    STA CMD_SAVED_NAME1,Y
    BEQ @copy_arg1_name_to_saved_name1_done
    INY
    JMP @copy_arg1_name_to_saved_name1
@copy_arg1_name_to_saved_name1_done:
    LDA #$00
    STA CMD_ARG1_NAME
    JSR CMD_BUILD_PATH
    LDA CMD_PATH_SEGMENT
    BNE @build_failed
    LDY #$00
@copy_saved_name1_to_arg1_name:
    LDA CMD_SAVED_NAME1,Y
    STA CMD_ARG1_NAME,Y
    BEQ @copy_saved_name1_to_arg1_name_done
    INY
    JMP @copy_saved_name1_to_arg1_name
@copy_saved_name1_to_arg1_name_done:
    LDY #$00
@copy_arg1_name_to_input_text:
    LDA CMD_ARG1_NAME,Y
    STA CMD_INPUT_TEXT,Y
    BEQ @copy_arg1_name_to_input_text_done
    INY
    JMP @copy_arg1_name_to_input_text
@copy_arg1_name_to_input_text_done:
    JSR DIR_PREPARE_SPEC
    BCS @name_not_found
    LDA #$8F
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    JMP @fail
@lookup_failed:
    JMP @fail
@name_not_found:
    BNE @lookup_failed
    LDA #$7D
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR DOS_CHECK_ERROR
    BCC @in_target_dir
@build_failed:
    JMP @fail
@in_target_dir:
    TXA
    PHA
    LDX #$00
@compare_root:
    LDA PATH_BUFFER,X
    STA CMD_CHAR_TEMP
    BEQ @compare_root_tail
    LDA $B1BA,X
    BEQ @compare_root_differ
    CMP CMD_CHAR_TEMP
    BNE @compare_root_differ
    INX
    JMP @compare_root
@compare_root_tail:
    LDA $B1BA,X
    CMP CMD_CHAR_TEMP
    BEQ @compare_root_equal
@compare_root_differ:
    PLA
    TAX
    LDA #$01
    JMP @compare_root_result
@compare_root_equal:
    PLA
    TAX
    LDA #$00
    JMP @compare_root_result
@compare_root_result:
    BEQ @make_dir
    JMP @nested_error
@make_dir:
    LDY #$00
@copy_arg1_name_to_path_buffer:
    LDA CMD_ARG1_NAME,Y
    STA PATH_BUFFER,Y
    BEQ @copy_arg1_name_to_path_buffer_done
    INY
    JMP @copy_arg1_name_to_path_buffer
@copy_arg1_name_to_path_buffer_done:
    LDA #$7D
    STA SYS_FUNCTION
    LDA #$02
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR DOS_CHECK_ERROR
    BCC @make_ok
    JMP @fail
@make_ok:
    CLC
    JMP @restore
@nested_error:
    LDA #$72
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
@fail:
    JSR SHELL_NEWLINE
    SEC
@restore:
    PHP
    LDY #$00
@copy_saved_path2_to_path_buffer:
    LDA CMD_SAVED_PATH2,Y
    STA PATH_BUFFER,Y
    BEQ @copy_saved_path2_to_path_buffer_done
    INY
    JMP @copy_saved_path2_to_path_buffer
@copy_saved_path2_to_path_buffer_done:
    LDY #$00
@copy_saved_path2_to_current_dir:
    LDA CMD_SAVED_PATH2,Y
    STA CMD_CURRENT_DIR,Y
    BEQ @copy_saved_path2_to_current_dir_done
    INY
    JMP @copy_saved_path2_to_current_dir
@copy_saved_path2_to_current_dir_done:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0B
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    PLP
    RTS
; 作用：命令 RD、RMDIR（实现在页组 0 里）：解析命令行；开关位 0 打开时显示帮助消息 $73；检查驱动器、第二参数与非法字符；记下当前目录；路径不为空时先切到该路径（CMD_BUILD_PATH）；目录名不能为空或以“.”开头；用 $7D/$03 删除目录，出错码 $2D（是文件）显示消息 $74，其他出错显示出错信息；最后恢复原来的当前目录并让软驱停转。
; 输出：C=0 成功，C=1 失败。
; 调用者：DOS_CMD_TABLE（地址表）
CMD_RD:
    JSR CMD_PARSE_PATH_ARG
    JSR DOS_CHECK_ERROR
    BCC @args_ok
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    SEC
    RTS
@args_ok:
    LDA #$01
    STA CURSOR_COL
    LDA CMD_SWITCH_FLAGS
    AND #$01
    BEQ @not_help
    JMP @show_help
@not_help:
    JMP @check_drive
@show_help:
    LDA #$73
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    CLC
    RTS
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
    JMP @print_path_error
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
    LDY #$00
@copy_arg1_name_to_temp_str:
    LDA CMD_ARG1_NAME,Y
    STA LIB_TEMP_STR,Y
    BEQ @copy_arg1_name_to_temp_str_done
    INY
    JMP @copy_arg1_name_to_temp_str
@copy_arg1_name_to_temp_str_done:
    LDA #$02
    STA LIB_GROUP
    JSR LIB_CHECK_NAME
    BCS @path_error
    LDA #$7D
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR DOS_CHECK_ERROR
    BCC @dir_saved
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    SEC
    RTS
@dir_saved:
    LDY #$00
@copy_path_buffer_to_saved_path2:
    LDA PATH_BUFFER,Y
    STA CMD_SAVED_PATH2,Y
    BEQ @copy_path_buffer_to_saved_path2_done
    INY
    JMP @copy_path_buffer_to_saved_path2
@copy_path_buffer_to_saved_path2_done:
    LDX #$00
    LDA CMD_ARG1_PATH,X
    BEQ @copy_saved_name1_to_arg1_name_done
    LDY #$00
@copy_arg1_name_to_saved_name1:
    LDA CMD_ARG1_NAME,Y
    STA CMD_SAVED_NAME1,Y
    BEQ @copy_arg1_name_to_saved_name1_done
    INY
    JMP @copy_arg1_name_to_saved_name1
@copy_arg1_name_to_saved_name1_done:
    LDA #$00
    STA CMD_ARG1_NAME
    JSR CMD_BUILD_PATH
    BCS @bad_name
    LDY #$00
@copy_saved_name1_to_arg1_name:
    LDA CMD_SAVED_NAME1,Y
    STA CMD_ARG1_NAME,Y
    BEQ @copy_saved_name1_to_arg1_name_done
    INY
    JMP @copy_saved_name1_to_arg1_name
@copy_saved_name1_to_arg1_name_done:
    LDX #$00
    LDA CMD_ARG1_NAME,X
    BEQ @bad_name
    CMP #$2E
    BEQ @bad_name
    LDY #$00
@copy_arg1_name_to_path_buffer:
    LDA CMD_ARG1_NAME,Y
    STA PATH_BUFFER,Y
    BEQ @copy_arg1_name_to_path_buffer_done
    INY
    JMP @copy_arg1_name_to_path_buffer
@copy_arg1_name_to_path_buffer_done:
    LDA #$7D
    STA SYS_FUNCTION
    LDA #$03
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    CMP #$2D
    BEQ @bad_name
    JSR DOS_CHECK_ERROR
    BEQ @removed
    JMP @fail
@removed:
    CLC
    JMP @restore
@bad_name:
    LDA #$74
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
@fail:
    JSR SHELL_NEWLINE
    SEC
@restore:
    PHP
    LDY #$00
@copy_saved_path2_to_path_buffer:
    LDA CMD_SAVED_PATH2,Y
    STA PATH_BUFFER,Y
    BEQ @copy_saved_path2_to_path_buffer_done
    INY
    JMP @copy_saved_path2_to_path_buffer
@copy_saved_path2_to_path_buffer_done:
    LDY #$00
@copy_saved_path2_to_current_dir:
    LDA CMD_SAVED_PATH2,Y
    STA CMD_CURRENT_DIR,Y
    BEQ @copy_saved_path2_to_current_dir_done
    INY
    JMP @copy_saved_path2_to_current_dir
@copy_saved_path2_to_current_dir_done:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0B
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    PLP
    RTS
@print_path_error:
    LDA #$5F
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    SEC
    RTS
