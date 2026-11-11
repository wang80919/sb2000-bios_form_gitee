; 作用：命令 DIR（实现在页组 0 里）：解析命令行；开关位 0 打开时显示帮助消息 $84、$85；记下当前目录；驱动器缺省取当前驱动器，第二参数必须为空；把名称“.”改成“*.*”、“..”改成上一级目录；检查非法字符；用 CMD_BUILD_PATH 切到目录，名称是目录时列出该目录下的全部文件；读卷标与卷序列号并显示（消息 $86、$87、$88）；显示“目录：驱动器:路径”（消息 $89）；逐个目录项显示（每扇区 16 项，必要时读下一扇区）：只列匹配通配名称、不是卷标的项，隐藏与系统项要开关位 2；开关位 3 简洁方式只列名称，开关位 4 宽列表每行两列，否则显示名称、大小或目录标记与日期；开关位 1 打开时每满一屏等键（消息 $3B）；最后显示文件数、目录数、占用字节数与剩余空间（消息 $8B 至 $8E，没有任何项时显示 $8A）；恢复原来的当前目录并让软驱停转。
; 输出：C=0 成功，C=1 失败。
; 调用者：DOS_CMD_TABLE（地址表）
CMD_DIR:
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
    LDA #$00
    STA CMD_FULL_PATH
    LDA #$01
    STA DIR_WIDE_FIRST_FLAG
    LDA CMD_SWITCH_FLAGS
    AND #$01
    BEQ @not_help
    LDA #$84
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    LDA #$85
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    JSR SHELL_NEWLINE
    CLC
    RTS
@not_help:
    LDA #$7D
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR DOS_CHECK_ERROR
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
    BEQ @init_wildcard
    INY
    JMP @loop
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
    BEQ @default_drive
    CMP #$41
    BEQ @check_arg2
    CMP #$42
    BEQ @check_arg2
@invalid_jump:
    JMP @invalid_args
@default_drive:
    LDA FS_DRIVE_LETTER
    STA CMD_ARG1_DRIVE
@check_arg2:
    LDA CMD_ARG2_DRIVE
    ORA CMD_ARG2_PATH
    ORA CMD_ARG2_NAME
    BNE @invalid_jump
    TXA
    PHA
    LDX #$00
@cmp_dot:
    LDA CMD_ARG1_NAME,X
    STA CMD_CHAR_TEMP
    BEQ @cmp_dot_tail
    LDA $B1B6,X
    BEQ @cmp_dot_differ
    CMP CMD_CHAR_TEMP
    BNE @cmp_dot_differ
    INX
    JMP @cmp_dot
@cmp_dot_tail:
    LDA $B1B6,X
    CMP CMD_CHAR_TEMP
    BEQ @cmp_dot_equal
@cmp_dot_differ:
    PLA
    TAX
    LDA #$01
    JMP @cmp_dot_result
@cmp_dot_equal:
    PLA
    TAX
    LDA #$00
    JMP @cmp_dot_result
@cmp_dot_result:
    BEQ @dot_to_all
    TXA
    PHA
    LDX #$00
@cmp_dotdot:
    LDA CMD_ARG1_NAME,X
    STA CMD_CHAR_TEMP
    BEQ @cmp_dotdot_tail
    LDA $B1B5,X
    BEQ @cmp_dotdot_differ
    CMP CMD_CHAR_TEMP
    BNE @cmp_dotdot_differ
    INX
    JMP @cmp_dotdot
@cmp_dotdot_tail:
    LDA $B1B5,X
    CMP CMD_CHAR_TEMP
    BEQ @cmp_dotdot_equal
@cmp_dotdot_differ:
    PLA
    TAX
    LDA #$01
    JMP @cmp_dotdot_result
@cmp_dotdot_equal:
    PLA
    TAX
    LDA #$00
    JMP @cmp_dotdot_result
@cmp_dotdot_result:
    BEQ @dotdot
    JMP @check_chars
