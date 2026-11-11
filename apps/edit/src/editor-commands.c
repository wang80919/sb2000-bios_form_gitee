/*
 * ------------------------------------------------------------------------
 * 名称：editor-commands.c
 * 说明：F1 菜单、对话框与菜单命令的实现。
 * 作者：sungbin
 * 邮箱：sungbin@3578.cn
 * 日期：2026-11-11
 * 备注：界面文字是 GB2312 字节串，每个字节占一列；传给 screen 模块的文字都定义在库页之外（常驻区），
 *       因为屏幕模块在另一个库页里运行，看不到本库页的数据。
 * ------------------------------------------------------------------------
 */
#include <string.h>
#include <sb2000.h>
#include "editor-commands.h"
#include "editor-state.h"
#include "file-io.h"
#include "screen.h"
#include "text-buffer.h"
#include "view.h"

/* 按键的 ASCII 码与扫描码 */
#define ASCII_BACKSPACE 0x08
#define ASCII_ENTER 0x0D
#define ASCII_ESCAPE 0x1B
#define SCAN_F1 0x3B
#define SCAN_F5 0x3F
#define SCAN_F8 0x42
#define SCAN_UP 0x48
#define SCAN_DOWN 0x50

/* 菜单第一行的文件名最多显示的字符数：31 列减去靠右的保存状态 6 列与中间 1 列空隙 */
#define MENU_NAME_LIMIT 24
#define MENU_STATE_SIZE 6

/* 文件名输入的最大长度：“文件名：”占 8 列，加输入和光标 1 列正好 31 列 */
#define INPUT_LIMIT 22

/* 界面文字（GB2312）：菜单项，汇编、关于、退出后面写的是快捷键，靠右对齐到 31 列 */
static const char text_menu_open[] = "\xB4\xF2\xBF\xAA\xCE\xC4\xBC\xFE";
static const char text_menu_save[] = "\xB1\xA3\xB4\xE6\xCE\xC4\xBC\xFE";
static const char text_menu_assemble[] = "\xBB\xE3\xB1\xE0" "                         F5";
static const char text_menu_about[] = "\xB9\xD8\xD3\xDA" "                         F8";
static const char text_menu_exit[] = "\xCD\xCB\xB3\xF6" "                        Esc";

/* 界面文字：“未命名”、保存状态“未保存” */
static const char text_untitled[] = "\xCE\xB4\xC3\xFC\xC3\xFB";
static const char text_state_unsaved[] = "\xCE\xB4\xB1\xA3\xB4\xE6";

/* 界面文字：“另存为”标题、“文件名：”、放弃修改的询问（含 (Y/N)） */
static const char text_title_save_as[] = "\xC1\xED\xB4\xE6\xCE\xAA";
static const char text_prompt_name[] = "\xCE\xC4\xBC\xFE\xC3\xFB\xA3\xBA";
static const char text_confirm_discard[] = "\xD2\xD1\xD0\xDE\xB8\xC4\xA3\xAC\xB7\xC5\xC6\xFA\xC2\xF0\xA3\xBF" "(Y/N)";

/* 界面文字：操作结果与出错提示、“任意键继续” */
static const char text_saved[] = "\xD2\xD1\xB1\xA3\xB4\xE6";
static const char text_open_failed[] = "\xCE\xDE\xB7\xA8\xB4\xF2\xBF\xAA\xCE\xC4\xBC\xFE";
static const char text_read_failed[] = "\xB6\xC1\xC8\xA1\xCE\xC4\xBC\xFE\xB3\xF6\xB4\xED";
static const char text_save_failed[] = "\xB1\xA3\xB4\xE6\xCE\xC4\xBC\xFE\xB3\xF6\xB4\xED";
static const char text_no_assembler[] = "\xD5\xD2\xB2\xBB\xB5\xBD" " ASM.EXE";
static const char text_key_hint[] = "\xC8\xCE\xD2\xE2\xBC\xFC\xBC\xCC\xD0\xF8";

