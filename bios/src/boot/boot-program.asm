; ------------------------------------------------------------------------
; 名称：boot-program.asm
; 说明：开机启动程序（页组 78）：显示开机画面、检测鼠标与磁盘状态、播放开机 WAV，然后进入 DOS；含开机图片参数表
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：占ROM 第 78-78 页，汇编地址 $8000 起，后面的文件接在它后面
; ------------------------------------------------------------------------
.org $8000
    JMP BOOT_MAIN
; 作用：开机启动程序主流程：显示开机画面与各项检测，播放开机 WAV，最后经功能 $26 进入页组 0（DOS）
; 调用者：boot-program.asm 开头的入口代码
BOOT_MAIN:
    JSR BOOT_SET_2008
    JSR BOOT_DISPLAY_MODE_2
    JSR BOOT_CALL_12_SUB2
    JSR BOOT_BLANK_CELL
    JSR BOOT_SHOW_IMAGE_3
    LDA #$00
    JSR BOOT_PUT_TEXT
    JSR BOOT_WAIT_VBLANK_ON
    JSR BOOT_SHOW_IMAGE_0
    JSR BOOT_SHOW_IMAGE_1
    JSR BOOT_SHOW_IMAGE_2
    JSR BOOT_PLAY_WAV
    JSR BOOT_UPLOAD_PATTERNS
    TSX
    STX SYS_SUBFUNCTION
    LDA WINDOW_SAVE_0
    STA SYS_GROUP
    LDA #$5B
    STA PROG_ENTRY_LO
    LDA #$80
    STA PROG_ENTRY_HI
    LDA #$1C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$6B
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR BOOT_CHECK_SEQUENCE
    LDA #$1D
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDX #$00
    LDY #$00
@loop:
    DEX
    BNE @loop
    DEY
    BNE @loop
    LDA #$0C
    JSR BOOT_PUT_TEXT
    LDA #$05
    STA SYS_FUNCTION
    LDX #$00
    LDY #$00
@delay2:
    DEX
    BNE @delay2
    DEY
    BNE @delay2
    DEC SYS_FUNCTION
    BNE @delay2
    LDA #$26
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_GROUP
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$80
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
; 作用：调用 $65/$0C，播放页 $64 起的 BIOS 自带 WAV（SYS_GROUP=$64，地址 $8000）
; 调用者：BOOT_MAIN
BOOT_PLAY_WAV:
    LDA #$65
    STA SYS_FUNCTION
    LDA #$0C
    STA SYS_SUBFUNCTION
    LDA #$64
    STA SYS_GROUP
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$80
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    RTS
; 作用：开机硬件检测画面（标题“小霸王多媒体学生电脑 - 硬件检测”）的主序列：每一项先显示一张图片与行标题，再给出结果。“显示内存”和“内存”各做一次计数动画（BOOT_COUNT_UP_A 数到 512K、BOOT_COUNT_UP_B 数到 1024K），
; 之后是标准鼠标、标准键盘、标准游戏杆接口、标准打印机接口、1.44M 软驱；鼠标看 MOUSE_PACKET_STATE、键盘看 KBD_SELF_TEST_RESULT、软驱看 $80/$00 后的 DISK_STATUS，游戏杆与打印机只等 20 帧（不检测）。
; 每项结果用 BOOT_PLAY_RESULT_TUNE 播放提示音、BOOT_SHOW_RESULT_MARK 显示 OK（结果为 0 时提示音不同、显示 ERROR）；键盘之后底行文字从“中山市小霸王电子工业有限公司”换成“国防科工委指挥技术学院联合研制”（文字 12）。实测的画面与调用序列见 disassembly/tools/probe-boot-screen.mjs
; 一项一项显示的对应关系（图片、文字）：显示内存（5、2）、内存（6、3）、鼠标（7、4）、键盘（8、5）、游戏杆（9、6）、打印机（$0A、7）、软驱（$0B、8）
; 调用者：BOOT_MAIN
BOOT_CHECK_SEQUENCE:
    LDA #$05
    JSR BOOT_SHOW_IMAGE
    LDA #$02
    JSR BOOT_PUT_TEXT
    LDA #$09
    JSR BOOT_COUNT_UP_A
    LDX #$01
    JSR BOOT_PLAY_RESULT_TUNE
    LDA #$06
    JSR BOOT_SHOW_IMAGE
    LDA #$03
    JSR BOOT_PUT_TEXT
    LDA #$0A
    JSR BOOT_COUNT_UP_B
    LDX #$01
    JSR BOOT_PLAY_RESULT_TUNE
    LDA #$07
    JSR BOOT_SHOW_IMAGE
    LDA #$04
    JSR BOOT_PUT_TEXT
    LDA #$14
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDX MOUSE_PACKET_STATE
    JSR BOOT_PLAY_RESULT_TUNE
    LDA #$00
    JSR BOOT_SHOW_RESULT_MARK
    LDA #$08
    JSR BOOT_SHOW_IMAGE
    LDA #$05
    JSR BOOT_PUT_TEXT
    LDX KBD_SELF_TEST_RESULT
    JSR BOOT_PLAY_RESULT_TUNE
    LDA #$01
    JSR BOOT_SHOW_RESULT_MARK
    LDA #$0C
    JSR BOOT_PUT_TEXT
    LDA #$09
    JSR BOOT_SHOW_IMAGE
    LDA #$06
    JSR BOOT_PUT_TEXT
    LDX #$14
    LDA #$1B
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDX #$01
    JSR BOOT_PLAY_RESULT_TUNE
    LDA #$02
    JSR BOOT_SHOW_RESULT_MARK
    LDA #$0A
    JSR BOOT_SHOW_IMAGE
    LDA #$07
    JSR BOOT_PUT_TEXT
    LDX #$14
    LDA #$1B
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDX #$01
    JSR BOOT_PLAY_RESULT_TUNE
    LDA #$03
    JSR BOOT_SHOW_RESULT_MARK
    JSR BOOT_COPY_TILES_TO_BUFFER
    LDA #$0B
    JSR BOOT_SHOW_IMAGE
    LDA #$08
    JSR BOOT_PUT_TEXT
    LDA #$80
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDX #$01
    LDA DISK_STATUS
    BEQ @play_result
    LDX #$00
