# Package SumUp stock sync (Downloads) → All Vap's

Source copiée : `docs/reference/allvaps-sumup-stock-sync/`  
(origine : `Downloads/allvaps-sumup-stock-sync-cursor/allvaps-sumup-stock-sync`)

## Décision

**Ne pas** démarrer le service Fastify parallèle (squelette 501).  
Le connecteur **All Vap's existant** reste la source officielle :

- `npm run sumup:connect-stock`
- `connectSumUpStock()` / CSV inbox / API transactions / StockLevel
- Admin `/admin/sumup-sync`

## Mapping package → existant

| Idée package | Statut All Vap's |
|--------------|------------------|
| CSV catalogue SumUp | ✅ `inbox_sumup` + `applySumUpCsvImport` |
| API Transactions | ✅ `lib/sumup/sync-service.ts` |
| Idempotence ventes | ✅ `SumUpSyncedTransaction` + `externalReference` |
| Stock central | ✅ `StockLevel` @ `GLOBAL_ALL_VAPS` |
| Réservation panier | ✅ `reserveStockForOrder` |
| Vente après paiement | ✅ `commitSaleForOrder` / Viva fulfill |
| Anti stock négatif | ✅ guard + `ALLOW_NEGATIVE_STOCK=false` |
| `SUMUP_STOCK_WRITE_MODE=disabled` | ✅ ajouté dans config / `.env.example` |
| File rapprochement web→SumUp | ✅ `ReconciliationTask` + enqueue à la confirmation |
| Alias produit | 🔶 `ProductMatch` (équivalent opérationnel) |
| Fastify API :3001 | ❌ non adopté (doublon) |
| OpenAPI / Vitest package | 🔶 reporté ; tests : `sumup:lock-test` + `stock:test` |

## Contraintes respectées (CURSOR_PROMPT)

1. API officielles seulement  
2. Pas d’endpoint inventé  
3. Pas de reverse engineering / robot UI  
4. `SUMUP_STOCK_WRITE_MODE=disabled`  
5. Import catalogue = CSV  
6. Ventes = Transactions (+ receipts si dispo)  
7. Idempotence + audit  
8. Pas de stock négatif (défaut)  
9. Décrément web après paiement confirmé  
10. Tests stock / sync déjà en place  

## Commandes à lancer chez toi

```bash
# Arrêter next si besoin, puis :
npx prisma db push
npx prisma generate
npm run sumup:lock-test
npm run stock:test
```
