# BIOS 数据区清单

由 `node tools/bios-data.mjs --md docs/generated/BIOS数据区清单.md` 生成，不要手改；人工说明写在 `bios/data-notes.json`。

## 汇总

| 种类 | 块数 | 字节数 |
| --- | --- | --- |
| 字库 | 4 | 294912 |
| WAV 音频 | 1 | 81920 |
| 压缩图片 | 2 | 31124 |
| 字符串 | 31 | 12632 |
| 数据 | 67 | 8891 |
| 填充 | 13 | 6963 |
| 字符串与表 | 1 | 4096 |
| 地址表 | 26 | 777 |
| 中断向量 | 1 | 7 |
| 跨页指令 | 4 | 5 |

还没有任何说明（没有注释、没有引用、内容也看不出类别）的数据块 0 个，共 0 字节；尚未归到具体类别（种类仍是“数据”）的数据块 67 个。

## 待说明的数据块（按大小）

| 文件 | 地址 | 长度 | 种类 | 说明或线索 | 引用者 |
| --- | --- | --- | --- | --- | --- |

## 全部数据块

| 文件 | 地址 | 长度 | 种类 | 格式或用途 | 状态 | 引用者 |
| --- | --- | --- | --- | --- | --- | --- |
| dos-shell/startup-and-library.asm | $8003 / 4 / 数据 / 页首标记；页 0 的程序头标记：与可执行程序文件头同格式，偏移 3、4 是魔数 $AA $55（EXEC_PROGRAM 检查），其后 2 字节是自由字节 | 已登记 |  |
| dos-shell/startup-and-library.asm | $802C / 1 / 数据 / 作用：只有一条 RTS 的空入口 引用者：SHELL_ENTRY（取地址）； | 有说明 | SHELL_ENTRY |
| dos-shell/startup-and-library.asm | $8317 / 2 / 数据 / 作用：只有一个空格的字符串 引用者：SHELL_VIDEO_SETUP_1（取地址）； | 有说明 | SHELL_VIDEO_SETUP_1 |
| dos-shell/shell-helpers.asm | $841C | 2 / 数据 / 作用：不能出现在文件名里的字符表（完整表）：这里是通配符“*”“?”，后面紧接 BAD_CHARS_ALLOW_WILDCARD 的字符，合起来含通配符与反斜杠；LIB_GROUP 不是 0 与 1 时用。 引用者：LIB_IS_BAD_NAME_CHAR（取地址）； | 有说明 | LIB_IS_BAD_NAME_CHAR |
| dos-shell/shell-helpers.asm | $841E | 15 / 字符串 / 作用：不能出现在文件名里的字符表（允许通配符，含反斜杠）；LIB_GROUP 为 1 时用，也是 BAD_CHARS_ALL 的后半。 引用者：LIB_IS_BAD_NAME_CHAR（取地址）；ASCII 文字 | 有说明 | LIB_IS_BAD_NAME_CHAR |
| dos-shell/shell-helpers.asm | $842D | 16 / 字符串 / 作用：不能出现在文件名里的字符表（含通配符，允许反斜杠）；LIB_GROUP 为 0 时用。 引用者：LIB_IS_BAD_NAME_CHAR（取地址）；ASCII 文字 | 有说明 | LIB_IS_BAD_NAME_CHAR |
| dos-shell/shell-helpers.asm | $8672 | 8 / 字符串 / 作用：命令行开关字母表 Q、Y、V、W、B、A、P、?，序号即位号 引用者：CMD_PARSE_SWITCHES；ASCII 文字 | 有说明 | CMD_PARSE_SWITCHES |
| dos-shell/command-dispatch.asm | $8741 / 48 / 数据 / 作用：内部命令的入口地址表：第 N 项对应 DOS_CMD_NAMES 里的第 N 个命令名（从 0 起），每项 2 字节，处理例程以 RTS 返回外壳 紧随其后的 $876F 原来是一个多余的 2 字节（$AB5C），不属于任何命令名 引用者：DOS_RUN_COMMAND； | 有说明 | DOS_RUN_COMMAND |
| dos-shell/command-dispatch.asm | $8891 / 116 / 数据 / 作用：内部命令名表：每个名字以 0 结尾，表以 $FF 结束；同一个命令的别名（如 REN 与 RENAME）各占一项，地址表里也要各写一项 引用者：DOS_FIND_COMMAND； | 有说明 | DOS_FIND_COMMAND |
| dos-shell/shell-startup.asm | $8F0C | 34 / 数据 / 作用：命令行输入的扫描码处理表：每项 3 字节（扫描码，处理程序地址低、高），以 0 结尾 引用者：SHELL_COMMAND_LOOP； | 有说明 | SHELL_COMMAND_LOOP |
| dos-shell/shell-startup.asm | $8F2E | 13 / 数据 / 作用：命令行输入的 ASCII 处理表：格式同 SHELL_KEY_SCAN_TABLE 引用者：SHELL_COMMAND_LOOP； | 有说明 | SHELL_COMMAND_LOOP |
| dos-shell/directory-output-helpers.asm / $94FE / 10 / 字符串 / 作用：文件大小太大时显示的字符串“ >1.44M ” 引用者：PRINT_SIZE_TOO_BIG（取地址）；ASCII 文字 | 有说明 | PRINT_SIZE_TOO_BIG |
| dos-commands/command-dir.asm | $9F26 | 8 / 字符串 / ASCII 文字 | 按内容归类 |  |
| dos-commands/command-sbwin.asm | $AA03 / 11 / 字符串 / 作用：字符串 "SB-WIN.EXE" 引用者：CMD_SBWIN；ASCII 文字 | 有说明 | CMD_SBWIN |
| dos-commands/command-stubs.asm | $ACF9 / 14 / 字符串 / GB2312 汉字 | 按内容归类 |  |
| dos-shell/session-start.asm | $AE06 | 506 / 填充 / 全部为 $00 | 按内容归类 |  |
| kernel/nmi-bar-animation.asm | $C384 | 8 / 字符串 / 作用：条带图案字节：$80 $C0 $E0 $F0 $F8 $FC $FE $FF（由窄到宽的横条） 引用者：BAR_ANIM_NEXT；GB2312 汉字 | 有说明 | BAR_ANIM_NEXT |
| kernel/sound-engine.asm | $C5CE | 76 | 地址表 / 作用：音轨命令入口表：38 项×2 字节，命令字节减 $C0 为序号。 引用者：SOUND_TRACK_COMMAND；38 项 16 位地址（.word） | 有说明 | SOUND_TRACK_COMMAND |
| kernel/sound-engine.asm | $CF6D | 1 | 数据 / 作用：音高周期表低字节（64 项，从 $FF、$9A、$2D 递降） 引用者：SOUND_APPLY_PITCH、SOUND_APPLY_PITCH_BEND； | 有说明 | SOUND_APPLY_PITCH、SOUND_APPLY_PITCH_BEND |
| kernel/sound-engine.asm | $CF6E | 64 | 数据 / 作用：音高周期表低字节的第 2 项起，与上表同索引相减可得相邻两音的周期差（用于滑音） 引用者：SOUND_APPLY_PITCH、SOUND_APPLY_PITCH_BEND； | 有说明 | SOUND_APPLY_PITCH、SOUND_APPLY_PITCH_BEND |
| kernel/sound-engine.asm | $CFAE | 65 | 数据 / 作用：音高周期表高字节（64 项，$07 递降到 $00） 引用者：SOUND_APPLY_PITCH、SOUND_APPLY_PITCH_BEND； | 有说明 | SOUND_APPLY_PITCH、SOUND_APPLY_PITCH_BEND |
| kernel/sound-engine.asm | $CFEF | 22 | 数据 / 作用：音色指针表：每项 2 字节（低字节在前），SOUND_CMD_CD 按音色号取，高字节从 SOUND_INSTRUMENT_TABLE+1 起；之后是音色数据 SOUND_INSTRUMENT_DATA 引用者：SOUND_CMD_CD； | 有说明 | SOUND_CMD_CD |
| kernel/sound-engine.asm | $D005 | 206 / 数据 / 作用：音色与包络数据区：SOUND_INSTRUMENT_TABLE 的各项指向这里，SOUND_CMD_CD 从指向处每 4 字节取一项（包络指针 2 字节、寄存器 0 的值、寄存器 1 的值）；全 ROM 没有指令引用这个标签 引用者：全 ROM 没有指令或地址表引用它； | 有说明 |  |
| kernel/sound-engine.asm | $D0D3 | 328 / 数据 / 作用：乐句指针表：每项 2 字节（低字节在前），SOUND_CMD_CD 在第 1 个参数位 7、6 都为 0 时按 SOUND_PATTERN_INDEX 取项，指向的表每 4 字节一项；数据紧随其后 引用者：SOUND_CMD_CD； | 有说明 | SOUND_CMD_CD |
| kernel/sound-engine.asm | $D21B | 256 / 字符串 / 作用：音量换算表：16×16 字节，索引为（包络级×16＋基础音量），值为 $30 加换算后音量 引用者：SOUND_VOLUME_ENVELOPE；ASCII 文字 | 有说明 | SOUND_VOLUME_ENVELOPE |
| kernel/sound-engine.asm | $D31B | 56 | 数据 / 作用：内置曲表（曲号减 1 后乘 2 取指针） 引用者：SOUND_CMD_D9、SOUND_PLAY_SONG； | 有说明 | SOUND_CMD_D9、SOUND_PLAY_SONG |
| kernel/keyboard-driver.asm | $DA87 | 130 / 数据 / 作用：映射表：按住 Alt 引用者：KBD_TRANSLATE； | 有说明 | KBD_TRANSLATE |
| kernel/keyboard-driver.asm | $DB09 | 48 / 数据 / 作用：ALT 映射表偏移 $82 处（第 $41 项）；全 ROM 没有指令引用这个标签 引用者：全 ROM 没有指令或地址表引用它； | 有说明 |  |
| kernel/keyboard-driver.asm | $DB39 | 178 / 数据 / 作用：映射表：普通状态，每个扫描码 2 字节（ASCII，扫描码） ASCII 为 0 表示没有字符（功能键等），$FE 表示按小键盘规则处理，$FD、$FF 表示不产生按键 引用者：KBD_TRANSLATE； | 有说明 | KBD_TRANSLATE |
| kernel/keyboard-driver.asm | $DBEB | 178 / 数据 / 作用：映射表：CapsLock 打开时的字母大写 引用者：KBD_TRANSLATE； | 有说明 | KBD_TRANSLATE |
| kernel/keyboard-driver.asm | $DC9D | 178 / 数据 / 作用：映射表：按住 Ctrl，如 Ctrl+A 是 $01，功能键是 IBM 扩展码 引用者：KBD_HANDLER、KBD_TRANSLATE； | 有说明 | KBD_HANDLER、KBD_TRANSLATE |
| kernel/keyboard-driver.asm | $DD4F | 178 / 数据 / 作用：映射表：NumLock 打开时的小键盘 引用者：KBD_TRANSLATE； | 有说明 | KBD_TRANSLATE |
| kernel/keyboard-driver.asm | $DE01 | 178 / 数据 / 作用：映射表：按住 Shift 引用者：KBD_TRANSLATE； | 有说明 | KBD_TRANSLATE |
| kernel/timer-and-hooks.asm | $DF6F | 11 / 地址表 / 内核里一张没有被引用到的处理例程地址表；5 项小端 16 位地址 $DF7A、$E042、$E03E、$E02B、$DF79，其后 1 字节 $60（RTS，即 $DF79 本身）；表项指向未被执行过的入口 | 已登记 |  |
| kernel/syscall-table.asm | $E082 | 206 / 地址表 / 每项 2 字节（低字节在前），下标 = (功能号 - $10) × 2；功能 $3B-$64、$66 等走分发器里的换页路径，不查本表；未实现的功能指向 SYSCALL_STUB 引用者：SYSCALL_DISPATCH；103 项 16 位地址（.word） | 有说明 | SYSCALL_DISPATCH |
| kernel/basic-services.asm | $E163 | 16 / 地址表 / 8 项 16 位地址（.word） | 按内容归类 |  |
| kernel/basic-services.asm | $E239 | 4 / 数据 / 作用：功能 $11 子功能 0-3 并入 GLYPH_MODE 高 2 位的值：$00、$40、$80、$C0。 引用者：API_11_DISPLAY_MODE； | 有说明 | API_11_DISPLAY_MODE |
| kernel/basic-services.asm | $E2B4 | 5 / 字符串 / 作用：清除单个标志位的掩码：$7F、$BF、$DF、$EF、$F7、$FD（最后一项在下一个标号处）；功能 $13 用 Y=0-5 直接取，功能 $12 经 FLAG_CLEAR_MASK_INDEX1 用 Y=1-6 取 引用者：API_13_IRQ_MASK；GB2312 汉字 | 有说明 | API_13_IRQ_MASK |
| kernel/basic-services.asm | $E2B9 | 7 / 数据 / 作用：功能 $12 用 Y=1-6 取置位掩码时的基址，本字节 $FD 是上表第 6 项；置位掩码从下一字节起：$80、$40、$20、$10、$08、$02 引用者：API_12_PPU_CONTROL； | 有说明 | API_12_PPU_CONTROL |
| kernel/basic-services.asm | $E376 | 7 / 字符串 / GB2312 汉字 | 按内容归类 |  |
| kernel/basic-services.asm | $E37D | 7 / 数据 / 作用：功能 $13 子功能 0-6 要置位的 IRQ_MASK_SHADOW 位：$80、$40、$20、$10、$08、$04、$02。 引用者：API_13_IRQ_MASK； | 有说明 | API_13_IRQ_MASK |
| kernel/basic-services.asm | $E87F | 26 / 地址表 / 13 项 16 位地址（.word） | 按内容归类 |  |
| kernel/vram-dma.asm | $EE93 | 22 | 地址表 / 11 项 16 位地址（.word） | 按内容归类 |  |
| kernel/vram-dma.asm | $EEDD | 4 | 字符串 / 作用：屏幕缓冲里 4 张名称表的起始高字节：$A0、$A8、$B0、$B8（每张 $800 字节） 引用者：API30_SUB_NAMETABLE_DMA、CELL_FAR_ADDR；GB2312 汉字 | 有说明 | API30_SUB_NAMETABLE_DMA、CELL_FAR_ADDR |
| kernel/vram-dma.asm | $F049 | 2 | 数据 | 作用：按 $062E 位 0 选的基址增量：$00 或 $20 引用者：PATTERN_BASE_OFFSET； | 有说明 | PATTERN_BASE_OFFSET |
| kernel/vram-dma.asm | $F103 | 28 | 数据 / 作用：功能 $31 的清除区域表：共 7 项，每项 4 字节（显存目的地址低、高，长度低、高），子功能的位 0-6 各选一项 引用者：API_31； | 有说明 | API_31 |
| kernel/sound-services.asm | $F2D2 | 28 / 地址表 / 作用：声音服务 $65 的子功能表，14 项 引用者：API_65_SOUND_SERVICE；14 项 16 位地址（.word） | 有说明 | API_65_SOUND_SERVICE |
| kernel/system-state.asm | $F9F9 | 28 | 地址表 / 作用：功能 $74 的子功能入口表，下标 = 子功能号 × 2；10-13 都发命令字节 引用者：API_74_PORT4302_CONTROL；14 项 16 位地址（.word） | 有说明 | API_74_PORT4302_CONTROL |
| kernel/entry-vectors.asm | $FF19 | 2 | 填充 / 内核末尾向量之前的填充；2 字节 $00 | 已登记 |  |
| kernel/entry-vectors.asm | $FF1B | 207 / 填充 / 作用：内核区末尾的零填充，207 字节，修改 BIOS 时可放新代码 引用者：全 ROM 没有指令或地址表引用它；全部为 $00 | 有说明 |  |
| kernel/entry-vectors.asm | $FFF9 | 7 | 中断向量 / 6502 中断向量；$FFF9 为 $00 填充；$FFFA/$FFFB NMI = $C084，$FFFC/$FFFD RESET = $C000，$FFFE/$FFFF IRQ 与 BRK = $C12B | 已登记 |  |
| display/text-output.asm | $8009 | 24 | 地址表 / 12 项 16 位地址（.word） | 按内容归类 |  |
| display/text-output.asm | $878E | 16 | 数据 / 作用：画字方式表（子功能位 7 为 0 时用）：16 项，下标由 $064E 的位对折成，值写入 SYS_SUBFUNCTION，其位 0-3 控制两个平面的常量与取反是否生效 引用者：TEXT_SELECT_DRAW_MODE； | 有说明 | TEXT_SELECT_DRAW_MODE |
| display/text-output.asm | $879E | 16 | 数据 / 作用：画字方式对应的平面 2 常量（写入 $0653）：16 项 引用者：TEXT_SELECT_DRAW_MODE； | 有说明 | TEXT_SELECT_DRAW_MODE |
| display/text-output.asm | $87AE | 16 | 数据 / 作用：画字方式对应的平面 1 常量（写入 $0652）：16 项 引用者：TEXT_SELECT_DRAW_MODE； | 有说明 | TEXT_SELECT_DRAW_MODE |
| display/text-output.asm | $87BE | 16 | 数据 / 作用：画字方式表（子功能位 7 为 1 时用）：16 项，含义同 TEXT_DRAW_FLAGS_NORMAL 引用者：TEXT_SELECT_DRAW_MODE； | 有说明 | TEXT_SELECT_DRAW_MODE |
| display/text-output.asm | $87F9 | 4 | 数据 / 作用：位对序号 0-3 对应的平面常量：$00、$00、$FF、$FF 引用者：TEXT_DECODE_FLAGS； | 有说明 | TEXT_DECODE_FLAGS |
| display/text-output.asm | $87FD | 4 | 数据 / 作用：位对序号 0-3 对应的取反掩码：$00、$FF、$FF、$00 引用者：TEXT_DECODE_FLAGS； | 有说明 | TEXT_DECODE_FLAGS |
| display/cell-display.asm | $94D3 | 45 / 填充 / 全部为 $00 | 按内容归类 |  |
| display/cell-display.asm | $8509 | 22 / 地址表 / 11 项 16 位地址（.word） | 按内容归类 |  |
| math/math-library.asm | $8A03 | 65 | 数据 / 作用：40 位十进制位权表：13 项×5 字节（高字节在前），10^12 到 10^0；加减位权的 ADD_POW10、BIN40_SUB_POW、BIN40_CMP_POW 用。 引用者：ADD_POW10、BIN40_SUB_POW、BIN40_CMP_POW； | 有说明 | ADD_POW10、BIN40_SUB_POW、BIN40_CMP_POW |
| math/math-library.asm | $8FFE | 2 | 跨页指令 / 整数乘法入口里的跨页调用；JSR $9019 的操作码与低字节（$20 $19），高字节 $90 在下一页（p0A.asm）的第一个字节；两页按页组 $09 连续映射时是一条完整指令 | 已登记 |  |
| math/integer-multiply-divide.asm | $8000 / 1 / 跨页指令 / 跨页指令的后半；上一页末尾 JSR $9019 的操作数高字节 $90 | 已登记 |  |
| math/integer-multiply-divide.asm | $8135 / 43 / 填充 / 全部为 $00 | 按内容归类 |  |
| window/window-manager.asm | $8CD8 | 808 / 填充 / 全部为 $00 | 按内容归类 |  |
| image/tile-unpack.asm | $8009 | 16 | 地址表 / 8 项 16 位地址（.word） | 按内容归类 |  |
| image/map-and-effects.asm | $8800 | 18 / 地址表 / 9 项 16 位地址（.word） | 按内容归类 |  |
| image/map-and-effects.asm | $8F09 | 247 / 填充 / 全部为 $00 | 按内容归类 |  |
| input-method/ime-services.asm | $8012 / 74 / 地址表 / 作用：中文输入法服务（功能 $6D）的子功能入口表：第 N 项对应子功能 N，共 37 项（$00-$24），每项 2 字节 引用者：ime-services.asm 开头的入口代码；37 项 16 位地址（.word） | 有说明 |  |
| input-method/ime-services.asm | $80B7 / 24 / 数据 / 作用：输入法版本文字“SUBOR中文输入法 3.00版”（GB2312 混排，24 字节） 引用者：IME_SUB_00； | 有说明 | IME_SUB_00 |
| input-method/ime-services.asm | $817C / 10 / 数据 / 作用：检查选项用的位掩码表，按 SYS_ARG_0F 低 4 位取：$02、$04、$08、$10、$20、$40、$FF、$FF、$80、$01；$FF 表示改查 IME_FLAGS 位 4。 引用者：IME_CHECK_OPTION； | 有说明 | IME_CHECK_OPTION |
| input-method/ime-services.asm | $8214 / 4 / 字符串 / 作用：状态行文字“半角”（GB2312 $B0EB $BDC7） 引用者：IME_SUB_05；GB2312 汉字 | 有说明 | IME_SUB_05 |
| input-method/ime-services.asm | $8218 / 4 / 字符串 / 作用：状态行文字“全角”（GB2312 $C8AB $BDC7） 引用者：IME_SUB_06；GB2312 汉字 | 有说明 | IME_SUB_06 |
| input-method/ime-services.asm | $828A / 35 / 数据 / 作用：状态行的初始文字（GB2312，$00 结束），IME_LOAD_STATUS_LINE 使用 引用者：IME_LOAD_STATUS_LINE； | 有说明 | IME_LOAD_STATUS_LINE |
| input-method/ime-services.asm | $84C6 / 32 / 数据 / 作用：状态行文字“设置联想方式”，前面补空格，$00 结束，共 32 字节 引用者：IME_TOGGLE_MODE（取地址）； | 有说明 | IME_TOGGLE_MODE |
| input-method/ime-services.asm | $84E6 / 32 / 数据 / 作用：状态行文字“取消联想方式”，前面补空格，$00 结束，共 32 字节 引用者：IME_TOGGLE_MODE（取地址）； | 有说明 | IME_TOGGLE_MODE |
| input-method/ime-services.asm | $8658 / 20 / 地址表 / 作用：各输入法按键处理入口表，按输入法序号 0-9 取，每项 2 字节：0 区位码（IME_KEY_AREA_CODE）、1 全拼与 2 双拼（IME_KEY_PINYIN）、3-5 转外挂输入法模块、6 自定义模块、7 与 9 原样传回、8 翻页键处理 引用者：IME_PROCESS_KEY；10 项 16 位地址（.word） | 有说明 | IME_PROCESS_KEY |
| input-method/ime-services.asm | $88DD / 2448 / 字符串 / 作用：全拼音节表：408 项，每项 6 字节（音节的小写字母，不足补空格），按字母顺序；输入法序号不是 2 时 IME_TABLE_LOOKUP 逐项比对 引用者：IME_TABLE_LOOKUP（取地址）；ASCII 文字 | 有说明 | IME_TABLE_LOOKUP |
| input-method/ime-services.asm | $926D / 930 / 字符串 / 作用：双拼键位表：465 项，每项 2 个小写字母（8 项一行）；输入法序号为 2 时 IME_TABLE_LOOKUP 逐项比对，表尾是 IME_KEY_PINYIN 引用者：IME_TABLE_LOOKUP（取地址）；ASCII 文字 | 有说明 | IME_TABLE_LOOKUP |
| input-method/ime-dictionary-lookup.asm / $9954 / 16 / 字符串 / 作用：单个全角标点映射表：每项 3 字节（按键 ASCII，全角码高字节、低字节），以 $FF 结束 引用者：IME_SPECIAL_KEY_LOOKUP（取地址）；GB2312 汉字 | 有说明 | IME_SPECIAL_KEY_LOOKUP |
| input-method/ime-dictionary-lookup.asm / $9964 / 31 / 字符串 / 作用：成对全角标点映射表：每项 5 字节（按键 ASCII，两个全角码交替使用，如引号与括号的左右两半），以 $FF 结束 引用者：IME_SPECIAL_KEY_LOOKUP（取地址）；GB2312 汉字 | 有说明 | IME_SPECIAL_KEY_LOOKUP |
| input-method/ime-dictionary-lookup.asm / $9983 / 286 / 字符串 / 作用：全角字母数字映射表：每项 3 字节（按键 ASCII，全角码高字节、低字节） 引用者：IME_SPECIAL_KEY_LOOKUP（取地址）；GB2312 汉字 | 有说明 | IME_SPECIAL_KEY_LOOKUP |
| input-method/ime-dictionary-lookup.asm / $9CF9 / 48 / 字符串 / GB2312 汉字 | 按内容归类 |  |
| input-method/ime-dictionary-lookup.asm / $9D99 / 5 / 字符串 / 作用：状态行提示文字“[000]” 引用者：IME_SHOW_HINT；ASCII 文字 | 有说明 | IME_SHOW_HINT |
| input-method/ime-dictionary-lookup.asm / $9E28 / 5 / 字符串 / 作用：状态行文字“第 区”（GB2312 $B5DA $20 $C7F8） 引用者：IME_SHOW_ZONE_LABEL；GB2312 汉字 | 有说明 | IME_SHOW_ZONE_LABEL |
| input-method/ime-dictionary-lookup.asm / $9FFF / 1 / 跨页指令 / 跨页分支的前半；BNE 的操作码 $D0，操作数 $03 在下一页（p0E.asm）的第一个字节 | 已登记 |  |
| input-method/ime-extra-services.asm | $A000 / 1 / 跨页指令 / 跨页分支的后半；上一页末尾 BNE 的操作数 $03，跳到 IME_SUB_16_CONT | 已登记 |  |
| input-method/ime-extra-services.asm | $A23C / 196 / 填充 / 全部为 $00 | 按内容归类 |  |
| printer/printer-service.asm | $8323 | 32 / 地址表 / 16 项 16 位地址（.word） | 按内容归类 |  |
| printer/printer-service.asm | $8A83 | 8 / 数据 / 作用：控制码 $95 的参数 $80-$87 对应的 PRN_MODE 值：3、4、5、6、7、1、2、0 引用者：PRN_PARSE_CONTROL； | 有说明 | PRN_PARSE_CONTROL |
| printer/printer-service.asm | $8A8B | 48 / 数据 / 作用：控制码 $92 的参数 $80-$97 对应的 $0646、$0647：每项 2 字节，第二字节从 PRN_FONT_TABLE+1 起取 引用者：PRN_PARSE_CONTROL； | 有说明 | PRN_PARSE_CONTROL |
| printer/printer-service.asm | $8CC8 | 6 / 数据 / 作用：全角（汉字）的字宽表，按 SYS_ARG_03（最大 5）取：$10、$20、$30、$40、$50、$60，累加到 PRN_COLUMN。 引用者：PRN_FETCH_DATA_BYTE； | 有说明 | PRN_FETCH_DATA_BYTE |
| printer/printer-service.asm | $8CCE | 6 / 数据 / 作用：半角字符的字宽表，按 SYS_ARG_03（最大 5）取：$08、$10、$18、$20、$28、$30，累加到 PRN_COLUMN。 引用者：PRN_FETCH_DATA_BYTE； | 有说明 | PRN_FETCH_DATA_BYTE |
| printer/printer-service.asm | $8EE2 | 286 / 填充 / 全部为 $00 | 按内容归类 |  |
| display/text-to-buffer.asm | $8009 | 4 / 地址表 / 2 项 16 位地址（.word） | 按内容归类 |  |
| display/text-to-buffer.asm | $8139 | 16 / 数据 / 作用：画字方式表（子功能位 7 为 0 时用）：16 项，含义同 TEXT_DRAW_FLAGS_NORMAL 引用者：BUFFER_SELECT_DRAW_MODE； | 有说明 | BUFFER_SELECT_DRAW_MODE |
| display/text-to-buffer.asm | $8149 | 16 / 数据 / 作用：画字方式对应的平面 2 常量（写入 $0653）：16 项 引用者：BUFFER_SELECT_DRAW_MODE； | 有说明 | BUFFER_SELECT_DRAW_MODE |
| display/text-to-buffer.asm | $8159 | 16 / 数据 / 作用：画字方式对应的平面 1 常量（写入 $0652）：16 项 引用者：BUFFER_SELECT_DRAW_MODE； | 有说明 | BUFFER_SELECT_DRAW_MODE |
| display/text-to-buffer.asm | $8169 | 16 / 数据 / 作用：画字方式表（子功能位 7 为 1 时用）：16 项，含义同 BUFFER_DRAW_FLAGS_NORMAL 引用者：BUFFER_SELECT_DRAW_MODE； | 有说明 | BUFFER_SELECT_DRAW_MODE |
| display/text-to-buffer.asm | $842B | 4 / 数据 / 作用：位对序号 0-3 对应的平面常量：$00、$00、$FF、$FF 引用者：BUFFER_DECODE_FLAGS； | 有说明 | BUFFER_DECODE_FLAGS |
| display/text-to-buffer.asm | $842F | 4 / 数据 / 作用：位对序号 0-3 对应的取反掩码：$00、$FF、$FF、$00 引用者：BUFFER_DECODE_FLAGS； | 有说明 | BUFFER_DECODE_FLAGS |
| display/text-to-buffer.asm | $86BD | 67 / 填充 / 全部为 $00 | 按内容归类 |  |
| karaoke/lyrics-scroll.asm | $8DF4 | 524 / 填充 / 全部为 $00 | 按内容归类 |  |
| file-system/fs-directory.asm | $8FF3 | 20 / 字符串 / 作用：文件名里不能出现的字符表（以 0 结尾）：问号、星号、空格、逗号、小于、大于、冒号、分号、单引号、方括号、花括号、反斜杠、竖线、加号、等号、斜杠、双引号。 引用者：FS_CHECK_NAME_CHAR；ASCII 文字 | 有说明 | FS_CHECK_NAME_CHAR |
| file-system/fs-file-operations.asm | $A383 / 12 / 数据 / 作用：每月天数表（一月到十二月，12 项；以月号减 1 为下标，二月在代码里按闰年另行处理，表里的 28 不用）。 引用者：FS_CHECK_DATE、FS_CHECK_TIME； | 有说明 | FS_CHECK_DATE、FS_CHECK_TIME |
| file-system/fs-dispatch.asm | $AB78 | 6 / 地址表 / 3 项 16 位地址（.word） | 按内容归类 |  |
| file-system/fs-dispatch.asm | $AB8E | 40 / 地址表 / 20 项 16 位地址（.word） | 按内容归类 |  |
| file-system/fs-dispatch.asm | $ABC6 | 34 / 地址表 / 17 项 16 位地址（.word） | 按内容归类 |  |
| file-system/fs-dispatch.asm | $ABF8 | 8 / 地址表 / 4 项 16 位地址（.word） | 按内容归类 |  |
| file-system/fs-dispatch.asm | $AC1E | 994 / 填充 / 全部为 $00 | 按内容归类 |  |
| messages/dos-messages-en.asm | $8000 | 4096 / 字符串 / ASCII 文字 | 按内容归类 |  |
| system-services/time-and-program-exec.asm / $83C4 / 12 / 数据 / 作用：每月天数表（二月 28 天，闰年在代码里处理） 引用者：CLOCK_CHECK_DATE、CLOCK_APPLY_DAY_CARRY； | 有说明 | CLOCK_CHECK_DATE、CLOCK_APPLY_DAY_CARRY |
| system-services/group-5c-dispatch.asm / $9390 / 8 / 地址表 / 4 项 16 位地址（.word） | 按内容归类 |  |
| system-services/group-5c-dispatch.asm / $93AD / 6 / 地址表 / 3 项 16 位地址（.word） | 按内容归类 |  |
| system-services/group-5c-dispatch.asm / $93C8 / 10 / 地址表 / 5 项 16 位地址（.word） | 按内容归类 |  |
| system-services/group-5c-dispatch.asm / $93E7 / 18 / 地址表 / 9 项 16 位地址（.word） | 按内容归类 |  |
| system-services/group-5c-dispatch.asm / $9422 / 3038 / 填充 / 全部为 $00 | 按内容归类 |  |
| dos-commands/command-group-5e.asm | $8013 / 12 / 地址表 / 作用：页组 $5E 的命令实现入口表：序号由 CMD_SELECT 给出，0 DISKCOPY、1 CLJS、2 VER、3 HELP、4 DATE、5 TIME 引用者：command-group-5e.asm 开头的入口代码；6 项 16 位地址（.word） | 有说明 |  |
| dos-commands/command-group-5e.asm | $8887 / 2 / 数据 / 作用：只有一个空格的字符串 引用者：CMD_CLJS_IMPL（取地址）； | 有说明 | CMD_CLJS_IMPL |
| dos-commands/command-group-5e.asm | $892C / 19 / 数据 / 作用：HELP 命令依次显示的消息号表，以 0 结尾 引用者：CMD_HELP_IMPL； | 有说明 | CMD_HELP_IMPL |
| dos-commands/command-group-5e.asm | $8EAC / 340 / 数据 / 作用：字符串“MENU.BIN”（CLJS 命令要打开的文件，以 0 结尾），其后是 GB2312 的“正在装入大型游戏软件”（以 0 结尾）与页组末尾的零填充。 引用者：CMD_CLJS_IMPL； | 有说明 | CMD_CLJS_IMPL |
| messages/dos-messages-cn.asm | $8000 | 4096 / 数据 / 页 5F 页首；出错码 0 的信息“无错”的前 3 字节（GB2312 $CEDE $B4ED，$ED 与结尾 $00 在下一行） | 已登记 |  |
| dos-commands/command-group-60-dir.asm / $8013 / 12 / 地址表 / 作用：页组 $60 的命令实现入口表：序号由 CMD_SELECT 给出，0 TYPE、1 REN、2 DEL、3 COPY、4 CLS、5 EXIT 引用者：command-group-60-dir.asm 开头的入口代码；6 项 16 位地址（.word） | 有说明 |  |
| dos-commands/command-group-60-dir.asm / $8128 / 2 / 数据 / 作用：不能出现在文件名里的字符表（完整表）：这里是通配符“*”“?”，后面紧接 CHAR_SET_ALLOW_WILDCARD 的字符，合起来含通配符与反斜杠；LIB_GROUP 不是 0 与 1 时用。 引用者：CHAR_IN_SET（取地址）； | 有说明 | CHAR_IN_SET |
| dos-commands/command-group-60-dir.asm / $812A / 15 / 字符串 / 作用：不能出现在文件名里的字符表（允许通配符，含反斜杠）；LIB_GROUP 为 1 时用，也是 CHAR_SET_ALL 的后半。 引用者：CHAR_IN_SET（取地址）；ASCII 文字 | 有说明 | CHAR_IN_SET |
| dos-commands/command-group-60-dir.asm / $8139 / 16 / 字符串 / 作用：不能出现在文件名里的字符表（含通配符，允许反斜杠）；LIB_GROUP 为 0 时用 引用者：CHAR_IN_SET（取地址）；ASCII 文字 | 有说明 | CHAR_IN_SET |
| dos-commands/command-group-60-dir.asm / $82C6 / 19 / 数据 / 作用：文件大小太大时显示的字符串“ >1.44M ”（以 0 结尾），其后的字节是显示它的指令（显示完返回）。 引用者：CMD_FS_LOAD_DIR_SECTOR（取地址）； | 有说明 | CMD_FS_LOAD_DIR_SECTOR |
| dos-commands/command-type.asm | $86FE / 6 / 字符串 / 作用：字符串“/MORE”（以 0 结尾），TYPE 命令行里分页管道的写法。 引用者：CMD_TYPE_BODY；ASCII 文字 | 有说明 | CMD_TYPE_BODY |
| dos-commands/command-cls-exit.asm | $A960 / 21 / 数据 / 作用：十进制位权表（CMD_SUB_POW10 用）：每项 3 字节（高、中、低），第 0 项 $168000（1.44M，超过显示“>1.44M”），其后是 10^6、10^5、10^4、10^3、100、10 引用者：CMD_SUB_POW10； | 有说明 | CMD_SUB_POW10 |
| dos-commands/command-cls-exit.asm | $A975 / 1 / 数据 / 作用：字符串 ".." 引用者：CMD_REN_IMPL、CMD_DEL_IMPL、CMD_COPY_IMPL； | 有说明 | CMD_REN_IMPL、CMD_DEL_IMPL、CMD_COPY_IMPL |
| dos-commands/command-cls-exit.asm | $A976 / 2 / 数据 / 作用：字符串 "."（接在 CMD_STR_DOTDOT 的第二个字符上） 引用者：CMD_REN_IMPL、CMD_DEL_IMPL、CMD_COPY_IMPL； | 有说明 | CMD_REN_IMPL、CMD_DEL_IMPL、CMD_COPY_IMPL |
| dos-commands/command-cls-exit.asm | $A978 / 2 / 数据 / 作用：字符串 "..\\"（反斜杠接在下一个标号处） 引用者：CMD_REN_IMPL、CMD_DEL_IMPL、CMD_COPY_IMPL； | 有说明 | CMD_REN_IMPL、CMD_DEL_IMPL、CMD_COPY_IMPL |
| dos-commands/command-cls-exit.asm | $A97A / 2 / 数据 / 作用：字符串 "\\" 引用者：CMD_COPY_IMPL； | 有说明 | CMD_COPY_IMPL |
| dos-commands/command-cls-exit.asm | $A97C / 1668 / 数据 / 作用：字符串 "*.*"，其后是页组末尾的零填充 引用者：CMD_REN_IMPL、CMD_DEL_IMPL、CMD_COPY_IMPL； | 有说明 | CMD_REN_IMPL、CMD_DEL_IMPL、CMD_COPY_IMPL |
| boot/boot-program.asm | $827E | 120 | 数据 / 作用：图片参数表：12 项×10 字节（源地址 2 字节、$064C/$064D、子功能、$0652、$0653、$0648、$0649、$0651），BOOT_SHOW_IMAGE 按序号取一项调用功能 $5F 引用者：BOOT_SHOW_IMAGE； | 有说明 | BOOT_SHOW_IMAGE |
| boot/boot-program.asm | $83BB | 9 | 字符串 / ASCII 文字 | 按内容归类 |  |
| boot/boot-program.asm | $83C4 | 5 | 字符串 / 作用：检测结果标记的起始列（写入 $064C）：$70、$90、$B0、$D0、$F0，按序号取 引用者：BOOT_SHOW_RESULT_MARK；GB2312 汉字 | 有说明 | BOOT_SHOW_RESULT_MARK |
| boot/boot-program.asm | $83C9 | 5 | 数据 / 作用：检测结果标记的行（写入 $064D）：$0C、$10、$14、$18、$18，按序号取 引用者：BOOT_SHOW_RESULT_MARK； | 有说明 | BOOT_SHOW_RESULT_MARK |
| boot/boot-program.asm | $8445 | 230 | 字符串 / GB2312 汉字 | 按内容归类 |  |
| boot/boot-program.asm | $852B | 78 | 数据 / 作用：开机提示文字表：13 项×6 字节（字符串地址 2 字节、显示基础值 2 字节（SYS_ARG_09、SYS_ARG_0A）、列、行），BOOT_PUT_TEXT 按序号取一项经功能 $45 显示。 引用者：BOOT_PUT_TEXT； | 有说明 | BOOT_PUT_TEXT |
| boot/boot-program.asm | $85D7 | 2 | 数据 / 开机程序中的数据；字符串“ ”（一个空格加结尾 0），BOOT_BLANK_CELL 用功能 $3F 显示它 | 已登记 |  |
| boot/boot-program.asm | $866C | 2452 | 压缩图片 / 开机画面的第 1 张图（IMAGE_POINTERS[0]）；BOOT_IMAGE_TABLE 项 0 的压缩图片（源地址 $866C），解压格式见 tools/decode-img.mjs；从页 78 的 $866C 起，延续到页 79 起的资源 | 已登记 |  |
| assets/p03-p03.bin | $3000 | 4096 | 字符串与表 / 页 03：DOS 外壳消息表，LIB_PRINT_MESSAGE 把它映射到 $B000，按消息号在 $B200（小字体）或 $B500（大字体）的 3 字节表（页号、地址低、地址高）里查字符串；消息号表加字符串（如 AUTOEXEC.BAT、<DIR>） | 已登记 |  |
| assets/p10-p57.bin | $10000 | 262144 | 字库 / 页 10-4F；GB2312 汉字 16×16 点阵（每字 32 字节，前 16 字节每行左半边、后 16 字节右半边）与 ASCII 点阵：汉字区 16-87 从 $1C000、ASCII 8×8 从 $50E00、ASCII 8×16 从 $51100、符号区 1-9 从 $51700；页 10-1B 是输入法拼音词库（索引表每项 2 字节，候选字表以 $FF 结束，见 ime-dictionary-lookup.asm），不是字库 | 已登记 |  |
| assets/p10-p57.bin | $50000 | 4096 | 字库 / 页 50；GB2312 汉字区 16-87 的末尾（到 $50DFF）与 ASCII 8×8 点阵（从 $50E00，码 $20-$7F） | 已登记 |  |
| assets/p10-p57.bin | $51000 | 4096 | 字库 / 页 51；ASCII 8×16 点阵（从 $51100，码 $20-$7F）与符号区的开头（从 $51700） | 已登记 |  |
| assets/p10-p57.bin | $52000 | 24576 | 字库 / 页 52-57；GB2312 符号区 1-9 的 16×16 点阵（每字 32 字节，位置公式见 系统调用手册 $3B 一行） | 已登记 |  |
| assets/p63-p77.bin | $63000 | 4096 | 字符串 / 页 63；DOS 命令帮助文字（英文） | 已登记 |  |
| assets/p63-p77.bin | $64000 | 81920 | WAV 音频 / 页 64-77，播放见 $65/$0C；RIFF/WAVE，单声道 8 位 PCM 22050 Hz，81277 字节，从页 64 开始 | 已登记 |  |
| assets/p79-p7F.bin | $79000 | 28672 | 压缩图片 / 页 79-7F，与页 78 的 BOOT_IMAGE_TABLE 配套；10 张压缩图片：10 字节头 + 图案流（16 字节字典 + 指令流）+ 映射流 + 调色板，格式见 tools/decode-img.mjs | 已登记 |  |
