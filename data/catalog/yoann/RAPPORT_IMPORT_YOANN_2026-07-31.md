# Rapport import catalogue Yoann — 2026-07-31

Mode : **dry-run**  
Source : `data/catalog/yoann/allvaps_catalogue.json`  
Généré : 2026-07-31T13:44:27.040Z

## Validation

- OK : true
- Erreurs : aucune
- Avertissements : 1

- Produit hors gamme chez Liquideo: Pastis 13 — à classer après vérification officielle

## Synthèse

| Élément | Match existant | À créer / proposer |
|--------|----------------|--------------------|
| Fabricants | 8 | 23 |
| Gammes | 8 | 64 (propositions) |
| Produits listés | 64 matchés | 18 non créés (attente preuve) |

- Gammes avec `products` vide : **56**
- Gammes avec produits listés : **16**
- Stock SumUp touché : **non** (`stockSumUpTouched: false`)

## Règles respectées

1. Pas d’écrasement stock SumUp
2. Pas d’invention / publication auto
3. Liste Yoann = base de recherche → `CatalogRangeProposal` / `NEEDS_CONFIRMATION`
4. Gammes `products: []` non présentées comme exhaustives
5. `pending_verification` conservé

## pending_verification (JSON)

- Compléter les catalogues officiels des gammes laissées avec products vide.
- Vérifier le rattachement exact de Cumulus et Mexican Cartel selon les produits concernés.
- Vérifier les appellations exactes Crazy Juice / Crazy Barnacle / Mukkies.
- Vérifier la liste exhaustive ENFER, Les Fruits d'ENFER et Furiosa EGGZ V2 sur le site officiel Vape 47.
- Ajouter les logos officiels fabricants après téléchargement et validation des droits d'utilisation.
- Comparer ensuite avec l'export SumUp avant import définitif.

## Prochaines étapes

1. Relire ce rapport
2. Si OK : `npx tsx scripts/import-yoann-catalogue.ts --apply` (fabricants + propositions seulement)
3. Vérifier chaque gamme proposée sur site officiel : `npm run catalog:verify-ranges -- …`
4. Logos fabricants
5. Comparaison CSV SumUp avant publication produits

## Détail JSON

Voir `IMPORT_DRYRUN_2026-07-31.json`
