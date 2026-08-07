# Installe / répare les tâches Windows pour stack Fidelatoo permanente (gratuit).
# - Au logon utilisateur
# - Toutes les 5 minutes (keep-alive)
# Usage (PowerShell admin recommandé):
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-fidelatoo-autostart.ps1

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$stack = Join-Path $here "start-fidelatoo-stack.ps1"
$keep = Join-Path $here "keep-alive-fidelatoo.ps1"
if (-not (Test-Path $stack)) { throw "Script introuvable: $stack" }
if (-not (Test-Path $keep)) { throw "Script introuvable: $keep" }

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew

# 1) Démarrage à la connexion
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

Write-Host "Tâches installées :"
Write-Host "  - AllVapsFidelatooStack (au logon)"
Write-Host "  - AllVapsFidelatooKeepAlive (toutes les 5 min)"
Write-Host "Lancement immédiat de la stack…"
Start-ScheduledTask -TaskName "AllVapsFidelatooStack"
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName "AllVapsFidelatooKeepAlive"
Write-Host "OK"
