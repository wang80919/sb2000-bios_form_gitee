/*
 * ------------------------------------------------------------------------
 * 名称：assembler.c
 * 说明：实现源文件读取、两遍汇编与 SB-DOS EXE 输出。
 * 作者：sungbin
 * 邮箱：sungbin@3578.cn
 * 日期：2026-11-11
 * 备注：模块间通过头文件声明的银行调用接口协作。
 * ------------------------------------------------------------------------
 */
#include <string.h>
#include "assembler.h"
#include "messages.h"
#include "opcodes.h"

/* 汇编状态放在常驻区，供所有银行中的函数共享。 */
AsmState asm_state;

/* 把单个十六进制字符转成数值。 */
int asm_hex_value(char character)
{
    if (character >= '0' && character <= '9') {
        return character - '0';
    }
    if (character >= 'A' && character <= 'F') {
        return character - 'A' + 10;
    }
    if (character >= 'a' && character <= 'f') {
        return character - 'a' + 10;
    }
    return -1;
}

/* 将文本转换为大写并检查目标缓冲区长度。 */
unsigned char asm_copy_upper(char *destination, const char *source, unsigned char capacity)
{
    unsigned char index = 0;
    char character;

    while (source[index] != 0 && index + 1 < capacity) {
        character = source[index];
        if (character >= 'a' && character <= 'z') {
            character = (char)(character - 'a' + 'A');
        }
        destination[index] = character;
        ++index;
    }
    destination[index] = 0;
    return source[index] == 0;
}

/* 去掉字符串两侧的空格。 */
void asm_trim(char *text)
{
    unsigned char start = 0;
    unsigned char length = (unsigned char)strlen(text);

    while (text[start] == ' ' || text[start] == '\t') {
        ++start;
    }
    while (length > start && (text[length - 1] == ' ' || text[length - 1] == '\t')) {
        --length;
    }
    if (start != 0) {
        memmove(text, text + start, length - start);
    }
    text[length - start] = 0;
}

/* 判断一段文字（已去掉前面的空格）是否以 .include 开头。 */
unsigned char asm_is_include_line(const char *text)
{
    static const char name[] = ".INCLUDE";
    unsigned char index;
    char character;

    for (index = 0; index < sizeof(name) - 1; ++index) {
        character = text[index];
        if (character >= 'a' && character <= 'z') {
            character = (char)(character - 'a' + 'A');
        }
        if (character != name[index]) {
            return 0;
        }
    }
    return text[index] == 0 || text[index] == ' ' || text[index] == '\t';
}

/** 记下当前行是预扫描登记过的常量定义；行序号超出位图范围时不记。 */
void asm_mark_constant_line(void)
{
    unsigned int seq = asm_state.line_seq - 1;

    if (seq < ASM_BITMAP_BYTES * 8) {
        asm_state.constant_lines[seq >> 3] |= (unsigned char)(1 << (seq & 7));
    }
}

/** 当前行是否已记为登记过的常量定义，是的话后面几遍可以直接跳过。 */
unsigned char asm_is_constant_line(void)
{
    unsigned int seq = asm_state.line_seq - 1;

    return seq < ASM_BITMAP_BYTES * 8 && (asm_state.constant_lines[seq >> 3] & (1 << (seq & 7))) != 0;
}

SB_BANK_BEGIN(8)

/* 读入缓冲用完后，从文件里接着读下一块；文件读完返回 0。逐字节读太慢，所以整块读，块内只用 8 位下标。 */
static unsigned char asm_refill_buffer(void)
{
    unsigned long next = asm_state.read_start + asm_state.read_length;
    unsigned long remaining;

    if (next >= asm_state.source_size) {
        return 0;
    }
    remaining = asm_state.source_size - next;
    asm_state.read_start = next;
    asm_state.read_length = remaining < ASM_READ_SIZE ? (unsigned char)remaining : ASM_READ_SIZE;
    asm_state.read_pos = 0;
    sb_far_read(asm_state.source_page + (unsigned char)(next >> 12), (unsigned int)(next & 0x0FFFUL), asm_state.read_buffer,
        asm_state.read_length);
    return 1;
}

/* 把 files[index] 设为当前正在读取的文件，读取位置回到文件开头。 */
static void asm_set_current_file(unsigned char index)
{
    asm_state.current_file = index;
    asm_state.source_page = asm_state.files[index].page;
    asm_state.source_size = asm_state.files[index].size;
    asm_state.read_start = 0;
    asm_state.read_length = 0;
    asm_state.read_pos = 0;
}

/** 供其他库页切换当前正在读取的文件。 */
void asm_select_file(unsigned char index)
{
    asm_set_current_file(index);
}

/** 重置下一遍扫描需要的源文件游标，从主文件开头重新读。 */
void asm_reset_source(void)
{
    asm_state.depth = 0;
    asm_set_current_file(0);
    asm_state.line_number = 0;
    asm_state.line_seq = 0;
    asm_state.line_length = 0;
}

/** 从扩展 RAM 读取一行：分号之后的注释不保存，代码部分超长时以行号记录错误；包含文件读完后自动回到父文件。 */
unsigned char asm_next_line(void)
{
    unsigned char character;
    unsigned char in_string = 0;
    unsigned char in_comment = 0;
    unsigned char *newline;

    asm_state.line_length = 0;
    for (;;) {
        while (asm_state.read_pos < asm_state.read_length || asm_refill_buffer()) {
            character = asm_state.read_buffer[asm_state.read_pos];
            ++asm_state.read_pos;
            if (character == '\r') {
                continue;
            }
            if (character == '\n') {
                ++asm_state.line_number;
                ++asm_state.line_seq;
                asm_state.line[asm_state.line_length] = 0;
                return 1;
            }
            if (in_comment) {
                newline = (unsigned char *)memchr(asm_state.read_buffer + asm_state.read_pos, '\n',
                    asm_state.read_length - asm_state.read_pos);
                asm_state.read_pos = newline != 0 ? (unsigned char)(newline - asm_state.read_buffer) : asm_state.read_length;
                continue;
            }
            if (character == '"' && (asm_state.line_length == 0 || asm_state.line[asm_state.line_length - 1] != '\\')) {
                in_string = !in_string;
            } else if (character == ';' && !in_string) {
                in_comment = 1;
                continue;
            }
            if (asm_state.line_length + 1 >= ASM_MAX_LINE_LENGTH) {
                asm_set_error(MSG_LINE_TOO_LONG);
                return 0xFF;
            }
            asm_state.line[asm_state.line_length] = (char)character;
            ++asm_state.line_length;
        }
        if (asm_state.line_length != 0) {
            ++asm_state.line_number;
            ++asm_state.line_seq;
            asm_state.line[asm_state.line_length] = 0;
            return 1;
        }
        if (asm_state.depth == 0) {
            return 0;
        }
        --asm_state.depth;
        asm_set_current_file(asm_state.frames[asm_state.depth].file);
        asm_state.read_start = asm_state.frames[asm_state.depth].offset;
        asm_state.line_number = asm_state.frames[asm_state.depth].line;
    }
}

SB_BANK_END()

/** 把当前缓冲区的数据写到输出扩展 RAM，长度不得超过缓冲区大小。 */
unsigned char asm_write_output(unsigned long offset, unsigned int length)
{
    unsigned char page;
    unsigned int page_offset;

    if (length > ASM_IO_BUFFER_SIZE || offset + length > asm_state.output_size) {
        return 0;
    }
    page = asm_state.output_page + (unsigned char)(offset >> 12);
    page_offset = (unsigned int)(offset & 0x0FFFUL);
    sb_far_write(page, page_offset, asm_state.io_buffer, length);
    return 1;
}

/** 保存错误所在的文件、行号与错误说明，供交互入口统一显示。 */
void asm_set_error(const char *message)
{
    unsigned char index;

    asm_state.error_line = asm_state.line_number;
    asm_state.error_file = asm_state.current_file;
    for (index = 0; index < sizeof(asm_state.error) - 1 && message[index] != 0; ++index) {
        asm_state.error[index] = message[index];
    }
    asm_state.error[index] = 0;
}

