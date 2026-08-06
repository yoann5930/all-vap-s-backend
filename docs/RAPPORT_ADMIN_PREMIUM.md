# Rapport — Espace administrateur premium All Vap's

Date : 2026-07-30

## Architecture retenue

- Application admin isolée du site public via `SiteShell` (pas de Header/Footer/A.V.A. sur `/admin/*`)
- Shell sombre dédié : `AdminAuthBoundary` → `AdminShell` → `AdminSidebar` + `AdminTopbar`
- Connexion séparée : `/admin/login` (hors shell authentifié)
- Données : PostgreSQL / Prisma existants — **aucune donnée fictive affichée comme réelle**
- Sécurité API : `requireStaff()` / `requireAuth("ADMIN")` + rôles étendus

## Choix visuels

- Fond graphite `#07090d`
- Surfaces `#0e131a` / `#141b24`
- Texte blanc cassé `#f2f4f7`, muted `#8b95a5`
- Accent bleu électrique `#2f7cff`
- Or discret `#c4a574` (fond gradient)
- Vert / orange / rouge pour états
- CSS : `app/admin/admin-theme.css` (`.admin-app`, cartes, tableaux, badges, boutons)

## Pages créées / refondues

| Route | Rôle |
|-------|------|
| `/admin/login` | Connexion staff dédiée |
| `/admin` | Dashboard priorités + CA + services + commandes du jour |
| `/admin/orders` | Liste filtrée réelle |
| `/admin/orders/[id]` | Fiche onglets (résumé, prépa, expédition, docs, e-mails, historique) |
| `/admin/preparation` | Mode préparation cartes |
| `/admin/preparation/[id]` | Workstation contrôle produits |
| `/admin/expeditions` | Centre logistique / suivi |
| `/admin/recherche` | Recherche globale |
| `/admin/activite` | Journal d'activité |
| `/admin/alertes` | Centre d'alertes actionnables |
| `/admin/parametres` | États de config (sans secrets) |
| Pages existantes | Conservées + thème sombre hérité (products, stocks, emails…) |

## Rôles

`CUSTOMER` · `EMPLOYE` · `ADMIN` · `PROPRIETAIRE`

- Propriétaire bootstrap : `allvaps70@gmail.com` via `ADMIN_INITIAL_PASSWORD=… npm run admin:bootstrap`
- Lien « ADMIN » retiré du Header public

## Composants clés

- `AdminShell`, `AdminSidebar`, `AdminTopbar`, `AdminAuthBoundary`, `AdminPasswordGate`
- `PreparationWorkstation`
- `AdminOrderActions` (workflow existant)

## Tests réalisés

| Test | Résultat |
|------|----------|
| `prisma db push` (rôles) | OK |
| Isolation SiteShell `/admin` | OK (code) |
| Masquage lien public ADMIN | OK |
| Génération dashboard données Prisma | OK (code) |
| Connexion `/admin/login` + refus non-staff | À valider navigateur avec bootstrap |
| Mode préparation + API orders | Relié au workflow réel |

## Opérationnel vs préparé

**Opérationnel**
- Shell premium, nav, dashboard réel, commandes, fiche, préparation UI, expéditions, docs, alertes, recherche, activité, paramètres états

**Préparé / non connecté**
- API transporteurs étiquettes auto
- Gmail labels API
- Fidèle à Tout sync
- Scan caméra mobile (architecture fidélité existante)
- PWA admin dédiée

## Accès à configurer

1. `ADMIN_INITIAL_PASSWORD="…" npm run admin:bootstrap`
2. SMTP / Gmail / Viva / transporteurs / Fidèle à Tout (voir paramètres)

## Fichiers principaux

- `app/admin/admin-theme.css`, `layout.tsx`, `login/page.tsx`, `page.tsx`
- `app/admin/orders/**`, `preparation/**`, `expeditions/**`, `recherche`, `activite`, `alertes`, `parametres`
- `components/admin/Admin*.tsx`, `PreparationWorkstation.tsx`
- `components/layout/SiteShell.tsx`, `Header.tsx`
- `lib/admin/roles.ts`, `lib/jwt.ts`, `prisma/schema.prisma`