/* 界面文字：汇编前加载汇编器时显示的“加载汇编器...” */
static const char text_loading_assembler[] = "\xBC\xD3\xD4\xD8\xBB\xE3\xB1\xE0\xC6\xF7...";

/* 界面文字：关于对话框的四行 */
static const char text_about_title[] = "SB-DOS " "\xCE\xC4\xB1\xBE\xB1\xE0\xBC\xAD\xC6\xF7" " V1.0";
static const char text_about_memory[] = "\xB4\xF3\xCE\xC4\xBC\xFE\xB7\xD6\xD2\xB3\xB4\xE6\xB7\xC5\xD4\xDA\xC0\xA9\xD5\xB9" "RAM";
static const char text_about_assemble[] = "F5 " "\xB1\xA3\xB4\xE6\xB2\xA2\xB5\xF7\xD3\xC3" " ASM " "\xBB\xE3\xB1\xE0";
static const char text_about_close[] = "\xB0\xB4\xC8\xCE\xD2\xE2\xBC\xFC\xB7\xB5\xBB\xD8";

/* 汇编器程序名；运行前把要汇编的文件名放进命令行 */
static const char assembler_path[] = "ASM.EXE";

/* 菜单项文字表，下标就是菜单项序号 */
static const char *const menu_texts[MENU_COUNT] = {
    text_menu_open, text_menu_save, text_menu_assemble, text_menu_about, text_menu_exit
};

/* 输入文件名时的路径缓冲与带提示的显示缓冲；都要在常驻区，才能传给系统服务与 screen 模块 */
static char input_path[PATH_SIZE];
static char input_shown[SCREEN_TEXT_COLUMNS + 1];

/* F1 菜单第一行的显示缓冲 */
static char menu_head[SCREEN_TEXT_COLUMNS + 1];

SB_BANK_BEGIN(4)

/* 画 F1 菜单第一行：左边是文件名（没有名字时显示“未命名”），靠右是保存状态 */
static void draw_menu_head(void)
{
    const char *name = document_path[0] != 0 ? document_path : text_untitled;
    unsigned char name_length = (unsigned char)strlen(name);

    if (name_length > MENU_NAME_LIMIT) {
        name_length = MENU_NAME_LIMIT;
    }
    memset(menu_head, ' ', SCREEN_TEXT_COLUMNS);
    menu_head[SCREEN_TEXT_COLUMNS] = 0;
    memcpy(menu_head, name, name_length);
    memcpy(menu_head + SCREEN_TEXT_COLUMNS - MENU_STATE_SIZE, modified ? text_state_unsaved : text_saved, MENU_STATE_SIZE);
    screen_draw_popup(0, menu_head, SCREEN_TEXT_COLUMNS, 0);
}

/* 在弹出区画两行并等待任意键，用于提示信息 */
static void show_message(const char *first, const char *second)
{
    screen_draw_popup(0, first, SCREEN_TEXT_COLUMNS, 0);
    screen_draw_popup(1, second, SCREEN_TEXT_COLUMNS, 0);
    sb_key_wait();
}

/* 询问是否放弃未保存的修改；按 Y 返回 1，其他键返回 0 */
static unsigned char confirm_discard(void)
{
    unsigned char answer;

    screen_draw_popup(0, text_confirm_discard, SCREEN_TEXT_COLUMNS, 0);
    answer = (unsigned char)sb_key_wait();
    return answer == 'Y' || answer == 'y';
}

/* 判断字符能否出现在文件名或路径里 */
static unsigned char is_path_character(unsigned char value)
{
    return (value >= '0' && value <= '9') || (value >= 'A' && value <= 'Z') || value == '.' || value == '_' ||
        value == '-' || value == '\\' || value == ':' || value == '$' || value == '~' || value == '!' ||
        value == '#' || value == '%' || value == '&' || value == '(' || value == ')' || value == '@';
}

