; 作用：重置 FAT 缓存（FS_FAT_CACHE_RESET）后重新装入全部 FAT（FS_FAT_LOAD_ALL）；缓存有效时再把 ERAM 页 $F5 的 512 字节（引导扇区）复制到 DISK_BUFFER，空闲簇搜索起点 FS_FREE_HINT 置 2。
; 输出：C=0 成功，C=1 失败。
; 调用者：FS_READ_BOOT_SECTOR
FS_FAT_RELOAD:
    JSR FS_FAT_CACHE_RESET
    LDA FS_FAT_CACHE_VALID
    BMI @cache_ready
    JSR FS_FAT_LOAD_ALL
    BCC @cache_ready
    SEC
    RTS
@cache_ready:
    LDA #$F5
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$00
    STA FS_SRC_PTR_LO
    LDA #$B0
    STA FS_SRC_PTR_HI
    LDA #<DISK_BUFFER
    STA FS_DST_PTR_LO
    LDA #>DISK_BUFFER
    STA FS_DST_PTR_HI
    JSR FS_COPY_512
    LDA #$02
    STA FS_FREE_HINT_LO
    LDA #$00
    STA FS_FREE_HINT_HI
    CLC
    RTS
; 作用：文件服务 $7C/$05：按偏移与长度从句柄读数据到扩展 RAM 页（FILE_OFFSET_0-2、FILE_SIZE_0-2、FILE_START_PAGE；用例 p58-fs-chain.mjs）
; 要求句柄方式小于 3，否则出错码 $28；FILE_SIZE_0-2 为读取长度，不能为 0（出错码 $25）
; FILE_OFFSET_0-2 为文件内偏移，FILE_START_PAGE 为目的页；超出文件大小时出错码 $14
; 调用者：FS_DISPATCH_7C（地址表）
FS_READ_AT:
    LDA #$80
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA FS_DRIVE_LETTER
    PHA
    LDX FILE_HANDLE_OFFSET
    LDA FH_DRIVE,X
    STA FS_DRIVE_LETTER
    LDA FILE_HANDLES,X
    CMP #$03
    BCC @mode_ok
    LDA #$28
    STA DOS_ERROR
    JMP @fail
@mode_ok:
    LDA #$00
    STA FS_IO_FLAGS
    LDA FILE_HANDLE_OFFSET
    STA FS_ACTIVE_HANDLE
    LDX FS_ACTIVE_HANDLE
    LDA FH_DRIVE,X
    STA FILE_DRIVE_LETTER
    JSR FS_CHECK_DRIVE_LETTER
    BCS @fail
    JSR FS_CHECK_LENGTH_NONZERO
    BCS @fail
    JSR FS_SEEK_SECTOR
    BCS @fail
    JSR FS_PLAN_READ
    BCS @fail
    JSR FS_TRANSFER_START
    BCS @fail
    JSR FS_TAIL_NONZERO
    PLA
    STA FS_DRIVE_LETTER
    CLC
    RTS
@fail:
    PLA
    STA FS_DRIVE_LETTER
    SEC
    RTS
; 作用：检查读写范围：FILE_SIZE_0-2（长度）三个字节全为 0 时出错码 $25；FILE_OFFSET 必须小于句柄文件大小，FILE_OFFSET 加长度不能进位也不能超过文件大小，否则出错码 $14（保存和恢复 DOS_TEMP_0 至 DOS_TEMP_2）。
; 输入：FILE_OFFSET_0-2、FILE_SIZE_0-2、FS_ACTIVE_HANDLE。
; 输出：C=0 范围合法，C=1 出错（DOS_ERROR）。
; 调用者：FS_READ_AT
FS_CHECK_LENGTH_NONZERO:
    LDA DOS_TEMP_0
    PHA
    LDA DOS_TEMP_1
    PHA
    LDA DOS_TEMP_2
    PHA
    LDA FILE_SIZE_0
    ORA FILE_SIZE_1
    ORA FILE_SIZE_2
    BNE @check_range
    LDA #$25
    STA DOS_ERROR
    PLA
    STA DOS_TEMP_2
    PLA
    STA DOS_TEMP_1
    PLA
    STA DOS_TEMP_0
    SEC
    RTS
@check_range:
    SEC
    LDX FS_ACTIVE_HANDLE
    LDA FILE_OFFSET_0
    SBC FH_SIZE_0,X
    LDA FILE_OFFSET_1
    SBC FH_SIZE_1,X
    LDA FILE_OFFSET_2
    SBC FH_SIZE_2,X
    BCC @check_end
    JMP @out_of_range
@check_end:
    CLC
    LDA FILE_OFFSET_0
    ADC FILE_SIZE_0
    STA DOS_TEMP_0
    LDA FILE_OFFSET_1
    ADC FILE_SIZE_1
    STA DOS_TEMP_1
    LDA FILE_OFFSET_2
    ADC FILE_SIZE_2
    STA DOS_TEMP_2
    BCC @check_size
    JMP @out_of_range
@check_size:
    SEC
    LDX FS_ACTIVE_HANDLE
    LDA FH_SIZE_0,X
    SBC DOS_TEMP_0
    LDA FH_SIZE_1,X
    SBC DOS_TEMP_1
    LDA FH_SIZE_2,X
    SBC DOS_TEMP_2
    BCS @ok
    JMP @out_of_range
@ok:
    PLA
    STA DOS_TEMP_2
    PLA
    STA DOS_TEMP_1
    PLA
    STA DOS_TEMP_0
    CLC
    RTS
@out_of_range:
    LDA #$14
    STA DOS_ERROR
    PLA
    STA DOS_TEMP_2
    PLA
    STA DOS_TEMP_1
    PLA
    STA DOS_TEMP_0
    SEC
    RTS
