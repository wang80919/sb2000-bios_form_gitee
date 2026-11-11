; ------------------------------------------------------------------------
; 名称：fs-open-and-io.asm
; 说明：文件系统：入口与打开、读写文件的调用
; 作者：sungbin
; 邮箱：sungbin@3578.cn
; 日期：2026-11-09
; 备注：占ROM 第 58-5A 页，汇编地址 $8000 起，后面的文件接在它后面
; ------------------------------------------------------------------------
.org $8000
    JMP FS_DISPATCH
; 作用：文件服务 $7C/$00：调用 FS_OPEN，打开方式由调用者先写入 FILE_MODE
; 调用者：FS_OPEN_MODE1、FS_OPEN_MODE3_CLOSE、FS_DISPATCH_7C（地址表）
FS_OPEN_CALL:
    JSR FS_OPEN
    RTS
    BCC @flush_ok
    LDA DOS_ERROR
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
@flush_ok:
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    CLC
    RTS
; 作用：文件服务 $7B/$09：按 FILE_MODE（0-5）打开 PATH_BUFFER 里的路径：找空闲句柄（FS_FIND_FREE_HANDLE），解析路径并查目录项（FS_OPEN_PARSE_PATH）；已存在的是文件但方式不小于 4（目录方式）或是目录但方式小于 4 时出错码 $2D；方式 0、2、4 打开已有的（FS_OPEN_CHECK_WRITE_LOCK），方式 1、3、5 经 FS_OPEN_AFTER_LOOKUP 创建或删除；最后核对句柄里的起始簇，超出簇号上限时大小与簇号清 0。
; 输入：FILE_MODE（0-5，不小于 6 时出错码 $28），PATH_BUFFER。
; 输出：C=0、DOS_ERROR=0，句柄偏移放在 FILE_HANDLE_OFFSET；失败 C=1，DOS_ERROR 为出错码（4 个句柄都在用时为 4）。
; 调用者：FS_OPEN_CALL、FS_FIND_ENTRY、FS_MAKE_DIR、FS_REMOVE_DIR、FS_RENAME、FS_OPEN_MODE3_CLOSE_NOFLUSH、FS_DISPATCH_7B（地址表）
FS_OPEN:
    LDA #$00
    STA DOS_ERROR
    LDA FILE_MODE
    CMP #$06
    BCC @mode_ok
    LDA #$28
    STA DOS_ERROR
    JMP @return_set
@mode_ok:
    JSR FS_FIND_FREE_HANDLE
    BCC @have_handle
    LDA #$04
    STA DOS_ERROR
    JMP @return_set
@have_handle:
    STX FILE_HANDLE_OFFSET
    JSR FS_OPEN_PARSE_PATH
    PHP
    LDA FS_IO_FLAGS
    BEQ @check_entry_type
    PLP
    JMP @return_set
@check_entry_type:
    BCS @dispatch_mode
    LDA FS_ENTRY_TYPE
    CMP #$46
    BEQ @entry_is_file
    LDA FILE_MODE
    CMP #$04
    BCS @dispatch_mode
    LDA #$2D
    STA DOS_ERROR
    PLP
    JMP @return_set
@entry_is_file:
    LDA FILE_MODE
    CMP #$04
    BCC @dispatch_mode
    LDA #$2D
    STA DOS_ERROR
    PLP
    JMP @return_set
@dispatch_mode:
    LDA FILE_MODE
    CMP #$00
    BEQ @existing_modes
    CMP #$01
    BEQ @create_modes
    CMP #$02
    BEQ @existing_modes
    CMP #$03
    BEQ @create_modes
    CMP #$04
    BEQ @existing_modes
    CMP #$05
    BEQ @create_modes
    BNE @return_set
@create_modes:
    PLP
    JSR FS_OPEN_AFTER_LOOKUP
    BCS @return_set
    BCC @check_cluster
@existing_modes:
    PLP
    JSR FS_OPEN_CHECK_WRITE_LOCK
    BCS @return_set
