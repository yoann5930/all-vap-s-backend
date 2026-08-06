# Configuration e-mail production — All Vap's (A.V.A.)

## Comportement honnête

- Sans SMTP / Resend correctement configurés : **aucun succès fictif**.
- Le transport `console` (aperçu terminal) est journalisé en `SKIPPED` / `CONSOLE_ONLY_NOT_DELIVERED`, jamais en `SENT`.
- En production non-locale, `EMAIL_TRANSPORT=console` est refusé.

## Variables requises (SMTP Gmail recommandé)

Renseigner dans `.env.local` :

```env
MAIL_ENABLED=true
EMAIL_TRANSPORT=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=avaallvaps@gmail.com
SMTP_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx   # mot de passe d'application Google
MAIL_FROM_NAME=A.V.A. — All Vap's
MAIL_FROM_ADDRESS=avaallvaps@gmail.com
MAIL_REPLY_TO=avaallvaps@gmail.com
ADMIN_NOTIFICATION_EMAIL=allvaps70@gmail.com
APP_PUBLIC_URL=https://www.allvaps.fr
MAIL_TEST_MODE=false
```

Alternative Resend :

```env
EMAIL_TRANSPORT=resend
RESEND_API_KEY=re_…
EMAIL_FROM="A.V.A. — All Vap's <avaallvaps@gmail.com>"
```

## E-mails métier

| Événement | Destinataire | Fonction |
|-----------|--------------|----------|
| Création compte | Client | `sendAccountCreatedEmail` |
| Activation / confirmation | Client | `sendAccountConfirmationEmail` |
| Reset mot de passe | Client | `sendPasswordResetEmail` |
| Confirmation commande | Client | `sendOrderConfirmationEmail` |
| Expédition / retrait / livré / annulé | Client | `sendOrderShippedEmail` etc. |
| Nouvelle commande | Admin | `sendAdminNewOrderEmail` |
| Contact / newsletter | Admin | `sendContactAdminEmail` |

## Test local

```bash
npm run email:test
npm run email:test:live   # nécessite SMTP_APP_PASSWORD
```

## Manquant aujourd'hui si non livré

Si les e-mails n'arrivent pas en boîte : vérifier `SMTP_APP_PASSWORD` dans `.env.local`, désactiver `MAIL_TEST_MODE`, et contrôler les logs `[All Vap's] Service e-mail`.