/* 在弹出区询问文件名，结果放在 input_path：第一行是标题，第二行是“文件名：”加输入；回车确认返回 1，Esc 取消返回 0 */
static unsigned char ask_path(const char *title)
{
    unsigned char length = (unsigned char)strlen(input_path);
    unsigned char ascii;

    screen_draw_popup(0, title, SCREEN_TEXT_COLUMNS, 0);
    for (;;) {
        strcpy(input_shown, text_prompt_name);
        strcat(input_shown, input_path);
        strcat(input_shown, "_");
        screen_draw_popup(1, input_shown, SCREEN_TEXT_COLUMNS, 0);
        ascii = (unsigned char)sb_key_wait();
        if (ascii == ASCII_ENTER && length != 0) {
            return 1;
        }
        if (ascii == ASCII_ESCAPE) {
            return 0;
        }
        if (ascii == ASCII_BACKSPACE && length != 0) {
            --length;
            input_path[length] = 0;
            continue;
        }
        if (ascii >= 'a' && ascii <= 'z') {
            ascii = (unsigned char)(ascii - 'a' + 'A');
        }
        if (is_path_character(ascii) && length < INPUT_LIMIT) {
            input_path[length] = (char)ascii;
            ++length;
            input_path[length] = 0;
        }
    }
}

/* 装入文件到文本缓冲：文件不存在时当作新文件；装入失败时给出提示，保持原来的文档 */
static void load_document(const char *path)
{
    unsigned char result = file_load(path, &uses_crlf);

    if (result == SB_ERR_FILE_NOT_FOUND) {
        if (buffer_reset() != BUFFER_OK) {
            show_message(editor_text_no_memory, text_key_hint);
            return;
        }
        uses_crlf = 1;
    } else if (result == FILE_IO_NO_MEMORY) {
        show_message(editor_text_no_memory, text_key_hint);
        return;
    } else if (result != FILE_IO_OK) {
        show_message(result == SB_ERR_BAD_NAME ? text_open_failed : text_read_failed, text_key_hint);
        return;
    }
    strcpy(document_path, path);
    modified = 0;
    editor_reset_position();
}

/* 保存文件：没有文件名时先询问；成功返回 1 */
static unsigned char save_document(void)
{
    unsigned char result;

    if (document_path[0] == 0) {
        input_path[0] = 0;
        if (!ask_path(text_title_save_as)) {
            return 0;
        }
        strcpy(document_path, input_path);
    }
    result = file_save(document_path, uses_crlf);
    if (result != FILE_IO_OK) {
        show_message(result == FILE_IO_NO_MEMORY ? editor_text_no_memory : text_save_failed, text_key_hint);
        return 0;
    }
    modified = 0;
    return 1;
}

/* 菜单“打开文件”：询问文件名并装入 */
static void open_document(void)
{
    if (modified && !confirm_discard()) {
        return;
    }
    input_path[0] = 0;
    if (ask_path(text_menu_open)) {
        load_document(input_path);
    }
}

/* 文字输出库要求程序的起始页号是 4 的倍数：先试分配一页看下一个空闲页在哪，不齐就把到下一个 4 的倍数之前的页占住，返回占住的页数（由调用者在子程序结束后释放） */
static unsigned char reserve_alignment_pages(unsigned char *first_page)
{
    unsigned char page;
    unsigned char count;

    if (sb_page_alloc(1, &page) != 0) {
        return 0;
    }
    sb_page_free(page, 1);
    count = (unsigned char)((4 - (page & 3)) & 3);
    if (count == 0 || sb_page_alloc(count, first_page) != 0) {
        return 0;
    }
    return count;
}

/* 菜单“汇编”：先保存，清空文字区，显示“加载汇编器...”，把文件名放进命令行（第 1 个字节是空格）运行汇编器，返回后重画整个界面 */
static void assemble_document(void)
{
    unsigned char result;
    unsigned char pad_page = 0;
    unsigned char pad_count;

    if ((document_path[0] == 0 || modified) && !save_document()) {
        return;
    }
    SB_BYTE_AT(SB_CMD_TAIL) = ' ';
    strcpy((char *)(SB_CMD_TAIL + 1), document_path);
    screen_clear_all();
    SB_BYTE_AT(SB_CURSOR_ROW) = 0;
    sb_cursor_set_column(1);
    sb_puts(text_loading_assembler);
    pad_count = reserve_alignment_pages(&pad_page);
    result = sb_exec(assembler_path);
    if (pad_count != 0) {
        sb_page_free(pad_page, pad_count);
    }
    sb_key_flush();
    screen_init();
    screen_draw_hint();
    view_invalidate();
    if (result != 0) {
        show_message(text_no_assembler, text_key_hint);
    }
}

