; ------------------------------------------------------------------------
; 名称：printer-service.asm
; 说明：打印机服务（功能 $76-$7A）：ESC/P 命令、位图输出与文字打印，按汇编地址 $8000 运行
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：在 ROM 里接在 input-method/ime-extra-services.asm 之后
; ------------------------------------------------------------------------
; ---- 同一页的第二种用途：页组 $0E 的页，汇编地址 $8000，从页内偏移 $0300 起 ----
.rorg $8300
; 作用：打印机服务（功能 $76-$7A）的共用入口（页组 $0E，汇编地址 $8300 起）：先调用 PRN_SUB_14，清 SYS_STATUS，把 SYS_ARG_0B 存为打印方式 PRN_MODE、SYS_ARG_05 存为重复次数 PRN_REPEAT、SYS_ARG_06 存为走纸量 PRN_FEED_AMOUNT，再按 SYS_SUBFUNCTION（0-15）跳到子功能入口（13 与 0 同为整段文字打印）。
; 输入：SYS_SUBFUNCTION、SYS_ARG_05、SYS_ARG_06、SYS_ARG_0B 等。
; 输出：SYS_STATUS=0 成功，$FF 表示出错或超时。
; 调用者：全 ROM 没有指令或地址表引用它（只能由外部直接进入）
PRN_ENTRY:
    JSR PRN_SUB_14
    LDA #$00
    STA PRN_RESERVED_0548
    STA SYS_STATUS
    LDA SYS_ARG_0B
    STA PRN_MODE
    LDA SYS_ARG_05
    STA PRN_REPEAT
    LDA SYS_ARG_06
    STA PRN_FEED_AMOUNT
    LDA SYS_SUBFUNCTION
    JSR PRN_JUMP_TABLE
    .word PRN_SUB_00,PRN_SUB_01,PRN_SUB_02,PRN_SUB_03,PRN_SUB_04,PRN_SUB_05,PRN_SUB_06,PRN_SUB_07
    .word PRN_SUB_08,PRN_SUB_09,PRN_SUB_10,PRN_SUB_11,PRN_SUB_12,PRN_SUB_00,PRN_SUB_14,PRN_SUB_15
; 作用：内联跳转表：JSR 之后紧跟 16 个子功能入口，A 为子功能号，跳到对应入口。
; 输入：A=子功能号（0-15）。
; 输出：不返回调用点，直接跳到表项里的地址。
; 副作用：弹出返回地址，改写 CALL_VEC_LO、CALL_VEC_HI、Y。
; 调用者：PRN_ENTRY
PRN_JUMP_TABLE:
    ASL A
    TAY
    PLA
    STA CALL_VEC_LO
    PLA
    STA CALL_VEC_HI
    INY
    LDA (CALL_VEC_LO),Y
    PHA
    INY
    LDA (CALL_VEC_LO),Y
    STA CALL_VEC_HI
    PLA
    STA CALL_VEC_LO
    JMP (CALL_VEC_LO)
; 作用：打印子功能 0 与 13（整段文字打印）：每轮 PRN_START_JOB 打印一行；SYS_STATUS 为 $FF（出错或超时）或 PRN_END_FLAG 非 0（数据读完）时返回，否则按 PRN_RESUME_PAGE、PRN_RESUME_OFFSET_LO/HI 与 PRN_JOB_LENGTH_SAVED 恢复到最近一次读字节前的位置再打下一行（用例 p0e-printer-text.mjs）。
; 输入：SYS_PAGE、FAR_OFFSET_LO/HI、SYS_ARG_0C=待打印数据的位置与长度。
; 输出：SYS_STATUS。
; 调用者：PRN_ENTRY（地址表）、PRN_SUB_00
PRN_SUB_00:
    LDA #$00
    STA PRN_LINE_DONE
    JSR PRN_START_JOB
    LDA SYS_STATUS
    CMP #$FF
    BEQ @return
    LDA PRN_END_FLAG
    BNE @return
    LDA PRN_JOB_LENGTH_SAVED
    STA SYS_ARG_0C
    LDA PRN_RESUME_PAGE
    STA SYS_PAGE
    LDA PRN_RESUME_OFFSET_LO
    STA FAR_OFFSET_LO
    LDA PRN_RESUME_OFFSET_HI
    STA FAR_OFFSET_HI
    JMP PRN_SUB_00
@return:
    RTS
; 作用：打印任务开始：清 PRN_PASS、PRN_SENT_COUNT，PRN_MASK_RIGHT 置 $80，把数据起点（SYS_PAGE、FAR_OFFSET_LO/HI）与长度 SYS_ARG_0C 保存到 PRN_JOB_PAGE、PRN_JOB_OFFSET_LO/HI、PRN_JOB_LENGTH 和 PRN_JOB_LENGTH_SAVED，打印方式存到 PRN_MODE_SAVED，随后进入 PRN_BEGIN_PASS。
; 输入：SYS_PAGE、FAR_OFFSET_LO/HI、SYS_ARG_0C、PRN_MODE。
; 调用者：PRN_SUB_00
PRN_START_JOB:
    LDA #$00
    STA PRN_SENT_COUNT
    STA PRN_PASS
    LDA #$80
    STA PRN_MASK_RIGHT
    LDA SYS_PAGE
    STA PRN_JOB_PAGE
    LDA FAR_OFFSET_LO
    STA PRN_JOB_OFFSET_LO
    LDA FAR_OFFSET_HI
    STA PRN_JOB_OFFSET_HI
    LDA SYS_ARG_0C
    STA PRN_JOB_LENGTH
    STA PRN_JOB_LENGTH_SAVED
    LDA PRN_MODE
    STA PRN_MODE_SAVED
; 作用：开始一遍打印：恢复 PRN_MODE，清 PRN_END_FLAG、PRN_PHASE_COUNT、PRN_LINE_DONE，PRN_MASK_LEFT 置 $10，发 PRN_SUB_01、PRN_SUB_08 初始化，列数清 0，数据位置回到任务起点，然后循环取数打印（PRN_FETCH_DATA_BYTE，PRN_SUB_09-12）直到这一遍结束（PRN_FINISH_PASS）。
; 调用者：PRN_FINISH_PASS、PRN_START_JOB（顺序执行到这里）
PRN_BEGIN_PASS:
    LDA PRN_MODE_SAVED
    STA PRN_MODE
    LDA #$00
    STA PRN_END_FLAG
    STA PRN_PHASE_COUNT
    STA PRN_LINE_DONE
    LDA #$10
    STA PRN_MASK_LEFT
    JSR PRN_SUB_01
    JSR PRN_SUB_08
    LDA #$00
    STA PRN_COLUMN_LO
    STA PRN_COLUMN_HI
    LDA PRN_JOB_PAGE
    STA SYS_PAGE
    LDA PRN_JOB_OFFSET_LO
    STA FAR_OFFSET_LO
    LDA PRN_JOB_OFFSET_HI
    STA FAR_OFFSET_HI
    LDA PRN_JOB_LENGTH
    STA SYS_ARG_0C
@next_byte:
    JSR PRN_FETCH_DATA_BYTE
    JSR PRN_SUB_09
    JSR PRN_SUB_10
    JSR PRN_SUB_11
    JSR PRN_SUB_12
    JMP @next_byte