@dot_to_all:
    LDY #$00
@copy_all_files:
    LDA $B1BC,Y
    STA CMD_ARG1_NAME,Y
    BEQ @copy_all_files_done
    INY
    JMP @copy_all_files
@copy_all_files_done:
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
    LDA $B1B8,Y
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
@copy_all_files_2:
    LDA $B1BC,Y
    STA CMD_ARG1_NAME,Y
    BEQ @copy_all_files_2_done
    INY
    JMP @copy_all_files_2
@copy_all_files_2_done:
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
    JSR LIB_CHECK_NAME
    BCS @invalid_chars
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
    JSR LIB_CHECK_NAME
    BCS @invalid_chars
    JMP @change_dir
@invalid_chars:
    JMP @invalid_args
    LDA CMD_ARG1_NAME
    BNE @change_dir
    JMP @dir_restored
@change_dir:
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
    JSR DIR_PREPARE_SPEC
    BCC @lookup_found
    BNE @fail_jump
    JMP @restore_dir
@fail_jump:
    JMP @fail
@lookup_found:
    BNE @restore_dir
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
    JSR OUTBUF_PUT_CHAR
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
@copy_all_files_3:
    LDA $B1BC,Y
    STA CMD_ARG1_NAME,Y
    BEQ @restore_dir
    INY
    JMP @copy_all_files_3
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
    JSR DOS_CHECK_ERROR
    BCC @dir_restored
    SEC
    PHP
    JMP @finish
@dir_restored:
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
    LDA #$3F
    STA LIB_GROUP
    JSR LIB_MAKE_FCB_NAME
    JSR DOS_CHECK_ERROR
    BCC @wildcard_built
    JMP @fail
@wildcard_built:
    LDA CMD_ARG1_DRIVE
    STA FILE_DRIVE_LETTER
    LDA #$7C
    STA SYS_FUNCTION
    LDA #$0E
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR DOS_CHECK_ERROR
    BCC @read_volume
    SEC
    PHP
    JMP @finish
@read_volume:
    LDA FS_VOLUME_SERIAL+3
    STA DIR_SERIAL
    LDY FS_VOLUME_SERIAL+2
    STY DIR_SERIAL+1
    LDA FS_VOLUME_SERIAL+1
    STA DIR_SERIAL+2
    LDY FS_VOLUME_SERIAL
    STY DIR_SERIAL+3
    LDY #$00
    LDA FS_VOLUME_LABEL,Y
    CMP #$20
    BEQ @no_label_jump
    LDA FS_VOLUME_LABEL,Y
    CMP #$4E
    BNE @check_label
    INY
    LDA FS_VOLUME_LABEL,Y
    CMP #$4F
    BNE @check_label
    INY
    LDA FS_VOLUME_LABEL,Y
    CMP #$20
    BNE @check_label
    INY
    LDA FS_VOLUME_LABEL,Y
    CMP #$4E
    BNE @check_label
@no_label_jump:
    JMP @no_label
@check_label:
    LDY #$00
@check_label_char:
    LDA FS_VOLUME_LABEL,Y
    CMP #$20
    BCC @no_label_jump2
    CMP #$7F
    BCC @label_char_ok
@no_label_jump2:
    JMP @no_label
@label_char_ok:
    INY
    CPY #$0B
    BCC @check_label_char
    JSR SHELL_NEWLINE
    LDA #$86
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    LDY #$00
@copy_label_char:
    LDA FS_VOLUME_LABEL,Y
    JSR OUTBUF_PUT_CHAR
    INY
    CPY #$0B
    BCC @copy_label_char
    PHA
    LDA #<CMD_FULL_PATH
    STA STR_PTR_LO
    LDA #>CMD_FULL_PATH
    STA STR_PTR_HI
    PLA
    LDA #$00
    STA LIB_GROUP
    JSR LIB_PRINT_STRING
    LDA #$00
    STA CMD_FULL_PATH
    JMP @print_serial
