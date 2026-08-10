# Installe tâches planifiées : stack au logon + keep-alive 5 min.
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\install-autostart.ps1
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$stack = Join-Path $here "start-ava-llm-stack.ps1"
$keep = Join-Path $here "keep-alive-gateway.ps1"
$silent = Join-Path $here "run-silent.vbs"
if (-not (Test-Path $stack)) { throw "Script introuvable: $stack" }
if (-not (Test-Path $keep)) { throw "Script introuvable: $keep" }
if (-not (Test-Path $silent)) { throw "Script introuvable: $silent" }

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -Hidden `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew

$wscript = Join-Path $env:SystemRoot "System32\wscript.exe"

$actionBoot = New-ScheduledTaskAction -Execute $wscript `
  -Argument "//B `"$silent`" `"$stack`""
$triggerBoot = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
Register-ScheduledTask -TaskName "AllVapsAvaLlmGatewayStack" `
  -Action $actionBoot -Trigger $triggerBoot -Principal $principal -Settings $settings -Force | Out-Null

$actionKeep = New-ScheduledTaskAction -Execute $wscript `
  -Argument "//B `"$silent`" `"$keep`""
$triggerKeep = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration ([TimeSpan]::FromDays(9999))
Register-ScheduledTask -TaskName "AllVapsAvaLlmGatewayKeepAlive" `
  -Action $actionKeep -Trigger $triggerKeep -Principal $principal -Settings $settings -Force | Out-Null

Write-Host "Taches installees :"
Write-Host "  - AllVapsAvaLlmGatewayStack (au logon)"
Write-Host "  - AllVapsAvaLlmGatewayKeepAlive (toutes les 5 min)"
Write-Host "Lancement immediat..."
Start-ScheduledTask -TaskName "AllVapsAvaLlmGatewayStack"
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName "AllVapsAvaLlmGatewayKeepAlive"
Write-Host "OK"
Write-Host "Rappel: merger Caddyfile llm.allvaps.fr + DNS A llm (validation manuelle)."