/* 读取用户输入的 DOS 8.3 文件路径。 */
static unsigned char asm_read_path(const char *prompt, char *path)
{
    unsigned char length = 0;
    unsigned int key;
    unsigned char character;

    sb_puts(prompt);
    for (;;) {
        key = sb_key_wait();
        character = (unsigned char)key;
        if (character == 13) {
            path[length] = 0;
            sb_newline();
            return length != 0;
        }
        if (character == 8 || character == 127) {
            if (length != 0) {
                --length;
                sb_cursor_left();
                sb_putc(' ');
                sb_cursor_left();
            }
            continue;
        }
        if (character < 32 || character > 126 || length >= 28) {
            continue;
        }
        if (character >= 'a' && character <= 'z') {
            character = (unsigned char)(character - 'a' + 'A');
        }
        path[length] = (char)character;
        ++length;
        sb_putc((char)character);
    }
}

/** 显示出错的文件（只在包含文件里出错时）、行号与错误原因。 */
static void asm_show_error(void)
{
    if (asm_state.error_file != 0) {
        sb_puts(asm_state.files[asm_state.error_file].path);
    }
    sb_print(MSG_ERROR_HEAD);
    sb_print_uint(asm_state.error_line);
    sb_print(MSG_ERROR_TAIL);
    sb_newline();
    sb_puts(asm_state.error);
}

SB_BANK_BEGIN(1)

/* 释放所有已装入源文件占用的扩展 RAM 页。 */
static void asm_free_files(void)
{
    unsigned char index;

    for (index = 0; index < asm_state.file_count; ++index) {
        if (asm_state.files[index].page_count != 0) {
            sb_page_free(asm_state.files[index].page, asm_state.files[index].page_count);
        }
    }
    asm_state.file_count = 0;
}

/* 取命令行里的下一个词（以空格分隔，最长 28 个字符）放进 word，返回长度；没有词时返回 0 */
static unsigned char asm_take_word(const char **cursor, char *word)
{
    unsigned char length = 0;

    while (**cursor == ' ') {
        ++*cursor;
    }
    while (**cursor != 0 && **cursor != ' ' && length < 28) {
        word[length] = **cursor;
        ++length;
        ++*cursor;
    }
    word[length] = 0;
    return length;
}

/* 源文件名没有扩展名时补 .ASM；输出名没给时取源文件主名加 .EXE（总长不超过 28 个字符） */
static void asm_complete_paths(unsigned char has_output)
{
    unsigned char length = (unsigned char)strlen(asm_state.source_path);
    unsigned char dot = length;
    unsigned char index;

    for (index = 0; index < length; ++index) {
        if (asm_state.source_path[index] == '.') {
            dot = index;
        } else if (asm_state.source_path[index] == '\\' || asm_state.source_path[index] == ':') {
            dot = length;
        }
    }
    if (!has_output) {
        if (dot > 24) {
            dot = 24;
        }
        memcpy(asm_state.output_path, asm_state.source_path, dot);
        strcpy(asm_state.output_path + dot, ".EXE");
    }
    if (dot == length && length <= 24) {
        strcpy(asm_state.source_path + length, ".ASM");
    }
}

/** 读取汇编源文件，执行两遍汇编，并释放占用的扩展 RAM 页。命令行为 ASM 源文件 [输出文件]，没有参数时逐项询问。 */
unsigned char asm_run(void)
{
    unsigned char result;
    unsigned char has_output = 0;
    const char *tail = (const char *)SB_CMD_TAIL;

    memset(&asm_state, 0, sizeof(asm_state));
    if (asm_take_word(&tail, asm_state.source_path) != 0) {
        has_output = asm_take_word(&tail, asm_state.output_path) != 0;
        asm_complete_paths(has_output);
    } else {
        sb_puts(MSG_SOURCE_PROMPT);
        if (!asm_read_path("", asm_state.source_path)) {
            sb_puts(MSG_NO_SOURCE);
            return 1;
        }
    }
    sb_puts(MSG_ASSEMBLING);
    result = sb_file_load(asm_state.source_path, &asm_state.files[0].page, &asm_state.files[0].size);
    if (result != 0) {
        asm_set_error(MSG_CANNOT_READ_SOURCE);
        asm_show_error();
        return 1;
    }
    strcpy(asm_state.files[0].path, asm_state.source_path);
    asm_state.files[0].page_count = (unsigned char)((asm_state.files[0].size + 0x0FFFUL) >> 12);
    asm_state.file_count = 1;
    asm_select_file(0);
    if (asm_state.source_size == 0) {
        asm_set_error(MSG_SOURCE_EMPTY);
        asm_show_error();
        asm_free_files();
        return 1;
    }
    if (asm_state.output_path[0] == 0) {
        sb_puts(MSG_OUTPUT_PROMPT);
        if (!asm_read_path("", asm_state.output_path)) {
            sb_puts(MSG_NO_OUTPUT);
            asm_free_files();
            return 1;
        }
    }
    if (sb_page_alloc(ASM_SYMBOL_PAGES, &asm_state.symbol_page) != 0) {
        asm_set_error(MSG_NO_RAM_FOR_SYMBOLS);
        asm_show_error();
        asm_free_files();
        return 1;
    }
    asm_state.symbol_page_count = ASM_SYMBOL_PAGES;
    result = asm_first_pass();
    if (result == 0) {
        result = asm_second_pass();
    }
    if (result != 0) {
        asm_show_error();
    } else {
        sb_puts(MSG_DONE);
    }
    if (asm_state.output_page_count != 0) {
        sb_page_free(asm_state.output_page, asm_state.output_page_count);
    }
    if (asm_state.symbol_page_count != 0) {
        sb_page_free(asm_state.symbol_page, asm_state.symbol_page_count);
    }
    asm_free_files();
    return result;
}

unsigned char asm_enter_include(void)
{
    unsigned char index;
    unsigned char page;
    unsigned long size;

    for (index = 0; index < asm_state.file_count; ++index) {
        if (strcmp(asm_state.files[index].path, asm_state.include_path) == 0) {
            break;
        }
    }
    if (index == asm_state.file_count) {
        if (asm_state.file_count >= ASM_MAX_FILES) {
            asm_set_error(MSG_INCLUDE_TOO_MANY);
            return 0;
        }
        if (sb_file_load(asm_state.include_path, &page, &size) != 0) {
            asm_set_error(MSG_INCLUDE_CANNOT_READ);
            return 0;
        }
        strcpy(asm_state.files[index].path, asm_state.include_path);
        asm_state.files[index].page = page;
        asm_state.files[index].page_count = (unsigned char)((size + 0x0FFFUL) >> 12);
        asm_state.files[index].size = size;
        ++asm_state.file_count;
    }
    if (asm_state.files[index].size == 0) {
        return 1;
    }
    if (asm_state.depth >= ASM_MAX_INCLUDE_DEPTH) {
        asm_set_error(MSG_INCLUDE_TOO_DEEP);
        return 0;
    }
    asm_state.frames[asm_state.depth].file = asm_state.current_file;
    asm_state.frames[asm_state.depth].offset = asm_state.read_start + asm_state.read_pos;
    asm_state.frames[asm_state.depth].line = asm_state.line_number;
    ++asm_state.depth;
    asm_select_file(index);
    asm_state.line_number = 0;
    return 1;
}

SB_BANK_END()

SB_BANK_BEGIN(2)

/* 算符号名的哈希，结果即哈希桶的序号。 */
static unsigned char asm_hash(const char *name)
{
    unsigned char hash = 0;

    while (*name != 0) {
        hash = (unsigned char)((hash << 1) | (hash >> 7));
        hash ^= (unsigned char)*name;
        ++name;
    }
    return hash;
}

/* 哈希桶表占符号表开头的 512 字节，每个桶 2 字节，存链头符号的序号加 1。 */
void asm_symbols_reset(void)
{
    unsigned char index;

    memset(asm_state.io_buffer, 0, ASM_IO_BUFFER_SIZE);
    for (index = 0; index < ASM_SYMBOL_BUCKETS * 2 / ASM_IO_BUFFER_SIZE; ++index) {
        sb_far_write(asm_state.symbol_page, (unsigned int)index * ASM_IO_BUFFER_SIZE, asm_state.io_buffer, ASM_IO_BUFFER_SIZE);
    }
    asm_state.symbol_count = 0;
}

/* 符号记录存在哈希桶表之后，按追加的顺序排列；读一条（本库页内部调用，不经过换页蹏床）。 */
static unsigned char asm_read_symbol(unsigned int index, AsmSymbol *symbol)
{
    if (index >= asm_state.symbol_count || asm_state.symbol_page_count == 0) {
        return 0;
    }
    sb_far_read(asm_state.symbol_page, ASM_SYMBOL_TABLE_START + index * sizeof(AsmSymbol), asm_state.io_buffer, sizeof(AsmSymbol));
    memcpy(symbol, asm_state.io_buffer, sizeof(AsmSymbol));
    return 1;
}

