# Inventaire App — Changelog

## 2026-08-06 — Connexion + sécurisation stock

- Audit : `docs/AUDIT_CONNEXION_APPLICATION_INVENTAIRE_ALL_VAPS.md`
- `complete` employé/admin → `SUBMITTED` **sans** `setStoreStockQuantity`
- `POST /api/admin/inventaires/[id]/apply-stock` (ADMIN, confirmToken, anti-doublon)
- UI : « Envoyer à validation » / bouton apply-stock admin
- Offline employé via `offline-queue`
- Redirects `/inventaire/connexion|scan|nouvelle-session|…`
- EAN exact ; `expectedQuantitySnapshot` serveur
- `InventoryStockAdapter` lecture seule
- Schéma catalogue restauré (merge) + `OrderStatusHistory` pour build
