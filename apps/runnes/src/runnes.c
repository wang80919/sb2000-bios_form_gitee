/*
 * ------------------------------------------------------------------------
 * 名称：runnes.c
 * 说明：在 DOS 下运行 NES 游戏：runnes 文件名.nes；支持 mapper 0 与 mapper 4（MMC3），PRG、CHR 各不超过 128K，不带 trainer，必须有 CHR。
 * 作者：sungbin
 * 邮箱：sungbin@3578.cn
 * 日期：2026-11-11
 * 备注：流程：取命令行里的文件名 -> 读入扩展 RAM 页（超过 256K+16 字节的部分不读，文件末尾可能带说明文字）-> 检查 iNES 头
 *       -> 关 NMI 与中断 -> 用 DMA 把 PRG、CHR 复制到扩展 RAM、扩展显存的第 3 个 128K 窗口（$5006 写 $FF，页 $E0-$FF）
 *       -> 把 PRG 的 RESET 向量改成 ERAM $6100 的启动桩 -> 在 ERAM $6000 的跳板里写 $5006、$4301 进入 FC 兼容模式。
 *       放置方式与汇编版 play（fcdev 仓库 examples/sb2000/play）相同：MMC3 仿真下 $C000-$FFFF 固定为窗口末尾 16K，$8000-$BFFF 由 R6/R7 选 8K 页；
 *       mapper 0 的 PRG 放在窗口末尾，R6/R7 指向末尾前的两个 8K；mapper 4 的 PRG 放在窗口开头，PRG 不足 128K 时把最后 16K 再复制到窗口末尾；
 *       CHR 放在扩展显存同一窗口的开头，R0-R5 设为 0、2、4、5、6、7。
 *       DMA 往 CPU 地址写时要先把目的页映射到程序窗口，复制时借用窗口 2（$A000）；窗口 3 里有 C 软件栈，不能换页，
 *       所以程序（含数据）必须在 $A000 以下，超出时拒绝运行。游戏中不再返回 DOS，要回 DOS 只能硬复位。
 * ------------------------------------------------------------------------
 */
#include <string.h>
#include <sb2000.h>

/* 提示信息（显示后等待按键，再返回 DOS） */
#define MSG_USAGE "Usage: RUNNES FILE.NES"
#define MSG_OPEN "Can't open file"
#define MSG_MEMORY "No memory"
#define MSG_READ "Read error"
#define MSG_HEADER "Not an iNES file"
#define MSG_MAPPER "Mapper not supported"
#define MSG_SIZE "Size not supported"
#define MSG_TRUNCATED "File is truncated"
#define MSG_TOO_BIG "Program too big"

/* 映射器与 DMA 寄存器，含义见 MapperSB2K.cpp */
#define REG_PPU_CTRL 0x2000
#define REG_VRAM_BANK 0x4300
#define REG_RESET_6576 0x4301
#define REG_EXT_WINDOW 0x5006
#define REG_DMA_MODE 0x4048
#define REG_DMA_SOURCE_BANK 0x4049
#define REG_DMA_SOURCE_LOW 0x404A
#define REG_DMA_SOURCE_MID 0x404B
#define REG_DMA_DEST_LOW 0x404C
#define REG_DMA_DEST_HIGH 0x404D
#define REG_DMA_LENGTH_LOW 0x404E
#define REG_DMA_LENGTH_HIGH 0x404F

/* DMA 模式：源是扩展 RAM 时 $4049 的 bit4 为 1；$4048 写它启动，复制到 CPU 地址或扩展显存 */
#define DMA_SOURCE_ERAM 0x10
#define DMA_TO_CPU 0xE0
#define DMA_TO_VRAM 0xC0

