# Diagnostic lecture seule — Admin cohérence + A.V.A.
Date: 2026-08-09  
Branche: `fix/admin-data-consistency-ava-admin`  
Base: `origin/main` @ `90a93108`  
Mode: **READ-ONLY** — aucune sync, aucune mutation stock, aucun push prod.

## PHASE 0 — Git

| Check | Résultat |
| --- | --- |
| `git fetch origin` | OK |
| HEAD vs `origin/main` | Identiques (`90a93108`) |
| Branche dédiée | `fix/admin-data-consistency-ava-admin` créée |
| `reset --hard` / force push | Non utilisés |
| Travail local | Conservé (mods client AVA + untracked nombreux) |
| Migrations Prisma récentes | Présentes jusqu’à `20260809003000_order_audit_fields` |

## PHASE 1 — Tableau cohérence

| Source | Endpoint / requête | Count dashboard | Count API liste | Count DB (concept) | Écart | Cause probable |
| --- | --- | --- | --- | --- | --- | --- |
| Ruptures stock | Dashboard: `StockLevel.count(availableQuantity ≤ 0)` | ~1317 (audit) | Liste: N+1 `Product` + dual store → timeout / vide | Toutes locations `StockLevel` | **Critique** | Sources différentes + API liste trop lourde + UI silencieuse |
| Stocks faibles | Dashboard: `StockLevel` 0&lt;q≤5 | ~299 | Liste: filtre `Product.stock ≤ 5` puis dual | Seuils / champs différents | **Critique** | `Product.stock` legacy ≠ `StockLevel` ; seuil fixe |
| Inventaires ouverts | `InventorySession.count(OPEN)` | ~11 | `GET /api/admin/inventaires` + include **toutes** lines+photos | Sessions OPEN | **Critique** | Payload trop lourd → chargement infini |
| Employés actifs | `User.count(EMPLOYEE, active)` | ~4 | `GET /api/admin/users` côté client | EMPLOYEE+ADMIN en DB | **Critique** | Fetch client fragile → `users=[]` si erreur auth |
| Catégories / Marques | Pages catalog | Produits visibles | `/admin/catalog` affiche 0 | Tables relationnelles vs string legacy | Fort | UI lit tables vides ; produits utilisent d’autres champs |
| A.V.A. Offline / VM stopped | Fidelatoo status | Offline | Orchestrateur local | N/A | Attendu si orch down | Chat métier **ne dépend pas** de la VM |

## Causes racines (priorisées)

### 1. Stocks dashboard ≠ liste (`/admin/stocks` vide)
- **Dashboard** (`app/admin/page.tsx`) : compte brut `prisma.stockLevel` (toutes locations, y compris miroirs legacy).
- **Liste** (`app/api/admin/stocks/route.ts`) : charge **tous** les `Product`, puis `getDualStockForProduct` (Hautmont + Le Quesnoy) **par produit** → N+1 massif → timeout/erreur.
- **UI** (`AdminStocksClient`) : pas d’état ERROR clair ; échec ⇒ tableau vide.
- Filtres URL `?filter=out|low` du dashboard **non lus** par le client.

### 2. Inventaires bloqués « Synchronisation… / Chargement… »
- Count cheap vs list `include: { lines: { include: { photos: true } } }` jusqu’à 200 sessions.
- Poll live toutes les 4 s sur la même API lourde.
- Pas d’état ERROR ; loading reste true tant que la promesse ne résout pas.

### 3. Utilisateurs 0 vs KPI 4
- KPI SSR Prisma OK.
- Page : `fetch('/api/admin/users')` sans surface d’erreur robuste → liste vide.
- L’API elle-même n’exclut pas les EMPLOYEE si le token ADMIN passe.

### 4. A.V.A. Admin Offline
- Badge Offline = orchestrateur Fidelatoo / VM Android injoignable (`vm: stopped`, `app: unknown`).
- **Chat + outils ventes/stocks** = Next.js + Prisma, **sans VM**.
- Small talk (`salut`/`cc`) déjà corrigé sur `main` (`wantTools: false`) — ne doit plus appeler d’outils métier.

## Chaîne A.V.A. (lecture seule)

```
ADMIN UI
 → GET/POST /api/admin/ava/chat          (Prisma conversation + tools métier)
 → [optionnel] Fidelatoo status/ops      (orchestrateur → ADB/VM)
 → runAdminToolPlan → StockLevel / Order (DB)
```

VM requise **uniquement** pour ops Fidelatoo (écran, QR, start VM), pas pour discuter ni analyser ventes/stocks DB.

## Interdits respectés jusqu’ici

- Aucune synchronisation SumUp / catalogue
- Aucune mutation stock
- Aucun reset / import massif
- Aucun push production
- Aucune suppression de données

## Prochaine action (UNE SEULE)

**PHASE 2 — Corriger l’API `/api/admin/stocks` + client** pour lire `StockLevel` (Hautmont/Le Quesnoy) avec pagination, aligner les KPI dashboard sur la même source, et afficher LOADING / SUCCESS / EMPTY / ERROR — **sans modifier les quantités de stock**.
