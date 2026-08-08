# Validation locale avant déploiement

**Date :** 2026-08-06  
**Projet :** `/workspace` @ `d5a6490`

## Commandes exécutées

| Commande | Résultat |
|---|---|
| `npx prisma validate` | OK |
| `npx prisma generate` | OK (client 6.19.3) |
| `npm run lint` | OK (2 warnings inventaire hooks/`<img>`, non bloquants) |
| `npx tsc --noEmit` | OK (exit 0) |
| `npm run build` | OK (exit 0) |
| `git diff --check` | OK |
| Script `test` dédié | **Absent** de `package.json` (pas de `npm run test`) |
| Script `typecheck` | Absent — remplacé par `tsc --noEmit` |

## Smoke HTTP localhost (`DEMO_MODE=true`)

Tous en **200** : `/`, `/boutique`, `/ia`, `/login`, `/cart`, `/faq`, `/cgv`, `/inventaire`, `/api/health`, `/api/products`, `/api/categories`.

## Smoke HTTP production

Tous en **200** : `/`, `/boutique`, `/ia`, `/login`, `/cart`, `/faq`, `/cgv`, `/api/health`, `/api/products`, `inventaire.allvaps.fr/inventaire`.

## Build local production

`npm run build` réussi — routes inventaire, boutique, A.V.A. (`/ia`) présentes dans l’output Next.

## Décision

Validation locale **OK** pour le tip déjà en production.  
Aucun commit `release:` de code applicatif nécessaire (diff code = 0 vs prod).
