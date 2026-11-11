/*
 * ------------------------------------------------------------------------
 * 名称：assembler.h
 * 说明：定义汇编器状态、符号记录与跨银行模块接口。
 * 作者：sungbin
 * 邮箱：sungbin@3578.cn
 * 日期：2026-11-11
 * 备注：无
 * ------------------------------------------------------------------------
 */
#ifndef ASM_ASSEMBLER_H
#define ASM_ASSEMBLER_H

#include <sb2000.h>

#define ASM_MAX_SYMBOLS 1024
#define ASM_MAX_SYMBOL_NAME 32
#define ASM_MAX_LINE_LENGTH 128
#define ASM_MAX_BANKS 113
#define ASM_IO_BUFFER_SIZE 128
#define ASM_SYMBOL_BUCKETS 256
#define ASM_SYMBOL_TABLE_START 512
#define ASM_SYMBOL_PAGES 10
#define ASM_MAX_FILES 8
#define ASM_MAX_INCLUDE_DEPTH 4
#define ASM_READ_SIZE 128
#define ASM_BITMAP_BYTES 128
#define ASM_KIND_EMPTY 0
#define ASM_KIND_INSTRUCTION 1
#define ASM_KIND_ORG 2
#define ASM_KIND_BANK 3
#define ASM_KIND_BYTE 4
#define ASM_KIND_WORD 5
#define ASM_KIND_ASCII 6
#define ASM_KIND_BANKCALL 7
#define ASM_KIND_EQUATE 8
#define ASM_KIND_INCLUDE 9

/** 标签或常量定义。 */
typedef struct {
    /** 大写符号名，含结尾 0。 */
    char name[ASM_MAX_SYMBOL_NAME];
    /** 符号地址或常量值。 */
    unsigned int value;
    /** 标签所属银行；常量使用 $FF。 */
    unsigned char bank;
    /** 定义所在行的序号，包含文件的行也连续编号，每遍扫描里同一行的序号相同。 */
    unsigned int line;
    /** 同一个哈希桶里下一个符号的序号加 1，0 表示链尾。 */
    unsigned int next;
} AsmSymbol;

/** 已装入扩展 RAM 的源文件（主文件或包含文件），同一个文件只装入一次。 */
typedef struct {
    /** 文件路径，最长 28 个字符。 */
    char path[29];
    /** 文件首个扩展 RAM 页。 */
    unsigned char page;
    /** 文件占用的页数。 */
    unsigned char page_count;
    /** 文件字节数。 */
    unsigned long size;
} AsmFile;

/** 遇到 .include 时保存的父文件读取位置。 */
typedef struct {
    /** 父文件在 files 里的序号。 */
    unsigned char file;
    /** 父文件的读取位置。 */
    unsigned long offset;
    /** 父文件已读到的行号。 */
    unsigned int line;
} AsmFrame;

/** 已解析的符号值及其所在银行。 */
typedef struct {
    /** 地址或常量值。 */
    unsigned long value;
    /** 标签所属银行；常量使用 $FF。 */
    unsigned char bank;
    /** 非 0 表示表达式引用了符号。 */
    unsigned char is_symbol;
} AsmValue;

