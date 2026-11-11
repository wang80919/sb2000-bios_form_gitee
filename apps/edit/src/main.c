/*
 * ------------------------------------------------------------------------
 * 名称：main.c
 * 说明：编辑器程序入口：取命令行里的第一个词作为要打开的文件，交给编辑器运行。
 * 作者：sungbin
 * 邮箱：sungbin@3578.cn
 * 日期：2026-11-11
 * 备注：命令行形式为 EDIT [文件名]；DOS 已把命令行转成大写，放在 SB_CMD_TAIL，第 1 个字节是分隔用的空格。
 * ------------------------------------------------------------------------
 */
#include <sb2000.h>
#include "editor.h"

/* 文件名的最大长度，DOS 路径最长 28 个字符 */
#define PATH_LIMIT 28

/* 要打开的文件名；没有给文件名时是空串 */
static char initial_path[PATH_LIMIT + 1];

/*
 * 布局垫片：换页蹦床里有一条 jmp (target)，间接跳转的地址不能落在页尾，否则链接报“jmp (abs) across page border”；
 * 链接器不保证 BSS 段的起始地址为偶数，常驻部分的代码长度变了以后遇到这个报错，
 * 就把它的大小在 1 与 2 之间换一下，挺动 target 的位置（看链接映射里 BSS 的起始地址是否为偶数）。
 */
static unsigned char layout_padding[2] = { 1, 1 };

/* 取命令行里的第一个词，跳过前面的空格 */
static void read_initial_path(void)
{
    const char *tail = (const char *)SB_CMD_TAIL;
    unsigned char length = 0;

    while (*tail == ' ') {
        ++tail;
    }
    while (*tail != 0 && *tail != ' ' && length < PATH_LIMIT) {
        initial_path[length] = *tail;
        ++length;
        ++tail;
    }
    initial_path[length] = 0;
}

int main(void)
{
    layout_padding[0] = 1;
    read_initial_path();
    editor_run(initial_path);
    return 0;
}
