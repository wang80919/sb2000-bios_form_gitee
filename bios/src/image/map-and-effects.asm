; 作用：------------------------------------------------------------------------
; 名称：map-and-effects.asm
; 说明：映射流解包、调色板写入与显示特效（功能 $5C-$61）
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：在 ROM 里接在 image/tile-unpack.asm 之后
; ------------------------------------------------------------------------
; 功能 $5C：解压映射流并写进屏幕单元：$064B、$064A 为宽高，单元值要加上 $064C/$064D 的图块基数；格式见 tools/decode-img.mjs
; 调用者：tile-unpack.asm 开头的入口代码（地址表）、API_5F_SHOW_IMAGE
API_5C_UNPACK_MAP:
    LDA #$00
    STA MAP_SKIP_EFFECT
    LDA SYS_ARG_10
    PHA
    LDA #$F8
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$00
    STA WORK_VEC_18_LO
    LDA #$B0
    STA WORK_VEC_18_HI
    PLA
    STA SYS_ARG_10
; 作用：解压映射流前的准备：按 $0653（4、$10 或其他）与 $0652 决定移位次数 X（4 或 6），$0654 左移 X 位后并入 $064D，再经 $2C、$29 映射映射流所在页
; 调用者：API_5E、API_5C_UNPACK_MAP（顺序执行到这里）
MAP_UNPACK_PREPARE:
    LDA SYS_SUBFUNCTION
    PHA
    LDA SYS_ARG_0F
    PHA
    LDX #$04
    LDA SYS_ARG_10
    CMP #$04
    BEQ @shift_ready
    CMP #$10
    BEQ @shift_six
    LDA #$1E
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    LDA SYS_ARG_0F
    BEQ @shift_ready
@shift_six:
    LDX #$06
@shift_ready:
    PLA
    STA SYS_ARG_0F
    PLA
    STA SYS_SUBFUNCTION
@shift_loop:
    ASL SYS_ARG_11
    DEX
    BNE @shift_loop
    LDA MAP_TILE_BASE_HI
    CLC
    ADC SYS_ARG_11
    STA MAP_TILE_BASE_HI
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$01
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    INC SYS_PAGE
    INC SYS_ARG_10
    JSR VEC_SYSCALL
    LDA FAR_OFFSET_HI
    ORA #$90
    STA FAR_OFFSET_HI
@next_command:
    LDY #$00
    LDA (FAR_OFFSET_LO),Y
    BNE @dispatch_command
    JMP @end_of_stream
@dispatch_command:
    TAY
    AND #$1F
    TAX
    TYA
    AND #$E0
    BEQ @repeat_word
    CMP #$20
    BEQ @to_ramp1
    CMP #$40
    BEQ @literal_words
    CMP #$60
    BEQ @literal_bytes
    JMP @ramp2
@to_ramp1:
    JMP @ramp1
@literal_words:
    LDY #$00
    CLC
    INC FAR_OFFSET_LO
    BNE @word_loop
    INC FAR_OFFSET_HI
@word_loop:
    LDA (FAR_OFFSET_LO),Y
    ADC MAP_TILE_BASE_LO
    STA (WORK_VEC_18_LO),Y
    INY
    LDA (FAR_OFFSET_LO),Y
    ADC MAP_TILE_BASE_HI
    STA (WORK_VEC_18_LO),Y
    INY
    DEX
    BNE @word_loop
    TYA
    CLC
    ADC FAR_OFFSET_LO
    STA FAR_OFFSET_LO
    BCC @add_dst
    INC FAR_OFFSET_HI
@add_dst:
    TYA
    CLC
    ADC WORK_VEC_18_LO
    STA WORK_VEC_18_LO
    BCC @next_command
    INC WORK_VEC_18_HI
    BCS @next_command
@repeat_word:
    INC FAR_OFFSET_LO
    BNE @repeat_start
    INC FAR_OFFSET_HI
@repeat_start:
    LDY #$00
    LDA (FAR_OFFSET_LO),Y
    CLC
    ADC MAP_TILE_BASE_LO
    STA MAP_WORK_0
    INY
    LDA (FAR_OFFSET_LO),Y
    ADC MAP_TILE_BASE_HI
    STA MAP_WORK_1
    DEY
@repeat_loop:
    LDA MAP_WORK_0
    STA (WORK_VEC_18_LO),Y
    INY
    LDA MAP_WORK_1
    STA (WORK_VEC_18_LO),Y
    INY
    DEX
    BNE @repeat_loop
    JMP @advance_after_run
@literal_bytes:
    INC FAR_OFFSET_LO
    BNE @bytes_start
    INC FAR_OFFSET_HI
@bytes_start:
    LDY #$00
    LDA (FAR_OFFSET_LO),Y
    STA MAP_WORK_1
    CLC
    STY MAP_WORK_2
    STY MAP_WORK_3
    INC FAR_OFFSET_LO
    BNE @bytes_loop
    INC FAR_OFFSET_HI
@bytes_loop:
    LDY MAP_WORK_2
    LDA (FAR_OFFSET_LO),Y
    ADC MAP_TILE_BASE_LO
    LDY MAP_WORK_3
    STA (WORK_VEC_18_LO),Y
    INC MAP_WORK_2
    INC MAP_WORK_3
    LDA MAP_WORK_1
    ADC MAP_TILE_BASE_HI
    INY
    STA (WORK_VEC_18_LO),Y
    INC MAP_WORK_3
    DEX
    BNE @bytes_loop
    LDA MAP_WORK_2
    CLC
    ADC FAR_OFFSET_LO
    STA FAR_OFFSET_LO
    BCC @bytes_add_dst
    INC FAR_OFFSET_HI
@bytes_add_dst:
    LDA MAP_WORK_3
    CLC
    ADC WORK_VEC_18_LO
    STA WORK_VEC_18_LO
    BCC @continue
    INC WORK_VEC_18_HI
    BNE @continue
@ramp2:
    INC FAR_OFFSET_LO
    BNE @ramp2_start
    INC FAR_OFFSET_HI
@ramp2_start:
    LDY #$00
    LDA (FAR_OFFSET_LO),Y
    STA MAP_WORK_0
    INY
    LDA (FAR_OFFSET_LO),Y
    STA MAP_WORK_1
    DEY
    CLC
