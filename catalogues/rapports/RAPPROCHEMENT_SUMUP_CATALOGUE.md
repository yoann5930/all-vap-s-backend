# Rapprochement SumUp ↔ Catalogue

**Mode :** DRY-RUN  
**Source catalogue :** Prisma `Product` (site) + CSV magasin/AVA pour contrôles

## Synthèse

| Statut | Nombre |
|---|---:|
| MATCH_EXACT_ID | 2057 |
| MATCH_EXACT_EAN | 0 |
| MATCH_EXACT_REFERENCE | 0 |
| MATCH_VALIDATED_MAPPING | 0 |
| MATCH_STRICT_NAME | 14 |
| MATCH_REVIEW_REQUIRED | 0 |
| NO_MATCH | 23 |
| DUPLICATE | 0 |
| CONFLICT | 0 |
| Modifications appliquées | 0 |
| Prix modifiés | 0 |
| Stocks modifiés | 0 |

## Ordre de rapprochement

1. sumupProductId exact  
2. EAN exact  
3. référence / SKU exact  
4. mapping SumUp validé  
5. nom normalisé strict  
6. revue manuelle  

Fichier JSON : `data/rebuild/RAPPORT_RAPPROCHEMENT_SUMUP_CATALOGUE.json`  
File validation : `data/rebuild/QUEUE_VALIDATION_SUMUP.json`
