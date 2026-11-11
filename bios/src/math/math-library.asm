; 作用：------------------------------------------------------------------------
; 名称：math-library.asm
; 说明：数学库（功能 $4A-$54）：随机数、二进制与十进制转换、40.40 定点与浮点运算、直线步进与整数运算
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：在 ROM 里接在 display/cell-display.asm 之后
; ------------------------------------------------------------------------
; 页内的内联跳转表副本：返回地址后跟 16 位地址表，按 A 取项并跳转
; 输入：A=跳转表项序号（从 0 起）；调用它的 JSR 后面紧跟 16 位地址表（低字节在前）。
; 输出：不返回调用点，直接跳到表项里的地址。
; 副作用：弹出返回地址，改写 CALL_VEC_LO、CALL_VEC_HI、Y。
; 调用者：CELL_COMBINE_ATTR
MATH_INLINE_JUMP:
    ASL A
    TAY
    PLA
    STA CALL_VEC_LO
    PLA
    STA CALL_VEC_HI
    INY
    LDA (CALL_VEC_LO),Y
    PHA
    INY
    LDA (CALL_VEC_LO),Y
    STA CALL_VEC_HI
    PLA
    STA CALL_VEC_LO
    JMP (CALL_VEC_LO)
; 作用：功能 $4A：伪随机数：子功能不为 0 步进一次 32 位移位寄存器 $0696-$0699；子功能 0 连步进 100 次（预热）
; 输入：SYS_SUBFUNCTION。
; 输出：RAND32_STATE_0-3 为新的随机数状态。
; 调用者：CELL_COMBINE_ATTR（地址表）
API_4A:
    LDA SYS_SUBFUNCTION
    BEQ RAND32_WARM_UP
; 作用：32 位伪随机数步进：RAND32_STATE_0-3 当作移位寄存器，STATE_0 与 STATE_1 的位 1 异或后从最高位移入；STATE_0、STATE_1 都为 0 时先把 STATE_1 置 $FF（功能 $4A 用）。
; 输入：RAND32_STATE_0-3。
; 输出：RAND32_STATE_0-3 整体右移一位。
; 副作用：改写 A、DRAW_MODE_TEMP。
; 调用者：RAND32_WARM_UP、API_4A（顺序执行到这里）
RAND32_STEP:
    LDA RAND32_STATE_0
    BNE @seeded
    LDA RAND32_STATE_1
    BNE @seeded
    LDA #$FF
    STA RAND32_STATE_1
@seeded:
    LDA RAND32_STATE_0
    AND #$02
    STA DRAW_MODE_TEMP
    LDA RAND32_STATE_1
    AND #$02
    EOR DRAW_MODE_TEMP
    CLC
    BEQ @shift
    SEC
@shift:
    ROR RAND32_STATE_0
    ROR RAND32_STATE_1
    ROR RAND32_STATE_2
    ROR RAND32_STATE_3
    RTS
; 作用：功能 $4A 子功能 0：随机数发生器空转 100 步
; 输入：无。
; 副作用：RAND32_STEP 连续步进 100 次，X=0。
; 调用者：API_4A
RAND32_WARM_UP:
    LDX #$64
@loop:
    JSR RAND32_STEP
    DEX
    BNE @loop
    RTS
; 作用：功能 $4B：16 位除以 8 位。
; 输入：MATH_ARG_00=被除数低字节，MATH_ARG_01=被除数高字节，MATH_ARG_02=除数。
; 输出：商回写 MATH_ARG_00（低）、MATH_ARG_01（高），余数写 MATH_ARG_02，SYS_STATUS=0；除数为 0 时 SYS_STATUS=$FF、MATH_ARG_01=$FF，其余不变。
; 副作用：A、X 经栈保存并恢复。
; 调用者：CELL_COMBINE_ATTR（地址表）
API_4B:
    PHA
    TXA
    PHA
    LDA MATH_ARG_02
    BNE @divide
    LDA #$FF
    STA SYS_STATUS
    STA MATH_ARG_01
    BNE @done
@divide:
    LDA #$00
    STA SYS_STATUS
    LDX #$10
    CLC
@loop:
    ROL MATH_ARG_00
    ROL MATH_ARG_01
    ROL A
    BCS @subtract
    CMP MATH_ARG_02
    BCC @next_bit
@subtract:
    SBC MATH_ARG_02
    SEC
@next_bit:
    DEX
    BNE @loop
    ROL MATH_ARG_00
    ROL MATH_ARG_01
    STA MATH_ARG_02
@done:
    PLA
    TAX
    PLA
    RTS
; 作用：功能 $4C：把时、分、秒各转成两位十进制，用冒号隔开，写成 “HH:MM:SS”。
; 输入：MATH_ARG_00=时，MATH_ARG_01=分，MATH_ARG_02=秒（各 0-99）。
; 输出：MATH_ARG_10-17 为 8 个 ASCII 字符。
; 副作用：改写 MATH_ARG_03-06；A、X 经栈保存并恢复。
; 调用者：CELL_COMBINE_ATTR（地址表）
API_4C:
    PHA
    TXA
    PHA
    LDA MATH_ARG_00
    STA MATH_ARG_03
    JSR BIN_TO_DEC3
    LDA MATH_ARG_05
    STA MATH_ARG_10
    LDA MATH_ARG_04
    STA MATH_ARG_11
    LDA #$3A
    STA MATH_ARG_12
    LDA MATH_ARG_01
    STA MATH_ARG_03
    JSR BIN_TO_DEC3
    LDA MATH_ARG_05
    STA MATH_ARG_13
    LDA MATH_ARG_04
    STA MATH_ARG_14
    LDA #$3A
    STA MATH_ARG_15
    LDA MATH_ARG_02
    STA MATH_ARG_03
    JSR BIN_TO_DEC3
    LDA MATH_ARG_05
    STA MATH_ARG_16
    LDA MATH_ARG_04
    STA MATH_ARG_17
    PLA
    TAX
    PLA
    RTS
; 作用：把 0-255 转成三位十进制字符（功能 $4C 用）。
; 输入：MATH_ARG_03=数值。
; 输出：MATH_ARG_06=百位字符，MATH_ARG_05=十位字符，MATH_ARG_04=个位字符。
; 副作用：A、X 经栈保存并恢复。
; 调用者：API_4C
BIN_TO_DEC3:
    PHA
    TXA
    PHA
    LDA MATH_ARG_03
    LDX #$00
    SEC
@hundreds:
    SBC #$64
    BCC @tens_start
    INX
    BCS @hundreds
@tens_start:
    STX MATH_ARG_06
    ADC #$64
    LDX #$00
    SEC
@tens:
    SBC #$0A
    BCC @digits_done
    INX
    BCS @tens
@digits_done:
    ADC #$3A
    STA MATH_ARG_04
    TXA
    ORA #$30
    STA MATH_ARG_05
    LDA MATH_ARG_06
    ORA #$30
    STA MATH_ARG_06
    PLA
    TAX
    PLA
    RTS
; 作用：功能 $4D：十进制字符串（MATH_ARG_00 起）转数值。
; 输入：SYS_SUBFUNCTION：0 完整转换（符号、小数点、整数与小数部分），1 只把数字串转成 40 位整数，2 只把小数转成 40 位小数；字符串格式见 系统调用手册功能 $4D。
; 输出：子功能 0 的 7 字节浮点数放 MATH_ARG_0E 起，子功能 1 的整数放 MATH_ARG_10-14，子功能 2 的小数放 MATH_ARG_15-19；符号字符不是“-”或空格时 SYS_STATUS=$FF。
; 调用者：CELL_COMBINE_ATTR（地址表）
API_4D:
    LDA SYS_SUBFUNCTION
    BEQ @full
    CMP #$01
    BEQ @bin40_only
    CMP #$02
    BEQ @fixed_only
    RTS
@bin40_only:
    JMP DEC_STR_TO_BIN40
@fixed_only:
    JMP DEC_STRING_TO_FIXED
@full:
    JSR STR_PARSE_SIGN
    JSR STR_FIND_DOT
    JSR DEC_STR_TO_BIN40
    LDA MATH_ARG_1D
    STA MATH_ARG_00
    LDA SYS_STATUS
    PHA
    JSR DEC_STRING_TO_FIXED
    JSR FP_NORMALIZE_LEFT
    PLA
    BEQ @return
    STA SYS_STATUS
@return:
    RTS