@no_label:
    LDA #$87
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    LDA #$00
    STA CMD_FULL_PATH
    JMP @print_serial
    .byte $4E,$4F,$20,$4E,$41,$4D,$45,$00
@print_serial:
    JSR SHELL_NEWLINE
    LDA #$88
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    LDA DIR_SERIAL+3
    LDY DIR_SERIAL+2
    JSR PRINT_HEX16
    LDA #$2D
    JSR OUTBUF_PUT_CHAR
    LDA DIR_SERIAL+1
    LDY DIR_SERIAL
    JSR PRINT_HEX16
    PHA
    LDA #<CMD_FULL_PATH
    STA STR_PTR_LO
    LDA #>CMD_FULL_PATH
    STA STR_PTR_HI
    PLA
    LDA #$00
    STA LIB_GROUP
    JSR LIB_PRINT_STRING
    LDA #$00
    STA CMD_FULL_PATH
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
    JSR CMD_BUILD_PATH
    BCS @path_failed
    LDY #$00
@copy_saved_name1_to_arg1_name_2:
    LDA CMD_SAVED_NAME1,Y
    STA CMD_ARG1_NAME,Y
    BEQ @copy_saved_name1_to_arg1_name_2_done
    INY
    JMP @copy_saved_name1_to_arg1_name_2
@copy_saved_name1_to_arg1_name_2_done:
    LDA #$7D
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR DOS_CHECK_ERROR
    BCC @print_header
    SEC
    PHP
    JMP @finish
@path_failed:
    JMP @fail
@print_header:
    JSR SHELL_NEWLINE
    LDA #$89
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    LDA CMD_ARG1_DRIVE
    JSR OUTBUF_PUT_CHAR
    LDA #$3A
    JSR OUTBUF_PUT_CHAR
    PHA
    LDA #<CMD_FULL_PATH
    STA STR_PTR_LO
    LDA #>CMD_FULL_PATH
    STA STR_PTR_HI
    PLA
    LDA #$00
    STA LIB_GROUP
    JSR LIB_PRINT_STRING
    LDA CURSOR_COL
    CLC
    ADC LIB_STR_LEN
    STA CURSOR_COL
    LDA #$00
    STA CMD_FULL_PATH
    PHA
    LDA #<PATH_BUFFER
    STA STR_PTR_LO
    LDA #>PATH_BUFFER
    STA STR_PTR_HI
    PLA
    LDA #$00
    STA LIB_GROUP
    JSR LIB_PRINT_STRING
    JSR SHELL_NEWLINE
    JSR SHELL_NEWLINE
    LDA #$00
    STA CMD_MATCH_COUNT
    STA CMD_DIR_COUNT
    STA CMD_TOTAL
    STA CMD_TOTAL+1
    STA CMD_TOTAL+2
    LDA FONT_SIZE
    BEQ @page_lines_25
    LDA #$09
    JMP @set_page_lines
@page_lines_25:
    LDA #$19
@set_page_lines:
    STA CMD_DIR_PAGE_LINES
    JSR FS_LOAD_DIR_SECTOR
    BCC @next_sector
    JMP @fail
@next_sector:
    LDX #$10
@next_entry:
    JSR DIR_ENTRY_CHECK
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
    JSR DIR_ENTRY_ATTR_CHECK
    BCC @check_pause
    BEQ @skip_entry
    LDA CMD_SWITCH_FLAGS
    AND #$04
    BNE @check_pause
@skip_entry:
    LDA #$01
    JMP @entry_done
@no_pause:
    JMP @check_list_mode
@check_pause:
    LDA CMD_SWITCH_FLAGS
    AND #$02
    BEQ @no_pause
    DEC CMD_DIR_PAGE_LINES
    BNE @no_pause
    TXA
    PHA
    LDA FONT_SIZE
    BEQ @pause_lines_29
    LDA #$0C
    JMP @set_pause_lines
