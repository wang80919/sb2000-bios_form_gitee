; 作用：COPY 命令的实现（页组 $60，序号 3，在 ROM 第 61 页）：解析命令行（CALL_CMD_PARSE_PATH_ARG）；开关位 $01 时显示帮助；检查源与目的的驱动器字母（A、B，缺省取当前驱动器）；把名称“.”改成“*.*”，“..”改成上一级目录；检查路径与文件名里的非法字符；用 CALL_CMD_BUILD_PATH 解析源与目的路径（目的可以是目录或文件，源带通配符时目的不能指定文件名；源与目的完全相同时报错）；在扩展 RAM 的缓冲页（LIST_PTR 从 $B000 起，每个名称 11 字节）里列出所有匹配的源文件；逐个文件显示源路径，目的已存在时按开关位 $40 决定是否询问覆盖，然后调用 COPY_RUN 复制，出错时提示重试、放弃或忽略；最后显示复制的文件数（CMD_MATCH_COUNT），恢复原来的当前目录并让软驱停转（$80/$07）。
; 输出：C=0 成功，C=1 失败（已显示出错信息）。
; 调用者：CMD_GROUP60_TABLE（地址表）
CMD_COPY_IMPL:
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
    LDA CMD_ARG1_DRIVE
    BNE @arg1_drive_set
    LDA #$41
    STA CMD_ARG1_DRIVE
@arg1_drive_set:
    LDA CMD_ARG2_DRIVE
    BNE @arg2_drive_set
    LDA #$41
    STA CMD_ARG2_DRIVE
@arg2_drive_set:
    LDA #$01
    STA CURSOR_COL
    LDA #$00
    STA CMD_MATCH_COUNT
    STA CMD_FULL_PATH
    LDA WINDOW_SAVE_0
    ADC #$03
    STA CMD_TEMP_2
    LDA CMD_SWITCH_FLAGS
    AND #$01
    BEQ @no_help_switch
    LDA #$7C
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    LDA #$01
    STA CURSOR_COL
    LDA #$7D
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    CLC
    RTS
@no_help_switch:
    LDA #$7D
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @format_ok
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    SEC
    RTS
@format_ok:
    LDA CMD_ARG2_DRIVE
    CMP CMD_ARG1_DRIVE
    BEQ @drive_ok
    LDA #$46
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JSR CMD_NEWLINE
    LDA #$3B
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JSR CMD_NEWLINE
    JSR GET_KEY_ASCII
    JSR CMD_NEWLINE
    LDA FS_DRIVE_LETTER
    STA FILE_DRIVE_LETTER
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$0E
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @drive_ok
    JMP @exit_error
@drive_ok:
    LDY #$00
@loop:
    LDA PATH_BUFFER,Y
    STA CMD_SAVED_PATH,Y
    BEQ @check_dest_path
    INY
    JMP @loop
@check_dest_path:
    LDA CMD_ARG2_PATH
    BNE @init_wildcard
    LDA CMD_ARG2_DRIVE
    CMP CMD_ARG1_DRIVE
    BEQ @copy_str_root_to_path_buffer_done
    LDY #$00
@copy_str_root_to_path_buffer:
    LDA CMD_STR_ROOT,Y
    STA PATH_BUFFER,Y
    BEQ @copy_str_root_to_path_buffer_done
    INY
    JMP @copy_str_root_to_path_buffer
@copy_str_root_to_path_buffer_done:
    LDY #$00
@copy_path_buffer_to_full_path:
    LDA PATH_BUFFER,Y
    STA CMD_FULL_PATH,Y
    BEQ @copy_path_buffer_to_full_path_done
    INY
    JMP @copy_path_buffer_to_full_path
@copy_path_buffer_to_full_path_done:
    LDA CMD_FULL_PATH+1
    BEQ @store_dest_path
    LDA #$5C
    JSR CMD_OUTBUF_PUT_CHAR
@store_dest_path:
    LDY #$00
@copy_full_path_to_arg2_path:
    LDA CMD_FULL_PATH,Y
    STA CMD_ARG2_PATH,Y
    BEQ @copy_full_path_to_arg2_path_done
    INY
    JMP @copy_full_path_to_arg2_path
@copy_full_path_to_arg2_path_done:
    LDA #$00
    STA CMD_FULL_PATH
@init_wildcard:
    LDX #$00
    LDA #$3F
@fill_wildcard:
    STA CMD_WILDCARD,X
    INX
    CPX #$0B
    BCC @fill_wildcard
    LDA CMD_ARG1_DRIVE
    CMP #$00
    BEQ @default_arg1_drive
    CMP #$41
    BEQ @check_arg2_drive
    CMP #$42
    BEQ @check_arg2_drive
    JMP @invalid_drive
@check_arg2_drive:
    LDA CMD_ARG2_DRIVE
    CMP #$00
    BEQ @default_arg2_drive
    CMP #$41
    BEQ @check_names
    CMP #$42
    BEQ @check_names
@invalid_drive_jump:
    JMP @invalid_drive
@default_arg1_drive:
    LDA FS_DRIVE_LETTER
    STA CMD_ARG1_DRIVE
    JMP @check_arg2_drive
@default_arg2_drive:
    LDA FS_DRIVE_LETTER
    STA CMD_ARG2_DRIVE
    JMP @check_names
@invalid_drive:
    LDA #$25
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JSR CALL_LIB_NEWLINE
    JMP @exit_error
@check_names:
    LDA CMD_ARG1_NAME
    BEQ @invalid_drive_jump
    LDA CMD_ARG2_PATH
    ORA CMD_ARG2_NAME
    BNE @normalize_arg1
    JMP @invalid_drive
@normalize_arg1:
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
    BEQ @arg1_dot
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
    BEQ @arg1_dotdot
    JMP @normalize_arg2
@arg1_dot:
    LDY #$00
@copy_str_all_files_to_arg1_name:
    LDA CMD_STR_ALL_FILES,Y
    STA CMD_ARG1_NAME,Y
    BEQ @copy_str_all_files_to_arg1_name_done
    INY
    JMP @copy_str_all_files_to_arg1_name
@copy_str_all_files_to_arg1_name_done:
    JMP @normalize_arg2
@arg1_dotdot:
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
@arg1_dotdot_find_end:
    LDA CMD_FULL_PATH,X
    CMP #$00
    BEQ @arg1_dotdot_append_start
    INX
    JMP @arg1_dotdot_find_end
@arg1_dotdot_append_start:
    LDY #$00
@arg1_dotdot_append:
    LDA CMD_STR_PARENT_DIR,Y
    STA CMD_FULL_PATH,X
    CPY #$02
    BNE @arg1_dotdot_next
    INX
    LDA #$00
    STA CMD_FULL_PATH,X
    PLA
    TAY
    PLA
    TAX
    JMP @arg1_dotdot_store
@arg1_dotdot_next:
    INX
    INY
    JMP @arg1_dotdot_append
@arg1_dotdot_store:
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
    JMP @normalize_arg2
@normalize_arg2:
    TXA
    PHA
    LDX #$00
@cmp_arg2_name_str_dot:
    LDA CMD_ARG2_NAME,X
    STA CMD_CHAR_TEMP
    BEQ @cmp_arg2_name_str_dot_tail
    LDA CMD_STR_DOT,X
    BEQ @cmp_arg2_name_str_dot_differ
    CMP CMD_CHAR_TEMP
    BNE @cmp_arg2_name_str_dot_differ
    INX
    JMP @cmp_arg2_name_str_dot
@cmp_arg2_name_str_dot_tail:
    LDA CMD_STR_DOT,X
    CMP CMD_CHAR_TEMP
    BEQ @cmp_arg2_name_str_dot_equal
@cmp_arg2_name_str_dot_differ:
    PLA
    TAX
    LDA #$01
    JMP @cmp_arg2_name_str_dot_result
@cmp_arg2_name_str_dot_equal:
    PLA
    TAX
    LDA #$00
    JMP @cmp_arg2_name_str_dot_result
@cmp_arg2_name_str_dot_result:
    BEQ @arg2_dot
    TXA
    PHA
    LDX #$00
@cmp_arg2_name_str_dotdot:
    LDA CMD_ARG2_NAME,X
    STA CMD_CHAR_TEMP
    BEQ @cmp_arg2_name_str_dotdot_tail
    LDA CMD_STR_DOTDOT,X
    BEQ @cmp_arg2_name_str_dotdot_differ
    CMP CMD_CHAR_TEMP
    BNE @cmp_arg2_name_str_dotdot_differ
    INX
    JMP @cmp_arg2_name_str_dotdot
@cmp_arg2_name_str_dotdot_tail:
    LDA CMD_STR_DOTDOT,X
    CMP CMD_CHAR_TEMP
    BEQ @cmp_arg2_name_str_dotdot_equal
@cmp_arg2_name_str_dotdot_differ:
    PLA
    TAX
    LDA #$01
    JMP @cmp_arg2_name_str_dotdot_result
@cmp_arg2_name_str_dotdot_equal:
    PLA
    TAX
    LDA #$00
    JMP @cmp_arg2_name_str_dotdot_result
@cmp_arg2_name_str_dotdot_result:
    BEQ @arg2_dotdot
    JMP @check_chars
@arg2_dot:
    LDA #$00
    STA CMD_ARG2_NAME
    JMP @check_chars
@arg2_dotdot:
    LDY #$00
@copy_arg2_path_to_full_path:
    LDA CMD_ARG2_PATH,Y
    STA CMD_FULL_PATH,Y
    BEQ @copy_arg2_path_to_full_path_done
    INY
    JMP @copy_arg2_path_to_full_path
@copy_arg2_path_to_full_path_done:
    TXA
    PHA
    TYA
    PHA
    LDX #$00
@arg2_dotdot_find_end:
    LDA CMD_FULL_PATH,X
    CMP #$00
    BEQ @arg2_dotdot_append_start
    INX
    JMP @arg2_dotdot_find_end
@arg2_dotdot_append_start:
    LDY #$00
@arg2_dotdot_append:
    LDA CMD_STR_PARENT_DIR,Y
    STA CMD_FULL_PATH,X
    CPY #$02
    BNE @arg2_dotdot_next
    INX
    LDA #$00
    STA CMD_FULL_PATH,X
    PLA
    TAY
    PLA
    TAX
    JMP @arg2_dotdot_store
@arg2_dotdot_next:
    INX
    INY
    JMP @arg2_dotdot_append
@arg2_dotdot_store:
    LDY #$00
@copy_full_path_to_arg2_path_2:
    LDA CMD_FULL_PATH,Y
    STA CMD_ARG2_PATH,Y
    BEQ @copy_full_path_to_arg2_path_2_done
    INY
    JMP @copy_full_path_to_arg2_path_2
@copy_full_path_to_arg2_path_2_done:
    LDA #$00
    STA CMD_FULL_PATH
    LDA #$00
    STA CMD_ARG2_NAME
    JMP @check_chars
