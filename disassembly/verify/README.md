# 验证用例

用来在模拟器里直接调用 BIOS 的系统调用或固定区例程，把输入写进内存，运行，再读回结果与预期比较。目的有两个：让普通场景走不到的例程被真正执行（覆盖率），并对有明确语义的功能给出可重复的正确性证据。

## 运行

1. 构建 ROM：`node tools/bios-build.mjs`
2. 开机用的 DOS 镜像是 `reference/floppy-dos.img`（入库，不是生成的）。
3. 运行全部用例：`node tools/verify-run.mjs`（自己启动并关闭模拟器），或先 `node tools/sb2kdbg.mjs --launch <ROM 绝对路径>` 再 `node tools/verify-run.mjs --attach`。
4. 只跑一部分：`--only p09.fp`（按编号前缀；此时不保存 CDL）。
5. 完整运行结束时，本次 CDL 保存为 `out/cdl/verify-rom.cdl`，并把 `out/cdl/` 里所有场景的 CDL 合并成 `out/cdl/all-rom.cdl`，随后 `npm run coverage` 看覆盖率。

临时调用一次：`node tools/rom-call.mjs func=4B sub=0 mem=069A:640007 read=069A:3`（全部十六进制，字节串连续书写）。

## 用例文件

`verify/cases/*.mjs`，导出 `cases` 数组。每个用例：

| 字段 | 含义 |
| --- | --- |
| `id` | 唯一编号，如 `p09.div16.100-7` |
| `title` | 一句话说明 |
| `func`、`sub` | 功能号写入 `$063E`、子功能写入 `$063F`，再 `JSR $FFF0` |
| `addr` | 改为直接 `JSR` 到固定区（`$C000-$FFFF`）的地址，不设功能号 |
| `a`、`x`、`y` | 调用时的寄存器 |
| `mem` | 调用前写入的内存，`[[地址, 字节]]`，字节是十六进制串或数组 |
| `expect` | 调用后预期的内存，`[[地址, 字节]]` |
| `check` | 函数，参数是读回结果，返回问题说明数组；用于需要容差等复杂判断 |
| `read` | 额外读回的内存范围，`[[地址, 长度]]` |
| `capture` | 调用期间要记录写入的地址列表，如 `[0x4025]`（用模拟器的 `io` 命令记录），结果在 `result.writes` |
| `expectWrites` | 预期的写入字节序列，`[[地址, 字节]]`，必须同时给 `capture` |
| `readPram` | 调用后读回扩展 RAM，`[[偏移, 长度]]`；页号 $80 对应偏移 0，每页 4096 字节，结果在 `result.pram` |
| `steps` | 按顺序执行的多个步骤。每步是调用说明（字段同上）、函数 `(history, ctx) => 调用说明`（用前面各步结果算参数），或 `{ host: async (client, history, ctx) => 结果, check }` 主机端动作（键盘输入、注入手柄、保存磁盘镜像等） |
| `finalCheck` | 函数 `(history) => 问题说明数组`，全部步骤执行完后检查 |
| `freshAfter` | 为 true 时用例结束后重新开机（写盘用例必须设，让模拟器重新加载已还原的镜像） |
| `prepareImage` | 函数 `(ctx) => void`，用例开机前调用，一般把特制镜像写进 `ctx.image`（见 `verify/lib/images.mjs` 的 `withImage`）；用例结束后 `verify-run.mjs` 自动还原测试镜像，这类用例的磁盘检查不能用 `verify/lib/disk-check.mjs` 里依据原样镜像的 `untouchedProblems`，要用自己镜像的数据 |
| `maxFrames` | 多少帧内没返回算挂起，默认 120 |
| `settle` | 调用返回后再多跑几帧（在读回内存、结束 `capture` 之前），让 NMI 里的后台更新执行 |
| `sei` | 为 true 时桩代码先 PHP、SEI，调用返回后 PLP 恢复，调用期间不会被 IRQ 打断；完整开机后定时器、键盘的 IRQ 随时会来，记录写入或改写中断钩子的用例要设它 |
| `fresh` | 为 true 时先重新开机 |
| `group`、`quiet` | 同组连续挂起两次就跳过其余；`quiet` 表示通过时不打印 |

没有 `expect` 与 `check` 的用例只表示“调用返回了”（只跑到，没有校验），结果里记为 `run`；有的记为 `verify`。挂起后会重新开机。

## 做法与限制

