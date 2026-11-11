; 作用：求 STR_PTR_LO/HI 指向的字符串长度，放到 LIB_STR_LEN（保持 A、Y 不变）。
; 输入：STR_PTR_LO/HI。
; 输出：LIB_STR_LEN。
; 调用者：LIB_PRINT_STRING
LIB_STRLEN:
    PHA
    TYA
    PHA
    LDY #$00
@loop:
    LDA (STR_PTR_LO),Y
    BEQ @done
    INY
    JMP @loop
@done:
    STY LIB_STR_LEN
    PLA
    TAY
    PLA
    RTS
; 作用：调用功能 $1B，等 X 个垂直消隐周期。
; 输入：X=帧数。
; 调用者：SHELL_INIT_VIDEO
SHELL_WAIT_FRAMES:
    LDA #$1B
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：功能 $10 子功能 4、SYS_ARG_0F=$10：打开精灵显示（PPU_MASK 位 4）并让 NMI 做精灵 DMA。
; 调用者：SHELL_COMMAND_LOOP
SHELL_SPRITES_ON:
    LDA #$10
    STA SYS_FUNCTION
    LDA #$04
    STA SYS_SUBFUNCTION
    LDA #$10
    STA SYS_ARG_0F
    JSR VEC_SYSCALL
    RTS
; 作用：功能 $10 子功能 4、SYS_ARG_0F=0：关闭精灵显示。
; 调用者：SHELL_READ_COMMAND
SHELL_SPRITES_OFF:
    LDA #$10
    STA SYS_FUNCTION
    LDA #$04
    STA SYS_SUBFUNCTION
    LDA #$00
    STA SYS_ARG_0F
    JSR VEC_SYSCALL
    RTS
; 作用：功能 $10 子功能 5：PPU_CTRL 位 5（8×16 精灵）由 FONT_SIZE 决定，FONT_SIZE 为 0 时取 0，否则取 $20。
; 输入：FONT_SIZE。
; 调用者：SHELL_COMMAND_LOOP
SHELL_SET_SPRITE_SIZE:
    LDA #$10
    STA SYS_FUNCTION
    LDA #$05
    STA SYS_SUBFUNCTION
    LDA FONT_SIZE
    BEQ @size_8x8
    LDA #$20
    JMP @store_size
@size_8x8:
    LDA #$00
@store_size:
    STA SYS_ARG_0F
    JSR VEC_SYSCALL
    RTS
; 作用：调用 $7B/$13（四个文件句柄全部置空闲），再把当前驱动器 FS_DRIVE_LETTER 设成 $41（A）。
; 调用者：SHELL_MAIN_LOOP
SHELL_RESET_DISK:
    LDA #$7B
    STA SYS_FUNCTION
    LDA #$13
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$41
    STA FS_DRIVE_LETTER
    RTS
; 作用：不能出现在文件名里的字符表（完整表）：这里是通配符“*”“?”，后面紧接 BAD_CHARS_ALLOW_WILDCARD 的字符，合起来含通配符与反斜杠；LIB_GROUP 不是 0 与 1 时用。
; 引用者：LIB_IS_BAD_NAME_CHAR（取地址）
BAD_CHARS_ALL:
    .byte $2A,$3F
; 作用：不能出现在文件名里的字符表（允许通配符，含反斜杠）；LIB_GROUP 为 1 时用，也是 BAD_CHARS_ALL 的后半。
; 引用者：LIB_IS_BAD_NAME_CHAR（取地址）
BAD_CHARS_ALLOW_WILDCARD:
    .byte $5C,$20,$2C,$3C,$3E,$3A,$3B,$5B,$5D,$7C,$2B,$3D,$2F,$22,$00
; 作用：不能出现在文件名里的字符表（含通配符，允许反斜杠）；LIB_GROUP 为 0 时用。
; 引用者：LIB_IS_BAD_NAME_CHAR（取地址）
BAD_CHARS_ALLOW_BACKSLASH:
    .byte $2A,$3F,$20,$2C,$3C,$3E,$3A,$3B,$5B,$5D,$7C,$2B,$3D,$2F,$22,$00
