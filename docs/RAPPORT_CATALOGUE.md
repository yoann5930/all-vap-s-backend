# RAPPORT Catalogue

**Dernière mise à jour :** 2026-08-01  
**Mission :** 3/7 — validation référence  
**État :** ✅ `catalog:validate:all` PASS · audit-strict **FAIL=0** (BLOCKED justifiés autorisés)

## Validations

| Commande | Résultat |
|----------|----------|
| `catalog:audit:strict` | **PASS=6 · BLOCKED=66 · FAIL=0** · missionComplete true |
| `catalog:validate:sumup` | **ok** |
| `catalog:validate:media` | **ok** |
| `catalog:validate:routes` | **ok** |
| `catalog:validate:all` | **PASS** |
| `catalog:dedup` | 0 groupes doublons online |

## Hiérarchie Call of Vape / Blackout

```text
Cloud Vapor
└── Call of Vape
    └── Collection Blackout
```

Aucune `ProductRange` « Blackout » active. Collection `blackout` sous Call of Vape — **PASS** matrice.

## Correctifs session

1. Audit logo : utilisation de `manufacturerLogoUrlIfExists` (plus de faux `FILE_MISSING` sur `logo-on-dark.webp`).
2. Statuts **BLOCKED_*** pour gammes hors site / logos manquants hors publication / base absente (justifiés, pas FAIL).
3. Produits actifs sans SumUp sur gammes publiées (Twenty, Letters, Furiosa EGGZ, Dragonz) → **désactivés** (pas d’ID inventé) via `scripts/fix-published-sumup-links.ts`.

## BLOCKED restants (exemples justifiés)

- Logos fabricants absents (Guilab, MG Vape, …) hors publication site.
- Gammes référence Yoann sans stock visible magasin.
- Bases absentes (Golf City, Hopper, Big Kawa) → `BLOCKED_MISSING_DATABASE` — à importer si SumUp le confirme (pas d’invention).

## Preuves

- `data/catalog/yoann/catalogue-validation-matrix.json`
- `docs/RAPPORT_VALIDATION_AUTOMATIQUE_CATALOGUE.md`

Tableau de bord : [`RAPPORT_GLOBAL.md`](./RAPPORT_GLOBAL.md)

> Ne pas écrire « catalogue terminé » au sens métier exhaustif : 66 lignes BLOCKED restent à traiter avec Yoann / SumUp. Conditions techniques `validate:all` remplies.
