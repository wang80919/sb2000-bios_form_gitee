# 修改 BIOS 指南

怎么在 `bios/` 工程上修改 SB2000 的 BIOS、重新编译、在模拟器里验证，以及改动时要避开的坑。工程结构见 [反汇编工程说明](../工程说明.md)，系统调用与变量见 系统调用手册。

## 1. 开始之前

1. 工程已经能逐字节重建原始 BIOS（在 `bios/` 目录运行 `npm run build`，输出“与原始 BIOS 逐字节一致”）。先确认这一点，再开始改。
2. **第一次修改前，在 `bios/` 下建一个空文件 `.modified`。** 有这个文件时：
   - `npm test` 不再要求重建结果与原始 ROM 一致（仍然要求能成功构建出完整的 ROM）；
   - `node tools/bios-build.mjs` 不再因为与原始 ROM 不同而报错，改为报告“与原始 BIOS 有多少个字节不同、分布在哪些页”，加 `--compare` 可强制比对。
3. 用 Git 管理 `bios/`，每次改动都能看到差异。把 ROM 转成源码的一次性工具已经删除，不会覆盖手工修改。

## 2. 修改循环

```powershell
# 1. 改 bios/src/*.asm
# 2. 在 bios/ 目录里构建（输出 bios/build/SB2K_BIOS.NES，并报告与原始 ROM 的差异）
npm run build
# 3. 在 disassembly/ 目录里用模拟器运行（ROM 路径用绝对路径）
node tools/sb2kdbg.mjs --launch <绝对路径>\bios\build\SB2K_BIOS.NES
# 4. 在 bios/ 目录里测试
npm test
```

在模拟器里进 DOS 的命令序列见 README：`reset`、`disk <软盘镜像>`、`run 1100`、两次回车、`run 300`，之后 `type ver` 加回车就能执行命令，`shot 文件名.png` 截图。软盘镜像用 `reference/floppy-dos.img`，自己的程序用 fcdev 的 `fcdev disk` 生成。

## 3. 常用工具

| 要做的事 | 工具 |
| --- | --- |
| 构建并看差异（在 `bios/` 里） | `node tools/bios-build.mjs [--no-compare] [--compare] [--out 文件]` |
| 给标签、符号改名并写注释（在 `bios/` 里） | `node tools/bios-rename.mjs --file 映射文件`（每行“旧名 新名 [注释]”，注释里用 `\|` 分行）；整词替换所有源文件，改名后自动重新汇编检查 |
| 看代码段里还没识别的区域（在 `disassembly/` 里） | `node tools/bios-report.mjs` |
| 查看、改写字库里的字形（在 `disassembly/` 里） | `node tools/bios-font.mjs show\|set` |

汇编语法见 `bios/tools/asm6502.mjs` 文件头：`.org`、`.byte`、`.word`、`.ascii "文字"`、`NAME = 值`、标签加减偏移、`#<标签`、`#>标签`、局部标签 `@名字`。符号值不超过 `$FF` 时按零页寻址。

## 4. 改什么、在哪改

