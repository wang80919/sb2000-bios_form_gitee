# runnes

在小霸王学习机 SB2000（SB-DOS）的 DOS 下运行 NES 游戏，用 fcdev 开发，C 语言。汇编版是 fcdev 仓库的 `examples/sb2000/play`，做法相同。

## 使用

把 `RUNNES.EXE` 与游戏文件（文件名要符合 8.3）放在同一张盘里，在 DOS 提示符下输入：

```text
runnes mario.nes
```

读入游戏需要一会儿，之后直接进入游戏。游戏里不能回到 DOS，只能硬复位。

| 支持 | 不支持 |
| --- | --- |
| mapper 0 与 4（MMC3），PRG、CHR 各不超过 128K | PRG 或 CHR 超过 128K、没有 CHR（CHR-RAM）、带 trainer、其他 mapper |

文件超过 256K+16 字节时只读前面这部分（有的 `.nes` 文件末尾带说明文字）。出错时显示提示，按任意键返回 DOS：

| 提示 | 原因 |
| --- | --- |
| `Usage: RUNNES FILE.NES` | 没有给文件名 |
| `Can't open file` | 文件打不开 |
| `No memory` | 扩展 RAM 放不下文件 |
| `Read error` | 读盘出错 |
| `Not an iNES file` | 不是 iNES 文件 |
| `Mapper not supported` | mapper 不是 0 或 4 |
| `Size not supported` | 超出上表的支持范围 |
| `File is truncated` | 文件比头里写的 PRG、CHR 大小短 |
| `Program too big` | 本程序自己超过 8K，没有空闲的窗口可用于复制，改程序时要保持精简 |

## 构建

```bash
npm run build    # 生成 build/sb2000/RUNNES.EXE
npm run disk     # 生成只放有 RUNNES.EXE 的软盘镜像 build/sb2000/RUNNES.img
```

程序名必须符合 DOS 8.3 规则（主名不超过 8 个字符），在 `fcdev.json` 的 `name` 里修改。

## 在模拟器里运行（只支持 Windows）

fcdev 不提供 BIOS。先在 `fcdev.json` 里用 `firmware` 指定 SB2000 的 BIOS 文件：

```json
{ "target": "sb2000", "name": "runnes", "firmware": "D:/rom/SB2K_BIOS.NES" }
```

```bash
npm start
```

`npm start` 的镜像里只有 `RUNNES.EXE`，要试游戏时用 fcdev 的 `fat-floppy` 打包器另做一张放有游戏文件的镜像，再用调试命令 `disk <镜像>` 挂载。

## 文件

| 文件 | 说明 |
| --- | --- |
| `src/runnes.c` | 程序：读入并检查 iNES 文件，用 DMA 复制到第 3 个 128K 窗口，改 RESET 向量后进入 FC 兼容模式；硬件细节见 sb2000 仓库 `disassembly/docs/research/NES兼容模式研究.md` |
| `fcdev.json` | fcdev 配置：目标 sb2000，程序名 runnes |

## 查阅接口

运行库把 DOS 的系统调用封装成了 C 函数（文字、键盘手柄鼠标、文件目录、软驱、显示、声音等），头文件是 `sb2000.h`。随时查询：

```bash
npx fcdev api               # 列出全部模块
npx fcdev api file          # 看模块里的函数
npx fcdev api sb_file_open  # 看一个函数的完整文档
npx fcdev api '$7B'         # 看用到某个系统调用的函数
```

## 程序超过 16K

在 `fcdev.json` 里加 `"targetOptions": { "banks": 库页个数 }`，把部分函数用 `SB_BANK_BEGIN(n)` 与 `SB_BANK_END()` 放进库页，声明处用 `SB_BANK_CALLS_BEGIN(n)` 与 `SB_BANK_CALLS_END()` 包起来，调用时自动换页。函数的用法用 `npx fcdev api bank` 查，写法与限制见 `node_modules/fcdev/targets/sb2000/include/sb2000-bank.h` 文件头的说明。