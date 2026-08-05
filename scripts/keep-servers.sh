#!/usr/bin/env bash
# Garde Next.js + tunnel Cloudflare actifs (relance auto si crash).
set -u
cd /workspace

mkdir -p /tmp/allvaps-keepalive
LOG_NEXT=/tmp/allvaps-keepalive/next.log
LOG_CF=/tmp/allvaps-keepalive/cloudflared.log
URL_FILE=/tmp/allvaps-keepalive/tunnel-url.txt

ensure_cloudflared() {
  if [ ! -x /tmp/cloudflared ]; then
    curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared
    chmod +x /tmp/cloudflared
  fi
}

start_next() {
  echo "[keepalive $(date -Is)] start next" | tee -a "$LOG_NEXT"
  npm run dev >>"$LOG_NEXT" 2>&1 &
  echo $! > /tmp/allvaps-keepalive/next.pid
}

start_tunnel() {
  ensure_cloudflared
  echo "[keepalive $(date -Is)] start tunnel" | tee -a "$LOG_CF"
  /tmp/cloudflared tunnel --protocol http2 --url http://127.0.0.1:3000 >>"$LOG_CF" 2>&1 &
  echo $! > /tmp/allvaps-keepalive/cloudflared.pid
}

health_ok() {
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3000/api/health || echo 000)
  [ "$code" = "200" ]
}

refresh_url() {
  # extrait la dernière URL trycloudflare des logs
  url=$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$LOG_CF" 2>/dev/null | tail -1 || true)
  if [ -n "${url:-}" ]; then
    echo "$url" > "$URL_FILE"
  fi
}

# Tue d’anciennes instances gérées
if [ -f /tmp/allvaps-keepalive/next.pid ]; then
  kill "$(cat /tmp/allvaps-keepalive/next.pid)" 2>/dev/null || true
fi
if [ -f /tmp/allvaps-keepalive/cloudflared.pid ]; then
  kill "$(cat /tmp/allvaps-keepalive/cloudflared.pid)" 2>/dev/null || true
fi
pkill -f 'next dev --port 3000' 2>/dev/null || true
pkill -f 'cloudflared tunnel --protocol http2' 2>/dev/null || true
sleep 1

start_next
sleep 4
start_tunnel

echo "[keepalive] boucle de surveillance démarrée"
while true; do
  if ! health_ok; then
    echo "[keepalive $(date -Is)] next down → restart" | tee -a "$LOG_NEXT"
    pkill -f 'next dev --port 3000' 2>/dev/null || true
    sleep 1
    start_next
    sleep 5
  fi

  if ! pgrep -f 'cloudflared tunnel --protocol http2' >/dev/null; then
    echo "[keepalive $(date -Is)] tunnel down → restart" | tee -a "$LOG_CF"
    start_tunnel
    sleep 4
  fi

  refresh_url
  sleep 8
done
