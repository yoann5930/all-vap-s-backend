# Rapport final — Comptes inventaire All Vap's

Date : 2026-08-04

## Rôles

| Personne | Email | Rôle |
|---|---|---|
| Lilie Froment | lilie.froment@allvaps.fr | EMPLOYEE |
| Kelli Fasolla | kelli.fasolla@allvaps.fr | EMPLOYEE |
| Aurélien Daillez | aurelien.daillez@allvaps.fr | EMPLOYEE |
| Yoann | yoann@allvaps.fr | ADMIN |

Les mots de passe temporaires sont **uniquement** dans le fichier local non versionné remis à Yoann (hors GitHub / hors ce rapport).

## Droits

### EMPLOYEE
- Connexion sécurisée (bcrypt, session JWT 2h + refresh)
- Inventaire `/inventaire` (boutiques autorisées)
- Scan, quantités, photos, hors-ligne PWA
- Consultation de leurs opérations (sessions liées à leur userId)
- **Interdit** : `/admin`, APIs admin (403), gestion utilisateurs, paramètres sensibles

### ADMIN (Yoann)
- Tous les droits employés + `/admin`
- CRUD utilisateurs, reset MDP, activation/désactivation
- Attribution boutiques & rôles
- Journal d’audit `/api/admin/audit`
- Export / paramètres / deux boutiques

## Sécurité

- Mots de passe hashés bcrypt (cost 12), jamais en clair en base ni dans Git
- MDP temporaire distinct par compte + `mustChangePassword=true`
- Compte `active=false` → connexion refusée
- Routes inventaire & admin vérifiées côté serveur
- AuditLog : user, rôle, boutique, action, produit, anciennes/nouvelles quantités, session, IP/UA
- Identifiants hors Git : `.local/` (gitignore)

## Tests réalisés

| Test | Résultat |
|---|---|
| Lilie login + 403 API admin | OK |
| Kelli inventaire bloqué tant que MDP non changé | OK |
| Changement MDP forcé | OK |
| Kelli inventaire Le Quesnoy après MDP | OK |
| Kelli ne peut pas créer d’utilisateur (403) | OK |
| Aurélien scan + quantité | OK |
| Yoann audit + liste users | OK |
| Compte désactivé refuse login | OK |
| Inventaire anonyme 401 | OK |
| Playwright HTTPS : login → inventaire → scan → admin bloqué | OK |
| TypeScript (`tsc --noEmit`) | OK |
| ESLint | OK |
| Build production | OK |

## URL publique actuelle

- Employés : https://conviction-evanescence-acknowledged-select.trycloudflare.com/inventaire
- Admin : https://conviction-evanescence-acknowledged-select.trycloudflare.com/admin

(Tunnel temporaire — Vercel permanent via `docs/DEPLOIEMENT_INVENTAIRE.md`)

## Migration Prisma

Fichier : `prisma/migrations/20260804160000_inventory_staff_users/`

En production Postgres : `npx prisma migrate deploy` puis `npx tsx scripts/seed-inventory-staff.ts`

## Fichier identifiants (Yoann uniquement)

Chemin agent (non Git) : `/opt/cursor/artifacts/YOANN-UNIQUEMENT-identifiants-temporaires-inventaire.txt`  
Aussi : `.local/inventory-user-credentials.txt`
