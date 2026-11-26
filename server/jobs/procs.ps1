$ErrorActionPreference = 'SilentlyContinue'
$src = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class Cwd {
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint a, bool b, int pid);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr h, IntPtr addr, byte[] buf, IntPtr size, out IntPtr read);
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr h, int cls, byte[] pbi, int len, out int ret);
  static IntPtr Ptr(IntPtr h, IntPtr addr) {
    var b = new byte[8]; IntPtr r;
    if (!ReadProcessMemory(h, addr, b, (IntPtr)8, out r)) return IntPtr.Zero;
    return (IntPtr)BitConverter.ToInt64(b, 0);
  }
  public static string Get(int pid) {
    IntPtr h = OpenProcess(0x0410, false, pid);
    if (h == IntPtr.Zero) return null;
    try {
      var pbi = new byte[48]; int ret;
      if (NtQueryInformationProcess(h, 0, pbi, 48, out ret) != 0) return null;
      IntPtr peb = (IntPtr)BitConverter.ToInt64(pbi, 8);
      IntPtr pp = Ptr(h, (IntPtr)(peb.ToInt64() + 0x20));
      if (pp == IntPtr.Zero) return null;
      var us = new byte[16]; IntPtr r;
      if (!ReadProcessMemory(h, (IntPtr)(pp.ToInt64() + 0x38), us, (IntPtr)16, out r)) return null;
      int len = BitConverter.ToUInt16(us, 0);
      IntPtr buf = (IntPtr)BitConverter.ToInt64(us, 8);
      if (len <= 0 || len > 4096 || buf == IntPtr.Zero) return null;
      var sb = new byte[len];
      if (!ReadProcessMemory(h, buf, sb, (IntPtr)len, out r)) return null;
      return Encoding.Unicode.GetString(sb);
    } finally { CloseHandle(h); }
  }
}
'@
# Biên dịch C# (csc) có lúc mất ~10s, nên chỉ làm một lần ra DLL trong %TEMP% rồi các lần quét sau chỉ nạp lại.
# Đổi mã C# ở trên thì tăng số phiên bản trong tên file.
$dll = Join-Path $env:TEMP 'devdeck-cwd-v1.dll'
if (-not (Test-Path $dll)) {
  $tmp = "$dll.$PID.tmp"
  Add-Type -TypeDefinition $src -OutputAssembly $tmp
  try { Move-Item $tmp $dll -Force } catch { Remove-Item $tmp -Force }
}
if (Test-Path $dll) { Add-Type -Path $dll } else { Add-Type -TypeDefinition $src }
# Chỉ đọc cwd của runtime/công cụ có thể là job (khớp JOB_EXE trong index.js); tiến trình khác bỏ qua cho nhanh
$jobExe = '^(node|bun|deno|python[\d.]*|pythonw|py|dotnet|java|javaw|go|cargo|rustc|php|ruby|mvn|gradle|gradlew|npm|npx|pnpm|yarn|vitest|jest|pytest|tsc|vite|webpack|esbuild|playwright|cypress|.+\.test)(\.exe|\.cmd)?$'
$out = foreach ($p in Get-CimInstance Win32_Process) {
  if ($p.ProcessId -le 4) { continue }
  [pscustomobject]@{
    pid = [int]$p.ProcessId; ppid = [int]$p.ParentProcessId; name = $p.Name
    cmd = $p.CommandLine; cwd = if ($p.Name -match $jobExe) { [Cwd]::Get([int]$p.ProcessId) } else { $null }
    cpu = [int64]($p.KernelModeTime + $p.UserModeTime)
    mem = [int64]$p.WorkingSetSize; start = if ($p.CreationDate) { $p.CreationDate.ToUniversalTime().ToString('o') } else { $null }
  }
}
$out | ConvertTo-Json -Compress -Depth 3
