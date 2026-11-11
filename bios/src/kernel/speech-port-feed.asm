; 作用：------------------------------------------------------------------------
; 名称：speech-port-feed.asm
; 说明：NMI 里向 $4302 语音端口逐字节发送数据
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：在 ROM 里接在 kernel/sound-engine.asm 之后
; ------------------------------------------------------------------------
; NMI 末尾每帧调用：$0329 非 0 时把 PORT4302_FEED_PAGE/36/37（页、偏移）处的数据经功能 $24 逐字节读出并送到 $4302，仅当 $4302 状态位 7 为 1 才送，遇 $0F 结束；这是语音数据流的送出（用例 p04-speech.mjs 核对写入序列、指针推进与播完后写 $0F）
; 调用者：NMI_HANDLER
NMI_IO4302_FEED:
    LDA PORT4302_BUSY
    BNE @active
    JMP @return
@active:
    CMP #$0F
    BEQ @finish_feed
    CMP #$FF
    BNE @feed_next
    LDX #$00
@loop:
    INX
    BEQ @return
    LDA SPEECH_PORT
    BPL @loop
    LDA PORT4302_COMMAND
    STA SPEECH_PORT
    STA PORT4302_BUSY
@feed_next:
    LDX #$00
@wait_ready:
    INX
    CPX #$40
    BEQ @return
    LDA SPEECH_PORT
    BPL @wait_ready
    AND #$7F
    CMP #$0F
    BEQ @finish_feed
    LDA PORT4302_FEED_PAGE
    STA SYS_PAGE
    LDA PORT4302_FEED_LO
    STA FAR_OFFSET_LO
    LDA PORT4302_FEED_HI
    STA FAR_OFFSET_HI
    LDA #$24
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA SYS_ARG_10
    STA SPEECH_PORT
    INC PORT4302_FEED_LO
    BNE @feed_next
    INC PORT4302_FEED_HI
    LDA PORT4302_FEED_HI
    CMP #$10
    BCC @feed_next
    SBC #$10
    STA PORT4302_FEED_HI
    INC PORT4302_FEED_PAGE
    JMP @feed_next
@finish_feed:
    LDA #$0F
    STA SPEECH_PORT
    LDA #$00
    STA PORT4302_BUSY
    STA PORT4302_COMMAND
@return:
    RTS
    RTS
; 作用：NMI 钩子：$0630 位 5 打开时换入 $0306 页组，跳到 NMI_HOOK5_VEC_LO/NMI_HOOK5_VEC_HI 指向的程序
; 调用者：NMI_HANDLER
NMI_HOOK_5:
    LDA NMI_HOOK5_PAGE
    STA WINDOW_SAVE_0
    JSR MAP_WINDOWS_8000
    JMP (NMI_HOOK5_VEC_LO)
; 作用：NMI 钩子：$0630 位 4 打开时换入 $0307 页组，跳到 NMI_HOOK4_VEC_LO/NMI_HOOK4_VEC_HI 指向的程序
; 调用者：NMI_HANDLER
NMI_HOOK_4:
    LDA NMI_HOOK4_PAGE
    STA WINDOW_SAVE_0
    JSR MAP_WINDOWS_8000
    JMP (NMI_HOOK4_VEC_LO)
; 作用：NMI（$0630 位 1）：把 PALETTE_PTR_LO/PALETTE_PTR_HI 指向的 $0309 字节写入调色板区 $2040+$030A，页组取 $0308；功能 $5D 在等待垂直消隐时用它
; 调用者：NMI_HANDLER
NMI_PALETTE_UPLOAD:
    LDA PALETTE_UPLOAD_COUNT
    BNE @upload
    RTS
@upload:
    LDA PALETTE_UPLOAD_PAGE
    STA WINDOW_SAVE_0
    JSR MAP_WINDOWS_8000
    LDX PALETTE_UPLOAD_OFFSET
    LDY #$00
@loop:
    LDA (PALETTE_PTR_LO),Y
    STA PPU_EXT_PALETTE,X
    INX
    INY
    CPY PALETTE_UPLOAD_COUNT
    BNE @loop
    RTS