; 作用：成批读写的起点：以 FILE_START_PAGE 起的缓冲和 FS_BODY_SECTORS 的扇区数为准，先数连续扇区（FS_COUNT_CONTIGUOUS），再换算 CHS，按 FS_IO_FLAGS 是否为 0 选读（$80/$04）或写（$80/$05），一段一段传完；磁盘出错时 DOS_ERROR 取 DISK_STATUS；读完后若 FS_PLAN_FLAG 非 0 再把缓冲尾部的下一扇区装入 FAT 缓存（FS_FAT_LOAD）。
; 输入：FS_TARGET_LBA、FS_BODY_SECTORS、FILE_START_PAGE、FS_IO_FLAGS。
; 输出：C=0 成功，C=1 失败。
; 调用者：FS_READ_AT、FS_WRITE_AT
FS_TRANSFER_START:
    LDA FS_TARGET_LBA_LO
    STA FS_LBA_LO
    LDA FS_TARGET_LBA_HI
    STA FS_LBA_HI
    LDA FS_BODY_SECTORS_LO
    STA FS_LEFT_SECTORS_LO
    LDA FS_BODY_SECTORS_HI
    STA FS_LEFT_SECTORS_HI
    LDA FILE_START_PAGE
    STA FS_XFER_PAGE
    LDA #$00
    STA FS_XFER_PAGE_SECTOR
@loop:
    JSR FS_COUNT_CONTIGUOUS
    BCC @run_counted
    JMP @return_set
@run_counted:
    PHP
    JSR FS_LBA_TO_CHS
    LDA FS_NEXT_LBA_LO
    STA FS_LBA_LO
    LDA FS_NEXT_LBA_HI
    STA FS_LBA_HI
    LDA FS_RUN_SECTORS_LO
    STA DISK_COUNT_LO
    LDA FS_RUN_SECTORS_HI
    STA DISK_COUNT_HI
    LDA FS_XFER_PAGE
    STA DISK_PAGE
    LDA FS_XFER_PAGE_SECTOR
    STA DISK_PAGE_SECTOR
    LDA #$80
    STA DISK_MODE
    LDA FS_IO_FLAGS
    BNE @write_run
    LDA #$80
    STA SYS_FUNCTION
    LDA #$04
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JMP @check_status
@write_run:
    LDA #$80
    STA SYS_FUNCTION
    LDA #$05
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
@check_status:
    LDA DISK_STATUS
    BEQ @run_done
    STA DOS_ERROR
    PLP
    JMP @return_set
@run_done:
    PLP
    BPL @all_done
    CLC
    LDA FS_XFER_PAGE_SECTOR
    ADC FS_RUN_SECTORS_LO
    STA FS_RUN_SECTORS_LO
    LDA FS_RUN_SECTORS_HI
    ADC #$00
    STA FS_RUN_SECTORS_HI
    LDA FS_RUN_SECTORS_LO
    AND #$07
    STA FS_XFER_PAGE_SECTOR
    LDA FS_RUN_SECTORS_HI
    LSR A
    STA FS_RUN_SECTORS_HI
    LDA FS_RUN_SECTORS_LO
    ROR A
    STA FS_RUN_SECTORS_LO
    LDA FS_RUN_SECTORS_HI
    LSR A
    STA FS_RUN_SECTORS_HI
    LDA FS_RUN_SECTORS_LO
    ROR A
    STA FS_RUN_SECTORS_LO
    LDA FS_RUN_SECTORS_HI
    LSR A
    STA FS_RUN_SECTORS_HI
    LDA FS_RUN_SECTORS_LO
    ROR A
    STA FS_RUN_SECTORS_LO
    CLC
    ADC FS_XFER_PAGE
    STA FS_XFER_PAGE
    JMP @loop
@all_done:
    LDA FS_IO_FLAGS
    BEQ @check_plan
    JMP @return_clear
@check_plan:
    LDA FS_PLAN_FLAG
    BEQ @return_clear
    CLC
    LDA FS_TARGET_LBA_LO
    ADC FS_BODY_SECTORS_LO
    STA FS_LBA_LO
    LDA FS_TARGET_LBA_HI
    ADC FS_BODY_SECTORS_HI
    STA FS_LBA_HI
    JSR FS_LBA_TO_CHS
    JSR FS_FAT_LOAD
    BCS @return_set
@return_clear:
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：从 FS_LBA 起沿簇链数连续的扇区数，结果放 FS_RUN_SECTORS_LO/HI，FS_LEFT_SECTORS 相应减少。
; 输入：FS_LBA、FS_LEFT_SECTORS。
; 输出：C=0 成功，A=1 到达剩余扇区末尾，A=$FF 后面的扇区不连续；C=1 簇链出错。
; 调用者：FS_TRANSFER_START
FS_COUNT_CONTIGUOUS:
    LDA FS_LBA_LO
    STA FS_EXPECT_LBA_LO
    PHA
    LDA FS_LBA_HI
    STA FS_EXPECT_LBA_HI
    PHA
    LDA #$01
    STA FS_RUN_SECTORS_LO
    LDA #$00
    STA FS_RUN_SECTORS_HI
@loop:
    SEC
    LDA FS_LEFT_SECTORS_LO
    SBC #$01
    STA FS_LEFT_SECTORS_LO
    LDA FS_LEFT_SECTORS_HI
    SBC #$00
    STA FS_LEFT_SECTORS_HI
    ORA FS_LEFT_SECTORS_LO
    BEQ @end_reached
    JSR FS_NEXT_SECTOR
    BCS @error
    LDA FS_NEXT_LBA_LO
    STA FS_LBA_LO
    LDA FS_NEXT_LBA_HI
    STA FS_LBA_HI
    CLC
    LDA FS_EXPECT_LBA_LO
    ADC #$01
    STA FS_EXPECT_LBA_LO
    LDA FS_EXPECT_LBA_HI
    ADC #$00
    STA FS_EXPECT_LBA_HI
    SEC
    LDA FS_NEXT_LBA_LO
    SBC FS_EXPECT_LBA_LO
    STA DOS_TEMP_3
    LDA FS_NEXT_LBA_HI
    SBC FS_EXPECT_LBA_HI
    ORA DOS_TEMP_3
    BNE @gap
    CLC
    LDA FS_RUN_SECTORS_LO
    ADC #$01
    STA FS_RUN_SECTORS_LO
    LDA FS_RUN_SECTORS_HI
    ADC #$00
    STA FS_RUN_SECTORS_HI
    JMP @loop
@end_reached:
    PLA
    STA FS_LBA_HI
    PLA
    STA FS_LBA_LO
    LDA #$01
    CLC
    RTS
