; 作用：把 A 加到 FS_PTR_LO/FS_PTR_HI（目录项指针前进）。
; 输入：A=前进的字节数。
; 输出：FS_PTR_LO/FS_PTR_HI 已更新，A=FS_PTR_HI。
; 调用者：FS_FIND_FREE_DIR_ENTRY、FS_WRITE_BACK_DIR_ENTRY、FS_SCAN_DIR、FS_DELETE_SCAN_DIR、FS_MAKE_DIR
FS_PTR_ADD_A:
    CLC
    ADC FS_PTR_LO
    STA FS_PTR_LO
    LDA FS_PTR_HI
    ADC #$00
    STA FS_PTR_HI
    RTS
; 作用：看 FS_PTR_LO/FS_PTR_HI 指向的目录项：首字节为 0 或 $E5（空闲）时 C=0，否则 C=1。
; 输入：FS_PTR_LO/FS_PTR_HI。
; 输出：C=0 空闲，C=1 已占用；Y=0。
; 调用者：FS_FIND_FREE_DIR_ENTRY、FS_DELETE_SCAN_DIR
FS_DIR_ENTRY_FREE:
    LDY #$00
    LDA (FS_PTR_LO),Y
    BEQ @return_clear
    CMP #$E5
    BEQ @return_clear
    SEC
    RTS
@return_clear:
    CLC
    RTS
; 作用：文件服务 $7B/$00：前进到下一扇区。FAT 区与根目录区的扇区连续，直接加 1；数据区内当前簇还有扇区就加 1，到簇尾就用 FS_FAT_GET 取下一簇再换算扇区。
; 输入：FS_LBA_LO/HI=当前扇区号，X 无要求。
; 输出：C=0 时 FS_NEXT_LBA_LO/HI=下一扇区号；越出所在区域时 C=1、A=1、FS_AREA_END_FLAG=1；簇链结束时 C=1、A=$FF、FS_AREA_END_FLAG=1；其他出错时 C=1、A=0、DOS_ERROR=$1F。
; 调用者：FS_FIND_FREE_DIR_ENTRY、FS_SCAN_DIR、FS_DELETE_SCAN_DIR、FS_COUNT_CONTIGUOUS、FS_ADVANCE_SECTORS、FS_WALK_TO_SECTOR、FS_DISPATCH_7B（地址表）
FS_NEXT_SECTOR:
    LDA #$00
    STA FS_AREA_END_FLAG
    LDA FS_LBA_LO
    STA FS_NEXT_LBA_LO
    LDA FS_LBA_HI
    STA FS_NEXT_LBA_HI
    JSR FS_SECTOR_BOUNDARY_CHECK
    BCS @fat2_or_data
    BEQ @error
    INC FS_NEXT_LBA_LO
    JSR FS_SECTOR_BOUNDARY_CHECK
    BCS @area_end
    BCC @return_clear
@fat2_or_data:
    BEQ @error
    JSR FS_LBA_TO_CLUSTER
    BCS @error
    JSR FS_DRIVE_PARAMS
    LDA FS_CLUSTER_SECTOR
    CLC
    ADC #$01
    CMP FS_SECTORS_PER_CLUSTER,X
    BCS @next_cluster
    LDA FS_LBA_LO
    CLC
    ADC #$01
    STA FS_NEXT_LBA_LO
    LDA FS_LBA_HI
    ADC #$00
    STA FS_NEXT_LBA_HI
    JMP @return_clear
@next_cluster:
    JSR FS_FAT_GET
    BCC @error
    BEQ @error
    BMI @chain_end
    LDA FS_FAT_VALUE_LO
    STA FS_CLUSTER_LO
    LDA FS_FAT_VALUE_HI
    STA FS_CLUSTER_HI
    JSR FS_CLUSTER_TO_LBA
    LDA FS_LBA_LO
    STA FS_NEXT_LBA_LO
    LDA FS_LBA_HI
    STA FS_NEXT_LBA_HI
@return_clear:
    CLC
    RTS
@chain_end:
    LDA #$01
    STA FS_AREA_END_FLAG
    SEC
    LDA #$FF
    RTS
@error:
    LDA #$1F
    STA DOS_ERROR
    SEC
    LDA #$00
    RTS
@area_end:
    LDA #$01
    STA FS_AREA_END_FLAG
    SEC
    LDA #$01
    RTS
; 作用：FS_NEXT_SECTOR 内部：按驱动器参数判断 FS_NEXT_LBA_LO/HI 所在的区域。
; 输入：FS_NEXT_LBA_LO/HI。
; 输出：C=0、A=0 引导扇区；C=0、A=1 第一份 FAT；C=1、A=0 第二份 FAT；C=0、A=$FF 根目录区；C=1、A=1 数据区。
; 调用者：FS_NEXT_SECTOR
FS_SECTOR_BOUNDARY_CHECK:
    LDA FS_NEXT_LBA_HI
    BNE @data_area
    LDA FS_NEXT_LBA_LO
    BEQ @boot
    JSR FS_DRIVE_PARAMS
    LDA FS_SECTORS_PER_FAT,X
    CMP FS_NEXT_LBA_LO
    BCS @fat1
    JSR FS_DRIVE_PARAMS
    LDA FS_FAT_AREA_SECTORS,X
    SEC
    SBC #$01
    CMP FS_NEXT_LBA_LO
    BCS @fat2
    ADC FS_ROOT_SECTORS,X
    CMP FS_NEXT_LBA_LO
    BCS @root
@data_area:
    SEC
    LDA #$01
    RTS
@fat2:
    SEC
    LDA #$00
    RTS
@boot:
    CLC
    LDA #$00
    RTS
@fat1:
    CLC
    LDA #$01
    RTS
@root:
    CLC
    LDA #$FF
    RTS
; 作用：文件服务 $7B/$05：读 FAT 项。
; 输入：FS_CLUSTER_LO/HI=簇号。
; 输出：下一簇号（12 位）放 FS_FAT_VALUE_LO/HI；C=0 为空闲簇（簇号为 0 也算）；C=1 时 A=1 为有效的下一簇，A=$FF 为簇链结束（$FF8 以上），A=0 为坏簇、越界或读 FAT 出错。
; 调用者：FS_NEXT_SECTOR、FS_FIND_FREE_CLUSTER、FS_FREE_HANDLE_CHAIN、FS_TRANSFER_CHAIN、FS_DISPATCH_7B（地址表）
FS_FAT_GET:
    LDA FS_CLUSTER_LO
    ORA FS_CLUSTER_HI
    BNE @read_entry
    CLC
    RTS
@read_entry:
    JSR FS_FAT_ENTRY_ADDR
    BPL @decode
    SEC
    LDA #$00
    RTS
@decode:
    BCC @even_cluster
    LSR FS_FAT_VALUE_HI
    ROR FS_FAT_VALUE_LO
    LSR FS_FAT_VALUE_HI
    ROR FS_FAT_VALUE_LO
    LSR FS_FAT_VALUE_HI
    ROR FS_FAT_VALUE_LO
    LSR FS_FAT_VALUE_HI
    ROR FS_FAT_VALUE_LO
    JMP @value_ready
@even_cluster:
    LDA FS_FAT_VALUE_HI
    AND #$0F
    STA FS_FAT_VALUE_HI
@value_ready:
    LDA FS_FAT_VALUE_LO
    ORA FS_FAT_VALUE_HI
    BNE @not_free
    CLC
    RTS
@not_free:
    SEC
    LDA FS_FAT_VALUE_LO
    SBC #$F0
    LDA FS_FAT_VALUE_HI
    SBC #$0F
    BCS @above_ff0
    JSR FS_DRIVE_PARAMS
    SEC
    LDA FS_CLUSTER_LIMIT_LO,X
    SBC FS_FAT_VALUE_LO
    LDA FS_CLUSTER_LIMIT_HI,X
    SBC FS_FAT_VALUE_HI
    BCS @next_cluster
    SEC
    LDA #$00
    RTS
@next_cluster:
    LDA #$01
    RTS
@above_ff0:
    LDA FS_FAT_VALUE_LO
    CMP #$F8
    BCS @chain_end
    SEC
    LDA #$00
    RTS
@chain_end:
    SEC
    LDA #$FF
    RTS
; 作用：算出簇号在 FAT 里的字节偏移（簇号×1.5）放 FS_PTR_LO/FS_PTR_HI，并经 FS_FAT12_READ_ENTRY 读出该处的 2 个字节。
; 输入：FS_CLUSTER_LO/HI=簇号。
; 输出：C=1 表示簇号为奇数；A=1（N=0）成功，A=$FF（N=1）读 FAT 出错；2 个字节在 FS_FAT_VALUE_LO/HI（还没按奇偶取 12 位）。
; 副作用：改写 DOS_TEMP_3、DOS_TEMP_5。
; 调用者：FS_FAT_GET、FS_FAT_SET
FS_FAT_ENTRY_ADDR:
    LDA #$00
    STA FS_PTR_LO
    STA FS_PTR_HI
    LDA FS_CLUSTER_HI
    STA DOS_TEMP_3
    LDA FS_CLUSTER_LO
    STA DOS_TEMP_5
    LSR DOS_TEMP_3
    ROR DOS_TEMP_5
    PHP
    CLC
    LDA DOS_TEMP_5
    ADC FS_CLUSTER_LO
    STA FS_FAT_VALUE_LO
    LDA DOS_TEMP_3
    ADC FS_CLUSTER_HI
    STA FS_FAT_VALUE_HI
    CLC
    LDA FS_FAT_VALUE_LO
    ADC FS_PTR_LO
    STA FS_PTR_LO
    LDA FS_FAT_VALUE_HI
    ADC FS_PTR_HI
    STA FS_PTR_HI
    JSR FS_FAT12_READ_ENTRY
    BCS @failed
    PLP
    LDA #$01
    RTS
@failed:
    PLP
    LDA #$FF
    RTS
; 作用：读 FAT 里某字节偏移处的 2 个字节：按偏移算出所在的 FAT 扇区（从 FAT 起点数，偏移高字节÷2+1）并装入缓存，读出偏移处的字节放 FS_FAT_VALUE_LO，下一个字节（在扇区末尾时取自下一扇区）放 FS_FAT_VALUE_HI。
; 输入：FS_PTR_LO/FS_PTR_HI=字节偏移。
; 输出：C=0 成功，C=1 偏移越界或缓存装入失败；FS_PTR_LO/FS_PTR_HI 保持原值。
; 副作用：改写 FS_LBA_LO/HI、DOS_TEMP_3、DOS_TEMP_5，并调用功能 $29 读窗口。
; 调用者：FS_FAT_ENTRY_ADDR
FS_FAT12_READ_ENTRY:
    LDA FS_PTR_LO
    PHA
    LDA FS_PTR_HI
    PHA
    JSR FS_DRIVE_PARAMS
    LDA FS_PTR_HI
    AND #$FE
    LSR A
    CMP FS_SECTORS_PER_FAT,X
    BCC @in_range
    JMP @restore
@in_range:
    CLC
    ADC #$01
    STA FS_LBA_LO
    LDA #$00
    STA FS_LBA_HI
    JSR FS_FAT_CACHE_ADDR_OF_LBA
    BCS @restore
    LDA FS_PTR_LO
    STA DOS_TEMP_5
    CLC
    ADC FS_FAT_CACHE_ADDR_LO
    STA FS_PTR_LO
    LDA FS_PTR_HI
    AND #$01
    STA DOS_TEMP_3
    ADC FS_FAT_CACHE_ADDR_HI
    STA FS_PTR_HI
    LDA FS_FAT_CACHE_PAGE
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDY #$00
    LDA (FS_PTR_LO),Y
    STA FS_FAT_VALUE_LO
    LDA DOS_TEMP_5
    CLC
    ADC #$01
    BCC @same_sector
    LDA DOS_TEMP_3
    ADC #$00
    AND #$01
    BEQ @next_sector
