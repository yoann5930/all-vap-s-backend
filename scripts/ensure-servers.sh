#!/usr/bin/env bash
# Démarre / assure Next + superviseur SANS toucher au tunnel figé.
set -u
cd /workspace
chmod +x scripts/keep-servers.sh scripts/stop-servers.sh 2>/dev/null || true

FIXED="$(tr -d '[:space:]' < data/FIXED_TUNNEL_URL.txt)"
echo "URL figée: $FIXED"

# Ne tue rien. Lance le superviseur détaché s’il manque.
if pgrep -f 'bash scripts/keep-servers.sh' >/dev/null; then
  echo "superviseur déjà actif"
else
  mkdir -p /tmp/allvaps-keepalive
  setsid bash scripts/keep-servers.sh >> /tmp/allvaps-keepalive/supervisor.log 2>&1 < /dev/null &
  echo $! > /tmp/allvaps-keepalive/supervisor.pid
  echo "superviseur démarré pid=$(cat /tmp/allvaps-keepalive/supervisor.pid)"
fi

# Attente health
for i in $(seq 1 30); do
  if curl -sf -o /dev/null --max-time 3 http://127.0.0.1:3000/api/health; then
    echo "Next OK"
    break
  fi
  sleep 1
done

if curl -sf -o /dev/null --max-time 20 "$FIXED/api/health"; then
  echo "Tunnel figé OK: $FIXED"
else
  echo "ALERTE: tunnel figé KO — ne pas relancer sans accord utilisateur"
fi
