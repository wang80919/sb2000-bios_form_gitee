; 作用：------------------------------------------------------------------------
; 名称：ime-dictionary-lookup.asm
; 说明：中文输入法的词库查找与候选字处理
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：在 ROM 里接在 input-method/ime-services.asm 之后
; ------------------------------------------------------------------------
; 在音节表里查找输入串（IME_INPUT_BUF，长 IME_INPUT_LEN），结果放 IME_MATCH_RESULT 并同样返回在 A：0 没有音节以它开头，1 与某个音节完全相同，2 只是某个音节的前缀
; 输入法序号为 2（双拼）时查 IME_SHUANGPIN_TABLE（项长 2），否则查 IME_PINYIN_TABLE（项长 6）；输入串比项长还长或为空时直接返回 0
; 每比较完一项，IME_TABLE_OFFSET 加 2，因此命中时它等于项序号乘 2
; 输入：IME_METHOD、IME_INPUT_BUF、IME_INPUT_LEN。
; 输出：A 与 IME_MATCH_RESULT 为查找结果；IME_TABLE_OFFSET_LO/HI=命中项序号×2。
; 调用者：IME_PINYIN_LOOKUP、IME_SUB_17_BODY
IME_TABLE_LOOKUP:
    LDA IME_METHOD
    AND #$0F
    CMP #$02
    BEQ @shuangpin
    LDA #<IME_PINYIN_TABLE
    STA IME_TABLE_PTR_LO
    LDA #>IME_PINYIN_TABLE
    STA IME_TABLE_PTR_HI
    LDA #$06
    STA IME_ENTRY_LENGTH
    JMP @compare_length
@shuangpin:
    LDA #<IME_SHUANGPIN_TABLE
    STA IME_TABLE_PTR_LO
    LDA #>IME_SHUANGPIN_TABLE
    STA IME_TABLE_PTR_HI
    LDA #$02
    STA IME_ENTRY_LENGTH
@compare_length:
    CMP IME_INPUT_LEN
    BCS @begin
@not_found:
    LDA #$00
    RTS
@begin:
    LDA IME_INPUT_LEN
    BEQ @not_found
    LDA #$00
    STA IME_MATCH_RESULT
    LDA #$00
    STA IME_TABLE_OFFSET_LO
    STA IME_TABLE_OFFSET_HI
@next_entry:
    LDY #$00
@compare_loop:
    LDA (IME_TABLE_PTR_LO),Y
    CMP IME_INPUT_BUF,Y
    BNE @advance
    INY
    CPY IME_INPUT_LEN
    BNE @compare_loop
    CPY IME_ENTRY_LENGTH
    BCS @exact
    LDA (IME_TABLE_PTR_LO),Y
    CMP #$20
    BNE @prefix
@exact:
    LDA #$01
    RTS
@prefix:
    LDA #$02
    STA IME_MATCH_RESULT
@advance:
    LDA IME_TABLE_PTR_LO
    CLC
    ADC IME_ENTRY_LENGTH
    STA IME_TABLE_PTR_LO
    LDA IME_TABLE_PTR_HI
    ADC #$00
    STA IME_TABLE_PTR_HI
    LDA IME_TABLE_OFFSET_LO
    CLC
    ADC #$02
    STA IME_TABLE_OFFSET_LO
    LDA IME_TABLE_OFFSET_HI
    ADC #$00
    STA IME_TABLE_OFFSET_HI
    LDA IME_METHOD
    AND #$0F
    CMP #$02
    BEQ @check_shuangpin_end
    LDA IME_TABLE_PTR_HI
    CMP #>IME_SHUANGPIN_TABLE
    BCC @next_entry
    BNE @done
    LDA IME_TABLE_PTR_LO
    CMP #<IME_SHUANGPIN_TABLE
    BCC @next_entry
    JMP @done
@check_shuangpin_end:
    LDA IME_TABLE_PTR_HI
    CMP #>IME_KEY_PINYIN
    BCC @next_entry
    BNE @done
    LDA IME_TABLE_PTR_LO
    CMP #<IME_KEY_PINYIN
    BCC @next_entry
@done:
    LDA IME_MATCH_RESULT
    RTS
; 作用：读当前页的候选字：词库在 ROM 第 10-19 页（页组 $10 起映射到 $B000 窗口），索引表每项 2 字节，第 IME_SAVED_OFFSET/2 项是该音节候选字表的位置
; 候选字表是连续的 2 字节汉字内码，以 $FF 结束；每页最多 5 个，先跳过 IME_PAGE_INDEX 页；结果放 IME_CANDIDATES，个数放 IME_CANDIDATE_COUNT
; 后面还有候选字时 IME_PAGE_FLAGS 位 7、6 置位（SYS_ARG_10 为 $FF 时不检查）
; 输入：IME_SAVED_OFFSET_LO/HI（音节在索引里的偏移）、IME_PAGE_INDEX、SYS_ARG_10。
; 输出：IME_CANDIDATES、IME_CANDIDATE_COUNT、IME_PAGE_FLAGS。
; 副作用：IME_SEEK_OFFSET_LO/HI 保存并恢复，SYS_ARG_03 作页计数。
; 调用者：IME_PINYIN_SHOW、IME_PAGE_NEXT、IME_PAGE_PREV
IME_LOAD_CANDIDATES:
    LDA IME_SAVED_OFFSET_LO
    STA IME_SEEK_OFFSET_LO
    LDA IME_SAVED_OFFSET_HI
    STA IME_SEEK_OFFSET_HI
    LDA #$10
    STA IME_SEEK_PAGE
    LDA #$00
    STA IME_SEEK_BASE_LO
    LDA #$00
    STA IME_SEEK_BASE_HI
    LDA IME_SEEK_OFFSET_LO
    PHA
    LDA IME_SEEK_OFFSET_HI
    PHA
    JSR IME_SEEK_DICT
    JSR IME_READ_DICT_BYTE
    STA IME_SEEK_OFFSET_LO
    JSR IME_READ_DICT_BYTE
    STA IME_SEEK_OFFSET_HI
    JSR IME_SEEK_DICT
    LDA #$00
    STA SYS_ARG_03
@page_loop:
    LDX #$00