@gap:
    PLA
    STA FS_LBA_HI
    PLA
    STA FS_LBA_LO
    LDA #$FF
    CLC
    RTS
@error:
    PLA
    STA FS_LBA_HI
    PLA
    STA FS_LBA_LO
    SEC
    RTS
; 作用：扇区内偏移 FS_SECTOR_OFFSET 为 0 时 C=0 直接返回；否则（代码阅读）从缓冲 $B000 窗口的 FS_SECTOR_OFFSET 处起，逐字节（FS_NEXT_BYTE，长度取 FILE_SIZE，每页末 $C0 时换下一页）复制到缓冲开头，使读入的数据与调用者要求的偏移对齐。
; 输出：C=0。
; 调用者：FS_READ_AT
FS_TAIL_NONZERO:
    LDA FS_SECTOR_OFFSET_LO
    ORA FS_SECTOR_OFFSET_HI
    BNE @has_tail
    CLC
    RTS
@has_tail:
    LDA FILE_SIZE_0
    STA FS_REMAIN_0
    LDA FILE_SIZE_1
    STA FS_REMAIN_1
    LDA FILE_SIZE_2
    STA FS_REMAIN_2
    LDA FILE_START_PAGE
    STA FS_COPY_PAGE
    LDA #$00
    STA LIST_PTR_LO
    STA STR_PTR_LO
    LDA #$B0
    STA LIST_PTR_HI
    STA STR_PTR_HI
    CLC
    LDA LIST_PTR_LO
    ADC FS_SECTOR_OFFSET_LO
    STA LIST_PTR_LO
    LDA LIST_PTR_HI
    ADC FS_SECTOR_OFFSET_HI
    STA LIST_PTR_HI
@loop:
    LDA FS_COPY_PAGE
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDY #$00
@copy_byte:
    LDA (LIST_PTR_LO),Y
    STA (STR_PTR_LO),Y
    JSR FS_NEXT_BYTE
    BCC @check_page_end
    JMP @return_clear
@check_page_end:
    LDA LIST_PTR_HI
    CMP #$C0
    BNE @copy_byte
    LDA #$00
    STA LIST_PTR_LO
    LDA #$B0
    STA LIST_PTR_HI
    CLC
    LDA FS_COPY_PAGE
    ADC #$01
    STA FS_NEXT_PAGE
    LDA FS_REMAIN_1
    AND #$FE
    ORA FS_REMAIN_2
    BNE @copy_across_page
    LDA FS_PLAN_FLAG
    BEQ @copy_across_page
    LDA #<DISK_BUFFER
    STA LIST_PTR_LO
    LDA #>DISK_BUFFER
    STA LIST_PTR_HI
    LDA FS_COPY_PAGE
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDY #$00
@copy_from_buffer:
    LDA (LIST_PTR_LO),Y
    STA (STR_PTR_LO),Y
    JSR FS_NEXT_BYTE
    BCS @return_clear
    BCC @copy_from_buffer
@copy_across_page:
    LDA FS_NEXT_PAGE
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDY #$00
    LDA (LIST_PTR_LO),Y
    STA DOS_TEMP_3
    LDA FS_COPY_PAGE
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDY #$00
    LDA DOS_TEMP_3
    STA (STR_PTR_LO),Y
    JSR FS_NEXT_BYTE
    BCS @return_clear
    LDA STR_PTR_HI
    CMP #$C0
    BNE @copy_across_page
    LDA FS_NEXT_PAGE
    STA FS_COPY_PAGE
    LDA #$00
    STA STR_PTR_LO
    LDA #$B0
    STA STR_PTR_HI
    JMP @loop
@return_clear:
    CLC
    RTS
; 作用：把剩余长度 FS_REMAIN_0-2（3 字节）减 1，减到 0 时 C=1（另一出口），否则 STR_PTR 与 LIST_PTR 前进一字节，C=0。
; 输出：C=0 还有剩余，C=1 已用完。
; 调用者：FS_TAIL_NONZERO
FS_NEXT_BYTE:
    SEC
    LDA FS_REMAIN_0
    SBC #$01
    STA FS_REMAIN_0
    LDA FS_REMAIN_1
    SBC #$00
    STA FS_REMAIN_1
    LDA FS_REMAIN_2
    SBC #$00
    STA FS_REMAIN_2
    ORA FS_REMAIN_1
    ORA FS_REMAIN_0
    BEQ @return_set
    CLC
    LDA STR_PTR_LO
    ADC #$01
    STA STR_PTR_LO
    LDA STR_PTR_HI
    ADC #$00
    STA STR_PTR_HI
    CLC
    LDA LIST_PTR_LO
    ADC #$01
    STA LIST_PTR_LO
    LDA LIST_PTR_HI
    ADC #$00
    STA LIST_PTR_HI
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：文件服务 $7C/$06：按偏移与长度把扩展 RAM 页的数据写入句柄（参数同 $7C/$05；用例 p58-fs-chain.mjs）
; 句柄方式为 0 或不小于 3 时出错码 $28；方式 1 的新文件第一次写入时分配簇
; 调用者：FS_DISPATCH_7C（地址表）
FS_WRITE_AT:
    LDA #$80
    STA SYS_FUNCTION
    LDA #$00
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA FS_DRIVE_LETTER
    PHA
    LDA #$00
    STA FS_WRITE_NEW_FLAG
    LDX FILE_HANDLE_OFFSET
    LDA FH_DRIVE,X
    STA FS_DRIVE_LETTER
    LDA FILE_HANDLES,X
    CMP #$03
    BCC @mode_ok
    LDA #$28
    STA DOS_ERROR
    JMP @fail
@mode_ok:
    CMP #$00
    BNE @check_mode1
    LDA #$28
    STA DOS_ERROR
    JMP @fail
@check_mode1:
    CMP #$01
    BNE @mode2
    LDX FILE_HANDLE_OFFSET
    LDA #$00
    STA FH_SIZE_0,X
    STA FH_SIZE_2,X
    LDA #$02
    STA FH_SIZE_1,X
    LDA #$01
    STA FS_WRITE_NEW_FLAG
    JMP @prepare
