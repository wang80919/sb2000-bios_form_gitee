; 作用：把 PATH_BUFFER 前 13 字节复制到 CMD_TAIL。
; 输出：C=0。
; 调用者：FS_RENAME
PATH_TO_CMD_TAIL:
    LDX #$00
@loop:
    CPX #$0D
    BEQ @return_clear
    LDA PATH_BUFFER,X
    STA CMD_TAIL,X
    INX
    JMP @loop
@return_clear:
    CLC
    RTS
; 作用：把 CMD_TAIL 前 13 字节追加到 PATH_BUFFER 的 Y 位置起。
; 输入：Y=写入 PATH_BUFFER 的起始位置。
; 输出：Y 前进 13，C=0。
; 调用者：FS_RENAME、FS_BUILD_FULL_PATH
CMD_TAIL_TO_PATH:
    LDX #$00
@loop:
    CPX #$0D
    BEQ @return_clear
    LDA CMD_TAIL,X
    STA PATH_BUFFER,Y
    INX
    INY
    JMP @loop
@return_clear:
    CLC
    RTS
; 作用：校验 FILE_DATE_LO/HI 是否是合法日期（FAT 日期：位 0-4 日，位 5-8 月，位 9-15 年，自 1980 起）：年份不超过 $77（2099 年），月 1-12，日不小于 1 且不超过该月天数（FS_DAYS_IN_MONTH；二月按闰年算，年份能被 4 整除为 29 天，否则 28 天）。
; 输入：FILE_DATE_LO/HI。
; 输出：C=0 合法；非法时 DOS_ERROR=$25、C=1。
; 副作用：DOS_TEMP_0-2 临时使用，返回时恢复。
; 调用者：FS_SET_DATE
FS_CHECK_DATE:
    LDA DOS_TEMP_0
    PHA
    LDA DOS_TEMP_1
    PHA
    LDA DOS_TEMP_2
    PHA
    LDA FILE_DATE_LO
    AND #$1F
    STA DOS_TEMP_0
    LDA FILE_DATE_HI
    LSR A
    STA DOS_TEMP_2
    LDA FILE_DATE_LO
    ROR A
    LSR A
    LSR A
    LSR A
    LSR A
    STA DOS_TEMP_1
    LDA #$77
    CMP DOS_TEMP_2
    BCS @month_check
    JMP @invalid
@month_check:
    LDA DOS_TEMP_1
    BNE @month_upper
    JMP @invalid
@month_upper:
    LDA #$0C
    CMP DOS_TEMP_1
    BCS @day_check
    JMP @invalid
@day_check:
    LDA DOS_TEMP_0
    BNE @day_upper
    JMP @invalid
@day_upper:
    LDX DOS_TEMP_1
    CPX #$02
    BEQ @february
    DEX
    LDA FS_DAYS_IN_MONTH,X
@compare_day:
    CMP DOS_TEMP_0
    BCS @valid
    JMP @invalid
@valid:
    PLA
    STA DOS_TEMP_2
    PLA
    STA DOS_TEMP_1
    PLA
    STA DOS_TEMP_0
    CLC
    RTS
@invalid:
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
@february:
    LDA DOS_TEMP_2
    AND #$03
    BEQ @leap_year
    LDA #$1C
    JMP @compare_day
@leap_year:
    LDA #$1D
    JMP @compare_day
; 作用：校验 FILE_TIME_LO/HI 是否是合法时间（FAT 时间：位 0-4 秒的一半，位 5-10 分，位 11-15 时）：秒的一半不超过 $1D，分不超过 $3B，时不超过 $17。RTS 之后还有一段没有入口的代码：CLOCK_MIDNIGHT_FLAG 不为 0 时清 0 并让系统日期加一天（SYS_DATE_DAY、SYS_DATE_MONTH、SYS_DATE_YEAR，年份上限 $77），没有任何指令能到达。
; 输入：FILE_TIME_LO/HI。
; 输出：C=0 合法；非法时 DOS_ERROR=$25、C=1。
; 副作用：DOS_TEMP_0-2 临时使用，返回时恢复。
; 调用者：FS_SET_TIME
FS_CHECK_TIME:
    LDA DOS_TEMP_0
    PHA
    LDA DOS_TEMP_1
    PHA
    LDA DOS_TEMP_2
    PHA
    LDA FILE_TIME_LO
    AND #$1F
    STA DOS_TEMP_0
    LDA FILE_TIME_LO
    STA DOS_TEMP_1
    LDA FILE_TIME_HI
    STA DOS_TEMP_2
    LSR DOS_TEMP_2
    ROR DOS_TEMP_1
    LSR DOS_TEMP_2
    ROR DOS_TEMP_1
    LSR DOS_TEMP_2
    ROR DOS_TEMP_1
    LSR DOS_TEMP_1
    LSR DOS_TEMP_1
    LDA FILE_TIME_HI
    LSR A
    LSR A
    LSR A
    STA DOS_TEMP_2
    LDA #$1D
    CMP DOS_TEMP_0
    BCS @minute_check
    JMP @invalid
@minute_check:
    LDA #$3B
    CMP DOS_TEMP_1
    BCS @hour_check
    JMP @invalid
@hour_check:
    LDA #$17
    CMP DOS_TEMP_2
    BCC @invalid
    PLA
    STA DOS_TEMP_2
    PLA
    STA DOS_TEMP_1
    PLA
    STA DOS_TEMP_0
    CLC
    RTS
@invalid:
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
    LDA CLOCK_MIDNIGHT_FLAG
    BNE @midnight
    JMP @return_clear
@midnight:
    LDA #$00
    STA CLOCK_MIDNIGHT_FLAG
    INC SYS_DATE_DAY
    LDX SYS_DATE_MONTH
    CPX #$02
    BEQ @february
    DEX
    LDA FS_DAYS_IN_MONTH,X
@compare_day:
    CMP SYS_DATE_DAY
    BCS @return_clear
    LDA #$01
    STA SYS_DATE_DAY
    INC SYS_DATE_MONTH
    LDA #$0C
    CMP SYS_DATE_MONTH
    BCS @return_clear
    INC SYS_DATE_YEAR
    LDA #$77
    CMP SYS_DATE_YEAR
    BCS @return_clear
    STA SYS_DATE_YEAR
@return_clear:
    CLC
    RTS
@february:
    LDA SYS_DATE_YEAR
    AND #$03
    BEQ @leap_year
    LDA #$1C
    JMP @compare_day
@leap_year:
    LDA #$1D
    JMP @compare_day
; 作用：文件服务 $7C/$08：取句柄的日期到 FILE_DATE_LO/HI。FAT 日期格式：位 0-4 日，位 5-8 月，位 9-15 年（自 1980）。
; 输入：FILE_HANDLE_OFFSET=句柄。
; 输出：FILE_DATE_LO/HI，C=0。
; 调用者：FS_DISPATCH_7C（地址表）
FS_GET_DATE:
    LDA FILE_HANDLE_OFFSET
    STA FS_ACTIVE_HANDLE
    LDX FS_ACTIVE_HANDLE
    LDA FH_DATE_LO,X
    STA FILE_DATE_LO
    LDA FH_DATE_HI,X
    STA FILE_DATE_HI
    CLC
    RTS
