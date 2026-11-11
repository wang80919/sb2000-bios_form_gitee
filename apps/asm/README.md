# ASM

SB-DOS 下运行的 6502 汇编器，独立生成 `ASM.EXE`。程序支持官方 6502 指令、常用寻址方式、标签与常量，并通过银行切页生成大于 16 KiB 的 SB-DOS 程序。

## 构建

在 Windows 上使用 Node.js 22 及以上版本：

```powershell
npm install
npm run build
```

产物为 `build/sb2000/ASM.EXE`。运行模拟器需要在 `fcdev.json` 中配置 BIOS 路径。

## 使用

在 SB-DOS 提示符下运行 `ASM 源文件 [输出文件]`。源文件没有扩展名时补 `.ASM`；不写输出文件时，输出名取源文件主名加 `.EXE`。不带参数运行时，按提示输入源文件名。汇编出错时显示出错行号与原因。文件名遵循 DOS 8.3 格式。

在 `EDIT.EXE` 里按 F5 会先保存当前文件，再用这种方式调用 `ASM.EXE`，所以两个程序要放在同一张磁盘上。

## 文档

- [docs/汇编语法.md](docs/汇编语法.md)：源文件写法、寻址方式、伪指令、程序布局、限制和错误信息。
- [docs/开发文档.md](docs/开发文档.md)：内部实现、库页分配、两遍汇编、跨银行调用和验证方法。
- [examples/hello.asm](examples/hello.asm)：控制台输出“你好，小霸王！”的示例，用 `.include` 引入系统接口的符号文件 [examples/SB2000.INC](examples/SB2000.INC)；汇编时两个文件要放在同一张磁盘上。
- [examples/sum.asm](examples/sum.asm)：把内存里的 10 个数相加，把结果转成十进制，在控制台输出“1+2+...+10 = 55”，同样要和 `SB2000.INC` 放在同一张磁盘上。

## 限制

- 运行需要 BIOS；在 `fcdev.json` 中配置 `firmware` 路径。
- 其他限制见 [docs/汇编语法.md](docs/汇编语法.md) 的“限制”一节。