; 作用：功能 $1E 子功能 0：读 PPU_EXT_CTRL_SHADOW 位 7。
; 输出：SYS_ARG_0F。
; 调用者：API_1E_QUERY_STATE（地址表）
QUERY_0:
    LDA PPU_EXT_CTRL_SHADOW
    AND #$80
    JMP QUERY_STORE_RESULT
; 作用：功能 $1E 子功能 1：读 PPU_EXT_CTRL_SHADOW 位 0。
; 输出：SYS_ARG_0F。
; 调用者：API_1E_QUERY_STATE（地址表）
QUERY_1:
    LDA PPU_EXT_CTRL_SHADOW
    AND #$01
    JMP QUERY_STORE_RESULT
; 作用：功能 $1E 子功能 2：读 PPU_EXT_CTRL_SHADOW 位 2、3。
; 输出：SYS_ARG_0F。
; 调用者：API_1E_QUERY_STATE（地址表）
QUERY_2:
    LDA PPU_EXT_CTRL_SHADOW
    AND #$0C
    JMP QUERY_STORE_RESULT
; 作用：功能 $1E 子功能 3：读 PPU_CTRL_SHADOW 低 2 位（名称表选择）。
; 输出：SYS_ARG_0F。
; 调用者：API_1E_QUERY_STATE（地址表）
QUERY_3:
    LDA PPU_CTRL_SHADOW
    AND #$03
    JMP QUERY_STORE_RESULT
; 作用：功能 $1E 子功能 4：读 PPU_MASK_SHADOW 位 4（精灵显示）。
; 输出：SYS_ARG_0F。
; 调用者：API_1E_QUERY_STATE（地址表）
QUERY_4:
    LDA PPU_MASK_SHADOW
    AND #$10
    JMP QUERY_STORE_RESULT
; 作用：功能 $1E 子功能 5：读 PPU_CTRL_SHADOW 位 5（精灵尺寸）。
; 输出：SYS_ARG_0F。
; 调用者：API_1E_QUERY_STATE（地址表）
QUERY_5:
    LDA PPU_CTRL_SHADOW
    AND #$20
    JMP QUERY_STORE_RESULT
; 作用：功能 $1E 子功能 6：取当前显示模式（GLYPH_MODE 位 6、7）对应的字库位置放 SYS_ARG_01（页）与 GLYPH_ADDR_LO/GLYPH_ADDR_HI，模式号（GLYPH_MODE 右移 6 位）作返回值：位 6 为 0 时用内置字库（页 $14，位 7 为 1 时地址 $9100，否则 $8E00）；位 6 为 1 时取 FONT_TABLE 第 1 项的页与低地址，高地址取 FONT_PAGE_INFO（位 7 为 1 时加 $08，不小于 $C0 则页加 1 并减 $40）。
; 输出：SYS_ARG_01、GLYPH_ADDR_LO/HI，SYS_ARG_0F=模式号。
; 调用者：API_1E_QUERY_STATE（地址表）
QUERY_6:
    LDA GLYPH_MODE
    AND #$40
    BNE @registered_font
    LDA #$14
    STA SYS_ARG_01
    LDA GLYPH_MODE
    BPL @builtin_low
    LDA #$00
    STA GLYPH_ADDR_LO
    LDA #$91
    STA GLYPH_ADDR_HI
    JMP @store_mode
@builtin_low:
    LDA #$00
    STA GLYPH_ADDR_LO
    LDA #$8E
    STA GLYPH_ADDR_HI
    JMP @store_mode
@registered_font:
    LDA FONT_TABLE+3
    STA SYS_ARG_01
    LDA FONT_TABLE+4
    STA GLYPH_ADDR_LO
    LDA GLYPH_MODE
    BPL @page_plain
    LDA FONT_PAGE_INFO
    CLC
    ADC #$08
    STA GLYPH_ADDR_HI
    CMP #$C0
    BCC @store_mode
    INC SYS_ARG_01
    SBC #$40
    STA GLYPH_ADDR_HI
    JMP @store_mode