@read_loop:
    JSR IME_READ_DICT_BYTE
    CMP #$FF
    BEQ @finish
    STA IME_CANDIDATES,X
    INX
    CPX #$0A
    BCC @read_loop
    LDA SYS_ARG_03
    CMP IME_PAGE_INDEX
    BCS @finish
    INC SYS_ARG_03
    JMP @page_loop
@finish:
    CPX #$00
    BEQ @restore
    TXA
    LSR A
    STA IME_CANDIDATE_COUNT
    LDA SYS_ARG_10
    CMP #$FF
    BEQ @restore
    JSR IME_READ_DICT_BYTE
    CMP #$FF
    BEQ @restore
    LDA IME_PAGE_FLAGS
    ORA #$C0
    STA IME_PAGE_FLAGS
@restore:
    PLA
    STA IME_SEEK_OFFSET_HI
    PLA
    STA IME_SEEK_OFFSET_LO
    RTS
; 作用：把 KEY_ASCII 追加到输入串缓冲 IME_INPUT_BUF，输入长度 IME_INPUT_LEN 加 1
; 输入：KEY_ASCII、IME_INPUT_LEN。
; 调用者：IME_KEY_AREA_CODE、IME_PINYIN_APPEND
IME_APPEND_KEY:
    LDY IME_INPUT_LEN
    LDA KEY_ASCII
    STA IME_INPUT_BUF,Y
    INC IME_INPUT_LEN
    RTS
; 作用：按键处理入口：子功能 0 调用 IME_CALL_EXT1
; 调用者：IME_KEY_HANDLER_TABLE（地址表）
IME_KEY_CALL_EXT1:
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR IME_CALL_EXT1
    RTS
; 作用：按键处理入口：子功能 0 调用 IME_CALL_EXT2
; 调用者：IME_KEY_HANDLER_TABLE（地址表）
IME_KEY_CALL_EXT2:
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR IME_CALL_EXT2
    RTS
; 作用：按键处理入口：子功能 0 调用 IME_CALL_EXT3
; 调用者：IME_KEY_HANDLER_TABLE（地址表）
IME_KEY_CALL_EXT3:
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR IME_CALL_EXT3
    RTS
; 作用：按键处理入口：把按键原样交给 IME_PASS_KEY
; 调用者：IME_KEY_HANDLER_TABLE（地址表）
IME_KEY_PASS:
    JSR IME_PASS_KEY
    RTS
; 作用：按键处理入口（输入法序号 8）：= 与 . 键把候选字翻到下一页，- 与 , 键翻到上一页，其他键原样传回；页序号最大 $12（输入长度为 9 时最大 $0F），到上限后不再增加并清除 IME_PAGE_FLAGS 位 7
; 输入：KEY_ASCII、IME_PAGE_INDEX、IME_INPUT_LEN。
; 调用者：IME_KEY_HANDLER_TABLE（地址表）
IME_KEY_PAGE_KEYS:
    LDA KEY_ASCII
    CMP #$3D
    BEQ @next_page
    CMP #$2E
    BEQ @next_page
    JMP @check_prev
@next_page:
    LDA IME_INPUT_LEN
    CMP #$09
    BEQ @next_page_len9
    LDA IME_PAGE_INDEX
    CMP #$12
    BCS @return
    INC IME_PAGE_INDEX
    JMP @refresh
@next_page_len9:
    LDA IME_PAGE_INDEX
    CMP #$0F
    BCS @return
    INC IME_PAGE_INDEX
    JMP @refresh
@check_prev:
    CMP #$2D
    BEQ @prev_page
    CMP #$2C
    BEQ @prev_page
    JMP @pass_key
@prev_page:
    LDA IME_PAGE_INDEX
    BEQ @return
    DEC IME_PAGE_INDEX
    JMP @refresh
@pass_key:
    JSR IME_PASS_KEY
@return:
    RTS
@refresh:
    JSR IME_BUILD_CANDIDATE_LIST
    LDA IME_PAGE_INDEX
    CMP #$12
    BCS @clear_more_flag
    LDA IME_INPUT_LEN
    CMP #$09
    BNE @set_more_flag
    LDA IME_PAGE_INDEX
    CMP #$0F
    BCS @clear_more_flag
@set_more_flag:
    LDA IME_PAGE_FLAGS
    ORA #$80
    STA IME_PAGE_FLAGS
    JMP @show_hint
@clear_more_flag:
    LDA IME_PAGE_FLAGS
    AND #$7F
    STA IME_PAGE_FLAGS
@show_hint:
    JSR IME_SHOW_HINT_IF_EMPTY
    RTS
; 作用：按输入长度（加 $A0）与页号 IME_PAGE_INDEX（乘 5 加 $A1）生成最多 5 个候选内码，放 IME_CANDIDATES 起，候选数存 IME_CANDIDATE_COUNT
; 输入：IME_INPUT_LEN、IME_PAGE_INDEX。
; 输出：IME_CANDIDATES、IME_CANDIDATE_COUNT。
; 调用者：IME_SUB_01、IME_POLL_KEY、IME_KEY_PAGE_KEYS
IME_BUILD_CANDIDATE_LIST:
    LDA IME_INPUT_LEN
    CLC
    ADC #$A0
    STA DRAW_MODE_TEMP
    LDA IME_PAGE_INDEX
    ASL A
    ASL A
    CLC
    ADC IME_PAGE_INDEX
    ADC #$A1
    STA DISPLAY_TEMP_1
    LDY #$00
@loop:
    LDA DRAW_MODE_TEMP
    STA IME_CANDIDATES,Y
    INY
    LDA DISPLAY_TEMP_1
    STA IME_CANDIDATES,Y
    INY
    CPY #$0A
    BCS @done
    INC DISPLAY_TEMP_1
    LDA IME_INPUT_LEN
    BEQ @zero_length_limit
    LDA DISPLAY_TEMP_1
    CMP #$FF
    BCS @done
    JMP @loop
@zero_length_limit:
    LDA DISPLAY_TEMP_1
    CMP #$F0
    BCS @done
    JMP @loop
@done:
    TYA
    LSR A
    STA IME_CANDIDATE_COUNT
    RTS