@same_sector:
    LDY #$01
    LDA (FS_PTR_LO),Y
    STA FS_FAT_VALUE_HI
    JMP @success
@next_sector:
    INC FS_LBA_LO
    JSR FS_FAT_CACHE_ADDR_OF_LBA
    BCS @restore
    LDA FS_FAT_CACHE_ADDR_LO
    STA FS_PTR_LO
    LDA FS_FAT_CACHE_ADDR_HI
    STA FS_PTR_HI
    LDA FS_FAT_CACHE_PAGE
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDY #$00
    LDA (FS_PTR_LO),Y
    STA FS_FAT_VALUE_HI
@success:
    CLC
@restore:
    PLA
    STA FS_PTR_HI
    PLA
    STA FS_PTR_LO
    RTS
; 作用：分配 FS_ALLOC_COUNT_LO/HI 个簇，接在 FS_CLUSTER_LO/HI 所指的簇后面（FS_CLUSTER 为 0 时从头建链），最后一簇标为链尾 $FFF 并写回 FAT；出错时重新读入 FAT 回滚，DOS_ERROR 保持出错码，FS_FREE_HINT 回到簇 2。
; 输入：FS_CLUSTER_LO/HI=链尾簇号（0 表示新建），FS_ALLOC_COUNT_LO/HI=要分配的簇数。
; 输出：C=0 成功，新建链时 FS_FAT_VALUE_LO/HI 为第一个簇号；C=1 失败；FS_CLUSTER_LO/HI 保持调用前的值。
; 调用者：FS_OPEN_AFTER_LOOKUP、FS_FIND_FREE_DIR_ENTRY、FS_ALLOC_SECTORS、FS_WRITE_AT、FS_ALLOC_FOR_SIZE
FS_ALLOC_CHAIN:
    LDA #$00
    STA FS_FIRST_CLUSTER_FLAG
    LDA FS_CLUSTER_LO
    PHA
    LDA FS_CLUSTER_HI
    PHA
    ORA FS_CLUSTER_LO
    BNE @loop
    JSR FS_FIND_FREE_CLUSTER
    BCS @rollback
    LDA FS_FAT_NEW_LO
    STA FS_CLUSTER_LO
    PHA
    LDA FS_FAT_NEW_HI
    STA FS_CLUSTER_HI
    PHA
    LDA #$01
    STA FS_FIRST_CLUSTER_FLAG
    JSR FS_DEC_COUNT
    BCS @finish_chain
@loop:
    JSR FS_FIND_FREE_CLUSTER
    BCS @rollback
    JSR FS_FAT_SET
    BCS @rollback
    LDA FS_FAT_NEW_LO
    STA FS_CLUSTER_LO
    LDX FS_FIRST_CLUSTER_FLAG
    BNE @store_high
    PHA
@store_high:
    LDA FS_FAT_NEW_HI
    STA FS_CLUSTER_HI
    LDX FS_FIRST_CLUSTER_FLAG
    BNE @counted
    PHA
    LDA #$01
    STA FS_FIRST_CLUSTER_FLAG
@counted:
    JSR FS_DEC_COUNT
    BCC @loop
@finish_chain:
    LDA #$FF
    STA FS_FAT_NEW_LO
    LDA #$0F
    STA FS_FAT_NEW_HI
    JSR FS_FAT_SET
    BCS @rollback
    JSR FS_FAT_WRITE_BACK
    BCC @restore_first
@rollback:
    PHP
    LDA DOS_ERROR
    PHA
    JSR FS_READ_ALL_FAT
    PLA
    STA DOS_ERROR
    LDA #$02
    STA FS_FREE_HINT_LO
    LDA #$00
    STA FS_FREE_HINT_HI
    PLP
@restore_first:
    LDA FS_FIRST_CLUSTER_FLAG
    BEQ @restore_cluster
    PLA
    STA FS_FAT_VALUE_HI
    PLA
    STA FS_FAT_VALUE_LO
@restore_cluster:
    PLA
    STA FS_CLUSTER_HI
    PLA
    STA FS_CLUSTER_LO
    RTS
; 作用：把要分配的扇区数（FS_ALLOC_COUNT_LO/HI，先减去当前簇里已有的扇区数）按每簇扇区数折成簇数（向上取整），再调用 FS_ALLOC_CHAIN。
; 输入：FS_ALLOC_COUNT_LO/HI=扇区数，FS_LBA_LO/HI 用来定位当前簇。
; 输出：同 FS_ALLOC_CHAIN。
; 调用者：FS_ADVANCE_OFFSET
FS_ALLOC_SECTORS:
    JSR FS_LBA_TO_CLUSTER
    LDA FS_ALLOC_COUNT_LO
    SEC
    SBC FS_CLUSTER_SECTOR
    STA FS_ALLOC_COUNT_LO
    LDA FS_ALLOC_COUNT_HI
    SBC #$00
    STA FS_ALLOC_COUNT_HI
    JSR FS_DRIVE_PARAMS
    LDY FS_SECTORS_PER_CLUSTER,X
    DEY
    TYA
    AND FS_ALLOC_COUNT_LO
    PHA
    LDA #$00
@loop:
    CMP FS_CLUSTER_SHIFT_BITS,X
    BEQ @shifted
    LSR FS_ALLOC_COUNT_HI
    ROR FS_ALLOC_COUNT_LO
    CLC
    ADC #$01
    JMP @loop
@shifted:
    PLA
    BEQ @allocate
    CLC
    LDA FS_ALLOC_COUNT_LO
    ADC #$01
    STA FS_ALLOC_COUNT_LO
    LDA FS_ALLOC_COUNT_HI
    ADC #$00
    STA FS_ALLOC_COUNT_HI
@allocate:
    JSR FS_ALLOC_CHAIN
    RTS
; 作用：把 FS_ALLOC_COUNT_LO/HI 减 1。
; 输出：C=1 表示减到 0，C=0 表示还没到 0。
; 调用者：FS_ALLOC_CHAIN
FS_DEC_COUNT:
    SEC
    LDA FS_ALLOC_COUNT_LO
    SBC #$01
    STA FS_ALLOC_COUNT_LO
    LDA FS_ALLOC_COUNT_HI
    SBC #$00
    STA FS_ALLOC_COUNT_HI
    ORA FS_ALLOC_COUNT_LO
    BEQ @return_set
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：从 FS_FREE_HINT_LO/HI 起找一个空闲簇放到 FS_FAT_NEW_LO/HI，并把 FS_FREE_HINT 移到它的下一簇；起点已不小于簇总数或一直找不到时出错码 $2C（磁盘已满）。
; 输入：FS_FREE_HINT_LO/HI=起找的簇号。
; 输出：C=0 找到，簇号在 FS_FAT_NEW_LO/HI；C=1 失败，DOS_ERROR=$2C；FS_CLUSTER_LO/HI 保持调用前的值。
; 调用者：FS_ALLOC_CHAIN
FS_FIND_FREE_CLUSTER:
    LDA FS_CLUSTER_LO
    PHA
    LDA FS_CLUSTER_HI
    PHA
    JSR FS_DRIVE_PARAMS
    SEC
    LDA FS_FREE_HINT_LO
    SBC FS_CLUSTER_LIMIT_LO,X
    LDA FS_FREE_HINT_HI
    SBC FS_CLUSTER_LIMIT_HI,X
    BCS @disk_full
    LDA FS_FREE_HINT_LO
    STA FS_CLUSTER_LO
    LDA FS_FREE_HINT_HI
    STA FS_CLUSTER_HI
@loop:
    JSR FS_FAT_GET
    BCC @found
    JSR FS_CLUSTER_INC
    BCC @loop
    BCS @disk_full
    RTS
@found:
    LDA FS_CLUSTER_LO
    STA FS_FAT_NEW_LO
    CLC
    ADC #$01
    STA FS_FREE_HINT_LO
    LDA FS_CLUSTER_HI
    STA FS_FAT_NEW_HI
    ADC #$00
    STA FS_FREE_HINT_HI
    CLC
    PLA
    STA FS_CLUSTER_HI
    PLA
    STA FS_CLUSTER_LO
    RTS
@disk_full:
    LDA #$2C
    STA DOS_ERROR
    PLA
    STA FS_CLUSTER_HI
    PLA
    STA FS_CLUSTER_LO
    SEC
    RTS
; 作用：文件服务 $7B/$04：簇号 FS_CLUSTER_LO/HI 加 1，并与本盘的簇总数 FS_CLUSTER_LIMIT 比较。
; 输出：C=1 表示新簇号已不小于簇总数（到末尾）。
; 调用者：FS_FIND_FREE_CLUSTER、FS_DISPATCH_7B（地址表）
FS_CLUSTER_INC:
    CLC
    LDA #$01
    ADC FS_CLUSTER_LO
    STA FS_CLUSTER_LO
    LDA #$00
    ADC FS_CLUSTER_HI
    STA FS_CLUSTER_HI
    JSR FS_DRIVE_PARAMS
    SEC
    LDA FS_CLUSTER_LO
    SBC FS_CLUSTER_LIMIT_LO,X
    LDA FS_CLUSTER_HI
    SBC FS_CLUSTER_LIMIT_HI,X
    RTS
; 作用：文件服务 $7B/$0F：写 FAT 项：把 12 位新值写进 FAT 缓存里簇号对应的位置（奇数簇占高 12 位，偶数簇占低 12 位，另一半保持）。
; 输入：FS_CLUSTER_LO/HI=簇号，FS_FAT_NEW_LO/HI=新值（12 位）。
; 输出：C=0 成功，C=1 读写 FAT 出错。
; 调用者：FS_ALLOC_CHAIN、FS_FREE_HANDLE_CHAIN、FS_DISPATCH_7B（地址表）
FS_FAT_SET:
    JSR FS_FAT_ENTRY_ADDR
    BCS @odd_cluster
    LDA FS_FAT_NEW_LO
    STA FS_FAT_VALUE_LO
    LDA FS_FAT_VALUE_HI
    AND #$F0
    ORA FS_FAT_NEW_HI
    STA FS_FAT_VALUE_HI
    JMP @write_entry
@odd_cluster:
    LDA FS_FAT_NEW_LO
    PHA
    LDA FS_FAT_NEW_HI
    PHA
    ASL FS_FAT_NEW_LO
    ROL FS_FAT_NEW_HI
    ASL FS_FAT_NEW_LO
    ROL FS_FAT_NEW_HI
    ASL FS_FAT_NEW_LO
    ROL FS_FAT_NEW_HI
    ASL FS_FAT_NEW_LO
    ROL FS_FAT_NEW_HI
    LDA FS_FAT_NEW_HI
    STA FS_FAT_VALUE_HI
    LDA FS_FAT_VALUE_LO
    AND #$0F
    ORA FS_FAT_NEW_LO
    STA FS_FAT_VALUE_LO
    PLA
    STA FS_FAT_NEW_HI
    PLA
    STA FS_FAT_NEW_LO
