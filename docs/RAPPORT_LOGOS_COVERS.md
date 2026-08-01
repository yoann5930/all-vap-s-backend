# RAPPORT Logos & Covers

**Dernière mise à jour :** 2026-08-01  
**Mission :** 2/7 — 8 covers manquantes  
**État :** ✅ `catalog:validate:media` + `catalog:validate:routes` verts

## Validations

| Commande | Résultat |
|----------|----------|
| `catalog:validate:media` | **ok** · 0 issue |
| `catalog:validate:routes` | **ok** · 0 issue |
| `catalog:logos-covers` | publishedMissingCover **0** · coversOkPublished **40** |
| `catalog:range-covers` | ok |

## Les 8 covers corrigées

| Fabricant | Gamme | Slug | Chemin | Source | Mode |
|-----------|-------|------|--------|--------|------|
| Swoke | Saint Flava | `saint-flava-swoke` | `public/media/manufacturers/swoke/ranges/saint-flava-swoke.webp` | https://swoke.net/img/logo.jpg | fallback logo officiel |
| Swoke | Bisou | `bisou-swoke` | `…/swoke/ranges/bisou-swoke.webp` | swoke.net logo | fallback logo officiel |
| Swoke | Force Vape | `force-vape-swoke` | `…/swoke/ranges/force-vape-swoke.webp` | swoke.net logo | fallback logo officiel |
| AirMust | UNIK | `unik-airmust` | `…/airmust/ranges/unik-airmust.webp` | logo AirMust local | fallback logo officiel |
| Juice 66 | 66 Juice | `66-juice-juice-66` | `…/juice-66/ranges/66-juice-juice-66.webp` | packshots Vapair.pro | mosaïque distributeur/fabricant officiel |
| Arômes Secrets | Mythologie | `mythologie-aromes-secrets` | `…/aromes-secrets/ranges/mythologie-aromes-secrets.webp` | savourea-shop.com logo | fallback logo fabricant Savourea |
| Cloud Vapor | Grand Taste City | `grand-taste-city-cloud-vapor` | `…/cloud-vapor/ranges/grand-taste-city-cloud-vapor.webp` | CDN cloudvapor.com homepage | cover officielle |
| AVAP | Devil | `devil-avap` | `…/avap/ranges/devil-avap.webp` | liquide-avap.com bannière « Créateur du red devil » | cover officielle |

## Affichage

`coverDisplay` n’existe pas en base Prisma (`ProductRange`). Les cartes utilisent `rangeCoverUrl` + fond sombre ; mode effectif **contain/cover** côté UI existante (`RangeCatalogCard`). Focal/scale non stockés — défauts CSS inchangés.

## Notes

- `www.juice66.fr` / `www.swoke.fr` / anciens domaines : DNS morts → sources actuelles (`swoke.net`, `vapair.pro`, `cloudvapor.com`, `liquide-avap.com`, `savourea-shop.com`).
- Fallbacks logo : justifiés uniquement quand aucune bannière de gamme officielle n’était récupérable.
- Scripts utilitaires mission : `scripts/fix-eight-missing-covers.ts`, `fix-four-blocked-covers.ts`, `fix-avap-juice66-covers.ts`, `fix-juice66-cover-vapair.ts`.

## Erreurs restantes

Aucune cover publiée manquante pour media/routes.

Tableau de bord : [`RAPPORT_GLOBAL.md`](./RAPPORT_GLOBAL.md)