; 作用：把 MATH_ARG_10-19 这 10 字节的尾数整体左移，直到最高位为 1（最多 40 次）。
; 输出：MATH_ARG_0E=40 减去实际左移的位数。
; 调用者：API_4D
FP_NORMALIZE_LEFT:
    LDA #$28
    STA MATH_ARG_0E
@loop:
    LDA MATH_ARG_10
    BMI @return
    LDX #$09
@shift:
    ROL MATH_ARG_10,X
    DEX
    BPL @shift
    DEC MATH_ARG_0E
    BNE @loop
@return:
    RTS
; 作用：在 MATH_ARG_01 起的字符串里找小数点（最多 13 个字符）；没有小数点时整个字符串前移一位，并在末尾补上小数点。
; 输入：MATH_ARG_01 起的字符串。
; 输出：MATH_ARG_00=整数位数，MATH_ARG_1D=12 减整数位数（小数位数）。
; 调用者：API_4D
STR_FIND_DOT:
    LDY #$00
@search:
    LDA MATH_ARG_01,Y
    CMP #$2E
    BEQ @found
    INY
    CPY #$0D
    BNE @search
    TXA
    PHA
    LDX #$00
@move:
    LDA MATH_ARG_01,X
    STA MATH_ARG_00,X
    INX
    CPX #$0D
    BNE @move
    LDA #$2E
    STA MATH_ARG_0D
    PLA
    TAX
    DEY
@found:
    STY MATH_ARG_00
    STY MATH_ARG_1D
    LDA #$0C
    SEC
    SBC MATH_ARG_1D
    STA MATH_ARG_1D
    RTS
; 作用：看 MATH_ARG_00 的符号字符：“-”把符号字节 MATH_ARG_0F 置 $FF，空格置 0；其他字符时 SYS_STATUS=$FF，符号字节也置 $FF。
; 输入：MATH_ARG_00=符号字符。
; 输出：MATH_ARG_0F=符号字节，SYS_STATUS=0 或 $FF。
; 调用者：API_4D
STR_PARSE_SIGN:
    LDA #$00
    STA SYS_STATUS
    LDA MATH_ARG_00
    CMP #$2D
    BEQ @negative
    CMP #$20
    BEQ @positive
    LDA #$FF
    STA SYS_STATUS
@negative:
    LDA #$FF
@store_sign:
    STA MATH_ARG_0F
    RTS
@positive:
    LDA #$00
    JMP @store_sign
; 作用：把 MATH_ARG_01 起的数字串转成 40 位整数：先 DEC_PARSE_INIT，数字个数为 0 就返回，否则补前导 0、转成数字值，再按位权累加。
; 输入：MATH_ARG_00 的低 4 位=数字个数 n，MATH_ARG_01 起是 n 个字符（前导空格当 0）。
; 输出：MATH_ARG_10-14 为 40 位整数（高字节在前），SYS_STATUS=0；n 为 0 时结果为 0。
; 调用者：API_4D、DEC_STRING_TO_FIXED
DEC_STR_TO_BIN40:
    JSR DEC_PARSE_INIT
    TXA
    BEQ @return
    JSR DEC_FILL_LEADING_ZERO
    JSR DEC_ASCII_TO_DIGIT
    JSR DEC_ACCUMULATE
@return:
    RTS
; 作用：按位权表累加：对每一位数字，把相应位权（5 字节）累加数字值次。
; 输入：X=数字个数，MATH_ARG_01 为最高位、MATH_ARG_00+X 为最低位，每位是数字值 0-9。
; 输出：MATH_ARG_10-14 加上该数的 40 位值，X=0。
; 副作用：各位数字被逐次减到 0，改写 MATH_ARG_1F。
; 调用者：DEC_STR_TO_BIN40
DEC_ACCUMULATE:
    LDA #$40
    STA MATH_ARG_1F
@digit:
    LDA MATH_ARG_00,X
    BEQ @next_digit
@add_weight:
    JSR ADD_POW10
    DEC MATH_ARG_00,X
    BNE @add_weight
@next_digit:
    LDA MATH_ARG_1F
    CLC
    ADC #$FB
    STA MATH_ARG_1F
    DEX
    BNE @digit
    RTS
; 作用：把串首的空格改成字符 0（最多 X 个）
; 输入：X=串的长度，串在 MATH_ARG_01 起。
; 调用者：DEC_STR_TO_BIN40
DEC_FILL_LEADING_ZERO:
    STX MATH_ARG_1C
    LDY #$00
@loop:
    LDA MATH_ARG_01,Y
    CMP #$20
    BNE @return
    LDA #$30
    STA MATH_ARG_01,Y
    INY
    CPY MATH_ARG_1C
    BCC @loop
@return:
    RTS
; 作用：把 MATH_ARG_01 起 X 个字符的高 4 位清掉，变成数字值 0-9。
; 输入：X=字符个数。
; 调用者：DEC_STR_TO_BIN40
DEC_ASCII_TO_DIGIT:
    TXA
    TAY
@loop:
    LDA MATH_ARG_00,Y
    AND #$0F
    STA MATH_ARG_00,Y
    DEY
    BNE @loop
    RTS
; 作用：把位权表 DEC_POW10_TABLE 里的一项（5 字节，高字节在前）加到 MATH_ARG_10-14（40 位累加器）。
; 输入：MATH_ARG_1F=该项最后一个字节在表里的偏移（项号×5+4）。
; 输出：MATH_ARG_10-14 加上该项。
; 副作用：X 经栈保存并恢复，改写 Y。
; 调用者：DEC_ACCUMULATE
ADD_POW10:
    TXA
    PHA
    LDX #$04
    LDY MATH_ARG_1F
    CLC
@loop:
    LDA DEC_POW10_TABLE,Y
    ADC MATH_ARG_10,X
    STA MATH_ARG_10,X
    DEY
    DEX
    BPL @loop
    PLA
    TAX
    RTS
; 作用：清 MATH_ARG_10-14 与 SYS_STATUS，X 取 MATH_ARG_00 的低 4 位（数字个数）。
; 输出：X=数字个数，A=X。
; 调用者：DEC_STR_TO_BIN40
DEC_PARSE_INIT:
    LDY #$05
    AND #$00
    STA SYS_STATUS
@loop:
    STA MATH_ARG_0F,Y
    DEY
    BNE @loop
    LDA MATH_ARG_00
    AND #$0F
    TAX
    RTS
; 作用：$4D 子功能 2 的主体（子功能 0 也调用）：把“小数点加 n 位小数”的串转成 40 位二进制小数放 MATH_ARG_15-19，MATH_ARG_10-14 先压栈、最后恢复（用例 p09-decimal.mjs）。
; 输入：MATH_ARG_00 的低 4 位=小数位数 n，其后是小数点与 n 位小数。
; 输出：MATH_ARG_15-19 为 40 位小数。
; 调用者：API_4D
DEC_STRING_TO_FIXED:
    LDY #$04
@save_loop:
    LDA MATH_ARG_10,Y
    PHA
    DEY
    BPL @save_loop
    JSR STR_INIT_PARSE
    LDA MATH_ARG_1A
    BEQ @restore
    JSR STR_SKIP_TO_FRACTION
    JSR DEC_STR_TO_BIN40
    JSR DEC_FRACTION_CONVERT
@restore:
    LDY #$00
@restore_loop:
    PLA
    STA MATH_ARG_10,Y
    INY
    CPY #$05
    BCC @restore_loop
    RTS
; 作用：转换小数部分（用例 p09-decimal.mjs 逐位与独立的整数算术比对）：把 MATH_ARG_10-14 里的十进制小数（以 10^12 为满刻度）转成 40 位二进制小数放 MATH_ARG_15-19；每次把被除数左移 4 位，再反复减 10^12 取商，得到一个十六进制位，共 10 位。
; 输入：MATH_ARG_10-14=小数部分的 40 位整数。
; 输出：MATH_ARG_15-19 为 40 位二进制小数。
; 调用者：DEC_STRING_TO_FIXED
DEC_FRACTION_CONVERT:
    LDX #$00
    STX MATH_ARG_1F
    STX MATH_ARG_1B
    STX MATH_ARG_0D
@next_nibble:
    JSR SHIFT_LEFT_4_BITS
@divide_step:
    LDA MATH_ARG_0D
    BNE @subtract
    LDA #$00
    STA MATH_ARG_1C
    JSR BIN40_CMP_POW
    BCS @subtract
    LDA #$FF
    EOR MATH_ARG_1B
    STA MATH_ARG_1B
    BPL @next_byte
    ASL MATH_ARG_15,X
    ASL MATH_ARG_15,X
    ASL MATH_ARG_15,X
    ASL MATH_ARG_15,X
    JMP @next_nibble