@mode2:
    LDX FILE_HANDLE_OFFSET
    LDA FH_CLUSTER_LO,X
    ORA FH_CLUSTER_HI,X
    BNE @prepare
    LDA #$00
    STA FS_CLUSTER_LO
    LDA #$00
    STA FS_CLUSTER_HI
    LDA #$01
    STA FS_ALLOC_COUNT_LO
    LDA #$00
    STA FS_ALLOC_COUNT_HI
    JSR FS_ALLOC_CHAIN
    BCC @alloc_done
    JMP @fail
@alloc_done:
    LDX FILE_HANDLE_OFFSET
    LDA FS_FAT_VALUE_LO
    STA FH_CLUSTER_LO,X
    LDA FS_FAT_VALUE_HI
    STA FH_CLUSTER_HI,X
@prepare:
    LDA #$00
    ORA #$80
    STA FS_IO_FLAGS
    LDA FILE_HANDLE_OFFSET
    STA FS_ACTIVE_HANDLE
    JSR FS_FIRST_WRITE_SIZE
    JSR FS_CHECK_OFFSET_IN_FILE
    BCS @fail
    JSR FS_ADVANCE_OFFSET
    BCS @fail
    JSR FS_SEEK_SECTOR
    BCS @fail
    JSR FS_PLAN_READ
    BCS @fail
    JSR FS_PLAN_TRANSFER
    BCS @fail
    JSR FS_TRANSFER_START
    BCS @fail
    JSR FS_UPDATE_HANDLE_SIZE
    PLA
    STA FS_DRIVE_LETTER
    CLC
    RTS
@fail:
    PLA
    STA FS_DRIVE_LETTER
    SEC
    RTS
; 作用：句柄文件大小为 0 时设成 $0200，FS_WRITE_NEW_FLAG 置 1，FS_IO_FLAGS 置位 4。
; 输入：FILE_HANDLE_OFFSET。
; 调用者：FS_WRITE_AT
FS_FIRST_WRITE_SIZE:
    LDX FILE_HANDLE_OFFSET
    LDA FH_SIZE_0,X
    ORA FH_SIZE_1,X
    ORA FH_SIZE_2,X
    BNE @return_clear
    LDA #$00
    STA FH_SIZE_0,X
    STA FH_SIZE_2,X
    LDA #$02
    STA FH_SIZE_1,X
    LDA #$01
    STA FS_WRITE_NEW_FLAG
    LDA FS_IO_FLAGS
    ORA #$10
    STA FS_IO_FLAGS
@return_clear:
    CLC
    RTS
; 作用：读写长度为 0，或 FILE_OFFSET 小于句柄文件大小时 C=0 返回；否则出错码 $14、C=1。
; 输入：FILE_OFFSET_0-2、FILE_SIZE_0-2、FS_ACTIVE_HANDLE。
; 调用者：FS_WRITE_AT
FS_CHECK_OFFSET_IN_FILE:
    LDA FILE_SIZE_0
    ORA FILE_SIZE_1
    ORA FILE_SIZE_2
    BNE @check_offset
    JMP @out_of_range
@check_offset:
    LDX FS_ACTIVE_HANDLE
    SEC
    LDA FILE_OFFSET_0
    SBC FH_SIZE_0,X
    LDA FILE_OFFSET_1
    SBC FH_SIZE_1,X
    LDA FILE_OFFSET_2
    SBC FH_SIZE_2,X
    BCC @return_clear
    JMP @out_of_range
@return_clear:
    CLC
    RTS
@out_of_range:
    LDA #$14
    STA DOS_ERROR
    SEC
    RTS
; 作用：FILE_OFFSET 加上读写长度 FILE_SIZE 得到结束位置（进位时出错）；与句柄文件大小比较：没超过文件末尾时 FS_IO_FLAGS 位 4 清 0；超过时位 4 置位，并为文件增长的部分分配扇区（算出结束位置所在扇区与现有最后扇区（FS_SEEK_LAST_BYTE）的差，不为 0 就 FS_ALLOC_SECTORS）。返回前恢复 FILE_OFFSET。
; 输出：C=0 成功，C=1 失败。
; 调用者：FS_WRITE_AT
FS_ADVANCE_OFFSET:
    LDA FILE_OFFSET_0
    PHA
    LDA FILE_OFFSET_1
    PHA
    LDA FILE_OFFSET_2
    PHA
    CLC
    LDA FILE_OFFSET_0
    ADC FILE_SIZE_0
    STA FILE_OFFSET_0
    LDA FILE_OFFSET_1
    ADC FILE_SIZE_1
    STA FILE_OFFSET_1
    LDA FILE_OFFSET_2
    ADC FILE_SIZE_2
    STA FILE_OFFSET_2
    BCC @no_carry
    JMP @done_fail
@no_carry:
    LDX FS_ACTIVE_HANDLE
    SEC
    LDA FH_SIZE_0,X
    SBC FILE_OFFSET_0
    LDA FH_SIZE_1,X
    SBC FILE_OFFSET_1
    LDA FH_SIZE_2,X
    SBC FILE_OFFSET_2
    BCC @file_grows
    LDA FS_IO_FLAGS
    AND #$EF
    STA FS_IO_FLAGS
    JMP @done_ok
@file_grows:
    LDA FS_IO_FLAGS
    ORA #$10
    STA FS_IO_FLAGS
    SEC
    LDA FILE_OFFSET_0
    SBC #$01
    STA FILE_OFFSET_0
    LDA FILE_OFFSET_1
    SBC #$00
    STA FILE_OFFSET_1
    LDA FILE_OFFSET_2
    SBC #$00
    STA FILE_OFFSET_2
    JSR FS_OFFSET_TO_SECTOR
    BCC @index_computed
    JMP @done_fail
@index_computed:
    LDA FS_SECTOR_INDEX_LO
    STA FS_ALLOC_COUNT_LO
    LDA FS_SECTOR_INDEX_HI
    STA FS_ALLOC_COUNT_HI
    JSR FS_SEEK_LAST_BYTE
    BCC @last_sector_found
    JMP @done_fail