@ramp2_loop:
    LDA MAP_WORK_0
    ADC MAP_TILE_BASE_LO
    STA (WORK_VEC_18_LO),Y
    INY
    LDA MAP_WORK_1
    ADC MAP_TILE_BASE_HI
    STA (WORK_VEC_18_LO),Y
    INY
    INC MAP_WORK_0
    INC MAP_WORK_0
    DEX
    BNE @ramp2_loop
    BEQ @advance_after_run
@ramp1:
    INC FAR_OFFSET_LO
    BNE @ramp1_start
    INC FAR_OFFSET_HI
@ramp1_start:
    LDY #$00
    LDA (FAR_OFFSET_LO),Y
    STA MAP_WORK_0
    INY
    LDA (FAR_OFFSET_LO),Y
    STA MAP_WORK_1
    DEY
    CLC
@ramp1_loop:
    LDA MAP_WORK_0
    ADC MAP_TILE_BASE_LO
    STA (WORK_VEC_18_LO),Y
    INY
    LDA MAP_WORK_1
    ADC MAP_TILE_BASE_HI
    STA (WORK_VEC_18_LO),Y
    INY
    INC MAP_WORK_0
    DEX
    BNE @ramp1_loop
@advance_after_run:
    LDA FAR_OFFSET_LO
    CLC
    ADC #$02
    STA FAR_OFFSET_LO
    BCC @advance_dst_after_run
    INC FAR_OFFSET_HI
@advance_dst_after_run:
    TYA
    CLC
    ADC WORK_VEC_18_LO
    STA WORK_VEC_18_LO
    BCC @continue
    INC WORK_VEC_18_HI
@continue:
    JMP @next_command
@end_of_stream:
    LDA MAP_SKIP_EFFECT
    BEQ @apply_effect
    RTS
@apply_effect:
    LDA MAP_RECT_WIDTH
    ASL A
    STA SYS_ARG_10
    LDA MAP_RECT_X
    STA MAP_WORK_2
    LDA MAP_RECT_Y
    STA MAP_WORK_3
    LDA #<EFFECT_CALC_ROW_ADDR
    STA WORK_VEC_16_LO
    LDA #>EFFECT_CALC_ROW_ADDR
    STA WORK_VEC_16_HI
    JMP EFFECT_DISPATCH
; 作用：按 MAP_RECT_X、MAP_RECT_Y 减去 MAP_WORK_2/MAP_WORK_3 的差算出屏幕缓冲里的单元地址（每行 $40 字节），结果放 WORK_VEC_18_LO/WORK_VEC_18_HI；效果分发前把它登记为 WORK_VEC_16_LO/WORK_VEC_16_HI
; 调用者：MAP_UNPACK_PREPARE（取地址）
EFFECT_CALC_ROW_ADDR:
    TYA
    PHA
    TXA
    PHA
    LDA #$B0
    STA WORK_VEC_18_HI
    LDA MAP_RECT_Y
    SEC
    SBC MAP_WORK_3
    TAY
    LDA MAP_RECT_X
    SBC MAP_WORK_2
    ASL A
@row_loop:
    DEY
    BMI @row_done
    ADC SYS_ARG_10
    BCC @row_loop
    INC WORK_VEC_18_HI
    CLC
    BCC @row_loop
@row_done:
    STA WORK_VEC_18_LO
    LDA SYS_ARG_0F
    CMP #$02
    BNE @read_cells
    LDA #$F8
    STA SYS_GROUP
    LDA WORK_VEC_18_LO
    STA PROG_ENTRY_LO
    LDA WORK_VEC_18_HI
    AND #$0F
    STA PROG_ENTRY_HI
    LDA #$00
    STA SYS_ARG_0D
    LDA #$08
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JMP @restore_regs
@read_cells:
    LDA SYS_ARG_0C
    PHA
    LDX #$00
@copy_loop:
    LDY #$00
    LDA (WORK_VEC_18_LO),Y
    STA COPY_BUFFER,X
    INY
    INX
    LDA (WORK_VEC_18_LO),Y
    STA COPY_BUFFER,X
    INX
    LDA WORK_VEC_18_LO
    CLC
    ADC SYS_ARG_10
    STA WORK_VEC_18_LO
    BCC @dst_carry
    INC WORK_VEC_18_HI
@dst_carry:
    DEC SYS_ARG_0C
    BNE @copy_loop
    PLA
    STA SYS_ARG_0C
    LDA #$07
    STA SYS_GROUP
    LDA #<COPY_BUFFER
    STA PROG_ENTRY_LO
    LDA #>COPY_BUFFER
    STA PROG_ENTRY_HI
    LDA #$00
    STA SYS_ARG_0D
    LDA #$08
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
@restore_regs:
    PLA
    TAX
    PLA
    TAY
    RTS
; 作用：功能 $5D：把 $0C/$0D 指向的 $064F 字节写进调色板寄存器区 $2040 起的 $0647 偏移处（$0652 非 0 时配合垂直消隐等待，代码阅读）
; 调用者：tile-unpack.asm 开头的入口代码（地址表）、API_5E、API_5F_SHOW_IMAGE
API_5D_WRITE_PALETTE:
    LDA SYS_ARG_0C
    BNE @have_data
    RTS
@have_data:
    LDA #$1E
    STA SYS_FUNCTION
    LDA #$0C
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA SYS_ARG_0F
    BEQ @direct_write
    LDA #$1E
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA SYS_ARG_0F
    AND #$01
    BNE @upload_on_frame
@wait_vblank:
    LDA PPU_STATUS
    BPL @wait_vblank
    JMP @direct_write
@upload_on_frame:
    LDA SYS_ARG_0C
    STA PALETTE_UPLOAD_COUNT
    LDA SYS_ARG_04
    STA PALETTE_UPLOAD_OFFSET
    LDA SYS_GROUP
    STA PALETTE_UPLOAD_PAGE
    LDA PROG_ENTRY_LO
    STA PALETTE_PTR_LO
    LDA PROG_ENTRY_HI
    STA PALETTE_PTR_HI
    LDA #$86
    STA SYS_SUBFUNCTION
    LDA #$12
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JSR WAIT_ONE_FRAME_0B
    LDA #$06
    STA SYS_SUBFUNCTION
    LDA #$12
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JMP @return
@direct_write:
    LDX #$00
    JSR VEC_FAR_COPY_IN
    LDX SYS_ARG_04
    LDY #$00