; 作用：一遍打印结束：PRN_PASS 为 0 时先走纸（PRN_FEED_PAPER_C）；PRN_PASS 取反，变为 1 时再打一遍（PRN_BEGIN_PASS），否则进入 PRN_END_JOB。
; 调用者：PRN_SUB_12、PRN_SUB_11
PRN_FINISH_PASS:
    LDA PRN_PASS
    BNE @reset_count
    JSR PRN_FEED_PAPER_C
@reset_count:
    LDA #$00
    STA PRN_SENT_COUNT
    LDA PRN_PASS
    EOR #$01
    STA PRN_PASS
    BNE PRN_BEGIN_PASS
; 作用：任务结束：SYS_ARG_04 为 0 走纸 B（PRN_FEED_PAPER_B），否则走纸 A（PRN_FEED_PAPER_A），再发 PRN_SUB_02。
; 调用者：PRN_SUB_12、PRN_SUB_11、PRN_FINISH_PASS（顺序执行到这里）
PRN_END_JOB:
    LDA SYS_SUBFUNCTION
    LDA SYS_ARG_04
    BNE @feed_a
    JSR PRN_FEED_PAPER_B
    JSR PRN_SUB_02
    JMP PRN_RETURN
@feed_a:
    JSR PRN_FEED_PAPER_A
    JSR PRN_SUB_02
; 作用：返回（RTS）。
; 调用者：PRN_END_JOB、PRN_SUB_12
PRN_RETURN:
    RTS
; 作用：打印子功能 12（发送空列）：每次发 3 个 0 字节（PRN_SEND_BYTE）并使列数加 1，重复 PRN_REPEAT 次（子功能号为 12 时不检查 PRN_REPEAT 是否为 0）；列数到 $0478 时结束这一遍：SYS_ARG_04 为 2 转 PRN_END_JOB，否则转 PRN_FINISH_PASS（用例 p0e-printer-data.mjs）。
; 输入：PRN_REPEAT、SYS_SUBFUNCTION、SYS_ARG_04。
; 调用者：PRN_ENTRY（地址表）、PRN_BEGIN_PASS
PRN_SUB_12:
    LDA SYS_SUBFUNCTION
    CMP #$0C
    BEQ @send_column
    LDA PRN_REPEAT
    BEQ PRN_RETURN
@send_column:
    LDY #$00
    STY PRN_OUT_BYTE
@loop:
    JSR PRN_SEND_BYTE
    JSR PRN_SEND_BYTE
    JSR PRN_SEND_BYTE
    JSR PRN_INC_COLUMN
    LDA PRN_COLUMN_LO
    CMP #$78
    BNE @next_repeat
    LDA PRN_COLUMN_HI
    CMP #$04
    BNE @next_repeat
    PLA
    PLA
    LDA SYS_ARG_04
    CMP #$02
    BNE @finish_pass
    JMP PRN_END_JOB
@finish_pass:
    JMP PRN_FINISH_PASS
@next_repeat:
    INY
    CPY PRN_REPEAT
    BNE @loop
    RTS
; 作用：向打印机发送一个字节（PRN_OUT_BYTE）：SYS_STATUS 不为 0 时直接返回；先等打印机就绪（PERIPH_CTRL 位 5 为 1、位 4 为 0，且 JOY2_FRAME 位 3 为 1），约两轮计数没等到就超时，SYS_STATUS 置 $FF。就绪后按打印方式 PRN_MODE 处理要发的字节（PRN_END_FLAG 为 0 时才处理）：0 原样；1 在每 3 个字节的第 3 个（PRN_SENT_COUNT 为 2，且 SYS_ARG_04 为 2 或 PRN_PASS 非 0）并上 $03，发送后计数回到 0；2 取反；3 在 PRN_SENT_COUNT 的位 2、3 都为 0 时并上 $44；4 在位 3、4 都为 0 时并上 $AA，否则并上 $80；5 每 4 个字节把 PRN_MASK_LEFT 循环左移一位并上它；6 每 4 个字节把 PRN_MASK_RIGHT 循环右移一位并上它；7 两个掩码都用。之后经 PRN_FILTER_BY_PHASE 过滤，写到 PRINTER_DATA，用 PERIPH_CTRL 位 2 打一个选通脉冲，PRN_SENT_COUNT 加 1。
; 输入：PRN_OUT_BYTE、PRN_MODE。
; 输出：C=0；等待超时时 SYS_STATUS=$FF。
; 副作用：A、X、Y 保存并恢复，改写 PRN_TIMEOUT、PRN_MASK_LEFT、PRN_MASK_RIGHT、PRN_SENT_COUNT。
; 调用者：PRN_SUB_12、PRN_SUB_11
PRN_SEND_BYTE:
    LDA SYS_STATUS
    BEQ @wait_ready
    RTS
@wait_ready:
    TXA
    PHA
    TYA
    PHA
    LDX #$00
    STX PRN_TIMEOUT
    LDY #$00
@loop:
    LDA PERIPH_CTRL
    ORA #$38
    STA PERIPH_CTRL
    LDA PERIPH_CTRL
    AND #$20
    BEQ @timeout
    LDA PERIPH_CTRL
    AND #$10
    BNE @timeout
    LDA JOY2_FRAME
    ORA #$0C
    STA JOY2_FRAME
    LDA JOY2_FRAME
    AND #$08
    BNE @ready
    DEX
    BNE @loop
    DEY
    BNE @loop
    INC PRN_TIMEOUT
    LDA PRN_TIMEOUT
    CMP #$02
    BNE @loop
@timeout:
    PLA
    TAY
    PLA
    TAX
    LDA #$FF
    STA SYS_STATUS
    RTS
@ready:
    PLA
    TAY
    PLA
    TAX
    LDA PRN_MODE
    BNE @test_mode1
    JMP @raw
@test_mode1:
    CMP #$01
    BNE @test_mode2
    LDA SYS_ARG_04
    CMP #$02
    BEQ @mode1_count
    LDA PRN_PASS
    BNE @mode1_count
    JMP @raw
@mode1_count:
    LDA PRN_SENT_COUNT
    CMP #$02
    BEQ @mode1_fold
    JMP @raw
@mode1_fold:
    DEC PRN_SENT_COUNT
    DEC PRN_SENT_COUNT
    DEC PRN_SENT_COUNT
    LDA PRN_END_FLAG
    BNE @mode1_end
    LDA PRN_OUT_BYTE
    ORA #$03
    JMP @send
@mode1_end:
    LDA PRN_OUT_BYTE
    JMP @send
@test_mode2:
    CMP #$02
    BNE @test_mode3
    LDA PRN_END_FLAG
    BNE @mode2_end
    LDA PRN_OUT_BYTE
    EOR #$FF
    JMP @send
@mode2_end:
    LDA PRN_OUT_BYTE
    JMP @send
@test_mode3:
    CMP #$03
    BNE @test_mode4
    LDA PRN_SENT_COUNT
    AND #$0C
    BEQ @mode3_pattern
    JMP @raw
@mode3_pattern:
    LDA PRN_END_FLAG
    BNE @mode3_end
    LDA PRN_OUT_BYTE
    ORA #$44
    JMP @send
@mode3_end:
    LDA PRN_OUT_BYTE
    JMP @send
@test_mode4:
    CMP #$04
    BNE @test_mode5
    LDA PRN_SENT_COUNT
    AND #$18
    BNE @mode4_high
    LDA PRN_END_FLAG
    BNE @mode4_end_a
    LDA PRN_OUT_BYTE
    ORA #$AA
    JMP @send
@mode4_end_a:
    LDA PRN_OUT_BYTE
    JMP @send
