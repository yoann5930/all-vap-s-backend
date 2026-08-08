# Rapport de tests — All Vap's

**Date :** 2026-08-08  
**Mode :** tests en lecture seule — **aucune correction de code**  
**Base testée :** working tree local (`HEAD` `b07fe36` + modifications non commités catalogue/A.V.A.)  
**Note :** ce n’est **pas** un test de `origin/main` (prod). Les scripts inventaire remote n’existent pas dans ce working tree.

---

## 1. Synthèse

| Indicateur | Valeur |
|---|---|
| Commandes exécutées | 12 |
| OK | 8 |
| Échec / blocage attendu | 3 |
| Non applicable / absent | plusieurs scripts mission |
| Build production local | **OK** |
| Prod live smoke (HTTP) | **OK** |

**Verdict tests locaux :** qualité de build/lint/types **satisfaisante** sur la copie locale.  
**Verdict couverture :** **incomplète** (pas de DB locale, pas de tests inventaire, pas de sandbox paiement, scripts mission manquants).  
**Verdict prod smoke :** health + produits + search + inventaire **répondants**.

---

## 2. Matrice des commandes

| # | Commande | Résultat | Détail |
|---|---|---|---|
| 1 | `npm run lint` | **OK** | 0 warning / 0 error (`next lint` deprecated warning informatif) |
| 2 | `npx tsc --noEmit` | **OK** | exit 0 |
| 3 | `npx prisma generate` | **OK** | Client v6.19.3 généré |
| 4 | `npx prisma validate` | **ÉCHEC** | `P1012` — `DATABASE_URL` absente (pas de `.env`) |
| 5 | `npx tsx scripts/catalog-phase2-tests.ts` | **OK** | **27 OK, 0 FAIL** |
| 6 | `npx tsx scripts/ava-behavior-smoke.ts` | **OK*** | Exit 0 — *voir anomalie §4* |
| 7 | `npm run build` | **OK** | Build Next 15.5.22 ; 87 pages ; warning Edge `crypto` |
| 8 | `npm audit --omit=dev` | **ÉCHEC** | **7 vulns** (5 high, 2 moderate) |
| 9 | `git diff --check` | **OK** | Pas d’erreurs whitespace bloquantes |
| 10 | Scan secrets basique (`rg`) | **OK** | Uniquement placeholders `.env.example` |
| 11 | `python …/audit_catalogue_assets.py catalogue-allvaps.zip` | **ÉCHEC** | 4 images manquantes + 40 prix + 40 EAN/SKU |
| 12 | Smoke HTTP prod | **OK** | health / products / search / inventaire |

\* Exit code 0, mais comportement « puff » encore renvoyé via `searchCatalog` (hors filtre `ava-advisor`).

---

## 3. Détail catalogue phase 2 (27/27)

Tous verts :

- Emplacement `GLOBAL_ALL_VAPS` unique ; absence HAUTMONT / LE_QUESNOY (logique locale phase 2)
- Disponibilité = qty − reserved ; pas de négatif
- Statuts EN_STOCK / STOCK_FAIBLE / RUPTURE / INCONNU
- Normalisation search (fraise glacée, barcode, sku, nom)
- Import / maj stock général / non reconnus / doublons / avant-après
- Ava stock général / rupture / inconnu
- Feuilles export générales

> **Attention :** sur `origin/main`, le modèle stock a évolué (dual-store inventaire). Ces 27 tests valident la **base locale**, pas forcément la logique prod actuelle.

---

## 4. Smoke A.V.A. — résultats bruts

| Entrée | Sortie observée |
|---|---|
| Speech DIY / AVA | OK (humanize) |
| Greeting « Je suis » | `false` (attendu selon script) |
| « Je m'appelle Ava. » | OK |
| Frais Rouge | E-liquide Frais Rouge… |
| DIY | Base DIY… |
| Résistance Vaporesso | Resistance Vaporesso GTX… |
| **« Je veux une puff. »** | **Puff Blueberry** ← exclusion non testée ici |
| Cigarette électronique | Kit Pod + Puff Blueberry |
| Menthe | Menthe Fraiche… |

**Interprétation :** le smoke teste `searchCatalog` avec un jeu fictif incluant une puff. L’exclusion Puff/JNR est dans `ava-advisor.ts` (working tree local) et **n’est pas exercée** par ce script. À corriger dans une future passe de tests (hors scope actuel).

---

