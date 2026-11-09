# Run Blender build (4 threads, BelowNormal priority so the PC stays usable), then make a 2x2 contact sheet.
# Usage: powershell -File run.ps1 [sex]
param([int]$sex = 0)
$B = "C:\Users\C\Downloads\blender-5.4.0-alpha+main.741e9ebfbd96-windows.amd64-release\blender-5.4.0-alpha+main.741e9ebfbd96-windows.amd64-release\blender.exe"
Set-Location $PSScriptRoot
$log = Join-Path $env:TEMP "blender_build_$sex.log"
$argsList = @('--background', '--factory-startup', '-t', '4', '--python', 'build_all.py', '--', "$sex")
$p = Start-Process -FilePath $B -ArgumentList $argsList -RedirectStandardOutput $log -NoNewWindow -PassThru
try { $p.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::BelowNormal } catch {}
$p.WaitForExit()
Select-String -Path $log -Pattern "DONE|EXPORTED|Error|Traceback|failed|smooth_weights|File `"|line \d+" | Select-Object -First 12 | ForEach-Object { $_.Line }
Add-Type -AssemblyName System.Drawing
$d = Join-Path $PSScriptRoot "..\models\shots"
$o = New-Object System.Drawing.Bitmap 1200, 1200; $g = [System.Drawing.Graphics]::FromImage($o); $i = 0
foreach ($n in "a", "b", "c", "d") { $f = "$d\all_${sex}_$n.png"; if (Test-Path $f) { $a = [System.Drawing.Image]::FromFile($f); $g.DrawImage($a, ($i % 2) * 600, [math]::Floor($i / 2) * 600, 600, 600); $a.Dispose() }; $i++ }
$o.Save("$d\_all_$sex.png"); "saved"