/* 按名字查找符号；找到时返回序号并把记录放进 *symbol，找不到返回 -1。 */
static int asm_lookup(const char *name, AsmSymbol *symbol)
{
    unsigned int link;

    sb_far_read(asm_state.symbol_page, (unsigned int)asm_hash(name) * 2, asm_state.io_buffer, 2);
    memcpy(&link, asm_state.io_buffer, 2);
    while (link != 0) {
        if (!asm_read_symbol(link - 1, symbol)) {
            return -1;
        }
        if (strcmp(symbol->name, name) == 0) {
            return link - 1;
        }
        link = symbol->next;
    }
    return -1;
}

/* 登记符号：名字已存在返回 1，符号数到上限返回 2，成功返回 0。 */
unsigned char asm_symbol_define(const char *name, unsigned int value, unsigned char bank)
{
    unsigned int bucket_offset = (unsigned int)asm_hash(name) * 2;
    unsigned int head;
    unsigned int link;
    AsmSymbol *record = (AsmSymbol *)asm_state.io_buffer;
    AsmSymbol symbol;

    sb_far_read(asm_state.symbol_page, bucket_offset, asm_state.io_buffer, 2);
    memcpy(&head, asm_state.io_buffer, 2);
    for (link = head; link != 0; link = symbol.next) {
        if (!asm_read_symbol(link - 1, &symbol)) {
            break;
        }
        if (strcmp(symbol.name, name) == 0) {
            return 1;
        }
    }
    if (asm_state.symbol_count >= ASM_MAX_SYMBOLS) {
        return 2;
    }
    memset(record, 0, sizeof(AsmSymbol));
    strcpy(record->name, name);
    record->value = value;
    record->bank = bank;
    record->line = asm_state.line_seq;
    record->next = head;
    sb_far_write(asm_state.symbol_page, ASM_SYMBOL_TABLE_START + asm_state.symbol_count * sizeof(AsmSymbol),
        asm_state.io_buffer, sizeof(AsmSymbol));
    ++asm_state.symbol_count;
    link = asm_state.symbol_count;
    memcpy(asm_state.io_buffer, &link, 2);
    sb_far_write(asm_state.symbol_page, bucket_offset, asm_state.io_buffer, 2);
    return 0;
}

/* 查找符号表中的名称；不存在时返回 -1。 */
int asm_find_symbol(const char *name)
{
    AsmSymbol symbol;

    return asm_lookup(name, &symbol);
}

/** 从扩展 RAM 中读取一条符号记录。 */
unsigned char asm_get_symbol(unsigned int index, AsmSymbol *symbol)
{
    return asm_read_symbol(index, symbol);
}

/* 解析十进制或 $ 前缀的十六进制数。 */
static unsigned char asm_parse_number(const char *text, unsigned long *value)
{
    unsigned char index = 0;
    int digit;
    unsigned long result = 0;
    unsigned char hexadecimal = text[0] == '$';

    if (hexadecimal) {
        index = 1;
        if (text[index] == 0) {
            return 0;
        }
        while (text[index] != 0) {
            digit = asm_hex_value(text[index]);
            if (digit < 0) {
                return 0;
            }
            result = (result << 4) + (unsigned char)digit;
            if (result > 0xFFFFUL) {
                return 0;
            }
            ++index;
        }
    } else {
        if (text[0] == 0) {
            return 0;
        }
        while (text[index] != 0) {
            if (text[index] < '0' || text[index] > '9') {
                return 0;
            }
            result = result * 10 + (unsigned char)(text[index] - '0');
            if (result > 0xFFFFUL) {
                return 0;
            }
            ++index;
        }
    }
    *value = result;
    return 1;
}

/* 解析常量、标签以及可选的加减偏移和低/高字节前缀。 */
unsigned char asm_resolve_expression(const char *text, AsmValue *result)
{
    char expression[ASM_MAX_SYMBOL_NAME + 8];
    char symbol_name[ASM_MAX_SYMBOL_NAME];
    char number_text[8];
    AsmSymbol symbol;
    unsigned char index;
    unsigned char offset_start;
    unsigned char part = 0;
    unsigned char negative = 0;
    unsigned long number;
    unsigned long base;

    if (!asm_copy_upper(expression, text, sizeof(expression))) {
        return 0;
    }
    asm_trim(expression);
    if (expression[0] == '<' || expression[0] == '>') {
        part = expression[0] == '<' ? 1 : 2;
        memmove(expression, expression + 1, strlen(expression));
    }
    offset_start = 0;
    for (index = 1; expression[index] != 0; ++index) {
        if (expression[index] == '+' || expression[index] == '-') {
            offset_start = index;
            negative = expression[index] == '-';
            break;
        }
    }
    if (offset_start != 0) {
        if (!asm_copy_upper(number_text, expression + offset_start + 1, sizeof(number_text)) ||
            !asm_parse_number(number_text, &number)) {
            return 0;
        }
        expression[offset_start] = 0;
    } else {
        number = 0;
    }
    if (asm_parse_number(expression, &base)) {
        result->bank = 0xFF;
        result->is_symbol = 0;
    } else {
        if (!asm_copy_upper(symbol_name, expression, sizeof(symbol_name))) {
            return 0;
        }
        if (asm_lookup(symbol_name, &symbol) < 0) {
            return 0;
        }
        base = symbol.value;
        result->bank = symbol.bank;
        result->is_symbol = 1;
    }
    if (negative) {
        if (number > base) {
            base = 0x10000UL + base - number;
        } else {
            base -= number;
        }
    } else {
        base += number;
    }
    if (base > 0xFFFFUL) {
        return 0;
    }
    if (part == 1) {
        base &= 0x00FFUL;
        result->bank = 0xFF;
    } else if (part == 2) {
        base = (base >> 8) & 0x00FFUL;
        result->bank = 0xFF;
    }
    result->value = base;
    return 1;
}

SB_BANK_END()

SB_BANK_BEGIN(3)

/* 判断助记符是否为 6502 条件分支。 */
static unsigned char asm_is_branch(const char *mnemonic)
{
    return strcmp(mnemonic, "BCC") == 0 || strcmp(mnemonic, "BCS") == 0 ||
        strcmp(mnemonic, "BEQ") == 0 || strcmp(mnemonic, "BMI") == 0 ||
        strcmp(mnemonic, "BNE") == 0 || strcmp(mnemonic, "BPL") == 0 ||
        strcmp(mnemonic, "BVC") == 0 || strcmp(mnemonic, "BVS") == 0;
}

/* 判断移位指令是否允许累加器寻址。 */
static unsigned char asm_is_shift(const char *mnemonic)
{
    return strcmp(mnemonic, "ASL") == 0 || strcmp(mnemonic, "LSR") == 0 ||
        strcmp(mnemonic, "ROL") == 0 || strcmp(mnemonic, "ROR") == 0;
}

/* 判断表达式是否适合零页寻址。 */
static unsigned char asm_is_zero_page(const char *text)
{
    AsmValue value;

    if (!asm_resolve_expression(text, &value) || value.value > 0xFFUL) {
        return 0;
    }
    return value.bank == 0xFF;
}

/* 按零页寻址的指令如果没有零页形式（如 JMP、STA 零页,Y），退回对应的绝对形式。 */
static unsigned char asm_zero_page_or_absolute(unsigned char zero_page_mode, unsigned char absolute_mode)
{
    unsigned char code;

    return asm_find_opcode(asm_state.parsed_op, zero_page_mode, &code) ? zero_page_mode : absolute_mode;
}