@check_chars:
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
    BCS @bad_chars
    LDY #$00
@copy_arg2_path_to_temp_str:
    LDA CMD_ARG2_PATH,Y
    STA LIB_TEMP_STR,Y
    BEQ @copy_arg2_path_to_temp_str_done
    INY
    JMP @copy_arg2_path_to_temp_str
@copy_arg2_path_to_temp_str_done:
    LDA #$00
    STA LIB_GROUP
    JSR STR_ALL_IN_SET
    BCS @bad_chars
    LDY #$00
@copy_arg1_name_to_temp_str:
    LDA CMD_ARG1_NAME,Y
    STA LIB_TEMP_STR,Y
    BEQ @copy_arg1_name_to_temp_str_done
    INY
    JMP @copy_arg1_name_to_temp_str
@copy_arg1_name_to_temp_str_done:
    LDA #$01
    STA LIB_GROUP
    JSR STR_ALL_IN_SET
    BCS @bad_chars
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
    BCS @bad_chars
    JMP @chars_ok
@bad_chars:
    JMP @invalid_drive
@chars_ok:
    LDY #$00
@copy_arg1_name_to_saved_name1:
    LDA CMD_ARG1_NAME,Y
    STA CMD_SAVED_NAME1,Y
    BEQ @copy_arg1_name_to_saved_name1_done
    INY
    JMP @copy_arg1_name_to_saved_name1
@copy_arg1_name_to_saved_name1_done:
    LDY #$00
@copy_arg2_path_to_saved_path2:
    LDA CMD_ARG2_PATH,Y
    STA CMD_SAVED_PATH2,Y
    BEQ @copy_arg2_path_to_saved_path2_done
    INY
    JMP @copy_arg2_path_to_saved_path2
@copy_arg2_path_to_saved_path2_done:
    LDY #$00
@copy_arg2_name_to_saved_name2:
    LDA CMD_ARG2_NAME,Y
    STA CMD_SAVED_NAME2,Y
    BEQ @copy_arg2_name_to_saved_name2_done
    INY
    JMP @copy_arg2_name_to_saved_name2
@copy_arg2_name_to_saved_name2_done:
    LDA CMD_ARG2_DRIVE
    STA CMD_TEMP_0
    LDA #$00
    STA CMD_ARG2_DRIVE
    STA CMD_ARG1_NAME
    STA CMD_ARG2_PATH
    STA CMD_ARG2_NAME
    JSR CALL_CMD_BUILD_PATH
    LDA CMD_PATH_FAILED
    BEQ @source_built
    JMP @exit_error
@source_built:
    LDA CMD_TEMP_0
    STA CMD_ARG2_DRIVE
    LDY #$00
@copy_saved_name1_to_arg1_name:
    LDA CMD_SAVED_NAME1,Y
    STA CMD_ARG1_NAME,Y
    BEQ @copy_saved_name1_to_arg1_name_done
    INY
    JMP @copy_saved_name1_to_arg1_name
@copy_saved_name1_to_arg1_name_done:
    LDY #$00
@copy_saved_path2_to_arg2_path:
    LDA CMD_SAVED_PATH2,Y
    STA CMD_ARG2_PATH,Y
    BEQ @copy_saved_path2_to_arg2_path_done
    INY
    JMP @copy_saved_path2_to_arg2_path
@copy_saved_path2_to_arg2_path_done:
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
    BCS @source_lookup_failed
    BNE @source_is_file
    LDY #$00
@copy_arg2_path_to_saved_path2_2:
    LDA CMD_ARG2_PATH,Y
    STA CMD_SAVED_PATH2,Y
    BEQ @copy_arg2_path_to_saved_path2_2_done
    INY
    JMP @copy_arg2_path_to_saved_path2_2
@copy_arg2_path_to_saved_path2_2_done:
    LDY #$00
@copy_arg2_name_to_saved_name2_2:
    LDA CMD_ARG2_NAME,Y
    STA CMD_SAVED_NAME2,Y
    BEQ @copy_arg2_name_to_saved_name2_2_done
    INY
    JMP @copy_arg2_name_to_saved_name2_2
@copy_arg2_name_to_saved_name2_2_done:
    LDA CMD_ARG2_DRIVE
    STA CMD_TEMP_0
    LDA #$00
    STA CMD_ARG2_DRIVE
    STA CMD_ARG1_PATH
    STA CMD_ARG2_PATH
    STA CMD_ARG2_NAME
    JSR CALL_CMD_BUILD_PATH
    LDA CMD_PATH_FAILED
    BEQ @source_dir_built
@fail_jump1:
    JMP @exit_error
@source_is_file:
    JMP @source_file_path
@source_lookup_failed:
    BNE @fail_jump1
    LDA #$7F
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JMP @exit_error
@source_dir_built:
    LDA CMD_TEMP_0
    STA CMD_ARG2_DRIVE
    LDA #$7D
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @source_dir_format_ok
    JMP @exit_error
@source_dir_format_ok:
    LDY #$00
@copy_path_buffer_to_full_path_2:
    LDA PATH_BUFFER,Y
    STA CMD_FULL_PATH,Y
    BEQ @copy_path_buffer_to_full_path_2_done
    INY
    JMP @copy_path_buffer_to_full_path_2
@copy_path_buffer_to_full_path_2_done:
    LDA CMD_FULL_PATH+1
    BEQ @source_dir_terminated
    LDA #$5C
    JSR CMD_OUTBUF_PUT_CHAR
@source_dir_terminated:
    LDY #$00
@copy_full_path_to_arg1_path_2:
    LDA CMD_FULL_PATH,Y
    STA CMD_ARG1_PATH,Y
    BEQ @copy_full_path_to_arg1_path_2_done
    INY
    JMP @copy_full_path_to_arg1_path_2
@copy_full_path_to_arg1_path_2_done:
    LDA #$00
    STA CMD_FULL_PATH
    LDY #$00
@copy_saved_path2_to_arg2_path_2:
    LDA CMD_SAVED_PATH2,Y
    STA CMD_ARG2_PATH,Y
    BEQ @copy_saved_path2_to_arg2_path_2_done
    INY
    JMP @copy_saved_path2_to_arg2_path_2
@copy_saved_path2_to_arg2_path_2_done:
    LDY #$00
@copy_saved_name2_to_arg2_name_2:
    LDA CMD_SAVED_NAME2,Y
    STA CMD_ARG2_NAME,Y
    BEQ @copy_saved_name2_to_arg2_name_2_done
    INY
    JMP @copy_saved_name2_to_arg2_name_2
@copy_saved_name2_to_arg2_name_2_done:
    LDY #$00
@copy_str_all_files_to_arg1_name_3:
    LDA CMD_STR_ALL_FILES,Y
    STA CMD_ARG1_NAME,Y
    BEQ @copy_str_all_files_to_arg1_name_3_done
    INY
    JMP @copy_str_all_files_to_arg1_name_3
@copy_str_all_files_to_arg1_name_3_done:
    JMP @restore_dir
@source_file_path:
    LDA #$7D
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @source_file_format_ok
    JMP @exit_error
@source_file_format_ok:
    LDY #$00
@copy_path_buffer_to_full_path_3:
    LDA PATH_BUFFER,Y
    STA CMD_FULL_PATH,Y
    BEQ @copy_path_buffer_to_full_path_3_done
    INY
    JMP @copy_path_buffer_to_full_path_3
@copy_path_buffer_to_full_path_3_done:
    LDA CMD_FULL_PATH+1
    BEQ @source_file_terminated
    LDA #$5C
    JSR CMD_OUTBUF_PUT_CHAR
@source_file_terminated:
    LDY #$00
@copy_full_path_to_arg1_path_3:
    LDA CMD_FULL_PATH,Y
    STA CMD_ARG1_PATH,Y
    BEQ @copy_full_path_to_arg1_path_3_done
    INY
    JMP @copy_full_path_to_arg1_path_3
@copy_full_path_to_arg1_path_3_done:
    LDA #$00
    STA CMD_FULL_PATH
@restore_dir:
    LDY #$00
@copy_saved_path_to_path_buffer:
    LDA CMD_SAVED_PATH,Y
    STA PATH_BUFFER,Y
    BEQ @copy_saved_path_to_path_buffer_done
    INY
    JMP @copy_saved_path_to_path_buffer
@copy_saved_path_to_path_buffer_done:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0B
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @dir_restored
    JMP @exit_error
@dir_restored:
    LDA CMD_ARG2_DRIVE
    CMP CMD_ARG1_DRIVE
    BEQ @swap_args
    LDA #$48
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JSR CMD_NEWLINE
    LDA #$3B
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JSR CMD_NEWLINE
    JSR GET_KEY_ASCII
    JSR CMD_NEWLINE
    LDY #$00
@copy_str_root_to_path_buffer_2:
    LDA CMD_STR_ROOT,Y
    STA PATH_BUFFER,Y
    BEQ @copy_str_root_to_path_buffer_2_done
    INY
    JMP @copy_str_root_to_path_buffer_2
@copy_str_root_to_path_buffer_2_done:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0B
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @swap_args
    JMP @exit_error
@swap_args:
    LDY #$00
@copy_arg1_path_to_saved_path2:
    LDA CMD_ARG1_PATH,Y
    STA CMD_SAVED_PATH2,Y
    BEQ @copy_arg1_path_to_saved_path2_done
    INY
    JMP @copy_arg1_path_to_saved_path2
@copy_arg1_path_to_saved_path2_done:
    LDY #$00
@copy_arg2_path_to_arg1_path:
    LDA CMD_ARG2_PATH,Y
    STA CMD_ARG1_PATH,Y
    BEQ @copy_arg2_path_to_arg1_path_done
    INY
    JMP @copy_arg2_path_to_arg1_path
@copy_arg2_path_to_arg1_path_done:
    LDY #$00
@copy_arg1_name_to_saved_name1_2:
    LDA CMD_ARG1_NAME,Y
    STA CMD_SAVED_NAME1,Y
    BEQ @copy_arg1_name_to_saved_name1_2_done
    INY
    JMP @copy_arg1_name_to_saved_name1_2
@copy_arg1_name_to_saved_name1_2_done:
    LDY #$00
@copy_arg2_name_to_saved_name2_3:
    LDA CMD_ARG2_NAME,Y
    STA CMD_SAVED_NAME2,Y
    BEQ @copy_arg2_name_to_saved_name2_3_done
    INY
    JMP @copy_arg2_name_to_saved_name2_3
@copy_arg2_name_to_saved_name2_3_done:
    LDA CMD_ARG2_DRIVE
    STA CMD_TEMP_0
    LDA #$00
    STA CMD_ARG2_DRIVE
    STA CMD_ARG1_NAME
    STA CMD_ARG2_PATH
    STA CMD_ARG2_NAME
    JSR CALL_CMD_BUILD_PATH
    LDA CMD_PATH_FAILED
    BEQ @dest_built
    JMP @exit_error
