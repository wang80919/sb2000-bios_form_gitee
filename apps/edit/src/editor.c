/*
 * ------------------------------------------------------------------------
 * 名称：editor.c
 * 说明：文本编辑器主体的实现：光标移动、插入删除、按键分发。屏幕更新交给 view 模块，菜单命令交给 editor-commands 模块。
 * 作者：sungbin
 * 邮箱：sungbin@3578.cn
 * 日期：2026-11-11
 * 备注：光标、屏幕首行都用文档里的字节序号记录，行号与列号随移动增减，只在跳到文档末尾时才统计换行符；
 *       状态变量放在常驻区，供其他库页读写。
 * ------------------------------------------------------------------------
 */
#include <string.h>
#include <sb2000.h>
#include "editor.h"
#include "editor-commands.h"
#include "editor-state.h"
#include "screen.h"
#include "text-buffer.h"
#include "view.h"

/* 按键的 ASCII 码；方向键、功能键的 ASCII 码为 0，用扫描码区分 */
#define ASCII_BACKSPACE 0x08
#define ASCII_TAB 0x09
#define ASCII_ENTER 0x0D
#define ASCII_ESCAPE 0x1B
#define ASCII_CTRL_S 0x13

/* 扫描码 */
#define SCAN_F1 0x3B
#define SCAN_F5 0x3F
#define SCAN_F8 0x42
#define SCAN_UP 0x48
#define SCAN_DOWN 0x50
#define SCAN_LEFT 0x4B
#define SCAN_RIGHT 0x4D
#define SCAN_HOME 0x47
#define SCAN_END 0x4F
#define SCAN_PAGE_UP 0x49
#define SCAN_PAGE_DOWN 0x51
#define SCAN_DELETE 0x53

/* Ctrl+Home、Ctrl+End 的扫描码：键盘服务把带 Ctrl 的功能键换成了另一组码 */
#define SCAN_CTRL_HOME 0x77
#define SCAN_CTRL_END 0x75

/* 输入法处理按键的结果标志：位 7 置位表示按键原样传回（output[0] 是 ASCII 码，output[1] 是扫描码）；否则是 output 里的字节数 */
#define IME_RESULT_PASS_BIT 0x80

/* 输入法状态标志里“已暂停”的位 */
#define IME_FLAG_PAUSED 0x04

/* Tab 键对齐的列数 */
#define TAB_WIDTH 4

/* 界面文字（GB2312）：“内存不足” */
const char editor_text_no_memory[] = "\xC4\xDA\xB4\xE6\xB2\xBB\xD7\xE3";

/* 文档状态：文件名（空串表示未命名）、原来是否用 CR LF 换行、是否有未保存的修改 */
char document_path[PATH_SIZE];
unsigned char uses_crlf;
unsigned char modified;

/* 光标与屏幕位置 */
EditorState editor_state;

/* 输入法处理按键的结果；传给系统服务的缓冲放在常驻区 */
static sb_ime_result_t ime_result;

/* 进入菜单、对话框前输入法是否已被用户暂停 */
static unsigned char ime_was_paused;

SB_BANK_BEGIN(3)

/* 读文档里的一个字节；位置必须在文档内 */
static unsigned char byte_at(unsigned long position)
{
    unsigned char value = 0;

    buffer_read(position, &value, 1);
    return value;
}

/* 光标落在汉字中间（第二个字节上）时左移一个字节，对齐到汉字的第一个字节 */
static void align_cursor(void)
{
    if (buffer_han_run(editor_state.cursor) == BUFFER_HAN_ODD && byte_at(editor_state.cursor) >= HAN_BYTE_MINIMUM) {
        --editor_state.cursor;
        --editor_state.cursor_column;
    }
}

/* 光标前一个字符的字节数：汉字 2，其余 1 */
static unsigned char previous_char_size(void)
{
    return buffer_han_run(editor_state.cursor) == BUFFER_HAN_EVEN ? 2 : 1;
}

/* 光标处字符的字节数：汉字 2，其余 1 */
static unsigned char current_char_size(void)
{
    unsigned char pair[2];

    if (buffer_read(editor_state.cursor, pair, 2) == 2 && pair[0] >= HAN_BYTE_MINIMUM && pair[1] >= HAN_BYTE_MINIMUM
        && buffer_han_run(editor_state.cursor) != BUFFER_HAN_ODD) {
        return 2;
    }
    return 1;
}

void editor_reset_position(void)
{
    editor_state.cursor = 0;
    editor_state.cursor_line = 1;
    editor_state.cursor_column = 0;
    editor_state.wanted_column = 0;
    editor_state.top = 0;
    editor_state.top_line = 1;
    editor_state.scroll_column = 0;
}

/* 光标左移一个字节，越过换行符时回到上一行末尾 */
static void move_left_byte(void)
{
    if (editor_state.cursor == 0) {
        return;
    }
    --editor_state.cursor;
    if (byte_at(editor_state.cursor) == '\n') {
        --editor_state.cursor_line;
        editor_state.cursor_column = (unsigned int)(editor_state.cursor - buffer_find_line_start(editor_state.cursor));
    } else {
        --editor_state.cursor_column;
    }
    editor_state.wanted_column = editor_state.cursor_column;
}

