# Démarre l'orchestrateur Fidelatoo en local (bind 127.0.0.1).
$ErrorActionPreference = "Stop"
$svcRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ((Split-Path -Leaf $svcRoot) -eq "scripts") { $svcRoot = Split-Path -Parent $svcRoot }
Set-Location $svcRoot

if (-not (Test-Path ".\.env")) {
  Write-Output "Fichier .env manquant. Lancez d'abord: powershell -File .\scripts\prepare-local.ps1"
  exit 1
}

if (-not (Test-Path ".\node_modules\tsx")) {
  npm install
}

Write-Output "Démarrage orchestrateur (MOCK=false, ADB réel)..."
npm start
