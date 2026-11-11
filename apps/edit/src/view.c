/*
 * ------------------------------------------------------------------------
 * 名称：view.c
 * 说明：编辑区视图的实现：算出各行该显示的文字，与屏幕上已有的内容比较，只重画变化的部分。
 * 作者：sungbin
 * 邮箱：sungbin@3578.cn
 * 日期：2026-11-11
 * 备注：每行文字的绘制很慢，所以按下面的顺序尽量少画：
 *       1. 只有一两行不同时，直接重画这些行，并且只从第一个不同的字符画起；
 *       2. 不同的行较多时，看是否是从某一行起整体下移或上移了一行（回车、删除换行、光标滚动），是的话先搬单元，再只画新出现的行；
 *       3. 都不是时才逐行重画。
 *       光标是一个反白格，画之前先取消旧的，所以改动行的内容之前一定先取消光标。
 * ------------------------------------------------------------------------
 */
#include <string.h>
#include <sb2000.h>
#include "editor-state.h"
#include "screen.h"
#include "text-buffer.h"
#include "view.h"

/* 整行重画与局部重画的分界：不同的行不超过这个数时不去检测整体移动 */
#define SHIFT_DETECT_MINIMUM 3

/* 状态区里“行号:列号”最多的字符数：5 位行号、冒号、5 位列号 */
#define POSITION_TEXT_SIZE 11

/* 每一行应该显示的文字，以及屏幕上正显示着的文字；row_valid 为 0 的行屏幕内容不可信，必须整行重画 */
static char wanted_rows[SCREEN_EDITOR_LINES][SCREEN_TEXT_COLUMNS + 1];
static char shown_rows[SCREEN_EDITOR_LINES][SCREEN_TEXT_COLUMNS + 1];
static unsigned char row_valid[SCREEN_EDITOR_LINES];

/* 屏幕上光标的状态：是否已经画着、画在哪一行哪一列、那一格上是否有字符 */
static unsigned char cursor_shown;
static unsigned char shown_cursor_line;
static unsigned char shown_cursor_column;
static unsigned char shown_cursor_on_text;

/* 菜单栏右侧状态区：一次性提示、当前内容、上次画出的内容与它是否可信 */
static char message_text[SCREEN_TEXT_COLUMNS + 1];
static char status_text[SCREEN_STATUS_COLUMNS + 1];
static char last_status_text[SCREEN_STATUS_COLUMNS + 1];
static unsigned char last_status_valid;

/* “行号:列号”的拼接缓冲，放在全局以免占用软件栈 */
static char position_text[POSITION_TEXT_SIZE + 1];

SB_BANK_BEGIN(5)

/* 求文字去掉末尾空格之后的字符数 */
static unsigned char trimmed_length(const char *text)
{
    unsigned char length = (unsigned char)strlen(text);

    while (length > 0 && text[length - 1] == ' ') {
        --length;
    }
    return length;
}

/* 把无符号数写成十进制文字，返回写了几个字符 */
static unsigned char write_number(char *destination, unsigned int value)
{
    char digits[5];
    unsigned char count = 0;
    unsigned char index;

    do {
        digits[count] = (char)('0' + value % 10);
        ++count;
        value /= 10;
    } while (value != 0);
    for (index = 0; index < count; ++index) {
        destination[index] = digits[count - 1 - index];
    }
    return count;
}

/* 整理从 start 起的一行：取出水平滚动之后的部分，GB2312 汉字的两个字节原样保留，其余不可显示的字符（含被截断的半个汉字）换成点，Tab 换成空格，去掉末尾的空格；返回这一行的结尾位置 */
static unsigned long collect_line(unsigned long start, char *destination)
{
    unsigned long end = buffer_find_line_end(start);
    unsigned long length = end - start;
    unsigned int count = 0;
    unsigned int index = 0;
    unsigned char value;

    if (length > editor_state.scroll_column) {
        count = (unsigned int)(length - editor_state.scroll_column);
        if (count > SCREEN_TEXT_COLUMNS) {
            count = SCREEN_TEXT_COLUMNS;
        }
        buffer_read(start + editor_state.scroll_column, (unsigned char *)destination, count);
        if (editor_state.scroll_column > 0 && (unsigned char)destination[0] >= HAN_BYTE_MINIMUM
            && buffer_han_run(start + editor_state.scroll_column) == BUFFER_HAN_ODD) {
            destination[0] = '.';
            index = 1;
        }
    }
    while (index < count) {
        value = (unsigned char)destination[index];
        if (value >= HAN_BYTE_MINIMUM && index + 1 < count && (unsigned char)destination[index + 1] >= HAN_BYTE_MINIMUM) {
            index += 2;
            continue;
        }
        if (value == '\t') {
            value = ' ';
        } else if (value < 0x20 || value > 0x7E) {
            value = '.';
        }
        destination[index] = (char)value;
        ++index;
    }
    while (count > 0 && destination[count - 1] == ' ') {
        --count;
    }
    destination[count] = 0;
    return end;
}

