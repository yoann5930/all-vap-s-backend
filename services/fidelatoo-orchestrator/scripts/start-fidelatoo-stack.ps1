# Démarre la stack locale Fidelatoo (orchestrateur + AVD stable) — 100% gratuit.
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\start-fidelatoo-stack.ps1
$ErrorActionPreference = "Stop"

$svcRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ((Split-Path -Leaf $svcRoot) -eq "scripts") { $svcRoot = Split-Path -Parent $svcRoot }
$repoRoot = Split-Path -Parent (Split-Path -Parent $svcRoot)
Set-Location $svcRoot

$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$adb = Join-Path $sdk "platform-tools\adb.exe"
$emu = Join-Path $sdk "emulator\emulator.exe"
$avd = "AllVaps_Fidelatoo"
$snapshot = "stable"
$skin = "720x1280"
$logDir = Join-Path $repoRoot ".local\fidelatoo"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Ensure-Orchestrator {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8787/health" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { Write-Output "Orchestrateur déjà UP"; return }
  } catch {}
  if (-not (Test-Path ".\.env")) { throw ".env manquant dans services/fidelatoo-orchestrator" }
  if (-not (Test-Path ".\node_modules\tsx")) { npm install }
  $out = Join-Path $logDir "orchestrator.log"
  $err = Join-Path $logDir "orchestrator.err.log"
  Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "start") -WorkingDirectory $svcRoot `
    -RedirectStandardOutput $out -RedirectStandardError $err -WindowStyle Hidden | Out-Null
  Start-Sleep -Seconds 3
  Write-Output "Orchestrateur démarré"
}

function Ensure-Avd {
  if (-not (Test-Path $adb)) { throw "adb introuvable: $adb" }
  if (-not (Test-Path $emu)) { throw "emulator introuvable: $emu" }
  $devs = & $adb devices 2>&1 | Out-String
  if ($devs -match "\tdevice\b") {
    Write-Output "AVD déjà en ligne"
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
  Start-Process -FilePath $emu -ArgumentList $args -WindowStyle Normal `
    -RedirectStandardOutput $out -RedirectStandardError $err | Out-Null
  Write-Output "AVD démarrage demandé ($avd / snapshot $snapshot)"
  $deadline = (Get-Date).AddMinutes(3)
  while ((Get-Date) -lt $deadline) {
    $devs = & $adb devices 2>&1 | Out-String
    if ($devs -match "\tdevice\b") {
      $boot = ((& $adb shell getprop sys.boot_completed 2>&1) | Out-String).Trim()
      if ($boot -eq "1") {
        Write-Output "AVD online"
        return
      }
    }
    Start-Sleep -Seconds 4
  }
  throw "AVD non prête après timeout"
}

Ensure-Orchestrator
Ensure-Avd

# Caddy HTTPS (fidelatoo.allvaps.fr -> 8787) — requis pour Vercel / Admin prod
function Ensure-Caddy {
  $caddyDir = Join-Path $logDir "caddy"
  $caddyExe = Join-Path $caddyDir "caddy.exe"
  $caddyfile = Join-Path $caddyDir "Caddyfile"
  if (-not (Test-Path $caddyExe)) {
    Write-Output "Caddy absent ($caddyExe) — skip HTTPS local"
    return
  }
  $listening = Get-NetTCPConnection -LocalPort 443 -State Listen -ErrorAction SilentlyContinue
  if ($listening) {
    Write-Output "Caddy/HTTPS déjà UP (port 443)"
    return
  }
  $out = Join-Path $caddyDir "caddy.out.log"
  $err = Join-Path $caddyDir "caddy.err.log"
  Start-Process -FilePath $caddyExe -ArgumentList @("run", "--config", $caddyfile) `
    -WorkingDirectory $caddyDir -RedirectStandardOutput $out -RedirectStandardError $err `
    -WindowStyle Hidden | Out-Null
  Start-Sleep -Seconds 2
  Write-Output "Caddy démarré (fidelatoo.allvaps.fr -> 127.0.0.1:8787)"
}

Ensure-Caddy
try {
  $h = (Invoke-WebRequest -Uri "http://127.0.0.1:8787/health" -UseBasicParsing -TimeoutSec 8).Content
  Write-Output $h
} catch {
  Write-Output "Health: $($_.Exception.Message)"
}