@copy_loop:
    LDA COPY_BUFFER,Y
    STA PPU_EXT_PALETTE,X
    INY
    INX
    CPY SYS_ARG_0C
    BCC @copy_loop
@return:
    RTS
; 作用：功能 $5E（显示整屏图片）：10 字节头 [宽、高、图案数、调色板组数、每组色数、映射流偏移、调色板偏移]，图案流同 $5B，映射流直接解到名称表缓冲开头后整张 DMA 一次，调色板固定写 $40 字节到偏移 0（用例 p0b-image.mjs）；页组 $0B 入口
; 调用者：tile-unpack.asm 开头的入口代码（地址表）
API_5E:
    LDX #$14
    LDA #$0A
    STA SYS_ARG_0C
    JSR VEC_FAR_COPY_IN
    LDA SYS_GROUP
    STA IMG5E_SAVE_GROUP
    LDA PROG_ENTRY_LO
    STA IMG5E_SAVE_ENTRY_LO
    LDA PROG_ENTRY_HI
    STA IMG5E_SAVE_ENTRY_HI
    LDA MAP_TILE_BASE_LO
    STA IMG5E_SAVE_TILE_BASE_LO
    LDA MAP_TILE_BASE_HI
    STA IMG5E_SAVE_TILE_BASE_HI
    LDA PROG_ENTRY_LO
    CLC
    ADC #$0A
    STA PROG_ENTRY_LO
    BCC @src_ok
    INC PROG_ENTRY_HI
@src_ok:
    JSR API_5B_UNPACK_TILES
    LDA #$FF
    STA MAP_SKIP_EFFECT
    LDA #$00
    STA SYS_ARG_11
    LDA IMG5E_SAVE_GROUP
    STA SYS_GROUP
    LDA IMG5E_SAVE_ENTRY_LO
    CLC
    ADC IMG5E_MAP_OFFSET_LO
    STA PROG_ENTRY_LO
    LDA IMG5E_SAVE_ENTRY_HI
    ADC IMG5E_MAP_OFFSET_HI
    STA PROG_ENTRY_HI
    BCC @map_no_carry
    CLC
    ADC #$80
    STA PROG_ENTRY_HI
    LDA SYS_GROUP
    ADC #$08
    STA SYS_GROUP
@map_no_carry:
    LDA PROG_ENTRY_HI
    CMP #$C0
    BCC @map_high_ok
    SBC #$40
    STA PROG_ENTRY_HI
    LDA SYS_GROUP
    CLC
    ADC #$04
    STA SYS_GROUP
@map_high_ok:
    LDA IMG5E_SAVE_TILE_BASE_LO
    STA MAP_TILE_BASE_LO
    LDA IMG5E_SAVE_TILE_BASE_HI
    STA MAP_TILE_BASE_HI
    LDA #$00
    STA MAP_RECT_X
    STA MAP_RECT_Y
    LDA SYS_SUBFUNCTION
    CLC
    ADC #$04
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA FAR_OFFSET_LO
    STA WORK_VEC_18_LO
    LDA FAR_OFFSET_HI
    ORA #$B0
    STA WORK_VEC_18_HI
    JSR MAP_UNPACK_PREPARE
    LDA SYS_SUBFUNCTION
    SEC
    SBC #$04
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA IMG5E_SAVE_GROUP
    STA SYS_GROUP
    LDA IMG5E_SAVE_ENTRY_LO
    CLC
    ADC IMG5E_PALETTE_OFFSET_LO
    STA PROG_ENTRY_LO
    LDA IMG5E_SAVE_ENTRY_HI
    ADC IMG5E_PALETTE_OFFSET_HI
    STA PROG_ENTRY_HI
    BCC @palette_no_carry
    CLC
    ADC #$80
    STA PROG_ENTRY_HI
    LDA SYS_GROUP
    ADC #$08
    STA SYS_GROUP
@palette_no_carry:
    LDA PROG_ENTRY_HI
    CMP #$C0
    BCC @palette_high_ok
    SBC #$40
    STA PROG_ENTRY_HI
    LDA SYS_GROUP
    CLC
    ADC #$04
    STA SYS_GROUP
@palette_high_ok:
    LDA #$00
    STA SYS_ARG_04
    LDA #$40
    STA SYS_ARG_0C
    JSR API_5D_WRITE_PALETTE
    RTS
; 作用：功能 $5F：显示一张压缩图片：读 10 字节头，依次调用 $5B（图案）、$5D（调色板）、$5C（映射）；参数用法见页 78 的图片参数表；实测调用后图案区被改写
; 调用者：tile-unpack.asm 开头的入口代码（地址表）
API_5F_SHOW_IMAGE:
    LDX #$46
    LDA #$0A
    STA SYS_ARG_0C
    JSR VEC_FAR_COPY_IN
    LDA SYS_GROUP
    STA IMG5F_SAVE_GROUP
    LDA PROG_ENTRY_LO
    STA IMG5F_SAVE_ENTRY_LO
    LDA PROG_ENTRY_HI
    STA IMG5F_SAVE_ENTRY_HI
    LDA MAP_TILE_BASE_LO
    STA IMG5F_SAVE_TILE_BASE_LO
    LDA MAP_TILE_BASE_HI
    STA IMG5F_SAVE_TILE_BASE_HI
    LDA SYS_ARG_10
    STA IMG5F_SAVE_MODE
    STA SYS_ARG_11
    LDA SYS_ARG_0F
    STA IMG5F_SAVE_ARG_0F
    LDA SYS_SUBFUNCTION
    STA IMG5F_SAVE_SUBFUNCTION
    LDA PROG_ENTRY_LO
    CLC
    ADC #$0A
    STA PROG_ENTRY_LO
    BCC @src_ok
    INC PROG_ENTRY_HI
@src_ok:
    JSR API_5B_UNPACK_TILES
    LDA IMG5F_SAVE_MODE
    STA SYS_ARG_10
    LDA IMG5F_SAVE_GROUP
    STA SYS_GROUP
    LDA IMG5F_SAVE_ENTRY_LO
    CLC
    ADC IMG5F_PALETTE_OFFSET_LO
    STA PROG_ENTRY_LO
    LDA IMG5F_SAVE_ENTRY_HI
    ADC IMG5F_PALETTE_OFFSET_HI
    STA PROG_ENTRY_HI
    BCC @palette_no_carry
    CLC
    ADC #$80
    STA PROG_ENTRY_HI
    LDA SYS_GROUP
    ADC #$08
    STA SYS_GROUP
