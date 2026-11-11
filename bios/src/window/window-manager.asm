; 作用：窗口管理（功能 $59）。窗口表在扩展 RAM 页 $FC：30 项×3 字节（窗口号、保存数据指针），$FF 为空闲项；表后是保存区的空闲指针与窗口号占用位图。子功能 6 初始化窗口表；子功能 0-3 新建窗口，把该矩形的屏幕内容逐行存进页 $FC；子功能 4 把存下的内容写回屏幕并释放该窗口号；子功能 5 紧缩保存区（代码阅读）。
; 输入：SYS_SUBFUNCTION=子功能；新建时 SYS_ARG_03/SYS_ARG_04=左上角列（0-31）、行（0-29），SYS_ARG_05/SYS_ARG_06=右下角列、行（坐标不是宽高，且不小于左上角）；子功能 4 时 SYS_ARG_0F=窗口号。
; 输出：新建成功时 SYS_ARG_0F=窗口号（从 1 起）；坐标超界为 $FD，无空闲窗口号为 $FE，保存区不够为 $FF。
; 调用者：全 ROM 没有指令或地址表引用它（只能由外部直接进入）
API_59:
    LDA SYS_SUBFUNCTION
    CMP #$04
    BCC @create
    BNE @check_sub5
    JMP @free_window
@check_sub5:
    CMP #$05
    BNE @check_sub6
    JMP @compact
@check_sub6:
    CMP #$06
    BNE @unknown_sub
    JMP @init_table
@unknown_sub:
    JMP @return
@create:
    LDA SYS_ARG_03
    CMP #$00
    BCC @bad_coordinates
    LDA SYS_ARG_03
    CMP #$20
    BCS @bad_coordinates
    LDA SYS_ARG_04
    CMP #$00
    BCC @bad_coordinates
    LDA SYS_ARG_04
    CMP #$1E
    BCS @bad_coordinates
    LDA SYS_ARG_05
    CMP #$20
    BCS @bad_coordinates
    LDA SYS_ARG_06
    CMP #$1E
    BCS @bad_coordinates
    JMP @find_free_number
@bad_coordinates:
    LDA #$FD
    STA SYS_ARG_0F
    JMP @return
@find_free_number:
    LDA #$FC
    STA SYS_PAGE
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$00
    STA FAR_OFFSET_HI
    LDX #$01
    LDY #$5C
    JSR VEC_FAR_READ_BYTE
@scan_bitmap:
    CPX #$09
    BEQ @next_bitmap_byte
    CPX #$11
    BEQ @next_bitmap_byte
    CPX #$19
    BEQ @next_bitmap_byte
    CPX #$1F
    BEQ @no_free_number
    JMP @test_bit
@next_bitmap_byte:
    INY
    JSR VEC_FAR_READ_BYTE
@test_bit:
    STA WIN_TEMP
    BIT WIN_TEMP
    BPL @number_found
    INX
    ASL A
    JMP @scan_bitmap
@no_free_number:
    LDA #$FE
    STA SYS_ARG_0F
    JMP @return
@number_found:
    STX SYS_ARG_0F
    LDA SYS_SUBFUNCTION
    PHA
    CLC
    ADC #$04
    STA SYS_SUBFUNCTION
    LDA SYS_ARG_05
    PHA
    LDA SYS_ARG_06
    PHA
    LDA SYS_ARG_03
    STA SYS_ARG_05
    LDA SYS_ARG_04
    STA SYS_ARG_06
    LDA #$30
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    PLA
    STA SYS_ARG_06
    PLA
    STA SYS_ARG_05
    PLA
    STA SYS_SUBFUNCTION
    LDA SYS_PAGE
    STA WIN_TEMP
    LDA FAR_OFFSET_LO
    STA WIN_PTR_LO
    LDA FAR_OFFSET_HI
    STA WIN_PTR_HI
    LDA WIN_TEMP
    CMP #$FA
    BEQ @buffer_page_fa
    LDA #$FA
    STA WIN_TEMP
    LDA WIN_PTR_HI
    ORA #$90
    STA WIN_PTR_HI
    JMP @read_free_pointer
@buffer_page_fa:
    LDA WIN_PTR_HI
    ORA #$80
    STA WIN_PTR_HI
@read_free_pointer:
    LDY #$5A
    LDA #$FC
    STA SYS_PAGE
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$00
    STA FAR_OFFSET_HI
    JSR VEC_FAR_READ_BYTE
    STA WIN_BLOCK_PTR_LO
    LDY #$5B
    JSR VEC_FAR_READ_BYTE
    STA WIN_BLOCK_PTR_HI
    SEC
    LDA SYS_ARG_05
    SBC SYS_ARG_03
    BCS @width_ok
    LDA #$FD
    STA SYS_ARG_0F
    JMP @return