@write_entry:
    JSR FS_FAT12_WRITE_ENTRY
    BCS @return_set
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：写 FAT12 项：把 FS_FAT_VALUE_LO/HI 里的 2 个字节写进 FS_PTR_LO/FS_PTR_HI（字节偏移）对应的 FAT 缓存位置，项在扇区末尾时第二个字节写进下一扇区。
; 输入：FS_PTR_LO/HI=字节偏移，FS_FAT_VALUE_LO/HI=要写的 2 个字节。
; 输出：C=0 成功，C=1 缓存装入失败；FS_PTR_LO/HI 保持原值。
; 副作用：改写 FS_LBA_LO/HI、DOS_TEMP_3、DOS_TEMP_5，并调用功能 $29 读窗口。
; 调用者：FS_FAT_SET
FS_FAT12_WRITE_ENTRY:
    LDA FS_PTR_HI
    PHA
    LDA FS_PTR_LO
    PHA
    LDA FS_PTR_HI
    AND #$FE
    LSR A
    CLC
    ADC #$01
    STA FS_LBA_LO
    LDA #$00
    STA FS_LBA_HI
    JSR FS_FAT_CACHE_ADDR_OF_LBA
    BCS @restore
    LDA FS_PTR_LO
    STA DOS_TEMP_5
    CLC
    ADC FS_FAT_CACHE_ADDR_LO
    STA FS_PTR_LO
    LDA FS_PTR_HI
    AND #$01
    STA DOS_TEMP_3
    ADC FS_FAT_CACHE_ADDR_HI
    STA FS_PTR_HI
    LDA FS_FAT_CACHE_PAGE
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDY #$00
    LDA FS_FAT_VALUE_LO
    STA (FS_PTR_LO),Y
    LDA DOS_TEMP_5
    CLC
    ADC #$01
    BCC @same_sector
    LDA DOS_TEMP_3
    ADC #$00
    AND #$01
    BEQ @next_sector
@same_sector:
    LDY #$01
    LDA FS_FAT_VALUE_HI
    STA (FS_PTR_LO),Y
    JMP @success
@next_sector:
    INC FS_LBA_LO
    JSR FS_FAT_CACHE_ADDR_OF_LBA
    BCS @restore
    LDA FS_FAT_CACHE_ADDR_LO
    STA FS_PTR_LO
    LDA FS_FAT_CACHE_ADDR_HI
    STA FS_PTR_HI
    LDA FS_FAT_CACHE_PAGE
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDY #$00
    LDA FS_FAT_VALUE_HI
    STA (FS_PTR_LO),Y
@success:
    CLC
@restore:
    PLA
    STA FS_PTR_LO
    PLA
    STA FS_PTR_HI
    RTS
; 作用：释放当前句柄的整条簇链：从句柄的起始簇开始，把每个簇的 FAT 项改成 0（空闲）直到链尾，再写回 FAT，并让 FS_FREE_HINT 不大于起始簇。起始簇为 0 时直接 C=0 返回；簇链中途遇到空闲簇时 C=1；写 FAT 出错时若 DOS_ERROR 为 $13 则 C=1 返回，否则重新读入 FAT（FS_READ_ALL_FAT）。
; 输入：FILE_HANDLE_OFFSET=当前句柄，FH_CLUSTER_LO/HI=起始簇。
; 输出：C=0 成功。
; 调用者：FS_OPEN_AFTER_LOOKUP、FS_REMOVE_DIR
FS_FREE_HANDLE_CHAIN:
    LDX FILE_HANDLE_OFFSET
    LDA FH_CLUSTER_LO,X
    STA FS_CLUSTER_LO
    LDA FH_CLUSTER_HI,X
    STA FS_CLUSTER_HI
    ORA FS_CLUSTER_LO
    BNE @loop
    CLC
    RTS
@loop:
    JSR FS_FAT_GET
    BCS @free_entry
    SEC
    BCS @return
@free_entry:
    PHP
    LDA #$00
    STA FS_FAT_NEW_LO
    STA FS_FAT_NEW_HI
    LDA FS_FAT_VALUE_LO
    PHA
    LDA FS_FAT_VALUE_HI
    PHA
    JSR FS_FAT_SET
    PLA
    STA FS_CLUSTER_HI
    PLA
    STA FS_CLUSTER_LO
    PLP
    BPL @loop
    JSR FS_FAT_WRITE_BACK
    BCS @write_error
    LDX FILE_HANDLE_OFFSET
    SEC
    LDA FH_CLUSTER_LO,X
    SBC FS_FREE_HINT_LO
    LDA FH_CLUSTER_HI,X
    SBC FS_FREE_HINT_HI
    BCS @done
    LDA FH_CLUSTER_LO,X
    STA FS_FREE_HINT_LO
    LDA FH_CLUSTER_HI,X
    STA FS_FREE_HINT_HI
@done:
    CLC
    BCC @return
@write_error:
    LDA DOS_ERROR
    CMP #$13
    BNE @reload_fat
    SEC
    BCS @return
@reload_fat:
    JSR FS_READ_ALL_FAT
@return:
    RTS
; 作用：把当前句柄的目录项写回磁盘：按 FH_DIR_LBA 读目录扇区，定位到 FH_DIR_ENTRY 项，用 FS_STORE_HANDLE_TO_DIR 写入后存盘。
; 输入：FILE_HANDLE_OFFSET=当前句柄。
; 输出：C=0 成功，C=1 读写扇区出错。
; 调用者：FS_OPEN_AFTER_LOOKUP、FS_CLOSE
FS_WRITE_BACK_DIR_ENTRY:
    LDX FILE_HANDLE_OFFSET
    LDA FH_DIR_LBA_LO,X
    STA FS_LBA_LO
    LDA FH_DIR_LBA_HI,X
    STA FS_LBA_HI
    JSR FS_FAT_LOAD
    BCS @return
    LDA #<DISK_BUFFER
    STA FS_PTR_LO
    LDA #>DISK_BUFFER
    STA FS_PTR_HI
    LDX FILE_HANDLE_OFFSET
    LDA FH_DIR_ENTRY,X
    BEQ @entry_found
    TAX
@next_entry:
    LDA #$20
    JSR FS_PTR_ADD_A
    DEX
    BNE @next_entry
@entry_found:
    JSR FS_STORE_HANDLE_TO_DIR
    JSR FS_FAT_STORE
    BCS @return
    CLC
@return:
    RTS
; 作用：把句柄里的名称（11 字节）、属性、时间、日期、起始簇和大小（3 字节，第 4 字节清 0）写进 FS_PTR_LO/FS_PTR_HI 指向的目录项。
; 输入：FILE_HANDLE_OFFSET=当前句柄，FS_PTR_LO/HI=目录项。
; 调用者：FS_WRITE_BACK_DIR_ENTRY
FS_STORE_HANDLE_TO_DIR:
    LDX FILE_HANDLE_OFFSET
    LDY #$00
    LDA FH_NAME,X
    STA (FS_PTR_LO),Y
    INY
    LDA FH_NAME+1,X
    STA (FS_PTR_LO),Y
    INY
    LDA FH_NAME+2,X
    STA (FS_PTR_LO),Y
    INY
    LDA FH_NAME+3,X
    STA (FS_PTR_LO),Y
    INY
    LDA FH_NAME+4,X
    STA (FS_PTR_LO),Y
    INY
    LDA FH_NAME+5,X
    STA (FS_PTR_LO),Y
    INY
    LDA FH_NAME+6,X
    STA (FS_PTR_LO),Y
    INY
    LDA FH_NAME+7,X
    STA (FS_PTR_LO),Y
    INY
    LDA FH_NAME+8,X
    STA (FS_PTR_LO),Y
    INY
    LDA FH_NAME+9,X
    STA (FS_PTR_LO),Y
    INY
    LDA FH_NAME+10,X
    STA (FS_PTR_LO),Y
    INY
    LDY #$0B
    LDA FH_ATTR,X
    STA (FS_PTR_LO),Y
    LDY #$16
    LDA FH_TIME_LO,X
    STA (FS_PTR_LO),Y
    INY
    LDA FH_TIME_HI,X
    STA (FS_PTR_LO),Y
    LDY #$18
    LDA FH_DATE_LO,X
    STA (FS_PTR_LO),Y
    INY
    LDA FH_DATE_HI,X
    STA (FS_PTR_LO),Y
    LDY #$1A
    LDA FH_CLUSTER_LO,X
    STA (FS_PTR_LO),Y
    INY
    LDA FH_CLUSTER_HI,X
    STA (FS_PTR_LO),Y
    LDY #$1C
    LDA FH_SIZE_0,X
    STA (FS_PTR_LO),Y
    INY
    LDA FH_SIZE_1,X
    STA (FS_PTR_LO),Y
    INY
    LDA FH_SIZE_2,X
    STA (FS_PTR_LO),Y
    INY
    LDA #$00
    STA (FS_PTR_LO),Y
    RTS
; 作用：打开文件前的路径解析与目录查找：用 FS_PARSE_NAME 解析 PATH_BUFFER（失败出错码 $27），读驱动器的引导扇区；路径里有目录部分时先在根目录里找到这个目录（找不到或不是目录出错码 3）并把它的位置与名字存进当前句柄；再在该目录（没有目录部分时在根目录）里查找文件名，找到时把目录项的位置、属性、时间、日期、起始簇和大小存进当前句柄，找不到出错码 2；既没有目录名也没有文件名出错码 $F3。
; 输入：PATH_BUFFER，FILE_HANDLE_OFFSET=当前句柄。
; 输出：C=0 找到；C=1 出错，DOS_ERROR 为出错码；读引导扇区失败时 FS_IO_FLAGS=1。
; 调用者：FS_OPEN
FS_OPEN_PARSE_PATH:
    LDA #$00
    STA FS_IO_FLAGS
    JSR FS_PARSE_NAME
    BCC @parsed
    LDA #$27
    STA DOS_ERROR
    RTS
@parsed:
    LDA FS_DRIVE_LETTER
    STA FILE_DRIVE_LETTER
    JSR FS_READ_BOOT_SECTOR
    BCC @boot_ok
    LDA #$01
    STA FS_IO_FLAGS
    RTS
@boot_ok:
    LDX FILE_HANDLE_OFFSET
    LDA FS_DRIVE_LETTER
    STA FH_DRIVE,X
    LDA #$FF
    STA FH_FLAGS,X
    LDA FS_NAME_DIR
    CMP #$20
    BNE @has_name
    STA FH_FLAGS,X
    LDA FS_NAME_FILE
    CMP #$20
    BNE @has_name
    SEC
    LDA #$F3
    STA DOS_ERROR
    RTS
@has_name:
    JSR FS_DRIVE_PARAMS
    LDA FS_FAT_AREA_SECTORS,X
    STA FS_LBA_LO
    LDA #$00
    STA FS_LBA_HI
    LDX FILE_HANDLE_OFFSET
    LDA FH_FLAGS,X
    BMI @find_dir
    BPL @find_file
@find_dir:
    JSR FS_SCAN_DIR
    BCC @check_dir
    LDA #$03
    STA DOS_ERROR
    RTS
@check_dir:
    LDA FS_ENTRY_TYPE
    CMP #$44
    BEQ @dir_found
    LDA #$03
    STA DOS_ERROR
    RTS