@pause_lines_29:
    LDA #$1C
@set_pause_lines:
    STA CMD_DIR_PAGE_LINES
    JSR SHELL_NEWLINE
    LDA #$3B
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    JSR SHELL_INPUT_KEY
    JSR SHELL_NEWLINE
    JSR SHELL_NEWLINE
    PLA
    TAX
@check_list_mode:
    LDA CMD_SWITCH_FLAGS
    AND #$08
    BNE @bare_or_wide
    LDA CMD_SWITCH_FLAGS
    AND #$10
    BNE @bare_or_wide
    JMP @normal_name
@bare_or_wide:
    LDA DIR_ENTRY_PTR_LO
    STA LIST_PTR_LO
    LDA DIR_ENTRY_PTR_HI
    STA LIST_PTR_HI
    LDY #$0B
    LDA (DIR_ENTRY_PTR_LO),Y
    AND #$10
    BEQ @file_entry
    JSR DIR_ENTRY_TO_NAME
    LDA #$5B
    JSR OUTBUF_PUT_CHAR
    TXA
    PHA
    TYA
    PHA
    LDX #$00
@append_path_buffer_to_full_path_find_end:
    LDA CMD_FULL_PATH,X
    CMP #$00
    BEQ @append_path_buffer_to_full_path_start
    INX
    JMP @append_path_buffer_to_full_path_find_end
@append_path_buffer_to_full_path_start:
    LDY #$00
@append_path_buffer_to_full_path:
    LDA PATH_BUFFER,Y
    STA CMD_FULL_PATH,X
    BNE @append_path_buffer_to_full_path_next
    PLA
    TAY
    PLA
    TAX
    JMP @append_path_buffer_to_full_path_done
@append_path_buffer_to_full_path_next:
    INX
    INY
    JMP @append_path_buffer_to_full_path
@append_path_buffer_to_full_path_done:
    LDA #$5D
    JSR OUTBUF_PUT_CHAR
    INC CMD_DIR_COUNT
    CLC
    LDA DIR_NAME_COLUMN
    ADC #$03
    STA DIR_NAME_COLUMN
    JMP @output_line
@file_entry:
    JSR DIR_ENTRY_TO_NAME
    TXA
    PHA
    TYA
    PHA
    LDX #$00
@append_path_buffer_to_full_path_2_find_end:
    LDA CMD_FULL_PATH,X
    CMP #$00
    BEQ @append_path_buffer_to_full_path_2_start
    INX
    JMP @append_path_buffer_to_full_path_2_find_end
@append_path_buffer_to_full_path_2_start:
    LDY #$00
@append_path_buffer_to_full_path_2:
    LDA PATH_BUFFER,Y
    STA CMD_FULL_PATH,X
    BNE @append_path_buffer_to_full_path_2_next
    PLA
    TAY
    PLA
    TAX
    JMP @append_path_buffer_to_full_path_2_done
@append_path_buffer_to_full_path_2_next:
    INX
    INY
    JMP @append_path_buffer_to_full_path_2
@append_path_buffer_to_full_path_2_done:
    INC CMD_MATCH_COUNT
    LDY #$1C
    LDA (DIR_ENTRY_PTR_LO),Y
    STA CMD_NUM
    INY
    LDA (DIR_ENTRY_PTR_LO),Y
    STA CMD_NUM+1
    INY
    LDA (DIR_ENTRY_PTR_LO),Y
    STA CMD_NUM+2
    JSR TOTAL_ADD
    CLC
    LDA DIR_NAME_COLUMN
    ADC #$05
    STA DIR_NAME_COLUMN
    JMP @output_line
@normal_name:
    TXA
    PHA
    TYA
    PHA
    LDX #$00
@find_end_name:
    LDA CMD_FULL_PATH,X
    CMP #$00
    BEQ @name_start
    INX
    JMP @find_end_name
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
    LDA #$20
    JSR OUTBUF_PUT_CHAR
    TXA
    PHA
    TYA
    PHA
    LDX #$00