@palette_no_carry:
    LDA PROG_ENTRY_HI
    CMP #$C0
    BCC @palette_high_ok
    SBC #$40
    STA PROG_ENTRY_HI
    LDA SYS_GROUP
    CLC
    ADC #$04
    STA SYS_GROUP
@palette_high_ok:
    LDX #$02
    LDA IMG5F_DEPTH
    CMP #$04
    BEQ @shift_loop1
    LDX #$04
@shift_loop1:
    ASL SYS_ARG_10
    DEX
    BNE @shift_loop1
    LDA SYS_ARG_10
    STA SYS_ARG_04
    LDX #$02
    LDA IMG5F_DEPTH
    CMP #$04
    BEQ @shift_loop2
    LDX #$04
@shift_loop2:
    ASL IMG5F_PALETTE_COUNT
    DEX
    BNE @shift_loop2
    LDA IMG5F_PALETTE_COUNT
    STA SYS_ARG_0C
    JSR API_5D_WRITE_PALETTE
    LDA IMG5F_SAVE_ARG_0F
    STA SYS_ARG_0F
    LDA IMG5F_SAVE_SUBFUNCTION
    STA SYS_SUBFUNCTION
    LDA IMG5F_SAVE_GROUP
    STA SYS_GROUP
    LDA IMG5F_SAVE_ENTRY_LO
    CLC
    ADC IMG5F_MAP_OFFSET_LO
    STA PROG_ENTRY_LO
    LDA IMG5F_SAVE_ENTRY_HI
    ADC IMG5F_MAP_OFFSET_HI
    STA PROG_ENTRY_HI
    BCC @map_no_carry
    CLC
    ADC #$80
    STA PROG_ENTRY_HI
    LDA SYS_GROUP
    ADC #$08
    STA SYS_GROUP
@map_no_carry:
    LDA PROG_ENTRY_HI
    CMP #$C0
    BCC @map_high_ok
    SBC #$40
    STA PROG_ENTRY_HI
    LDA SYS_GROUP
    CLC
    ADC #$04
    STA SYS_GROUP
@map_high_ok:
    LDA IMG5F_SAVE_TILE_BASE_LO
    STA MAP_TILE_BASE_LO
    LDA IMG5F_SAVE_TILE_BASE_HI
    STA MAP_TILE_BASE_HI
    LDA IMG5F_DEPTH
    STA SYS_ARG_10
    LDA IMG5F_MAP_WIDTH
    STA MAP_RECT_WIDTH
    LDA IMG5F_MAP_HEIGHT
    STA MAP_RECT_HEIGHT
    JSR API_5C_UNPACK_MAP
    RTS
; 作用：功能 $60：用与 $5C 相同的效果把单元值 $064C/$064D（不加调色板位）铺满矩形（原点 $0648/$0649，宽 $064B、高 $064A）（用例 p0b-map.mjs）；页组 $0B 入口
; 调用者：tile-unpack.asm 开头的入口代码（地址表）
API_60:
    LDY #$00
@fill_loop:
    LDA MAP_TILE_BASE_LO
    STA COPY_BUFFER,Y
    INY
    LDA MAP_TILE_BASE_HI
    STA COPY_BUFFER,Y
    INY
    CPY #$40
    BCC @fill_loop
    LDA #<EFFECT_FLUSH_COPY_BUFFER
    STA WORK_VEC_16_LO
    LDA #>EFFECT_FLUSH_COPY_BUFFER
    STA WORK_VEC_16_HI
; 作用：屏幕过渡效果的分发：先裁剪参数（MAP_CLIP_PARAMS），再按 $0652 选效果
; 调用者：MAP_UNPACK_PREPARE、API_60（顺序执行到这里）
EFFECT_DISPATCH:
    JSR MAP_CLIP_PARAMS
    LDA SYS_ARG_0F
    JSR IMAGE_INLINE_JUMP
    .word EFFECT_ROWS_DOWN,EFFECT_COLS_RIGHT,EFFECT_COLS_LEFT,EFFECT_ROWS_DOWN_TIMED,EFFECT_ROWS_UP_TIMED,EFFECT_FRAME_SHRINK,EFFECT_FRAME_DRAW,EFFECT_COLS_FROM_CENTER
    .word EFFECT_COLS_TO_CENTER
; 作用：屏幕效果 0（API_5C、API_60 的 $0652 为 0）：从上往下逐行写，每行宽 MAP_RECT_WIDTH 个单元，写完一行 MAP_RECT_Y 加 1，到 EFFECT_BOTTOM 结束，中途不刷新，最后刷新一次（用例 p0b-map.mjs）
; 调用者：EFFECT_DISPATCH（地址表）、EFFECT_ROWS_DOWN
EFFECT_ROWS_DOWN:
    LDA MAP_RECT_WIDTH
    STA SYS_ARG_0C
    LDA #$02
    STA SYS_ARG_0F
    JSR MAP_FLUSH_AND_JUMP
    INC MAP_RECT_Y
    LDA MAP_RECT_Y
    CMP EFFECT_BOTTOM
    BCC EFFECT_ROWS_DOWN
    LDA EFFECT_SUBFUNCTION
    SBC #$04
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：屏幕效果 1：从左往右逐列写，每列高 MAP_RECT_HEIGHT 个单元，列间按速度 $0651（EFFECT_DELAY、SYS_ARG_0E）刷新并等待（用例 p0b-map.mjs）
; 调用者：EFFECT_DISPATCH（地址表）、EFFECT_COLS_RIGHT
EFFECT_COLS_RIGHT:
    LDA #$40
    STA SYS_ARG_0F
    LDA MAP_RECT_HEIGHT
    STA SYS_ARG_0C
    JSR MAP_FLUSH_AND_JUMP
    INC MAP_RECT_X
    LDA MAP_RECT_X
    CMP EFFECT_RIGHT
    BCS @finish
    LDX EFFECT_DELAY
    BEQ @use_counter
    DEC SYS_ARG_0E
    BNE @next_column
    LDX EFFECT_DELAY
    STX SYS_ARG_0E
    LDX #$01
    BNE @refresh_wait
@use_counter:
    LDX SYS_ARG_0E
