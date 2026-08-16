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

## Commits de sauvegarde

- Backend `8ca0d418` — cœur `unified-brain`, nicotine, `shared-memory`, `/api/ava`, `lib/ava-order`
- Backend (ce snapshot) — routes AVA encore hors Git : knowledge, incidents, videos, mémoire compte, préparation commande, Fidelatoo agent
- Android `8b2a74d` — voix persistante, nicotine, commandes ready, démos MR / commande

## Contenu versionné ici

Cœur serveur : `lib/ava/unified-brain.ts`, `lib/ava/shared-memory.ts`, `lib/ava/central-router.ts`, `lib/nicotine/`, `lib/ava-order/`, `app/api/ava/`, tests nicotine.

Routes associées : `/api/ava/knowledge`, `/api/ava/incidents`, `/api/ava/videos`, `/api/account/ava-memory`, `/api/orders/[id]/preparation/*`, pages admin knowledge/incidents, wrappers Fidelatoo AVA.

Cœur Android (dépôt séparé, branche homonyme) : voix persistante, nicotine, commandes ready, démos MR / commande.

## Non versionné volontairement

- `.tmp-*`, `.env`, tokens (ignorés, restent sur disque)
- photos catalogue / rapports SumUp
- `window_dump.xml`
- modifications locales déjà suivies (`ava-advisor.ts`, inventaire, e-mails, etc.) : hors C-01, à traiter dans les phases suivantes