; 作用：判断 A 是否是不能出现在文件名里的字符：LIB_GROUP 为 0、1 或其他时分别查 BAD_CHARS_ALLOW_BACKSLASH、BAD_CHARS_ALLOW_WILDCARD、BAD_CHARS_ALL。
; 输入：A=字符，LIB_GROUP。
; 输出：C=1 是不能出现的字符，C=0 可以。
; 调用者：LIB_CHECK_NAME
LIB_IS_BAD_NAME_CHAR:
    STA DOS_TEMP_3
    PHA
    TYA
    PHA
    LDA LIB_GROUP
    BEQ @backslash_set
    CMP #$01
    BEQ @wildcard_set
    LDA #<BAD_CHARS_ALL
    STA STR_PTR_LO
    LDA #>BAD_CHARS_ALL
    STA STR_PTR_HI
    JMP @search
@wildcard_set:
    LDA #<BAD_CHARS_ALLOW_WILDCARD
    STA STR_PTR_LO
    LDA #>BAD_CHARS_ALLOW_WILDCARD
    STA STR_PTR_HI
    JMP @search
@backslash_set:
    LDA #<BAD_CHARS_ALLOW_BACKSLASH
    STA STR_PTR_LO
    LDA #>BAD_CHARS_ALLOW_BACKSLASH
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
; 作用：检查 LIB_TEMP_STR 里的文件名有没有不能出现的字符（LIB_IS_BAD_NAME_CHAR），遇到第一个就停（A、X、Y 保持不变）。
; 输入：LIB_TEMP_STR，LIB_GROUP。
; 输出：C=1 有不能出现的字符，C=0 没有。
; 调用者：CMD_BUILD_PATH、CMD_DIR、CMD_MD、CMD_RD
LIB_CHECK_NAME:
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
    JSR LIB_IS_BAD_NAME_CHAR
    BCC @loop
@done:
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
; 作用：把 LIB_TEMP_STR 里的文件名整理成 11 字节的 8+3 名称写到 STR_PTR 指向处（以 0 结尾）：先用 LIB_GROUP 作填充字符填满；名称只有“.”时整个填成“?”；遇到“.”把主名补空格到 8 位再写扩展名（出现第二个“.”或主名超过 8 位算错误），“*”把该部分余下的位置展开成“?”，不足的部分补空格；名称过长、第二个“.”出现时出错码 DOS_ERROR=$27。保存和恢复 A、X、Y。
; 输入：LIB_TEMP_STR，STR_PTR_LO/HI=输出位置，LIB_GROUP=填充字符。
; 输出：DOS_ERROR。
; 调用者：DIR_PREPARE_SPEC、CMD_DIR、CALL_LIB_MAKE_FCB_NAME（取地址）
LIB_MAKE_FCB_NAME:
    PHA
    TXA
    PHA
    TYA
    PHA
    LDY #$00
    STY DOS_TEMP_3
    STY DOS_ERROR
    LDA LIB_GROUP
@loop:
    STA (STR_PTR_LO),Y
    INY
    CPY #$0B
    BNE @loop
    LDA #$00
    STA (STR_PTR_LO),Y
    LDY #$00
    LDX #$00
    LDA LIB_TEMP_STR,X
    CMP #$2E
    BNE @next_char
    LDA LIB_TEMP_STR+1,X
    BNE @next_char
    LDA #$3F
@fill_all_wildcard:
    STA (STR_PTR_LO),Y
    INY
    CPY #$0B
    BNE @fill_all_wildcard
    JMP @finish
@next_char:
    LDA LIB_TEMP_STR,X
    BEQ @finish
    INX
    CMP #$2E
    BNE @check_star
    LDA DOS_TEMP_3
    BNE @bad_name
    INC DOS_TEMP_3
    CPY #$00
    BNE @dot_in_name
    LDY #$08
    JMP @next_char
@dot_in_name:
    CPY #$09
    BCS @bad_name
    LDA #$20
@pad_name:
    STA (STR_PTR_LO),Y
    INY
    CPY #$0B
    BNE @pad_name
    LDY #$08
    JMP @next_char
@check_star:
    CMP #$2A
    BNE @store_char
    LDA #$3F
    CPY #$08
    BCS @star_ext_fill
@star_name_fill:
    STA (STR_PTR_LO),Y
    INY
    CPY #$08
    BCC @star_name_fill
    JMP @next_char
@star_ext_fill:
    STA (STR_PTR_LO),Y
    INY
    CPY #$0B
    BCC @star_ext_fill
    JMP @finish
