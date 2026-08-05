# Fixed inventaire tunnel URLs (mandatory)

## Never change these URLs

- https://tries-digital-raw-aus.trycloudflare.com/acces
- https://tries-digital-raw-aus.trycloudflare.com/inventaire
- https://tries-digital-raw-aus.trycloudflare.com/login?next=/inventaire

Source of truth: `data/FIXED_TUNNEL_URL.txt`

## Servers must stay up

- Next.js + tunnel must **not** stop except on explicit user request.
- Use `scripts/ensure-servers.sh`. Stop only with `scripts/stop-servers.sh`.
- Never kill cloudflared unless user accepts a new URL.
- Android app download: `/apps/AllVaps-Inventaire.apk` (button on inventaire page).
