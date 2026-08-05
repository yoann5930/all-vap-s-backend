#!/usr/bin/env bash
# Garde Next.js actif. Tunnel Cloudflare : URL VERROUILLÉE — ne pas régénérer.
# Règle obligatoire : https://minnesota-join-powerpoint-heritage.trycloudflare.com
set -u
cd /workspace

FIXED_TUNNEL_URL="https://minnesota-join-powerpoint-heritage.trycloudflare.com"
mkdir -p /tmp/allvaps-keepalive
LOG_NEXT=/tmp/allvaps-keepalive/next.log
LOG_CF=/tmp/allvaps-keepalive/cloudflared.log
URL_FILE=/tmp/allvaps-keepalive/tunnel-url.txt
LOCK_FILE=/workspace/data/FIXED_TUNNEL_URL.txt

echo "$FIXED_TUNNEL_URL" > "$URL_FILE"
echo "$FIXED_TUNNEL_URL" > "$LOCK_FILE"

ensure_cloudflared_bin() {
  if [ ! -x /tmp/cloudflared ]; then
    curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared
    chmod +x /tmp/cloudflared
  fi
}

health_local_ok() {
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3000/api/health || echo 000)
  [ "$code" = "200" ]
}

fixed_tunnel_ok() {
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$FIXED_TUNNEL_URL/api/health" || echo 000)
  [ "$code" = "200" ]
}

start_next() {
  echo "[keepalive $(date -Is)] start next" | tee -a "$LOG_NEXT"
  npm run dev >>"$LOG_NEXT" 2>&1 &
  echo $! > /tmp/allvaps-keepalive/next.pid
}

# IMPORTANT : on ne démarre un tunnel QUE s’il n’y en a aucun.
# On ne tue JAMAIS un cloudflared existant (sinon nouvelle URL = interdit).
ensure_tunnel_process() {
  if pgrep -f 'cloudflared tunnel --protocol http2 --url http://127.0.0.1:3000' >/dev/null; then
    echo "[keepalive $(date -Is)] cloudflared déjà actif — on ne le relance pas (URL figée)" | tee -a "$LOG_CF"
    return 0
  fi
  echo "[keepalive $(date -Is)] ALERTE: aucun cloudflared. URL figée probablement morte." | tee -a "$LOG_CF"
  echo "[keepalive] NE PAS démarrer un nouveau quick tunnel sans accord utilisateur (changerait l’URL)." | tee -a "$LOG_CF"
  # Ne démarre PAS automatiquement un nouveau tunnel.
  return 1
}

# Ne tue PAS cloudflared au démarrage
if [ -f /tmp/allvaps-keepalive/next.pid ]; then
  old=$(cat /tmp/allvaps-keepalive/next.pid 2>/dev/null || true)
  if [ -n "${old:-}" ]; then
    kill "$old" 2>/dev/null || true
  fi
fi
# Uniquement next — jamais pkill cloudflared ici
pkill -f 'next dev --port 3000' 2>/dev/null || true
sleep 1

ensure_cloudflared_bin
start_next
sleep 4
ensure_tunnel_process || true

echo "[keepalive] surveillance démarrée — URL verrouillée: $FIXED_TUNNEL_URL"
while true; do
  if ! health_local_ok; then
    echo "[keepalive $(date -Is)] next down → restart (tunnel intact)" | tee -a "$LOG_NEXT"
    pkill -f 'next dev --port 3000' 2>/dev/null || true
    sleep 1
    start_next
    sleep 5
  fi

  if ! fixed_tunnel_ok; then
    echo "[keepalive $(date -Is)] URL FIGÉE KO ($FIXED_TUNNEL_URL) — pas de nouveau tunnel auto" | tee -a "$LOG_CF"
    # Si le process a disparu, on signale seulement
    if ! pgrep -f 'cloudflared tunnel --protocol http2 --url http://127.0.0.1:3000' >/dev/null; then
      echo "[keepalive] cloudflared absent. Intervention manuelle + accord utilisateur requis." | tee -a "$LOG_CF"
    fi
  else
    echo "$FIXED_TUNNEL_URL" > "$URL_FILE"
  fi

  sleep 8
done
