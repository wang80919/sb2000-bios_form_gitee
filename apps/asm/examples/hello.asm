; HELLO.ASM：在控制台输出“你好，小霸王！”。
; 汇编：ASM HELLO      运行：HELLO
; 系统调用的地址、功能号等符号都在 SB2000.INC 里，要和本文件放在同一张磁盘上。

        .include "SB2000.INC"

START:
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

; 下面两个字符串是 GB2312 字节：“你好，小霸王！”和“按任意键返回”，各以 0 结尾。
MSG:    .ascii "\xC4\xE3\xBA\xC3\xA3\xAC\xD0\xA1\xB0\xD4\xCD\xF5\xA3\xA1\0"
HINT:   .ascii "\xB0\xB4\xC8\xCE\xD2\xE2\xBC\xFC\xB7\xB5\xBB\xD8\0"