@find_end_ext:
    LDA CMD_FULL_PATH,X
    CMP #$00
    BEQ @ext_start
    INX
    JMP @find_end_ext
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
    JMP @name_done
@ext_next:
    INX
    INY
    JMP @append_ext_loop
@name_done:
    LDA #$20
    JSR OUTBUF_PUT_CHAR
@output_line:
    LDA CMD_SWITCH_FLAGS
    AND #$08
    BEQ @check_wide
    LDA #$00
    STA LIB_GROUP
    PHA
    LDA #<CMD_FULL_PATH
    STA STR_PTR_LO
    LDA #>CMD_FULL_PATH
    STA STR_PTR_HI
    PLA
    JSR LIB_PRINT_STRING
    LDA #$00
    STA CMD_FULL_PATH
    JSR SHELL_NEWLINE
    LDA #$01
    JMP @entry_done
@check_wide:
    LDA CMD_SWITCH_FLAGS
    AND #$10
    BEQ @detail_line
    LDA DIR_WIDE_FIRST_FLAG
    BEQ @wide_second_column
    INC CMD_DIR_PAGE_LINES
@wide_pad:
    LDA #$20
    JSR OUTBUF_PUT_CHAR
    LDA DIR_NAME_COLUMN
    BEQ @wide_first_done
    DEC DIR_NAME_COLUMN
    JMP @wide_pad
@wide_first_done:
    DEC DIR_WIDE_FIRST_FLAG
    LDA #$01
    JMP @entry_done
@wide_second_column:
    PHA
    LDA #<CMD_FULL_PATH
    STA STR_PTR_LO
    LDA #>CMD_FULL_PATH
    STA STR_PTR_HI
    PLA
    LDA #$00
    STA LIB_GROUP
    JSR LIB_PRINT_STRING
    LDA #$00
    STA CMD_FULL_PATH
    JSR SHELL_NEWLINE
    LDA #$01
    STA DIR_WIDE_FIRST_FLAG
    JMP @entry_done
@detail_line:
    LDY #$0B
    LDA (DIR_ENTRY_PTR_LO),Y
    AND #$10
    BEQ @print_size
    TXA
    PHA
    TYA
    PHA
    LDX #$00
@dir_find_end:
    LDA CMD_FULL_PATH,X
    CMP #$00
    BEQ @dir_append_start
    INX
    JMP @dir_find_end
@dir_append_start:
    LDY #$00
@dir_append:
    LDA $B1AA,Y
    STA CMD_FULL_PATH,X
    CPY #$09
    BNE @dir_append_next
    INX
    LDA #$00
    STA CMD_FULL_PATH,X
    PLA
    TAY
    PLA
    TAX
    JMP @dir_appended
@dir_append_next:
    INX
    INY
    JMP @dir_append
@dir_appended:
    INC CMD_DIR_COUNT
    JMP @print_date
@print_size:
    JSR DIR_PRINT_SIZE
    LDA #$20
    JSR OUTBUF_PUT_CHAR
@print_date:
    JSR DIR_PRINT_DATE
    LDA #$00
    STA LIB_GROUP
    PHA
    LDA #<CMD_FULL_PATH
    STA STR_PTR_LO
    LDA #>CMD_FULL_PATH
    STA STR_PTR_HI
    PLA
    JSR LIB_PRINT_STRING
    LDA #$00
    STA CMD_FULL_PATH
    JSR SHELL_NEWLINE
    LDA #$01
@entry_done:
    BEQ @summary
    LDA #$20
    JSR DIR_ADVANCE_PTR
    DEX
    BEQ @next_dir_sector
    JMP @next_entry
@next_dir_sector:
    JSR FS_NEXT_DIR_SECTOR
    BCS @sector_error
    BEQ @summary
    JMP @next_sector
@sector_error:
    JMP @fail