@check_cluster:
    LDY FILE_HANDLE_OFFSET
    LDA FH_CLUSTER_HI,Y
    BNE @check_limit
    SEC
    LDA FH_CLUSTER_LO,Y
    SBC #$02
    BCS @done
    JSR FS_DRIVE_PARAMS
    LDA #$00
    STA FH_SIZE_0
    STA FH_SIZE_1
    STA FH_SIZE_2
@check_limit:
    JSR FS_DRIVE_PARAMS
    SEC
    LDA FS_CLUSTER_LIMIT_LO,X
    SBC FH_CLUSTER_LO,Y
    LDA FS_CLUSTER_LIMIT_HI,X
    SBC FH_CLUSTER_HI,Y
    BCS @done
    LDA #$00
    STA FH_SIZE_0
    STA FH_SIZE_1
    STA FH_SIZE_2
    STA FH_CLUSTER_LO
    STA FH_CLUSTER_HI
@done:
    LDA #$00
    STA DOS_ERROR
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：打开文件时检查句柄：FH_FLAGS 位 7（已打开写入）为 1 且 FILE_MODE 为 4 时出错码 $2A、C=1
; 调用者：FS_OPEN
FS_OPEN_CHECK_WRITE_LOCK:
    BCS @return
    LDX FILE_HANDLE_OFFSET
    LDA FH_FLAGS,X
    BPL @record_handle
    LDA FILE_MODE
    CMP #$04
    BNE @record_handle
    LDA #$2A
    STA DOS_ERROR
    SEC
    RTS
@record_handle:
    LDA FILE_MODE
    STA FILE_HANDLES,X
    LDA #$00
    STA FH_POS_0,X
    STA FH_POS_1,X
    STA FH_POS_2,X
    CLC
@return:
    RTS
; 作用：打开方式 1、3、5 的收尾（调用时 C 为目录查找结果，C=0 表示找到）：没找到时：方式 3（删除）直接失败，出错码不是 2（未找到）也失败；否则按当前是根目录还是子目录定位目录扇区，找空闲目录项（FS_FIND_FREE_DIR_ENTRY，根目录满出错码 $12）并记入句柄的目录位置；方式 5（创建目录）在子目录里再建目录出错码 $2A。找到了：方式 5 出错码 $26；方式 3 目标是只读或目录出错码 5，否则目录项首字节改成 $E5 并释放簇链（FS_FREE_HANDLE_CHAIN）；方式 1 同样先释放旧簇链。随后分配 1 个簇（FS_ALLOC_CHAIN），初始化句柄（位置、大小清 0，属性目录为 $10、文件为 $20，日期时间取 $7F/$02、$7F/$04），写回目录项（FS_WRITE_BACK_DIR_ENTRY）。
; 输出：C=0 成功，C=1 失败（DOS_ERROR）。
; 调用者：FS_OPEN
FS_OPEN_AFTER_LOOKUP:
    LDY FILE_HANDLE_OFFSET
    BCC @file_exists
    LDA FILE_MODE
    CMP #$03
    BNE @check_not_found
    JMP @return_set
@check_not_found:
    LDA DOS_ERROR
    CMP #$02
    BEQ @find_parent
    JMP @return_set
@find_parent:
    LDA FH_FLAGS,Y
    BMI @subdirectory_parent
    JSR FS_DRIVE_PARAMS
    LDA FS_FAT_AREA_SECTORS,X
    STA FS_LBA_LO
    LDA #$00
    STA FS_LBA_HI
    BEQ @find_free_entry
@subdirectory_parent:
    LDA FILE_MODE
    CMP #$05
    BNE @parent_cluster
    LDA #$2A
    STA DOS_ERROR
    JMP @return_set
@parent_cluster:
    LDA FH_PARENT_CLUSTER_LO,Y
    STA FS_CLUSTER_LO
    LDA FH_PARENT_CLUSTER_HI,Y
    STA FS_CLUSTER_HI
    JSR FS_CLUSTER_TO_LBA
