# 小霸王学生电脑 SB2000 BIOS 源码工程

SB2000 BIOS 的 6502 汇编源码：可构建、可修改、可在模拟器里调试。用自写的汇编器 `tools/asm6502.mjs` 构建，不依赖 cc65；构建结果与原始 BIOS（`../reference/rom/SB2K_BIOS.NES`）逐字节一致。

> 状态：整理中（阶段 S2）。工具与目录就绪（S2.0），文件已按功能分目录、行尾标注已删除、符号文件已按功能拆分（S2.1）；例程与变量里的自动名已全部换成有含义的名字，1126 个全局标签都有结构化头注释，局部标签都按流程命名（S2.2）；还剩无标签数据块的格式说明和收尾工作（S2.3）。进度与方案见 [计划与进度](../disassembly/docs/计划与进度.md) 第 5 节。

## 目录

```text
bios/
  bios.json          清单：iNES 文件头、符号定义文件、按页顺序铺满 128 页的各个部分
  data-notes.json    数据块的人工说明（供数据区清单使用）
  variants.json      调试用的变体补丁（如跳过开机画面的 fastboot）
  src/               汇编源文件与符号定义，按功能分目录：
    boot/            开机启动程序
    kernel/          内核：复位与中断、声音、键盘鼠标、系统调用分发与基础服务
    dos-shell/       DOS 外壳：运行库、命令分发、外壳启动
    dos-commands/    DOS 内部命令：CD、DIR、MD、RD、TYPE、REN、DEL、COPY、CLS 等
    file-system/     文件系统：目录、FAT、文件操作
    disk/            软驱控制器与磁盘服务
    system-services/ 日期时间、程序运行、扩展 RAM 页分配
    display/         文字与单元显示
    image/           图案与映射解包、显示特效
    window/          窗口管理
    math/            数学库
    input-method/    中文输入法
    printer/         打印机
    karaoke/         卡拉 OK 歌词滚动
    messages/        DOS 出错信息（中英文）
    include/         符号定义：零页、系统内存、硬件寄存器、扩展 RAM
  assets/            二进制资源（字库、WAV、图片等）
  tools/             汇编器、构建脚本、改名工具
  test/              汇编器、构建与改名的单元测试
  build/             构建输出（不进 Git）
```

## 清单

`bios.json` 的 `includes` 列出只含符号定义（`NAME = 值`）的文件，不占 ROM 空间；`parts` 按页号顺序铺满 128 页，每项是下面两种之一：

```json
{ "firstPage": 0, "pageCount": 3, "base": 32768, "sources": ["src/dos-shell/startup-and-library.asm", "src/dos-shell/shell-helpers.asm", "src/dos-shell/command-dispatch.asm"] }
{ "firstPage": 16, "pageCount": 72, "binary": "assets/p10-p57.bin" }
```

规则：

- `sources` 的第一个文件写 `.org`（起始地址等于 `base`），后面的文件不写 `.org`，接在它后面继续汇编，合起来的长度必须恰好是“页数 × 4096”字节。一个文件是 ROM 里连续的一段，文件之间的顺序就是字节的顺序，不能打乱。
- 所有源文件（含 `includes`）一起汇编，全局标签与符号在文件之间共享，名字不能重复；符号定义可以先使用后定义。
- 局部标签 `@名字` 的作用域是同一个文件里从前一个全局标签到下一个全局标签之前，不同例程里可以重名。
- 要把一段二进制资源改成汇编源文件，把清单里的项换成 `sources`，源文件用 `.byte` 或指令写出对应的页数即可。

## 构建与调试

在本目录运行：

| 目的 | 命令 |
| --- | --- |
| 构建并与原始 ROM 比对 | `npm run build`（输出 `build/SB2K_BIOS.NES`） |
| 只构建不比对 | `node tools/bios-build.mjs --no-compare` |
| 构建调试变体（跳过开机画面） | `npm run build:fast`（输出 `build/SB2K_BIOS_FASTBOOT.NES`） |
| 单元测试 | `npm test` |
| 给标签或符号改名并写注释 | `node tools/bios-rename.mjs --file 映射文件`（每行“旧名 新名 [注释]”） |
| 把一个源文件按标签拆成几个文件，或把符号文件按取值范围拆开 | `node tools/bios-split.mjs 方案.json`（格式见文件头；拆完自动重新构建，ROM 有变化就恢复原状） |
| 把只被同一例程内分支引用的自动名标签改成局部标签 | `node tools/bios-localize.mjs [--dry] [--drop-unreferenced] [--keep=名字,名字]`（`--dry` 只统计；`--drop-unreferenced` 删除没有任何引用的自动名；改完 ROM 必须不变） |

在模拟器里运行构建出的 ROM：到 `../disassembly/` 目录运行 `node tools/sb2kdbg.mjs --launch <build/SB2K_BIOS.NES 的绝对路径>`，调试服务的命令见与本仓库同级的 fcdev 仓库的 `virtuanes/README.md`。修改 BIOS 的完整流程与示例见 [修改 BIOS 指南](../disassembly/docs/drafts/修改BIOS指南.md)。

目录里有 `.modified` 文件时表示 BIOS 已经有意修改过，构建不再因为与原始 ROM 不同而报错，只报告差异的字节数与所在的页。

## 汇编语法

见 `tools/asm6502.mjs` 的文件头：指令、`label:`、`@局部标签:`、`.org`、`.rorg/.rend`、`.byte`、`.word`、`.ascii`、`NAME = 值`、`#<标签`、`#>标签`、标签加减偏移。符号值不超过 `$FF` 时按零页寻址，否则按绝对寻址，所以绝对寻址的低地址（如 `LDA $0010`）保持数字写法。

## 命名与注释规范

整理后的源码按下面的规则写，新增代码也按它写。

**文件**
- 目录按功能分（内核、DOS 外壳、文件系统、磁盘、显示、数学、声音、输入法、打印机、开机……），文件名用小写字母与连字符，写功能，不写 ROM 页号。
- 每个文件有文件头：名称、说明、作者、邮箱、日期、备注。

**名字**
- 例程入口与全局标签用大写字母与下划线，前缀写所属模块，后面写做什么，如 `FS_OPEN`、`KEY_SCAN`；不用 `P00_802C` 这样的地址名。
- 例程内部的跳转目标一律用局部标签，小写，写含义，如 `@loop`、`@done`、`@error`、`@next`。
- 符号定义按功能分文件（硬件寄存器、系统变量、系统调用号、各模块私有变量）；硬件寄存器用 `IO_`、`PPU_`、`APU_` 等前缀，变量名写含义，不用 `RAM_0640` 这样的地址名。

**注释**
- 每个例程上方写头注释：作用、输入（寄存器与内存）、输出、副作用（改写了什么）、调用者；没有的项省略。
- 数据块前写明格式：项数、每项的大小与含义、谁来读它。
- 行尾注释只写代码本身看不出的关键点；不写地址，也不写“推断”“启发式”“未访问”之类的来源标记（这些分类只出现在生成的覆盖率报告里）。
- 中文注释，标点用全角。

## 与 disassembly/ 的关系

[../disassembly/](../disassembly/) 放分析与验证的工具和过程文档：覆盖率统计、例程规格表、数据区清单、验证用例等都读取本目录，通过 `tools/config.mjs` 的 `BIOS_DIR` 引用；把 ROM 转成源码的一次性工具已经删除，本目录的源码只靠手工维护。
