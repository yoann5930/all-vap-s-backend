# Rapport — Correction boucle connexion mobile Inventaire

**Date :** 2026-08-06 / 2026-08-07  
**Projet :** `D:\all vaps\all-vap-s-backend`  
**Domaine :** `https://inventaire.allvaps.fr`

---

## Cause exacte

Après un login **réussi**, la session n’était **pas garantie** côté navigateur mobile/PWA :

1. Cookie `allvaps_token` parfois posé via `cookies()` (next/headers) **sans** apparaître de façon fiable dans les `Set-Cookie` de la réponse HTTP.  
2. Cookie `allvaps_refresh` **jamais** re-posé sur `NextResponse`.  
3. Secours Bearer uniquement en `sessionStorage` (fragile après redirect / PWA Android).  
4. Guard inventaire appelait `/api/auth/me` → `{ user: null }` (HTTP 200) → `router.replace('/login?next=/inventaire')` → ressenti « retour connexion ».  
5. Facteur aggravant : `lib/security-origins.ts` (middleware) **n’incluait pas** `inventaire.allvaps.fr` par défaut.

Ce n’est **pas** un mauvais mot de passe.

---

## Domaine concerné

| Point | Valeur |
|-------|--------|
| Login / inventaire | `inventaire.allvaps.fr` |
| Cookie | host-only (pas de `Domain=.allvaps.fr`) — correct |
| API | même origine |

---

## Cookie avant / après

| | Avant | Après |
|--|-------|-------|
| Access `allvaps_token` | `cookies()` ± Response | **uniquement** `NextResponse.cookies` |
| Refresh `allvaps_refresh` | `cookies()` seulement | **`NextResponse.cookies`** |
| httpOnly | true | true |
| secure | HTTPS via `x-forwarded-proto` | inchangé |
| sameSite | lax | lax |
| path | `/` | `/` |
| maxAge access | 2h | 2h |
| Bearer secours | sessionStorage | **localStorage + sessionStorage** |

---

## Middleware / redirection fautive

| Élément | Détail |
|---------|--------|
| Middleware CSRF | `security-origins` sans inventaire → corrigé (+ match host) |
| Redirection fautive | `EmployeeInventoryApp` → `/login?next=/inventaire` si `user:null` **sans** retry refresh ni handshake |
| Alias `/inventaire/connexion` | `redirect('/login?next=/inventaire')` — inchangé (hors cause) |

---

## Fichiers modifiés

- `docs/AUDIT_BOUCLE_CONNEXION_MOBILE_INVENTAIRE.md` (nouveau)
- `docs/RAPPORT_CORRECTION_BOUCLE_CONNEXION_MOBILE.md` (ce fichier)
- `lib/security-origins.ts`
- `middleware.ts`
- `lib/jwt.ts`
- `lib/auth.ts`
- `lib/auth-client.ts`
- `app/api/auth/login/route.ts`
- `app/api/auth/refresh/route.ts`
- `app/api/auth/logout/route.ts`
- `components/auth/AuthForm.tsx`
- `components/auth/LoginReasonBanner.tsx` (nouveau)
- `app/login/page.tsx`
- `components/inventory/EmployeeInventoryApp.tsx`
- `components/inventory/InventoryServiceWorker.tsx`
- `public/sw.js` (v6)
- `scripts/test-auth-session-duration.ts` (nouveau)

---

## Tests

| Test | Résultat |
|------|----------|
| Origin inventaire autorisée (`security-origins`) | OK |
| Durée JWT ≈ cookie 2h (`test-auth-session-duration`) | OK |
| Build Next (auth) | à valider au deploy |
| Android Chrome réel | **à valider par Yoann / équipe** |
| PWA installée | **à valider** (SW v6 + clear cache) |
| Rafraîchissement après login | prévu OK (cookie + Bearer localStorage) |
| Rôles EMPLOYEE / ADMIN | conservés ; rôle autre → message clair `reason=role` |
| Déconnexion | cookies vidé sur Response + clear Bearer |
| Données métier / prix / stocks / produits | **0** modification |

---

## Checklist mission

| Indicateur | Valeur |
|------------|--------|
| Session conservée | oui (code) — validation mobile réelle restante |
| Retour vers connexion après succès | non (si handshake `/me` OK) |
| Données métier modifiées | 0 |
| Prix modifiés | 0 |
| Stocks modifiés | 0 |
| Produits modifiés | 0 |

---

## Verdict

⚠️ CONNEXION CORRIGÉE — VALIDATION MOBILE RÉELLE RESTANTE