@find_free_entry:
    JSR FS_FIND_FREE_DIR_ENTRY
    BCS @dir_full
    LDY FILE_HANDLE_OFFSET
    LDA FS_LBA_LO
    STA FH_DIR_LBA_LO,Y
    LDA FS_LBA_HI
    STA FH_DIR_LBA_HI,Y
    TXA
    STA FH_DIR_ENTRY,Y
    JMP @alloc_cluster
@dir_full:
    LDA #$12
    STA DOS_ERROR
    JMP @return_set
@file_exists:
    LDA FILE_MODE
    CMP #$05
    BNE @check_delete
    LDA #$26
    STA DOS_ERROR
    JMP @return_set
@check_delete:
    LDA FILE_MODE
    CMP #$03
    BNE @free_old_chain
    LDX FILE_HANDLE_OFFSET
    LDA FH_ATTR,X
    AND #$01
    BNE @protected
    AND #$10
    BEQ @delete_entry
@protected:
    LDA #$05
    STA DOS_ERROR
    JMP @return_set
@delete_entry:
    LDA #$E5
    STA FH_NAME,X
    JSR FS_FREE_HANDLE_CHAIN
    BCC @stamp_date
    JMP @return_set
@free_old_chain:
    JSR FS_FREE_HANDLE_CHAIN
    BCC @alloc_cluster
    JMP @return_set
@alloc_cluster:
    LDA #$01
    STA FS_ALLOC_COUNT_LO
    LDA #$00
    STA FS_ALLOC_COUNT_HI
    STA FS_CLUSTER_LO
    STA FS_CLUSTER_HI
    JSR FS_ALLOC_CHAIN
    BCC @init_handle
    JMP @return_set
@init_handle:
    LDX FILE_HANDLE_OFFSET
    LDA FS_FAT_VALUE_LO
    STA FH_CLUSTER_LO,X
    LDA FS_FAT_VALUE_HI
    STA FH_CLUSTER_HI,X
    LDA #$00
    STA FH_POS_0,X
    STA FH_POS_1,X
    STA FH_POS_2,X
    STA FH_SIZE_0,X
    STA FH_SIZE_1,X
    STA FH_SIZE_2,X
    LDA #$00
    STA FH_DATE_LO,X
    STA FH_DATE_HI,X
    STA FH_TIME_LO,X
    STA FH_TIME_HI,X
    LDA FILE_MODE
    CMP #$05
    BEQ @directory_attr
    LDA #$20
    STA FH_ATTR,X
    BNE @stamp_date
@directory_attr:
    LDA #$10
    STA FH_ATTR,X
@stamp_date:
    LDA #$7F
    STA SYS_FUNCTION
    LDA #$02
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDA #$7F
    STA SYS_FUNCTION
    LDA #$04
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    LDX FILE_HANDLE_OFFSET
    LDA FILE_DATE_LO
    STA FH_DATE_LO,X
    LDA FILE_DATE_HI
    STA FH_DATE_HI,X
    LDA FILE_TIME_LO
    STA FH_TIME_LO,X
    LDA FILE_TIME_HI
    STA FH_TIME_HI,X
    JSR FS_WRITE_BACK_DIR_ENTRY
    BCS @return_set
    LDX FILE_HANDLE_OFFSET
    LDA FILE_MODE
    STA FILE_HANDLES,X
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：文件服务 $7C/$02：关闭句柄，出错时保留出错码，并调用磁盘服务 $80/$07
; 调用者：FS_OPEN_MODE3_CLOSE、FS_DISPATCH_7C（地址表）
FS_CLOSE_FLUSH:
    JSR FS_CLOSE
    BCC @closed
    LDA DOS_ERROR
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
@closed:
    LDA #$80
    STA SYS_FUNCTION
    LDA #$07
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    CLC
    RTS
