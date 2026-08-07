# Rapport — Bannières fabricants e-liquides (SumUp)

**Date :** 2026-08-07  
**Source :** `inbox_sumup/2026-08-03_16-46-54_items-export_MCGR4RXU.csv`  
**Pipeline :** `Produits SumUp → détection fabricant → normalisation → bannière → catalogue`

## Commandes réutilisables

```bash
npx tsx scripts/sync-sumup-eliquide-manufacturer-banners.ts
npx tsx scripts/sync-sumup-eliquide-manufacturer-banners.ts --apply-db
npx tsx scripts/link-sumup-eliquide-products-to-manufacturers.ts
```

Un nouveau fabricant SumUp sans bannière apparaît dans `missingBannersAfter` / le rapport JSON.

## Dimensions bannière

**1600 × 1000** (`banner.webp`) — ratio 16:10, fond `#101720`, bandeau accent `#2DD4BF`.

- Logo officiel présent → logo centré `object-fit: inside` (jamais étiré)
- Logo absent → bannière typographique + fichier `ASSET_MANQUANT.json` (pas de faux logo)

## Fichiers clés

- `lib/catalog/sumup-eliquide-manufacturers.ts`
- `scripts/sync-sumup-eliquide-manufacturer-banners.ts`
- `scripts/link-sumup-eliquide-products-to-manufacturers.ts`
- `data/catalog/eliquide-manufacturer-banners.json`
- `public/media/manufacturers/{slug}/banner.webp`
- Hub : `/e-liquides` → `/fabricants/[slug]`
