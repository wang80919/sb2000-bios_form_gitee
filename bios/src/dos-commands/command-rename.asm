; 作用：REN 命令的实现（页组 $60，序号 1）：解析命令行；开关位 0 打开时显示帮助消息 $75；记下当前目录，驱动器只能是空、A、B；把名称“.”改成“*.*”、“..”改成上一级目录；新名称必须给出且不带驱动器与路径，名称里不能有非法字符；用 CALL_CMD_BUILD_PATH 切到旧文件所在目录；旧名称对应目录时显示消息 $76；以方式 2 打开旧文件（$7B/$09），用 $7C/$04 改成新名称，关闭（$7B/$0A）；最后恢复原来的当前目录并让软驱停转。
; 输出：C=0 成功，C=1 失败。
; 调用者：CMD_GROUP60_TABLE（地址表）
CMD_REN_IMPL:
    JSR CALL_CMD_PARSE_PATH_ARG
    JSR CMD_CHECK_ERROR
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
    LDA #$75
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    CLC
    RTS
@not_help:
    LDA #$7D
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @dir_formatted
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    SEC
    RTS
@dir_formatted:
    LDY #$00
@loop:
    LDA PATH_BUFFER,Y
    STA CMD_SAVED_PATH2,Y
    BEQ @check_drive
    INY
    JMP @loop
@check_drive:
    LDA CMD_ARG1_DRIVE
    CMP #$00
    BEQ @normalize_name
    LDA CMD_ARG1_DRIVE
    CMP #$41
    BEQ @normalize_name
    LDA CMD_ARG1_DRIVE
    CMP #$42
    BEQ @normalize_name
@invalid_args:
    LDA #$25
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JSR CMD_NEWLINE
    JMP @fail
@normalize_name:
    TXA
    PHA
    LDX #$00
@cmp_arg1_name_str_dot:
    LDA CMD_ARG1_NAME,X
    STA CMD_CHAR_TEMP
    BEQ @cmp_arg1_name_str_dot_tail
    LDA CMD_STR_DOT,X
    BEQ @cmp_arg1_name_str_dot_differ
    CMP CMD_CHAR_TEMP
    BNE @cmp_arg1_name_str_dot_differ
    INX
    JMP @cmp_arg1_name_str_dot
@cmp_arg1_name_str_dot_tail:
    LDA CMD_STR_DOT,X
    CMP CMD_CHAR_TEMP
    BEQ @cmp_arg1_name_str_dot_equal
@cmp_arg1_name_str_dot_differ:
    PLA
    TAX
    LDA #$01
    JMP @cmp_arg1_name_str_dot_result
@cmp_arg1_name_str_dot_equal:
    PLA
    TAX
    LDA #$00
    JMP @cmp_arg1_name_str_dot_result
@cmp_arg1_name_str_dot_result:
    BEQ @dot_to_all
    TXA
    PHA
    LDX #$00
@cmp_arg1_name_str_dotdot:
    LDA CMD_ARG1_NAME,X
    STA CMD_CHAR_TEMP
    BEQ @cmp_arg1_name_str_dotdot_tail
    LDA CMD_STR_DOTDOT,X
    BEQ @cmp_arg1_name_str_dotdot_differ
    CMP CMD_CHAR_TEMP
    BNE @cmp_arg1_name_str_dotdot_differ
    INX
    JMP @cmp_arg1_name_str_dotdot
@cmp_arg1_name_str_dotdot_tail:
    LDA CMD_STR_DOTDOT,X
    CMP CMD_CHAR_TEMP
    BEQ @cmp_arg1_name_str_dotdot_equal
@cmp_arg1_name_str_dotdot_differ:
    PLA
    TAX
    LDA #$01
    JMP @cmp_arg1_name_str_dotdot_result
@cmp_arg1_name_str_dotdot_equal:
    PLA
    TAX
    LDA #$00
    JMP @cmp_arg1_name_str_dotdot_result
@cmp_arg1_name_str_dotdot_result:
    BEQ @dotdot
    JMP @check_args
@dot_to_all:
    LDY #$00
@copy_str_all_files_to_arg1_name:
    LDA CMD_STR_ALL_FILES,Y
    STA CMD_ARG1_NAME,Y
    BEQ @copy_str_all_files_to_arg1_name_done
    INY
    JMP @copy_str_all_files_to_arg1_name
