/*
 * ------------------------------------------------------------------------
 * 名称：view.h
 * 说明：编辑区的视图：按光标与屏幕首行算出每一行该显示什么，与屏幕上已有的内容比较，只重画变化的部分。
 * 作者：sungbin
 * 邮箱：sungbin@3578.cn
 * 日期：2026-11-11
 * 备注：视图记着屏幕上每一行当前显示的文字；只要屏幕被别的程序或对话框弄乱而没有恢复，就必须先调用 view_invalidate。
 * ------------------------------------------------------------------------
 */
#ifndef EDIT_VIEW_H
#define EDIT_VIEW_H

#include <sb2000.h>

/* 视图的函数都在库页 5 */
SB_BANK_CALLS_BEGIN(5)

/** 声明屏幕内容已经未知：下一次刷新把编辑区、光标、状态区全部重画。 */
void view_invalidate(void);

/**
 * 让光标回到屏幕里：光标在首行之上就把它放在首行，在末行之下就把它放在末行；列超出水平滚动范围时调整滚动。
 * 只改屏幕首行与水平滚动的位置，不画。
 */
void view_scroll_to_cursor(void);

/** 按当前的文档、光标与屏幕位置更新屏幕：编辑区、光标、菜单栏右侧的状态区；只重画与屏幕上已有内容不同的部分。 */
void view_refresh(void);

/**
 * 在状态区显示一条提示，直到调用 view_clear_message。
 * @param text 提示文字，必须在常驻区；超过 31 个字符的部分被截掉，状态区只显示前 SCREEN_STATUS_COLUMNS 个字符。
 */
void view_set_message(const char *text);

/** 清除状态区的提示，恢复显示光标位置。 */
void view_clear_message(void);

SB_BANK_CALLS_END()

#endif
