# Audit total avant corrections — All Vap's

**Date :** 2026-08-04  
**Branche :** `main` (`b07fe36`)  
**Racine :** `C:\Users\ASUS\Documents\GitHub\all-vap-s-backend`  
**Lot :** `CURSOR_ALLVAPS_MISSION_COMPLETE` + `catalogue-allvaps.zip`

## État Git

- Branche `main` alignée `origin/main`
- Non suivi : `catalogue-allvaps.zip` (puis dossier mission)
- Aucune modification locale utilisateur non liée détectée avant démarrage

## Cartographie

| Domaine | Emplacements |
|---|---|
| Frontend boutique | `app/boutique`, `components/shop/ProductCatalog.tsx`, `components/home/HomeShowcase.tsx` |
| APIs produits | `app/api/products`, `lib/products/queries.ts`, `app/api/search` |
| Prisma / catalogue | `prisma/schema.prisma` (`Product.sumupProductId`, `visibleOnline`) |
| Import Liquidarom | `lib/catalog/liquidarom-import.ts`, `data/liquidarom/*.csv` |
| Import / sync SumUp | `lib/catalog/sumup-*.ts`, `app/api/admin/catalog/sumup-import` |
| Stocks | `lib/catalog/stock.ts`, `lib/catalog/site-stock.ts` |
| A.V.A. | `lib/ai/ava-advisor.ts`, `components/ai/*`, `ImmersiveAvaScreen` |
| Vision / Knowledge Phase 3-4 | **Absents** du dépôt |
| Mémoire / GDPR | `lib/vape-profile/service.ts`, `VapeProfile.gdprConsent` |
| Paiements | SumUp + Viva (env présentes par nom) |
| Images | `public/products/liquidarom/` (WebP + manifeste) |
| Rapports antérieurs | `docs/AUDIT_CORRECTION_*`, `docs/RAPPORT_CORRECTION_*`, `docs/REFONTE_*` |

## Défauts critiques confirmés

1. **`liquidarom-import.ts` force `isActive=true` et `visibleOnline=true`** alors que le CSV dit « Actif en ligne : Non » sur les 40 lignes.
2. **`ensureBrand` / `ensureCategory` forcent `isActive: true`** à chaque upsert.
3. **Aucun filtre public `visibleOnline=true`** : catalogue, recherche, sitemap, promotions, A.V.A., fiches similaires — tous sur `isActive` seul.
4. **A.V.A. n’exclut pas Puff / JNR / jetables** ; `catalog-search.ts` les booste même.
5. **GLB** non étiqueté « PROTOYPE TECHNIQUE » dans l’UI.
6. **4 photos produit** référencées dans le CSV absentes du lot (`image-1785228599019.jpg` etc.).
7. **40 prix et 40 EAN/SKU métier absents** dans le CSV — ne pas inventer.
8. Scripts mission `test:security`, `test:ava`, `test:ava-knowledge`, `test:ava-phase4` **absents** de `package.json`.
9. Modules Vision / Knowledge Phase 3-4 **non présents**.

## Lot catalogue

- Source : `CURSOR_ALLVAPS_MISSION_COMPLETE/sources/catalogue-allvaps.zip` (~2,1 Mo)
- 40 produits Liquidarom, 10 WebP bannières, code catalogue partiel
- Fusion attendue (pas de remplacement aveugle)

## Périmètre de correction prévu

- Fix import Liquidarom (flags CSV, marques/catégories, dry-run)
- Filtre `visibleOnline` + `isActive` sur surfaces publiques / A.V.A.
- Exclusion Puff/JNR/jetables côté A.V.A.
- Label GLB PROTOYPE TECHNIQUE
- Comparaison médias lot vs dépôt
- Tests locaux + rapports après

## Interdictions respectées

Pas de modification de prix/stocks/EAN/SumUp réels, pas de produits fictifs, pas de migration prod, pas de push/déploiement.
