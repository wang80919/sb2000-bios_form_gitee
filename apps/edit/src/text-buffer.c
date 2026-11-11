/*
 * ------------------------------------------------------------------------
 * 名称：text-buffer.c
 * 说明：文本缓冲的实现：用块表记录每块所在的扩展 RAM 页与已用字节数，插入、删除只移动所在块内的字节。
 * 作者：sungbin
 * 邮箱：sungbin@3578.cn
 * 日期：2026-11-11
 * 备注：块写满后在中间拆成两块；块被删空后释放页并从块表移除。所有读写都经 sb_far_read、sb_far_write，
 *       经 $0700 中转，所以每次最多搬 256 字节。
 * ------------------------------------------------------------------------
 */
#include <string.h>
#include <sb2000.h>
#include "text-buffer.h"

/* 每次搬运的最大字节数，也是中转区的大小 */
#define COPY_SIZE 256U

/* 块写满后拆分时，原块保留的字节数 */
#define SPLIT_KEEP 2048U

/* 块表：每块所在的扩展 RAM 页、已用字节数；表项的先后顺序就是文档的先后顺序 */
static unsigned char block_page[BUFFER_MAX_BLOCKS];
static unsigned int block_length[BUFFER_MAX_BLOCKS];
static unsigned char block_count;

/* 文档的总字节数 */
static unsigned long total_length;

/* 搬运与扫描共用的中转区；这些操作之间没有嵌套 */
static unsigned char copy_area[COPY_SIZE];

SB_BANK_BEGIN(1)

/* 求位置落在第几块、块内偏移多少；位置等于文档长度时落在最后一块的末尾 */
static void locate(unsigned long position, unsigned char *index, unsigned int *offset)
{
    unsigned char block;

    for (block = 0; block < block_count; ++block) {
        if (position < block_length[block]) {
            *index = block;
            *offset = (unsigned int)position;
            return;
        }
        position -= block_length[block];
    }
    *index = block_count - 1;
    *offset = block_length[block_count - 1];
}

/* 把块内 [offset, 已用字节数) 整体后移一个字节，从后往前搬以免覆盖；调用者保证块没有写满 */
static void shift_up(unsigned char index, unsigned int offset)
{
    unsigned int end = block_length[index];
    unsigned int remaining = end - offset;
    unsigned int take;
    unsigned int start;

    while (remaining != 0) {
        take = remaining < COPY_SIZE ? remaining : COPY_SIZE;
        start = end - take;
        sb_far_read(block_page[index], start, copy_area, take);
        sb_far_write(block_page[index], start + 1, copy_area, take);
        end = start;
        remaining -= take;
    }
}

/* 删除块内 offset 处的字节：后面的内容整体前移一个字节，从前往后搬 */
static void shift_down(unsigned char index, unsigned int offset)
{
    unsigned int start = offset + 1;
    unsigned int remaining = block_length[index] - start;
    unsigned int take;

    while (remaining != 0) {
        take = remaining < COPY_SIZE ? remaining : COPY_SIZE;
        sb_far_read(block_page[index], start, copy_area, take);
        sb_far_write(block_page[index], start - 1, copy_area, take);
        start += take;
        remaining -= take;
    }
}

/* 把写满的块从 SPLIT_KEEP 处拆开，后半部分放进新申请的页，成为块表里的下一项 */
static unsigned char split_block(unsigned char index)
{
    unsigned char page;
    unsigned int moved = block_length[index] - SPLIT_KEEP;
    unsigned int done = 0;
    unsigned int take;

    if (block_count >= BUFFER_MAX_BLOCKS || sb_page_alloc(1, &page) != 0) {
        return 0;
    }
    while (done < moved) {
        take = moved - done < COPY_SIZE ? moved - done : COPY_SIZE;
        sb_far_read(block_page[index], SPLIT_KEEP + done, copy_area, take);
        sb_far_write(page, done, copy_area, take);
        done += take;
    }
    memmove(&block_page[index + 2], &block_page[index + 1], block_count - index - 1);
    memmove(&block_length[index + 2], &block_length[index + 1], (block_count - index - 1) * sizeof(unsigned int));
    block_page[index + 1] = page;
    block_length[index + 1] = moved;
    block_length[index] = SPLIT_KEEP;
    ++block_count;
    return 1;
}

unsigned char buffer_reset(void)
{
    unsigned char page;

    buffer_release();
    if (sb_page_alloc(1, &page) != 0) {
        return BUFFER_ERROR_NO_MEMORY;
    }
    block_page[0] = page;
    block_length[0] = 0;
    block_count = 1;
    total_length = 0;
    return BUFFER_OK;
}

void buffer_release(void)
{
    unsigned char block;

    for (block = 0; block < block_count; ++block) {
        sb_page_free(block_page[block], 1);
    }
    block_count = 0;
    total_length = 0;
}

