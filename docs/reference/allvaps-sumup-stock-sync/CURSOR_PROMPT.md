# MISSION CURSOR - ALL VAP'S / SUMUP STOCK SYNC

Travaille uniquement dans ce dossier. Ne remplace pas SumUp et ne modifie jamais le terminal SumUp. SumUp reste le logiciel de caisse magasin.

## Résultat attendu

Créer un service de synchronisation de stock robuste entre :
- les quatre caisses SumUp du même compte marchand ;
- le site e-commerce All Vap's ;
- le paiement en ligne Viva.com ;
- une base PostgreSQL centrale.

## Contraintes bloquantes

1. Utiliser uniquement les API officielles et documentées.
2. Ne jamais inventer d'endpoint SumUp catalogue/stock.
3. Ne jamais utiliser de reverse engineering, ADB, automatisation d'écran, clic robotisé ou contournement du mode kiosque.
4. Tant que SumUp ne fournit pas un endpoint officiel d'écriture de stock, laisser `SUMUP_STOCK_WRITE_MODE=disabled`.
5. Les imports produits/quantités depuis SumUp se font par CSV exporté officiellement.
6. Les ventes SumUp sont lues par l'API Transactions puis enrichies par l'API Receipts.
7. Toute opération doit être idempotente et auditée.
8. Aucun stock négatif sauf configuration explicite.
9. Une commande web ne décrémente définitivement qu'après confirmation du paiement Viva.com.
10. Ajouter des tests automatisés couvrant les doublons, remboursements, annulations, ventes simultanées et ruptures.

## Stack imposée

- TypeScript strict
- Node.js 20+
- Fastify
- Prisma
- PostgreSQL
- Zod
- Vitest
- Pino
- pnpm workspaces

## À réaliser

1. Finaliser le schéma Prisma.
2. Créer les migrations.
3. Implémenter le client SumUp :
   - historique des transactions ;
   - récupération d'un reçu ;
   - pagination ;
   - retry exponentiel ;
   - rate limiting ;
   - curseur de dernière synchronisation.
4. Mapper les lignes de reçu vers les variantes par SKU quand disponible, sinon par table d'alias validée manuellement.
5. Créer l'import CSV SumUp avec aperçu avant validation, rapport d'erreurs et rollback.
6. Créer le moteur de stock central : réception, vente caisse, vente web, retour, correction, inventaire.
7. Créer les réservations de panier avec expiration automatique.
8. Créer le webhook Viva.com avec vérification de signature et idempotence.
9. Gérer les remboursements SumUp en réintégrant le stock seulement lorsqu'ils sont confirmés et associés à des lignes produits.
10. Créer une file `ReconciliationTask` pour toute vente web qui doit être rapprochée de SumUp.
11. Créer un mini tableau d'administration pour :
    - état des synchronisations ;
    - produits non reconnus ;
    - écarts de stock ;
    - rapprochements en attente ;
    - relance manuelle sûre.
12. Ajouter OpenAPI et une documentation d'installation Windows/Render/Vercel.
13. Ne jamais mettre les secrets dans le frontend.
14. À la fin, exécuter lint, tests, build et produire `docs/rapport-final.md`.

## Critères d'acceptation

- Une transaction SumUp déjà traitée ne modifie jamais deux fois le stock.
- Deux commandes concurrentes ne peuvent pas vendre la dernière unité simultanément.
- Une commande Viva échouée ou annulée libère la réservation.
- Un produit non reconnu ne modifie pas le stock : il crée une alerte de mapping.
- Chaque mouvement conserve source, identifiant externe, quantité avant/après, date et motif.
- Le système continue à fonctionner même si SumUp est temporairement indisponible.
