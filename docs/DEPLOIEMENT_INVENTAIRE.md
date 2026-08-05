# Déploiement permanent All Vap's Inventaire

## URL FIGÉE (tunnel Cloudflare — ne jamais changer)

| Accès | URL |
|---|---|
| **Login** | https://heather-auctions-they-leu.trycloudflare.com/login?next=/inventaire |
| **Employés** | https://heather-auctions-they-leu.trycloudflare.com/inventaire |
| **Admin** | https://heather-auctions-they-leu.trycloudflare.com/admin |
| **Inventaires (Yoann)** | https://heather-auctions-they-leu.trycloudflare.com/admin/inventaires |
| **Accès** | https://heather-auctions-they-leu.trycloudflare.com/acces |

> Source de vérité : `data/FIXED_TUNNEL_URL.txt`  
> **Interdit** de relancer un quick tunnel (nouvelle URL) sans OK explicite.  
> Ne jamais pkill cloudflared sauf demande utilisateur (`scripts/stop-servers.sh`).

Cible DNS long terme : `https://inventaire.allvaps.fr`

---

## Option A — Vercel (recommandé pour Next.js)

### Prérequis
1. Compte Vercel lié au repo GitHub `yoann5930/all-vap-s-backend`
2. Base Postgres (Neon / Supabase / Vercel Postgres)
3. Token optionnel `VERCEL_TOKEN` pour déploiement CLI

### Variables d’environnement (Production)

```
DEMO_MODE=false
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=<32+ caractères aléatoires>
NEXT_PUBLIC_APP_URL=https://inventaire.allvaps.fr
ALLOWED_ORIGINS=https://inventaire.allvaps.fr,https://www.allvaps.fr,https://allvaps.fr
SEED_ADMIN_PASSWORD=<mot-de-passe-fort>
PAYMENT_TEST_MODE=false
MAINTENANCE_MODE=false
BLOB_READ_WRITE_TOKEN=<token Vercel Blob — photos persistantes>
```

### Étapes UI Vercel
1. vercel.com → Add New Project → importer `all-vap-s-backend`
2. Framework : Next.js (voir `vercel.json`, région `cdg1`)
3. Build Command : `prisma generate && next build`
4. Coller les variables ci-dessus
5. Deploy
6. Après le 1er deploy réussi, dans un terminal lié au projet :
   ```bash
   npx prisma migrate deploy
   DEMO_MODE=false npx tsx scripts/seed-inventory-staff.ts
   ```
7. Domains → ajouter `inventaire.allvaps.fr` + DNS CNAME chez le registrar

### Étapes CLI (si `VERCEL_TOKEN` fourni)
```bash
npx vercel link --yes --token "$VERCEL_TOKEN"
npx vercel env add DATABASE_URL production --token "$VERCEL_TOKEN"
# … autres env
npx vercel --prod --token "$VERCEL_TOKEN"
```

---

## Option B — Render

Fichier prêt : `render.yaml`

1. render.com → New → Blueprint → sélectionner le repo
2. Renseigner `DATABASE_URL`, `JWT_SECRET`, `NEXT_PUBLIC_APP_URL`, `ALLOWED_ORIGINS`
3. `DEMO_MODE=false`
4. Après deploy : migrations via `startCommand` (`prisma migrate deploy`) puis seed staff
5. Domaine custom `inventaire.allvaps.fr`

---

## Auth inventaire (rappel)

| Rôle | Accès |
|---|---|
| EMPLOYEE (Lilie, Kelli, Aurélien) | `/inventaire` uniquement |
| ADMIN (Yoann) | `/admin` + `/admin/inventaires` + `/inventaire` |

1ʳᵉ connexion → changement de mot de passe obligatoire.

---

## Photos en production

Sans `BLOB_READ_WRITE_TOKEN`, les photos sur Vercel vont dans `/tmp` (éphémère).  
Créer un store Vercel Blob et coller le token.

---

## Checklist avant bascule permanente

- [ ] `DEMO_MODE=false`
- [ ] Postgres + `prisma migrate deploy`
- [ ] Seed comptes staff
- [ ] `BLOB_READ_WRITE_TOKEN`
- [ ] DNS `inventaire.allvaps.fr`
- [ ] Test téléphone HTTPS : scan + prix + photo + visible dans `/admin/inventaires`