@dir_found:
    LDA FS_LBA_LO
    ASL A
    ASL A
    ASL A
    ASL A
    STA DOS_TEMP_3
    CLC
    TXA
    ADC DOS_TEMP_3
    LDY FILE_HANDLE_OFFSET
    STA FH_PARENT_DIR_ID,Y
    LDX FILE_HANDLE_OFFSET
    LDY #$1A
    LDA (FS_PTR_LO),Y
    STA FH_PARENT_CLUSTER_LO,X
    STA FS_CLUSTER_LO
    INY
    LDA (FS_PTR_LO),Y
    STA FH_PARENT_CLUSTER_HI,X
    STA FS_CLUSTER_HI
    JSR FS_CLUSTER_TO_LBA
    LDA #<FS_NAME_DIR
    STA FS_SRC_PTR_LO
    LDA #>FS_NAME_DIR
    STA FS_SRC_PTR_HI
    CLC
    LDA #$5C
    ADC FILE_HANDLE_OFFSET
    STA FS_DST_PTR_LO
    LDA #$64
    ADC #$00
    STA FS_DST_PTR_HI
    LDA #$0B
    STA FS_COPY_COUNT
    JSR FS_COPY_BYTES
@find_file:
    LDA #<FS_NAME_FILE
    STA FS_SRC_PTR_LO
    LDA #>FS_NAME_FILE
    STA FS_SRC_PTR_HI
    LDA #<FS_NAME_DIR
    STA FS_DST_PTR_LO
    LDA #>FS_NAME_DIR
    STA FS_DST_PTR_HI
    LDA #$0B
    STA FS_COPY_COUNT
    JSR FS_COPY_BYTES
    CLC
    LDA #$3D
    ADC FILE_HANDLE_OFFSET
    STA FS_DST_PTR_LO
    LDA #$64
    ADC #$00
    STA FS_DST_PTR_HI
    LDA #$0B
    STA FS_COPY_COUNT
    JSR FS_COPY_BYTES
    JSR FS_SCAN_DIR
    BCC @file_found
    LDA DOS_ERROR
    CMP #$F4
    BNE @return_set
    LDA #$02
    STA DOS_ERROR
@return_set:
    SEC
    RTS
@file_found:
    LDY FILE_HANDLE_OFFSET
    LDA FS_LBA_LO
    STA FH_DIR_LBA_LO,Y
    LDA FS_LBA_HI
    STA FH_DIR_LBA_HI,Y
    TXA
    STA FH_DIR_ENTRY,Y
    LDX FILE_HANDLE_OFFSET
    LDY #$0B
    LDA (FS_PTR_LO),Y
    STA FH_ATTR,X
    INY
    LDY #$16
    LDA (FS_PTR_LO),Y
    STA FH_TIME_LO,X
    INY
    LDA (FS_PTR_LO),Y
    STA FH_TIME_HI,X
    LDY #$18
    LDA (FS_PTR_LO),Y
    STA FH_DATE_LO,X
    INY
    LDA (FS_PTR_LO),Y
    STA FH_DATE_HI,X
    LDY #$1A
    LDA (FS_PTR_LO),Y
    STA FH_CLUSTER_LO,X
    INY
    LDA (FS_PTR_LO),Y
    STA FH_CLUSTER_HI,X
    LDY #$1C
    LDA (FS_PTR_LO),Y
    STA FH_SIZE_0,X
    INY
    LDA (FS_PTR_LO),Y
    STA FH_SIZE_1,X
    INY
    LDA (FS_PTR_LO),Y
    STA FH_SIZE_2,X
    CLC
    RTS
; 作用：按 FS_COPY_COUNT 个字节从 FS_SRC_PTR_LO/HI 复制到 FS_DST_PTR_LO/HI（为 0 不复制）。
; 输入：FS_COPY_COUNT、FS_SRC_PTR_LO/HI、FS_DST_PTR_LO/HI。
; 副作用：FS_COPY_COUNT 减到 0。
; 调用者：FS_OPEN_PARSE_PATH、FS_PARSE_NAME、FS_FIND_ENTRY
FS_COPY_BYTES:
    LDA FS_COPY_COUNT
    BEQ @return
    LDY #$00
@loop:
    LDA (FS_SRC_PTR_LO),Y
    STA (FS_DST_PTR_LO),Y
    INY
    DEC FS_COPY_COUNT
    BNE @loop
@return:
    RTS
; 作用：从 FS_LBA 起逐扇区扫描目录，查找与 FS_NAME_DIR 里 11 字节名字相同的项。
; 输入：FS_LBA_LO/HI=目录的第一个扇区，FS_NAME_DIR=要找的名字。
; 输出：找到时 C=0，FS_PTR_LO/HI 指向该项、X=项在扇区里的序号、FS_ENTRY_TYPE=$44（目录）或 $46（文件）；遇到首字节为 0 的项（目录结束）或区域结束时出错码 $F4、C=1；匹配到卷标出错码 5、C=1；读扇区失败 C=1。
; 调用者：FS_OPEN_PARSE_PATH、FS_SCAN_DIR
FS_SCAN_DIR:
    JSR FS_FAT_LOAD
    BCS @return_set
    LDA #<DISK_BUFFER
    STA FS_PTR_LO
    LDA #>DISK_BUFFER
    STA FS_PTR_HI
    LDX #$00
@loop:
    LDY #$00
    LDA (FS_PTR_LO),Y
    BNE @in_use
    LDA #$F4
    STA DOS_ERROR
    SEC
    RTS
@in_use:
    CMP #$E5
    BEQ @next_entry
@compare_name:
    LDA FS_NAME_DIR,Y
    CMP (FS_PTR_LO),Y
    BNE @next_entry
    INY
    CPY #$0B
    BCC @compare_name
    LDY #$0B
    LDA (FS_PTR_LO),Y
    AND #$10
    BEQ @file_entry
    LDA #$44
    STA FS_ENTRY_TYPE
    BNE @return_clear
@file_entry:
    JSR FS_ENTRY_NOT_VOLUME
    BCC @file_type
    LDA #$05
    STA DOS_ERROR
    RTS
@file_type:
    LDA #$46
    STA FS_ENTRY_TYPE
@return_clear:
    CLC
    RTS
@next_entry:
    LDA #$20
    JSR FS_PTR_ADD_A
    INX
    CPX #$10
    BNE @loop
    JSR FS_NEXT_SECTOR
    BCS @next_sector_failed
    LDA FS_NEXT_LBA_LO
    STA FS_LBA_LO
    LDA FS_NEXT_LBA_HI
    STA FS_LBA_HI
    JMP FS_SCAN_DIR
@next_sector_failed:
    BEQ @return_set
    LDA #$F4
    STA DOS_ERROR
    RTS
@return_set:
    SEC
    RTS
; 作用：看目录项的属性位 3（卷标）。
; 输入：FS_PTR_LO/HI=目录项。
; 输出：C=0 不是卷标，C=1 是卷标。
; 调用者：FS_SCAN_DIR
FS_ENTRY_NOT_VOLUME:
    LDY #$0B
    LDA (FS_PTR_LO),Y
    AND #$08
    BNE @return_set
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：检查目录是否为空（删除目录用）：逐个目录扇区扫描，每个扇区从偏移 $40（DISK_BUFFER+$40，跳过前两项“.”和“..”）起共 14 项；首字节不是 0 也不是 $E5 的项算已占用，遇到就出错码 $29、C=1。
; 输入：FS_LBA_LO/HI=目录的第一个扇区。
; 输出：C=0 表示扫描完整个目录没有占用的项；C=1 为出错（DOS_ERROR）。
; 调用者：FS_DELETE_SCAN_DIR、FS_REMOVE_DIR
FS_DELETE_SCAN_DIR:
    JSR FS_FAT_LOAD
    BCS @return_set
    LDA #$00
    CLC
    ADC #$40
    STA FS_PTR_LO
    LDA #$60
    STA FS_PTR_HI
    LDX #$00
@loop:
    JSR FS_DIR_ENTRY_FREE
    BCS @occupied
    LDA #$20
    JSR FS_PTR_ADD_A
    INX
    CPX #$0E
    BNE @loop
    JSR FS_NEXT_SECTOR
    BCS @no_next_sector
    LDA FS_NEXT_LBA_LO
    STA FS_LBA_LO
    LDA FS_NEXT_LBA_HI
    STA FS_LBA_HI
    BCC FS_DELETE_SCAN_DIR
@no_next_sector:
    BEQ @return_set
    BMI @return_clear
@return_set:
    SEC
    RTS
@occupied:
    LDA #$29
    STA DOS_ERROR
    SEC
    RTS
@return_clear:
    CLC
    RTS
; 作用：文件服务 $7B/$03：簇号换算成该簇第一个扇区号：（簇号−2）×每簇扇区数+数据区起始扇区。
; 输入：FS_CLUSTER_LO/HI=簇号。
; 输出：FS_LBA_LO/HI=扇区号。
; 调用者：FS_OPEN_AFTER_LOOKUP、FS_FIND_FREE_DIR_ENTRY、FS_NEXT_SECTOR、FS_OPEN_PARSE_PATH、FS_FIND_ENTRY、FS_MAKE_DIR、FS_REMOVE_DIR、FS_SEEK_START等 11 处
FS_CLUSTER_TO_LBA:
    SEC
    LDA FS_CLUSTER_LO
    SBC #$02
    STA FS_LBA_LO
    LDA FS_CLUSTER_HI
    SBC #$00
    STA FS_LBA_HI
    JSR FS_DRIVE_PARAMS
    LDA FS_SECTORS_PER_CLUSTER,X
@loop:
    LSR A
    BCS @add_start
    ASL FS_LBA_LO
    ROL FS_LBA_HI
    JMP @loop
@add_start:
    CLC
    LDA FS_LBA_LO
    ADC FS_DATA_START_SECTOR,X
    STA FS_LBA_LO
    LDA FS_LBA_HI
    ADC #$00
    STA FS_LBA_HI
    RTS
; 作用：把 FS_LBA 换算成簇号与簇内扇区序号。
; 输入：FS_LBA_LO/HI=扇区号。
; 输出：C=0 时 FS_CLUSTER_LO/HI=簇号，FS_CLUSTER_SECTOR=簇内扇区序号；扇区在数据区之前时 C=1。
; 调用者：FS_FIND_FREE_DIR_ENTRY、FS_NEXT_SECTOR、FS_ALLOC_SECTORS
FS_LBA_TO_CLUSTER:
    JSR FS_DRIVE_PARAMS
    SEC
    LDA FS_LBA_LO
    SBC FS_DATA_START_SECTOR,X
    STA FS_CLUSTER_LO
    LDA FS_LBA_HI
    SBC #$00
    STA FS_CLUSTER_HI
    BCC @return_set
    LDA #$00
    STA FS_CLUSTER_SECTOR
    LDY #$08
    LDA FS_SECTORS_PER_CLUSTER,X
@divide_cluster:
    LSR A
    BCS @shift_sector
    LSR FS_CLUSTER_HI
    ROR FS_CLUSTER_LO
    ROR FS_CLUSTER_SECTOR
    DEY
    BNE @divide_cluster