@store_char:
    CPY #$0B
    BCS @bad_name
    STA (STR_PTR_LO),Y
    INY
    JMP @next_char
@bad_name:
    LDA #$27
    STA DOS_ERROR
    JMP @done
@finish:
    CPY #$00
    BEQ @done
    LDA #$20
@pad_name_end:
    CPY #$08
    BCS @done
    STA (STR_PTR_LO),Y
    INY
    JMP @pad_name_end
@done:
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
; 作用：解析命令行尾 CMD_TAIL 里最多两个“[驱动器:]路径”与“/”开关：先清 CMD_SWITCH_FLAGS 与 CMD_ARG1_DRIVE 起的各缓冲，开关交给 CMD_PARSE_SWITCHES；第一个参数的驱动器放 CMD_ARG1_DRIVE、路径放 CMD_ARG1_PATH，第二个参数放 CMD_ARG2_DRIVE、CMD_ARG2_PATH；路径超过 24 个字符、文件名超过 12 个字符或开关写错时 DOS_ERROR=$25；最后把路径里最后一个“\”之后的部分拆出来作为文件名放 CMD_ARG1_NAME、CMD_ARG2_NAME。保存和恢复 A、X、Y。
; 输入：CMD_TAIL。
; 输出：CMD_SWITCH_FLAGS、CMD_ARG1_DRIVE、CMD_ARG1_PATH、CMD_ARG1_NAME、CMD_ARG2_DRIVE、CMD_ARG2_PATH、CMD_ARG2_NAME、DOS_ERROR。
; 调用者：CMD_CD、CMD_DIR、CMD_MD、CMD_RD、CALL_CMD_PARSE_PATH_ARG_5E（取地址）、CALL_CMD_PARSE_PATH_ARG（取地址）
CMD_PARSE_PATH_ARG:
    PHA
    TXA
    PHA
    TYA
    PHA
    LDX #$00
    LDA #$00
    STA CMD_SWITCH_FLAGS
    STA CMD_ARG1_DRIVE
    STA CMD_ARG2_DRIVE
    STA DOS_ERROR
    LDY #$00
@loop:
    STA CMD_ARG1_PATH,Y
    STA CMD_ARG2_PATH,Y
    INY
    CPY #$19
    BNE @loop
    LDY #$00
@clear_names:
    STA CMD_ARG1_NAME,Y
    STA CMD_ARG2_NAME,Y
    INY
    CPY #$0D
    BNE @clear_names
    JSR CMD_PARSE_SWITCHES
    LDA DOS_ERROR
    BEQ @parse_arg1
    JMP @done
@parse_arg1:
    LDY #$00
    LDA CMD_TAIL,X
    BNE @arg1_drive
    JMP @split_names
@arg1_drive:
    STA CMD_ARG1_DRIVE
    INX
    LDA CMD_TAIL,X
    INX
    CMP #$3A
    BEQ @copy_arg1
    DEX
    DEX
    LDA #$00
    STA CMD_ARG1_DRIVE
@copy_arg1:
    LDA CMD_TAIL,X
    BEQ @split_names
    CMP #$0D
    BEQ @split_names
    CMP #$2F
    BEQ @arg1_end
    CMP #$20
    BEQ @arg1_end
    STA CMD_ARG1_PATH,Y
    INX
    INY
    CPY #$19
    BCC @copy_arg1
    JMP @bad_arg
@arg1_end:
    LDA #$00
    STA CMD_ARG1_PATH,Y
    JSR CMD_PARSE_SWITCHES
    LDA DOS_ERROR
    BEQ @arg2_start
    JMP @done
@arg2_start:
    LDY #$00
    LDA CMD_TAIL,X
    STA CMD_ARG2_DRIVE
    INX
    LDA CMD_TAIL,X
    INX
    CMP #$3A
    BEQ @copy_arg2
    DEX
    DEX
    LDA #$00
    STA CMD_ARG2_DRIVE
@copy_arg2:
    LDA CMD_TAIL,X
    BEQ @split_names
    CMP #$0D
    BEQ @split_names
    CMP #$2F
    BEQ @arg2_end
    CMP #$20
    BEQ @arg2_end
    STA CMD_ARG2_PATH,Y
    INX
    INY
    CPY #$19
    BCC @copy_arg2
    JMP @bad_arg
