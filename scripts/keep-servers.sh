#!/usr/bin/env bash
# Superviseur inventaire — ne s’arrête / ne tue RIEN sauf panne réelle.
# Arrêt uniquement via : bash scripts/stop-servers.sh (demande utilisateur).
#
# Règles :
# - URL tunnel FIGÉE (data/FIXED_TUNNEL_URL.txt) — jamais de nouveau quick tunnel
# - Ne jamais pkill next/cloudflared s’ils répondent
# - Ne jamais propager Ctrl+C aux enfants (setsid + trap)
set -u
cd /workspace

FIXED_TUNNEL_URL="$(tr -d '[:space:]' < data/FIXED_TUNNEL_URL.txt 2>/dev/null || true)"
FIXED_TUNNEL_URL="${FIXED_TUNNEL_URL:-https://inventaire.allvaps.fr}"

mkdir -p /tmp/allvaps-keepalive
LOG_NEXT=/tmp/allvaps-keepalive/next.log
LOG_CF=/tmp/allvaps-keepalive/cloudflared.log
LOG_SUP=/tmp/allvaps-keepalive/supervisor.log
URL_FILE=/tmp/allvaps-keepalive/tunnel-url.txt
STOP_FLAG=/tmp/allvaps-keepalive/STOP

echo "$FIXED_TUNNEL_URL" > "$URL_FILE"
rm -f "$STOP_FLAG"

# Ne pas mourir / ne pas tuer les enfants sur SIGINT/SIGTERM du terminal
trap 'echo "[supervisor $(date -Is)] signal ignoré (arrêt seulement via stop-servers.sh)" | tee -a "$LOG_SUP"' INT TERM
trap '' HUP

log() { echo "[supervisor $(date -Is)] $*" | tee -a "$LOG_SUP"; }

ensure_cloudflared_bin() {
  if [ ! -x /tmp/cloudflared ]; then
    curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared
    chmod +x /tmp/cloudflared
  fi
}

next_running() {
  pgrep -f 'next-server|next dev --port 3000' >/dev/null
}

cf_running() {
  pgrep -f 'cloudflared tunnel --protocol http2 --url http://127.0.0.1:3000' >/dev/null
}

health_local_ok() {
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:3000/api/health 2>/dev/null || echo 000)
  [ "$code" = "200" ]
}

fixed_tunnel_ok() {
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$FIXED_TUNNEL_URL/api/health" 2>/dev/null || echo 000)
  [ "$code" = "200" ]
}

# Démarre Next UNIQUEMENT s’il n’existe pas — jamais de kill préventif
ensure_next() {
  if health_local_ok; then
    return 0
  fi
  if next_running; then
    # Process présent mais pas encore prêt — on attend, on ne tue pas
    log "next présent mais health KO — attente (pas de kill)"
    return 1
  fi
  log "next absent → démarrage (setsid, détaché)"
  ensure_cloudflared_bin
  # setsid : Ctrl+C sur le superviseur ne tue pas Next
  setsid npm run dev >>"$LOG_NEXT" 2>&1 < /dev/null &
  echo $! > /tmp/allvaps-keepalive/next.pid
  return 0
}

# Tunnel : ne démarre un NOUVEAU process QUE si aucun cloudflared.
# Attention : un nouveau process = nouvelle URL (interdit). Donc on tente
# UNIQUEMENT de garder le process existant ; si absent on alerte fort.
ensure_tunnel() {
  if cf_running; then
    if fixed_tunnel_ok; then
      echo "$FIXED_TUNNEL_URL" > "$URL_FILE"
      return 0
    fi
    log "cloudflared vivant mais URL figée KO — on NE relance PAS (garder le process)"
    return 1
  fi
  log "ALERTE CRITIQUE: cloudflared absent — URL figée $FIXED_TUNNEL_URL probablement morte"
  log "Interdit de relancer un quick tunnel automatiquement. Utiliser stop/start manuel + accord."
  return 1
}

log "démarrage superviseur — URL figée: $FIXED_TUNNEL_URL"
log "arrêt uniquement via scripts/stop-servers.sh"
ensure_cloudflared_bin
ensure_next || true
ensure_tunnel || true

FAIL_NEXT=0
FAIL_TUNNEL=0

while true; do
  if [ -f "$STOP_FLAG" ]; then
    log "STOP demandé explicitement — sortie superviseur (process laissés selon stop-servers)"
    exit 0
  fi

  if health_local_ok; then
    FAIL_NEXT=0
  else
    FAIL_NEXT=$((FAIL_NEXT + 1))
    log "health local KO (streak=$FAIL_NEXT)"
    # 3 échecs consécutifs (~45s) avant (re)démarrage — évite thrashing
    if [ "$FAIL_NEXT" -ge 3 ]; then
      if ! next_running; then
        ensure_next || true
        FAIL_NEXT=0
        sleep 10
      else
        log "next tourne encore — pas de kill, nouvelle attente"
        FAIL_NEXT=2
      fi
    fi
  fi

  if fixed_tunnel_ok; then
    FAIL_TUNNEL=0
    echo "$FIXED_TUNNEL_URL" > "$URL_FILE"
  else
    FAIL_TUNNEL=$((FAIL_TUNNEL + 1))
    log "URL figée KO (streak=$FAIL_TUNNEL) — aucune action destructive"
    ensure_tunnel || true
  fi

  sleep 15
done