unsigned long buffer_length(void)
{
    return total_length;
}

unsigned int buffer_read(unsigned long position, unsigned char *destination, unsigned int count)
{
    unsigned char index;
    unsigned int offset;
    unsigned int available;
    unsigned int take;
    unsigned int done = 0;

    if (position >= total_length) {
        return 0;
    }
    locate(position, &index, &offset);
    while (done < count && index < block_count) {
        available = block_length[index] - offset;
        take = count - done;
        if (take > available) {
            take = available;
        }
        if (take > COPY_SIZE) {
            take = COPY_SIZE;
        }
        sb_far_read(block_page[index], offset, destination + done, take);
        done += take;
        offset += take;
        if (offset >= block_length[index]) {
            ++index;
            offset = 0;
        }
    }
    return done;
}

unsigned char buffer_insert(unsigned long position, unsigned char value)
{
    unsigned char index;
    unsigned int offset;

    locate(position, &index, &offset);
    if (block_length[index] >= BUFFER_BLOCK_SIZE) {
        if (!split_block(index)) {
            return BUFFER_ERROR_NO_MEMORY;
        }
        locate(position, &index, &offset);
    }
    shift_up(index, offset);
    sb_far_write_byte(block_page[index], offset, value);
    ++block_length[index];
    ++total_length;
    return BUFFER_OK;
}

void buffer_delete(unsigned long position)
{
    unsigned char index;
    unsigned int offset;

    if (position >= total_length) {
        return;
    }
    locate(position, &index, &offset);
    shift_down(index, offset);
    --block_length[index];
    --total_length;
    if (block_length[index] == 0 && block_count > 1) {
        sb_page_free(block_page[index], 1);
        memmove(&block_page[index], &block_page[index + 1], block_count - index - 1);
        memmove(&block_length[index], &block_length[index + 1], (block_count - index - 1) * sizeof(unsigned int));
        --block_count;
    }
}

unsigned char buffer_append(const unsigned char *source, unsigned int count)
{
    unsigned char last;
    unsigned char page;
    unsigned int room;
    unsigned int take;

    while (count != 0) {
        last = block_count - 1;
        room = BUFFER_BLOCK_SIZE - block_length[last];
        if (room == 0) {
            if (block_count >= BUFFER_MAX_BLOCKS || sb_page_alloc(1, &page) != 0) {
                return BUFFER_ERROR_NO_MEMORY;
            }
            block_page[block_count] = page;
            block_length[block_count] = 0;
            ++block_count;
            continue;
        }
        take = count < room ? count : room;
        if (take > COPY_SIZE) {
            take = COPY_SIZE;
        }
        sb_far_write(block_page[last], block_length[last], source, take);
        block_length[last] += take;
        total_length += take;
        source += take;
        count -= take;
    }
    return BUFFER_OK;
}

unsigned long buffer_find_line_start(unsigned long position)
{
    unsigned int block;
    unsigned int index;

    while (position > 0) {
        block = position < COPY_SIZE ? (unsigned int)position : COPY_SIZE;
        position -= block;
        buffer_read(position, copy_area, block);
        for (index = block; index > 0; --index) {
            if (copy_area[index - 1] == '\n') {
                return position + index;
            }
        }
    }
    return 0;
}

unsigned long buffer_find_line_end(unsigned long position)
{
    unsigned int got;
    unsigned int index;

    while (position < total_length) {
        got = buffer_read(position, copy_area, COPY_SIZE);
        for (index = 0; index < got; ++index) {
            if (copy_area[index] == '\n') {
                return position + index;
            }
        }
        position += got;
    }
    return total_length;
}

unsigned int buffer_count_lines(unsigned long position)
{
    unsigned long start = 0;
    unsigned int got;
    unsigned int index;
    unsigned int lines = 0;

    while (start < position) {
        got = buffer_read(start, copy_area, position - start < COPY_SIZE ? (unsigned int)(position - start) : COPY_SIZE);
        if (got == 0) {
            break;
        }
        for (index = 0; index < got; ++index) {
            if (copy_area[index] == '\n') {
                ++lines;
            }
        }
        start += got;
    }
    return lines;
}

unsigned char buffer_han_run(unsigned long position)
{
    unsigned int block;
    unsigned int index;
    unsigned char state = BUFFER_HAN_NONE;

    while (position > 0) {
        block = position < COPY_SIZE ? (unsigned int)position : COPY_SIZE;
        position -= block;
        buffer_read(position, copy_area, block);
        for (index = block; index > 0; --index) {
            if (copy_area[index - 1] < HAN_BYTE_MINIMUM) {
                return state;
            }
            state = state == BUFFER_HAN_ODD ? BUFFER_HAN_EVEN : BUFFER_HAN_ODD;
        }
    }
    return state;
}

SB_BANK_END()
