# Passerelle de test AVA (interne)

Banc de test **READ + SIMULATE** pour le cerveau boutique public (`chatAva`) utilisé par allvaps.fr.  
Ce n’est **pas** une API d’administration.

## Chemin réel

```text
Frontend allvaps.fr
↓
POST /api/ai-assistant  (public — inchangé)
↓
chatAva  (lib/ai/ava-advisor.ts)
↓
politique conseiller + mémoire de session
↓
moteur nicotine / reco matériel / catalogue lecture seule
↓
réponse
```

La passerelle de test appelle **le même** `chatAva`, sans `userId`, donc sans écriture de profil client réel.

```text
Outil externe autorisé
↓
POST /api/internal/ava-test
↓
auth Bearer + mode test
↓
chatAva(undefined, …)  ← vrai cerveau, session isolée
↓
réponse structurée (texte + diagnostics)
```

## Activation

Variables d’environnement **serveur uniquement** (jamais `NEXT_PUBLIC_*`, jamais le frontend, jamais Git) :

| Variable | Rôle |
|---|---|
| `AVA_TEST_API_ENABLED` | `true` pour ouvrir la route, sinon `404` |
| `AVA_TEST_API_TOKEN` | secret Bearer (≥ 16 caractères) |

Si `AVA_TEST_API_ENABLED` n’est pas activé, la route répond `404` même avec un token.

## Auth

```http
Authorization: Bearer $AVA_TEST_API_TOKEN
```

- sans token → `401`
- mauvais token → `401`
- token correct + API activée → `200`
- API désactivée → `404`

## Endpoint

`POST /api/internal/ava-test`

### Payload

```json
{
  "sessionId": "demo-beginner-001",
  "message": "Je débute complètement",
  "profilePreset": "BEGINNER",
  "profile": {
    "cigarettesPerDay": 20,
    "cigaretteType": "TUBES",
    "cravingFrequency": "ALL_DAY"
  }
}
```

`sessionId` doit commencer par `test-`, `ava-test-` ou `demo-`.

`profilePreset` : `BEGINNER` | `GUIDED` | `EXPERT`  
Comptes isolés : `AVA_TEST_BEGINNER`, `AVA_TEST_GUIDED`, `AVA_TEST_EXPERT`.

Champ optionnel `sessionResumeToken` : jeton HMAC renvoyé dans `diagnostics` pour continuer la session entre instances serverless, sans base client.

### Réponse (extrait)

```json
{
  "ok": true,
  "sessionId": "demo-beginner-001",
  "avaText": "…",
  "intent": "SHOW_DEVICE_RECOMMENDATIONS",
  "experienceLevel": "BEGINNER",
  "memoryLoaded": true,
  "nicotineDecision": {
    "rangeMin": 15,
    "rangeMax": 18,
    "form": "SALT",
    "reasonCodes": ["HIGH_CONSUMPTION", "ALL_DAY_NEED"]
  },
  "recommendedProducts": [],
  "tts": {
    "queued": true,
    "segments": 3,
    "segmentsExpected": 3,
    "segmentsQueued": 3,
    "completed": true
  },
  "events": ["BEGINNER_DETECTED", "MEMORY_LOADED", "TTS_QUEUED"],
  "diagnostics": {
    "route": "/api/internal/ava-test",
    "engine": "chatAva",
    "latencyMs": 0,
    "testMode": "AVA_TEST_MODE",
    "writeScope": "READ_PLUS_SIMULATE"
  }
}
```

Ces champs internes ne sont **pas** ajoutés à `/api/ai-assistant` ni `/api/ava`.

Erreur moteur :

```json
{
  "ok": false,
  "errorCode": "AVA_TEST_ENGINE_ERROR",
  "message": "Le moteur AVA a rencontré une erreur pendant le test."
}
```

## Reset de session de test

`DELETE /api/internal/ava-test/session/:id`

Supprime **uniquement** une session de test (`test-` / `ava-test-` / `demo-`).  
Ne touche jamais une mémoire client réelle.

## Droits

Autorisé : lire la réponse AVA, simuler une mémoire de test, consulter catalogue / dispo.

Interdit : écriture stock, commande réelle, paiement, Fidelatoo, e-mail, expédition, profil client réel, mot de passe.

## Rate limit

40 requêtes / 5 minutes / IP (process-local).

## Exemple

```bash
curl -X POST https://www.allvaps.fr/api/internal/ava-test \
  -H "Authorization: Bearer $AVA_TEST_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "demo-beginner-001",
    "message": "Je débute complètement",
    "profilePreset": "BEGINNER"
  }'
```

```bash
curl -X DELETE https://www.allvaps.fr/api/internal/ava-test/session/demo-beginner-001 \
  -H "Authorization: Bearer $AVA_TEST_API_TOKEN"
```

## Tests locaux

```bash
npm run ava:test-gateway
```

Ne pas ajouter OpenAI : la passerelle n’utilise pas `OPENAI_API_KEY`.
