/*
 * ------------------------------------------------------------------------
 * 名称：screen.h
 * 说明：编辑器的屏幕版面与绘制：上方白底黑字的一行菜单栏，紧接着是蓝底白字的编辑区，最下面两行留给 DOS 状态栏。
 * 作者：sungbin
 * 邮箱：sungbin@3578.cn
 * 日期：2026-11-11
 * 备注：文字是 8x16 的字模，每行文字占上下两行单元；文字的列号取 1 到 31，第 0 列留空。
 *       画文字很慢（每个字符约 1/3 帧到 1/2 帧），所以只画变化的部分：整行可以从指定的列开始画，
 *       行与行之间可以整体上下移动，只重画新出现的行。
 * ------------------------------------------------------------------------
 */
#ifndef EDIT_SCREEN_H
#define EDIT_SCREEN_H

#include <sb2000.h>

/* 每行最多显示的字符数（第 1 到 31 列） */
#define SCREEN_TEXT_COLUMNS 31

/* 菜单栏右侧状态区的列数：显示“行号:列号”或一次性提示 */
#define SCREEN_STATUS_COLUMNS 9

/* 编辑区的文字行数，每行占两个单元行，从单元行 2 起，正好排到单元行 27 */
#define SCREEN_EDITOR_LINES 13

/* 弹出菜单与对话框最多可用的文字行数 */
#define SCREEN_POPUP_LINES 6

/* 本模块的函数都在库页 2，调用时自动换页；传进来的文字必须在常驻区或全局缓冲里，不能指向别的库页 */
SB_BANK_CALLS_BEGIN(2)

/** 初始化窗口管理，写入调色板，把菜单栏与编辑区铺好底色；运行其他程序弄乱屏幕之后也用它重建。 */
void screen_init(void);

/** 画菜单栏左侧的快捷键提示：F1 文件、F5 汇编、F8 关于。 */
void screen_draw_hint(void);

/**
 * 画菜单栏右侧的状态区（光标位置或一次性提示）。
 * @param text 文字，不超过 SCREEN_STATUS_COLUMNS 个字符；末尾的空格不画。
 * @param from 只画从这一列（0 起的字符序号）开始的部分，前面的内容保持不变。
 * @param previous_length 画之前状态区显示的字符数（已去掉末尾空格）；文字变短时据此擦掉多出的部分。
 */
void screen_draw_status(const char *text, unsigned char from, unsigned char previous_length);

/**
 * 画编辑区的一行文字。
 * @param line 编辑区文字行号，0 到 SCREEN_EDITOR_LINES - 1。
 * @param text 可含 GB2312 汉字（两个不小于 0xA1 的相邻字节，占两列）；末尾的空格不画。
 * @param from 只画从这一列（0 起的字符序号）开始的部分；这一行没有画过或刚被移动过时必须传 0。
 * @param previous_length 画之前这一行显示的字符数（已去掉末尾空格），传 SCREEN_TEXT_COLUMNS 表示不知道，整行擦干净。
 */
void screen_draw_line(unsigned char line, const char *text, unsigned char from, unsigned char previous_length);

/**
 * 把编辑区里从 first 行到最后一行整体下移一行，最后一行被挤掉；first 行显示的内容与原来相同，调用者要接着重画它。
 * @param first 移动的第一行。
 */
void screen_shift_lines_down(unsigned char first);

/**
 * 把编辑区里从 first + 1 行到最后一行整体上移一行，覆盖 first 行；最后一行显示的内容与原来相同，调用者要接着重画它。
 * @param first 被覆盖的行。
 */
void screen_shift_lines_up(unsigned char first);

/** 恢复 DOS 控制台的单元映射并清空文字区，供运行其他程序前、返回 DOS 前使用。 */
void screen_clear_all(void);

/**
 * 显示或取消光标：光标是白底黑字的反白格。
 * @param line 编辑区文字行号。
 * @param column 列号，1 到 31。
 * @param on_text 非 0 表示这一格上画着字符（包括空格），0 表示是空白格。
 * @param visible 非 0 显示光标，0 恢复成普通样式。
 */
void screen_set_cursor(unsigned char line, unsigned char column, unsigned char on_text, unsigned char visible);

/**
 * 打开弹出区：保存编辑区上方若干行的单元，之后可以在上面画菜单或对话框，关闭时原样恢复。
 * @param lines 弹出区的文字行数，1 到 SCREEN_POPUP_LINES。
 */
void screen_popup_open(unsigned char lines);

/**
 * 画弹出区里的一行，左边从第 1 列开始，白底黑字；选中时反白显示。
 * @param index 弹出区的文字行号，0 到 SCREEN_POPUP_LINES - 1。
 * @param text 文字，可含 GB2312 汉字；不足 width 的部分补空格。
 * @param width 这一行占用的列数，不超过 31。
 * @param selected 非 0 时反白。
 */
void screen_draw_popup(unsigned char index, const char *text, unsigned char width, unsigned char selected);

/** 关闭弹出区，恢复被它盖住的内容；没有打开的弹出区时什么都不做。 */
void screen_popup_close(void);

SB_BANK_CALLS_END()

#endif
