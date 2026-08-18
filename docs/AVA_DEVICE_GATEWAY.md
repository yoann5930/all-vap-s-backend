# Passerelle Samsung AVA (interne)

Pilotage **contrôlé** du téléphone Samsung AVA. Pas d’ADB public, pas de shell arbitraire, pas d’OpenAI.

```text
Outil autorisé
↓
POST /api/internal/ava-device   (Bearer AVA_DEVICE_GATEWAY_TOKEN)
↓
file de commandes structurées
↓
HTTPS sortant du Samsung (poll / heartbeat / result)
↓
AVA Device Agent (Android Keystore)
↓
Accessibility API / Intents
↓
résultat journalisé
```

La passerelle cerveau reste séparée : `POST /api/internal/ava-test`.

## Kill switch

| Niveau | Variable / UI |
|---|---|
| Serveur | `AVA_DEVICE_GATEWAY_ENABLED=false` → 404 immédiat |
| Téléphone | « Désactiver accès distant AVA » |

## Variables (noms seulement)

```
AVA_DEVICE_GATEWAY_ENABLED
AVA_DEVICE_GATEWAY_TOKEN
AVA_DEVICE_ENROLL_TOKEN
AVA_DEVICE_APPROVAL_TOKEN
AVA_DEVICE_ALLOWED_IDS=AVA-SAMSUNG-01
AVA_DEVICE_FULL_CONTROL_ENABLED=false
AVA_DEVICE_SHELL_ENABLED=false
```

Aucun secret dans Git, le frontend, ou `NEXT_PUBLIC_*`.

## Auth

- Opérateur : `Authorization: Bearer $AVA_DEVICE_GATEWAY_TOKEN`
- Agent : `X-Ava-Device-Id` + horodatage + HMAC-SHA256 (secret Keystore)
- CRITICAL : `approvalId` émis via `POST /api/internal/ava-device/approval` avec `AVA_DEVICE_APPROVAL_TOKEN` (TTL 5 min, usage unique)

## Commandes

SAFE_READ : `DEVICE_STATUS`, `LIST_APPS`, `CHECK_TTS`, …  
SAFE_TEST : `OPEN_AVA`, `OPEN_FIDELATOO`, `SCREENSHOT`, `TAP`, `HOME`, `RUN_AVA_SCENARIO`  
SENSITIVE : e-mail / SMS / appel — bloqués sans `FULL_CONTROL`  
CRITICAL : points Fidelatoo, reset, suppression, étiquette payante, shell — **approval obligatoire**. Fidelatoo write reste **DRY_RUN** (arrêt avant écriture).

Pas de `POST /shell`.

## Exemple

```bash
curl -X POST https://www.allvaps.fr/api/internal/ava-device \
  -H "Authorization: Bearer $AVA_DEVICE_GATEWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"AVA-SAMSUNG-01","command":"DEVICE_STATUS","waitMs":8000}'
```

Identité de test mobile : `AVA_MOBILE_TEST_USER` (jamais un vrai client).

En production Vercel, l’état (enrôlement, jobs, heartbeat) est persisté dans `AppSetting` par clés `ava.device.*` — pas de table inventaire / employé / client.

## Agent Android

`mobile/ava-device-agent/` — connexion sortante TLS, backoff, indicateur « Contrôle technique AVA actif », pas de stream écran 24/7, pas de micro/caméra permanents.
