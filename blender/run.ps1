# 執行 Blender 建模腳本並把四張算繪圖拼成一張：  powershell -File run.ps1 [sex]
param([int]$sex = 0)
$B = "C:\Users\C\Downloads\blender-5.4.0-alpha+main.741e9ebfbd96-windows.amd64-release\blender-5.4.0-alpha+main.741e9ebfbd96-windows.amd64-release\blender.exe"
Set-Location $PSScriptRoot
& $B --background --factory-startup --python build_all.py -- $sex 2>&1 | Select-String -Pattern "DONE|Error|Traceback|File `"|line \d+" | Select-Object -First 12
Add-Type -AssemblyName System.Drawing
$d = Join-Path $PSScriptRoot "..\models\shots"
$o = New-Object System.Drawing.Bitmap 1200, 1200; $g = [System.Drawing.Graphics]::FromImage($o); $i = 0
foreach ($n in "a", "b", "c", "d") { $f = "$d\all_${sex}_$n.png"; if (Test-Path $f) { $a = [System.Drawing.Image]::FromFile($f); $g.DrawImage($a, ($i % 2) * 600, [math]::Floor($i / 2) * 600, 600, 600); $a.Dispose() }; $i++ }
$o.Save("$d\_all_$sex.png"); "saved"
