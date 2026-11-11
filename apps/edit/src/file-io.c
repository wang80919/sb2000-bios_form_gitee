/*
 * ------------------------------------------------------------------------
 * 名称：file-io.c
 * 说明：文本文件装入与保存的实现。
 * 作者：sungbin
 * 邮箱：sungbin@3578.cn
 * 日期：2026-11-11
 * 备注：装入先用 sb_file_load 一次读入连续的页（每次 sb_file_read 都要重读扇区，小段反复读很慢），连续页不够时才退回 sb_file_read 分段读；
 *       保存要把内容整理进连续的页再整个写盘（DOS 只支持这种写法）。
 * ------------------------------------------------------------------------
 */
#include <sb2000.h>
#include "file-io.h"
#include "text-buffer.h"

/* 每次读入或写出的字节数；换行展开后最多多出同样数量的 CR，所以输出区多留一个字节给延迟处理的 CR */
#define CHUNK_SIZE 256U

/* 读出区与转换后的输出区 */
static unsigned char read_area[CHUNK_SIZE];
static unsigned char write_area[CHUNK_SIZE + 1];

/* 装入过程中的换行转换状态：上一块末尾是否停在 CR 上、文件里是否出现过 CR LF */
static unsigned char pending_cr;
static unsigned char found_crlf;

SB_BANK_BEGIN(2)

/* 把 read_area 里的 take 个字节转换换行后追加进文本缓冲：CR LF 去掉 CR 并记下标记，孤立的 CR 原样保留 */
static unsigned char append_read_area(unsigned int take)
{
    unsigned char value;
    unsigned int kept = 0;
    unsigned int index;

    for (index = 0; index < take; ++index) {
        value = read_area[index];
        if (pending_cr) {
            pending_cr = 0;
            if (value == '\n') {
                found_crlf = 1;
            } else {
                write_area[kept++] = '\r';
            }
        }
        if (value == '\r') {
            pending_cr = 1;
        } else {
            write_area[kept++] = value;
        }
    }
    return buffer_append(write_area, kept);
}

/* 全部读完后补上停在末尾的孤立 CR，并按结果收尾；失败时清空文本缓冲 */
static unsigned char finish_load(unsigned char result, unsigned char *uses_crlf)
{
    if (result == 0 && pending_cr) {
        write_area[0] = '\r';
        if (buffer_append(write_area, 1) != BUFFER_OK) {
            result = FILE_IO_NO_MEMORY;
        }
    }
    if (result != 0) {
        buffer_reset();
        return result;
    }
    *uses_crlf = found_crlf;
    return FILE_IO_OK;
}

/* 连续空闲页不够装下整个文件时的办法：每次 sb_file_read 读一小段 */
static unsigned char load_in_pieces(const char *path, unsigned char *uses_crlf)
{
    unsigned char handle;
    unsigned char result;
    unsigned long size;
    unsigned long offset = 0;
    unsigned int take;

    result = sb_file_open(path, SB_MODE_OPEN, &handle);
    if (result != 0) {
        return result;
    }
    sb_file_size(handle, &size);
    if (buffer_reset() != BUFFER_OK) {
        sb_file_close(handle);
        return FILE_IO_NO_MEMORY;
    }
    while (offset < size) {
        take = size - offset < CHUNK_SIZE ? (unsigned int)(size - offset) : CHUNK_SIZE;
        result = sb_file_read(handle, offset, read_area, take);
        if (result != 0) {
            break;
        }
        if (append_read_area(take) != BUFFER_OK) {
            result = FILE_IO_NO_MEMORY;
            break;
        }
        offset += take;
    }
    sb_file_close(handle);
    return finish_load(result, uses_crlf);
}

unsigned char file_load(const char *path, unsigned char *uses_crlf)
{
    unsigned char first_page;
    unsigned char pages;
    unsigned char result;
    unsigned long size;
    unsigned long offset = 0;
    unsigned int take;

    result = sb_file_load(path, &first_page, &size);
    if (result == SB_ERR_NO_MEMORY) {
        pending_cr = 0;
        found_crlf = 0;
        return load_in_pieces(path, uses_crlf);
    }
    if (result != 0) {
        return result;
    }
    pages = (unsigned char)((size + 0x0FFFUL) >> 12);
    pending_cr = 0;
    found_crlf = 0;
    if (buffer_reset() != BUFFER_OK) {
        result = FILE_IO_NO_MEMORY;
    }
    while (result == 0 && offset < size) {
        take = size - offset < CHUNK_SIZE ? (unsigned int)(size - offset) : CHUNK_SIZE;
        sb_far_read(first_page + (unsigned char)(offset >> 12), (unsigned int)(offset & 0x0FFFUL), read_area, take);
        if (append_read_area(take) != BUFFER_OK) {
            result = FILE_IO_NO_MEMORY;
        }
        offset += take;
    }
    if (pages != 0) {
        sb_page_free(first_page, pages);
    }
    return finish_load(result, uses_crlf);
}

unsigned char file_save(const char *path, unsigned char uses_crlf)
{
    unsigned long length = buffer_length();
    unsigned long output_size = length;
    unsigned long position = 0;
    unsigned long output_offset = 0;
    unsigned char first_page;
    unsigned char pages;
    unsigned char result;
    unsigned int got;
    unsigned int kept;
    unsigned int index;

    if (uses_crlf) {
        output_size += buffer_count_lines(length);
    }
    if (output_size == 0) {
        return sb_file_save(path, 0, 0);
    }
    pages = (unsigned char)((output_size + BUFFER_BLOCK_SIZE - 1) / BUFFER_BLOCK_SIZE);
    if (sb_page_alloc(pages, &first_page) != 0) {
        return FILE_IO_NO_MEMORY;
    }
    while (position < length) {
        got = buffer_read(position, read_area, CHUNK_SIZE / 2);
        kept = 0;
        for (index = 0; index < got; ++index) {
            if (uses_crlf && read_area[index] == '\n') {
                write_area[kept++] = '\r';
            }
            write_area[kept++] = read_area[index];
        }
        sb_far_write(first_page + (unsigned char)(output_offset >> 12), (unsigned int)(output_offset & 0x0FFF), write_area, kept);
        output_offset += kept;
        position += got;
    }
    result = sb_file_save(path, first_page, output_size);
    sb_page_free(first_page, pages);
    return result;
}

SB_BANK_END()
