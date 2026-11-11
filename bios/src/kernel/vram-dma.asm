; 作用：系统功能 $30：按子功能分发：0-3 名称表 DMA（API30_SUB_NAMETABLE_DMA），4-7 取屏幕缓冲单元的远地址（CELL_FAR_ADDR），8 写单元（API30_SUB_STORE_CELLS），9 读单元（API30_SUB_LOAD_CELLS），10 清名称表（API30_SUB_CLEAR_NAMETABLES）。
; 输入：SYS_SUBFUNCTION。
; 调用者：SYSCALL_TABLE（地址表）
API_30_DMA_TO_VRAM:
    LDA SYS_SUBFUNCTION
    JSR INLINE_JUMP_TABLE
    .word API30_SUB_NAMETABLE_DMA,API30_SUB_NAMETABLE_DMA,API30_SUB_NAMETABLE_DMA,API30_SUB_NAMETABLE_DMA,CELL_FAR_ADDR,CELL_FAR_ADDR,CELL_FAR_ADDR,CELL_FAR_ADDR
    .word API30_SUB_STORE_CELLS,API30_SUB_LOAD_CELLS,API30_SUB_CLEAR_NAMETABLES
; 作用：功能 $30 的名称表子功能：把页 $1F 里一张名称表（2KB）经 DMA 写到显存名称表，等 1 帧
; 调用者：API_30_DMA_TO_VRAM（地址表）
API30_SUB_NAMETABLE_DMA:
    LDA #$1F
    STA DMA_SRC_HIGH
    LDY SYS_SUBFUNCTION
    LDA NAMETABLE_BUFFER_HIGH,Y
    STA DMA_SRC_MID
    LDA #$00
    STA DMA_SRC_LOW
    LDA SYS_SUBFUNCTION
    JSR PATTERN_BASE_OFFSET
    STA DMA_DST_HI
    LDA #$00
    STA DMA_DST_LO
    LDA #$FF
    STA DMA_LEN_LO
    LDA #$07
    STA DMA_LEN_HI
    LDA #$C0
    STA DMA_CTRL
    JSR WAIT_ONE_FRAME
    RTS
; 作用：屏幕缓冲里 4 张名称表的起始高字节：$A0、$A8、$B0、$B8（每张 $800 字节）
; 引用者：API30_SUB_NAMETABLE_DMA、CELL_FAR_ADDR
NAMETABLE_BUFFER_HIGH:
    .byte $A0,$A8,$B0,$B8
; 作用：按 SYS_ARG_05 列、SYS_ARG_06 行算出屏幕缓冲里该单元的远地址（SYS_ARG_06×64＋SYS_ARG_05×2＋名称表基址，页 $1F 起，名称表按子功能 4-7 选），结果在 SYS_PAGE 与 FAR_OFFSET。
; 输入：SYS_ARG_05、SYS_ARG_06、SYS_SUBFUNCTION。
; 输出：SYS_PAGE、FAR_OFFSET_LO/HI。
; 调用者：API_30_DMA_TO_VRAM（地址表）、SCREEN_FILL_NAMETABLE
CELL_FAR_ADDR:
    LDA SYS_ARG_06
    STA FAR_OFFSET_LO
    LDA #$00
    STA FAR_OFFSET_HI
    LDX #$06
@loop:
    ASL FAR_OFFSET_LO
    ROL FAR_OFFSET_HI
    DEX
    BNE @loop
    LDA SYS_SUBFUNCTION
    SEC
    SBC #$04
    TAY
    LDA SYS_ARG_05
    ASL A
    ADC FAR_OFFSET_LO
    STA FAR_OFFSET_LO
    LDA FAR_OFFSET_HI
    ADC NAMETABLE_BUFFER_HIGH,Y
    STA FAR_OFFSET_HI
    LDA #$1F
    STA SYS_PAGE
    JSR FAR_ADDR_FROM_WINDOW
    RTS
