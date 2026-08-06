# Inventaire App — Architecture

**Projet :** `D:\all vaps\all-vap-s-backend` (officiel)  
**Pas de projet parallèle.**

## Vue d’ensemble

```
Employé PWA /inventaire
  → JWT cookie All Vap’s (EMPLOYEE|ADMIN)
  → /api/inventaire/*
  → Prisma Product + InventorySession/Line/Photo
  → StockLevel (lecture au scan ; écriture UNIQUEMENT via apply-stock admin)

Admin /admin/inventaires
  → validation statut + apply-stock explicite
```

## Composants clés

| Couche | Emplacement |
|--------|-------------|
| SPA employé | `components/inventory/EmployeeInventoryApp.tsx` |
| Scan | `BarcodeCameraScanner.tsx` (ZXing + BarcodeDetector) |
| Auth | `lib/inventory/auth.ts` |
| Stock gate | `lib/inventory/apply-stock.ts` |
| Adapter lecture | `lib/inventory/stock-adapter.ts` |
| Offline | `lib/inventory/offline-queue.ts` |
| PWA | `public/manifest-inventaire.webmanifest`, `public/sw.js` |

## Décisions

1. Même base PostgreSQL / Prisma que le site.
2. Lookup EAN = exact (barcode / sku / sumupSku).
3. `complete` employé → `SUBMITTED` sans écrire le stock.
4. `POST .../apply-stock` admin + `confirmToken` + `stockAppliedAt` anti-doublon.
5. `INVENTORY_MANAGER` = alias logique ADMIN (v1, pas d’enum Prisma).
6. Routes `/inventaire/connexion|scan|…` = redirects vers SPA.