; 作用：单个全角标点映射表：每项 3 字节（按键 ASCII，全角码高字节、低字节），以 $FF 结束
; 引用者：IME_SPECIAL_KEY_LOOKUP（取地址）
IME_PUNCT_SINGLE_TABLE:
    .byte $2F,$A1,$A2,$2E,$A1,$A3,$2A,$A1,$C1,$5C,$A1,$AD,$7C,$A1,$A9,$FF
; 作用：成对全角标点映射表：每项 5 字节（按键 ASCII，两个全角码交替使用，如引号与括号的左右两半），以 $FF 结束
; 引用者：IME_SPECIAL_KEY_LOOKUP（取地址）
IME_PUNCT_PAIR_TABLE:
    .byte $5B,$A1,$BE,$A1,$BF,$5D,$A1,$BC,$A1,$BD,$7B,$A1,$B6,$A1,$B7,$7D
    .byte $A1,$B4,$A1,$B5,$22,$A1,$B0,$A1,$B1,$27,$A1,$AE,$A1,$AF,$FF
; 作用：全角字母数字映射表：每项 3 字节（按键 ASCII，全角码高字节、低字节）
; 引用者：IME_SPECIAL_KEY_LOOKUP（取地址）
IME_FULLWIDTH_TABLE:
    .byte $20,$A1,$A1,$7E,$A3,$FE,$21,$A3,$A1,$40,$A3,$C0,$23,$A3,$A3,$24
    .byte $A3,$A4,$25,$A3,$A5,$5E,$A3,$DE,$26,$A3,$A6,$2A,$A3,$AA,$28,$A3
    .byte $A8,$29,$A3,$A9,$5F,$A3,$DF,$2B,$A3,$AB,$7C,$A3,$FC,$60,$A3,$E0
    .byte $31,$A3,$B1,$32,$A3,$B2,$33,$A3,$B3,$34,$A3,$B4,$35,$A3,$B5,$36
    .byte $A3,$B6,$37,$A3,$B7,$38,$A3,$B8,$39,$A3,$B9,$30,$A3,$B0,$2D,$A3
    .byte $AD,$3D,$A3,$BD,$5C,$A3,$DC,$7B,$A3,$FB,$7D,$A3,$FD,$5B,$A3,$DB
    .byte $5D,$A3,$DD,$3A,$A3,$BA,$3B,$A3,$BB,$22,$A3,$A2,$27,$A3,$A7,$3C
    .byte $A3,$BC,$2C,$A3,$AC,$3E,$A3,$BE,$2E,$A3,$AE,$3F,$A3,$BF,$2F,$A3
    .byte $AF,$51,$A3,$D1,$57,$A3,$D7,$45,$A3,$C5,$52,$A3,$D2,$54,$A3,$D4
    .byte $59,$A3,$D9,$55,$A3,$D5,$49,$A3,$C9,$4F,$A3,$CF,$50,$A3,$D0,$41
    .byte $A3,$C1,$53,$A3,$D3,$44,$A3,$C4,$46,$A3,$C6,$47,$A3,$C7,$48,$A3
    .byte $C8,$4A,$A3,$CA,$4B,$A3,$CB,$4C,$A3,$CC,$5A,$A3,$DA,$58,$A3,$D8
    .byte $43,$A3,$C3,$56,$A3,$D6,$42,$A3,$C2,$4E,$A3,$CE,$4D,$A3,$CD,$71
    .byte $A3,$F1,$77,$A3,$F7,$65,$A3,$E5,$72,$A3,$F2,$74,$A3,$F4,$79,$A3
    .byte $F9,$75,$A3,$F5,$69,$A3,$E9,$6F,$A3,$EF,$70,$A3,$F0,$61,$A3,$E1
    .byte $73,$A3,$F3,$64,$A3,$E4,$66,$A3,$E6,$67,$A3,$E7,$68,$A3,$E8,$6A
    .byte $A3,$EA,$6B,$A3,$EB,$6C,$A3,$EC,$7A,$A3,$FA,$78,$A3,$F8,$63,$A3
    .byte $E3,$76,$A3,$F6,$62,$A3,$E2,$6E,$A3,$EE,$6D,$A3,$ED,$FF
; 作用：特殊键查表：先在全角标点单项表 IME_PUNCT_SINGLE_TABLE（3 字节一项：键、2 字节输出，$FF 结束）里找，找到就把输出放 IME_KEY_OUT 起的两个字节、IME_KEY_RESULT 置 2；找不到再查成对标点表 IME_PUNCT_PAIR_TABLE（5 字节一项：键和两对输出，第 n 项按 IME_KEY_MASK 的第 n 位选第一或第二对并翻转该位）；再找不到查全角字母数字表 IME_FULLWIDTH_TABLE（3 字节一项）；IME_METHOD 低 4 位为 9 时跳过前两张表，只查全角表。
; 输入：A=按键码。
; 输出：找到时 IME_KEY_RESULT=2，IME_KEY_OUT 起 2 个字节为输出；没找到时 IME_KEY_RESULT 不变。
; 调用者：IME_SUB_11
IME_SPECIAL_KEY_LOOKUP:
    STA DRAW_MODE_TEMP
    LDA IME_METHOD
    AND #$0F
    CMP #$09
    BNE @punct_tables
    JMP @fullwidth
@punct_tables:
    LDA #<IME_PUNCT_SINGLE_TABLE
    STA IME_TABLE_PTR_LO
    LDA #>IME_PUNCT_SINGLE_TABLE
    STA IME_TABLE_PTR_HI
    LDY #$00
@loop:
    LDA (IME_TABLE_PTR_LO),Y
    CMP DRAW_MODE_TEMP
    BEQ @single_found
    CMP #$FF
    BEQ @pair_start
    LDA IME_TABLE_PTR_LO
    CLC
    ADC #$03
    STA IME_TABLE_PTR_LO
    LDA IME_TABLE_PTR_HI
    ADC #$00
    STA IME_TABLE_PTR_HI
    JMP @loop
@single_found:
    INY
    LDA (IME_TABLE_PTR_LO),Y
    STA IME_KEY_OUT
    INY
    LDA (IME_TABLE_PTR_LO),Y
    STA IME_KEY_OUT+1
    LDA #$02
    STA IME_KEY_RESULT
    RTS
