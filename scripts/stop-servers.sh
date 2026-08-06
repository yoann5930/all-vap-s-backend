#!/usr/bin/env bash
# Arrêt EXPLICITE des serveurs inventaire — uniquement sur demande utilisateur.
# Usage: bash scripts/stop-servers.sh [--also-tunnel]
set -u
cd /workspace

mkdir -p /tmp/allvaps-keepalive
STOP_FLAG=/tmp/allvaps-keepalive/STOP
LOG=/tmp/allvaps-keepalive/supervisor.log

echo "[stop $(date -Is)] demande d’arrêt explicite" | tee -a "$LOG"
touch "$STOP_FLAG"

# Stoppe le superviseur
pkill -f 'bash scripts/keep-servers.sh' 2>/dev/null || true
pkill -f 'scripts/keep-servers.sh' 2>/dev/null || true

# Stoppe Next
pkill -f 'next dev --port 3000' 2>/dev/null || true
pkill -f 'next-server' 2>/dev/null || true

if [ "${1:-}" = "--also-tunnel" ]; then
  echo "[stop] arrêt tunnel demandé explicitement (--also-tunnel)" | tee -a "$LOG"
  echo "[stop] ATTENTION: relancer cloudflared changera l’URL trycloudflare" | tee -a "$LOG"
  pkill -f 'cloudflared tunnel --protocol http2 --url http://127.0.0.1:3000' 2>/dev/null || true
else
  echo "[stop] tunnel LAISSÉ ACTIF (URL figée préservée). Pour couper le tunnel: --also-tunnel" | tee -a "$LOG"
fi

sleep 1
echo "[stop] done"
pgrep -af 'next-server|cloudflared tunnel|keep-servers' | grep -v bash || echo "(plus de process next/superviseur)"
