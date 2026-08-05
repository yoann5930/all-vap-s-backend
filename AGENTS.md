# Fixed inventaire tunnel URLs (mandatory)

## Never change these URLs

- https://heather-auctions-they-leu.trycloudflare.com/acces
- https://heather-auctions-they-leu.trycloudflare.com/inventaire
- https://heather-auctions-they-leu.trycloudflare.com/login?next=/inventaire

Source of truth: `data/FIXED_TUNNEL_URL.txt`

**INTERDIT** de remplacer, « basculer », ou documenter une autre URL `*.trycloudflare.com`
sans accord **explicite** de l’utilisateur pour **cette** nouvelle adresse.

## Servers must stay up

- Next.js + tunnel must **not** stop except on explicit user request.
- Use `scripts/ensure-servers.sh`. Stop only with `scripts/stop-servers.sh`.
- Never kill cloudflared unless user accepts a new URL.
- Never start a second quick tunnel while one is running (ça tue l’hostname figé).
- Android app download: `/apps/AllVaps-Inventaire.apk` (button on inventaire page).