@last_sector_found:
    SEC
    LDA FS_ALLOC_COUNT_LO
    SBC FS_SECTOR_INDEX_LO
    STA FS_ALLOC_COUNT_LO
    LDA FS_ALLOC_COUNT_HI
    SBC FS_SECTOR_INDEX_HI
    STA FS_ALLOC_COUNT_HI
    BCS @count_ready
    JMP @done_fail
@count_ready:
    LDA FS_ALLOC_COUNT_LO
    ORA FS_ALLOC_COUNT_HI
    BNE @alloc_sectors
    JMP @done_ok
@alloc_sectors:
    LDA FS_TARGET_LBA_LO
    STA FS_LBA_LO
    LDA FS_TARGET_LBA_HI
    STA FS_LBA_HI
    JSR FS_ALLOC_SECTORS
    BCC @done_ok
    JMP @done_fail
@done_ok:
    PLA
    STA FILE_OFFSET_2
    PLA
    STA FILE_OFFSET_1
    PLA
    STA FILE_OFFSET_0
    CLC
    RTS
@done_fail:
    PLA
    STA FILE_OFFSET_2
    PLA
    STA FILE_OFFSET_1
    PLA
    STA FILE_OFFSET_0
    SEC
    RTS
; 作用：定位到文件最后一个字节所在的扇区：FILE_OFFSET 取句柄大小减 1（空文件为 0），再调用 FS_SEEK_SECTOR
; 调用者：FS_ADVANCE_OFFSET
FS_SEEK_LAST_BYTE:
    LDA FILE_OFFSET_0
    PHA
    LDA FILE_OFFSET_1
    PHA
    LDA FILE_OFFSET_2
    PHA
    LDX FS_ACTIVE_HANDLE
    LDA FH_SIZE_0,X
    ORA FH_SIZE_1,X
    ORA FH_SIZE_2,X
    BEQ @empty_file
    JMP @use_size_minus1
@empty_file:
    JMP @use_zero
@use_zero:
    LDA #$00
    STA FILE_OFFSET_0
    STA FILE_OFFSET_1
    STA FILE_OFFSET_2
    JMP @do_seek
@use_size_minus1:
    LDX FS_ACTIVE_HANDLE
    SEC
    LDA FH_SIZE_0,X
    SBC #$01
    STA FILE_OFFSET_0
    LDA FH_SIZE_1,X
    SBC #$00
    STA FILE_OFFSET_1
    LDA FH_SIZE_2,X
    SBC #$00
    STA FILE_OFFSET_2
    BCS @seek
    JMP @done_fail
@seek:
    JMP @do_seek
@do_seek:
    JSR FS_SEEK_SECTOR
    BCC @done_ok
    JMP @done_fail
@done_ok:
    PLA
    STA FILE_OFFSET_2
    PLA
    STA FILE_OFFSET_1
    PLA
    STA FILE_OFFSET_0
    CLC
    RTS
@done_fail:
    PLA
    STA FILE_OFFSET_2
    PLA
    STA FILE_OFFSET_1
    PLA
    STA FILE_OFFSET_0
    SEC
    RTS
; 作用：FS_IO_FLAGS 位 4 或 FS_WRITE_NEW_FLAG 非 0 时，把句柄文件大小改成 FILE_OFFSET 加读写长度。
; 输入：FILE_OFFSET_0-2、FILE_SIZE_0-2、FS_ACTIVE_HANDLE。
; 调用者：FS_WRITE_AT
FS_UPDATE_HANDLE_SIZE:
    LDA FS_IO_FLAGS
    AND #$10
    BNE @update
    LDA FS_WRITE_NEW_FLAG
    BNE @update
    JMP @return_clear
@update:
    LDX FS_ACTIVE_HANDLE
    CLC
    LDA FILE_OFFSET_0
    ADC FILE_SIZE_0
    STA FH_SIZE_0,X
    LDA FILE_OFFSET_1
    ADC FILE_SIZE_1
    STA FH_SIZE_1,X
    LDA FILE_OFFSET_2
    ADC FILE_SIZE_2
    STA FH_SIZE_2,X
@return_clear:
    CLC
    RTS
; 作用：写文件前把读写长度加扇区内偏移后拆成头部（不足一扇区）、整扇区与尾部三段（代码阅读）：尾部长度 FS_TAIL_LEN 为长度加偏移对 512 取余；头尾不足一扇区时先用 $80/$02 把边界扇区读进 DISK_BUFFER，并在 $B000 窗口的缓冲页里倒序搬动数据（FS_PREV_BYTE），再把边界扇区原有的内容补回缓冲（FS_COPY_BYTES_65B2），使写出的整扇区数据连续。
; 输入：FILE_SIZE_0-2、FS_SECTOR_OFFSET、FS_BODY_SECTORS、FS_TARGET_LBA、FS_PLAN_FLAG、FILE_START_PAGE。
; 输出：C=0 成功，C=1 失败（DOS_ERROR）。
; 调用者：FS_WRITE_AT
FS_PLAN_TRANSFER:
    CLC
    LDA FILE_SIZE_0
    ADC FS_SECTOR_OFFSET_LO
    STA FS_TAIL_LEN_LO
    LDA FILE_SIZE_1
    ADC FS_SECTOR_OFFSET_HI
    AND #$01
    STA FS_TAIL_LEN_HI
    ORA FS_TAIL_LEN_LO
    BEQ @tail_zero
    JMP @tail_nonzero
@tail_zero:
    LDA FS_SECTOR_OFFSET_LO
    ORA FS_SECTOR_OFFSET_HI
    BNE @has_offset
    JMP @return_clear
@has_offset:
    SEC
    LDA FS_BODY_SECTORS_LO
    SBC #$01
    STA DOS_TEMP_5
    LDA FS_BODY_SECTORS_HI
    SBC #$00
    STA DOS_TEMP_3
    LDA DOS_TEMP_3
    LSR A
    STA DOS_TEMP_3
    LDA DOS_TEMP_5
    ROR A
    STA DOS_TEMP_5
    LDA DOS_TEMP_3
    LSR A
    STA DOS_TEMP_3
    LDA DOS_TEMP_5
    ROR A
    STA DOS_TEMP_5
    LDA DOS_TEMP_3
    LSR A
    STA DOS_TEMP_3
    LDA DOS_TEMP_5
    ROR A
    CLC
    ADC FILE_START_PAGE
    STA FS_PLAN_WORK_0
    SEC
    LDA FS_BODY_SECTORS_LO
    SBC #$01
    AND #$07
    TAY
    LDA #$00
    STA FS_PLAN_WORK_1
    LDA #$B0
    STA FS_PLAN_WORK_2
    TYA
    BEQ @pointer_ready