/* 从操作数字符串中识别官方 6502 寻址方式。 */
unsigned char asm_classify_operand(unsigned char *mode)
{
    char operand[ASM_MAX_SYMBOL_NAME + 16];
    char expression[ASM_MAX_SYMBOL_NAME + 16];
    unsigned char length;
    unsigned char index;
    unsigned char is_zero_page;

    if (!asm_copy_upper(operand, asm_state.parsed_operand, sizeof(operand))) {
        return 0;
    }
    asm_trim(operand);
    length = (unsigned char)strlen(operand);
    if (length == 0) {
        *mode = asm_is_shift(asm_state.parsed_op) ? ASM_MODE_ACCUMULATOR : ASM_MODE_IMPLIED;
        return 1;
    }
    if (strcmp(operand, "A") == 0 && asm_is_shift(asm_state.parsed_op)) {
        *mode = ASM_MODE_ACCUMULATOR;
        return 1;
    }
    if (operand[0] == '#') {
        *mode = ASM_MODE_IMMEDIATE;
        return 1;
    }
    if (asm_is_branch(asm_state.parsed_op)) {
        *mode = ASM_MODE_RELATIVE;
        return 1;
    }
    if (operand[0] == '(') {
        if (length > 3 && operand[length - 1] == ')' && operand[length - 2] == 'X' && operand[length - 3] == ',') {
            operand[length - 3] = 0;
            memmove(expression, operand + 1, strlen(operand));
            asm_trim(expression);
            if (expression[0] == 0) {
                return 0;
            }
            *mode = ASM_MODE_INDEXED_INDIRECT;
            return 1;
        }
        if (length > 4 && operand[length - 1] == 'Y' && operand[length - 2] == ',' && operand[length - 3] == ')') {
            operand[length - 3] = 0;
            memmove(expression, operand + 1, strlen(operand));
            asm_trim(expression);
            if (expression[0] == 0) {
                return 0;
            }
            *mode = ASM_MODE_INDIRECT_INDEXED;
            return 1;
        }
        if (length > 2 && operand[length - 1] == ')') {
            operand[length - 1] = 0;
            memmove(expression, operand + 1, strlen(operand));
            asm_trim(expression);
            if (expression[0] == 0) {
                return 0;
            }
            *mode = ASM_MODE_INDIRECT;
            return 1;
        }
        return 0;
    }
    if (length > 2 && operand[length - 2] == ',') {
        if (operand[length - 1] != 'X' && operand[length - 1] != 'Y') {
            return 0;
        }
        operand[length - 2] = 0;
        asm_trim(operand);
        if (operand[0] == 0) {
            return 0;
        }
        is_zero_page = asm_is_zero_page(operand);
        if (operand[length - 1] == 'X') {
            *mode = is_zero_page ? asm_zero_page_or_absolute(ASM_MODE_ZERO_PAGE_X, ASM_MODE_ABSOLUTE_X) : ASM_MODE_ABSOLUTE_X;
        } else {
            *mode = is_zero_page ? asm_zero_page_or_absolute(ASM_MODE_ZERO_PAGE_Y, ASM_MODE_ABSOLUTE_Y) : ASM_MODE_ABSOLUTE_Y;
        }
        return 1;
    }
    for (index = 0; operand[index] != 0; ++index) {
        if (operand[index] == ',') {
            return 0;
        }
    }
    *mode = asm_is_zero_page(operand) ? asm_zero_page_or_absolute(ASM_MODE_ZERO_PAGE, ASM_MODE_ABSOLUTE) : ASM_MODE_ABSOLUTE;
    return 1;
}

SB_BANK_END()

SB_BANK_BEGIN(5)

/* 统计 .ascii 字符串转义后的字节数，并拒绝格式错误的字符串。 */
static unsigned char asm_ascii_length(const char *text, unsigned char *length_out)
{
    unsigned char index = 1;
    unsigned char length = 0;

    if (text[0] != '"') {
        return 0;
    }
    while (text[index] != 0 && text[index] != '"') {
        if (text[index] == '\\') {
            ++index;
            if (text[index] == 0) {
                return 0;
            }
            if (text[index] == 'x') {
                if (asm_hex_value(text[index + 1]) < 0 || asm_hex_value(text[index + 2]) < 0) {
                    return 0;
                }
                index += 2;
            } else if (text[index] != 'n' && text[index] != 'r' && text[index] != '0' &&
                text[index] != '\\' && text[index] != '"') {
                return 0;
            }
        }
        ++length;
        ++index;
    }
    if (text[index] != '"' || text[index + 1] != 0) {
        return 0;
    }
    *length_out = length;
    return 1;
}

