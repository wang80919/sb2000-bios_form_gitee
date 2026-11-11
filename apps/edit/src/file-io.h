/*
 * ------------------------------------------------------------------------
 * 名称：file-io.h
 * 说明：文本文件的装入与保存：装入时把文件分块读进文本缓冲，保存时整理成连续的扩展 RAM 页再写盘。
 * 作者：sungbin
 * 邮箱：sungbin@3578.cn
 * 日期：2026-11-11
 * 备注：文件里的 CR LF 换行在装入时统一成 LF，并记下“原来是 CR LF”；保存时按这个标记写回，新文件默认写 CR LF。
 * ------------------------------------------------------------------------
 */
#ifndef EDIT_FILE_IO_H
#define EDIT_FILE_IO_H

#include <sb2000.h>

/* 装入与保存的结果；其余值是 DOS 的出错码 */
#define FILE_IO_OK 0
#define FILE_IO_NO_MEMORY 0xF0

/* 本模块的函数都在库页 2，调用时自动换页；路径必须在常驻区或全局缓冲里 */
SB_BANK_CALLS_BEGIN(2)

/**
 * 把文件装入文本缓冲，缓冲里原有的内容被丢弃。
 * @param path 文件路径，DOS 8.3 名称。
 * @param uses_crlf 返回文件原来是否用 CR LF 换行；装入失败时不改。
 * @return FILE_IO_OK 成功；FILE_IO_NO_MEMORY 内存不足；其他是 DOS 出错码（如文件不存在）。
 */
unsigned char file_load(const char *path, unsigned char *uses_crlf);

/**
 * 把文本缓冲的内容写成文件，已存在的文件被覆盖。
 * @param path 文件路径。
 * @param uses_crlf 非 0 时把每个换行写成 CR LF。
 * @return FILE_IO_OK 成功；FILE_IO_NO_MEMORY 找不到足够的连续空闲页；其他是 DOS 出错码。
 */
unsigned char file_save(const char *path, unsigned char uses_crlf);

SB_BANK_CALLS_END()

#endif
