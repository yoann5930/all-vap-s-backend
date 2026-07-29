# Catalogues officiels All Vap's

PostgreSQL est la **source de vérité** pour le stock et le catalogue.

Ces deux fichiers CSV sont des **exports automatiques** (après chaque sync SumUp réussie) :

| Fichier | Rôle |
|---------|------|
| `catalogue-magasin-all-vaps.csv` | Catalogue magasin complet — inclut `stock_general` |
| `catalogue-ava-all-vaps.csv` | Profils A.V.A. — statut Disponible / Stock faible / Rupture uniquement |

Ne pas créer d'autres catalogues permanents dans ce dossier.

Les rapports de synchronisation sont dans `rapports/`.
