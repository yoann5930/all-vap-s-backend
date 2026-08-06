# Rapport — Gestion des stocks All Vap's (anti-rupture / anti-survente)

Date : 2026-07-30

## Objectif

Impossible de commander un produit dont le stock réel (SumUp → `StockLevel`) est insuffisant — y compris via API / Postman / courses concurrentes.

## Architecture

| Couche | Rôle |
|--------|------|
| SumUp sync (`lib/sumup/sync-service.ts`) | Source des ventes boutique → `StockLevel` |
| `StockLevel` + `StockMovement` | Quantité / réservé / disponible |
| `lib/stock/*` | Validation, réservation atomique, commit vente, alertes, journal |
| Panier / checkout / paiement | Recontrôles successifs |
| Admin `/admin/stocks` | État + force sync + journal |

## Anti-survente

1. **Création commande** : `validateCartStock` puis `reserveStockForOrder` (transaction `Serializable` + `updateMany` conditionnel `availableQuantity >= qty`).
2. **Paiement** : `revalidateOrderStock` **avant** toute création checkout PSP ; échec → commande annulée + libération réservation + HTTP 409.
3. **Après paiement** : `commitSaleForOrder` (idempotent `sale:order:…`) met à jour `StockLevel` + `Product.stock` + `ProductVariant.stock`.
4. Deux clients sur le dernier exemplaire : la 2ᵉ réservation échoue.

## Synchronisation

| Déclencheur | Mécanisme |
|-------------|-----------|
| Intervalle | Worker / cron existants (`SUMUP_SYNC_INTERVAL_SECONDS`, défaut **1800 s**) |
| Démarrage serveur | `instrumentation.ts` si `SUMUP_SYNC_ENABLED` |
| Admin | Bouton **Forcer la synchronisation SumUp** → `POST /api/admin/stocks/sync` |
| Après vente e-commerce | `commitSaleForOrder` immédiat |
| Après modif admin | PATCH stocks → `StockLevel` + miroirs + alerte |

## Affichage

- Stock > 0 : « En stock », bouton actif
- Stock = 0 : « Rupture de stock », bouton `disabled` + `aria-disabled`
- Variantes nicotine contrôlées une par une
- Produit toujours visible

## Alertes

- Seuil faible : **5** (`STOCK_LOW_ALERT_THRESHOLD`)
- Rupture : **0**
- Destinataire : `STOCK_ALERT_EMAIL` (exemple `allvaps70@gmail.com`)
- Contenu : produit, fabricant, gamme, variante, EAN, stock, date/heure

## « Prévenez-moi »

Architecture `lib/stock/back-in-stock.ts` — **désactivée** (`STOCK_NOTIFY_ENABLED=false`).

## Fichiers créés

- `lib/stock/availability.ts`, `guard.ts`, `events.ts`, `alerts.ts`, `back-in-stock.ts`, `index.ts`
- `app/api/stock/validate/route.ts`
- `app/api/admin/stocks/sync/route.ts`
- `scripts/test-stock-guard.ts`
- modèle Prisma `StockEvent`

## Fichiers modifiés

- `app/api/orders/route.ts`, `app/api/payments/checkout/route.ts`
- `lib/payments/fulfill-order.ts`, `lib/catalog/stock.ts`, `lib/shipping/ops.ts`
- `app/api/admin/stocks/route.ts`, `components/admin/AdminStocksClient.tsx`, `app/admin/stocks/page.tsx`
- `app/cart/page.tsx`, `app/checkout/page.tsx`
- `components/products/ProductPurchasePanel.tsx`, `AddToCartButton.tsx`
- `lib/catalog/site-stock.ts`, `instrumentation.ts`, `.env.example`, `lib/api-utils.ts`, `package.json`

## Tests exécutés

`npm run stock:test` :

- ✔ stock positif
- ✔ refus stock insuffisant
- ✔ anti-survente 2 réservations / 1 unité
- ✔ rupture après vente

## Erreurs restantes / notes

- `prisma generate` peut échouer en EPERM si `next dev` verrouille le client Windows — redémarrer le serveur puis régénérer.
- Sync SumUp réelle nécessite `SUMUP_SYNC_ENABLED=true` + clés API.
- Si SumUp sync est down, le site s’appuie sur le dernier `StockLevel` connu ; stock **inconnu** (`known=false`) bloque la vente avec le message de vérification.

## Design

Aucun changement design / header / footer / A.V.A. / catalogue / promotions — uniquement libellés stock et états bouton.
