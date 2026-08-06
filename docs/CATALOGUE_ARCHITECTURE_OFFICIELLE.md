# Architecture catalogue — Fabricant → Gammes → Produits

## Parcours

```
LOGO FABRICANT  →  CASES GAMMES VALIDÉES  →  PRODUITS OFFICIELS
 /e-liquides         /fabricants/[slug]         /gammes/[slug]
```

## Niveau 1 — Fabricants

- Une case = un logo officiel seul
- Nom uniquement en `alt` / `aria-label` / admin / routes
- Composant : `ManufacturerCatalogCard`

## Niveau 2 — Gammes

- Uniquement gammes `verificationStatus = OFFICIAL_CONFIRMED` (+ `catalogVisible`)
- Affiche nom officiel (+ visuel éventuel)
- **Aucun** compteur produit / volume / détail
- Lien `← Retour aux fabricants`
- Composant : `RangeCatalogCard`

## Niveau 3 — Produits

- Produits publiés de **cette** gamme uniquement
- Jamais de mélange entre fabricants

## Listes Yoann

Fichier JSON exemple : `data/catalog/proposals/exemple-liquide-lab.json`

```bash
# Vérifier sans intégrer
npm run catalog:verify-ranges -- data/catalog/proposals/exemple-liquide-lab.json

# Intégrer UNIQUEMENT les CONFIRMÉES
npm run catalog:verify-ranges -- data/catalog/proposals/….json --integrate-confirmed

# Backfill gammes déjà en prod
npm run catalog:backfill-official
```

Table `CatalogRangeProposal` : propositions + statuts de vérification indépendants.

## Métadonnées

```ts
{
  officialSourceUrl: string | null;
  officialManufacturerUrl: string | null;
  verifiedAt: string | null;
  verificationStatus:
    | "OFFICIAL_CONFIRMED"
    | "OFFICIAL_NOT_FOUND"
    | "NEEDS_CONFIRMATION"
    | "INACTIVE"
    | "WRONG_MANUFACTURER"
    | "PRODUCT_NOT_RANGE"
    | "NAME_CORRECTION";
}
```

Helpers : `lib/catalog/official-verification.ts`, `lib/catalog/verify-range-official.ts`