@width_ok:
    STA WIN_ROW_BYTES
    INC WIN_ROW_BYTES
    LDA WIN_ROW_BYTES
    ASL A
    STA WIN_ROW_BYTES
    SEC
    LDA SYS_ARG_06
    SBC SYS_ARG_04
    BCS @height_ok
    LDA #$FD
    STA SYS_ARG_0F
    JMP @return
@height_ok:
    STA WIN_ROW_COUNT
    INC WIN_ROW_COUNT
    LDA #$00
    STA WIN_SIZE_LO
    LDA #$00
    STA WIN_SIZE_HI
    LDA WIN_ROW_BYTES
    CLC
    ADC #$03
    TAX
@size_loop:
    CLC
    LDA WIN_SIZE_LO
    ADC WIN_ROW_COUNT
    STA WIN_SIZE_LO
    LDA WIN_SIZE_HI
    ADC #$00
    STA WIN_SIZE_HI
    DEX
    BEQ @size_done
    JMP @size_loop
@size_done:
    LDA WIN_SIZE_LO
    CLC
    ADC #$03
    STA WIN_SIZE_LO
    LDA WIN_SIZE_HI
    ADC #$00
    STA WIN_SIZE_HI
    LDA WIN_SIZE_LO
    PHA
    LDA WIN_SIZE_HI
    PHA
    CLC
    LDA WIN_SIZE_LO
    ADC WIN_BLOCK_PTR_LO
    STA WIN_SIZE_LO
    LDA WIN_SIZE_HI
    ADC WIN_BLOCK_PTR_HI
    STA WIN_SIZE_HI
    CMP #$BF
    BCS @check_buffer_limit
    JMP @buffer_ok
@check_buffer_limit:
    BEQ @buffer_ok
    PLA
    PLA
    LDA #$FF
    STA SYS_ARG_0F
    JMP @return
@buffer_ok:
    PLA
    STA WIN_SIZE_HI
    PLA
    STA WIN_SIZE_LO
    LDA WIN_BLOCK_PTR_HI
    PHA
    LDA WIN_BLOCK_PTR_LO
    PHA
    LDA #$FC
    STA SYS_GROUP
    LDY #$00
    LDA WIN_BLOCK_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_BLOCK_PTR_HI
    STA PROG_ENTRY_HI
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA WIN_SIZE_LO
    JSR VEC_FAR_WRITE_BYTE
    LDA WIN_BLOCK_PTR_LO
    CLC
    ADC #$01
    STA WIN_BLOCK_PTR_LO
    LDA WIN_BLOCK_PTR_HI
    ADC #$00
    STA WIN_BLOCK_PTR_HI
    LDA WIN_BLOCK_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_BLOCK_PTR_HI
    STA PROG_ENTRY_HI
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA WIN_SIZE_HI
    JSR VEC_FAR_WRITE_BYTE
    LDA WIN_BLOCK_PTR_LO
    CLC
    ADC #$01
    STA WIN_BLOCK_PTR_LO
    LDA WIN_BLOCK_PTR_HI
    ADC #$00
    STA WIN_BLOCK_PTR_HI
@save_row_loop:
    LDA #$FC
    STA SYS_GROUP
    LDY #$00
    LDA WIN_BLOCK_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_BLOCK_PTR_HI
    STA PROG_ENTRY_HI
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA WIN_ROW_BYTES
    JSR VEC_FAR_WRITE_BYTE
    LDA WIN_BLOCK_PTR_LO
    CLC
    ADC #$01
    STA WIN_BLOCK_PTR_LO
    LDA WIN_BLOCK_PTR_HI
    ADC #$00
    STA WIN_BLOCK_PTR_HI
    LDA WIN_BLOCK_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_BLOCK_PTR_HI
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    LDA WIN_PTR_LO
    JSR VEC_FAR_WRITE_BYTE
    LDA WIN_BLOCK_PTR_LO
    CLC
    ADC #$01
    STA WIN_BLOCK_PTR_LO
    LDA WIN_BLOCK_PTR_HI
    ADC #$00
    STA WIN_BLOCK_PTR_HI
    LDA WIN_BLOCK_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_BLOCK_PTR_HI
    STA PROG_ENTRY_HI
    JSR VEC_SYSCALL
    LDA WIN_PTR_HI
    JSR VEC_FAR_WRITE_BYTE
    LDA WIN_BLOCK_PTR_LO
    CLC
    ADC #$01
    STA WIN_BLOCK_PTR_LO
    LDA WIN_BLOCK_PTR_HI
    ADC #$00
    STA WIN_BLOCK_PTR_HI
    LDA WIN_TEMP
    STA SYS_GROUP
    LDA WIN_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_PTR_HI
    STA PROG_ENTRY_HI
    LDA WIN_ROW_BYTES
    STA SYS_ARG_0C
    LDX #$00
    JSR VEC_FAR_COPY_IN
    LDA #$FC
    STA SYS_GROUP
    LDA WIN_BLOCK_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_BLOCK_PTR_HI
    STA PROG_ENTRY_HI
    LDA WIN_ROW_BYTES
    STA SYS_ARG_0C
    LDX #$00
    JSR VEC_FAR_COPY_OUT
    CLC
    LDA WIN_BLOCK_PTR_LO
    ADC WIN_ROW_BYTES
    STA WIN_BLOCK_PTR_LO
    LDA WIN_BLOCK_PTR_HI
    ADC #$00
    STA WIN_BLOCK_PTR_HI
    CLC
    LDA WIN_PTR_LO
    ADC #$40
    STA WIN_PTR_LO
    LDA WIN_PTR_HI
    ADC #$00
    STA WIN_PTR_HI
    DEC WIN_ROW_COUNT
    BEQ @write_end_mark
    JMP @save_row_loop
