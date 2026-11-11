; ------------------------------------------------------------------------
; 名称：integer-multiply-divide.asm
; 说明：整数乘除法（功能 $54 用到）
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：占ROM 第 A-A 页，汇编地址 $8000 起，后面的文件接在它后面
; ------------------------------------------------------------------------
.org $8000
; 上一页末尾 INT_MUL_START 里 JSR INTMUL_CORE+4096 的第 3 个字节（目标地址的高字节）；该指令的前 2 个字节在上一页末尾，跨页
    .byte >INTMUL_CORE+4096
; INT_MUL_START 的最后一条 RTS 落在这里
    RTS
; 作用：把 $06A3-$06A8 清 0（整数乘法的结果区）
; 输入：无。
; 输出：A=$00，X=$07。
; 副作用：改写 $06A3-$06A8。
; 调用者：INT_MUL_START
INTMUL_CLEAR_RESULT:
    LDA #$00
    LDX #$01
@loop:
    STA INT_R_SIGN,X
    INX
    CPX #$07
    BCC @loop
    RTS
; 作用：$06A2 取 $069A 与 $069E 的异或（乘除结果的符号）
; 输入：INT_A_SIGN、INT_B_SIGN。
; 输出：A=乘积的符号字节。
; 副作用：改写 INT_R_SIGN。
; 调用者：INT_MUL_START
INTMUL_SET_SIGN:
    LDA INT_A_SIGN
    EOR INT_B_SIGN
    STA INT_R_SIGN
    RTS
; 作用：24 位乘法主体：循环 24 次，把 INT_B 右移，每移出 1 就把 INT_A 加进 INT_R，乘积移入 MATH_ARG_09-0E
; 输入：INT_A（被乘数）、INT_B（乘数）各 3 字节，乘积区已由 INTMUL_CLEAR_RESULT 清 0。
; 输出：48 位乘积在 MATH_ARG_09-0E（高位在前），Y=0。
; 副作用：改写 INT_B（被逐位移出）、INT_R 区与 MATH_ARG_09-0E。
; 调用者：INT_MUL_START（取地址）、integer-multiply-divide.asm 开头的入口代码（取地址）
INTMUL_CORE:
    LDY #$18
@loop:
    CLC
    LSR INT_B_0
    ROR INT_B_1
    ROR INT_B_2
    BCC @shift
    CLC
    LDX #$03
    PHP
@add_byte:
    LDA INT_A_SIGN,X
    PLP
    ADC INT_R_SIGN,X
    PHP
    STA INT_R_SIGN,X
    DEX
    BNE @add_byte
    PLP
@shift:
    ROR MATH_ARG_09
    ROR MATH_ARG_0A
    ROR MATH_ARG_0B
    ROR MATH_ARG_0C
    ROR MATH_ARG_0D
    ROR MATH_ARG_0E
    DEY
    BNE @loop
    RTS
; 作用：整数除法主流程：先清除法工作区，再检查除数是否为 0（为 0 直接返回），再计算商，最后写符号
; 输入：INT_A（被除数）、INT_B（除数）。
; 输出：除数不为 0 时商与符号由 INTDIV_COMPUTE、INTDIV_SET_SIGN 算出；除数为 0 时 INT_R_SIGN=$FF 并直接返回。
; 调用者：API_54
INTDIV_MAIN:
    JSR INTDIV_CLEAR+4096
    JSR INTDIV_CHECK_ZERO+4096
    BEQ @compute
    JMP INTDIV_RETURN+4096
@compute:
    JSR INTDIV_COMPUTE+4096
    JSR INTDIV_SET_SIGN+4096
; 作用：整数除法的返回出口（RTS）；上一页的除法例程以 JMP INTDIV_RETURN+4096 跳到这里。
; 调用者：INTDIV_MAIN
INTDIV_RETURN:
    RTS
