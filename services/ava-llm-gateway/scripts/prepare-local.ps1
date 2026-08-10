# Prépare .local/ava-llm-gateway (secret + env + snippet Caddy).
# Ne touche PAS au DNS. Ne démarre PAS Ollama en mode public.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$svcRoot = Split-Path -Parent $here
$repoRoot = Split-Path -Parent (Split-Path -Parent $svcRoot)
$localDir = Join-Path $repoRoot ".local\ava-llm-gateway"
New-Item -ItemType Directory -Force -Path $localDir | Out-Null

$secretFile = Join-Path $localDir "gateway.secret"
if (-not (Test-Path $secretFile)) {
  $bytes = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = [Convert]::ToBase64String($bytes)
  Set-Content -Path $secretFile -Value $secret -NoNewline -Encoding ascii
  Write-Host "Secret cree: $secretFile (ne pas committer, ne pas coller entier dans le chat)"
} else {
  Write-Host "Secret existant conserve: $secretFile"
}

$envFile = Join-Path $localDir "gateway.env"
@"
AVA_LLM_GATEWAY_HOST=127.0.0.1
AVA_LLM_GATEWAY_PORT=8791
AVA_LLM_GATEWAY_SECRET_FILE=$($secretFile -replace '\\','/')
AVA_LOCAL_MODEL=qwen2.5:7b
AVA_LOCAL_FALLBACK=llama3.2:3b
AVA_OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_HOST=http://127.0.0.1:11434
"@ | Set-Content -Path $envFile -Encoding utf8

$caddySnippet = Join-Path $localDir "Caddyfile.llm.snippet"
@"
# Merger dans le Caddyfile Fidelatoo existant (un seul Caddy :443)
llm.allvaps.fr {
	encode gzip
	reverse_proxy 127.0.0.1:8791
}
"@ | Set-Content -Path $caddySnippet -Encoding utf8

Write-Host ""
Write-Host "OK prepare-local"
Write-Host "  env:     $envFile"
Write-Host "  caddy:   $caddySnippet"
Write-Host "  secret:  (fichier local uniquement)"
Write-Host ""
Write-Host "Vercel (serveur) a renseigner manuellement :"
Write-Host "  AVA_LOCAL_AI_GATEWAY_URL=https://llm.allvaps.fr"
Write-Host "  AVA_LLM_GATEWAY_SECRET=<contenu du fichier secret>"
Write-Host "  AVA_LLM_PROVIDER=local"
Write-Host ""
Write-Host "DNS a VALIDER avant creation (ne pas appliquer automatiquement) :"
Write-Host "  TYPE=A  SOUS-DOMAINE=llm  CIBLE=<IP publique Freebox>  TTL=300"