@copy_str_all_files_to_arg1_name_done:
    JMP @check_args
@dotdot:
    LDY #$00
@copy_arg1_path_to_full_path:
    LDA CMD_ARG1_PATH,Y
    STA CMD_FULL_PATH,Y
    BEQ @copy_arg1_path_to_full_path_done
    INY
    JMP @copy_arg1_path_to_full_path
@copy_arg1_path_to_full_path_done:
    TXA
    PHA
    TYA
    PHA
    LDX #$00
@dotdot_find_end:
    LDA CMD_FULL_PATH,X
    CMP #$00
    BEQ @dotdot_append_start
    INX
    JMP @dotdot_find_end
@dotdot_append_start:
    LDY #$00
@dotdot_append:
    LDA CMD_STR_PARENT_DIR,Y
    STA CMD_FULL_PATH,X
    CPY #$02
    BNE @dotdot_next
    INX
    LDA #$00
    STA CMD_FULL_PATH,X
    PLA
    TAY
    PLA
    TAX
    JMP @dotdot_store
@dotdot_next:
    INX
    INY
    JMP @dotdot_append
@dotdot_store:
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
    LDY #$00
@copy_str_all_files_to_arg1_name_2:
    LDA CMD_STR_ALL_FILES,Y
    STA CMD_ARG1_NAME,Y
    BEQ @copy_str_all_files_to_arg1_name_2_done
    INY
    JMP @copy_str_all_files_to_arg1_name_2
@copy_str_all_files_to_arg1_name_2_done:
    JMP @check_args
@invalid_jump:
    JMP @invalid_args
@check_args:
    LDA CMD_ARG2_DRIVE
    ORA CMD_ARG2_PATH
    BNE @invalid_jump
    LDA CMD_ARG2_NAME
    BEQ @invalid_jump
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
    JSR STR_ALL_IN_SET
    BCS @invalid_jump
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
    JSR STR_ALL_IN_SET
    BCS @invalid_jump
    LDY #$00
@copy_arg2_name_to_temp_str:
    LDA CMD_ARG2_NAME,Y
    STA LIB_TEMP_STR,Y
    BEQ @copy_arg2_name_to_temp_str_done
    INY
    JMP @copy_arg2_name_to_temp_str
@copy_arg2_name_to_temp_str_done:
    LDA #$02
    STA LIB_GROUP
    JSR STR_ALL_IN_SET
    BCS @invalid_jump
    LDY #$00
@copy_arg1_name_to_saved_name1:
    LDA CMD_ARG1_NAME,Y
    STA CMD_SAVED_NAME1,Y
    BEQ @copy_arg1_name_to_saved_name1_done
    INY
    JMP @copy_arg1_name_to_saved_name1
@copy_arg1_name_to_saved_name1_done:
    LDY #$00
@copy_arg2_name_to_saved_name2:
    LDA CMD_ARG2_NAME,Y
    STA CMD_SAVED_NAME2,Y
    BEQ @copy_arg2_name_to_saved_name2_done
    INY
    JMP @copy_arg2_name_to_saved_name2
@copy_arg2_name_to_saved_name2_done:
    LDA #$00
    STA CMD_ARG1_NAME
    STA CMD_ARG2_NAME
    JSR CALL_CMD_BUILD_PATH
    LDA CMD_PATH_FAILED
    BNE @fail_jump
    LDY #$00
@copy_saved_name1_to_arg1_name:
    LDA CMD_SAVED_NAME1,Y
    STA CMD_ARG1_NAME,Y
    BEQ @copy_saved_name1_to_arg1_name_done
    INY
    JMP @copy_saved_name1_to_arg1_name
@copy_saved_name1_to_arg1_name_done:
    LDY #$00
@copy_saved_name2_to_arg2_name:
    LDA CMD_SAVED_NAME2,Y
    STA CMD_ARG2_NAME,Y
    BEQ @copy_saved_name2_to_arg2_name_done
    INY
    JMP @copy_saved_name2_to_arg2_name
@copy_saved_name2_to_arg2_name_done:
    LDY #$00
@copy_arg1_name_to_input_text:
    LDA CMD_ARG1_NAME,Y
    STA CMD_INPUT_TEXT,Y
    BEQ @copy_arg1_name_to_input_text_done
    INY
    JMP @copy_arg1_name_to_input_text
