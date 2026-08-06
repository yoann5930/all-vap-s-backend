/**
 * Rapport mission e-mail A.V.A. — sans secrets.
 */
# Rapport final — E-mails A.V.A. (Gmail)

Date : 2026-07-30

## Architecture détectée

| Élément | Détail |
|---------|--------|
| Frontend / backend | **Next.js 15** App Router (`app/`) |
| Auth | JWT + cookies (`lib/auth.ts`, `lib/jwt.ts`) |
| Base | **PostgreSQL** + Prisma |
| E-mail existant | `lib/email.ts` (Resend / SMTP / console) — **étendu**, pas remplacé en parallèle |
| Commandes | `lib/payments/fulfill-order.ts`, `lib/shipping/ops.ts` |
| Contact | page statique → **API** `POST /api/contact` ajoutée |

## Fichiers créés

- `lib/email/config.ts`, `transport.ts`, `service.ts`, `templates.ts`, `layout.ts`, `log.ts`, `mask.ts`, `errors.ts`, `types.ts`, `compat.ts`, `index.ts`
- `app/api/admin/email/test/route.ts`
- `app/api/contact/route.ts`
- `docs/email-ava-configuration.md`
- `scripts/test-email-ava.ts`
- modèle Prisma `EmailLog` (+ enum `EmailLogStatus`)

## Fichiers modifiés

- `lib/email.ts` → façade vers `lib/email/`
- `lib/auth.ts` — bienvenue + vérification
- `app/api/auth/forgot-password/route.ts` — message neutre
- `app/api/auth/reset-password/route.ts` — e-mail mot de passe modifié
- `lib/payments/fulfill-order.ts` — confirmation enrichie + remboursement
- `lib/shipping/ops.ts` — retrait prêt / annulée
- `instrumentation.ts` — statut e-mail au démarrage
- `.env.example` — variables A.V.A. / Gmail (sans secret)
- `lib/api-utils.ts` — codes d'erreur e-mail
- `package.json` — `email:test` / `email:test:live`

## Dépendances

Déjà présentes : `nodemailer`, `@types/nodemailer` — **aucune nouvelle dépendance npm**.

## Variables (`.env.example` uniquement — pas de secret)

```
SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_APP_PASSWORD=
MAIL_FROM_NAME / MAIL_FROM_ADDRESS / MAIL_REPLY_TO
MAIL_ENABLED / MAIL_TEST_MODE / MAIL_TEST_RECIPIENT
ADMIN_NOTIFICATION_EMAIL / APP_PUBLIC_URL / LOYALTY_EMAILS_ENABLED
EMAIL_TRANSPORT=smtp
```

## Emplacement du service

`lib/email/` — point d'entrée `@/lib/email`

## Modèles / envois

Bienvenue, vérification, reset, password changed, paiement confirmé, expédition, livraison, retrait boutique, annulation, remboursement, contact client/admin, admin nouvelle commande, test admin. Fidélité : modèles prêts, **désactivés**.

## Routes

| Route | Accès |
|-------|--------|
| `GET/POST /api/admin/email/test` | ADMIN uniquement |
| `POST /api/contact` | public + rate-limit + CSRF same-origin |

## Protections

Mode test, idempotence `EmailLog`, masquage PII, validation anti-injection headers, rate-limit, secrets hors Git / hors frontend, pas de PSP dans les e-mails clients.

## Tests exécutés

`npm run email:test` → **tous OK** (transport console, mode test, injection refusée, fidélité off, pas de secret dans le dump config).

## Test SMTP réel

**Non exécuté dans cette session** : le mot de passe d'application ne doit pas être fourni au chat ni lu automatiquement depuis `.env.local`.

### Instructions exactes (propriétaire)

1. Créer / éditer **`.env.local`** (déjà ignoré par Git) :

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=avaallvaps@gmail.com
SMTP_APP_PASSWORD=COLLEZ_ICI_LE_MOT_DE_PASSE_APPLICATION
MAIL_FROM_NAME=A.V.A. — All Vap's
MAIL_FROM_ADDRESS=avaallvaps@gmail.com
MAIL_REPLY_TO=avaallvaps@gmail.com
MAIL_ENABLED=true
MAIL_TEST_MODE=true
MAIL_TEST_RECIPIENT=VOTRE_BOITE_DE_TEST
ADMIN_NOTIFICATION_EMAIL=VOTRE_BOITE_ADMIN
APP_PUBLIC_URL=http://localhost:3000
EMAIL_TRANSPORT=smtp
LOYALTY_EMAILS_ENABLED=false
```

2. Redémarrer `npm run dev`.
3. Vérifier le log : `Service e-mail configuré.`
4. Envoyer un test live :

```bash
npm run email:test:live
```

ou `POST /api/admin/email/test` connecté en ADMIN.

5. Contrôler la boîte : expéditeur **A.V.A. — All Vap's** / **avaallvaps@gmail.com**.

### Hébergement futur

Ajouter les mêmes variables (dont `SMTP_APP_PASSWORD`) **uniquement** dans les secrets du backend (Render / VPS…). Jamais dans Vercel frontend / `NEXT_PUBLIC_*`. Production : `MAIL_TEST_MODE=false`, `APP_PUBLIC_URL` = URL officielle.

## Erreurs restantes / suite

- Envoi SMTP réel à valider par le propriétaire après saisie locale du secret.
- `prisma generate` peut échouer en EPERM si `next dev` verrouille le client — redémarrer le serveur puis `npx prisma generate`.
- Table `EmailLog` déjà synchronisée via `prisma db push`.

## Contraintes respectées

Pas de Commit / Push / deploy · pas de secret dans le code · design / catalogue / SumUp / fidélité / A.V.A. visuelle non modifiés.