- 磁盘镜像：`verify-run.mjs` 把镜像（默认 `reference/floppy-dos.img`）复制成 `out/verify/floppy-pristine.img`（原样备份）和 `out/verify/floppy-test.img`（模拟器加载的测试镜像）；写盘用例用模拟器的 `savedisk` 保存镜像，用 `verify/lib/fat12.mjs`（独立的 FAT12 读取器）解析后检查，然后 `ctx.restore()` 还原。用例模块要的原样镜像信息见 `verify/lib/disk-check.mjs`。
- 外壳命令用例（`p60-shell.mjs`）第一步就在提示符下用键盘输入，不能先用桩代码调用（桩会让外壳主循环停下）。
- 屏幕文字验证：屏幕上的文字是画进名称表的字形，读不回字符，所以 `verify/lib/screen-text.mjs` 用 `calllog` 在运行库显示例程 `LIB_PRINT_STRING`（`$8262`）入口记录 `$4B/$4C` 指向的字符串（取外壳字符串区 `$6300-$6AFF` 与 ROM 第 3 页映射区 `$B000-$BFFF`），按 GBK 解码、合并连续重复，还原成文字行；`shellText(命令)` 在提示符下输入命令并返回文字行，`moreText(按键)` 在命令等输入时继续按键。已知局限：输入回显里连续相同的字符（如 hello 的两个 l）会合并成一个；通过键盘输入 `*` 要用小键盘乘号，`:`、`\` 等要 Shift，Shift 要先按下等几帧、先松开键再松开 Shift（模拟器按扫描码顺序发键，同帧按下会错序）。
- 外壳输出与提示用例：`p60-shell-output.mjs`（ver、dir 及 /a /b /w、通配符、type、help，文件名、大小、日期、统计数、空闲字节数、卷序列号由 FAT12 读取器算出预期）、`p60-shell-messages.mjs`（copy、del、ren、md、rd、cd 的正常与出错路径，提示文字与磁盘结果一起检查，出错路径要求磁盘不变）、`p60-shell-clock.mjs`（date、time 的设置、非法参数与 ERAM 变量）。
- 子目录、copy 变体与出错路径：`p60-shell-dirs.mjs`（md、cd、dir 在子目录里的显示，copy 到目录、带路径、带盘符、/a /v，多文件、单参数、重名、非空目录、dir /p 分页、del *.*、缺参数等，磁盘用 `verify/lib/disk-check.mjs` 的 `leakProblems` 检查簇没有泄漏）。
- 特制镜像用例：`verify/lib/images.mjs` 的 `withImage` 现场生成镜像（`pattern` 按簇序号填充互不相同的内容）。`p58-fs-special.mjs`（碎片簇链、磁盘写满、根目录写满、长文本 type），`p5e-diskcopy.mjs`（写满数据的镜像上 diskcopy：每轮读缓冲与镜像区段一致，主机改写读缓冲后写“目标盘”，镜像里出现改写的字节）。
- 按句柄的文件系统服务：`p58-fs-handle.mjs`（`$7C/$05` 按偏移读、`$7C/$06` 按偏移写、`$7C/$07-$0C` 设置日期时间属性及非法值）；文件系统用例共用的地址与步骤在 `verify/lib/fs-steps.mjs`。
- 软驱故障与边界输入：模拟器（fcdev 仓库的 `virtuanes/`）的 `fdc` 命令能让软驱控制器出故障（取盘 `eject`、没有索引脉冲 `noindex`、写保护 `wp`、磁头卡住 `seekfail`、控制器不响应 `dead`、指定逻辑扇区读时校验错 `bad`，`clear` 恢复，`status` 查看），用例用主机步骤发命令再调用服务。`p5c-disk-faults.mjs`（`$80` 各服务在各种故障下的状态码、坏扇区连读与逐扇区扫描位图、`$80/$01` 格式化磁道）、`p58-fs-faults.mjs`（`$7B/$01`、`$7B/$02`、`$7B/$10`、`$7C/$0E`、`$7C/$0F`、`$7C/$10` 在软驱故障下的出错码，读整个文件时读到坏扇区为止）、`p58-fs-fat-range.mjs`（FAT 项读写的簇号越界与超过 12 位的值）、`p58-fs-dir-edge.mjs`（只读目录、子目录写满时创建文件）；共用定义在 `verify/lib/fat-cache.mjs`、`verify/lib/fs-image.mjs`。故障用例每个都要 `fresh`、`freshAfter`（重新开机，同时清掉故障）。运行验证时模拟器要保持“后台运行”（新版默认开启），否则窗口失去焦点会暂停。
- 输入与磁盘驱动：`p04-keyboard.mjs`（注入按键，在 Shift、右 Shift、CapsLock、Ctrl、Alt、NumLock 各状态下读 ERAM 按键队列，与 `verify/lib/ibm-keys.mjs` 的标准 IBM 美式键盘表逐键比对，登记与 IBM 不同的实测组合；修饰键标志、指示灯、队列容量、`$6B/$00`、`$17`）、`p04-mouse.mjs`（`mouse move`、`mouse btn` 注入位移与按键：坐标累加限幅、点击、拖动、双击及双击间隔参数）、`p04-pad.mjs`（手柄）、`p04-sound.mjs`（`$65/$02-$05` 的内存语义）、`p5c-disk.mjs`（`$80/$04`、`$05` 按面磁道扇区读写、页内偏移、越界状态、`$80/$02`、`$03` 扇区缓冲，几何与镜像字节作预期）。
- 桩代码放在扩展 RAM `$7F00`，PC 直接指过去，调用返回后停在桩里的原地循环处。
- 模拟器的存档读取（`loadstate`）会让它崩溃，所以不用存档隔离，用例共享同一次开机。
- 复位开机（`resetToDos`）时先发模拟器命令 `audio fast`，开机音乐不再等声卡按真实时间播放，开机后发 `audio real` 恢复；一次开机约 1.3 秒（原约 4.8 秒），开机后系统 RAM 与 PC 同真实时间开机完全一致。用例运行中的语音与 WAV 仍按真实时间。
- 预期值要来自独立的计算或已知语义，不能把 BIOS 的输出抄回来当预期。
- 模拟器有并口虚拟打印机：打印机服务（功能 `$76-$7A`）收到 `ESC @` 会弹出“Print to...”模态对话框，`verify-run.mjs` 运行时自动启动 `tools/dialog-watch.mjs` 应答（打印对话框点“确定”，保存文件对话框直接关闭）；手工调用打印机功能时也要先运行它。语音端口 `$4302` 子功能 10 以上、`$75` 还没搞清格式，只跑到。
