; 作用：DEL 命令的实现（页组 $60，序号 2）：解析命令行；开关位 0 打开时显示帮助消息 $77；检查当前盘（$7C/$0E）并记下当前目录；驱动器只能是空、A、B，必须给出文件名；把“.”改成“*.*”、“..”改成上一级目录；检查非法字符；用 CALL_CMD_BUILD_PATH 切到文件所在目录；名称是目录时改为删除该目录下的“*.*”；名称是“*.*”时先询问确认（消息 $7A，Y/N）；逐个读目录项，与通配名称匹配、不是卷标隐藏系统项、不是只读也不是子目录的文件，开关位 1 打开时逐个询问（消息 $78），用 $7B/$12 删除并累计 CMD_MATCH_COUNT；最后显示删除的个数或“没有文件”（消息 $7B），恢复原来的当前目录并让软驱停转。
; 输出：C=0 成功，C=1 失败。
; 调用者：CMD_GROUP60_TABLE（地址表）
CMD_DEL_IMPL:
    JSR CALL_CMD_PARSE_PATH_ARG
    JSR CMD_CHECK_ERROR
    BCC @args_ok
@loop:
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
    LDA #$00
    STA CMD_FULL_PATH
    STA CMD_MATCH_COUNT
    LDA CMD_SWITCH_FLAGS
    AND #$01
    BEQ @not_help
    LDA #$77
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    CLC
    RTS
@not_help:
    LDA FS_DRIVE_LETTER
    STA FILE_DRIVE_LETTER
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$0E
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @disk_ok
    JMP @loop
@disk_ok:
    LDA #$7D
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
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
    LDA CMD_ARG1_DRIVE
    CMP #$00
    BEQ @drive_ok
    LDA CMD_ARG1_DRIVE
    CMP #$41
    BEQ @drive_ok
    LDA CMD_ARG1_DRIVE
    CMP #$42
    BEQ @drive_ok
@invalid_args:
    LDA #$25
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    SEC
    JMP @fail
@drive_ok:
    LDA CMD_ARG2_DRIVE
    ORA CMD_ARG2_PATH
    ORA CMD_ARG2_NAME
    BNE @invalid_args
    LDY #$00
    LDA CMD_ARG1_NAME,Y
    BEQ @invalid_args
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
    JMP @check_chars
@dot_to_all:
    LDY #$00
@copy_str_all_files_to_arg1_name:
    LDA CMD_STR_ALL_FILES,Y
    STA CMD_ARG1_NAME,Y
    BEQ @copy_str_all_files_to_arg1_name_done
    INY
    JMP @copy_str_all_files_to_arg1_name
@copy_str_all_files_to_arg1_name_done:
    JMP @check_chars
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
    JMP @check_chars
@invalid_jump:
    JMP @invalid_args
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
    BCS @invalid_jump
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
    BCS @invalid_jump
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
@copy_arg1_name_to_input_text:
    LDA CMD_ARG1_NAME,Y
    STA CMD_INPUT_TEXT,Y
    BEQ @copy_arg1_name_to_input_text_done
    INY
    JMP @copy_arg1_name_to_input_text
@copy_arg1_name_to_input_text_done:
    JSR CMD_DIR_PREPARE_SPEC
    BCC @lookup_found
    BNE @fail_jump
    JSR CMD_NEWLINE
    LDA #$8A
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JSR CMD_NEWLINE
@fail_jump:
    JMP @fail
@lookup_found:
    BNE @copy_str_all_files_to_arg1_name_3_done
    LDY #$00
@copy_arg1_path_to_full_path_2:
    LDA CMD_ARG1_PATH,Y
    STA CMD_FULL_PATH,Y
    BEQ @copy_arg1_path_to_full_path_2_done
    INY
    JMP @copy_arg1_path_to_full_path_2
@copy_arg1_path_to_full_path_2_done:
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
    JSR CMD_OUTBUF_PUT_CHAR
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
@copy_str_all_files_to_arg1_name_3:
    LDA CMD_STR_ALL_FILES,Y
    STA CMD_ARG1_NAME,Y
    BEQ @copy_str_all_files_to_arg1_name_3_done
    INY
    JMP @copy_str_all_files_to_arg1_name_3
