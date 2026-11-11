/*
 * ------------------------------------------------------------------------
 * 名称：screen.c
 * 说明：编辑器屏幕版面的绘制实现：经名称表 0 画文字，字模图块放在显存的固定区段，各行互不重叠。
 * 作者：sungbin
 * 邮箱：sungbin@3578.cn
 * 日期：2026-11-11
 * 备注：这台机器的文字是四平面 8x16 字模：每个字符占上下两个图块，每个图块 32 字节（图块号以 16 字节为单位，
 *       所以一个字符占 4 个图块号，一行 32 列占 128 个图块号）。单元值的高 4 位里，位 15、14 选调色板组（每组 16 种颜色），
 *       本程序用第 2 组（白底黑字）与第 3 组（蓝底白字），DOS 自己用第 0、1 组，所以不会改变状态栏的颜色。
 *       DOS 返回命令行时会重设整个调色板，不需要恢复。
 *       编辑区每一行有自己的一组字模图块（“槽”），整行上下移动时只搬单元、不重画字模，槽跟着行走，
 *       所以重画某一行时必须用这一行当前的槽。
 * ------------------------------------------------------------------------
 */
#include <string.h>
#include <sb2000.h>
#include "screen.h"

/* 名称表号与文字的前景色号（字模像素取 15，对应调色板组里的第 15 项） */
#define TABLE 0
#define TEXT_COLOR 15

/* 单元值里的调色板号：位 15、14 选组，所以 8 是第 2 组，12 是第 3 组，4 是第 1 组 */
#define PALETTE_MENU 8
#define PALETTE_EDITOR 12
#define PALETTE_SELECTED 4

/* DOS 空白单元用的图块号 */
#define BLANK_TILE 0x0080

/* 各区域的字模图块起点，每行 0x80；编辑区 13 行排到 0x0800，弹出区放在其后（只在弹出区打开期间使用） */
#define TILE_HINT 0x0100
#define TILE_EDITOR 0x0180
#define TILE_POPUP 0x0800
#define TILE_ROW_STEP 0x80
#define TILE_COLUMN_STEP 4

/* 菜单栏左侧快捷键提示占 22 列（第 1 到 22 列），右侧状态区从第 23 列起；状态区的图块接在提示之后，与整行连续排布时一致 */
#define HINT_COLUMNS 22
#define STATUS_ORIGIN 23
#define TILE_STATUS (TILE_HINT + (STATUS_ORIGIN - 1) * TILE_COLUMN_STEP)

/* 单元行的布局：菜单栏占 0、1 行，编辑区紧接着从 2 行到 27 行，28、29 行是 DOS 状态栏 */
#define ROW_HINT 0
#define ROW_EDITOR 2
#define ROW_EDITOR_END 27

/* 一行文字占上下两个单元行，每个单元 2 字节，一个单元行 32 个单元，所以一行文字的单元占 128 字节 */
#define LINE_CELL_BYTES 128

/* 窗口保存服务返回的有效窗口号上限 */
#define WINDOW_ID_MAX 30

/* 整行的文字中转区：多一个字节放结尾的 0 */
static char row_text[SCREEN_TEXT_COLUMNS + 1];

/* 编辑区每一行当前使用的字模槽 */
static unsigned char line_slot[SCREEN_EDITOR_LINES];

/* 启动时保存的 DOS 控制台单元的窗口号，0 表示没有 */
static unsigned char console_window;

/* 整行单元搬动的中转区 */
static unsigned char move_area[LINE_CELL_BYTES];

/* 弹出区保存的窗口号，0 表示没有打开 */
static unsigned char popup_window;

/* 第 2、3 组调色板（调色板第 32 到 63 项）：第 0 项是底色，第 15 项是字模颜色，其余项不用；字模取常驻区的数据，系统服务读得到 */
static const unsigned char palette_colors[32] = {
    0x30, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F, 0x0F,
    0x01, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30
};

