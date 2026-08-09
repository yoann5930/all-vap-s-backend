# Risk Report

| Risque | Niveau | Garde imposée |
|---|---|---|
| Migration taxonomie | CRITICAL | Dry run, mapping ancien→nouveau, validation humaine |
| Prix actifs nuls | CRITICAL | Bloquer l’achat, ne pas inventer un prix |
| Stock/inventaire | CRITICAL | Source réelle obligatoire, aucune écriture dans ce pack |
| Import SumUp | CRITICAL | Simulation seulement, non exécutée |
| Auth/permissions | HIGH | Tests OWNER/ADMIN/EMPLOYEE/CLIENT côté serveur |
| Mémoire Client/Admin | HIGH | Stores et permissions séparés |
| Avatar 3D | HIGH | Détecter morph targets ; fallback neutre ; jamais remplacer sans validation |
| Performance produits | MEDIUM | Pagination serveur ou virtualisation |

`DATA_SOURCE_REQUIRED` : stock par boutique, ventes, commandes et inventaires.  
`CURSOR_INTEGRATION_REQUIRED` : tous les modules, chemins et tests.  
`HUMAN_VALIDATION_REQUIRED` : migrations, publication, prix, stock, avatar.