; 作用：功能 $30“写单元”子功能：把 PROG_ENTRY 指向的数据按 2 字节一个单元写进屏幕缓冲（FAR_OFFSET 处），每写一个 FAR_OFFSET 加 SYS_ARG_0F，共 SYS_ARG_0C/0D 个单元。
; 输入：PROG_ENTRY、SYS_GROUP、SYS_PAGE、FAR_OFFSET、SYS_ARG_0C/0D、SYS_ARG_0F。
; 调用者：API_30_DMA_TO_VRAM（地址表）
API30_SUB_STORE_CELLS:
    LDA SYS_PAGE
    STA WINDOW_SAVE_3
    STA WIN_PAGE_3
    LDA FAR_OFFSET_HI
    ORA #$B0
    STA FAR_OFFSET_HI
    LDA SYS_GROUP
    CMP #$07
    BEQ @loop
    STA WINDOW_SAVE_2
    STA WIN_PAGE_2
    LDA PROG_ENTRY_HI
    ORA #$A0
    STA PROG_ENTRY_HI
@loop:
    LDA SYS_ARG_0C
    ORA SYS_ARG_0D
    BEQ @return
    DEC SYS_ARG_0C
    LDA SYS_ARG_0C
    CMP #$FF
    BNE @cell_start
    DEC SYS_ARG_0D
@cell_start:
    LDY #$00
    LDA (PROG_ENTRY_LO),Y
    STA (FAR_OFFSET_LO),Y
    LDY #$01
    LDA (PROG_ENTRY_LO),Y
    STA (FAR_OFFSET_LO),Y
    INC PROG_ENTRY_LO
    BNE @source_second
    INC PROG_ENTRY_HI
@source_second:
    INC PROG_ENTRY_LO
    BNE @advance_far
    INC PROG_ENTRY_HI
@advance_far:
    LDA FAR_OFFSET_LO
    CLC
    ADC SYS_ARG_0F
    STA FAR_OFFSET_LO
    BCC @next_cell
    INC FAR_OFFSET_HI
@next_cell:
    JMP @loop
@return:
    RTS
; 作用：功能 $30“读单元”子功能：把屏幕缓冲（FAR_OFFSET 处）的单元按 2 字节一个读到 DST_ADDR 指向的内存，每读一个 FAR_OFFSET 加 SYS_ARG_0F，共 SYS_ARG_0C/0D 个单元。
; 输入：DST_ADDR、SYS_ARG_00（页组）、SYS_PAGE、FAR_OFFSET、SYS_ARG_0C/0D、SYS_ARG_0F。
; 调用者：API_30_DMA_TO_VRAM（地址表）
API30_SUB_LOAD_CELLS:
    LDA SYS_PAGE
    STA WINDOW_SAVE_3
    STA WIN_PAGE_3
    LDA FAR_OFFSET_HI
    ORA #$B0
    STA FAR_OFFSET_HI
    LDA SYS_ARG_00
    CMP #$07
    BEQ @loop
    STA WINDOW_SAVE_2
    STA WIN_PAGE_2
    LDA DST_ADDR_HI
    ORA #$A0
    STA DST_ADDR_HI
@loop:
    LDA SYS_ARG_0C
    ORA SYS_ARG_0D
    BEQ @return
    DEC SYS_ARG_0C
    LDA SYS_ARG_0C
    CMP #$FF
    BNE @cell_start
    DEC SYS_ARG_0D
@cell_start:
    LDY #$00
    LDA (FAR_OFFSET_LO),Y
    STA (DST_ADDR_LO),Y
    LDY #$01
    LDA (FAR_OFFSET_LO),Y
    STA (DST_ADDR_LO),Y
    INC DST_ADDR_LO
    BNE @dest_second
    INC DST_ADDR_HI
@dest_second:
    INC DST_ADDR_LO
    BNE @advance_far
    INC DST_ADDR_HI
