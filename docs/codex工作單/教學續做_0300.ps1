# 03:00 自動叫 Codex 接續「新手教學新版」那段對話（使用者 2026-11-16 交代）
# 手動執行：powershell -NoProfile -ExecutionPolicy Bypass -File 教學續做_0300.ps1
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$pkg = Get-AppxPackage OpenAI.Codex | Select-Object -First 1
$cx = Join-Path $pkg.InstallLocation "app\resources\codex.exe"
$dir = $PSScriptRoot
$prompt = Join-Path $dir "教學續做_0300_codex指令.txt"
$log = Join-Path $dir "教學續做_0300_codex紀錄.log"
$last = Join-Path $dir "教學續做_0300_codex最後訊息.txt"
$session = "01a1d518-3050-7890-827d-122c81abf18c"   # 使用者跟 Codex 討論新手教學的那段對話
Set-Location "D:\開排球場"
"開始 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $log -Encoding utf8
Get-Content -Raw -Encoding UTF8 $prompt | & $cx exec resume $session -c 'sandbox_mode="workspace-write"' -c 'sandbox_workspace_write.network_access=true' -c 'approval_policy="never"' -o $last - *>> $log
"結束 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')，結束碼 $LASTEXITCODE" | Out-File -FilePath $log -Encoding utf8 -Append