@add_page_offset:
    CLC
    LDA FS_PLAN_WORK_2
    ADC #$02
    STA FS_PLAN_WORK_2
    DEY
    BNE @add_page_offset
@pointer_ready:
    CLC
    LDA FS_PLAN_WORK_1
    ADC #$FF
    STA FS_PLAN_WORK_1
    LDA FS_PLAN_WORK_2
    ADC #$01
    STA FS_PLAN_WORK_2
    SEC
    LDA FS_PLAN_WORK_1
    SBC FS_SECTOR_OFFSET_LO
    STA FS_PLAN_WORK_3
    LDA FS_PLAN_WORK_2
    SBC FS_SECTOR_OFFSET_HI
    STA FS_PLAN_WORK_4
    JMP @move_data
@tail_nonzero:
    LDA FS_PLAN_FLAG
    BEQ @no_plan_flag
    JMP @plan_flag
@no_plan_flag:
    LDA FS_BODY_SECTORS_LO
    STA FS_PLAN_WORK_3
    LDA FS_BODY_SECTORS_HI
    STA FS_PLAN_WORK_4
    LDA FILE_START_PAGE
    STA FS_PLAN_WORK_0
    LDA #$00
    STA FS_PLAN_WORK_1
    LDA #$B0
    STA FS_PLAN_WORK_2
    LDA FS_TARGET_LBA_HI
    STA FS_LBA_HI
    LDA FS_TARGET_LBA_LO
    STA FS_LBA_LO
    JSR FS_ADVANCE_SECTORS
    BCC @advance_ok
    JMP @return_set
@advance_ok:
    JSR FS_LBA_TO_CHS
    LDA #$80
    STA SYS_FUNCTION
    LDA #$02
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DISK_STATUS
    BEQ @read_ok
    LDA DISK_STATUS
    STA DOS_ERROR
    JMP @return_set
@read_ok:
    LDA FS_PLAN_WORK_0
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    CLC
    LDA #$00
    ADC FS_TAIL_LEN_LO
    STA FS_SRC_PTR_LO
    LDA #$60
    ADC FS_TAIL_LEN_HI
    STA FS_SRC_PTR_HI
    CLC
    LDA FS_PLAN_WORK_1
    ADC FS_TAIL_LEN_LO
    STA FS_DST_PTR_LO
    LDA FS_PLAN_WORK_2
    ADC FS_TAIL_LEN_HI
    STA FS_DST_PTR_HI
    SEC
    LDA #$00
    SBC FS_TAIL_LEN_LO
    STA FS_PLAN_WORK_5
    LDA #$02
    SBC FS_TAIL_LEN_HI
    STA FS_PLAN_WORK_6
    JSR FS_COPY_BYTES_65B2
    LDA FS_SECTOR_OFFSET_LO
    ORA FS_SECTOR_OFFSET_HI
    BNE @has_offset2
    JMP @return_clear
@has_offset2:
    CLC
    LDA FS_PLAN_WORK_1
    ADC FS_TAIL_LEN_LO
    STA FS_PLAN_WORK_1
    LDA FS_PLAN_WORK_2
    ADC FS_TAIL_LEN_HI
    STA FS_PLAN_WORK_2
    SEC
    LDA FS_PLAN_WORK_1
    SBC #$01
    STA FS_PLAN_WORK_1
    LDA FS_PLAN_WORK_2
    SBC #$00
    STA FS_PLAN_WORK_2
    SEC
    LDA FS_PLAN_WORK_1
    SBC FS_SECTOR_OFFSET_LO
    STA FS_PLAN_WORK_3
    LDA FS_PLAN_WORK_2
    SBC FS_SECTOR_OFFSET_HI
    STA FS_PLAN_WORK_4
    JMP @move_data
@plan_flag:
    CLC
    LDA FS_BODY_SECTORS_LO
    ADC #$01
    STA FS_PLAN_WORK_3
    LDA FS_BODY_SECTORS_HI
    ADC #$00
    STA FS_PLAN_WORK_4
    LDA FILE_START_PAGE
    STA FS_PLAN_WORK_0
    LDA #$00
    STA FS_PLAN_WORK_1
    LDA #$B0
    STA FS_PLAN_WORK_2
    LDA FS_TARGET_LBA_HI
    STA FS_LBA_HI
    LDA FS_TARGET_LBA_LO
    STA FS_LBA_LO
    JSR FS_ADVANCE_SECTORS
    BCC @advance_ok2
    JMP @return_set
@advance_ok2:
    JSR FS_LBA_TO_CHS
    LDA #$80
    STA SYS_FUNCTION
    LDA #$02
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DISK_STATUS
    BEQ @read_ok2
    LDA DISK_STATUS
    STA DOS_ERROR
    JMP @return_set
@read_ok2:
    DEC FS_PLAN_WORK_0
    LDA FS_PLAN_WORK_0
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    SEC
    LDA #$00
    SBC FS_SECTOR_OFFSET_LO
    STA FS_SRC_PTR_LO
    LDA #$C0
    SBC FS_SECTOR_OFFSET_HI
    STA FS_SRC_PTR_HI
    LDA #<DISK_BUFFER
    STA FS_DST_PTR_LO
    LDA #>DISK_BUFFER
    STA FS_DST_PTR_HI
    LDA FS_TAIL_LEN_LO
    STA FS_PLAN_WORK_5
    LDA FS_TAIL_LEN_HI
    STA FS_PLAN_WORK_6
    JSR FS_COPY_BYTES_65B2
    LDA #$80
    STA SYS_FUNCTION
    LDA #$03
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$FF
    STA FS_PLAN_WORK_1
    LDA #$BF
    STA FS_PLAN_WORK_2
    SEC
    LDA FS_PLAN_WORK_1
    SBC FS_SECTOR_OFFSET_LO
    STA FS_PLAN_WORK_3
    LDA FS_PLAN_WORK_2
    SBC FS_SECTOR_OFFSET_HI
    STA FS_PLAN_WORK_4