@next_byte:
    INX
    CPX #$05
    BCC @next_nibble
    JMP @return
@subtract:
    LDA #$04
    STA MATH_ARG_1C
    JSR BIN40_SUB_POW
    BCS @count
    DEC MATH_ARG_0D
@count:
    INC MATH_ARG_15,X
    JMP @divide_step
@return:
    RTS
; 作用：把 MATH_ARG_10-14 的 40 位数左移 4 位，移出的位依次进入 MATH_ARG_0D（溢出字节）。
; 副作用：改写 MATH_ARG_0D、Y=0。
; 调用者：DEC_FRACTION_CONVERT
SHIFT_LEFT_4_BITS:
    LDY #$04
@loop:
    ASL MATH_ARG_14
    ROL MATH_ARG_13
    ROL MATH_ARG_12
    ROL MATH_ARG_11
    ROL MATH_ARG_10
    ROL MATH_ARG_0D
    DEY
    BNE @loop
    RTS
; 作用：在 MATH_ARG_00 起的串里找到小数点，把小数点之后的 MATH_ARG_1A 个数字前移到 MATH_ARG_01 起，剩余位补字符 0，直到 MATH_ARG_0D。
; 输入：MATH_ARG_1A=小数位数。
; 调用者：DEC_STRING_TO_FIXED
STR_SKIP_TO_FRACTION:
    LDY #$01
@search_dot:
    LDA MATH_ARG_00,Y
    CMP #$2E
    BEQ @found_dot
    INY
    CPY #$0D
    BNE @search_dot
@found_dot:
    INY
    LDX #$01
@copy:
    LDA MATH_ARG_00,Y
    STA MATH_ARG_00,X
    INX
    INY
    DEC MATH_ARG_1A
    BNE @copy
    LDA #$30
@pad:
    STA MATH_ARG_00,X
    INX
    CPX #$0E
    BCC @pad
    RTS
; 作用：清 SYS_STATUS 与 MATH_ARG_15-19，MATH_ARG_1A 取 MATH_ARG_00 的低 4 位（小数位数），MATH_ARG_00 的低 4 位改写成 $0C（整数部分按 12 位处理）。
; 调用者：DEC_STRING_TO_FIXED
STR_INIT_PARSE:
    LDA #$00
    STA SYS_STATUS
    LDY #$05
@loop:
    STA MATH_ARG_14,Y
    DEY
    BNE @loop
    LDA MATH_ARG_00
    AND #$0F
    STA MATH_ARG_1A
    LDA MATH_ARG_00
    AND #$F0
    ORA #$0C
    STA MATH_ARG_00
    RTS
; 作用：功能 $4E：数值转十进制字符串，结果在 MATH_ARG_00 起。
; 输入：SYS_SUBFUNCTION：0 把浮点数（MATH_ARG_0E 起）转成带小数点的字符串，1 把 MATH_ARG_15-19 的 40 位整数转成十进制，2 用移位法把 40 位小数转成十进制小数位；各子功能的详细格式见 系统调用手册功能 $4E。
; 输出：十进制字符串在 MATH_ARG_00 起；不能完整表示时 SYS_STATUS=$FF。
; 调用者：CELL_COMBINE_ATTR（地址表）
API_4E:
    JSR FP_DENORMALIZE
    LDA SYS_SUBFUNCTION
    BEQ @float
    CMP #$01
    BEQ @bin40
    CMP #$02
    BEQ @shift_method
    RTS
@bin40:
    JMP BIN40_TO_DEC_STRING
@shift_method:
    JMP BIN_TO_DEC_SHIFT
@float:
    JSR DEC_CLEAR_OUT
    LDA MATH_ARG_0E
    BEQ @integer_part
@shift_value:
    JSR SHIFT_LEFT_TWO_ACC
    DEC MATH_ARG_0E
    BNE @shift_value
@integer_part:
    JSR BIN40_TO_DEC_STRING
    LDX MATH_ARG_00
    INX
    LDA #$2E
    STA MATH_ARG_00,X
    INX
    STX MATH_ARG_00
    LDX #$05
@move_remainder:
    LDA MATH_ARG_0F,X
    STA MATH_ARG_14,X
    DEX
    BNE @move_remainder
    LDA SYS_STATUS
    PHA
    JSR BIN_TO_DEC_SHIFT
    PLA
    BEQ @sign
    STA SYS_STATUS
@sign:
    LDA MATH_ARG_0F
    BEQ @positive
    CMP #$FF
    BEQ @negative
    LDA #$FF
    STA SYS_STATUS
@negative:
    LDA #$2D
    BNE @store_sign
@positive:
    LDA #$20
@store_sign:
    STA MATH_ARG_00
    RTS
; 作用：清 MATH_ARG_15-19，再转到 MATH_CLEAR_OPERANDS 清 SYS_STATUS 与 MATH_ARG_01-0D（功能 $4E 子功能 0 用）。
; 调用者：API_4E
DEC_CLEAR_OUT:
    LDX #$19
    LDA #$00
@loop:
    STA MATH_ARG_00,X
    DEX
    CPX #$14
    BNE @loop
    JMP MATH_CLEAR_OPERANDS
; 作用：把 MATH_ARG_10-14 整体左移 1 位，移出的最高位再移入 MATH_ARG_15-19（它也整体左移 1 位）。
; 副作用：X=0。
; 调用者：API_4E
SHIFT_LEFT_TWO_ACC:
    CLC
    LDX #$05
@shift_10_14:
    ROL MATH_ARG_0F,X
    DEX
    BNE @shift_10_14
    LDX #$05
@shift_15_19:
    ROL MATH_ARG_14,X
    DEX
    BNE @shift_15_19
    RTS
; 作用：把 MATH_ARG_15-19 的 40 位整数按位权表 DEC_POW10_TABLE 逐位相减，转成十进制字符串放 MATH_ARG_01 起（共 13 位，第 13 位取自 MATH_ARG_19 的余数），再去掉前导 0（DEC_TRIM_LEADING_ZEROS），把数字移到串首、右边补字符 0（DEC_LEFT_ALIGN）。
; 输入：MATH_ARG_15-19=40 位整数。
; 输出：MATH_ARG_00=去掉前导 0 后的有效位数，MATH_ARG_01 起为数字字符；整数不小于 10^12 时 SYS_STATUS=$FF；X=0。
; 调用者：API_4E
BIN40_TO_DEC_STRING:
    JSR DEC_STR_CLEAR
    LDA #$00
    STA MATH_ARG_1F
    LDX #$01
@digit:
    LDA #$05
    STA MATH_ARG_1C
    JSR BIN40_CMP_POW
    BCC @digit_done
    LDA #$09
    STA MATH_ARG_1C
    JSR BIN40_SUB_POW
    INC MATH_ARG_00,X
    JMP @digit
@digit_done:
    LDA MATH_ARG_00,X
    ORA #$30
    STA MATH_ARG_00,X
    LDA MATH_ARG_1F
    CLC
    ADC #$05
    STA MATH_ARG_1F
    INX
    CPX #$0D
    BCC @digit
    LDA MATH_ARG_19
    ORA #$30
    STA MATH_ARG_0D
    LDA MATH_ARG_01
    CMP #$30
    BEQ @trim
    LDA #$FF
    STA SYS_STATUS
@trim:
    JSR DEC_TRIM_LEADING_ZEROS
    JSR DEC_LEFT_ALIGN
    LDX #$00
    RTS
; 作用：去掉十进制串前面的字符 0，每去掉一个 MATH_ARG_00 减 1（至少保留第一位）。
; 调用者：BIN40_TO_DEC_STRING
DEC_TRIM_LEADING_ZEROS:
    LDX #$02
@loop:
    LDA MATH_ARG_00,X
    CMP #$30
    BNE @return
    DEC MATH_ARG_00
    INX
    CPX #$0E
    BCC @loop
@return:
    RTS
; 作用：把去掉前导 0 后剩下的 MATH_ARG_00 个数字移到串首（左对齐），右边空出的位置补字符 0；MATH_ARG_00 为 0 时先改成 1。
; 调用者：BIN40_TO_DEC_STRING
DEC_LEFT_ALIGN:
    LDA MATH_ARG_00
    BNE @has_digits
    INC MATH_ARG_00
