# 在終端機分頁即時看 Codex 的回覆，同時存一份紀錄：powershell -File run_live.ps1 ANIM_C1
param([Parameter(Mandatory = $true)][string]$id)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$pkg = Get-AppxPackage OpenAI.Codex | Select-Object -First 1
$cx = Join-Path $pkg.InstallLocation "app\resources\codex.exe"
$dir = $PSScriptRoot
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$prompt = Join-Path $dir "${id}_codex指令.txt"
$last = Join-Path $dir "${id}_codex最後訊息.txt"
$log = Join-Path $dir "${id}_codex紀錄.log"
Get-Content -Raw -Encoding UTF8 $prompt | & $cx exec -C $repo -s workspace-write -o $last - 2>&1 | Tee-Object -FilePath $log
"$id codex exit: $LASTEXITCODE"
