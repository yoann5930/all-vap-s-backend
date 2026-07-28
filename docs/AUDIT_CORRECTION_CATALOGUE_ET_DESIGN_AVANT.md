# Audit avant correction catalogue + design

**Date :** 2026-07-28  
**Branche :** `refonte-premium-allvaps`  
**Pack :** `ALLVAPS_CURSOR_CORRECTION_COMPLETE_V2` (Downloads)  
**Projet :** `D:\all vaps\all-vap-s-backend`

## Architecture catalogue trouvée

| Élément | Emplacement |
|---|---|
| Schéma Prisma | `prisma/schema.prisma` — `Product`, `ProductVariant`, `ProductFlavor`, `Brand`, `Category`, `StockLevel` |
| API publique | `app/api/products/route.ts` + `lib/products/queries.ts` (`isActive`, search, brand, category) |
| Catalogue UI | `app/boutique/page.tsx` → `ProductCatalog` |
| Fiche produit | `app/boutique/[slug]/page.tsx` |
| Import SumUp existant | `lib/catalog/sumup-import-service.ts` (stock officiel `GLOBAL_ALL_VAPS`) |
| Normalisation | `lib/catalog/normalize.ts` |

**Filtre public actuel :** `isActive: true` uniquement (pas de filtre `visibleOnline` sur l’API list).  
**Stock SumUp :** ne pas écraser si `sumupProductId` / niveaux stock déjà liés.

## CSV Liquidarom

- Séparateur `;`, UTF-8 + BOM possible  
- Produits : `ID produit` (ex. `AV-0001`) = clé stable → `sku`  
- Prix souvent **vides** → `priceCents = 0` + masquer panier (ne pas inventer)  
- Stocks CSV = formules Excel → **ignorer** (stock 0 sauf SumUp existant)  
- `Actif en ligne` souvent Non ; `Actif en boutique` Oui → `isActive` depuis boutique pour apparition catalogue (API filtre `isActive`)  
- Profils saveurs : jointure via `ID produit` → `ProductFlavor`

## Design déjà en place (refonte partielle)

Tokens V2 `#05070A` / `#00AEEF`, header 3 niveaux, hero saveurs, catalogue dark + tiroir filtres.  
Écarts restants vs maquette : panneau conseils droite catalogue, bannière fumée, polish cartes, footer.

## Plan d’exécution

1. Script `scripts/import-liquidarom-products.ts` idempotent  
2. npm `catalog:liquidarom:dry-run` / `catalog:liquidarom:import`  
3. Masquer panier si `priceCents <= 0`  
4. Affiner UI  
5. Preuves + rapport  