| 想改的东西 | 在哪里 | 说明 |
| --- | --- | --- |
| 字库（汉字、ASCII 的字形） | `bios/assets/p10-p57.bin`，用 `node tools/bios-font.mjs` 查看与改写 | `show A` 把字形画成 `#` 与 `.` 的图案；`set A 图案文件` 把图案写回（ASCII 16 行 8 列，汉字 16 行 16 列）。格式见工具文件头。实测把 `A` 改成方框后，提示符 `A:\>` 与“All rights reserved”里的 A 都变了 |
| 版本号等中文提示文字 | `bios/src/messages/dos-messages-cn.asm`（出错信息与 DOS 提示的中文版）、`dos-messages-en.asm`（英文版） | 汉字是 GB2312 两字节，写成 `.byte`；ASCII 连续 6 个以上字符转成 `.ascii`。**长度不能变**，见第 5 节 |
| 键盘布局 | `bios/src/kernel/keyboard-driver.asm` 里的 `KEYMAP_NORMAL`、`KEYMAP_SHIFT`、`KEYMAP_CAPS`、`KEYMAP_CTRL`、`KEYMAP_ALT`、`KEYMAP_NUMLOCK` | 每个扫描码 2 字节（ASCII，扫描码） |
| 提示音 | `LIB_BEEP`（`bios/src/dos-shell/startup-and-library.asm`） | 改写 `SQ2_LO`、`SQ2_HI` 的值 |
| 文件、磁盘、键盘等服务的行为 | 各服务的入口例程（`FS_*`、`DISK_*`、`FDC_*`、`KEY_*`） | 对照 系统调用手册 |
| 增加新的系统调用 | 内核 ROM 表 `$E082`（功能号 `$10-$3A` 等），见 系统调用手册第 3 节 | 表项是 `.word 标签`；把某个未实现的功能号（表项指向 `$E150` 的桩例程，见系统调用表）改成指向新例程；新例程要放在内核区有空闲的位置（完整示例见第 7 节） |
| 增加新的 DOS 命令 | `bios/src/dos-shell/command-dispatch.asm` 里的 `DOS_CMD_NAMES`（命令名表）与 `DOS_CMD_TABLE`（地址表） | 名字表与地址表按序号对应；完整示例见第 8 节 |

## 5. 避开的坑

- **每个部分的长度固定。** `bios.json` 里每项占固定页数，汇编源文件汇编出来必须恰好是“页数 × 4096”字节，否则构建报错。往一页里加内容，就要在页尾的零填充里腾地方；填充用 `.byte $00,…`，删掉多少字节就要补回多少字节。
- **按偏移引用的数据不能随便移位。** 例如命令帮助、出错信息：DOS 靠表里的页号与地址找字符串（`LIB_PRINT_MESSAGE` 查 ROM 第 3 页的表），改文字时要保持每条字符串的长度不变，或者同步改表里的地址。表项已经是 `.word 标签` 的会自动跟着走，表在二进制数据里的则不会。
- **地址常量。** 立即数地址对已经写成 `#<标签`、`#>标签`，会随标签移动；没写成符号的数字地址（如 `LDX #低 / LDY #高` 传参、高低字节分开存放的表）不会，改动代码长度后要自己改。可以在源文件里搜 `$8`、`$9`、`$A`、`$B` 开头的 4 位十六进制数找。
- **页组的地址是汇编地址。** 同一页在不同页组里可能出现在不同窗口（见 [反汇编工程说明](../工程说明.md) 第 5 节），工程里只取执行最多的窗口作为汇编地址。
- **不同页组之间只有功能号，没有标签。** 跨页调用要经系统调用 `$25`、`$26`，不要直接 `JSR` 到别的页组的地址。
- **固定内核区（`$C000-$FFFF`）几乎是满的。** 想加代码，优先放在页组里；内核区尾部的 `$FF19` 之后有一大段零，但要避开 `$FFEA` 起的跳转入口和 `$FFFA` 起的向量。
- **Windows 下改文件别用会改编码的工具。** 源文件是 UTF-8，含中文注释；PowerShell 5.1 的 `Get-Content`/`Set-Content` 不带 `-Encoding UTF8` 会把中文写坏。
- **改汇编后重新构建时，如果提示“符号重复定义”或“未定义的标签”**，对照报错里的文件名与行号处理；标签在所有源文件之间共享。

## 6. 完整示例：改 DOS 的版本号

DOS 的 `ver` 命令显示“小霸王中文DOS操作系统 版本2.00”，字符串在 ROM 第 `$5F` 页（`$8610`）。把它改成 2.99：

