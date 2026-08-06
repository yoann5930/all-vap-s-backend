# All Vap's - Synchronisation stocks SumUp <-> site

Ce dossier est un socle Cursor prêt à développer. Il conserve SumUp comme caisse magasin et crée un service central de stock pour le site All Vap's.

## Objectif métier

1. Les produits sont reçus et saisis dans SumUp.
2. Le catalogue/stock est importé dans le service All Vap's par export CSV SumUp tant qu'aucune API catalogue officielle n'est disponible.
3. Les ventes en caisse sont détectées via l'API Transactions SumUp, puis détaillées via les reçus.
4. Chaque article vendu décrémente le stock central et le stock visible sur le site.
5. Une commande web réserve puis décrémente le même stock central après confirmation du paiement Viva.com.
6. Les ventes web à reporter dans SumUp sont placées dans une file de rapprochement. Aucun appel non documenté ou contournement du logiciel SumUp n'est autorisé.

## Limite officielle à respecter

La documentation publique SumUp permet l'authentification, la lecture de l'historique des transactions et la lecture des reçus. Elle ne documente pas, à ce jour, d'endpoint public de modification du catalogue ou du stock du POS. Le projet prévoit donc :

- lecture automatique des ventes SumUp ;
- import catalogue/stock par CSV SumUp ;
- synchronisation immédiate du site ;
- file de rapprochement pour les ventes web ;
- activation future d'un adaptateur d'écriture uniquement si SumUp fournit un accès partenaire officiel.

## Démarrage

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

API : `http://localhost:3001`

## Endpoints prévus

- `GET /health`
- `POST /imports/sumup-catalog-csv`
- `POST /jobs/sumup/poll`
- `GET /inventory/products`
- `POST /inventory/adjustments`
- `POST /web-orders/reserve`
- `POST /web-orders/confirm`
- `POST /web-orders/cancel`
- `POST /webhooks/viva`
- `GET /reconciliation/pending`

## Règle de stock

Le stock central All Vap's devient la référence opérationnelle pour le site. Les mouvements sont enregistrés dans un journal immuable et idempotent afin qu'une transaction SumUp ou un webhook Viva ne puisse jamais être décompté deux fois.
