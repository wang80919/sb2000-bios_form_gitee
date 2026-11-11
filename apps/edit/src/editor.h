/*
 * ------------------------------------------------------------------------
 * 名称：editor.h
 * 说明：文本编辑器的主体：光标与编辑、屏幕刷新、按键分发。
 * 作者：sungbin
 * 邮箱：sungbin@3578.cn
 * 日期：2026-11-11
 * 备注：无
 * ------------------------------------------------------------------------
 */
#ifndef EDIT_EDITOR_H
#define EDIT_EDITOR_H

#include <sb2000.h>

/* 编辑器主体的函数在库页 3 */
SB_BANK_CALLS_BEGIN(3)

/**
 * 运行编辑器，直到用户退出。
 * @param initial_path 启动时要打开的文件名，必须在常驻区；空串表示不打开文件。文件不存在时作为新文件。
 */
void editor_run(const char *initial_path);

SB_BANK_CALLS_END()

#endif