@copy_str_all_files_to_arg1_name_3_done:
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
    BCC @dir_selected
    JMP @fail
@dir_selected:
    TXA
    PHA
    LDX #$00
@cmp_arg1_name_str_all_files:
    LDA CMD_ARG1_NAME,X
    STA CMD_CHAR_TEMP
    BEQ @cmp_arg1_name_str_all_files_tail
    LDA CMD_STR_ALL_FILES,X
    BEQ @cmp_arg1_name_str_all_files_differ
    CMP CMD_CHAR_TEMP
    BNE @cmp_arg1_name_str_all_files_differ
    INX
    JMP @cmp_arg1_name_str_all_files
@cmp_arg1_name_str_all_files_tail:
    LDA CMD_STR_ALL_FILES,X
    CMP CMD_CHAR_TEMP
    BEQ @cmp_arg1_name_str_all_files_equal
@cmp_arg1_name_str_all_files_differ:
    PLA
    TAX
    LDA #$01
    JMP @cmp_arg1_name_str_all_files_result
@cmp_arg1_name_str_all_files_equal:
    PLA
    TAX
    LDA #$00
    JMP @cmp_arg1_name_str_all_files_result
@cmp_arg1_name_str_all_files_result:
    BEQ @confirm_prompt
    JMP @start_delete
@confirm_prompt:
    LDA #$7A
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
@confirm_key:
    JSR GET_KEY_ASCII
    CMP #$20
    BCC @confirm_key
    CMP #$7F
    BCS @confirm_key
    JSR CMD_PUT_CHAR
    CMP #$59
    BEQ @start_delete
    CMP #$79
    BEQ @start_delete
    CMP #$4E
    BEQ @confirm_no
    CMP #$6E
    BEQ @confirm_no
    JSR CMD_NEWLINE
    JMP @confirm_prompt
@confirm_no:
    JSR CMD_NEWLINE
    JMP @success
@start_delete:
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
    BCC @wildcard_built
    JMP @fail
@wildcard_built:
    LDA CMD_ARG1_PATH
    BEQ @copy_saved_name1_to_arg1_name_2_done
    LDY #$00
@copy_arg1_name_to_saved_name1_2:
    LDA CMD_ARG1_NAME,Y
    STA CMD_SAVED_NAME1,Y
    BEQ @copy_arg1_name_to_saved_name1_2_done
    INY
    JMP @copy_arg1_name_to_saved_name1_2
@copy_arg1_name_to_saved_name1_2_done:
    LDA #$00
    STA CMD_ARG1_NAME
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
    JSR CMD_FS_LOAD_DIR_SECTOR
    BCC @next_sector
@build_failed:
    JMP @fail
@next_sector:
    LDX #$10
@next_entry:
    JSR CMD_DIR_ENTRY_CHECK
    BCC @entry_used
    JMP @entry_done
@entry_used:
    LDY #$00
@match_byte:
    LDA CMD_WILDCARD,Y
    CMP #$3F
    BEQ @match_next
    CMP (DIR_ENTRY_PTR_LO),Y
    BEQ @match_next
    LDA #$01
    JMP @entry_done
@match_next:
    INY
    CPY #$0B
    BCC @match_byte
    JSR CMD_DIR_ENTRY_ATTR_CHECK
    BCC @check_readonly
    LDA #$01
    JMP @entry_done
@check_readonly:
    LDY #$0B
    LDA (DIR_ENTRY_PTR_LO),Y
    AND #$01
    BEQ @check_dir
    LDA #$01
    JMP @entry_done
@check_dir:
    LDY #$0B
    LDA (DIR_ENTRY_PTR_LO),Y
    AND #$10
    BEQ @check_ask
    LDA #$01
    JMP @entry_done
@delete_jump:
    JMP @delete_file