@play_result:
    JSR BOOT_PLAY_RESULT_TUNE
    LDA #$04
    JSR BOOT_SHOW_RESULT_MARK
    RTS
; 作用：映射页 $FA 到窗口 3，把 $B1C0 起的数据复制到缓冲 $B000 起（每页 256 字节，到 $B500），其余写 $50、$0F 填充
; 调用者：BOOT_CHECK_SEQUENCE
BOOT_COPY_TILES_TO_BUFFER:
    LDA #$29
    STA SYS_FUNCTION
    LDA #$FA
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    LDA #$C0
    STA PROG_ENTRY_LO
    LDA #$B0
    STA PROG_ENTRY_HI
    LDA #$C0
    STA GLYPH_ADDR_LO
    LDA #$B1
    STA GLYPH_ADDR_HI
    LDY #$00
@loop:
    LDA (GLYPH_ADDR_LO),Y
    STA (PROG_ENTRY_LO),Y
    INY
    BNE @loop
    INC GLYPH_ADDR_HI
    INC PROG_ENTRY_HI
    LDA PROG_ENTRY_HI
    CMP #$B5
    BCC @loop
@fill_rest:
    LDA #$50
    STA (PROG_ENTRY_LO),Y
    INY
    LDA #$0F
    STA (PROG_ENTRY_LO),Y
    INY
    BNE @fill_rest
    INC PROG_ENTRY_HI
    LDA PROG_ENTRY_HI
    CMP #$B6
    BCC @loop
    LDA #$29
    STA SYS_FUNCTION
    LDA #$03
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    RTS
; 作用：屏幕上的计数动画 A（“显示内存”一行）：把“nnnK”样式的字符串 $069A-$069D（三位数字加字母 K）每轮按十进制加 32，每轮显示 A 号提示文字（BOOT_PUT_TEXT），到 $069A 达到 $35 结束；实测依次显示 000K、032K……512K，循环结束后再显示一次 512K，共 17 次，约 4 帧一轮
; 调用者：BOOT_CHECK_SEQUENCE
BOOT_COUNT_UP_A:
    STA MATH_ARG_05
    LDA #$30
    STA MATH_ARG_00
    STA MATH_ARG_01
    STA MATH_ARG_02
    LDA #$4B
    STA MATH_ARG_03
    LDA #$00
    STA MATH_ARG_04
@loop:
    LDA MATH_ARG_05
    JSR BOOT_PUT_TEXT
    LDA MATH_ARG_02
    CLC
    ADC #$02
    CMP #$3A
    BCC @carry_ok1
    SBC #$0A
@carry_ok1:
    STA MATH_ARG_02
    LDA MATH_ARG_01
    ADC #$03
    CMP #$3A
    BCC @carry_ok2
    SBC #$0A
@carry_ok2:
    STA MATH_ARG_01
    LDA MATH_ARG_00
    ADC #$00
    STA MATH_ARG_00
    CMP #$35
    BCC @loop
    LDA MATH_ARG_05
    JSR BOOT_PUT_TEXT
    RTS
; 作用：计数动画 B（“内存”一行）：同 BOOT_COUNT_UP_A，但串多一位，$069A 到 $31 结束；实测依次显示 0000K、32K……1024K，共 33 次
; 调用者：BOOT_CHECK_SEQUENCE
BOOT_COUNT_UP_B:
    STA MATH_ARG_06
    LDA #$30
    STA MATH_ARG_00
    STA MATH_ARG_01
    STA MATH_ARG_02
    STA MATH_ARG_03
    LDA #$4B
    STA MATH_ARG_04
    LDA #$00
    STA MATH_ARG_05
@loop:
    LDA MATH_ARG_06
    JSR BOOT_PUT_TEXT
    LDA MATH_ARG_03
    CLC
    ADC #$02
    CMP #$3A
    BCC @carry_ok1
    SBC #$0A
@carry_ok1:
    STA MATH_ARG_03
    LDA MATH_ARG_02
    ADC #$03
    CMP #$3A
    BCC @carry_ok2
    SBC #$0A
@carry_ok2:
    STA MATH_ARG_02
    LDA MATH_ARG_01
    ADC #$00
    CMP #$3A
    BCC @carry_ok3
    SBC #$0A
@carry_ok3:
    STA MATH_ARG_01
    LDA MATH_ARG_00
    ADC #$00
    STA MATH_ARG_00
    CMP #$31
    BCC @loop
    LDA MATH_ARG_06
    JSR BOOT_PUT_TEXT
    RTS
; 作用：图片参数表：12 项×10 字节（源地址 2 字节、$064C/$064D、子功能、$0652、$0653、$0648、$0649、$0651），BOOT_SHOW_IMAGE 按序号取一项调用功能 $5F
; 引用者：BOOT_SHOW_IMAGE
BOOT_IMAGE_TABLE:
    .byte $6C,$86,$04,$08,$00,$05,$01,$00,$00,$05 ; 图片 0
    .byte $35,$A0,$A0,$0A,$00,$00,$01,$16,$00,$00 ; 图片 1
    .byte $B9,$A1,$50,$0B,$00,$07,$01,$09,$13,$05 ; 图片 2
    .byte $B2,$A8,$50,$0F,$01,$00,$00,$00,$00,$00 ; 图片 3
    .byte $8B,$AC,$70,$0C,$00,$00,$00,$03,$03,$00 ; 图片 4
    .byte $8B,$AC,$A0,$0C,$00,$00,$00,$03,$03,$00 ; 图片 5
    .byte $8B,$AC,$D0,$0C,$00,$00,$00,$03,$07,$00 ; 图片 6
    .byte $E2,$AE,$00,$0D,$00,$00,$00,$03,$0B,$00 ; 图片 7
    .byte $15,$B0,$30,$0D,$00,$00,$00,$03,$0F,$00 ; 图片 8
    .byte $90,$B1,$60,$0D,$00,$00,$00,$03,$13,$00 ; 图片 9
    .byte $53,$B3,$90,$0D,$00,$00,$00,$03,$17,$00 ; 图片 10
    .byte $F7,$AD,$C0,$0D,$00,$00,$00,$03,$17,$00 ; 图片 11