/* 文件与窗口 */
#define MAX_FILE_SIZE 0x040010UL /* 头 16 字节 + 128K PRG + 128K CHR */
#define HEADER_SIZE 16
#define FIRST_ERAM_PAGE 0x80
#define GAME_WINDOW_PAGE 0xE0 /* 第 3 个 128K 窗口的首页，文件所在页必须低于它 */
#define LAST_PAGE 0xFF
#define BLOCK_SIZE 0x1000
#define COPY_WINDOW 2
#define COPY_ADDRESS 0xA000
#define VRAM_BANK_FIRST 12 /* 第 3 个窗口在扩展显存里从 32K 单位 12 开始 */
#define VRAM_WINDOW_BIT 0x8000

/* ERAM 里的启动桩（$6100）与跳板（$6000） */
#define TRAMPOLINE_ADDRESS 0x6000
#define STUB_ADDRESS 0x6100
#define STUB_MIRROR 0x16 /* 偏移：LDA #镜像 的操作数 */
#define STUB_ENTRY 0x1B /* 偏移：JMP 游戏原 RESET 入口 的操作数，2 字节 */
#define STUB_R6 0x2A /* 偏移：MMC3 寄存器 R6 的初值，R7 的初值在 +2 */
#define STUB_R7 0x2C

/* 文件路径，最长 0x2F 个字符 */
static char path[0x30];
/* iNES 头 */
static unsigned char header[HEADER_SIZE];
/* 文件占用的扩展 RAM 页，没有占用时 page_count 为 0 */
static unsigned char first_page;
static unsigned char page_count;
/* 从 iNES 头取出的信息：PRG 个数（16K）、CHR 个数（8K）、mapper、标志 6 */
static unsigned char prg_units;
static unsigned char chr_units;
static unsigned char mapper;
static unsigned char flags;

/*
 * 启动桩，运行时复制到 ERAM $6100，游戏复位后先执行它：
 *   $6100 SEI
 *   $6101 LDX #$00
 *   $6103 LDA $611D,X : STA $8000 : LDA $611E,X : STA $8001   依次写 MMC3 的寄存器号与值
 *   $610F INX : INX : CPX #$10 : BNE $6103
 *   $6115 LDA #镜像 : STA $A000
 *   $611A JMP 游戏原 RESET 入口
 *   $611D 寄存器表：R0=0 R1=2 R2=4 R3=5 R4=6 R5=7，R6、R7 的值运行时填
 */
static const unsigned char stub[] = {
    0x78,
    0xA2, 0x00,
    0xBD, 0x1D, 0x61,
    0x8D, 0x00, 0x80,
    0xBD, 0x1E, 0x61,
    0x8D, 0x01, 0x80,
    0xE8, 0xE8,
    0xE0, 0x10,
    0xD0, 0xEE,
    0xA9, 0x00,
    0x8D, 0x00, 0xA0,
    0x4C, 0x00, 0x00,
    0x00, 0x00, 0x01, 0x02, 0x02, 0x04, 0x03, 0x05, 0x04, 0x06, 0x05, 0x07, 0x06, 0x0C, 0x07, 0x0D
};

/* 跳板，复制到 ERAM $6000 运行：LDA #$FF : STA $5006 : LDA #$55 : STA $4301（写 $4301 会复位 CPU） */
static const unsigned char trampoline[] = {
    0xA9, 0xFF, 0x8D, 0x06, 0x50, 0xA9, 0x55, 0x8D, 0x01, 0x43
};

/* 程序末尾（BSS 的结束地址）由链接器给出 */
extern unsigned char _BSS_RUN__;
extern unsigned char _BSS_SIZE__;

/* 取命令行里的第一个词作为文件路径；没有参数时返回 0 */
static unsigned char read_name(void)
{
    const char *tail = (const char *)SB_CMD_TAIL;
    unsigned char length = 0;

    while (*tail == ' ') {
        ++tail;
    }
    while (*tail != 0 && *tail != ' ' && length < sizeof(path) - 1) {
        path[length] = *tail;
        ++length;
        ++tail;
    }
    path[length] = 0;
    return length;
}