/* 解析一行并确定其类别、寻址方式与长度。 */
unsigned char asm_parse_current_line(void)
{
    char work[ASM_MAX_LINE_LENGTH];
    char *equals;
    char *colon;
    char *space;
    unsigned char index;
    unsigned char in_string = 0;
    unsigned char length;
    unsigned char string_length;
    unsigned char opcode;
    unsigned char size;
    AsmValue value;

    memset(asm_state.parsed_label, 0, sizeof(asm_state.parsed_label));
    memset(asm_state.parsed_op, 0, sizeof(asm_state.parsed_op));
    memset(asm_state.parsed_operand, 0, sizeof(asm_state.parsed_operand));
    asm_state.parsed_kind = ASM_KIND_EMPTY;
    asm_state.parsed_has_label = 0;
    asm_state.parsed_size = 0;
    asm_state.parsed_mode = 0;
    memcpy(work, asm_state.line, asm_state.line_length + 1);
    for (index = 0; work[index] != 0; ++index) {
        if (work[index] == '"' && (index == 0 || work[index - 1] != '\\')) {
            in_string = !in_string;
        } else if (work[index] == ';' && !in_string) {
            work[index] = 0;
            break;
        }
    }
    asm_trim(work);
    if (work[0] == 0) {
        return 1;
    }
    equals = 0;
    in_string = 0;
    for (index = 0; work[index] != 0; ++index) {
        if (work[index] == '"' && (index == 0 || work[index - 1] != '\\')) {
            in_string = !in_string;
        } else if (work[index] == '=' && !in_string) {
            equals = work + index;
            break;
        }
    }
    if (equals != 0 && equals != work) {
        *equals = 0;
        asm_trim(work);
        if (work[0] == 0) {
            asm_set_error(MSG_BAD_CONSTANT_NAME);
            return 0;
        }
        for (index = 0; work[index] != 0; ++index) {
            if (!((work[index] >= 'A' && work[index] <= 'Z') || (work[index] >= 'a' && work[index] <= 'z') ||
                (work[index] >= '0' && work[index] <= '9') || work[index] == '_')) {
                asm_set_error(MSG_BAD_CONSTANT_CHAR);
                return 0;
            }
        }
        if (!asm_copy_upper(asm_state.parsed_label, work, sizeof(asm_state.parsed_label))) {
            asm_set_error(MSG_NAME_TOO_LONG);
            return 0;
        }
        asm_trim(equals + 1);
        if (equals[1] == 0 || strlen(equals + 1) >= sizeof(asm_state.parsed_operand)) {
            asm_set_error(MSG_CONSTANT_NO_VALUE);
            return 0;
        }
        strcpy(asm_state.parsed_operand, equals + 1);
        asm_state.parsed_kind = ASM_KIND_EQUATE;
        if (!asm_resolve_expression(asm_state.parsed_operand, &value)) {
            if (asm_state.prescan) {
                asm_state.parsed_kind = ASM_KIND_EMPTY;
                return 1;
            }
            asm_set_error(MSG_CONSTANT_UNKNOWN);
            return 0;
        }
        asm_state.parsed_value = (unsigned int)value.value;
        return 1;
    }
    if (asm_state.prescan && !asm_is_include_line(work)) {
        return 1;
    }
    colon = strchr(work, ':');
    space = strpbrk(work, " \t");
    if (colon != 0 && (space == 0 || colon < space)) {
        *colon = 0;
        asm_trim(work);
        if (!asm_copy_upper(asm_state.parsed_label, work, sizeof(asm_state.parsed_label))) {
            asm_set_error(MSG_LABEL_TOO_LONG);
            return 0;
        }
        asm_state.parsed_has_label = 1;
        memmove(work, colon + 1, strlen(colon + 1) + 1);
        asm_trim(work);
    }
    if (work[0] == 0) {
        return 1;
    }
    index = 0;
    while (work[index] != 0 && work[index] != ' ' && work[index] != '\t') {
        ++index;
    }
    if (index >= sizeof(asm_state.parsed_op)) {
        asm_set_error(MSG_OPCODE_TOO_LONG);
        return 0;
    }
    length = index;
    memcpy(asm_state.parsed_op, work, length);
    asm_state.parsed_op[length] = 0;
    for (index = 0; asm_state.parsed_op[index] != 0; ++index) {
        if (asm_state.parsed_op[index] >= 'a' && asm_state.parsed_op[index] <= 'z') {
            asm_state.parsed_op[index] = (char)(asm_state.parsed_op[index] - 'a' + 'A');
        }
    }
    while (work[length] == ' ' || work[length] == '\t') {
        ++length;
    }
    if (strlen(work + length) >= sizeof(asm_state.parsed_operand)) {
        asm_set_error(MSG_OPERAND_TOO_LONG);
        return 0;
    }
    strcpy(asm_state.parsed_operand, work + length);
    asm_trim(asm_state.parsed_operand);
    if (strcmp(asm_state.parsed_op, "BRK") == 0 && asm_state.parsed_operand[0] == 0) {
        strcpy(asm_state.parsed_operand, "#$00");
    }
    if (strcmp(asm_state.parsed_op, ".ORG") == 0) {
        asm_state.parsed_kind = ASM_KIND_ORG;
    } else if (strcmp(asm_state.parsed_op, ".BANK") == 0) {
        asm_state.parsed_kind = ASM_KIND_BANK;
    } else if (strcmp(asm_state.parsed_op, ".BYTE") == 0) {
        asm_state.parsed_kind = ASM_KIND_BYTE;
    } else if (strcmp(asm_state.parsed_op, ".WORD") == 0) {
        asm_state.parsed_kind = ASM_KIND_WORD;
    } else if (strcmp(asm_state.parsed_op, ".ASCII") == 0) {
        asm_state.parsed_kind = ASM_KIND_ASCII;
    } else if (strcmp(asm_state.parsed_op, ".BANKCALL") == 0) {
        asm_state.parsed_kind = ASM_KIND_BANKCALL;
        asm_state.parsed_size = 24;
    } else if (strcmp(asm_state.parsed_op, ".INCLUDE") == 0) {
        asm_state.parsed_kind = ASM_KIND_INCLUDE;
        string_length = (unsigned char)strlen(asm_state.parsed_operand);
        if (string_length < 3 || string_length > 30 || asm_state.parsed_operand[0] != '"' ||
            asm_state.parsed_operand[string_length - 1] != '"') {
            asm_set_error(MSG_INCLUDE_BAD_NAME);
            return 0;
        }
        asm_state.parsed_operand[string_length - 1] = 0;
        asm_copy_upper(asm_state.include_path, asm_state.parsed_operand + 1, sizeof(asm_state.include_path));
    } else {
        if (!asm_classify_operand(&asm_state.parsed_mode)) {
            asm_set_error(MSG_BAD_ADDRESSING);
            return 0;
        }
        if (!asm_find_opcode(asm_state.parsed_op, asm_state.parsed_mode, &opcode)) {
            asm_set_error(MSG_UNSUPPORTED_FORM);
            return 0;
        }
        asm_state.parsed_kind = ASM_KIND_INSTRUCTION;
        if (asm_state.parsed_mode == ASM_MODE_IMPLIED || asm_state.parsed_mode == ASM_MODE_ACCUMULATOR) {
            asm_state.parsed_size = 1;
        } else if (asm_state.parsed_mode == ASM_MODE_ABSOLUTE || asm_state.parsed_mode == ASM_MODE_ABSOLUTE_X ||
            asm_state.parsed_mode == ASM_MODE_ABSOLUTE_Y || asm_state.parsed_mode == ASM_MODE_INDIRECT) {
            asm_state.parsed_size = 3;
        } else {
            asm_state.parsed_size = 2;
        }
    }
    if (asm_state.parsed_kind == ASM_KIND_BYTE || asm_state.parsed_kind == ASM_KIND_WORD) {
        size = 1;
        for (index = 0; asm_state.parsed_operand[index] != 0; ++index) {
            if (asm_state.parsed_operand[index] == ',') {
                ++size;
            }
        }
        if (asm_state.parsed_operand[0] == 0) {
            asm_set_error(MSG_DATA_NO_OPERAND);
            return 0;
        }
        asm_state.parsed_size = size;
        if (asm_state.parsed_kind == ASM_KIND_WORD) {
            asm_state.parsed_size = size * 2;
        }
    } else if (asm_state.parsed_kind == ASM_KIND_ASCII) {
        if (!asm_ascii_length(asm_state.parsed_operand, &string_length)) {
            asm_set_error(MSG_BAD_ASCII);
            return 0;
        }
        asm_state.parsed_size = string_length;
    } else if (asm_state.parsed_kind == ASM_KIND_ORG || asm_state.parsed_kind == ASM_KIND_BANK) {
        if (asm_state.parsed_operand[0] == 0) {
            asm_set_error(MSG_DIRECTIVE_NO_OPERAND);
            return 0;
        }
    }
    if (asm_state.parsed_kind == ASM_KIND_EQUATE && !asm_resolve_expression(asm_state.parsed_operand, &value)) {
        asm_set_error(MSG_CONSTANT_UNKNOWN);
        return 0;
    }
    if (asm_state.parsed_kind == ASM_KIND_EQUATE) {
        asm_state.parsed_value = (unsigned int)value.value;
    }
    return 1;
}

SB_BANK_END()

SB_BANK_BEGIN(6)

/* 把标签或常量加入固定容量的符号表。 */
static unsigned char asm_add_symbol(const char *name, unsigned int value, unsigned char bank)
{
    unsigned char status = asm_symbol_define(name, value, bank);

    if (status == 1) {
        asm_set_error(MSG_DUPLICATE_SYMBOL);
        return 0;
    }
    if (status == 2) {
        asm_set_error(MSG_SYMBOL_LIMIT);
        return 0;
    }
    return 1;
}

/* 检查当前段地址范围并推进位置计数器。 */
static unsigned char asm_advance_address(unsigned char count)
{
    unsigned long end = (unsigned long)asm_state.address + count;

    if (asm_state.bank == 0) {
        if (end > 0x9FF0UL) {
            asm_set_error(MSG_RESIDENT_FULL);
            return 0;
        }
    } else if (end > 0xB000UL) {
        asm_set_error(MSG_BANK_FULL);
        return 0;
    }
    asm_state.address = (unsigned int)end;
    asm_state.bank_addresses[asm_state.bank] = asm_state.address;
    return 1;
}

/** 第二遍用：当前行定义的标签地址必须与第一遍一致，否则说明两遍对某一行长度的判断不同。 */
unsigned char asm_check_label(void)
{
    AsmSymbol symbol;
    int symbol_index = asm_find_symbol(asm_state.parsed_label);

    if (symbol_index < 0 || !asm_get_symbol((unsigned int)symbol_index, &symbol) ||
        symbol.value != asm_state.address || symbol.bank != asm_state.bank) {
        asm_set_error(MSG_LABEL_CHANGED);
        return 0;
    }
    return 1;
}

/* 预扫描的快速通道：整行只是“名字 = 数字”（十进制或 $ 开头的十六进制）时直接登记，不走完整的行解析，
   头文件式的符号文件大多是这种行；返回 0 表示不是这种写法，1 表示已登记，2 表示出错。 */
static unsigned char asm_prescan_simple_constant(void)
{
    const char *cursor = asm_state.line;
    char name[ASM_MAX_SYMBOL_NAME];
    unsigned char length = 0;
    unsigned char digits = 0;
    unsigned int value = 0;
    int digit;
    char character;
    unsigned char status;

    while (*cursor == ' ' || *cursor == '\t') {
        ++cursor;
    }
    for (;;) {
        character = *cursor;
        if (character >= 'a' && character <= 'z') {
            character = (char)(character - 'a' + 'A');
        } else if (!((character >= 'A' && character <= 'Z') || (character >= '0' && character <= '9') || character == '_')) {
            break;
        }
        if (length + 1 >= sizeof(name)) {
            return 0;
        }
        name[length] = character;
        ++length;
        ++cursor;
    }
    if (length == 0) {
        return 0;
    }
    name[length] = 0;
    while (*cursor == ' ' || *cursor == '\t') {
        ++cursor;
    }
    if (*cursor != '=') {
        return 0;
    }
    ++cursor;
    while (*cursor == ' ' || *cursor == '\t') {
        ++cursor;
    }
    if (*cursor == '$') {
        ++cursor;
        while ((digit = asm_hex_value(*cursor)) >= 0) {
            if (value > 0x0FFF) {
                return 0;
            }
            value = (value << 4) + (unsigned char)digit;
            ++digits;
            ++cursor;
        }
    } else {
        while (*cursor >= '0' && *cursor <= '9') {
            digit = *cursor - '0';
            if (value > 6553 || (value == 6553 && digit > 5)) {
                return 0;
            }
            value = value * 10 + (unsigned char)digit;
            ++digits;
            ++cursor;
        }
    }
    while (*cursor == ' ' || *cursor == '\t') {
        ++cursor;
    }
    if (digits == 0 || *cursor != 0) {
        return 0;
    }
    status = asm_symbol_define(name, value, 0xFF);
    if (status == 1) {
        asm_set_error(MSG_DUPLICATE_SYMBOL);
        return 2;
    }
    if (status == 2) {
        asm_set_error(MSG_SYMBOL_LIMIT);
        return 2;
    }
    asm_mark_constant_line();
    return 1;
}