@has_digits:
    LDA #$0E
    SEC
    SBC MATH_ARG_00
    TAY
    LDX #$01
@loop:
    LDA MATH_ARG_00,Y
    STA MATH_ARG_00,X
    INY
    INX
    CPY #$0E
    BNE @loop
@pad_zero:
    LDA #$30
    STA MATH_ARG_00,X
    INX
    CPX #$0E
    BNE @pad_zero
    RTS
; 作用：MATH_ARG_00 置 $0C，再落入 MATH_CLEAR_OPERANDS：清 SYS_STATUS 与 MATH_ARG_01-0D。
; 调用者：BIN40_TO_DEC_STRING
DEC_STR_CLEAR:
    LDA #$0C
    STA MATH_ARG_00
; 作用：SYS_STATUS 清 0，MATH_ARG_01-0D（13 字节）清 0。
; 输出：A=$00，Y=$00。
; 调用者：DEC_CLEAR_OUT、DEC_STR_CLEAR（顺序执行到这里）
MATH_CLEAR_OPERANDS:
    LDY #$0D
    LDA #$00
    STA SYS_STATUS
@loop:
    STA MATH_ARG_00,Y
    DEY
    BNE @loop
    RTS
; 作用：从 40 位累加器里减去位权表 DEC_POW10_TABLE 的一项（5 字节），从低字节到高字节逐字节相减，借位向前传。
; 输入：MATH_ARG_1C=累加器最后一个字节相对 MATH_ARG_10 的偏移（4 表示 MATH_ARG_10-14，9 表示 MATH_ARG_15-19），MATH_ARG_1F=该项第一个字节在表里的偏移（项号×5）。
; 输出：差写回累加器，最高字节相减后的 C 表示是否没有借位。
; 副作用：X 经栈保存并恢复，改写 MATH_ARG_1E、Y。
; 调用者：DEC_FRACTION_CONVERT、BIN40_TO_DEC_STRING
BIN40_SUB_POW:
    TXA
    PHA
    LDX MATH_ARG_1C
    LDA #$04
    STA MATH_ARG_1E
    CLC
    ADC MATH_ARG_1F
    TAY
    SEC
@loop:
    LDA MATH_ARG_10,X
    SBC DEC_POW10_TABLE,Y
    STA MATH_ARG_10,X
    DEX
    DEY
    DEC MATH_ARG_1E
    BPL @loop
    PLA
    TAX
    RTS
; 作用：比较 40 位累加器与位权表 DEC_POW10_TABLE 的一项（高字节先比）。
; 输入：MATH_ARG_1C=累加器第一个字节相对 MATH_ARG_10 的偏移（0 表示 MATH_ARG_10-14，5 表示 MATH_ARG_15-19），MATH_ARG_1F=该项第一个字节在表里的偏移（项号×5）。
; 输出：累加器大于等于该项时 C=1，否则 C=0。
; 副作用：X 经栈保存并恢复，改写 MATH_ARG_1E、Y。
; 调用者：DEC_FRACTION_CONVERT、BIN40_TO_DEC_STRING
BIN40_CMP_POW:
    TXA
    PHA
    LDX MATH_ARG_1C
    LDY MATH_ARG_1F
    LDA #$04
    STA MATH_ARG_1E
@loop:
    LDA MATH_ARG_10,X
    CMP DEC_POW10_TABLE,Y
    BNE @done
    INX
    INY
    DEC MATH_ARG_1E
    BPL @loop
@done:
    PLA
    TAX
    RTS
; 作用：用移位法把 MATH_ARG_15-19 的 40 位小数转成十进制小数位：从 MATH_ARG_00+X 起逐位，每位把小数乘 10（左移 1 位加左移 3 位），溢出的整数部分加 $30 写成字符。
; 输入：MATH_ARG_00 的低 4 位=起始位置 X；X 不小于 14 时不转换。
; 输出：MATH_ARG_00+X 起到 MATH_ARG_0D 为十进制数字字符，MATH_ARG_15-19 为乘 10 后的小数余数。
; 调用者：API_4E
BIN_TO_DEC_SHIFT:
    LDA MATH_ARG_00
    AND #$0F
    TAX
    CPX #$0E
    BCC @convert
    JMP @return
@convert:
    JSR CLEAR_FROM_Y
@next_digit:
    JSR SHIFT_BIN_INTO_DIGIT
    LDA MATH_ARG_00,X
    PHA
    LDY #$15
@push_fraction:
    LDA MATH_ARG_00,Y
    PHA
    INY
    CPY #$1A
    BNE @push_fraction
    JSR SHIFT_BIN_INTO_DIGIT
    JSR SHIFT_BIN_INTO_DIGIT
    LDY #$05
    CLC
@add_fraction:
    PLA
    ADC MATH_ARG_14,Y
    STA MATH_ARG_14,Y
    DEY
    BNE @add_fraction
    PLA
    ADC MATH_ARG_00,X
    ORA #$30
    STA MATH_ARG_00,X
    INX
    CPX #$0E
    BCC @next_digit
@return:
    RTS
; 作用：把 MATH_ARG_00 加 A 起到 MATH_ARG_0D 清 0，SYS_STATUS 置 0。
; 输入：A=起始偏移。
; 输出：A=$00。
; 调用者：BIN_TO_DEC_SHIFT
CLEAR_FROM_Y:
    TAY
    AND #$00
    STA SYS_STATUS
@loop:
    STA MATH_ARG_00,Y
    INY
    CPY #$0E
    BCC @loop
    RTS
; 作用：MATH_ARG_15-19 整体左移 1 位，移出的最高位移入 MATH_ARG_00+X。
; 输入：X=接收溢出位的数字位置。
; 调用者：BIN_TO_DEC_SHIFT
SHIFT_BIN_INTO_DIGIT:
    ASL MATH_ARG_19
    ROL MATH_ARG_18
    ROL MATH_ARG_17
    ROL MATH_ARG_16
    ROL MATH_ARG_15
    ROL MATH_ARG_00,X
    RTS
; 作用：40 位十进制位权表：13 项×5 字节（高字节在前），10^12 到 10^0；加减位权的 ADD_POW10、BIN40_SUB_POW、BIN40_CMP_POW 用。
; 引用者：ADD_POW10、BIN40_SUB_POW、BIN40_CMP_POW
DEC_POW10_TABLE:
    .byte $E8,$D4,$A5,$10,$00 ; 10^12
    .byte $17,$48,$76,$E8,$00 ; 10^11
    .byte $02,$54,$0B,$E4,$00 ; 10^10
    .byte $00,$3B,$9A,$CA,$00 ; 10^9
    .byte $00,$05,$F5,$E1,$00 ; 10^8
    .byte $00,$00,$98,$96,$80 ; 10^7
    .byte $00,$00,$0F,$42,$40 ; 10^6
    .byte $00,$00,$01,$86,$A0 ; 10^5
    .byte $00,$00,$00,$27,$10 ; 10^4
    .byte $00,$00,$00,$03,$E8 ; 10^3
    .byte $00,$00,$00,$00,$64 ; 10^2
    .byte $00,$00,$00,$00,$0A ; 10^1
    .byte $00,$00,$00,$00,$01 ; 10^0
; 作用：功能 $4F：浮点乘法：FP_A 乘 FP_B（各 7 字节：指数、符号、5 字节尾数），结果在 FP_R。
; 输入：FP_A_*、FP_B_*；SYS_SUBFUNCTION=0 按浮点数相乘，不为 0 时其高 4 位右移一位作为两个操作数共同的指数（符号为正），乘完再转成定点数。
; 输出：FP_R_EXP、FP_R_SIGN、FP_R_MANT_0-4；上溢时 FP_R_EXP=$80；转成定点数时见 FP_SHIFT_TO_FIXED。
; 副作用：A、X、Y 经栈保存并恢复。
; 调用者：CELL_COMBINE_ATTR（地址表）
API_4F:
    PHA
    TXA
    PHA
    TYA
    PHA
    LDA SYS_SUBFUNCTION
    BNE @fixed
    JSR FP_MUL_CORE
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
@fixed:
    JSR FP_LOAD_EXP
    JSR FP_MUL_CORE
    JSR FP_SHIFT_TO_FIXED
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
; 作用：把 A 的高 4 位右移一位后写入 FP_A_EXP 与 FP_B_EXP，并清 FP_A_SIGN、FP_B_SIGN。
; 输入：A（功能 $4F、$50 传入 SYS_SUBFUNCTION）。
; 调用者：API_4F、API_50
FP_LOAD_EXP:
    AND #$F0
    LSR A
    STA FP_A_EXP
    STA FP_B_EXP
    LDA #$00
    STA FP_A_SIGN
    STA FP_B_SIGN
    RTS