@mode4_high:
    LDA PRN_END_FLAG
    BNE @mode4_end_b
    LDA PRN_OUT_BYTE
    ORA #$80
    JMP @send
@mode4_end_b:
    LDA PRN_OUT_BYTE
    JMP @send
@test_mode5:
    CMP #$05
    BNE @test_mode6
    LDA PRN_SENT_COUNT
    AND #$03
    BNE @mode5_apply
    CLC
    ROL PRN_MASK_LEFT
    BCC @mode5_apply
    ROL PRN_MASK_LEFT
@mode5_apply:
    LDA PRN_END_FLAG
    BNE @mode5_end
    LDA PRN_OUT_BYTE
    ORA PRN_MASK_LEFT
    JMP @send
@mode5_end:
    LDA PRN_OUT_BYTE
    JMP @send
@test_mode6:
    CMP #$06
    BNE @test_mode7
    LDA PRN_SENT_COUNT
    AND #$03
    BNE @mode6_apply
    CLC
    ROR PRN_MASK_RIGHT
    BCC @mode6_apply
    ROR PRN_MASK_RIGHT
@mode6_apply:
    LDA PRN_END_FLAG
    BNE @mode6_end
    LDA PRN_OUT_BYTE
    ORA PRN_MASK_RIGHT
    JMP @send
@mode6_end:
    LDA PRN_OUT_BYTE
    JMP @send
@test_mode7:
    CMP #$07
    BNE @raw
    LDA PRN_SENT_COUNT
    AND #$03
    BNE @mode7_apply
    CLC
    ROL PRN_MASK_LEFT
    BCC @mode7_right
    ROL PRN_MASK_LEFT
@mode7_right:
    CLC
    ROR PRN_MASK_RIGHT
    BCC @mode7_apply
    ROR PRN_MASK_RIGHT
@mode7_apply:
    LDA PRN_END_FLAG
    BNE @mode7_end
    LDA PRN_OUT_BYTE
    ORA PRN_MASK_LEFT
    ORA PRN_MASK_RIGHT
    JMP @send
@mode7_end:
    LDA PRN_OUT_BYTE
    JMP @send
@raw:
    LDA PRN_OUT_BYTE
@send:
    JSR PRN_FILTER_BY_PHASE
    STA PRINTER_DATA
    LDA PERIPH_CTRL
    ORA #$04
    STA PERIPH_CTRL
    LDA PERIPH_CTRL
    AND #$FB
    STA PERIPH_CTRL
    INC PRN_SENT_COUNT
    CLC
    RTS
; 作用：按遍数过滤要发送的字节：SYS_ARG_04 不为 0 或 PRN_MODE 为 1 时原样返回；否则 PRN_PHASE_COUNT 加 1：PRN_PASS 为偶数遍时每 3 个字节的第 1 个返回 0，奇数遍时第 3 个返回 0，其余原样；PRN_PHASE_COUNT 到 3 时清 0。
; 输入：A=要发送的字节。
; 输出：A=过滤后的字节。
; 调用者：PRN_SEND_BYTE
PRN_FILTER_BY_PHASE:
    PHA
    LDA SYS_ARG_04
    BEQ @filter
    PLA
    RTS
@filter:
    LDA PRN_MODE
    CMP #$01
    BNE @count_phase
    PLA
    RTS
@count_phase:
    INC PRN_PHASE_COUNT
    LDA PRN_PASS
    AND #$01
    BNE @odd_pass
    LDA PRN_PHASE_COUNT
    CMP #$01
    BNE @even_pass_next
    PLA
    LDA #$00
    RTS
@odd_pass:
    LDA PRN_PHASE_COUNT
    CMP #$03
    BNE @unchanged
    PLA
    LDA #$00
    STA PRN_PHASE_COUNT
    RTS
@unchanged:
    PLA
    RTS
@even_pass_next:
    LDA PRN_PHASE_COUNT
    CMP #$03
    BNE @unchanged
    LDA #$00
    STA PRN_PHASE_COUNT
    PLA
    RTS
; 作用：进纸 A：发送 ESC J $17（进纸），再发 ESC J 加 PRN_FEED_AMOUNT 的值；每次进纸后用 PRN_COUNT_FEED 扣除行距计数。
; 输入：PRN_FEED_AMOUNT。
; 调用者：PRN_END_JOB
PRN_FEED_PAPER_A:
    LDA #$1B
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA #$4A
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA #$17
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA #$17
    JSR PRN_COUNT_FEED
    LDA #$1B
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA #$4A
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA PRN_FEED_AMOUNT
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA PRN_FEED_AMOUNT
    JSR PRN_COUNT_FEED
    RTS
; 作用：进纸 B：发送 ESC J $08，再发 ESC J 加 PRN_FEED_AMOUNT 的值，并扣除行距计数。
; 输入：PRN_FEED_AMOUNT。
; 调用者：PRN_END_JOB
PRN_FEED_PAPER_B:
    LDA #$1B
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA #$4A
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA #$08
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA #$08
    JSR PRN_COUNT_FEED
    LDA #$1B
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA #$4A
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA PRN_FEED_AMOUNT
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA PRN_FEED_AMOUNT
    JSR PRN_COUNT_FEED
    RTS
; 作用：进纸 C：发送 ESC J $18，并扣除行距计数。
; 调用者：PRN_FINISH_PASS
PRN_FEED_PAPER_C:
    LDA #$1B
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA #$4A
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA #$18
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA #$18
    JSR PRN_COUNT_FEED
    RTS
; 作用：打印子功能 9（整理点阵缓冲，不发送数据）：把 PRN_GLYPH_BUFFER 复制到 PRN_BITMAP（SYS_ARG_07 为 0 时 16 字节，否则 32 字节），再按位块转置回 PRN_GLYPH_BUFFER（用例 p0e-printer-data.mjs）。
; 输入：PRN_GLYPH_BUFFER、SYS_ARG_07。
; 输出：PRN_GLYPH_BUFFER 为转置后的点阵，PRN_BITMAP 为原点阵的副本。
; 调用者：PRN_ENTRY（地址表）、PRN_BEGIN_PASS
PRN_SUB_09:
    LDY #$00
@copy_byte:
    LDA PRN_GLYPH_BUFFER,Y
    STA PRN_BITMAP,Y
    INY
    LDA SYS_ARG_07
    BEQ @copy_16
    CPY #$20
    BNE @copy_byte
    JMP @start_transpose
@copy_16:
    CPY #$10
    BNE @copy_byte
@start_transpose:
    LDA #$C4
    STA PRN_SRC_PTR_LO
    LDA #$04
    STA PRN_SRC_PTR_HI
    LDA #$00
    STA PRN_GLYPH_ROW
@next_half:
    LDX #$08
    STX PRN_BIT_SHIFT
    LDY #$00
@next_bit_plane:
    LDA PRN_SRC_PTR_LO
    STA DST_ADDR_LO
    LDA PRN_SRC_PTR_HI
    STA DST_ADDR_HI
@gather_bit:
    LDA PRN_BIT_SHIFT
    TAX
    LDA (DST_ADDR_LO),Y
@shift_bit:
    LSR A
    DEX
    BNE @shift_bit
    LDA PRN_GLYPH_ROW
    TAX
    ROL PRN_GLYPH_BUFFER,X
    INY
    CPY #$08
    BMI @gather_bit
    INC PRN_GLYPH_ROW
    LDA PRN_GLYPH_ROW
    CMP #$20
    BEQ @return
    CMP #$10
    BEQ @second_half
    LDA PRN_GLYPH_ROW
    LSR A
    BCC @advance_bit_plane
    LDA DST_ADDR_LO
    CLC
    ADC #$08
    STA DST_ADDR_LO
    LDA DST_ADDR_HI
    ADC #$00
    STA DST_ADDR_HI
    LDY #$00
    JMP @gather_bit
