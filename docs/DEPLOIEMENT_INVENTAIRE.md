# Déploiement inventaire All Vap's

## URL publique actuelle (HTTPS)

> Tunnel Cloudflare temporaire (session cloud agent) — accessible téléphones / tablettes / PC :

| Accès | URL |
|---|---|
| **Employés** | https://mining-nancy-fantastic-porcelain.trycloudflare.com/inventaire |
| **Administration** | https://mining-nancy-fantastic-porcelain.trycloudflare.com/admin → redirige vers `/login` |

Cible permanente : `https://inventaire.allvaps.fr` (après DNS + Vercel).

## Séparation des accès

| Accès | Chemin | Auth |
|---|---|---|
| Employés | `/inventaire` | Aucune (nom + boutique uniquement) |
| Administration | `/admin` | Login ADMIN obligatoire |

Les employés ne peuvent pas modifier tarifs, supprimer produits, stocks hors inventaire, Google sync, ni l’espace admin.

## Variables d'environnement (production Vercel)

Obligatoires :

```
DEMO_MODE=false
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=<long-random>
NEXT_PUBLIC_APP_URL=https://inventaire.allvaps.fr
ALLOWED_ORIGINS=https://inventaire.allvaps.fr,https://www.allvaps.fr,https://allvaps.fr
SEED_ADMIN_PASSWORD=<mot-de-passe-fort-unique>
PAYMENT_TEST_MODE=false
MAINTENANCE_MODE=false
```

Optionnelles (sync / photos cloud) :

```
GOOGLE_SYNC_ENABLED=true
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
GOOGLE_DRIVE_FOLDER_ID=
GOOGLE_SHEETS_SPREADSHEET_ID=
BLOB_READ_WRITE_TOKEN=
```

## Vercel (déploiement permanent)

1. Importer le dépôt `yoann5930/all-vap-s-backend` sur [vercel.com](https://vercel.com)
2. Framework : Next.js (`vercel.json` fourni)
3. Build : `prisma generate && next build`
4. Renseigner les variables ci-dessus — **jamais** `DEMO_MODE=true` en prod
5. Après premier deploy : `npx prisma migrate deploy` puis seed admin avec `SEED_ADMIN_PASSWORD`
6. Domaine custom : `inventaire.allvaps.fr`

## DNS inventaire.allvaps.fr

Chez le registrar / Cloudflare DNS :

```
Type: CNAME
Name: inventaire
Value: cname.vercel-dns.com
Proxy: optionnel
```

Puis Vercel → Project → Domains → Add `inventaire.allvaps.fr`.

## Installation PWA Android

1. Ouvrir l’URL HTTPS `/inventaire` dans Chrome
2. Menu ⋮ → « Ajouter à l’écran d’accueil » / « Installer l’application »
3. Autoriser la caméra au premier scan/photo
4. Hors ligne : les lignes sont mises en file et synchronisées au retour réseau

## Identifiants admin (à changer)

Sur le tunnel temporaire (DEMO) uniquement :

- Email : `admin@allvaps.fr`
- Mot de passe : `Admin123!` → **à remplacer immédiatement** dès le passage en prod (`SEED_ADMIN_PASSWORD` + changement dans l’admin)

En production réelle : ne pas utiliser ces identifiants ; générer un mot de passe fort via `SEED_ADMIN_PASSWORD`.

## Sécurité employés

Chaque ligne enregistre : employé, boutique, date/heure, produit/code-barres, quantité, photo éventuelle.