@dest_file_jump:
    JMP @dest_file_path
@dest_built:
    LDA CMD_TEMP_0
    STA CMD_ARG2_DRIVE
    LDY #$00
@copy_saved_name2_to_arg2_name_3:
    LDA CMD_SAVED_NAME2,Y
    STA CMD_ARG2_NAME,Y
    BEQ @copy_saved_name2_to_arg2_name_3_done
    INY
    JMP @copy_saved_name2_to_arg2_name_3
@copy_saved_name2_to_arg2_name_3_done:
    LDY #$00
@copy_saved_name1_to_arg1_name_2:
    LDA CMD_SAVED_NAME1,Y
    STA CMD_ARG1_NAME,Y
    BEQ @copy_saved_name1_to_arg1_name_2_done
    INY
    JMP @copy_saved_name1_to_arg1_name_2
@copy_saved_name1_to_arg1_name_2_done:
    LDY #$00
@copy_arg1_path_to_arg2_path:
    LDA CMD_ARG1_PATH,Y
    STA CMD_ARG2_PATH,Y
    BEQ @copy_arg1_path_to_arg2_path_done
    INY
    JMP @copy_arg1_path_to_arg2_path
@copy_arg1_path_to_arg2_path_done:
    LDY #$00
@copy_saved_path2_to_arg1_path:
    LDA CMD_SAVED_PATH2,Y
    STA CMD_ARG1_PATH,Y
    BEQ @copy_saved_path2_to_arg1_path_done
    INY
    JMP @copy_saved_path2_to_arg1_path
@copy_saved_path2_to_arg1_path_done:
    LDY #$00
@copy_arg2_name_to_input_text:
    LDA CMD_ARG2_NAME,Y
    STA CMD_INPUT_TEXT,Y
    BEQ @copy_arg2_name_to_input_text_done
    INY
    JMP @copy_arg2_name_to_input_text
@copy_arg2_name_to_input_text_done:
    JSR CMD_DIR_PREPARE_SPEC
    BCS @dest_lookup_failed
    BNE @dest_file_jump
    LDY #$00
@copy_arg1_path_to_saved_path2_2:
    LDA CMD_ARG1_PATH,Y
    STA CMD_SAVED_PATH2,Y
    BEQ @copy_arg1_path_to_saved_path2_2_done
    INY
    JMP @copy_arg1_path_to_saved_path2_2
@copy_arg1_path_to_saved_path2_2_done:
    LDY #$00
@copy_arg1_name_to_saved_name1_3:
    LDA CMD_ARG1_NAME,Y
    STA CMD_SAVED_NAME1,Y
    BEQ @copy_arg1_name_to_saved_name1_3_done
    INY
    JMP @copy_arg1_name_to_saved_name1_3
@copy_arg1_name_to_saved_name1_3_done:
    LDY #$00
@copy_arg2_name_to_arg1_name:
    LDA CMD_ARG2_NAME,Y
    STA CMD_ARG1_NAME,Y
    BEQ @copy_arg2_name_to_arg1_name_done
    INY
    JMP @copy_arg2_name_to_arg1_name
@copy_arg2_name_to_arg1_name_done:
    LDA CMD_ARG2_DRIVE
    STA CMD_TEMP_0
    LDA #$00
    STA CMD_ARG2_DRIVE
    STA CMD_ARG1_PATH
    STA CMD_ARG2_PATH
    STA CMD_ARG2_NAME
    JSR CALL_CMD_BUILD_PATH
    LDA CMD_PATH_FAILED
    BEQ @dest_dir_built
@fail_jump2:
    JMP @exit_error
@dest_lookup_failed:
    BNE @fail_jump2
    JMP @dest_file_path
@dest_dir_built:
    LDA CMD_TEMP_0
    STA CMD_ARG2_DRIVE
    LDA #$7D
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @dest_dir_format_ok
    JMP @exit_error
@dest_dir_format_ok:
    LDY #$00
@copy_path_buffer_to_full_path_4:
    LDA PATH_BUFFER,Y
    STA CMD_FULL_PATH,Y
    BEQ @copy_path_buffer_to_full_path_4_done
    INY
    JMP @copy_path_buffer_to_full_path_4
@copy_path_buffer_to_full_path_4_done:
    LDA CMD_FULL_PATH+1
    BEQ @dest_dir_terminated
    LDA #$5C
    JSR CMD_OUTBUF_PUT_CHAR
@dest_dir_terminated:
    LDY #$00
@copy_full_path_to_arg2_path_3:
    LDA CMD_FULL_PATH,Y
    STA CMD_ARG2_PATH,Y
    BEQ @copy_full_path_to_arg2_path_3_done
    INY
    JMP @copy_full_path_to_arg2_path_3
@copy_full_path_to_arg2_path_3_done:
    LDA #$00
    STA CMD_FULL_PATH
    LDY #$00
@copy_saved_name1_to_arg1_name_3:
    LDA CMD_SAVED_NAME1,Y
    STA CMD_ARG1_NAME,Y
    BEQ @copy_saved_name1_to_arg1_name_3_done
    INY
    JMP @copy_saved_name1_to_arg1_name_3
@copy_saved_name1_to_arg1_name_3_done:
    LDY #$00
@copy_saved_path2_to_arg1_path_2:
    LDA CMD_SAVED_PATH2,Y
    STA CMD_ARG1_PATH,Y
    BEQ @copy_saved_path2_to_arg1_path_2_done
    INY
    JMP @copy_saved_path2_to_arg1_path_2
@copy_saved_path2_to_arg1_path_2_done:
    LDA #$00
    STA CMD_ARG2_NAME
    JMP @check_disk_swap
@dest_file_path:
    LDA #$7D
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @dest_file_format_ok
    JMP @exit_error
@dest_file_format_ok:
    LDY #$00
@copy_path_buffer_to_full_path_5:
    LDA PATH_BUFFER,Y
    STA CMD_FULL_PATH,Y
    BEQ @copy_path_buffer_to_full_path_5_done
    INY
    JMP @copy_path_buffer_to_full_path_5
@copy_path_buffer_to_full_path_5_done:
    LDA CMD_FULL_PATH+1
    BEQ @dest_file_terminated
    LDA #$5C
    JSR CMD_OUTBUF_PUT_CHAR
@dest_file_terminated:
    LDY #$00
@copy_full_path_to_arg2_path_4:
    LDA CMD_FULL_PATH,Y
    STA CMD_ARG2_PATH,Y
    BEQ @copy_full_path_to_arg2_path_4_done
    INY
    JMP @copy_full_path_to_arg2_path_4
@copy_full_path_to_arg2_path_4_done:
    LDA #$00
    STA CMD_FULL_PATH
@check_disk_swap:
    LDA CMD_ARG1_DRIVE
    CMP CMD_ARG2_DRIVE
    BEQ @disk_swap_done
    LDA #$46
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JSR CMD_NEWLINE
    LDA #$3B
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JSR CMD_NEWLINE
    JSR GET_KEY_ASCII
    JSR CMD_NEWLINE
@disk_swap_done:
    LDY #$00
@copy_saved_path_to_path_buffer_2:
    LDA CMD_SAVED_PATH,Y
    STA PATH_BUFFER,Y
    BEQ @copy_saved_path_to_path_buffer_2_done
    INY
    JMP @copy_saved_path_to_path_buffer_2
@copy_saved_path_to_path_buffer_2_done:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0B
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @scan_wildcard
    JMP @exit_error
@scan_wildcard:
    LDX #$00
@scan_source_wildcard:
    LDA CMD_ARG1_NAME,X
    CMP #$2A
    BEQ @has_wildcard
    CMP #$3F
    BEQ @has_wildcard
    CPX #$0A
    BEQ @check_same_file
    INX
    JMP @scan_source_wildcard
@has_wildcard:
    LDA CMD_ARG2_NAME
    BEQ @check_same_file
    JMP @wildcard_with_name_error
@check_same_file:
    LDA CMD_ARG1_DRIVE
    CMP CMD_ARG2_DRIVE
    BNE @allocate_list
    TXA
    PHA
    LDX #$00
@cmp_arg1_path_arg2_path:
    LDA CMD_ARG1_PATH,X
    STA CMD_CHAR_TEMP
    BEQ @cmp_arg1_path_arg2_path_tail
    LDA CMD_ARG2_PATH,X
    BEQ @cmp_arg1_path_arg2_path_differ
    CMP CMD_CHAR_TEMP
    BNE @cmp_arg1_path_arg2_path_differ
    INX
    JMP @cmp_arg1_path_arg2_path
@cmp_arg1_path_arg2_path_tail:
    LDA CMD_ARG2_PATH,X
    CMP CMD_CHAR_TEMP
    BEQ @cmp_arg1_path_arg2_path_equal
@cmp_arg1_path_arg2_path_differ:
    PLA
    TAX
    LDA #$01
    JMP @cmp_arg1_path_arg2_path_result
@cmp_arg1_path_arg2_path_equal:
    PLA
    TAX
    LDA #$00
    JMP @cmp_arg1_path_arg2_path_result
@cmp_arg1_path_arg2_path_result:
    BNE @allocate_list
    LDA CMD_ARG2_NAME
    BEQ @same_file_error
    TXA
    PHA
    LDX #$00
@cmp_arg2_name_arg1_name:
    LDA CMD_ARG2_NAME,X
    STA CMD_CHAR_TEMP
    BEQ @cmp_arg2_name_arg1_name_tail
    LDA CMD_ARG1_NAME,X
    BEQ @cmp_arg2_name_arg1_name_differ
    CMP CMD_CHAR_TEMP
    BNE @cmp_arg2_name_arg1_name_differ
    INX
    JMP @cmp_arg2_name_arg1_name
@cmp_arg2_name_arg1_name_tail:
    LDA CMD_ARG1_NAME,X
    CMP CMD_CHAR_TEMP
    BEQ @cmp_arg2_name_arg1_name_equal
@cmp_arg2_name_arg1_name_differ:
    PLA
    TAX
    LDA #$01
    JMP @cmp_arg2_name_arg1_name_result
@cmp_arg2_name_arg1_name_equal:
    PLA
    TAX
    LDA #$00
    JMP @cmp_arg2_name_arg1_name_result
@cmp_arg2_name_arg1_name_result:
    BNE @allocate_list
@same_file_error:
    LDA #$90
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JSR CMD_NEWLINE
    JSR CMD_NEWLINE
    JMP @exit_error
@allocate_list:
    LDA #$7E
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    LDA #$01
    STA ALLOC_COUNT
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @list_allocated
    JMP @exit_error
