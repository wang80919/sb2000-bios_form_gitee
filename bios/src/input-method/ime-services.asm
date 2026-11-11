; ------------------------------------------------------------------------
; 名称：ime-services.asm
; 说明：中文输入法服务（功能 $6D）的前半：子功能入口表与状态、按键处理，以及拼音音节表等数据
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：占ROM 第 C-D 页，汇编地址 $8000 起，后面的文件接在它后面
; ------------------------------------------------------------------------
.org $8000
    LDA SYS_SUBFUNCTION
    ASL A
    TAY
    LDA IME_SUB_TABLE,Y
    STA CALL_VEC_LO
    LDA IME_SUB_TABLE+1,Y
    STA CALL_VEC_HI
    JMP (CALL_VEC_LO)
; 作用：中文输入法服务（功能 $6D）的子功能入口表：第 N 项对应子功能 N，共 37 项（$00-$24），每项 2 字节
; 引用者：ime-services.asm 开头的入口代码
IME_SUB_TABLE:
    .word IME_SUB_00,IME_SUB_01,IME_SUB_02,IME_SUB_03,IME_SUB_04,IME_SUB_05,IME_SUB_06,IME_SUB_07
    .word IME_SUB_08,IME_SUB_09,IME_SUB_10,IME_SUB_11,IME_SUB_12,IME_SUB_13_PARSE,IME_SUB_14_HEX,IME_SUB_15
    .word IME_SUB_16,IME_SUB_17,IME_SUB_18,IME_EXT1_SUB_1,IME_EXT1_SUB_2,IME_EXT1_SUB_3,IME_EXT1_SUB_4,IME_EXT1_SUB_5
    .word IME_EXT1_SUB_6,IME_EXT2_SUB_1,IME_EXT2_SUB_2,IME_EXT2_SUB_3,IME_EXT2_SUB_4,IME_EXT2_SUB_5,IME_EXT2_SUB_6,IME_EXT3_SUB_1
    .word IME_EXT3_SUB_2,IME_EXT3_SUB_3,IME_EXT3_SUB_4,IME_EXT3_SUB_5,IME_EXT3_SUB_6
; 作用：子功能 0：初始化输入法：把 IME_ARG_* 参数存入状态行与输入法设置（IME_STATUS_ROW、IME_STATUS_TILE_LO/HI、IME_STATUS_SUBFUNCTION、IME_STATUS_ARG_0B、IME_METHOD、IME_OPTION_FLAGS、IME_FLAGS），复制版本文字到 IME_VERSION_BUF，IME_KEY_MASK 清 0，最后以 IME_ARG_METHOD 为序号选择输入法（IME_SUB_01）；输入法序号不小于 10 时失败。
; 输入：IME_ARG_ROW、IME_ARG_TILE_LO/HI、IME_ARG_SUBFUNCTION、IME_ARG_0B、IME_ARG_METHOD、IME_ARG_OPTIONS、IME_ARG_FLAGS。
; 输出：SYS_STATUS=0 成功，1 失败。
; 调用者：IME_SUB_TABLE（地址表）
IME_SUB_00:
    LDA #$00
    STA SYS_STATUS
    LDA IME_ARG_ROW
    STA IME_STATUS_ROW
    LDA IME_ARG_TILE_LO
    STA IME_STATUS_TILE_LO
    LDA IME_ARG_TILE_HI
    STA IME_STATUS_TILE_HI
    LDA IME_ARG_SUBFUNCTION
    STA IME_STATUS_SUBFUNCTION
    LDA IME_ARG_0B
    STA IME_STATUS_ARG_0B
    LDA IME_ARG_METHOD
    CMP #$0A
    BCS IME_SELECT_FAIL
    STA IME_METHOD
    LDA IME_ARG_OPTIONS
    STA IME_OPTION_FLAGS
    LDA IME_ARG_FLAGS
    STA IME_FLAGS
    LDX #$00
@loop:
    LDA IME_VERSION_TEXT,X
    STA IME_VERSION_BUF,X
    INX
    CPX #$18
    BCC @loop
    LDA #$00
    STA IME_KEY_MASK
    LDA IME_METHOD
    STA SYS_ARG_0F
    JSR IME_SUB_01
    RTS
; 作用：选择输入法失败：SYS_STATUS 置 1 后返回。
; 调用者：IME_SUB_00、IME_SUB_01
IME_SELECT_FAIL:
    LDA #$01
    STA SYS_STATUS
    RTS
; 作用：输入法版本文字“SUBOR中文输入法 3.00版”（GB2312 混排，24 字节）
; 引用者：IME_SUB_00
IME_VERSION_TEXT:
    .byte $53,$55,$42,$4F,$52,$D6,$D0,$CE,$C4,$CA,$E4,$C8,$EB,$B7,$A8,$20
    .byte $33,$2E,$30,$30,$B0,$E6,$20,$20
; 作用：子功能 1 选择输入法：SYS_ARG_0F 低 4 位是输入法序号 0-9；序号 3-6 要求 IME_AVAILABLE_FLAGS 的位 0-3 允许，7 不可选；SYS_ARG_0F 位 7 置位时还要核对 IME_OPTION_FLAGS 里的允许位（IME_CHECK_OPTION）。成功后清输入状态（输入长度、IME_KEY_RESULT、IME_PAGE_FLAGS、IME_PAGE_INDEX、IME_HINT_FLAG、候选数），把序号写入 IME_METHOD 低 4 位，显示输入法名称（IME_SHOW_METHOD_NAME），清 IME_FLAGS 位 7；序号为 8（区位码）时另显示“第 区”和候选。
; 输入：SYS_ARG_0F。
; 输出：SYS_STATUS=0 成功，1 失败。
; 调用者：IME_SUB_TABLE（地址表）、IME_SUB_00、IME_POLL_KEY
IME_SUB_01:
    LDA SYS_ARG_0F
    AND #$0F
    CMP #$0A
    BCS IME_SELECT_FAIL
    CMP #$03
    BNE @check_4
    LDA IME_AVAILABLE_FLAGS
    AND #$01
    BNE @check_option
    JMP IME_SELECT_FAIL
@check_4:
    CMP #$04
    BNE @check_5
    LDA IME_AVAILABLE_FLAGS
    AND #$02
    BNE @check_option
    JMP IME_SELECT_FAIL
@check_5:
    CMP #$05
    BNE @check_6
    LDA IME_AVAILABLE_FLAGS
    AND #$04
    BNE @check_option
    JMP IME_SELECT_FAIL
@check_6:
    CMP #$06
    BNE @check_7
    LDA IME_AVAILABLE_FLAGS
    AND #$08
    BNE @check_option
    JMP IME_SELECT_FAIL
@check_7:
    CMP #$07
    BEQ IME_SELECT_FAIL
@check_option:
    LDA SYS_ARG_0F
    AND #$80
    BEQ @select
    JSR IME_CHECK_OPTION
    BNE @select
    JMP IME_SELECT_FAIL
@select:
    JSR IME_FLUSH_KEYS
    LDA #$00
    STA IME_INPUT_LEN
    STA IME_KEY_RESULT
    STA IME_PAGE_FLAGS
    STA IME_PAGE_INDEX
    STA IME_HINT_FLAG
    STA IME_CANDIDATE_COUNT
    STA IME_RESERVED_6952
    LDA SYS_ARG_0F
    AND #$0F
    STA DRAW_MODE_TEMP
    LDA IME_METHOD
    AND #$F0
    ORA DRAW_MODE_TEMP
    STA IME_METHOD
    JSR IME_SHOW_METHOD_NAME
    LDA IME_FLAGS
    AND #$7F
    STA IME_FLAGS
    LDA IME_METHOD
    CMP #$08
    BNE @done
    INC IME_INPUT_LEN
    JSR IME_BUILD_CANDIDATE_LIST
    JSR IME_SHOW_ZONE_LABEL
    LDA IME_PAGE_FLAGS
    ORA #$80
    STA IME_PAGE_FLAGS
    JSR IME_SHOW_HINT_IF_EMPTY
@done:
    LDA #$00
    STA SYS_STATUS
    RTS