/* 从屏幕首行起逐行取出该显示的文字，文档结束之后的行是空的 */
static void prepare_rows(void)
{
    unsigned long start = editor_state.top;
    unsigned long length = buffer_length();
    unsigned char row;

    for (row = 0; row < SCREEN_EDITOR_LINES; ++row) {
        if (start > length) {
            wanted_rows[row][0] = 0;
        } else {
            start = collect_line(start, wanted_rows[row]) + 1;
        }
    }
}

/* 第 wanted 行该显示的文字是否正好是屏幕第 shown 行已经显示着的 */
static unsigned char rows_match(unsigned char wanted, unsigned char shown)
{
    return row_valid[shown] && strcmp(wanted_rows[wanted], shown_rows[shown]) == 0;
}

/* 取消屏幕上的光标 */
static void hide_cursor(void)
{
    if (cursor_shown) {
        screen_set_cursor(shown_cursor_line, shown_cursor_column, shown_cursor_on_text, 0);
        cursor_shown = 0;
    }
}

/* 重画一行：屏幕内容可信时只从第一个不同的字符画起，不可信时整行重画 */
static void draw_row(unsigned char row)
{
    unsigned char from = 0;
    unsigned char previous_length = SCREEN_TEXT_COLUMNS;

    if (row_valid[row]) {
        while (wanted_rows[row][from] != 0 && wanted_rows[row][from] == shown_rows[row][from]) {
            ++from;
        }
        previous_length = (unsigned char)strlen(shown_rows[row]);
    }
    screen_draw_line(row, wanted_rows[row], from, previous_length);
    strcpy(shown_rows[row], wanted_rows[row]);
    row_valid[row] = 1;
}

/* 从 start 行起整体下移一行是否就能得到该显示的内容：start 之后的每一行都应该等于屏幕上它上面那一行 */
static unsigned char can_shift_down(unsigned char start)
{
    unsigned char row;

    for (row = start + 1; row < SCREEN_EDITOR_LINES; ++row) {
        if (!rows_match(row, row - 1)) {
            return 0;
        }
    }
    return 1;
}

/* 从 start 行起整体上移一行是否就能得到该显示的内容：start 起的每一行都应该等于屏幕上它下面那一行 */
static unsigned char can_shift_up(unsigned char start)
{
    unsigned char row;

    for (row = start; row < SCREEN_EDITOR_LINES - 1; ++row) {
        if (!rows_match(row, row + 1)) {
            return 0;
        }
    }
    return 1;
}

/* 让屏幕编辑区的内容与 wanted_rows 一致 */
static void sync_rows(void)
{
    unsigned char row;
    unsigned char first = SCREEN_EDITOR_LINES;
    unsigned char different = 0;
    unsigned char start;

    for (row = 0; row < SCREEN_EDITOR_LINES; ++row) {
        if (!rows_match(row, row)) {
            if (first == SCREEN_EDITOR_LINES) {
                first = row;
            }
            ++different;
        }
    }
    if (different == 0) {
        return;
    }
    hide_cursor();
    if (different >= SHIFT_DETECT_MINIMUM) {
        for (start = first; start <= first + 1 && start < SCREEN_EDITOR_LINES - 1; ++start) {
            if (can_shift_down(start)) {
                screen_shift_lines_down(start);
                memmove(shown_rows[start + 1], shown_rows[start], (SCREEN_EDITOR_LINES - 1 - start) * (SCREEN_TEXT_COLUMNS + 1));
                memmove(&row_valid[start + 1], &row_valid[start], SCREEN_EDITOR_LINES - 1 - start);
                row_valid[start] = 0;
                break;
            }
            if (can_shift_up(start)) {
                screen_shift_lines_up(start);
                memmove(shown_rows[start], shown_rows[start + 1], (SCREEN_EDITOR_LINES - 1 - start) * (SCREEN_TEXT_COLUMNS + 1));
                memmove(&row_valid[start], &row_valid[start + 1], SCREEN_EDITOR_LINES - 1 - start);
                row_valid[SCREEN_EDITOR_LINES - 1] = 0;
                break;
            }
        }
    }
    for (row = 0; row < SCREEN_EDITOR_LINES; ++row) {
        if (!rows_match(row, row)) {
            draw_row(row);
        }
    }
}

