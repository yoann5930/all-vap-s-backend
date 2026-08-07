# Affiche la procédure exacte tunnel PERMANENT fidelatoo.allvaps.fr
# Sans modifier aucun DNS automatiquement.

Write-Output @"

=== CONSTAT (vérifié) ===
DNS allvaps.fr géré par OVH (dns106.ovh.net / ns106.ovh.net) — PAS par Cloudflare.
www.allvaps.fr -> Vercel (à ne pas toucher).
fidelatoo.allvaps.fr -> n'existe pas encore.
Orchestrateur local: http://127.0.0.1:8787 (MOCK=false).

=== POURQUOI CLOUDFLARE EST REQUIS ===
Un tunnel nommé Cloudflare avec hostname personnalisé (fidelatoo.allvaps.fr)
exige que la zone allvaps.fr soit ajoutée au compte Cloudflare (certificats TLS).
On ne peut PAS finaliser le CNAME permanent sans cette étape.

=== PROCÉDURE (après votre action Cloudflare) ===
1) Ajouter allvaps.fr dans Cloudflare (scan/import DNS).
   Vérifier que www reste CNAME Vercel. Ne rien publier tant que non vérifié.
2) Changer les NS OVH -> NS Cloudflare UNIQUEMENT après validation des records importés.
3) Sur la machine privée:
   winget install --id Cloudflare.cloudflared -e
   cloudflared tunnel login
   cloudflared tunnel create allvaps-fidelatoo
   cloudflared tunnel route dns allvaps-fidelatoo fidelatoo.allvaps.fr
4) Config ingress -> http://127.0.0.1:8787 puis:
   cloudflared tunnel run allvaps-fidelatoo
5) Vercel:
   FIDELATOO_ORCHESTRATOR_URL=https://fidelatoo.allvaps.fr
   FIDELATOO_ORCHESTRATOR_MOCK=false
   + SECRET déjà généré dans .local/fidelatoo/

"@