@summary:
    LDA #$00
    STA LIB_GROUP
    PHA
    LDA #<CMD_FULL_PATH
    STA STR_PTR_LO
    LDA #>CMD_FULL_PATH
    STA STR_PTR_HI
    PLA
    JSR LIB_PRINT_STRING
    LDA #$00
    STA CMD_FULL_PATH
    JSR SHELL_NEWLINE
    LDA CMD_SWITCH_FLAGS
    AND #$02
    BEQ @summary_checked
    DEC CMD_DIR_PAGE_LINES
    BNE @summary_checked
    LDA FONT_SIZE
    BEQ @summary_lines_29
    LDA #$0C
    JMP @set_summary_lines
@summary_lines_29:
    LDA #$1C
@set_summary_lines:
    STA CMD_DIR_PAGE_LINES
    LDA #$3B
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    JSR SHELL_INPUT_KEY
    JSR SHELL_NEWLINE
@summary_checked:
    JMP @check_empty
@print_counts_jump1:
    JMP @print_counts
@print_counts_jump2:
    JMP @print_counts
@check_empty:
    LDA CMD_MATCH_COUNT
    BNE @print_counts_jump1
    LDA CMD_DIR_COUNT
    BNE @print_counts_jump2
    LDA #$8A
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    JSR SHELL_NEWLINE
    JSR SHELL_NEWLINE
    JMP @print_free
@print_counts:
    JSR PRINT_4_SPACES
    LDA CMD_MATCH_COUNT
    STA CMD_NUM
    LDA #$00
    STA CMD_NUM+1
    STA CMD_NUM+2
    JSR PRINT_DECIMAL_24
    PHA
    LDA #<CMD_FULL_PATH
    STA STR_PTR_LO
    LDA #>CMD_FULL_PATH
    STA STR_PTR_HI
    PLA
    LDA #$00
    STA LIB_GROUP
    JSR LIB_PRINT_STRING
    LDA CURSOR_COL
    CLC
    ADC LIB_STR_LEN
    STA CURSOR_COL
    LDA #$00
    STA CMD_FULL_PATH
    LDA #$8B
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    JSR SHELL_NEWLINE
    LDA CMD_SWITCH_FLAGS
    AND #$02
    BEQ @print_dirs
    DEC CMD_DIR_PAGE_LINES
    BNE @print_dirs
    LDA FONT_SIZE
    BEQ @pause_after_files_29
    LDA #$0C
    JMP @pause_after_files_set
@pause_after_files_29:
    LDA #$1C
@pause_after_files_set:
    STA CMD_DIR_PAGE_LINES
    LDA #$3B
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    JSR SHELL_INPUT_KEY
    JSR SHELL_NEWLINE
@print_dirs:
    JSR PRINT_4_SPACES
    LDA CMD_DIR_COUNT
    STA CMD_NUM
    LDA #$00
    STA CMD_NUM+1
    STA CMD_NUM+2
    JSR PRINT_DECIMAL_24
    PHA
    LDA #<CMD_FULL_PATH
    STA STR_PTR_LO
    LDA #>CMD_FULL_PATH
    STA STR_PTR_HI
    PLA
    LDA #$00
    STA LIB_GROUP
    JSR LIB_PRINT_STRING
    LDA CURSOR_COL
    CLC
    ADC LIB_STR_LEN
    STA CURSOR_COL
    LDA #$00
    STA CMD_FULL_PATH
    LDA #$8C
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    JSR SHELL_NEWLINE
    LDA CMD_SWITCH_FLAGS
    AND #$02
    BEQ @print_bytes
    DEC CMD_DIR_PAGE_LINES
    BNE @print_bytes
    LDA FONT_SIZE
    BEQ @pause_after_dirs_29
    LDA #$0C
    JMP @pause_after_dirs_set
@pause_after_dirs_29:
    LDA #$1C