; 作用：检查选项用的位掩码表，按 SYS_ARG_0F 低 4 位取：$02、$04、$08、$10、$20、$40、$FF、$FF、$80、$01；$FF 表示改查 IME_FLAGS 位 4。
; 引用者：IME_CHECK_OPTION
IME_OPTION_MASKS:
    .byte $02,$04,$08,$10,$20,$40,$FF,$FF,$80,$01
; 作用：按 SYS_ARG_0F 低 4 位查表 IME_OPTION_MASKS：值为 $FF 时检查 IME_FLAGS 位 4，否则与 IME_OPTION_FLAGS 相与。
; 输入：SYS_ARG_0F。
; 输出：Z=0 表示允许，Z=1 表示不允许。
; 调用者：IME_SUB_01
IME_CHECK_OPTION:
    LDA SYS_ARG_0F
    AND #$0F
    TAY
    LDA IME_OPTION_MASKS,Y
    CMP #$FF
    BEQ @use_flags
    AND IME_OPTION_FLAGS
    RTS
@use_flags:
    LDA IME_FLAGS
    AND #$10
    RTS
; 作用：子功能 2 设置状态：SYS_ARG_0F 存入 IME_OPTION_FLAGS，SYS_ARG_10 的低 7 位存入 IME_FLAGS 的低 7 位。
; 输入：SYS_ARG_0F、SYS_ARG_10。
; 调用者：IME_SUB_TABLE（地址表）
IME_SUB_02:
    LDA SYS_ARG_0F
    STA IME_OPTION_FLAGS
    LDA SYS_ARG_10
    AND #$7F
    STA DRAW_MODE_TEMP
    LDA IME_FLAGS
    AND #$80
    ORA DRAW_MODE_TEMP
    STA IME_FLAGS
    RTS
; 作用：子功能 3：IME_FLAGS 位 2 置位时清除它，并刷新状态行
; 调用者：IME_SUB_TABLE（地址表）、IME_CALL_SUB03_IF_ACTIVE
IME_SUB_03:
    LDA IME_FLAGS
    AND #$04
    BEQ @return
    LDA IME_FLAGS
    AND #$FB
    STA IME_FLAGS
    JSR IME_DRAW_STATUS_LINE
@return:
    RTS
; 作用：子功能 4：清 IME_CANDIDATE_COUNT；IME_FLAGS 位 2 未置位时刷新状态行并置位
; 调用者：IME_SUB_TABLE（地址表）、IME_CALL_SUB03_IF_ACTIVE
IME_SUB_04:
    LDA #$00
    STA IME_CANDIDATE_COUNT
    LDA IME_FLAGS
    AND #$04
    BEQ @redraw
    RTS
@redraw:
    LDA IME_STATUS_ARG_0B
    PHA
    LDA #$00
    STA IME_STATUS_ARG_0B
    JSR IME_DRAW_STATUS_LINE
    PLA
    STA IME_STATUS_ARG_0B
    LDA IME_FLAGS
    ORA #$04
    STA IME_FLAGS
    RTS
; 作用：子功能 5 状态行显示“半角”（GB2312 $B0EB $BDC7），IME_FLAGS 位 1 清 0
; 调用者：IME_SUB_TABLE（地址表）、IME_CALL_SUB06_IF_IDLE
IME_SUB_05:
    LDA IME_TEXT_HALF_WIDTH
    STA IME_STATUS_TEXT
    LDA IME_TEXT_HALF_WIDTH+1
    STA IME_STATUS_TEXT+1
    LDA IME_TEXT_HALF_WIDTH+2
    STA IME_STATUS_TEXT+2
    LDA IME_TEXT_HALF_WIDTH+3
    STA IME_STATUS_TEXT+3
    JSR IME_DRAW_STATUS_LINE
    LDA IME_FLAGS
    AND #$FD
    STA IME_FLAGS
    RTS
; 作用：状态行文字“半角”（GB2312 $B0EB $BDC7）
; 引用者：IME_SUB_05
IME_TEXT_HALF_WIDTH:
    .byte $B0,$EB,$BD,$C7
; 作用：状态行文字“全角”（GB2312 $C8AB $BDC7）
; 引用者：IME_SUB_06
IME_TEXT_FULL_WIDTH:
    .byte $C8,$AB,$BD,$C7
; 作用：子功能 6 状态行显示“全角”（GB2312 $C8AB $BDC7），IME_FLAGS 位 1 置位
; 调用者：IME_SUB_TABLE（地址表）、IME_CALL_SUB06_IF_IDLE
IME_SUB_06:
    LDA IME_TEXT_FULL_WIDTH
    STA IME_STATUS_TEXT
    LDA IME_TEXT_FULL_WIDTH+1
    STA IME_STATUS_TEXT+1
    LDA IME_TEXT_FULL_WIDTH+2
    STA IME_STATUS_TEXT+2
    LDA IME_TEXT_FULL_WIDTH+3
    STA IME_STATUS_TEXT+3
    JSR IME_DRAW_STATUS_LINE
    LDA IME_FLAGS
    ORA #$02
    STA IME_FLAGS
    RTS
; 作用：子功能 7 取当前输入法序号：IME_METHOD 低 4 位放到 SYS_ARG_0F。
; 输出：SYS_ARG_0F。
; 调用者：IME_SUB_TABLE（地址表）
IME_SUB_07:
    LDA IME_METHOD
    AND #$0F
    STA SYS_ARG_0F
    RTS
; 作用：子功能 8 取状态：IME_OPTION_FLAGS 放到 SYS_ARG_0F，IME_FLAGS 低 7 位放到 SYS_ARG_10。
; 输出：SYS_ARG_0F、SYS_ARG_10。
; 调用者：IME_SUB_TABLE（地址表）
IME_SUB_08:
    LDA IME_OPTION_FLAGS
    STA SYS_ARG_0F
    LDA IME_FLAGS
    AND #$7F
    STA SYS_ARG_10
    RTS
; 作用：子功能 9：保存 MATH_ARG_00 起 5 个字节到 IME_MODULE_INFO，显示输入法说明，IME_AVAILABLE_FLAGS 位 3 与 IME_FLAGS 位 4 置位
; 输入：MATH_ARG_00 起的 5 个字节。
; 调用者：IME_SUB_TABLE（地址表）
IME_SUB_09:
    LDY #$00
@loop:
    LDA MATH_ARG_00,Y
    STA IME_MODULE_INFO,Y
    INY
    CPY #$05
    BNE @loop
    LDA IME_AVAILABLE_FLAGS
    ORA #$08
    STA IME_AVAILABLE_FLAGS
    LDA IME_FLAGS
    ORA #$10
    STA IME_FLAGS
    JSR IME_LOAD_STATUS_LINE
    RTS
; 作用：把 IME_STATUS_LINE_TEXT 处 32 字节复制到状态行缓冲 IME_STATUS_TEXT，再显示（IME_DRAW_STATUS_LINE）
; 调用者：IME_SUB_09
IME_LOAD_STATUS_LINE:
    LDY #$00
@loop:
    LDA IME_STATUS_LINE_TEXT,Y
    STA IME_STATUS_TEXT,Y
    INY
    CPY #$20
    BCC @loop
    JSR IME_DRAW_STATUS_LINE
    RTS
; 作用：状态行的初始文字（GB2312，$00 结束），IME_LOAD_STATUS_LINE 使用
; 引用者：IME_LOAD_STATUS_LINE
IME_STATUS_LINE_TEXT:
    .byte $20,$20,$C0,$A9,$B3,$E4,$CA,$E4,$C8,$EB,$B7,$A8,$B0,$B2,$D7,$B0
    .byte $B3,$C9,$B9,$A6,$20,$20,$20,$20,$20,$20,$20,$20,$20,$20,$20,$20
    .byte $20,$20,$00
; 作用：子功能 10 等待并处理一个按键：反复调用子功能 11，直到 IME_KEY_RESULT 不为 0
; 调用者：IME_SUB_TABLE（地址表）、IME_SUB_10
IME_SUB_10:
    JSR IME_SUB_11
    LDA IME_KEY_RESULT
    BEQ IME_SUB_10
    RTS
