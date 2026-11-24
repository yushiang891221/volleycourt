# 低優先權、4 核跑 build_real.py。用法：powershell -File run_real.ps1 m|f
param([string]$sex = "m")
$B = "C:\Users\C\Downloads\blender-5.4.0-alpha+main.741e9ebfbd96-windows.amd64-release\blender-5.4.0-alpha+main.741e9ebfbd96-windows.amd64-release\blender.exe"
$log = "$env:TEMP\real_$sex.log"
$p = Start-Process -FilePath $B -ArgumentList @('--background','--factory-startup','-t','4','--python',"$PSScriptRoot\build_real.py",'--',$sex) -RedirectStandardOutput $log -RedirectStandardError "$log.err" -NoNewWindow -PassThru
try { $p.PriorityClass = 'BelowNormal' } catch {}
$p.WaitForExit()
Select-String -Path $log,"$log.err" -Pattern "HEAD|FACE_KILL|PATCH|CDT|CORNEA|HEIGHT|MODFAIL|EXPORTED|DONE|Error|Traceback|line \d+" | Select-Object -First 20 | ForEach-Object { $_.Line }
