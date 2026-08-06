# Identification de la version locale de référence — All Vap's

**Date :** 2026-08-06  
**Environnement d’audit :** Cursor Cloud (`/workspace`) — équivalent du dépôt officiel  
**Chemin Windows demandé :** `D:\all vaps\` — **non accessible** dans cet environnement Linux cloud

---

## Chaîne de production prouvée

```text
PROJET LOCAL VALIDÉ
  /workspace  (= yoann5930/all-vap-s-backend)
→ DÉPÔT GIT DE PRODUCTION
  https://github.com/yoann5930/all-vap-s-backend
→ BRANCHE DE PRODUCTION
  main
→ PLATEFORME DE DÉPLOIEMENT
  Vercel projet yoann3/all-vap-s-backend (région cdg1)
→ DOMAINE ALLVAPS.FR
  allvaps.fr → 308 → www.allvaps.fr
  inventaire.allvaps.fr (même projet, rewrite / → /inventaire)
```

---

## Inventaire des projets trouvés

| Chemin | Dépôt distant | Branche | Dernier commit | Framework | Verdict |
|---|---|---|---|---|---|
| `/workspace` | `yoann5930/all-vap-s-backend` | `cursor/deploiement-identification-e2e4` (base `d5a6490` = `main`) | `d5a6490` 2026-08-06 | Next.js 15 + Prisma 6 | **VERSION DE RÉFÉRENCE** |
| GitHub `yoann5930/all-vap-s` | clone `/tmp/all-vap-s-old` | `main` | `56c33d4` 2026-07-01 | stub / fichiers vides | **OBSOLÈTE — NE PAS DÉPLOYER** |
| `ALLVAPS_PORTABLE/` | (mention docs historiques) | — | — | — | Absent ici — **ne pas utiliser** |
| Worktrees Git | 1 seul (`/workspace`) | — | — | — | — |

Aucun autre `package.json` applicatif All Vap’s trouvé hors `/workspace` (hors caches npm / Cursor).

### Détail `/workspace` (référence)

| Champ | Valeur |
|---|---|
| Routes `page.tsx` | 53 |
| Routes API `route.ts` | 72 |
| Prisma | Oui (`prisma/schema.prisma` + 7 migrations) |
| Catalogue | Oui (`/boutique`, `/api/products`, Liquidarom) |
| A.V.A. | Oui (`components/ai/*`, `lib/ai/*`, `/ia`, FAB) |
| Inventaire | Oui (`/inventaire`, APIs, admin, PWA/APK) |
| Dernière modification Git | 2026-08-06 (`d5a6490`) |

---

## Localhost actuellement affiché

| Clé | Valeur |
|---|---|
| `LOCALHOST_PROJECT_PATH` | `/workspace` |
| `LOCALHOST_BRANCH` | worktree sur tip `d5a6490` (égal `origin/main`) ; process démarré depuis `/workspace` |
| `LOCALHOST_COMMIT` | `d5a64904ce789119745f885d72e3ff07a7498843` |
| `LOCALHOST_PORT` | `3000` |
| `LOCALHOST_COMMAND` | `DEMO_MODE=true npm run dev` → `next dev --port 3000` |
| PID | `220238` (`next-server v15.5.22`), cwd `/workspace` |
| Node | `v22.14.0` |
| Mode | **développement** + **DEMO_MODE=true** (données seed, pas PostgreSQL prod) |
| URL testée | `http://127.0.0.1:3000/` |
| Health | `{"ok":true,"mode":"demo"}` |

---

## Production actuellement déployée

| Champ | Valeur |
|---|---|
| Domaines | `https://allvaps.fr` → `https://www.allvaps.fr` ; `https://inventaire.allvaps.fr` |
| Plateforme | Vercel (`server: Vercel`, DNS `*.vercel-dns-017.com`) |
| Projet | `yoann3/all-vap-s-backend` |
| Branche production | `main` (déploiements GitHub `environment: Production` sur SHA `main`) |
| Commit déployé | **`d5a6490`** (identique au localhost code) |
| Build | `prisma generate && next build` (`vercel.json`) |
| Root directory | dépôt racine (pas de monorepo / sous-dossier) |
| Health | `{"ok":true,"mode":"database"}` |
| Render | `all-vaps.onrender.com` → 404 — **non utilisé** |

---

## Comparaison visuelle obligatoire

Captures Playwright (`/opt/cursor/artifacts/screenshots/`) :

- `local-home.png` vs `prod-home.png` : **même shell UI** (header, hero Ice Cool, gammes Liquidarom, A.V.A.)
- H1 identique : « Découvrez nos saveurs premium en boutique »
- Différence principale : **données catalogue** (local démo 33 produits multi-marques vs prod 40 Liquidarom en base)

---

## Choix de la version de référence

**Version retenue :** `/workspace` @ `d5a6490` (= `origin/main` déjà en production).

Raisons :

1. Seul projet complet avec inventaire + boutique + A.V.A. + Prisma.
2. Commit Git **identique** au dernier déploiement Production Vercel.
3. Ancien dépôt `all-vap-s` = stub obsolète.
4. Les branches feature (`admin-reset-code`, `facebook-link`, …) ne sont **pas** celles servies par le localhost PID 220238.

**Ne pas déployer** le catalogue DEMO local vers la production (écrasement prix/stocks/produits interdit).
