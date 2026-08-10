# Demarre / repare ava-llm-gateway (127.0.0.1:8791 uniquement).
# Verifie Ollama localhost. Ne touche PAS au port public 11434.
$ErrorActionPreference = "Continue"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$svcRoot = Split-Path -Parent $here
$repoRoot = Split-Path -Parent (Split-Path -Parent $svcRoot)
$localDir = Join-Path $repoRoot ".local\ava-llm-gateway"
$logFile = Join-Path $localDir "stack.log"
New-Item -ItemType Directory -Force -Path $localDir | Out-Null

function Write-Log([string]$msg) {
  $line = "$(Get-Date -Format o) $msg"
  Add-Content -Path $logFile -Value $line -Encoding utf8
  Write-Host $line
}

function Test-Port([int]$port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Test-Ollama {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:11434/api/tags" -UseBasicParsing -TimeoutSec 3
    return $r.StatusCode -eq 200
  } catch { return $false }
}

function Test-Gateway {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8791/health" -UseBasicParsing -TimeoutSec 4
    $j = $r.Content | ConvertFrom-Json
    return [bool]$j.ok
  } catch { return $false }
}

Write-Log "=== ensure ava-llm-gateway ==="

if (-not (Test-Ollama)) {
  Write-Log "Ollama down - tentative demarrage service/app"
  $ollama = Get-Command ollama -ErrorAction SilentlyContinue
  if ($ollama) {
    Start-Process -FilePath $ollama.Source -ArgumentList @("serve") -WindowStyle Hidden | Out-Null
    Start-Sleep -Seconds 4
  } else {
    $svc = Get-Service -Name "Ollama" -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -ne "Running") {
      try { Start-Service Ollama } catch { Write-Log "WARN Start-Service Ollama" }
      Start-Sleep -Seconds 4
    }
  }
}
if (Test-Ollama) { Write-Log 'Ollama OK (127.0.0.1:11434)' }
else { Write-Log "ERREUR: Ollama injoignable en local" }

$secretFile = Join-Path $localDir "gateway.secret"
if (-not (Test-Path $secretFile)) {
  Write-Log "Secret manquant - lance prepare-local.ps1"
  exit 1
}

if (Test-Gateway) {
  Write-Log 'Gateway deja OK (:8791)'
} else {
  if (Test-Port 8791) {
    Write-Log "WARN: port 8791 occupe mais /health KO"
  }
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    Write-Log "ERREUR: node introuvable"
    exit 1
  }
  $tsxCli = Join-Path $svcRoot "node_modules\tsx\dist\cli.mjs"
  if (-not (Test-Path $tsxCli)) {
    Write-Log "ERREUR: tsx manquant - npm install dans services/ava-llm-gateway"
    exit 1
  }
  $out = Join-Path $localDir "gateway.out.log"
  $err = Join-Path $localDir "gateway.err.log"
  $env:AVA_LLM_GATEWAY_SECRET_FILE = $secretFile
  $env:AVA_LLM_GATEWAY_HOST = "127.0.0.1"
  $env:AVA_LLM_GATEWAY_PORT = "8791"
  $env:AVA_OLLAMA_BASE_URL = "http://127.0.0.1:11434"
  $env:AVA_LOCAL_MODEL = "gemma3:12b"
  $env:AVA_LOCAL_FALLBACK = "llama3.1:8b"
  $env:OLLAMA_MAX_LOADED_MODELS = "1"
  $env:OLLAMA_KEEP_ALIVE = "2m"
  # Charger .local gateway.env si present (override)
  $envFile = Join-Path $localDir "gateway.env"
  if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
      $line = $_.Trim()
      if (-not $line -or $line.StartsWith("#")) { return }
      $eq = $line.IndexOf("=")
      if ($eq -lt 1) { return }
      $k = $line.Substring(0, $eq).Trim()
      $v = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
      Set-Item -Path "Env:$k" -Value $v
    }
  }
  # Chemins avec espaces (ex. D:\all vaps\...) : citer chaque argument
  $argLine = '"' + $tsxCli + '" src/server.ts'
  Start-Process -FilePath $node.Source -ArgumentList $argLine `
    -WorkingDirectory $svcRoot `
    -RedirectStandardOutput $out -RedirectStandardError $err `
    -WindowStyle Hidden | Out-Null
  Start-Sleep -Seconds 5
  if (Test-Gateway) { Write-Log "Gateway demarre OK" }
  else { Write-Log "ERREUR: gateway /health KO - voir $err" }
}

Write-Log 'Rappel Caddy: merger snippet llm.allvaps.fr -> 127.0.0.1:8791 (ne pas exposer :11434)'
Write-Log "=== fin ensure ==="