/* 显示光标，位置变了先取消旧的；所在的格子上没有字符时画成空白的反白格 */
static void update_cursor(void)
{
    unsigned char line = (unsigned char)(editor_state.cursor_line - editor_state.top_line);
    unsigned char offset = (unsigned char)(editor_state.cursor_column - editor_state.scroll_column);
    unsigned char on_text = offset < strlen(shown_rows[line]);

    if (cursor_shown && (shown_cursor_line != line || shown_cursor_column != offset + 1 || shown_cursor_on_text != on_text)) {
        hide_cursor();
    }
    if (!cursor_shown) {
        screen_set_cursor(line, offset + 1, on_text, 1);
        cursor_shown = 1;
        shown_cursor_line = line;
        shown_cursor_column = offset + 1;
        shown_cursor_on_text = on_text;
    }
}

/* 重新拼出状态区：有提示时显示提示（超出的部分截掉）；否则靠右显示行号与列号 */
static void build_status(void)
{
    unsigned char position_length = 0;
    unsigned char message_length = (unsigned char)strlen(message_text);

    memset(status_text, ' ', SCREEN_STATUS_COLUMNS);
    status_text[SCREEN_STATUS_COLUMNS] = 0;
    if (message_length != 0) {
        if (message_length > SCREEN_STATUS_COLUMNS) {
            message_length = SCREEN_STATUS_COLUMNS;
        }
        memcpy(status_text, message_text, message_length);
        return;
    }
    position_length += write_number(position_text + position_length, editor_state.cursor_line);
    position_text[position_length++] = ':';
    position_length += write_number(position_text + position_length, editor_state.cursor_column + 1);
    if (position_length > SCREEN_STATUS_COLUMNS) {
        position_length = SCREEN_STATUS_COLUMNS;
    }
    memcpy(status_text + SCREEN_STATUS_COLUMNS - position_length, position_text, position_length);
}

/* 更新状态区：只从第一个变化的字符画起 */
static void update_status(void)
{
    unsigned char from = 0;
    unsigned char previous_length = SCREEN_STATUS_COLUMNS;

    build_status();
    if (last_status_valid) {
        while (status_text[from] != 0 && status_text[from] == last_status_text[from]) {
            ++from;
        }
        previous_length = trimmed_length(last_status_text);
        if (status_text[from] == 0) {
            return;
        }
    }
    screen_draw_status(status_text, from, previous_length);
    memcpy(last_status_text, status_text, sizeof(status_text));
    last_status_valid = 1;
}

void view_invalidate(void)
{
    memset(row_valid, 0, sizeof(row_valid));
    cursor_shown = 0;
    last_status_valid = 0;
}

void view_scroll_to_cursor(void)
{
    unsigned char step;

    if (editor_state.cursor_line < editor_state.top_line) {
        editor_state.top = editor_state.cursor - editor_state.cursor_column;
        editor_state.top_line = editor_state.cursor_line;
    } else if (editor_state.cursor_line >= editor_state.top_line + SCREEN_EDITOR_LINES) {
        editor_state.top = editor_state.cursor - editor_state.cursor_column;
        editor_state.top_line = editor_state.cursor_line;
        for (step = 1; step < SCREEN_EDITOR_LINES && editor_state.top > 0; ++step) {
            editor_state.top = buffer_find_line_start(editor_state.top - 1);
            --editor_state.top_line;
        }
    }
    if (editor_state.cursor_column < editor_state.scroll_column) {
        editor_state.scroll_column = editor_state.cursor_column;
    } else if (editor_state.cursor_column >= editor_state.scroll_column + SCREEN_TEXT_COLUMNS) {
        editor_state.scroll_column = editor_state.cursor_column - SCREEN_TEXT_COLUMNS + 1;
    }
}

void view_refresh(void)
{
    prepare_rows();
    sync_rows();
    update_cursor();
    update_status();
}

void view_set_message(const char *text)
{
    strncpy(message_text, text, SCREEN_TEXT_COLUMNS);
    message_text[SCREEN_TEXT_COLUMNS] = 0;
}

void view_clear_message(void)
{
    message_text[0] = 0;
}

SB_BANK_END()
