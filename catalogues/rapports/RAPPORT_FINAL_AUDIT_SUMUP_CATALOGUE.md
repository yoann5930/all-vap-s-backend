# RAPPORT FINAL — Audit SumUp CSV ↔ Catalogue All Vap’s

**Date :** 2026-08-03  
**CSV :** `inbox_sumup/2026-08-03_16-46-54_items-export_MCGR4RXU.csv` (copie depuis Downloads)  
**ZIP `catalogue-allvaps.zip` :** **non trouvé** (Downloads / Desktop / projet) — travail sur le dépôt courant  
**Sauvegarde :** `backups/sumup-audit-2026-08-03/`  
**Mode exécuté :** **DRY-RUN** (0 écriture DB)  
**Commande :** `npm run sumup:catalog-audit`

## Localisation

| Élément | Statut |
|---|---|
| CSV SumUp 2026-08-03 | OK — `inbox_sumup/` + backup |
| ZIP catalogue-allvaps | Absent — non extrait |
| Source site | Prisma `Product` |
| Catalogue magasin | `catalogues/catalogue-magasin-all-vaps.csv` |
| Catalogue AVA | `catalogues/catalogue-ava-all-vaps.csv` |

## Chiffres obligatoires

| Indicateur | Valeur |
|---|---:|
| Lignes SumUp | **2094** |
| Produits SumUp uniques (Item id) | **2071** |
| Produits catalogue (Prisma) | **2670** |
| Correspondances exactes ID | **1918** |
| Correspondances EAN | **139** |
| Correspondances nom strict | **14** (non appliquées auto) |
| Correspondances à vérifier | **14** (file validation + strict name) |
| Produits SumUp sans catalogue | **23** |
| Produits catalogue sans SumUp | **752** |
| Conflits | **0** |
| Doublons | **0** |
| Images manquantes (actifs) | **191** |
| Profils A.V.A. manquants | **91** |
| Différences de prix (sur matchs) | **0** |
| Prix modifiés | **0** |
| Stocks modifiés | **0** |
| Produits supprimés | **0** |
| Modifications exactes prévues (EAN/ref) | **139** |
| Modifications appliquées | **0** (attente validation `--apply-exact-only`) |

## Encodage CSV

- UTF-8  
- Séparateur `,`  
- Colonnes clés : `Item name`, `Item id (Do not change)`, `Variant id`, `Barcode`, `SKU`, `Price`, `Category`, `Quantity`

## Rapports générés

- `catalogues/rapports/AUDIT_CSV_SUMUP_2026-08-03.md`
- `catalogues/rapports/RAPPROCHEMENT_SUMUP_CATALOGUE.md`
- `catalogues/rapports/PRODUITS_SUMUP_SANS_CATALOGUE.md`
- `catalogues/rapports/PRODUITS_CATALOGUE_SANS_SUMUP.md`
- `catalogues/rapports/IMAGES_PRODUITS_A_CONTROLER.md`
- `catalogues/rapports/PROFILS_AVA_MANQUANTS.md`
- `catalogues/rapports/DIFFERENCES_PRIX_SUMUP_CATALOGUE.md`
- `data/rebuild/RAPPORT_RAPPROCHEMENT_SUMUP_CATALOGUE.json`
- `data/rebuild/QUEUE_VALIDATION_SUMUP.json`
- `data/rebuild/QUEUE_PROFILS_AVA_MANQUANTS.json`

## Script

- `scripts/audit-sumup-catalogue.ts`
- `npm run sumup:catalog-audit`
- `npm run sumup:catalog-audit:apply-exact` → **non exécuté** (validation humaine requise pour les 139 EAN)

## Vérifications techniques

| Contrôle | Résultat |
|---|---|
| TypeScript | OK |
| ESLint | OK |
| Build (`next build`) | **OK** |
| Serveur local | non démarré au moment du contrôle (build OK) |
| Prix / stocks / suppressions | inchangés |
| Liquidarom / catalogues CSV | non écrasés |

## Prochaine étape recommandée

Après validation manuelle des 139 `MATCH_EXACT_EAN` (produits catalogue sans `sumupProductId` mais EAN SumUp identique) :

```bash
npx tsx scripts/audit-sumup-catalogue.ts --apply-exact-only
```

Ce mode ne touche **jamais** : prix, stock, images douteuses, MATCH_STRICT_NAME, NO_MATCH, CONFLICT.

---

⚠️ ÉTAT FINAL : OK AVEC AVERTISSEMENTS
