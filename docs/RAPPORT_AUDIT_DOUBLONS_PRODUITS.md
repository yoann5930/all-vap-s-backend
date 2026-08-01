# Rapport audit doublons produits

Généré : 2026-08-01T00:35:20.897Z  
Mode : **dry-run**

## Règle

**INTERDICTION DE DOUBLON.**  
Unicité : `sumupProductId` · `slug` · `barcode` · `rangeId + nom normalisé + format ml`.

Si doublon → **conserver** la fiche SumUp / online · **quarantiner** le surplus (`visibleOnline=false`, `importAnomaly`).

## Synthèse

| Indicateur | Valeur |
| --- | ---: |
| Produits scannés | 2670 |
| Groupes doublons (tous) | 0 |
| Groupes doublons ONLINE (avant) | 0 |
| Groupes doublons ONLINE (après) | 0 |
| Produits mis en quarantaine | 0 |

## Détail

| Raison | Clé | Conservé | Quarantaine |
| --- | --- | --- | --- |



## Statut final

Aucun doublon **en ligne** restant.


## Commandes

```bash
npm run catalog:dedup          # dry-run
npm run catalog:dedup:apply    # quarantaine
```