; 作用：文件服务 $7C/$07：把 FILE_DATE_LO/HI 设为句柄的日期（先 FS_CHECK_DATE 校验，非法时出错码 $25）。
; 输入：FILE_HANDLE_OFFSET=句柄，FILE_DATE_LO/HI。
; 输出：C=0 成功，C=1 日期非法。
; 调用者：FS_DISPATCH_7C（地址表）
FS_SET_DATE:
    JSR FS_CHECK_DATE
    BCC @store
    SEC
    RTS
@store:
    LDA FILE_HANDLE_OFFSET
    STA FS_ACTIVE_HANDLE
    LDX FS_ACTIVE_HANDLE
    LDA FILE_DATE_LO
    STA FH_DATE_LO,X
    LDA FILE_DATE_HI
    STA FH_DATE_HI,X
    CLC
    RTS
; 作用：文件服务 $7C/$0A：取句柄的时间到 FILE_TIME_LO/HI。FAT 时间格式：位 0-4 秒的一半，位 5-10 分，位 11-15 时。
; 输入：FILE_HANDLE_OFFSET=句柄。
; 输出：FILE_TIME_LO/HI，C=0。
; 调用者：FS_DISPATCH_7C（地址表）
FS_GET_TIME:
    LDA FILE_HANDLE_OFFSET
    STA FS_ACTIVE_HANDLE
    LDX FS_ACTIVE_HANDLE
    LDA FH_TIME_LO,X
    STA FILE_TIME_LO
    LDA FH_TIME_HI,X
    STA FILE_TIME_HI
    CLC
    RTS
; 作用：文件服务 $7C/$09：把 FILE_TIME_LO/HI 设为句柄的时间（先 FS_CHECK_TIME 校验，非法时出错码 $25）。
; 输入：FILE_HANDLE_OFFSET=句柄，FILE_TIME_LO/HI。
; 输出：C=0 成功，C=1 时间非法。
; 调用者：FS_DISPATCH_7C（地址表）
FS_SET_TIME:
    JSR FS_CHECK_TIME
    BCC @store
    SEC
    RTS
@store:
    LDA FILE_HANDLE_OFFSET
    STA FS_ACTIVE_HANDLE
    LDX FS_ACTIVE_HANDLE
    LDA FILE_TIME_LO
    STA FH_TIME_LO,X
    LDA FILE_TIME_HI
    STA FH_TIME_HI,X
    CLC
    RTS
; 作用：文件服务 $7C/$0C：取句柄的属性到 FILE_ATTR。
; 输入：FILE_HANDLE_OFFSET=句柄。
; 输出：FILE_ATTR，C=0。
; 调用者：FS_DISPATCH_7C（地址表）
FS_GET_ATTR:
    LDA FILE_HANDLE_OFFSET
    STA FS_ACTIVE_HANDLE
    LDX FS_ACTIVE_HANDLE
    LDA FH_ATTR,X
    STA FILE_ATTR
    CLC
    RTS
; 作用：文件服务 $7C/$0B：把 FILE_ATTR 设为句柄的属性（大于 $3F 或带卷标位 $08 时出错码 $25）。
; 输入：FILE_HANDLE_OFFSET=句柄，FILE_ATTR。
; 输出：C=0 成功，C=1 属性非法。
; 调用者：FS_DISPATCH_7C（地址表）
FS_SET_ATTR:
    LDA #$3F
    CMP FILE_ATTR
    BCS @check_volume
    LDA #$25
    STA DOS_ERROR
    SEC
    RTS
@check_volume:
    LDA FILE_ATTR
    AND #$08
    BEQ @store
    LDA #$25
    STA DOS_ERROR
    SEC
    RTS
@store:
    LDA FILE_HANDLE_OFFSET
    STA FS_ACTIVE_HANDLE
    LDX FS_ACTIVE_HANDLE
    LDA FILE_ATTR
    STA FH_ATTR,X
    CLC
    RTS
; 作用：文件服务 $7C/$0D：取句柄的文件大小，3 字节放在 FILE_SIZE_0-2。
; 输入：FILE_HANDLE_OFFSET=句柄。
; 输出：FILE_SIZE_0-2，C=0。
; 调用者：FS_DISPATCH_7C（地址表）
FS_GET_SIZE:
    LDA FILE_HANDLE_OFFSET
    STA FS_ACTIVE_HANDLE
    LDX FS_ACTIVE_HANDLE
    LDA FH_SIZE_0,X
    STA FILE_SIZE_0
    LDA FH_SIZE_1,X
    STA FILE_SIZE_1
    LDA FH_SIZE_2,X
    STA FILE_SIZE_2
    CLC
    RTS
; 作用：文件服务 $7C/$01：以方式 1 打开（FS_OPEN_CALL）。
; 调用者：FS_DISPATCH_7C（地址表）
FS_OPEN_MODE1:
    LDA #$01
    STA FILE_MODE
    JSR FS_OPEN_CALL
    RTS
; 作用：文件服务 $7C/$03：以方式 3 打开再关闭（方式 3：文件存在且不是只读时，把目录项首字节改成 $E5，即标为已删除），最后调用磁盘服务 $80/$07（FS_CLOSE_FLUSH）。
; 输出：C=0 成功，C=1 失败，DOS_ERROR 为出错码。
; 调用者：FS_DISPATCH_7C（地址表）
FS_OPEN_MODE3_CLOSE:
    LDA #$03
    STA FILE_MODE
    JSR FS_OPEN_CALL
    LDA DOS_ERROR
    BEQ @close
    SEC
    RTS
@close:
    JSR FS_CLOSE_FLUSH
    BNE @return_set
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：文件服务 $7B/$12：与 $7C/$03 相同，但直接调用 FS_OPEN/FS_CLOSE，不调用磁盘服务 $80/$07。
; 输出：C=0 成功，C=1 失败，DOS_ERROR 为出错码。
; 调用者：FS_DISPATCH_7B（地址表）
FS_OPEN_MODE3_CLOSE_NOFLUSH:
    LDA #$03
    STA FILE_MODE
    JSR FS_OPEN
    LDA DOS_ERROR
    BEQ @close
    SEC
    RTS
@close:
    JSR FS_CLOSE
    BNE @return_set
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：每月天数表（一月到十二月，12 项；以月号减 1 为下标，二月在代码里按闰年另行处理，表里的 28 不用）。
; 引用者：FS_CHECK_DATE、FS_CHECK_TIME
FS_DAYS_IN_MONTH:
    .byte $1F,$1C,$1F,$1E,$1F,$1E,$1F,$1F,$1E,$1F
    .byte $1E
    .byte $1F
