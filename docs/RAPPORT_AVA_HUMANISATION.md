# RAPPORT AVA — Humanisation

**Dernière mise à jour :** 2026-08-01  
**Module :** AVA Voix / style vendeuse  
**État :** ⚠️ Partiel — fondations OK, fluidité réelle TTS à valider

## Objectif

Faire parler AVA comme une vendeuse française : chaleureuse, une question à la fois, sans langage robotique, sans lecture de fiche catalogue.

## Fichiers clés

- `lib/ava/conversation-style.ts`
- `lib/ava/pronunciation-engine.ts`
- `data/ava/pronunciations.json`
- `lib/ai/ava-speech-utils.ts`
- `lib/ai/ava-voice-product-rules.ts`

## Comportement

- Ban des phrases robotiques (`FORBIDDEN_ROBOT_PHRASES`)
- Banque de phrases naturelles par ton
- **e.Tasty → i tésti** (voix FR, pas d’accent anglais)
- Pas de prix / stock / ml dans la voix

## Sources professionnelles (principes uniquement)

Voir historique dans la génération initiale : RNCP conseiller de vente, France Travail relation client, écoute active (reformulation, une question).

## Tests

- `npm run ava:voice-rules:test` → **16 OK**
- Anti-robot + prononciation couverts dans `ava:hardware:test` / audit intégration

## Erreurs corrigées

- Prononciation e.Tasty alignée sur « i tésti »
- Phrases « Je n’ai pas compris » remplacées sur le chemin écoute

## Erreurs restantes / bloquants

- Formulations encore un peu catalogue (« susceptibles de vous intéresser »)
- Validation TTS navigateur réel (Android / iPhone / Windows) : **`NON TESTÉ SUR APPAREIL RÉEL`**
- Session Cursor Chromium (2026-08-01) : accueil + danger clairs ; TTS oral non évalué → [`RAPPORT_AVA_TESTS_REELS.md`](./RAPPORT_AVA_TESTS_REELS.md)

## Ne pas écrire « Mission terminée »