@list_allocated:
    LDA ALLOC_START
    STA CMD_TEMP_1
    LDA CMD_TEMP_1
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    PHA
    LDA #$00
    STA LIST_PTR_LO
    LDA #$B0
    STA LIST_PTR_HI
    PLA
    LDA CMD_TEMP_1
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDY #$00
@copy_arg1_name_to_saved_name1_4:
    LDA CMD_ARG1_NAME,Y
    STA CMD_SAVED_NAME1,Y
    BEQ @copy_arg1_name_to_saved_name1_4_done
    INY
    JMP @copy_arg1_name_to_saved_name1_4
@copy_arg1_name_to_saved_name1_4_done:
    LDY #$00
@copy_arg2_path_to_saved_path2_3:
    LDA CMD_ARG2_PATH,Y
    STA CMD_SAVED_PATH2,Y
    BEQ @copy_arg2_path_to_saved_path2_3_done
    INY
    JMP @copy_arg2_path_to_saved_path2_3
@copy_arg2_path_to_saved_path2_3_done:
    LDY #$00
@copy_arg2_name_to_saved_name2_4:
    LDA CMD_ARG2_NAME,Y
    STA CMD_SAVED_NAME2,Y
    BEQ @copy_arg2_name_to_saved_name2_4_done
    INY
    JMP @copy_arg2_name_to_saved_name2_4
@copy_arg2_name_to_saved_name2_4_done:
    LDA CMD_ARG2_DRIVE
    STA CMD_TEMP_0
    LDA #$00
    STA CMD_ARG1_NAME
    STA CMD_ARG2_PATH
    STA CMD_ARG2_NAME
    STA CMD_ARG2_DRIVE
    JSR CALL_CMD_BUILD_PATH
    LDA CMD_PATH_FAILED
    BEQ @list_args_restored
    JMP @exit_error
@list_args_restored:
    LDA CMD_TEMP_0
    STA CMD_ARG2_DRIVE
    LDY #$00
@copy_saved_name1_to_arg1_name_4:
    LDA CMD_SAVED_NAME1,Y
    STA CMD_ARG1_NAME,Y
    BEQ @copy_saved_name1_to_arg1_name_4_done
    INY
    JMP @copy_saved_name1_to_arg1_name_4
@copy_saved_name1_to_arg1_name_4_done:
    LDY #$00
@copy_saved_path2_to_arg2_path_3:
    LDA CMD_SAVED_PATH2,Y
    STA CMD_ARG2_PATH,Y
    BEQ @copy_saved_path2_to_arg2_path_3_done
    INY
    JMP @copy_saved_path2_to_arg2_path_3
@copy_saved_path2_to_arg2_path_3_done:
    LDY #$00
@copy_saved_name2_to_arg2_name_4:
    LDA CMD_SAVED_NAME2,Y
    STA CMD_ARG2_NAME,Y
    BEQ @copy_saved_name2_to_arg2_name_4_done
    INY
    JMP @copy_saved_name2_to_arg2_name_4
@copy_saved_name2_to_arg2_name_4_done:
    JSR CMD_FS_LOAD_DIR_SECTOR
    PHA
    LDA #<CMD_WILDCARD
    STA STR_PTR_LO
    LDA #>CMD_WILDCARD
    STA STR_PTR_HI
    PLA
    LDY #$00
@copy_arg1_name_to_temp_str_2:
    LDA CMD_ARG1_NAME,Y
    STA LIB_TEMP_STR,Y
    BEQ @copy_arg1_name_to_temp_str_2_done
    INY
    JMP @copy_arg1_name_to_temp_str_2
@copy_arg1_name_to_temp_str_2_done:
    LDA #$20
    STA LIB_GROUP
    JSR CALL_LIB_MAKE_FCB_NAME
    JSR CMD_CHECK_ERROR
    BCC @list_read_sector
    JMP @exit_error
@list_read_sector:
    LDX #$10
@list_next_entry:
    JSR CMD_DIR_ENTRY_CHECK
    BCC @list_entry_used
    JMP @list_entry_done
@list_entry_used:
    LDY #$00
@list_match_byte:
    LDA CMD_WILDCARD,Y
    CMP #$3F
    BEQ @list_match_next
    CMP (DIR_ENTRY_PTR_LO),Y
    BEQ @list_match_next
    LDA #$01
    JMP @list_entry_done
@list_match_next:
    INY
    CPY #$0B
    BCC @list_match_byte
    JSR CMD_DIR_ENTRY_ATTR_CHECK
    BCC @list_check_dir
    LDA #$01
    JMP @list_entry_done
@list_check_dir:
    LDY #$0B
    LDA (DIR_ENTRY_PTR_LO),Y
    AND #$10
    BEQ @list_add
    LDA #$01
    JMP @list_entry_done
@list_add:
    TYA
    PHA
    LDY #$00
@list_copy_name:
    LDA (DIR_ENTRY_PTR_LO),Y
    STA (LIST_PTR_LO),Y
    INY
    CPY #$0B
    BNE @list_copy_name
    PLA
    TAY
    CLC
    LDA LIST_PTR_LO
    ADC #$0B
    STA LIST_PTR_LO
    LDA LIST_PTR_HI
    ADC #$00
    STA LIST_PTR_HI
    LDA #$01
@list_entry_done:
    PHP
    LDA #$00
    TAY
    STA (LIST_PTR_LO),Y
    PLP
    BEQ @list_finished
    LDA #$20
    JSR CMD_DIR_ADVANCE_PTR
    DEX
    BEQ @list_next_sector
    JMP @list_next_entry
@list_next_sector:
    JSR CMD_FS_NEXT_DIR_SECTOR
    BCS @list_error
    BEQ @list_finished
    JMP @list_read_sector
@list_error:
    JMP @exit_error
@list_finished:
    LDA CMD_TEMP_1
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    PHA
    LDA #$00
    STA LIST_PTR_LO
    LDA #$B0
    STA LIST_PTR_HI
    PLA
    JMP @start_copying
@no_files_jump:
    JMP @all_done
@start_copying:
    LDA CMD_ARG2_DRIVE
    CMP CMD_ARG1_DRIVE
    BEQ @next_file
    LDA #$48
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JSR CMD_NEWLINE
    LDA #$3B
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JSR CMD_NEWLINE
    JSR GET_KEY_ASCII
    JSR CMD_NEWLINE
@next_file:
    LDA CMD_TEMP_1
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDY #$00
    LDA (LIST_PTR_LO),Y
    BEQ @no_files_jump
    JSR CMD_DIR_ENTRY_TO_NAME
    LDY #$00
@copy_path_buffer_to_arg1_name:
    LDA PATH_BUFFER,Y
    STA CMD_ARG1_NAME,Y
    BEQ @copy_path_buffer_to_arg1_name_done
    INY
    JMP @copy_path_buffer_to_arg1_name
@copy_path_buffer_to_arg1_name_done:
    LDA CMD_TEMP_2
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA CMD_ARG1_DRIVE
    JSR CMD_OUTBUF_PUT_CHAR
    LDA #$3A
    JSR CMD_OUTBUF_PUT_CHAR
    TXA
    PHA
    TYA
    PHA
    LDX #$00
@append_arg1_path_to_full_path_find_end:
    LDA CMD_FULL_PATH,X
    CMP #$00
    BEQ @append_arg1_path_to_full_path_start
    INX
    JMP @append_arg1_path_to_full_path_find_end
@append_arg1_path_to_full_path_start:
    LDY #$00
@append_arg1_path_to_full_path:
    LDA CMD_ARG1_PATH,Y
    STA CMD_FULL_PATH,X
    BNE @append_arg1_path_to_full_path_next
    PLA
    TAY
    PLA
    TAX
    JMP @append_arg1_path_to_full_path_done
@append_arg1_path_to_full_path_next:
    INX
    INY
    JMP @append_arg1_path_to_full_path
@append_arg1_path_to_full_path_done:
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
    LDY #$00
@copy_full_path_to_copy_src_path:
    LDA CMD_FULL_PATH,Y
    STA CMD_COPY_SRC_PATH,Y
    BEQ @copy_full_path_to_copy_src_path_done
    INY
    JMP @copy_full_path_to_copy_src_path
@copy_full_path_to_copy_src_path_done:
    LDA #$00
    STA CMD_FULL_PATH
    LDY #$00
@copy_str_root_to_path_buffer_3:
    LDA CMD_STR_ROOT,Y
    STA PATH_BUFFER,Y
    BEQ @copy_str_root_to_path_buffer_3_done
    INY
    JMP @copy_str_root_to_path_buffer_3
@copy_str_root_to_path_buffer_3_done:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0B
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @root_dir_set
    JMP @exit_error
@root_dir_set:
    LDY #$00
@copy_arg1_path_to_saved_path2_3:
    LDA CMD_ARG1_PATH,Y
    STA CMD_SAVED_PATH2,Y
    BEQ @copy_arg1_path_to_saved_path2_3_done
    INY
    JMP @copy_arg1_path_to_saved_path2_3
@copy_arg1_path_to_saved_path2_3_done:
    LDY #$00
@copy_arg2_path_to_arg1_path_2:
    LDA CMD_ARG2_PATH,Y
    STA CMD_ARG1_PATH,Y
    BEQ @copy_arg2_path_to_arg1_path_2_done
    INY
    JMP @copy_arg2_path_to_arg1_path_2
@copy_arg2_path_to_arg1_path_2_done:
    LDY #$00
@copy_arg1_name_to_saved_name1_5:
    LDA CMD_ARG1_NAME,Y
    STA CMD_SAVED_NAME1,Y
    BEQ @copy_arg1_name_to_saved_name1_5_done
    INY
    JMP @copy_arg1_name_to_saved_name1_5
@copy_arg1_name_to_saved_name1_5_done:
    LDY #$00
@copy_arg2_name_to_saved_name2_5:
    LDA CMD_ARG2_NAME,Y
    STA CMD_SAVED_NAME2,Y
    BEQ @copy_arg2_name_to_saved_name2_5_done
    INY
    JMP @copy_arg2_name_to_saved_name2_5
@copy_arg2_name_to_saved_name2_5_done:
    LDA CMD_ARG2_DRIVE
    STA CMD_TEMP_0
    LDA #$00
    STA CMD_ARG2_DRIVE
    STA CMD_ARG1_NAME
    STA CMD_ARG2_PATH
    STA CMD_ARG2_NAME
    JSR CALL_CMD_BUILD_PATH
    LDA CMD_PATH_FAILED
    BEQ @dest_args_built
    JMP @exit_error
@dest_args_built:
    LDA CMD_TEMP_0
    STA CMD_ARG2_DRIVE
    LDY #$00
@copy_saved_name2_to_arg2_name_5:
    LDA CMD_SAVED_NAME2,Y
    STA CMD_ARG2_NAME,Y
    BEQ @copy_saved_name2_to_arg2_name_5_done
    INY
    JMP @copy_saved_name2_to_arg2_name_5