/* 菜单“关于”：四行说明，按任意键返回 */
static void show_about(void)
{
    screen_draw_popup(0, text_about_title, SCREEN_TEXT_COLUMNS, 0);
    screen_draw_popup(1, text_about_memory, SCREEN_TEXT_COLUMNS, 0);
    screen_draw_popup(2, text_about_assemble, SCREEN_TEXT_COLUMNS, 0);
    screen_draw_popup(3, text_about_close, SCREEN_TEXT_COLUMNS, 0);
    sb_key_wait();
}

/* 弹出区里画出 F1 菜单：第一行是文件名与保存状态，其下是菜单项；上下键移动，回车或数字键 1 到 5 选择，F5、F8 直接选中汇编与关于，Esc 或 F1 关闭；返回选中的菜单项序号，没有选择时返回 MENU_NONE */
static unsigned char choose_menu_item(void)
{
    unsigned char selected = 0;
    unsigned char previous;
    unsigned char index;
    unsigned int key;
    unsigned char ascii;
    unsigned char scan;

    draw_menu_head();
    for (index = 0; index < MENU_COUNT; ++index) {
        screen_draw_popup(index + 1, menu_texts[index], SCREEN_TEXT_COLUMNS, index == selected);
    }
    for (;;) {
        key = sb_key_wait();
        ascii = (unsigned char)key;
        scan = (unsigned char)(key >> 8);
        previous = selected;
        if (ascii == ASCII_ENTER) {
            return selected;
        }
        if (ascii == ASCII_ESCAPE || (ascii == 0 && scan == SCAN_F1)) {
            return MENU_NONE;
        }
        if (ascii >= '1' && ascii < '1' + MENU_COUNT) {
            return (unsigned char)(ascii - '1');
        }
        if (ascii == 0 && scan == SCAN_F5) {
            return MENU_ASSEMBLE;
        }
        if (ascii == 0 && scan == SCAN_F8) {
            return MENU_ABOUT;
        }
        if (ascii == 0 && scan == SCAN_UP) {
            selected = selected == 0 ? MENU_COUNT - 1 : selected - 1;
        } else if (ascii == 0 && scan == SCAN_DOWN) {
            selected = selected == MENU_COUNT - 1 ? 0 : selected + 1;
        }
        if (selected != previous) {
            screen_draw_popup(previous + 1, menu_texts[previous], SCREEN_TEXT_COLUMNS, 0);
            screen_draw_popup(selected + 1, menu_texts[selected], SCREEN_TEXT_COLUMNS, 1);
        }
    }
}

/* 执行一个菜单命令；返回 1 表示用户确认要退出编辑器 */
static unsigned char execute_action(unsigned char action)
{
    unsigned char leave = 0;

    if (action == MENU_OPEN) {
        open_document();
    } else if (action == MENU_SAVE) {
        save_document();
    } else if (action == MENU_ASSEMBLE) {
        assemble_document();
    } else if (action == MENU_ABOUT) {
        show_about();
    } else if (action == MENU_EXIT) {
        leave = !modified || confirm_discard();
    }
    return leave;
}

unsigned char command_menu(void)
{
    unsigned char leave;

    screen_popup_open(SCREEN_POPUP_LINES);
    leave = execute_action(choose_menu_item());
    screen_popup_close();
    return leave;
}

unsigned char command_action(unsigned char action)
{
    unsigned char leave;

    screen_popup_open(SCREEN_POPUP_LINES);
    leave = execute_action(action);
    screen_popup_close();
    return leave;
}

void command_open_path(const char *path)
{
    screen_popup_open(SCREEN_POPUP_LINES);
    load_document(path);
    screen_popup_close();
}

SB_BANK_END()
