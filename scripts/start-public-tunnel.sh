#!/usr/bin/env bash
# Relance Next.js local. Respecte l’URL tunnel VERROUILLÉE.
# Ne tue / ne recrée JAMAIS cloudflared sans accord explicite (nouvelle URL).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FIXED_URL="$(cat "$ROOT/data/FIXED_TUNNEL_URL.txt" 2>/dev/null | tr -d '[:space:]')"
FIXED_URL="${FIXED_URL:-https://inventaire.allvaps.fr}"

echo "[1/2] Next.js…"
pkill -f 'next dev --port 3000' 2>/dev/null || true
sleep 1
DEMO_MODE=true npm run dev &
NEXT_PID=$!

for i in $(seq 1 40); do
  if curl -sf -o /dev/null http://127.0.0.1:3000/api/health; then
    echo "Next OK (pid $NEXT_PID)"
    break
  fi
  sleep 1
done

echo "[2/2] Tunnel verrouillé : $FIXED_URL"
if curl -sf -o /dev/null --max-time 15 "$FIXED_URL/api/health"; then
  echo "Tunnel figé OK — aucun redémarrage cloudflared."
else
  echo "ALERTE: l’URL figée ne répond plus." >&2
  echo "Interdit de lancer un nouveau quick tunnel (changerait l’adresse)." >&2
  echo "Demander l’accord utilisateur avant toute nouvelle URL." >&2
  if ! pgrep -f 'cloudflared tunnel --protocol http2 --url http://127.0.0.1:3000' >/dev/null; then
    echo "cloudflared absent." >&2
  fi
fi

echo "Next tourne (PID=$NEXT_PID). Tunnel non modifié."
wait "$NEXT_PID"
