# RAPPORT FINAL — Apply exact EAN SumUp

**Date :** 2026-08-03  
**Commande :** `npx tsx scripts/audit-sumup-catalogue.ts --apply-exact-only`  
**Sauvegarde pré-apply :** `backups/sumup-audit-2026-08-03/pre-apply-exact/PRODUCTS_SNAPSHOT.json`  
**Journal :** `backups/sumup-audit-2026-08-03/JOURNAL_APPLY_EXACT.json`

## Garde-fous appliqués

1. Uniquement `MATCH_EXACT_EAN`
2. Aucun prix modifié
3. Aucun stock modifié
4. Aucune suppression
5. Aucun `sumupProductId` existant écrasé
6. Aucune correspondance nom-seul
7. Aucune ligne `REVIEW_REQUIRED` / `CONFLICT` / `DUPLICATE` / `NO_MATCH` / `MATCH_STRICT_NAME`

## Avant / après

| Indicateur | Avant | Après | Δ |
|---|---:|---:|---:|
| Produits catalogue | 2670 | 2670 | 0 |
| Avec `sumupProductId` | 1918 | **2057** | **+139** |
| Avec barcode | 1989 | 1989 | 0 |
| Somme prix (cents) | 4561518 | 4561518 | 0 |
| Somme stocks | 8879 | 8879 | 0 |
| Match ID exact (audit) | 1918 | **2057** | +139 |
| Match EAN restants | 139 | **0** | −139 |
| Catalogue sans SumUp | 752 | **613** | −139 |
| SumUp sans catalogue | 23 | 23 | 0 |
| Conflits | 0 | 0 | 0 |
| Doublons `sumupProductId` | 0 | 0 | 0 |

## Résultats d’application

| Indicateur | Valeur |
|---|---:|
| Liaisons EAN prévues | **139** |
| Liaisons EAN réellement appliquées | **139** |
| Liaisons refusées | **0** |
| Conflits détectés | **0** |
| Doublons détectés | **0** |
| Prix modifiés | **0** |
| Stocks modifiés | **0** |
| Produits supprimés | **0** |
| EAN (zéros initiaux) altérés | **0** |
| `sumupProductId` écrasés | **0** |

## Vérifications techniques

| Contrôle | Résultat |
|---|---|
| Re-audit lecture seule | OK (`exactEanMatches=0`, `exactIdMatches=2057`) |
| TypeScript | **OK** |
| ESLint | **OK** |
| Build (`next build`) | **OK** |

## Restant hors application (volontaire)

- 23 produits SumUp sans catalogue (`NO_MATCH`)
- 14 correspondances nom strict (non appliquées)
- 613 produits catalogue encore sans SumUp
- 191 images manquantes / 91 profils AVA manquants (hors périmètre de cette commande)

---

⚠️ ÉTAT FINAL : OK AVEC AVERTISSEMENTS
