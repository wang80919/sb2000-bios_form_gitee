; ------------------------------------------------------------------------
; 名称：ime-extra-services.asm
; 说明：中文输入法服务（功能 $6D）的后半：子功能 $11-$24，按汇编地址 $A000 起
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：占ROM 第 E-E 页，汇编地址 $A000 起，后面的文件接在它后面
; ------------------------------------------------------------------------
.org $A000
    .byte $03 ; 上一页末尾 BNE 的操作数（跳到 IME_SUB_16_CONT）
; 作用：跳到 IME_SUB_16_FINISH。候选数为 0 时 IME_SUB_16 的 BNE 不跳，顺序落到这里；候选数不为 0 时 BNE 的操作数 $03 越过这条 JMP，转到 IME_SUB_16_CONT。
; 调用者：全 ROM 没有指令或地址表引用它（只能由外部直接进入）
IME_SUB_16_EXIT:
    JMP IME_SUB_16_FINISH
; 作用：子功能 16 的后半（候选数不为 0 时）：IME_CANDIDATE_COUNT 乘 2 变成候选区字节数；对每个候选（2 字节的音节序号）取全拼音节表 IME_PINYIN_TABLE 第 序号 项（每项 6 字节），逐字节经功能 $2B 写到扩展 RAM（页号由 SYS_PAGE 带着更新）；序号不小于 $194 时提前收尾。
; 输入：IME_FAR_PAGE、IME_CANDIDATES、IME_CANDIDATE_COUNT。
; 调用者：全 ROM 没有指令或地址表引用它（只能由外部直接进入）
IME_SUB_16_CONT:
    LDA IME_FAR_PAGE
    STA SYS_PAGE
    ASL IME_CANDIDATE_COUNT
    LDX #$00
@next_candidate:
    LDA IME_CANDIDATES,X
    STA DRAW_MODE_TEMP
    STA DISPLAY_TEMP_2
    INX
    LDA IME_CANDIDATES,X
    STA DISPLAY_TEMP_1
    STA DISPLAY_TEMP_3
    INX
    LDA DISPLAY_TEMP_3
    CMP #$01
    BCC @calc_address
    LDA DISPLAY_TEMP_2
    BPL @calc_address
    CMP #$94
    BCC @calc_address
    JMP IME_SUB_16_FINISH
@calc_address:
    ASL DRAW_MODE_TEMP
    ROL DISPLAY_TEMP_1
    LDA DRAW_MODE_TEMP
    CLC
    ADC DISPLAY_TEMP_2
    STA DRAW_MODE_TEMP
    LDA DISPLAY_TEMP_1
    ADC DISPLAY_TEMP_3
    STA DISPLAY_TEMP_1
    ASL DRAW_MODE_TEMP
    ROL DISPLAY_TEMP_1
    LDA #$DD
    CLC
    ADC DRAW_MODE_TEMP
    STA IME_TABLE_PTR_LO
    LDA #$88
    ADC DISPLAY_TEMP_1
    STA IME_TABLE_PTR_HI
    LDY #$00
    LDA #$2B
    STA SYS_FUNCTION
@write_name:
    LDA (IME_TABLE_PTR_LO),Y
    STA SYS_ARG_10
    TYA
    PHA
    JSR VEC_SYSCALL
    PLA
    TAY
    INY
    CPY #$06
    BNE @write_name
    CPX IME_CANDIDATE_COUNT
    BNE @next_candidate
; 作用：子功能 16 收尾：功能 $2B 写入 SYS_ARG_10=0 作结束标志后返回。
; 调用者：IME_SUB_16_EXIT、IME_SUB_16_CONT
IME_SUB_16_FINISH:
    LDA #$00
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    RTS
; 作用：子功能 17：保存 IME_METHOD，把输入法序号临时改成 2（双拼），转 IME_SUB_17_BODY 查词库（与子功能 15 相同，只是输入法序号不同）。
; 调用者：IME_SUB_TABLE（地址表）
IME_SUB_17:
    LDA IME_METHOD
    PHA
    LDA #$02
    STA IME_METHOD
    JMP IME_SUB_17_BODY
; 作用：子功能 18 查汉字的双拼键位：SYS_PAGE 存入 IME_FAR_PAGE，按 SYS_ARG_07/08 查字（IME_FIND_CHAR_IN_DICT）；对每个候选（音节序号）取双拼键位表 IME_SHUANGPIN_TABLE 第 序号 项（每项 2 字节），逐字节经功能 $2B 写到扩展 RAM；序号不小于 $1B1 时提前收尾；最后写 0 作结束标志。
; 输入：SYS_PAGE=写入的页号，SYS_ARG_07/SYS_ARG_08=汉字内码。
; 调用者：IME_SUB_TABLE（地址表）
IME_SUB_18:
    LDA SYS_PAGE
    STA IME_FAR_PAGE
    JSR IME_FIND_CHAR_IN_DICT
    LDA IME_CANDIDATE_COUNT
    BNE @have_candidates
    JMP @finish
