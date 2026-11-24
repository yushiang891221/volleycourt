# 把 volleygame\vroid下載 裡的每個 VRM 裁成只有頭（低優先權、4 核、一次一個）→ assets\models\vroid\<名稱>.glb
param([string[]]$only)
$B = "C:\Users\C\Downloads\blender-5.4.0-alpha+main.741e9ebfbd96-windows.amd64-release\blender-5.4.0-alpha+main.741e9ebfbd96-windows.amd64-release\blender.exe"
$src = Join-Path $PSScriptRoot "..\..\..\volleygame\vroid下載"
$dst = Join-Path $PSScriptRoot "..\..\assets\models\vroid"
New-Item -ItemType Directory -Force $dst | Out-Null
Get-ChildItem -Path $src -Recurse -Filter *.vrm | Where-Object { -not $only -or $_.Directory.Name -in $only } | ForEach-Object {
  $name = $_.Directory.Name
  $out = Join-Path $dst "$name.glb"
  $log = "$env:TEMP\trim_$name.log"
  $p = Start-Process -FilePath $B -ArgumentList @('--background', '--factory-startup', '-t', '4', '--python', "$PSScriptRoot\trim_head.py", '--', "`"$($_.FullName)`"", "`"$out`"") -RedirectStandardOutput $log -RedirectStandardError "$log.err" -NoNewWindow -PassThru
  try { $p.PriorityClass = 'BelowNormal' } catch {}
  $p.WaitForExit()
  Select-String -Path $log, "$log.err" -Pattern "TRIMMED|Error|Traceback" | Select-Object -First 4 | ForEach-Object { "$name : $($_.Line)" }
}
