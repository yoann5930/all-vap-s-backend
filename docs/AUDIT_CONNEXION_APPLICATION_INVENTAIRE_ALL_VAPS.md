# Audit — Connexion application Inventaire All Vap’s

**Date :** 2026-08-06  
**Projet officiel :** `D:\all vaps\all-vap-s-backend`  
**Branche :** `integration/site-plus-inventaire`  
**Statut site global :** ❌ PRÉPRODUCTION NON VALIDÉE  

---

## 1. Verdict d’audit

L’application Inventaire **est déjà intégrée** au monorepo Next.js officiel (même auth JWT, même PostgreSQL/Prisma, mêmes produits/EAN).  
Ce n’est **pas** un projet parallèle.

| Question | Réponse |
|----------|---------|
| Site local en erreur générale ? | Non — `/`, `/boutique`, `/inventaire`, `/admin/inventaire` → 200 |
| Inventaire branché au catalogue ? | Oui — lookup Prisma / EAN |
| Employé peut écrire le stock officiel ? | **Oui aujourd’hui (écart critique)** via `POST .../complete` → `setStoreStockQuantity` |
| Build production OK ? | Non — dette merge (`orderStatusHistory`, etc.) |

---

## 2. Ce qui existe déjà

### Auth / rôles
- Rôles Prisma : `CUSTOMER`, `EMPLOYEE`, `ADMIN` (pas de `INVENTORY_MANAGER`)
- `User.mustChangePassword`, `User.allowedStores`
- [`lib/inventory/auth.ts`](../lib/inventory/auth.ts) — `requireInventoryAuth`, `assertStoreAllowed`

### UI
- Employé SPA : [`/inventaire`](../app/inventaire/page.tsx) + [`EmployeeInventoryApp.tsx`](../components/inventory/EmployeeInventoryApp.tsx)
- Admin : `/admin/inventaire`, `/admin/inventaires`, `/admin/inventaires/[id]`
- Accès : `/acces`, `/login`, `/changer-mot-de-passe`
- Scan : ZXing + BarcodeDetector (EAN-8/13, UPC, Code128/39, ITF) — `@zxing/browser` installé
- PWA : `public/manifest-inventaire.webmanifest`, `public/sw.js`

### Prisma inventaire
- `InventorySession`, `InventoryLine`, `InventoryPhoto`, `InventoryAuditLog`
- `StockLocation`, `StockLevel`, `StockMovement`

### API employé (`app/api/inventaire/`)
- sessions, lines, photos, complete, lookup, product-identify, visual-reference, image-proxy, media

### API admin
- `app/api/admin/inventaires*` (liste, détail, patch, export, reset)
- `app/api/admin/inventory*` (miroir sessions/lines/complete/lookup)

### Hors-ligne
- [`lib/inventory/offline-queue.ts`](../lib/inventory/offline-queue.ts) — file localStorage
- Utilisé côté admin ; **bloqué** côté employé (« Connexion requise »)

---

## 3. Ce qui est réellement branché

```
Employé PWA /inventaire
  → JWT cookie All Vap’s
  → /api/inventaire/*
  → Prisma Product + InventorySession/Line
  → StockLevel (lecture lookup ; écriture à complete ⚠️)
Admin /admin/inventaires
  → /api/admin/inventaires*
  → validation statut session (sans apply-stock séparé)
```

Source de vérité catalogue : base Prisma officielle.  
Dossier `data/catalogue-central-all-vaps/` : **absent**.

---

## 4. Ce qui est incomplet

1. **Stock appliqué à la clôture employé** (doit devenir SUBMITTED sans écriture + apply-stock admin)
2. Rôle `INVENTORY_MANAGER` (alias ADMIN en v1)
3. Modèles `InventoryScanEvent` / `UnknownProduct` / `Validation` (inconnus = lignes sans productId)
4. Routes `/inventaire/connexion|scan|nouvelle-session` (SPA unique aujourd’hui)
5. Zone / étagère structurées
6. Offline employé + API sync dédiée
7. `InventoryStockAdapter` formalisé
8. Build prod (dette merge schéma SumUp / OrderStatusHistory)

---

## 5. Ce qui est cassé / risques

| Risque | Détail |
|--------|--------|
| Écriture stock prématurée | `complete` employé mutile `StockLevel` |
| Rebuild Prisma total | Casserait sessions prod existantes — **interdit** |
| Migration destructive | Interdite |
| Deploy sans tests | Interdit |
| Working tree dirty | Correctifs catalogue runtime non commités au moment de l’audit |

---

## 6. Fichiers à modifier (plan)

| Phase | Fichiers |
|-------|----------|
| P0 | Ce rapport + commit schéma catalogue / ProductCatalog / deps / middleware |
| P1 | `app/api/inventaire/.../complete`, admin complete, nouveau `apply-stock`, UI, migration additive `stockAppliedAt` |
| P2 | offline employé, redirects `/inventaire/*`, snapshot écarts, adapter lecture |
| P3 | débloquer build minimal, smoke |
| P4 | docs `INVENTORY_APP_*.md` |

---

## 7. Migrations éventuellement nécessaires

- **Additive uniquement** : `InventorySession.stockAppliedAt`, `stockAppliedByUserId` (anti double application)
- Colonnes catalogue déjà en DB locale (`manufacturerId`, `rangeId`, …) — schéma Prisma à aligner (déjà en cours)
- **Aucune** migration destructive ; **aucune** exécution prod sans sauvegarde + OK explicite

---

## 8. Approche retenue

Étendre l’existant. Ne pas créer de projet parallèle.  
Lookup EAN exact uniquement.  
`INVENTORY_MANAGER` = alias logique `ADMIN` en première itération.

---

## 9. Données métier

| Élément | Pendant l’audit |
|---------|-----------------|
| Prix modifiés | 0 |
| Produits modifiés | 0 |
| EAN / SKU modifiés | 0 |
| Stock réel modifié | 0 (audit lecture seule) |
