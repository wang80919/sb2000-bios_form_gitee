# 参考资料

反汇编、验证和测试用到的原版文件，入库保留。路径常量见 `disassembly/tools/config.mjs`。

| 目录 | 内容 |
| --- | --- |
| `rom/` | `SB2K_BIOS.NES`：SB2000 的 BIOS（512KB，含 16 字节 iNES 文件头），整个反汇编工程的对象，`disassembly/asm/` 重新汇编的结果与它逐字节一致；`bbk_bios10.nes`（128KB）、`bbk_bios20.nes`（2MB）：小霸王其他版本的 BIOS，没有做分析 |
| `floppy-images/` | 官方全部 22 张软盘（`FLPPY0`-`FLPPY21`），都是 1.44MB 的原始 `.img`，模拟器可直接挂载。`FLPPY1` 是 WPS 文字处理系统，`FLPPY18`-`FLPPY21` 是游戏集锦 |
| `floppy-dos.img` | DOS 开机镜像：1.44MB 的 FAT12，不含 `AUTOEXEC.BAT`，开机停在 DOS 提示符，里面有 `HELLO.TXT`；`collect-cdl.mjs` 的 DOS 场景与 `verify-run.mjs` 的验证用例使用 |
| `nes-games/` | 6 个 NES 游戏，用于 [NES 兼容模式研究](../disassembly/docs/research/NES兼容模式研究.md) 里 `play` 程序的测试 |

## 官方软盘的内容

- `FLPPY1`（WPS 文字处理系统）是标准 FAT12，含 DOS 工具、`SB-WIN.EXE`、`WPS.EXE`、输入法模块 `WBX.BIN`/`BXM.BIN`/`RZM.BIN`；`AUTOEXEC.BAT` 依次执行 `install wbx` 与 `sb-win.exe`，启动后进入 SB-Win98 图形环境并自动进入 “SUBOR-WPS 2.00” 文字处理主菜单。
- 游戏集锦软盘（如 `FLPPY20`，“游戏集锦(027)”）只有 `GAME.EXE`（3456 字节）与 `AUTOEXEC.BAT`（内容 `game`），启动后显示游戏集锦菜单；游戏数据不在文件系统里，装载方式见 [NES 兼容模式研究](../disassembly/docs/research/NES兼容模式研究.md) 第 3 节。
- 导出镜像里的文件：`disassembly/tools/export-image-tree.mjs`，用法见 [工程说明](../disassembly/docs/工程说明.md) 第 3 节。