@shift_sector:
    LSR FS_CLUSTER_SECTOR
    DEY
    BNE @shift_sector
    CLC
    LDA FS_CLUSTER_LO
    ADC #$02
    STA FS_CLUSTER_LO
    LDA FS_CLUSTER_HI
    ADC #$00
    STA FS_CLUSTER_HI
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：文件服务 $7B/$11：把 FS_LBA 换算成磁道、磁头、扇区（每磁道 18 扇区、2 个磁头，扇区号从 1 起）。
; 输入：FS_LBA_LO/HI=扇区号。
; 输出：DISK_TRACK、DISK_HEAD、DISK_SECTOR；FS_LBA_LO/HI 保持原值。
; 调用者：DISK_READ_SECTOR、DISK_WRITE_SECTOR、FS_TRANSFER_START、FS_PLAN_TRANSFER、FS_TRANSFER_CHAIN、FS_DISPATCH_7B（地址表）
FS_LBA_TO_CHS:
    LDA FS_LBA_LO
    PHA
    LDA FS_LBA_HI
    PHA
    LDA #$00
    STA DISK_TRACK
    LDA #$01
    STA DISK_SECTOR
    LDA #$00
    STA DISK_HEAD
@loop:
    SEC
    LDA FS_LBA_LO
    SBC #$24
    PHA
    LDA FS_LBA_HI
    SBC #$00
    BCC @head_sector
    STA FS_LBA_HI
    PLA
    STA FS_LBA_LO
    INC DISK_TRACK
    JMP @loop
@head_sector:
    PLA
    SEC
    LDA FS_LBA_LO
    CMP #$12
    BCC @store_sector
    SBC #$12
    INC DISK_HEAD
@store_sector:
    STA DISK_SECTOR
    INC DISK_SECTOR
    PLA
    STA FS_LBA_HI
    PLA
    STA FS_LBA_LO
    RTS
; 作用：选磁盘参数块的偏移 X：FS_DRIVE_LETTER 为 $41（A 盘）取 0，否则取 $19。
; 输入：FS_DRIVE_LETTER。
; 输出：X=参数块偏移；A 与标志保持不变。
; 调用者：FS_OPEN、FS_OPEN_AFTER_LOOKUP、FS_NEXT_SECTOR、FS_SECTOR_BOUNDARY_CHECK、FS_FAT_GET、FS_FAT12_READ_ENTRY、FS_ALLOC_SECTORS、FS_FIND_FREE_CLUSTER等 20 处
FS_DRIVE_PARAMS:
    PHA
    PHP
    LDA FS_DRIVE_LETTER
    CMP #$41
    BNE @drive_b
    LDX #$00
    BEQ @done
@drive_b:
    LDX #$19
@done:
    PLP
    PLA
    RTS
; 作用：文件服务 $7B/$06：统计空闲空间：从 FS_FREE_HINT_LO/HI 起逐簇读 FAT 项（FS_FAT_PEEK），空闲簇的大小累加到 SIZE_BYTES_0-2（3 字节，低字节在前，单位字节；每簇加每簇扇区数×512）。
; 输入：FS_FREE_HINT_LO/HI=起始簇号，FS_DRIVE_LETTER=盘符。
; 输出：SIZE_BYTES_0-2=空闲字节数。
; 副作用：占用 LIST_PTR_LO、STR_PTR_LO 作临时单元，改写 FS_CLUSTER_LO/HI。
; 调用者：FS_DISPATCH_7B（地址表）
FS_FREE_SPACE:
    LDA FS_FREE_HINT_LO
    STA FS_CLUSTER_LO
    LDA FS_FREE_HINT_HI
    STA FS_CLUSTER_HI
    LDA #$00
    STA SIZE_BYTES_0
    STA SIZE_BYTES_1
    STA SIZE_BYTES_2
    JSR FS_DRIVE_PARAMS
    STX LIST_PTR_LO
    LDA #$02
    LDY FS_CLUSTER_SHIFT_BITS,X
    BEQ @unit_ready
@loop:
    ASL A
    DEY
    BNE @loop
@unit_ready:
    STA STR_PTR_LO
    JSR FS_FAT12_MAP_PAGE
@next_cluster:
    PHP
    LDX LIST_PTR_LO
    SEC
    LDA FS_CLUSTER_LO
    SBC FS_CLUSTER_LIMIT_LO,X
    LDA FS_CLUSTER_HI
    SBC FS_CLUSTER_LIMIT_HI,X
    BCS @finished
    PLP
    JSR FS_FAT_PEEK
    BCS @advance
    LDA SIZE_BYTES_1
    CLC
    ADC STR_PTR_LO
    STA SIZE_BYTES_1
    LDA SIZE_BYTES_2
    ADC #$00
    STA SIZE_BYTES_2
@advance:
    INC FS_CLUSTER_LO
    BNE @advance_offset
    INC FS_CLUSTER_HI
@advance_offset:
    JSR FS_FAT12_NEXT_OFFSET
    JMP @next_cluster
@finished:
    PLP
    RTS
; 作用：按簇号×1.5 求出 FAT12 项在 FAT 里的字节偏移（FS_PTR_LO/HI），并把含它的 FAT 缓存页映射到窗口：偏移所在扇区号（偏移高字节÷2+1）小于 8 时用缓存页 $F5（窗口地址 $B200 起，KEY_VEC_LO=0），否则用缓存页 $F6（窗口地址 $B000 起，KEY_VEC_LO=1，偏移减 $0E00）；偏移恰为 $0DFF（页尾）时 FS_DST_PTR_LO=1，表示这一项跨到下一页。
; 输入：FS_CLUSTER_LO/HI=簇号。
; 输出：C=簇号奇偶（1 为奇数）；FS_PTR_LO/HI=偏移，FS_FAT_CACHE_ADDR_LO/HI 与 FS_FAT_CACHE_PAGE 指向映射的窗口。
; 副作用：调用功能 $29 映射窗口，改写 DOS_TEMP_3、DOS_TEMP_5、FS_FAT_VALUE_LO/HI、KEY_VEC_LO（借作页标志）。
; 调用者：FS_FREE_SPACE
FS_FAT12_MAP_PAGE:
    LDA #$00
    STA FS_PTR_LO
    STA FS_PTR_HI
    LDA FS_CLUSTER_HI
    STA DOS_TEMP_3
    LDA FS_CLUSTER_LO
    STA DOS_TEMP_5
    LSR DOS_TEMP_3
    ROR DOS_TEMP_5
    PHP
    CLC
    LDA DOS_TEMP_5
    ADC FS_CLUSTER_LO
    STA FS_FAT_VALUE_LO
    LDA DOS_TEMP_3
    ADC FS_CLUSTER_HI
    STA FS_FAT_VALUE_HI
    CLC
    LDA FS_FAT_VALUE_LO
    ADC FS_PTR_LO
    STA FS_PTR_LO
    LDA FS_FAT_VALUE_HI
    ADC FS_PTR_HI
    STA FS_PTR_HI
    LDA FS_PTR_LO
    CMP #$FF
    BNE @in_page
    LDA FS_PTR_HI
    CMP #$0D
    BNE @in_page
    LDA #$01
    STA FS_DST_PTR_LO
    BNE @select_page
@in_page:
    LDA #$00
    STA FS_DST_PTR_LO
@select_page:
    LDA FS_PTR_HI
    AND #$FE
    LSR A
    CLC
    ADC #$01
    CMP #$08
    BCS @second_page
    LDA #$B0
    CLC
    ADC #$02
    STA FS_FAT_CACHE_ADDR_HI
    LDA #$00
    STA KEY_VEC_LO
    LDA #$F5
    STA FS_FAT_CACHE_PAGE
    BNE @map_window
@second_page:
    LDA #$B0
    STA FS_FAT_CACHE_ADDR_HI
    LDA #$01
    STA KEY_VEC_LO
    LDA FS_PTR_HI
    SEC
    SBC #$0E
    STA FS_PTR_HI
    LDA #$F6
    STA FS_FAT_CACHE_PAGE
@map_window:
    LDA FS_FAT_CACHE_PAGE
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$00
    STA FS_FAT_CACHE_ADDR_LO
    PLP
    RTS
; 作用：读 FS_PTR_LO/HI 所指的 FAT 项（经 FS_FAT_CACHE_ADDR 窗口，项跨页时第二个字节取自下一页），按簇号奇偶取出 12 位值放 FS_FAT_VALUE_LO/HI；FS_FREE_SPACE 用它判断簇是否空闲。
; 输入：C=簇号奇偶（1 为奇数），FS_PTR_LO/HI=字节偏移，FS_DST_PTR_LO=是否跨页。
; 输出：C=0 空闲簇，C=1 已占用。
; 调用者：FS_FREE_SPACE
FS_FAT_PEEK:
    PHP
    LDA FS_PTR_LO
    CLC
    ADC FS_FAT_CACHE_ADDR_LO
    STA FS_SRC_PTR_LO
    LDA FS_PTR_HI
    ADC FS_FAT_CACHE_ADDR_HI
    STA FS_SRC_PTR_HI
    LDY #$00
    LDA (FS_SRC_PTR_LO),Y
    STA FS_FAT_VALUE_LO
    LDA FS_DST_PTR_LO
    BNE @cross_page
    LDY #$01
    LDA (FS_SRC_PTR_LO),Y
    STA FS_FAT_VALUE_HI
    JMP @decode
@cross_page:
    LDA #$F6
    STA SYS_PAGE
    LDA #$03
    STA SYS_ARG_10
    LDA #$29
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA #$00
    STA FS_FAT_CACHE_ADDR_LO
    STA FS_SRC_PTR_LO
    LDA #$B0
    STA FS_FAT_CACHE_ADDR_HI
    STA FS_SRC_PTR_HI
    LDY #$00
    LDA (FS_SRC_PTR_LO),Y
    STA FS_FAT_VALUE_HI
    LDA #$01
    STA KEY_VEC_LO
@decode:
    PLP
    BCC @even
    LDA FS_FAT_VALUE_LO
    AND #$F0
    STA FS_FAT_VALUE_LO
    JMP @result
@even:
    LDA FS_FAT_VALUE_HI
    AND #$0F
    STA FS_FAT_VALUE_HI
@result:
    LDA FS_FAT_VALUE_HI
    ORA FS_FAT_VALUE_LO
    BNE @return_set
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：FS_FREE_SPACE 逐簇前进时重新算 FAT12 项的字节偏移（簇号×1.5）：KEY_VEC_LO 不为 0（已在第二个缓存页）时偏移减 $0E00，否则偏移恰为 $0DFF 时 FS_DST_PTR_LO=1，其余为 0；不重新映射窗口。
; 输入：FS_CLUSTER_LO/HI=簇号，KEY_VEC_LO=当前缓存页标志。
; 输出：C=簇号奇偶，FS_PTR_LO/HI=偏移，FS_DST_PTR_LO=是否跨页。
; 调用者：FS_FREE_SPACE
FS_FAT12_NEXT_OFFSET:
    LDA #$00
    STA FS_PTR_LO
    STA FS_PTR_HI
    LDA FS_CLUSTER_HI
    STA DOS_TEMP_3
    LDA FS_CLUSTER_LO
    STA DOS_TEMP_5
    LSR DOS_TEMP_3
    ROR DOS_TEMP_5
    PHP
    CLC
    LDA DOS_TEMP_5
    ADC FS_CLUSTER_LO
    STA FS_FAT_VALUE_LO
    LDA DOS_TEMP_3
    ADC FS_CLUSTER_HI
    STA FS_FAT_VALUE_HI
    CLC
    LDA FS_FAT_VALUE_LO
    ADC FS_PTR_LO
    STA FS_PTR_LO
    LDA FS_FAT_VALUE_HI
    ADC FS_PTR_HI
    STA FS_PTR_HI
    LDA KEY_VEC_LO
    BEQ @first_page
    LDA FS_PTR_HI
    SEC
    SBC #$0E
    STA FS_PTR_HI
    JMP @not_boundary
