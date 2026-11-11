; 作用：------------------------------------------------------------------------
; 名称：entry-vectors.asm
; 说明：系统调用返回桩、固定调用入口、跨页调用入口与中断向量
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：在 ROM 里接在 kernel/syscall-dispatch.asm 之后
; ------------------------------------------------------------------------
; 内核返回桩：弹出并恢复窗口页 2、1、0 后返回（也可作为回调地址）
; 调用者：SYSCALL_RETURN（顺序执行到这里）
SYS_RETURN_STUB:
    PLA
    STA WINDOW_SAVE_2
    PLA
    STA WINDOW_SAVE_1
    PLA
; 作用：SYS_RETURN_STUB 的后半：恢复窗口页 0 与窗口映射、弹出 Y、X、A、P 后 RTS（全 ROM 没有引用这个标签的指令，只有内核返回时顺序执行到这里）
; 调用者：SYS_RETURN_STUB（顺序执行到这里）
SYS_RETURN_STUB_MID:
    STA WINDOW_SAVE_0
    JSR RESTORE_WINDOWS_8000
    PLA
    TAY
    PLA
    TAX
    PLA
    PLP
    RTS
; 作用：跳转到 CALL_VEC_LO/CALL_VEC_HI 指向的地址（间接跳转）。
; 调用者：SYSCALL_DISPATCH
CALL_VECTOR_10:
    JMP (CALL_VEC_LO)
    .byte $00,$00
; 作用：内核区末尾的零填充，207 字节，修改 BIOS 时可放新代码
; 引用者：全 ROM 没有指令或地址表引用它
KERNEL_FREE_SPACE:
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
    .byte $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00
; 作用：内核入口向量（$FFEA）：JMP FAR_COPY_IN，供各页以 JSR 调用，SDK 里叫 FAR_COPY_IN
; 调用者：API_3C_3D_PUT_STRING、API_3E_3F_PUT_STRING_ASCII、API_46、API_45_PUT_TEXT_FIELD、API_59、API_5B_UNPACK_TILES、API_5D_WRITE_PALETTE、API_5E等 12 处
VEC_FAR_COPY_IN:
    JMP FAR_COPY_IN
; 作用：内核入口向量（$FFED）：JMP FAR_COPY_OUT，SDK 里叫 FAR_COPY_OUT
; 调用者：API_59
VEC_FAR_COPY_OUT:
    JMP FAR_COPY_OUT
; 作用：内核入口向量（$FFF0）：JMP SYSCALL_DISPATCH，所有系统调用都经它，SDK 里叫 SYSCALL
; 调用者：SHELL_ENTRY、LIB_NEWLINE、LIB_GET_KEY、LIB_PRINT_MESSAGE、LIB_PRINT_STRING、SHELL_VIDEO_SETUP_1、SHELL_WAIT_FRAMES、SHELL_SPRITES_ON等 234 处
VEC_SYSCALL:
    JMP SYSCALL_DISPATCH
; 作用：内核入口向量（$FFF3）：JMP FAR_READ_BYTE，SDK 里叫 FAR_READ_BYTE
; 调用者：API_59、WIN_PREV_ENTRY、TEXT_READ_FAR
VEC_FAR_READ_BYTE:
    JMP FAR_READ_BYTE
; 作用：内核入口向量（$FFF6）：JMP FAR_WRITE_BYTE，SDK 里叫 FAR_WRITE_BYTE
; 调用者：API_59、WIN_PREV_ENTRY
VEC_FAR_WRITE_BYTE:
    JMP FAR_WRITE_BYTE
    .byte $00,$84,$C0,$00,$C0,$2B,$C1
