; 作用：------------------------------------------------------------------------
; 名称：disk-services.asm
; 说明：磁盘服务（功能 $80）：初始化、按面磁道扇区读写与扇区缓冲
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：在 ROM 里接在 disk/floppy-controller.asm 之后
; ------------------------------------------------------------------------
; 磁盘服务 $80/$00：清中断标志，启动软驱、复位到 0 磁道、读出状态后停转
; 调用者：GROUP_5C_DISPATCH_80（地址表）
DISK_INIT:
    JSR FDC_CLEAR_IRQ
    JSR FDC_START
    BCS @fail
    JSR FDC_RECALIBRATE
    BCS @fail
    JSR FDC_STOP
    CLC
    RTS
@fail:
    LDA #$15
    STA DISK_STATUS
    JSR FDC_STOP
    SEC
    RTS
; 作用：磁盘服务 $80/$06：启动软驱，未就绪时 DISK_STATUS=$15
; 调用者：GROUP_5C_DISPATCH_80（地址表）
DISK_START:
    JSR FDC_START
    BCS @fail
    CLC
    RTS
@fail:
    LDA #$15
    STA DISK_STATUS
    SEC
    RTS
; 作用：磁盘服务 $80/$07：软驱停转（每次文件、目录操作之后都会调用）
; 调用者：GROUP_5C_DISPATCH_80（地址表）
DISK_STOP:
    JSR FDC_STOP
    CLC
    RTS
; 作用：把磁盘参数拷到工作变量并校验：扇区 1-18、面 0-1、磁道 0-79，扇区数不能为 0（DISK_MODE 为 1 时不检查），不合格时 DISK_STATUS=$10
; 调用者：DISK_READ_SECTORS、DISK_READ_SECTOR_BUFFER、DISK_WRITE_SECTORS、DISK_WRITE_SECTOR_BUFFER、DISK_SCAN_TRACK
DISK_CHECK_PARAMS:
    LDA DISK_PARAM_BUF_LO
    STA DISK_BUF_PTR_LO
    LDA DISK_PARAM_BUF_HI
    STA DISK_BUF_PTR_HI
    LDA DISK_HEAD
    STA FDC_HEAD
    LDA DISK_TRACK
    STA FDC_TRACK
    LDA DISK_SECTOR
    STA FDC_SECTOR
    LDA FDC_SECTOR
    CMP #$00
    BEQ @invalid
    CMP #$13
    BCS @invalid
    LDA FDC_HEAD
    CMP #$02
    BCS @invalid
    LDA FDC_TRACK
    CMP #$50
    BCS @invalid
    LDA DISK_MODE
    CMP #$01
    BEQ @return_clear
    LDA DISK_COUNT_LO
    ORA DISK_COUNT_HI
    BEQ @invalid
@return_clear:
    CLC
    RTS
@invalid:
    LDA #$10
    STA DISK_STATUS
    SEC
    RTS
; 作用：缓冲指针后移一个 512 字节扇区，满 4K 时换下一个扩展 RAM 页
; 调用者：DISK_READ_SECTORS、DISK_WRITE_SECTORS
DISK_NEXT_BUFFER:
    INC DISK_SECTOR_IN_PAGE
    LDA DISK_SECTOR_IN_PAGE
    AND #$07
    BNE @same_page
    LDA #$00
    STA DISK_SECTOR_IN_PAGE
    INC DISK_CURRENT_PAGE
    LDA DISK_CURRENT_PAGE
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$00
    STA DISK_USER_BUF_LO
    LDA #$B0
    STA DISK_USER_BUF_HI
    JMP @return
@same_page:
    INC DISK_USER_BUF_HI
    INC DISK_USER_BUF_HI
@return:
    RTS
; 作用：移到下一个扇区：扇区 1-18，满了换面，再满了换磁道，超过 79 磁道时 DISK_STATUS=$10
; 调用者：DISK_READ_SECTORS、DISK_WRITE_SECTORS、DISK_SCAN_TRACK
DISK_NEXT_SECTOR:
    INC FDC_SECTOR
    LDA FDC_SECTOR
    CMP #$13
    BCC @return_clear
    LDA #$01
    STA FDC_SECTOR
    INC FDC_HEAD
    LDA FDC_HEAD
    CMP #$02
    BCC @return_clear
    LDA #$00
    STA FDC_HEAD
    INC FDC_TRACK
    LDA FDC_TRACK
    CMP #$50
    BCC @return_clear
    LDA #$10
    STA DISK_STATUS
    SEC
    RTS
@return_clear:
    CLC
    RTS
