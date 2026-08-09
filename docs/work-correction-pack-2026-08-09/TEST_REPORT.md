# Test Report

## Résumé

Le dépôt, ses dépendances, son moteur 3D et son framework de tests n’étaient pas disponibles. Des tests autonomes de contrats de référence ont été exécutés avec Node, mais ils ne prouvent pas l’intégration au dépôt réel.

| Suite | PASS | FAIL | NOT_RUN | Motif |
|---|---:|---:|---:|---|
| Contrats de référence A.V.A. Client/Admin | 11 | 0 | 0 | Exécutés hors dépôt |
| Contrôleur avatar de référence | 8 | 0 | 9 | Assertions unitaires hors renderer ; scénarios E2E non exécutés |
| A.V.A. Client âge/small talk/corrections — intégration | 0 | 0 | 8 | Intégration dépôt requise |
| A.V.A. Client mémoire/match/contradictions | 0 | 0 | 6 | Intégration dépôt requise |
| Catalogue/recommandations/prix | 0 | 0 | 6 | Schéma réel requis |
| Admin dashboard/list/async states | 0 | 0 | 6 | API et base de recette requises |
| A.V.A. Admin | 0 | 0 | 8 | Adapters métier requis |
| Avatar bouche/yeux | 0 | 0 | 9 | Modèle, moteur audio et renderer requis |

## Scénarios avatar obligatoires

- silencieuse 30 s — NOT_RUN ;
- parole 5 s — NOT_RUN ;
- parole 30 s — NOT_RUN ;
- réponses successives — NOT_RUN ;
- arrêt brutal TTS — NOT_RUN ;
- changement page/retour — NOT_RUN ;
- mobile — NOT_RUN ;
- desktop — NOT_RUN ;
- morph targets absents — NOT_RUN.