; 作用：文件服务 $7C/$0E：读引导扇区（FS_FAT_RELOAD）、检查参数并记下磁盘参数（FORMAT、LABEL 使用）：盘符必须是 A 或 B（FS_CHECK_DRIVE_LETTER）；读失败时 DOS_ERROR=DISK_STATUS；每扇区 512 字节，每簇扇区数为 1、2、4、8（FS_CLUSTER_SHIFT），保留扇区 1，FAT 份数 2，根目录项数不为 0 且不超过 255，总扇区数 $0B40（2880），每个 FAT 的扇区数不超过 255；任何一项不符出错码 $0E。通过后依次算出 FAT 区扇区数、根目录扇区数、数据区起始扇区、簇号上限，并保存卷序列号与卷标。
; 输入：FILE_DRIVE_LETTER。
; 输出：C=0 成功；C=1 失败，DOS_ERROR 为出错码。
; 调用者：FS_OPEN_PARSE_PATH、FS_DISPATCH_7C（地址表）
FS_READ_BOOT_SECTOR:
    JSR FS_CHECK_DRIVE_LETTER
    BCC @drive_ok
    SEC
    RTS
@drive_ok:
    JSR FS_FAT_RELOAD
    BCC @read_ok
    LDA DISK_STATUS
    STA DOS_ERROR
    SEC
    RTS
@read_ok:
    LDA BOOT_BYTES_PER_SECTOR_LO
    BEQ @bytes_hi
    JMP @bad_boot_sector
@bytes_hi:
    LDA BOOT_BYTES_PER_SECTOR_HI
    CMP #$02
    BEQ @sectors_per_cluster
    JMP @bad_boot_sector
@sectors_per_cluster:
    LDA BOOT_SECTORS_PER_CLUSTER
    LDX FS_DRIVE_PARAM_OFFSET
    STA FS_SECTORS_PER_CLUSTER,X
    JSR FS_CLUSTER_SHIFT
    BCC @reserved_lo
    JMP @bad_boot_sector
@reserved_lo:
    LDA BOOT_RESERVED_SECTORS_LO
    CMP #$01
    BEQ @reserved_hi
    JMP @bad_boot_sector
@reserved_hi:
    LDA BOOT_RESERVED_SECTORS_HI
    BEQ @fat_count
    JMP @bad_boot_sector
@fat_count:
    LDA BOOT_FAT_COUNT
    CMP #$02
    BEQ @root_entries_lo
    JMP @bad_boot_sector
@root_entries_lo:
    LDA BOOT_ROOT_ENTRIES_LO
    BNE @root_entries_hi
    JMP @bad_boot_sector
@root_entries_hi:
    LDX FS_DRIVE_PARAM_OFFSET
    STA FS_ROOT_ENTRIES_LO,X
    LDA BOOT_ROOT_ENTRIES_HI
    BEQ @total_lo
    JMP @bad_boot_sector
@total_lo:
    LDA BOOT_TOTAL_SECTORS_LO
    CMP #$40
    BEQ @total_hi
    JMP @bad_boot_sector
@total_hi:
    LDA BOOT_TOTAL_SECTORS_HI
    CMP #$0B
    BEQ @fat_sectors_lo
    JMP @bad_boot_sector
@fat_sectors_lo:
    LDA BOOT_SECTORS_PER_FAT_LO
    BNE @fat_sectors_hi
    JMP @bad_boot_sector
@fat_sectors_hi:
    LDX FS_DRIVE_PARAM_OFFSET
    STA FS_SECTORS_PER_FAT,X
    LDA BOOT_SECTORS_PER_FAT_HI
    BEQ @calc_fat_area
    JMP @bad_boot_sector
@calc_fat_area:
    JSR FS_CALC_FAT_SECTORS
    BCC @calc_root
    JMP @bad_boot_sector
@calc_root:
    JSR FS_CALC_ROOT_SECTORS
    BCC @calc_data_start
    JMP @bad_boot_sector
@calc_data_start:
    JSR FS_CALC_DATA_START
    BCC @calc_data_sectors
    JMP @bad_boot_sector
@calc_data_sectors:
    JSR FS_CALC_DATA_SECTORS
    BCC @store_volume
    JMP @bad_boot_sector
@store_volume:
    JSR FS_STORE_VOLUME_SERIAL
    JSR FS_STORE_VOLUME_LABEL
    CLC
    RTS
@bad_boot_sector:
    LDA #$0E
    STA DOS_ERROR
    SEC
    RTS
; 作用：FILE_DRIVE_LETTER 里的驱动器字母必须是 A 或 B（大小写均可），否则 DOS_ERROR=$0F、C=1；A 盘时 FS_DRIVE_PARAM_OFFSET=0，B 盘时 $19。
; 输入：FILE_DRIVE_LETTER。
; 输出：C=0 合法，FS_DRIVE_PARAM_OFFSET=驱动器参数块偏移。
; 调用者：FS_READ_AT、FS_READ_BOOT_SECTOR、FS_WRITE_FILE、FS_READ_FILE
FS_CHECK_DRIVE_LETTER:
    LDA FILE_DRIVE_LETTER
    CMP #$41
    BEQ @drive_a
    CMP #$61
    BEQ @drive_a
    CMP #$42
    BEQ @drive_b
    CMP #$62
    BEQ @drive_b
    LDA #$0F
    STA DOS_ERROR
    SEC
    RTS
@drive_a:
    LDA #$00
    STA FS_DRIVE_PARAM_OFFSET
    CLC
    RTS
@drive_b:
    LDA #$19
    STA FS_DRIVE_PARAM_OFFSET
    CLC
    RTS
; 作用：把每簇扇区数 FS_SECTORS_PER_CLUSTER 换成移位数写入 FS_CLUSTER_SHIFT_BITS（1→0、2→1、4→2、8→3）；其他值时 C=1。
; 输入：FS_DRIVE_PARAM_OFFSET。
; 输出：C=0 成功，C=1 簇大小不合法。
; 调用者：FS_READ_BOOT_SECTOR
FS_CLUSTER_SHIFT:
    LDX FS_DRIVE_PARAM_OFFSET
    LDA FS_SECTORS_PER_CLUSTER,X
    CMP #$01
    BNE @check_2
    LDA #$00
    STA FS_CLUSTER_SHIFT_BITS,X
    JMP @return_clear
@check_2:
    CMP #$02
    BNE @check_4
    LDA #$01
    STA FS_CLUSTER_SHIFT_BITS,X
    JMP @return_clear
@check_4:
    CMP #$04
    BNE @check_8
    LDA #$02
    STA FS_CLUSTER_SHIFT_BITS,X
    JMP @return_clear
@check_8:
    CMP #$08
    BNE @return_set
    LDA #$03
    STA FS_CLUSTER_SHIFT_BITS,X
@return_clear:
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：每个 FAT 的扇区数 FS_SECTORS_PER_FAT 乘 2 再加 1（两份 FAT 加引导扇区），存入 FS_FAT_AREA_SECTORS；溢出时 C=1。
; 输入：FS_DRIVE_PARAM_OFFSET。
; 调用者：FS_READ_BOOT_SECTOR
FS_CALC_FAT_SECTORS:
    CLC
    LDX FS_DRIVE_PARAM_OFFSET
    LDA FS_SECTORS_PER_FAT,X
    ASL A
    BCC @add_boot
    SEC
    RTS
@add_boot:
    ADC #$01
    BCC @store
    SEC
    RTS
@store:
    STA FS_FAT_AREA_SECTORS,X
    CLC
    RTS