; 作用：显示图片：A 为 BOOT_IMAGE_TABLE 的项序号，把该项填进参数区后调用功能 $5F（页组 $78）
; 输入：A=BOOT_IMAGE_TABLE 的项序号。
; 调用者：BOOT_CHECK_SEQUENCE、BOOT_SHOW_IMAGE_3、BOOT_SHOW_IMAGE_0、BOOT_SHOW_IMAGE_1、BOOT_SHOW_IMAGE_2
BOOT_SHOW_IMAGE:
    ASL A
    STA SYS_ARG_0F
    ASL A
    ASL A
    ADC SYS_ARG_0F
    TAY
    LDA BOOT_IMAGE_TABLE,Y
    STA PROG_ENTRY_LO
    LDA BOOT_IMAGE_TABLE+1,Y
    STA PROG_ENTRY_HI
    LDA BOOT_IMAGE_TABLE+2,Y
    STA SYS_ARG_09
    LDA BOOT_IMAGE_TABLE+3,Y
    STA SYS_ARG_0A
    LDA BOOT_IMAGE_TABLE+4,Y
    STA SYS_SUBFUNCTION
    LDA BOOT_IMAGE_TABLE+5,Y
    STA SYS_ARG_0F
    LDA BOOT_IMAGE_TABLE+6,Y
    STA SYS_ARG_10
    LDA BOOT_IMAGE_TABLE+7,Y
    STA SYS_ARG_05
    LDA BOOT_IMAGE_TABLE+8,Y
    STA SYS_ARG_06
    LDA BOOT_IMAGE_TABLE+9,Y
    STA SYS_ARG_0E
    LDA #$78
    STA SYS_GROUP
    LDA #$5F
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：映射页 $FA 到窗口 3，等一次垂直消隐后，把 $B800 起的数据每 128 字节一组复制到缓冲 $B000，并用 $30 子功能 0 送到显存
; 调用者：BOOT_MAIN
BOOT_UPLOAD_PATTERNS:
    LDA #$29
    STA SYS_FUNCTION
    LDA #$FA
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    LDA #$00
    STA PROG_ENTRY_LO
    LDA #$B0
    STA PROG_ENTRY_HI
    LDA #$00
    STA GLYPH_ADDR_LO
    LDA #$B8
    STA GLYPH_ADDR_HI
@loop:
    LDA PPU_STATUS
    BPL @loop
@wait_vblank_end:
    LDA PPU_STATUS
    BMI @wait_vblank_end
@next_group:
    LDY #$00
@copy_group:
    LDA (GLYPH_ADDR_LO),Y
    STA (PROG_ENTRY_LO),Y
    INY
    CPY #$80
    BCC @copy_group
    LDA #$00
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA GLYPH_ADDR_LO
    CLC
    ADC #$80
    STA GLYPH_ADDR_LO
    BCC @src_carry
    INC GLYPH_ADDR_HI
@src_carry:
    LDA PROG_ENTRY_LO
    CLC
    ADC #$80
    STA PROG_ENTRY_LO
    BCC @dst_carry
    INC PROG_ENTRY_HI
@dst_carry:
    LDA PROG_ENTRY_HI
    CMP #$B8
    BCC @next_group
    LDA #$29
    STA SYS_FUNCTION
    LDA #$03
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    RTS
    .byte $4F,$4B,$00,$45,$52,$52,$4F,$52,$00
; 作用：检测结果标记的起始列（写入 $064C）：$70、$90、$B0、$D0、$F0，按序号取
; 引用者：BOOT_SHOW_RESULT_MARK
BOOT_MARK_COLUMNS:
    .byte $70,$90,$B0,$D0,$F0
; 作用：检测结果标记的行（写入 $064D）：$0C、$10、$14、$18、$18，按序号取
; 引用者：BOOT_SHOW_RESULT_MARK
BOOT_MARK_ROWS:
    .byte $0C,$10
    .byte $14,$18,$18
; 作用：按序号 A 在 BOOT_MARK_COLUMNS/BOOT_MARK_ROWS 表指定的行列显示检测结果标记：X 为 0 用 $83BE 处的字符串，否则用 $83BB 处的字符串（经功能 $45）
; 输入：A=标记序号，X=0 表示失败（ERROR），否则成功（OK）。
; 调用者：BOOT_CHECK_SEQUENCE
BOOT_SHOW_RESULT_MARK:
    TAY
    LDA BOOT_MARK_COLUMNS,Y
    STA SYS_ARG_09
    LDA #$0A
    STA SYS_ARG_0A
    LDA BOOT_MARK_ROWS,Y
    STA SYS_ARG_06
    LDA #$19
    STA SYS_ARG_05
    CPX #$00
    BNE @ok_string
    LDA #$BE
    STA PROG_ENTRY_LO
    LDA #$83
    STA PROG_ENTRY_HI
    JMP @show
@ok_string:
    LDA #$BB
    STA PROG_ENTRY_LO
    LDA #$83
    STA PROG_ENTRY_HI
@show:
    LDA #$00
    STA SYS_SUBFUNCTION
    LDA #$51
    STA SYS_ARG_0B
    LDA WINDOW_SAVE_0
    STA SYS_GROUP
    LDA #$45
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：播放检测结果提示音：X 为 0 播放 $8445 处的曲子，否则播放 $8456 处的曲子（经功能 $65/$0B，曲目指针在 $0C/$0D）
; 输入：X=0 失败，否则成功。
; 调用者：BOOT_CHECK_SEQUENCE
BOOT_PLAY_RESULT_TUNE:
    LDA #$65
    STA SYS_FUNCTION
    LDA #$0B
    STA SYS_SUBFUNCTION
    LDA WINDOW_SAVE_0
    STA SYS_GROUP
    CPX #$00
    BNE @ok_tune
    LDA #$45
    STA PROG_ENTRY_LO
    LDA #$84
    STA PROG_ENTRY_HI
    JMP @play
@ok_tune:
    LDA #$56
    STA PROG_ENTRY_LO
    LDA #$84
    STA PROG_ENTRY_HI