@refresh_wait:
    LDA EFFECT_SUBFUNCTION
    SEC
    SBC #$04
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JSR WAIT_FRAMES_X
@next_column:
    JMP EFFECT_COLS_RIGHT
@finish:
    LDA EFFECT_SUBFUNCTION
    SEC
    SBC #$04
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：用 EFFECT_SUBFUNCTION 作子功能调用 $30（刷新屏幕单元到显存），再跳到 WORK_VEC_16_LO/WORK_VEC_16_HI 指向的下一步；调用 17 次
; 调用者：EFFECT_ROWS_DOWN、EFFECT_COLS_RIGHT、EFFECT_COLS_LEFT、EFFECT_ROWS_DOWN_TIMED、EFFECT_ROWS_UP_TIMED、EFFECT_FRAME_SHRINK、EFFECT_FRAME_DRAW、EFFECT_COLS_FROM_CENTER等 9 处
MAP_FLUSH_AND_JUMP:
    LDA EFFECT_SUBFUNCTION
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JMP (WORK_VEC_16_LO)
; 作用：把 COPY_BUFFER 里的内容经 $30 子功能 8 送回显存（页组 7），长度高字节清 0
; 调用者：API_60（取地址）
EFFECT_FLUSH_COPY_BUFFER:
    LDA #$07
    STA SYS_GROUP
    LDA #<COPY_BUFFER
    STA PROG_ENTRY_LO
    LDA #>COPY_BUFFER
    STA PROG_ENTRY_HI
    LDA #$00
    STA SYS_ARG_0D
    LDA #$08
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：屏幕效果 2：从右往左逐列写，MAP_RECT_X 递减到小于 EFFECT_RIGHT 结束，列间按速度刷新并等待（用例 p0b-map.mjs）
; 调用者：EFFECT_DISPATCH（地址表）
EFFECT_COLS_LEFT:
    LDX EFFECT_RIGHT
    LDA MAP_RECT_X
    STA EFFECT_RIGHT
    DEX
    STX MAP_RECT_X
@loop:
    LDA #$40
    STA SYS_ARG_0F
    LDA MAP_RECT_HEIGHT
    STA SYS_ARG_0C
    JSR MAP_FLUSH_AND_JUMP
    DEC MAP_RECT_X
    BMI @finish
    LDA MAP_RECT_X
    CMP EFFECT_RIGHT
    BCC @finish
    LDX EFFECT_DELAY
    BEQ @use_counter
    DEC SYS_ARG_0E
    BNE @next_column
    LDX EFFECT_DELAY
    STX SYS_ARG_0E
    LDX #$01
    BNE @refresh_wait
@use_counter:
    LDX SYS_ARG_0E
@refresh_wait:
    LDA EFFECT_SUBFUNCTION
    SEC
    SBC #$04
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JSR WAIT_FRAMES_X
@next_column:
    JMP @loop
@finish:
    LDA EFFECT_SUBFUNCTION
    SEC
    SBC #$04
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：屏幕效果 3：从上往下逐行写，行间按速度 $0651（EFFECT_DELAY、SYS_ARG_0E）刷新并等待（用例 p0b-map.mjs）
; 调用者：EFFECT_DISPATCH（地址表）、EFFECT_ROWS_DOWN_TIMED
EFFECT_ROWS_DOWN_TIMED:
    LDA #$02
    STA SYS_ARG_0F
    LDA MAP_RECT_WIDTH
    STA SYS_ARG_0C
    JSR MAP_FLUSH_AND_JUMP
    INC MAP_RECT_Y
    LDA MAP_RECT_Y
    CMP EFFECT_BOTTOM
    BCS @finish
    LDX EFFECT_DELAY
    BEQ @use_counter
    DEC SYS_ARG_0E
    BNE @next_row
    LDX EFFECT_DELAY
    STX SYS_ARG_0E
    LDX #$01
    BNE @refresh_wait
@use_counter:
    LDX SYS_ARG_0E
@refresh_wait:
    LDA EFFECT_SUBFUNCTION
    SEC
    SBC #$04
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JSR WAIT_FRAMES_X
@next_row:
    JMP EFFECT_ROWS_DOWN_TIMED
@finish:
    LDA EFFECT_SUBFUNCTION
    SEC
    SBC #$04
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：屏幕效果 4：从下往上逐行写，行间按速度刷新并等待（用例 p0b-map.mjs）
; 调用者：EFFECT_DISPATCH（地址表）
EFFECT_ROWS_UP_TIMED:
    LDX EFFECT_BOTTOM
    LDA MAP_RECT_Y
    STA EFFECT_BOTTOM
    DEX
    STX MAP_RECT_Y
@loop:
    LDA #$02
    STA SYS_ARG_0F
    LDA MAP_RECT_WIDTH
    STA SYS_ARG_0C
    JSR MAP_FLUSH_AND_JUMP
    DEC MAP_RECT_Y
    BMI @finish
    LDA MAP_RECT_Y
    CMP EFFECT_BOTTOM
    BCC @finish
    LDX EFFECT_DELAY
    BEQ @use_counter
    DEC SYS_ARG_0E
    BNE @next_row
    LDX EFFECT_DELAY
    STX SYS_ARG_0E
    LDX #$01
    BNE @refresh_wait
@use_counter:
    LDX SYS_ARG_0E
@refresh_wait:
    LDA EFFECT_SUBFUNCTION
    SEC
    SBC #$04
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JSR WAIT_FRAMES_X
@next_row:
    JMP @loop
@finish:
    LDA EFFECT_SUBFUNCTION
    SEC
    SBC #$04
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：屏幕效果 5：先把矩形向内收缩到中心（MAP_SHRINK_RECT），再由内向外逐圈写边框（每圈写上、下两行与左、右两列），圈间按速度刷新并等待（用例 p0b-map.mjs）
; 调用者：EFFECT_DISPATCH（地址表）
EFFECT_FRAME_SHRINK:
    JSR MAP_SHRINK_RECT
@loop:
    DEC MAP_RECT_X
    DEC MAP_RECT_Y
    INC MAP_RECT_WIDTH
    INC MAP_RECT_HEIGHT
    INC MAP_RECT_WIDTH
    INC MAP_RECT_HEIGHT
    INC EFFECT_BOTTOM
    INC EFFECT_RIGHT
    LDA MAP_RECT_X
    BMI @ring_end
    CMP MAP_WORK_0
    BCS @draw_ring