/* 光标右移一个字节，越过换行符时到下一行行首 */
static void move_right_byte(void)
{
    if (editor_state.cursor >= buffer_length()) {
        return;
    }
    if (byte_at(editor_state.cursor) == '\n') {
        ++editor_state.cursor_line;
        editor_state.cursor_column = 0;
    } else {
        ++editor_state.cursor_column;
    }
    ++editor_state.cursor;
    editor_state.wanted_column = editor_state.cursor_column;
}

/* 光标上移一行，列尽量保持在 wanted_column，上一行较短时停在行尾 */
static void move_up(void)
{
    unsigned long line_start;
    unsigned long previous_start;
    unsigned long length;

    if (editor_state.cursor_line == 1) {
        return;
    }
    line_start = editor_state.cursor - editor_state.cursor_column;
    previous_start = buffer_find_line_start(line_start - 1);
    length = line_start - 1 - previous_start;
    editor_state.cursor_column = editor_state.wanted_column < length ? editor_state.wanted_column : (unsigned int)length;
    editor_state.cursor = previous_start + editor_state.cursor_column;
    --editor_state.cursor_line;
    align_cursor();
}

/* 光标下移一行，规则同 move_up；已在最后一行时不动 */
static void move_down(void)
{
    unsigned long line_end = buffer_find_line_end(editor_state.cursor);
    unsigned long next_start;
    unsigned long length;

    if (line_end >= buffer_length()) {
        return;
    }
    next_start = line_end + 1;
    length = buffer_find_line_end(next_start) - next_start;
    editor_state.cursor_column = editor_state.wanted_column < length ? editor_state.wanted_column : (unsigned int)length;
    editor_state.cursor = next_start + editor_state.cursor_column;
    ++editor_state.cursor_line;
    align_cursor();
}

/* 光标移到行首 */
static void move_home(void)
{
    editor_state.cursor -= editor_state.cursor_column;
    editor_state.cursor_column = 0;
    editor_state.wanted_column = 0;
}

/* 光标移到行尾（换行符之前） */
static void move_end(void)
{
    unsigned long line_end = buffer_find_line_end(editor_state.cursor);

    editor_state.cursor_column += (unsigned int)(line_end - editor_state.cursor);
    editor_state.cursor = line_end;
    editor_state.wanted_column = editor_state.cursor_column;
}

/* 光标移到文档开头 */
static void move_document_start(void)
{
    editor_state.cursor = 0;
    editor_state.cursor_line = 1;
    editor_state.cursor_column = 0;
    editor_state.wanted_column = 0;
}

/* 光标移到文档末尾；要统计换行符才能得到行号 */
static void move_document_end(void)
{
    editor_state.cursor = buffer_length();
    editor_state.cursor_line = buffer_count_lines(editor_state.cursor) + 1;
    editor_state.cursor_column = (unsigned int)(editor_state.cursor - buffer_find_line_start(editor_state.cursor));
    editor_state.wanted_column = editor_state.cursor_column;
}

/* 在光标处插入一个字节；内存不足时给出提示 */
static void insert_byte(unsigned char value)
{
    if (buffer_insert(editor_state.cursor, value) != BUFFER_OK) {
        view_set_message(editor_text_no_memory);
        return;
    }
    ++editor_state.cursor;
    modified = 1;
    if (value == '\n') {
        ++editor_state.cursor_line;
        editor_state.cursor_column = 0;
    } else {
        ++editor_state.cursor_column;
    }
    editor_state.wanted_column = editor_state.cursor_column;
}

/* Tab 键：插入空格，补到下一个 TAB_WIDTH 的整数列 */
static void insert_tab(void)
{
    unsigned char count = (unsigned char)(TAB_WIDTH - editor_state.cursor_column % TAB_WIDTH);

    while (count != 0) {
        insert_byte(' ');
        --count;
    }
}

/* 退格：删除光标前一个字节；删掉换行符时上下两行合并 */
static void delete_before_byte(void)
{
    unsigned char value;

    if (editor_state.cursor == 0) {
        return;
    }
    --editor_state.cursor;
    value = byte_at(editor_state.cursor);
    buffer_delete(editor_state.cursor);
    modified = 1;
    if (value == '\n') {
        --editor_state.cursor_line;
        editor_state.cursor_column = (unsigned int)(editor_state.cursor - buffer_find_line_start(editor_state.cursor));
    } else {
        --editor_state.cursor_column;
    }
    editor_state.wanted_column = editor_state.cursor_column;
}

/* Delete 键：删除光标处的字节；删掉换行符时下一行并进这一行 */
static void delete_at_byte(void)
{
    if (editor_state.cursor >= buffer_length()) {
        return;
    }
    buffer_delete(editor_state.cursor);
    modified = 1;
}