/* 当前行是否以 .include 开头（不计前面的空格）。 */
static unsigned char asm_line_has_include(void)
{
    const char *cursor = asm_state.line;

    while (*cursor == ' ' || *cursor == '\t') {
        ++cursor;
    }
    return asm_is_include_line(cursor);
}

/* 预扫描：先把能求值的常量全部登记，这样常量先使用后定义时，两遍对零页与绝对的选择一致；成功返回 0 */
static unsigned char asm_prescan_constants(void)
{
    unsigned char line_result;
    unsigned char simple;

    asm_symbols_reset();
    memset(asm_state.constant_lines, 0, sizeof(asm_state.constant_lines));
    asm_state.prescan = 1;
    asm_reset_source();
    for (;;) {
        line_result = asm_next_line();
        if (line_result == 0) {
            break;
        }
        if (line_result == 0xFF) {
            asm_state.prescan = 0;
            return 1;
        }
        if (asm_state.line_length == 0) {
            continue;
        }
        simple = asm_prescan_simple_constant();
        if (simple == 2) {
            asm_state.prescan = 0;
            return 1;
        }
        if (simple == 1 || (strchr(asm_state.line, '=') == 0 && !asm_line_has_include())) {
            continue;
        }
        if (!asm_parse_current_line()) {
            asm_state.prescan = 0;
            return 1;
        }
        if (asm_state.parsed_kind == ASM_KIND_EQUATE) {
            if (!asm_add_symbol(asm_state.parsed_label, asm_state.parsed_value, 0xFF)) {
                asm_state.prescan = 0;
                return 1;
            }
            asm_mark_constant_line();
        } else if (asm_state.parsed_kind == ASM_KIND_INCLUDE && !asm_enter_include()) {
            asm_state.prescan = 0;
            return 1;
        }
    }
    asm_state.prescan = 0;
    return 0;
}

/** 第一遍扫描：收集符号并计算常驻区和各银行的长度。 */
unsigned char asm_first_pass(void)
{
    unsigned char line_result;
    unsigned char bank;
    AsmValue value;
    AsmSymbol symbol;
    int symbol_index;
    char *comma;
    char bank_text[8];
    int split;
    unsigned long helper_end;

    if (asm_prescan_constants()) {
        return 1;
    }
    asm_state.max_bank = 0;
    asm_state.bankcall_count = 0;
    asm_state.bank = 0;
    asm_state.address = 0x8008;
    asm_state.bank_addresses[0] = 0x8008;
    for (bank = 1; bank <= ASM_MAX_BANKS; ++bank) {
        asm_state.bank_addresses[bank] = 0xA000;
    }
    asm_reset_source();
    for (;;) {
        line_result = asm_next_line();
        if (line_result == 0) {
            break;
        }
        if (line_result == 1 && asm_is_constant_line()) {
            continue;
        }
        if (line_result == 0xFF || !asm_parse_current_line()) {
            return 1;
        }
        if (asm_state.parsed_kind == ASM_KIND_EMPTY && !asm_state.parsed_has_label) {
            continue;
        }
        if (asm_state.parsed_kind == ASM_KIND_EQUATE) {
            symbol_index = asm_find_symbol(asm_state.parsed_label);
            if (symbol_index >= 0 && asm_get_symbol((unsigned int)symbol_index, &symbol) && symbol.bank == 0xFF &&
                symbol.line == asm_state.line_seq) {
                continue;
            }
            if (!asm_add_symbol(asm_state.parsed_label, asm_state.parsed_value, 0xFF)) {
                return 1;
            }
            continue;
        }
        if (asm_state.parsed_has_label && !asm_add_symbol(asm_state.parsed_label, asm_state.address, asm_state.bank)) {
            return 1;
        }
        if (asm_state.parsed_kind == ASM_KIND_INCLUDE) {
            if (!asm_enter_include()) {
                return 1;
            }
            continue;
        }
        if (asm_state.parsed_kind == ASM_KIND_BANK) {
            if (!asm_resolve_expression(asm_state.parsed_operand, &value) || value.value > ASM_MAX_BANKS) {
                asm_set_error(MSG_BANK_RANGE);
                return 1;
            }
            asm_state.bank = (unsigned char)value.value;
            if (asm_state.bank > asm_state.max_bank) {
                asm_state.max_bank = asm_state.bank;
            }
            asm_state.address = asm_state.bank_addresses[asm_state.bank];
            continue;
        }
        if (asm_state.parsed_kind == ASM_KIND_ORG) {
            if (!asm_resolve_expression(asm_state.parsed_operand, &value) || value.value > 0xFFFFUL) {
                asm_set_error(MSG_BAD_ORG);
                return 1;
            }
            asm_state.address = (unsigned int)value.value;
            asm_state.bank_addresses[asm_state.bank] = asm_state.address;
            continue;
        }
        if (asm_state.parsed_kind == ASM_KIND_BANKCALL) {
            comma = strchr(asm_state.parsed_operand, ',');
            if (comma == 0) {
                asm_set_error(MSG_BANKCALL_SYNTAX);
                return 1;
            }
            split = (int)(comma - asm_state.parsed_operand);
            if (split <= 0 || split >= sizeof(bank_text)) {
                asm_set_error(MSG_BANKCALL_BAD_BANK);
                return 1;
            }
            memcpy(bank_text, asm_state.parsed_operand, split);
            bank_text[split] = 0;
            asm_trim(bank_text);
            if (!asm_resolve_expression(bank_text, &value) || value.value == 0 || value.value > ASM_MAX_BANKS) {
                asm_set_error(MSG_BANKCALL_BANK_RANGE);
                return 1;
            }
            ++asm_state.bankcall_count;
        }
        if (!asm_advance_address(asm_state.parsed_size)) {
            return 1;
        }
    }
    asm_state.helper_address = asm_state.bank_addresses[0];
    if (asm_state.helper_address < 0x8008) {
        asm_state.helper_address = 0x8008;
    }
    helper_end = (unsigned long)asm_state.helper_address + 128;
    if (helper_end > 0x9FF0UL) {
        asm_set_error(MSG_NO_ROOM_RUNTIME);
        return 1;
    }
    return 0;
}

SB_BANK_END()

SB_BANK_BEGIN(7)

/* 汇编结果使用的 DOS 系统变量和运行时工作区地址。 */
#define ASM_RUNTIME_CURRENT_BANK 0x9FF0
#define ASM_RUNTIME_TARGET_BANK 0x9FF1
#define ASM_RUNTIME_TARGET_LOW 0x9FF2
#define ASM_RUNTIME_TARGET_HIGH 0x9FF3
#define ASM_RUNTIME_RESULT_A 0x9FF4
#define ASM_RUNTIME_RESULT_X 0x9FF5
#define ASM_SYSTEM_PAGE 0x0641
#define ASM_SYSTEM_WINDOW 0x0653
#define ASM_SYSTEM_FUNCTION 0x063E
#define ASM_SYSTEM_MAP_WINDOW 0x29
#define ASM_SYSTEM_CALL 0xFFF0
#define ASM_BANKCALL_SIZE 24

