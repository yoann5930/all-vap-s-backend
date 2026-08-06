# RAPPORT AVA — Sécurité

**Dernière mise à jour :** 2026-08-01  
**État :** ✅ Règles codées + tests unitaires — validation scénarios réels photo/vidéo restante

## Priorité absolue

Si danger (batterie gonflée, fumée, étincelles, port fondu, etc.) :

> N'utilisez plus l'appareil et ne le rechargez pas. Posez-le à l'écart de toute matière inflammable et apportez-le en boutique pour contrôle.

Implémentation : `lib/ava/hardware-safety.ts` / `device-safety.ts` + intents `dangerPhrases`.

## Interdits

Ne jamais conseiller : démonter batterie/accu, percer, shunter, souder, firmware, résistance forcée, réparation sous tension.

## Tests

- `ava:hardware:test` — batterie gonflée / fumée → danger **PASS**
- Audit intégration — safety check **PASS**

## Restant

- Scénarios vidéo danger en conditions réelles  
- Orientation boutique systématique post-consigne (liens boutiques)