@play:
    LDA #$FF
    STA SYS_ARG_10
    JSR VEC_SYSCALL
    RTS
    .byte $40,$05,$05,$00,$FF,$E3,$8F,$E0,$F9,$E1,$BF,$E2,$0B,$E4,$20,$CB
    .byte $D3
    .byte $40,$06,$05,$00,$FF,$E3,$09,$E0,$00,$E1,$40,$E2,$00,$E4,$02,$CB
    .byte $D3,$B9,$FA,$B7,$C0,$BF,$C6,$B9,$A4,$CE,$AF,$D6,$B8,$BB,$D3,$BC
    .byte $BC,$CA,$F5,$D1,$A7,$D4,$BA,$C1,$AA,$BA,$CF,$D1,$D0,$D6,$C6,$00
    .byte $D6,$D0,$C9,$BD,$CA,$D0,$D0,$A1,$B0,$D4,$CD,$F5,$B5,$E7,$D7,$D3
    .byte $B9,$A4,$D2,$B5,$D3,$D0,$CF,$DE,$B9,$AB,$CB,$BE,$00,$B9,$FA,$B1
    .byte $EA,$D7,$D6,$BF,$E2,$D0,$A3,$D1,$E9,$A1,$AD,$A1,$AD,$00
    .byte $CF,$D4,$CA,$BE,$C4,$DA,$B4,$E6,$A1,$AD,$A1,$AD,$A1,$AD,$A1,$AD
    .byte $00,$C4,$DA,$B4,$E6,$A1,$AD,$A1,$AD,$A1,$AD,$A1,$AD,$A1,$AD,$A1
    .byte $AD,$00,$31,$2E,$34,$34,$4D,$20,$C8,$ED,$C7,$FD,$A1,$AD,$A1,$AD
    .byte $A1,$AD,$00,$B1,$EA,$D7,$BC,$CA,$F3,$B1,$EA,$A1,$AD,$A1,$AD,$A1
    .byte $AD,$A1,$AD,$00,$B1,$EA,$D7,$BC,$BC,$FC,$C5,$CC,$A1,$AD,$A1,$AD
    .byte $A1,$AD,$A1,$AD,$00,$B1,$EA,$D7,$BC,$D3,$CE,$CF,$B7,$B8,$CB,$BD
    .byte $D3,$BF,$DA,$A1,$AD,$00,$B1,$EA,$D7,$BC,$B4,$F2,$D3,$A1,$BB,$FA
    .byte $BD,$D3,$BF,$DA,$A1,$AD,$00
; 作用：开机提示文字表：13 项×6 字节（字符串地址 2 字节、显示基础值 2 字节（SYS_ARG_09、SYS_ARG_0A）、列、行），BOOT_PUT_TEXT 按序号取一项经功能 $45 显示。
; 引用者：BOOT_PUT_TEXT
BOOT_TEXT_TABLE:
    .byte $86,$84,$00,$0C,$02,$1C ; 文字 0
    .byte $A3,$84,$10,$08,$09,$04 ; 文字 1
    .byte $B4,$84,$50,$08,$09,$04 ; 文字 2
    .byte $C5,$84,$90,$08,$09,$08 ; 文字 3
    .byte $E7,$84,$D0,$08,$09,$0C ; 文字 4
    .byte $F8,$84,$10,$09,$09,$10 ; 文字 5
    .byte $09,$85,$50,$09,$09,$14 ; 文字 6
    .byte $1A,$85,$90,$09,$09,$18 ; 文字 7
    .byte $D6,$84,$D0,$09,$09,$18 ; 文字 8
    .byte $9A,$06,$10,$0A,$19,$04 ; 文字 9
    .byte $9A,$06,$30,$0A,$19,$08 ; 文字 10
    .byte $9A,$06,$50,$0A,$19,$0C ; 文字 11
    .byte $67,$84,$00,$0C,$01,$1C ; 文字 12
; 作用：显示开机提示文字：A 为序号，取 BOOT_TEXT_TABLE 起 6 字节一项（字符串指针、显示基础值 $064C/$064D、列、行），经功能 $45 显示；A 为 0 时用子功能 1
; 输入：A=文字序号。
; 调用者：BOOT_MAIN、BOOT_CHECK_SEQUENCE、BOOT_COUNT_UP_A、BOOT_COUNT_UP_B
BOOT_PUT_TEXT:
    LDY #$00
    CMP #$00
    BNE @subfunction_set
    LDY #$01
@subfunction_set:
    STY SYS_SUBFUNCTION
    ASL A
    STA SYS_ARG_06
    ASL A
    ADC SYS_ARG_06
    TAY
    LDA BOOT_TEXT_TABLE,Y
    STA PROG_ENTRY_LO
    LDA BOOT_TEXT_TABLE+1,Y
    STA PROG_ENTRY_HI
    LDA BOOT_TEXT_TABLE+2,Y
    STA SYS_ARG_09
    LDA BOOT_TEXT_TABLE+3,Y
    STA SYS_ARG_0A
    LDA BOOT_TEXT_TABLE+4,Y
    STA SYS_ARG_05
    LDA BOOT_TEXT_TABLE+5,Y
    STA SYS_ARG_06
    LDA #$51
    STA SYS_ARG_0B
    LDA WINDOW_SAVE_0
    STA SYS_GROUP
    LDA #$45
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：显示图片参数表第 3 项（BOOT_SHOW_IMAGE）
; 调用者：BOOT_MAIN
BOOT_SHOW_IMAGE_3:
    LDA #$03
    JMP BOOT_SHOW_IMAGE
; 作用：显示图片参数表第 0 项
; 调用者：BOOT_MAIN
BOOT_SHOW_IMAGE_0:
    LDA #$00
    JMP BOOT_SHOW_IMAGE
; 作用：显示图片参数表第 1 项
; 调用者：BOOT_MAIN
BOOT_SHOW_IMAGE_1:
    LDA #$01
    JMP BOOT_SHOW_IMAGE
; 作用：显示图片参数表第 2 项
; 调用者：BOOT_MAIN
BOOT_SHOW_IMAGE_2:
    LDA #$02
    JMP BOOT_SHOW_IMAGE
    .byte $20,$00
