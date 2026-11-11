; 作用：------------------------------------------------------------------------
; 名称：floppy-interrupt.asm
; 说明：软驱控制器的中断服务例程
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：在 ROM 里接在 kernel/timer-and-hooks.asm 之后
; ------------------------------------------------------------------------
; 向软驱控制器发命令 $08（读中断状态），读回两个结果字节存入 FDC_RESULT_0/1，成功 C=0；超时 FDC_ERROR_FLAG 置 $FF、C=1
; 调用者：FDC_IRQ_HANDLER
FDC_ISR_SENSE_INTERRUPT:
    LDA #$08
    JSR FDC_ISR_WRITE_BYTE
    BCS @fail
    JSR FDC_ISR_READ_BYTE
    BCS @fail
    STA FDC_RESULT_0
    JSR FDC_ISR_READ_BYTE
    BCS @fail
    STA FDC_RESULT_1
    LDA #$00
    STA FDC_ERROR_FLAG
    CLC
    RTS
@fail:
    LDA #$FF
    STA FDC_ERROR_FLAG
    SEC
    RTS
; 作用：等软驱控制器就绪（状态高 2 位为 $80）后写入数据寄存器；超时 C=1；等待中遇到可读数据先读走丢弃
; 调用者：FDC_ISR_SENSE_INTERRUPT
FDC_ISR_WRITE_BYTE:
    PHA
    LDA #$00
    STA FDC_BYTE_TIMEOUT_LO
    STA FDC_BYTE_TIMEOUT_HI
@loop:
    LDA FDC_STATUS
    AND #$C0
    CMP #$80
    BEQ @ready
    CMP #$C0
    BNE @next_try
    LDA FDC_DATA
@next_try:
    DEC FDC_BYTE_TIMEOUT_LO
    BNE @loop
    DEC FDC_BYTE_TIMEOUT_HI
    BNE @loop
    PLA
    SEC
    RTS
@ready:
    PLA
    STA FDC_DATA
    CLC
    RTS
; 作用：等软驱控制器有数据可读（状态高 2 位为 $C0）后读数据寄存器，A 返回；超时 C=1
; 调用者：FDC_ISR_SENSE_INTERRUPT、FDC_ISR_READ_RESULT7、FDC_ISR_READ_RESULT_CHECKED
FDC_ISR_READ_BYTE:
    LDA #$00
    STA FDC_BYTE_TIMEOUT_LO
    STA FDC_BYTE_TIMEOUT_LO
@loop:
    LDA FDC_STATUS
    AND #$C0
    CMP #$C0
    BEQ @ready
    DEC FDC_BYTE_TIMEOUT_LO
    BNE @loop
    DEC FDC_BYTE_TIMEOUT_HI
    BNE @loop
    SEC
    RTS
@ready:
    LDA FDC_DATA
    CLC
    RTS
; 作用：连续读 7 个结果字节，存入 FDC_RESULT_0 至 FDC_RESULT_6
; 调用者：FDC_IRQ_HANDLER
FDC_ISR_READ_RESULT7:
    JSR FDC_ISR_READ_BYTE
    STA FDC_RESULT_0
    JSR FDC_ISR_READ_BYTE
    STA FDC_RESULT_1
    JSR FDC_ISR_READ_BYTE
    STA FDC_RESULT_2
    JSR FDC_ISR_READ_BYTE
    STA FDC_RESULT_3
    JSR FDC_ISR_READ_BYTE
    STA FDC_RESULT_4
    JSR FDC_ISR_READ_BYTE
    STA FDC_RESULT_5
    JSR FDC_ISR_READ_BYTE
    STA FDC_RESULT_6
    RTS
; 作用：软驱中断（$4033 位 3）：置 FDC_IRQ_FLAG，FDC_ERROR_FLAG 清 0；FDC_ISR_MODE 为 0 时读中断状态（FDC_ISR_SENSE_INTERRUPT），否则读 7 字节结果（FDC_ISR_READ_RESULT_CHECKED）
; 调用者：IRQ_HANDLER
FDC_IRQ_HANDLER:
    LDA #$FF
    STA FDC_IRQ_FLAG
    LDA #$00
    STA FDC_ERROR_FLAG
    LDA FDC_ISR_MODE
    BNE FDC_ISR_READ_RESULT_CHECKED
    JSR FDC_ISR_SENSE_INTERRUPT
    RTS
    LDA FDC_STATUS
    AND #$30
    CMP #$10
    BNE @not_ready
    JSR FDC_ISR_READ_RESULT7
    RTS
@not_ready:
    LDA #$00
    STA FDC_IRQ_FLAG
    RTS
    JSR $DFED
    RTS
; 作用：读 7 个结果字节存入 FDC_RESULT_0 至 6，任何一次超时则 FDC_ERROR_FLAG 置 $FF、C=1
; 调用者：FDC_IRQ_HANDLER
FDC_ISR_READ_RESULT_CHECKED:
    JSR FDC_ISR_READ_BYTE
    BCS @fail
    STA FDC_RESULT_0
    JSR FDC_ISR_READ_BYTE
    BCS @fail
    STA FDC_RESULT_1
    JSR FDC_ISR_READ_BYTE
    BCS @fail
    STA FDC_RESULT_2
    JSR FDC_ISR_READ_BYTE
    BCS @fail
    STA FDC_RESULT_3
    JSR FDC_ISR_READ_BYTE
    BCS @fail
    STA FDC_RESULT_4
    JSR FDC_ISR_READ_BYTE
    BCS @fail
    STA FDC_RESULT_5
    JSR FDC_ISR_READ_BYTE
    BCS @fail
    STA FDC_RESULT_6
    RTS
@fail:
    LDA #$FF
    STA FDC_ERROR_FLAG
    SEC
    RTS