@advance_bit_plane:
    DEC PRN_BIT_SHIFT
    LDY #$00
    JMP @next_bit_plane
@second_half:
    LDA #$C4
    CLC
    ADC #$10
    STA PRN_SRC_PTR_LO
    LDA #$04
    STA PRN_SRC_PTR_HI
    JMP @next_half
@return:
    RTS
; 作用：把 16 位列计数 PRN_COLUMN_LO/HI 加 1。
; 调用者：PRN_SUB_12、PRN_SUB_11
PRN_INC_COLUMN:
    LDA PRN_COLUMN_LO
    CLC
    ADC #$01
    STA PRN_COLUMN_LO
    LDA PRN_COLUMN_HI
    ADC #$00
    STA PRN_COLUMN_HI
    RTS
; 作用：打印子功能 11（发送列数据）：从 PRN_BITMAP 起每 3 字节为一列（PRN_SEND_BYTE 逐字节发送），同一列重复发送的次数由 SYS_ARG_03 决定（0 为 1 次，1-4 为 2-5 次，其他为 6 次），共发 8 列（SYS_ARG_07 非 0 时 16 列）；列数到 $0478 时结束这一遍（PRN_FINISH_PASS）。SYS_ARG_04 为 2 时走另一条路径：重复次数依次为 1、1、2、3、4、5 次（SYS_ARG_03 为 0、1、2、3、4、其他），共发 12 列（SYS_ARG_07 非 0 时 24 列），列数到 $0478 时转 PRN_END_JOB（用例 p0e-printer-data.mjs）。
; 输入：PRN_BITMAP、SYS_ARG_03、SYS_ARG_04、SYS_ARG_07。
; 调用者：PRN_ENTRY（地址表）、PRN_BEGIN_PASS
PRN_SUB_11:
    LDA SYS_ARG_04
    CMP #$02
    BNE @normal
    JMP @mode2_start
    RTS
@normal:
    LDY #$00
@next_group:
    LDX #$00
@send_column:
    LDA PRN_BITMAP,Y
    STA PRN_OUT_BYTE
    JSR PRN_SEND_BYTE
    LDA PRN_BITMAP+1,Y
    STA PRN_OUT_BYTE
    JSR PRN_SEND_BYTE
    LDA PRN_BITMAP+2,Y
    STA PRN_OUT_BYTE
    JSR PRN_SEND_BYTE
    JSR PRN_INC_COLUMN
    LDA PRN_COLUMN_LO
    CMP #$78
    BNE @repeat_check
    LDA PRN_COLUMN_HI
    CMP #$04
    BNE @repeat_check
    PLA
    PLA
    JMP PRN_FINISH_PASS
@repeat_check:
    INX
    LDA SYS_ARG_03
    BEQ @group_done
    CMP #$01
    BNE @repeat_not1
    CPX #$02
    JMP @repeat_test
@repeat_not1:
    CMP #$02
    BNE @repeat_not2
    CPX #$03
    JMP @repeat_test
@repeat_not2:
    CMP #$03
    BNE @repeat_not3
    CPX #$04
    JMP @repeat_test
@repeat_not3:
    CMP #$04
    BNE @repeat_6
    CPX #$05
    JMP @repeat_test
@repeat_6:
    CPX #$06
@repeat_test:
    BNE @send_column
@group_done:
    INY
    INY
    INY
    LDA SYS_ARG_07
    BEQ @check_end8
    CPY #$30
    BNE @next_group
    JMP @return
@check_end8:
    CPY #$18
    BNE @next_group
@return:
    RTS
@mode2_start:
    LDY #$00
@mode2_group:
    LDX #$00
@mode2_column:
    LDA PRN_BITMAP,Y
    STA PRN_OUT_BYTE
    JSR PRN_SEND_BYTE
    LDA PRN_BITMAP+1,Y
    STA PRN_OUT_BYTE
    JSR PRN_SEND_BYTE
    LDA PRN_BITMAP+2,Y
    STA PRN_OUT_BYTE
    JSR PRN_SEND_BYTE
    JSR PRN_INC_COLUMN
    LDA PRN_COLUMN_LO
    CMP #$78
    BNE @mode2_repeat
    LDA PRN_COLUMN_HI
    CMP #$04
    BNE @mode2_repeat
    PLA
    PLA
    JMP PRN_END_JOB
@mode2_repeat:
    INX
    LDA SYS_ARG_03
    BEQ @mode2_group_done
    CMP #$01
    BNE @mode2_not1
    CPX #$01
    JMP @mode2_repeat_test
@mode2_not1:
    CMP #$02
    BNE @mode2_not2
    CPX #$02
    JMP @mode2_repeat_test
@mode2_not2:
    CMP #$03
    BNE @mode2_not3
    CPX #$03
    JMP @mode2_repeat_test
@mode2_not3:
    CMP #$04
    BNE @mode2_5
    CPX #$04
    JMP @mode2_repeat_test
@mode2_5:
    CPX #$05
@mode2_repeat_test:
    BNE @mode2_column
@mode2_group_done:
    INY
    INY
    INY
    LDA SYS_ARG_07
    BEQ @mode2_check_end12
    CPY #$48
    BNE @mode2_group
    RTS
@mode2_check_end12:
    CPY #$24
    BNE @mode2_group
    RTS
; 作用：打印子功能 10（位展开）：SYS_ARG_04 为 2 时调用 PRN_BUILD_BITMAP；否则从 PRN_GLYPH_BUFFER 里每隔一个字节取一个（PRN_PASS 为 0 从第 0 个开始，为 1 从第 1 个开始），SYS_ARG_04 为 0 时横向展开成 2 倍（PRN_EXPAND_BITS_X2），否则展开成 3 倍（PRN_EXPAND_BITS_X3），结果每 3 字节一组写进 PRN_BITMAP，共 $30 字节（用例 p0e-printer-data.mjs）。
; 输入：PRN_GLYPH_BUFFER、PRN_PASS、SYS_ARG_04。
; 输出：PRN_BITMAP。
; 调用者：PRN_ENTRY（地址表）、PRN_BEGIN_PASS
PRN_SUB_10:
    LDA SYS_ARG_04
    CMP #$02
    BNE @expand
    JSR PRN_BUILD_BITMAP
    RTS
@expand:
    LDX #$00
    LDA PRN_PASS
    CMP #$00
    BNE @start_odd
    LDY #$00
    BEQ @loop
@start_odd:
    LDY #$01
@loop:
    LDA PRN_GLYPH_BUFFER,Y
    STA PRN_BITS_IN
    TXA
    PHA
    LDA SYS_ARG_04
    BNE @x3
    JSR PRN_EXPAND_BITS_X2
    JMP @store
@x3:
    JSR PRN_EXPAND_BITS_X3
@store:
    PLA
    TAX
    LDA PRN_BITS_OUT
    STA PRN_BITMAP,X
    LDA PRN_BITS_OUT+1
    STA PRN_BITMAP+1,X
    LDA PRN_BITS_OUT+2
    STA PRN_BITMAP+2,X
    INY
    INY
    INX
    INX
    INX
    CPX #$30
    BNE @loop
    RTS
