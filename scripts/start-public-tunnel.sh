#!/usr/bin/env bash
# Relance app locale + tunnel Cloudflare quick (HTTPS temporaire)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[1/3] Next.js (DEMO_MODE=true)…"
pkill -f 'next dev --port 3000' 2>/dev/null || true
sleep 1
DEMO_MODE=true npm run dev &
NEXT_PID=$!

for i in $(seq 1 40); do
  if curl -sf -o /dev/null http://127.0.0.1:3000/login; then
    echo "Next OK"
    break
  fi
  sleep 1
done

echo "[2/3] Cloudflare tunnel…"
pkill -f 'cloudflared tunnel --protocol http2' 2>/dev/null || true
sleep 1
CF_BIN="${CLOUDFLARED_BIN:-/tmp/cloudflared}"
if [[ ! -x "$CF_BIN" ]]; then
  echo "cloudflared introuvable ($CF_BIN)" >&2
  exit 1
fi
rm -f /tmp/cf-tunnel.log
"$CF_BIN" tunnel --protocol http2 --url http://127.0.0.1:3000 2>&1 | tee /tmp/cf-tunnel.log &
CF_PID=$!

for i in $(seq 1 30); do
  URL=$(rg -o 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cf-tunnel.log 2>/dev/null | tail -1 || true)
  if [[ -n "${URL:-}" ]]; then
    echo "[3/3] Tunnel actif : $URL"
    echo "$URL" | tee /tmp/active-tunnel-url.txt
    for p in /login /inventaire /admin /admin/inventaires; do
      code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$URL$p" || echo err)
      echo "  $code $URL$p"
    done
    echo "Laisser tourner (PID next=$NEXT_PID cf=$CF_PID). Ctrl+C pour arrêter."
    wait
    exit 0
  fi
  sleep 1
done
echo "Échec obtention URL tunnel" >&2
exit 1
