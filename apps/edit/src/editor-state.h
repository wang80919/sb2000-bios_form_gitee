/*
 * ------------------------------------------------------------------------
 * 名称：editor-state.h
 * 说明：编辑器各部分共享的状态：文档（文件名、换行方式、是否修改）、光标与屏幕首行的位置。
 * 作者：sungbin
 * 邮箱：sungbin@3578.cn
 * 日期：2026-11-11
 * 备注：状态变量放在常驻区，任何库页都能读写；传进函数的文字必须在常驻区，不能指向别的库页。
 * ------------------------------------------------------------------------
 */
#ifndef EDIT_EDITOR_STATE_H
#define EDIT_EDITOR_STATE_H

#include <sb2000.h>

/* 文件路径缓冲的大小：最长 28 个字符加结尾的 0 */
#define PATH_SIZE 29

/* 当前文件名，空串表示还没有名字 */
extern char document_path[PATH_SIZE];

/* 文件原来是否用 CR LF 换行，保存时按它写回 */
extern unsigned char uses_crlf;

/* 是否有未保存的修改 */
extern unsigned char modified;

/* “内存不足”的提示文字（GB2312） */
extern const char editor_text_no_memory[];

/* 光标与屏幕的位置，位置都用文档里的字节序号，行号与列号随移动增减 */
typedef struct {
    /** 光标的字节序号。 */
    unsigned long cursor;
    /** 光标所在行号，从 1 起。 */
    unsigned int cursor_line;
    /** 光标在行内的字节序号，从 0 起。 */
    unsigned int cursor_column;
    /** 上下移动时想保持的列。 */
    unsigned int wanted_column;
    /** 屏幕第一行的字节序号。 */
    unsigned long top;
    /** 屏幕第一行的行号，从 1 起。 */
    unsigned int top_line;
    /** 水平滚动时，屏幕第 1 列对应的行内字节序号。 */
    unsigned int scroll_column;
} EditorState;

/* 编辑器唯一的光标与屏幕状态 */
extern EditorState editor_state;

/* 编辑器主体的函数在库页 3 */
SB_BANK_CALLS_BEGIN(3)

/** 把光标与屏幕位置恢复成文档开头，用于装入文件之后；屏幕内容由下一次刷新自动更新。 */
void editor_reset_position(void);

SB_BANK_CALLS_END()

#endif
