# RAPPORT AVA — Base technique

**Dernière mise à jour :** 2026-08-01  
**Mission :** 5/7 — notices (partielle)  
**État :** ⚠️ 1/3 OFFICIAL_CONFIRMED · Argus specs-only · Kuix bloqué

## Constat SumUp / Prisma

| Catégorie active | Count |
|------------------|------:|
| e-liquides (+ formats) | ~364 |
| pods (jetables nicotinés Kuix) | 29 |
| materiel | **2** (Kuix batterie black/blue) |

Aucun produit Vaporesso / Voopoo / Oxva dans la base active actuelle.

## Modèles AVA

| Modèle | Source | Statut |
|--------|--------|--------|
| Vaporesso XROS 3 | PDF notice officielle | **OFFICIAL_CONFIRMED** (pas dans SumUp) |
| Voopoo Argus G2 | page produit Voopoo | NEEDS_CONFIRMATION — PDF notice manquant |
| Liquide Lab Kuix Batterie | SumUp | NEEDS_OFFICIAL_DATA |

## Scripts

- `npm run ava:devices:import` — idempotent
- `npm run ava:devices:index` — régénère `index.json`
- `npm run ava:devices:audit`
- `npm run ava:manuals:audit`
- Rapport notices : [`RAPPORT_AVA_NOTICES.md`](./RAPPORT_AVA_NOTICES.md)

## Règle

`OFFICIAL_CONFIRMED` uniquement avec notice fabricant locale + URL.  
Pas de procédures boutons inventées (Argus = `null` jusqu’au PDF).

Tableau de bord : [`RAPPORT_GLOBAL.md`](./RAPPORT_GLOBAL.md)