; 作用：根目录项数 FS_ROOT_ENTRIES_LO 右移 4 位（每扇区 16 项）得到根目录扇区数，存入 FS_ROOT_SECTORS。
; 输入：FS_DRIVE_PARAM_OFFSET。
; 输出：C=0。
; 调用者：FS_READ_BOOT_SECTOR
FS_CALC_ROOT_SECTORS:
    LDX FS_DRIVE_PARAM_OFFSET
    LDA FS_ROOT_ENTRIES_LO,X
    LSR A
    LSR A
    LSR A
    LSR A
    STA FS_ROOT_SECTORS,X
    CLC
    RTS
; 作用：FS_FAT_AREA_SECTORS 加 FS_ROOT_SECTORS 得到数据区起始扇区 FS_DATA_START_SECTOR；溢出时 C=1。
; 输入：FS_DRIVE_PARAM_OFFSET。
; 调用者：FS_READ_BOOT_SECTOR
FS_CALC_DATA_START:
    LDX FS_DRIVE_PARAM_OFFSET
    CLC
    LDA FS_FAT_AREA_SECTORS,X
    ADC FS_ROOT_SECTORS,X
    BCC @store
    SEC
    RTS
@store:
    STA FS_DATA_START_SECTOR,X
    CLC
    RTS
; 作用：总扇区数 $0B40（2880）减去数据区起始扇区 FS_DATA_START_SECTOR，再按簇大小右移（FS_CLUSTER_SHIFT_BITS 次）得到簇数，加 2 存入 FS_CLUSTER_LIMIT_LO/HI（簇号上限，簇号从 2 起）；减出负数时 C=1。
; 输入：FS_DRIVE_PARAM_OFFSET。
; 调用者：FS_READ_BOOT_SECTOR
FS_CALC_DATA_SECTORS:
    LDX FS_DRIVE_PARAM_OFFSET
    SEC
    LDA #$40
    SBC FS_DATA_START_SECTOR,X
    STA FS_CLUSTER_LIMIT_LO,X
    LDA #$0B
    SBC #$00
    STA FS_CLUSTER_LIMIT_HI,X
    BCS @shift_clusters
    SEC
    RTS
@shift_clusters:
    LDY #$00
@loop:
    TYA
    CMP FS_CLUSTER_SHIFT_BITS,X
    BEQ @store_limit
    LSR FS_CLUSTER_LIMIT_HI,X
    ROR FS_CLUSTER_LIMIT_LO,X
    INY
    JMP @loop
@store_limit:
    CLC
    LDA FS_CLUSTER_LIMIT_LO,X
    ADC #$02
    STA FS_CLUSTER_LIMIT_LO,X
    LDA FS_CLUSTER_LIMIT_HI,X
    ADC #$00
    STA FS_CLUSTER_LIMIT_HI,X
    CLC
    RTS
; 作用：把引导扇区里的卷序列号 BOOT_VOLUME_SERIAL（4 字节）反序存入 FS_VOLUME_SERIAL（按 FS_DRIVE_PARAM_OFFSET 选驱动器）。
; 调用者：FS_READ_BOOT_SECTOR
FS_STORE_VOLUME_SERIAL:
    LDX FS_DRIVE_PARAM_OFFSET
    LDA BOOT_VOLUME_SERIAL+3
    STA FS_VOLUME_SERIAL,X
    LDA BOOT_VOLUME_SERIAL+2
    STA FS_VOLUME_SERIAL+1,X
    LDA BOOT_VOLUME_SERIAL+1
    STA FS_VOLUME_SERIAL+2,X
    LDA BOOT_VOLUME_SERIAL
    STA FS_VOLUME_SERIAL+3,X
    RTS
; 作用：把引导扇区里的卷标 BOOT_VOLUME_LABEL（11 字节）存入 FS_VOLUME_LABEL（按 FS_DRIVE_PARAM_OFFSET 选驱动器）。
; 调用者：FS_READ_BOOT_SECTOR
FS_STORE_VOLUME_LABEL:
    LDX FS_DRIVE_PARAM_OFFSET
    LDY #$00
@loop:
    CPY #$0B
    BEQ @return
    LDA BOOT_VOLUME_LABEL,Y
    STA FS_VOLUME_LABEL,X
    INY
    INX
    JMP @loop
@return:
    RTS
; 作用：计划读写：先算头部长度（FS_PLAN_HEAD），再算整扇区与尾部（FS_PLAN_BODY）。
; 输出：C=0 成功，C=1 失败。
; 调用者：FS_READ_AT、FS_WRITE_AT
FS_PLAN_READ:
    JSR FS_PLAN_HEAD
    BCS @return_set
    JSR FS_PLAN_BODY
    BCS @return_set
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：扇区内偏移 FS_SECTOR_OFFSET_LO/HI 为 0 时头部长度 FS_HEAD_LEN_LO/HI 为 0；否则头部长度取 $200 减偏移，且不超过读写长度 FILE_SIZE_0-2（3 字节）。
; 输入：FS_SECTOR_OFFSET_LO/HI、FILE_SIZE_0-2。
; 输出：FS_HEAD_LEN_LO/HI，C=0。
; 调用者：FS_PLAN_READ
FS_PLAN_HEAD:
    LDA FS_SECTOR_OFFSET_LO
    ORA FS_SECTOR_OFFSET_HI
    BNE @partial
    LDA #$00
    STA FS_HEAD_LEN_LO
    STA FS_HEAD_LEN_HI
    JMP @return_clear
@partial:
    SEC
    LDA #$00
    SBC FS_SECTOR_OFFSET_LO
    STA FS_HEAD_LEN_LO
    LDA #$02
    SBC FS_SECTOR_OFFSET_HI
    STA FS_HEAD_LEN_HI
    SEC
    LDA FILE_SIZE_0
    SBC FS_HEAD_LEN_LO
    LDA FILE_SIZE_1
    SBC FS_HEAD_LEN_HI
    LDA FILE_SIZE_2
    SBC #$00
    BCC @use_size
    BCS @return_clear
@use_size:
    LDA FILE_SIZE_0
    STA FS_HEAD_LEN_LO
    LDA FILE_SIZE_1
    STA FS_HEAD_LEN_HI
@return_clear:
    CLC
    RTS
