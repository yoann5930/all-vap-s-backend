# AVA Phase 1 — snapshot Git 16 août 2026

Sauvegarde **dans Git** (branche `backup/ava-phase1-2026-08-16`).
Aucune copie hors dépôt. Aucun secret `.tmp-*` / `.env`.

## Baseline audit

- Score : 56/100
- Anomalie C-01 : cœur AVA hors Git

## HEAD au moment du snapshot

- Backend branche de départ : `feat/ava-3d-pack-integrate`
- Backend HEAD : `e19484f8`
- Android branche de départ : `master`
- Android HEAD : `652dc54`

## Contenu versionné ici

Cœur serveur : `lib/ava/unified-brain.ts`, `lib/ava/shared-memory.ts`, `lib/ava/central-router.ts`, `lib/nicotine/`, `lib/ava-order/`, `app/api/ava/`, tests nicotine / ava associés, identité e-mail AVA.

Cœur Android (dépôt séparé, branche homonyme) : voix persistante, nicotine, commandes ready, démos MR / commande.

## Non versionné volontairement

- `.tmp-*`, `.env`, tokens
- photos catalogue / rapports SumUp
- `window_dump.xml`
