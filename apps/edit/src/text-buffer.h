/*
 * ------------------------------------------------------------------------
 * 名称：text-buffer.h
 * 说明：文本缓冲：文档按 4K 的扩展 RAM 页分块存放，编辑只移动所在块内的字节，文档大小只受空闲页数限制。
 * 作者：sungbin
 * 邮箱：sungbin@3578.cn
 * 日期：2026-11-11
 * 备注：位置一律用文档内的字节序号（从 0 起）；位置等于文档长度表示文档末尾。块之间不要求连续页。
 * ------------------------------------------------------------------------
 */
#ifndef EDIT_TEXT_BUFFER_H
#define EDIT_TEXT_BUFFER_H

#include <sb2000.h>

/* 每块的字节数，等于扩展 RAM 一页 */
#define BUFFER_BLOCK_SIZE 4096U

/* 文档最多的块数，决定文档的最大长度（约 480K） */
#define BUFFER_MAX_BLOCKS 120

/* 缓冲操作的结果 */
#define BUFFER_OK 0
#define BUFFER_ERROR_NO_MEMORY 1

/* GB2312 汉字的两个字节都不小于这个值 */
#define HAN_BYTE_MINIMUM 0xA1

/* buffer_han_run 的结果：前面没有汉字字节、有奇数个、有偶数个（不为 0） */
#define BUFFER_HAN_NONE 0
#define BUFFER_HAN_ODD 1
#define BUFFER_HAN_EVEN 2

/* 本模块的函数都在库页 1，调用时自动换页 */
SB_BANK_CALLS_BEGIN(1)

/**
 * 建立只有一个空块的空文档，原有内容全部丢弃。
 * @return BUFFER_OK 成功；BUFFER_ERROR_NO_MEMORY 没有空闲页。
 */
unsigned char buffer_reset(void);

/** 释放文档占用的全部扩展 RAM 页。程序退出前必须调用。 */
void buffer_release(void);

/** 取文档的字节数。 */
unsigned long buffer_length(void);

/**
 * 从文档里读出一段字节，读到文档末尾为止。
 * @param position 起始位置。
 * @param destination 目的地，必须在程序窗口内（不能在 $B000 以上）。
 * @param count 最多读取的字节数。
 * @return 实际读到的字节数。
 */
unsigned int buffer_read(unsigned long position, unsigned char *destination, unsigned int count);

/**
 * 在指定位置插入一个字节，后面的内容顺延。
 * @param position 插入位置，不超过文档长度。
 * @param value 要插入的字节。
 * @return BUFFER_OK 成功；BUFFER_ERROR_NO_MEMORY 没有空闲页或块数已满。
 */
unsigned char buffer_insert(unsigned long position, unsigned char value);

/**
 * 删除指定位置的一个字节，后面的内容前移；位置在文档末尾时什么都不做。
 * @param position 要删除的字节位置。
 */
void buffer_delete(unsigned long position);

/**
 * 把一段字节追加到文档末尾，用于装入文件。
 * @param source 数据来源，必须在程序窗口内。
 * @param count 字节数。
 * @return BUFFER_OK 成功；BUFFER_ERROR_NO_MEMORY 没有空闲页或块数已满。
 */
unsigned char buffer_append(const unsigned char *source, unsigned int count);

/**
 * 找出包含指定位置的那一行的起点。
 * @param position 行内的位置；指向行尾换行符时也算这一行。
 * @return 行首的位置。
 */
unsigned long buffer_find_line_start(unsigned long position);

/**
 * 找出从指定位置起这一行的结束位置。
 * @param position 起始位置。
 * @return 行尾换行符的位置；这一行是最后一行且没有换行符时返回文档长度。
 */
unsigned long buffer_find_line_end(unsigned long position);

/**
 * 统计文档开头到指定位置之间的换行符个数。
 * @param position 结束位置（不含）。
 * @return 换行符个数。
 */
unsigned int buffer_count_lines(unsigned long position);

/**
 * 统计指定位置之前连续的汉字字节（不小于 HAN_BYTE_MINIMUM 的字节）有奇数个还是偶数个。
 * 汉字成对排列，所以结果是奇数说明这个位置落在一个汉字的中间，是偶数说明在字符边界上。
 * @param position 要判断的位置。
 * @return BUFFER_HAN_NONE、BUFFER_HAN_ODD 或 BUFFER_HAN_EVEN。
 */
unsigned char buffer_han_run(unsigned long position);

SB_BANK_CALLS_END()

#endif