; 作用：算整扇区数与尾部：尾部长度 FS_TAIL_LEN_LO/HI 取（FILE_SIZE 减 FS_HEAD_LEN）的低 9 位；FS_BODY_SECTORS_LO/HI 取 FILE_SIZE 按 512 字节向上取整的扇区数；再看扇区内偏移加 FILE_SIZE 的低 9 位是否超过 $200（跨到下一个扇区）：超过时 FS_BODY_SECTORS 加 1，但其低字节的低 3 位为 0（正好整页 8 个扇区）时不加，改为 FS_PLAN_FLAG 置 1。
; 输入：FILE_SIZE_0-2、FS_HEAD_LEN_LO/HI、FS_SECTOR_OFFSET_LO/HI。
; 输出：FS_TAIL_LEN_LO/HI、FS_BODY_SECTORS_LO/HI、FS_PLAN_FLAG，C=0。
; 副作用：DOS_TEMP_0-2 临时使用，返回时恢复。
; 调用者：FS_PLAN_READ
FS_PLAN_BODY:
    LDA DOS_TEMP_0
    PHA
    LDA DOS_TEMP_1
    PHA
    LDA DOS_TEMP_2
    PHA
    SEC
    LDA FILE_SIZE_0
    SBC FS_HEAD_LEN_LO
    STA DOS_TEMP_0
    LDA FILE_SIZE_1
    SBC FS_HEAD_LEN_HI
    STA DOS_TEMP_1
    LDA FILE_SIZE_2
    SBC #$00
    STA DOS_TEMP_2
    LDA DOS_TEMP_0
    AND #$FF
    STA FS_TAIL_LEN_LO
    LDA DOS_TEMP_1
    AND #$01
    STA FS_TAIL_LEN_HI
    LDA #$00
    STA FS_PLAN_FLAG
    LDA FILE_SIZE_2
    LSR A
    STA FS_BODY_SECTORS_HI
    LDA FILE_SIZE_1
    ROR A
    STA FS_BODY_SECTORS_LO
    LDA FILE_SIZE_1
    AND #$01
    ORA FILE_SIZE_0
    BEQ @offset_check
    CLC
    LDA FS_BODY_SECTORS_LO
    ADC #$01
    STA FS_BODY_SECTORS_LO
    LDA FS_BODY_SECTORS_HI
    ADC #$00
    STA FS_BODY_SECTORS_HI
@offset_check:
    CLC
    LDA FILE_SIZE_0
    ADC FS_SECTOR_OFFSET_LO
    STA DOS_TEMP_0
    LDA FILE_SIZE_1
    AND #$01
    ADC FS_SECTOR_OFFSET_HI
    STA DOS_TEMP_1
    SEC
    LDA #$00
    SBC DOS_TEMP_0
    LDA #$02
    SBC DOS_TEMP_1
    BCS @done
    LDA FS_BODY_SECTORS_LO
    AND #$07
    BNE @add_sector
    LDA #$01
    STA FS_PLAN_FLAG
    BNE @done
@add_sector:
    CLC
    LDA FS_BODY_SECTORS_LO
    ADC #$01
    STA FS_BODY_SECTORS_LO
    LDA FS_BODY_SECTORS_HI
    ADC #$00
    STA FS_BODY_SECTORS_HI
@done:
    PLA
    STA DOS_TEMP_2
    PLA
    STA DOS_TEMP_1
    PLA
    STA DOS_TEMP_0
    CLC
    RTS
; 作用：文件服务 $7B/$08：按文件内偏移 FILE_OFFSET_0-2 定位到所在扇区：偏移为 0 时取簇链首扇区（FS_SEEK_START），否则算出扇区序号（FS_OFFSET_TO_SECTOR）后沿簇链走到该扇区（FS_WALK_TO_SECTOR）；成功后把 FILE_START_PAGE、FILE_START_OFFSET_LO/HI 存入 FS_SAVED_START_PAGE、FS_SAVED_START_OFFSET_LO/HI。
; 输入：FILE_OFFSET_0-2、FS_ACTIVE_HANDLE。
; 输出：C=0 时 FS_TARGET_LBA_LO/HI=扇区号，FS_SECTOR_OFFSET_LO/HI=扇区内偏移；簇链太短时出错码 $11、C=1。
; 调用者：FS_READ_AT、FS_WRITE_AT、FS_SEEK_LAST_BYTE、FS_DISPATCH_7B（地址表）
FS_SEEK_SECTOR:
    LDA FILE_OFFSET_0
    ORA FILE_OFFSET_1
    ORA FILE_OFFSET_2
    BNE @seek_offset
    JSR FS_SEEK_START
    BCC @save_start
    JMP @return_set
@seek_offset:
    JSR FS_OFFSET_TO_SECTOR
    BCS @return_set
    JSR FS_WALK_TO_SECTOR
    BCS @return_set
@save_start:
    LDA FILE_START_PAGE
    STA FS_SAVED_START_PAGE
    LDA FILE_START_OFFSET_LO
    STA FS_SAVED_START_OFFSET_LO
    LDA FILE_START_OFFSET_HI
    STA FS_SAVED_START_OFFSET_HI
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：文件开头定位：扇区序号 FS_SECTOR_INDEX_LO/HI 置 1，扇区内偏移 FS_SECTOR_OFFSET_LO/HI 清 0，句柄起始簇换成扇区号存入 FS_TARGET_LBA_LO/HI。
; 输入：FS_ACTIVE_HANDLE。
; 输出：C=0。
; 调用者：FS_SEEK_SECTOR
FS_SEEK_START:
    LDA #$01
    STA FS_SECTOR_INDEX_LO
    LDA #$00
    STA FS_SECTOR_INDEX_HI
    STA FS_SECTOR_OFFSET_LO
    STA FS_SECTOR_OFFSET_HI
    LDX FS_ACTIVE_HANDLE
    LDA FH_CLUSTER_LO,X
    STA FS_CLUSTER_LO
    LDA FH_CLUSTER_HI,X
    STA FS_CLUSTER_HI
    JSR FS_CLUSTER_TO_LBA
    LDA FS_LBA_LO
    STA FS_TARGET_LBA_LO
    LDA FS_LBA_HI
    STA FS_TARGET_LBA_HI
    CLC
    RTS
; 作用：把 FILE_OFFSET_0-2 换成扇区序号 FS_SECTOR_INDEX_LO/HI（字节偏移除以 512 再加 1）和扇区内偏移 FS_SECTOR_OFFSET_LO/HI。RTS 之后还有一段没有入口的代码：检查 FS_LBA 是否落在数据区内（小于 $0B40 且不小于数据区起始扇区），没有任何指令能到达。
; 输入：FILE_OFFSET_0-2。
; 输出：C=0。
; 调用者：FS_ADVANCE_OFFSET、FS_SEEK_SECTOR
FS_OFFSET_TO_SECTOR:
    LDA FILE_OFFSET_2
    LSR A
    STA FS_SECTOR_INDEX_HI
    LDA FILE_OFFSET_1
    ROR A
    STA FS_SECTOR_INDEX_LO
    LDA FILE_OFFSET_0
    STA FS_SECTOR_OFFSET_LO
    LDA FILE_OFFSET_1
    AND #$01
    STA FS_SECTOR_OFFSET_HI
    CLC
    LDA FS_SECTOR_INDEX_LO
    ADC #$01
    STA FS_SECTOR_INDEX_LO
    LDA FS_SECTOR_INDEX_HI
    ADC #$00
    STA FS_SECTOR_INDEX_HI
    CLC
    RTS
    SEC
    LDA #$40
    SBC FS_LBA_LO
    LDA #$0B
    SBC FS_LBA_HI
    BCS @check_data_start
    JMP @return_set
