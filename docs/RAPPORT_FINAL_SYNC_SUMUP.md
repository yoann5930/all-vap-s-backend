# Rapport final — Synchronisation SumUp All Vap's

Date : 2026-07-31  
Statut : **Connecteur stabilisé et intégré** (évolutions autour du contrat existant, sans remplacement).

---

## 1. Architecture finale

```
SumUp (caisse)
  │
  ├─ CSV Articles → inbox_sumup/ ──► applySumUpCsvImport (+ hash anti-doublon)
  │                                      │
  │                                      ▼
  │                              Product / Variant.stock
  │                                      │
  │                                      ▼
  ├─ API Transactions ──► runSumUpSync ──► StockLevel (GLOBAL_ALL_VAPS)  ◄── SOURCE OFFICIELLE
  │                                      │
  │                                      ▼
  └─ CSV Push ← outbox_sumup/ ← pushCatalogToSumUp (noms + images)

Consommateurs du stock officiel (StockLevel) :
  Site · Admin · A.V.A. · Commandes (reserve/sale/release) · Recommandations
```

Orchestrateur inchangé côté usage :

- `connectSumUpStock()` — `lib/sumup/stock-connect.ts`
- `npm run sumup:connect-stock`
- `POST /api/admin/stocks/sync`

---

## 2. État du connecteur

| Élément | État |
|--------|------|
| Connexion SumUp API | Conservée (`testSumUpConnection`) |
| Import CSV inbox | Conservé + **hash SHA-256** (pas de double import) |
| Miroir → StockLevel | Conservé |
| Push catalogue outbox | Conservé |
| Sync transactions | Conservée |
| Lien Fabricant → Gamme | **Ajouté** (matching référentiel existant uniquement) |

Verrouillage tests :

- `npm run sumup:test` (existant)
- `npm run sumup:lock-test` (**nouveau** — contrats publics + hash + fichiers critiques)
- `npm run stock:test` (anti double-retrait commandes)
- `npm run validate:sumup` inclut désormais `sumup:lock-test`

---

## 3. État des imports

| Mode | Commande | Notes |
|------|----------|--------|
| Manuel | `npm run sumup:connect-stock` | **Conservé** |
| Automatique | `npm run sumup:inbox-watch` | Watch + poll + hash |
| Admin | `/admin/sumup-sync` → bouton sync | Même orchestrateur |

Table `SumUpInboxFile` : chaque hash importé est enregistré (`IMPORTED` / `SKIPPED_DUPLICATE` / `FAILED`).

`SyncRun` enrichi : `fileName`, `fileHash`, compteurs (modifiés / inchangés / nouveaux / doublons / erreurs), `reportJson`.

---

## 4. État des catalogues

Navigation e-liquides (obligation) :

1. `/e-liquides` — cases **logo fabricant seul**
2. `/fabricants/[slug]` — cases **gamme** (visuel officiel)
3. `/gammes/[slug]` — produits (packshots)

Après chaque connect-stock : `linkSumUpProductsToCatalogHierarchy` associe les produits SumUp aux `Manufacturer` / `ProductRange` **déjà en base** (jamais d’invention, jamais de mélange fabricants).

---

## 5. État des commandes

| Protection | Module |
|------------|--------|
| Validation panier | `lib/stock/availability.ts` |
| Réservation | `lib/stock/guard.ts` → `reserveStockForOrder` |
| Vente après paiement | `commitSaleForOrder` |
| Idempotence | mouvements `reserve:` / `sale:` / `release:` |
| Stock négatif | `availableQuantity = max(0, qty - reserved)` + update conditionnel |
| Tests | `npm run stock:test` |

---

## 6. État d’A.V.A.

- Catalogue chargé via `StockLevel.availableQuantity` (`lib/ai/ava/load-catalog.ts`)
- Recherche : filtre `availableQuantity > 0` (`product-search.ts`)
- Réponses : ne propose pas les ruptures en résultat principal
- Helper stock central documenté : `lib/catalog/stock-official.ts`

---

## 7. Historique & tableau de bord

| Écran | URL |
|-------|-----|
| Dashboard sync (voyants 🟢🟠🔴) | `/admin/sumup-sync` |
| Historique détaillé | `/admin/sumup-sync/historique` |
| API statut | `GET /api/admin/sumup-sync/status` |
| API historique | `GET /api/admin/sumup-sync/history` |

Voyants : Connexion SumUp · PostgreSQL · Docker · Dernière sync · Inbox · Stock central · Worker.

---

## 8. Statistiques (référence mission)

Chiffres confirmés côté métier (session précédente) :

- ~1 918 produits scannés (CSV)
- Stock synchronisé ~2 188 références / ~7 814 unités
- API Transactions OK · PostgreSQL OK · Docker OK

Les chiffres live sont affichés dans `/admin/sumup-sync`.

---

## 9. Tests réalisés / à relancer

```bash
npm run sumup:lock-test
npm run sumup:test
npm run stock:test
npx prisma generate   # si DLL verrouillée par un `next dev`, arrêter le serveur d’abord
```

---

## 10. Anomalies restantes

1. **Prisma generate EPERM** si `next dev` / node verrouille `query_engine-windows.dll.node` — redémarrer le serveur Node puis `npx prisma generate`.
2. **Product.stock** legacy encore miroir pour compat ; la **source officielle** reste `StockLevel`.
3. Certaines gammes SumUp sans matching automatique restent sans `rangeId` (à compléter via scripts fabricant, pas d’invention).
4. Push images SumUp : nécessite `SUMUP_PUSH_PUBLIC_BASE_URL` HTTPS public + réimport manuel outbox dans SumUp Articles.
5. Covers Liquidarom / quelques gammes e.Tasty encore en fallback logo fabricant.

---

## Règle d’évolution

> Le connecteur actuel est **stable**. Toute évolution s’ajoute **autour** de `connectSumUpStock` / `sumup:connect-stock` sans changer leur contrat public. Vérifier avec `npm run sumup:lock-test` avant merge.
