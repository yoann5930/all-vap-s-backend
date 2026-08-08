# Rapport d’audit complet — All Vap's

**Date :** 2026-08-08  
**Périmètre :** lecture seule — **aucune modification appliquée**  
**Dépôt local :** `C:\Users\ASUS\Documents\GitHub\all-vap-s-backend`  
**Remote :** `origin/main` → `https://github.com/yoann5930/all-vap-s-backend.git`  
**Prod live vérifiée :** `https://www.allvaps.fr`, `https://allvaps.fr`, `https://inventaire.allvaps.fr`

---

## 1. Verdict

| Zone | État |
|---|---|
| Prod live (health) | **OK** — app + DB |
| Code déployé (`origin/main`) | **À jour côté inventaire** (49 commits absents du working copy local) |
| Correctifs catalogue / A.V.A. locaux | **Non déployés** (non commités, absents de `origin/main`) |
| Working copy locale | **Désynchronisée** : en retard de 49 commits + 15 fichiers modifiés non commités + fichiers non suivis |
| Risque immédiat | **Élevé** si push local sans `pull`/`rebase` : écrasement ou conflits majeurs avec l’inventaire prod |

**Synthèse :** la production tourne et répond. Les correctifs catalogue (`visibleOnline`, import Liquidarom, exclusion puff A.V.A.) existent **uniquement en local non publié**. La machine locale n’a **pas** le code inventaire déjà en prod.

---

## 2. Cartographie Git / déploiement

### 2.1 Révisions

| Réf | SHA | Date | Message |
|---|---|---|---|
| Local `HEAD` (`main`) | `b07fe36` | 2026-07-28 | hero banner homepage / boutique |
| `origin/main` (réf. prod) | `301bb72` | 2026-08-06 | docs JWT_SECRET Vercel / inventaire |
| Écart | **behind 49** | — | aucun commit local en avance sur le remote |

### 2.2 Plateforme de déploiement

- **Vercel** (fichier `vercel.json` présent sur `origin/main` uniquement, pas dans le working tree local aligné sur `b07fe36`)
- Build prod remote : `prisma generate && prisma migrate deploy && npx tsx scripts/seed-inventory-staff-ci.ts && next build`
- Région : `cdg1`
- Domaines observés : boutique `allvaps.fr` / `www.allvaps.fr` ; inventaire `inventaire.allvaps.fr`
- `render.yaml` local encore présent (legacy / alternative) — pas la source de vérité actuelle de l’inventaire

### 2.3 Health prod (2026-08-08)

| URL | HTTP | Résultat |
|---|---|---|
| `https://www.allvaps.fr/api/health` | 200 | `ok`, database `ok` (~724 ms) |
| `https://allvaps.fr/api/health` | 200 | `ok`, database `ok` (~11 ms) |
| `https://inventaire.allvaps.fr/` | 200 | accessible |
| `GET /api/products?limit=3` | 200 | catalogue live |
| `GET /api/search?q=liquidarom` | 200 | résultats Liquidarom |

---

## 3. Fichiers / changements non déployés

### 3.1 Modifications locales non commités (15 fichiers) — **pas en prod**

Correctifs mission catalogue / A.V.A. présents seulement dans le working tree :

| Fichier | Nature (audit) |
|---|---|
| `lib/catalog/liquidarom-import.ts` | Respect CSV `Actif en boutique` / `Actif en ligne` (plus de force `true`) |
| `lib/products/queries.ts` | Filtre public `visibleOnline: true` |
| `app/api/search/route.ts` | Idem |
| `app/api/products/[id]/route.ts` | Idem |
| `app/api/orders/route.ts` | Idem |
| `app/api/account/recommendations/route.ts` | Idem |
| `app/boutique/[slug]/page.tsx` | Idem |
| `app/promotions/page.tsx` | Idem |
| `app/sitemap.ts` | Idem |
| `lib/ai/ava-advisor.ts` | Exclusion Puff/JNR/jetables + filtre `visibleOnline` |
| `lib/ai/catalog-search.ts` | Retrait boost « puff » |
| `lib/ai/local-advisor.ts` | Filtre `visibleOnline` |
| `lib/ai/ava-constants.ts` | Label `PROTOYPE TECHNIQUE` |
| `components/ai/ImmersiveAvaScreen.tsx` | Affichage label prototype |
| `components/ai/ava3d/AvaGltfAvatar.tsx` | Commentaire / marquage prototype |

**Preuve prod :** sur `origin/main`, `liquidarom-import` force encore `isActive = true` et `visibleOnline = true` ; `buildProductWhere` filtre seulement `isActive`.

### 3.2 Fichiers non suivis (untracked) — **pas en prod**

| Élément | Commentaire |
|---|---|
| `app/api/admin/catalog/apply-eliquide-safe-fixes/route.ts` | Route admin safe-fixes e-liquides — absente du remote |
| `docs/AUDIT_TOTAL_*.md`, `docs/INTEGRATION_CATALOGUE_AVA_SITE.md` | Docs mission locales |
| `CURSOR_ALLVAPS_MISSION_COMPLETE/` (+ zips) | Lot mission, **ne pas déployer** tel quel |
| `catalogue-allvaps.zip` | Source catalogue partielle |

### 3.3 Code déjà en prod mais **absent du working copy local** (49 commits)

Exemples majeurs sur `origin/main` (≈ +21k / −695 lignes, ~164 fichiers) :

