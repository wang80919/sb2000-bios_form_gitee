/*
 * ------------------------------------------------------------------------
 * 名称：editor-commands.h
 * 说明：F1 菜单与菜单命令：打开文件、保存文件、汇编、关于、退出，以及对话框。
 * 作者：sungbin
 * 邮箱：sungbin@3578.cn
 * 日期：2026-11-11
 * 备注：无
 * ------------------------------------------------------------------------
 */
#ifndef EDIT_EDITOR_COMMANDS_H
#define EDIT_EDITOR_COMMANDS_H

#include <sb2000.h>

/* 菜单项的序号，也是菜单命令的编号；MENU_NONE 表示没有选择 */
#define MENU_OPEN 0
#define MENU_SAVE 1
#define MENU_ASSEMBLE 2
#define MENU_ABOUT 3
#define MENU_EXIT 4
#define MENU_COUNT 5
#define MENU_NONE 0xFF

/* 菜单命令的函数都在库页 4 */
SB_BANK_CALLS_BEGIN(4)

/**
 * 弹出 F1 文件菜单让用户选择并执行：第一行显示文件名与保存状态；上下键移动，回车或数字键 1 到 5 选择，F5、F8 直接选中汇编与关于，Esc 或 F1 关闭。
 * @return 1 表示用户确认要退出编辑器，否则返回 0。
 */
unsigned char command_menu(void);

/**
 * 直接执行一个菜单命令（快捷键用）。
 * @param action 菜单项序号。
 * @return 1 表示用户确认要退出编辑器，否则返回 0。
 */
unsigned char command_action(unsigned char action);

/**
 * 启动时打开命令行里给出的文件；文件不存在时当作新文件。
 * @param path 文件名，必须在常驻区。
 */
void command_open_path(const char *path);

SB_BANK_CALLS_END()

#endif