; 作用：把 PRN_BITS_IN 的各位每位重复 2 次展开成 16 位，放 PRN_BITS_OUT 起的两个字节；PRN_PASS 为 0 时结果整体后移一个字节（放 PRN_BITS_OUT+1、PRN_BITS_OUT+2，PRN_BITS_OUT 清 0），否则 PRN_BITS_OUT+2 清 0。
; 输入：PRN_BITS_IN、PRN_PASS。
; 输出：PRN_BITS_OUT 起的 3 个字节。
; 调用者：PRN_SUB_10
PRN_EXPAND_BITS_X2:
    LDX #$08
@loop:
    LDA PRN_BITS_IN
    LSR A
    ROR PRN_BITS_OUT
    ROR PRN_BITS_OUT+1
    LSR PRN_BITS_IN
    ROR PRN_BITS_OUT
    ROR PRN_BITS_OUT+1
    DEX
    BNE @loop
    LDA PRN_PASS
    CMP #$00
    BNE @odd_pass
    LDA PRN_BITS_OUT+1
    STA PRN_BITS_OUT+2
    LDA PRN_BITS_OUT
    STA PRN_BITS_OUT+1
    LDA #$00
    STA PRN_BITS_OUT
    RTS
@odd_pass:
    LDA #$00
    STA PRN_BITS_OUT+2
    RTS
; 作用：把 PRN_BITS_IN 的各位每位重复 3 次展开成 24 位，放 PRN_BITS_OUT 起的三个字节。
; 输入：PRN_BITS_IN。
; 输出：PRN_BITS_OUT 起的 3 个字节。
; 调用者：PRN_SUB_10、PRN_EXPAND_ROWS
PRN_EXPAND_BITS_X3:
    LDX #$08
@loop:
    LDA PRN_BITS_IN
    LSR A
    ROR PRN_BITS_OUT
    ROR PRN_BITS_OUT+1
    ROR PRN_BITS_OUT+2
    LDA PRN_BITS_IN
    LSR A
    ROR PRN_BITS_OUT
    ROR PRN_BITS_OUT+1
    ROR PRN_BITS_OUT+2
    LSR PRN_BITS_IN
    ROR PRN_BITS_OUT
    ROR PRN_BITS_OUT+1
    ROR PRN_BITS_OUT+2
    DEX
    BNE @loop
    RTS
; 作用：把 PRN_GLYPH_BUFFER 的字模点阵加工成打印用位图：先逐字节展开（PRN_EXPAND_ROWS），再缩放（PRN_SHRINK_ROWS），最后合并（PRN_COMBINE_ROWS）。
; 输入：PRN_GLYPH_BUFFER。
; 输出：PRN_BITMAP。
; 调用者：PRN_SUB_10
PRN_BUILD_BITMAP:
    JSR PRN_EXPAND_ROWS
    JSR PRN_SHRINK_ROWS
    JSR PRN_COMBINE_ROWS
    RTS
; 作用：把 PRN_GLYPH_BUFFER 的 32 个字节各展开成 24 位（PRN_EXPAND_BITS_X3），放 PRN_BITMAP 起（每字节占 3 个字节）。
; 调用者：PRN_BUILD_BITMAP
PRN_EXPAND_ROWS:
    LDX #$00
    LDY #$00
@loop:
    LDA PRN_GLYPH_BUFFER,Y
    STA PRN_BITS_IN
    TXA
    PHA
    JSR PRN_EXPAND_BITS_X3
    PLA
    TAX
    LDA PRN_BITS_OUT
    STA PRN_BITMAP,X
    LDA PRN_BITS_OUT+1
    STA PRN_BITMAP+1,X
    LDA PRN_BITS_OUT+2
    STA PRN_BITMAP+2,X
    INX
    INX
    INX
    INY
    CPY #$20
    BNE @loop
    RTS
; 作用：把 PRN_BITMAP 起每 2 个字节的 16 位数据缩成 8 位（PRN_SHRINK_BITS）写回 PRN_BITMAP 起，共 $30 个，然后复制到后半（PRN_COPY_UP）。
; 调用者：PRN_BUILD_BITMAP
PRN_SHRINK_ROWS:
    LDX #$00
    LDY #$00
@loop:
    LDA PRN_BITMAP,X
    STA PRN_BITS_OUT
    LDA PRN_BITMAP+1,X
    STA PRN_BITS_OUT+1
    TYA
    PHA
    JSR PRN_SHRINK_BITS
    PLA
    TAY
    LDA PRN_BITS_IN
    STA PRN_BITMAP,Y
    INX
    INX
    INY
    CPY #$30
    BNE @loop
    JSR PRN_COPY_UP
    RTS
; 作用：把 PRN_BITS_OUT 起的 16 位数据每 2 位取 1 位（每对位里先移出的那一位）缩成 8 位，放 PRN_BITS_IN。
; 输入：PRN_BITS_OUT、PRN_BITS_OUT+1。
; 输出：PRN_BITS_IN。
; 调用者：PRN_SHRINK_ROWS
PRN_SHRINK_BITS:
    LDY #$08
@loop:
    LSR PRN_BITS_OUT
    ROR PRN_BITS_OUT+1
    ROR PRN_BITS_IN
    LSR PRN_BITS_OUT
    ROR PRN_BITS_OUT+1
    DEY
    BNE @loop
    RTS
; 作用：把 PRN_BITMAP 起 $30 字节复制到 PRN_BITMAP+$30 起。
; 调用者：PRN_SHRINK_ROWS
PRN_COPY_UP:
    LDX #$00
    LDY #$30
@loop:
    LDA PRN_BITMAP,X
    STA PRN_BITMAP,Y
    INY
    INX
    CPX #$30
    BNE @loop
    RTS
; 作用：把相邻两行（各 3 字节）合成 9 字节一组写回 PRN_BITMAP 起：第一行、两行按位或、第二行，用于加粗或补点。
; 输入：PRN_BITMAP+$30 起的两两相邻的行（由 PRN_COPY_UP 复制而来）。
; 输出：PRN_BITMAP 起每组 9 字节。
; 调用者：PRN_BUILD_BITMAP
PRN_COMBINE_ROWS:
    LDX #$00
    LDY #$30
@loop:
    LDA PRN_BITMAP,Y
    STA PRN_BITMAP,X
    ORA PRN_BITMAP+3,Y
    STA PRN_BITMAP+3,X
    LDA PRN_BITMAP+3,Y
    STA PRN_BITMAP+6,X
    LDA PRN_BITMAP+1,Y
    STA PRN_BITMAP+1,X
    ORA PRN_BITMAP+4,Y
    STA PRN_BITMAP+4,X
    LDA PRN_BITMAP+4,Y
    STA PRN_BITMAP+7,X
    LDA PRN_BITMAP+2,Y
    STA PRN_BITMAP+2,X
    ORA PRN_BITMAP+5,Y
    STA PRN_BITMAP+5,X
    LDA PRN_BITMAP+5,Y
    STA PRN_BITMAP+8,X
    INX
    INX
    INX
    INX
    INX
    INX
    INX
    INX
    INX
    INY
    INY
    INY
    INY
    INY
    INY
    CPY #$60
    BNE @loop
    RTS