@page_plain:
    LDA FONT_PAGE_INFO
    STA GLYPH_ADDR_HI
@store_mode:
    LDA GLYPH_MODE
    LSR A
    LSR A
    LSR A
    LSR A
    LSR A
    LSR A
    JMP QUERY_STORE_RESULT
; 作用：功能 $1E 子功能 7：NMI 使能状态（PPU_CTRL_SHADOW 位 7）并入 NMI_FLAGS 的位 0（原位 0 被替换）。
; 输出：SYS_ARG_0F。
; 调用者：API_1E_QUERY_STATE（地址表）
QUERY_7:
    LDA #$00
    STA SYS_ARG_0F
    LDA PPU_CTRL_SHADOW
    BPL @merge
    INC SYS_ARG_0F
@merge:
    LDA NMI_FLAGS
    AND #$FE
    ORA SYS_ARG_0F
    JMP QUERY_STORE_RESULT
; 作用：功能 $1E 子功能 8：读中断屏蔽影子 IRQ_MASK_SHADOW。
; 输出：SYS_ARG_0F。
; 调用者：API_1E_QUERY_STATE（地址表）
QUERY_8:
    LDA IRQ_MASK_SHADOW
    JMP QUERY_STORE_RESULT
; 作用：功能 $1E 子功能 9：读 MOUSE_PACKET_STATE（鼠标是否在线）。
; 输出：SYS_ARG_0F。
; 调用者：API_1E_QUERY_STATE（地址表）
QUERY_9:
    LDA MOUSE_PACKET_STATE
    JMP QUERY_STORE_RESULT
; 作用：功能 $1E 子功能 10：恒返回 1。
; 输出：SYS_ARG_0F=1。
; 调用者：API_1E_QUERY_STATE（地址表）
QUERY_10:
    LDA #$01
    JMP QUERY_STORE_RESULT
; 作用：功能 $1E 子功能 11：读 KBD_SELF_TEST_RESULT（键盘自检结果）。
; 输出：SYS_ARG_0F。
; 调用者：API_1E_QUERY_STATE（地址表）
QUERY_11:
    LDA KBD_SELF_TEST_RESULT
    JMP QUERY_STORE_RESULT
; 作用：功能 $1E 子功能 12：读 PPU_MASK_SHADOW 位 3、4（背景与精灵是否显示）。
; 输出：SYS_ARG_0F。
; 调用者：API_1E_QUERY_STATE（地址表）
QUERY_12:
    LDA PPU_MASK_SHADOW
    AND #$18
; 作用：功能 $1E 各子功能共用的尾部：A 存入 SYS_ARG_0F 作返回值。
; 输入：A=返回值。
; 调用者：QUERY_0、QUERY_1、QUERY_2、QUERY_3、QUERY_4、QUERY_5、QUERY_6、QUERY_7等 13 处
QUERY_STORE_RESULT:
    STA SYS_ARG_0F
    RTS
; 作用：系统功能 $6A 手柄服务：子功能 0 初始化（PAD_KEY、PAD1_BITS、PAD2_BITS 置 $80，PAD1_RAW、PAD2_RAW 清 0），1 取按键码不等待（GAMEPAD_SCAN），2 等到有按键（GAMEPAD_WAIT）。返回时 X 没有恢复（原程序弹栈后写的是 TXA 而不是 TAX）。
; 输入：SYS_SUBFUNCTION。
; 输出：PAD_KEY、PAD1_BITS、PAD2_BITS。
; 调用者：SYSCALL_TABLE（地址表）
API_6A_GAMEPAD:
    PHA
    TXA
    PHA
    TYA
    PHA
    LDA SYS_SUBFUNCTION
    BNE @check_scan
    LDA #$80
    STA PAD_KEY
    STA PAD1_BITS
    STA PAD2_BITS
    LDA #$00
    STA PAD1_RAW
    STA PAD2_RAW
    JMP @done
