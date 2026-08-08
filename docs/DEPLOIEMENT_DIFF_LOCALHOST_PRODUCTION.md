# Diff localhost (référence) vs production allvaps.fr

**Date :** 2026-08-06  
**Localhost commit :** `d5a64904ce789119745f885d72e3ff07a7498843`  
**Production commit :** `d5a64904ce789119745f885d72e3ff07a7498843`  
**Résultat Git code :** **aucune différence de code** (`git diff` vide entre HEAD et le SHA Production)

---

## Synthèse

| Domaine | Écart | Classification |
|---|---|---|
| Code application (UI, APIs, inventaire, A.V.A.) | Aucun | — déjà aligné |
| Données catalogue | Local DEMO ≠ Prod PostgreSQL | **MUST_NOT_DEPLOY** (ne pas synchroniser la démo) |
| `DEMO_MODE` | local `true` / prod `false` (health) | **REQUIRES_ENV** (prod déjà correct) |
| Lien Facebook (PR #4) | non présent sur `main`/localhost courant | **REQUIRES_MANUAL_VALIDATION** (hors process localhost) |
| Admin codes employés (PR #5/#6) | non présent sur localhost courant | **REQUIRES_MANUAL_VALIDATION** |
| Inventaire admin full fields (PR #3) | base conflictuelle, hors `main` | **BLOCKING** tant que non rebasé / validé |
| Migrations Prisma nouvelles vs prod tip | aucune migration absente du tip `main` | — |
| Seed / reset DB | — | **MUST_NOT_DEPLOY** |
| Assets hero / logos | tailles HTTP identiques | SAFE (déjà en prod) |

---

## Fichiers ajoutés / modifiés / supprimés (code)

```text
Aucune (commit local de référence = commit production).
```

### Branches non incluses dans le localhost courant

| Branche | Fichiers | Classification |
|---|---|---|
| `cursor/facebook-link-e2e4` | `lib/navigation.ts`, `lib/seo/schema.ts` | REQUIRES_MANUAL_VALIDATION |
| `cursor/admin-reset-code-e2e4` | admin users + hashes staff | REQUIRES_MANUAL_VALIDATION |
| `cursor/inventaire-admin-full-fields-1655` | admin inventaire + AGENTS.md | BLOCKING (PR conflictuelle) |

---

## Catalogue — écarts données (lecture seule)

| Métrique | Localhost (DEMO) | Production |
|---|---|---|
| Produits | 33 | 40 |
| Marques | multi (seed) | Liquidarom uniquement |
| Prix > 0 | 33 | 0 (affichage « en boutique ») |
| Stock > 0 | 33 | 0 |
| Images produit | 33 (Unsplash seed) | 0 |
| Fingerprint id:prix:stock | `e4a896…` | `d56394…` |

**Classification :** `MUST_NOT_DEPLOY` — ne jamais importer le seed DEMO en production.

---

## Variables d’environnement

Comparaison **noms uniquement** (aucune valeur secrète affichée).

| Variable | Local `.env` | `.env.example` | Prod (inféré / requis) | Action |
|---|---|---|---|---|
| `DATABASE_URL` | présente | présente | présente (`mode:database`) | OK |
| `DEMO_MODE` | `true` | `false` | doit rester `false` | ne pas aligner local→prod |
| `JWT_SECRET` | présente | présente | requise | OK |
| `NEXT_PUBLIC_APP_URL` | localhost | localhost | `https://www.allvaps.fr` | OK prod |
| `SUMUP_*` | présentes (noms) | présentes | requises inventaire/paiements | ne pas logger |
| `VIVA_*` | présentes | présentes | selon paiement | ne pas logger |
| `OPENAI_API_KEY` | présente | présente | optionnelle A.V.A. | — |
| `OPENAI_VISION_MODEL` | absente local | présente example | optionnelle inventaire OCR | REQUIRES_ENV si OCR cloud |
| `BLOB_READ_WRITE_TOKEN` | absente local | example | optionnelle photos inventaire serverless | REQUIRES_ENV si besoin |
| `PAYMENT_TEST_MODE` | présente | `true` example | prod réelle → `false` | vérifier manuellement |
| `AVA_KNOWLEDGE_ENABLED` | absente | absente | non utilisée dans le code actuel | N/A |

---

## Migrations Prisma

Migrations présentes dans le dépôt (déjà sur `main` / tip prod) :

- `20260725000000_init`
- `20260725000100_perf_indexes`
- `20260725020000_email_confirm_profile`
- `20260725200000_catalog_sumup_phase2`
- `20260804140000_dual_store_inventory`
- `20260804160000_inventory_staff_users`
- `20260804180000_inventory_admin_tracking`

**Aucune migration nouvelle à déployer** pour aligner localhost référence → production.

Interdit : `prisma migrate reset`, `db push` destructif, seed prod.

---

## Cause réelle du « mauvais déploiement » (diagnostic)

1. **Code UI production = code localhost** (même SHA `d5a6490`).
2. L’écart perçu vient surtout du **catalogue DEMO local** (produits seed riches) vs **catalogue DB production** (Liquidarom, prix/images souvent vides).
3. Ancien dépôt GitHub `all-vap-s` est un stub obsolète — **non relié** au domaine.
4. Render n’héberge plus le site.

**Conclusion déploiement code :** rien à republier pour « corriger l’interface » — elle est déjà la bonne.  
**Interdit :** écraser la DB prod avec les données localhost.