@advance_far:
    LDA FAR_OFFSET_LO
    CLC
    ADC SYS_ARG_0F
    STA FAR_OFFSET_LO
    BCC @next_cell
    INC FAR_OFFSET_HI
@next_cell:
    JMP @loop
@return:
    RTS
; 作用：功能 $30 的清屏子功能：SYS_ARG_0F 的位 0-3 分别决定是否用 SYS_ARG_09/SYS_ARG_0A 填满名称表 4-7。
; 输入：SYS_ARG_0F、SYS_ARG_09/0A。
; 调用者：API_30_DMA_TO_VRAM（地址表）
API30_SUB_CLEAR_NAMETABLES:
    LDA SYS_ARG_0F
    AND #$01
    BEQ @check_table5
    LDA #$04
    JSR SCREEN_FILL_NAMETABLE
@check_table5:
    LDA SYS_ARG_0F
    AND #$02
    BEQ @check_table6
    LDA #$05
    JSR SCREEN_FILL_NAMETABLE
@check_table6:
    LDA SYS_ARG_0F
    AND #$04
    BEQ @check_table7
    LDA #$06
    JSR SCREEN_FILL_NAMETABLE
@check_table7:
    LDA SYS_ARG_0F
    AND #$08
    BEQ @return
    LDA #$07
    JSR SCREEN_FILL_NAMETABLE
@return:
    RTS
; 作用：把屏幕缓冲里一张名称表（2KB）的所有单元填成 $064C/$064D 的值；子功能决定第几张，清屏时四张各调一次
; 输入：A=名称表序号 4-7。
; 调用者：API30_SUB_CLEAR_NAMETABLES
SCREEN_FILL_NAMETABLE:
    STA SYS_SUBFUNCTION
    LDA #$00
    STA SYS_ARG_05
    STA SYS_ARG_06
    JSR CELL_FAR_ADDR
    LDA SYS_PAGE
    STA WINDOW_SAVE_3
    STA WIN_PAGE_3
    LDA FAR_OFFSET_HI
    ORA #$B0
    STA FAR_OFFSET_HI
    LDX #$08
    LDY #$00
@loop:
    LDA SYS_ARG_09
    STA (FAR_OFFSET_LO),Y
    INY
    LDA SYS_ARG_0A
    STA (FAR_OFFSET_LO),Y
    INY
    BNE @loop
    INC FAR_OFFSET_HI
    DEX
    BNE @loop
    RTS
; 作用：A 乘 8，再加 $00 或 $20（由 $062E 位 0 选），用于求图块基址
; 调用者：API30_SUB_NAMETABLE_DMA
PATTERN_BASE_OFFSET:
    STA VRAM_TEMP
    LDA PPU_EXT_CTRL_SHADOW
    AND #$01
    TAY
    LDA VRAM_TEMP
    ASL A
    ASL A
    ASL A
    ADC PATTERN_BASE_HIGH,Y
    RTS
; 作用：按 $062E 位 0 选的基址增量：$00 或 $20
; 引用者：PATTERN_BASE_OFFSET
PATTERN_BASE_HIGH:
    .byte $00
    .byte $20
; 作用：把窗口地址（SYS_PAGE 加 FAR_OFFSET_HI 高 4 位）折成页号与页内偏移，FAR_OFFSET_HI 只留低 4 位
; 调用者：CELL_FAR_ADDR、VRAM_FILL_VIA_DMA
FAR_ADDR_FROM_WINDOW:
    ASL SYS_PAGE
    ASL SYS_PAGE
    ASL SYS_PAGE
    LDA FAR_OFFSET_HI
    AND #$F0
    LSR A
    LSR A
    LSR A
    LSR A
    SBC #$07
    CLC
    ADC SYS_PAGE
    STA SYS_PAGE
    LDA FAR_OFFSET_HI
    AND #$0F
    STA FAR_OFFSET_HI
    RTS