; 作用：子功能 11 处理一个按键（不等待）：先取键（IME_POLL_KEY），IME_FLAGS 位 2 打开时返回；联想方式（IME_FLAGS 位 0）打开、输入法序号小于 7、刚输入到一个汉字（IME_KEY_RESULT 为 2，内码高字节 $B0-$D8）且输入串为空时，以它为条件查联想字（IME_RESET_SEARCH，状态行临时显示方式 $0B 的名称），有联想字就置 IME_FLAGS 位 7 并显示；全角状态（IME_FLAGS 位 1）下对 ASCII 字符再查特殊键表（IME_SPECIAL_KEY_LOOKUP）。
; 输出：IME_KEY_RESULT=结果标志，IME_KEY_OUT 起=输入到的汉字或字符。
; 调用者：IME_SUB_TABLE（地址表）、IME_SUB_10
IME_SUB_11:
    LDA #$00
    STA IME_KEY_RESULT
    STA KEY_ASCII
    STA KEY_SCAN
    JSR IME_POLL_KEY
    LDA IME_FLAGS
    AND #$04
    BEQ @check_assoc
    RTS
@check_assoc:
    LDA IME_FLAGS
    AND #$01
    BEQ @to_fullwidth
    LDA IME_METHOD
    AND #$0F
    CMP #$07
    BCS @to_fullwidth
    LDA IME_KEY_RESULT
    CMP #$02
    BEQ @assoc_start
@to_fullwidth:
    JMP @fullwidth_check
@assoc_start:
    LDA IME_INPUT_LEN
    BNE @to_fullwidth
    LDA IME_KEY_OUT
    CMP #$B0
    BCC @show_assoc_name
    CMP #$D9
    BCS @show_assoc_name
    STA SYS_ARG_07
    STA IME_INPUT_BUF
    LDA IME_KEY_OUT+1
    STA SYS_ARG_08
    STA IME_FIRST_BYTE2
    LDA #$00
    STA IME_PAGE_INDEX
    STA SYS_ARG_03
    STA IME_PAGE_FLAGS
    JSR IME_RESET_SEARCH
    LDA IME_METHOD
    PHA
    LDA IME_CANDIDATE_COUNT
    PHA
    LDA #$0B
    STA IME_METHOD
    JSR IME_SHOW_METHOD_NAME
    PLA
    STA IME_CANDIDATE_COUNT
    PLA
    STA IME_METHOD
    LDA IME_FLAGS
    AND #$7F
    STA IME_FLAGS
    LDA IME_CANDIDATE_COUNT
    BEQ @return
    LDA IME_FLAGS
    ORA #$80
    STA IME_FLAGS
    JSR IME_SHOW_HINT_IF_EMPTY
    RTS
@show_assoc_name:
    LDA IME_METHOD
    PHA
    LDA #$0B
    STA IME_METHOD
    JSR IME_SHOW_METHOD_NAME
    PLA
    STA IME_METHOD
@fullwidth_check:
    LDA IME_FLAGS
    AND #$02
    BEQ @return
    LDA IME_KEY_OUT
    BMI @return
    JSR IME_SPECIAL_KEY_LOOKUP
@return:
    RTS
; 作用：取一个键（IME_GET_KEY_NOWAIT）并按功能键分流：没有键（KEY_SCAN 为 0）直接返回；KEY_ASCII 为 0 且 KEY_SCAN 为 $5E 时调用 IME_CALL_SUB03_IF_ACTIVE；IME_FLAGS 位 2 打开时按键原样传回（IME_PASS_KEY）；普通字符转 IME_PROCESS_KEY；功能键 KEY_SCAN 为 $68-$71 时切换输入法（$70 是区位码方式，其余以 KEY_SCAN−$68 并置位 7 作序号去选择，IME_SUB_01）；KEY_SCAN 为 $60 且 IME_FLAGS 位 6 打开时翻转联想方式（IME_TOGGLE_MODE）；KEY_SCAN 为 $65、$66 且 IME_FLAGS 位 5 打开时切换到全角（IME_CALL_SUB06_IF_IDLE）；其他转 IME_PROCESS_KEY。
; 调用者：IME_SUB_11
IME_POLL_KEY:
    JSR IME_GET_KEY_NOWAIT
    LDA KEY_SCAN
    BNE @have_key
    RTS
@have_key:
    LDA KEY_ASCII
    BNE @check_status_flag
    LDA KEY_SCAN
    CMP #$5E
    BNE @check_status_flag
    JSR IME_CALL_SUB03_IF_ACTIVE
    RTS
@check_status_flag:
    LDA IME_FLAGS
    AND #$04
    BEQ @clear_out
    JSR IME_PASS_KEY
    RTS
@clear_out:
    LDA #$00
    STA IME_KEY_OUT
    LDA KEY_ASCII
    BNE @process_key
    LDA KEY_SCAN
    CMP #$68
    BCC @check_f1
    CMP #$72
    BCS @check_f1
    CMP #$70
    BNE @select_method
    LDA #$08
    STA SYS_ARG_0F
    LDA IME_OPTION_FLAGS
    BMI @method_8_check
    RTS
@method_8_check:
    LDA IME_METHOD
    AND #$0F
    CMP #$08
    BEQ @zone_mode
    JSR IME_SUB_01
    RTS
@zone_mode:
    JSR IME_CLEAR_STATUS_LINE
    LDA #$00
    STA IME_PAGE_INDEX
    INC IME_INPUT_LEN
    LDA IME_INPUT_LEN
    CMP #$0A
    BNE @zone_show
    LDA #$01
    STA IME_INPUT_LEN
@zone_show:
    JSR IME_BUILD_CANDIDATE_LIST
    JSR IME_FLUSH_KEYS
    JSR IME_SHOW_ZONE_LABEL
    LDA IME_PAGE_FLAGS
    ORA #$80
    STA IME_PAGE_FLAGS
    JSR IME_SHOW_HINT_IF_EMPTY
    LDA IME_FLAGS
    AND #$7F
    STA IME_FLAGS
    RTS
@process_key:
    JMP IME_PROCESS_KEY
@select_method:
    LDA KEY_SCAN
    SEC
    SBC #$68
    ORA #$80
    STA SYS_ARG_0F
    JSR IME_SUB_01
    RTS
@check_f1:
    LDA KEY_SCAN
    CMP #$60
    BNE @check_65_66
    LDA IME_FLAGS
    AND #$40
    BEQ @check_65_66
    JSR IME_TOGGLE_MODE
    RTS
@check_65_66:
    CMP #$66
    BEQ @full_width_key
    CMP #$65
    BEQ @full_width_key
    JMP @process_key
@full_width_key:
    LDA IME_FLAGS
    AND #$20
    BEQ @process_key
    JSR IME_CALL_SUB06_IF_IDLE
    RTS
; 作用：IME_FLAGS 位 2 打开时调用 IME_SUB_03，否则调用 IME_SUB_04。
; 调用者：IME_POLL_KEY
IME_CALL_SUB03_IF_ACTIVE:
    LDA IME_FLAGS
    AND #$04
    BEQ @inactive
    JSR IME_SUB_03
    RTS
@inactive:
    JSR IME_SUB_04
    RTS
; 作用：翻转 IME_FLAGS 位 0（联想方式）；位 2 打开时直接返回；否则在状态行显示“设置联想方式”或“取消联想方式”（功能 $45），再调用功能 $6B 子功能 4；之后：联想方式关闭且输入法序号不是 8 时清输入长度与候选数并重新显示输入法名称，否则重画状态行。
; 调用者：IME_POLL_KEY
IME_TOGGLE_MODE:
    LDA IME_FLAGS
    EOR #$01
    STA IME_FLAGS
    LDA IME_FLAGS
    AND #$04
    BEQ @update
    RTS
@update:
    LDA IME_FLAGS
    AND #$01
    BEQ @cancel_text
    LDA IME_FLAGS
    AND #$7F
    STA IME_FLAGS
    LDA #<IME_TEXT_SET_ASSOC
    STA PROG_ENTRY_LO
    LDA #>IME_TEXT_SET_ASSOC
    STA PROG_ENTRY_HI
    JMP @show_text
@cancel_text:
    LDA #<IME_TEXT_CANCEL_ASSOC
    STA PROG_ENTRY_LO
    LDA #>IME_TEXT_CANCEL_ASSOC
    STA PROG_ENTRY_HI
