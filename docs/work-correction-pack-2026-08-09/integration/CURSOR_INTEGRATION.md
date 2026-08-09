# Cursor Integration Guide

## Localiser avant de modifier

Rechercher dans le dépôt : routeur A.V.A. Client, détection +18, store conversationnel, résolution matériel, requêtes catalogue, fiche produit/conseils, recommandations, recherche publique, API stocks/inventaires/utilisateurs, A.V.A. Admin, TTS/audio analyser, renderer 3D et modèle GLB/GLTF/VRM.

## Règle de remplacement

Ne pas copier ces modules à l’aveugle. Reporter leurs invariants dans les composants existants, conserver les interfaces publiques du dépôt, puis exécuter les tests réels.

## Avatar

Afficher la liste exacte des morph targets et bones dans un rapport Cursor. Si bouche/paupières manquent : conserver le fallback neutre et signaler `CURSOR_INTEGRATION_REQUIRED`. Ne pas déclarer la correction terminée.

## Données

Les migrations SKU/EAN/taxonomie doivent produire un rapport dry-run déterministe avant toute écriture. Les prix à zéro sont bloqués à l’achat, jamais remplacés automatiquement.