@write_end_mark:
    LDA #$FC
    STA SYS_GROUP
    LDA WIN_BLOCK_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_BLOCK_PTR_HI
    STA PROG_ENTRY_HI
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDY #$00
    LDA #$00
    JSR VEC_FAR_WRITE_BYTE
    LDA WIN_BLOCK_PTR_LO
    CLC
    ADC #$01
    STA WIN_BLOCK_PTR_LO
    LDA WIN_BLOCK_PTR_HI
    ADC #$00
    STA WIN_BLOCK_PTR_HI
    LDY #$5A
    LDA #$FC
    STA SYS_PAGE
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$00
    STA FAR_OFFSET_HI
    LDA WIN_BLOCK_PTR_LO
    JSR VEC_FAR_WRITE_BYTE
    LDY #$5B
    LDA WIN_BLOCK_PTR_HI
    JSR VEC_FAR_WRITE_BYTE
    LDA #$FC
    STA SYS_PAGE
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$00
    STA FAR_OFFSET_HI
    LDY #$00
@find_free_slot:
    JSR VEC_FAR_READ_BYTE
    CMP #$FF
    BEQ @store_slot
    INY
    INY
    INY
    CPY #$5A
    BNE @find_free_slot
    PLA
    PLA
    JMP @return
@store_slot:
    LDA SYS_ARG_0F
    JSR VEC_FAR_WRITE_BYTE
    PLA
    INY
    JSR VEC_FAR_WRITE_BYTE
    PLA
    INY
    JSR VEC_FAR_WRITE_BYTE
    LDA SYS_ARG_0F
    PHA
    LDY #$5C
@mark_index_loop:
    LDA SYS_ARG_0F
    CMP #$09
    BCC @mark_bit
    SEC
    LDA SYS_ARG_0F
    SBC #$08
    STA SYS_ARG_0F
    INY
    JMP @mark_index_loop
@mark_bit:
    LDA #$FC
    STA SYS_PAGE
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$00
    STA FAR_OFFSET_HI
    JSR VEC_FAR_READ_BYTE
    PHA
    LDA #$80
    LDX SYS_ARG_0F
    CLC
@mark_shift_loop:
    CPX #$01
    BEQ @mark_write
    LSR A
    DEX
    JMP @mark_shift_loop
@mark_write:
    STA WIN_TEMP
    LDA #$FC
    STA SYS_PAGE
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$00
    STA FAR_OFFSET_HI
    PLA
    ORA WIN_TEMP
    JSR VEC_FAR_WRITE_BYTE
    PLA
    STA SYS_ARG_0F
    JMP @return
@free_window:
    LDA SYS_ARG_0F
    CMP #$1F
    BCC @find_entry
    JMP @return
@find_entry:
    LDA #$FC
    STA SYS_PAGE
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$00
    STA FAR_OFFSET_HI
    LDY #$00
    LDX #$1E
@find_entry_loop:
    JSR VEC_FAR_READ_BYTE
    CMP SYS_ARG_0F
    BEQ @entry_found
    INY
    INY
    INY
    DEX
    BNE @find_entry_loop
    JMP @return
@entry_found:
    STY WIN_TEMP
    INY
    JSR VEC_FAR_READ_BYTE
    STA WIN_PTR_LO
    INY
    JSR VEC_FAR_READ_BYTE
    STA WIN_PTR_HI
    LDA WIN_PTR_LO
    CLC
    ADC #$02
    STA WIN_PTR_LO
    LDA WIN_PTR_HI
    ADC #$00
    STA WIN_PTR_HI
