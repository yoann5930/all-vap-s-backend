# AUDIT INITIAL — Complétion e-liquides bloqués

**Date :** 2026-08-03  
**Mission :** Finalisation complète fabricant par fabricant

## 1. Chiffres réels (recomptés)

| Indicateur | Attendu (rapport départ) | Réel (audit) | Écart |
|---|---:|---:|---:|
| E-liquides actifs | 378 | **378** | 0 |
| Publiés en ligne | 208 | **208** | 0 |
| Non publiables | 170 | **170** | 0 |
| Sans ID SumUp | 98 | **98** | 0 |
| SumUp OK sans visuel officiel | 72 | **72** | 0 |

**Conclusion :** les chiffres correspondent exactement au rapport de départ. Aucun écart.

## 2. Sources lues

- `data/rebuild/QUEUE_PHOTOS_ELIQUIDES.json`
- `data/rebuild/RAPPORT_COMPLETE_PHOTOS_ELIQUIDES.json`
- Inventaire live : `scripts/_inventory-photo-queue.ts`

## 3. Fabricants concernés (72 photo-bloqués SumUp OK)

Ordre de traitement imposé :

| # | Fabricant | Nb attendus (photo SumUp) |
|---|---|---:|
| 1 | e-Tasty | ~7 |
| 2 | AirMust | ~21 |
| 3 | Liquide Lab | ~15 |
| 4 | MDS Juice | ~13 |
| 5 | Cookin Cloud | ~6 |
| 6 | Alfa | ~4 |
| 7 | Juice 66 | ~2 |
| 8 | Raneki Liquide | ~2 |
| 9 | Cloud Vapor | ~1 |
| 10 | Liquidarom | ~1 |

*(Les totaux exacts par fabricant sont confirmés à chaque étape.)*

## 4. Fichiers qui seront modifiés

- `public/media/products/{fabricant}/...` (packshots officiels téléchargés)
- Table Prisma `Product` : `imageUrl`, `imageStatus`, `images`, `visibleOnline`, `catalogStatus`, `importAnomaly` (uniquement si gate OK)
- `data/rebuild/QUEUE_PHOTOS_ELIQUIDES.json`
- `data/rebuild/RAPPORT_COMPLETE_PHOTOS_ELIQUIDES.json`
- `catalogues/rapports/RAPPORT_*_COMPLETION.md` (un par fabricant)
- `catalogues/rapports/RAPPORT_FINAL_COMPLETION_ELIQUIDES.md`

## 5. Risques identifiés

| Risque | Mitigation |
|---|---|
| Mélange Numbers N / formats 30↔100 ml | Match strict numéro + format |
| Image d’un autre produit | Interdit : score slug/saveur + 1 fichier → 1 produit |
| Invention SumUp | Jamais : produits sans SumUp restent hors ligne |
| Site fabricant inaccessible (Juice 66, AirMust) | Conserver en file + raison documentée |
| Remplacement d’une image déjà official correcte | Ne jamais écraser `imageStatus=official` valide |
| Publication hors gate | Toujours `evaluateEliquidePublishGate` avant `visibleOnline=true` |

## 6. Règles absolues rappelées

- Pas d’invention `sumupProductId`
- Pas d’image d’un autre produit / gamme / fabricant
- Pas de publication si gate KO
- Un fabricant à la fois, rapport intermédiaire obligatoire

## 7. Suite

→ **Étape 1 — e-Tasty**