/* 检查 iNES 头，通过时记下 PRG、CHR 个数与 mapper；size 是已读入的字节数 */
static const char *check_header(unsigned long size)
{
    sb_far_read(first_page, 0, header, HEADER_SIZE);
    if (memcmp(header, "NES\x1A", 4) != 0) {
        return MSG_HEADER;
    }
    prg_units = header[4];
    chr_units = header[5];
    flags = header[6];
    mapper = (unsigned char)((header[6] >> 4) | (header[7] & 0xF0));
    if (mapper != 0 && mapper != 4) {
        return MSG_MAPPER;
    }
    if ((flags & 0x04) != 0 || prg_units == 0 || prg_units > 8 || chr_units == 0 || chr_units > 16) {
        return MSG_SIZE;
    }
    if (mapper == 0 && (chr_units != 1 || prg_units > 2)) {
        return MSG_SIZE;
    }
    if (size < HEADER_SIZE + ((unsigned long)prg_units << 14) + ((unsigned long)chr_units << 13)) {
        return MSG_TRUNCATED;
    }
    return 0;
}

/* 读入文件并检查，成功返回 0，失败返回提示信息；文件占用的页记在 first_page、page_count */
static const char *load_game(void)
{
    unsigned char handle;
    unsigned char pages;
    unsigned char read_error;
    unsigned long size;

    if ((unsigned)&_BSS_RUN__ + (unsigned)&_BSS_SIZE__ > COPY_ADDRESS) {
        return MSG_TOO_BIG;
    }
    if (read_name() == 0) {
        return MSG_USAGE;
    }
    if (sb_file_open(path, SB_MODE_OPEN, &handle) != 0) {
        return MSG_OPEN;
    }
    sb_file_size(handle, &size);
    if (size < HEADER_SIZE) {
        sb_file_close(handle);
        return MSG_HEADER;
    }
    if (size > MAX_FILE_SIZE) {
        /* 读文件的服务按 FILE_SIZE 读，改小它就只读前面的部分 */
        size = MAX_FILE_SIZE;
        SB_BYTE_AT(SB_FILE_SIZE_0) = 0x10;
        SB_BYTE_AT(SB_FILE_SIZE_1) = 0x00;
        SB_BYTE_AT(SB_FILE_SIZE_2) = 0x04;
    }
    pages = (unsigned char)((size + BLOCK_SIZE - 1) >> 12);
    if (sb_page_alloc(pages, &first_page) != 0) {
        sb_file_close(handle);
        return MSG_MEMORY;
    }
    page_count = pages;
    if ((unsigned)first_page + pages > GAME_WINDOW_PAGE) {
        sb_file_close(handle);
        return MSG_MEMORY;
    }
    SB_BYTE_AT(SB_FILE_START_PAGE) = first_page;
    sb_syscall(SB_FN_FILE_HANDLE, SB_SUB_FH_READ_FILE);
    read_error = SB_BYTE_AT(SB_DOS_ERROR);
    sb_file_close(handle);
    if (read_error != 0) {
        return MSG_READ;
    }
    return check_header(size);
}

/* 用 DMA 从扩展 RAM 的 source 处复制 4K 到 destination：mode 为 DMA_TO_CPU 或 DMA_TO_VRAM；源地址不要求对齐 */
static void dma_block(unsigned long source, unsigned int destination, unsigned char mode)
{
    SB_BYTE_AT(REG_DMA_SOURCE_BANK) = DMA_SOURCE_ERAM | (unsigned char)((source >> 15) & 0x0F);
    SB_BYTE_AT(REG_DMA_SOURCE_LOW) = (unsigned char)source;
    SB_BYTE_AT(REG_DMA_SOURCE_MID) = (unsigned char)(source >> 8) & 0x7F;
    SB_BYTE_AT(REG_DMA_DEST_LOW) = (unsigned char)destination;
    SB_BYTE_AT(REG_DMA_DEST_HIGH) = (unsigned char)(destination >> 8);
    SB_BYTE_AT(REG_DMA_LENGTH_LOW) = (unsigned char)BLOCK_SIZE;
    SB_BYTE_AT(REG_DMA_LENGTH_HIGH) = (unsigned char)(BLOCK_SIZE >> 8);
    SB_BYTE_AT(REG_DMA_MODE) = mode;
}