@ring_end:
    JMP @finish
@draw_ring:
    LDA MAP_RECT_WIDTH
    STA SYS_ARG_0C
    LDA #$02
    STA SYS_ARG_0F
    JSR MAP_FLUSH_AND_JUMP
    LDA MAP_RECT_HEIGHT
    STA SYS_ARG_0C
    LDA #$40
    STA SYS_ARG_0F
    JSR MAP_FLUSH_AND_JUMP
    LDA MAP_RECT_X
    PHA
    LDA EFFECT_RIGHT
    STA MAP_RECT_X
    DEC MAP_RECT_X
    LDA MAP_RECT_HEIGHT
    STA SYS_ARG_0C
    LDA #$40
    STA SYS_ARG_0F
    JSR MAP_FLUSH_AND_JUMP
    PLA
    STA MAP_RECT_X
    LDA MAP_RECT_Y
    PHA
    LDA EFFECT_BOTTOM
    STA MAP_RECT_Y
    DEC MAP_RECT_Y
    LDA MAP_RECT_WIDTH
    STA SYS_ARG_0C
    LDA #$02
    STA SYS_ARG_0F
    JSR MAP_FLUSH_AND_JUMP
    PLA
    STA MAP_RECT_Y
    LDX EFFECT_DELAY
    BEQ @use_counter
    DEC SYS_ARG_0E
    BNE @next_ring
    LDX EFFECT_DELAY
    STX SYS_ARG_0E
    LDX #$01
    BNE @refresh_wait
@use_counter:
    LDX SYS_ARG_0E
@refresh_wait:
    LDA EFFECT_SUBFUNCTION
    SEC
    SBC #$04
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JSR WAIT_FRAMES_X
@next_ring:
    JMP @loop
@finish:
    LDA EFFECT_SUBFUNCTION
    SEC
    SBC #$04
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：把矩形（MAP_RECT_X、MAP_RECT_Y 起，MAP_RECT_WIDTH/MAP_RECT_HEIGHT 宽高）向内收缩：起点加 1、宽高各减 2，直到起点越过 EFFECT_RIGHT/EFFECT_BOTTOM
; 调用者：EFFECT_FRAME_SHRINK
MAP_SHRINK_RECT:
    LDA MAP_RECT_X
    STA MAP_WORK_0
    LDA MAP_RECT_Y
    STA MAP_WORK_1
@loop:
    INC MAP_RECT_X
    INC MAP_RECT_Y
    DEC MAP_RECT_WIDTH
    DEC MAP_RECT_HEIGHT
    DEC MAP_RECT_WIDTH
    DEC MAP_RECT_HEIGHT
    DEC EFFECT_RIGHT
    DEC EFFECT_BOTTOM
    LDA MAP_RECT_X
    CMP EFFECT_RIGHT
    BCS @return
    LDA MAP_RECT_Y
    CMP EFFECT_BOTTOM
    BCC @loop
@return:
    RTS
; 作用：屏幕效果 6：由外向内逐圈写边框（每圈写上、下两行与左、右两列），圈间按速度刷新并等待，直到矩形收缩完（用例 p0b-map.mjs）
; 调用者：EFFECT_DISPATCH（地址表）、EFFECT_FRAME_DRAW
EFFECT_FRAME_DRAW:
    LDA MAP_RECT_WIDTH
    STA SYS_ARG_0C
    LDA #$02
    STA SYS_ARG_0F
    JSR MAP_FLUSH_AND_JUMP
    LDA MAP_RECT_HEIGHT
    STA SYS_ARG_0C
    LDA #$40
    STA SYS_ARG_0F
    JSR MAP_FLUSH_AND_JUMP
    LDA MAP_RECT_X
    PHA
    DEC EFFECT_RIGHT
    LDA EFFECT_RIGHT
    STA MAP_RECT_X
    LDA MAP_RECT_HEIGHT
    STA SYS_ARG_0C
    LDA #$40
    STA SYS_ARG_0F
    JSR MAP_FLUSH_AND_JUMP
    PLA
    STA MAP_RECT_X
    LDA MAP_RECT_Y
    PHA
    DEC EFFECT_BOTTOM
    LDA EFFECT_BOTTOM
    STA MAP_RECT_Y
    LDA MAP_RECT_WIDTH
    STA SYS_ARG_0C
    LDA #$02
    STA SYS_ARG_0F
    JSR MAP_FLUSH_AND_JUMP
    PLA
    STA MAP_RECT_Y
    INC MAP_RECT_X
    INC MAP_RECT_Y
    DEC MAP_RECT_WIDTH
    DEC MAP_RECT_HEIGHT
    LDA MAP_RECT_X
    CMP EFFECT_RIGHT
    BCS @finish
    LDA MAP_RECT_Y
    CMP EFFECT_BOTTOM
    BCS @finish
    LDX EFFECT_DELAY
    BEQ @use_counter
    DEC SYS_ARG_0E
    BNE @next_ring
    LDX EFFECT_DELAY
    STX SYS_ARG_0E
    LDX #$01
    BNE @refresh_wait
@use_counter:
    LDX SYS_ARG_0E
@refresh_wait:
    LDA EFFECT_SUBFUNCTION
    SEC
    SBC #$04
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JSR WAIT_FRAMES_X
@next_ring:
    JMP EFFECT_FRAME_DRAW
@finish:
    LDA EFFECT_SUBFUNCTION
    SEC
    SBC #$04
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：屏幕效果 7：宽度的一半为界，从中线向两边逐列写（左右各一列交替），列间按速度刷新并等待（用例 p0b-map.mjs）
; 调用者：EFFECT_DISPATCH（地址表）
EFFECT_COLS_FROM_CENTER:
    LDA MAP_RECT_X
    STA MAP_WORK_0
    LSR MAP_RECT_WIDTH
    LDA EFFECT_RIGHT
    SEC
    SBC MAP_RECT_WIDTH
    STA MAP_WORK_1
    SBC #$01
    STA MAP_RECT_WIDTH
@loop:
    LDA MAP_RECT_WIDTH
    CMP #$FF
    BEQ @left_done
    CMP MAP_WORK_0
    BCS @draw_left
@left_done:
    LDA MAP_WORK_1
    CMP EFFECT_RIGHT
    BCS @finish
    BCC @draw_right
