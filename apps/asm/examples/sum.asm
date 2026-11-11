; SUM.ASM：把内存里的 10 个数相加，在控制台输出结果“1+2+...+10 = 55”。
; 汇编：ASM SUM      运行：SUM
; 演示读内存里的数据、循环累加，再把结果转成两位十进制数输出。
; 系统调用的地址、功能号等符号都在 SB2000.INC 里，要和本文件放在同一张磁盘上。

        .include "SB2000.INC"

START:
        LDX #0                  ; X：数据下标
        LDA #0                  ; A：累加和
ADD_LOOP:
        CLC
        ADC NUMBERS,X           ; 加上第 X 个数
        INX
        CPX #10
        BNE ADD_LOOP            ; 10 个数加完为止

        LDX #0                  ; X：十位数字，用反复减 10 求出
DIV_LOOP:
        CMP #10
        BCC DIV_DONE            ; 不足 10 时 A 就是个位数字
        SBC #10                 ; CMP 之后进位是置位的，可以直接减
        INX
        JMP DIV_LOOP
DIV_DONE:
        CLC
        ADC #$30                ; 加上 $30 变成 ASCII 数字
        STA RESULT+1
        TXA
        CLC
        ADC #$30
        STA RESULT

        LDA #<MSG
        LDX #>MSG
        JSR PRINT_LINE
        LDA #<HINT
        LDX #>HINT
        JSR PRINT_LINE
        LDA #FN_INPUT           ; 返回 DOS 时会清屏，所以先等待按键
        STA SYS_FUNCTION
        LDA #SUB_KEY_GET_WAIT
        STA SYS_SUBFUNCTION
        JSR SYSCALL
        RTS

; 从行首显示 X:A 指向的字符串（以 0 结尾），然后换行。
PRINT_LINE:
        STA STR_PTR_LO
        STX STR_PTR_HI
        LDA #$01
        STA CURSOR_COL
        LDA PROGRAM_START_PAGE
        STA LIB_GROUP
        LDA #<LIB_PRINT_STRING
        LDX #>LIB_PRINT_STRING
        JSR ROM_CALL
        LDA #$01
        STA CURSOR_COL
        LDA #<LIB_NEWLINE
        LDX #>LIB_NEWLINE

; 经系统调用执行 ROM 里 X:A 处的例程。
ROM_CALL:
        STA PROG_ENTRY_LO
        STX PROG_ENTRY_HI
        LDA #FN_CALL_BANKED
        STA SYS_FUNCTION
        LDA #$00
        STA SYS_GROUP
        JMP SYSCALL

; 要相加的 10 个数。
NUMBERS: .byte 1, 2, 3, 4, 5, 6, 7, 8, 9, 10

; 输出的字符串：RESULT 处的两个字符是运行时写入的十位和个位。
MSG:    .ascii "1+2+...+10 = "
RESULT: .ascii "00\0"

; GB2312 字节：“按任意键返回”，以 0 结尾。
HINT:   .ascii "\xB0\xB4\xC8\xCE\xD2\xE2\xBC\xFC\xB7\xB5\xBB\xD8\0"
