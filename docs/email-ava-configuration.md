# Configuration e-mail A.V.A. — All Vap's

## Architecture

Le site All Vap's (Next.js 15 App Router) utilise un **service e-mail centralisé** :

```
lib/email.ts                 ← façade publique (@/lib/email)
lib/email/
  config.ts                  ← variables d'environnement (sans secrets loggés)
  transport.ts               ← transporteur Nodemailer réutilisable + verify
  service.ts                 ← sendEmail() + mode test + idempotence
  templates.ts               ← HTML + texte brut
  layout.ts                  ← en-tête / signature A.V.A.
  log.ts                     ← journal EmailLog (PII masquée)
  mask.ts / errors.ts / types.ts
  index.ts                   ← fonctions métier send*
```

Expéditeur public :

- Nom : **A.V.A. — All Vap's**
- Adresse : **avaallvaps@gmail.com**

Aucun secret SMTP n'est exposé au frontend (`NEXT_PUBLIC_*` interdit pour SMTP).

## Variables d'environnement

À renseigner dans **`.env.local`** (ignoré par Git) — jamais dans `.env.example` pour le mot de passe :

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=avaallvaps@gmail.com
SMTP_APP_PASSWORD=          # mot de passe d'application Google (local uniquement)
MAIL_FROM_NAME=A.V.A. — All Vap's
MAIL_FROM_ADDRESS=avaallvaps@gmail.com
MAIL_REPLY_TO=avaallvaps@gmail.com
MAIL_ENABLED=true
MAIL_TEST_MODE=true
MAIL_TEST_RECIPIENT=        # votre boîte de test
ADMIN_NOTIFICATION_EMAIL=
APP_PUBLIC_URL=http://localhost:3000
LOYALTY_EMAILS_ENABLED=false
EMAIL_TRANSPORT=smtp
```

Compatibilité : `SMTP_PASS` est accepté comme alias de `SMTP_APP_PASSWORD`.  
`ADMIN_NOTIFY_EMAIL` reste accepté comme alias de `ADMIN_NOTIFICATION_EMAIL`.

## Installation locale

1. Copier `.env.example` → `.env.local` si besoin.
2. Créer un **mot de passe d'application** Google (compte avec validation en 2 étapes).
3. Coller **uniquement** dans `.env.local` : `SMTP_APP_PASSWORD=...`
4. Appliquer le schéma Prisma (table `EmailLog`) :

```bash
npx prisma db push
# ou
npx prisma migrate dev --name email_log
```

5. Démarrer :

```bash
npm run dev
```

Au démarrage, le log doit afficher un message neutre :

- `Service e-mail configuré.`  
  ou  
- `Service e-mail désactivé : configuration incomplète.`

## Mode test

Avec `MAIL_TEST_MODE=true` :

- tous les e-mails sont redirigés vers `MAIL_TEST_RECIPIENT` ;
- l'objet est préfixé par `[TEST] All Vap's` ;
- aucun client réel n'est contacté.

Passer `MAIL_TEST_MODE=false` uniquement lorsque les destinataires réels sont voulus.

## E-mail de test administrateur

Route protégée **ADMIN** :

- `GET /api/admin/email/test` — statut (sans secret)
- `POST /api/admin/email/test` — envoi test (rate-limité)

Exemple (cookie session admin) :

```bash
curl -X POST http://localhost:3000/api/admin/email/test ^
  -H "Content-Type: application/json" ^
  -H "Cookie: allvaps_token=..." ^
  -d "{\"to\":\"votre-boite@exemple.fr\"}"
```

Vérifier :

- expéditeur affiché : **A.V.A. — All Vap's**
- adresse réelle : **avaallvaps@gmail.com**
- aucun mot de passe dans la réponse JSON

## E-mails métier branchés

| Événement | E-mail |
|-----------|--------|
| Création compte | Bienvenue + confirmation d'adresse |
| Mot de passe oublié | Lien de reset (1 h, usage unique) |
| Mot de passe modifié | Confirmation |
| Commande payée | Confirmation client + notif admin |
| Préparation retrait boutique | Commande prête |
| Expédition | Suivi (lien seulement s'il est valide) |
| Livraison | Confirmée |
| Annulation | Confirmée |
| Remboursement | Confirmée |
| Contact (`POST /api/contact`) | Accusé client + notif interne |
| Fidélité | Modèles prêts, **désactivés** (`LOYALTY_EMAILS_ENABLED=false`) |

## Désactivation rapide

```env
MAIL_ENABLED=false
```

Ou retirer `SMTP_APP_PASSWORD` du `.env.local`.

## Rotation du mot de passe d'application

1. Révoquer l'ancien mot de passe dans le compte Google.
2. Créer un nouveau mot de passe d'application.
3. Remplacer **uniquement** la valeur dans `.env.local` / secrets hébergeur.
4. Redémarrer le backend.
5. Envoyer un e-mail de test admin.

Ne jamais committer la nouvelle valeur.

## Erreurs Gmail fréquentes

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| Connexion refusée | Mauvais mot de passe d'application | Recréer le mot de passe d'application |
| « Less secure apps » | Ancien auth Google | Utiliser un **mot de passe d'application**, pas le mot de passe du compte |
| Timeout | Pare-feu / port 465 bloqué | Autoriser `smtp.gmail.com:465` |
| Mode test erreur | `MAIL_TEST_RECIPIENT` vide | Renseigner l'adresse de test |

Les messages d'erreur côté API restent **neutres** (aucun secret, aucun dump SMTP).

## Secrets sur l'hébergement futur

Ajouter les variables SMTP **uniquement** sur le service backend (Render / VPS / etc.) :

- Ne **pas** les mettre dans Vercel frontend / `NEXT_PUBLIC_*`
- Ne **pas** les mettre dans le dépôt GitHub
- Utiliser les « Environment Variables » / « Secrets » du provider

Checklist production :

- [ ] `MAIL_TEST_MODE=false`
- [ ] `APP_PUBLIC_URL=https://www.allvaps.fr` (ou URL officielle)
- [ ] `SMTP_APP_PASSWORD` présent côté serveur uniquement
- [ ] `ADMIN_NOTIFICATION_EMAIL` renseigné
- [ ] Test admin réussi
- [ ] Vérifier dossier spam

## Sécurité

- Pas de mot de passe client dans les e-mails
- Pas de données bancaires / noms de PSP (Viva, SumUp) dans les e-mails clients
- Pas de Gmail / Nodemailer mentionnés au client
- Destinataires système non choisissables depuis une route publique
- Rate-limit : forgot-password, contact, test admin
- Journal `EmailLog` : e-mail masqué (`a***@domaine.fr`), pas de corps complet
