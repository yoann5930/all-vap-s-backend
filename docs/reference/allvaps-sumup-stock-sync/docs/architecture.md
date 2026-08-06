# Architecture cible

```text
Caisses SumUp
    | API Transactions + Receipts (lecture)
    v
Service Sync All Vap's ---- PostgreSQL central ---- API catalogue/stock du site
    ^                               |
    | CSV catalogue/stock           | réservations et ventes web
Export SumUp                        v
                               Viva.com webhook
```

## Flux caisse

- Polling périodique de l'historique SumUp.
- Enregistrement de l'événement externe avant traitement.
- Lecture du reçu.
- Résolution de chaque ligne vers un SKU.
- Décompte atomique et idempotent.
- Ligne inconnue : alerte et aucune modification de stock.

## Flux web

- Réservation transactionnelle du panier.
- Paiement Viva.com.
- Webhook signé.
- Confirmation de la réservation et transformation en vente.
- Création d'une tâche de rapprochement SumUp, sans appeler d'API non officielle.

## Réception fournisseur

Tant que SumUp ne fournit pas d'API catalogue officielle :
- réception saisie dans SumUp ;
- export CSV SumUp ;
- import contrôlé dans le service ;
- publication immédiate sur le site.