```powershell
# 1. 标记工程为修改版（在 bios/ 目录里）
New-Item .modified -ItemType File
# 2. 在 src/messages/dos-messages-cn.asm 找到这一行，把版本号的 $30,$30（“00”）改成 $39,$39（“99”）
#    .byte $F7,$CF,$B5,$CD,$B3,$20,$B0,$E6,$B1,$BE,$32,$2E,$30,$30,$00,$BB ; $8610
# 3. 构建：报告“与原始 BIOS 有 2 个字节不同，分布在 ROM 第 5F 页”
npm run build
# 4. 在模拟器里启动（在 disassembly/ 目录里），进入 DOS，输入 ver
node tools/sb2kdbg.mjs --launch <绝对路径>\bios\build\SB2K_BIOS.NES
```

实测在模拟器里输入 `ver`，显示“小霸王中文DOS操作系统 版本2.99”。英文版在 `messages/dos-messages-en.asm`（`.ascii "SB-DOS Version 2.00"`），改法相同，但 DOS 实际显示的是中文版。

## 7. 完整示例：新增系统调用 `$35`

把功能号 `$35`（原来是空桩）实现成“取扩展版本号”：主版本写入 `SYS_PAGE`（`$0641`），次版本写入 `SYS_GROUP`（`$0642`）。系统调用不带回寄存器，结果只能经内存返回。

功能 `$10-$3A` 走内核 ROM 里的地址表 `SYSCALL_TABLE`（`bios/src/kernel/syscall-table.asm`，每项 2 字节，地址为 `$E082 + (功能号 - $10) * 2`），未实现的项指向 `SYSCALL_STUB`（`$E150`）的空桩。`$35` 的表项在 `$E0CC`。新代码放在内核区尾部的零填充 `KERNEL_FREE_SPACE`（`$FF1B` 起，共 207 字节，在 `bios/src/kernel/entry-vectors.asm`）。做两处修改（先建 `bios/.modified`）：

```asm
; 1. 地址表（syscall-table.asm）：把功能 $35 那一行的 SYSCALL_STUB 换成新例程
    .word API_35_BIOS_VERSION ; $35

; 2. 新例程（entry-vectors.asm）：把 KERNEL_FREE_SPACE 那一行的 16 个 $00 换成 11 字节代码 + 5 个 $00（总长不变）
KERNEL_FREE_SPACE:
API_35_BIOS_VERSION:
    LDA #$01
    STA SYS_PAGE
    LDA #$02
    STA SYS_GROUP
    RTS
    .byte $00,$00,$00,$00,$00
```

构建报告“与原始 BIOS 有 13 个字节不同，分布在 ROM 第 06、07 页”（表 2 字节 + 代码 11 字节）。用 fcdev 仓库的 `examples/sb2000/newcall` 验证：

```powershell
node packages/fcdev/bin/fcdev.mjs build examples/sb2000/newcall        # 在 fcdev 仓库根目录运行
Copy-Item <fcdev 仓库>\examples\sb2000\newcall\build\sb2000\NEWCALL.EXE out\nc-test\
node tools/make-floppy.mjs out\nc-test out\nc-test.img
# 用修改版、原始 ROM 各启动一次模拟器，进 DOS 后输入 newcall
```

实测：修改版显示 `BIOS EXT VER 1.2`，原始 BIOS 显示 `NOT SUPPORTED`（`newcall` 调用前把两个单元置为 `$FF`，空桩不会改写它们）。这个示例证明“地址表项改成 `.word 标签` + 在内核区空闲处放代码”这条路行得通。走 `SYSCALL_TABLE` 这张表的功能号是 `$10-$3A`、`$65`、`$67-$6C`、`$6E-$75`（见 `SYSCALL_DISPATCH`），其中指向空桩、可以直接用的是 `$16`、`$20-$23`、`$2D-$2F`、`$35-$3A`、`$67-$69`；功能 `$3B-$64` 等走其他路径，空桩表不适用。

## 8. 完整示例：新增 DOS 命令 `BEEP`