; 作用：把浮点结果转成定点数：FP_R_EXP 为 $80 时 SYS_STATUS 置 $80 并返回；否则清 SYS_STATUS 与 MATH_ARG_15-19，再用 FP_SHIFT_RIGHT_BY 右移尾数。
; 输入：FP_R_*。
; 输出：SYS_STATUS=0 或 $80；尾数右移后的 40 位定点数在 FP_R_MANT_0-4 与 MATH_ARG_15-19。
; 调用者：API_4F、API_50
FP_SHIFT_TO_FIXED:
    LDA FP_R_EXP
    CMP #$80
    BNE @shift
    STA SYS_STATUS
    BEQ @return
@shift:
    LDA #$00
    STA SYS_STATUS
    LDX #$05
@loop:
    STA FP_R_MANT_4,X
    DEX
    BNE @loop
    JSR FP_SHIFT_RIGHT_BY
@return:
    RTS
; 作用：把 FP_R_MANT_0 起 10 字节的尾数整体右移（40 减 FP_R_EXP）位。
; 输入：FP_R_EXP。
; 调用者：FP_SHIFT_TO_FIXED
FP_SHIFT_RIGHT_BY:
    LDA #$28
    SEC
    SBC FP_R_EXP
    BEQ @return
    TAY
@next_bit:
    LDX #$00
    CLC
    PHP
@rotate:
    PLP
    LDA FP_R_MANT_0,X
    ROR A
    STA FP_R_MANT_0,X
    PHP
    INX
    CPX #$0A
    BNE @rotate
    PLP
    DEY
    BNE @next_bit
@return:
    RTS
; 作用：浮点乘法核心：规格化两个操作数，指数相加，移位相加求尾数，再规格化并定符号
; 输入：FP_A_*、FP_B_*。
; 输出：FP_R_*。
; 调用者：API_4F
FP_MUL_CORE:
    JSR FP_NORMALIZE_BOTH
    JSR FP_CLEAR_RESULT
    JSR FP_ADD_EXPONENTS
    JSR FP_SIGN_XOR
    JSR FP_MUL_LOOP
    JSR FP_NORMALIZE
    RTS
; 作用：FP_R_EXP 为负时，把尾数 FP_R_MANT_0-4 右移（-FP_R_EXP）位，再把 FP_R_EXP 清 0。
; 输入：FP_R_EXP、FP_R_MANT_0-4。
; 调用者：API_4E
FP_DENORMALIZE:
    LDA FP_R_EXP
    BPL @return
    TAY
@next_bit:
    CLC
    LDX #$00
    PHP
@rotate:
    PLP
    LDA FP_R_MANT_0,X
    ROR A
    STA FP_R_MANT_0,X
    PHP
    INX
    CPX #$05
    BNE @rotate
    PLP
    INY
    BNE @next_bit
    LDA #$00
    STA FP_R_EXP
@return:
    RTS
; 作用：FP_R_SIGN 取 FP_A_SIGN 与 FP_B_SIGN 的异或（乘除结果的符号）。
; 调用者：FP_MUL_CORE、FP_DIV_CORE
FP_SIGN_XOR:
    LDA FP_A_SIGN
    EOR FP_B_SIGN
    STA FP_R_SIGN
    RTS
; 作用：把两个操作数（FP_A、FP_B 各 7 字节）依次复制到 FP_R 规格化，再复制回去。
; 输入：FP_A_*、FP_B_*。
; 输出：FP_A_*、FP_B_* 已规格化，FP_R_* 为第二个操作数规格化后的副本。
; 调用者：FP_MUL_CORE、FP_DIV_CORE、API_51
FP_NORMALIZE_BOTH:
    LDX #$06
@load_a:
    LDA FP_A_EXP,X
    STA FP_R_EXP,X
    DEX
    BPL @load_a
    CLC
    JSR FP_NORMALIZE
    LDX #$06
@store_a:
    LDA FP_R_EXP,X
    STA FP_A_EXP,X
    DEX
    BPL @store_a
    LDX #$06
@load_b:
    LDA FP_B_EXP,X
    STA FP_R_EXP,X
    DEX
    BPL @load_b
    CLC
    JSR FP_NORMALIZE
    LDX #$06
@store_b:
    LDA FP_R_EXP,X
    STA FP_B_EXP,X
    DEX
    BPL @store_b
    RTS
; 作用：尾数 FP_R_MANT_0-4 全为 0 时，把 FP_R_EXP、FP_R_SIGN 清 0。
; 输出：Z=1 表示尾数为 0。
; 调用者：FP_NORMALIZE
FP_CHECK_ZERO:
    LDX #$05
@loop:
    LDA FP_R_SIGN,X
    BNE @return
    DEX
    BNE @loop
    LDA #$00
    STA FP_R_EXP
    STA FP_R_SIGN
@return:
    RTS
; 作用：规格化：尾数最高位为 0 时左移并让指数减 1；指数越界时 FP_R_EXP 置 $80（上溢）或清零结果（下溢，转 FP_CLEAR_RESULT）。
; 输入：FP_R_*。
; 输出：FP_R_*。
; 调用者：FP_MUL_CORE、FP_NORMALIZE_BOTH、FP_NORMALIZE、FP_DIV_CORE、API_51
FP_NORMALIZE:
    JSR FP_CHECK_ZERO
    BEQ @return
    LDA FP_R_MANT_0
    AND #$80
    BNE @check_exponent
    JSR SHIFT_LEFT_ACC5
    DEC FP_R_EXP
    BCC FP_NORMALIZE
@check_exponent:
    LDA FP_R_EXP
    BMI @negative_exponent
    CMP #$29
    BCC @return
    LDA #$80
    STA FP_R_EXP
    BNE @return
@negative_exponent:
    CMP #$D8
    BCS @return
    JSR FP_CLEAR_RESULT
@return:
    RTS
; 作用：把 FP_R_MANT_0-4 左移 1 位。
; 输入：C=移入最低位的值。
; 输出：C=移出的最高位。
; 调用者：FP_NORMALIZE、FP_DIV_LOOP
SHIFT_LEFT_ACC5:
    PHP
    LDX #$04
@loop:
    PLP
    LDA FP_R_MANT_0,X
    ROL A
    STA FP_R_MANT_0,X
    PHP
    DEX
    BPL @loop
    PLP
    RTS
; 作用：FP_R_EXP 取 FP_A_EXP 加 FP_B_EXP（乘法的指数相加）。
; 调用者：FP_MUL_CORE
FP_ADD_EXPONENTS:
    LDA FP_A_EXP
    CLC
    ADC FP_B_EXP
    STA FP_R_EXP
    RTS
; 作用：乘法主循环：乘数每一位移出，为 1 时把被乘数加进累加器，累加器右移，直到乘数为 0
; 输入：FP_A_MANT_0-4（被乘数）、FP_B_MANT_0-4（乘数）。
; 输出：FP_R_MANT_0-4 为乘积。
; 调用者：FP_MUL_CORE、FP_MUL_LOOP
FP_MUL_LOOP:
    JSR SHIFT_RIGHT_B_MANT
    BCC @shift_acc
    JSR ADD_MULTIPLICAND
@shift_acc:
    JSR SHIFT_RIGHT_ACC5
    JSR FP_B_MANT_ZERO
    BNE FP_MUL_LOOP
    RTS
; 作用：把 FP_B_MANT_0-4 右移 1 位。
; 输出：C=移出的最低位。
; 调用者：FP_MUL_LOOP、FP_DIV_LOOP、FP_ALIGN_EXPONENTS
SHIFT_RIGHT_B_MANT:
    LDX #$00
    CLC
    PHP
@loop:
    PLP
    LDA FP_B_MANT_0,X
    ROR A
    STA FP_B_MANT_0,X
    PHP
    INX
    CPX #$05
    BNE @loop
    PLP
    RTS
; 作用：检查 FP_B_MANT_0-4 是否全为 0。
; 输出：Z=1 表示全为 0。
; 调用者：FP_MUL_LOOP、FP_DIV_CORE
FP_B_MANT_ZERO:
    LDX #$05
@loop:
    LDA FP_B_SIGN,X
    BNE @return
    DEX
    BNE @loop