@show_text:
    LDA WINDOW_SAVE_0
    STA SYS_GROUP
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
    LDA #$6B
    STA SYS_FUNCTION
    LDA #$04
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA IME_FLAGS
    AND #$01
    BNE @redraw
    LDA IME_METHOD
    AND #$0F
    CMP #$08
    BEQ @redraw
    LDA #$00
    STA IME_INPUT_LEN
    STA IME_CANDIDATE_COUNT
    JSR IME_SHOW_METHOD_NAME
    RTS
@redraw:
    JSR IME_DRAW_STATUS_LINE
    RTS
; 作用：状态行文字“设置联想方式”，前面补空格，$00 结束，共 32 字节
; 引用者：IME_TOGGLE_MODE（取地址）
IME_TEXT_SET_ASSOC:
    .byte $20,$20,$20,$20,$20,$20,$20,$20,$C9,$E8,$D6,$C3,$C1,$AA,$CF,$EB
    .byte $B7,$BD,$CA,$BD,$20,$20,$20,$20,$20,$20,$20,$20,$20,$20,$20,$00
; 作用：状态行文字“取消联想方式”，前面补空格，$00 结束，共 32 字节
; 引用者：IME_TOGGLE_MODE（取地址）
IME_TEXT_CANCEL_ASSOC:
    .byte $20,$20,$20,$20,$20,$20,$20,$20,$C8,$A1,$CF,$FB,$C1,$AA,$CF,$EB
    .byte $B7,$BD,$CA,$BD,$20,$20,$20,$20,$20,$20,$20,$20,$20,$20,$20,$00
; 作用：IME_FLAGS 位 1 为 0 时调用 IME_SUB_06
; 调用者：IME_POLL_KEY
IME_CALL_SUB06_IF_IDLE:
    LDA IME_FLAGS
    AND #$02
    BNE @done
    JSR IME_SUB_06
    RTS
@done:
    JSR IME_SUB_05
    RTS
; 作用：调用功能 $6B 子功能 3，取一个键（不等待）。
; 输出：KEY_ASCII、KEY_SCAN（没有键时 KEY_SCAN 为 0）。
; 调用者：IME_POLL_KEY
IME_GET_KEY_NOWAIT:
    LDA #$6B
    STA SYS_FUNCTION
    LDA #$03
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：调用功能 $6B 子功能 5，清空按键队列。
; 调用者：IME_SUB_01、IME_POLL_KEY
IME_FLUSH_KEYS:
    LDA #$6B
    STA SYS_FUNCTION
    LDA #$05
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：按输入法状态处理一个按键（IME_POLL_KEY 的主体）：联想方式下的候选翻页（“=”“.”下一页，“-”“,”上一页，翻页前下一页须 IME_PAGE_FLAGS 位 7 置位）；有候选时数字键 1-5（空格当作 1）选第几个候选并输出（IME_OUTPUT_CANDIDATE）；候选为空时空格显示提示（IME_SHOW_HINT）；回车传回或清键（IME_KEY_PASS_OR_FLUSH）；其他按键按 IME_KEY_HANDLER_TABLE 转给当前输入法的处理程序。
; 输入：KEY_ASCII、KEY_SCAN。
; 调用者：IME_POLL_KEY
IME_PROCESS_KEY:
    LDA IME_FLAGS
    AND #$01
    BNE @assoc_mode
    JMP @select_candidate
@assoc_mode:
    LDA IME_FLAGS
    AND #$80
    BNE @assoc_shown
    LDA IME_CANDIDATE_COUNT
    BNE @select_candidate
    JMP @text_key
@assoc_shown:
    LDA KEY_ASCII
    CMP #$3D
    BEQ @next_page
    CMP #$2E
    BEQ @next_page
    JMP @check_prev_key
@next_page:
    LDA IME_PAGE_FLAGS
    AND #$80
    BNE @do_next_page
    RTS
@do_next_page:
    LDA IME_PAGE_FLAGS
    AND #$7F
    STA IME_PAGE_FLAGS
    INC IME_PAGE_INDEX
    LDA IME_INPUT_BUF
    STA SYS_ARG_07
    LDA IME_FIRST_BYTE2
    STA SYS_ARG_08
    LDA #$00
    STA SYS_ARG_03
    JSR IME_RESET_SEARCH
    JSR IME_SHOW_HINT_IF_EMPTY
    RTS
@check_prev_key:
    CMP #$2D
    BEQ @prev_page
    CMP #$2C
    BEQ @prev_page
    JMP @select_candidate
@prev_page:
    LDA IME_PAGE_INDEX
    BNE @do_prev_page
    RTS
@do_prev_page:
    DEC IME_PAGE_INDEX
    LDA IME_INPUT_BUF
    STA SYS_ARG_07
    LDA IME_FIRST_BYTE2
    STA SYS_ARG_08
    LDA #$00
    STA SYS_ARG_03
    JSR IME_RESET_SEARCH
    JSR IME_SHOW_HINT_IF_EMPTY
    RTS
@select_candidate:
    LDA IME_FLAGS
    AND #$80
    BNE @digit_key
    LDA IME_METHOD
    AND #$0F
    CMP #$04
    BNE @check_method_5
    JMP @text_key
@check_method_5:
    CMP #$05
    BNE @check_method_6
    JMP @text_key
@check_method_6:
    CMP #$06
    BNE @check_ascii
    JMP @text_key
@check_ascii:
    LDA KEY_ASCII
    BNE @check_input
    JSR IME_HANDLE_CANDIDATE_KEY
    RTS
@check_input:
    LDA IME_INPUT_LEN
    BEQ @text_key
@digit_key:
    LDA KEY_ASCII
    CMP #$20
    BNE @check_digit
    LDA #$31
@check_digit:
    CMP #$31
    BCC @text_key
    CMP #$36
    BCS @text_key
    SEC
    SBC #$31
    CMP IME_CANDIDATE_COUNT
    BCS @no_candidate
    JSR IME_OUTPUT_CANDIDATE
    LDA IME_METHOD
    AND #$0F
    CMP #$08
    BEQ @return
    LDA #$20
    STA IME_STATUS_TEXT+29
    STA IME_STATUS_TEXT+30
    JSR IME_DRAW_STATUS_LINE
@return:
    RTS
@no_candidate:
    LDA KEY_ASCII
    CMP #$20
    BNE @text_key
    JSR IME_SHOW_HINT
    LDA #$00
    STA IME_INPUT_LEN
    RTS
@text_key:
    LDA KEY_ASCII
    BEQ @dispatch
    LDA IME_FLAGS
    AND #$7F
    STA IME_FLAGS
    LDA KEY_ASCII
    CMP #$0D
    BNE @check_backspace
    JSR IME_KEY_PASS_OR_FLUSH
    RTS
@check_backspace:
    CMP #$08
    BNE @dispatch
    LDA IME_INPUT_LEN
    BNE @dispatch
    JSR IME_PASS_KEY
    RTS
@dispatch:
    LDA IME_METHOD
    AND #$0F
    ASL A
    TAY
    LDA IME_KEY_HANDLER_TABLE,Y
    STA CALL_VEC_LO
    LDA IME_KEY_HANDLER_TABLE+1,Y
    STA CALL_VEC_HI
    JMP (CALL_VEC_LO)
; 作用：各输入法按键处理入口表，按输入法序号 0-9 取，每项 2 字节：0 区位码（IME_KEY_AREA_CODE）、1 全拼与 2 双拼（IME_KEY_PINYIN）、3-5 转外挂输入法模块、6 自定义模块、7 与 9 原样传回、8 翻页键处理
; 引用者：IME_PROCESS_KEY
IME_KEY_HANDLER_TABLE:
    .word IME_KEY_AREA_CODE,IME_KEY_PINYIN,IME_KEY_PINYIN
    .word IME_KEY_CALL_EXT1,IME_KEY_CALL_EXT2,IME_KEY_CALL_EXT3,IME_CALL_MODULE_ENTRY,IME_KEY_PASS,IME_KEY_PAGE_KEYS,IME_KEY_PASS
