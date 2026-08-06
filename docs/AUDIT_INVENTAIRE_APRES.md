# Audit inventaire après corrections — All Vap's

**Date :** 2026-08-04  
**Branche :** `cursor/dual-stock-inventaire-e2e4`  
**PR :** https://github.com/yoann5930/all-vap-s-backend/pull/1

## Corrections appliquées

| Domaine | Action |
|---|---|
| Emplacements | `HAUTMONT` + `LE_QUESNOY` actifs ; `GLOBAL_ALL_VAPS` legacy inactif |
| Global | Somme calculée des deux boutiques (`getDualStockForProduct`, miroir `Product.stock`) |
| Migration | `20260804140000_dual_store_inventory` — GLOBAL → Hautmont (sans duplication) |
| Inventaire | Modèles + APIs + UI `/admin/inventaire` (employé, boutique, scan, photo, clôture) |
| SumUp | Cible boutique obligatoire |
| Admin stocks | Édition par boutique + colonnes dual/global |
| Excel | Feuilles `Stocks_Hautmont`, `Stocks_Le_Quesnoy`, `Stocks_Global_Calcule` |
| Google | `lib/google/*` + `/api/admin/google/sync` ; vars dans `.env.example` uniquement |
| E-commerce | Décrément selon `pickupStoreId` (défaut Hautmont) |
| PWA | `public/sw.js` + file hors ligne inventaire |
| APIs produits | `stockHautmont`, `stockLeQuesnoy`, `stock` (somme) |

## Tests exécutés (preuves)

| Commande | Résultat |
|---|---|
| `npm install` (+ `googleapis`) | OK |
| `npx prisma generate` | OK |
| `npm run lint` | OK (0 warning) |
| `npx tsc --noEmit` | OK (après fix type locationCode) |
| `npx tsx scripts/catalog-phase2-tests.ts` | **36 OK, 0 FAIL** |
| `npm run build` | OK |
| `git diff --check` | OK |
| `npx prisma validate` | **ÉCHEC** — `DATABASE_URL` absente (attendu sans `.env`) |
| `npm audit --omit=dev` | 9 vulns (exceljs/uuid + googleapis/uuid) |

## Données non inventées

- Prix / EAN / SKU / historiques commandes : non inventés
- Quantités Le Quesnoy : 0 après migration (à inventaire réel)
- Aucune clé Google dans le dépôt

## Verdict factuel

Double stock + inventaire **codés et buildés**.  
**Ne pas déclarer zéro erreur** : pas de PostgreSQL local pour migrate/dry-run, Google sync désactivé sans credentials, inventaire Le Quesnoy à réaliser, 9 vulnérabilités npm.
