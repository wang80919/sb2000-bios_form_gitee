; 作用：------------------------------------------------------------------------
; 名称：page-allocation.asm
; 说明：扩展 RAM 页的分配与释放（功能 $7E）
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：在 ROM 里接在 system-services/time-and-program-exec.asm 之后
; ------------------------------------------------------------------------
; 内存页服务 $7E/$02：求位图里最长的连续空闲页数，放 ALLOC_COUNT
; 调用者：GROUP_5C_DISPATCH_7E（地址表）
PAGE_LARGEST_FREE:
    PHA
    TXA
    PHA
    TYA
    PHA
    LDX #$00
    LDY #$00
    STX LIB_GROUP
    STY DOS_TEMP_5
@loop:
    LDA PAGE_BITMAP,X
    STA DOS_TEMP_3
@next_bit:
    ASL DOS_TEMP_3
    BCC @run_ended
    INY
    JMP @next_page
@run_ended:
    CPY DOS_TEMP_5
    BCC @reset_run
    STY DOS_TEMP_5
@reset_run:
    LDY #$00
@next_page:
    INC LIB_GROUP
    LDA LIB_GROUP
    AND #$07
    BNE @next_bit
    INX
    CPX #$20
    BEQ @final_check
    JMP @loop
@final_check:
    CPY DOS_TEMP_5
    BCC @store_result
    STY DOS_TEMP_5
@store_result:
    LDA DOS_TEMP_5
    STA ALLOC_COUNT
    PLA
    TAY
    PLA
    TXA
    PLA
    RTS
; 作用：内存页服务 $7E/$01：释放 ALLOC_START 起的 ALLOC_COUNT 个页
; 页号小于 $80 或不小于 $F0 时出错码 9
; 调用者：GROUP_5C_DISPATCH_7E（地址表）
PAGE_FREE:
    PHA
    TXA
    PHA
    TYA
    PHA
    LDA #$00
    STA DOS_ERROR
    LDA ALLOC_START
    LSR A
    LSR A
    LSR A
    TAX
    LDA ALLOC_START
    CMP #$80
    BCS @check_upper
    LDA #$09
    STA DOS_ERROR
    JMP @finish
@check_upper:
    CMP #$F0
    BCC @range_ok
    LDA #$09
    STA DOS_ERROR
    JMP @finish
@range_ok:
    AND #$07
    TAY
@loop:
    LDA ALLOC_COUNT
    BNE @mask_start
    JMP @finish
@mask_start:
    TYA
    CLC
    ADC ALLOC_COUNT
    STA ALLOC_COUNT
    LDA #$FF
    STA DOS_TEMP_4
    STA DOS_TEMP_5
@shift_mask:
    CPY #$00
    BEQ @tail_mask
    LSR DOS_TEMP_4
    DEY
    JMP @shift_mask
@tail_mask:
    LDA ALLOC_COUNT
    CMP #$08
    BCS @apply_mask
    LDA #$08
    SEC
    SBC ALLOC_COUNT
    TAY
    LDA #$08
    STA ALLOC_COUNT
@shift_tail:
    ASL DOS_TEMP_5
    DEY
    BNE @shift_tail
@apply_mask:
    LDA DOS_TEMP_4
    AND DOS_TEMP_5
    STA DOS_TEMP_4
    LDA PAGE_BITMAP,X
    ORA DOS_TEMP_4
    STA PAGE_BITMAP,X
    LDA ALLOC_COUNT
    SEC
    SBC #$08
    STA ALLOC_COUNT
    LDY #$00
    INX
    JMP @loop
@finish:
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
; 作用：内存页服务 $7E/$00：按 ALLOC_COUNT 个页在位图里找连续空闲页并占用，起始页号放 ALLOC_START
; 没有足够的连续页时出错码 8
; 调用者：GROUP_5C_DISPATCH_7E（地址表）
PAGE_ALLOC:
    PHA
    TXA
    PHA
    TYA
    PHA
    LDA ALLOC_COUNT
    PHA
    LDX #$00
    LDY #$00
    STX ALLOC_START
    STX LIB_GROUP
@loop:
    LDA PAGE_BITMAP,X
    STA DOS_TEMP_3
@next_bit:
    ASL DOS_TEMP_3
    BCC @reset_run
    TYA
    BNE @count_run
    LDA LIB_GROUP
    STA ALLOC_START
@count_run:
    INY
    CPY ALLOC_COUNT
    BCC @next_page
    JMP @found
@reset_run:
    LDY #$00
    STY ALLOC_START
@next_page:
    INC LIB_GROUP
    LDA LIB_GROUP
    AND #$07
    BNE @next_bit
    INX
    CPX #$20
    BEQ @no_space
    JMP @loop
@no_space:
    LDA #$08
    STA DOS_ERROR
    LDA #$00
    STA ALLOC_START
    JMP @finish
@found:
    LDA ALLOC_START
    LSR A
    LSR A
    LSR A
    TAX
    LDA ALLOC_START
    AND #$07
    TAY
@mark_loop:
    LDA ALLOC_COUNT
    BNE @mark_group
    JMP @success
@mark_group:
    LDA #$FF
    STA DOS_TEMP_4
    STA DOS_TEMP_5
    TYA
    CLC
    ADC ALLOC_COUNT
    STA ALLOC_COUNT
@shift_mask:
    CPY #$00
    BEQ @tail_mask
    LSR DOS_TEMP_4
    DEY
    JMP @shift_mask
@tail_mask:
    LDA ALLOC_COUNT
    CMP #$08
    BCS @apply_mask
    LDA #$08
    SEC
    SBC ALLOC_COUNT
    TAY
    LDA #$08
    STA ALLOC_COUNT
@shift_tail:
    ASL DOS_TEMP_5
    DEY
    BNE @shift_tail
@apply_mask:
    LDA DOS_TEMP_4
    AND DOS_TEMP_5
    EOR #$FF
    STA DOS_TEMP_4
    LDA PAGE_BITMAP,X
    AND DOS_TEMP_4
    STA PAGE_BITMAP,X
    LDA ALLOC_COUNT
    SEC
    SBC #$08
    STA ALLOC_COUNT
    LDY #$00
    INX
    JMP @mark_loop
@success:
    LDA #$00
    STA DOS_ERROR
@finish:
    PLA
    STA ALLOC_COUNT
    PLA
    TAY
    PLA
    TXA
    PLA
    RTS
