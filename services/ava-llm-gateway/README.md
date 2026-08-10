# A.V.A. LLM Gateway — passerelle sécurisée PC fixe → Ollama
#
# Architecture (obligatoire) :
#   Vercel → HTTPS → llm.allvaps.fr (Caddy) → 127.0.0.1:8791 → 127.0.0.1:11434 (Ollama)
#
# INTERDIT : ouvrir le port Ollama 11434 sur Internet.

## Endpoints exposés

| Méthode | Path | Auth |
| --- | --- | --- |
| GET | `/` | aucune (discovery JSON locale) |
| GET | `/health` | aucune (pas de secret) |
| GET | `/status` | HMAC |
| GET | `/models` | HMAC |
| POST | `/v1/ava/chat` | HMAC `timestamp.nonce.body` |

Pas de proxy Ollama générique, pas de `pull`, pas de shell. Ollama reste sur `127.0.0.1:11434`.

## Headers HMAC (identique Fidelatoo)

- `X-Allvaps-Timestamp` — unix seconds
- `X-Allvaps-Nonce` — aléatoire unique
- `X-Allvaps-Signature` — HMAC-SHA256 hex de `timestamp.nonce.body`

## Préparation locale

```powershell
powershell -ExecutionPolicy Bypass -File .\services\ava-llm-gateway\scripts\prepare-local.ps1
cd services\ava-llm-gateway
npm install
npm start
npm run smoke
```

Secret : `.local/ava-llm-gateway/gateway.secret` (gitignored).

## Variables Vercel (serveur uniquement)

```text
AVA_LLM_PROVIDER=local
AVA_LOCAL_AI_GATEWAY_URL=https://llm.allvaps.fr
AVA_LLM_GATEWAY_SECRET=<même secret que le fichier PC>
AVA_LOCAL_MODEL=qwen2.5:7b
AVA_LOCAL_FALLBACK=llama3.2:3b
# OpenAI optionnel / désactivé pour le test final :
# OPENAI_API_KEY=   (vide)
```

`AVA_LOCAL_AI_GATEWAY_URL` = racine HTTPS du gateway (sans `/v1/ava`).

## Caddy

Ajouter le site dans le **même** Caddyfile que Fidelatoo (un seul process sur :443) :

Voir `caddy/Caddyfile.example`.

## Autostart Windows

```powershell
powershell -ExecutionPolicy Bypass -File .\services\ava-llm-gateway\scripts\install-autostart.ps1
```

## DNS — À VALIDER AVANT APPLICATION

Ne pas créer automatiquement. Entrée proposée :

| Champ | Valeur |
| --- | --- |
| TYPE | A |
| SOUS-DOMAINE | llm |
| CIBLE | *IP publique Freebox (même chemin que fidelatoo.allvaps.fr si Caddy local)* |
| TTL | 300 |

Alternative si tunnel Cloudflare (comme le plan Fidelatoo) : CNAME `llm` → tunnel nommé — à confirmer selon l’archi réelle.

FQDN cible : `llm.allvaps.fr`
