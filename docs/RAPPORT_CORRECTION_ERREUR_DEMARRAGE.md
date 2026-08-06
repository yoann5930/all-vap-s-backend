# Rapport — Correction erreur démarrage All Vap's

**Date :** 2026-08-06  
**Branche :** `integration/site-plus-inventaire`  
**Statut runtime :** corrigé en local  
**Déploiement :** non effectué (volontairement)

---

## Symptôme

Page affichée :

> « Une erreur est survenue – veuillez réessayer. »

Composant UI : `app/error.tsx` (boundary React client).

Pages concernées (repro Playwright) :

- `/boutique` → ERROR_UI true
- `/e-liquides` → ERROR_UI true
- `/` et `/inventaire` → OK (pas cette erreur)

---

## Cause exacte

Chaîne d’échec après le merge inventaire :

1. **Cause racine (serveur / Prisma)**  
   Le schéma Prisma fusionné (`origin/main` inventaire) avait perdu les champs catalogue locaux sur `Product` :
   - `manufacturerId`
   - `rangeId`
   - (et modèles associés `Manufacturer`, `ProductRange`, etc.)

   Alors que `lib/products/queries.ts` filtre encore :

   ```ts
   manufacturerId: { not: null },
   rangeId: { not: null },
   ```

2. **API**  
   `GET /api/products` → **500**  
   `PrismaClientValidationError` : `Unknown argument manufacturerId`

3. **UI**  
   Fichier : `components/shop/ProductCatalog.tsx`  
   Ligne : **137** (source)

   ```tsx
   {data ? `${data.pagination.total} produits trouvés` : "Chargement…"}
   ```

   Après l’échec API, `data` était truthy sans `pagination` →  

   `TypeError: Cannot read properties of undefined (reading 'total')`  

   → déclenchement de `app/error.tsx`.

**Important :** la base locale avait déjà les colonnes/tables catalogue ; seul le **schéma Prisma client** était incomplet après le merge.

---

## Correction appliquée

| Fichier | Correction |
|---------|------------|
| `prisma/schema.prisma` | Restauration des modèles / champs catalogue (`Manufacturer`, `ProductRange`, `ProductCollection`, `CatalogFormat`, `CatalogRangeProposal`, `ProductImage`, `ProductAvaMeta`, champs `Product.manufacturerId` / `rangeId` / …) **en conservant** `inventoryLines` inventaire |
| `prisma/migrations/20260806170000_restore_catalog_hierarchy_fields/migration.sql` | Migration idempotente (ADD COLUMN IF NOT EXISTS) |
| `components/shop/ProductCatalog.tsx` L.137 | Guard `data?.pagination` pour ne plus planter si l’API échoue |
| `middleware.ts` | Alignement `isAllowedOrigin(origin)` (signature 1 arg de `lib/security-origins.ts`) |
| `package.json` / lock | Réinstall `qrcode`, `otplib`, `pdf-lib` (perdus au merge package.json inventaire) — nécessaire pour tenter le build |

Aucune donnée métier (prix, stocks, EAN, SKU, produits) n’a été modifiée.

---

## Tests effectués

| Test | Résultat |
|------|----------|
| Playwright `/` | HTTP 200, ERROR_UI **false** |
| Playwright `/boutique` | HTTP 200, ERROR_UI **false** |
| Playwright `/e-liquides` | HTTP 200, ERROR_UI **false** |
| Playwright `/inventaire` | HTTP 200, ERROR_UI **false** |
| `GET /api/products?limit=5` | **200** (produits renvoyés) |
| `npm run lint` | OK (warnings préexistants hooks / `<img>`) |
| `npx tsc --noEmit` | **Échec** (~507 erreurs) — dette de merge schéma/code (ex. `sumUpSyncState`, `orderStatusHistory`, …) **distincte** de l’erreur boutique |
| `npx next build` | Compile webpack OK, puis **échec typecheck build** sur `prisma.orderStatusHistory` (`app/admin/activite/page.tsx`) — même dette de merge, **pas** la cause de « Une erreur est survenue » |
| `npm run dev` | Site local opérationnel après correction |

---

## Résultat

- L’écran « Une erreur est survenue » sur **boutique / e-liquides** est **éliminé**.
- Accueil, catalogue API, inventaire (page) fonctionnent en local.
- **Ne pas déployer** tant que le build production typecheck n’est pas assaini (schéma Prisma encore incomplet vs code local SumUp/admin).

---

## Suite recommandée (hors périmètre de cette correction)

1. Restaurer progressivement les modèles Prisma locaux manquants (`OrderStatusHistory`, `SumUpSyncState`, …) **ou** retirer/conditionner le code qui les appelle.
2. Réintroduire un script `type-check` dans `package.json`.
3. Seulement ensuite : push branche → review → déploiement.
