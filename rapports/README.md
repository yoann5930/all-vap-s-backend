# Rapports de synchronisation SumUp

Ce dossier reçoit les rapports générés après chaque sync SumUp réussie (ou partielle) :

| Fichier | Rôle |
|---------|------|
| `sumup-sync-latest.json` | Dernier rapport (écrasé) |
| `sumup-sync-latest.md` | Résumé lisible du dernier rapport |
| `sumup-sync-<timestamp>.json` | Historique horodaté |
| `sumup-sync-<timestamp>.md` | Historique Markdown |

Les fichiers horodatés sont ignorés par Git ; seuls ce README et éventuellement `sumup-sync-latest.*` peuvent être versionnés selon la politique d'équipe.