@restore_row_loop:
    LDY #$00
    LDA #$FC
    STA SYS_GROUP
    LDA WIN_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_PTR_HI
    STA PROG_ENTRY_HI
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JSR VEC_FAR_READ_BYTE
    STA WIN_SIZE_LO
    CMP #$00
    BNE @restore_row
    JMP @remove_entry
@restore_row:
    LDA WIN_PTR_LO
    CLC
    ADC #$01
    STA WIN_PTR_LO
    LDA WIN_PTR_HI
    ADC #$00
    STA WIN_PTR_HI
    LDA WIN_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_PTR_HI
    STA PROG_ENTRY_HI
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JSR VEC_FAR_READ_BYTE
    STA WIN_BLOCK_PTR_LO
    LDA WIN_PTR_LO
    CLC
    ADC #$01
    STA WIN_PTR_LO
    LDA WIN_PTR_HI
    ADC #$00
    STA WIN_PTR_HI
    LDA WIN_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_PTR_HI
    STA PROG_ENTRY_HI
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JSR VEC_FAR_READ_BYTE
    STA WIN_BLOCK_PTR_HI
    LDA WIN_PTR_LO
    CLC
    ADC #$01
    STA WIN_PTR_LO
    LDA WIN_PTR_HI
    ADC #$00
    STA WIN_PTR_HI
    LDA WIN_SIZE_LO
    STA SYS_ARG_0C
    LDA #$FC
    STA SYS_GROUP
    LDA WIN_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_PTR_HI
    STA PROG_ENTRY_HI
    LDX #$00
    JSR VEC_FAR_COPY_IN
    LDA WIN_SIZE_LO
    STA SYS_ARG_0C
    LDA #$FA
    STA SYS_GROUP
    LDA WIN_BLOCK_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_BLOCK_PTR_HI
    STA PROG_ENTRY_HI
    LDX #$00
    JSR VEC_FAR_COPY_OUT
    CLC
    LDA WIN_PTR_LO
    ADC WIN_SIZE_LO
    STA WIN_PTR_LO
    LDA WIN_PTR_HI
    ADC #$00
    STA WIN_PTR_HI
    JMP @restore_row_loop
@remove_entry:
    LDX WIN_TEMP
    LDA #$FC
    STA SYS_PAGE
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$00
    STA FAR_OFFSET_HI
@shift_table:
    CPX #$56
    BCC @shift_entry
    TXA
    TAY
    LDA #$FF
    JSR VEC_FAR_WRITE_BYTE
    JMP @shift_done
@shift_entry:
    TXA
    CLC
    ADC #$03
    TAY
    JSR VEC_FAR_READ_BYTE
    PHA
    TXA
    TAY
    PLA
    CMP #$FF
    BNE @shift_rest
    JSR VEC_FAR_WRITE_BYTE
    JMP @shift_done
@shift_rest:
    JSR VEC_FAR_WRITE_BYTE
    INX
    TXA
    CLC
    ADC #$03
    TAY
    JSR VEC_FAR_READ_BYTE
    PHA
    TXA
    TAY
    PLA
    JSR VEC_FAR_WRITE_BYTE
    INX
    TXA
    CLC
    ADC #$03
    TAY
    JSR VEC_FAR_READ_BYTE
    PHA
    TXA
    TAY
    PLA
    JSR VEC_FAR_WRITE_BYTE
    INX
    JMP @shift_table
@shift_done:
    TXA
    CMP WIN_TEMP
    BEQ @release_last_block
    JMP @clear_number_bit
@release_last_block:
    INX
    PHA
    TXA
    TAY
    PLA
    JSR VEC_FAR_READ_BYTE
    STA WIN_PTR_LO
    INX
    PHA
    TXA
    TAY
    PLA
    JSR VEC_FAR_READ_BYTE
    STA WIN_PTR_HI
    LDA #$FC
    STA SYS_GROUP
    LDY #$00
    LDA WIN_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_PTR_HI
    STA PROG_ENTRY_HI
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JSR VEC_FAR_READ_BYTE
    STA WIN_SIZE_LO
    LDA WIN_PTR_LO
    CLC
    ADC #$01
    STA WIN_PTR_LO
    LDA WIN_PTR_HI
    ADC #$00
    STA WIN_PTR_HI
    LDA WIN_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_PTR_HI
    STA PROG_ENTRY_HI
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JSR VEC_FAR_READ_BYTE
    STA WIN_SIZE_HI
    LDA #$FC
    STA SYS_PAGE
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$00
    STA FAR_OFFSET_HI
    LDY #$5A
    JSR VEC_FAR_READ_BYTE
    STA WIN_BLOCK_PTR_LO
    LDY #$5B
    JSR VEC_FAR_READ_BYTE
    STA WIN_BLOCK_PTR_HI
    SEC
    LDA WIN_BLOCK_PTR_LO
    SBC WIN_SIZE_LO
    STA WIN_BLOCK_PTR_LO
    LDA WIN_BLOCK_PTR_HI
    SBC WIN_SIZE_HI
    STA WIN_BLOCK_PTR_HI
    LDY #$5A
    LDA WIN_BLOCK_PTR_LO
    JSR VEC_FAR_WRITE_BYTE
    LDY #$5B
    LDA WIN_BLOCK_PTR_HI
    JSR VEC_FAR_WRITE_BYTE