/** 汇编过程共享的数据。 */
typedef struct {
    /** 源文件路径，最长 28 个字符。 */
    char source_path[29];
    /** 输出 EXE 路径，最长 28 个字符。 */
    char output_path[29];
    /** 当前正在读取的文件首个扩展 RAM 页。 */
    unsigned char source_page;
    /** 输出文件首个扩展 RAM 页。 */
    unsigned char output_page;
    /** 输出文件占用的页数。 */
    unsigned char output_page_count;
    /** 符号表首个扩展 RAM 页。 */
    unsigned char symbol_page;
    /** 符号表占用的页数。 */
    unsigned char symbol_page_count;
    /** 当前正在读取的文件字节数。 */
    unsigned long source_size;
    /** 从扩展 RAM 整块读入的源文件内容，减少跨页读的次数。 */
    unsigned char read_buffer[ASM_READ_SIZE];
    /** 读入缓冲第一个字节对应的文件偏移。 */
    unsigned long read_start;
    /** 读入缓冲里有效的字节数，0 表示缓冲作废。 */
    unsigned char read_length;
    /** 读入缓冲里下一个要读的字节的下标。 */
    unsigned char read_pos;
    /** 预扫描登记过常量的行的位图，位号是行序号减 1，只覆盖前 ASM_BITMAP_BYTES * 8 行。 */
    unsigned char constant_lines[ASM_BITMAP_BYTES];
    /** 当前文件已读到的行号，从 1 起。 */
    unsigned int line_number;
    /** 已读到的行总数，包含文件的行也计入；每遍扫描重新开始，用来给符号登记定义行。 */
    unsigned int line_seq;
    /** 已装入的源文件，序号 0 是主文件。 */
    AsmFile files[ASM_MAX_FILES];
    /** 已装入的文件数。 */
    unsigned char file_count;
    /** 当前正在读取的文件在 files 里的序号。 */
    unsigned char current_file;
    /** 包含文件的嵌套栈。 */
    AsmFrame frames[ASM_MAX_INCLUDE_DEPTH];
    /** 当前的包含嵌套层数，0 表示在主文件里。 */
    unsigned char depth;
    /** 当前行 .include 指定的文件名，已转成大写。 */
    char include_path[29];
    /** 当前 pass 的银行号，0 表示常驻区。 */
    unsigned char bank;
    /** 源文件使用的最大银行号。 */
    unsigned char max_bank;
    /** 符号表中的项目数，最多 ASM_MAX_SYMBOLS 个。 */
    unsigned int symbol_count;
    /** 当前汇编地址。 */
    unsigned int address;
    /** 生成的跨银行调用蹦床地址。 */
    unsigned int helper_address;
    /** 每个银行的下一个地址。 */
    unsigned int bank_addresses[ASM_MAX_BANKS + 1];
    /** 当前源代码行，不含换行符。 */
    char line[ASM_MAX_LINE_LENGTH];
    /** 当前行长度。 */
    unsigned char line_length;
    /** 当前行解析出的标签。 */
    char parsed_label[ASM_MAX_SYMBOL_NAME];
    /** 当前行解析出的助记符或伪指令。 */
    char parsed_op[12];
    /** 当前行解析出的操作数。 */
    char parsed_operand[ASM_MAX_LINE_LENGTH];
    /** 当前行的解析类型。 */
    unsigned char parsed_kind;
    /** 当前行是否定义标签。 */
    unsigned char parsed_has_label;
    /** 当前指令的寻址方式。 */
    unsigned char parsed_mode;
    /** 当前行生成的字节数。 */
    unsigned char parsed_size;
    /** 当前行常量定义的值。 */
    unsigned int parsed_value;
    /** 非 0 表示正在预扫描常量，行解析只处理能求值的常量定义，其余行跳过。 */
    unsigned char prescan;
    /** 源文件中的跨银行调用数量。 */
    unsigned char bankcall_count;
    /** 输出汇编数据时共用的窗口内缓冲区。 */
    unsigned char io_buffer[ASM_IO_BUFFER_SIZE];
    /** 暂存当前指令或数据行的编码结果，避免符号读取覆盖。 */
    unsigned char encode_buffer[ASM_IO_BUFFER_SIZE];
    /** 输出映像的总字节数。 */
    unsigned long output_size;
    /** 最近一次错误的行号。 */
    unsigned int error_line;
    /** 最近一次错误所在的文件在 files 里的序号。 */
    unsigned char error_file;
    /** 最近一次错误的简短说明。 */
    char error[64];
} AsmState;

/** 汇编器唯一的运行状态，由入口模块创建。 */
extern AsmState asm_state;