; 作用：系统功能 $31：清除显存区域：SYS_SUBFUNCTION 的位 0-6 各选 API31_FILL_TABLE 的一项（显存目的地址与长度），用 SYS_ARG_09 填充并经 DMA 写入（VRAM_FILL_VIA_DMA）；位 7 置位时把调色板区 PPU_EXT_PALETTE 的 64 字节填成 SYS_ARG_09（显示打开时借 NMI 调色板上传，等 1 帧）。
; 输入：SYS_SUBFUNCTION、SYS_ARG_09。
; 调用者：SYSCALL_TABLE（地址表）
API_31:
    LDX #$01
    STX VRAM_TEMP
    LDX #$00
    STX FAR_ACCESS_TEMP
@loop:
    LDA SYS_SUBFUNCTION
    AND VRAM_TEMP
    BEQ @next_bit
    TXA
    PHA
    ASL A
    ASL A
    TAY
    LDA API31_FILL_TABLE,Y
    STA SYS_ARG_04
    LDA API31_FILL_TABLE+1,Y
    STA SYS_ARG_03
    LDA API31_FILL_TABLE+2,Y
    STA SYS_ARG_0C
    LDA API31_FILL_TABLE+3,Y
    STA SYS_ARG_0D
    JSR VRAM_FILL_VIA_DMA
    PLA
    TAX
@next_bit:
    ASL VRAM_TEMP
    INX
    CPX #$07
    BNE @loop
    LDA SYS_SUBFUNCTION
    AND #$80
    BEQ @return
    LDA PPU_MASK_SHADOW
    AND #$18
    BEQ @write_palette
    LDA PPU_CTRL_SHADOW
    AND #$80
    BEQ @wait_vblank
    LDX #$00
    LDA SYS_ARG_09
@copy_palette:
    STA COPY_BUFFER,X
    INX
    CPX #$40
    BNE @copy_palette
    STX PALETTE_UPLOAD_COUNT
    LDA #$00
    STA PALETTE_UPLOAD_OFFSET
    LDA #<COPY_BUFFER
    STA PALETTE_PTR_LO
    LDA #>COPY_BUFFER
    STA PALETTE_PTR_HI
    LDA #$86
    STA SYS_SUBFUNCTION
    JSR API_12_PPU_CONTROL
    JSR WAIT_ONE_FRAME
    LDA #$06
    STA SYS_SUBFUNCTION
    JSR API_12_PPU_CONTROL
    JMP @return
@wait_vblank:
    LDA PPU_STATUS
    BPL @wait_vblank
@write_palette:
    LDX #$00
    LDA SYS_ARG_09
@palette_loop:
    STA PPU_EXT_PALETTE,X
    INX
    CPX #$40
    BCC @palette_loop
@return:
    RTS
; 作用：功能 $31 的清除区域表：共 7 项，每项 4 字节（显存目的地址低、高，长度低、高），子功能的位 0-6 各选一项
; 引用者：API_31
API31_FILL_TABLE:
    .byte $00,$00,$00,$08
    .byte $00,$08,$00,$08
    .byte $00,$10,$00,$08
    .byte $00,$18,$00,$08
    .byte $00,$20,$00,$08
    .byte $00,$28,$00,$58
    .byte $00,$80,$00,$80
; 作用：系统功能 $32：用 SYS_ARG_09 填充显存 SYS_ARG_03/SYS_ARG_04 起 SYS_ARG_0C/0D 字节（长度为 0 不做），经 VRAM_FILL_VIA_DMA 分段完成。
; 输入：SYS_ARG_03/04（显存地址）、SYS_ARG_09、SYS_ARG_0C/0D（长度）。
; 调用者：SYSCALL_TABLE（地址表）
API_32:
    LDA #$00
    STA FAR_ACCESS_TEMP
    LDA SYS_ARG_0D
    ORA SYS_ARG_0C
    BNE VRAM_FILL_VIA_DMA
    JMP DMA_TO_VRAM_RETURN
