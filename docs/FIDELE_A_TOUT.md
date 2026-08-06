# Intégration Fidèle à Tout — All Vap's

Ce document décrit l'architecture préparée dans le site et l'application. **Aucune synchronisation réelle n'est inventée** tant que les accès officiels All Vap's ne sont pas fournis.

## État actuel

| Élément | Statut |
|--------|--------|
| Modèle client (champs `fideleATout*`) | Prêt (PostgreSQL) |
| Historique points (`LoyaltyLedgerEntry`) | Prêt |
| QR personnel All Vap's (client connecté) | Prêt |
| Recherche admin téléphone / QR | Prêt (`/admin/fidelite`, `/api/admin/loyalty/lookup`, `/api/loyalty/scan`) |
| Client HTTP Fidèle à Tout | Stub typé — refuse l'appel si non configuré |
| Attribution points distants | Non branchée |
| App Android (scan caméra) | À brancher sur les mêmes APIs |

## Création du compte Fidèle à Tout (à faire côté All Vap's)

1. Créer le compte marchand **All Vap's** auprès de Fidèle à Tout.
2. Récupérer et conserver (secrets, jamais dans le dépôt) :
   - Identifiant marchand / enseigne
   - Clé API (ou couple client_id / client_secret)
   - URL de base de l'API (prod + sandbox si distincte)
   - Documentation des endpoints : recherche membre, solde, crédit/débit, association QR/CB
   - Format exact du QR / code-barres client
   - Identifiants / package Android pour l'app caisse si fournie
3. Configurer un utilisateur technique (si requis) et les IP autorisées.
4. Activer un **environnement de test** avant la production.

## Variables d'environnement

À renseigner dans `.env.local` (jamais commités) :

```env
FIDELE_A_TOUT_ENABLED=true
FIDELE_A_TOUT_SYNC_REQUIRED=true   # dès que la sync officielle est obligatoire
FIDELE_A_TOUT_TEST_MODE=true       # dry-run jusqu'à validation
FIDELE_A_TOUT_API_URL=https://…    # URL officielle
FIDELE_A_TOUT_API_KEY=…            # secret
FIDELE_A_TOUT_MERCHANT_ID=…        # id enseigne
FIDELE_A_TOUT_ANDROID_PACKAGE=…    # optionnel
```

Sans `API_URL` + `API_KEY` + `MERCHANT_ID`, le système reste en mode « architecture prête » et **n'attribue pas de points distants**.

## Effet miroir (site + Android)

1. Le client affiche son QR All Vap's (ou ultérieurement son QR/CB Fidèle à Tout une fois lié).
2. Le site admin ou l'app Android scanne via caméra → payload envoyé à `/api/loyalty/scan` (admin) ou lookup téléphone.
3. Le système reconnaît le client local ; si FAT est configuré, un lookup distant complète les infos.
4. Les points sont mis à jour **via Fidèle à Tout** lorsque `FIDELE_A_TOUT_SYNC_REQUIRED=true`.

Règle métier codée : `mayAwardLocalLoyaltyPoints()` — si sync requise, **aucun crédit local**, seulement une écriture ledger `fidele_pending`.

## Mode test

Avec `FIDELE_A_TOUT_TEST_MODE=true` et credentials renseignés, `syncMemberPoints` renvoie un **dry-run** (aucun point distant modifié) jusqu'à ce que l'implémentation HTTP réelle soit validée.

## Fichiers clés

- `lib/fidele-a-tout/config.ts` — configuration
- `lib/fidele-a-tout/client.ts` — stubs API
- `lib/loyalty.ts` — ledger + garde sync
- `app/api/account/loyalty/route.ts` — QR + historique client
- `app/api/loyalty/scan/route.ts` — scan boutique
- `app/api/admin/loyalty/lookup/route.ts` — recherche admin
- `app/admin/fidelite/page.tsx` — UI admin
- `app/account/fidelite/page.tsx` — UI client

## Ce qu'il restera à coder le jour J

1. Remplacer les `throw FIDELE_A_TOUT_API_NOT_IMPLEMENTED` par les appels HTTP officiels (doc Fidèle à Tout).
2. Mapper les champs réponse → `fideleAToutMemberId`, barcode, solde.
3. Brancher le scan caméra Android sur les mêmes endpoints.
4. Passer `FIDELE_A_TOUT_TEST_MODE=false` après validation métier.