/** 将文本转换成大写并检查目标缓冲区长度；源文本全部复制完返回 1。常驻区函数，不经过换页。 */
unsigned char asm_copy_upper(char *destination, const char *source, unsigned char capacity);
/** 去掉字符串两侧的空格。常驻区函数。 */
void asm_trim(char *text);
/** 将十六进制字符转换成数值；非法字符返回 -1。常驻区函数。 */
int asm_hex_value(char character);
/** 判断一段文字（已去掉前面的空格）是否以 .include 开头。常驻区函数。 */
unsigned char asm_is_include_line(const char *text);
/** 记下当前行是预扫描登记过的常量定义。常驻区函数。 */
void asm_mark_constant_line(void);
/** 当前行是否记为登记过的常量定义，是的话第一遍和第二遍可以直接跳过这一行。常驻区函数。 */
unsigned char asm_is_constant_line(void);

SB_BANK_CALLS_BEGIN(8)
/** 从当前文件读取一行；到主文件末尾返回 0，错误返回 $FF。 */
unsigned char asm_next_line(void);
/** 重置源文件游标与行号，从主文件开头重新读。 */
void asm_reset_source(void);
/** 把 files[index] 设为当前正在读取的文件。 */
void asm_select_file(unsigned char index);
SB_BANK_CALLS_END()

/** 把窗口内缓冲区写入输出扩展 RAM。 */
unsigned char asm_write_output(unsigned long offset, unsigned int length);

/** 记录当前源文件行的汇编错误。 */
void asm_set_error(const char *message);

SB_BANK_CALLS_BEGIN(2)
/** 查找符号表中的名称；不存在时返回 -1。 */
int asm_find_symbol(const char *name);
/** 从扩展 RAM 符号表读取记录；索引超出范围时返回 0。 */
unsigned char asm_get_symbol(unsigned int index, AsmSymbol *symbol);
/** 清空符号表：符号数归零，哈希桶全部置空。 */
void asm_symbols_reset(void);
/** 登记一个符号，定义行取当前的行序号；名字已存在返回 1，符号数到上限返回 2，成功返回 0。 */
unsigned char asm_symbol_define(const char *name, unsigned int value, unsigned char bank);
/** 解析常量、标签及可选偏移和字节前缀。 */
unsigned char asm_resolve_expression(const char *text, AsmValue *result);
SB_BANK_CALLS_END()

SB_BANK_CALLS_BEGIN(3)
/** 从操作数字符串中识别官方 6502 寻址方式。 */
unsigned char asm_classify_operand(unsigned char *mode);
SB_BANK_CALLS_END()

SB_BANK_CALLS_BEGIN(5)
/** 解析当前行并填入标签、指令、操作数与长度。 */
unsigned char asm_parse_current_line(void);
SB_BANK_CALLS_END()

SB_BANK_CALLS_BEGIN(6)
/** 第一遍扫描源文件：先预扫描常量，再建立符号表并计算各段长度。 */
unsigned char asm_first_pass(void);
/** 检查当前行定义的标签，其地址和银行是否与第一遍一致；一致返回 1，否则记录错误并返回 0。 */
unsigned char asm_check_label(void);
SB_BANK_CALLS_END()

SB_BANK_CALLS_BEGIN(1)
/**
 * 运行汇编器交互流程。
 * @return 操作完成时返回 0；发生错误时返回非 0。
 */
unsigned char asm_run(void);
/**
 * 进入 include_path 指定的包含文件：文件第一次出现时装入扩展 RAM，之后的各遍扫描直接复用；
 * 读取位置切到包含文件开头，读完后由 asm_next_line 自动回到父文件。
 * @return 成功返回 1；失败时记录错误并返回 0。
 */
unsigned char asm_enter_include(void);
SB_BANK_CALLS_END()

SB_BANK_CALLS_BEGIN(7)
/**
 * 第二遍扫描源文件，生成机器码并保存 EXE。
 * @return 生成成功返回 0；失败返回非 0。
 */
unsigned char asm_second_pass(void);
SB_BANK_CALLS_END()

#endif