@first_page:
    LDA FS_PTR_LO
    CMP #$FF
    BNE @not_boundary
    LDA FS_PTR_HI
    CMP #$0D
    BNE @not_boundary
    LDA #$01
    STA FS_DST_PTR_LO
    BNE @done
@not_boundary:
    LDA #$00
    STA FS_DST_PTR_LO
@done:
    PLP
    RTS
; 作用：新分配的簇逐扇区清零：清缓冲（FS_CLEAR_BUFFER_512）后经 FS_FAT_STORE 写盘，扇区数取每簇扇区数。
; 输入：FS_LBA_LO/HI=簇的第一个扇区。
; 输出：C=0 成功，C=1 写盘出错；FS_LBA、LIB_GROUP 保持原值。
; 调用者：FS_FIND_FREE_DIR_ENTRY
FS_CLEAR_NEW_CLUSTER:
    LDA FS_LBA_LO
    PHA
    LDA FS_LBA_HI
    PHA
    LDA LIB_GROUP
    PHA
    JSR FS_DRIVE_PARAMS
    LDA FS_SECTORS_PER_CLUSTER,X
    STA LIB_GROUP
@loop:
    JSR FS_CLEAR_BUFFER_512
    JSR FS_FAT_STORE
    BCS @restore
    DEC LIB_GROUP
    LDA LIB_GROUP
    BEQ @done
    LDA FS_LBA_LO
    CLC
    ADC #$01
    STA FS_LBA_LO
    LDA FS_LBA_HI
    ADC #$00
    STA FS_LBA_HI
    JMP @loop
@done:
    CLC
@restore:
    PLA
    STA LIB_GROUP
    PLA
    STA FS_LBA_HI
    PLA
    STA FS_LBA_LO
    RTS
; 作用：把 PATH_BUFFER 拆成盘符与 8+3 名字：目录名放 FS_NAME_DIR、文件名放 FS_NAME_FILE（各 11 字节，空格补齐，小写转大写，用 FS_CHECK_NAME_CHAR 查非法字符，扩展名在小数点之后）。PATH_BUFFER 第 2 个字符为冒号时第 1 个字符是盘符，只认 A、B。路径最多一级目录；只有一个名字时当作文件名，目录名取当前目录 DIR_NAME83（路径以反斜杠开头或当前目录是根目录时目录名留空）。
; 输入：PATH_BUFFER。
; 输出：C=0 成功，有盘符时 FS_DRIVE_LETTER=盘符；C=1 路径不合法（盘符不是 A、B，含非法字符，名字或扩展名过长，两个反斜杠或两个小数点，或在非根目录下写了相对的“目录加文件”）。
; 调用者：FS_OPEN_PARSE_PATH、FS_RENAME
FS_PARSE_NAME:
    LDA #<FS_NAME_DIR
    STA FS_PTR_LO
    LDA #>FS_NAME_DIR
    STA FS_PTR_HI
    JSR FS_FILL_SPACES_11
    LDA #<FS_NAME_FILE
    STA FS_PTR_LO
    LDA #>FS_NAME_FILE
    STA FS_PTR_HI
    JSR FS_FILL_SPACES_11
    LDA #$00
    STA DOS_TEMP_5
    STA DOS_TEMP_3
    STA FS_PARSE_EXT_FLAG
    LDA #<FS_NAME_DIR
    STA FS_PTR_LO
    LDA #>FS_NAME_DIR
    STA FS_PTR_HI
    LDA PATH_BUFFER+1
    CMP #$3A
    BNE @no_drive
    LDA PATH_BUFFER
    JSR FS_TO_UPPER
    CMP #$41
    BEQ @drive_ok
    CMP #$42
    BEQ @drive_ok
    SEC
    RTS
@drive_ok:
    STA FS_DRIVE_LETTER
    LDX #$02
    BNE @scan_path
@no_drive:
    LDX #$00
@scan_path:
    LDA PATH_BUFFER,X
    CMP #$5C
    BNE @begin_name
    LDA #$01
    STA DOS_TEMP_3
    INX
@begin_name:
    LDY #$00
@loop:
    LDA PATH_BUFFER,X
    BEQ @path_end
    CMP #$5C
    BEQ @separator
    CMP #$2E
    BEQ @dot
    JSR FS_CHECK_NAME_CHAR
    BCS @invalid
    JSR FS_TO_UPPER
    STA (FS_PTR_LO),Y
    INY
    CPY #$09
    BCC @next_char
    LDA FS_PARSE_EXT_FLAG
    BEQ @invalid
    CPY #$0C
    BEQ @invalid
    BNE @next_char
@separator:
    LDA DOS_TEMP_5
    BNE @invalid
    INC DOS_TEMP_5
    LDA #<FS_NAME_FILE
    STA FS_PTR_LO
    LDA #>FS_NAME_FILE
    STA FS_PTR_HI
    LDA #$00
    STA FS_PARSE_EXT_FLAG
    LDY #$00
    BEQ @next_char
@dot:
    LDA FS_PARSE_EXT_FLAG
    BNE @invalid
    INC FS_PARSE_EXT_FLAG
    LDY #$08
@next_char:
    INX
    BNE @loop
@invalid:
    SEC
    RTS
@path_end:
    LDA FS_NAME_DIR
    CMP #$20
    BEQ @return_clear
    LDA FS_NAME_FILE
    CMP #$20
    BNE @two_names
    LDA #<FS_NAME_DIR
    STA FS_SRC_PTR_LO
    LDA #>FS_NAME_DIR
    STA FS_SRC_PTR_HI
    LDA #<FS_NAME_FILE
    STA FS_DST_PTR_LO
    LDA #>FS_NAME_FILE
    STA FS_DST_PTR_HI
    LDA #$0B
    STA FS_COPY_COUNT
    JSR FS_COPY_BYTES
    LDA #<FS_NAME_DIR
    STA FS_PTR_LO
    LDA #>FS_NAME_DIR
    STA FS_PTR_HI
    JSR FS_FILL_SPACES_11
    LDA DOS_TEMP_3
    BNE @return_clear
    LDA DIR_NAME83
    CMP #$5C
    BEQ @return_clear
    LDA #<DIR_NAME83
    STA FS_SRC_PTR_LO
    LDA #>DIR_NAME83
    STA FS_SRC_PTR_HI
    LDA #<FS_NAME_DIR
    STA FS_DST_PTR_LO
    LDA #>FS_NAME_DIR
    STA FS_DST_PTR_HI
    LDA #$0B
    STA FS_COPY_COUNT
    JSR FS_COPY_BYTES
    JMP @return_clear
@two_names:
    LDA DOS_TEMP_3
    BNE @return_clear
    LDA DIR_NAME83
    CMP #$5C
    BEQ @return_clear
    BNE @invalid
@return_clear:
    CLC
    RTS
; 作用：把 FS_PTR_LO 指向的 11 字节填成空格。
; 输入：FS_PTR_LO/HI。
; 输出：A=$20，Y=$0B。
; 调用者：FS_PARSE_NAME、FS_MAKE_DIR
FS_FILL_SPACES_11:
    LDY #$00
    LDA #$20
@loop:
    STA (FS_PTR_LO),Y
    INY
    CPY #$0B
    BNE @loop
    RTS
; 作用：小写字母 a-z 转成大写，其他字符不变。
; 输入：A=字符。
; 输出：A=转换后的字符。
; 调用者：FS_PARSE_NAME
FS_TO_UPPER:
    CMP #$61
    BCC @return
    CMP #$7B
    BCS @return
    SEC
    SBC #$20
@return:
    RTS
; 作用：查字符是否在 FS_BAD_NAME_CHARS 的非法字符表里。
; 输入：A=字符。
; 输出：C=0 合法，C=1 非法；A、X 保持不变。
; 副作用：改写 FS_PLAN_FLAG（借作临时单元）。
; 调用者：FS_PARSE_NAME
FS_CHECK_NAME_CHAR:
    STA FS_PLAN_FLAG
    TXA
    PHA
    LDX #$00
@loop:
    LDA FS_BAD_NAME_CHARS,X
    CMP #$00
    BEQ @valid
    CMP FS_PLAN_FLAG
    BEQ @invalid
    INX
    BNE @loop
@valid:
    PLA
    TAX
    LDA FS_PLAN_FLAG
    CLC
    RTS
@invalid:
    PLA
    TAX
    SEC
    RTS
; 作用：文件名里不能出现的字符表（以 0 结尾）：问号、星号、空格、逗号、小于、大于、冒号、分号、单引号、方括号、花括号、反斜杠、竖线、加号、等号、斜杠、双引号。
; 引用者：FS_CHECK_NAME_CHAR
FS_BAD_NAME_CHARS:
    .byte $3F,$2A,$20,$2C,$3C,$3E,$3A,$3B,$27,$5B,$5D,$7B,$7D
    .byte $5C,$7C,$2B,$3D,$2F,$22,$00
; 作用：文件服务 $7D/$00：先做 $7B/$0B（FS_FIND_ENTRY），再调用磁盘服务 $80/$07，保留 FS_FIND_ENTRY 的出错码与进位。
; 输入：同 FS_FIND_ENTRY。
; 输出：同 FS_FIND_ENTRY。
; 调用者：FS_DISPATCH_7D（地址表）
FS_FIND_ENTRY_FLUSH:
    JSR FS_FIND_ENTRY
    PHP
    LDA DOS_ERROR
    PHA
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    PLA
    STA DOS_ERROR
    PLP
    RTS
; 作用：文件服务 $7B/$0B：设置当前目录（DOS 的 CD 用）：以方式 4 打开 PATH_BUFFER 里的路径（FS_OPEN）；成功时 DIR_NAME83 是该目录的 11 字节名称，FS_CWD_LBA_LO/HI 是它的第一个扇区，FS_CWD_ENTRY_ID 是它的目录项编号；路径只有盘符、没有名字（出错码 $F3）时当前目录取根目录（FS_CWD_LBA 取 FS_FAT_AREA_SECTORS，名称首字节 $5C）。打开出错码 2 或 $2D（不存在或是文件）都改成 3，当前目录不变。
; 输入：PATH_BUFFER。
; 输出：C=0 成功，DOS_ERROR=0；C=1 失败，DOS_ERROR 为出错码；句柄已关闭。
; 调用者：FS_FIND_ENTRY_FLUSH、FS_DISPATCH_7B（地址表）
FS_FIND_ENTRY:
    LDA #$04
    STA FILE_MODE
    JSR FS_OPEN
    BCC @found
    LDA DOS_ERROR
    CMP #$F3
    BNE @map_error
    JSR FS_DRIVE_PARAMS
    LDA FS_FAT_AREA_SECTORS,X
    STA FS_CWD_LBA_LO
    LDA #$00
    STA FS_CWD_LBA_HI
    LDA #$5C
    STA FS_NAME_FILE
    BNE @store_name
@found:
    LDY FILE_HANDLE_OFFSET
    JSR FS_DRIVE_PARAMS
    LDA FH_DIR_LBA_LO,Y
    SEC
    SBC FS_FAT_AREA_SECTORS,X
    ASL A
    ASL A
    ASL A
    ASL A
    STA DOS_TEMP_3
    LDA FH_DIR_ENTRY,X
    CLC
    ADC DOS_TEMP_3
    STA FS_CWD_ENTRY_ID
    LDA FH_CLUSTER_LO,X
    STA FS_CLUSTER_LO
    LDA FH_CLUSTER_HI,X
    STA FS_CLUSTER_HI
    JSR FS_CLUSTER_TO_LBA
    LDA FS_LBA_LO
    STA FS_CWD_LBA_LO
    LDA FS_LBA_HI
    STA FS_CWD_LBA_HI