@check_data_start:
    SEC
    LDA FS_LBA_LO
    LDX FS_DRIVE_PARAM_OFFSET
    SBC FS_DATA_START_SECTOR,X
    LDA FS_LBA_HI
    SBC #$00
    BCC @return_set
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：从句柄起始簇出发沿簇链（FS_NEXT_SECTOR）走到第 FS_SECTOR_INDEX_LO/HI 个扇区（从 1 起）；走不到时出错码 $11。
; 输入：FS_ACTIVE_HANDLE、FS_SECTOR_INDEX_LO/HI。
; 输出：C=0 时 FS_TARGET_LBA_LO/HI=该扇区号；C=1 失败。
; 副作用：DOS_TEMP_0-2 临时使用，返回时恢复；FS_LBA 被改写。
; 调用者：FS_SEEK_SECTOR
FS_WALK_TO_SECTOR:
    LDA DOS_TEMP_0
    PHA
    LDA DOS_TEMP_1
    PHA
    LDA DOS_TEMP_2
    PHA
    LDX FS_ACTIVE_HANDLE
    LDA FH_CLUSTER_LO,X
    STA FS_CLUSTER_LO
    LDA FH_CLUSTER_HI,X
    STA FS_CLUSTER_HI
    JSR FS_CLUSTER_TO_LBA
    LDA #$01
    STA DOS_TEMP_0
    LDA #$00
    STA DOS_TEMP_1
@loop:
    SEC
    LDA DOS_TEMP_0
    SBC FS_SECTOR_INDEX_LO
    LDA DOS_TEMP_1
    SBC FS_SECTOR_INDEX_HI
    BCC @advance
    JMP @found
@advance:
    JSR FS_NEXT_SECTOR
    BCC @advanced
    LDA #$11
    STA DOS_ERROR
    JMP @fail
@advanced:
    LDA FS_NEXT_LBA_LO
    STA FS_LBA_LO
    LDA FS_NEXT_LBA_HI
    STA FS_LBA_HI
    CLC
    LDA DOS_TEMP_0
    ADC #$01
    STA DOS_TEMP_0
    LDA DOS_TEMP_1
    ADC #$00
    STA DOS_TEMP_1
    JMP @loop
@found:
    LDA FS_LBA_LO
    STA FS_TARGET_LBA_LO
    LDA FS_LBA_HI
    STA FS_TARGET_LBA_HI
    PLA
    STA DOS_TEMP_2
    PLA
    STA DOS_TEMP_1
    PLA
    STA DOS_TEMP_0
    CLC
    RTS
@fail:
    PLA
    STA DOS_TEMP_2
    PLA
    STA DOS_TEMP_1
    PLA
    STA DOS_TEMP_0
    SEC
    RTS
; 作用：文件服务 $7C/$10：把扩展 RAM 页里的内容整个写入文件：只能用于方式 1 打开的句柄（否则出错码 $28）；FILE_SIZE_0-2 为 0 时出错码 $25；先把大小存入句柄并分配簇链（FS_ALLOC_FOR_SIZE），再沿簇链整体写盘（FS_TRANSFER_CHAIN）。
; 输入：FILE_HANDLE_OFFSET=句柄，FILE_START_PAGE=数据所在的扩展 RAM 页，FILE_SIZE_0-2=字节数。
; 输出：C=0 成功，C=1 失败，DOS_ERROR 为出错码；FS_DRIVE_LETTER 保持调用前的值。
; 调用者：FS_DISPATCH_7C（地址表）
FS_WRITE_FILE:
    LDA FS_DRIVE_LETTER
    STA FS_SAVED_DRIVE_LETTER
    LDA FILE_SIZE_0
    ORA FILE_SIZE_1
    ORA FILE_SIZE_2
    BNE @check_mode
    LDA #$25
    STA DOS_ERROR
    JMP @fail
@check_mode:
    LDA FILE_HANDLE_OFFSET
    STA FS_ACTIVE_HANDLE
    LDX FS_ACTIVE_HANDLE
    LDA FILE_HANDLES,X
    CMP #$01
    BEQ @check_drive
    LDA #$28
    STA DOS_ERROR
    JMP @fail
@check_drive:
    LDA FH_DRIVE,X
    STA FS_DRIVE_LETTER
    STA FILE_DRIVE_LETTER
    JSR FS_CHECK_DRIVE_LETTER
    BCC @set_size
    JMP @fail
@set_size:
    LDX FS_ACTIVE_HANDLE
    LDA FILE_SIZE_0
    STA FH_SIZE_0,X
    LDA FILE_SIZE_1
    STA FH_SIZE_1,X
    LDA FILE_SIZE_2
    STA FH_SIZE_2,X
    JSR FS_ALLOC_FOR_SIZE
    BCC @transfer
    JMP @fail
@transfer:
    LDA #$00
    ORA #$80
    STA FS_IO_FLAGS
    LDX FS_ACTIVE_HANDLE
    LDA FH_CLUSTER_LO,X
    STA FS_CLUSTER_LO
    LDA FH_CLUSTER_HI,X
    STA FS_CLUSTER_HI
    LDA FILE_START_PAGE
    STA DISK_PAGE
    LDA #$00
    STA DISK_PAGE_SECTOR
    JSR FS_TRANSFER_CHAIN
    BCC @success
    JMP @fail
@success:
    LDA FS_SAVED_DRIVE_LETTER
    STA FS_DRIVE_LETTER
    CLC
    RTS
@fail:
    LDA FS_SAVED_DRIVE_LETTER
    STA FS_DRIVE_LETTER
    SEC
    RTS
; 作用：文件服务 $7C/$0F：把整个文件读入扩展 RAM 页：只能用于方式 0 打开的句柄（否则出错码 $28）；文件为空时直接成功；否则算出簇数（FS_HANDLE_SIZE_TO_UNITS）后沿簇链整体读入（FS_TRANSFER_CHAIN）。
; 输入：FILE_HANDLE_OFFSET=句柄，FILE_START_PAGE=起始页号。
; 输出：C=0 成功，C=1 失败，DOS_ERROR 为出错码；FS_DRIVE_LETTER 保持调用前的值。
; 调用者：FS_DISPATCH_7C（地址表）
FS_READ_FILE:
    LDA FS_DRIVE_LETTER
    STA FS_SAVED_DRIVE_LETTER
    LDA FILE_HANDLE_OFFSET
    STA FS_ACTIVE_HANDLE
    LDX FS_ACTIVE_HANDLE
    LDA FILE_HANDLES,X
    CMP #$00
    BEQ @check_size
    LDA #$28
    STA DOS_ERROR
    JMP @fail
@check_size:
    LDA FH_SIZE_0,X
    ORA FH_SIZE_1,X
    ORA FH_SIZE_2,X
    BEQ @success
    LDA FH_DRIVE,X
    STA FS_DRIVE_LETTER
    STA FILE_DRIVE_LETTER
    JSR FS_CHECK_DRIVE_LETTER
    BCC @check_drive
    JMP @fail
@check_drive:
    JSR FS_HANDLE_SIZE_TO_UNITS
    LDA #$00
    STA FS_IO_FLAGS
    LDX FS_ACTIVE_HANDLE
    LDA FH_CLUSTER_LO,X
    STA FS_CLUSTER_LO
    LDA FH_CLUSTER_HI,X
    STA FS_CLUSTER_HI
    LDA FILE_START_PAGE
    STA DISK_PAGE
    LDA #$00
    STA DISK_PAGE_SECTOR
    JSR FS_TRANSFER_CHAIN
    BCC @success
    JMP @fail
@success:
    LDA FS_SAVED_DRIVE_LETTER
    STA FS_DRIVE_LETTER
    CLC
    RTS
@fail:
    LDA FS_SAVED_DRIVE_LETTER
    STA FS_DRIVE_LETTER
    SEC
    RTS