@pair_start:
    LDA #$01
    STA DISPLAY_TEMP_1
    LDA #<IME_PUNCT_PAIR_TABLE
    STA IME_TABLE_PTR_LO
    LDA #>IME_PUNCT_PAIR_TABLE
    STA IME_TABLE_PTR_HI
    LDY #$00
@pair_loop:
    LDA (IME_TABLE_PTR_LO),Y
    CMP DRAW_MODE_TEMP
    BEQ @pair_found
    CMP #$FF
    BEQ @fullwidth
    LDA IME_TABLE_PTR_LO
    CLC
    ADC #$05
    STA IME_TABLE_PTR_LO
    LDA IME_TABLE_PTR_HI
    ADC #$00
    STA IME_TABLE_PTR_HI
    ASL DISPLAY_TEMP_1
    JMP @pair_loop
@pair_found:
    LDA IME_KEY_MASK
    AND DISPLAY_TEMP_1
    BEQ @pair_store
    INY
    INY
@pair_store:
    INY
    LDA (IME_TABLE_PTR_LO),Y
    STA IME_KEY_OUT
    INY
    LDA (IME_TABLE_PTR_LO),Y
    STA IME_KEY_OUT+1
    LDA #$02
    STA IME_KEY_RESULT
    LDA IME_KEY_MASK
    EOR DISPLAY_TEMP_1
    STA IME_KEY_MASK
    RTS
@fullwidth:
    LDA #<IME_FULLWIDTH_TABLE
    STA IME_TABLE_PTR_LO
    LDA #>IME_FULLWIDTH_TABLE
    STA IME_TABLE_PTR_HI
    LDY #$00
@fullwidth_loop:
    LDA (IME_TABLE_PTR_LO),Y
    CMP DRAW_MODE_TEMP
    BEQ @fullwidth_found
    CMP #$FF
    BEQ @return
    LDA IME_TABLE_PTR_LO
    CLC
    ADC #$03
    STA IME_TABLE_PTR_LO
    LDA IME_TABLE_PTR_HI
    ADC #$00
    STA IME_TABLE_PTR_HI
    JMP @fullwidth_loop
@fullwidth_found:
    LDA #$02
    STA IME_KEY_RESULT
    INY
    LDA (IME_TABLE_PTR_LO),Y
    STA IME_KEY_OUT
    INY
    LDA (IME_TABLE_PTR_LO),Y
    STA IME_KEY_OUT+1
@return:
    RTS
; 作用：退格：清候选数，输入长度减 1，重画状态行（IME_CLEAR_STATUS_LINE）
; 调用者：IME_KEY_AREA_CODE、IME_KEY_PINYIN
IME_BACKSPACE:
    LDA #$00
    STA IME_CANDIDATE_COUNT
    DEC IME_INPUT_LEN
    JSR IME_CLEAR_STATUS_LINE
    RTS
; 作用：IME_METHOD 低 4 位为 8 或输入串为空时把按键原样传回（IME_PASS_KEY）；否则（输入串非空）清空输入状态（输入长度、IME_PAGE_FLAGS、候选数）并清状态行，这个按键被丢弃。
; 调用者：IME_PROCESS_KEY、IME_KEY_AREA_CODE
IME_KEY_PASS_OR_FLUSH:
    LDA IME_METHOD
    AND #$0F
    CMP #$08
    BEQ @pass
    LDA IME_INPUT_LEN
    BNE @flush
@pass:
    JSR IME_PASS_KEY
    RTS
@flush:
    LDA #$00
    STA IME_INPUT_LEN
    STA IME_PAGE_FLAGS
    STA IME_CANDIDATE_COUNT
    STA IME_RESERVED_6952
    JSR IME_CLEAR_STATUS_LINE
    RTS
; 作用：算出词库（ROM 第 10-19 页，页组从 $10 起，每页 4KB）里某个位置的页组 SYS_GROUP 与窗口地址 PROG_ENTRY_LO/HI：页组 = IME_SEEK_PAGE 加（IME_SEEK_BASE 加 IME_SEEK_OFFSET 的高 4 位），窗口地址 = $B000 加这个和的低 12 位。
; 输入：IME_SEEK_PAGE、IME_SEEK_BASE_LO/HI、IME_SEEK_OFFSET_LO/HI（即 MATH_ARG_00-04）。
; 输出：SYS_GROUP、PROG_ENTRY_LO/HI。
; 调用者：IME_SEEK_DICT
IME_CALC_DICT_ADDR:
    LDA MATH_ARG_00
    LDA MATH_ARG_01
    CLC
    ADC MATH_ARG_03
    STA DRAW_MODE_TEMP
    LDA MATH_ARG_02
    ADC MATH_ARG_04
    STA DISPLAY_TEMP_1
    ROR A
    LSR A
    LSR A
    LSR A
    CLC
    ADC MATH_ARG_00
    STA SYS_GROUP
    LDA DISPLAY_TEMP_1
    AND #$0F
    CLC
    ADC #$B0
    STA PROG_ENTRY_HI
    LDA DRAW_MODE_TEMP
    STA PROG_ENTRY_LO
    RTS
; 作用：把 SYS_GROUP 作为页号，调用功能 $29 映射到窗口 3。
; 输入：SYS_GROUP。
; 调用者：IME_SEEK_DICT、IME_READ_DICT_BYTE、IME_DRAW_STATUS_LINE
IME_MAP_GROUP:
    LDA SYS_GROUP
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：定位词库：IME_CALC_DICT_ADDR 后接 IME_MAP_GROUP
; 调用者：IME_LOAD_CANDIDATES、IME_RESET_SEARCH、IME_COPY_DICT_TO_RAM、IME_FIND_CHAR_IN_DICT
IME_SEEK_DICT:
    JSR IME_CALC_DICT_ADDR
    JSR IME_MAP_GROUP
    RTS
