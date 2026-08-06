# Rapport final — A.V.A. Gestion, rapports automatiques, passerelles de notifications

Date : 2026-07-30  
Projet : `all-vap-s-backend` (Next.js 15 + Prisma + PostgreSQL)

## Verdict

| Domaine | État |
|--------|------|
| A.V.A. Client (boutique) | **Inchangé** — `/api/ai-assistant` + ImmersiveAva |
| A.V.A. Gestion (admin) | **Opérationnel** — données Prisma réelles, pas de conseil produit |
| Rapports manuels + PDF | **Opérationnel** (génération locale) |
| Rapport quotidien planifié | **Prêt** via `/api/cron/daily-report` + `CRON_SECRET` |
| Envoi e-mail rapport | **Réel seulement** si SMTP/Resend configuré — sinon `skipped` / console ≠ envoyé |
| Bus notifications | **Opérationnel** (admin + journal + idempotence) |
| Push | **Architecture seule** — `not_configured` par défaut |
| SMS / passerelle Android | **Architecture seule** — aucun SMS réel |
| Fournisseur SMS payant | **Non intégré** (volontaire) |

---

## Fichiers analysés (audit)

- `lib/ai/ava-advisor.ts`, `app/api/ai-assistant/route.ts`, `app/admin/ai/page.tsx`
- `lib/email/*`, `lib/payments/fulfill-order.ts`, `lib/documents/service.ts`
- `instrumentation.ts`, `app/api/cron/sumup-sync/route.ts`
- `prisma/schema.prisma`, admin shell / sidebar / alertes / paramètres

## Fichiers créés (principaux)

### Cœur
- `lib/timezone/shop-tz.ts`
- `lib/settings/app-settings.ts`
- `lib/ava-gestion/analytics.ts`
- `lib/ava-gestion/advisor.ts`
- `lib/reports/management-report.ts`
- `lib/notifications/bus.ts`
- `lib/notifications/admin-alerts.ts`
- `lib/notifications/push-provider.ts`
- `lib/notifications/sms-provider.ts`

### API
- `app/api/admin/ava-gestion/route.ts`
- `app/api/admin/reports/route.ts`
- `app/api/admin/notifications/route.ts`
- `app/api/cron/daily-report/route.ts`
- `app/api/gateway/android-sms/route.ts`

### UI admin
- `app/admin/ava-gestion/page.tsx`
- `app/admin/rapports/page.tsx`
- `app/admin/notifications/page.tsx`
- `app/admin/notifications/historique/page.tsx`
- `app/admin/parametres/notifications/page.tsx`

### Tests / docs
- `scripts/test-ava-gestion.ts`
- `docs/RAPPORT_AVA_GESTION_NOTIFICATIONS.md` (ce fichier)

## Fichiers modifiés

- `prisma/schema.prisma` — modèles rapports / notifications / appareils / SMS / alertes / settings
- `lib/payments/fulfill-order.ts` — émission `order.payment_confirmed` (non bloquant)
- `lib/email/gmail-labels.ts` — libellé « Rapports de gestion »
- `lib/email/types.ts` — types `management_report`, `admin_notification`
- `components/admin/AdminSidebar.tsx`
- `app/admin/parametres/page.tsx`
- `.env.example`
- `package.json` — script `ava-gestion:test`

## Migrations / tables

Modèles Prisma ajoutés :

- `AppSetting`
- `ManagementReport`
- `NotificationEvent`
- `NotificationDelivery`
- `NotificationDevice`
- `SmsOutbox`
- `AdminAlert`
- `AvaGestionMessage`

Appliquer : `npx prisma db push` ou `npx prisma migrate dev --name ava_gestion_notifications`

## Endpoints

| Méthode | Route | Rôle |
|--------|-------|------|
| GET/POST | `/api/admin/ava-gestion` | Staff — chat gestion |
| GET/POST | `/api/admin/reports` | ADMIN+ — rapports / PDF |
| GET/POST | `/api/admin/notifications` | ADMIN+ — prefs / test / revoke |
| GET/POST | `/api/cron/daily-report` | Bearer `CRON_SECRET` |
| GET/POST | `/api/gateway/android-sms` | Headers device + secret (si enabled) |

## Événements

- `order.payment_confirmed` (depuis fulfill)
- Types préparés : `order.*`, `system.critical`, `report.daily`, `test.event`

## Tâche planifiée

- Cron HTTP : `GET /api/cron/daily-report` avec `Authorization: Bearer $CRON_SECRET`
- Heure / fuseau / destinataire : `AppSetting` `ava.reports` (défaut 20:30 Europe/Paris, `allvaps70@gmail.com`)
- Envoi quotidien **uniquement** s’il y a ≥ 1 achat réel (sauf option contraire)
- Idempotence journalière via `ManagementReport.idempotencyKey`

## Permissions

- CLIENT → pas d’accès API admin
- EMPLOYE → A.V.A. Gestion sans CA / finances
- ADMIN / PROPRIETAIRE → rapports, notifications, téléphone, appareils

## Services externes non configurés

- Firebase / FCM / Web Push
- Twilio / OVH / Brevo / SMSFactor
- Application Android passerelle + carte SIM Free Mobile
- API Gmail labels (credentials optionnels, HTTP non branché)

## Variables d’environnement requises

Voir `.env.example` sections A.V.A. Gestion & Notifications.  
**Ne jamais committer de vraies clés.**

## Prochaines étapes

### Samsung passerelle SMS
1. Activer `ANDROID_GATEWAY_ENABLED=true` + `DEVICE_ID` + `SECRET` forts
2. Développer l’app Android (polling `GET /api/gateway/android-sms` + ACK POST)
3. Stocker le numéro propriétaire chiffré + validation par code réelle
4. Brancher envoi SIM ; journaliser `sent` uniquement après ACK appareil

### Notifications push
1. Choisir provider (`PUSH_PROVIDER`)
2. `PUSH_ENABLED=true` + `PUSH_PROJECT_ID` (+ clé serveur hors Git)
3. Enregistrer appareils via `NotificationDevice`
4. Remplacer `StubConfiguredPushProvider` par SDK réel — jamais marquer `delivered` sans ack

### SMS externes (optionnel)
1. `SMS_ENABLED=true` + URL/clé
2. Implémenter un `SmsProvider` dédié sans toucher au bus métier

## Tests exécutés

- `npm run ava-gestion:test` — **OK** (périodes, comparaison, push `not_configured`, masquage téléphone)
- Smoke DB : snapshot du jour (données réelles), réponse A.V.A. Gestion sans conseil produit, événement `test.event`, rapport PDF `on_demand` — **OK**
- `prisma db push` — schéma synchronisé
- Typecheck : aucune erreur sur les nouveaux modules (1 erreur préexistante dans `scripts/publish-mamita-biarritz.ts`)

## Ce qui n’est PAS déclaré « terminé »

- SMS réellement envoyé
- Push réellement reçu
- Sync transporteur complète (retours / anomalies API)
- Validation numéro par SMS OTP
- SDK Gmail labels HTTP
- Cron externe branché en production (endpoint prêt — à planifier côté hébergeur)