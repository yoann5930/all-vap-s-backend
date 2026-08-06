# Inventaire App — Base de données

## Modèles inventaire (existants + additifs)

- `InventorySession` — + `stockAppliedAt`, `stockAppliedByUserId`
- `InventoryLine` — + `expectedQuantitySnapshot` (stock théorique serveur)
- `InventoryPhoto`
- `InventoryAuditLog`
- `StockLocation` / `StockLevel` / `StockMovement`

## Statuts session

`OPEN` → `SUBMITTED` (employé) → `VALIDATED` (admin) → `CORRECTED` (après apply-stock)  
Aussi : `COMPLETED` (legacy), `CANCELLED`

## Migrations additives (non destructives)

| Migration | Contenu |
|-----------|---------|
| `20260806180000_inventory_stock_applied_gate` | colonnes anti double apply |
| `20260806181000_inventory_expected_qty_snapshot` | snapshot écart |

**Exécution prod :** interdite sans sauvegarde + autorisation explicite.

## Non créé (volontairement)

`InventoryScanEvent`, `InventoryUnknownProduct`, `InventoryValidation` — couverts par lignes + audits + statut session.