@copy_arg1_name_to_input_text_done:
    JSR CMD_DIR_PREPARE_SPEC
    BCS @lookup_failed
    BNE @restore_dir
    BNE @dir_restored
    LDA #$76
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JMP @fail
@fail_jump:
    JMP @fail
@lookup_failed:
    BNE @fail_jump
@restore_dir:
    LDY #$00
@copy_saved_path2_to_path_buffer:
    LDA CMD_SAVED_PATH2,Y
    STA PATH_BUFFER,Y
    BEQ @copy_saved_path2_to_path_buffer_done
    INY
    JMP @copy_saved_path2_to_path_buffer
@copy_saved_path2_to_path_buffer_done:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0B
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @dir_restored
    JMP @fail
@dir_restored:
    LDX #$00
    LDA CMD_ARG1_PATH,X
    BEQ @rename
    LDY #$00
@copy_arg1_name_to_saved_name1_2:
    LDA CMD_ARG1_NAME,Y
    STA CMD_SAVED_NAME1,Y
    BEQ @copy_arg1_name_to_saved_name1_2_done
    INY
    JMP @copy_arg1_name_to_saved_name1_2
@copy_arg1_name_to_saved_name1_2_done:
    LDY #$00
@copy_arg2_name_to_saved_name2_2:
    LDA CMD_ARG2_NAME,Y
    STA CMD_SAVED_NAME2,Y
    BEQ @copy_arg2_name_to_saved_name2_2_done
    INY
    JMP @copy_arg2_name_to_saved_name2_2
@copy_arg2_name_to_saved_name2_2_done:
    LDA #$00
    STA CMD_ARG1_NAME
    STA CMD_ARG2_NAME
    JSR CALL_CMD_BUILD_PATH
    LDA CMD_PATH_FAILED
    BNE @build_failed
    LDY #$00
@copy_saved_name1_to_arg1_name_2:
    LDA CMD_SAVED_NAME1,Y
    STA CMD_ARG1_NAME,Y
    BEQ @copy_saved_name1_to_arg1_name_2_done
    INY
    JMP @copy_saved_name1_to_arg1_name_2
@copy_saved_name1_to_arg1_name_2_done:
    LDY #$00
@copy_saved_name2_to_arg2_name_2:
    LDA CMD_SAVED_NAME2,Y
    STA CMD_ARG2_NAME,Y
    BEQ @copy_saved_name2_to_arg2_name_2_done
    INY
    JMP @copy_saved_name2_to_arg2_name_2
@copy_saved_name2_to_arg2_name_2_done:
    JMP @rename
@build_failed:
    JMP @fail
@invalid_jump2:
    JMP @invalid_message
@rename:
    LDA CMD_ARG1_NAME
    BEQ @invalid_jump2
    LDY #$00
@copy_arg1_name_to_path_buffer:
    LDA CMD_ARG1_NAME,Y
    STA PATH_BUFFER,Y
    BEQ @copy_arg1_name_to_path_buffer_done
    INY
    JMP @copy_arg1_name_to_path_buffer
@copy_arg1_name_to_path_buffer_done:
    LDA #$02
    STA FILE_MODE
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$09
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @opened
    JMP @fail
@opened:
    LDY #$00
@copy_arg2_name_to_path_buffer:
    LDA CMD_ARG2_NAME,Y
    STA PATH_BUFFER,Y
    BEQ @copy_arg2_name_to_path_buffer_done
    INY
    JMP @copy_arg2_name_to_path_buffer
@copy_arg2_name_to_path_buffer_done:
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$04
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @renamed
    JMP @fail
@renamed:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0A
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @success
    JMP @fail
@success:
    CLC
    JMP @restore
@invalid_message:
    LDA #$25
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
@fail:
    JSR CMD_NEWLINE
    SEC
@restore:
    PHP
    LDY #$00
@copy_saved_path2_to_path_buffer_2:
    LDA CMD_SAVED_PATH2,Y
    STA PATH_BUFFER,Y
    BEQ @copy_saved_path2_to_path_buffer_2_done
    INY
    JMP @copy_saved_path2_to_path_buffer_2
@copy_saved_path2_to_path_buffer_2_done:
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
    RTS