; 作用：切换到外挂输入法模块：页组在 IME_MODULE_INFO，经功能 $25 调用它的 $8000 入口，子功能 0
; 调用者：IME_KEY_HANDLER_TABLE（地址表）
IME_CALL_MODULE_ENTRY:
    LDA #$00
    STA SYS_SUBFUNCTION
    LDA IME_MODULE_INFO
    STA SYS_GROUP
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$80
    STA PROG_ENTRY_HI
    LDA #$25
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：处理功能键（KEY_ASCII 为 0）选候选：IME_CANDIDATE_COUNT 位 7 置位时，KEY_SCAN 为 $78 就复制候选到输出（IME_COPY_CANDIDATE）；否则 KEY_SCAN 为 $78-$7C 时选第 KEY_SCAN−$78 个候选并输出（IME_OUTPUT_CANDIDATE，须小于候选数）；其余原样传回（IME_PASS_KEY）。
; 输入：KEY_SCAN、IME_CANDIDATE_COUNT。
; 调用者：IME_PROCESS_KEY
IME_HANDLE_CANDIDATE_KEY:
    LDA IME_CANDIDATE_COUNT
    AND #$80
    BEQ @by_index
    LDA KEY_SCAN
    CMP #$78
    BNE @pass
    JSR IME_COPY_CANDIDATE
    RTS
@by_index:
    LDA KEY_SCAN
    CMP #$78
    BCC @pass
    CMP #$7D
    BCS @pass
    SEC
    SBC #$78
    CMP IME_CANDIDATE_COUNT
    BCS @pass
    JSR IME_OUTPUT_CANDIDATE
    RTS
@pass:
    JSR IME_PASS_KEY
    RTS
; 作用：把候选区（IME_CANDIDATES 起，每项 2 字节）第 A 项放到输出 IME_KEY_OUT 起的两个字节，IME_KEY_RESULT 置 2；IME_METHOD 低 4 位不是 8 时清输入长度。
; 输入：A=候选序号。
; 输出：IME_KEY_OUT、IME_KEY_RESULT。
; 调用者：IME_PROCESS_KEY、IME_HANDLE_CANDIDATE_KEY
IME_OUTPUT_CANDIDATE:
    ASL A
    TAX
    LDA #$02
    STA IME_KEY_RESULT
    LDA IME_CANDIDATES,X
    STA IME_KEY_OUT
    LDA IME_CANDIDATES+1,X
    STA IME_KEY_OUT+1
    LDA IME_METHOD
    AND #$0F
    CMP #$08
    BEQ @return
    LDA #$00
    STA IME_INPUT_LEN
@return:
    RTS
; 作用：区位码、内码输入（输入法序号 0）的按键处理：输入为空时第一个键是数字则按区位码（十进制）开始，是 a-f 则按十六进制内码开始（临时显示方式 $0A 的名称）；退格、回车；输入够 4 个字符后转成汉字内码（IME_PARSE_CODE），经 CHECK_GB2312 检查合法才输出，不合法则结果为 0。
; 输入：KEY_ASCII。
; 输出：IME_KEY_RESULT=2 且 IME_KEY_OUT 起=汉字内码，或原样传回。
; 调用者：IME_KEY_HANDLER_TABLE（地址表）
IME_KEY_AREA_CODE:
    LDA IME_INPUT_LEN
    BNE @have_input
    JMP @first_key
@have_input:
    LDA KEY_ASCII
    CMP #$08
    BNE @check_enter
    JSR IME_BACKSPACE
    LDA IME_INPUT_LEN
    BEQ @return2
    JSR IME_SHOW_INPUT
@return2:
    RTS
@check_enter:
    CMP #$0D
    BNE @check_hex_mode
    JSR IME_KEY_PASS_OR_FLUSH
    RTS
@check_hex_mode:
    LDA IME_AREA_HEX_FLAG
    BEQ @decimal_mode
    LDA IME_INPUT_LEN
    CMP #$02
    BEQ @hex_letter_check
    LDA KEY_ASCII
    CMP #$30
    BCC @hex_letter_check
    CMP #$3A
    BCS @hex_letter_check
    JMP @append
@hex_letter_check:
    LDA KEY_ASCII
    CMP #$61
    BCC @pass
    CMP #$67
    BCS @pass
@append:
    JSR IME_APPEND_KEY
    JSR IME_SHOW_INPUT
    LDA IME_INPUT_LEN
    CMP #$04
    BEQ @convert
    RTS
@pass:
    JSR IME_PASS_KEY
    RTS
@decimal_mode:
    LDA KEY_ASCII
    CMP #$30
    BCC @pass
    CMP #$3A
    BCS @pass
    JSR IME_APPEND_KEY
    JSR IME_SHOW_INPUT
    LDA IME_INPUT_LEN
    CMP #$04
    BEQ @convert
    RTS
@convert:
    JSR IME_PARSE_CODE
    LDA #$00
    STA IME_INPUT_LEN
    JSR CHECK_GB2312
    BCS @valid
    LDA #$00
    STA IME_KEY_RESULT
    RTS
@valid:
    LDA SYS_ARG_07
    STA IME_KEY_OUT
    LDA SYS_ARG_08
    STA IME_KEY_OUT+1
    LDA #$02
    STA IME_KEY_RESULT
    RTS
@first_key:
    LDA KEY_ASCII
    CMP #$30
    BCC @first_hex
    CMP #$3A
    BCS @first_hex
    JSR IME_SHOW_METHOD_NAME
    LDA #$00
    STA IME_AREA_HEX_FLAG
    STA IME_CANDIDATE_COUNT
    JSR IME_APPEND_KEY
    JSR IME_SHOW_INPUT
    RTS
@first_hex:
    CMP #$61
    BCC @first_pass
    CMP #$67
    BCS @first_pass
    LDA #$00
    STA IME_CANDIDATE_COUNT
    LDA IME_METHOD
    PHA
    LDA #$0A
    STA IME_METHOD
    JSR IME_SHOW_METHOD_NAME
    PLA
    STA IME_METHOD
    LDA #$FF
    STA IME_AREA_HEX_FLAG
    JSR IME_APPEND_KEY
    JSR IME_SHOW_INPUT
    RTS
@first_pass:
    JSR IME_PASS_KEY
    RTS
; 作用：检查 SYS_ARG_07、SYS_ARG_08 是否是合法的 GB2312 字符：第一字节 $A1-$A9 或 $B0-$F7，第二字节 $A1-$FE，且 $A9F1 以上、$D7FA 以上除外。
; 输入：SYS_ARG_07、SYS_ARG_08。
; 输出：C=1 合法，C=0 不合法。
; 调用者：IME_KEY_AREA_CODE
CHECK_GB2312:
    LDA SYS_ARG_07
    CMP #$A1
    BCC @return_clear
    CMP #$AA
    BCS @check_hanzi
    LDA SYS_ARG_08
    CMP #$A1
    BCC @return_clear
    CMP #$FF
    BCS @return_clear
    LDA SYS_ARG_07
    CMP #$A9
    BNE @return_set
    LDA SYS_ARG_08
    CMP #$F1
    BCS @return_clear
    JMP @return_set
@check_hanzi:
    CMP #$B0
    BCC @return_clear
    CMP #$F8
    BCS @return_clear
    LDA SYS_ARG_08
    CMP #$A1
    BCC @return_clear
    CMP #$FF
    BCS @return_clear
    LDA SYS_ARG_07
    CMP #$D7
    BNE @return_set
    LDA SYS_ARG_08
    CMP #$FA
    BCS @return_clear
    JMP @return_set
@return_clear:
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：把输入缓冲 IME_INPUT_BUF 起的 4 个字符转成汉字内码：全是数字当区位码（前两位区号、后两位位号，内码为各加 $A0），第一个字符是 a-f 当 4 位十六进制内码；不合法时 SYS_ARG_07 清 0。
; 输入：IME_INPUT_BUF 起 4 个字符。
; 输出：SYS_ARG_07=内码高字节，SYS_ARG_08=内码低字节。
; 调用者：IME_KEY_AREA_CODE、IME_SUB_13_PARSE
IME_PARSE_CODE:
    LDA IME_INPUT_BUF
    CMP #$61
    BCC @decimal_mode
    CMP #$67
    BCS @decimal_mode
    JMP @hex_mode
@decimal_mode:
    LDY #$00