@copy_saved_name2_to_arg2_name_5_done:
    LDY #$00
@copy_saved_name1_to_arg1_name_5:
    LDA CMD_SAVED_NAME1,Y
    STA CMD_ARG1_NAME,Y
    BEQ @copy_saved_name1_to_arg1_name_5_done
    INY
    JMP @copy_saved_name1_to_arg1_name_5
@copy_saved_name1_to_arg1_name_5_done:
    LDY #$00
@copy_arg1_path_to_arg2_path_2:
    LDA CMD_ARG1_PATH,Y
    STA CMD_ARG2_PATH,Y
    BEQ @copy_arg1_path_to_arg2_path_2_done
    INY
    JMP @copy_arg1_path_to_arg2_path_2
@copy_arg1_path_to_arg2_path_2_done:
    LDY #$00
@copy_saved_path2_to_arg1_path_3:
    LDA CMD_SAVED_PATH2,Y
    STA CMD_ARG1_PATH,Y
    BEQ @copy_saved_path2_to_arg1_path_3_done
    INY
    JMP @copy_saved_path2_to_arg1_path_3
@copy_saved_path2_to_arg1_path_3_done:
    LDA CMD_ARG2_NAME
    BEQ @dest_name_from_source
    LDY #$00
@copy_arg2_name_to_copy_dst_name:
    LDA CMD_ARG2_NAME,Y
    STA CMD_COPY_DST_NAME,Y
    BEQ @copy_arg2_name_to_copy_dst_name_done
    INY
    JMP @copy_arg2_name_to_copy_dst_name
@copy_arg2_name_to_copy_dst_name_done:
    JMP @copy_copy_dst_name_to_input_text_done
@dest_name_from_source:
    LDY #$00
@copy_arg1_name_to_copy_dst_name:
    LDA CMD_ARG1_NAME,Y
    STA CMD_COPY_DST_NAME,Y
    BEQ @copy_arg1_name_to_copy_dst_name_done
    INY
    JMP @copy_arg1_name_to_copy_dst_name
@copy_arg1_name_to_copy_dst_name_done:
    LDY #$00
@copy_copy_dst_name_to_input_text:
    LDA CMD_COPY_DST_NAME,Y
    STA CMD_INPUT_TEXT,Y
    BEQ @copy_copy_dst_name_to_input_text_done
    INY
    JMP @copy_copy_dst_name_to_input_text
@copy_copy_dst_name_to_input_text_done:
    JSR CMD_DIR_PREPARE_SPEC
    BCC @dest_exists
    BNE @dest_check_failed
    JMP @copy_announce
@dest_exists:
    BEQ @dest_is_directory
    JMP @dest_file_exists
@dest_check_failed:
    JMP @exit_error
@dest_is_directory:
    LDA #$00
    STA LIB_GROUP
    PHA
    LDA #<CMD_COPY_SRC_PATH
    STA STR_PTR_LO
    LDA #>CMD_COPY_SRC_PATH
    STA STR_PTR_HI
    PLA
    JSR CALL_LIB_PRINT_STRING
    LDA CURSOR_COL
    CLC
    ADC LIB_STR_LEN
    STA CURSOR_COL
    LDA #$82
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JMP @file_done
@dest_file_exists:
    LDA CMD_SWITCH_FLAGS
    AND #$40
    BEQ @ask_overwrite
    JMP @copy_announce
@ask_overwrite:
    LDA #$00
    STA LIB_GROUP
    PHA
    LDA #<CMD_COPY_SRC_PATH
    STA STR_PTR_LO
    LDA #>CMD_COPY_SRC_PATH
    STA STR_PTR_HI
    PLA
    JSR CALL_LIB_PRINT_STRING
    JSR CMD_NEWLINE
@overwrite_prompt:
    LDA #$81
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
@overwrite_key:
    JSR GET_KEY_ASCII
    CMP #$20
    BCC @overwrite_key
    CMP #$7F
    BCS @overwrite_key
    JSR CMD_PUT_CHAR
    CMP #$59
    BEQ @do_copy
    CMP #$79
    BEQ @do_copy
    CMP #$4E
    BEQ @overwrite_no
    CMP #$6E
    BEQ @overwrite_no
    JSR CMD_NEWLINE
    JMP @overwrite_prompt
@overwrite_no:
    SEC
    LDA LIST_PTR_LO
    SBC #$01
    STA LIST_PTR_LO
    LDA LIST_PTR_HI
    SBC #$00
    STA LIST_PTR_HI
    JMP @file_done
@copy_announce:
    LDA #$00
    STA LIB_GROUP
    PHA
    LDA #<CMD_COPY_SRC_PATH
    STA STR_PTR_LO
    LDA #>CMD_COPY_SRC_PATH
    STA STR_PTR_HI
    PLA
    JSR CALL_LIB_PRINT_STRING
    JMP @do_copy
@do_copy:
    LDY #$00
@copy_copy_src_path_to_path_buffer:
    LDA CMD_COPY_SRC_PATH,Y
    STA PATH_BUFFER,Y
    BEQ @copy_copy_src_path_to_path_buffer_done
    INY
    JMP @copy_copy_src_path_to_path_buffer
@copy_copy_src_path_to_path_buffer_done:
    LDA CMD_ARG2_DRIVE
    JSR CMD_OUTBUF_PUT_CHAR
    LDA #$3A
    JSR CMD_OUTBUF_PUT_CHAR
    TXA
    PHA
    TYA
    PHA
    LDX #$00
@append_arg2_path_to_full_path_find_end:
    LDA CMD_FULL_PATH,X
    CMP #$00
    BEQ @append_arg2_path_to_full_path_start
    INX
    JMP @append_arg2_path_to_full_path_find_end
@append_arg2_path_to_full_path_start:
    LDY #$00
@append_arg2_path_to_full_path:
    LDA CMD_ARG2_PATH,Y
    STA CMD_FULL_PATH,X
    BNE @append_arg2_path_to_full_path_next
    PLA
    TAY
    PLA
    TAX
    JMP @append_arg2_path_to_full_path_done
@append_arg2_path_to_full_path_next:
    INX
    INY
    JMP @append_arg2_path_to_full_path
@append_arg2_path_to_full_path_done:
    TXA
    PHA
    TYA
    PHA
    LDX #$00
@append_copy_dst_name_to_full_path_find_end:
    LDA CMD_FULL_PATH,X
    CMP #$00
    BEQ @append_copy_dst_name_to_full_path_start
    INX
    JMP @append_copy_dst_name_to_full_path_find_end
@append_copy_dst_name_to_full_path_start:
    LDY #$00
@append_copy_dst_name_to_full_path:
    LDA CMD_COPY_DST_NAME,Y
    STA CMD_FULL_PATH,X
    BNE @append_copy_dst_name_to_full_path_next
    PLA
    TAY
    PLA
    TAX
    JMP @append_copy_dst_name_to_full_path_done
@append_copy_dst_name_to_full_path_next:
    INX
    INY
    JMP @append_copy_dst_name_to_full_path
@append_copy_dst_name_to_full_path_done:
    LDY #$00
@copy_full_path_to_tail:
    LDA CMD_FULL_PATH,Y
    STA CMD_TAIL,Y
    BEQ @copy_full_path_to_tail_done
    INY
    JMP @copy_full_path_to_tail
@copy_full_path_to_tail_done:
    LDA #$00
    STA CMD_FULL_PATH
    JSR COPY_RUN
    JSR CMD_CHECK_ERROR
    BCC @copy_ok
    JSR CALL_LIB_NEWLINE
@error_prompt:
    LDA #$01
    STA CURSOR_COL
    LDA #$83
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
@error_key:
    JSR CALL_GET_KEY_WAIT
    LDA KEY_ASCII
    CMP #$20
    BCC @error_key
    CMP #$7F
    BCS @error_key
    PHA
    JSR CMD_PUT_CHAR
    PLA
    CMP #$52
    BEQ @retry_choice
    CMP #$72
    BEQ @retry_choice
    CMP #$41
    BEQ @abort_choice
    CMP #$61
    BEQ @abort_choice
    CMP #$46
    BEQ @abort_choice
    CMP #$66
    BEQ @abort_choice
    JMP @error_prompt
@retry_choice:
    JSR CMD_NEWLINE
    JMP @next_file
@abort_choice:
    JMP @exit_error
@copy_ok:
    LDA FILE_ATTR
    BEQ @file_done
    INC CMD_MATCH_COUNT
@file_done:
    LDA CMD_TEMP_2
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_NEWLINE
    LDA LIST_PTR_LO
    ADC #$0B
    STA LIST_PTR_LO
    LDA LIST_PTR_HI
    ADC #$00
    STA LIST_PTR_HI
    JMP @next_file
@all_done:
    LDA CMD_TEMP_2
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$01
    STA ALLOC_COUNT
    LDA CMD_TEMP_1
    STA ALLOC_START
    LDA #$7E
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @print_count
    JMP @exit_error
@print_count:
    LDA CMD_MATCH_COUNT
    BEQ @no_files_message
    LDA CMD_MATCH_COUNT
    JSR CMD_PRINT_DEC_2DIGIT
    PHA
    LDA #<CMD_FULL_PATH
    STA STR_PTR_LO
    LDA #>CMD_FULL_PATH
    STA STR_PTR_HI
    PLA
    LDA #$00
    STA LIB_GROUP
    JSR CALL_LIB_PRINT_STRING
    LDA CURSOR_COL
    CLC
    ADC LIB_STR_LEN
    STA CURSOR_COL
    LDA #$80
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    LDA #$00
    STA CMD_FULL_PATH
    JSR CMD_NEWLINE
    JMP @exit_ok
@no_files_message:
    LDA #$7F
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JSR CMD_NEWLINE
@exit_error:
    LDA CMD_ARG1_DRIVE
    CMP CMD_ARG2_DRIVE
    BNE @error_other_drive
    SEC
    JMP @restore_saved_dir
@error_other_drive:
    SEC
    JMP @restore_root
@exit_ok:
    LDA CMD_ARG1_DRIVE
    CMP CMD_ARG2_DRIVE
    BNE @ok_other_drive
    CLC
    JMP @restore_saved_dir
@ok_other_drive:
    CLC
    JMP @restore_root
@restore_root:
    PHP
    LDY #$00
@copy_str_root_to_path_buffer_4:
    LDA CMD_STR_ROOT,Y
    STA PATH_BUFFER,Y
    BEQ @copy_str_root_to_path_buffer_4_done
    INY
    JMP @copy_str_root_to_path_buffer_4
@copy_str_root_to_path_buffer_4_done:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0B
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDY #$00
@copy_str_root_to_current_dir:
    LDA CMD_STR_ROOT,Y
    STA CMD_CURRENT_DIR,Y
    BEQ @copy_str_root_to_current_dir_done
    INY
    JMP @copy_str_root_to_current_dir