@check_scan:
    CMP #$01
    BNE @check_wait
    JSR GAMEPAD_SCAN
    JMP @done
@check_wait:
    CMP #$02
    BNE @done
    JSR GAMEPAD_WAIT
@done:
    PLA
    TAY
    PLA
    TXA
    PLA
    RTS
; 作用：手柄子功能 1：从位 7 向下找第一个按下的键，PAD_KEY 得到按键码（1 号手柄 $0F-$08、2 号手柄 $07-$00，没有为 $FF；鼠标在线时不扫 2 号手柄），PAD1_BITS、PAD2_BITS 得到两个手柄的原始状态（PAD1_RAW、PAD2_RAW）。
; 输出：PAD_KEY、PAD1_BITS、PAD2_BITS。
; 调用者：API_6A_GAMEPAD、GAMEPAD_WAIT
GAMEPAD_SCAN:
    LDA #$0F
    STA PAD_KEY
    LDX #$08
    LDA PAD1_RAW
@loop:
    ASL A
    BCS @store_raw
    DEC PAD_KEY
    DEX
    BNE @loop
    LDA MOUSE_PACKET_STATE
    BNE @no_key
    LDX #$08
    LDA PAD2_RAW
@scan_pad2:
    ASL A
    BCS @store_raw
    DEC PAD_KEY
    DEX
    BNE @scan_pad2
@no_key:
    LDA #$FF
    STA PAD_KEY
@store_raw:
    LDA PAD1_RAW
    STA PAD1_BITS
    LDA PAD2_RAW
    STA PAD2_BITS
    RTS
; 作用：手柄子功能 2：反复扫描，直到 PAD_KEY 不是 $FF（有键按下）。
; 输出：PAD_KEY。
; 调用者：API_6A_GAMEPAD、GAMEPAD_WAIT
GAMEPAD_WAIT:
    JSR GAMEPAD_SCAN
    LDA PAD_KEY
    BMI GAMEPAD_WAIT
    RTS
    RTS
; 作用：系统功能 $6B 输入服务：子功能 0 复位键盘与鼠标（INPUT_INIT），1 ESC_BREAK 置 $FF，2 ESC_BREAK 清 0，3 取一个按键不等待（KEY_GET_NOWAIT），4 等到有按键再取（KEY_GET_WAIT），5 清空按键队列（KEY_FLUSH），6 取队列里的按键数（KEY_COUNT）。
; 输入：SYS_SUBFUNCTION。
; 调用者：SYSCALL_TABLE（地址表）
API_6B_INPUT_SERVICE:
    LDA SYS_SUBFUNCTION
    BNE @check_esc_on
    JSR INPUT_INIT
    RTS
@check_esc_on:
    CMP #$01
    BNE @check_esc_off
    LDA #$FF
    STA ESC_BREAK
    RTS
@check_esc_off:
    CMP #$02
    BNE @check_get
    LDA #$00
    STA ESC_BREAK
    RTS
@check_get:
    CMP #$03
    BNE @check_wait
    JSR KEY_GET_NOWAIT
    RTS
@check_wait:
    CMP #$04
    BNE @check_flush
    JSR KEY_GET_WAIT
    RTS
@check_flush:
    CMP #$05
    BNE @check_count
    JSR KEY_FLUSH
    RTS
@check_count:
    CMP #$06
    BNE @return
    JSR KEY_COUNT
    RTS
@return:
    RTS