@clear_number_bit:
    LDY #$5C
@clear_index_loop:
    LDA SYS_ARG_0F
    CMP #$09
    BCC @clear_bit_mask
    SEC
    LDA SYS_ARG_0F
    SBC #$08
    STA SYS_ARG_0F
    INY
    JMP @clear_index_loop
@clear_bit_mask:
    LDA #$FC
    STA SYS_PAGE
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$00
    STA FAR_OFFSET_HI
    JSR VEC_FAR_READ_BYTE
    PHA
    LDA #$80
    LDX SYS_ARG_0F
    SEC
@clear_shift_loop:
    CPX #$01
    BEQ @clear_bit_write
    LSR A
    DEX
    JMP @clear_shift_loop
@clear_bit_write:
    EOR #$FF
    STA WIN_TEMP
    PLA
    AND WIN_TEMP
    PHA
    LDA #$FC
    STA SYS_PAGE
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$00
    STA FAR_OFFSET_HI
    PLA
    JSR VEC_FAR_WRITE_BYTE
    JMP @return
@compact:
    LDA #$FC
    STA SYS_PAGE
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$00
    STA FAR_OFFSET_HI
    LDY #$00
    JSR VEC_FAR_READ_BYTE
    CMP #$FF
    BNE @compact_start
    LDA #$FC
    STA SYS_PAGE
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$00
    STA FAR_OFFSET_HI
    LDY #$5A
    LDA #$60
    JSR VEC_FAR_WRITE_BYTE
    LDY #$5B
    LDA #$80
    JSR VEC_FAR_WRITE_BYTE
    JMP @compact_done
@compact_start:
    LDY #$01
    JSR VEC_FAR_READ_BYTE
    STA WIN_PTR_LO
    LDY #$02
    JSR VEC_FAR_READ_BYTE
    STA WIN_PTR_HI
    LDY #$5A
    JSR VEC_FAR_READ_BYTE
    STA WIN_NEXT_PTR_LO
    LDY #$5B
    JSR VEC_FAR_READ_BYTE
    STA WIN_NEXT_PTR_HI
    LDA WIN_PTR_LO
    CMP #$60
    BNE @move_first_block
    LDA WIN_PTR_HI
    CMP #$80
    BNE @move_first_block
    JMP @after_first
@move_first_block:
    LDA WIN_PTR_LO
    STA WIN_BLOCK_PTR_LO
    LDA WIN_PTR_HI
    STA WIN_BLOCK_PTR_HI
    LDA #$60
    STA WIN_PTR_LO
    LDA #$80
    STA WIN_PTR_HI
    SEC
    LDA WIN_BLOCK_PTR_LO
    SBC #$60
    STA WIN_SIZE_LO
    LDA WIN_BLOCK_PTR_HI
    SBC #$80
    STA WIN_SIZE_HI
    JSR WIN_COPY_BUFFER
    LDA #$03
    STA WIN_TEMP
    JSR WIN_PREV_ENTRY
    SEC
    LDA WIN_NEXT_PTR_LO
    SBC WIN_SIZE_LO
    STA WIN_NEXT_PTR_LO
    LDA WIN_NEXT_PTR_HI
    SBC WIN_SIZE_HI
    STA WIN_NEXT_PTR_HI
    LDA #$FC
    STA SYS_PAGE
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$00
    STA FAR_OFFSET_HI
    LDY #$5A
    LDA WIN_NEXT_PTR_LO
    JSR VEC_FAR_WRITE_BYTE
    LDY #$5B
    LDA WIN_NEXT_PTR_HI
    JSR VEC_FAR_WRITE_BYTE
    LDA #$60
    STA WIN_PTR_LO
    LDA #$80
    STA WIN_PTR_HI
@after_first:
    LDY #$03
    JSR VEC_FAR_READ_BYTE
    CMP #$FF
    BNE @compact_setup
    JMP @compact_done
