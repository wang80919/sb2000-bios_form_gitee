# SB2000

小霸王学生电脑 SB2000（SB-DOS）的 BIOS 反汇编工程，以及在它之上整理出的 BIOS 源码。

## 目录

| 目录 | 内容 | 状态 |
| --- | --- | --- |
| [disassembly/](disassembly/) | 反汇编过程资料：分析与验证工具、验证用例、过程文档 | 进行中（阶段 C） |
| [bios/](bios/) | 正式 BIOS 源码工程：可构建、可修改、可在模拟器里调试（自写汇编器构建，与原始 ROM 逐字节一致，不转 ca65） | 进行中（阶段 S2） |
| [reference/](reference/) | 原版 ROM、官方软盘、NES 游戏 | |
| [apps/](apps/) | 用 fcdev 开发的 SB-DOS 应用程序，一个程序一个子目录；目前有 [runnes](apps/runnes/)（在 DOS 下运行 NES 游戏）、[asm](apps/asm/)（6502 汇编器，生成 SB-DOS 的 EXE）、[edit](apps/edit/)（文本编辑器，F5 调用汇编器）；[disk](apps/disk/) 把三个程序的 EXE、`SB2000.INC` 与 `README.TXT` 做成一张软盘镜像（`node apps/disk/build-disk.mjs`） | |

计划、进度与待确认事项见 [disassembly/docs/计划与进度.md](disassembly/docs/计划与进度.md)。

## 环境

- Windows，Node.js 22 及以上（脚本无第三方依赖）。
- 编译模拟器需要 Visual Studio（含“使用 C++ 的桌面开发”）。

## 快速开始

```powershell
cd disassembly
npm test                       # 单元测试
node tools/bios-build.mjs      # 构建 BIOS 并与原始 ROM 逐字节比对
```

模拟器在与本仓库同级目录的 fcdev 仓库的 `virtuanes/` 里维护，编译与调试服务见它的 `README.md`；反汇编工具链的使用见 [disassembly/README.md](disassembly/README.md)。
