# Expose l'orchestrateur local (127.0.0.1:8787) via HTTPS public temporaire Cloudflare.
# Prérequis: orchestrateur déjà démarré + cloudflared installé.
# Usage: powershell -File .\scripts\publish-tunnel.ps1

$ErrorActionPreference = "Stop"
Write-Output "Ce script nécessite cloudflared."
Write-Output "Si absent: winget install --id Cloudflare.cloudflared"
Write-Output ""
Write-Output "Commande exacte à lancer sur la machine privée (orchestrateur déjà UP):"
Write-Output "cloudflared tunnel --url http://127.0.0.1:8787"
Write-Output ""
Write-Output "Copiez l'URL https://….trycloudflare.com affichée, puis:"
Write-Output "1) Mettez-la dans FIDELATOO_ORCHESTRATOR_URL (Vercel Preview+Production)"
Write-Output "2) Vérifiez GET https://VOTRE_URL/health"
Write-Output "3) MOCK doit rester false"
