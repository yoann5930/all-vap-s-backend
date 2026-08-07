# Stack Fidelatoo All Vap's — demarrage / reparation (100% gratuit, local).
# Ne coupe RIEN si deja en ligne. Relance uniquement ce qui manque.
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\start-fidelatoo-stack.ps1

$ErrorActionPreference = "Continue"

$svcRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ((Split-Path -Leaf $svcRoot) -eq "scripts") { $svcRoot = Split-Path -Parent $svcRoot }
$repoRoot = Split-Path -Parent (Split-Path -Parent $svcRoot)
Set-Location $svcRoot

$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$adb = Join-Path $sdk "platform-tools\adb.exe"
$emu = Join-Path $sdk "emulator\emulator.exe"
$avd = if ($env:ANDROID_AVD_NAME) { $env:ANDROID_AVD_NAME } else { "AllVaps_Fidelatoo" }
$snapshot = if ($env:ANDROID_AVD_SNAPSHOT) { $env:ANDROID_AVD_SNAPSHOT } else { "stable" }
$skin = if ($env:ANDROID_AVD_SKIN) { $env:ANDROID_AVD_SKIN } else { "720x1280" }
$pkg = if ($env:FIDELATOO_ANDROID_PACKAGE) { $env:FIDELATOO_ANDROID_PACKAGE } else { "fr.squirrel.fidelatoopro" }
$logDir = Join-Path $repoRoot ".local\fidelatoo"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-Log([string]$msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Write-Output $line
  Add-Content -Path (Join-Path $logDir "stack-keepalive.log") -Value $line -ErrorAction SilentlyContinue
}

function Test-Orchestrator {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8787/health" -UseBasicParsing -TimeoutSec 4
    return ($r.StatusCode -eq 200)
  } catch {
    return $false
  }
}

function Ensure-Orchestrator {
  if (Test-Orchestrator) {
    Write-Log "Orchestrateur deja UP"
    return
  }
  if (-not (Test-Path (Join-Path $svcRoot ".env"))) {
    Write-Log "ERREUR: .env manquant dans services/fidelatoo-orchestrator"
    return
  }
  if (-not (Test-Path (Join-Path $svcRoot "node_modules\tsx"))) {
    Write-Log "npm install orchestrateur..."
    npm install --prefix $svcRoot | Out-Null
  }
  $out = Join-Path $logDir "orchestrator.log"
  $err = Join-Path $logDir "orchestrator.err.log"
  Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "start") -WorkingDirectory $svcRoot `
    -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden | Out-Null
  Start-Sleep -Seconds 4
  if (Test-Orchestrator) { Write-Log "Orchestrateur demarre" }
  else { Write-Log "ERREUR: orchestrateur non joignable apres demarrage" }
}

function Ensure-AdbServer {
  if (-not (Test-Path $adb)) { return }
  & $adb start-server 2>&1 | Out-Null
}

function Test-DeviceOnline {
  if (-not (Test-Path $adb)) { return $false }
  $devs = & $adb devices 2>&1 | Out-String
  return ($devs -match "\tdevice\b")
}

function Ensure-Avd {
  if (-not (Test-Path $adb)) { Write-Log "ERREUR: adb introuvable: $adb"; return }
  if (-not (Test-Path $emu)) { Write-Log "ERREUR: emulator introuvable: $emu"; return }
  Ensure-AdbServer
  if (Test-DeviceOnline) {
    Write-Log "AVD deja en ligne"
    return
  }
  $args = @(
    "-avd", $avd,
    "-skin", $skin,
    "-gpu", "auto",
    "-netdelay", "none",
    "-netspeed", "full",
    "-snapshot", $snapshot
  )
  $out = Join-Path $logDir "emulator.log"
  $err = Join-Path $logDir "emulator.err.log"
  Start-Process -FilePath $emu -ArgumentList $args -WindowStyle Minimized `
    -RedirectStandardOutput $out -RedirectStandardError $err | Out-Null
  Write-Log "AVD demarrage demande ($avd / snapshot $snapshot)"
  $deadline = (Get-Date).AddMinutes(4)
  while ((Get-Date) -lt $deadline) {
    if (Test-DeviceOnline) {
      $boot = ((& $adb shell getprop sys.boot_completed 2>&1) | Out-String).Trim()
      if ($boot -eq "1") {
        Write-Log "AVD online"
        return
      }
    }
    Start-Sleep -Seconds 5
  }
  Write-Log "ERREUR: AVD non prete apres timeout"
}

function Ensure-Caddy {
  $caddyDir = Join-Path $logDir "caddy"
  $caddyExe = Join-Path $caddyDir "caddy.exe"
  $caddyfile = Join-Path $caddyDir "Caddyfile"
  if (-not (Test-Path $caddyExe)) {
    Write-Log "Caddy absent - skip HTTPS"
    return
  }
  $listening = Get-NetTCPConnection -LocalPort 443 -State Listen -ErrorAction SilentlyContinue
  if ($listening) {
    Write-Log "Caddy/HTTPS deja UP (443)"
    return
  }
  $out = Join-Path $caddyDir "caddy.out.log"
  $err = Join-Path $caddyDir "caddy.err.log"
  Start-Process -FilePath $caddyExe -ArgumentList @("run", "--config", $caddyfile) `
    -WorkingDirectory $caddyDir -RedirectStandardOutput $out -RedirectStandardError $err `
    -WindowStyle Hidden | Out-Null
  Start-Sleep -Seconds 3
  $listening2 = Get-NetTCPConnection -LocalPort 443 -State Listen -ErrorAction SilentlyContinue
  if ($listening2) { Write-Log "Caddy demarre (fidelatoo.allvaps.fr -> 8787)" }
  else { Write-Log "ERREUR: Caddy non a l'ecoute sur 443" }
}

function Ensure-FidelatooApp {
  if (-not (Test-DeviceOnline)) { return }
  $null = & $adb shell monkey -p $pkg -c android.intent.category.LAUNCHER 1 2>&1
  Write-Log "App Fidelatoo verifiee/ouverte ($pkg)"
}

Write-Log "=== ensure stack Fidelatoo ==="

# Anti-veille: plan Windows (veille/hibernation OFF) a chaque ensure
$preventSleep = Join-Path $svcRoot "scripts\prevent-sleep-fidelatoo.ps1"
if (Test-Path $preventSleep) {
  try {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $preventSleep -ConfigureOnly | Out-Null
    Write-Log "Anti-veille: plan applique"
  } catch {
    Write-Log "WARN anti-veille configure"
  }
  # Lance le garde keep-awake s'il n'existe pas deja
  $awake = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -like "*prevent-sleep-fidelatoo.ps1*" -and $_.CommandLine -notlike "*-ConfigureOnly*" }
  if (-not $awake) {
    Start-Process -FilePath "powershell.exe" `
      -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", $preventSleep) `
      -WindowStyle Hidden | Out-Null
    Write-Log "Anti-veille: processus keep-awake demarre"
  } else {
    Write-Log "Anti-veille: keep-awake deja actif"
  }
}

Ensure-Orchestrator
Ensure-Avd
Ensure-Caddy
Ensure-FidelatooApp

try {
  $h = (Invoke-WebRequest -Uri "http://127.0.0.1:8787/health" -UseBasicParsing -TimeoutSec 8).Content
  Write-Log "Health: $h"
} catch {
  Write-Log ("Health: " + $_.Exception.Message)
}
