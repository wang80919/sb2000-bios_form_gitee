; 作用：按 SHELL_RUN_STATE 检查程序运行状态：$80 返回 C=0；$81 置 DOS_ERROR=$80 并返回 C=1；$82 显示消息 $08 后返回 C=0；其他值显示消息 $1E 后返回 C=0。
; 输入：SHELL_RUN_STATE。
; 输出：C，DOS_ERROR。
; 调用者：SHELL_EXECUTE_LINE
RUN_CHECK_STATUS:
    LDA SHELL_RUN_STATE
    CMP #$80
    BNE @check_81
    CLC
    RTS
@check_81:
    CMP #$81
    BNE @check_82
    LDA #$80
    STA DOS_ERROR
    SEC
    RTS
@check_82:
    CMP #$82
    BNE @other_state
    LDA #$01
    STA CURSOR_COL
    LDA #$08
    STA LIB_GROUP
    JSR LIB_PRINT_MESSAGE
    JSR LIB_NEWLINE
    CLC
    RTS
@other_state:
    LDA #$01
    STA CURSOR_COL
    LDA #$1E
    STA LIB_GROUP
    JSR LIB_PRINT_MESSAGE
    JSR LIB_NEWLINE
    CLC
    RTS
; 作用：初始化输入法服务（功能 $6D 子功能 0）：状态行第 $1C 行、图块基数 $6F80、状态行显示子功能 0、SYS_ARG_0B 为 $7F，初始输入法 9（英文），选项位图 $FF，状态位 $60（位 5、6：允许扫描码 $65/$66 的键切全角、$60 的键切联想）
; 调用者：SHELL_COMMAND_LOOP、SHELL_START_SESSION
SHELL_INIT_INPUT:
    LDA #$1C
    STA IME_ARG_ROW
    LDA #$80
    STA IME_ARG_TILE_LO
    LDA #$6F
    STA IME_ARG_TILE_HI
    LDA #$00
    STA IME_ARG_SUBFUNCTION
    LDA #$7F
    STA IME_ARG_0B
    LDA #$09
    STA IME_ARG_METHOD
    LDA #$FF
    STA IME_ARG_OPTIONS
    LDA #$60
    STA IME_ARG_FLAGS
    LDA #$6D
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：外壳启动时进入 6576 模式、设置 PPU 控制与掩码、$2008，调用功能 $11（显示模式）两次，FONT_SIZE 置 1
; 调用者：SHELL_MAIN
SHELL_INIT_PPU:
    LDA #$65
    LDX #$76
    STA MODE_6576
    STX MODE_6576
    LDA #$88
    STA PPU_CTRL
    STA PPU_CTRL_SHADOW
    LDA #$0E
    STA PPU_MASK
    STA PPU_MASK_SHADOW
    LDA #$88
    STA PPU_EXT_CTRL_SHADOW
    STA PPU_EXT_CTRL
    LDA #$02
    STA SYS_SUBFUNCTION
    LDA #$11
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$01
    STA FONT_SIZE
    LDA #$00
    STA IME_AVAILABLE_FLAGS
    LDA #$81
    STA SYS_SUBFUNCTION
    LDA #$11
    STA SYS_FUNCTION
    LDA #$18
    STA SYS_ARG_01
    LDA #$00
    STA GLYPH_ADDR_LO
    LDA #$30
    STA GLYPH_ADDR_HI
    JSR VEC_SYSCALL
    RTS
; 作用：外壳会话初始化：SHELL_INIT_INPUT，光标回第 1 列第 0 行，显示消息 $3F，清命令缓冲 ERAM $633A 与 CMD_TAIL，当前路径写成 \
; 调用者：SHELL_MAIN
SHELL_START_SESSION:
    JSR SHELL_INIT_INPUT
    LDA #$01
    STA CURSOR_COL
    LDA #$00
    STA CURSOR_ROW
    STA GLYPH_ROW
    LDA #$3F
    STA LIB_GROUP
    JSR SHELL_PRINT_MESSAGE
    LDX #$2A
    LDA #$00
    STA SHELL_FIRST_CHAR
    STA SHELL_PRESET_FLAG
@loop:
    DEX
    STA SHELL_LINE_BUF,X
    STA CMD_TAIL,X
    BNE @loop
    LDA #$5C
    STA CMD_CURRENT_DIR
    LDA #$00
    STA SBWIN_FLAG
    STA SHELL_RESERVED_660E
    RTS
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
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00
