<#
  Chạy DevDeck nền (không cần Electron): Task Scheduler khởi động `node server/index.js` mỗi lần đăng nhập.
  Dùng:
    powershell -ExecutionPolicy Bypass -File scripts/autostart.ps1 install [-Port 4317]
    powershell -ExecutionPolicy Bypass -File scripts/autostart.ps1 status
    powershell -ExecutionPolicy Bypass -File scripts/autostart.ps1 uninstall
  Cần đã chạy `npm run build` (server phục vụ thư mục dist/). Không cần quyền admin: task chạy dưới tài khoản hiện tại.
#>
param(
  [Parameter(Position = 0)][ValidateSet('install', 'uninstall', 'status')][string]$Action = 'status',
  [int]$Port = 4317
)
$ErrorActionPreference = 'Stop'
$Name = 'DevDeck'
$Root = Split-Path -Parent $PSScriptRoot

switch ($Action) {
  'install' {
    if (-not (Test-Path (Join-Path $Root 'dist\index.html'))) { throw 'Chưa có dist/. Chạy "npm run build" trước.' }
    $node = (Get-Command node -ErrorAction Stop).Source
    # conhost --headless: chạy node không hiện cửa sổ console (Windows 11 / Windows 10 mới)
    $cmd = "set PORT=$Port&& `"$node`" `"$(Join-Path $Root 'server\index.js')`""
    $act = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless cmd.exe /c `"$cmd`"" -WorkingDirectory $Root
    $trg = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName $Name -Action $act -Trigger $trg -Settings $set -Description 'DevDeck server nền (http://localhost)' -Force | Out-Null
    Start-ScheduledTask -TaskName $Name
    Write-Host "Đã cài task '$Name' và khởi động. Mở http://localhost:$Port"
  }
  'uninstall' {
    if (Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue) {
      Stop-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
      Unregister-ScheduledTask -TaskName $Name -Confirm:$false
      Write-Host "Đã gỡ task '$Name'. Tiến trình node còn chạy (nếu có) cần tắt tay."
    } else { Write-Host "Chưa có task '$Name'." }
  }
  'status' {
    $t = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
    if ($t) { Write-Host "Task '$Name': $($t.State)" } else { Write-Host "Chưa cài task '$Name'." }
  }
}
