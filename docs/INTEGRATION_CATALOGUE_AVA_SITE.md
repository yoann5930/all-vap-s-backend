# Intégration catalogue / A.V.A. / site — All Vap's

**Date :** 2026-08-04

## Lot source

- Dossier : `CURSOR_ALLVAPS_MISSION_COMPLETE/`
- ZIP : `CURSOR_ALLVAPS_MISSION_COMPLETE/sources/catalogue-allvaps.zip` (+ copie racine `catalogue-allvaps.zip`)
- Contenu aligné avec le dépôt (CSV, WebP, modules catalogue) — fusion sélective, pas de remplacement aveugle

## Catalogue

### Import Liquidarom (`lib/catalog/liquidarom-import.ts`)

- Respecte **Actif en boutique** → `isActive`
- Respecte **Actif en ligne** → `visibleOnline`
- Si colonne absente : conserve la valeur DB existante
- Nouveaux produits sans info : `false` / `false` (pas de publication forcée)
- Prix absents CSV : ne invente pas (0 ou prix existant > 0)
- Stock SumUp / `StockLevel` : non écrasé
- Marques / catégories existantes : `isActive` non forcé à `true`

### Visibilité publique

Surfaces mises à jour pour exiger `isActive: true` **et** `visibleOnline: true` :

- `lib/products/queries.ts` → `/api/products`
- `/api/search`, `/promotions`, `sitemap`
- `/boutique/[slug]` (+ metadata + similaires)
- `/api/products/[id]` (+ similaires)
- `/api/orders`, `/api/account/recommendations`
- `lib/ai/ava-advisor.ts`, `lib/ai/local-advisor.ts`

Conséquence attendue après import CSV réel : les 40 Liquidarom (`Actif en ligne = Non`) **n’apparaissent pas** en ligne tant que Yoann ne bascule pas `visibleOnline`.

### Médias

| Élément | Statut |
|---|---|
| 9 WebP Liquidarom + `IMAGE_MANIFEST.json` | Présents dans `public/products/liquidarom/` |
| `image-1785228599019.jpg` (+ 3 autres) | **Absents** — non publiés |
| Association image ↔ produit | Non faite sur nom approximatif |

## A.V.A.

- Catalogue chargé avec filtres public + exclusion Puff/JNR/jetables
- Demande « puff » → refus orienté pods / e-liquides
- Portrait procédural = fallback public ; GLB = **PROTOYPE TECHNIQUE** (badge immersif)
- Vision / Knowledge Phase 3-4 : **non présents** dans le dépôt
- Mémoire GDPR / userId : déjà en place (non régressée)

## Blocages restants (données à fournir)

1. Les 4 fichiers photo produit JPG exacts
2. Prix TTC des 40 Liquidarom (ne pas inventer)
3. EAN / SKU métier
4. Confirmation Yoann pour basculer `visibleOnline` produit par produit
5. `DATABASE_URL` locale pour dry-run / validate / tests DB
6. Modules / scripts `test:security`, `test:ava*`, Vision, Phase 4 si exigés

## Déploiement

**Interdit** tant que : tests DB + navigateurs + sandboxes paiements + autorisation explicite Yoann.
