# RAPPORT AVA — Tests

**Dernière mise à jour :** 2026-08-01  

## Suites

| Commande | Résultat |
|----------|----------|
| `npm run ava:continuous:test` | 34 OK |
| `npm run ava:a11y:test` | 15 OK |
| `npm run ava:voice-rules:test` | 16 OK |
| `npm run ava:hardware:test` | 20 OK |
| `npm run ava:device:test` | 10 OK |
| `npm run ava:mission:test` | **95 OK** |
| `npm run audit:integration` (partie AVA) | multi-clients **8/8 PASS** |

## Tests réels (mission 6)

→ [`RAPPORT_AVA_TESTS_REELS.md`](./RAPPORT_AVA_TESTS_REELS.md)

| Périmètre | Statut |
|-----------|--------|
| Cursor Chromium /ia (ouverture, clavier, a11y, danger) | ✅ PARTIEL |
| Mobile / Edge / SumUp / TTS micro / VoiceOver | `NON TESTÉ SUR APPAREIL RÉEL` |

## Couverture cahier des charges (extrait)

| # | Scénario | Automate |
|---|----------|----------|
| Micro autorisé / refusé / indispo | ✅ logique modes |
| Silence / bascule texte | ✅ |
| Voix ↔ clavier | ✅ préférences session |
| Isolation multi-clients | ✅ audit HTTP |
| Coil sans confirmation | ✅ |
| Danger batterie | ✅ + smoke UI réel |
| Micro TTS réel mobile | ❌ `NON TESTÉ SUR APPAREIL RÉEL` |
| Photo/vidéo vision | ❌ `NON TESTÉ SUR APPAREIL RÉEL` |

## Règle

Ne jamais écrire « Mission terminée » si un blocker reste ouvert (voir `RAPPORT_GLOBAL.md`).
Ne jamais remplacer `NON TESTÉ SUR APPAREIL RÉEL` par PASS.