@compact_setup:
    LDA #$FC
    STA SYS_PAGE
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$00
    STA FAR_OFFSET_HI
    LDY #$04
    JSR VEC_FAR_READ_BYTE
    STA WIN_BLOCK_PTR_LO
    LDY #$05
    JSR VEC_FAR_READ_BYTE
    STA WIN_BLOCK_PTR_HI
    LDA #$FC
    STA SYS_GROUP
    LDA WIN_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_PTR_HI
    STA PROG_ENTRY_HI
    LDY #$00
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JSR VEC_FAR_READ_BYTE
    STA WIN_SIZE_LO
    LDA WIN_PTR_LO
    CLC
    ADC #$01
    STA WIN_PTR_LO
    LDA WIN_PTR_HI
    ADC #$00
    STA WIN_PTR_HI
    LDA #$FC
    STA SYS_GROUP
    LDA WIN_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_PTR_HI
    STA PROG_ENTRY_HI
    LDY #$00
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JSR VEC_FAR_READ_BYTE
    STA WIN_SIZE_HI
    LDA WIN_PTR_LO
    SEC
    SBC #$01
    STA WIN_PTR_LO
    LDA WIN_PTR_HI
    SBC #$00
    STA WIN_PTR_HI
    CLC
    LDA WIN_PTR_LO
    ADC WIN_SIZE_LO
    STA WIN_PTR_LO
    LDA WIN_PTR_HI
    ADC WIN_SIZE_HI
    STA WIN_PTR_HI
    LDA #$06
    STA WIN_TEMP
@compact_loop:
    LDA WIN_TEMP
    CMP #$5D
    BNE @check_block_end
    JMP @compact_done
@check_block_end:
    LDA WIN_PTR_LO
    CMP WIN_BLOCK_PTR_LO
    BNE @move_block
    LDA WIN_PTR_HI
    CMP WIN_BLOCK_PTR_HI
    BNE @move_block
    JMP @last_block_check
@move_block:
    JSR WIN_COPY_BUFFER
    JSR WIN_PREV_ENTRY
    SEC
    LDA WIN_NEXT_PTR_LO
    SBC WIN_SIZE_LO
    STA WIN_NEXT_PTR_LO
    LDA WIN_NEXT_PTR_HI
    SBC WIN_SIZE_HI
    STA WIN_NEXT_PTR_HI
    LDA #$FC
    STA SYS_PAGE
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$00
    STA FAR_OFFSET_HI
    LDY #$5A
    LDA WIN_NEXT_PTR_LO
    JSR VEC_FAR_WRITE_BYTE
    LDY #$5B
    LDA WIN_NEXT_PTR_HI
    JSR VEC_FAR_WRITE_BYTE
    LDY WIN_TEMP
    JSR VEC_FAR_READ_BYTE
    CMP #$FF
    BNE @next_block_size
    JMP @compact_done
@next_block_size:
    LDA #$FC
    STA SYS_GROUP
    LDA WIN_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_PTR_HI
    STA PROG_ENTRY_HI
    LDY #$00
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JSR VEC_FAR_READ_BYTE
    STA WIN_SIZE_LO
    LDA WIN_PTR_LO
    CLC
    ADC #$01
    STA WIN_PTR_LO
    LDA WIN_PTR_HI
    ADC #$00
    STA WIN_PTR_HI
    LDA WIN_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_PTR_HI
    STA PROG_ENTRY_HI
    LDY #$00
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JSR VEC_FAR_READ_BYTE
    STA WIN_SIZE_HI
    LDA WIN_PTR_LO
    SEC
    SBC #$01
    STA WIN_PTR_LO
    LDA WIN_PTR_HI
    SBC #$00
    STA WIN_PTR_HI
    CLC
    LDA WIN_PTR_LO
    ADC WIN_SIZE_LO
    STA WIN_PTR_LO
    LDA WIN_PTR_HI
    ADC WIN_SIZE_HI
    STA WIN_PTR_HI
    LDA #$FC
    STA SYS_PAGE
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$00
    STA FAR_OFFSET_HI
    CLC
    LDA WIN_TEMP
    ADC #$01
    TAY
    JSR VEC_FAR_READ_BYTE
    STA WIN_BLOCK_PTR_LO
    CLC
    LDA WIN_TEMP
    ADC #$02
    TAY
    JSR VEC_FAR_READ_BYTE
    STA WIN_BLOCK_PTR_HI
    CLC
    LDA WIN_TEMP
    ADC #$03
    STA WIN_TEMP
    JMP @compact_loop
@last_block_check:
    LDA #$FC
    STA SYS_PAGE
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$00
    STA FAR_OFFSET_HI
    LDY WIN_TEMP
    JSR VEC_FAR_READ_BYTE
    CMP #$FF
    BNE @last_block_size
    JMP @compact_done