@move_data:
    LDA FS_PLAN_WORK_0
    STA FS_PLAN_WORK_5
    LDA FS_PLAN_WORK_3
    STA LIST_PTR_LO
    LDA FS_PLAN_WORK_4
    STA LIST_PTR_HI
    LDA FS_PLAN_WORK_1
    STA STR_PTR_LO
    LDA FS_PLAN_WORK_2
    STA STR_PTR_HI
    LDA FILE_SIZE_0
    STA FS_PLAN_WORK_0
    LDA FILE_SIZE_1
    STA FS_PLAN_WORK_1
    LDA FILE_SIZE_2
    STA FS_PLAN_WORK_2
@move_page:
    LDA FS_PLAN_WORK_5
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
@move_byte:
    LDY #$00
    LDA (LIST_PTR_LO),Y
    STA (STR_PTR_LO),Y
    JSR FS_PREV_BYTE
    BCC @byte_moved
    JMP @restore_sector
@byte_moved:
    LDA LIST_PTR_HI
    CMP #$AF
    BNE @move_byte
    SEC
    LDA FS_PLAN_WORK_5
    SBC #$01
    STA FS_PLAN_WORK_6
    LDA #$FF
    STA LIST_PTR_LO
    LDA #$BF
    STA LIST_PTR_HI
@move_across:
    LDA FS_PLAN_WORK_6
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDY #$00
    LDA (LIST_PTR_LO),Y
    STA DOS_TEMP_3
    LDA FS_PLAN_WORK_5
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDY #$00
    LDA DOS_TEMP_3
    STA (STR_PTR_LO),Y
    JSR FS_PREV_BYTE
    BCS @restore_sector
    LDA STR_PTR_HI
    CMP #$AF
    BNE @move_across
    LDA #$FF
    STA STR_PTR_LO
    LDA #$BF
    STA STR_PTR_HI
    DEC FS_PLAN_WORK_5
    JMP @move_page
@restore_sector:
    LDA FS_TARGET_LBA_LO
    STA FS_LBA_LO
    LDA FS_TARGET_LBA_HI
    STA FS_LBA_HI
    JSR FS_LBA_TO_CHS
    LDA #$80
    STA SYS_FUNCTION
    LDA #$02
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DISK_STATUS
    BEQ @write_back_sector
    LDA DISK_STATUS
    STA DOS_ERROR
    JMP @return_set
@write_back_sector:
    LDA FS_PLAN_WORK_5
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #<DISK_BUFFER
    STA FS_SRC_PTR_LO
    LDA #>DISK_BUFFER
    STA FS_SRC_PTR_HI
    LDA #$00
    STA FS_DST_PTR_LO
    LDA #$B0
    STA FS_DST_PTR_HI
    LDA FS_SECTOR_OFFSET_LO
    STA FS_PLAN_WORK_5
    LDA FS_SECTOR_OFFSET_HI
    STA FS_PLAN_WORK_6
    JSR FS_COPY_BYTES_65B2
@return_clear:
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：把 FS_SRC_PTR 指向的数据复制到 FS_DST_PTR，共 FS_COPY_LEN_LO/HI 个字节。
; 输入：FS_SRC_PTR_LO/HI、FS_DST_PTR_LO/HI、FS_COPY_LEN_LO/HI。
; 调用者：FS_PLAN_TRANSFER、FS_COPY_BYTES_65B2
FS_COPY_BYTES_65B2:
    LDY #$00
    LDA (FS_SRC_PTR_LO),Y
    STA (FS_DST_PTR_LO),Y
    CLC
    LDA FS_SRC_PTR_LO
    ADC #$01
    STA FS_SRC_PTR_LO
    LDA FS_SRC_PTR_HI
    ADC #$00
    STA FS_SRC_PTR_HI
    CLC
    LDA FS_DST_PTR_LO
    ADC #$01
    STA FS_DST_PTR_LO
    LDA FS_DST_PTR_HI
    ADC #$00
    STA FS_DST_PTR_HI
    SEC
    LDA FS_COPY_LEN_LO
    SBC #$01
    STA FS_COPY_LEN_LO
    LDA FS_COPY_LEN_HI
    SBC #$00
    STA FS_COPY_LEN_HI
    ORA FS_COPY_LEN_LO
    BNE FS_COPY_BYTES_65B2
    RTS
; 作用：按 FS_SECTORS_LEFT 个扇区沿簇链前进，FS_LBA 随之更新，每进一个扇区缓冲地址高字节 FS_BUF_ADDR_HI 加 $02（到 $C0 回绕成 $B0 并让页号 FS_BUF_PAGE 加 1）；簇链走不下去出错码 $11。
; 输入：FS_LBA、FS_SECTORS_LEFT_LO/HI、FS_BUF_ADDR_HI、FS_BUF_PAGE。
; 输出：C=0 成功，C=1 失败。
; 调用者：FS_PLAN_TRANSFER、FS_ADVANCE_SECTORS
FS_ADVANCE_SECTORS:
    SEC
    LDA FS_SECTORS_LEFT_LO
    SBC #$01
    STA FS_SECTORS_LEFT_LO
    LDA FS_SECTORS_LEFT_HI
    SBC #$00
    STA FS_SECTORS_LEFT_HI
    ORA FS_SECTORS_LEFT_LO
    BEQ @return_clear
    JSR FS_NEXT_SECTOR
    BCC @advance
    JMP @error
@advance:
    LDA FS_NEXT_LBA_HI
    STA FS_LBA_HI
    LDA FS_NEXT_LBA_LO
    STA FS_LBA_LO
    CLC
    LDA FS_BUF_ADDR_HI
    ADC #$02
    STA FS_BUF_ADDR_HI
    CMP #$C0
    BNE FS_ADVANCE_SECTORS
    LDA #$B0
    STA FS_BUF_ADDR_HI
    INC FS_BUF_PAGE
    JMP FS_ADVANCE_SECTORS
