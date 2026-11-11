; 作用：------------------------------------------------------------------------
; 名称：command-dispatch.asm
; 说明：命令行执行：内部命令名的查找与分发
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：在 ROM 里接在 dos-shell/shell-helpers.asm 之后
; ------------------------------------------------------------------------
; 把 DOS_CMD_NAME、空格、参数拼接后放回 CMD_TAIL，再按 DOS_CMD_INDEX 查 DOS_CMD_TABLE 跳转到内部命令的处理例程
; 输入：DOS_CMD_NAME、CMD_TAIL（参数）、DOS_CMD_INDEX（内部命令序号）。
; 调用者：SHELL_EXECUTE_LINE
DOS_RUN_COMMAND:
    LDX #$FF
@loop:
    INX
    LDA DOS_CMD_NAME,X
    STA CMD_FULL_PATH,X
    BNE @loop
    LDA #$20
    STA CMD_FULL_PATH,X
    LDY #$FF
@append_args:
    INY
    INX
    LDA CMD_TAIL,Y
    STA CMD_FULL_PATH,X
    BNE @append_args
    LDY #$00
@copy_full_path_to_tail:
    LDA CMD_FULL_PATH,Y
    STA CMD_TAIL,Y
    BEQ @copy_full_path_to_tail_done
    INY
    JMP @copy_full_path_to_tail
@copy_full_path_to_tail_done:
    LDA DOS_CMD_INDEX
    ASL A
    TAX
    LDA DOS_CMD_TABLE,X
    STA CALL_VEC_LO
    INX
    LDA DOS_CMD_TABLE,X
    STA CALL_VEC_HI
    JMP (CALL_VEC_LO)
; 作用：内部命令的入口地址表：第 N 项对应 DOS_CMD_NAMES 里的第 N 个命令名（从 0 起），每项 2 字节，处理例程以 RTS 返回外壳
; 紧随其后的 $876F 原来是一个多余的 2 字节（$AB5C），不属于任何命令名
; 引用者：DOS_RUN_COMMAND
DOS_CMD_TABLE:
    .word CMD_CLJS,CMD_EXIT,CMD_DIR,CMD_REN,CMD_REN,CMD_COPY,CMD_SBWIN,CMD_TYPE
    .word CMD_DEL,CMD_DEL,CMD_CLS,CMD_DATE,CMD_TIME,CMD_CD,CMD_CD,CMD_MD
    .word CMD_MD,CMD_RD,CMD_RD,CMD_DISKCOPY,CMD_REM,CMD_VER,CMD_HELP
    .byte $5C,$AB
; 作用：拆分命令行：第 2 个字符是“:”时把第 1 个字符存 SHELL_FIRST_CHAR；命令名转大写放 DOS_CMD_NAME，遇到“\”或“.”前的部分复制到 DOS_CMD_BASE，DOS_CMD_NAME 只留下后面的部分（扩展名或路径），参数转大写放回 CMD_TAIL
; 输入：CMD_TAIL（命令行）。
; 输出：SHELL_FIRST_CHAR、DOS_CMD_BASE、DOS_CMD_NAME、CMD_TAIL（参数），名称超过 24 个字符时 DOS_ERROR=$81。
; 调用者：SHELL_EXECUTE_LINE
DOS_PARSE_COMMAND:
    PHA
    TXA
    PHA
    TYA
    PHA
    LDA #$00
    STA DOS_ERROR
    LDX #$19
@loop:
    DEX
    STA DOS_CMD_BASE,X
    STA DOS_CMD_NAME,X
    BNE @loop
    LDY #$00
@skip_spaces:
    LDA CMD_TAIL,X
    CMP #$20
    BNE @read_first_char
    INX
    JMP @skip_spaces
@read_first_char:
    LDA CMD_TAIL
    STA SHELL_FIRST_CHAR
    INX
    LDA CMD_TAIL,X
    INX
    CMP #$3A
    BEQ @copy_name
    LDA #$00
    STA SHELL_FIRST_CHAR
    DEX
    DEX
@copy_name:
    LDA CMD_TAIL,X
    BEQ @name_end
    CMP #$0D
    BEQ @name_end
    CMP #$20
    BEQ @name_end
    CMP #$2F
    BEQ @name_end
    JSR TO_UPPER
    STA DOS_CMD_NAME,Y
    INX
    INY
    CPY #$19
    BCC @copy_name
    LDA #$81
    STA DOS_ERROR
    JMP @done
@name_end:
    LDA #$00
    STA DOS_CMD_NAME,Y
    LDY #$00
