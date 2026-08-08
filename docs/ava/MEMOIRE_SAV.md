# Mémoire SAV A.V.A.

**Fichiers**
- `data/ava/problems/sav-memory.json` — 26 problèmes, alias, contrôles, solutions client/boutique
- `data/ava/problems/problems-library.json` — fiches de base
- `lib/ava/sav-memory.ts` — matching + fusion
- `lib/ava/generic-diagnostic-flow.ts` — étapes guidées depuis la mémoire

**Règles**
- Pas de facture exigée pour démarrer
- Pas de démontage dangereux / puffs / JNR exclus
- Arrêt immédiat : batterie gonflée / surchauffe

**Écoute**
- Soft-reset des relances Web Speech (ne coupe plus l’écoute après ~8 `onend`)
- Compteur remis à zéro dès qu’une parole est détectée
