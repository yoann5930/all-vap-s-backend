# ALLVAPS Work Correction Pack — README FIRST

Ce paquet est un **patch évolutif à intégrer sélectivement avec Cursor** dans le dépôt officiel All Vap’s. Ce n’est pas un projet de remplacement.

## Statut honnête

- Dépôt source All Vap’s absent de Work.
- Aucun fichier de production modifié.
- Aucun test du dépôt réel exécuté.
- Modules fournis : contrats et implémentations de référence à raccorder aux chemins réels.
- Tous les fichiers sous `patch/` portent implicitement le statut `CURSOR_INTEGRATION_REQUIRED` tant que Cursor ne les a pas adaptés et testés dans le dépôt.
- Avatar : aucun modèle GLB/GLTF/VRM, rig, morph target ou code de rendu n’était disponible. Aucune correction visuelle n’est déclarée appliquée.

## Ordre d’intégration recommandé

1. Créer une branche et une sauvegarde vérifiée du dépôt officiel.
2. Localiser les implémentations actuelles à l’aide de `docs/integration/CURSOR_INTEGRATION.md`.
3. Intégrer d’abord `patch/ava-client/`, puis les tests âge/small talk/corrections.
4. Intégrer `patch/catalogue/` et la protection prix avant toute migration de données.
5. Raccorder `patch/search/` à la source catalogue réelle.
6. Corriger les contrats Dashboard/List dans `patch/admin/`.
7. Raccorder `patch/ava-admin/` uniquement à des outils métier réels.
8. Auditer le modèle 3D puis intégrer `patch/ava-avatar/` sans remplacer le modèle si des morph targets adaptés existent.
9. Exécuter les tests du dépôt et mettre à jour `TEST_REPORT.md` avec des preuves fraîches.
10. Ne déployer qu’après validation humaine séparée.

## Interdictions

Aucune synchronisation SumUp/Google, remise à zéro, migration réelle, écriture de prix, de stock ou d’inventaire n’est incluse. Les scripts sont documentaires/dry-run et doivent être raccordés à un export anonymisé ou à une base de recette.

## Dépendances à résoudre dans Cursor

- chemins et framework exacts du dépôt ;
- schémas ORM et types produit existants ;
- moteur TTS/audio et moteur 3D ;
- source réelle des stocks Hautmont/Le Quesnoy ;
- adaptateurs ventes/inventaires/commandes ;
- framework de tests et conventions CI.

