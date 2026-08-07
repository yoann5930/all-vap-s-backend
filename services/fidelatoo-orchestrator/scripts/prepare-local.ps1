# Génère un secret fort hors Git et prépare les fichiers machine privée.
$ErrorActionPreference = "Stop"
$svcRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ((Split-Path -Leaf $svcRoot) -eq "scripts") { $svcRoot = Split-Path -Parent $svcRoot }
$repoRoot = Split-Path -Parent (Split-Path -Parent $svcRoot)
$localDir = Join-Path $repoRoot ".local\fidelatoo"
New-Item -ItemType Directory -Force -Path $localDir | Out-Null

$secretFile = Join-Path $localDir "orchestrator.secret"
$envFile = Join-Path $localDir "orchestrator.env"
$vercelTpl = Join-Path $localDir "vercel-env-TO_SET.txt"
$svcEnv = Join-Path $svcRoot ".env"

if (-not (Test-Path $secretFile)) {
  $bytes = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = ([Convert]::ToBase64String($bytes) -replace '[+/=]', '')
  if ($secret.Length -gt 64) { $secret = $secret.Substring(0, 64) }
  Set-Content -Path $secretFile -Value $secret -NoNewline -Encoding ascii
  Write-Output "Secret généré: $secretFile"
} else {
  $secret = (Get-Content -Raw $secretFile).Trim()
  Write-Output "Secret existant réutilisé: $secretFile"
}

@"
FIDELATOO_ORCHESTRATOR_SECRET=$secret
PORT=8787
HOST=127.0.0.1
FIDELATOO_AVA_ACCOUNT_EMAIL=avaallvaps@gmail.com
FIDELATOO_ANDROID_PACKAGE=com.fidelatoo.pro
QR_TTL_SEC=120
COMMAND_MAX_SKEW_SEC=90
"@ | Set-Content -Path $envFile -Encoding utf8

Copy-Item $envFile $svcEnv -Force

@"
# À configurer dans Vercel (Preview + Production) — NE PAS committer
# MOCK obligatoire false

FIDELATOO_ORCHESTRATOR_ENABLED=true
FIDELATOO_ORCHESTRATOR_MOCK=false
FIDELATOO_ORCHESTRATOR_SECRET=$secret
FIDELATOO_AVA_ACCOUNT_EMAIL=avaallvaps@gmail.com

# Remplacer APRÈS création du tunnel HTTPS public (Cloudflare Tunnel / équivalent)
# Exemple: https://fidelatoo-orch-xxxxx.trycloudflare.com
FIDELATOO_ORCHESTRATOR_URL=https://REMPLACER_PAR_URL_TUNNEL_HTTPS
"@ | Set-Content -Path $vercelTpl -Encoding utf8

Write-Output "Env machine: $envFile"
Write-Output "Env service: $svcEnv"
Write-Output "Template Vercel: $vercelTpl"
Write-Output "MOCK=false"