; 作用：剩余扇区数减一，C=1 表示已经读写完
; 调用者：DISK_READ_SECTORS、DISK_WRITE_SECTORS、DISK_SCAN_TRACK
DISK_NEXT_COUNT:
    SEC
    LDA DISK_COUNT_LO
    SBC #$01
    STA DISK_COUNT_LO
    LDA DISK_COUNT_HI
    SBC #$00
    STA DISK_COUNT_HI
    ORA DISK_COUNT_LO
    BEQ @return_set
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：磁盘服务 $80/$04：连续读 DISK_COUNT 个扇区到扩展 RAM 页 DISK_PAGE 的第 DISK_PAGE_SECTOR 个 512 字节处
; 扇区号 1-18 递增，满了换面、换磁道；成功时 DISK_STATUS=0
; 调用者：GROUP_5C_DISPATCH_80（地址表）
DISK_READ_SECTORS:
    LDA DISK_PAGE
    STA DISK_CURRENT_PAGE
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$00
    STA DISK_USER_BUF_LO
    LDA DISK_PAGE_SECTOR
    ASL A
    ORA #$B0
    STA DISK_USER_BUF_HI
    LDA DISK_PAGE_SECTOR
    STA DISK_SECTOR_IN_PAGE
    LDA #$1E
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA SYS_ARG_0F
    STA DISK_SAVED_NMI_FLAGS
    LDA #$12
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR DISK_CHECK_PARAMS
    BCS @error_check
    JSR FDC_DETECT_MEDIA
    BCS @restore_nmi
@loop:
    LDA #$66
    STA FDC_COMMAND
    JSR FDC_TRANSFER_SECTOR
    BCS @error_check
@advance:
    JSR DISK_NEXT_COUNT
    BCS @finished
    JSR DISK_NEXT_BUFFER
    JSR DISK_NEXT_SECTOR
    BCC @loop
@error_check:
    LDA DISK_MODE
    CMP #$80
    BEQ @restore_nmi
    JMP @advance
@restore_nmi:
    LDA DISK_SAVED_NMI_FLAGS
    AND #$01
    BEQ @return_set
    LDA #$12
    STA SYS_FUNCTION
    LDA #$80
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
@return_set:
    SEC
    RTS
@finished:
    LDA DISK_SAVED_NMI_FLAGS
    AND #$01
    BEQ @success
    LDA #$12
    STA SYS_FUNCTION
    LDA #$80
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
@success:
    LDA #$00
    STA DISK_STATUS
    CLC
    RTS
; 作用：磁盘服务 $80/$02：按 DISK_HEAD、DISK_SECTOR、DISK_TRACK 读一个扇区到 ERAM $6000 缓冲
; 调用者：GROUP_5C_DISPATCH_80（地址表）
DISK_READ_SECTOR_BUFFER:
    LDA #<DISK_BUFFER
    STA DISK_USER_BUF_LO
    LDA #>DISK_BUFFER
    STA DISK_USER_BUF_HI
    LDA #$01
    STA DISK_MODE
    LDA #$1E
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA SYS_ARG_0F
    STA DISK_SAVED_NMI_FLAGS
    LDA #$12
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR DISK_CHECK_PARAMS
    BCS @fail
    JSR FDC_DETECT_MEDIA
    BCS @fail
    LDA #$66
    STA FDC_COMMAND
    JSR FDC_TRANSFER_SECTOR
    BCS @fail
    LDA DISK_SAVED_NMI_FLAGS
    AND #$01
    BEQ @success
    LDA #$12
    STA SYS_FUNCTION
    LDA #$80
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
@success:
    LDA #$00
    STA DISK_STATUS
    CLC
    RTS
@fail:
    LDA DISK_SAVED_NMI_FLAGS
    AND #$01
    BEQ @return_set
    LDA #$12
    STA SYS_FUNCTION
    LDA #$80
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
@return_set:
    SEC
    RTS
; 作用：磁盘服务 $80/$05：从扩展 RAM 连续写 DISK_COUNT 个扇区，参数同 $80/$04
; 调用者：GROUP_5C_DISPATCH_80（地址表）
DISK_WRITE_SECTORS:
    LDA DISK_PAGE
    STA DISK_CURRENT_PAGE
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$00
    STA DISK_USER_BUF_LO
    LDA DISK_PAGE_SECTOR
    ASL A
    ORA #$B0
    STA DISK_USER_BUF_HI
    LDA DISK_PAGE_SECTOR
    STA DISK_SECTOR_IN_PAGE
    LDA #$1E
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA SYS_ARG_0F
    STA DISK_SAVED_NMI_FLAGS
    LDA #$12
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR DISK_CHECK_PARAMS
    BCS @error_check
    JSR FDC_DETECT_MEDIA
    BCS @restore_nmi
@loop:
    LDA #$45
    STA FDC_COMMAND
    JSR FDC_TRANSFER_SECTOR
    PHP
    PLP
    BCS @error_check
@advance:
    JSR DISK_NEXT_COUNT
    BCS @finished
    JSR DISK_NEXT_BUFFER
    JSR DISK_NEXT_SECTOR
    BCC @loop
@error_check:
    LDA DISK_MODE
    CMP #$80
    BEQ @restore_nmi
    LDA DISK_STATUS
    CMP #$13
    BEQ @restore_nmi
    JMP @advance
@restore_nmi:
    LDA DISK_SAVED_NMI_FLAGS
    AND #$01
    BEQ @return_set
    LDA #$12
    STA SYS_FUNCTION
    LDA #$80
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
@return_set:
    SEC
    RTS