; 作用：输入服务 $6B/$00：复位键盘与鼠标，清空按键队列
; 调用者：API_6B_INPUT_SERVICE
INPUT_INIT:
    LDA ESC_BREAK
    PHA
    LDA TIMER_HOOK_VEC_LO
    PHA
    LDA TIMER_HOOK_VEC_HI
    PHA
    LDA #$6B
    STA SYS_FUNCTION
    LDA #$02
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$02
    STA KBD_LEDS
    LDA #$20
    STA KBD_FLAGS
    STA KBD_PREFIX_STATE
    LDA #$13
    STA SYS_FUNCTION
    LDA #$02
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$00
    STA KBD_ACK
    STA KBD_SELF_TEST_RESULT
    STA JOY1
    STA INPUT_RESERVED_0631
    LDA #$00
    STA KBD_READY
    STA KBD_RESPONSE
    LDA #$17
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$FF
    STA KBD_READY
    STA KBD_STATE_FLAG
    LDA #$80
    STA KBD_ACK
    LDA #$13
    STA SYS_FUNCTION
    LDA #$82
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$00
    STA KEY_READ_INDEX
    STA KEY_WRITE_INDEX
    LDY #$00
@loop:
    STA KEY_QUEUE,Y
    INY
    CPY #$0C
    BNE @loop
    PLA
    STA TIMER_HOOK_VEC_HI
    PLA
    STA TIMER_HOOK_VEC_LO
    PLA
    STA ESC_BREAK
    RTS
; 作用：输入服务 $6B/$03：取一个按键到 KEY_ASCII/HI（ASCII、扫描码），没有按键时两个字节都是 0
; 输出：KEY_ASCII、KEY_SCAN。
; 调用者：API_6B_INPUT_SERVICE
KEY_GET_NOWAIT:
    LDX KEY_READ_INDEX
    CPX KEY_WRITE_INDEX
    BEQ @no_key
    LDA KEY_QUEUE,X
    STA KEY_ASCII
    INX
    LDA KEY_QUEUE,X
    STA KEY_SCAN
    INX
    CPX #$0C
    BEQ @wrap
    STX KEY_READ_INDEX
    JMP @return
@no_key:
    LDA #$00
    STA KEY_ASCII
    STA KEY_SCAN
    JMP @return
@wrap:
    LDX #$00
    STX KEY_READ_INDEX
@return:
    RTS
; 作用：输入服务 $6B/$04：等到有按键再取，结果放 KEY_ASCII/HI
; 输出：KEY_ASCII、KEY_SCAN。
; 调用者：API_6B_INPUT_SERVICE、KEY_GET_WAIT
KEY_GET_WAIT:
    LDX KEY_READ_INDEX
    CPX KEY_WRITE_INDEX
    BEQ KEY_GET_WAIT
    LDA KEY_QUEUE,X
    STA KEY_ASCII
    INX
    LDA KEY_QUEUE,X
    STA KEY_SCAN
    INX
    CPX #$0C
    BEQ @wrap
    STX KEY_READ_INDEX
    JMP @return
@wrap:
    LDX #$00
    STX KEY_READ_INDEX
@return:
    RTS
; 作用：输入服务 $6B/$06：计算按键队列（12 字节，每键 2 字节）里的按键数，放到 KEY_ASCII。
; 输出：KEY_ASCII。
; 调用者：API_6B_INPUT_SERVICE
KEY_COUNT:
    LDA KEY_WRITE_INDEX
    CMP KEY_READ_INDEX
    BCS @no_wrap
    CLC
    ADC #$0C
    SEC
    SBC KEY_READ_INDEX
    JMP @halve
@no_wrap:
    SEC
    SBC KEY_READ_INDEX
@halve:
    LSR A
    STA KEY_ASCII
    RTS
; 作用：输入服务 $6B/$05：清空按键队列
; 调用者：API_6B_INPUT_SERVICE
KEY_FLUSH:
    LDA #$00
    STA KEY_READ_INDEX
    STA KEY_WRITE_INDEX
    RTS
    RTS