; 作用：清除法工作区：INT_R_SIGN 起 9 字节与 MATH_ARG_10 清 0
; 输入：无。
; 输出：A=$00。
; 副作用：INT_R_SIGN 起 9 字节与 MATH_ARG_10 清 0。
; 调用者：INTDIV_MAIN
INTDIV_CLEAR:
    LDA #$00
    LDX #$00
@loop:
    STA INT_R_SIGN,X
    INX
    CPX #$09
    BCC @loop
    LDA #$00
    STA MATH_ARG_10
    RTS
; 作用：商的符号：INT_A 与 INT_B 的符号异或，存入 MATH_ARG_09
; 输入：INT_A_SIGN、INT_B_SIGN。
; 输出：A=商的符号字节。
; 副作用：改写 MATH_ARG_09。
; 调用者：INTDIV_MAIN
INTDIV_SET_SIGN:
    LDA INT_A_SIGN
    EOR INT_B_SIGN
    STA MATH_ARG_09
    RTS
; 作用：检查除数 INT_B 的 3 个字节：全为 0 时 INT_R_SIGN 置 $FF 并返回（A=$FF，Z=0），否则 INT_R_SIGN 置 0 并返回（A=0，Z=1）
; 输入：INT_B（除数）。
; 副作用：改写 INT_R_SIGN。
; 调用者：INTDIV_MAIN
INTDIV_CHECK_ZERO:
    LDX #$00
@loop:
    LDA INT_B_0,X
    BNE @nonzero
    INX
    CPX #$03
    BNE @loop
    LDA #$FF
    STA INT_R_SIGN
    RTS
@nonzero:
    LDA #$00
    STA INT_R_SIGN
    RTS
; 作用：算商：把 INT_A、INT_B 等压栈后各用功能 $50 的子功能 $50、$4F 做两次 VEC_SYSCALL，结果写回 MATH_ARG_0A-0D 与 INT_A、INT_B
; 输入：INT_A（被除数）、INT_B（除数，不为 0）。
; 副作用：两次调用 VEC_SYSCALL，改写 SYS_FUNCTION、SYS_SUBFUNCTION、INT_A、INT_B、MATH_ARG_09-0D 与 MATH_ARG_24-2B 工作区。
; 调用者：INTDIV_MAIN
INTDIV_COMPUTE:
    LDA INT_A_SIGN
    PHA
    LDA INT_B_SIGN
    PHA
    LDX #$07
@push_operands:
    LDA INT_A_SIGN,X
    PHA
    DEX
    BNE @push_operands
    LDA #$00
    STA INT_A_1
    STA INT_A_2
    LDX #$00
@pop_divisor:
    PLA
    STA INT_B_SIGN,X
    STA MATH_ARG_24,X
    INX
    CPX #$03
    BNE @pop_divisor
    PLA
    LDX #$00
@pop_dividend:
    PLA
    STA MATH_ARG_0B,X
    STA MATH_ARG_2B,X
    INX
    CPX #$03
    BNE @pop_dividend
    LDA #$00
    STA MATH_ARG_09
    STA MATH_ARG_0A
    LDA #$50
    STA SYS_SUBFUNCTION
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDX #$00
@save_quotient:
    LDA MATH_ARG_10,X
    STA INT_A_1,X
    PHA
    INX
    CPX #$05
    BCC @save_quotient
    LDA #$00
    STA MATH_ARG_09
    STA MATH_ARG_0A
    LDX #$00
@copy_divisor:
    LDA MATH_ARG_2B,X
    STA MATH_ARG_0B,X
    INX
    CPX #$03
    BCC @copy_divisor
    LDA #$50
    STA SYS_SUBFUNCTION
    LDA #$4F
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDX #$02
    SEC
@subtract:
    LDA MATH_ARG_24,X
    SBC MATH_ARG_12,X
    STA MATH_ARG_0D,X
    DEX
    BPL @subtract
    PLA
    STA MATH_ARG_0C
    PLA
    STA MATH_ARG_0B
    PLA
    STA MATH_ARG_0A
    PLA
    PLA
    PLA
    STA INT_B_SIGN
    PLA
    STA INT_A_SIGN
    RTS
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
