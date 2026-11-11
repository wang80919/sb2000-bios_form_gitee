/*
 * ------------------------------------------------------------------------
 * 名称：main.c
 * 说明：汇编器程序入口。
 * 作者：sungbin
 * 邮箱：sungbin@3578.cn
 * 日期：2026-11-11
 * 备注：无
 * ------------------------------------------------------------------------
 */
#include <sb2000.h>
#include "assembler.h"
#include "messages.h"

/**
 * 启动 SB-DOS 汇编器。
 * @return 返回 DOS 时为 0。
 */
int main(void)
{
    asm_run();
    sb_puts(MSG_PRESS_KEY);
    sb_getkey();
    return 0;
}