/* 银行调用蹦床：保存当前银行，换页调用目标函数，再恢复原银行。 */
static const unsigned char BANKCALL_RUNTIME[] = {
    0xAD, 0xF0, 0x9F, 0x48, 0xAD, 0xF1, 0x9F, 0x8D, 0xF0, 0x9F,
    0xC9, 0x01, 0xF0, 0x05, 0x18, 0x69, 0x02, 0xD0, 0x02, 0xA9,
    0x02, 0x18, 0x6D, 0x05, 0x80, 0x8D, 0x41, 0x06, 0xA9, 0x02,
    0x8D, 0x53, 0x06, 0xA9, 0x29, 0x8D, 0x3E, 0x06, 0x20, 0xF0,
    0xFF, 0xAD, 0xF4, 0x9F, 0xAE, 0xF5, 0x9F, 0x20, 0x00, 0x00,
    0x8D, 0xF4, 0x9F, 0x8E, 0xF5, 0x9F, 0x68, 0x8D, 0xF0, 0x9F,
    0xC9, 0x01, 0xF0, 0x05, 0x18, 0x69, 0x02, 0xD0, 0x02, 0xA9,
    0x02, 0x18, 0x6D, 0x05, 0x80, 0x8D, 0x41, 0x06, 0xA9, 0x02,
    0x8D, 0x53, 0x06, 0xA9, 0x29, 0x8D, 0x3E, 0x06, 0x20, 0xF0,
    0xFF, 0xAD, 0xF4, 0x9F, 0xAE, 0xF5, 0x9F, 0x60, 0x6C, 0xF2,
    0x9F
};

/* 把当前银行和 CPU 地址转换成输出映像中的字节偏移。 */
static unsigned long asm_output_offset(unsigned char bank, unsigned int address)
{
    if (bank == 0) {
        return (unsigned long)(address - 0x8000);
    }
    if (bank == 1) {
        return 0x2000UL + (unsigned long)(address - 0xA000);
    }
    return ((unsigned long)bank + 2) * 0x1000UL + (unsigned long)(address - 0xA000);
}

/* 把操作数中实际参与编码的表达式复制到临时缓冲区。 */
static unsigned char asm_extract_expression(char *destination)
{
    const char *operand = asm_state.parsed_operand;
    const char *start = operand;
    const char *end;
    unsigned int length;

    if (asm_state.parsed_mode == ASM_MODE_IMMEDIATE) {
        ++start;
    } else if (operand[0] == '(') {
        start = operand + 1;
        end = strpbrk(start, ",)");
        if (end == 0) {
            return 0;
        }
        length = (unsigned int)(end - start);
        if (length >= ASM_MAX_LINE_LENGTH) {
            return 0;
        }
        memcpy(destination, start, length);
        destination[length] = 0;
        asm_trim(destination);
        return destination[0] != 0;
    } else {
        end = strchr(start, ',');
        if (end != 0) {
            length = (unsigned int)(end - start);
            if (length >= ASM_MAX_LINE_LENGTH) {
                return 0;
            }
            memcpy(destination, start, length);
            destination[length] = 0;
            asm_trim(destination);
            return destination[0] != 0;
        }
    }
    if (strlen(start) >= ASM_MAX_LINE_LENGTH) {
        return 0;
    }
    strcpy(destination, start);
    asm_trim(destination);
    return destination[0] != 0;
}

/* 输出一段已编码的当前行数据。 */
static unsigned char asm_write_line(unsigned char bank, unsigned int address, unsigned int length)
{
    if (length == 0) {
        return 1;
    }
    return asm_write_output(asm_output_offset(bank, address), length);
}

/* 解析逗号分隔的数据表达式并写成字节或小端字。 */
static unsigned char asm_emit_data_values(unsigned char word_size)
{
    char item[ASM_MAX_SYMBOL_NAME + 8];
    unsigned char item_length = 0;
    unsigned char output_length = 0;
    unsigned char index;
    AsmValue value;

    for (index = 0;; ++index) {
        if (asm_state.parsed_operand[index] == ',' || asm_state.parsed_operand[index] == 0) {
            item[item_length] = 0;
            asm_trim(item);
            if (!asm_resolve_expression(item, &value) || (word_size == 1 && value.value > 0xFFUL)) {
                asm_set_error(MSG_BAD_DATA);
                return 0;
            }
            asm_state.encode_buffer[output_length++] = (unsigned char)value.value;
            if (word_size == 2) {
                asm_state.encode_buffer[output_length++] = (unsigned char)(value.value >> 8);
            }
            item_length = 0;
            if (asm_state.parsed_operand[index] == 0) {
                break;
            }
        } else {
            if (item_length + 1 >= sizeof(item)) {
                asm_set_error(MSG_DATA_TOO_LONG);
                return 0;
            }
            item[item_length++] = asm_state.parsed_operand[index];
        }
    }
    asm_state.address += output_length;
    asm_state.bank_addresses[asm_state.bank] = asm_state.address;
    memcpy(asm_state.io_buffer, asm_state.encode_buffer, output_length);
    return asm_write_line(asm_state.bank, (unsigned int)(asm_state.address - output_length), output_length);
}

/* 把 .ascii 字符串中的支持字符与转义序列写入缓冲区。 */
static unsigned char asm_emit_ascii(void)
{
    unsigned char source_index = 1;
    unsigned char output_length = 0;
    int high;
    int low;
    unsigned char character;

    while (asm_state.parsed_operand[source_index] != '"') {
        character = (unsigned char)asm_state.parsed_operand[source_index++];
        if (character == '\\') {
            character = (unsigned char)asm_state.parsed_operand[source_index++];
            if (character == 'n') {
                character = 10;
            } else if (character == 'r') {
                character = 13;
            } else if (character == '0') {
                character = 0;
            } else if (character == 'x') {
                high = asm_hex_value(asm_state.parsed_operand[source_index++]);
                low = asm_hex_value(asm_state.parsed_operand[source_index++]);
                character = (unsigned char)((high << 4) | low);
            }
        }
        asm_state.encode_buffer[output_length++] = character;
    }
    asm_state.address += output_length;
    asm_state.bank_addresses[asm_state.bank] = asm_state.address;
    memcpy(asm_state.io_buffer, asm_state.encode_buffer, output_length);
    return asm_write_line(asm_state.bank, (unsigned int)(asm_state.address - output_length), output_length);
}

/* 输出跨银行调用指令，目标必须是指定银行中的标签。 */
static unsigned char asm_emit_bankcall(void)
{
    char bank_text[8];
    char label[ASM_MAX_SYMBOL_NAME];
    char *comma;
    AsmValue bank_value;
    AsmSymbol symbol;
    int symbol_index;
    unsigned char split;
    unsigned int address = asm_state.address;
    unsigned char index = 0;

    comma = strchr(asm_state.parsed_operand, ',');
    if (comma == 0) {
        asm_set_error(MSG_BANKCALL_SYNTAX);
        return 0;
    }
    split = (unsigned char)(comma - asm_state.parsed_operand);
    if (split == 0 || split >= sizeof(bank_text)) {
        asm_set_error(MSG_BANKCALL_BAD_BANK);
        return 0;
    }
    memcpy(bank_text, asm_state.parsed_operand, split);
    bank_text[split] = 0;
    asm_trim(bank_text);
    if (!asm_resolve_expression(bank_text, &bank_value) || bank_value.value == 0 || bank_value.value > ASM_MAX_BANKS) {
        asm_set_error(MSG_BANKCALL_BANK_RANGE);
        return 0;
    }
    if (!asm_copy_upper(label, comma + 1, sizeof(label))) {
        asm_set_error(MSG_BANKCALL_LABEL_LONG);
        return 0;
    }
    asm_trim(label);
    symbol_index = asm_find_symbol(label);
    if (symbol_index < 0 || !asm_get_symbol((unsigned int)symbol_index, &symbol) || symbol.bank != bank_value.value) {
        asm_set_error(MSG_BANKCALL_LABEL_BANK);
        return 0;
    }
    asm_state.io_buffer[index++] = 0x8D;
    asm_state.io_buffer[index++] = ASM_RUNTIME_RESULT_A & 0xFF;
    asm_state.io_buffer[index++] = ASM_RUNTIME_RESULT_A >> 8;
    asm_state.io_buffer[index++] = 0x8E;
    asm_state.io_buffer[index++] = ASM_RUNTIME_RESULT_X & 0xFF;
    asm_state.io_buffer[index++] = ASM_RUNTIME_RESULT_X >> 8;
    asm_state.io_buffer[index++] = 0xA9;
    asm_state.io_buffer[index++] = (unsigned char)bank_value.value;
    asm_state.io_buffer[index++] = 0x8D;
    asm_state.io_buffer[index++] = ASM_RUNTIME_TARGET_BANK & 0xFF;
    asm_state.io_buffer[index++] = ASM_RUNTIME_TARGET_BANK >> 8;
    asm_state.io_buffer[index++] = 0xA9;
    asm_state.io_buffer[index++] = (unsigned char)symbol.value;
    asm_state.io_buffer[index++] = 0x8D;
    asm_state.io_buffer[index++] = ASM_RUNTIME_TARGET_LOW & 0xFF;
    asm_state.io_buffer[index++] = ASM_RUNTIME_TARGET_LOW >> 8;
    asm_state.io_buffer[index++] = 0xA9;
    asm_state.io_buffer[index++] = (unsigned char)(symbol.value >> 8);
    asm_state.io_buffer[index++] = 0x8D;
    asm_state.io_buffer[index++] = ASM_RUNTIME_TARGET_HIGH & 0xFF;
    asm_state.io_buffer[index++] = ASM_RUNTIME_TARGET_HIGH >> 8;
    asm_state.io_buffer[index++] = 0x20;
    asm_state.io_buffer[index++] = (unsigned char)asm_state.helper_address;
    asm_state.io_buffer[index++] = (unsigned char)(asm_state.helper_address >> 8);
    asm_state.address += index;
    asm_state.bank_addresses[asm_state.bank] = asm_state.address;
    return asm_write_line(asm_state.bank, address, index);
}