; 作用：系统功能 $6C 鼠标服务：子功能 0 设置范围（MOUSE_SET_LIMITS，之后落入子功能 1 的保存），1 保存参数（MOUSE_SAVE_PARAM），2 取坐标（MOUSE_GET_POS），3 取按键状态（MOUSE_GET_BUTTONS），4 设置坐标（MOUSE_SET_POS）。子功能 0 与 3 执行完后寄存器 A 已被改写，会继续拿它比较子功能号（原始 BIOS 的小疏漏）。
; 输入：SYS_SUBFUNCTION。
; 调用者：SYSCALL_TABLE（地址表）
API_6C_MOUSE:
    LDA SYS_SUBFUNCTION
    BNE @check_save
    JSR MOUSE_SET_LIMITS
@check_save:
    CMP #$01
    BNE @check_pos
    JSR MOUSE_SAVE_PARAM
    JMP @return
@check_pos:
    CMP #$02
    BNE @check_buttons
    JSR MOUSE_GET_POS
    JMP @return
@check_buttons:
    CMP #$03
    BNE @check_set_pos
    JSR MOUSE_GET_BUTTONS
@check_set_pos:
    CMP #$04
    BNE @return
    JSR MOUSE_SET_POS
@return:
    RTS
; 作用：鼠标子功能 0：取范围 SYS_ARG_03（X 下限）、SYS_ARG_05（X 上限）、SYS_ARG_04（Y 下限）、SYS_ARG_06（Y 上限）存入 MOUSE_X_MIN、MOUSE_X_MAX、MOUSE_Y_MIN、MOUSE_Y_MAX，再落入 MOUSE_SAVE_PARAM 保存 SYS_ARG_0F。
; 输入：SYS_ARG_03 至 SYS_ARG_06、SYS_ARG_0F。
; 调用者：API_6C_MOUSE
MOUSE_SET_LIMITS:
    LDA SYS_ARG_03
    STA MOUSE_X_MIN
    LDA SYS_ARG_05
    STA MOUSE_X_MAX
    LDA SYS_ARG_04
    STA MOUSE_Y_MIN
    LDA SYS_ARG_06
    STA MOUSE_Y_MAX
; 作用：鼠标子功能 1：保存 SYS_ARG_0F 到 MOUSE_PARAM。
; 输入：SYS_ARG_0F。
; 调用者：API_6C_MOUSE、MOUSE_SET_LIMITS（顺序执行到这里）
MOUSE_SAVE_PARAM:
    LDA SYS_ARG_0F
    STA MOUSE_PARAM
    RTS
; 作用：鼠标子功能 2：X 坐标放 SYS_ARG_03，Y 坐标放 SYS_ARG_04。
; 输出：SYS_ARG_03、SYS_ARG_04。
; 调用者：API_6C_MOUSE
MOUSE_GET_POS:
    LDA MOUSE_X
    STA SYS_ARG_03
    LDA MOUSE_Y
    STA SYS_ARG_04
    RTS
; 作用：鼠标子功能 3：由内部按键标志 MOUSE_BTN1_FLAGS、MOUSE_BTN2_FLAGS、MOUSE_BTN_TEMP 整理出两个键各自的拖动（标志位 7）、状态（标志位 6 为 1，否则 MOUSE_BTN_TEMP 对应位为 2，否则 0）、单击（标志位 5，读出后清除）、双击（标志位 4）四项：MOUSE_BTN1_DRAG/STATE/CLICK/DBLCLICK 与 MOUSE_BTN2_DRAG/STATE/CLICK/DBLCLICK；最后清两个标志的位 4、5 与 MOUSE_BTN_TEMP。
; 输出：MOUSE_BTN1_*、MOUSE_BTN2_*。
; 调用者：API_6C_MOUSE
MOUSE_GET_BUTTONS:
    LDA MOUSE_BTN1_FLAGS
    AND #$80
    BEQ @btn1_no_drag
    LDA #$01
    STA MOUSE_BTN1_DRAG
    JMP @btn1_state