@check_ask:
    LDA CMD_SWITCH_FLAGS
    AND #$02
    BEQ @delete_jump
    JSR CMD_NEWLINE
    TXA
    PHA
    TYA
    PHA
    LDX #$00
@find_end_1:
    LDA CMD_FULL_PATH,X
    CMP #$00
    BEQ @name_start
    INX
    JMP @find_end_1
@name_start:
    LDY #$00
@append_name:
    LDA (DIR_ENTRY_PTR_LO),Y
    STA CMD_FULL_PATH,X
    CPY #$07
    BNE @name_next
    INX
    LDA #$00
    STA CMD_FULL_PATH,X
    PLA
    TAY
    PLA
    TAX
    JMP @append_ext
@name_next:
    INX
    INY
    JMP @append_name
@append_ext:
    LDA #$2E
    JSR CMD_OUTBUF_PUT_CHAR
    TXA
    PHA
    TYA
    PHA
    LDX #$00
@find_end_2:
    LDA CMD_FULL_PATH,X
    CMP #$00
    BEQ @ext_start
    INX
    JMP @find_end_2
@ext_start:
    LDY #$08
@append_ext_loop:
    LDA (DIR_ENTRY_PTR_LO),Y
    STA CMD_FULL_PATH,X
    CPY #$0A
    BNE @ext_next
    INX
    LDA #$00
    STA CMD_FULL_PATH,X
    PLA
    TAY
    PLA
    TAX
    JMP @show_prompt
@ext_next:
    INX
    INY
    JMP @append_ext_loop
@show_prompt:
    LDA #$20
    JSR CMD_OUTBUF_PUT_CHAR
    LDA #$2C
    JSR CMD_OUTBUF_PUT_CHAR
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
    LDA #$78
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    LDA #$00
    STA CMD_FULL_PATH
@prompt_key:
    JSR GET_KEY_ASCII
    CMP #$20
    BCC @prompt_key
    CMP #$7F
    BCS @prompt_key
    JSR CMD_PUT_CHAR
    CMP #$59
    BEQ @delete_file
    CMP #$79
    BEQ @delete_file
    CMP #$4E
    BEQ @skip_file
    CMP #$6E
    BEQ @skip_file
    JMP @check_ask
@skip_file:
    LDA #$01
    JMP @entry_done
@delete_file:
    LDA DIR_ENTRY_PTR_LO
    STA LIST_PTR_LO
    LDA DIR_ENTRY_PTR_HI
    STA LIST_PTR_HI
    JSR CMD_DIR_ENTRY_TO_NAME
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$12
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR CMD_CHECK_ERROR
    BCC @deleted
    JMP @fail
@deleted:
    INC CMD_MATCH_COUNT
    LDA #$01
@entry_done:
    BEQ @finish
    LDA #$20
    JSR CMD_DIR_ADVANCE_PTR
    DEX
    BEQ @next_dir_sector
    JMP @next_entry
@next_dir_sector:
    JSR CMD_FS_NEXT_DIR_SECTOR
    BCS @sector_error
    BEQ @finish
    JMP @next_sector
@sector_error:
    JMP @error_message
@finish:
    LDA CMD_MATCH_COUNT
    BNE @print_count
    LDA #$7B
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    JMP @success
@print_count:
    JSR CMD_NEWLINE
    LDA CMD_MATCH_COUNT
    JSR CMD_PRINT_DEC_2DIGIT
    LDA #$00
    STA LIB_GROUP
    PHA
    LDA #<CMD_FULL_PATH
    STA STR_PTR_LO
    LDA #>CMD_FULL_PATH
    STA STR_PTR_HI
    PLA
    JSR CALL_LIB_PRINT_STRING
    LDA CURSOR_COL
    CLC
    ADC LIB_STR_LEN
    STA CURSOR_COL
    LDA #$79
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
    LDA #$00
    STA CMD_FULL_PATH
@success:
    CLC
@restore:
    PHP
    JSR CMD_NEWLINE
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
@error_message:
    LDA #$2B
    STA LIB_GROUP
    JSR CALL_SHELL_PRINT_MESSAGE
@fail:
    SEC
    JMP @restore