/* 把 source 处的 4K 复制到扩展 RAM 页 page：先把该页映射到窗口 2，再让 DMA 写 CPU 地址 */
static void copy_to_page(unsigned char page, unsigned long source)
{
    sb_window_map(COPY_WINDOW, page);
    dma_block(source, COPY_ADDRESS, DMA_TO_CPU);
}

/* 把游戏放进第 3 个窗口并进入 FC 兼容模式，不会返回 */
static void start_game(void)
{
    /* 文件在扩展 RAM 里的起始偏移，DMA 的源地址以它为基准 */
    unsigned long base = (unsigned long)(unsigned)(first_page - FIRST_ERAM_PAGE) << 12;
    unsigned char prg_blocks = (unsigned char)(prg_units << 2);
    unsigned char chr_blocks = (unsigned char)(chr_units << 1);
    unsigned char prg_start = mapper == 0 ? (unsigned char)(0 - prg_blocks) : GAME_WINDOW_PAGE;
    volatile unsigned char *vector;
    unsigned char *image;
    unsigned int entry;
    unsigned char r6;
    unsigned char k;

    /* 此后 DOS 的显示与键盘不再运行 */
    SB_BYTE_AT(REG_PPU_CTRL) = 0;
    __asm__("sei");

    for (k = 0; k < prg_blocks; ++k) {
        copy_to_page(prg_start + k, base + HEADER_SIZE + ((unsigned long)k << 12));
    }
    if (mapper != 0 && prg_blocks != 32) {
        for (k = 0; k < 4; ++k) {
            copy_to_page(0xFC + k, base + HEADER_SIZE + ((unsigned long)(prg_blocks - 4 + k) << 12));
        }
    }

    /* 窗口最后一页里有向量：保存游戏原 RESET 入口，再改成启动桩 */
    sb_window_map(COPY_WINDOW, LAST_PAGE);
    vector = (volatile unsigned char *)(COPY_ADDRESS + 0x0FFC);
    entry = vector[0] | ((unsigned int)vector[1] << 8);
    vector[0] = (unsigned char)STUB_ADDRESS;
    vector[1] = (unsigned char)(STUB_ADDRESS >> 8);

    /* CHR 紧接在 PRG 之后，每 4K 一块，8 块（32K）占一个显存 bank */
    for (k = 0; k < chr_blocks; ++k) {
        SB_BYTE_AT(REG_VRAM_BANK) = VRAM_BANK_FIRST + (k >> 3);
        dma_block(base + HEADER_SIZE + ((unsigned long)(prg_blocks + k) << 12), VRAM_WINDOW_BIT | ((unsigned int)(k & 7) << 12), DMA_TO_VRAM);
    }

    /* mapper 0：32K 的 PRG 用 8K 页 12、13，16K 的用 14、15；mapper 4 从 0、1 开始，之后游戏自己设置 */
    if (mapper == 0) {
        r6 = prg_units == 1 ? 14 : 12;
    } else {
        r6 = 0;
    }
    memcpy((void *)STUB_ADDRESS, stub, sizeof(stub));
    image = (unsigned char *)STUB_ADDRESS;
    image[STUB_MIRROR] = (flags & 0x01) ^ 0x01; /* iNES 标志 6 的 bit0 为 1 是垂直镜像，MMC3 的 $A000 写 0 才是垂直 */
    image[STUB_ENTRY] = (unsigned char)entry;
    image[STUB_ENTRY + 1] = (unsigned char)(entry >> 8);
    image[STUB_R6] = r6;
    image[STUB_R7] = r6 + 1;
    memcpy((void *)TRAMPOLINE_ADDRESS, trampoline, sizeof(trampoline));
    ((void (*)(void))TRAMPOLINE_ADDRESS)();
}

int main(void)
{
    const char *message = load_game();

    if (message == 0) {
        start_game();
    }
    if (page_count != 0) {
        sb_page_free(first_page, page_count);
    }
    sb_puts(message);
    sb_getkey();
    return 0;
}