/* 光标左移一个字符：汉字一次越过两个字节 */
static void move_left(void)
{
    unsigned char count = previous_char_size();

    while (count != 0) {
        move_left_byte();
        --count;
    }
}

/* 光标右移一个字符：汉字一次越过两个字节 */
static void move_right(void)
{
    unsigned char count = current_char_size();

    while (count != 0) {
        move_right_byte();
        --count;
    }
}

/* 退格：删除光标前一个字符，汉字删两个字节 */
static void delete_before(void)
{
    unsigned char count = previous_char_size();

    while (count != 0) {
        delete_before_byte();
        --count;
    }
}

/* Delete 键：删除光标处的字符，汉字删两个字节 */
static void delete_at(void)
{
    unsigned char count = current_char_size();

    while (count != 0) {
        delete_at_byte();
        --count;
    }
}

/* 把输入法得到的一串字节依次插入光标处 */
static void insert_text(const unsigned char *text, unsigned char count)
{
    unsigned char index;

    for (index = 0; index < count && index < sizeof(ime_result.output); ++index) {
        insert_byte(text[index]);
    }
}

/* 菜单、对话框和汇编器直接读键盘，运行前暂停输入法，结束后恢复；用户自己暂停的不替他恢复 */
static void ime_pause(void)
{
    unsigned char allow;
    unsigned char flags;

    sb_ime_get_state(&allow, &flags);
    ime_was_paused = (flags & IME_FLAG_PAUSED) != 0;
    sb_ime_suspend();
}

static void ime_resume(void)
{
    if (!ime_was_paused) {
        sb_ime_resume();
    }
}

/* 在暂停输入法的状态下执行菜单命令；返回 1 表示要退出编辑器 */
static unsigned char run_action(unsigned char action)
{
    unsigned char leave;

    ime_pause();
    leave = command_action(action);
    ime_resume();
    return leave;
}

/* 在暂停输入法的状态下打开 F1 菜单；返回 1 表示要退出编辑器 */
static unsigned char run_menu(void)
{
    unsigned char leave;

    ime_pause();
    leave = command_menu();
    ime_resume();
    return leave;
}

/* 处理方向键、功能键等不产生字符的按键；返回 1 表示要退出编辑器 */
static unsigned char handle_function_key(unsigned char scan)
{
    unsigned char step;

    switch (scan) {
    case SCAN_F1:
        return run_menu();
    case SCAN_F5:
        return run_action(MENU_ASSEMBLE);
    case SCAN_F8:
        return run_action(MENU_ABOUT);
    case SCAN_UP:
        move_up();
        break;
    case SCAN_DOWN:
        move_down();
        break;
    case SCAN_LEFT:
        move_left();
        break;
    case SCAN_RIGHT:
        move_right();
        break;
    case SCAN_HOME:
        move_home();
        break;
    case SCAN_END:
        move_end();
        break;
    case SCAN_CTRL_HOME:
        move_document_start();
        break;
    case SCAN_CTRL_END:
        move_document_end();
        break;
    case SCAN_PAGE_UP:
        for (step = 1; step < SCREEN_EDITOR_LINES; ++step) {
            move_up();
        }
        break;
    case SCAN_PAGE_DOWN:
        for (step = 1; step < SCREEN_EDITOR_LINES; ++step) {
            move_down();
        }
        break;
    case SCAN_DELETE:
        delete_at();
        break;
    default:
        break;
    }
    return 0;
}

void editor_run(const char *initial_path)
{
    unsigned char flag;
    unsigned char ascii;
    unsigned char leave = 0;

    screen_init();
    screen_draw_hint();
    view_invalidate();
    if (buffer_reset() != BUFFER_OK) {
        screen_popup_open(1);
        screen_draw_popup(0, editor_text_no_memory, SCREEN_TEXT_COLUMNS, 0);
        sb_key_wait();
        screen_clear_all();
        return;
    }
    document_path[0] = 0;
    uses_crlf = 1;
    modified = 0;
    view_clear_message();
    editor_reset_position();
    if (initial_path[0] != 0) {
        command_open_path(initial_path);
    }
    while (!leave) {
        view_refresh();
        flag = sb_ime_key_wait(&ime_result);
        view_clear_message();
        if ((flag & IME_RESULT_PASS_BIT) == 0) {
            insert_text(ime_result.output, flag);
        } else {
            ascii = ime_result.output[0];
            if (ascii >= 0x20 && ascii < 0x7F) {
                insert_byte(ascii);
            } else if (ascii == ASCII_ENTER) {
                insert_byte('\n');
            } else if (ascii == ASCII_BACKSPACE) {
                delete_before();
            } else if (ascii == ASCII_TAB) {
                insert_tab();
            } else if (ascii == ASCII_CTRL_S) {
                run_action(MENU_SAVE);
            } else if (ascii == ASCII_ESCAPE) {
                leave = run_action(MENU_EXIT);
            } else if (ascii == 0) {
                leave = handle_function_key(ime_result.output[1]);
            }
        }
        view_scroll_to_cursor();
    }
    buffer_release();
    screen_clear_all();
}

SB_BANK_END()