; 作用：读 PROG_ENTRY 处的一个字节到 SYS_ARG_10，指针加 1；指针到 $C000 时页组加 1 并重新映射，指针回到 $B000。
; 输入：PROG_ENTRY_LO/HI、SYS_GROUP。
; 输出：A=SYS_ARG_10=读到的字节（返回时 Z 标志反映 PLA 的结果）。
; 调用者：IME_LOAD_CANDIDATES、IME_RESET_SEARCH、IME_COPY_DICT_TO_RAM、IME_FIND_CHAR_IN_DICT
IME_READ_DICT_BYTE:
    LDY #$00
    LDA (PROG_ENTRY_LO),Y
    PHA
    INC PROG_ENTRY_LO
    BNE @done
    INC PROG_ENTRY_HI
    LDA PROG_ENTRY_HI
    CMP #$C0
    BNE @done
    INC SYS_GROUP
    JSR IME_MAP_GROUP
    LDA #$B0
    STA PROG_ENTRY_HI
@done:
    PLA
    STA SYS_ARG_10
    RTS
; 作用：把按键原样传回：IME_KEY_RESULT=$82，IME_KEY_OUT 起的两个字节取 KEY_ASCII/KEY_SCAN
; 调用者：IME_POLL_KEY、IME_PROCESS_KEY、IME_HANDLE_CANDIDATE_KEY、IME_KEY_AREA_CODE、IME_PINYIN_LOOKUP、IME_PINYIN_REJECT、IME_KEY_PASS、IME_KEY_PAGE_KEYS等 9 处
IME_PASS_KEY:
    LDA #$82
    STA IME_KEY_RESULT
    LDA KEY_ASCII
    STA IME_KEY_OUT
    LDA KEY_SCAN
    STA IME_KEY_OUT+1
    RTS
; 作用：把候选区 IME_CANDIDATES 起（候选数 IME_CANDIDATE_COUNT 的低 3 位×2 字节）复制到输出 IME_KEY_OUT 起，IME_KEY_RESULT 置为长度
; 输入：IME_CANDIDATES、IME_CANDIDATE_COUNT。
; 输出：IME_KEY_OUT 起的候选内码，IME_KEY_RESULT=字节数。
; 调用者：IME_HANDLE_CANDIDATE_KEY
IME_COPY_CANDIDATE:
    LDA IME_CANDIDATE_COUNT
    AND #$07
    ASL A
    STA IME_KEY_RESULT
    LDY #$00
@loop:
    LDA IME_CANDIDATES,Y
    STA IME_KEY_OUT,Y
    INY
    CPY IME_KEY_RESULT
    BCC @loop
    RTS
; 作用：清候选数 IME_CANDIDATE_COUNT、IME_HINT_FLAG、MATH_ARG_06，MATH_ARG_05 取 IME_PAGE_INDEX×5，并检查 SYS_ARG_07 减 $B0 是否小于 $29（决定是否开始查词）
; 输入：SYS_ARG_07、SYS_ARG_08、IME_PAGE_INDEX。
; 输出：IME_CANDIDATES、IME_CANDIDATE_COUNT（最多 5 个，候选数到 6 时减 1 并置 IME_PAGE_FLAGS 位 7）。
; 调用者：IME_SUB_11、IME_PROCESS_KEY、IME_SUB_12
IME_RESET_SEARCH:
    LDA #$00
    STA IME_CANDIDATE_COUNT
    LDA #$00
    STA IME_HINT_FLAG
    STA MATH_ARG_06
    LDA IME_PAGE_INDEX
    ASL A
    ASL A
    CLC
    ADC IME_PAGE_INDEX
    STA MATH_ARG_05
    LDA SYS_ARG_07
    SEC
    SBC #$B0
    CMP #$29
    BCC @seek_zone
    RTS
@seek_zone:
    ASL A
    PHA
    LDA #$14
    STA MATH_ARG_00
    LDA #$00
    STA MATH_ARG_01
    LDA #$00
    STA MATH_ARG_02
    LDA #$00
    STA MATH_ARG_04
    PLA
    STA MATH_ARG_03
    JSR IME_SEEK_DICT
    JSR IME_READ_DICT_BYTE
    STA MATH_ARG_03
    JSR IME_READ_DICT_BYTE
    STA MATH_ARG_04
    JSR IME_SEEK_DICT
    LDA #$A1
    STA DRAW_MODE_TEMP
    LDY #$00
@find_entry:
    LDA SYS_ARG_08
    CMP DRAW_MODE_TEMP
    BEQ @collect
@skip_entry:
    JSR IME_READ_DICT_BYTE
    BEQ @next_entry
    JMP @skip_entry
@next_entry:
    INC DRAW_MODE_TEMP
    JMP @find_entry
@collect:
    JSR IME_READ_DICT_BYTE
    BEQ @return
    AND #$80
    BEQ @return
    LDA SYS_ARG_10
    STA DRAW_MODE_TEMP
    JSR IME_READ_DICT_BYTE
    STA DISPLAY_TEMP_1
    JSR IME_ADVANCE_CANDIDATE
    LDA IME_CANDIDATE_COUNT
    CMP #$06
    BCC @collect
    DEC IME_CANDIDATE_COUNT
    LDA IME_PAGE_FLAGS
    ORA #$80
    STA IME_PAGE_FLAGS
@return:
    RTS
; 作用：候选计数 MATH_ARG_06 加 1，与要跳过的个数 MATH_ARG_05 比较，超过时把 DRAW_MODE_TEMP、DISPLAY_TEMP_1 这一对字节存入 IME_CANDIDATES 并让候选数加 1；SYS_ARG_03 不为 0 时改为转 IME_FAR_WRITE_PAIR 写进扩展 RAM。
; 调用者：IME_RESET_SEARCH
IME_ADVANCE_CANDIDATE:
    LDA SYS_ARG_03
    BEQ @count
    JMP IME_FAR_WRITE_PAIR
@count:
    INC MATH_ARG_06
    LDA MATH_ARG_06
    CMP MATH_ARG_05
    BCC @return
    BNE @store
@return:
    RTS
@store:
    LDA IME_CANDIDATE_COUNT
    ASL A
    TAY
    LDA DRAW_MODE_TEMP
    STA IME_CANDIDATES,Y
    LDA DISPLAY_TEMP_1
    STA IME_CANDIDATES+1,Y
    INC IME_CANDIDATE_COUNT
    RTS
    .byte $C7,$F8,$CE,$BB,$C8,$AB,$C6,$B4,$CB,$AB,$C6,$B4,$CE,$E5,$B1,$CA
    .byte $B1,$ED,$D0,$CE,$C8,$CF,$D6,$AA,$CE,$B4,$B6,$A8,$C0,$A9,$B3,$E4
    .byte $CD,$BC,$D0,$CE
    .byte $D3,$A2,$CE,$C4
    .byte $B9,$FA,$B1,$EA,$C1,$AA,$CF,$EB
