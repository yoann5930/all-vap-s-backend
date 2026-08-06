# URL inventaire officielle — domaine All Vap's (mandatory)

## Domaine propriétaire

**allvaps.fr** (Yoann / All Vap's) — DNS chez OVH.

## URL inventaire FIGÉE (jamais changer sans OK explicite)

- https://inventaire.allvaps.fr/acces
- https://inventaire.allvaps.fr/inventaire
- https://inventaire.allvaps.fr/login?next=/inventaire

Source of truth: `data/FIXED_TUNNEL_URL.txt`

Aussi acceptés (même domaine) : `https://www.allvaps.fr`, `https://allvaps.fr`.

**INTERDIT** de basculer vers une URL `*.trycloudflare.com` aléatoire.
Les quick tunnels Cloudflare ne sont plus la source d’accès inventaire.

## Serveurs locaux (dev / démo)

- Next.js local ne s’arrête que sur demande (`scripts/stop-servers.sh`).
- Android APK : `/apps/AllVaps-Inventaire.apk` → ouvre `https://inventaire.allvaps.fr/inventaire`.
