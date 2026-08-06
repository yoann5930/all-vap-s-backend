# Audit inventaire avant corrections — All Vap's

**Date :** 2026-08-04  
**Branche :** `cursor/dual-stock-inventaire-e2e4`  
**Racine :** `/workspace` (dépôt `all-vap-s-backend`)  
**Mission :** `all-vaps-cursor-mission` — double stock + inventaire + Drive/Sheets

## État Git

- Base : `main` (`b07fe36`)
- Branche de travail : `cursor/dual-stock-inventaire-e2e4`
- Aucune clé API dans le dépôt ; `.env.example` sans secrets Google Drive/Sheets

## Cartographie stock actuelle

| Élément | État |
|---|---|
| Emplacement officiel | `GLOBAL_ALL_VAPS` seul (`lib/catalog/normalize.ts`) |
| Boutiques | `HAUTMONT` / `LE_QUESNOY` **désactivés** dans `ensureGlobalStockLocation()` |
| `Product.stock` | Agrégat legacy utilisé par e-commerce / admin stocks |
| `StockLevel` | Quantités par emplacement ; écriture SumUp → GLOBAL uniquement |
| Boutiques pickup | `lib/stores.ts` (`hautmont`, `le-quesnoy`) — pas liées au stock |
| Inventaire physique | **Absent** (pas de session, scan, photo, comptage) |
| Google Drive / Sheets | **Absent** (GA + Search Console seulement) |
| PWA offline | Manifest partiel ; **pas** de service worker |

## Gaps confirmés

1. Un seul stock writable — contraire à la mission (deux stocks indépendants).
2. Stock « global » traité comme emplacement physique au lieu d’une somme calculée.
3. Admin stocks PATCH ne touche que `Product.stock` (pas `StockLevel`).
4. Import SumUp force `GLOBAL_ALL_VAPS` ; Excel interdit les feuilles Hautmont / Le Quesnoy.
5. Aucun parcours inventaire (employé, boutique, scan, photo, quantité).
6. Aucune architecture Google Drive / Sheets.
7. Tests phase 2 affirment l’absence de HAUTMONT / LE_QUESNOY.

## Périmètre de correction prévu

- Réactiver `HAUTMONT` + `LE_QUESNOY` ; désactiver `GLOBAL_ALL_VAPS` en écriture.
- Global = somme des deux boutiques (miroir `Product.stock`).
- Migration documentée GLOBAL → HAUTMONT (préserve le total ; Le Quesnoy à 0).
- Modèles + UI/API inventaire ; scaffold Drive/Sheets ; PWA offline inventaire.
- Mise à jour SumUp / admin / Excel / tests / rapports.

## Interdictions

Pas d’invention de prix/EAN, pas de clés API, pas de push/prod, pas de doublon GLOBAL→deux boutiques.