@draw_left:
    STA MAP_RECT_X
    LDA #$40
    STA SYS_ARG_0F
    LDA MAP_RECT_HEIGHT
    STA SYS_ARG_0C
    JSR MAP_FLUSH_AND_JUMP
    DEC MAP_RECT_WIDTH
@draw_right:
    LDA MAP_WORK_1
    CMP EFFECT_RIGHT
    BCS @loop
    STA MAP_RECT_X
    LDA #$40
    STA SYS_ARG_0F
    LDA MAP_RECT_HEIGHT
    STA SYS_ARG_0C
    JSR MAP_FLUSH_AND_JUMP
    INC MAP_WORK_1
    LDX EFFECT_DELAY
    BEQ @use_counter
    DEC SYS_ARG_0E
    BNE @next_pair
    LDX EFFECT_DELAY
    STX SYS_ARG_0E
    LDX #$01
    BNE @refresh_wait
@use_counter:
    LDX SYS_ARG_0E
@refresh_wait:
    LDA EFFECT_SUBFUNCTION
    SEC
    SBC #$04
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JSR WAIT_FRAMES_X
@next_pair:
    JMP @loop
@finish:
    LDA EFFECT_SUBFUNCTION
    SEC
    SBC #$04
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：屏幕效果 8：从左右两边向中线逐列写（两边各一列交替），列间按速度刷新并等待（用例 p0b-map.mjs）
; 调用者：EFFECT_DISPATCH（地址表）
EFFECT_COLS_TO_CENTER:
    LSR MAP_RECT_WIDTH
    LDA MAP_RECT_X
    CLC
    ADC MAP_RECT_WIDTH
    STA MAP_RECT_WIDTH
@loop:
    LDA MAP_RECT_X
    CMP MAP_RECT_WIDTH
    BCS @left_skipped
    LDA #$40
    STA SYS_ARG_0F
    LDA MAP_RECT_HEIGHT
    STA SYS_ARG_0C
    JSR MAP_FLUSH_AND_JUMP
@left_skipped:
    INC MAP_RECT_X
    LDA MAP_RECT_X
    PHA
    DEC EFFECT_RIGHT
    LDA EFFECT_RIGHT
    CMP MAP_RECT_WIDTH
    BCS @draw_right
    PLA
    JMP @finish
@draw_right:
    STA MAP_RECT_X
    LDA #$40
    STA SYS_ARG_0F
    LDA MAP_RECT_HEIGHT
    STA SYS_ARG_0C
    JSR MAP_FLUSH_AND_JUMP
    PLA
    STA MAP_RECT_X
    LDX EFFECT_DELAY
    BEQ @use_counter
    DEC SYS_ARG_0E
    BNE @next_pair
    LDX EFFECT_DELAY
    STX SYS_ARG_0E
    LDX #$01
    BNE @refresh_wait
@use_counter:
    LDX SYS_ARG_0E
@refresh_wait:
    LDA EFFECT_SUBFUNCTION
    SEC
    SBC #$04
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JSR WAIT_FRAMES_X
@next_pair:
    JMP @loop
@finish:
    LDA EFFECT_SUBFUNCTION
    SEC
    SBC #$04
    STA SYS_SUBFUNCTION
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    RTS
; 作用：按 SYS_ARG_0E 调整 EFFECT_DELAY；SYS_ARG_0F 不小于 9 时清 0；把 MAP_RECT_X 起的宽 MAP_RECT_WIDTH 与 MAP_RECT_Y 起的高 MAP_RECT_HEIGHT 限制在 32 个单元内，并记 EFFECT_RIGHT/EFFECT_BOTTOM 为右下界
; 调用者：EFFECT_DISPATCH
MAP_CLIP_PARAMS:
    LDA SYS_ARG_0E
    CMP #$05
    BCC @invert_speed
    SBC #$05
    STA SYS_ARG_0E
    LDA #$00
    BEQ @store_delay
@invert_speed:
    LDA #$07
    SBC SYS_ARG_0E
    STA SYS_ARG_0E
@store_delay:
    STA EFFECT_DELAY
    LDA SYS_ARG_0F
    CMP #$09
    BCC @effect_ok
    LDA #$00
    STA SYS_ARG_0F
@effect_ok:
    LDA MAP_RECT_X
    CMP #$20
    BCS @invalid
    ADC MAP_RECT_WIDTH
    LDX #$20
    JSR MIN_A_X
    STA EFFECT_RIGHT
    SEC
    SBC MAP_RECT_X
    BEQ @invalid
    STA MAP_RECT_WIDTH
    LDA MAP_RECT_Y
    CMP #$20
    BCS @invalid
    ADC MAP_RECT_HEIGHT
    LDX #$20
    JSR MIN_A_X
    STA EFFECT_BOTTOM
    SEC
    SBC MAP_RECT_Y
    BEQ @invalid
    STA MAP_RECT_HEIGHT
    LDA SYS_SUBFUNCTION
    CLC
    ADC #$04
    STA EFFECT_SUBFUNCTION
    RTS
@invalid:
    LDA #$FF
    STA SYS_STATUS
    PLA
    PLA
    RTS
; 作用：A 与 X 取较小者（A 不小于 X 时返回 X）
; 调用者：MAP_CLIP_PARAMS
MIN_A_X:
    STX MAP_WORK_0
    CMP MAP_WORK_0
    BCC @return
    TXA
@return:
    RTS
; 作用：功能 $61（解压到内存）：$0C/$0D 指向 16 字节字典加指令流（格式同 $5B），解到目的地址 $12/$13、页组 $0643，每条指令后目的指针高字节不小于 $B0 时页号加 1；返回时 $064F/$0650 是解出的字节数（用例 p0b-unpack.mjs）；页组 $0B 入口
; 调用者：tile-unpack.asm 开头的入口代码（地址表）
API_61:
    LDX #$00
    LDA #$10
    STA SYS_ARG_0C
    JSR VEC_FAR_COPY_IN
    LDA PROG_ENTRY_LO
    CLC
    ADC #$10
    STA PROG_ENTRY_LO
    BCC @no_carry
    INC PROG_ENTRY_HI