@have_candidates:
    LDA IME_FAR_PAGE
    STA SYS_PAGE
    ASL IME_CANDIDATE_COUNT
    LDX #$00
@next_candidate:
    LDA IME_CANDIDATES,X
    STA DRAW_MODE_TEMP
    INX
    LDA IME_CANDIDATES,X
    STA DISPLAY_TEMP_1
    INX
    LDA DISPLAY_TEMP_1
    CMP #$01
    BCC @calc_address
    LDA DRAW_MODE_TEMP
    BPL @calc_address
    CMP #$B1
    BCC @calc_address
    JMP @finish
@calc_address:
    ASL DRAW_MODE_TEMP
    ROL DISPLAY_TEMP_1
    LDA #$6D
    CLC
    ADC DRAW_MODE_TEMP
    STA IME_TABLE_PTR_LO
    LDA #$92
    ADC DISPLAY_TEMP_1
    STA IME_TABLE_PTR_HI
    LDY #$00
    LDA #$2B
    STA SYS_FUNCTION
@write_keys:
    LDA (IME_TABLE_PTR_LO),Y
    STA SYS_ARG_10
    TYA
    PHA
    JSR VEC_SYSCALL
    PLA
    TAY
    INY
    CPY #$02
    BNE @write_keys
    CPX IME_CANDIDATE_COUNT
    BNE @next_candidate
@finish:
    LDA #$00
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    RTS
; 作用：在词库里按 SYS_ARG_07/SYS_ARG_08 查汉字：词库以 $FF 分隔各个音节的汉字列表，遇 0 结束；每找到一个匹配，就把当前音节序号（MATH_ARG_14/15）依次存入候选区 IME_CANDIDATES 起，候选数在 IME_CANDIDATE_COUNT。
; 输入：SYS_ARG_07、SYS_ARG_08。
; 输出：IME_CANDIDATE_COUNT、IME_CANDIDATES。
; 调用者：IME_SUB_16、IME_SUB_18
IME_FIND_CHAR_IN_DICT:
    LDA #$00
    STA IME_CANDIDATE_COUNT
    STA MATH_ARG_14
    STA MATH_ARG_15
    LDA #$10
    STA MATH_ARG_00
    LDA #$00
    STA MATH_ARG_01
    LDA #$00
    STA MATH_ARG_02
    LDA #$00
    STA MATH_ARG_03
    STA MATH_ARG_04
    JSR IME_SEEK_DICT
    JSR IME_READ_DICT_BYTE
    STA MATH_ARG_03
    JSR IME_READ_DICT_BYTE
    STA MATH_ARG_04
    JSR IME_SEEK_DICT
@next:
    JSR IME_READ_DICT_BYTE
    BEQ @return
    CMP #$FF
    BEQ @next_syllable
    CMP SYS_ARG_07
    BNE @skip_byte
    JSR IME_READ_DICT_BYTE
    CMP SYS_ARG_08
    BNE @next
    LDA IME_CANDIDATE_COUNT
    ASL A
    TAY
    LDA MATH_ARG_14
    STA IME_CANDIDATES,Y
    LDA MATH_ARG_15
    STA IME_CANDIDATES+1,Y
    INC IME_CANDIDATE_COUNT
    JMP @next
@skip_byte:
    JSR IME_READ_DICT_BYTE
    JMP @next
@next_syllable:
    INC MATH_ARG_14
    BNE @next
    INC MATH_ARG_15
    JMP @next
@return:
    RTS
; 作用：取输入缓冲 IME_INPUT_BUF 前 6 个字节中第一个空格之前的长度，存入 IME_INPUT_LEN
; 输出：IME_INPUT_LEN。
; 调用者：IME_SUB_17_BODY
IME_LEN_FROM_BUF:
    LDY #$00
@loop:
    LDA IME_INPUT_BUF,Y
    CMP #$20
    BEQ @done
    INY
    CPY #$06
    BNE @loop
@done:
    STY IME_INPUT_LEN
    RTS
; 作用：子功能 19（$13）：以子功能 1 调用外挂输入法模块 1
; 调用者：IME_SUB_TABLE（地址表）
IME_EXT1_SUB_1:
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR IME_CALL_EXT1
    RTS
; 作用：子功能 20（$14）：以子功能 2 调用外挂输入法模块 1
; 调用者：IME_SUB_TABLE（地址表）
IME_EXT1_SUB_2:
    LDA #$02
    STA SYS_SUBFUNCTION
    JSR IME_CALL_EXT1
    RTS
; 作用：子功能 21（$15）：以子功能 3 调用外挂输入法模块 1
; 调用者：IME_SUB_TABLE（地址表）
IME_EXT1_SUB_3:
    LDA #$03
    STA SYS_SUBFUNCTION
    JSR IME_CALL_EXT1
    RTS