@copy_args:
    LDA CMD_TAIL,X
    BEQ @args_end
    CMP #$0D
    BEQ @args_end
    JSR TO_UPPER
    STA CMD_TAIL,Y
    INX
    INY
    JMP @copy_args
@args_end:
    LDA #$00
    STA CMD_TAIL,Y
    LDX #$00
@split_base:
    LDA DOS_CMD_NAME,X
    BEQ @base_done
    CMP #$5C
    BEQ @base_done
    CMP #$2E
    BEQ @base_done
    STA DOS_CMD_BASE,X
    INX
    JMP @split_base
@base_done:
    LDA #$00
    STA DOS_CMD_BASE,X
    LDY #$00
    DEX
    DEY
@shift_name:
    INX
    INY
    LDA DOS_CMD_NAME,X
    STA DOS_CMD_NAME,Y
    BNE @shift_name
@done:
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
; 作用：小写字母 a-z 转成大写，其他字符不变，保持标志位
; 输入：A=字符。
; 输出：A=转换后的字符。
; 调用者：DOS_PARSE_COMMAND
TO_UPPER:
    PHP
    CMP #$61
    BCC @done
    CMP #$7B
    BCS @done
    AND #$DF
@done:
    PLP
    RTS
; 作用：在 DOS_CMD_NAMES 里查找 DOS_CMD_BASE 里的命令名，序号放 DOS_CMD_INDEX；$FE 表示命令行为空，$FD 表示不是内部命令（按程序文件执行）
; 输入：SHELL_LINE_BUF、DOS_CMD_BASE、DOS_CMD_NAME、SHELL_FIRST_CHAR。
; 输出：DOS_CMD_INDEX。返回时 X 没有恢复（原程序弹栈后写的是 TXA 而不是 TAX）。
; 调用者：SHELL_EXECUTE_LINE
DOS_FIND_COMMAND:
    PHA
    TXA
    PHA
    TYA
    PHA
    LDY #$00
    STY DOS_CMD_INDEX
    LDA SHELL_LINE_BUF
    BEQ @empty_line
    LDA DOS_CMD_BASE
    BNE @has_base
    LDA DOS_CMD_NAME
    BEQ @empty_line
    LDA #$FD
    STA DOS_CMD_INDEX
    JMP @done
@empty_line:
    LDA #$FE
    STA DOS_CMD_INDEX
    JMP @done
@has_base:
    LDA SHELL_FIRST_CHAR
    BEQ @next_name
    JMP @not_internal
@next_name:
    LDX #$00
@compare:
    LDA DOS_CMD_NAMES,Y
    CMP #$FF
    BNE @compare_char
@not_internal:
    LDA #$FD
    STA DOS_CMD_INDEX
    JMP @done
@compare_char:
    CMP DOS_CMD_BASE,X
    BNE @differ
    LDA DOS_CMD_NAMES,Y
    BEQ @done
    INX
    INY
    JMP @compare
@differ:
    INC DOS_CMD_INDEX
@skip_name:
    LDA DOS_CMD_NAMES,Y
    BEQ @next
    INY
    JMP @skip_name
@next:
    INY
    JMP @next_name
@done:
    PLA
    TAY
    PLA
    TXA
    PLA
    RTS
; 作用：内部命令名表：每个名字以 0 结尾，表以 $FF 结束；同一个命令的别名（如 REN 与 RENAME）各占一项，地址表里也要各写一项
; 引用者：DOS_FIND_COMMAND
DOS_CMD_NAMES:
    .byte $43,$4C,$4A,$53,$00,$45,$58,$49,$54,$00,$44,$49,$52,$00,$52,$45
    .byte $4E,$00,$52,$45,$4E,$41,$4D,$45,$00,$43,$4F,$50,$59,$00,$53,$42
    .byte $2D,$57,$49,$4E,$00,$54,$59,$50,$45,$00,$44,$45,$4C,$00,$45,$52
    .byte $41,$53,$45,$00,$43,$4C,$53,$00,$44,$41,$54,$45,$00,$54,$49,$4D
    .byte $45,$00,$43,$44,$00,$43,$48,$44,$49,$52,$00,$4D,$44,$00,$4D,$4B
    .byte $44,$49,$52,$00,$52,$44,$00,$52,$4D,$44,$49,$52,$00,$44,$49,$53
    .byte $4B,$43,$4F,$50,$59,$00,$52,$45,$4D,$00,$56,$45,$52,$00,$48,$45
    .byte $4C,$50,$00,$FF