@no_carry:
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$01
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA FAR_OFFSET_HI
    ORA #$90
    STA FAR_OFFSET_HI
    LDA SYS_PAGE
    PHA
    LDA FAR_OFFSET_LO
    PHA
    LDA FAR_OFFSET_HI
    PHA
    LDA SYS_ARG_00
    STA SYS_GROUP
    LDA DST_ADDR_HI
    STA PROG_ENTRY_HI
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA SYS_PAGE
    STA SYS_ARG_00
    STA MAP_OUT_PAGE
    LDA #$02
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    INC SYS_PAGE
    INC SYS_ARG_10
    JSR VEC_SYSCALL
    LDA FAR_OFFSET_HI
    ORA #$A0
    STA DST_ADDR_HI
    LDA DST_ADDR_LO
    STA MAP_OUT_ADDR_LO
    LDA FAR_OFFSET_HI
    STA MAP_OUT_ADDR_HI
    PLA
    STA FAR_OFFSET_HI
    PLA
    STA FAR_OFFSET_LO
    PLA
    STA SYS_PAGE
@loop:
    LDY #$00
    LDA (FAR_OFFSET_LO),Y
    BNE @decode_command
    JMP @end_of_stream
@decode_command:
    TAY
    AND #$0F
    TAX
    TYA
    AND #$F0
    CMP #$D0
    BCC @dict_fill
    BEQ @literal_copy
    CMP #$F0
    BEQ @ramp
    JMP @run_fill
@dict_fill:
    LSR A
    LSR A
    LSR A
    LSR A
    PHA
    TAY
    DEY
@dict_fill_loop:
    LDA COPY_BUFFER,X
    STA (DST_ADDR_LO),Y
    DEY
    BPL @dict_fill_loop
    PLA
    CLC
    ADC DST_ADDR_LO
    STA DST_ADDR_LO
    BCC @dict_no_carry
    INC DST_ADDR_HI
@dict_no_carry:
    LDA DST_ADDR_HI
    CMP #$B0
    BCC @dict_next
    JSR MAP_NEXT_PAGE_P0B
@dict_next:
    INC FAR_OFFSET_LO
    BNE @loop
    INC FAR_OFFSET_HI
    LDA FAR_OFFSET_HI
    CMP #$A0
    BCC @loop
    JSR TILE_MAP_NEXT_PAGE
    JMP @loop
@literal_copy:
    INC FAR_OFFSET_LO
    BNE @literal_loop
    INC FAR_OFFSET_HI
    LDA FAR_OFFSET_HI
    CMP #$A0
    BCC @literal_loop
    JSR TILE_MAP_NEXT_PAGE
@literal_loop:
    LDY #$00
    LDA (FAR_OFFSET_LO),Y
    STA (DST_ADDR_LO),Y
    INC FAR_OFFSET_LO
    BNE @literal_src_ok
    INC FAR_OFFSET_HI
    LDA FAR_OFFSET_HI
    CMP #$A0
    BCC @literal_src_ok
    JSR TILE_MAP_NEXT_PAGE
@literal_src_ok:
    INC DST_ADDR_LO
    BNE @literal_dst_ok
    INC DST_ADDR_HI
@literal_dst_ok:
    DEX
    BNE @literal_loop
    LDA DST_ADDR_HI
    CMP #$B0
    BCC @literal_done
    JSR MAP_NEXT_PAGE_P0B
@literal_done:
    JMP @loop
@ramp:
    INC FAR_OFFSET_LO
    BNE @ramp_start
    INC FAR_OFFSET_HI
    LDA FAR_OFFSET_HI
    CMP #$A0
    BCC @ramp_start
    JSR TILE_MAP_NEXT_PAGE
@ramp_start:
    LDY #$00
    LDA (FAR_OFFSET_LO),Y
    CLC
@ramp_loop:
    STA (DST_ADDR_LO),Y
    ADC #$01
    INY
    DEX
    BNE @ramp_loop
@advance_dst:
    TYA
    CLC
    ADC DST_ADDR_LO
    STA DST_ADDR_LO
    BCC @dst_no_carry
    INC DST_ADDR_HI
@dst_no_carry:
    LDA DST_ADDR_HI
    CMP #$B0
    BCC @dst_checked
    JSR MAP_NEXT_PAGE_P0B
@dst_checked:
    INC FAR_OFFSET_LO
    BNE @next_command
    INC FAR_OFFSET_HI
    LDA FAR_OFFSET_HI
    CMP #$A0
    BCC @next_command
    JSR TILE_MAP_NEXT_PAGE
@next_command:
    JMP @loop
@run_fill:
    INC FAR_OFFSET_LO
    BNE @run_byte
    INC FAR_OFFSET_HI
    LDA FAR_OFFSET_HI
    CMP #$A0
    BCC @run_byte
    JSR TILE_MAP_NEXT_PAGE
@run_byte:
    LDY #$00
    LDA (FAR_OFFSET_LO),Y
@run_loop:
    STA (DST_ADDR_LO),Y
    INY
    DEX
    BNE @run_loop
    BEQ @advance_dst
@end_of_stream:
    LDA DST_ADDR_LO
    STA SYS_ARG_0C
    LDA DST_ADDR_HI
    SEC
    SBC #$A0
    STA SYS_ARG_0D
    LDA SYS_ARG_00
    SBC MAP_OUT_PAGE
    ASL A
    ASL A
    ASL A
    ASL A
    ADC SYS_ARG_0D
    STA SYS_ARG_0D
    LDA SYS_ARG_0C
    SEC
    SBC MAP_OUT_ADDR_LO
    STA SYS_ARG_0C
    LDA SYS_ARG_0D
    SBC MAP_OUT_ADDR_HI
    STA SYS_ARG_0D
    RTS
; 作用：保存 SYS_PAGE，把 $0643 加 1 作为新页号，用 $29 映射该页及下一页到窗口 2、3，DST_ADDR_HI 置 $A0，再恢复 SYS_PAGE；调用 3 次
; 调用者：API_61
MAP_NEXT_PAGE_P0B:
    LDA SYS_PAGE
    PHA
    INC SYS_ARG_00
    LDA SYS_ARG_00
    STA SYS_PAGE
    LDA #$02
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    INC SYS_PAGE
    INC SYS_ARG_10
    JSR VEC_SYSCALL
    LDA #$A0
    STA DST_ADDR_HI
    PLA
    STA SYS_PAGE
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
    .byte $00,$00,$00,$00,$00,$00,$00