@pause_after_dirs_set:
    STA CMD_DIR_PAGE_LINES
    LDA #$3B
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    JSR SHELL_INPUT_KEY
    JSR SHELL_NEWLINE
@print_bytes:
    LDA #$01
    STA CURSOR_COL
    JSR PRINT_4_SPACES
    JSR TOTAL_TO_CUR
    JSR PRINT_DECIMAL_24
    PHA
    LDA #<CMD_FULL_PATH
    STA STR_PTR_LO
    LDA #>CMD_FULL_PATH
    STA STR_PTR_HI
    PLA
    LDA #$00
    STA LIB_GROUP
    JSR LIB_PRINT_STRING
    LDA CURSOR_COL
    CLC
    ADC LIB_STR_LEN
    STA CURSOR_COL
    LDA #$00
    STA CMD_FULL_PATH
    LDA #$8D
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    JSR SHELL_NEWLINE
    LDA CMD_SWITCH_FLAGS
    AND #$02
    BEQ @after_bytes
    DEC CMD_DIR_PAGE_LINES
    BNE @after_bytes
    LDA FONT_SIZE
    BEQ @pause_after_bytes_29
    LDA #$0C
    JMP @pause_after_bytes_set
@pause_after_bytes_29:
    LDA #$1C
@pause_after_bytes_set:
    STA CMD_DIR_PAGE_LINES
    LDA #$3B
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    JSR SHELL_INPUT_KEY
    JSR SHELL_NEWLINE
@after_bytes:
    JMP @print_free
@print_free:
    JSR PRINT_4_SPACES
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$06
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR DOS_CHECK_ERROR
    BCC @free_read
    SEC
    PHP
    JMP @finish
@free_read:
    LDA MATH_ARG_02
    STA CMD_NUM+2
    LDA MATH_ARG_01
    STA CMD_NUM+1
    LDA MATH_ARG_00
    STA CMD_NUM
    JSR PRINT_DECIMAL_24
    PHA
    LDA #<CMD_FULL_PATH
    STA STR_PTR_LO
    LDA #>CMD_FULL_PATH
    STA STR_PTR_HI
    PLA
    LDA #$00
    STA LIB_GROUP
    JSR LIB_PRINT_STRING
    LDA CURSOR_COL
    CLC
    ADC LIB_STR_LEN
    STA CURSOR_COL
    LDA #$00
    STA CMD_FULL_PATH
    LDA #$8E
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    JSR SHELL_NEWLINE
    LDA CMD_SWITCH_FLAGS
    AND #$02
    BEQ @success
    DEC CMD_DIR_PAGE_LINES
    BNE @success
    LDA FONT_SIZE
    BEQ @pause_after_free_29
    LDA #$0C
    JMP @pause_after_free_set
@pause_after_free_29:
    LDA #$1C
@pause_after_free_set:
    STA CMD_DIR_PAGE_LINES
    LDA #$3B
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    JSR SHELL_INPUT_KEY
    JSR SHELL_NEWLINE
@success:
    CLC
    JMP @restore
@fail:
    SEC
@restore:
    PHP
    LDY #$00
@copy_saved_path2_to_current_dir:
    LDA CMD_SAVED_PATH2,Y
    STA CMD_CURRENT_DIR,Y
    BEQ @copy_saved_path2_to_current_dir_done
    INY
    JMP @copy_saved_path2_to_current_dir
@copy_saved_path2_to_current_dir_done:
    LDY #$00
@copy_saved_path2_to_path_buffer_2:
    LDA CMD_SAVED_PATH2,Y
    STA PATH_BUFFER,Y
    BEQ @copy_saved_path2_to_path_buffer_2_done
    INY
    JMP @copy_saved_path2_to_path_buffer_2
@copy_saved_path2_to_path_buffer_2_done:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$0B
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
@finish:
    JSR SHELL_NEWLINE
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    PLP
    RTS
@invalid_args:
    LDA #$25
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    SEC
    JMP @restore