@copy_str_root_to_current_dir_done:
    JMP @copy_saved_path_to_current_dir_done
@restore_saved_dir:
    PHP
    LDY #$00
@copy_saved_path_to_path_buffer_3:
    LDA CMD_SAVED_PATH,Y
    STA PATH_BUFFER,Y
    BEQ @copy_saved_path_to_path_buffer_3_done
    INY
    JMP @copy_saved_path_to_path_buffer_3
@copy_saved_path_to_path_buffer_3_done:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0B
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDY #$00
@copy_saved_path_to_current_dir:
    LDA CMD_SAVED_PATH,Y
    STA CMD_CURRENT_DIR,Y
    BEQ @copy_saved_path_to_current_dir_done
    INY
    JMP @copy_saved_path_to_current_dir
@copy_saved_path_to_current_dir_done:
    JSR CMD_NEWLINE
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    PLP
    RTS
@wildcard_with_name_error:
    LDA #$7E
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JSR CMD_NEWLINE
    JMP @exit_error
; 作用：COPY 命令对一个文件的入口：打开源文件与目的文件（COPY_OPEN_SOURCE），分配复制缓冲（COPY_ALLOC_BUFFER），循环读写（COPY_LOOP），成功后释放缓冲页（$7E/$01）；失败时转 COPY_FAIL_CLEANUP 或 COPY_FAIL_FREE_BUFFER 收尾。
; 输入：PATH_BUFFER=源路径，CMD_TAIL=目的路径。
; 输出：C=0 成功，C=1 失败（DOS_ERROR 为出错码）。
; 调用者：CMD_COPY_IMPL
COPY_RUN:
    JSR COPY_OPEN_SOURCE
    BCC @opened
    RTS
@opened:
    JSR COPY_ALLOC_BUFFER
    BCC @buffer_allocated
    JMP COPY_FAIL_CLEANUP
@buffer_allocated:
    JSR COPY_LOOP
    BCC @copied
    JMP COPY_FAIL_FREE_BUFFER
@copied:
    LDA #$7E
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    CLC
    RTS
; 作用：COPY 打开源文件与目的文件：取源与目的驱动器字母（COPY_SRC_DRIVE、COPY_DST_DRIVE），必要时提示换盘（COPY_PROMPT_SOURCE_DISK、COPY_PROMPT_DEST_DISK）；以方式 0 打开源（$7B/$09），记下句柄与卷序列号，取文件信息与大小（$7C/$0D），大小为 0 时 FILE_ATTR 清 0 并关闭源返回失败；以方式 1 创建目的文件，记下句柄与卷序列号，再经 $7B/$0C 处理目的。
; 输出：C=0 成功，C=1 失败（DOS_ERROR 为出错码，已按需关闭文件）。
; 调用者：COPY_RUN
COPY_OPEN_SOURCE:
    LDA PATH_BUFFER
    STA COPY_SRC_DRIVE
    LDA CMD_TAIL
    STA COPY_DST_DRIVE
    JSR COPY_PROMPT_SOURCE_DISK
    LDA FS_DRIVE_LETTER
    STA FS_SAVED_DRIVE_LETTER
    LDA #$00
    STA FILE_MODE
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$09
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA FS_SAVED_DRIVE_LETTER
    STA FS_DRIVE_LETTER
    LDA DOS_ERROR
    BEQ @source_opened
    JMP COPY_RETURN_SET
@source_opened:
    LDA FILE_HANDLE_OFFSET
    STA COPY_SRC_HANDLE
    JSR COPY_SAVE_SRC_SERIAL
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$0D
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$01
    STA FILE_ATTR
    LDA FILE_SIZE_0
    ORA FILE_SIZE_1
    ORA FILE_SIZE_2
    BNE @source_nonempty
    LDA #$00
    STA FILE_ATTR
    JMP COPY_FAIL_CLOSE_SOURCE
@source_nonempty:
    JSR COPY_PROMPT_DEST_DISK
    JSR COPY_CMDTAIL_TO_PATH
    LDA FS_DRIVE_LETTER
    STA FS_SAVED_DRIVE_LETTER
    LDA #$01
    STA FILE_MODE
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$09
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA FS_SAVED_DRIVE_LETTER
    STA FS_DRIVE_LETTER
    LDA DOS_ERROR
    BEQ @dest_opened
    JMP COPY_FAIL_CLOSE_SOURCE
@dest_opened:
    LDA FILE_HANDLE_OFFSET
    STA COPY_DST_HANDLE
    JSR COPY_SAVE_DST_SERIAL
    LDA FS_DRIVE_LETTER
    STA FS_SAVED_DRIVE_LETTER
    LDA COPY_DST_DRIVE
    STA FS_DRIVE_LETTER
    STA FILE_DRIVE_LETTER
    JSR CMD_CHECK_DRIVE_LETTER
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0C
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA FS_SAVED_DRIVE_LETTER
    STA FS_DRIVE_LETTER
    LDA DOS_ERROR
    BEQ @return_clear
    JMP COPY_FAIL_CLOSE_DEST
@return_clear:
    CLC
    RTS
; 作用：复制出错：保留 DOS_ERROR，释放缓冲页（功能 $7E 子功能 1），接着进入 COPY_FAIL_CLEANUP
; 调用者：COPY_RUN
COPY_FAIL_FREE_BUFFER:
    LDA DOS_ERROR
    PHA
    LDA #$7E
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    PLA
    STA DOS_ERROR
; 作用：出错收尾：先让用户换回目的盘（COPY_WAIT_DEST_DISK），接着进入 COPY_FAIL_CLOSE_DEST
; 调用者：COPY_RUN、COPY_FAIL_FREE_BUFFER（顺序执行到这里）
COPY_FAIL_CLEANUP:
    JSR COPY_WAIT_DEST_DISK
; 作用：保留 DOS_ERROR：关闭目标文件，再把命令行里的目标路径（COPY_CMDTAIL_TO_PATH）以方式 3（删除，见 系统调用手册 4.2）打开并关闭，删掉复制失败时留下的目标文件，接着进入 COPY_FAIL_CLOSE_SOURCE
; 调用者：COPY_OPEN_SOURCE、COPY_FAIL_CLEANUP（顺序执行到这里）
COPY_FAIL_CLOSE_DEST:
    LDA DOS_ERROR
    PHA
    LDA COPY_DST_HANDLE
    STA FILE_HANDLE_OFFSET
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0A
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR COPY_CMDTAIL_TO_PATH
    LDA #$03
    STA FILE_MODE
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$09
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0A
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    PLA
    STA DOS_ERROR
; 作用：保留 DOS_ERROR：关闭源文件（句柄在 COPY_SRC_HANDLE），接着 C=1 返回
; 调用者：COPY_OPEN_SOURCE、COPY_FAIL_CLOSE_DEST（顺序执行到这里）
COPY_FAIL_CLOSE_SOURCE:
    LDA DOS_ERROR
    PHA
    LDA COPY_SRC_HANDLE
    STA FILE_HANDLE_OFFSET
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0A
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    PLA
    STA DOS_ERROR
; 作用：C=1 返回
; 调用者：COPY_OPEN_SOURCE、COPY_FAIL_CLOSE_SOURCE（顺序执行到这里）
COPY_RETURN_SET:
    SEC
    RTS
; 作用：COPY 主循环：取源与目的的簇，剩余扇区数（COPY_SECTORS_LEFT）不为 0 就按块读、写
; 输出：C=0 全部复制完，C=1 读或写出错。
; 调用者：COPY_RUN
COPY_LOOP:
    JSR COPY_LOAD_CLUSTERS
@loop:
    LDA COPY_SECTORS_LEFT_LO
    ORA COPY_SECTORS_LEFT_HI
    BEQ @return_clear
    JSR COPY_PLAN_CHUNK
    JSR COPY_READ_CHUNK
    BCC @read_ok
    RTS
@read_ok:
    JSR COPY_WRITE_CHUNK
    BCC @write_ok
    RTS
@write_ok:
    JMP @loop
@return_clear:
    CLC
    RTS
; 作用：COPY 从源盘读一块：先等源盘就位（COPY_WAIT_SOURCE_DISK），DISK_PAGE 取 ALLOC_START，源簇号与簇数放入 FS_CLUSTER、FS_CLUSTER_COUNT，经 $7B/$0E 成批读；还有剩余扇区时记下下一簇（FS_FAT_VALUE），没有剩余时关闭源文件（$7C/$08、$0A、$0C 与 $7B/$0A）。
; 输出：C=0 成功，C=1 出错（DOS_ERROR）。
; 调用者：COPY_LOOP
COPY_READ_CHUNK:
    JSR COPY_WAIT_SOURCE_DISK
    LDA ALLOC_START
    STA DISK_PAGE
    LDA #$00
    STA DISK_PAGE_SECTOR
    LDA COPY_SRC_CLUSTER_LO
    STA FS_CLUSTER_LO
    LDA COPY_SRC_CLUSTER_HI
    STA FS_CLUSTER_HI
    LDA COPY_SRC_CLUSTERS_LO
    STA FS_CLUSTER_COUNT_LO
    LDA COPY_SRC_CLUSTERS_HI
    STA FS_CLUSTER_COUNT_HI
    LDA COPY_SECTORS_LEFT_LO
    ORA COPY_SECTORS_LEFT_HI
    BEQ @more_left
    LDA #$00
    ORA #$08
    JMP @set_flags
@more_left:
    LDA #$00
@set_flags:
    STA FS_IO_FLAGS
    LDA FS_DRIVE_LETTER
    STA FS_SAVED_DRIVE_LETTER
    LDA COPY_SRC_DRIVE
    STA FS_DRIVE_LETTER
    STA FILE_DRIVE_LETTER
    JSR CMD_CHECK_DRIVE_LETTER
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0E
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BEQ @read_ok
    LDA FS_SAVED_DRIVE_LETTER
    STA FS_DRIVE_LETTER
    SEC
    RTS
@read_ok:
    LDA FS_SAVED_DRIVE_LETTER
    STA FS_DRIVE_LETTER
    LDA COPY_SECTORS_LEFT_LO
    ORA COPY_SECTORS_LEFT_HI
    BEQ @finish_source
    LDA FS_FAT_VALUE_LO
    STA COPY_SRC_CLUSTER_LO
    LDA FS_FAT_VALUE_HI
    STA COPY_SRC_CLUSTER_HI
    CLC
    RTS
@finish_source:
    LDA COPY_SRC_HANDLE
    STA FILE_HANDLE_OFFSET
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$08
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$0A
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$0C
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0A
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BEQ @return_clear
    SEC
    RTS
@return_clear:
    CLC
    RTS
