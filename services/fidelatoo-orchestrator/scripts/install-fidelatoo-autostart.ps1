# Installe / repare les taches Windows pour stack Fidelatoo permanente (gratuit).
# - Au logon: stack + anti-veille
# - Toutes les 5 minutes: keep-alive (repare sans couper)
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-fidelatoo-autostart.ps1

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$stack = Join-Path $here "start-fidelatoo-stack.ps1"
$keep = Join-Path $here "keep-alive-fidelatoo.ps1"
$nosleep = Join-Path $here "prevent-sleep-fidelatoo.ps1"
if (-not (Test-Path $stack)) { throw "Script introuvable: $stack" }
if (-not (Test-Path $keep)) { throw "Script introuvable: $keep" }
if (-not (Test-Path $nosleep)) { throw "Script introuvable: $nosleep" }

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew

# Keep-awake: pas de limite de duree (tourne en continu)
$settingsNoSleep = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 5 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew

# 1) Demarrage stack a la connexion
$actionBoot = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$stack`""
$triggerBoot = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
Register-ScheduledTask -TaskName "AllVapsFidelatooStack" `
  -Action $actionBoot -Trigger $triggerBoot -Principal $principal -Settings $settings -Force | Out-Null

# 2) Keep-alive toutes les 5 minutes
$actionKeep = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$keep`""
$triggerKeep = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration ([TimeSpan]::FromDays(9999))
Register-ScheduledTask -TaskName "AllVapsFidelatooKeepAlive" `
  -Action $actionKeep -Trigger $triggerKeep -Principal $principal -Settings $settings -Force | Out-Null

# 3) Anti-veille permanent (VM / Fidelatoo restent dispo meme si le PC "voudrait" dormir)
$actionNoSleep = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$nosleep`""
$triggerNoSleep = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
Register-ScheduledTask -TaskName "AllVapsFidelatooNoSleep" `
  -Action $actionNoSleep -Trigger $triggerNoSleep -Principal $principal -Settings $settingsNoSleep -Force | Out-Null

# Applique immediatement le plan d'alimentation
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $nosleep -ConfigureOnly | Out-Null

Write-Host "Taches installees :"
Write-Host "  - AllVapsFidelatooStack (au logon)"
Write-Host "  - AllVapsFidelatooKeepAlive (toutes les 5 min)"
Write-Host "  - AllVapsFidelatooNoSleep (anti-veille permanent)"
Write-Host "Lancement immediat..."
Start-ScheduledTask -TaskName "AllVapsFidelatooStack"
Start-ScheduledTask -TaskName "AllVapsFidelatooNoSleep"
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName "AllVapsFidelatooKeepAlive"
Write-Host "OK"