@arg2_end:
    LDA #$00
    STA CMD_ARG2_PATH,Y
    JSR CMD_PARSE_SWITCHES
    LDA DOS_ERROR
    BEQ @split_names
    JMP @done
@bad_arg:
    LDA #$25
    STA DOS_ERROR
    JMP @done
@split_names:
    LDX #$00
    LDY #$00
@find_last_slash1:
    LDA CMD_ARG1_PATH,X
    BEQ @copy_name1_start
    INX
    CMP #$5C
    BNE @find_last_slash1
    TXA
    TAY
    JMP @find_last_slash1
@copy_name1_start:
    LDX #$00
@copy_name1:
    LDA CMD_ARG1_PATH,Y
    STA CMD_ARG1_NAME,X
    BEQ @split_arg2
    LDA #$00
    STA CMD_ARG1_PATH,Y
    INX
    INY
    CPX #$0D
    BCC @copy_name1
    JMP @bad_arg
@split_arg2:
    LDX #$00
    LDY #$00
@find_last_slash2:
    LDA CMD_ARG2_PATH,X
    BEQ @copy_name2_start
    INX
    CMP #$5C
    BNE @find_last_slash2
    TXA
    TAY
    JMP @find_last_slash2
@copy_name2_start:
    LDX #$00
@copy_name2:
    LDA CMD_ARG2_PATH,Y
    STA CMD_ARG2_NAME,X
    BEQ @done
    LDA #$00
    STA CMD_ARG2_PATH,Y
    INX
    INY
    CPX #$0D
    BCC @copy_name2
    JMP @bad_arg
@done:
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
; 作用：命令行开关字母表 Q、Y、V、W、B、A、P、?，序号即位号
; 引用者：CMD_PARSE_SWITCHES
CMD_SWITCH_LETTERS:
    .byte $51,$59,$56,$57,$42,$41,$50,$3F
; 作用：解析命令行里的“/”开关：开关字母在 CMD_SWITCH_LETTERS 的 8 项里找序号，把 $80 右移序号位后并入 CMD_SWITCH_FLAGS；字母不认识或后面还跟着别的字符时 DOS_ERROR=$25；开关“V”可以带“:卷标”，卷标放 CMD_VOLUME_TEXT。保存和恢复 A、Y。
; 输入：CMD_TAIL，X=CMD_TAIL 里的位置。
; 输出：CMD_SWITCH_FLAGS、CMD_VOLUME_TEXT、DOS_ERROR，X 指向解析后的位置。
; 调用者：CMD_PARSE_PATH_ARG
CMD_PARSE_SWITCHES:
    PHA
    TYA
    PHA
    LDA #$00
    STA DOS_ERROR
@loop:
    LDA CMD_TAIL,X
    BEQ @done
    CMP #$0D
    BEQ @done
    CMP #$20
    BNE @check_slash
    INX
    JMP @loop
@check_slash:
    CMP #$2F
    BNE @done
    INX
    LDA CMD_TAIL,X
    LDY #$00
@find_letter:
    CMP CMD_SWITCH_LETTERS,Y
    BEQ @letter_found
    INY
    CPY #$08
    BCC @find_letter
    LDA #$25
    STA DOS_ERROR
    JMP @done
@letter_found:
    LDA #$80
    CLC
@shift_bit:
    CPY #$00
    BEQ @store_flag
    LSR A
    DEY
    JMP @shift_bit
@store_flag:
    ORA CMD_SWITCH_FLAGS
    STA CMD_SWITCH_FLAGS
    LDA CMD_TAIL,X
    CMP #$56
    BEQ @volume_text
    INX
@check_rest:
    LDA CMD_TAIL,X
    BEQ @next_switch
    CMP #$20
    BEQ @next_switch
    CMP #$2F
    BEQ @next_switch
    LDA #$25
    STA DOS_ERROR
    JMP @done
@next_switch:
    JMP @loop
@volume_text:
    LDY #$00
    INX
    LDA CMD_TAIL,X
    CMP #$3A
    BNE @check_rest
@copy_volume:
    INX
    LDA CMD_TAIL,X
    BEQ @next_switch
    CMP #$20
    BEQ @next_switch
    CMP #$2F
    BEQ @next_switch
    STA CMD_VOLUME_TEXT,Y
    INY
    JMP @copy_volume
@done:
    PLA
    TAY
    PLA
    RTS
