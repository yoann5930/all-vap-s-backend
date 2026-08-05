# Fixed inventaire tunnel URLs (mandatory)

## Never change these URLs

Do **not** restart, kill, or recreate the Cloudflare quick tunnel in a way that would change:

- https://heather-auctions-they-leu.trycloudflare.com/acces
- https://heather-auctions-they-leu.trycloudflare.com/inventaire
- https://heather-auctions-they-leu.trycloudflare.com/login?next=/inventaire

Source of truth: `data/FIXED_TUNNEL_URL.txt`

## Servers must stay up

- Next.js + tunnel must **not** stop except on explicit user request.
- Use `scripts/ensure-servers.sh` to supervise without killing healthy processes.
- Stop only with `scripts/stop-servers.sh` (add `--also-tunnel` only if user asks to kill the tunnel).
- Never `pkill cloudflared` / never kill a healthy `next` during routine work.
- `scripts/keep-servers.sh` ignores Ctrl+C; it only exits on the STOP flag from `stop-servers.sh`.

## When restarting servers

- Restart **Next.js only** if it is truly dead (not responding after retries).
- **Never** kill the tunnel process unless the user explicitly accepts a new URL.
- Always give the user the fixed links above — never a new `*.trycloudflare.com` hostname.