@return:
    RTS
; 作用：把 FP_R_MANT_0-4 右移 1 位。
; 输入：C=移入最高位的值。
; 输出：C=移出的最低位。
; 调用者：FP_MUL_LOOP、FP_ADD_MANTISSA
SHIFT_RIGHT_ACC5:
    PHP
    LDX #$00
@loop:
    PLP
    LDA FP_R_MANT_0,X
    ROR A
    STA FP_R_MANT_0,X
    PHP
    INX
    CPX #$05
    BNE @loop
    PLP
    RTS
; 作用：把被乘数 FP_A_MANT_0-4 加到累加器 FP_R_MANT_0-4。
; 输出：C=最高字节相加的进位。
; 调用者：FP_MUL_LOOP
ADD_MULTIPLICAND:
    CLC
    LDX #$04
    PHP
@loop:
    LDA FP_R_MANT_0,X
    PLP
    ADC FP_A_MANT_0,X
    PHP
    STA FP_R_MANT_0,X
    DEX
    BPL @loop
    PLP
    RTS
; 作用：SYS_STATUS 置 0，清 FP_R_EXP 起 7 字节（结果为 0）。
; 输出：A=$00，X=$FF。
; 调用者：FP_MUL_CORE、FP_NORMALIZE、FP_DIV_CORE、API_51
FP_CLEAR_RESULT:
    LDA #$00
    STA SYS_STATUS
    LDX #$06
@loop:
    STA FP_R_EXP,X
    DEX
    BPL @loop
    RTS
; 作用：功能 $50：浮点除法：FP_A 除以 FP_B，结果在 FP_R。
; 输入：FP_A_*、FP_B_*；SYS_SUBFUNCTION=0 按浮点数相除，不为 0 时其高 4 位右移一位作为两个操作数共同的指数（符号为正），除完再转成定点数（同功能 $4F）。
; 输出：FP_R_*；除数为 0 时 FP_R_EXP=$80。
; 副作用：A、X、Y 经栈保存并恢复。
; 调用者：CELL_COMBINE_ATTR（地址表）
API_50:
    PHA
    TXA
    PHA
    TYA
    PHA
    LDA SYS_SUBFUNCTION
    BNE @fixed
    JSR FP_DIV_CORE
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
@fixed:
    JSR FP_LOAD_EXP
    JSR FP_DIV_CORE
    JSR FP_SHIFT_TO_FIXED
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
; 作用：浮点除法核心：规格化后若除数 FP_B_MANT_0-4 为 0，结果 FP_R_EXP 置 $80；否则指数相减、逐位试减求商，再规格化。
; 输入：FP_A_*、FP_B_*。
; 输出：FP_R_*。
; 调用者：API_50
FP_DIV_CORE:
    JSR FP_NORMALIZE_BOTH
    JSR FP_CLEAR_RESULT
    JSR FP_B_MANT_ZERO
    BNE @divide
    LDA #$80
    STA FP_R_EXP
    BNE @return
@divide:
    JSR FP_SUB_EXPONENTS
    JSR FP_SIGN_XOR
    LDA #$28
    JSR FP_DIV_LOOP
    INC FP_R_EXP
    JSR FP_NORMALIZE
@return:
    RTS
; 作用：比较被除数 FP_A_MANT_0-4 与除数 FP_B_MANT_0-4（高字节先比）。
; 输出：C=1 表示被除数大于等于除数。
; 调用者：FP_DIV_LOOP
FP_CMP_DIVISOR:
    LDX #$00
@loop:
    LDA FP_A_MANT_0,X
    CMP FP_B_MANT_0,X
    BNE @return
    INX
    CPX #$05
    BCC @loop
@return:
    RTS
; 作用：FP_R_EXP 取 FP_A_EXP 减 FP_B_EXP（除法的指数相减）。
; 调用者：FP_DIV_CORE
FP_SUB_EXPONENTS:
    LDA FP_A_EXP
    SEC
    SBC FP_B_EXP
    STA FP_R_EXP
    RTS
; 作用：做 A 位除法：每位先比较被除数与除数，够减就减；商位（够减为 1）从进位移入 FP_R_MANT_0-4；第一位把除数右移 1 位，其余各位把被除数左移 1 位。
; 输入：A=位数（FP_DIV_CORE 传 $28）。
; 输出：FP_R_MANT_0-4=商。
; 调用者：FP_DIV_CORE
FP_DIV_LOOP:
    TAX
@next_bit:
    TXA
    PHA
    JSR FP_CMP_DIVISOR
    BCC @shift_quotient
    JSR SUB_DIVISOR
@shift_quotient:
    JSR SHIFT_LEFT_ACC5
    PLA
    PHA
    CMP #$28
    BNE @shift_remainder
    JSR SHIFT_RIGHT_B_MANT
    CLC
    BCC @bit_done
@shift_remainder:
    JSR SHIFT_LEFT_DIVIDEND
@bit_done:
    PLA
    TAX
    DEX
    BNE @next_bit
    RTS
; 作用：把被除数（余数）FP_A_MANT_0-4 左移 1 位。
; 调用者：FP_DIV_LOOP
SHIFT_LEFT_DIVIDEND:
    LDX #$04
    CLC
    PHP
@loop:
    PLP
    LDA FP_A_MANT_0,X
    ROL A
    STA FP_A_MANT_0,X
    PHP
    DEX
    BPL @loop
    PLP
    RTS
; 作用：被除数 FP_A_MANT_0-4 减去除数 FP_B_MANT_0-4。
; 输出：C=1 表示没有借位。
; 调用者：FP_DIV_LOOP
SUB_DIVISOR:
    LDX #$04
    SEC
    PHP
@loop:
    LDA FP_A_MANT_0,X
    PLP
    SBC FP_B_MANT_0,X
    STA FP_A_MANT_0,X
    PHP
    DEX
    BPL @loop
    PLP
    RTS
; 作用：功能 $51：浮点加法：FP_A 与 FP_B 相加（先按指数排序、对齐，再按符号相加或相减），结果在 FP_R。
; 输入：FP_A_*、FP_B_*。
; 输出：FP_R_*。
; 副作用：A、X、Y 经栈保存并恢复。
; 调用者：CELL_COMBINE_ATTR（地址表）、API_52
API_51:
    PHA
    TXA
    PHA
    TYA
    PHA
    JSR FP_NORMALIZE_BOTH
    JSR FP_CLEAR_RESULT
    JSR FP_ORDER_BY_EXP
    JSR FP_ALIGN_EXPONENTS
    JSR FP_ADD_BY_SIGN
    JSR FP_NORMALIZE
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
; 作用：加法分流：两数符号不同走 FP_SUB_MANTISSA，符号相同走 FP_ADD_MANTISSA。
; 调用者：API_51
FP_ADD_BY_SIGN:
    LDA FP_A_SIGN
    EOR FP_B_SIGN
    BEQ @same_sign
    JSR FP_SUB_MANTISSA
    CLC
    BCC @return
@same_sign:
    JSR FP_ADD_MANTISSA
@return:
    RTS
; 作用：尾数相减（FP_A_MANT 减 FP_B_MANT，差写 FP_R_MANT）；结果为负时取补（NEGATE_ACC5）并取 FP_B_SIGN 作符号，否则取 FP_A_SIGN。
; 调用者：FP_ADD_BY_SIGN
FP_SUB_MANTISSA:
    LDX #$04
    SEC
    PHP
@loop:
    LDA FP_A_MANT_0,X
    PLP
    SBC FP_B_MANT_0,X
    STA FP_R_MANT_0,X
    PHP
    DEX
    BPL @loop
    PLP
    BCC @negative
    LDA FP_A_SIGN
    BCS @store_sign
@negative:
    JSR NEGATE_ACC5
    LDA FP_B_SIGN
@store_sign:
    STA FP_R_SIGN
    RTS
; 作用：把 FP_R_MANT_0-4 取二进制补码（0 减自身）。
; 调用者：FP_SUB_MANTISSA
NEGATE_ACC5:
    SEC
    LDX #$04
    PHP
@loop:
    LDA #$00
    PLP
    SBC FP_R_MANT_0,X
    STA FP_R_MANT_0,X
    PHP
    DEX
    BPL @loop
    PLP
    RTS
