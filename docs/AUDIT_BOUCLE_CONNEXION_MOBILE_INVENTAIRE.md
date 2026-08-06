# Audit — Boucle de connexion mobile Inventaire

**Date :** 2026-08-06  
**Projet :** `D:\all vaps\all-vap-s-backend`  
**Domaine :** `https://inventaire.allvaps.fr`  
**Symptôme :** mot de passe accepté → « Chargement… » → flash inventaire / session → retour `/connexion` → `/login?next=/inventaire`

---

## Chronologie exacte (parcours observé)

| # | Étape | URL / API | Observation |
|---|--------|-----------|-------------|
| 1 | Ouverture | `/inventaire/connexion` | `redirect` serveur → `/login?next=/inventaire` |
| 2 | Saisie + submit | `POST /api/auth/login` | Bouton « Chargement... » (`Button.loading`) |
| 3 | Succès login | JSON `{ user, token }` | Identifiants OK (pas d’erreur affichée) |
| 4 | Stockage secours | `sessionStorage.allvaps_bearer` | Posé si `data.token` présent |
| 5 | Cookie | `Set-Cookie: allvaps_token=…` | Posé via `cookies()` **et** `NextResponse.cookies` (double chemin fragile) |
| 6 | Refresh cookie | `allvaps_refresh` | Posé **uniquement** via `cookies()` (peut ne pas apparaître dans la réponse HTTP réelle) |
| 7 | Redirection | `window.location.assign('/inventaire')` | Navigation pleine page |
| 8 | Guard inventaire | `GET /api/auth/me` via `authFetch` | Si cookie absent **et** Bearer perdu → `{ user: null }` **HTTP 200** |
| 9 | Bounce | `router.replace('/login?next=/inventaire')` | Interprété comme « session absente » |
| 10 | Alias | `/inventaire/connexion` | Renvoie encore vers login → **boucle ressentie** |

---

## Preuves techniques (avant correctif)

### Domaines

| Élément | Valeur |
|---------|--------|
| Page login | `inventaire.allvaps.fr` |
| API | même origine `/api/auth/*` |
| Cookie host-only | pas de `Domain=` → lié à `inventaire.allvaps.fr` (correct si on reste sur ce host) |
| `NEXT_PUBLIC_APP_URL` (prod) | `https://www.allvaps.fr` (≠ inventaire) |

### CSRF / Origin

| Module | `inventaire.allvaps.fr` autorisé ? |
|--------|-------------------------------------|
| `lib/security.ts` (routes login) | **oui** (défaut) |
| `lib/security-origins.ts` (**middleware**) | **non** en local sans `ALLOWED_ORIGINS` |

Probe prod (mauvais MDP, Origin inventaire) : `401` (passe le middleware grâce à `ALLOWED_ORIGINS` Vercel) — landmine si env absente.

### Cookie attendu vs réel

| Attribut | Attendu prod | Code login route | Code `setAuthCookie` |
|----------|--------------|------------------|----------------------|
| httpOnly | true | true | true |
| secure | true (HTTPS) | via `x-forwarded-proto` | idem |
| sameSite | lax | lax | lax |
| path | / | / | / |
| maxAge access | 2h | 7200 | 7200 |
| refresh sur Response | oui | **non** | cookies() seulement |

### Guard frontend

`EmployeeInventoryApp` :

- `authFetch('/api/auth/me')`
- si `!user` ou rôle hors EMPLOYEE/ADMIN → `clearAccessToken()` + `replace('/login?next=/inventaire')`
- **pas** d’état `loading` côté provider partagé ; **pas** de retry `/api/auth/refresh`
- `/api/auth/me` renvoie **200 + `{user:null}`** (pas 401) → indiscernable d’un succès vide

### PWA / SW

- `public/sw.js` v5 : ne cache pas `/api/*` ni `/login` (OK)
- Bearer en **sessionStorage** : fragile en PWA Android / restauration d’onglet
- Manifest `start_url: /inventaire` scope `/`

---

## Cause racine (hypothèse validée par code)

1. **Session côté navigateur non garantie après login** : le cookie access est parfois bien dans la Response, mais le refresh ne l’est pas ; le secours Bearer est en `sessionStorage` seulement.  
2. **Sur mobile/PWA**, après `location.assign`, le guard inventaire appelle `/me` sans cookie effectif ni Bearer → `{user:null}` → redirection login.  
3. **Facteurs aggravants** : double écriture cookie (`cookies()` + Response), `security-origins` sans inventaire par défaut, absence de handshake « confirmer `/me` avant redirect », pas de retry refresh.

**Ce n’est pas** un mauvais mot de passe.  
**Ce n’est pas** une donnée métier / SumUp.

---

## Correctifs prévus (sans masquer le bug)

1. Poser **access + refresh** uniquement sur `NextResponse` du login.  
2. Bearer de secours en **localStorage** (+ lecture sessionStorage legacy).  
3. Handshake post-login : `authFetch('/api/auth/me')` OK avant redirection unique.  
4. Guard inventaire : états loading / authenticated / unauthenticated ; retry refresh ; message rôle refusé.  
5. Aligner `security-origins` sur inventaire + host match.  
6. SW v6 + exclusions `/connexion`.  
7. Tests durée JWT / cookie.
