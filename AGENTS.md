# Fixed inventaire tunnel URLs (mandatory)

## Never change these URLs

Do **not** restart, kill, or recreate the Cloudflare quick tunnel in a way that would change:

- https://minnesota-join-powerpoint-heritage.trycloudflare.com/acces
- https://minnesota-join-powerpoint-heritage.trycloudflare.com/inventaire
- https://minnesota-join-powerpoint-heritage.trycloudflare.com/login?next=/inventaire

Source of truth: `data/FIXED_TUNNEL_URL.txt`

## When restarting servers

- Restart **Next.js only** if needed.
- **Never** `pkill cloudflared` / kill the tunnel process unless the user explicitly accepts a new URL.
- `scripts/keep-servers.sh` already follows this rule.

## User communication

Always give the user these fixed links. Never invent or announce a new `*.trycloudflare.com` hostname.