; 作用：用功能 $3F 在显存 $0800 处显示一个空格（字符串 $85D7），再经 $30 刷新两次
; 调用者：BOOT_MAIN
BOOT_BLANK_CELL:
    LDA #$3F
    STA SYS_FUNCTION
    LDA #$01
    STA SYS_ARG_0B
    STA SYS_ARG_0C
    LDA WINDOW_SAVE_0
    STA SYS_GROUP
    LDA #$D7
    STA PROG_ENTRY_LO
    LDA #$85
    STA PROG_ENTRY_HI
    LDA #$00
    STA SYS_ARG_09
    LDA #$08
    STA SYS_ARG_0A
    JSR VEC_SYSCALL
    LDA #$0A
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_ARG_09
    LDA #$08
    STA SYS_ARG_0A
    LDA #$01
    STA SYS_ARG_0F
    JSR VEC_SYSCALL
    LDA #$00
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：调用功能 $12 子功能 2
; 调用者：BOOT_MAIN
BOOT_CALL_12_SUB2:
    LDA #$12
    STA SYS_FUNCTION
    LDA #$02
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    RTS
    LDA #$88
    STA PPU_CTRL_SHADOW
    LDA #$0E
    STA PPU_MASK_SHADOW
    LDA #$19
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：调用功能 $1A，等垂直消隐后打开显示
; 调用者：BOOT_MAIN
BOOT_WAIT_VBLANK_ON:
    LDA #$1A
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：调用功能 $11 子功能 2（显示模式）
; 调用者：BOOT_MAIN
BOOT_DISPLAY_MODE_2:
    LDA #$11
    STA SYS_FUNCTION
    LDA #$02
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：把 $062E 与 PPU_EXT_CTRL 都写成 $88
; 调用者：BOOT_MAIN
BOOT_SET_2008:
    LDA #$88
    STA PPU_EXT_CTRL_SHADOW
    STA PPU_EXT_CTRL
    RTS
    .byte $20,$1E,$46,$01,$02,$10,$A9,$16,$A9,$19,$00,$FF,$01,$80,$7F,$F0
    .byte $FE,$3F,$C0,$03,$1F,$40,$0F,$02,$E0,$20,$EF,$00,$EF,$00,$EF,$00
    .byte $70,$D1,$02,$C0,$D1,$88,$30,$2B,$D3,$20,$00,$88,$30,$2B,$D6,$20
    .byte $03,$07,$83,$82,$02,$20,$D3,$40,$00,$88,$30,$2B,$D1,$20,$E3,$06
    .byte $D2,$0E,$1E,$E2,$9E,$D2,$FE,$06,$E2,$04,$50,$E3,$38,$D2,$30,$20
    .byte $E2,$60,$D1,$00,$E3,$06,$D2,$0E,$1E,$E2,$9E,$D1,$FE,$EF,$00,$ED
    .byte $00,$D1,$02,$EF,$00,$EF,$00,$40,$D1,$81,$50,$D2,$01,$03,$EF,$00
    .byte $70,$D2,$01,$03,$50,$D4,$80,$E0,$18,$08,$90,$E2,$18,$D3,$04,$62
    .byte $18,$E2,$04,$40,$DE,$80,$E0,$18,$08,$10,$98,$30,$38,$18,$5C,$4E
    .byte $27,$10,$88,$30,$2B,$DF,$20,$01,$07,$83,$82,$06,$02,$00,$40,$10
    .byte $98,$30,$38,$18,$5C,$DA,$4E,$27,$7E,$1E,$06,$0C,$1C,$3C,$D8,$88
    .byte $90,$DF,$20,$38,$30,$20,$40,$20,$70,$7E,$1E,$06,$0C,$1C,$3C,$D8
    .byte $88,$60,$D2,$10,$28,$EE,$00,$D2,$10,$38,$EF,$00,$EF,$00,$40,$D1
    .byte $01,$40,$D1,$08,$30,$D1,$02,$EF,$00,$D1,$02,$90,$D2,$40,$01,$EF
    .byte $00,$EF,$00,$D2,$00,$80,$EF,$00,$70,$D3,$22,$00,$44,$EF,$00,$B0
    .byte $22,$D4,$A0,$22,$40,$08,$80,$D6,$0C,$0E,$06,$4E,$4C,$66,$F2,$F6
    .byte $30,$2B,$D1,$60,$25,$D1,$C3,$28,$DB,$81,$03,$18,$08,$00,$0C,$0E
    .byte $06,$4E,$4C,$66,$F2,$F6,$D3,$02,$0E,$09,$2A,$D3,$03,$07,$1F,$80
    .byte $D3,$80,$C0,$60,$2E,$D6,$84,$F8,$E0,$02,$0E,$09,$2A,$D3,$03,$07
    .byte $1F,$E2,$78,$D3,$F0,$70,$F0,$2E,$D3,$C0,$30,$20,$50,$D1,$40,$30
    .byte $D1,$80,$40,$E2,$78,$D3,$F0,$70,$F0,$2E,$D2,$C0,$10,$EF,$00,$D1
    .byte $10,$EF,$00,$70,$D1,$1F,$60,$D2,$3F,$E0,$60,$D2,$3F,$E0,$60,$D2
    .byte $3F,$FF,$60,$D2,$7F,$C0,$50,$F2,$7F,$60,$F2,$7F,$60,$D3,$7F,$FF
    .byte $C0,$50,$D3,$7C,$CE,$E3,$50,$D3,$82,$31,$DC,$50,$D3,$FE,$3F,$DF
    .byte $20,$D1,$02,$20,$F2,$FE,$D1,$3F,$60,$D2,$C0,$50,$70,$D1,$A0,$60
    .byte $D2,$C0,$F0,$30,$D1,$20,$20,$D2,$C0,$F0,$60,$D2,$01,$07,$50,$D3
    .byte $03,$1E,$7B,$50,$D3,$03,$1E,$7B,$50,$D3,$03,$1F,$7C,$60,$21,$50
    .byte $D3,$FF,$00,$FF,$50,$D3,$FF,$00,$FF,$50,$21,$60,$D3,$7F,$83,$F8
    .byte $50,$D3,$80,$7C,$87,$50,$D3,$FF,$7F,$87,$50,$21,$D1,$7F,$60,$D2
    .byte $D0,$7C,$60,$D2,$28,$82,$60,$D2,$F8,$FE,$60,$D2,$F8,$FE,$EF,$00
    .byte $80,$D1,$80,$A0,$D1,$04,$70,$D1,$04,$70,$D3,$01,$A0,$90,$20,$D1
    .byte $07,$20,$D1,$04,$60,$D5,$1C,$07,$0F,$7D,$38,$F2,$60,$D2,$00,$1C
    .byte $20,$D2,$60,$08,$20,$DE,$23,$20,$B0,$70,$02,$07,$1F,$02,$00,$1C
    .byte $07,$0F,$7D,$38,$F2,$60,$D9,$E7,$05,$00,$DF,$FE,$C0,$C4,$CC,$E0
    .byte $20,$D2,$1E,$2E,$20,$D4,$04,$00,$02,$0F,$20,$DF,$3E,$3B,$13,$E7
    .byte $05,$00,$DF,$FE,$C0,$C4,$CC,$71,$30,$81,$03,$D4,$02,$04,$68,$F0
    .byte $20,$D6,$01,$03,$02,$04,$08,$10,$E2,$8C,$D2,$78,$E0,$E2,$78,$DA
    .byte $90,$00,$71,$30,$81,$03,$02,$04,$68,$F0,$23,$70,$D1,$80,$EE,$00
    .byte $23,$EF,$00,$50,$22,$60,$22,$60,$22,$F2,$00,$DF,$07,$0E,$1D,$3B
    .byte $77,$EF,$03,$0E,$18,$30,$61,$C3,$87,$0F,$03,$DF,$0E,$18,$30,$61
    .byte $C3,$87,$0F,$03,$0F,$1F,$3E,$7C,$F8,$F0,$E0,$DF,$F0,$CF,$3F,$FC
    .byte $F3,$CF,$BF,$7F,$00,$0F,$3F,$FF,$FC,$F0,$C0,$DF,$80,$00,$0F,$3F
    .byte $FF,$FC,$F0,$C0,$80,$F0,$C0,$00,$03,$0F,$3F,$D6,$7F,$FF,$3E,$F1
    .byte $8F,$7F,$41,$D4,$3F,$FE,$F0,$80,$40,$D4,$3F,$FE,$F0,$80,$40,$D3
    .byte $01,$0F,$7F,$51,$D1,$18,$F2,$FE,$51,$D2,$E7,$01,$60,$D2,$E7,$01
    .byte $60,$81,$DF,$E8,$34,$9A,$CD,$E6,$F3,$F9,$FD,$14,$CA,$65,$32,$19
    .byte $0C,$06,$DA,$02,$FC,$FE,$7F,$3F,$1F,$0F,$07,$03,$FC,$F2,$FE,$51
    .byte $20,$DF,$01,$03,$87,$CF,$9F,$3F,$01,$03,$06,$8C,$58,$30,$60,$C0
    .byte $01,$DC,$03,$06,$8C,$D8,$F0,$E0,$C0,$01,$03,$07,$8F,$DF,$31,$D2
    .byte $3F,$7F,$61,$D2,$C0,$80,$60,$D2,$C0,$80,$60,$81,$D2,$8F,$F1,$F2
    .byte $FE,$41,$D2,$0F,$01,$60,$D2,$0F,$01,$60,$D2,$80,$F0,$F2,$FE,$61
    .byte $D3,$3F,$CF,$F3,$F3,$FD,$D6,$F0,$FE,$3F,$0F,$03,$01,$20,$D6,$F0
    .byte $FE,$3F,$0F,$03,$01,$20,$D6,$0F,$01,$00,$C0,$F0,$FC,$F2,$FE,$D4
    .byte $16,$CB,$E5,$FA,$F3,$FD,$DF,$7F,$E9,$34,$9A,$C5,$E2,$F1,$F0,$78
    .byte $FF,$3F,$9F,$C7,$E3,$F1,$D2,$F0,$78,$21,$D3,$7F,$3F,$1F,$2C,$DF
    .byte $07,$80,$40,$A0,$D0,$68,$B4,$5A,$6C,$00,$80,$40,$20,$90,$48,$D8
    .byte $A4,$92,$80,$C0,$E0,$F0,$F8,$FC,$26,$D6,$80,$C0,$E0,$F0,$F8,$FC
    .byte $26,$50,$D2,$06,$01,$70,$D1,$01,$30,$D5,$04,$01,$03,$51,$0A,$60
    .byte $D2,$06,$01,$60,$D2,$03,$E7,$60,$D2,$01,$E1,$F2,$00,$D6,$01,$0E
    .byte $5B,$EB,$FC,$18,$60,$DA,$03,$E7,$00,$40,$21,$01,$0D,$1F,$BF,$F0
    .byte $30,$DC,$01,$0D,$1F,$0F,$30,$00,$82,$5E,$FE,$F2,$A0,$40,$20,$DD
    .byte $40,$21,$01,$0D,$1F,$BF,$F0,$00,$AD,$A3,$B2,$F0,$E0,$30,$D5,$0C
    .byte $03,$B2,$F0,$E0,$30,$D4,$12,$5C,$4C,$08,$40,$D5,$AD,$A3,$B2,$F0
    .byte $E0,$30,$D2,$C0,$80,$EF,$00,$70,$D2,$C0,$80,$70,$22,$39,$E2,$07
    .byte $D3,$03,$02,$06,$E2,$04,$D1,$0C,$E2,$08,$D3,$03,$02,$06,$E2,$04
    .byte $D1,$0C,$E2,$08,$29,$E3,$07,$3C,$D5,$DE,$DD,$BB,$B7,$6F,$E2,$5F
    .byte $D6,$BF,$1F,$1E,$3C,$38,$70,$E2,$60,$D6,$C0,$1F,$1E,$3C,$38,$70
    .byte $E2,$60,$F2,$C0,$D4,$C3,$87,$8F,$1F,$27,$D1,$7F,$81,$EF,$00,$D1
    .byte $00,$81,$D1,$FC,$71,$D1,$03,$70,$D1,$03,$70,$81,$D5,$BF,$DF,$EF
    .byte $F7,$FB,$E2,$FD,$D6,$FF,$3C,$1C,$0E,$06,$03,$22,$D6,$00,$3C,$1C
    .byte $0E,$06,$03,$22,$D6,$00,$83,$C3,$E1,$F1,$F8,$E2,$FC,$D7,$FF,$B6
    .byte $BB,$DD,$D6,$DB,$CD,$F2,$EE,$D8,$49,$44,$22,$29,$24,$32,$11,$90
    .byte $24,$47,$D2,$1F,$9F,$71,$D1,$7F,$20,$23,$D4,$40,$80,$C0,$60,$40
    .byte $D4,$80,$40,$00,$80,$20,$23,$38,$D1,$E0,$20,$23,$38,$D1,$E0,$EF
    .byte $00,$EF,$00,$D2,$00,$08,$E2,$07,$D1,$0F,$F2,$0E,$3C,$D2,$09,$19
    .byte $E2,$11,$E4,$10,$D2,$09,$19,$E2,$11,$E4,$10,$D1,$0E,$E2,$1E,$5A
    .byte $D1,$BF,$24,$51,$D1,$C0,$23,$50,$D1,$C0,$23,$50,$D1,$7F,$EF,$FF
    .byte $70,$D1,$01,$60,$D2,$01,$03,$71,$F2,$FE,$71,$60,$D2,$7C,$FF,$50
    .byte $D1,$7C,$81,$D2,$83,$00,$81,$40,$22,$D2,$1D,$1F,$30,$29,$D3,$1F
    .byte $3F,$BF,$41,$26,$D2,$E2,$E0,$81,$40,$23,$D2,$B8,$F8,$30,$28,$D1
    .byte $F8,$F2,$FC,$41,$24,$D2,$47,$07,$81,$60,$D2,$3E,$FF,$50,$D1,$3E
    .byte $81,$D2,$C1,$00,$81,$70,$D1,$80,$60,$D2,$80,$C0,$71,$D1,$7F,$F2
    .byte $E5,$D1,$F7,$F3,$F5,$F2,$F5,$D8,$9A,$99,$08,$0A,$09,$08,$0A,$09
    .byte $E2,$9F,$6C,$24,$61,$DF,$A0,$C0,$60,$A0,$D0,$60,$B0,$D0,$40,$20
    .byte $80,$40,$20,$90,$40,$D1,$20,$4E,$45,$4E,$45,$20,$D3,$10,$28,$10
    .byte $ED,$00,$D3,$10,$38,$10,$EF,$00,$D1,$04,$60,$D1,$04,$EF,$00,$EF
    .byte $00,$D1,$81,$30,$D1,$02,$C0,$D1,$81,$40,$8C,$EF,$10,$D1,$10,$8A
    .byte $81,$D5,$03,$07,$06,$0C,$08,$30,$D1,$07,$2C,$D3,$1E,$1C,$18,$20
    .byte $D1,$FC,$F2,$F8,$D2,$F3,$F7,$B1,$D2,$C3,$01,$60,$D3,$FF,$C3,$01
    .byte $50,$D1,$3C,$F2,$FE,$ED,$FF,$D3,$8F,$87,$C1,$22,$30,$D6,$DF,$CF
    .byte $E7,$C3,$03,$01,$20,$D3,$70,$78,$3E,$26,$B1,$D3,$F1,$E1,$83,$23
    .byte $30,$D6,$FB,$F3,$E7,$C7,$C0,$80,$20,$D3,$0E,$1E,$7C,$24,$B1,$D2
    .byte $C3,$80,$60,$D3,$FF,$C3,$80,$50,$D2,$3C,$7F,$EE,$FF,$D5,$C0,$E0
    .byte $60,$30,$10,$30,$D1,$E0,$25,$D3,$78,$38,$18,$20,$D5,$3F,$1F,$9F
    .byte $CF,$EF,$31,$D1,$F7,$F3,$F5,$F3,$F5,$D9,$F5,$08,$0A,$09,$08,$0A
    .byte $09,$08,$0A,$8C,$81,$DF,$60,$B0,$D0,$60,$B0,$D0,$60,$B0,$90,$40
    .byte $20,$90,$40,$20,$90,$D1,$40,$EF,$F0,$D1,$F0,$EF,$00,$EF,$00,$D1
    .byte $01,$EF,$00,$ED,$00,$D1,$81,$30,$D1,$02,$31,$D1,$FE,$E3,$FC,$D1
    .byte $F8,$30,$F2,$01,$2D,$D1,$04,$30,$F2,$01,$2D,$D1,$04,$41,$36,$D1
    .byte $FC,$31,$D1,$7F,$37,$D1,$9F,$30,$D1,$80,$3B,$D1,$A0,$30,$D1,$80
    .byte $3B,$D1,$A0,$41,$34,$D1,$3F,$F2,$F6,$F3,$F5,$DB,$E5,$EE,$EB,$09
    .byte $08,$0A,$09,$08,$1A,$11,$14,$5C,$3A,$81,$DF,$D0,$60,$B0,$D0,$60
    .byte $A0,$C0,$60,$20,$90,$40,$20,$90,$40,$20,$D1,$80,$55,$3E,$55,$3E
    .byte $30,$D1,$08,$EF,$00,$D1,$08,$EF,$00,$EF,$00,$70,$D2,$40,$01,$40
    .byte $D1,$20,$EF,$00,$B0,$D1,$80,$EF,$00,$EF,$00,$40,$D3,$04,$00,$80
    .byte $E2,$07,$29,$D1,$01,$30,$DF,$18,$08,$0C,$04,$06,$03,$01,$00,$18
    .byte $08,$0C,$04,$06,$03,$01,$D2,$00,$1F,$2C,$E2,$07,$D3,$03,$01,$00
    .byte $61,$D2,$7F,$3F,$60,$D2,$80,$C0,$60,$D2,$80,$C0,$A1,$D1,$FE,$E3
    .byte $FC,$E2,$F8,$20,$D2,$01,$03,$2D,$D2,$06,$04,$20,$D2,$01,$03,$2D
    .byte $D2,$06,$04,$41,$36,$D1,$FC,$21,$D1,$3F,$30,$24,$20,$D2,$C0,$7F
    .byte $20,$24,$20,$D2,$C0,$7F,$20,$24,$31,$D1,$7F,$40,$D5,$F8,$E1,$03
    .byte $07,$1F,$31,$D5,$04,$19,$E3,$07,$1F,$31,$D5,$04,$19,$E3,$07,$1F
    .byte $31,$D3,$FC,$F8,$E0,$50,$D4,$9F,$C7,$E0,$F8,$41,$D4,$A0,$D8,$E7
    .byte $F8,$41,$D4,$A0,$D8,$E7,$F8,$41,$D3,$3F,$1F,$07,$50,$21,$D1,$FE
    .byte $F2,$00,$31,$20,$D3,$01,$FE,$01,$31,$20,$D3,$01,$FE,$01,$61,$D1
    .byte $FE,$40,$61,$26,$60,$22,$60,$22,$81,$DF,$CD,$D6,$9B,$AD,$76,$5A
    .byte $EE,$1F,$32,$29,$64,$52,$89,$A4,$10,$D1,$00,$27,$24,$D1,$FF,$26
    .byte $D1,$1F,$51,$26,$D5,$1F,$80,$C0,$00,$80,$40,$D3,$40,$00,$80,$50
    .byte $28,$23,$40,$28,$23,$EF,$00,$EF,$00,$D2,$20,$02,$40,$D2,$02,$07
    .byte $2C,$D6,$1F,$1D,$1C,$3B,$04,$0A,$E2,$17,$E3,$2F,$D3,$5C,$04,$0A
    .byte $E2,$17,$E3,$2F,$D3,$5C,$06,$0D,$E2,$18,$D1,$30,$F2,$32,$D6,$67
    .byte $1F,$07,$81,$E0,$F8,$21,$DF,$3F,$60,$38,$0E,$03,$80,$E0,$FC,$FF
    .byte $60,$38,$0E,$03,$80,$E0,$DA,$FC,$FF,$7F,$3F,$8F,$E3,$78,$1F,$03
    .byte $C0,$31,$D1,$3F,$20,$D2,$FF,$7F,$30,$D2,$C0,$7F,$20,$D1,$80,$30
    .byte $D2,$C0,$7F,$20,$D1,$80,$41,$D2,$7F,$00,$21,$DF,$F0,$E0,$C1,$83
    .byte $07,$23,$E1,$F1,$0C,$18,$31,$63,$87,$13,$19,$DF,$09,$0C,$18,$31
    .byte $63,$87,$13,$19,$09,$FC,$F8,$F0,$E0,$80,$30,$E2,$F8,$EF,$FF,$91
    .byte $80,$DF,$8F,$CF,$E7,$F1,$F0,$E0,$CC,$CF,$B0,$D0,$E8,$F6,$F1,$EC
    .byte $D3,$DF,$D0,$B0,$D0,$E8,$F6,$F1,$EC,$D3,$D0,$3F,$1F,$0F,$07,$01
    .byte $0C,$2A,$31,$D1,$FE,$30,$D1,$FF,$30,$D4,$01,$FE,$00,$FF,$40,$D5
    .byte $01,$FE,$00,$FF,$00,$41,$D2,$FE,$00,$21,$DF,$FC,$F0,$C0,$01,$07
    .byte $1F,$FF,$FC,$02,$0C,$31,$C6,$19,$E7,$1F,$DF,$FF,$02,$0C,$31,$C6
    .byte $19,$E7,$1F,$FF,$FE,$FC,$F1,$C7,$1E,$F8,$D4,$E0,$03,$1B,$6D,$F2
    .byte $F6,$D8,$FB,$BA,$3D,$BD,$64,$92,$69,$E8,$F2,$F4,$D6,$FA,$7A,$7F
    .byte $9F,$6F,$EF,$E2,$F7,$D8,$FB,$7B,$7F,$FF,$9F,$1F,$0F,$4F,$E2,$C7
    .byte $DF,$00,$80,$C0,$60,$B0,$D0,$60,$B0,$80,$40,$20,$80,$40,$20,$90
    .byte $D3,$48,$80,$C0,$2E,$35,$D3,$F8,$80,$C0,$2E,$35,$D3,$F8,$20,$10
    .byte $20,$29,$D6,$01,$00,$20,$10,$08,$04,$29,$22,$EF,$00,$60,$D3,$82
    .byte $C7,$E2,$50,$D3,$82,$87,$5F,$EF,$00,$40,$D5,$01,$04,$08,$1C,$78
    .byte $30,$F2,$01,$D3,$04,$88,$30,$EF,$00,$D4,$00,$20,$40,$80,$50,$D3
    .byte $20,$00,$80,$EF,$00,$90,$D1,$02,$EF,$00,$D1,$02,$EF,$00,$40,$D1
    .byte $20,$EF,$00,$D1,$20,$80,$E5,$3B,$E2,$37,$D1,$2F,$E5,$5C,$E2,$58
    .byte $D1,$50,$E5,$5C,$E2,$58,$D1,$50,$E5,$67,$E2,$6F,$D3,$7F,$C6,$F9
    .byte $61,$D2,$3F,$06,$60,$D2,$3F,$06,$60,$D1,$F9,$71,$D1,$F0,$E2,$F8
    .byte $E3,$FC,$26,$D3,$0C,$04,$06,$2D,$D1,$03,$22,$D3,$0C,$04,$06,$2D
    .byte $D1,$03,$22,$E2,$FC,$36,$51,$34,$37,$21,$34,$37,$21,$34,$37,$80
    .byte $51,$36,$51,$36,$51,$36,$80,$E2,$9F,$47,$24,$E2,$A0,$3B,$D1,$C0
    .byte $23,$E2,$A0,$3B,$D1,$C0,$23,$27,$34,$31,$D2,$63,$9F,$61,$D2,$FC
    .byte $60,$60,$D2,$FC,$60,$60,$D1,$9F,$71,$E5,$DD,$E2,$ED,$D1,$F5,$E5
    .byte $3A,$E2,$1A,$D1,$0A,$E5,$3B,$E2,$1B,$D1,$0B,$E5,$E7,$E2,$F7,$DF
    .byte $FF,$D8,$68,$B0,$D8,$68,$B0,$D8,$68,$20,$90,$48,$20,$90,$48,$D2
    .byte $20,$90,$EF,$F8,$D1,$F8,$40,$D3,$02,$07,$02,$F2,$00,$F2,$00,$29
    .byte $D3,$07,$03,$02,$EF,$00,$D4,$00,$70,$3B,$3F,$3A,$DA,$3F,$7B,$B0
    .byte $D0,$19,$AF,$47
