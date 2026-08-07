# Prépare la config locale pour le tunnel PERMANENT fidelatoo.allvaps.fr
# N'installe rien côté Cloudflare/OVH automatiquement (DNS géré par OVH aujourd'hui).

$ErrorActionPreference = "Stop"
$svcRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ((Split-Path -Leaf $svcRoot) -eq "scripts") { $svcRoot = Split-Path -Parent $svcRoot }
$repoRoot = Split-Path -Parent (Split-Path -Parent $svcRoot)
$localDir = Join-Path $repoRoot ".local\fidelatoo"
New-Item -ItemType Directory -Force -Path $localDir | Out-Null

$secretFile = Join-Path $localDir "orchestrator.secret"
if (-not (Test-Path $secretFile)) {
  Write-Output "Secret manquant. Lancez d'abord: powershell -File .\scripts\prepare-local.ps1"
  exit 1
}
$secret = (Get-Content -Raw $secretFile).Trim()

$vercelTpl = Join-Path $localDir "vercel-env-TO_SET.txt"
@"
# Vercel Preview + Production — NE PAS committer
# Sous-domaine dédié (ne remplace PAS www.allvaps.fr)

FIDELATOO_ORCHESTRATOR_ENABLED=true
FIDELATOO_ORCHESTRATOR_MOCK=false
FIDELATOO_ORCHESTRATOR_URL=https://fidelatoo.allvaps.fr
FIDELATOO_ORCHESTRATOR_SECRET=$secret
FIDELATOO_AVA_ACCOUNT_EMAIL=avaallvaps@gmail.com
"@ | Set-Content -Path $vercelTpl -Encoding utf8

$checklist = Join-Path $localDir "DNS_CHECKLIST_OVH_TO_CLOUDFLARE.txt"
@"
VERIFICATION DNS (faite) :
- NS allvaps.fr = dns106.ovh.net / ns106.ovh.net  => DNS chez OVH, PAS Cloudflare
- www.allvaps.fr = CNAME -> *.vercel-dns-017.com  => SITE PRINCIPAL (NE PAS MODIFIER)
- allvaps.fr apex A = 216.198.79.1
- MX = mx1/mx2/mx3.mail.ovh.net
- fidelatoo.allvaps.fr = NXDOMAIN (à créer plus tard via tunnel)

INTERDICTIONS :
- Ne pas modifier www.allvaps.fr
- Ne pas supprimer les MX OVH
- Ne pas pointer fidelatoo vers Vercel
- Ne pas utiliser trycloudflare.com en cible finale

CIBLE :
fidelatoo.allvaps.fr --Cloudflare Tunnel permanent--> http://127.0.0.1:8787
"@ | Set-Content -Path $checklist -Encoding utf8

$configOut = Join-Path $localDir "cloudflared-config.yml"
Copy-Item (Join-Path $svcRoot "cloudflared\config.template.yml") $configOut -Force

Write-Output "Updated: $vercelTpl"
Write-Output "Updated: $checklist"
Write-Output "Template tunnel: $configOut"
Write-Output "URL cible Vercel: https://fidelatoo.allvaps.fr"
Write-Output "MOCK=false"