; 作用：COPY 向目的盘写一块：同 COPY_READ_CHUNK，FS_IO_FLAGS 位 7 置位表示写；没有剩余扇区时把文件大小写入目的句柄（FH_SIZE_0 至 FH_SIZE_2）并关闭目的文件。
; 输出：C=0 成功，C=1 出错（DOS_ERROR）。
; 调用者：COPY_LOOP
COPY_WRITE_CHUNK:
    JSR COPY_WAIT_DEST_DISK
    LDA ALLOC_START
    STA DISK_PAGE
    LDA #$00
    STA DISK_PAGE_SECTOR
    LDA COPY_DST_CLUSTER_LO
    STA FS_CLUSTER_LO
    LDA COPY_DST_CLUSTER_HI
    STA FS_CLUSTER_HI
    LDA COPY_DST_CLUSTERS_LO
    STA FS_CLUSTER_COUNT_LO
    LDA COPY_DST_CLUSTERS_HI
    STA FS_CLUSTER_COUNT_HI
    LDA COPY_SECTORS_LEFT_LO
    ORA COPY_SECTORS_LEFT_HI
    BEQ @more_left
    LDA #$00
    ORA #$08
    JMP @set_flags
@more_left:
    LDA #$00
@set_flags:
    ORA #$80
    STA FS_IO_FLAGS
    LDA FS_DRIVE_LETTER
    STA FS_SAVED_DRIVE_LETTER
    LDA COPY_DST_DRIVE
    STA FS_DRIVE_LETTER
    STA FILE_DRIVE_LETTER
    JSR CMD_CHECK_DRIVE_LETTER
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0E
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BEQ @write_ok
    LDA FS_SAVED_DRIVE_LETTER
    STA FS_DRIVE_LETTER
    SEC
    RTS
@write_ok:
    LDA FS_SAVED_DRIVE_LETTER
    STA FS_DRIVE_LETTER
    LDA COPY_SECTORS_LEFT_LO
    ORA COPY_SECTORS_LEFT_HI
    BEQ @finish_dest
    LDA FS_FAT_VALUE_LO
    STA COPY_DST_CLUSTER_LO
    LDA FS_FAT_VALUE_HI
    STA COPY_DST_CLUSTER_HI
    CLC
    RTS
@finish_dest:
    LDA COPY_DST_HANDLE
    STA FILE_HANDLE_OFFSET
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$09
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$0B
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA FILE_HANDLE_OFFSET
    STA FS_ACTIVE_HANDLE
    LDX FS_ACTIVE_HANDLE
    LDA FILE_SIZE_0
    STA FH_SIZE_0,X
    LDA FILE_SIZE_1
    STA FH_SIZE_1,X
    LDA FILE_SIZE_2
    STA FH_SIZE_2,X
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0A
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BEQ @return_clear
    SEC
    RTS
@return_clear:
    CLC
    RTS
; 作用：取源句柄与目的句柄的起始簇，放 COPY_SRC_CLUSTER 与 COPY_DST_CLUSTER
; 调用者：COPY_LOOP
COPY_LOAD_CLUSTERS:
    LDA COPY_SRC_HANDLE
    STA FILE_HANDLE_OFFSET
    LDA FILE_HANDLE_OFFSET
    STA FS_ACTIVE_HANDLE
    LDX FS_ACTIVE_HANDLE
    LDA FH_CLUSTER_LO,X
    STA COPY_SRC_CLUSTER_LO
    LDA FH_CLUSTER_HI,X
    STA COPY_SRC_CLUSTER_HI
    LDA COPY_DST_HANDLE
    STA FILE_HANDLE_OFFSET
    LDA FILE_HANDLE_OFFSET
    STA FS_ACTIVE_HANDLE
    LDX FS_ACTIVE_HANDLE
    LDA FH_CLUSTER_LO,X
    STA COPY_DST_CLUSTER_LO
    LDA FH_CLUSTER_HI,X
    STA COPY_DST_CLUSTER_HI
    RTS
; 作用：按缓冲能放的扇区数（COPY_BUFFER_UNITS 乘 8）决定本次要复制的扇区数（不超过 COPY_SECTORS_LEFT），从剩余扇区数里扣除，再按源盘与目的盘各自的每簇扇区数换算成簇数 COPY_SRC_CLUSTERS、COPY_DST_CLUSTERS。
; 输入：COPY_BUFFER_UNITS、COPY_SECTORS_LEFT_LO/HI、COPY_SRC_DRIVE、COPY_DST_DRIVE。
; 输出：COPY_SRC_CLUSTERS_LO/HI、COPY_DST_CLUSTERS_LO/HI，COPY_SECTORS_LEFT 已扣除。
; 调用者：COPY_LOOP
COPY_PLAN_CHUNK:
    LDA COPY_BUFFER_UNITS
    STA SIZE_BYTES_0
    LDA #$00
    STA SIZE_BYTES_1
    ASL SIZE_BYTES_0
    ROL SIZE_BYTES_1
    ASL SIZE_BYTES_0
    ROL SIZE_BYTES_1
    ASL SIZE_BYTES_0
    ROL SIZE_BYTES_1
    SEC
    LDA SIZE_BYTES_0
    SBC COPY_SECTORS_LEFT_LO
    LDA SIZE_BYTES_1
    SBC COPY_SECTORS_LEFT_HI
    BCS @last_chunk
    LDA SIZE_BYTES_0
    STA SIZE_BYTES_2
    LDA SIZE_BYTES_1
    STA SIZE_SECTORS_LO
    SEC
    LDA COPY_SECTORS_LEFT_LO
    SBC SIZE_BYTES_0
    STA COPY_SECTORS_LEFT_LO
    LDA COPY_SECTORS_LEFT_HI
    SBC SIZE_BYTES_1
    STA COPY_SECTORS_LEFT_HI
    JMP @src_units
@last_chunk:
    LDA COPY_SECTORS_LEFT_LO
    STA SIZE_BYTES_2
    LDA COPY_SECTORS_LEFT_HI
    STA SIZE_SECTORS_LO
    LDA #$00
    STA COPY_SECTORS_LEFT_LO
    STA COPY_SECTORS_LEFT_HI
@src_units:
    LDA SIZE_BYTES_2
    STA COPY_SRC_CLUSTERS_LO
    LDA SIZE_SECTORS_LO
    STA COPY_SRC_CLUSTERS_HI
    LDA COPY_SRC_DRIVE
    STA FILE_DRIVE_LETTER
    JSR CMD_CHECK_DRIVE_LETTER
    LDX FS_DRIVE_PARAM_OFFSET
    LDA FS_SECTORS_PER_CLUSTER,X
    SEC
    SBC #$01
    CLC
    ADC COPY_SRC_CLUSTERS_LO
    STA COPY_SRC_CLUSTERS_LO
    LDA COPY_SRC_CLUSTERS_HI
    ADC #$00
    STA COPY_SRC_CLUSTERS_HI
    LDA FS_CLUSTER_SHIFT_BITS,X
@loop:
    BEQ @dst_units
    TAY
    LSR COPY_SRC_CLUSTERS_HI
    ROR COPY_SRC_CLUSTERS_LO
    DEY
    TYA
    JMP @loop
@dst_units:
    LDA SIZE_BYTES_2
    STA COPY_DST_CLUSTERS_LO
    LDA SIZE_SECTORS_LO
    STA COPY_DST_CLUSTERS_HI
    LDA COPY_DST_DRIVE
    STA FILE_DRIVE_LETTER
    JSR CMD_CHECK_DRIVE_LETTER
    LDX FS_DRIVE_PARAM_OFFSET
    LDA FS_SECTORS_PER_CLUSTER,X
    SEC
    SBC #$01
    CLC
    ADC COPY_DST_CLUSTERS_LO
    STA COPY_DST_CLUSTERS_LO
    LDA COPY_DST_CLUSTERS_HI
    ADC #$00
    STA COPY_DST_CLUSTERS_HI
    LDA FS_CLUSTER_SHIFT_BITS,X
@shift_dst:
    BEQ @return
    TAY
    LSR COPY_DST_CLUSTERS_HI
    ROR COPY_DST_CLUSTERS_LO
    DEY
    TYA
    JMP @shift_dst
@return:
    RTS
; 作用：调用 $7E/$02 取得可用的缓冲页数；没有可用页时 DOS_ERROR=8、C=1；否则按源文件大小（COPY_SIZE_UNITS）算出要复制的扇区数 COPY_SECTORS_LEFT，缓冲页数不超过文件需要的页数，再经 $7E/$00 分配。
; 输入：FILE_SIZE_0 至 FILE_SIZE_2。
; 输出：C=0 成功（COPY_BUFFER_UNITS=分配页数，COPY_SECTORS_LEFT），C=1 失败。
; 调用者：COPY_RUN
COPY_ALLOC_BUFFER:
    LDA #$7E
    STA SYS_FUNCTION
    LDA #$02
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA ALLOC_COUNT
    BNE @got_buffer
    LDA #$08
    STA DOS_ERROR
    SEC
    RTS
@got_buffer:
    STA COPY_BUFFER_UNITS
    LDA FILE_SIZE_0
    STA SIZE_BYTES_0
    LDA FILE_SIZE_1
    STA SIZE_BYTES_1
    LDA FILE_SIZE_2
    STA SIZE_BYTES_2
    JSR COPY_SIZE_UNITS
    LDA SIZE_SECTORS_LO
    STA COPY_SECTORS_LEFT_LO
    LDA SIZE_SECTORS_HI
    STA COPY_SECTORS_LEFT_HI
    SEC
    LDA COPY_BUFFER_UNITS
    SBC SIZE_PAGES_LO
    LDA #$00
    SBC SIZE_PAGES_HI
    BCS @limit_to_size
    JMP @alloc_pages
@limit_to_size:
    LDA SIZE_PAGES_LO
    STA COPY_BUFFER_UNITS
@alloc_pages:
    LDA COPY_BUFFER_UNITS
    STA ALLOC_COUNT
    LDA #$7E
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    CLC
    RTS
; 作用：把 SIZE_BYTES_0 至 SIZE_BYTES_2 的字节数换算成扇区数 SIZE_SECTORS（每 512 字节一个，不足进 1）与页数 SIZE_PAGES（每 8 个扇区一页，不足进 1）（与 FS_SIZE_TO_UNITS 同算法）。
; 输入：SIZE_BYTES_0 至 SIZE_BYTES_2。
; 输出：SIZE_SECTORS_LO/HI、SIZE_PAGES_LO/HI，C=0。
; 调用者：COPY_ALLOC_BUFFER
COPY_SIZE_UNITS:
    LDA SIZE_BYTES_2
    LSR A
    STA SIZE_SECTORS_HI
    LDA SIZE_BYTES_1
    ROR A
    STA SIZE_SECTORS_LO
    LDA SIZE_BYTES_1
    AND #$01
    ORA SIZE_BYTES_0
    BEQ @sectors_done
    CLC
    LDA SIZE_SECTORS_LO
    ADC #$01
    STA SIZE_SECTORS_LO
    LDA SIZE_SECTORS_HI
    ADC #$00
    STA SIZE_SECTORS_HI
