# Inventaire App — Sécurité

## AuthZ

- Employé : `requireInventoryAuth` (EMPLOYEE|ADMIN), `allowedStores`, `mustChangePassword`
- Admin inventaires / apply-stock : `requireAuth("ADMIN")`
- Isolation session : propriétaire ou ADMIN
- Rate limits sur complete / lines / apply-stock

## Stock officiel

- Comptage / submit : **aucune** écriture `StockLevel`
- Apply-stock : ADMIN + `confirmToken=APPLY_STOCK_CONFIRMED` + refus si `stockAppliedAt` déjà posé
- Différences / expected qty : calculées côté serveur

## Autres

- CSRF Origin (middleware)
- Photos via storage dédié (`photo-storage`)
- Pas de secret API dans le client
- Journaux : `AuditLog` + `InventoryAuditLog`
- EAN scanné : match exact uniquement
