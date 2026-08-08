# Diagnostic — mauvais déploiement allvaps.fr

**Date :** 2026-08-06  
**Environnement d’audit :** Cursor Cloud (`/workspace`) — PC Windows `D:\all vaps\` et `C:\Users\ASUS\Documents\GitHub\` **non accessibles** depuis cet agent.

---

## 1. Déploiement actuellement visible

| Domaine | Résultat |
|---|---|
| `https://allvaps.fr` | HTTP **308** → `https://www.allvaps.fr/` |
| `https://www.allvaps.fr` | HTTP **200**, `server: Vercel` |
| `https://inventaire.allvaps.fr` | HTTP **200**, même projet Vercel, rewrite `/` → `/inventaire` |

| Champ | Valeur prouvée |
|---|---|
| Plateforme | **Vercel** projet `yoann3/all-vap-s-backend` (région `cdg1`) |
| Dépôt Git connecté | `https://github.com/yoann5930/all-vap-s-backend` |
| Branche production | **`main`** |
| Commit Production | **`d5a64904ce789119745f885d72e3ff07a7498843`** |
| Déploiement GitHub | id `5778338241` (2026-08-06T11:15:12Z) |
| Root Directory | racine du dépôt (pas de monorepo) |
| Build command | `prisma generate && next build` (`vercel.json`) |
| Output | Next.js default (Vercel) |
| Render | `all-vaps.onrender.com` → **404** — **non utilisé** pour le front |

`www` et apex pointent vers le **même** projet Vercel (apex redirige).

---

## 2. Projets / dossiers inventoriés (accessibles)

| Chemin | Remote | Branche | Commit | Verdict |
|---|---|---|---|---|
| `/workspace` | `yoann5930/all-vap-s-backend` | `cursor/recovery-deploy-correct-20260806-e2e4` (base `main`) | `d5a6490` | Seul projet complet accessible |
| `/tmp/all-vap-s-old` | clone `yoann5930/all-vap-s` | `main` | `56c33d4` | Stub obsolète (fichiers vides) — **ne pas déployer** |
| `D:\all vaps\` | — | `preprod/validation-all-vaps-2026-08-04` (déclarée) | ? | **INACCESSIBLE** dans ce cloud |
| `C:\Users\ASUS\Documents\GitHub\` | — | ? | ? | **INACCESSIBLE** |

### Branche demandée

```text
preprod/validation-all-vaps-2026-08-04
```

- Absente de `origin` sur `all-vap-s-backend` (API GitHub 404)
- Absente de `all-vap-s` (API GitHub 404)
- Absente des refs locales / worktrees

**Sans cette branche poussée sur GitHub, aucun déploiement Vercel ne peut la servir.**

---

## 3. Localhost actuel

| Clé | Valeur |
|---|---|
| URL | `http://localhost:3000` |
| Path | `/workspace` |
| Commande | `npm run dev` (superviseur keepalive) |
| Commit code | `d5a6490` (= production) |
| Mode | `DEMO_MODE` → health `mode:demo` |
| Différence vs prod | **données catalogue** (seed) ≠ DB prod — **pas le shell UI** |

---

## 4. Matrice fonctionnalités (A prod / B localhost / C code)

| Fonctionnalité | Prod | Localhost | Code `/workspace` | Statut |
|---|---|---|---|---|
| Accueil premium Ice Cool | Oui | Oui | Oui | Aligné |
| Boutique / catalogue | Oui | Oui | Oui | Aligné (données ≠) |
| Recherche / filtres | Oui | Oui | Oui | Aligné |
| Panier / compte `/account` | Oui | Oui | Oui | Aligné |
| A.V.A. `/ia` + FAB | Oui | Oui | Oui | Aligné (partiel vs checklist) |
| Inventaire | Oui | Oui | Oui | Aligné — **protéger** |
| Route `/sav` | 404 | 404 | **ABSENT** | Manquante |
| Routes `/fabricants` `/marques` `/gammes` | 404 | 404 | **ABSENT** | Manquantes |
| Barrière +18 (AgeGate) | Non | Non | **ABSENT** | Manquante |
| Banner consentement RGPD cookies | Non trouvé | Non | Partiel (pages légales seulement) | Incomplet |
| Exclusion JNR | — | — | **ABSENT** | Manquante |
| Exclusion Puff/jetables | Partiel | Partiel | Partiel (`ava-advisor`) | Partiel |
| `AVA_FINAL.glb` | Non | Non | **ABSENT** (seul `ava-test-model.glb`) | Manquant |
| Portrait holographique fallback | Oui | Oui | Oui | Présent |
| Offre 10 ml dédiée | Non prouvée | Seed/tests | Mentions scripts/seed | Non produitisé |

---

## 5. Cause exacte

### Cause principale

**La version « validée » citée (`preprod/validation-all-vaps-2026-08-04` sous `D:\all vaps\`) n’est pas présente dans le dépôt GitHub relié à Vercel.**  
Production déploie correctement `main` @ `d5a6490` de `all-vap-s-backend`. Ce n’est pas un mauvais projet Vercel / mauvais domaine : c’est l’**absence sur le remote** du code Windows déclaré comme référence.

### Causes secondaires

1. Confusion localhost DEMO (catalogue seed riche) vs prod DB (Liquidarom, prix/images souvent vides) → impression de « mauvaise version ».
2. Fonctionnalités listées (SAV, fabricants/gammes, AgeGate, AVA_FINAL.glb, JNR…) **absentes** du code cloud/GitHub actuel — donc absentes de prod.
3. Ancien dépôt `all-vap-s` existe mais est un stub — risque de confusion de nom.
4. Render non connecté (404) — hors chaîne réelle.

**Ce n’est PAS :** mauvais Root Directory Vercel, Preview au lieu de Production, ou domaines splités www/apex.

---

## 6. Décision déploiement

**BLOCAGE** — aucun push Production tant que :

1. la branche `preprod/validation-all-vaps-2026-08-04` (ou équivalent complet) est **poussée** sur `yoann5930/all-vap-s-backend`, **ou**
2. le Workspace Cursor est ouvert sur le dossier Windows contenant cette version.

Déployer `main` actuel ne « corrigerait » pas l’écart : c’est déjà ce qui est en ligne.
