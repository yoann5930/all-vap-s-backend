# Empeche la veille Windows tant que la stack Fidelatoo / VM A.V.A. doit rester online.
# 100% gratuit, local. N'utilise aucun service cloud payant.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\prevent-sleep-fidelatoo.ps1
#   powershell -ExecutionPolicy Bypass -File .\scripts\prevent-sleep-fidelatoo.ps1 -ConfigureOnly

param(
  [switch]$ConfigureOnly
)

$ErrorActionPreference = "Continue"
$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
$logDir = Join-Path $repoRoot ".local\fidelatoo"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "nosleep.log"

function Write-Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Write-Output $line
  Add-Content -Path $logFile -Value $line -ErrorAction SilentlyContinue
}

function Set-NoSleepPowerPlan {
  # Jamais de veille / hibernation sur secteur
  powercfg /change standby-timeout-ac 0 | Out-Null
  powercfg /change hibernate-timeout-ac 0 | Out-Null
  powercfg /change monitor-timeout-ac 0 | Out-Null
  # Aussi sur batterie (PC boutique doit rester dispo pour clients)
  powercfg /change standby-timeout-dc 0 | Out-Null
  powercfg /change hibernate-timeout-dc 0 | Out-Null
  powercfg /change monitor-timeout-dc 20 | Out-Null

  # Couvercle ferme = ne rien faire (ne pas endormir)
  powercfg -setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0 2>$null
  powercfg -setdcvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0 2>$null
  # Bouton alimentation = eteindre l'ecran seulement si possible, sinon ignorer
  powercfg -setacvalueindex SCHEME_CURRENT SUB_BUTTONS PBUTTONACTION 0 2>$null
  powercfg -setdcvalueindex SCHEME_CURRENT SUB_BUTTONS PBUTTONACTION 0 2>$null
  powercfg -S SCHEME_CURRENT 2>$null | Out-Null

  # Desactive hibernation fichier (evite coupe longue)
  powercfg /hibernate off 2>$null | Out-Null

  Write-Log "Power plan: veille/hibernation OFF (AC+DC), couvercle = Do nothing"
}

Set-NoSleepPowerPlan

if ($ConfigureOnly) {
  Write-Log "ConfigureOnly: power plan applique, pas de boucle keep-awake"
  exit 0
}

# Garde actif: empêche sleep même si une autre app demande la veille
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class AllVapsPower {
  [DllImport("kernel32.dll")]
  public static extern uint SetThreadExecutionState(uint esFlags);
}
"@

$ES_CONTINUOUS = [uint32]"0x80000000"
$ES_SYSTEM_REQUIRED = [uint32]"0x00000001"
$ES_AWAYMODE_REQUIRED = [uint32]"0x00000040"
$flags = $ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED -bor $ES_AWAYMODE_REQUIRED

Write-Log "Keep-awake demarre (SYSTEM + AWAYMODE)"
while ($true) {
  try {
    [AllVapsPower]::SetThreadExecutionState($flags) | Out-Null
  } catch {
    Write-Log ("WARN SetThreadExecutionState: " + $_.Exception.Message)
  }
  # Re-applique le plan toutes ~30 min au cas ou Windows Update le change
  if ((Get-Date).Minute -eq 0 -and (Get-Date).Second -lt 35) {
    Set-NoSleepPowerPlan
  }
  Start-Sleep -Seconds 30
}