@return_clear:
    CLC
    RTS
@error:
    LDA #$11
    STA DOS_ERROR
    SEC
    RTS
; 作用：与 FS_NEXT_BYTE 相反：剩余长度 FS_REMAIN_0-2 减 1，减到 0 时 C=1，否则 STR_PTR 与 LIST_PTR 后退一字节，C=0。
; 输出：C=0 还有剩余，C=1 已用完。
; 调用者：FS_PLAN_TRANSFER
FS_PREV_BYTE:
    SEC
    LDA FS_REMAIN_0
    SBC #$01
    STA FS_REMAIN_0
    LDA FS_REMAIN_1
    SBC #$00
    STA FS_REMAIN_1
    LDA FS_REMAIN_2
    SBC #$00
    STA FS_REMAIN_2
    ORA FS_REMAIN_1
    ORA FS_REMAIN_0
    BEQ @return_set
    SEC
    LDA STR_PTR_LO
    SBC #$01
    STA STR_PTR_LO
    LDA STR_PTR_HI
    SBC #$00
    STA STR_PTR_HI
    SEC
    LDA LIST_PTR_LO
    SBC #$01
    STA LIST_PTR_LO
    LDA LIST_PTR_HI
    SBC #$00
    STA LIST_PTR_HI
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：文件服务 $7C/$04：重命名：句柄要以方式 2 打开（否则出错码 $28，句柄空闲时 $2E），新名称（8+3）取自 PATH_BUFFER；先以方式 0 查新名，已存在出错码 $20，不存在才改写目录项并更新句柄里的名称
; 调用者：FS_DISPATCH_7C（地址表）
FS_RENAME:
    LDA FILE_HANDLE_OFFSET
    STA FS_ACTIVE_HANDLE
    LDA FILE_HANDLE_OFFSET
    PHA
    LDX FILE_HANDLE_OFFSET
    LDA FILE_HANDLES,X
    CMP #$FF
    BNE @check_mode
    LDA #$2E
    STA DOS_ERROR
    JMP @fail
@check_mode:
    CMP #$02
    BEQ @check_new_name
    LDA #$28
    STA DOS_ERROR
    JMP @fail
@check_new_name:
    JSR PATH_TO_CMD_TAIL
    JSR FS_BUILD_FULL_PATH
    LDA #$00
    STA FILE_MODE
    JSR FS_OPEN
    LDA DOS_ERROR
    CMP #$02
    BEQ @do_rename
    LDA DOS_ERROR
    BNE @fail
    LDA #$20
    STA DOS_ERROR
    JSR FS_CLOSE
@fail:
    PLA
    STA FILE_HANDLE_OFFSET
    SEC
    RTS
@do_rename:
    LDY #$00
    JSR CMD_TAIL_TO_PATH
    JSR FS_PARSE_NAME
    PLA
    STA FILE_HANDLE_OFFSET
    JSR FS_HANDLE_STORE_NAME
    LDA #$00
    STA DOS_ERROR
    CLC
    RTS
; 作用：把解析出的 8 字节名称（FS_NAME_FILE 起）与 3 字节扩展名存进当前句柄 FS_ACTIVE_HANDLE 的 FH_NAME。
; 输入：FS_ACTIVE_HANDLE、FS_NAME_FILE。
; 调用者：FS_RENAME
FS_HANDLE_STORE_NAME:
    LDX FS_ACTIVE_HANDLE
    LDY #$00
@loop:
    CPY #$08
    BEQ @store_ext
    LDA FS_NAME_FILE,Y
    STA FH_NAME,X
    INX
    INY
    JMP @loop
@store_ext:
    LDX FS_ACTIVE_HANDLE
    LDY #$00
@store_ext_loop:
    CPY #$03
    BEQ @return_clear
    LDA FS_NAME_FILE+8,Y
    STA FH_NAME+8,X
    INX
    INY
    JMP @store_ext_loop
@return_clear:
    CLC
    RTS
; 作用：用句柄的驱动器字母、:、\ 组成完整路径放进 PATH_BUFFER；句柄标志为 $FF 时再拼上名称（FS_BUILD_NAME_83）
; 调用者：FS_RENAME
FS_BUILD_FULL_PATH:
    LDY #$00
    LDX FS_ACTIVE_HANDLE
    LDA FH_DRIVE,X
    STA PATH_BUFFER,Y
    INY
    LDA #$3A
    STA PATH_BUFFER,Y
    INY
    LDA #$5C
    STA PATH_BUFFER,Y
    INY
    LDA FH_FLAGS,X
    CMP #$FF
    BNE @path_ready
    JSR FS_BUILD_NAME_83
@path_ready:
    JSR CMD_TAIL_TO_PATH
    CLC
    RTS
; 作用：把句柄里的 8+3 名称（空格结尾）整理成 NAME.EXT 追加到 PATH_BUFFER
; 输入：Y=PATH_BUFFER 里的写入位置，FS_ACTIVE_HANDLE。
; 调用者：FS_BUILD_FULL_PATH
FS_BUILD_NAME_83:
    LDX FS_ACTIVE_HANDLE
    LDA #$00
    STA LIB_GROUP
@loop:
    LDA LIB_GROUP
    CMP #$08
    BEQ @ext
    LDA FH_PARENT_NAME,X
    CMP #$20
    BEQ @ext
    STA PATH_BUFFER,Y
    INX
    INY
    INC LIB_GROUP
    JMP @loop
@ext:
    LDX FS_ACTIVE_HANDLE
    LDA FH_PARENT_NAME+8,X
    INX
    CMP #$20
    BEQ @finish
    PHA
    LDA #$2E
    STA PATH_BUFFER,Y
    INY
    PLA
    STA PATH_BUFFER,Y
    INY
    LDA FH_PARENT_NAME+8,X
    INX
    CMP #$20
    BEQ @finish
    STA PATH_BUFFER,Y
    INY
    LDA FH_PARENT_NAME+8,X
    CMP #$20
    BEQ @finish
    STA PATH_BUFFER,Y
    INY
@finish:
    LDA #$5C
    STA PATH_BUFFER,Y
    INY
    CLC
    RTS