; 作用：把 DISK_COUNT_LO/HI 按每簇扇区数的移位数左移（簇数换成扇区数）。
; 输入：FS_DRIVE_PARAM_OFFSET、DISK_COUNT_LO/HI。
; 输出：DISK_COUNT_LO/HI，C=0。
; 调用者：FS_TRANSFER_CHAIN
FS_SHIFT_COUNT_BY_CLUSTER:
    LDX FS_DRIVE_PARAM_OFFSET
    LDA FS_CLUSTER_SHIFT_BITS,X
@loop:
    BEQ @return_clear
    TAY
    LDA DISK_COUNT_LO
    ASL A
    STA DISK_COUNT_LO
    LDA DISK_COUNT_HI
    ROL A
    STA DISK_COUNT_HI
    DEY
    TYA
    JMP @loop
@return_clear:
    CLC
    RTS
; 作用：把 DISK_PAGE 与 DISK_PAGE_SECTOR（每页 8 个扇区）加上 DISK_COUNT_LO/HI 个扇区，再折回页号与页内扇区。
; 输入：DISK_PAGE、DISK_PAGE_SECTOR、DISK_COUNT_LO/HI。
; 输出：DISK_PAGE、DISK_PAGE_SECTOR，C=0；SIZE_BYTES_0-1 临时使用。
; 调用者：FS_TRANSFER_CHAIN
FS_PAGE_ADD_SECTORS:
    LDA DISK_PAGE
    STA SIZE_BYTES_0
    LDA #$00
    STA SIZE_BYTES_1
    ASL SIZE_BYTES_0
    ROL SIZE_BYTES_1
    ASL SIZE_BYTES_0
    ROL SIZE_BYTES_1
    ASL SIZE_BYTES_0
    ROL SIZE_BYTES_1
    LDA SIZE_BYTES_0
    ORA DISK_PAGE_SECTOR
    STA SIZE_BYTES_0
    CLC
    LDA SIZE_BYTES_0
    ADC DISK_COUNT_LO
    STA SIZE_BYTES_0
    LDA SIZE_BYTES_1
    ADC DISK_COUNT_HI
    STA SIZE_BYTES_1
    LDA SIZE_BYTES_0
    AND #$07
    STA DISK_PAGE_SECTOR
    LSR SIZE_BYTES_1
    ROR SIZE_BYTES_0
    LSR SIZE_BYTES_1
    ROR SIZE_BYTES_0
    LSR SIZE_BYTES_1
    ROR SIZE_BYTES_0
    LDA SIZE_BYTES_0
    STA DISK_PAGE
    CLC
    RTS
; 作用：把句柄的文件大小换算成扇区数、簇数、页数（FS_SIZE_TO_UNITS），簇数存入 FS_CLUSTER_COUNT_LO/HI。
; 输入：FS_ACTIVE_HANDLE。
; 输出：SIZE_SECTORS、SIZE_CLUSTERS、SIZE_PAGES、FS_CLUSTER_COUNT_LO/HI，C=0。
; 调用者：FS_READ_FILE
FS_HANDLE_SIZE_TO_UNITS:
    LDX FS_ACTIVE_HANDLE
    LDA FH_SIZE_0,X
    STA SIZE_BYTES_0
    LDA FH_SIZE_1,X
    STA SIZE_BYTES_1
    LDA FH_SIZE_2,X
    STA SIZE_BYTES_2
    JSR FS_SIZE_TO_UNITS
    LDA SIZE_CLUSTERS_LO
    STA FS_CLUSTER_COUNT_LO
    LDA SIZE_CLUSTERS_HI
    STA FS_CLUSTER_COUNT_HI
    CLC
    RTS
; 作用：文件服务 $7B/$0D：把 SIZE_BYTES_0-2 里的字节数换算成：SIZE_SECTORS_LO/HI 扇区数，SIZE_CLUSTERS_LO/HI 簇数，SIZE_PAGES_LO/HI 页数（每页 8 个扇区），都向上取整。
; 输入：SIZE_BYTES_0-2、FS_DRIVE_PARAM_OFFSET（选簇大小）。
; 输出：SIZE_SECTORS、SIZE_CLUSTERS、SIZE_PAGES，C=0。
; 调用者：FS_HANDLE_SIZE_TO_UNITS、FS_ALLOC_FOR_SIZE、FS_DISPATCH_7B（地址表）
FS_SIZE_TO_UNITS:
    LDA SIZE_BYTES_2
    LSR A
    STA SIZE_SECTORS_HI
    LDA SIZE_BYTES_1
    ROR A
    STA SIZE_SECTORS_LO
    LDA SIZE_BYTES_1
    AND #$01
    ORA SIZE_BYTES_0
    BEQ @sectors_done
    CLC
    LDA SIZE_SECTORS_LO
    ADC #$01
    STA SIZE_SECTORS_LO
    LDA SIZE_SECTORS_HI
    ADC #$00
    STA SIZE_SECTORS_HI
@sectors_done:
    LDA SIZE_SECTORS_LO
    STA SIZE_CLUSTERS_LO
    LDA SIZE_SECTORS_HI
    STA SIZE_CLUSTERS_HI
    LDX FS_DRIVE_PARAM_OFFSET
    LDA FS_CLUSTER_SHIFT_BITS,X
@loop:
    BEQ @cluster_shifted
    TAY
    LSR SIZE_CLUSTERS_HI
    ROR SIZE_CLUSTERS_LO
    DEY
    TYA
    JMP @loop
@cluster_shifted:
    LDA FS_SECTORS_PER_CLUSTER,X
    TAY
    DEY
    TYA
    AND SIZE_SECTORS_LO
    BEQ @clusters_done
    CLC
    LDA SIZE_CLUSTERS_LO
    ADC #$01
    STA SIZE_CLUSTERS_LO
    LDA SIZE_CLUSTERS_HI
    ADC #$00
    STA SIZE_CLUSTERS_HI
@clusters_done:
    LDA SIZE_SECTORS_LO
    STA SIZE_PAGES_LO
    LDA SIZE_SECTORS_HI
    STA SIZE_PAGES_HI
    LSR SIZE_PAGES_HI
    ROR SIZE_PAGES_LO
    LSR SIZE_PAGES_HI
    ROR SIZE_PAGES_LO
    LSR SIZE_PAGES_HI
    ROR SIZE_PAGES_LO
    LDA SIZE_SECTORS_LO
    AND #$07
    BEQ @return_clear
    CLC
    LDA SIZE_PAGES_LO
    ADC #$01
    STA SIZE_PAGES_LO
    LDA SIZE_PAGES_HI
    ADC #$00
    STA SIZE_PAGES_HI
@return_clear:
    CLC
    RTS