- Module inventaire complet (`lib/inventory/*`, pages `/inventaire`, APIs admin inventaire)
- Auth employés inventaire + seed CI
- Scan caméra / reconnaissance visuelle / hashes
- Dual-stock Hautmont / Le Quesnoy (évolution vs stock général local)
- Google Sheets/Drive helpers
- APK Android inventaire + PWA (`public/sw.js`, manifest)
- Migrations Prisma inventaire
- `vercel.json`, scripts `test-inventaire-*`, `seed-inventory-staff*`
- Docs : `FIX_JWT_SECRET_VERCEL.md`, audits inventaire, déploiement inventaire

**API routes :** local ≈ **47** · remote ≈ **72**

---

## 4. Défauts / risques (par sévérité)

### Critique

1. **Désync Git locale vs prod** — travailler / committer / pusher depuis `b07fe36` sans intégrer `origin/main` risque de casser l’inventaire déjà déployé.
2. **Import Liquidarom en prod force la publication** — `isActive`/`visibleOnline` forcés à `true` sur `origin/main` alors que le CSV indique « Actif en ligne : Non ».
3. **Catalogue public prod sans filtre `visibleOnline`** — tout produit `isActive` peut apparaître (boutique, search, A.V.A., sitemap, etc.).

### Élevé

4. **Correctifs A.V.A. (exclusion jetables) non déployés** — le code local les a ; la prod remote n’a pas ces changements.
5. **JWT_SECRET / login employés** — historique récent sur remote (`FIX_JWT_SECRET_VERCEL`, fix auth 500). À vérifier que la variable est bien présente sur Vercel (doc remote).
6. **7 vulnérabilités npm** (local, `--omit=dev`) : 5 high / 2 moderate (`next`→`postcss`/`sharp`, `exceljs`→`uuid`). Correctifs force = breaking.

### Moyen

7. **Lot catalogue incomplet** — 40/40 prix TTC manquants, 40/40 EAN/SKU manquants, **4 images** absentes (`image-1785228599019.jpg` etc.).
8. **Route `apply-eliquide-safe-fixes` non versionnée** — logique admin hors Git remote.
9. **Build Edge warning** — `crypto` importé via `lib/security.ts` dans le middleware Edge.
10. **Scripts mission absents** de `package.json` : `test:security`, `test:ava`, `test:ava-knowledge`, `test:ava-phase4`.
11. **Modules Vision / Knowledge Phase 3-4** absents du dépôt.
12. **Smoke A.V.A.** appelle `searchCatalog` brut : une requête « puff » retourne encore « Puff Blueberry » (l’exclusion est dans `ava-advisor`, pas dans le smoke).

### Faible / info

13. Pas de `.env` local → `prisma validate` impossible sans `DATABASE_URL`.
14. `next lint` marqué deprecated (Next 16).
15. Encoding Windows sur sorties console (accents) — artefact terminal, pas forcément prod.
16. Zips mission / catalogue à la racine : bruit Git, hors déploiement.

---

## 5. Ce qui va bien

- Health prod OK (app + PostgreSQL).
- Catalogue et recherche live répondent (Liquidarom présent en search).
- Inventaire public HTTPS accessible.
- Sur le working tree local testé : lint OK, `tsc` OK, build OK, 27/27 tests catalogue phase 2.
- Architecture Next.js 15 + Prisma + paiements SumUp/Viva en place.
- Champ `visibleOnline` existe déjà en schéma (local et remote) — le manque est le **filtrage applicatif** et l’**import**.

---

## 6. Modifications recommandées (à faire plus tard — non faites ici)

Ordre conseillé :

1. **Sauvegarder** les 15 fichiers locaux + `apply-eliquide-safe-fixes` (stash/branche) **avant** tout `git pull`.
2. **`git fetch` + rebase/merge `origin/main`** pour récupérer les 49 commits inventaire.
3. **Rejouer / merger** les correctifs catalogue/`visibleOnline`/A.V.A. sur la base à jour (résoudre conflits sur `queries.ts`, `liquidarom-import`, scripts tests).
4. Commit + PR dédiée « catalogue visibility + AVA exclusions » (sans toucher prix/stocks/EAN inventés).
5. Déployer Vercel après revue ; dry-run Liquidarom sur DB réelle.
6. Compléter ou retirer les 4 images manquantes ; ne pas inventer prix/EAN.
7. Planifier `npm audit` (sans `--force` aveugle) + correction Edge `crypto`.
8. Ajouter tests automatisés couvrant exclusion puff via `ava-advisor` (pas seulement `searchCatalog`).
9. Confirmer env Vercel : `JWT_SECRET`, `DATABASE_URL`, paiements live, emails.

---

## 7. Interdictions respectées pendant cet audit

- Aucune modification de code métier appliquée pour « corriger »
- Aucun push / déploiement / migration prod
- Aucune écriture prix / stocks / EAN
- Aucun secret réel lu (pas de `.env` local ; `.env.example` placeholder uniquement)

---

## 8. Livrables associés

- Rapport tests : `docs/RAPPORT_TESTS_2026-08-08.md`
- Audits antérieurs : `docs/AUDIT_TOTAL_AVANT_CORRECTIONS.md`, `docs/AUDIT_TOTAL_APRES_CORRECTIONS.md` (locaux, non sync remote)
- Docs inventaire (remote uniquement) : `docs/DEPLOIEMENT_INVENTAIRE.md`, `docs/FIX_JWT_SECRET_VERCEL.md`, etc.