@last_block_size:
    LDA #$FC
    STA SYS_GROUP
    LDA WIN_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_PTR_HI
    STA PROG_ENTRY_HI
    LDY #$00
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JSR VEC_FAR_READ_BYTE
    STA WIN_SIZE_LO
    LDA WIN_PTR_LO
    CLC
    ADC #$01
    STA WIN_PTR_LO
    LDA WIN_PTR_HI
    ADC #$00
    STA WIN_PTR_HI
    LDA WIN_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_PTR_HI
    STA PROG_ENTRY_HI
    LDY #$00
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    JSR VEC_FAR_READ_BYTE
    STA WIN_SIZE_HI
    LDA WIN_PTR_LO
    SEC
    SBC #$01
    STA WIN_PTR_LO
    LDA WIN_PTR_HI
    SBC #$00
    STA WIN_PTR_HI
    CLC
    LDA WIN_PTR_LO
    ADC WIN_SIZE_LO
    STA WIN_PTR_LO
    LDA WIN_PTR_HI
    ADC WIN_SIZE_HI
    STA WIN_PTR_HI
    LDA #$FC
    STA SYS_PAGE
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$00
    STA FAR_OFFSET_HI
    CLC
    LDA WIN_TEMP
    ADC #$01
    TAY
    JSR VEC_FAR_READ_BYTE
    STA WIN_BLOCK_PTR_LO
    CLC
    LDA WIN_TEMP
    ADC #$02
    TAY
    JSR VEC_FAR_READ_BYTE
    STA WIN_BLOCK_PTR_HI
    CLC
    LDA WIN_TEMP
    ADC #$03
    STA WIN_TEMP
    JMP @compact_loop
@compact_done:
    JMP @return
@init_table:
    LDA #$FC
    STA SYS_PAGE
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$00
    STA FAR_OFFSET_HI
    LDY #$00
@clear_table_loop:
    LDA #$FF
    JSR VEC_FAR_WRITE_BYTE
    CPY #$5A
    BEQ @set_free_pointer
    INY
    INY
    INY
    JMP @clear_table_loop
@set_free_pointer:
    LDA #$60
    JSR VEC_FAR_WRITE_BYTE
    INY
    LDA #$80
    JSR VEC_FAR_WRITE_BYTE
    INY
    LDA #$00
    JSR VEC_FAR_WRITE_BYTE
    INY
    LDA #$00
    JSR VEC_FAR_WRITE_BYTE
    INY
    LDA #$00
    JSR VEC_FAR_WRITE_BYTE
    INY
    LDA #$00
    JSR VEC_FAR_WRITE_BYTE
    JMP @return
@return:
    RTS
; 作用：把窗口保存区里 WIN_BLOCK_PTR 起、长度为 WIN_NEXT_PTR 减 WIN_BLOCK_PTR 的数据复制到 WIN_PTR 起的位置（页 $FC，经窗口 2、3 映射后逐字节搬，跨窗口边界时重新映射）；只由 $59 子功能 5 调用（代码阅读）。
; 输入：WIN_PTR=目的指针，WIN_BLOCK_PTR=源指针，WIN_NEXT_PTR=源数据末端。
; 输出：无；WIN_SIZE 保持原值。
; 调用者：API_59
WIN_COPY_BUFFER:
    LDA WIN_SIZE_HI
    PHA
    LDA WIN_SIZE_LO
    PHA
    SEC
    LDA WIN_NEXT_PTR_LO
    SBC WIN_BLOCK_PTR_LO
    STA WIN_SIZE_LO
    LDA WIN_NEXT_PTR_HI
    SBC WIN_BLOCK_PTR_HI
    STA WIN_SIZE_HI
    LDA #$FC
    STA SYS_GROUP
    LDA WIN_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_PTR_HI
    STA PROG_ENTRY_HI
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$02
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA FAR_OFFSET_HI
    ORA #$A0
    STA FAR_OFFSET_HI
    LDA SYS_PAGE
    PHA
    LDA FAR_OFFSET_LO
    PHA
    LDA FAR_OFFSET_HI
    PHA
    LDA #$FC
    STA SYS_GROUP
    LDA WIN_BLOCK_PTR_LO
    STA PROG_ENTRY_LO
    LDA WIN_BLOCK_PTR_HI
    STA PROG_ENTRY_HI
    LDA #$2C
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA FAR_OFFSET_LO
    STA WIN_COPY_PTR_LO
    LDA FAR_OFFSET_HI
    ORA #$B0
    STA WIN_COPY_PTR_HI
    LDA SYS_PAGE
    STA WIN_COPY_PAGE
    PLA
    STA FAR_OFFSET_HI
    PLA
    STA FAR_OFFSET_LO
    PLA
    STA SYS_PAGE
    INC WIN_SIZE_LO
    INC WIN_SIZE_HI
