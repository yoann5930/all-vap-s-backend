# Rapport — Correction session non conservée (ordinateur + mobile)

**Date :** 2026-08-07  
**Projet :** `D:\all vaps\all-vap-s-backend`  
**Domaines :** `https://inventaire.allvaps.fr`, `https://www.allvaps.fr`  
**Déploiement de cette correction :** **à faire** (preuve login+`/me` avec compte réel requise avant alias prod)

---

## Cause exacte

### Chaîne observée

1. `POST /api/auth/login` **réussit** (identifiants OK → JWT créé, `Set-Cookie` prévu).
2. Le frontend appelle immédiatement `GET /api/auth/me` (handshake).
3. Sur le code **Git `HEAD` / `origin/main`**, `/api/auth/me` sélectionnait encore le champ Prisma **`twoFactorEnabled`**, **absent** de `prisma/schema.prisma` et de la base.
4. Prisma lève une erreur → **HTTP 500** (ou échec de lecture session).
5. `confirmSession()` échoue → le frontend affiche le message rouge  
   « Connexion acceptée mais session non conservée… réinstallez la PWA ».

Ce message est **trompeur** : la PWA n’est pas la cause. Le serveur **ne relisait pas** la session.

### Preuve Git vs production

| Source | `/api/auth/me` |
|--------|----------------|
| `git show HEAD:app/api/auth/me/route.ts` | Contient encore `twoFactorEnabled: true` |
| Working tree (cette mission) | Champ retiré ; réponse `{ authenticated, user }` ; `Cache-Control: no-store, private` |
| Production live (sonde) | `401` + `Cache-Control: no-store` + `{"user":null}` sans auth → **version partielle déjà déployée hors Git** (CLI dirty), **pas** le `HEAD` Git |

Risque majeur : un prochain deploy depuis Git **réintroduit** le bug `twoFactorEnabled` si le correctif n’est pas commité.

### Facteurs aggravants (pas causes racines)

| Facteur | Détail |
|---------|--------|
| Message UI | Blâmait la PWA sans preuve ; traité tout échec `/me` comme « cookie appareil » |
| Handshake | Dépendait du storage avant de renvoyer le Bearer du login |
| SW | Anciennes versions pouvaient intercepter l’API (corrigé v7/v8 : **pas** de `respondWith` sur `/api/*`) |
| Admin login | N’envoyait pas `credentials: "include"` ni Bearer de secours |

Ce n’est **pas** uniquement Android / PWA (bug aussi ordinateur) — cohérent avec un 500/échec serveur sur `/me`.

---

## Routes

| Rôle | Route |
|------|-------|
| Login | `POST /api/auth/login` |
| Session | `GET /api/auth/me` |
| Refresh | `POST /api/auth/refresh` |
| Logout | `POST /api/auth/logout` |

NextAuth : **non utilisé**.

---

## Cookie (source de vérité)

| Attribut | Valeur |
|----------|--------|
| Nom access | `allvaps_token` |
| Nom refresh | `allvaps_refresh` |
| Domain | host-only (pas de `Domain=.allvaps.fr`) — correct pour `inventaire.allvaps.fr` |
| Path | `/` |
| SameSite | `Lax` |
| Secure | `true` si `x-forwarded-proto=https` |
| HttpOnly | `true` |
| Max-Age access | `7200` (2h) — aligné JWT `exp` |
| Max-Age refresh | 7 jours |
| Pose | **uniquement** via `NextResponse.cookies.set` sur la réponse login retournée |

Secours client : Bearer `allvaps_bearer` (localStorage + sessionStorage + IndexedDB).

---

## JWT

| Point | Valeur |
|-------|--------|
| Algo | HS256 (`jose`) |
| Claims | `userId`, `email`, `role`, `iat`, `exp` |
| Secret création | `JWT_SECRET` |
| Secret vérif | **même** `JWT_SECRET` (`lib/jwt.ts` + middleware maintenance) |
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | Absents — non utilisés |
| Durée | `2h` (secondes jose, cohérent cookie) |

### Variables d’environnement (sans valeurs)

| Variable | Local (.env) | Vercel Production | Identique création/vérif |
|----------|--------------|-------------------|---------------------------|
| `JWT_SECRET` | présente (historique court possible) | présente (sensitive) | oui (même var) |
| `NEXT_PUBLIC_APP_URL` | souvent `http://localhost:3000` | `https://www.allvaps.fr` | n/a cookies host-only |
| `ALLOWED_ORIGINS` | optionnel | présente | CSRF |
| `AUTH_SECRET` | absente | absente | n/a |
| Redeploy après changement secret | **oui** | **oui** | — |

