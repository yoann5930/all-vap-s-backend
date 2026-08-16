# NEXUS — FUTURE SECURITY SUPERVISION

All Vap’s conserve **sa propre sécurité applicative**. Nexus n’est **pas** développé dans ce dépôt et n’est **pas** requis pour le fonctionnement du site, d’AVA, de l’inventaire ou des API.

## Architecture cible

```text
                NEXUS
        supervision cybersécurité
                  ↓  (lecture d’événements, plus tard)
     ┌────────────────────────┐
     │     ALL VAP’S / AVA    │
     │ sécurité applicative   │
     │ monitoring / health    │
     │ logs structurés        │
     │ authentification       │
     │ API / base de données  │
     └────────────────────────┘
```

## Niveau 1 — sécurité native (ce dépôt)

Toujours active, même si Nexus est indisponible :

- authentification JWT / cookies `Secure` + `HttpOnly` ;
- CSRF / origines (`lib/security-origins.ts`, middleware) ;
- rate limiting (`lib/rate-limit.ts`) ;
- autorisations admin / rôles ;
- headers CSP + Permissions-Policy ;
- secrets uniquement en variables d’environnement (jamais dans Git).

## Niveau 2 — Nexus (projet séparé)

Plus tard, Nexus pourra **lire** les journaux et corréler des anomalies (module Cyberattaques).  
All Vap’s **n’appelle pas** Nexus. Aucune action automatique (blocage client, DNS, Vercel, Render, firewall) n’est créée ici.

## Événements exploitables

Format JSON une ligne, préfixe `[ops]`, sans mot de passe / token / cookie / secret :

```json
{
  "timestamp": "…",
  "service": "allvaps",
  "environment": "production",
  "category": "security",
  "event": "AUTH_FAILURE",
  "severity": "warning",
  "route": "/api/auth/login",
  "requestId": "…",
  "metadata": { "reason": "invalid_credentials" }
}
```

Noms réservés (détection / corrélation = Nexus, pas All Vap’s) : voir `NEXUS_EVENT_NAMES` dans `lib/ops/telemetry.ts`.

Corrélation HTTP : header `x-request-id` (middleware) + `correlationId` AVA (`lib/ava/logging.ts`).

Points de santé déjà autonomes :

- `GET /api/health` — process + base + `requestId` ;
- `GET /api/ava/health` — check-up AVA.