@copy_loop:
    DEC WIN_SIZE_LO
    BNE @copy_byte
    DEC WIN_SIZE_HI
    BNE @copy_byte
    JMP @finish
@copy_byte:
    LDY #$00
    LDA (WIN_COPY_PTR_LO),Y
    STA (FAR_OFFSET_LO),Y
    LDA WIN_COPY_PTR_LO
    CLC
    ADC #$01
    STA WIN_COPY_PTR_LO
    BCC @src_no_carry
    INC WIN_COPY_PTR_HI
@src_no_carry:
    LDA FAR_OFFSET_LO
    CLC
    ADC #$01
    STA FAR_OFFSET_LO
    BCC @dst_no_carry
    INC FAR_OFFSET_HI
@dst_no_carry:
    LDA WIN_COPY_PTR_HI
    CMP #$C0
    BNE @check_dst_boundary
    LDA SYS_PAGE
    PHA
    LDA FAR_OFFSET_LO
    PHA
    LDA FAR_OFFSET_HI
    PHA
    LDA WIN_COPY_PAGE
    STA SYS_PAGE
    LDA WIN_COPY_PTR_LO
    STA FAR_OFFSET_LO
    LDA WIN_COPY_PTR_HI
    STA FAR_OFFSET_HI
    INC SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$00
    STA WIN_COPY_PTR_LO
    LDA #$B0
    STA WIN_COPY_PTR_HI
    LDA SYS_PAGE
    STA WIN_COPY_PAGE
    PLA
    STA FAR_OFFSET_HI
    PLA
    STA FAR_OFFSET_LO
    PLA
    STA SYS_PAGE
@check_dst_boundary:
    LDA FAR_OFFSET_HI
    CMP #$B0
    BNE @next_byte
    INC SYS_PAGE
    LDA #$02
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$A0
    STA FAR_OFFSET_HI
@next_byte:
    JMP @copy_loop
@finish:
    PLA
    STA WIN_SIZE_LO
    PLA
    STA WIN_SIZE_HI
    RTS
; 作用：把窗口表里从 WIN_TEMP 前一项起的各项保存指针都减去 WIN_SIZE，遇到空闲项（$FF）或到表尾（$5A）为止；用于紧缩保存区后修正表项，$59 子功能 5 调用（代码阅读）。
; 输入：WIN_TEMP=起始表项偏移加 3，WIN_SIZE=要减去的字节数。
; 输出：无；WIN_TEMP、WIN_NEXT_PTR 保持原值。
; 调用者：API_59
WIN_PREV_ENTRY:
    LDA WIN_TEMP
    PHA
    LDA WIN_NEXT_PTR_LO
    PHA
    LDA WIN_NEXT_PTR_HI
    PHA
    LDA WIN_TEMP
    SEC
    SBC #$03
    STA WIN_TEMP
@entry_loop:
    LDA #$FC
    STA SYS_PAGE
    LDA #$00
    STA FAR_OFFSET_LO
    LDA #$00
    STA FAR_OFFSET_HI
    LDY WIN_TEMP
    JSR VEC_FAR_READ_BYTE
    CMP #$FF
    BNE @check_table_end
    JMP @restore_and_return
@check_table_end:
    LDA WIN_TEMP
    CMP #$5A
    BNE @adjust_entry
    JMP @restore_and_return
@adjust_entry:
    LDA WIN_TEMP
    CLC
    ADC #$01
    TAY
    JSR VEC_FAR_READ_BYTE
    STA WIN_NEXT_PTR_LO
    LDA WIN_TEMP
    CLC
    ADC #$02
    TAY
    JSR VEC_FAR_READ_BYTE
    STA WIN_NEXT_PTR_HI
    SEC
    LDA WIN_NEXT_PTR_LO
    SBC WIN_SIZE_LO
    STA WIN_NEXT_PTR_LO
    LDA WIN_NEXT_PTR_HI
    SBC WIN_SIZE_HI
    STA WIN_NEXT_PTR_HI
    LDA WIN_TEMP
    CLC
    ADC #$01
    TAY
    LDA WIN_NEXT_PTR_LO
    JSR VEC_FAR_WRITE_BYTE
    LDA WIN_TEMP
    CLC
    ADC #$02
    TAY
    LDA WIN_NEXT_PTR_HI
    JSR VEC_FAR_WRITE_BYTE
    LDA WIN_TEMP
    CLC
    ADC #$03
    STA WIN_TEMP
    JMP @entry_loop
@restore_and_return:
    PLA
    STA WIN_NEXT_PTR_HI
    PLA
    STA WIN_NEXT_PTR_LO
    PLA
    STA WIN_TEMP
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
    .byte $00,$00,$00,$00,$00,$00,$00,$00
