# Contenu du dossier

- 00_LIRE_EN_PREMIER.md: cadre general et limites.
- modules/: connaissances respiratoires et comportement de vente.
- ava_engine/: regles directement reutilisables dans la logique conversationnelle d'AVA.
- cas_pratiques/: scenarios de clients.
- evaluations/: quiz et validation.
- sources/: liens officiels consultes.

## Integration dans AVA

Les règles du fichier `ava_engine/ava_regles_respiratoires.json` sont des garde-fous prioritaires par rapport aux objectifs de vente.

Moteur conversationnel : `lib/ava/respiratory-guardrails.ts` (branché dans `chatAva` avant le catalogue et la FAQ).

Les scripts ne doivent pas être utilisés pour automatiser un diagnostic. Ils servent à détecter qu'un conseil commercial doit s'arrêter, qu'une urgence prime, ou qu'une orientation humaine All Vap's est nécessaire.