; 作用：用页 $1F 当中转缓冲：先把 $064C 填满缓冲，再分段 DMA 到显存（每段 $1C00 字节，长度在 $0650/$064F），$038D 记录缓冲是否已填过
; 调用者：API_31、API_32
VRAM_FILL_VIA_DMA:
    LDA #$1F
    STA SYS_PAGE
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$80
    STA FAR_OFFSET_HI
    JSR FAR_ADDR_FROM_WINDOW
    LDA SYS_PAGE
    STA WINDOW_SAVE_2
    STA WIN_PAGE_2
    CLC
    ADC #$01
    STA WINDOW_SAVE_3
    STA WIN_PAGE_3
    LDA FAR_OFFSET_HI
    ORA #$A0
    STA FAR_OFFSET_HI
    LDA SYS_ARG_0D
    CMP #$1C
    BCC @partial_fill
    LDA FAR_ACCESS_TEMP
    BMI @dma_chunk
    LDA #$FF
    STA FAR_ACCESS_TEMP
    LDY #$00
    LDA SYS_ARG_09
@loop:
    STA (FAR_OFFSET_LO),Y
    INC FAR_OFFSET_LO
    BNE @loop
    INC FAR_OFFSET_HI
    LDX FAR_OFFSET_HI
    CPX #$BC
    BNE @loop
@dma_chunk:
    LDA #$FF
    STA DMA_LEN_LO
    LDA #$1B
    STA DMA_LEN_HI
    JSR DMA_CHUNK_TO_VRAM
    LDA SYS_ARG_0D
    SEC
    SBC #$1C
    STA SYS_ARG_0D
    CMP #$1C
    BCC @check_rest
    LDA SYS_ARG_03
    ADC #$1B
    STA SYS_ARG_03
    JMP @dma_chunk
@check_rest:
    LDA SYS_ARG_0D
    ORA SYS_ARG_0C
    BEQ DMA_TO_VRAM_RETURN
@partial_fill:
    LDA FAR_ACCESS_TEMP
    BNE @set_length
    LDY #$0F
    STY FAR_ACCESS_TEMP
    LDY #$00
    LDX #$00
    LDA SYS_ARG_09
@fill_partial:
    STA (FAR_OFFSET_LO),Y
    INC FAR_OFFSET_LO
    BNE @fill_partial
    INC FAR_OFFSET_HI
    INX
    CPX SYS_ARG_0D
    BCC @fill_partial
    BEQ @fill_partial
@set_length:
    DEC SYS_ARG_0C
    LDA SYS_ARG_0C
    CMP #$FF
    BNE @store_length
    DEC SYS_ARG_0D
@store_length:
    LDA SYS_ARG_0D
    STA DMA_LEN_HI
    LDA SYS_ARG_0C
    STA DMA_LEN_LO
; 作用：把页 $1F 的 $8000 起 $1C00 字节经 DMA 写到显存 $0646/$0647 指定的位置，再等 1 帧
; 调用者：VRAM_FILL_VIA_DMA
DMA_CHUNK_TO_VRAM:
    LDA #$1F
    STA DMA_SRC_HIGH
    LDA #$00
    STA DMA_SRC_LOW
    LDA #$80
    STA DMA_SRC_MID
    LDA SYS_ARG_03
    STA DMA_DST_HI
    LDA SYS_ARG_04
    STA DMA_DST_LO
    LDA #$C0
    STA DMA_CTRL
    LDX #$01
    JSR API_1B_WAIT_FRAMES
; 作用：功能 $32、$33 与 VRAM_FILL_VIA_DMA 共用的返回（RTS）
; 调用者：API_32、VRAM_FILL_VIA_DMA、DMA_CHUNK_TO_VRAM（顺序执行到这里）
DMA_TO_VRAM_RETURN:
    RTS