## 5. Build local — observations

- Compilation OK (~39 s compile + lint/types)
- Warning : `lib/security.ts` → module Node `crypto` non supporté en **Edge Runtime** (middleware)
- Warning : `tailwind.config.ts` / `type: module` package.json
- Route locale non déployée incluse dans le build : `/api/admin/catalog/apply-eliquide-safe-fixes`
- Middleware ~40.8 kB

Env factices utilisées uniquement pour le build :

- `DATABASE_URL=postgresql://allvaps:allvaps@localhost:5433/allvaps?schema=public`
- `JWT_SECRET=audit-local-only-not-for-prod`
- `NEXT_PUBLIC_APP_URL=http://localhost:3000`

Aucune connexion réelle exigée pour `next build` (pages dynamiques).

---

## 6. Audit npm (`--omit=dev`)

| Sévérité | Count |
|---|---|
| critical | 0 |
| high | 5 |
| moderate | 2 |
| low | 0 |
| **total** | **7** |

Chaînes principales :

- `next` → `postcss` / `sharp` (CVE libvips) — fix force → Next 16 (breaking)
- `exceljs` → `uuid` — fix force → exceljs 3.x (breaking)

**Recommandation test future :** `npm audit` sur `origin/main` après `npm ci` aligné prod (dépendances inventaire supplémentaires : `@zxing/*`, `googleapis`, `@vercel/blob`).

---

## 7. Audit assets catalogue

```
Produits: 40
Prix vente TTC manquants: 40
Code-barres / SKU manquants: 40
BLOCAGE: image-1785228599019.jpg
BLOCAGE: image-1785228630196.jpg
BLOCAGE: image-1785228670994.jpg
BLOCAGE: image-1785228719275.jpg
Blocages détectés: 4
```

Exit code 1 — **attendu** tant que le lot source est incomplet.

---

## 8. Smoke production (hors code)

| Endpoint | Status | Notes |
|---|---|---|
| `GET https://www.allvaps.fr/api/health` | 200 | DB ok |
| `GET https://allvaps.fr/api/health` | 200 | DB ok |
| `GET /api/products?limit=3` | 200 | Ex. E-chicha ASTARA… |
| `GET /api/search?q=liquidarom` | 200 | Produits Liquidarom listés |
| `GET https://inventaire.allvaps.fr/` | 200 | Surface inventaire up |

Pas de tests authentifiés, checkout, webhooks, ni scan inventaire (nécessitent secrets / appareils).

---

## 9. Tests absents / non exécutables ici

| Script / suite | Statut |
|---|---|
| `npm run test:security` | **Absent** `package.json` local |
| `npm run test:ava` | **Absent** |
| `npm run test:ava-knowledge` | **Absent** (module Knowledge absent) |
| `npm run test:ava-phase4` | **Absent** |
| `scripts/test-inventaire-auth.mjs` | Sur remote seulement |
| `scripts/test-inventaire-public.mjs` | Sur remote seulement |
| `scripts/test-inventory-admin-tracking.ts` | Sur remote seulement |
| `scripts/test-inventory-users-security.ts` | Sur remote seulement |
| `scripts/test-official-search.ts` | Sur remote seulement |
| Dry-run Liquidarom DB | Impossible sans PostgreSQL / `.env` |
| Playwright E2E boutique | Non lancé (pas demandé / pas de config CI locale claire) |
| Sandbox SumUp / Viva | Non testé |
| Vision réelle / navigateurs multi-device | Non testé |

---

## 10. Recommandations de tests (prochaine itération)

1. Après sync `origin/main` : relancer lint, tsc, build, catalog tests **et** scripts inventaire remote.
2. Ajouter un test unitaire `ava-advisor` : requête « puff » → refus + 0 produit jetable.
3. CI : `prisma validate` avec `DATABASE_URL` de CI ; `migrate deploy` sur DB éphémère.
4. Smoke post-deploy automatisé : health + search + login inventaire (sans secrets dans les logs).
5. Ne pas déclarer « zéro erreur » tant que : DB locale absente, vulns npm, 4 images manquantes, scripts mission manquants.

---

## 11. Preuves d’environnement

- OS : Windows 10 (build 26200)
- Node/npm : via toolchain projet (Next 15.5.22)
- Pas de `.env` / `.env.local` / `.env.production` dans le working tree
- `node_modules` présent ; build réutilisé
- Aucun commit créé pendant cette session de tests
