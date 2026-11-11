# 反汇编工程

用修改过的 VirtuaNES（在与本仓库同级的 fcdev 仓库的 `virtuanes/` 里维护）运行 `SB2K_BIOS.NES`（小霸王学生电脑 BIOS，内含 SB-DOS），由脚本自动驱动模拟器、采集“哪些字节被当作代码或数据”，得到可重新汇编、且与原始 ROM 逐字节一致的汇编工程（现在在 [../bios/](../bios/)），再用验证用例逐个确认 BIOS 的行为，整理出 SB-DOS 的接口。本目录放分析与验证的工具和过程文档。

计划、进度、已发现的问题见 [docs/](docs/README.md)。

## 环境

- Windows，Node.js 22 及以上（脚本无第三方依赖）。
- 驱动模拟器的脚本需要先编译与本仓库同级的 fcdev 仓库的 `virtuanes/`（见该目录的 `README.md`），`tools/config.mjs` 的 `EMULATOR_EXE` 指向它的 `out/Release/bin/VirtuaNES.exe`。

## 常用命令

在本目录里运行：

| 目的 | 命令 |
| --- | --- |
| 单元测试 | `npm test` |
| 构建 BIOS 并与原始 ROM 逐字节比对 | 在 `../bios/` 里运行 `npm run build` |
| 一键构建、测试、更新生成文档 | `node tools/bios-all.mjs --write`（`npm run docs`） |
| 运行验证用例（`--only 前缀` 只跑一部分） | `node tools/verify-run.mjs [--fast] [--only 前缀]` |
| 覆盖率 | `npm run coverage` |
| 功能号验证状态 | `node tools/api-verify-status.mjs` |
| 手动驱动模拟器 | `node tools/sb2kdbg.mjs "run 60" "type dir\n" "run 100" "shot out/dir.png"` |

其余命令、采集流程与 ROM 页地图见 [工程说明](docs/工程说明.md)，验证用例的格式见 [verify/README.md](verify/README.md)。

## 目录

| 路径 | 内容 |
| --- | --- |
| `tools/` | 命令行与库：模拟器客户端、反汇编、CDL 清单、软盘镜像、文档生成、验证运行 |
| `verify/` | 验证用例与辅助库 |
| `test/` | 单元测试 |
| `docs/` | 文档，地图见 [docs/README.md](docs/README.md) |
| `out/` | 生成物（大部分已被忽略，可重新生成） |

## 配置

| 名称 | 说明 | 默认值 | 必填 |
| --- | --- | --- | --- |
| `FCDEV_DEBUG_PORT` | 模拟器调试服务的端口，未设置则不启动调试服务 | 无（工具默认使用 5677） | 否 |