; 作用：子功能 22（$16）：以子功能 4 调用外挂输入法模块 1
; 调用者：IME_SUB_TABLE（地址表）
IME_EXT1_SUB_4:
    LDA #$04
    STA SYS_SUBFUNCTION
    JSR IME_CALL_EXT1
    RTS
; 作用：子功能 23（$17）：以子功能 5 调用外挂输入法模块 1
; 调用者：IME_SUB_TABLE（地址表）
IME_EXT1_SUB_5:
    LDA #$05
    STA SYS_SUBFUNCTION
    JSR IME_CALL_EXT1
    RTS
; 作用：子功能 24（$18）：以子功能 6 调用外挂输入法模块 1
; 调用者：IME_SUB_TABLE（地址表）
IME_EXT1_SUB_6:
    LDA #$06
    STA SYS_SUBFUNCTION
    JSR IME_CALL_EXT1
    RTS
; 作用：子功能 25（$19）：以子功能 1 调用外挂输入法模块 2
; 调用者：IME_SUB_TABLE（地址表）
IME_EXT2_SUB_1:
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR IME_CALL_EXT2
    RTS
; 作用：子功能 26（$1A）：以子功能 2 调用外挂输入法模块 2
; 调用者：IME_SUB_TABLE（地址表）
IME_EXT2_SUB_2:
    LDA #$02
    STA SYS_SUBFUNCTION
    JSR IME_CALL_EXT2
    RTS
; 作用：子功能 27（$1B）：以子功能 3 调用外挂输入法模块 2
; 调用者：IME_SUB_TABLE（地址表）
IME_EXT2_SUB_3:
    LDA #$03
    STA SYS_SUBFUNCTION
    JSR IME_CALL_EXT2
    RTS
; 作用：子功能 28（$1C）：以子功能 4 调用外挂输入法模块 2
; 调用者：IME_SUB_TABLE（地址表）
IME_EXT2_SUB_4:
    LDA #$04
    STA SYS_SUBFUNCTION
    JSR IME_CALL_EXT2
    RTS
; 作用：子功能 29（$1D）：以子功能 5 调用外挂输入法模块 2
; 调用者：IME_SUB_TABLE（地址表）
IME_EXT2_SUB_5:
    LDA #$05
    STA SYS_SUBFUNCTION
    JSR IME_CALL_EXT2
    RTS
; 作用：子功能 30（$1E）：以子功能 6 调用外挂输入法模块 2
; 调用者：IME_SUB_TABLE（地址表）
IME_EXT2_SUB_6:
    LDA #$06
    STA SYS_SUBFUNCTION
    JSR IME_CALL_EXT2
    RTS
; 作用：子功能 31（$1F）：以子功能 1 调用外挂输入法模块 3
; 调用者：IME_SUB_TABLE（地址表）
IME_EXT3_SUB_1:
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR IME_CALL_EXT3
    RTS
; 作用：子功能 32（$20）：以子功能 2 调用外挂输入法模块 3
; 调用者：IME_SUB_TABLE（地址表）
IME_EXT3_SUB_2:
    LDA #$02
    STA SYS_SUBFUNCTION
    JSR IME_CALL_EXT3
    RTS
; 作用：子功能 33（$21）：以子功能 3 调用外挂输入法模块 3
; 调用者：IME_SUB_TABLE（地址表）
IME_EXT3_SUB_3:
    LDA #$03
    STA SYS_SUBFUNCTION
    JSR IME_CALL_EXT3
    RTS
; 作用：子功能 34（$22）：以子功能 4 调用外挂输入法模块 3
; 调用者：IME_SUB_TABLE（地址表）
IME_EXT3_SUB_4:
    LDA #$04
    STA SYS_SUBFUNCTION
    JSR IME_CALL_EXT3
    RTS
; 作用：子功能 35（$23）：以子功能 5 调用外挂输入法模块 3
; 调用者：IME_SUB_TABLE（地址表）
IME_EXT3_SUB_5:
    LDA #$05
    STA SYS_SUBFUNCTION
    JSR IME_CALL_EXT3
    RTS
; 作用：子功能 36（$24）：以子功能 6 调用外挂输入法模块 3
; 调用者：IME_SUB_TABLE（地址表）
IME_EXT3_SUB_6:
    LDA #$06
    STA SYS_SUBFUNCTION
    JSR IME_CALL_EXT3
    RTS
; 作用：取可用输入法标志：IME_AVAILABLE_FLAGS 放到 SYS_ARG_0F。
; 输出：SYS_ARG_0F。
; 调用者：全 ROM 没有指令或地址表引用它（只能由外部直接进入）
IME_GET_AVAILABLE:
    LDA IME_AVAILABLE_FLAGS
    STA SYS_ARG_0F
    RTS
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