/* 快捷键提示（GB2312）：F1文件  F5汇编  F8关于 */
static const char hint_text[] = "F1" "\xCE\xC4\xBC\xFE" "  F5" "\xBB\xE3\xB1\xE0" "  F8" "\xB9\xD8\xD3\xDA";

SB_BANK_BEGIN(2)

/* 文字里从 from 所在的字符的第一个字节起画：from 落在汉字（两个不小于 0xA1 的字节）中间时退到汉字的第一个字节 */
static unsigned char align_to_character(const char *text, unsigned char from)
{
    unsigned char index = 0;
    unsigned char step;

    while (index < from) {
        step = ((unsigned char)text[index] >= 0xA1 && (unsigned char)text[index + 1] >= 0xA1) ? 2 : 1;
        if (index + step > from) {
            break;
        }
        index += step;
    }
    return index;
}

/*
 * 画一行文字：末尾的空格不画；只画从 from 起的字符，再把变短后多出的部分（used 到 previous_length 之间）换成空白单元。
 * 单元值里的图块号按列递增 TILE_COLUMN_STEP，所以从中间的列开始画时起始图块号也要相应前移。
 * origin 是文字第一个字符所在的列号，整行文字取 1。
 */
static void draw_text(unsigned char row, unsigned int tile, unsigned char palette, const char *text, unsigned char width,
    unsigned char from, unsigned char previous_length, unsigned char origin)
{
    unsigned char used = 0;

    while (used < width && text[used] != 0) {
        ++used;
    }
    while (used > 0 && text[used - 1] == ' ') {
        --used;
    }
    from = align_to_character(text, from);
    if (from < used) {
        memcpy(row_text, text + from, used - from);
        row_text[used - from] = 0;
        sb_text_field(TABLE, origin + from, row, row_text,
            (((unsigned int)palette << 12) | tile) + (unsigned int)from * TILE_COLUMN_STEP, palette, TEXT_COLOR);
    }
    if (previous_length > used) {
        sb_cells_rect(TABLE, origin + used, row, previous_length - used, 2, BLANK_TILE, palette);
    }
}

void screen_init(void)
{
    unsigned char line;

    sb_window_init();
    popup_window = 0;
    console_window = sb_window_save(TABLE, 0, 0, 31, ROW_EDITOR_END);
    if (console_window > WINDOW_ID_MAX) {
        console_window = 0;
    }
    sb_palette_write(32, palette_colors, sizeof(palette_colors));
    sb_cells_rect(TABLE, 0, ROW_HINT, 32, ROW_EDITOR - ROW_HINT, BLANK_TILE, PALETTE_MENU);
    sb_cells_rect(TABLE, 0, ROW_EDITOR, 32, ROW_EDITOR_END - ROW_EDITOR + 1, BLANK_TILE, PALETTE_EDITOR);
    for (line = 0; line < SCREEN_EDITOR_LINES; ++line) {
        line_slot[line] = line;
    }
}

void screen_draw_hint(void)
{
    draw_text(ROW_HINT, TILE_HINT, PALETTE_MENU, hint_text, HINT_COLUMNS, 0, HINT_COLUMNS, 1);
}

void screen_draw_status(const char *text, unsigned char from, unsigned char previous_length)
{
    draw_text(ROW_HINT, TILE_STATUS, PALETTE_MENU, text, SCREEN_STATUS_COLUMNS, from, previous_length, STATUS_ORIGIN);
}

void screen_draw_line(unsigned char line, const char *text, unsigned char from, unsigned char previous_length)
{
    draw_text(ROW_EDITOR + line * 2, TILE_EDITOR + (unsigned int)line_slot[line] * TILE_ROW_STEP, PALETTE_EDITOR, text,
        SCREEN_TEXT_COLUMNS, from, previous_length, 1);
}