@btn1_no_drag:
    LDA #$00
    STA MOUSE_BTN1_DRAG
@btn1_state:
    LDA MOUSE_BTN1_FLAGS
    AND #$40
    BEQ @btn1_check_temp
    LDA #$01
    STA MOUSE_BTN1_STATE
    JMP @btn1_click
@btn1_check_temp:
    LDA MOUSE_BTN_TEMP
    AND #$01
    BEQ @btn1_state_0
    LDA #$02
    STA MOUSE_BTN1_STATE
    JMP @btn1_click
@btn1_state_0:
    LDA #$00
    STA MOUSE_BTN1_STATE
@btn1_click:
    LDA MOUSE_BTN1_FLAGS
    AND #$20
    BEQ @btn1_no_click
    LDA #$01
    STA MOUSE_BTN1_CLICK
    LDA MOUSE_BTN1_FLAGS
    AND #$DF
    STA MOUSE_BTN1_FLAGS
    JMP @btn1_dbl
@btn1_no_click:
    LDA #$00
    STA MOUSE_BTN1_CLICK
@btn1_dbl:
    LDA MOUSE_BTN1_FLAGS
    AND #$10
    BEQ @btn1_no_dbl
    LDA #$01
    STA MOUSE_BTN1_DBLCLICK
    JMP @btn2_drag
@btn1_no_dbl:
    LDA #$00
    STA MOUSE_BTN1_DBLCLICK
@btn2_drag:
    LDA MOUSE_BTN2_FLAGS
    AND #$80
    BEQ @btn2_no_drag
    LDA #$01
    STA MOUSE_BTN2_DRAG
    JMP @btn2_state
@btn2_no_drag:
    LDA #$00
    STA MOUSE_BTN2_DRAG
@btn2_state:
    LDA MOUSE_BTN2_FLAGS
    AND #$40
    BEQ @btn2_check_temp
    LDA #$01
    STA MOUSE_BTN2_STATE
    JMP @btn2_click
@btn2_check_temp:
    LDA MOUSE_BTN_TEMP
    AND #$02
    BEQ @btn2_state_0
    LDA #$02
    STA MOUSE_BTN2_STATE
    JMP @btn2_click
@btn2_state_0:
    LDA #$00
    STA MOUSE_BTN2_STATE
@btn2_click:
    LDA MOUSE_BTN2_FLAGS
    AND #$20
    BEQ @btn2_no_click
    LDA #$01
    STA MOUSE_BTN2_CLICK
    LDA MOUSE_BTN2_FLAGS
    AND #$DF
    STA MOUSE_BTN2_FLAGS
    JMP @btn2_dbl
@btn2_no_click:
    LDA #$00
    STA MOUSE_BTN2_CLICK
@btn2_dbl:
    LDA MOUSE_BTN2_FLAGS
    AND #$10
    BEQ @btn2_no_dbl
    LDA #$01
    STA MOUSE_BTN2_DBLCLICK
    JMP @clear_flags
@btn2_no_dbl:
    LDA #$00
    STA MOUSE_BTN2_DBLCLICK
@clear_flags:
    LDA MOUSE_BTN1_FLAGS
    AND #$CF
    STA MOUSE_BTN1_FLAGS
    LDA MOUSE_BTN2_FLAGS
    AND #$CF
    STA MOUSE_BTN2_FLAGS
    LDA #$00
    STA MOUSE_BTN_TEMP
    RTS
; 作用：鼠标子功能 4：X 坐标取自 SYS_ARG_0F，Y 坐标取自 SYS_ARG_10，存入 MOUSE_X、MOUSE_Y。
; 输入：SYS_ARG_0F、SYS_ARG_10。
; 调用者：API_6C_MOUSE
MOUSE_SET_POS:
    LDA SYS_ARG_0F
    STA MOUSE_X
    LDA SYS_ARG_10
    STA MOUSE_Y
    RTS
    RTS
