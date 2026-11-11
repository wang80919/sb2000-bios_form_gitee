; 作用：等 SYS_ARG_0E 个垂直消隐周期（为 0 不等）；NMI 处理程序也读 PPU_STATUS 清标志，实测每个周期占 1 到 3 个模拟器帧。
; 输入：SYS_ARG_0E。
; 调用者：API_75_PORT4302_SEND
DELAY_FRAMES_0651:
    LDA SYS_ARG_0E
    BEQ @return
    TAY
@loop:
    LDA PPU_STATUS
    BPL @loop
@wait_end:
    LDA PPU_STATUS
    BMI @wait_end
    DEY
    BNE @loop
@return:
    RTS
; 作用：把 SYS_ARG_0C/SYS_ARG_0D 这个 16 位数减 1。
; 调用者：API_75_PORT4302_SEND
DEC16_064F:
    LDA SYS_ARG_0C
    SEC
    SBC #$01
    STA SYS_ARG_0C
    LDA SYS_ARG_0D
    SBC #$00
    STA SYS_ARG_0D
    RTS
; 作用：系统调用分发器（所有系统调用都经 VEC_SYSCALL 转到这里）：保存 P、A、X、Y 与窗口页 0-3，SYS_STATUS 清 0，再按 SYS_FUNCTION 分发：小于 $10 的查 SYS_RAM_TABLE（每项 3 字节：页组、地址），换页后调用；$10-$3A、$65 与 $67-$6C、$6E-$75 查 SYSCALL_TABLE（内核里的处理程序）；$3B-$46 页组 $08 的 $8000、$47-$49 页组 $0F 的 $8000、$4A-$58 页组 $09 的 $8500、$59 页组 $0A 的 $8160、$5A-$64 页组 $0B 的 $8000（返回后再调 $13/$80）、$66 页组 $0F 的 $8700、$6D 页组 $0C 的 $8000；$76-$7A 打印服务（PRINT_EXT_ENABLE 为 0 用页组 $0E 的 $8300，否则用 PRINT_EXT_GROUP 的 $8000）；$7B-$7D 文件系统页组 $58，$7E-$81 页组 $5C；其他功能号什么都不做。完成后跳 SYSCALL_RETURN。
; 输入：SYS_FUNCTION、SYS_SUBFUNCTION 与各参数。
; 调用者：VEC_SYSCALL
SYSCALL_DISPATCH:
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
    LDA #$00
    STA SYS_STATUS
    LDA SYS_FUNCTION
    CMP #$10
    BCS @above_0f
    ASL A
    ADC SYS_FUNCTION
    TAY
    LDA SYS_RAM_TABLE+1,Y
    STA CALL_VEC_LO
    LDA SYS_RAM_TABLE+2,Y
    STA CALL_VEC_HI
    LDA SYS_RAM_TABLE,Y
    JSR MAP_WINDOWS_8000
    JSR CALL_VECTOR_10
    JMP SYSCALL_RETURN
@above_0f:
    CMP #$3B
    BCC @rom_table
    CMP #$65
    BCC @banked_display
    CMP #$66
    BEQ @banked_66
    CMP #$6D
    BCS @banked_display
@rom_table:
    SEC
    SBC #$10
    ASL A
    TAY
    LDA SYSCALL_TABLE,Y
    STA CALL_VEC_LO
    LDA SYSCALL_TABLE+1,Y
    STA CALL_VEC_HI
    JSR CALL_VECTOR_10
    JMP SYSCALL_RETURN
@banked_66:
    LDA #$00
    STA CALL_VEC_LO
    LDA #$87
    STA CALL_VEC_HI
    LDA #$0F
    STA WINDOW_SAVE_0
    JSR MAP_WINDOWS_8000
    JSR CALL_VECTOR_10
    JMP SYSCALL_RETURN
@banked_display:
    CMP #$47
    BCS @banked_47
    LDA #$00
    STA CALL_VEC_LO
    LDA #$80
    STA CALL_VEC_HI
    LDA #$08
    JSR MAP_WINDOWS_8000
    JSR CALL_VECTOR_10
    JMP SYSCALL_RETURN
@banked_47:
    CMP #$4A
    BCS @banked_4a
    LDA #$00
    STA CALL_VEC_LO
    LDA #$80
    STA CALL_VEC_HI
    LDA #$0F
    JSR MAP_WINDOWS_8000
    JSR CALL_VECTOR_10
    JMP SYSCALL_RETURN
@banked_4a:
    CMP #$59
    BCS @banked_59
    LDA #$00
    STA CALL_VEC_LO
    LDA #$85
    STA CALL_VEC_HI
    LDA #$09
    JSR MAP_WINDOWS_8000
    JSR CALL_VECTOR_10
    JMP SYSCALL_RETURN
@banked_59:
    CMP #$59
    BNE @banked_5a
    LDA #$60
    STA CALL_VEC_LO
    LDA #$81
    STA CALL_VEC_HI
    LDA #$0A
    JSR MAP_WINDOWS_8000
    JSR CALL_VECTOR_10
    JMP SYSCALL_RETURN
@banked_5a:
    CMP #$65
    BCS @banked_6d
    LDA #$00
    STA CALL_VEC_LO
    LDA #$80
    STA CALL_VEC_HI
    LDA #$0B
    JSR MAP_WINDOWS_8000
    JSR CALL_VECTOR_10
    LDA #$13
    STA SYS_FUNCTION
    LDA #$80
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JMP SYSCALL_RETURN
@banked_6d:
    CMP #$6D
    BNE @check_6e_75
    LDA #$00
    STA CALL_VEC_LO
    LDA #$80
    STA CALL_VEC_HI
    LDA #$0C
    JSR MAP_WINDOWS_8000
    JSR CALL_VECTOR_10
    JMP SYSCALL_RETURN
@check_6e_75:
    CMP #$76
    BCS @print_service
    JMP @rom_table
@print_service:
    CMP #$7B
    BCS @fs_service
    LDA PRINT_EXT_ENABLE
    BNE @print_ext
    LDA #$00
    STA CALL_VEC_LO
    LDA #$83
    STA CALL_VEC_HI
    LDA #$0E
    JMP @call_print
@print_ext:
    LDA #$00
    STA CALL_VEC_LO
    LDA #$80
    STA CALL_VEC_HI
    LDA PRINT_EXT_GROUP
@call_print:
    JSR MAP_WINDOWS_8000
    JSR CALL_VECTOR_10
    JMP SYSCALL_RETURN
@fs_service:
    CMP #$7E
    BCS @group_5c
    LDA #$00
    STA CALL_VEC_LO
    LDA #$80
    STA CALL_VEC_HI
    LDA #$58
    JSR MAP_WINDOWS_8000
    JSR CALL_VECTOR_10
    JMP SYSCALL_RETURN
@group_5c:
    CMP #$82
    BCS SYSCALL_RETURN
    LDA #$00
    STA CALL_VEC_LO
    LDA #$80
    STA CALL_VEC_HI
    LDA #$5C
    JSR MAP_WINDOWS_8000
    JSR CALL_VECTOR_10
    JMP SYSCALL_RETURN
; 作用：系统调用返回：弹出并恢复窗口页 3，随后顺序落入 SYS_RETURN_STUB（恢复窗口页 2、1、0 与窗口映射，弹出 Y、X、A、P 后返回）。
; 调用者：SYSCALL_DISPATCH
SYSCALL_RETURN:
    PLA
    STA WINDOW_SAVE_3
