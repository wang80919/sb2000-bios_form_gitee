; 作用：------------------------------------------------------------------------
; 名称：interrupt-handlers.asm
; 说明：NMI 与 IRQ 中断处理
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：在 ROM 里接在 kernel/reset-and-boot.asm 之后
; ------------------------------------------------------------------------
; NMI 中断：保存寄存器与窗口页，再按 $0630 的位依次做：位 5 钩子、位 2 精灵 DMA、位 7 条带动画、位 1 调色板上传，随后写 PPU 控制/掩码/滚动寄存器，推进 $0304/$0305 与随机数，再做位 4 钩子、位 3 读手柄、位 6 声音更新，最后 NMI_IO4302_FEED，恢复窗口后返回
; 调用者：全 ROM 没有指令或地址表引用它（只能由外部直接进入）
NMI_HANDLER:
    PHP
    PHA
    TXA
    PHA
    TYA
    PHA
    LDA WINDOW_SAVE_0
    PHA
    LDA WINDOW_SAVE_1
    PHA
    LDA WINDOW_SAVE_2
    PHA
    LDA WINDOW_SAVE_3
    PHA
    LDA NMI_FLAGS
    AND #$20
    BEQ @check_dma
    JSR NMI_HOOK_5
@check_dma:
    LDA NMI_FLAGS
    AND #$04
    BEQ @check_bars
    LDA #$00
    STA OAM_ADDR
    LDA #$02
    STA OAM_DMA
    LDA PPU_STATUS
@check_bars:
    LDA NMI_FLAGS
    AND #$80
    BEQ @check_palette
    JSR NMI_BAR_ANIMATION
@check_palette:
    LDA NMI_FLAGS
    AND #$02
    BEQ @write_ppu
    JSR NMI_PALETTE_UPLOAD
@write_ppu:
    LDA PPU_STATUS
    LDA PPU_CTRL_SHADOW
    STA PPU_CTRL
    LDA PPU_MASK_SHADOW
    STA PPU_MASK
    LDA PPU_SCROLL_X_SHADOW
    STA PPU_SCROLL
    LDA PPU_SCROLL_Y_SHADOW
    STA PPU_SCROLL
    INC NMI_COUNTER_UP
    DEC NMI_COUNTER_DOWN
    JSR RANDOM_STEP
    LDA NMI_FLAGS
    AND #$10
    BEQ @check_pads
    JSR NMI_HOOK_4
@check_pads:
    LDA NMI_FLAGS
    AND #$08
    BEQ @check_sound
    JSR READ_PADS
@check_sound:
    LDA NMI_FLAGS
    AND #$40
    BEQ @feed
    JSR NMI_SOUND_UPDATE
@feed:
    JSR NMI_IO4302_FEED
    PLA
    STA WINDOW_SAVE_3
    PLA
    STA WINDOW_SAVE_2
    PLA
    STA WINDOW_SAVE_1
    PLA
    STA WINDOW_SAVE_0
    JSR RESTORE_WINDOWS_8000
    PLA
    TAY
    PLA
    TAX
    PLA
    PLP
    RTI
; 作用：IRQ 中断：读 $4033 得到中断源并写回 $4032 使能位，按位分发：位 7 定时器、位 6 鼠标（再调鼠标钩子）、位 5 键盘（再调键盘钩子）、位 4 与位 1、位 2 三个钩子、位 3 软驱；各钩子默认是 HOOK_NOP，可由功能 $13 子功能 $88 安装
; 调用者：全 ROM 没有指令或地址表引用它（只能由外部直接进入）
IRQ_HANDLER:
    PHP
    PHA
    TXA
    PHA
    TYA
    PHA
    LDA WINDOW_SAVE_0
    PHA
    LDA WINDOW_SAVE_1
    PHA
    LDA WINDOW_SAVE_2
    PHA
    LDA WINDOW_SAVE_3
    PHA
    LDA IRQ_PENDING
    STA IRQ_PENDING_COPY
    BNE @dispatch
    JMP @finish
@dispatch:
    AND #$80
    BEQ @check_mouse
    ORA IRQ_MASK_SHADOW
    STA IRQ_MASK
    JSR TIMER_IRQ_HANDLER
@check_mouse:
    LDA IRQ_PENDING_COPY
    AND #$40
    BEQ @check_kbd
    ORA IRQ_MASK_SHADOW
    STA IRQ_MASK
    JSR MOUSE_IRQ_HANDLER
    JSR MOUSE_CALL_HOOK
@check_kbd:
    LDA IRQ_PENDING_COPY
    AND #$20
    BEQ @check_irq4
    ORA IRQ_MASK_SHADOW
    STA IRQ_MASK
    JSR KBD_HANDLER
    JSR KBD_CALL_HOOK
@check_irq4:
    LDA IRQ_PENDING_COPY
    AND #$10
    BEQ @check_fdc
    ORA IRQ_MASK_SHADOW
    STA IRQ_MASK
    JSR IRQ4_CALL_HOOK
@check_fdc:
    LDA IRQ_PENDING_COPY
    AND #$08
    BEQ @check_irq2
    ORA IRQ_MASK_SHADOW
    STA IRQ_MASK
    JSR FDC_IRQ_HANDLER
@check_irq2:
    LDA IRQ_PENDING_COPY
    AND #$04
    BEQ @check_irq1
    ORA IRQ_MASK_SHADOW
    STA IRQ_MASK
    JSR IRQ2_CALL_HOOK
@check_irq1:
    LDA IRQ_PENDING_COPY
    AND #$02
    BEQ @finish
    ORA IRQ_MASK_SHADOW
    STA IRQ_MASK
    JSR IRQ1_CALL_HOOK
@finish:
    LDA IRQ_MASK_SHADOW
    STA IRQ_MASK
    PLA
    STA WINDOW_SAVE_3
    PLA
    STA WINDOW_SAVE_2
    PLA
    STA WINDOW_SAVE_1
    PLA
    STA WINDOW_SAVE_0
    JSR RESTORE_WINDOWS_8000
    PLA
    TAY
    PLA
    TAX
    PLA
    PLP
    RTI