; 作用：尾数相加（FP_A_MANT_0-4 加 FP_B_MANT_0-4，和写 FP_R_MANT_0-4）；溢出时累加器右移 1 位并让 FP_R_EXP 加 1；符号取 FP_A_SIGN。
; 调用者：FP_ADD_BY_SIGN
FP_ADD_MANTISSA:
    LDX #$04
    CLC
    PHP
@loop:
    LDA FP_A_MANT_0,X
    PLP
    ADC FP_B_MANT_0,X
    STA FP_R_MANT_0,X
    PHP
    DEX
    BPL @loop
    PLP
    BCC @sign
    JSR SHIFT_RIGHT_ACC5
    INC FP_R_EXP
@sign:
    LDA FP_A_SIGN
    STA FP_R_SIGN
    RTS
; 作用：对齐指数：两个操作数的尾数最高位都为 1 时，把 FP_B 的尾数右移到与 FP_A 的指数相同（FP_ORDER_BY_EXP 已保证 FP_A_EXP 不小于 FP_B_EXP）；有一个操作数为 0 时不移位，FP_R_EXP 取 FP_A_EXP（为 0 时取 FP_B_EXP）。
; 输出：FP_R_EXP=对齐后的指数。
; 调用者：API_51
FP_ALIGN_EXPONENTS:
    LDA #$80
    AND FP_A_MANT_0
    AND FP_B_MANT_0
    BNE @compare
    LDY FP_A_EXP
    BNE @store_exp
    LDY FP_B_EXP
    BNE @store_exp
@compare:
    LDY FP_B_EXP
    CPY FP_A_EXP
    BEQ @store_exp
@shift_b:
    JSR SHIFT_RIGHT_B_MANT
    INY
    CPY FP_A_EXP
    BMI @shift_b
    STY FP_B_EXP
@store_exp:
    STY FP_R_EXP
    RTS
; 作用：保证 FP_A_EXP 不小于 FP_B_EXP，否则交换两个操作数（各 7 字节）。
; 调用者：API_51
FP_ORDER_BY_EXP:
    LDA FP_A_EXP
    SEC
    SBC FP_B_EXP
    BPL @return
    LDX #$06
@swap_byte:
    LDA FP_A_EXP,X
    TAY
    LDA FP_B_EXP,X
    STA FP_A_EXP,X
    TYA
    STA FP_B_EXP,X
    DEX
    BPL @swap_byte
@return:
    RTS
; 作用：功能 $52：浮点减法：把 FP_B_SIGN 取反后调用加法（API_51）。
; 输入：FP_A_*、FP_B_*。
; 输出：FP_R_*（FP_A 减 FP_B）。
; 副作用：改写 FP_B_SIGN；A、X、Y 经栈保存并恢复。
; 调用者：CELL_COMBINE_ATTR（地址表）
API_52:
    PHA
    TXA
    PHA
    TYA
    PHA
    LDA #$FF
    EOR FP_B_SIGN
    STA FP_B_SIGN
    JSR API_51
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
; 作用：功能 $53：直线步进（布雷森汉姆算法），已验证。
; 输入：LINE_BLOCK_PTR_LO 指向 18 字节参数块：+0、+1 起点 x、y，+2、+3 终点 x、y，+4 本次前进的步数（0 按 256 步）；+5 起是工作区，调用者不用设置。
; 输出：落点写回 +0、+1（下次调用从这里继续）；步数不小于主轴长度时直接落在终点。
; 副作用：+5、+6 存两轴的长度（主轴在前），+7、+8 存两轴的方向（$01 正、$FF 负），+9-+$0E 存误差与它的增量，+$0F 为 1 表示 x 是主轴（0 表示两轴交换过），+$10、+$11 存当前主轴、副轴坐标。
; 调用者：CELL_COMBINE_ATTR（地址表）
API_53:
    CLD
    LDY #$00
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$10
    STA (LINE_BLOCK_PTR_LO),Y
    LDY #$01
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$11
    STA (LINE_BLOCK_PTR_LO),Y
    SEC
    LDY #$02
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$00
    SBC (LINE_BLOCK_PTR_LO),Y
    BCS @dx_positive
    CLC
    EOR #$FF
    ADC #$01
    LDY #$05
    STA (LINE_BLOCK_PTR_LO),Y
    LDA #$FF
    LDY #$07
    STA (LINE_BLOCK_PTR_LO),Y
    JMP @dx_done
@dx_positive:
    LDY #$05
    STA (LINE_BLOCK_PTR_LO),Y
    LDA #$01
    LDY #$07
    STA (LINE_BLOCK_PTR_LO),Y
@dx_done:
    SEC
    LDY #$03
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$01
    SBC (LINE_BLOCK_PTR_LO),Y
    BCS @dy_positive
    CLC
    EOR #$FF
    ADC #$01
    LDY #$06
    STA (LINE_BLOCK_PTR_LO),Y
    LDA #$FF
    LDY #$08
    STA (LINE_BLOCK_PTR_LO),Y
    JMP @dy_done
@dy_positive:
    LDY #$06
    STA (LINE_BLOCK_PTR_LO),Y
    LDA #$01
    LDY #$08
    STA (LINE_BLOCK_PTR_LO),Y
@dy_done:
    LDA #$01
    LDY #$0F
    STA (LINE_BLOCK_PTR_LO),Y
    LDY #$05
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$06
    CMP (LINE_BLOCK_PTR_LO),Y
    BCS @axes_ready
    LDY #$05
    LDA (LINE_BLOCK_PTR_LO),Y
    TAX
    LDY #$06
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$05
    STA (LINE_BLOCK_PTR_LO),Y
    TXA
    LDY #$06
    STA (LINE_BLOCK_PTR_LO),Y
    LDY #$07
    LDA (LINE_BLOCK_PTR_LO),Y
    TAX
    LDY #$08
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$07
    STA (LINE_BLOCK_PTR_LO),Y
    TXA
    LDY #$08
    STA (LINE_BLOCK_PTR_LO),Y
    LDY #$10
    LDA (LINE_BLOCK_PTR_LO),Y
    TAX
    LDY #$11
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$10
    STA (LINE_BLOCK_PTR_LO),Y
    TXA
    LDY #$11
    STA (LINE_BLOCK_PTR_LO),Y
    LDA #$00
    LDY #$0F
    STA (LINE_BLOCK_PTR_LO),Y
@axes_ready:
    LDY #$04
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$05
    CMP (LINE_BLOCK_PTR_LO),Y
    BCC @partial
    LDY #$02
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$00
    STA (LINE_BLOCK_PTR_LO),Y
    LDY #$03
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$01
    STA (LINE_BLOCK_PTR_LO),Y
    RTS
@partial:
    LDA #$00
    LDY #$0A
    STA (LINE_BLOCK_PTR_LO),Y
    LDY #$06
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$09
    STA (LINE_BLOCK_PTR_LO),Y
    LDY #$09
    LDA (LINE_BLOCK_PTR_LO),Y
    ASL A
    STA (LINE_BLOCK_PTR_LO),Y
    LDY #$0A
    LDA (LINE_BLOCK_PTR_LO),Y
    ROL A
    STA (LINE_BLOCK_PTR_LO),Y
    LDY #$09
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$0D
    STA (LINE_BLOCK_PTR_LO),Y
    LDY #$0A
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$0E
    STA (LINE_BLOCK_PTR_LO),Y
    SEC
    LDY #$09
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$05
    SBC (LINE_BLOCK_PTR_LO),Y
    LDY #$09
    STA (LINE_BLOCK_PTR_LO),Y
    LDY #$0A
    LDA (LINE_BLOCK_PTR_LO),Y
    SBC #$00
    STA (LINE_BLOCK_PTR_LO),Y
    LDY #$06
    LDA (LINE_BLOCK_PTR_LO),Y
    SEC
    LDY #$05
    SBC (LINE_BLOCK_PTR_LO),Y
    LDY #$0B
    STA (LINE_BLOCK_PTR_LO),Y
    LDA #$00
    SBC #$00
    LDY #$0C
    STA (LINE_BLOCK_PTR_LO),Y
    LDY #$0B
    LDA (LINE_BLOCK_PTR_LO),Y
    ASL A
    STA (LINE_BLOCK_PTR_LO),Y
    LDY #$0C
    LDA (LINE_BLOCK_PTR_LO),Y
    ROL A
    STA (LINE_BLOCK_PTR_LO),Y
    LDY #$04
    LDA (LINE_BLOCK_PTR_LO),Y
    TAX