; 作用：解析文字流里的控制码（SYS_ARG_10=刚读到的字节，同时存入 SYS_ARG_0F），参数用功能 $24 读下一个字节：$92 加参数（$80-$97）查 PRN_FONT_TABLE 设置字宽、字高两个单元 SYS_ARG_03、SYS_ARG_04；$95 加参数（$80-$87）查 PRN_MODE_TABLE 设置打印方式 PRN_MODE；$99 加参数设置重复次数 PRN_REPEAT（参数减 $80）；$9B 加参数设置走纸量 PRN_FEED_AMOUNT（参数减 $80）；其他控制码不处理。
; 输入：SYS_ARG_10=控制码（$80-$9F）。
; 调用者：PRN_FETCH_DATA_BYTE
PRN_PARSE_CONTROL:
    LDA SYS_ARG_10
    STA SYS_ARG_0F
    CMP #$94
    BCS @two_byte_codes
    CMP #$92
    BNE @return
    LDA #$24
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA SYS_ARG_10
    CMP #$80
    BCC @return
    CMP #$98
    BCS @return
    SEC
    SBC #$80
    ASL A
    TAY
    LDA PRN_FONT_TABLE,Y
    STA SYS_ARG_03
    LDA PRN_FONT_TABLE+1,Y
    STA SYS_ARG_04
@return:
    RTS
@two_byte_codes:
    LDA #$24
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA SYS_ARG_10
    LDA SYS_ARG_0F
    CMP #$99
    BCS @code_99_or_9b
    CMP #$95
    BNE @return2
    LDA SYS_ARG_10
    CMP #$80
    BCC @return2
    CMP #$88
    BCS @return2
    SEC
    SBC #$80
    TAX
    LDA PRN_MODE_TABLE,X
    STA PRN_MODE
    JMP @return2
@code_99_or_9b:
    BEQ @set_repeat
    CMP #$9B
    BNE @return2
    LDA SYS_ARG_10
    SEC
    SBC #$80
    STA PRN_FEED_AMOUNT
    JMP @return2
@set_repeat:
    LDA SYS_ARG_10
    SEC
    SBC #$80
    STA PRN_REPEAT
@return2:
    RTS
; 作用：控制码 $95 的参数 $80-$87 对应的 PRN_MODE 值：3、4、5、6、7、1、2、0
; 引用者：PRN_PARSE_CONTROL
PRN_MODE_TABLE:
    .byte $03,$04,$05,$06,$07,$01,$02,$00
; 作用：控制码 $92 的参数 $80-$97 对应的 $0646、$0647：每项 2 字节，第二字节从 PRN_FONT_TABLE+1 起取
; 引用者：PRN_PARSE_CONTROL
PRN_FONT_TABLE:
    .byte $03,$01,$03,$01,$02,$01,$02,$01,$01,$00,$01,$00,$01,$02,$01,$02,$03
    .byte $01,$02,$01,$01,$01,$01,$01,$00,$01,$00,$01,$00,$00,$00,$00,$05
    .byte $01,$04,$01,$03,$01,$03,$00,$02,$00,$02,$00,$01,$02,$01,$02
; 作用：PRN_END_FLAG 或 PRN_LINE_DONE 已置位时由 PRN_FETCH_DATA_BYTE 转到这里，清行缓冲（PRN_CLEAR_LINE_BUFFER）后返回。
; 调用者：PRN_FETCH_DATA_BYTE
PRN_FETCH_CLEAR_BUFFER:
    JMP PRN_CLEAR_LINE_BUFFER
; 作用：取一个待打印的字符，并把它的点阵读进 PRN_GLYPH_BUFFER：先记下当前读位置（PRN_RESUME_*），用功能 $24 读一个字节到 SYS_ARG_10；PRN_JOB_LENGTH 不为 0 也不为 $FF 时 SYS_ARG_0C 是剩余字节数（减到 0 即结束），为 0 或 $FF 时读到与它相同的字节即结束，结束时 PRN_END_FLAG 置 1；$0C、$0D 后面接 $0A，或 $8D 后面接 $8A，表示换行（PRN_LINE_DONE 置 1，打印方式暂存后改为 0）；$80-$9F 是控制码（PRN_PARSE_CONTROL），$1A 忽略；小于 $A0 的字节是半角字符（$7F 当作空格），其余是两个字节的汉字（SYS_ARG_07 记是否汉字）；放不下一行（列数达到 $0478，加字宽表 PRN_ADVANCE_WIDE 或 PRN_ADVANCE_NARROW 的值判断）时也置 PRN_LINE_DONE；最后用功能 $3B 取字模地址，功能 $24 读入 16 字节（半角）或 32 字节（汉字）。
; 输入：当前读位置（SYS_PAGE、FAR_OFFSET_LO/HI）、PRN_JOB_LENGTH、SYS_ARG_0C、SYS_ARG_03（字宽）。
; 输出：PRN_GLYPH_BUFFER=字模点阵；结束或换行时清空它；PRN_RESUME_PAGE、PRN_RESUME_OFFSET_LO/HI=下一次读位置。
; 调用者：PRN_BEGIN_PASS、PRN_FETCH_DATA_BYTE
PRN_FETCH_DATA_BYTE:
    LDA PRN_END_FLAG
    BNE PRN_FETCH_CLEAR_BUFFER
    LDA PRN_LINE_DONE
    BNE PRN_FETCH_CLEAR_BUFFER
    LDA FAR_OFFSET_LO
    STA PRN_RESUME_OFFSET_LO
    LDA FAR_OFFSET_HI
    STA PRN_RESUME_OFFSET_HI
    LDA SYS_PAGE
    STA PRN_RESUME_PAGE
    LDA #$24
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA PRN_JOB_LENGTH
    BEQ @terminator_mode
    CMP #$FF
    BEQ @terminator_mode
    JMP @counted_mode
@terminator_mode:
    LDA SYS_ARG_10
    CMP PRN_JOB_LENGTH
    BEQ @end_of_data
    JMP @got_byte
@end_of_data:
    LDA #$01
    STA PRN_END_FLAG
    JMP PRN_CLEAR_LINE_BUFFER
@counted_mode:
    LDA SYS_ARG_0C
    BNE @got_byte
    JMP @end_of_data
@got_byte:
    LDA SYS_ARG_10
    STA SYS_ARG_07
    DEC SYS_ARG_0C
    CMP #$0C
    BEQ @read_second
    CMP #$0D
    BNE @check_8d
@read_second:
    JSR VEC_SYSCALL
    LDA SYS_ARG_10
    CMP #$0A
    BNE @check_8d
@line_done:
    LDA #$01
    STA PRN_LINE_DONE
    LDA PRN_MODE
    STA PRN_MODE_SAVED
    LDA #$00
    STA PRN_MODE
    LDA FAR_OFFSET_LO
    STA PRN_RESUME_OFFSET_LO
    LDA FAR_OFFSET_HI
    STA PRN_RESUME_OFFSET_HI
    LDA SYS_PAGE
    STA PRN_RESUME_PAGE
    JMP PRN_CLEAR_LINE_BUFFER
@check_8d:
    CMP #$8D
    BNE @check_control
    JSR VEC_SYSCALL
    LDA SYS_ARG_10
    CMP #$8A
    BNE @check_control
    JMP @line_done
@check_control:
    CMP #$80
    BCC @check_eof
    CMP #$A0
    BCS @check_eof
    JSR PRN_PARSE_CONTROL
    JMP PRN_FETCH_DATA_BYTE
@check_eof:
    CMP #$1A
    BNE @check_ascii
    JMP PRN_FETCH_DATA_BYTE
@check_ascii:
    CMP #$A0
    BCS @double_byte
    STA SYS_ARG_08
    LDA #$00
    STA SYS_ARG_07
    JMP @narrow_char