void screen_shift_lines_down(unsigned char first)
{
    unsigned char page;
    unsigned int offset;
    unsigned char line;
    unsigned char slot = line_slot[SCREEN_EDITOR_LINES - 1];

    for (line = SCREEN_EDITOR_LINES - 1; line > first; --line) {
        line_slot[line] = line_slot[line - 1];
    }
    line_slot[first] = slot;
    /* 从末行往前搬，每次一行文字的单元（上下两个单元行连在一起） */
    sb_cell_address(TABLE, 0, ROW_EDITOR + first * 2, &page, &offset);
    for (line = SCREEN_EDITOR_LINES - 1; line > first; --line) {
        sb_far_read(page, offset + (unsigned int)(line - 1 - first) * LINE_CELL_BYTES, move_area, LINE_CELL_BYTES);
        sb_far_write(page, offset + (unsigned int)(line - first) * LINE_CELL_BYTES, move_area, LINE_CELL_BYTES);
    }
    sb_screen_flush(TABLE);
}

void screen_shift_lines_up(unsigned char first)
{
    unsigned char page;
    unsigned int offset;
    unsigned char line;
    unsigned char slot = line_slot[first];

    for (line = first; line < SCREEN_EDITOR_LINES - 1; ++line) {
        line_slot[line] = line_slot[line + 1];
    }
    line_slot[SCREEN_EDITOR_LINES - 1] = slot;
    sb_cell_address(TABLE, 0, ROW_EDITOR + first * 2, &page, &offset);
    for (line = first; line < SCREEN_EDITOR_LINES - 1; ++line) {
        sb_far_read(page, offset + (unsigned int)(line - first + 1) * LINE_CELL_BYTES, move_area, LINE_CELL_BYTES);
        sb_far_write(page, offset + (unsigned int)(line - first) * LINE_CELL_BYTES, move_area, LINE_CELL_BYTES);
    }
    sb_screen_flush(TABLE);
}

void screen_clear_all(void)
{
    /* 先把保存的窗口写回以释放窗口号，再像 DOS 的 cls 一样把控制台单元都写成空白图块；DOS 之后输出每一行时会自己分配字模槽 */
    if (console_window != 0) {
        sb_window_restore(console_window);
        console_window = 0;
    }
    sb_cells_rect(TABLE, 0, 0, 32, ROW_EDITOR_END + 1, BLANK_TILE, 0);
    SB_BYTE_AT(SB_CURSOR_ROW) = 0;
    sb_cursor_set_column(1);
    sb_screen_flush(TABLE);
}

void screen_set_cursor(unsigned char line, unsigned char column, unsigned char on_text, unsigned char visible)
{
    unsigned char page;
    unsigned int offset;
    unsigned int upper;
    unsigned int lower;
    unsigned int palette = (unsigned int)(visible ? PALETTE_MENU : PALETTE_EDITOR) << 12;

    if (on_text) {
        upper = palette | (TILE_EDITOR + (unsigned int)line_slot[line] * TILE_ROW_STEP + (unsigned int)(column - 1) * TILE_COLUMN_STEP);
        lower = upper + 2;
    } else {
        upper = palette | BLANK_TILE;
        lower = upper;
    }
    /* 直接改名称表缓冲里上下两个单元，再整张刷新一次；一个单元行的单元相隔 $40 字节 */
    sb_cell_address(TABLE, column, ROW_EDITOR + line * 2, &page, &offset);
    sb_far_write(page, offset, &upper, 2);
    sb_far_write(page, offset + 0x40, &lower, 2);
    sb_screen_flush(TABLE);
}

void screen_popup_open(unsigned char lines)
{
    unsigned char id = sb_window_save(TABLE, 1, ROW_EDITOR, SCREEN_TEXT_COLUMNS, ROW_EDITOR + lines * 2 - 1);

    popup_window = id <= WINDOW_ID_MAX ? id : 0;
}

void screen_draw_popup(unsigned char index, const char *text, unsigned char width, unsigned char selected)
{
    draw_text(ROW_EDITOR + index * 2, TILE_POPUP + (unsigned int)index * TILE_ROW_STEP,
        selected ? PALETTE_SELECTED : PALETTE_MENU, text, width, 0, width, 1);
}

void screen_popup_close(void)
{
    if (popup_window != 0) {
        sb_window_restore(popup_window);
        popup_window = 0;
        sb_screen_flush(TABLE);
    }
}

SB_BANK_END()