@finished:
    LDA DISK_SAVED_NMI_FLAGS
    AND #$01
    BEQ @success
    LDA #$12
    STA SYS_FUNCTION
    LDA #$80
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
@success:
    LDA #$00
    STA DISK_STATUS
    CLC
    RTS
; 作用：磁盘服务 $80/$03：把 ERAM $6000 缓冲写入 DISK_HEAD、DISK_SECTOR、DISK_TRACK 指定的扇区
; 调用者：GROUP_5C_DISPATCH_80（地址表）
DISK_WRITE_SECTOR_BUFFER:
    LDA #<DISK_BUFFER
    STA DISK_USER_BUF_LO
    LDA #>DISK_BUFFER
    STA DISK_USER_BUF_HI
    LDA #$1E
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA SYS_ARG_0F
    STA DISK_SAVED_NMI_FLAGS
    LDA #$12
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$01
    STA DISK_MODE
    JSR DISK_CHECK_PARAMS
    BCS @fail
    JSR FDC_DETECT_MEDIA
    BCS @fail
    LDA #$45
    STA FDC_COMMAND
    JSR FDC_TRANSFER_SECTOR
    PHP
    PLP
    BCS @fail
    LDA DISK_SAVED_NMI_FLAGS
    AND #$01
    BEQ @success
    LDA #$12
    STA SYS_FUNCTION
    LDA #$80
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
@success:
    LDA #$00
    STA DISK_STATUS
    CLC
    RTS
@fail:
    LDA DISK_SAVED_NMI_FLAGS
    AND #$01
    BEQ @return_set
    LDA #$12
    STA SYS_FUNCTION
    LDA #$80
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
@return_set:
    SEC
    RTS
; 作用：磁盘服务 $80/$08：逐扇区读一个磁道，把读失败的扇区记入 DISK_BAD_MAP_1_8 起的三字节位图
; 调用者：GROUP_5C_DISPATCH_80（地址表）
DISK_SCAN_TRACK:
    LDA #<DISK_BUFFER
    STA DISK_USER_BUF_LO
    LDA #>DISK_BUFFER
    STA DISK_USER_BUF_HI
    LDA #$12
    STA DISK_COUNT_LO
    LDA #$00
    STA DISK_COUNT_HI
    LDA #$01
    STA DISK_SECTOR
    LDA #$80
    STA DISK_MODE
    LDA #$00
    STA DISK_BAD_MAP_1_8
    STA DISK_BAD_MAP_9_16
    STA DISK_BAD_MAP_17_18
    LDA #$1E
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA SYS_ARG_0F
    STA DISK_SAVED_NMI_FLAGS
    LDA #$12
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JSR DISK_CHECK_PARAMS
    BCC @loop
    JMP @restore_nmi
@loop:
    LDA #$66
    STA FDC_COMMAND
    JSR FDC_TRANSFER_SECTOR
    BCS @mark_bad
@advance:
    JSR DISK_NEXT_COUNT
    BCC @next_sector
    JMP @restore_nmi
@next_sector:
    JSR DISK_NEXT_SECTOR
    BCC @loop
@mark_bad:
    LDA FDC_SECTOR
    CMP #$09
    BCS @mark_9_16
    TAX
    DEX
    BNE @shift_1_8
    LDA #$80
    ORA DISK_BAD_MAP_1_8
    STA DISK_BAD_MAP_1_8
    JMP @advance
@shift_1_8:
    LDA #$80
@shift_loop1:
    LSR A
    DEX
    BNE @shift_loop1
    ORA DISK_BAD_MAP_1_8
    STA DISK_BAD_MAP_1_8
    JMP @advance
@mark_9_16:
    LDA FDC_SECTOR
    CMP #$11
    BCS @mark_17_18
    SEC
    SBC #$08
    TAX
    DEX
    BNE @shift_9_16
    LDA #$80
    ORA DISK_BAD_MAP_9_16
    STA DISK_BAD_MAP_9_16
    JMP @advance
@shift_9_16:
    LDA #$80
@shift_loop2:
    LSR A
    DEX
    BNE @shift_loop2
    ORA DISK_BAD_MAP_9_16
    STA DISK_BAD_MAP_9_16
    JMP @advance
@mark_17_18:
    LDA FDC_SECTOR
    SEC
    SBC #$10
    TAX
    DEX
    BNE @shift_17_18
    LDA #$80
    ORA DISK_BAD_MAP_17_18
    STA DISK_BAD_MAP_17_18
    JMP @advance
@shift_17_18:
    LDA #$80
@shift_loop3:
    LSR A
    DEX
    BNE @shift_loop3
    ORA DISK_BAD_MAP_17_18
    STA DISK_BAD_MAP_17_18
    JMP @advance
@restore_nmi:
    LDA DISK_SAVED_NMI_FLAGS
    AND #$01
    BEQ @return_clear
    LDA #$12
    STA SYS_FUNCTION
    LDA #$80
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
@return_clear:
    CLC
    RTS