@decimal_check:
    LDA IME_INPUT_BUF,Y
    CMP #$30
    BCC @invalid
    CMP #$3A
    BCS @invalid
    INY
    CPY #$04
    BNE @decimal_check
    LDY #$00
    JMP @decimal_convert
@invalid:
    LDA #$00
    STA SYS_ARG_07
    RTS
@hex_mode:
    LDY #$01
@hex_check:
    LDA IME_INPUT_BUF,Y
    CMP #$30
    BCC @invalid
    CMP #$3A
    BCS @hex_letter
    JMP @hex_next
@hex_letter:
    CMP #$61
    BCC @invalid
    CMP #$67
    BCS @invalid
@hex_next:
    INY
    CPY #$04
    BNE @hex_check
    LDY #$00
    JMP @hex_convert
@decimal_convert:
    LDA IME_INPUT_BUF,Y
    JSR ASCII_DIGIT_TO_VALUE
    STA MATH_ARG_00,Y
    INY
    CPY #$04
    BNE @decimal_convert
    LDA MATH_ARG_00
    STA DRAW_MODE_TEMP
    ASL A
    ASL A
    ASL A
    CLC
    ADC DRAW_MODE_TEMP
    ADC DRAW_MODE_TEMP
    ADC MATH_ARG_01
    ADC #$A0
    STA SYS_ARG_07
    LDA MATH_ARG_02
    STA DRAW_MODE_TEMP
    ASL A
    ASL A
    ASL A
    CLC
    ADC DRAW_MODE_TEMP
    ADC DRAW_MODE_TEMP
    ADC MATH_ARG_03
    ADC #$A0
    STA SYS_ARG_08
    RTS
@hex_convert:
    LDA IME_INPUT_BUF,Y
    JSR ASCII_DIGIT_TO_VALUE
    STA MATH_ARG_00,Y
    INY
    CPY #$04
    BNE @hex_convert
    LDA MATH_ARG_00
    ASL A
    ASL A
    ASL A
    ASL A
    CLC
    ADC MATH_ARG_01
    STA SYS_ARG_07
    LDA MATH_ARG_02
    ASL A
    ASL A
    ASL A
    ASL A
    CLC
    ADC MATH_ARG_03
    STA SYS_ARG_08
    RTS
; 作用：字符转数值：“0”-“9”转 0-9，“a”-“f”转 10-15，其他字符返回 0。
; 输入：A=字符。
; 输出：A=数值。
; 调用者：IME_PARSE_CODE
ASCII_DIGIT_TO_VALUE:
    CMP #$30
    BCC @check_letter
    CMP #$3A
    BCS @check_letter
    SEC
    SBC #$30
    RTS
@check_letter:
    CMP #$61
    BCC @other
    CMP #$67
    BCS @other
    SEC
    SBC #$61
    CLC
    ADC #$0A
    RTS
@other:
    LDA #$00
    RTS