DOS 按“命令名表 + 地址表”查内部命令（代码在 `bios/src/dos-shell/command-dispatch.asm`）：`DOS_CMD_NAMES`（`$8891`）是以 0 结尾的命令名，以 `$FF` 结束；`DOS_CMD_TABLE`（`$8741`）每项 2 字节，第 N 项是第 N 个命令名的处理例程，例程以 `RTS` 返回。同一个命令的别名（`REN` 与 `RENAME`）各占一项。查不到的命令按程序文件执行。

名字表紧跟着代码，往表尾加名字会把后面的代码整体后移，需要确认没有数字写死的地址。更稳妥的做法是把整张名字表搬到 `dos-shell/session-start.asm` 末尾的空闲零填充（`$AE06-$AFFF`，共 506 字节），原位置的表保留为死数据。地址表尾的 `$876F` 原来是多余的 2 字节（`$5C,$AB`），正好放第 24 项，不用移动后面的代码。下面的示例添加命令 `BEEP`：响一声提示音并显示 `BEEP OK`（先建 `bios/.modified`）。三处修改：

```asm
; 1. 三处 LDA DOS_CMD_NAMES,Y（$885D、$8871、$887E）都改成 LDA DOS_CMD_NAMES_NEW,Y

; 2. 地址表末尾：把 .byte $5C,$AB 改成
    .word CMD_BEEP ; $876F

; 3. 把 dos-shell/session-start.asm 末尾 RTS ; $AE05 之后的前 11 行（共 176 个 $00）换成下面的内容 + 6 个 $00，总长不变
    RTS ; $AE05
DOS_CMD_NAMES_NEW:        ; 原来的 23 个名字原样写下，末尾加上 BEEP（序号 23）
    .ascii "CLJS\0EXIT\0DIR\0REN\0RENAME\0COPY\0SB-WIN\0TYPE\0DEL\0ERASE\0CLS\0DATE\0TIME\0CD\0CHDIR\0MD\0MKDIR\0RD\0RMDIR\0DISKCOPY\0REM\0VER\0HELP\0BEEP\0"
    .byte $FF
CMD_BEEP:
    JSR LIB_BEEP
    LDX #$00
CMD_BEEP_COPY:            ; 字符串复制到 ERAM $7E00，运行库显示 ERAM 字符串时 LIB_GROUP 写 0
    LDA CMD_BEEP_TEXT,X
    STA $7E00,X
    BEQ CMD_BEEP_SHOW
    INX
    BNE CMD_BEEP_COPY
CMD_BEEP_SHOW:
    LDA #$00
    STA STR_PTR_LO
    LDA #$7E
    STA STR_PTR_HI
    LDA #$00
    STA LIB_GROUP
    LDA #$01
    STA CURSOR_COL
    JSR LIB_PRINT_STRING
    LDA #$01
    STA CURSOR_COL
    JSR LIB_NEWLINE
    RTS
CMD_BEEP_TEXT:
    .ascii "BEEP OK\0"
    .byte $00 ; 用于补足总长
```

构建报告“与原始 BIOS 有 154 个字节不同，分布在 ROM 第 00、02 页”。实测：用这个 ROM 启动，在 DOS 下输入 `beep` 显示 `BEEP OK`，`ver`、`dir` 照常工作。提示音本身在模拟器里没有听验证。处理例程以 `RTS` 返回外壳；显示文字要先把 `CURSOR_COL` 置 1，否则文字会从光标当前列开始（实测不置 1 时 `BEEP OK` 会偏右）。

## 9. 验证清单

1. `node tools/bios-build.mjs` 成功，差异摘要里的页与你改动的页一致，没有意外的页。
2. `npm test` 全部通过。
3. 模拟器里能正常启动到 DOS 并执行 `ver`、`dir`。
4. 改动涉及的服务（键盘、文件、磁盘）用 fcdev 仓库 `examples/sb2000/` 里的示例程序走一遍：`hello`、`say`、`play`。
5. 想退回原版：删掉 `bios/.modified`，用 Git 还原 `bios/`，构建应再次显示“与原始 BIOS 逐字节一致”。