@store_name:
    LDA #<FS_NAME_FILE
    STA FS_SRC_PTR_LO
    LDA #>FS_NAME_FILE
    STA FS_SRC_PTR_HI
    LDA #<DIR_NAME83
    STA FS_DST_PTR_LO
    LDA #>DIR_NAME83
    STA FS_DST_PTR_HI
    LDA #$0B
    STA FS_COPY_COUNT
    JSR FS_COPY_BYTES
    JSR FS_CLOSE
    LDA #$00
    STA DOS_ERROR
    CLC
    RTS
@map_error:
    LDA DOS_ERROR
    CMP #$2D
    BNE @check_not_found
    LDA #$03
    BNE @fail
@check_not_found:
    CMP #$02
    BNE @fail
    LDA #$03
@fail:
    PHA
    JSR FS_CLOSE
    PLA
    STA DOS_ERROR
    SEC
    RTS
; 作用：文件服务 $7D/$01：把 DIR_NAME83 里的 8+3 名称整理成以 0 结尾的 \NAME.EXT（没有扩展名时不加点），放到 PATH_BUFFER；根目录（首字节 $5C）整理成 \。
; 输入：DIR_NAME83。
; 输出：PATH_BUFFER，DOS_ERROR=0。
; 调用者：FS_DISPATCH_7D（地址表）
FS_FORMAT_NAME:
    LDA #$00
    STA DOS_ERROR
    LDA DIR_NAME83
    CMP #$5C
    BNE @format
    STA PATH_BUFFER
    LDA #$00
    STA PATH_BUFFER+1
    RTS
@format:
    LDA #$5C
    STA PATH_BUFFER
    LDY #$00
@copy_name:
    LDA DIR_NAME83,Y
    CMP #$20
    BEQ @name_short
    STA PATH_BUFFER+1,Y
    INY
    CPY #$08
    BNE @copy_name
    LDA DIR_NAME83,Y
    CMP #$20
    BEQ @terminate
    LDA #$2E
    STA PATH_BUFFER+1,Y
@copy_ext:
    LDA DIR_NAME83,Y
    CMP #$20
    BNE @store_ext_char
    INY
    JMP @terminate
@store_ext_char:
    STA PATH_BUFFER+2,Y
    INY
    CPY #$0B
    BNE @copy_ext
    INY
    JMP @terminate
@name_short:
    STY DOS_TEMP_3
    LDY #$08
    LDA DIR_NAME83,Y
    CMP #$20
    BNE @store_dot
    LDY DOS_TEMP_3
    JMP @terminate
@store_dot:
    LDX DOS_TEMP_3
    STA PATH_BUFFER+2,X
    LDX DOS_TEMP_3
    LDA #$2E
    STA PATH_BUFFER+1,X
    INC DOS_TEMP_3
    INY
@copy_short_ext:
    LDA DIR_NAME83,Y
    CMP #$20
    BNE @store_short_ext_char
    LDY DOS_TEMP_3
    INY
    JMP @terminate
@store_short_ext_char:
    LDX DOS_TEMP_3
    STA PATH_BUFFER+2,X
    INC DOS_TEMP_3
    INY
    CPY #$0B
    BNE @copy_short_ext
    LDY DOS_TEMP_3
    INY
@terminate:
    LDA #$00
    STA PATH_BUFFER+1,Y
    RTS
; 作用：文件服务 $7D/$02：以方式 5 创建目录（FS_OPEN）：新目录的第一个扇区写入“.”（指向它自己的簇）和“..”（簇号 0，即根目录）两个目录项，簇内其余扇区清 0；然后关闭句柄，并调用磁盘服务 $80/$07，保留出错码。
; 输入：PATH_BUFFER。
; 输出：DOS_ERROR 为出错码（0 成功）。
; 调用者：FS_DISPATCH_7D（地址表）
FS_MAKE_DIR:
    LDA #$05
    STA FILE_MODE
    JSR FS_OPEN
    BCC @create_entries
    JMP @flush
@create_entries:
    JSR FS_CLEAR_BUFFER_512
    LDA #<DISK_BUFFER
    STA FS_PTR_LO
    LDA #>DISK_BUFFER
    STA FS_PTR_HI
    JSR FS_FILL_SPACES_11
    LDY #$00
    LDA #$2E
    STA (FS_PTR_LO),Y
    LDY #$0B
    LDA #$10
    STA (FS_PTR_LO),Y
    LDY #$16
    LDA #$00
    STA (FS_PTR_LO),Y
    INY
    STA (FS_PTR_LO),Y
    LDY #$18
    LDA #$00
    STA (FS_PTR_LO),Y
    INY
    STA (FS_PTR_LO),Y
    LDX FILE_HANDLE_OFFSET
    LDY #$1A
    LDA FH_CLUSTER_LO,X
    STA (FS_PTR_LO),Y
    STA FS_CLUSTER_LO
    INY
    LDA FH_CLUSTER_HI,X
    STA (FS_PTR_LO),Y
    STA FS_CLUSTER_HI
    LDA #$20
    JSR FS_PTR_ADD_A
    JSR FS_FILL_SPACES_11
    LDY #$00
    LDA #$2E
    STA (FS_PTR_LO),Y
    INY
    STA (FS_PTR_LO),Y
    LDY #$0B
    LDA #$10
    STA (FS_PTR_LO),Y
    LDY #$16
    LDA #$00
    STA (FS_PTR_LO),Y
    INY
    STA (FS_PTR_LO),Y
    LDY #$18
    LDA #$00
    STA (FS_PTR_LO),Y
    INY
    STA (FS_PTR_LO),Y
    JSR FS_CLUSTER_TO_LBA
    JSR FS_FAT_STORE
    JSR FS_DRIVE_PARAMS
    LDY FS_SECTORS_PER_CLUSTER,X
    DEY
    BEQ @close
@clear_sector:
    TYA
    PHA
    JSR FS_CLEAR_BUFFER_512
    LDA FS_LBA_LO
    CLC
    ADC #$01
    STA FS_LBA_LO
    LDA FS_LBA_HI
    ADC #$00
    STA FS_LBA_HI
    JSR FS_FAT_STORE
    PLA
    TAY
    DEY
    BNE @clear_sector
@close:
    JSR FS_CLOSE
@flush:
    LDA DOS_ERROR
    PHA
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    PLA
    STA DOS_ERROR
    RTS
; 作用：文件服务 $7D/$03：删除目录：以方式 4 打开（FS_OPEN），目录非空出错码 $29（FS_DELETE_SCAN_DIR），只读目录出错码 5，否则释放簇链（FS_FREE_HANDLE_CHAIN）并把目录项首字节改成 $E5，再调用磁盘服务 $80/$07；对普通文件出错码 $2D（删文件用 $7C/$03），路径不存在出错码 2 改为 3。
; 输入：PATH_BUFFER。
; 输出：C=0 成功；C=1 失败，DOS_ERROR 为出错码。
; 调用者：FS_DISPATCH_7D（地址表）
FS_REMOVE_DIR:
    LDA #$04
    STA FILE_MODE
    JSR FS_OPEN
    BCS @map_error
    LDX FILE_HANDLE_OFFSET
    LDA FH_CLUSTER_LO,X
    STA FS_CLUSTER_LO
    LDA FH_CLUSTER_HI,X
    STA FS_CLUSTER_HI
    JSR FS_CLUSTER_TO_LBA
    JSR FS_DELETE_SCAN_DIR
    BCC @empty
    BCS @fail
@empty:
    LDX FILE_HANDLE_OFFSET
    LDA FH_ATTR,X
    AND #$01
    BEQ @free_chain
    LDA #$05
    STA DOS_ERROR
    BNE @fail
@free_chain:
    JSR FS_FREE_HANDLE_CHAIN
    BCS @fail
    LDX FILE_HANDLE_OFFSET
    LDA #$E5
    STA FH_NAME,X
    LDA #$01
    STA FILE_HANDLES,X
    JSR FS_CLOSE
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    CLC
    RTS
@fail:
    LDA DOS_ERROR
    PHA
    JSR FS_CLOSE
    PLA
    STA DOS_ERROR
@map_error:
    LDA DOS_ERROR
    CMP #$02
    BNE @flush
    LDA #$03
@flush:
    PHA
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    PLA
    STA DOS_ERROR
    SEC
    RTS
; 作用：把 DISK_BUFFER 起的 512 字节清 0。
; 输出：A=$00，X=$02，Y=$00。
; 调用者：FS_CLEAR_NEW_CLUSTER、FS_MAKE_DIR
FS_CLEAR_BUFFER_512:
    LDA #<DISK_BUFFER
    STA FS_PTR_LO
    LDA #>DISK_BUFFER
    STA FS_PTR_HI
    LDX #$00
    LDY #$00
@loop:
    LDA #$00
    STA (FS_PTR_LO),Y
    INY
    BNE @loop
    INC FS_PTR_HI
    INX
    CPX #$02
    BNE @loop
    RTS
; 作用：文件服务 $7B/$07：重置 FAT 缓存状态（FS_FAT_CACHE_STATE、FS_FAT_CACHE_VALID 清 0，FS_FAT_CACHE_INIT_A、FS_FAT_CACHE_INIT_B 置 $0A）。
; 调用者：FS_FAT_RELOAD、FS_DISPATCH_7B（地址表）
FS_FAT_CACHE_RESET:
    LDA #$00
    STA FS_FAT_CACHE_STATE
    STA FS_FAT_CACHE_VALID
    LDA #$0A
    STA FS_FAT_CACHE_INIT_A
    STA FS_FAT_CACHE_INIT_B
    RTS
; 作用：文件服务 $7B/$01：把 FS_LBA 指定的扇区读进 DISK_BUFFER：引导扇区与第一份 FAT 的扇区（FS_LBA 不大于每个 FAT 的扇区数）从 FAT 缓存取（缓存还没装入时先 FS_FAT_LOAD_ALL），其他扇区直接从磁盘读（DISK_READ_SECTOR）。
; 输入：FS_LBA_LO/HI=扇区号。
; 输出：C=0 成功，C=1 出错。
; 调用者：FS_FIND_FREE_DIR_ENTRY、FS_WRITE_BACK_DIR_ENTRY、FS_SCAN_DIR、FS_DELETE_SCAN_DIR、FS_TRANSFER_START、FS_DISPATCH_7B（地址表）
FS_FAT_LOAD:
    LDA FS_FAT_CACHE_VALID
    BMI @loaded
    JSR FS_FAT_LOAD_ALL
    BCS @return
@loaded:
    LDA FS_LBA_HI
    BNE @read_disk
    JSR FS_DRIVE_PARAMS
    LDA FS_SECTORS_PER_FAT,X
    CMP FS_LBA_LO
    BCC @read_disk
    LDA FS_LBA_LO
    STA FS_FAT_CACHE_SECTOR
    JMP @from_cache
@read_disk:
    JSR DISK_READ_SECTOR
    BCC @return_clear
    BCS @return
@from_cache:
    JSR FS_FAT_CACHE_ADDR
    JSR FS_FAT_CACHE_COPY_OUT
    BCS @return
@return_clear:
    CLC
@return:
    RTS
