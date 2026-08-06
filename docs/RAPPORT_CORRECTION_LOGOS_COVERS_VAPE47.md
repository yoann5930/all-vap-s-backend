# Rapport — correction logos / covers / matrice Yoann

Généré : 2026-07-31

## Corrections effectuées (prioritaires)

### 1. Logo Vape 47 — CORRIGÉ

| Avant | Après |
| --- | --- |
| Placeholder PrestaShop « my store » (`order.vape47.com/img/logo.jpg`) | Logo officiel `https://www.vape47.com/icon.svg` |

Fichiers :

- `public/media/manufacturers/vape-47/logo.webp` (officiel)
- `public/media/manufacturers/vape-47/logo.svg`
- `public/media/manufacturers/vape-47/logo-on-dark.webp`
- `public/media/manufacturers/vape-47/logo-on-light.webp`
- Backup de l’ancien : `logo.WRONG-prestashop-mystore.webp.bak`

Scripts mis à jour pour **ne plus jamais** reprendre le logo PrestaShop :

- `scripts/fetch-manufacturer-logos.ts`
- `scripts/complete-logos-and-range-covers.ts`
- `scripts/fix-vape47-official-assets.ts`

### 2. Gammes ENFER — CORRIGÉES (rattachement + covers)

| Gamme | Slug | Produits | Visibles en ligne |
| --- | ---: | ---: | ---: |
| ENFER | `enfer` | 9 | 7 (photos strictes OK) |
| Les Fruits d'ENFER | `les-fruits-d-enfer` | 5 | 0 (packshots stricts introuvables via search — **à compléter**) |
| Furiosa Eggz | `furiosa-eggz` | 10 | 5 |

- Couverture ENFER : mosaïque packshots officiels B2B (plus de logo sombre illisible).
- Cover Fruits / Furiosa Eggz : assets `vape47.com` + typo contrastée si besoin.
- Produits mal classés sous « Les Fruits » → reclassés ENFER (9 déplacements).

### 3. Affichage logos (cases catalogue)

Nouveau composant robuste :

- `lib/catalog/logo-display.ts` — ratio / scale / padding / fond
- `components/catalog/ManufacturerLogoMark.tsx`
- `ManufacturerCatalogCard` utilise `object-fit: contain` + scale par fabricant
- `RangeCatalogCard` : `object-contain` (plus de crop agressif `object-cover`)

Export logos : hauteur max **480px** (au lieu de 120px — cause des logos trop petits).

### 4. Matrice complète Yoann (72 gammes)

```bash
npm run catalog:yoann-matrix
```

Sorties :

- `data/catalog/yoann/MATRICE_COMPLETE_2026-07-31.json`
- `docs/RAPPORT_MATRICE_FABRICANTS_GAMMES.md`

## LOGO_A_CONFIRMER / absents (demande Yoann)

Sans logo officiel confirmé, le fabricant **n’apparaît pas** en case `/e-liquides`.

À fournir (fichier officiel ou URL kit média) :

Guilab, Swoke, Juice 66, Aromes & Secrets, Made In Vape Distrib, Cloud Vapor, MG Vape, KF Studio, Budz Vape, AVAP, Fruity Cool, Mukk Mukk, OverDrive Juices, Revenge Juices, Alfa, Le Maudit, Fruizee, Yum E-Bot, Vape City.

**AirMust** : logo présent mais trop léger / peu lisible → `LOGO_A_CONFIRMER`.

## Produits Vape 47 encore hors ligne

Bloqués tant que packshot officiel **strictement** associé (saveur dans l’URL) :

- ENFER Blue, Dragon 50ML
- Les Fruits d'ENFER (cerise, framboise, pêche, cassis, dragon)
- Furiosa Eggz : Juno, Griffon, Nova, Volta, Ruby

Commandes utiles :

```bash
npm run catalog:vape47:fix-assets
npx tsx scripts/fix-vape47-ranges-and-visibility.ts
npx tsx scripts/reattach-vape47-photos-strict.ts
npm run catalog:yoann-matrix
```

## Règle permanente

1. Site officiel fabricant → kit média → catalogue pro → distributeur officiel.
2. Jamais logo PrestaShop / revendeur au hasard / logo d’une autre marque.
3. Si non confirmé → `LOGO_A_CONFIRMER`, pas de faux logo publié.
