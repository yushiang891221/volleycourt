# Run Codex on one or more work orders in sequence: powershell -File run_codex.ps1 WEB_005F WEB_004
# Finds the current Codex install path each time (the Store app changes folder on update).
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$ids)
# Pipe text to codex as UTF-8 (otherwise Chinese becomes '?')
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$pkg = Get-AppxPackage OpenAI.Codex | Select-Object -First 1
$cx = Join-Path $pkg.InstallLocation "app\resources\codex.exe"
$dir = $PSScriptRoot   # 工作單就放在這個腳本旁邊（repo 的 docs/codex工作單）
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path   # Codex 在 repo 根目錄工作
foreach ($id in $ids) {
  $prompt = Join-Path $dir "${id}_codex指令.txt"
  $last = Join-Path $dir "${id}_codex最後訊息.txt"
  $log = Join-Path $dir "${id}_codex紀錄.log"
  Get-Content -Raw -Encoding UTF8 $prompt | & $cx exec -C $repo -s workspace-write -o $last - *> $log
  "$id codex exit: $LASTEXITCODE"
}
