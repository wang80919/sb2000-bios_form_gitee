// ------------------------------------------------------------------------
// 名称：dialog-watch.mjs
// 说明：自动应答模拟器弹出的对话框：虚拟打印机的“Print to...”对话框点“确定”（默认输出 PNG），之后弹出的保存文件对话框直接关闭（取消保存）。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：用法 node tools/dialog-watch.mjs [进程名，默认 VirtuaNES]；Ctrl+C 结束。
//       模拟器收到打印机的 ESC @ 后会弹模态对话框，不应答就卡住模拟线程与调试连接；verify-run.mjs 运行时会自动启动本监视器。
//       只处理属于模拟器进程的 #32770 对话框：标题是 Print to... 的发 WM_COMMAND(IDOK)，其余发 WM_CLOSE。
//       用 PowerShell 5.1 调 user32.dll，脚本以 -EncodedCommand 传入，避免中文编码问题。
// ------------------------------------------------------------------------
import { spawn } from 'node:child_process';
import path from 'node:path';
import { EMULATOR_EXE } from './config.mjs';

/** PowerShell 脚本：每 200 毫秒扫描一次顶层窗口；全部是 ASCII，进程名通过变量传入 */
export function buildWatchScript(processName) {
  return `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class DlgWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
}
"@
$name = '${processName}'
while ($true) {
  $pids = @(Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
  if ($pids.Count -gt 0) {
    $cb = [DlgWin+EnumProc]{
      param($h, $l)
      if (-not [DlgWin]::IsWindowVisible($h)) { return $true }
      $procId = 0
      [void][DlgWin]::GetWindowThreadProcessId($h, [ref]$procId)
      if ($pids -notcontains $procId) { return $true }
      $cls = New-Object System.Text.StringBuilder 64
      [void][DlgWin]::GetClassName($h, $cls, 64)
      if ($cls.ToString() -ne '#32770') { return $true }
      $title = New-Object System.Text.StringBuilder 256
      [void][DlgWin]::GetWindowText($h, $title, 256)
      if ($title.ToString() -like 'Print to*') {
        [void][DlgWin]::PostMessage($h, 0x111, [IntPtr]1, [IntPtr]::Zero)
        [Console]::WriteLine('answered: Print to... -> OK')
      } else {
        [void][DlgWin]::PostMessage($h, 0x10, [IntPtr]::Zero, [IntPtr]::Zero)
        [Console]::WriteLine('closed: ' + $title.ToString())
      }
      return $true
    }
    [void][DlgWin]::EnumWindows($cb, [IntPtr]::Zero)
  }
  Start-Sleep -Milliseconds 200
}
`;
}

/**
 * 启动监视器子进程。
 * @param {string} [processName] 模拟器进程名（不含 .exe）
 * @param {(line: string) => void} [onLine] 收到应答记录时的回调
 * @returns {{stop: () => void}}
 */
export function startDialogWatcher(processName = path.basename(EMULATOR_EXE, '.exe'), onLine = () => {}) {
  const encoded = Buffer.from(buildWatchScript(processName), 'utf16le').toString('base64');
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { stdio: ['ignore', 'pipe', 'ignore'] });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => chunk.split(/\r?\n/).filter(Boolean).forEach(onLine));
  return { stop: () => child.kill() };
}

if (process.argv[1]?.endsWith('dialog-watch.mjs')) {
  const watcher = startDialogWatcher(process.argv[2], (line) => console.log(line));
  process.on('SIGINT', () => {
    watcher.stop();
    process.exit(0);
  });
}
