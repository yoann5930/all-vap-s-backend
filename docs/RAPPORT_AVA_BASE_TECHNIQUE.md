# RAPPORT AVA — Base technique

**Dernière mise à jour :** 2026-08-01  
**Mission :** 4/7 — import matériels SumUp  
**État :** ⚠️ Import livré — stock magasin quasi sans appareils classiques

## Constat SumUp / Prisma

| Catégorie active | Count |
|------------------|------:|
| e-liquides (+ formats) | ~364 |
| pods (jetables nicotinés Kuix) | 29 |
| materiel | **2** (Kuix batterie black/blue) |

Aucun produit Vaporesso / Voopoo / Oxva détecté dans la base active actuelle.

## Modèles AVA

| Modèle | Source | Statut |
|--------|--------|--------|
| Vaporesso XROS 3 | seed | NEEDS_CONFIRMATION — **pas** dans SumUp actuel |
| Voopoo Argus G2 | seed | NEEDS_CONFIRMATION — **pas** dans SumUp actuel |
| Liquide Lab Kuix Batterie | SumUp | NEEDS_OFFICIAL_DATA (2 sumupProductIds couleurs) |

## Scripts

- `npm run ava:devices:import` — idempotent
- `npm run ava:devices:audit`
- Rapport : `data/ava/device-import-report.json`
- Audit : `data/ava/device-completeness-audit.json`

## Admin

`DeviceKnowledgeAdmin` affiche totaux : trouvés / vérifiés / sans notice / sans photo / sans coils.

## Règle

Aucune fiche `OFFICIAL_CONFIRMED` sans notice fabricant.  
Ne pas classer les pods jetables Kuix (10/20 mg) comme matériel rechargeable.

## Bloquant mission 4 « exhaustif »

Recensement exhaustif **impossible** tant que SumUp All Vap’s ne contient pas les cigarettes électroniques / pods rechargeables réellement vendus. À enrichir quand le stock matériel est synchronisé.

Tableau de bord : [`RAPPORT_GLOBAL.md`](./RAPPORT_GLOBAL.md)
