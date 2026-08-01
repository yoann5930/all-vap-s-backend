# RAPPORT SumUp

**Dernière mise à jour :** 2026-08-01  
**État :** ⚠️ Liens catalogue ↔ SumUp OK sur visibles ; sync live / health à surveiller

## Validations

| Script | Résultat |
|--------|----------|
| `catalog:validate:sumup` | ✅ 0 doublon, 0 visible e-liquide sans SumUp |
| `sumup:lock-test` | ✅ 16/16 |
| Audit stock sample | ✅ 25/25 visibles+SumUp ont StockLevel |
| StockLevels GLOBAL_ALL_VAPS | **2188** |

## Bidirectionnalité

- **Site → IDs SumUp :** présents sur produits visibles validés  
- **StockLevel miroir :** échantillon OK  
- **Sync ventes worker :** démarrage OK (0 ventes / doublons ignorés en log) — pas d’audit bout-en-bout paiement ici  

## Restant

- `/api/health` timeout (peut inclure services SumUp/audit)  
- Paiement checkout réel non testé dans l’audit client