; 作用：文件服务 $7B/$0A：关闭 FILE_HANDLE_OFFSET 指定的句柄
; 方式 1、2、5 的句柄先写回目录项，最后把句柄置为空闲（$FF）
; 调用者：FS_CLOSE_FLUSH、FS_FIND_ENTRY、FS_MAKE_DIR、FS_REMOVE_DIR、FS_RENAME、FS_OPEN_MODE3_CLOSE_NOFLUSH、FS_DISPATCH_7B（地址表）
FS_CLOSE:
    LDX FILE_HANDLE_OFFSET
    LDA FILE_HANDLES,X
    CMP #$00
    BEQ @free_handle
    CMP #$02
    BEQ @write_back
    CMP #$01
    BEQ @write_back
    CMP #$03
    BEQ @free_handle
    CMP #$04
    BEQ @free_handle
    CMP #$05
    BEQ @write_back
    BNE @free_handle
@write_back:
    JSR FS_WRITE_BACK_DIR_ENTRY
    BCC @free_handle
    SEC
@free_handle:
    PHP
    LDX FILE_HANDLE_OFFSET
    LDA #$FF
    STA FILE_HANDLES,X
    PLP
    RTS
; 作用：文件服务 $7B/$13：把 4 个句柄全部置为空闲（$FF）
; 调用者：FS_DISPATCH_7B（地址表）
FS_RESET_HANDLES:
    LDX #$00
    LDY #$00
@loop:
    LDA #$FF
    STA FILE_HANDLES,X
    TXA
    CLC
    ADC #$2C
    TAX
    INY
    CPY #$04
    BCC @loop
    RTS
; 作用：找空闲句柄：C=0 时 X 是句柄偏移（每个句柄 $2C 字节），C=1 表示 4 个句柄都在用
; 调用者：FS_OPEN
FS_FIND_FREE_HANDLE:
    LDX #$00
    LDY #$00
@loop:
    LDA FILE_HANDLES,X
    BMI @return_clear
    TXA
    CLC
    ADC #$2C
    TAX
    INY
    CPY #$04
    BCC @loop
    SEC
    RTS
@return_clear:
    CLC
    RTS
; 作用：在目录扇区里找空闲目录项（每扇区 16 项，每项 32 字节）；扇区用完取下一扇区，目录满了再给目录分配新簇
; 调用者：FS_OPEN_AFTER_LOOKUP、FS_FIND_FREE_DIR_ENTRY
FS_FIND_FREE_DIR_ENTRY:
    JSR FS_FAT_LOAD
    BCS @return
    LDX #$00
    LDA #<DISK_BUFFER
    STA FS_PTR_LO
    LDA #>DISK_BUFFER
    STA FS_PTR_HI
@loop:
    JSR FS_DIR_ENTRY_FREE
    BCC @return_clear
    LDA #$20
    JSR FS_PTR_ADD_A
    INX
    CPX #$10
    BNE @loop
    LDA FS_LBA_LO
    STA DOS_TEMP_0
    LDA FS_LBA_HI
    STA DOS_TEMP_1
    JSR FS_NEXT_SECTOR
    BCS @no_next_sector
    LDA FS_NEXT_LBA_LO
    STA FS_LBA_LO
    LDA FS_NEXT_LBA_HI
    STA FS_LBA_HI
    BCC FS_FIND_FREE_DIR_ENTRY
@no_next_sector:
    BPL @return
    LDA DOS_TEMP_0
    STA FS_LBA_LO
    LDA DOS_TEMP_1
    STA FS_LBA_HI
    JSR FS_LBA_TO_CLUSTER
    BCS @return
    LDA #$01
    STA FS_ALLOC_COUNT_LO
    LDA #$00
    STA FS_ALLOC_COUNT_HI
    JSR FS_ALLOC_CHAIN
    BCS @return
    LDA FS_FAT_VALUE_LO
    STA FS_CLUSTER_LO
    LDA FS_FAT_VALUE_HI
    STA FS_CLUSTER_HI
    JSR FS_CLUSTER_TO_LBA
    JSR FS_CLEAR_NEW_CLUSTER
    BCS @return
    LDX #$00
@return_clear:
    CLC
@return:
    RTS