---

## Fichiers corrigés (cette mission)

| Fichier | Correction |
|---------|------------|
| `app/api/auth/me/route.ts` | Suppression définitive `twoFactorEnabled` ; `{ authenticated, user }` ; 401/200 + `no-store, private` ; fallback select ; code `SESSION_SCHEMA_MISMATCH` |
| `lib/jwt.ts` | `getAuthUser` : fallback claims JWT si select DB échoue |
| `lib/auth-client.ts` | `confirmSession(explicitToken)` ; `credentials: "include"` ; Bearer immédiat |
| `components/auth/AuthForm.tsx` | Handshake avec token login ; messages sans « réinstallez la PWA » |
| `app/admin/login/page.tsx` | `credentials: "include"` + handshake session |
| `app/api/auth/login/route.ts` | `Cache-Control: no-store, private` |
| `public/sw.js` | v8 (API jamais interceptée) |
| `components/inventory/InventoryServiceWorker.tsx` | cache cible v8 |
| `scripts/probe-session-persistence.ts` | probe cookie jar (via `AUTH_TEST_*`) |

---

## Preuves techniques (partielles — sans mot de passe de test fourni)

### POST login (mauvais MDP) — inventaire.allvaps.fr

```text
HTTP/1.1 401 Unauthorized
{"error":"Email ou mot de passe incorrect"}
```

→ Route login vivante ; plus de 503 `JWT_SECRET` manquant.

### GET /api/auth/me (sans cookie)

```text
HTTP/1.1 401 Unauthorized
Cache-Control: no-store
{"user":null}
```

→ Version corrigée partielle déjà en prod (hors Git).  
→ Après deploy de cette mission : attendre aussi `"authenticated":false`.

### Preuve session relue avec compte réel

**Non rejouée ici** : aucun `AUTH_TEST_PASSWORD` / `SEED_ADMIN_PASSWORD` disponible dans l’environnement agent.

Commande à lancer après deploy (variables hors Git) :

```bash
set AUTH_TEST_EMAIL=...
set AUTH_TEST_PASSWORD=...
npx tsx scripts/probe-session-persistence.ts
```

Attendu :

```text
LOGIN_STATUS 200
SET_COOKIE_NAMES allvaps_token,allvaps_refresh
ME_COOKIE_STATUS 200 USER true
ME_BEARER_STATUS 200 USER true
```

---

## Domaines

| Domaine | Rôle |
|---------|------|
| `inventaire.allvaps.fr` | App inventaire (même projet Vercel) |
| `www.allvaps.fr` / `allvaps.fr` | Site |
| Cookies | host-only — login et `/me` **doivent** être sur **la même origine** |

Pas de cookie `Domain=.allvaps.fr` (évite latéralisation inutile).

---

## Tests

| # | Test | Statut |
|---|------|--------|
| 1–2 | ADMIN / EMPLOYEE ordinateur | **à valider** après deploy + comptes |
| 3–4 | Android Chrome / PWA | **à valider** terrain |
| 5–6 | Refresh / fermeture navigateur | prévu OK (cookie 2h + refresh 7j + Bearer) |
| 7–10 | Dashboard / Produits / Inventaire / API | après session OK |
| 11–12 | Logout / reconnect | code OK |
| 17–18 | Fenêtre privée / SW off | SW non requis ; API NetworkOnly |
| 19–20 | Vercel direct / inventaire.allvaps.fr | même projet |
| Données métier | **0** modification |

---

## Interdictions respectées

- Auth / middleware **non** désactivés  
- Pages privées **non** rendues publiques  
- Secrets **non** affichés  
- Pas de consigne « réinstallez la PWA » comme correction  
- Pas de modification prix / stocks / produits / EAN / SumUp  
- Pas de deploy final sans preuve login+`/me` compte réel (restante)

---

## Action immédiate requise

1. **Committer** les fichiers auth listés (sinon Git réintroduit `twoFactorEnabled`).  
2. **Déployer** production Vercel depuis ce commit.  
3. Lancer `scripts/probe-session-persistence.ts` avec `AUTH_TEST_*`.  
4. Valider ordinateur puis Android/PWA : login → inventaire/admin → F5 → session conservée.

---

## Verdict

⚠️ CAUSE IDENTIFIÉE — CORRECTION À DÉPLOYER OU TEST MOBILE RESTANT
