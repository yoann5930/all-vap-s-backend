# Rapport — récupération configuration Gmail

**Date :** 2026-07-30  
**Projet :** `D:\all vaps\all-vap-s-backend`  
**Branche :** `main`  
**Node :** v24.18.0 · **npm :** 11.16.0  
**Environnement :** développement local (pas de `NODE_ENV` forcé)

**JSON technique :** [`GMAIL_CONFIG_RECOVERY_REPORT.json`](./GMAIL_CONFIG_RECOVERY_REPORT.json)

## Règle secrets

Aucune valeur secrète n’est reproduite ici. Statuts uniquement : présente / vide / absente.

---

## 1. Emplacements scannés

| Emplacement | Résultat Gmail/SMTP |
|-------------|---------------------|
| `.env` (actif) | Identité partiellement vide → **complétée** (non-secret) ; **mot de passe vide** |
| `.env.local` | **Absent** → **créé** (identité publique + `SMTP_APP_PASSWORD` vide) |
| `.env.example` | Modèle public `avaallvaps@gmail.com` / `smtp.gmail.com` — **pas de secret** |
| `.env.production.local` | Export Vercel (OIDC…) — **aucune** variable SMTP/Gmail |
| Copie Desktop `Desktop\all vaps\all-vap-s-backend\.env` | Même état : `SMTP_PASS` **vide** |
| Docs / `data/rebuild` | Placeholders uniquement |
| Variables User/Machine Windows | **Aucune** variable SMTP/Gmail listée |
| OAuth `GOOGLE_GMAIL_*` | **Absentes / vides** partout |

## 2. Mot de passe d’application Google

**Conclusion :**  
`AUCUN mot de passe d’application Gmail (ni Resend) n’a été retrouvé` dans les fichiers locaux scannés.

Tu ne peux donc **pas** éviter de le ressaisir **une fois** dans `.env.local` :

```env
SMTP_APP_PASSWORD=…   # à coller ici uniquement
```

Puis redémarrer `npm run dev`.

## 3. Intégration effectuée (non-secret uniquement)

Dans `.env` / `.env.local` (gitignorés) :

| Variable | Avant | Après |
|----------|-------|-------|
| `SMTP_HOST` | vide | présente (`smtp.gmail.com`) |
| `SMTP_USER` | vide | présente (`avaallvaps@…`) |
| `SMTP_PORT` / `SMTP_SECURE` | port déjà là | présentes |
| `MAIL_FROM_*` / `MAIL_REPLY_TO` | absentes | présentes |
| `MAIL_ENABLED` / `MAIL_TEST_MODE` | absentes | présentes |
| `EMAIL_TRANSPORT` | `auto`/`console` | `smtp` |
| `ADMIN_NOTIFICATION_EMAIL` | absente | présente |
| `DAILY_REPORT_RECIPIENT` | absente | présente |
| `MAIL_TEST_RECIPIENT` | absente | présente (`.env.local`) |
| `SMTP_APP_PASSWORD` | absente | **vide** (à renseigner) |
| `SMTP_PASS` | vide | **toujours vide** |
| `RESEND_API_KEY` | vide | **toujours vide** |
| `GOOGLE_GMAIL_*` | absentes | **toujours absentes** |

**Rien n’a été inventé comme secret. Rien n’a été commitré.**

## 4. Chargement par l’application

| Indicateur | Valeur |
|------------|--------|
| `enabled` | true |
| `configuredDeliverable` | **false** |
| `smtpHasPassword` | **false** |
| `smtpHostSet` / `smtpUserSet` | true |
| `transport` | smtp |
| `testMode` | true |
| `gmailApiOAuth` | false |

## 5. Test d’envoi réel

| Champ | Résultat |
|-------|----------|
| Succès livraison | **NON** |
| Code | `EMAIL_NOT_CONFIGURED` |
| Transport | n/a |
| Destinataire masqué | `a***@gmail.com` |
| Journal EmailLog | `FAILED` / `EMAIL_NOT_CONFIGURED` / `sentAt=null` |

→ Les journaux **reflètent la réalité** (échec, pas de faux `SENT`).

## 6. Prochaine étape (humaine)

1. Compte Google `avaallvaps@gmail.com` → mot de passe d’application.  
2. Coller **uniquement** dans `.env.local` → `SMTP_APP_PASSWORD=…`  
3. Redémarrer le serveur.  
4. Relancer : `npx tsx scripts/diagnose-gmail-config.ts` puis vérifier la boîte `allvaps70@gmail.com` (mode test).  
5. Quand OK : `MAIL_TEST_MODE=false` en production uniquement.

Sans cette étape, **aucun e-mail réel ne peut être envoyé** — la configuration identité est prête, le secret manque toujours.