; 作用：全拼音节表：408 项，每项 6 字节（音节的小写字母，不足补空格），按字母顺序；输入法序号不是 2 时 IME_TABLE_LOOKUP 逐项比对
; 引用者：IME_TABLE_LOOKUP（取地址）
IME_PINYIN_TABLE:
    .ascii "a     "
    .ascii "ai    "
    .ascii "an    "
    .ascii "ang   "
    .ascii "ao    "
    .ascii "ba    "
    .ascii "bai   "
    .ascii "ban   "
    .ascii "bang  "
    .ascii "bao   "
    .ascii "bei   "
    .ascii "ben   "
    .ascii "beng  "
    .ascii "bi    "
    .ascii "bian  "
    .ascii "biao  "
    .ascii "bie   "
    .ascii "bin   "
    .ascii "bing  "
    .ascii "bo    "
    .ascii "bu    "
    .ascii "ca    "
    .ascii "cai   "
    .ascii "can   "
    .ascii "cang  "
    .ascii "cao   "
    .ascii "ce    "
    .ascii "cen   "
    .ascii "ceng  "
    .ascii "cha   "
    .ascii "chai  "
    .ascii "chan  "
    .ascii "chang "
    .ascii "chao  "
    .ascii "che   "
    .ascii "chen  "
    .ascii "cheng "
    .ascii "chi   "
    .ascii "chong "
    .ascii "chou  "
    .ascii "chu   "
    .ascii "chuai "
    .ascii "chuan "
    .ascii "chuang"
    .ascii "chui  "
    .ascii "chun  "
    .ascii "chuo  "
    .ascii "ci    "
    .ascii "cong  "
    .ascii "cou   "
    .ascii "cu    "
    .ascii "cuan  "
    .ascii "cui   "
    .ascii "cun   "
    .ascii "cuo   "
    .ascii "da    "
    .ascii "dai   "
    .ascii "dan   "
    .ascii "dang  "
    .ascii "dao   "
    .ascii "de    "
    .ascii "deng  "
    .ascii "di    "
    .ascii "dia   "
    .ascii "dian  "
    .ascii "diao  "
    .ascii "die   "
    .ascii "ding  "
    .ascii "diu   "
    .ascii "dong  "
    .ascii "dou   "
    .ascii "du    "
    .ascii "duan  "
    .ascii "dui   "
    .ascii "dun   "
    .ascii "duo   "
    .ascii "e     "
    .ascii "ei    "
    .ascii "en    "
    .ascii "er    "
    .ascii "fa    "
    .ascii "fan   "
    .ascii "fang  "
    .ascii "fei   "
    .ascii "fen   "
    .ascii "feng  "
    .ascii "fo    "
    .ascii "fou   "
    .ascii "fu    "
    .ascii "ga    "
    .ascii "gai   "
    .ascii "gan   "
    .ascii "gang  "
    .ascii "gao   "
    .ascii "ge    "
    .ascii "gei   "
    .ascii "gen   "
    .ascii "geng  "
    .ascii "gong  "
    .ascii "gou   "
    .ascii "gu    "
    .ascii "gua   "
    .ascii "guai  "
    .ascii "guan  "
    .ascii "guang "
    .ascii "gui   "
    .ascii "gun   "
    .ascii "guo   "
    .ascii "ha    "
    .ascii "hai   "
    .ascii "han   "
    .ascii "hang  "
    .ascii "hao   "
    .ascii "he    "
    .ascii "hei   "
    .ascii "hen   "
    .ascii "heng  "
    .ascii "hong  "
    .ascii "hou   "
    .ascii "hu    "
    .ascii "hua   "
    .ascii "huai  "
    .ascii "huan  "
    .ascii "huang "
    .ascii "hui   "
    .ascii "hun   "
    .ascii "huo   "
    .ascii "ji    "
    .ascii "jia   "
    .ascii "jian  "
    .ascii "jiang "
    .ascii "jiao  "
    .ascii "jie   "
    .ascii "jin   "
    .ascii "jing  "
    .ascii "jiong "
    .ascii "jiu   "
    .ascii "ju    "
    .ascii "juan  "
    .ascii "jue   "
    .ascii "jun   "
    .ascii "ka    "
    .ascii "kai   "
    .ascii "kan   "
    .ascii "kang  "
    .ascii "kao   "
    .ascii "ke    "
    .ascii "ken   "
    .ascii "keng  "
    .ascii "kong  "
    .ascii "kou   "
    .ascii "ku    "
    .ascii "kua   "
    .ascii "kuai  "
    .ascii "kuan  "
    .ascii "kuang "
    .ascii "kui   "
    .ascii "kun   "
    .ascii "kuo   "
    .ascii "la    "
    .ascii "lai   "
    .ascii "lan   "
    .ascii "lang  "
    .ascii "lao   "
    .ascii "le    "
    .ascii "lei   "
    .ascii "leng  "
    .ascii "li    "
    .ascii "lia   "
    .ascii "lian  "
    .ascii "liang "
    .ascii "liao  "
    .ascii "lie   "
    .ascii "lin   "
    .ascii "ling  "
    .ascii "liu   "
    .ascii "long  "
    .ascii "lou   "
    .ascii "lu    "
    .ascii "luan  "
    .ascii "lue   "
    .ascii "lun   "
    .ascii "luo   "
    .ascii "m     "
    .ascii "ma    "
    .ascii "mai   "
    .ascii "man   "
    .ascii "mang  "
    .ascii "mao   "
    .ascii "me    "
    .ascii "mei   "
    .ascii "men   "
    .ascii "meng  "
    .ascii "mi    "
    .ascii "mian  "
    .ascii "miao  "
    .ascii "mie   "
    .ascii "min   "
    .ascii "ming  "
    .ascii "miu   "
    .ascii "mo    "
    .ascii "mou   "
    .ascii "mu    "
    .ascii "n     "
    .ascii "na    "
    .ascii "nai   "
    .ascii "nan   "
    .ascii "nang  "
    .ascii "nao   "
    .ascii "ne    "
    .ascii "nei   "
    .ascii "nen   "
    .ascii "neng  "
    .ascii "ni    "
    .ascii "nian  "
    .ascii "niang "
    .ascii "niao  "
    .ascii "nie   "
    .ascii "nin   "
    .ascii "ning  "
    .ascii "niu   "
    .ascii "nong  "
    .ascii "nou   "
    .ascii "nu    "
    .ascii "nuan  "
    .ascii "nue   "
    .ascii "nuo   "
    .ascii "o     "
    .ascii "ou    "
    .ascii "pa    "
    .ascii "pai   "
    .ascii "pan   "
    .ascii "pang  "
    .ascii "pao   "
    .ascii "pei   "
    .ascii "pen   "
    .ascii "peng  "
    .ascii "pi    "
    .ascii "pian  "
    .ascii "piao  "
    .ascii "pie   "
    .ascii "pin   "
    .ascii "ping  "
    .ascii "po    "
    .ascii "pou   "
    .ascii "pu    "
    .ascii "qi    "
    .ascii "qia   "
    .ascii "qian  "
    .ascii "qiang "
    .ascii "qiao  "
    .ascii "qie   "
    .ascii "qin   "
    .ascii "qing  "
    .ascii "qiong "
    .ascii "qiu   "
    .ascii "qu    "
    .ascii "quan  "
    .ascii "que   "
    .ascii "qun   "
    .ascii "ran   "
    .ascii "rang  "
    .ascii "rao   "
    .ascii "re    "
    .ascii "ren   "
    .ascii "reng  "
    .ascii "ri    "
    .ascii "rong  "
    .ascii "rou   "
    .ascii "ru    "
    .ascii "ruan  "
    .ascii "rui   "
    .ascii "run   "
    .ascii "ruo   "
    .ascii "sa    "
    .ascii "sai   "
    .ascii "san   "
    .ascii "sang  "
    .ascii "sao   "
    .ascii "se    "
    .ascii "sen   "
    .ascii "seng  "
    .ascii "sha   "
    .ascii "shai  "
    .ascii "shan  "
    .ascii "shang "
    .ascii "shao  "
    .ascii "she   "
    .ascii "shei  "
    .ascii "shen  "
    .ascii "sheng "
    .ascii "shi   "
    .ascii "shou  "
    .ascii "shu   "
    .ascii "shua  "
    .ascii "shuai "
    .ascii "shuan "
    .ascii "shuang"
    .ascii "shui  "
    .ascii "shun  "
    .ascii "shuo  "
    .ascii "si    "
    .ascii "song  "
    .ascii "sou   "
    .ascii "su    "
    .ascii "suan  "
    .ascii "sui   "
    .ascii "sun   "
    .ascii "suo   "
    .ascii "ta    "
    .ascii "tai   "
    .ascii "tan   "
    .ascii "tang  "
    .ascii "tao   "
    .ascii "te    "
    .ascii "teng  "
    .ascii "ti    "
    .ascii "tian  "
    .ascii "tiao  "
    .ascii "tie   "
    .ascii "ting  "
    .ascii "tong  "
    .ascii "tou   "
    .ascii "tu    "
    .ascii "tuan  "
    .ascii "tui   "
    .ascii "tun   "
    .ascii "tuo   "
    .ascii "wa    "
    .ascii "wai   "
    .ascii "wan   "
    .ascii "wang  "
    .ascii "wei   "
    .ascii "wen   "
    .ascii "weng  "
    .ascii "wo    "
    .ascii "wu    "
    .ascii "xi    "
    .ascii "xia   "
    .ascii "xian  "
    .ascii "xiang "
    .ascii "xiao  "
    .ascii "xie   "
    .ascii "xin   "
    .ascii "xing  "
    .ascii "xiong "
    .ascii "xiu   "
    .ascii "xu    "
    .ascii "xuan  "
    .ascii "xue   "
    .ascii "xun   "
    .ascii "ya    "
    .ascii "yan   "
    .ascii "yang  "
    .ascii "yao   "
    .ascii "ye    "
    .ascii "yi    "
    .ascii "yin   "
    .ascii "ying  "
    .ascii "yo    "
    .ascii "yong  "
    .ascii "you   "
    .ascii "yu    "
    .ascii "yuan  "
    .ascii "yue   "
    .ascii "yun   "
    .ascii "za    "
    .ascii "zai   "
    .ascii "zan   "
    .ascii "zang  "
    .ascii "zao   "
    .ascii "ze    "
    .ascii "zei   "
    .ascii "zen   "
    .ascii "zeng  "
    .ascii "zha   "
    .ascii "zhai  "
    .ascii "zhan  "
    .ascii "zhang "
    .ascii "zhao  "
    .ascii "zhe   "
    .ascii "zhen  "
    .ascii "zheng "
    .ascii "zhi   "
    .ascii "zhong "
    .ascii "zhou  "
    .ascii "zhu   "
    .ascii "zhua  "
    .ascii "zhuai "
    .ascii "zhuan "
    .ascii "zhuang"
    .ascii "zhui  "
    .ascii "zhun  "
    .ascii "zhuo  "
    .ascii "zi    "
    .ascii "zong  "
    .ascii "zou   "
    .ascii "zu    "
    .ascii "zuan  "
    .ascii "zui   "
    .ascii "zun   "
    .ascii "zuo   "
    .ascii "nv    "
    .ascii "lv    "
    .ascii "jv    "
    .ascii "qv    "
    .ascii "xv    "
    .ascii "yv    "
; 作用：双拼键位表：465 项，每项 2 个小写字母（8 项一行）；输入法序号为 2 时 IME_TABLE_LOOKUP 逐项比对，表尾是 IME_KEY_PINYIN
; 引用者：IME_TABLE_LOOKUP（取地址）
IME_SHUANGPIN_TABLE:
    .ascii "oaosofogodbabsbf"
    .ascii "bgbdbwbrbtbibjbk"
    .ascii "bmblb;bobucacscf"
    .ascii "cgcdcecrctuausuf"
    .ascii "ugudueurutuiuyup"
    .ascii "uuuxucuhuvuzuoci"
    .ascii "cycpcucccvczcoda"
    .ascii "dsdfdgdddedtdidb"
    .ascii "djdkdmd;dndydpdu"
    .ascii "dcdvdzdooeeioroq"
    .ascii "fafffgfwfrftfofp"
    .ascii "fugagsgfgggdgegw"
    .ascii "grgtgygpgugbgxgc"
    .ascii "ghgvgzgohahshfhg"
    .ascii "hdhehwhrhthyhphu"
    .ascii "hbhxhchhhvhzhoji"
    .ascii "jbjjjhjkjmjlj;jy"
    .ascii "jnjxjcjvjzkakskf"
    .ascii "kgkdkekrktkykpku"
    .ascii "kbkxkckhkvkzkola"
    .ascii "lslflgldlelwltli"
    .ascii "lbljlhlklmlll;ln"
    .ascii "lylplulclvlzloom"
    .ascii "mamsmfmgmdmemwmr"
    .ascii "mtmimjmkmmmlm;mn"
    .ascii "mompmuonnansnfng"
    .ascii "ndnenwnrntninjnh"
    .ascii "nknmnln;nnnynpnu"
    .ascii "ncnvnooooppapspf"
    .ascii "pgpdpwprptpipjpk"
    .ascii "pmplp;popppuqiqb"
    .ascii "qjqhqkqmqlq;qyqn"
    .ascii "qxqcqvqzrfrgrdre"
    .ascii "rrrtriryrprurcrv"
    .ascii "rzrosasssfsgsdse"
    .ascii "srstiaisifigidie"
    .ascii "iwiritiiipiuibix"
    .ascii "icihiviziosisysp"
    .ascii "suscsvszsotatstf"
    .ascii "tgtdtetttitjtktm"
    .ascii "t;tytptutctvtzto"
    .ascii "wawswfwgwwwrwtwo"
    .ascii "wuxixbxjxhxkxmxl"
    .ascii "x;xyxnxxxcxvxzya"
    .ascii "yfygydyeyiyly;yo"
    .ascii "yyypyxycyvyzzazs"
    .ascii "zfzgzdzezwzrztva"
    .ascii "vsvfvgvdvevrvtvi"
    .ascii "vyvpvuvbvxvcvhvv"
    .ascii "vzvozizyzpzuzczv"
    .ascii "zzzonxlxjuquxuyu"
    .ascii "a b c d e f g h "
    .ascii "i j k l m n o p "
    .ascii "q r s t u v w x "
    .ascii "y z aaasafagadae"
    .ascii "arataiayapauabax"
    .ascii "acahavazaoeaesef"
    .ascii "egedeeereqeoepem"
    .ascii "en"