/* 把跨银行调用运行时代码放在常驻段末尾。 */
static unsigned char asm_emit_runtime(void)
{
    unsigned int call_target;

    if (asm_state.bankcall_count == 0) {
        return 1;
    }
    memcpy(asm_state.io_buffer, BANKCALL_RUNTIME, sizeof(BANKCALL_RUNTIME));
    call_target = asm_state.helper_address + 98;
    asm_state.io_buffer[48] = (unsigned char)call_target;
    asm_state.io_buffer[49] = (unsigned char)(call_target >> 8);
    return asm_write_output(asm_output_offset(0, asm_state.helper_address), sizeof(BANKCALL_RUNTIME));
}

/** 第二遍扫描：生成常驻区和银行页数据，并保存 SB-DOS EXE。 */
unsigned char asm_second_pass(void)
{
    unsigned char line_result;
    unsigned char bank;
    unsigned char pages;
    unsigned char opcode;
    unsigned char expression_length;
    unsigned char output_length;
    char expression[ASM_MAX_LINE_LENGTH];
    AsmValue value;
    long relative;
    unsigned long output_offset;

    pages = asm_state.max_bank + 3;
    if (pages < 4) {
        pages = 4;
    }
    if (sb_page_alloc(pages, &asm_state.output_page) != 0) {
        asm_set_error(MSG_NO_CONTIGUOUS_PAGES);
        return 1;
    }
    asm_state.output_page_count = pages;
    asm_state.output_size = (unsigned long)pages << 12;
    memset(asm_state.io_buffer, 0, ASM_IO_BUFFER_SIZE);
    for (output_offset = 0; output_offset < asm_state.output_size; output_offset += ASM_IO_BUFFER_SIZE) {
        if (!asm_write_output(output_offset, ASM_IO_BUFFER_SIZE)) {
            asm_set_error(MSG_INIT_IMAGE_FAILED);
            return 1;
        }
    }
    asm_state.io_buffer[0] = 0x4C;
    asm_state.io_buffer[1] = 0x08;
    asm_state.io_buffer[2] = 0x80;
    asm_state.io_buffer[3] = 0xAA;
    asm_state.io_buffer[4] = 0x55;
    if (!asm_write_output(0, 8)) {
        asm_set_error(MSG_WRITE_HEADER_FAILED);
        return 1;
    }
    memset(asm_state.io_buffer, 0, 6);
    asm_state.io_buffer[0] = 1;
    if (!asm_write_output(ASM_RUNTIME_CURRENT_BANK - 0x8000, 6)) {
        asm_set_error(MSG_INIT_BANK_VARS_FAILED);
        return 1;
    }
    if (!asm_emit_runtime()) {
        return 1;
    }
    asm_state.bank = 0;
    asm_state.address = 0x8008;
    asm_state.bank_addresses[0] = 0x8008;
    for (bank = 1; bank <= ASM_MAX_BANKS; ++bank) {
        asm_state.bank_addresses[bank] = 0xA000;
    }
    asm_reset_source();
    for (;;) {
        line_result = asm_next_line();
        if (line_result == 0) {
            break;
        }
        if (line_result == 1 && asm_is_constant_line()) {
            continue;
        }
        if (line_result == 0xFF || !asm_parse_current_line()) {
            return 1;
        }
        if (asm_state.parsed_has_label && !asm_check_label()) {
            return 1;
        }
        if (asm_state.parsed_kind == ASM_KIND_EMPTY || asm_state.parsed_kind == ASM_KIND_EQUATE) {
            continue;
        }
        if (asm_state.parsed_kind == ASM_KIND_INCLUDE) {
            if (!asm_enter_include()) {
                return 1;
            }
            continue;
        }
        if (asm_state.parsed_kind == ASM_KIND_BANK) {
            if (!asm_resolve_expression(asm_state.parsed_operand, &value)) {
                asm_set_error(MSG_BANK_INVALID);
                return 1;
            }
            asm_state.bank = (unsigned char)value.value;
            asm_state.address = asm_state.bank_addresses[asm_state.bank];
            continue;
        }
        if (asm_state.parsed_kind == ASM_KIND_ORG) {
            if (!asm_resolve_expression(asm_state.parsed_operand, &value)) {
                asm_set_error(MSG_BAD_ORG);
                return 1;
            }
            asm_state.address = (unsigned int)value.value;
            asm_state.bank_addresses[asm_state.bank] = asm_state.address;
            continue;
        }
        if (asm_state.parsed_kind == ASM_KIND_BYTE || asm_state.parsed_kind == ASM_KIND_WORD) {
            if (!asm_emit_data_values(asm_state.parsed_kind == ASM_KIND_WORD ? 2 : 1)) {
                return 1;
            }
            continue;
        }
        if (asm_state.parsed_kind == ASM_KIND_ASCII) {
            if (!asm_emit_ascii()) {
                return 1;
            }
            continue;
        }
        if (asm_state.parsed_kind == ASM_KIND_BANKCALL) {
            if (!asm_emit_bankcall()) {
                return 1;
            }
            continue;
        }
        if (!asm_find_opcode(asm_state.parsed_op, asm_state.parsed_mode, &opcode)) {
            asm_set_error(MSG_OPCODE_LOOKUP);
            return 1;
        }
        output_length = 0;
            asm_state.encode_buffer[output_length++] = opcode;
        if (asm_state.parsed_mode != ASM_MODE_IMPLIED && asm_state.parsed_mode != ASM_MODE_ACCUMULATOR) {
            if (!asm_extract_expression(expression)) {
                asm_set_error(MSG_BAD_OPERAND);
                return 1;
            }
            expression_length = (unsigned char)strlen(expression);
            if (expression_length == 0 || !asm_resolve_expression(expression, &value)) {
                asm_set_error(MSG_UNDEFINED_SYMBOL);
                return 1;
            }
            if (asm_state.parsed_mode == ASM_MODE_RELATIVE) {
                if (value.bank != asm_state.bank) {
                    asm_set_error(MSG_BRANCH_CROSS_BANK);
                    return 1;
                }
                relative = (long)value.value - (long)asm_state.address - 2;
                if (relative < -128 || relative > 127) {
                    asm_set_error(MSG_BRANCH_RANGE);
                    return 1;
                }
                asm_state.encode_buffer[output_length++] = (unsigned char)relative;
            } else if (asm_state.parsed_size == 2) {
                if (value.value > 0xFFUL) {
                    asm_set_error(MSG_BYTE_RANGE);
                    return 1;
                }
                asm_state.encode_buffer[output_length++] = (unsigned char)value.value;
            } else {
                asm_state.encode_buffer[output_length++] = (unsigned char)value.value;
                asm_state.encode_buffer[output_length++] = (unsigned char)(value.value >> 8);
            }
        }
        memcpy(asm_state.io_buffer, asm_state.encode_buffer, output_length);
        if (!asm_write_line(asm_state.bank, asm_state.address, output_length)) {
            asm_set_error(MSG_WRITE_CODE_FAILED);
            return 1;
        }
        asm_state.address += output_length;
        asm_state.bank_addresses[asm_state.bank] = asm_state.address;
    }
    if (sb_file_save(asm_state.output_path, asm_state.output_page, asm_state.output_size) != 0) {
        asm_set_error(MSG_SAVE_FAILED);
        return 1;
    }
    return 0;
}

SB_BANK_END()