; 作用：显示输入法名称：IME_FLAGS 位 2 打开时直接返回；否则把输入法名称（4 字节）装入状态行缓冲 IME_STATUS_TEXT：IME_METHOD 低 4 位为 6 时取 IME_MODULE_INFO+1 处，其他取 $9CF9 起每项 4 字节（序号×4）；清状态行（IME_CLEAR_STATUS_LINE）；方式 9 时再把 IME_VERSION_BUF 的 24 字节复制到 IME_STATUS_TEXT+6 起并重画状态行。
; 调用者：IME_SUB_01、IME_SUB_11、IME_TOGGLE_MODE、IME_KEY_AREA_CODE、IME_PINYIN_RESTART
IME_SHOW_METHOD_NAME:
    LDA IME_FLAGS
    AND #$04
    BEQ @build
    RTS
@build:
    LDA IME_METHOD
    AND #$0F
    CMP #$06
    BNE @table_entry
    LDA #<IME_MODULE_INFO+1
    STA IME_TABLE_PTR_LO
    LDA #>IME_MODULE_INFO+1
    STA IME_TABLE_PTR_HI
    JMP @copy_name
@table_entry:
    ASL A
    ASL A
    CLC
    ADC #$F9
    STA IME_TABLE_PTR_LO
    LDA #$9C
    ADC #$00
    STA IME_TABLE_PTR_HI
@copy_name:
    LDY #$00
@loop:
    LDA (IME_TABLE_PTR_LO),Y
    STA IME_STATUS_TEXT,Y
    INY
    CPY #$04
    BCC @loop
    JSR IME_CLEAR_STATUS_LINE
    LDA IME_METHOD
    AND #$0F
    CMP #$09
    BNE @return
    LDX #$00
@copy_version:
    LDA IME_VERSION_BUF,X
    STA IME_STATUS_TEXT+6,X
    INX
    CPX #$18
    BCC @copy_version
    JSR IME_DRAW_STATUS_LINE
@return:
    RTS
; 作用：显示输入串：状态行缓冲 IME_STATUS_TEXT 的第 4 字节起清成空格，输入串复制到 IME_STATUS_TEXT+4 起，再重画状态行
; 输入：IME_INPUT_BUF、IME_INPUT_LEN。
; 调用者：IME_KEY_AREA_CODE、IME_PINYIN_SHOW
IME_SHOW_INPUT:
    LDY #$04
    LDA #$20
@clear_text:
    STA IME_STATUS_TEXT,Y
    INY
    CPY #$20
    BCC @clear_text
    LDY #$00
@copy_input:
    LDA IME_INPUT_BUF,Y
    STA IME_STATUS_TEXT+4,Y
    INY
    CPY IME_INPUT_LEN
    BCC @copy_input
    JSR IME_DRAW_STATUS_LINE
    RTS
; 作用：状态行提示文字“[000]”
; 引用者：IME_SHOW_HINT
IME_HINT_TEXT:
    .byte $5B,$30,$30,$30,$5D
; 作用：把 IME_HINT_TEXT 的 5 字节复制到状态行 IME_STATUS_TEXT+10 起，其余补空格后重画状态行
; 调用者：IME_PROCESS_KEY、IME_SHOW_HINT_IF_EMPTY
IME_SHOW_HINT:
    LDY #$00
@copy_hint:
    LDA IME_HINT_TEXT,Y
    STA IME_STATUS_TEXT+10,Y
    INY
    CPY #$05
    BCC @copy_hint
    LDA #$20
@pad:
    STA IME_STATUS_TEXT+10,Y
    INY
    CPY #$16
    BCC @pad
    JSR IME_DRAW_STATUS_LINE
    RTS
; 作用：没有候选（IME_CANDIDATE_COUNT 为 0）时 IME_KEY_RESULT 置 $FF 并显示提示（IME_SHOW_HINT）；否则把候选列表写到状态行 IME_STATUS_TEXT+10 起：每个候选是“序号字符加 2 字节汉字”，有下一页（IME_PAGE_FLAGS 位 7）时行尾放“>”，有上一页（IME_HINT_FLAG 或 IME_PAGE_INDEX 不为 0）时放“<”，再重画状态行。
; 调用者：IME_SUB_01、IME_SUB_11、IME_POLL_KEY、IME_PROCESS_KEY、IME_PINYIN_SHOW、IME_PAGE_NEXT、IME_PAGE_PREV、IME_KEY_PAGE_KEYS
IME_SHOW_HINT_IF_EMPTY:
    LDA IME_CANDIDATE_COUNT
    BNE @show_list
    LDA #$FF
    STA IME_KEY_RESULT
    JSR IME_SHOW_HINT
    RTS
@show_list:
    LDY #$0A
@loop:
    LDA #$20
    STA IME_STATUS_TEXT,Y
    INY
    CPY #$20
    BCC @loop
    LDA IME_PAGE_FLAGS
    AND #$80
    BEQ @check_prev
    LDA #$3E
    STA IME_STATUS_TEXT+30
@check_prev:
    LDA IME_HINT_FLAG
    BNE @prev_mark
    LDA IME_PAGE_INDEX
    BEQ @format
@prev_mark:
    LDA #$3C
    STA IME_STATUS_TEXT+29
@format:
    LDY #$00
    LDX #$00
@format_candidate:
    TYA
    CLC
    ADC #$31
    STA IME_STATUS_TEXT+10,X
    INX
    TYA
    PHA
    ASL A
    TAY
    LDA IME_CANDIDATES,Y
    STA IME_STATUS_TEXT+10,X
    INX
    LDA IME_CANDIDATES+1,Y
    STA IME_STATUS_TEXT+10,X
    INX
    PLA
    TAY
    INY
    CPY IME_CANDIDATE_COUNT
    BCC @format_candidate
    JSR IME_DRAW_STATUS_LINE
    RTS