@double_byte:
    LDA PRN_COLUMN_HI
    CMP #$04
    BEQ @near_edge
    JMP @read_low_byte
@near_edge:
    LDA PRN_COLUMN_HI
    PHA
    LDA PRN_COLUMN_LO
    PHA
    LDY SYS_ARG_03
    CMP #$05
    BCC @wide_index
    LDY #$05
@wide_index:
    LDA PRN_ADVANCE_WIDE,Y
    CLC
    ADC PRN_COLUMN_LO
    STA PRN_COLUMN_LO
    LDA PRN_COLUMN_HI
    ADC #$00
    STA PRN_COLUMN_HI
    CMP #$04
    BCC @wide_fits
    BEQ @wide_edge
    JMP @wide_overflow
@wide_edge:
    LDA PRN_COLUMN_LO
    CMP #$78
    BCC @wide_fits
@wide_overflow:
    LDA #$01
    STA PRN_LINE_DONE
    PLA
    STA PRN_COLUMN_LO
    PLA
    STA PRN_COLUMN_HI
    JMP PRN_CLEAR_LINE_BUFFER
@wide_fits:
    PLA
    STA PRN_COLUMN_LO
    PLA
    STA PRN_COLUMN_HI
@read_low_byte:
    JSR VEC_SYSCALL
    LDA SYS_ARG_10
    STA SYS_ARG_08
    BNE @check_ff
    LDA #$01
    STA PRN_END_FLAG
    JMP PRN_CLEAR_LINE_BUFFER
@check_ff:
    CMP #$FF
    BNE @count_second
    LDA #$01
    STA PRN_END_FLAG
    JMP PRN_CLEAR_LINE_BUFFER
@count_second:
    DEC SYS_ARG_0C
    JMP @fetch_glyph
@narrow_char:
    LDA SYS_ARG_08
    CMP #$7F
    BNE @narrow_ready
    LDA #$20
    STA SYS_ARG_08
@narrow_ready:
    LDA PRN_COLUMN_HI
    CMP #$04
    BEQ @narrow_near_edge
    JMP @fetch_glyph
@narrow_near_edge:
    LDA PRN_COLUMN_HI
    PHA
    LDA PRN_COLUMN_LO
    PHA
    LDY SYS_ARG_03
    CMP #$05
    BCC @narrow_index
    LDY #$05
@narrow_index:
    LDA PRN_ADVANCE_NARROW,Y
    CLC
    ADC PRN_COLUMN_LO
    STA PRN_COLUMN_LO
    LDA PRN_COLUMN_HI
    ADC #$00
    STA PRN_COLUMN_HI
    CMP #$04
    BCC @narrow_fits
    BEQ @narrow_edge
    LDA #$01
    STA PRN_LINE_DONE
    PLA
    STA PRN_COLUMN_LO
    PLA
    STA PRN_COLUMN_HI
    JMP PRN_CLEAR_LINE_BUFFER
@narrow_edge:
    LDA PRN_COLUMN_LO
    CMP #$78
    BCC @narrow_fits
    LDA #$01
    STA PRN_LINE_DONE
    PLA
    STA PRN_COLUMN_LO
    PLA
    STA PRN_COLUMN_HI
    JMP PRN_CLEAR_LINE_BUFFER
@narrow_fits:
    PLA
    STA PRN_COLUMN_LO
    PLA
    STA PRN_COLUMN_HI
@fetch_glyph:
    LDA #$80
    STA GLYPH_MODE
    LDA #$3B
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA SYS_PAGE
    PHA
    LDA FAR_OFFSET_LO
    PHA
    LDA FAR_OFFSET_HI
    PHA
    LDA SYS_ARG_01
    STA SYS_PAGE
    LDA GLYPH_ADDR_LO
    STA FAR_OFFSET_LO
    LDA GLYPH_ADDR_HI
    STA FAR_OFFSET_HI
    LDY #$00
    LDA #$24
    STA SYS_FUNCTION
@read_glyph:
    JSR VEC_SYSCALL
    LDA SYS_ARG_10
    STA PRN_GLYPH_BUFFER,Y
    INY
    LDA SYS_ARG_07
    BEQ @glyph_16
    CPY #$20
    BNE @read_glyph
    JMP @glyph_done
@glyph_16:
    CPY #$10
    BNE @read_glyph
@glyph_done:
    PLA
    STA FAR_OFFSET_HI
    STA PRN_RESUME_OFFSET_HI
    PLA
    STA FAR_OFFSET_LO
    STA PRN_RESUME_OFFSET_LO
    PLA
    STA SYS_PAGE
    STA PRN_RESUME_PAGE
    RTS
; 作用：把 PRN_GLYPH_BUFFER 的 32 字节清 0。
; 输出：A=$00，Y=$20。
; 调用者：PRN_FETCH_CLEAR_BUFFER、PRN_FETCH_DATA_BYTE
PRN_CLEAR_LINE_BUFFER:
    LDA #$00
    TAY
@loop:
    STA PRN_GLYPH_BUFFER,Y
    INY
    CPY #$20
    BNE @loop
    RTS
; 作用：全角（汉字）的字宽表，按 SYS_ARG_03（最大 5）取：$10、$20、$30、$40、$50、$60，累加到 PRN_COLUMN。
; 引用者：PRN_FETCH_DATA_BYTE
PRN_ADVANCE_WIDE:
    .byte $10,$20,$30,$40,$50,$60
; 作用：半角字符的字宽表，按 SYS_ARG_03（最大 5）取：$08、$10、$18、$20、$28、$30，累加到 PRN_COLUMN。
; 引用者：PRN_FETCH_DATA_BYTE
PRN_ADVANCE_NARROW:
    .byte $08,$10,$18,$20,$28,$30
; 作用：打印子功能 1：发送 ESC @（$1B $40，Epson ESC/P 的初始化打印机命令）（用例 p0e-printer.mjs）。
; 调用者：PRN_ENTRY（地址表）、PRN_BEGIN_PASS、PRN_SUB_03
PRN_SUB_01:
    LDA #$1B
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA #$40
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    RTS
; 作用：打印子功能 2：发送 ESC <（$1B $3C）。
; 调用者：PRN_ENTRY（地址表）、PRN_END_JOB
PRN_SUB_02:
    LDA #$1B
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA #$3C
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    RTS
; 作用：打印子功能 3：先做子功能 1，再发送回车 $0D。RTS 之后还有一段发送 $07 的代码，没有任何入口能到达。
; 调用者：PRN_ENTRY（地址表）
PRN_SUB_03:
    JSR PRN_SUB_01
    LDA #$0D
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    RTS
    LDA #$07
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    RTS
; 作用：打印子功能 4：发送 ESC J n（$1B $4A，n 取自 SYS_ARG_06）。
; 输入：SYS_ARG_06。
; 调用者：PRN_ENTRY（地址表）、PRN_COUNT_FEED
PRN_SUB_04:
    LDA #$1B
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA #$4A
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA SYS_ARG_06
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    RTS
; 作用：打印子功能 5：发送 ESC $ 加两个字节（PRN_POS_LO、PRN_POS_HI）。
; 输入：PRN_POS_LO、PRN_POS_HI。
; 调用者：PRN_ENTRY（地址表）
PRN_SUB_05:
    LDA #$1B
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA #$24
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA PRN_POS_LO
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA PRN_POS_HI
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    RTS
; 作用：打印子功能 6：发送 ESC \ 加两个字节（PRN_POS_LO、PRN_POS_HI）。
; 输入：PRN_POS_LO、PRN_POS_HI。
; 调用者：PRN_ENTRY（地址表）
PRN_SUB_06:
    LDA #$1B
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA #$5C
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA PRN_POS_LO
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA PRN_POS_HI
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    RTS
; 作用：打印子功能 7：把 PRN_OUT_BYTE 里的一个字节原样发送给打印机（命令类子功能都经它发送）：SYS_STATUS 已是 $FF 时直接返回；等 JOY2_FRAME 位 3 为 1（打印机就绪），等待期间把 PERIPH_CTRL 位 4 置 1，约 8 轮计数没等到就超时，SYS_STATUS 置 $FF；就绪后写到 PRINTER_DATA，用 PERIPH_CTRL 位 2 打一个选通脉冲。
; 输入：PRN_OUT_BYTE。
; 输出：超时时 SYS_STATUS=$FF。
; 副作用：A、X、Y 保存并恢复，改写 PRN_TIMEOUT。
; 调用者：PRN_ENTRY（地址表）、PRN_FEED_PAPER_A、PRN_FEED_PAPER_B、PRN_FEED_PAPER_C、PRN_SUB_01、PRN_SUB_02、PRN_SUB_03、PRN_SUB_04等 11 处
PRN_SUB_07:
    PHA
    TXA
    PHA
    TYA
    PHA
    LDA SYS_STATUS
    CMP #$FF
    BNE @wait_ready
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
@wait_ready:
    LDX #$00
    STX PRN_TIMEOUT
    LDY #$00
