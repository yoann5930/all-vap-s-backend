# Rapport de correction — bloquages audit All Vap’s

**Date :** 2026-07-30  
**Projet :** `D:\all vaps\all-vap-s-backend`  
**Branche :** `main`  
**État initial :** [`CORRECTION_AUDIT_ETAT_INITIAL.md`](./CORRECTION_AUDIT_ETAT_INITIAL.md)

## Verdict honnête

| Domaine | Après correction | Preuve réelle |
|---------|------------------|---------------|
| Health enrichie | **OK** | `GET /api/health` → services distincts |
| Mode AUDIT_ONLY | **Implémenté** | API `/api/admin/audit-mode` + schéma Order |
| Exclusion CA / stats | **OK** | `isAudit: false` dans analytics |
| E-mails SENT+console | **Corrigés** | 7 → SKIPPED (`npm run email:fix-sent-console`) |
| `configured` e-mail | **Honnête** | false sans SMTP/Resend livrable |
| Stats e-mails A.V.A. | **Corrigées** | compte uniquement `SENT` + smtp/resend |
| Idempotence events | **OK** | `NotificationEvent.idempotencyKey` unique |
| Enregistrement device | **API prête** | `/api/admin/devices` |
| Push réellement reçu | **NON** | `PUSH_ENABLED` / provider absents → `not_configured` |
| E-mail réellement reçu en boîte | **NON** | credentials livraison absents / incomplets |
| Tests navigateur multi-clients ×3 | **NON rejoués ici** | à faire après activation SMTP + audit mode |

**Ne pas lire :** services push/e-mail « opérationnels ».  
Ils sont **prêts / honnêtes**, pas prouvés en réception externe.

---

## Fichiers créés

- `docs/CORRECTION_AUDIT_ETAT_INITIAL.md`
- `docs/CORRECTION_AUDIT_RAPPORT_FINAL.md` (ce fichier)
- `lib/audit/mode.ts`
- `app/api/admin/audit-mode/route.ts`
- `app/api/admin/devices/route.ts`
- `scripts/fix-email-sent-console.ts`
- `scripts/test-audit-corrections.ts`

## Fichiers modifiés (principaux)

- `prisma/schema.prisma` — `Order.isAudit`, `auditCampaignId`, `auditAllowOutOfStock`, `AuditModeLog`, `NotificationEvent.idempotencyKey`
- `app/api/health/route.ts` — services app/db/email/payment/push/sms/cron + audit
- `lib/email/config.ts` — `configured` = livraison réelle seulement
- `lib/email/service.ts` — préfixe `[AUDIT ALL VAP'S — TEST]`
- `lib/email/types.ts` — flags audit
- `lib/stock/availability.ts` — `allowOutOfStockAudit`
- `app/api/orders/route.ts` — marquage audit + bypass stock contrôlé
- `app/api/payments/checkout/route.ts` — ne pas annuler audit OOS
- `lib/payments/fulfill-order.ts` — skip fidélité / stock OOS audit
- `lib/ava-gestion/analytics.ts` — exclusion audit + e-mails réels
- `lib/notifications/bus.ts` — idempotence événement
- `.env.example` — `AUDIT_MODE_*`
- `package.json` — `email:fix-sent-console`

---

## Mode AUDIT_ONLY — usage

1. Admin authentifié : `POST /api/admin/audit-mode`
```json
{
  "action": "activate",
  "campaignId": "AUDIT-2026-07-30-FIX",
  "secret": "au-moins-16-caracteres",
  "expiresInHours": 8,
  "allowOutOfStock": true
}
```
2. Commande client avec header `x-audit-secret` **ou** body `auditSecret` pendant la campagne.
3. Commande marquée `isAudit=true`, exclue du CA / priorités prod / fidélité.
4. Hors stock uniquement si secret valide + mode actif.
5. Désactivation : `{ "action": "deactivate" }` — journal `AuditModeLog`.

Variables : `AUDIT_MODE_ENABLED`, `AUDIT_MODE_SECRET`, `AUDIT_CAMPAIGN_ID`, `AUDIT_MODE_EXPIRES_AT` (voir `.env.example`).

---

## Health — exemple réel observé

```json
{
  "ok": true,
  "services": {
    "application": { "status": "healthy" },
    "database": { "status": "healthy" },
    "email": { "status": "not_configured", "detail": "console_only_or_missing_credentials" },
    "payment": { "status": "degraded", "detail": "payment_test_mode" },
    "push": { "status": "not_configured" },
    "sms": { "status": "not_configured" },
    "cron": { "status": "healthy", "detail": "cron_secret_set" }
  },
  "audit": { "enabled": false }
}
```

---

## E-mails

- 7 logs `SENT`+`console` → `SKIPPED` / `CONSOLE_ONLY_NOT_DELIVERED`.
- Nouveaux envois console restent SKIPPED (déjà en place).
- Préfixe audit prêt pour campagnes.
- **Réception inbox Yoann :** toujours dépendante de SMTP/Resend valides — non prouvée dans cette passe.

---

## Push

- Enregistrement appareil : `POST /api/admin/devices` `{ action: "register", platform: "android", ... }`
- Envoi réel : uniquement si `PUSH_ENABLED=true` + projet configuré.
- Sinon statut **`not_configured`** — jamais « delivered ».

---

## Tests exécutés

- `npm run email:fix-sent-console` — 7 corrigés  
- `npx tsx scripts/test-audit-corrections.ts` — OK  
- `npm run ava-gestion:test` — OK  
- `prisma db push` — OK (schéma sync)  
- `GET /api/health` — OK enrichi  

---

## Reste à faire (hors « faux terminé »)

1. Renseigner SMTP/Resend livrable → retester **réception** boîte ×3.  
2. Configurer FCM + enregistrer device → retester push réelle.  
3. Activer AUDIT_ONLY → 3 clients × parcours navigateur (serveur up).  
4. Nettoyage Gmail uniquement après messages réellement reçus + manifeste.  
5. UI admin optionnelle pour audit-mode / devices (API déjà là).

---

## Conclusion

Les **mensonges de statut** (SENT console, health trop optimiste, absence d’AUDIT_ONLY, doublons events, stats e-mail gonflées, CA polluable par audit) sont **corrigés dans le code**.

Les **preuves externes** (inbox, push Android) restent **incomplètes** tant que les providers ne sont pas branchés : l’audit de réception externe **n’est pas reclôturable** uniquement avec cette passe de correction.