; 作用：把状态行缓冲 IME_STATUS_TEXT 的第 4 字节起清成空格后重画
; 调用者：IME_POLL_KEY、IME_PINYIN_RESTART、IME_BACKSPACE、IME_KEY_PASS_OR_FLUSH、IME_SHOW_METHOD_NAME
IME_CLEAR_STATUS_LINE:
    LDY #$04
    LDA #$20
@loop:
    STA IME_STATUS_TEXT,Y
    INY
    CPY #$20
    BCC @loop
    JSR IME_DRAW_STATUS_LINE
    RTS
; 作用：状态行文字“第 区”（GB2312 $B5DA $20 $C7F8）
; 引用者：IME_SHOW_ZONE_LABEL
IME_TEXT_ZONE:
    .byte $B5,$DA,$20,$C7,$F8
; 作用：显示“第 区”：IME_FLAGS 位 2 打开时直接返回；否则把“第 区”（IME_TEXT_ZONE）写到状态行缓冲 IME_STATUS_TEXT+4 起，输入长度对应的数字字符写到 IME_STATUS_TEXT+6（输入长度为 0 时写“9”）。
; 调用者：IME_SUB_01、IME_POLL_KEY
IME_SHOW_ZONE_LABEL:
    LDA IME_FLAGS
    AND #$04
    BEQ @show
    RTS
@show:
    LDY #$00
@loop:
    LDA IME_TEXT_ZONE,Y
    STA IME_STATUS_TEXT+4,Y
    INY
    CPY #$05
    BCC @loop
    LDA IME_INPUT_LEN
    CLC
    ADC #$30
    CMP #$30
    BNE @store_digit
    LDA #$39
@store_digit:
    STA IME_STATUS_TEXT+6
    RTS
; 作用：用功能 $45 显示状态行：字符串在 IME_STATUS_TEXT，基础值取 IME_STATUS_TILE_LO/HI，行取 IME_STATUS_ROW，颜色等取 IME_STATUS_ARG_0B/IME_STATUS_SUBFUNCTION；调用 12 次
; 输入：IME_STATUS_TEXT、IME_STATUS_TILE_LO/HI、IME_STATUS_ROW、IME_STATUS_ARG_0B、IME_STATUS_SUBFUNCTION。
; 副作用：SYS_GROUP、PROG_ENTRY_LO/HI 经栈保存并恢复，再重新映射窗口。
; 调用者：IME_SUB_03、IME_SUB_04、IME_SUB_05、IME_SUB_06、IME_LOAD_STATUS_LINE、IME_TOGGLE_MODE、IME_PROCESS_KEY、IME_SHOW_METHOD_NAME等 12 处
IME_DRAW_STATUS_LINE:
    LDA SYS_GROUP
    PHA
    LDA PROG_ENTRY_LO
    PHA
    LDA PROG_ENTRY_HI
    PHA
    LDA #$00
    STA IME_STATUS_TEXT+32
    LDA WINDOW_SAVE_0
    STA SYS_GROUP
    LDA #<IME_STATUS_TEXT
    STA PROG_ENTRY_LO
    LDA #>IME_STATUS_TEXT
    STA PROG_ENTRY_HI
    LDA IME_STATUS_TILE_LO
    STA SYS_ARG_09
    LDA IME_STATUS_TILE_HI
    STA SYS_ARG_0A
    LDA IME_STATUS_SUBFUNCTION
    STA SYS_SUBFUNCTION
    LDA IME_STATUS_ARG_0B
    STA SYS_ARG_0B
    LDA #$00
    STA SYS_ARG_05
    LDA IME_STATUS_ROW
    STA SYS_ARG_06
    LDA #$45
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    PLA
    STA PROG_ENTRY_HI
    PLA
    STA PROG_ENTRY_LO
    PLA
    STA SYS_GROUP
    JSR IME_MAP_GROUP
    RTS
; 作用：调用外挂输入法模块 1：页组取 IME_EXT1_GROUP，经功能 $25 进入它的 $8000，子功能号已写在 SYS_SUBFUNCTION
; 调用者：IME_KEY_CALL_EXT1、IME_EXT1_SUB_1、IME_EXT1_SUB_2、IME_EXT1_SUB_3、IME_EXT1_SUB_4、IME_EXT1_SUB_5、IME_EXT1_SUB_6
IME_CALL_EXT1:
    LDA IME_EXT1_GROUP
    STA SYS_GROUP
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$80
    STA PROG_ENTRY_HI
    LDA #$25
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：调用外挂输入法模块 2：页组取 IME_EXT2_GROUP，其余同 IME_CALL_EXT1
; 调用者：IME_KEY_CALL_EXT2、IME_EXT2_SUB_1、IME_EXT2_SUB_2、IME_EXT2_SUB_3、IME_EXT2_SUB_4、IME_EXT2_SUB_5、IME_EXT2_SUB_6
IME_CALL_EXT2:
    LDA IME_EXT2_GROUP
    STA SYS_GROUP
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$80
    STA PROG_ENTRY_HI
    LDA #$25
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：调用外挂输入法模块 3：页组取 IME_EXT3_GROUP，其余同 IME_CALL_EXT1
; 调用者：IME_KEY_CALL_EXT3、IME_EXT3_SUB_1、IME_EXT3_SUB_2、IME_EXT3_SUB_3、IME_EXT3_SUB_4、IME_EXT3_SUB_5、IME_EXT3_SUB_6
IME_CALL_EXT3:
    LDA IME_EXT3_GROUP
    STA SYS_GROUP
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$80
    STA PROG_ENTRY_HI
    LDA #$25
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：子功能 12：SYS_ARG_03 置 $FF，把当前页组 SYS_PAGE 存入 IME_FAR_PAGE，重置查词状态，再用功能 $2B（SYS_ARG_10 为 0）向扩展 RAM 的远地址写 1 个字节 0
; 调用者：IME_SUB_TABLE（地址表）
IME_SUB_12:
    LDA #$FF
    STA SYS_ARG_03
    LDA SYS_PAGE
    STA IME_FAR_PAGE
    JSR IME_RESET_SEARCH
    LDA #$2B
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    RTS
; 作用：用功能 $2B 把 DRAW_MODE_TEMP 与其后一个字节依次写入扩展 RAM 的远地址（页号在 IME_FAR_PAGE），写完更新页号
; 输入：DRAW_MODE_TEMP、DISPLAY_TEMP_1、IME_FAR_PAGE。
; 调用者：IME_ADVANCE_CANDIDATE
IME_FAR_WRITE_PAIR:
    LDA IME_FAR_PAGE
    STA SYS_PAGE
    LDA #$2B
    STA SYS_FUNCTION
    LDA DRAW_MODE_TEMP
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    LDA DISPLAY_TEMP_1
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    LDA SYS_PAGE
    STA IME_FAR_PAGE
    RTS
