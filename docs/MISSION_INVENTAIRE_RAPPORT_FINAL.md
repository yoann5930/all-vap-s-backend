# Rapport final — Mission inventaire double stock

**Date :** 2026-08-04  
**Branche :** `cursor/dual-stock-inventaire-e2e4`  
**PR draft :** https://github.com/yoann5930/all-vap-s-backend/pull/1

## Résumé

Deux stocks indépendants **All Vap's Hautmont** et **All Vap's Le Quesnoy** sont réactivés. Le stock global n’est plus un emplacement writable : c’est la **somme calculée** des deux boutiques. Un parcours inventaire mobile (scan, photo, employé, boutique) est disponible sous `/admin/inventaire`. Google Drive / Sheets sont entièrement préparés sans aucune clé dans le projet.

## Architecture stock

```
HAUTMONT (writable) ──┐
                      ├──► Product.stock = somme (global calculé)
LE_QUESNOY (writable)─┘
GLOBAL_ALL_VAPS → legacy inactif (données migrées vers Hautmont)
```

- Défaut e-commerce sans `pickupStoreId` : **Hautmont** (documenté dans le code).
- Import SumUp : boutique cible **obligatoire**.
- Clôture inventaire : applique les quantités **uniquement** sur la boutique de la session.

## Fichiers clés

| Zone | Chemins |
|---|---|
| Normalize / stock | `lib/catalog/normalize.ts`, `lib/catalog/stock.ts` |
| Migration | `prisma/migrations/20260804140000_dual_store_inventory/` |
| Inventaire | `app/admin/inventaire/`, `app/api/admin/inventory/**` |
| Google | `lib/google/*`, `app/api/admin/google/sync/route.ts`, `.env.example` |
| PWA | `public/sw.js`, `lib/inventory/offline-queue.ts` |
| Audits | `docs/AUDIT_INVENTAIRE_AVANT.md`, `docs/AUDIT_INVENTAIRE_APRES.md` |

## Variables à renseigner (Yoann)

Dans `.env` local uniquement (jamais commit) :

```
GOOGLE_SYNC_ENABLED=true
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_FOLDER_ID=...
GOOGLE_SHEETS_SPREADSHEET_ID=...
DATABASE_URL=...
```

## Actions restantes

1. Fournir `DATABASE_URL` et appliquer `npx prisma migrate deploy` en préprod (pas en prod sans validation).
2. Réaliser un inventaire Le Quesnoy (stocks à 0 après migration GLOBAL→Hautmont).
3. Renseigner les credentials Google puis tester `POST /api/admin/google/sync?action=sheets`.
4. Valider scan caméra / photo sur téléphone réel.
5. Autorisation explicite Yoann avant push/merge/prod.

## Erreurs corrigées pendant la mission

- TypeScript `locationCode` trop étroit dans la route SumUp → typé `string` + garde `isStoreStockCode`.
- Tests phase 2 alignés sur double stock (36 OK).

## Verdict

Mission inventaire **implémentée localement avec preuves lint/tsc/tests/build**.  
Reste bloqué sans PostgreSQL local et sans credentials Google — comportement attendu et documenté.