; 作用：系统功能 $33：把扩展 RAM 里页 SYS_PAGE 的 FAR_OFFSET 处起 SYS_ARG_0C/0D 字节经 DMA 写到显存 SYS_ARG_03/SYS_ARG_04 处，等若干帧（显示打开时按 $1C00 字节一帧计）。
; 输入：SYS_PAGE、FAR_OFFSET、SYS_ARG_03/04（显存地址）、SYS_ARG_0C/0D（长度）。
; 调用者：SYSCALL_TABLE（地址表）
API_33:
    LDA SYS_ARG_0D
    ORA SYS_ARG_0C
    BEQ @return
    JSR API_28
    LDX #$01
    LDA PPU_MASK_SHADOW
    AND #$18
    BEQ @set_length
    LDA SYS_ARG_0D
@loop:
    CMP #$1C
    BCC @set_length
    SBC #$1C
    INX
    JMP @loop
@set_length:
    DEC SYS_ARG_0C
    LDA SYS_ARG_0C
    CMP #$FF
    BNE @store_length
    DEC SYS_ARG_0D
@store_length:
    LDA SYS_ARG_0D
    STA DMA_LEN_HI
    LDA SYS_ARG_0C
    STA DMA_LEN_LO
    LDA SYS_PAGE
    STA DMA_SRC_HIGH
    LDA FAR_OFFSET_LO
    STA DMA_SRC_LOW
    LDA FAR_OFFSET_HI
    STA DMA_SRC_MID
    LDA SYS_ARG_03
    STA DMA_DST_HI
    LDA SYS_ARG_04
    STA DMA_DST_LO
    LDA #$C0
    STA DMA_CTRL
    JSR API_1B_WAIT_FRAMES
@return:
    RTS
; 作用：系统功能 $34：把扩展 RAM 里页 SYS_PAGE 的 FAR_OFFSET 处起 SYS_ARG_0C/0D 字节经 DMA 复制到 DST_ADDR 指向的位置（DMA 控制 $A0），等 1 帧。
; 输入：SYS_PAGE、FAR_OFFSET、DST_ADDR、SYS_ARG_0C/0D（长度）。
; 调用者：SYSCALL_TABLE（地址表）
API_34:
    LDA SYS_ARG_0D
    ORA SYS_ARG_0C
    BEQ @return
    JSR API_28
    DEC SYS_ARG_0C
    LDA SYS_ARG_0C
    CMP #$FF
    BNE @store_length
    DEC SYS_ARG_0D
@store_length:
    LDA SYS_ARG_0D
    STA DMA_LEN_HI
    LDA SYS_ARG_0C
    STA DMA_LEN_LO
    LDA SYS_PAGE
    STA DMA_SRC_HIGH
    LDA FAR_OFFSET_LO
    STA DMA_SRC_LOW
    LDA FAR_OFFSET_HI
    STA DMA_SRC_MID
    LDA DST_ADDR_HI
    STA DMA_DST_HI
    LDA DST_ADDR_LO
    STA DMA_DST_LO
    LDA #$A0
    STA DMA_CTRL
    LDX #$01
    JSR API_1B_WAIT_FRAMES
@return:
    RTS
; 作用：声音服务 $65：按子功能号 $063F（0-13）跳到 SOUND_SUB_TABLE 里的例程
; 调用者：SYSCALL_TABLE（地址表）
API_65_SOUND_SERVICE:
    LDA GLYPH_ADDR_LO
    PHA
    LDA GLYPH_ADDR_HI
    PHA
    LDA SYS_SUBFUNCTION
    ASL A
    TAX
    LDA SOUND_SUB_TABLE,X
    STA GLYPH_ADDR_LO
    LDA SOUND_SUB_TABLE+1,X
    STA GLYPH_ADDR_HI
    JSR SOUND_JUMP_SUB
    PLA
    STA GLYPH_ADDR_HI
    PLA
    STA GLYPH_ADDR_LO
    RTS