; 作用：子功能 13（$0D）：调用 IME_PARSE_CODE，把输入缓冲里的区位码或内码转成汉字内码
; 调用者：IME_SUB_TABLE（地址表）
IME_SUB_13_PARSE:
    JSR IME_PARSE_CODE
    RTS
; 作用：子功能 14（$0E）：把 SYS_ARG_07、SYS_ARG_08 的两个字节转成 4 个十六进制字符（小写）放到 IME_KEY_OUT 起的 4 个字节。
; 输入：SYS_ARG_07、SYS_ARG_08。
; 输出：IME_KEY_OUT-IME_KEY_OUT+3。
; 调用者：IME_SUB_TABLE（地址表）
IME_SUB_14_HEX:
    LDA SYS_ARG_07
    LSR A
    LSR A
    LSR A
    LSR A
    JSR NIBBLE_TO_HEX_LOWER
    STA IME_KEY_OUT
    LDA SYS_ARG_07
    AND #$0F
    JSR NIBBLE_TO_HEX_LOWER
    STA IME_KEY_OUT+1
    LDA SYS_ARG_08
    LSR A
    LSR A
    LSR A
    LSR A
    JSR NIBBLE_TO_HEX_LOWER
    STA IME_KEY_OUT+2
    LDA SYS_ARG_08
    AND #$0F
    JSR NIBBLE_TO_HEX_LOWER
    STA IME_KEY_OUT+3
    RTS
; 作用：把 0-15 转成十六进制字符（0-9、a-f）。
; 输入：A=数值（0-15）。
; 输出：A=字符。
; 调用者：IME_SUB_14_HEX
NIBBLE_TO_HEX_LOWER:
    CMP #$0A
    BCC @digit
    SEC
    SBC #$0A
    CLC
    ADC #$61
    RTS
@digit:
    CLC
    ADC #$30
    RTS
; 作用：子功能 15 取汉字的全拼音节：保存 IME_METHOD，把输入法序号临时改成 1（全拼），落入 IME_SUB_17_BODY 按输入缓冲里的音节查词库，并把汉字列表写到扩展 RAM。
; 调用者：IME_SUB_TABLE（地址表）
IME_SUB_15:
    LDA IME_METHOD
    PHA
    LDA #$01
    STA IME_METHOD
; 作用：子功能 17 的主体：保存页号 SYS_PAGE 到 IME_FAR_PAGE，保存输入长度，按输入缓冲算输入长度（IME_LEN_FROM_BUF）后查词库（IME_TABLE_LOOKUP）；与某个音节完全相同（结果 1）时把它的汉字列表复制到扩展 RAM（IME_COPY_DICT_TO_RAM）；返回前从栈里恢复 IME_INPUT_LEN 与 IME_METHOD。
; 调用者：IME_SUB_17、IME_SUB_15（顺序执行到这里）
IME_SUB_17_BODY:
    LDA SYS_PAGE
    STA IME_FAR_PAGE
    LDA IME_INPUT_LEN
    PHA
    JSR IME_LEN_FROM_BUF
    JSR IME_TABLE_LOOKUP
    CMP #$01
    BNE @restore
    JSR IME_COPY_DICT_TO_RAM
@restore:
    PLA
    STA IME_INPUT_LEN
    PLA
    STA IME_METHOD
    RTS
; 作用：把词库里 IME_TABLE_OFFSET 对应音节的汉字列表逐字节经功能 $2B 写进扩展 RAM（页号取 IME_FAR_PAGE，每写一字节更新页号），遇 $FF 结束，最后再写一个 0 作结尾。
; 输入：IME_TABLE_OFFSET_LO/HI、IME_FAR_PAGE。
; 调用者：IME_SUB_17_BODY
IME_COPY_DICT_TO_RAM:
    LDA #$10
    STA MATH_ARG_00
    LDA #$00
    STA MATH_ARG_01
    LDA #$00
    STA MATH_ARG_02
    LDA IME_TABLE_OFFSET_LO
    STA MATH_ARG_03
    LDA IME_TABLE_OFFSET_HI
    STA MATH_ARG_04
    JSR IME_SEEK_DICT
    JSR IME_READ_DICT_BYTE
    STA MATH_ARG_03
    JSR IME_READ_DICT_BYTE
    STA MATH_ARG_04
    JSR IME_SEEK_DICT
@loop:
    JSR IME_READ_DICT_BYTE
    CMP #$FF
    BEQ @terminate
    LDA IME_FAR_PAGE
    STA SYS_PAGE
    LDA #$2B
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA SYS_PAGE
    STA IME_FAR_PAGE
    JMP @loop
@terminate:
    LDA #$00
    STA SYS_ARG_10
    LDA #$2B
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：子功能 16 查汉字的全拼音节：SYS_PAGE 存入 IME_FAR_PAGE，按 SYS_ARG_07/08 的汉字内码用 IME_FIND_CHAR_IN_DICT 查词库；候选数 IME_CANDIDATE_COUNT 不为 0 时转 IME_SUB_16_CONT（下面的 BNE 指令操作数 $03 在下一页开头），为 0 时落入 IME_SUB_16_EXIT 收尾。
; 输入：SYS_PAGE、SYS_ARG_07、SYS_ARG_08。
; 调用者：IME_SUB_TABLE（地址表）
IME_SUB_16:
    LDA SYS_PAGE
    STA IME_FAR_PAGE
    JSR IME_FIND_CHAR_IN_DICT
    LDA IME_CANDIDATE_COUNT
    .byte $D0 ; BNE IME_SUB_16_CONT 的操作码，操作数 $03 是下一页（input-method/ime-extra-services.asm）的第一个字节