; 作用：把 FAT 缓存扇区序号 FS_FAT_CACHE_SECTOR（0-9，0 是引导扇区）换算成缓存位置：页号 FS_FAT_CACHE_PAGE=$F5+序号÷8，页内地址 FS_FAT_CACHE_ADDR_LO/HI=$B000+（序号除以 8 的余数）×$200。
; 输入：FS_FAT_CACHE_SECTOR。
; 输出：C=0 成功；序号不小于 10 时 C=1。
; 调用者：FS_FAT_LOAD、FS_FAT_STORE、FS_FAT_CACHE_ADDR_OF_LBA
FS_FAT_CACHE_ADDR:
    LDA FS_FAT_CACHE_SECTOR
    CMP #$0A
    BCS @return
    LSR A
    LSR A
    LSR A
    CLC
    ADC #$F5
    STA FS_FAT_CACHE_PAGE
    LDA #$00
    STA FS_FAT_CACHE_ADDR_LO
    LDA #$B0
    STA FS_FAT_CACHE_ADDR_HI
    LDA FS_FAT_CACHE_SECTOR
    AND #$07
    TAX
    BEQ @return_clear
    LDA FS_FAT_CACHE_ADDR_HI
@loop:
    CLC
    ADC #$02
    DEX
    BNE @loop
    STA FS_FAT_CACHE_ADDR_HI
@return_clear:
    CLC
@return:
    RTS
; 作用：文件服务 $7B/$02：把 DISK_BUFFER（512 字节）写到 FS_LBA 指定的扇区（DISK_WRITE_SECTOR）；FS_LBA 是引导扇区或第一份 FAT 的扇区时，同步更新 FAT 缓存里对应的位置（经窗口 3 映射缓存页，复制 512 字节）。
; 输入：FS_LBA_LO/HI=扇区号，DISK_BUFFER=数据。
; 输出：C=0 成功，C=1 写盘出错。
; 调用者：FS_WRITE_BACK_DIR_ENTRY、FS_CLEAR_NEW_CLUSTER、FS_MAKE_DIR、FS_DISPATCH_7B（地址表）
FS_FAT_STORE:
    JSR DISK_WRITE_SECTOR
    BCS @return
    LDA FS_LBA_LO
    ORA FS_LBA_HI
    BNE @in_fat_check
    LDA #$00
    STA FS_FAT_CACHE_SECTOR
    BEQ @update_cache
@in_fat_check:
    LDA FS_LBA_HI
    BNE @return_clear
    JSR FS_DRIVE_PARAMS
    LDA FS_LBA_LO
    SEC
    SBC #$01
    CMP FS_SECTORS_PER_FAT,X
    BCS @return_clear
    LDA FS_LBA_LO
    STA FS_FAT_CACHE_SECTOR
@update_cache:
    JSR FS_FAT_CACHE_ADDR
    LDA FS_FAT_CACHE_PAGE
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
    LDA FS_FAT_CACHE_ADDR_LO
    STA FS_DST_PTR_LO
    LDA FS_FAT_CACHE_ADDR_HI
    STA FS_DST_PTR_HI
    JSR FS_COPY_512
@return_clear:
    CLC
@return:
    RTS
; 作用：把 FS_SRC_PTR_LO/HI 指向的 512 字节复制到 FS_DST_PTR_LO/HI。
; 输入：FS_SRC_PTR_LO/HI、FS_DST_PTR_LO/HI。
; 副作用：两个指针的高字节各加 2。
; 调用者：FS_FAT_STORE、FS_FAT_RELOAD
FS_COPY_512:
    LDX #$00
    LDY #$00
@loop:
    LDA (FS_SRC_PTR_LO),Y
    STA (FS_DST_PTR_LO),Y
    INY
    BNE @loop
    LDA FS_SRC_PTR_HI
    CLC
    ADC #$01
    STA FS_SRC_PTR_HI
    LDA FS_DST_PTR_HI
    CLC
    ADC #$01
    STA FS_DST_PTR_HI
    INX
    CPX #$02
    BNE @loop
    RTS
; 作用：按每个 FAT 的扇区数（FS_SECTORS_PER_FAT）调用磁盘服务 $80/$04，把第二份 FAT（磁盘扇区号从每个 FAT 的扇区数加 2 起）读入 FAT 缓存页 $F5（缓存扇区 1 起）。
; 输出：C=0 成功；磁盘出错时 DOS_ERROR=DISK_STATUS、C=1。
; 调用者：FS_ALLOC_CHAIN、FS_FREE_HANDLE_CHAIN
FS_READ_ALL_FAT:
    JSR FS_DRIVE_PARAMS
    LDA FS_SECTORS_PER_FAT,X
    STA DISK_COUNT_LO
    LDA #$00
    STA DISK_COUNT_HI
    LDA #$F5
    STA DISK_PAGE
    LDA #$01
    STA DISK_PAGE_SECTOR
    LDA #$80
    STA DISK_MODE
    CLC
    LDA DISK_COUNT_LO
    ADC #$02
    STA DISK_SECTOR
    LDA #$00
    STA DISK_TRACK
    LDA #$00
    STA DISK_HEAD
    LDA #$80
    STA SYS_FUNCTION
    LDA #$04
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DISK_STATUS
    BEQ @return_clear
    STA DOS_ERROR
    SEC
    RTS
@return_clear:
    CLC
    RTS
; 作用：文件服务 $7B/$10：把 FAT 缓存（页 $F5 起，跳过引导扇区）整体写回磁盘：先写第一份 FAT（磁盘服务 $80/$05，磁道 0 磁头 0 扇区 2 起），再写第二份 FAT（起始扇区号加每个 FAT 的扇区数）。
; 输入：FS_DRIVE_LETTER（选磁盘参数）。
; 输出：C=0 成功；第一份 FAT 写入出错时 DOS_ERROR=DISK_STATUS、C=1；第二份的写入状态不检查。
; 副作用：改写 FS_FAT_CACHE_SECTOR（借作临时单元）和 DISK_* 参数。
; 调用者：FS_ALLOC_CHAIN、FS_FREE_HANDLE_CHAIN、FS_DISPATCH_7B（地址表）
FS_FAT_WRITE_BACK:
    JSR FS_DRIVE_PARAMS
    LDA FS_SECTORS_PER_FAT,X
    STA FS_FAT_CACHE_SECTOR
    STA DISK_COUNT_LO
    LDA #$00
    STA DISK_COUNT_HI
    LDA #$F5
    STA DISK_PAGE
    LDA #$01
    STA DISK_PAGE_SECTOR
    LDA #$80
    STA DISK_MODE
    LDA #$00
    STA DISK_TRACK
    LDA #$02
    STA DISK_SECTOR
    LDA #$00
    STA DISK_HEAD
    LDA #$80
    STA SYS_FUNCTION
    LDA #$05
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DISK_STATUS
    BEQ @write_second
    STA DOS_ERROR
    JMP @return_set
@write_second:
    CLC
    LDA FS_FAT_CACHE_SECTOR
    STA DISK_COUNT_LO
    ADC DISK_SECTOR
    STA DISK_SECTOR
    LDA #$80
    STA SYS_FUNCTION
    LDA #$05
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：从磁盘读入引导扇区与 9 个 FAT 扇区（共 10 个扇区，磁道 0 磁头 0 扇区 1 起）到 FAT 缓存（页 $F5 起），并置缓存有效标志 FS_FAT_CACHE_VALID（位 7，读之前就置位，读失败也不清）。
; 输出：C=0 读入成功；缓存已有效或 DISK_STATUS 非 0 时 C=1（出错码不写入 DOS_ERROR）。
; 调用者：FS_FAT_LOAD、FS_FAT_RELOAD
FS_FAT_LOAD_ALL:
    LDA FS_FAT_CACHE_VALID
    BMI @return_set
    LDA #$80
    STA FS_FAT_CACHE_VALID
    LDA #$0A
    STA DISK_COUNT_LO
    LDA #$00
    STA DISK_COUNT_HI
    LDA #$F5
    STA DISK_PAGE
    LDA #$00
    STA DISK_PAGE_SECTOR
    LDA #$80
    STA DISK_MODE
    LDA #$00
    STA DISK_TRACK
    LDA #$01
    STA DISK_SECTOR
    LDA #$00
    STA DISK_HEAD
    LDA #$80
    STA SYS_FUNCTION
    LDA #$04
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DISK_STATUS
    BNE @return_set
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：经功能 $34 把 FAT 缓存里 FS_FAT_CACHE_ADDR 处的 512 字节复制到 DISK_BUFFER。
; 输入：FS_FAT_CACHE_PAGE、FS_FAT_CACHE_ADDR_LO/HI。
; 输出：C=0 成功，C=1 功能 $34 出错（SYS_STATUS 非 0）。
; 调用者：FS_FAT_LOAD
FS_FAT_CACHE_COPY_OUT:
    LDA FS_FAT_CACHE_PAGE
    STA SYS_PAGE
    LDA FS_FAT_CACHE_ADDR_LO
    SEC
    SBC #$00
    STA FAR_OFFSET_LO
    LDA FS_FAT_CACHE_ADDR_HI
    SBC #$B0
    STA FAR_OFFSET_HI
    LDA #$00
    STA SYS_ARG_0C
    LDA #$02
    STA SYS_ARG_0D
    LDA #<DISK_BUFFER
    STA DST_ADDR_LO
    LDA #>DISK_BUFFER
    STA DST_ADDR_HI
    LDA #$34
    STA SYS_FUNCTION
    JSR VEC_SYSCALL
    LDA SYS_STATUS
    BEQ @return_clear
    SEC
    RTS
@return_clear:
    CLC
    RTS
; 作用：把 FS_LBA_LO 存进 FS_FAT_CACHE_SECTOR 后调用 FS_FAT_CACHE_ADDR。
; 输入：FS_LBA_LO。
; 输出：同 FS_FAT_CACHE_ADDR（C=1 表示序号不小于 10）。
; 调用者：FS_FAT12_READ_ENTRY、FS_FAT12_WRITE_ENTRY
FS_FAT_CACHE_ADDR_OF_LBA:
    LDA FS_LBA_LO
    STA FS_FAT_CACHE_SECTOR
    JSR FS_FAT_CACHE_ADDR
    RTS
; 作用：FS_LBA 转 CHS（FS_LBA_TO_CHS）后调用磁盘服务 $80/$02 读一个扇区。
; 输入：FS_LBA_LO/HI。
; 输出：C=0 成功；DISK_STATUS 非 0 时 DOS_ERROR=DISK_STATUS、C=1。
; 调用者：FS_FAT_LOAD
DISK_READ_SECTOR:
    JSR FS_LBA_TO_CHS
    LDA #$80
    STA SYS_FUNCTION
    LDA #$02
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DISK_STATUS
    BEQ @return_clear
    STA DOS_ERROR
    SEC
    RTS
@return_clear:
    CLC
    RTS
; 作用：FS_LBA 转 CHS（FS_LBA_TO_CHS）后调用磁盘服务 $80/$03 写一个扇区。
; 输入：FS_LBA_LO/HI。
; 输出：C=0 成功；DISK_STATUS 非 0 时 DOS_ERROR=DISK_STATUS、C=1。
; 调用者：FS_FAT_STORE
DISK_WRITE_SECTOR:
    JSR FS_LBA_TO_CHS
    LDA #$80
    STA SYS_FUNCTION
    LDA #$03
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA DISK_STATUS
    BEQ @return_clear
    STA DOS_ERROR
    SEC
    RTS
@return_clear:
    CLC
    RTS