; 作用：全拼、双拼的按键处理（IME_KEY_HANDLER_TABLE 序号 1、2）：按键在 KEY_ASCII
; 退格：删一个字符并重查；空格：把第 1 个候选字作为输出（IME_PROCESS_KEY 已先把空格当第 1 个候选字选走，实测没有执行到这一支）；= 与 . 候选字翻下一页；- 与 , 翻上一页；
; 小写字母：追加到输入串后查表，没有音节以它开头时先输出第 1 个候选字再以这个字母重新开始；输入串为空时遇到非字母键原样传回
; 调用者：IME_KEY_HANDLER_TABLE（地址表）、IME_TABLE_LOOKUP（取地址）
IME_KEY_PINYIN:
    LDA KEY_ASCII
    CMP #$08
    BNE @not_backspace
    JSR IME_BACKSPACE
    LDA IME_INPUT_LEN
    BEQ @return
    JSR IME_PINYIN_LOOKUP
@return:
    RTS
@not_backspace:
    LDA IME_INPUT_LEN
    BEQ @check_empty
    LDA KEY_ASCII
    CMP #$20
    BNE @candidate_keys
    LDA IME_CANDIDATE_COUNT
    BEQ @check_empty
    LDA #$02
    STA IME_KEY_RESULT
    LDA IME_CANDIDATES
    STA IME_KEY_OUT
    LDA IME_CANDIDATES+1
    STA IME_KEY_OUT+1
    LDA #$00
    STA IME_INPUT_LEN
    RTS
@candidate_keys:
    LDA IME_CANDIDATE_COUNT
    BEQ @check_empty
    LDA KEY_ASCII
    CMP #$3D
    BEQ @page_next
    CMP #$2E
    BNE @check_page_prev
@page_next:
    JSR IME_PAGE_NEXT
    RTS
@check_page_prev:
    CMP #$2D
    BEQ @page_prev
    CMP #$2C
    BNE @check_empty
@page_prev:
    JSR IME_PAGE_PREV
    RTS
@check_empty:
    LDA IME_INPUT_LEN
    BEQ IME_PINYIN_FIRST_KEY
; 作用：把按键追加到输入串，然后在音节表里查找（输入串已有内容时的主路径）
; 调用者：IME_PINYIN_RESTART、IME_KEY_PINYIN（顺序执行到这里）
IME_PINYIN_APPEND:
    JSR IME_APPEND_KEY
; 作用：在音节表里查找当前输入串：无匹配时去掉刚输入的字符；完全匹配时取候选字；前缀匹配时只显示输入串
; 调用者：IME_KEY_PINYIN、IME_PINYIN_APPEND（顺序执行到这里）
IME_PINYIN_LOOKUP:
    JSR IME_TABLE_LOOKUP
    BNE IME_PINYIN_SHOW
    LDA KEY_ASCII
    JSR IME_IS_LOWER_LETTER
    BNE @pass_key
    LDA IME_CANDIDATE_COUNT
    BEQ @drop_last
    LDA IME_FLAGS
    AND #$80
    BNE @clear_input
    LDA IME_CANDIDATES
    STA IME_KEY_OUT
    LDA IME_CANDIDATES+1
    STA IME_KEY_OUT+1
    LDA #$02
    STA IME_KEY_RESULT
@clear_input:
    LDA #$00
    STA IME_INPUT_LEN
    JMP IME_PINYIN_RESTART
@pass_key:
    JSR IME_PASS_KEY
@drop_last:
    DEC IME_INPUT_LEN
    RTS
; 作用：判断 A 是不是小写字母 a-z。
; 输入：A=字符。
; 输出：A=0 是小写字母，A=$FF 不是。
; 调用者：IME_PINYIN_LOOKUP、IME_PINYIN_FIRST_KEY
IME_IS_LOWER_LETTER:
    CMP #$61
    BCC @not_letter
    CMP #$7B
    BCS @not_letter
    LDA #$00
    RTS
@not_letter:
    LDA #$FF
    RTS
; 作用：输入串为空时的按键：不是小写字母就原样传回，是字母则从头开始输入
; 调用者：IME_KEY_PINYIN
IME_PINYIN_FIRST_KEY:
    LDA KEY_ASCII
    JSR IME_IS_LOWER_LETTER
    BNE IME_PINYIN_REJECT
; 作用：以当前按键从头开始输入：显示输入法名称，清状态行与候选数，再把按键追加到输入串并查表（IME_PINYIN_APPEND）。
; 输入：KEY_ASCII。
; 调用者：IME_PINYIN_LOOKUP、IME_PINYIN_FIRST_KEY（顺序执行到这里）
IME_PINYIN_RESTART:
    JSR IME_SHOW_METHOD_NAME
    JSR IME_CLEAR_STATUS_LINE
    LDA #$00
    STA IME_CANDIDATE_COUNT
    JMP IME_PINYIN_APPEND
; 作用：输入串为空时遇到非字母键：原样传回按键（IME_PASS_KEY）。
; 调用者：IME_PINYIN_FIRST_KEY
IME_PINYIN_REJECT:
    JSR IME_PASS_KEY
    RTS
; 作用：查表结果（A）非 0：1 表示输入串与某个音节完全相同，要读出候选字；2 表示只是某个音节的前缀，只显示输入串
; 调用者：IME_PINYIN_LOOKUP
IME_PINYIN_SHOW:
    CMP #$01
    BEQ @exact
    JSR IME_SHOW_INPUT
    RTS
@exact:
    JSR IME_SHOW_INPUT
    LDA #$00
    STA IME_PAGE_INDEX
    STA IME_HINT_FLAG
    STA IME_PAGE_FLAGS
    LDA IME_TABLE_OFFSET_LO
    STA IME_SAVED_OFFSET_LO
    LDA IME_TABLE_OFFSET_HI
    STA IME_SAVED_OFFSET_HI
    JSR IME_LOAD_CANDIDATES
    JSR IME_SHOW_HINT_IF_EMPTY
    LDA IME_CANDIDATE_COUNT
    CMP #$01
    BNE @mark_more
    RTS
@mark_more:
    LDA IME_PAGE_FLAGS
    ORA #$40
    STA IME_PAGE_FLAGS
    RTS
; 作用：候选字翻下一页：IME_PAGE_FLAGS 位 7（后面还有候选字）为 1 时清掉该位，页序号加 1，重新读取候选字
; 调用者：IME_KEY_PINYIN
IME_PAGE_NEXT:
    LDA IME_PAGE_FLAGS
    AND #$80
    BEQ @return
    LDA IME_PAGE_FLAGS
    AND #$7F
    STA IME_PAGE_FLAGS
    INC IME_PAGE_INDEX
    JSR IME_LOAD_CANDIDATES
    JSR IME_SHOW_HINT_IF_EMPTY
@return:
    RTS
; 作用：候选字翻上一页：页序号不为 0 时减 1，重新读取候选字
; 调用者：IME_KEY_PINYIN
IME_PAGE_PREV:
    LDA IME_PAGE_INDEX
    BEQ @return
    DEC IME_PAGE_INDEX
    JSR IME_LOAD_CANDIDATES
    JSR IME_SHOW_HINT_IF_EMPTY
    RTS
@return:
    RTS