@loop:
    LDA JOY2_FRAME
    AND #$08
    BNE @ready
    LDA PERIPH_CTRL
    ORA #$10
    STA PERIPH_CTRL
    DEX
    BNE @loop
    DEY
    BNE @loop
    INC PRN_TIMEOUT
    LDA PRN_TIMEOUT
    CMP #$08
    BNE @loop
    LDA #$FF
    STA SYS_STATUS
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
@ready:
    LDA PRN_OUT_BYTE
    STA PRINTER_DATA
    LDA PERIPH_CTRL
    ORA #$04
    STA PERIPH_CTRL
    LDA PERIPH_CTRL
    AND #$FB
    STA PERIPH_CTRL
    PLA
    TAY
    PLA
    TAX
    PLA
    RTS
; 作用：打印子功能 8：发送位图命令头 ESC * $27 $78 $04（ESC * 39 nL nH，$0478 = 1144 列）（用例 p0e-printer.mjs）。
; 调用者：PRN_ENTRY（地址表）、PRN_BEGIN_PASS
PRN_SUB_08:
    LDA #$1B
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA #$2A
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA #$27
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA #$78
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    LDA #$04
    STA PRN_OUT_BYTE
    JSR PRN_SUB_07
    RTS
; 作用：打印子功能 14（初始化并口）：PRN_PORT_READY 为 0 时置 1，PERIPH_CTRL 置位 $38、JOY2_FRAME 置位 $0C，JOY1 的位 2 脉冲一次，再调用功能 $1B 等 $28 个垂直消隐周期；PRN_PORT_READY 已为 1 则直接返回（用例 p0e-printer.mjs）。
; 输出：PRN_PORT_READY=1。
; 调用者：PRN_ENTRY
PRN_SUB_14:
    LDA PRN_PORT_READY
    BNE @return
    LDA #$01
    STA PRN_PORT_READY
    LDA PERIPH_CTRL
    ORA #$38
    STA PERIPH_CTRL
    LDA JOY2_FRAME
    ORA #$0C
    STA JOY2_FRAME
    LDA JOY1
    AND #$FA
    STA JOY1
    ORA #$04
    STA JOY1
    AND #$FD
    STA JOY1
    LDX #$28
    LDA #$1B
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
@return:
    RTS
; 作用：打印子功能 15（设置纸张类型）：SYS_ARG_0F 为 0-5 时把本页剩余走纸量 PRN_PAGE_LEFT_HI、PRN_PAGE_LEFT_LO 置为 $076C、$09DB、$083A、$05D0、$081D、$071D；大于 5 时只把 PRN_PAGE_LEFT_HI 置为该值（用例 p0e-printer-data.mjs）。
; 输入：SYS_ARG_0F=纸张类型。
; 调用者：PRN_ENTRY（地址表）、PRN_COUNT_FEED
PRN_SUB_15:
    LDA SYS_ARG_0F
    STA PRN_PAGE_LEFT_HI
    BNE @check_type1
    LDA #$07
    STA PRN_PAGE_LEFT_HI
    LDA #$6C
    STA PRN_PAGE_LEFT_LO
    JMP @return
@check_type1:
    CMP #$01
    BNE @check_type2
    LDA #$09
    STA PRN_PAGE_LEFT_HI
    LDA #$DB
    STA PRN_PAGE_LEFT_LO
    JMP @return
@check_type2:
    CMP #$02
    BNE @check_type3
    LDA #$08
    STA PRN_PAGE_LEFT_HI
    LDA #$3A
    STA PRN_PAGE_LEFT_LO
    JMP @return
@check_type3:
    CMP #$03
    BNE @check_type4
    LDA #$05
    STA PRN_PAGE_LEFT_HI
    LDA #$D0
    STA PRN_PAGE_LEFT_LO
    JMP @return
@check_type4:
    CMP #$04
    BNE @check_type5
    LDA #$08
    STA PRN_PAGE_LEFT_HI
    LDA #$1D
    STA PRN_PAGE_LEFT_LO
    JMP @return
@check_type5:
    CMP #$05
    BNE @return
    LDA #$07
    STA PRN_PAGE_LEFT_HI
    LDA #$1D
    STA PRN_PAGE_LEFT_LO
    JMP @return
@return:
    RTS
; 作用：按 A 次扣除本页剩余走纸量 PRN_PAGE_LEFT_HI/PRN_PAGE_LEFT_LO（16 位，每次减 1）；扣完或剩余量小于 $58 时，先用 PRN_SUB_04 发 ESC J 加剩余量低字节，再发 ESC J $58，最后调用 PRN_SUB_15 重新装入页长（换页）。
; 输入：A=进纸量。
; 副作用：SYS_ARG_06 暂时被改写，返回时恢复；X 被改写。
; 调用者：PRN_FEED_PAPER_A、PRN_FEED_PAPER_B、PRN_FEED_PAPER_C
PRN_COUNT_FEED:
    TAX
    BEQ @return
    LDA SYS_ARG_06
    PHA
@loop:
    LDA PRN_PAGE_LEFT_LO
    BNE @dec_low
    LDA PRN_PAGE_LEFT_HI
    BNE @borrow
    JMP @check_page_end
@borrow:
    DEC PRN_PAGE_LEFT_HI
    LDA #$FF
    STA PRN_PAGE_LEFT_LO
    JMP @counted
@dec_low:
    DEC PRN_PAGE_LEFT_LO
@counted:
    DEX
    BNE @loop
@check_page_end:
    LDA PRN_PAGE_LEFT_HI
    BNE @restore
    LDA PRN_PAGE_LEFT_LO
    CMP #$58
    BCS @restore
    LDA PRN_PAGE_LEFT_LO
    STA SYS_ARG_06
    JSR PRN_SUB_04
    LDA #$58
    STA SYS_ARG_06
    JSR PRN_SUB_04
    LDA PRN_PAGE_LEFT_HI
    JSR PRN_SUB_15
@restore:
    PLA
    STA SYS_ARG_06
@return:
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
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00

.rend