@sectors_done:
    LDA SIZE_SECTORS_LO
    STA SIZE_PAGES_LO
    LDA SIZE_SECTORS_HI
    STA SIZE_PAGES_HI
    LSR SIZE_PAGES_HI
    ROR SIZE_PAGES_LO
    LSR SIZE_PAGES_HI
    ROR SIZE_PAGES_LO
    LSR SIZE_PAGES_HI
    ROR SIZE_PAGES_LO
    LDA SIZE_SECTORS_LO
    AND #$07
    BEQ @return_clear
    CLC
    LDA SIZE_PAGES_LO
    ADC #$01
    STA SIZE_PAGES_LO
    LDA SIZE_PAGES_HI
    ADC #$00
    STA SIZE_PAGES_HI
@return_clear:
    CLC
    RTS
; 作用：FILE_DRIVE_LETTER 里的驱动器字母必须是 A 或 B（大小写均可），否则 DOS_ERROR=$0F、C=1；A 盘 FS_DRIVE_PARAM_OFFSET=0，B 盘为 $19。
; 输入：FILE_DRIVE_LETTER。
; 输出：C=0 合法（FS_DRIVE_PARAM_OFFSET），C=1 不合法。
; 调用者：COPY_OPEN_SOURCE、COPY_READ_CHUNK、COPY_WRITE_CHUNK、COPY_PLAN_CHUNK、COPY_CHECK_SRC_SERIAL、COPY_CHECK_DST_SERIAL、COPY_SAVE_SRC_SERIAL、COPY_SAVE_DST_SERIAL
CMD_CHECK_DRIVE_LETTER:
    LDA FILE_DRIVE_LETTER
    CMP #$41
    BEQ @drive_a
    CMP #$61
    BEQ @drive_a
    CMP #$42
    BEQ @drive_b
    CMP #$62
    BEQ @drive_b
    LDA #$0F
    STA DOS_ERROR
    SEC
    RTS
@drive_a:
    LDA #$00
    STA FS_DRIVE_PARAM_OFFSET
    CLC
    RTS
@drive_b:
    LDA #$19
    STA FS_DRIVE_PARAM_OFFSET
    CLC
    RTS
; 作用：把 CMD_TAIL 前 $1D 字节复制到 PATH_BUFFER
; 调用者：COPY_OPEN_SOURCE、COPY_FAIL_CLOSE_DEST
COPY_CMDTAIL_TO_PATH:
    LDY #$00
@loop:
    CPY #$1D
    BEQ @return
    LDA CMD_TAIL,Y
    STA PATH_BUFFER,Y
    INY
    JMP @loop
@return:
    RTS
; 作用：比较源盘卷序列号（COPY_SRC_SERIAL，4 字节）与当前盘的 FS_VOLUME_SERIAL（按驱动器偏移 X 取），相同 C=0
; 调用者：COPY_WAIT_SOURCE_DISK
COPY_CHECK_SRC_SERIAL:
    LDA COPY_SRC_DRIVE
    STA FILE_DRIVE_LETTER
    JSR CMD_CHECK_DRIVE_LETTER
    LDX FS_DRIVE_PARAM_OFFSET
    LDY #$00
@loop:
    CPY #$04
    BEQ @return_clear
    LDA COPY_SRC_SERIAL,Y
    CMP FS_VOLUME_SERIAL,X
    BNE @return_set
    INX
    INY
    JMP @loop
@return_clear:
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：比较目的盘卷序列号（COPY_DST_SERIAL，4 字节）与当前盘的 FS_VOLUME_SERIAL（按驱动器偏移 X 取），相同 C=0
; 调用者：COPY_ASK_DEST_DISK
COPY_CHECK_DST_SERIAL:
    LDA COPY_DST_DRIVE
    STA FILE_DRIVE_LETTER
    JSR CMD_CHECK_DRIVE_LETTER
    LDX FS_DRIVE_PARAM_OFFSET
    LDY #$00
@loop:
    CPY #$04
    BEQ @return_clear
    LDA COPY_DST_SERIAL,Y
    CMP FS_VOLUME_SERIAL,X
    BNE @return_set
    INX
    INY
    JMP @loop
@return_clear:
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：记下源盘卷序列号到 COPY_SRC_SERIAL（4 字节）
; 调用者：COPY_OPEN_SOURCE
COPY_SAVE_SRC_SERIAL:
    LDA COPY_SRC_DRIVE
    STA FILE_DRIVE_LETTER
    JSR CMD_CHECK_DRIVE_LETTER
    LDX FS_DRIVE_PARAM_OFFSET
    LDY #$00
@loop:
    CPY #$04
    BEQ @return_clear
    LDA FS_VOLUME_SERIAL,X
    STA COPY_SRC_SERIAL,Y
    INX
    INY
    JMP @loop
@return_clear:
    CLC
    RTS
; 作用：记下目的盘卷序列号到 COPY_DST_SERIAL（4 字节）
; 调用者：COPY_OPEN_SOURCE
COPY_SAVE_DST_SERIAL:
    LDA COPY_DST_DRIVE
    STA FILE_DRIVE_LETTER
    JSR CMD_CHECK_DRIVE_LETTER
    LDX FS_DRIVE_PARAM_OFFSET
    LDY #$00
@loop:
    CPY #$04
    BEQ @return_clear
    LDA FS_VOLUME_SERIAL,X
    STA COPY_DST_SERIAL,Y
    INX
    INY
    JMP @loop
@return_clear:
    CLC
    RTS
; 作用：源与目的驱动器字母不同时，显示消息 $46、源盘符与“:”，再显示消息 $3C 并等键（提示放入源盘）；相同则直接返回。
; 输入：COPY_SRC_DRIVE、COPY_DST_DRIVE。
; 调用者：COPY_OPEN_SOURCE、COPY_WAIT_SOURCE_DISK
COPY_PROMPT_SOURCE_DISK:
    LDA COPY_DST_DRIVE
    CMP COPY_SRC_DRIVE
    BEQ @return
    JSR CALL_LIB_NEWLINE
    LDA #$01
    STA CURSOR_COL
    LDA #$46
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    LDA COPY_SRC_DRIVE
    JSR CMD_PUT_CHAR
    LDA #$3A
    JSR CMD_PUT_CHAR
    JSR CALL_LIB_NEWLINE
    LDA #$01
    STA CURSOR_COL
    LDA #$3C
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JSR CALL_LIB_NEWLINE
    JSR CALL_GET_KEY_WAIT
@return:
    RTS
; 作用：与 COPY_PROMPT_SOURCE_DISK 对称：源与目的驱动器字母不同时，显示消息 $48、目的盘符与“:”，再显示消息 $3C 并等键（提示放入目的盘）；相同则直接返回。
; 输入：COPY_SRC_DRIVE、COPY_DST_DRIVE。
; 调用者：COPY_OPEN_SOURCE、COPY_ASK_DEST_DISK
COPY_PROMPT_DEST_DISK:
    LDA COPY_SRC_DRIVE
    CMP COPY_DST_DRIVE
    BEQ @return
    LDA #$01
    STA CURSOR_COL
    LDA #$48
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    LDA COPY_DST_DRIVE
    JSR CMD_PUT_CHAR
    LDA #$3A
    JSR CMD_PUT_CHAR
    JSR CALL_LIB_NEWLINE
    LDA #$01
    STA CURSOR_COL
    LDA #$3C
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JSR CALL_GET_KEY_WAIT
@return:
    RTS
; 作用：等源盘就位：源与目的驱动器相同时直接返回；否则反复提示放入源盘并检测（$7C/$0E），卷序列号与记录一致才返回；检测出错则显示出错信息后转 COPY_ASK_DEST_DISK（原程序如此）。
; 输入：COPY_SRC_DRIVE、COPY_DST_DRIVE、COPY_SRC_SERIAL。
; 调用者：COPY_READ_CHUNK
COPY_WAIT_SOURCE_DISK:
    LDA COPY_SRC_DRIVE
    CMP COPY_DST_DRIVE
    BNE @loop
    JMP @return
@loop:
    JSR COPY_PROMPT_SOURCE_DISK
    LDA COPY_SRC_DRIVE
    STA FILE_DRIVE_LETTER
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$0E
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BEQ @check_serial
    JSR COPY_SHOW_ERROR
    JMP COPY_ASK_DEST_DISK
@check_serial:
    JSR COPY_CHECK_SRC_SERIAL
    BCC @return
    JMP @loop
@return:
    RTS
; 作用：等目的盘就位：源与目的驱动器相同时直接返回；否则转 COPY_ASK_DEST_DISK 提示并核对。
; 调用者：COPY_FAIL_CLEANUP、COPY_WRITE_CHUNK
COPY_WAIT_DEST_DISK:
    LDA COPY_SRC_DRIVE
    CMP COPY_DST_DRIVE
    BNE COPY_ASK_DEST_DISK
    JMP COPY_WAIT_DEST_RETURN
; 作用：提示插入目的盘，用功能 $7C 子功能 $0E 读盘并核对序列号，出错或不符就重复提示
; 输入：COPY_DST_DRIVE、COPY_DST_SERIAL。
; 调用者：COPY_WAIT_SOURCE_DISK、COPY_WAIT_DEST_DISK、COPY_ASK_DEST_DISK
COPY_ASK_DEST_DISK:
    JSR COPY_PROMPT_DEST_DISK
    LDA COPY_DST_DRIVE
    STA FILE_DRIVE_LETTER
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$0E
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DOS_ERROR
    BEQ @check_serial
    JSR COPY_SHOW_ERROR
    JMP COPY_ASK_DEST_DISK
@check_serial:
    JSR COPY_CHECK_DST_SERIAL
    BCC COPY_WAIT_DEST_RETURN
    JMP COPY_ASK_DEST_DISK
; 作用：COPY_WAIT_DEST_DISK 的返回（RTS）
; 调用者：COPY_WAIT_DEST_DISK、COPY_ASK_DEST_DISK
COPY_WAIT_DEST_RETURN:
    RTS
; 作用：光标回第 1 列，经 JSR 到 LIB_TEMP_STR（$6312）处的扩展 RAM 运行库代码按 DOS_ERROR（经 LIB_GROUP 传入）显示出错消息，然后换行并让光标回第 1 列。
; 输入：DOS_ERROR。
; 调用者：COPY_WAIT_SOURCE_DISK、COPY_ASK_DEST_DISK
COPY_SHOW_ERROR:
    LDA #$01
    STA CURSOR_COL
    LDA DOS_ERROR
    STA LIB_GROUP
    JSR LIB_TEMP_STR
    JSR CALL_LIB_NEWLINE
    LDA #$01
    STA CURSOR_COL
    RTS
