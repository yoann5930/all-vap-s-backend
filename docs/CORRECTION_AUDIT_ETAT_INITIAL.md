# Correction audit — état initial

**Date :** 2026-07-30  
**Projet :** `D:\all vaps\all-vap-s-backend` (`D:/all vaps/all-vap-s-backend`)  
**Branche :** `main` (ahead origin/main de 2 commits)

## Git

- Nombreux fichiers déjà présents (admin premium, A.V.A. Gestion, notifications, ALLVAPS_PORTABLE staged, etc.).
- **Ne pas écraser** ces travaux : corrections en couches ciblées.
- Fichiers d’audit déjà créés : `docs/AUDIT_*.md`, `docs/AUDIT_*.json`, scripts `audit-*`.

## Prisma

- Schéma étendu (orders, EmailLog, ManagementReport, Notification*, AdminAlert, AppSetting…).
- À ajouter pour cette mission : champs audit sur `Order` (+ journal campagne audit).

## Variables présentes (noms uniquement — aucune valeur)

D’après `.env` :

- `DATABASE_URL`, `JWT_SECRET`, `DEMO_MODE`
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_PORT`, `EMAIL_TRANSPORT`, `EMAIL_FROM`, `RESEND_API_KEY`
- `PAYMENT_TEST_MODE`, `VIVA_*`, `SUMUP_*`
- `CRON_SECRET`

**Absentes / non listées :** `AUDIT_MODE_*`, `PUSH_*`, `SMS_*`, `ANDROID_GATEWAY_*`, `GOOGLE_GMAIL_*`, `SMTP_APP_PASSWORD` (alias possible via `SMTP_PASS`).

## Services

| Service | État initial |
|---------|----------------|
| Application Next | Relancée récemment ; health basique OK |
| PostgreSQL | Utilisée (warm-up OK en logs) |
| E-mail | Config partielle ; risque console ; historiques `SENT`+`console` |
| Paiement | `PAYMENT_TEST_MODE` présent |
| Push | Non configuré |
| SMS / passerelle Android | Non configuré |
| Gmail API labels | Non configuré |
| Mode AUDIT_ONLY | **Inexistant** |

## Problèmes issus de l’audit (priorité)

1. **critique** — Mode `AUDIT_ONLY` absent  
2. **critique** — Faux `SENT` + transport `console`  
3. **critique** — Health trop optimiste / services non distingués  
4. **critique** — Push non opérationnel + 0 device  
5. **majeur** — Idempotence events incomplete  
6. **majeur** — Données audit non exclues des stats production  
7. **majeur** — Stats e-mails A.V.A. comptent des non-livrés  
8. **majeur** — Parcours UI non rejouables quand serveur down  
9. **moyen** — `configured=true` e-mail sans capacité de livraison réelle  

## Ordre de correction retenu

1. Rapport état initial (ce fichier)  
2. Health enrichie honnête  
3. Schéma + module `AUDIT_ONLY` serveur  
4. Stock / commandes / fidélité / analytics / e-mails audit  
5. Correction e-mails `SENT` frauduleux + config honnête  
6. Bus notifications idempotent + enregistrement device push  
7. Admin API activation audit + nettoyage  
8. Tests + vérification HTTP + rapport final correction  

## Secrets

Aucune valeur secrète n’est reproduite dans ce document.