@step:
    LDY #$10
    LDA (LINE_BLOCK_PTR_LO),Y
    CLC
    LDY #$07
    ADC (LINE_BLOCK_PTR_LO),Y
    LDY #$10
    STA (LINE_BLOCK_PTR_LO),Y
    LDY #$0A
    LDA (LINE_BLOCK_PTR_LO),Y
    BPL @advance_minor
    CLC
    LDY #$0D
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$09
    ADC (LINE_BLOCK_PTR_LO),Y
    STA (LINE_BLOCK_PTR_LO),Y
    LDY #$0E
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$0A
    ADC (LINE_BLOCK_PTR_LO),Y
    STA (LINE_BLOCK_PTR_LO),Y
    JMP @step_done
@advance_minor:
    CLC
    LDY #$08
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$11
    ADC (LINE_BLOCK_PTR_LO),Y
    STA (LINE_BLOCK_PTR_LO),Y
    CLC
    LDY #$0B
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$09
    ADC (LINE_BLOCK_PTR_LO),Y
    STA (LINE_BLOCK_PTR_LO),Y
    LDY #$0C
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$0A
    ADC (LINE_BLOCK_PTR_LO),Y
    STA (LINE_BLOCK_PTR_LO),Y
@step_done:
    DEX
    BEQ @steps_done
    JMP @step
@steps_done:
    LDY #$0F
    LDA (LINE_BLOCK_PTR_LO),Y
    BEQ @store_swapped
    LDY #$10
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$00
    STA (LINE_BLOCK_PTR_LO),Y
    LDY #$11
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$01
    STA (LINE_BLOCK_PTR_LO),Y
    RTS
@store_swapped:
    LDY #$10
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$01
    STA (LINE_BLOCK_PTR_LO),Y
    LDY #$11
    LDA (LINE_BLOCK_PTR_LO),Y
    LDY #$00
    STA (LINE_BLOCK_PTR_LO),Y
    RTS
; 作用：功能 $54：3 字节整数运算：被操作数 INT_A、INT_B 各是 1 个符号字节（$00 正、$FF 负）加 3 个数值字节（高位在前）。
; 输入：SYS_SUBFUNCTION：0 加、1 减、2 乘、3 除，其余不做事。
; 输出：结果符号在 INT_R_SIGN，其余见 系统调用手册功能 $54（已验证）。
; 调用者：CELL_COMBINE_ATTR（地址表）
API_54:
    LDA SYS_SUBFUNCTION
    CMP #$00
    BEQ @add
    CMP #$01
    BEQ @subtract
    CMP #$02
    BEQ @multiply
    CMP #$03
    BEQ @divide
    JMP @return
@add:
    JSR INT_OP_START
    JMP @return
@subtract:
    JSR INT_NEG_SUB
    JMP @return
@multiply:
    JSR INT_MUL_START
    JMP @return
@divide:
    JSR INTDIV_MAIN+4096
@return:
    RTS
; 作用：3 字节整数加减入口：清 INT_R_SIGN 起 6 字节后按两数的符号做加或减。
; 调用者：API_54、INT_NEG_SUB
INT_OP_START:
    JSR INT_CLEAR_RESULT_AREA
    JSR INT_ADD_OR_SUB
    RTS
; 作用：把 INT_R_SIGN 起 6 个字节清 0。
; 输出：A=$00，X=$06。
; 调用者：INT_OP_START
INT_CLEAR_RESULT_AREA:
    LDA #$00
    LDX #$00
@loop:
    STA INT_R_SIGN,X
    INX
    CPX #$06
    BCC @loop
    RTS
; 作用：比较两个数的符号（INT_A_SIGN 与 INT_B_SIGN 异或）：相同走 INT_ADD_3BYTE，不同走 INT_COMPARE_SUB。
; 调用者：INT_OP_START
INT_ADD_OR_SUB:
    LDA INT_A_SIGN
    EOR INT_B_SIGN
    BEQ @same_sign
    JSR INT_COMPARE_SUB
    RTS
@same_sign:
    JSR INT_ADD_3BYTE
    RTS
; 作用：把 INT_A_0-2 加 INT_B_0-2，和放 INT_R_CARRY 之后的 3 个字节（$06A4-$06A6），符号取 INT_A_SIGN，有进位时 INT_R_CARRY 置 1。
; 调用者：INT_ADD_OR_SUB
INT_ADD_3BYTE:
    LDA INT_A_SIGN
    STA INT_R_SIGN
    LDX #$03
    CLC
    PHP
@loop:
    PLP
    LDA INT_A_SIGN,X
    ADC INT_B_SIGN,X
    PHP
    STA INT_R_CARRY,X
    DEX
    BNE @loop
    PLP
    BCC @return
    LDA #$01
    STA INT_R_CARRY
@return:
    RTS
; 作用：先比较两个 3 字节数的大小（INT_COMPARE_3BYTE），再用大数减小数
; 输入：INT_A_0-2、INT_B_0-2。
; 输出：结果区由 INT_SUB_FIRST_MINUS_SECOND 或 INT_SUB_SECOND_MINUS_FIRST 写入（两数相等时不写）。
; 调用者：INT_ADD_OR_SUB
INT_COMPARE_SUB:
    JSR INT_COMPARE_3BYTE
    RTS
; 作用：3 字节数相减：INT_A_0-2 减 INT_B_0-2，差放 INT_R_CARRY 之后的 3 个字节（$06A4-$06A6），INT_R_SIGN 取 INT_A_SIGN，INT_R_CARRY 清 0。
; 调用者：INT_COMPARE_3BYTE
INT_SUB_FIRST_MINUS_SECOND:
    LDA INT_A_SIGN
    STA INT_R_SIGN
    LDX #$03
    SEC
    PHP
@loop:
    LDA INT_A_SIGN,X
    PLP
    SBC INT_B_SIGN,X
    STA INT_R_CARRY,X
    PHP
    DEX
    BNE @loop
    PLP
    LDA #$00
    STA INT_R_CARRY
    RTS
; 作用：3 字节数相减：INT_B_0-2 减 INT_A_0-2，差放 INT_R_CARRY 之后的 3 个字节（$06A4-$06A6），INT_R_SIGN 取 INT_B_SIGN，INT_R_CARRY 清 0。
; 调用者：INT_COMPARE_3BYTE
INT_SUB_SECOND_MINUS_FIRST:
    LDA INT_B_SIGN
    STA INT_R_SIGN
    LDX #$03
    SEC
    PHP
@loop:
    LDA INT_B_SIGN,X
    PLP
    SBC INT_A_SIGN,X
    STA INT_R_CARRY,X
    PHP
    DEX
    BNE @loop
    PLP
    LDA #$00
    STA INT_R_CARRY
    RTS
; 作用：逐字节比较 INT_A_0-2 与 INT_B_0-2（高字节先比）：A 小转 INT_SUB_SECOND_MINUS_FIRST，A 大转 INT_SUB_FIRST_MINUS_SECOND，三个字节都相等时 C=1 返回，结果区保持为 0。
; 调用者：INT_COMPARE_SUB
INT_COMPARE_3BYTE:
    LDX #$00
@loop:
    LDA INT_A_0,X
    CMP INT_B_0,X
    BCC INT_SUB_SECOND_MINUS_FIRST
    BEQ @next_byte
    JMP INT_SUB_FIRST_MINUS_SECOND
    RTS
@next_byte:
    INX
    CPX #$03
    BCC @loop
    SEC
    RTS
; 作用：把 INT_B_SIGN 翻转后重新走 INT_OP_START（即减法）。
; 副作用：改写 INT_B_SIGN。
; 调用者：API_54
INT_NEG_SUB:
    LDA #$FF
    EOR INT_B_SIGN
    STA INT_B_SIGN
    JSR INT_OP_START
    RTS
; 作用：整数乘法入口：先 INTMUL_CLEAR_RESULT，再 INTMUL_SET_SIGN，最后跨页调用 INTMUL_CORE（这条 JSR 的第 3 个字节在下一页开头）。
; 输入：INT_A、INT_B。
; 输出：48 位乘积在 MATH_ARG_09-0E，符号在 INT_R_SIGN。
; 调用者：API_54
INT_MUL_START:
    JSR INTMUL_CLEAR_RESULT+4096
    JSR INTMUL_SET_SIGN+4096
; 下一条 JSR INTMUL_CORE+4096 跨页：前 2 个字节（操作码与目标低字节）在本页末尾，目标高字节在下一页开头，然后是 RTS
    .byte $20
    .byte <INTMUL_CORE+4096
