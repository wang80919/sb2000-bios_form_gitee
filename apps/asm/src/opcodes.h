/*
 * ------------------------------------------------------------------------
 * 名称：opcodes.h
 * 说明：定义官方 6502 指令寻址方式与查询接口。
 * 作者：sungbin
 * 邮箱：sungbin@3578.cn
 * 日期：2026-11-11
 * 备注：无
 * ------------------------------------------------------------------------
 */
#ifndef ASM_OPCODES_H
#define ASM_OPCODES_H

#include <sb2000.h>

/* 指令寻址方式。 */
#define ASM_MODE_IMPLIED 0
#define ASM_MODE_ACCUMULATOR 1
#define ASM_MODE_IMMEDIATE 2
#define ASM_MODE_ZERO_PAGE 3
#define ASM_MODE_ZERO_PAGE_X 4
#define ASM_MODE_ZERO_PAGE_Y 5
#define ASM_MODE_RELATIVE 6
#define ASM_MODE_INDEXED_INDIRECT 7
#define ASM_MODE_INDIRECT_INDEXED 8
#define ASM_MODE_ABSOLUTE 9
#define ASM_MODE_ABSOLUTE_X 10
#define ASM_MODE_ABSOLUTE_Y 11
#define ASM_MODE_INDIRECT 12

/** 官方 6502 指令的助记符、寻址方式与机器码。 */
typedef struct {
    /** 大写助记符，最多 3 个字符并以 0 结尾。 */
    char mnemonic[4];
    /** ASM_MODE_ 开头的寻址方式。 */
    unsigned char mode;
    /** 6502 机器码。 */
    unsigned char code;
} AsmOpcode;

SB_BANK_CALLS_BEGIN(4)
/**
 * 查找指令机器码。
 * @param mnemonic 大写助记符。
 * @param mode ASM_MODE_ 开头的寻址方式。
 * @param code 返回机器码。
 * @return 找到时返回非 0，否则返回 0。
 */
unsigned char asm_find_opcode(const char *mnemonic, unsigned char mode, unsigned char *code);
SB_BANK_CALLS_END()

#endif