; 作用：文件服务 $7B/$0C：按 FILE_SIZE_0-2 算出需要的簇数（FS_SIZE_TO_UNITS），并为句柄分配簇链（首簇已有，只追加不足的簇，FS_ALLOC_CHAIN）。
; 输入：FILE_SIZE_0-2、FILE_HANDLE_OFFSET=句柄。
; 输出：C=0 成功，FS_CLUSTER_COUNT_LO/HI=簇数；C=1 失败，DOS_ERROR 为出错码。
; 调用者：FS_WRITE_FILE、FS_DISPATCH_7B（地址表）
FS_ALLOC_FOR_SIZE:
    LDA FILE_SIZE_0
    STA SIZE_BYTES_0
    LDA FILE_SIZE_1
    STA SIZE_BYTES_1
    LDA FILE_SIZE_2
    STA SIZE_BYTES_2
    JSR FS_SIZE_TO_UNITS
    SEC
    LDA SIZE_CLUSTERS_LO
    STA FS_CLUSTER_COUNT_LO
    SBC #$01
    STA FS_ALLOC_COUNT_LO
    LDA SIZE_CLUSTERS_HI
    STA FS_CLUSTER_COUNT_HI
    SBC #$00
    STA FS_ALLOC_COUNT_HI
    ORA FS_ALLOC_COUNT_LO
    BEQ @return_clear
    LDA FILE_HANDLE_OFFSET
    STA FS_ACTIVE_HANDLE
    LDX FS_ACTIVE_HANDLE
    LDA FH_CLUSTER_LO,X
    STA FS_CLUSTER_LO
    LDA FH_CLUSTER_HI,X
    STA FS_CLUSTER_HI
    JSR FS_ALLOC_CHAIN
    BCC @return_clear
    SEC
    RTS
@return_clear:
    CLC
    RTS
; 作用：簇号 FS_CLUSTER_LO/HI 加 1 后与 FS_FAT_VALUE_LO/HI（FAT 项给出的下一簇）比较，判断两个簇是否相邻。
; 输入：FS_CLUSTER_LO/HI、FS_FAT_VALUE_LO/HI。
; 输出：C=0 表示加 1 后相等（相邻），C=1 表示不相邻；FS_CLUSTER_LO/HI 已加 1。
; 调用者：FS_TRANSFER_CHAIN
FS_NEXT_CLUSTER_CHECK:
    CLC
    LDA FS_CLUSTER_LO
    ADC #$01
    STA FS_CLUSTER_LO
    LDA FS_CLUSTER_HI
    ADC #$00
    STA FS_CLUSTER_HI
    LDA FS_CLUSTER_LO
    CMP FS_FAT_VALUE_LO
    BEQ @check_high
    JMP @return_set
@check_high:
    LDA FS_CLUSTER_HI
    CMP FS_FAT_VALUE_HI
    BNE @return_set
    CLC
    RTS
@return_set:
    SEC
    RTS
; 作用：文件服务 $7B/$0E：沿簇链成批读写磁盘：从 FS_CLUSTER_LO/HI 起共 FS_CLUSTER_COUNT_LO/HI 个簇，把相邻的簇合并成一次磁盘调用（DISK_COUNT 为扇区数），FS_IO_FLAGS 位 7 为 1 时写（磁盘服务 $80/$05），否则读（$80/$04）；每次调用后用 FS_PAGE_ADD_SECTORS 前移页位置。簇链中途遇到空闲簇或链尾、簇数还没用完时出错码 $11；全部传完后若 FS_IO_FLAGS 位 3 为 1，还要再查一次簇链的后继：后继是有效簇时成功，是链尾或空闲簇时出错码 $11。
; 输入：FS_CLUSTER_LO/HI=起始簇，FS_CLUSTER_COUNT_LO/HI=簇数，FS_IO_FLAGS，DISK_PAGE、DISK_PAGE_SECTOR=扩展 RAM 里的起始位置。
; 输出：C=0 成功；C=1 失败，DOS_ERROR 为出错码（磁盘出错时取 DISK_STATUS）。
; 调用者：FS_WRITE_FILE、FS_READ_FILE、FS_DISPATCH_7B（地址表）
FS_TRANSFER_CHAIN:
    LDA FS_CLUSTER_LO
    PHA
    LDA FS_CLUSTER_HI
    PHA
    LDA #$01
    STA DISK_COUNT_LO
    LDA #$00
    STA DISK_COUNT_HI
@loop:
    SEC
    LDA FS_CLUSTER_COUNT_LO
    SBC #$01
    STA FS_CLUSTER_COUNT_LO
    LDA FS_CLUSTER_COUNT_HI
    SBC #$00
    STA FS_CLUSTER_COUNT_HI
    LDA FS_CLUSTER_COUNT_LO
    ORA FS_CLUSTER_COUNT_HI
    BNE @next_cluster
    JMP @do_transfer
@next_cluster:
    JSR FS_FAT_GET
    BCS @used
    JMP @chain_short_pop
@used:
    BPL @check_contiguous
    JMP @chain_short_pop
@check_contiguous:
    JSR FS_NEXT_CLUSTER_CHECK
    BCS @do_transfer
    CLC
    LDA DISK_COUNT_LO
    ADC #$01
    STA DISK_COUNT_LO
    LDA DISK_COUNT_HI
    ADC #$00
    STA DISK_COUNT_HI
    LDA FS_FAT_VALUE_LO
    STA FS_CLUSTER_LO
    LDA FS_FAT_VALUE_HI
    STA FS_CLUSTER_HI
    JMP @loop
@do_transfer:
    PLA
    STA FS_CLUSTER_HI
    PLA
    STA FS_CLUSTER_LO
    JSR FS_CLUSTER_TO_LBA
    JSR FS_LBA_TO_CHS
    JSR FS_SHIFT_COUNT_BY_CLUSTER
    LDA #$80
    STA DISK_MODE
    LDA DISK_COUNT_LO
    PHA
    LDA DISK_COUNT_HI
    PHA
    LDA FS_IO_FLAGS
    AND #$80
    BNE @write
    LDA #$80
    STA SYS_FUNCTION
    LDA #$04
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
    JMP @after_transfer
@write:
    LDA #$80
    STA SYS_FUNCTION
    LDA #$05
    STA SYS_SUBFUNCTION
    JSR VEC_SYSCALL
@after_transfer:
    PLA
    STA DISK_COUNT_HI
    PLA
    STA DISK_COUNT_LO
    LDA DISK_STATUS
    BEQ @advance_page
    STA DOS_ERROR
    SEC
    RTS
@advance_page:
    JSR FS_PAGE_ADD_SECTORS
    LDA FS_CLUSTER_COUNT_LO
    ORA FS_CLUSTER_COUNT_HI
    BEQ @all_done
    LDA #$01
    STA DISK_COUNT_LO
    LDA #$00
    STA DISK_COUNT_HI
    LDA FS_FAT_VALUE_LO
    STA FS_CLUSTER_LO
    PHA
    LDA FS_FAT_VALUE_HI
    STA FS_CLUSTER_HI
    PHA
    JMP @loop
@all_done:
    LDA FS_IO_FLAGS
    AND #$08
    BEQ @return_clear
    LDA FS_FAT_VALUE_HI
    STA FS_CLUSTER_HI
    LDA FS_FAT_VALUE_LO
    STA FS_CLUSTER_LO
    JSR FS_FAT_GET
    BCS @check_next
    JMP @chain_short
@check_next:
    BPL @return_clear
    JMP @chain_short
@return_clear:
    CLC
    RTS
@chain_short_pop:
    PLA
    PLA
@chain_short:
    LDA #$11
    STA DOS_ERROR
    SEC
    RTS
