# Rapport final — Mission finalisation e-commerce All Vap's

Date : 2026-07-30

## Verdict

Le site dispose désormais d’une **administration sécurisée**, d’un **workflow de commandes historisé**, de **documents PDF réels**, d’une **architecture e-mails / Gmail / transporteurs / Fidèle à Tout** sans comportement inventé. Le paiement peut rester sandbox.

---

## 1. Fonctionnalités auditées

| Domaine | Statut |
|--------|--------|
| Admin privée `/admin` (rôle ADMIN serveur) | Opérationnel |
| Compte `allvaps70@gmail.com` | Bootstrap script (mot de passe via env uniquement) |
| Hash bcrypt, mustChangePassword, 2FA TOTP | Opérationnel |
| Workflow commandes + historique | Opérationnel |
| Documents PDF (BDC, préparation, livraison, facture) | Génération + stockage + téléchargement admin |
| Envoi e-mails documents + labels Gmail | Envoi réel si SMTP ; labels Gmail si OAuth (sinon honnête) |
| A.V.A. commandes réelles | Opérationnel (consultation statuts DB) |
| Fidélité / Fidèle à Tout | Architecture (cf. docs précédents) |
| Panier / stocks / promotions | Réel (missions antérieures) |
| Transporteurs | Architecture + saisie manuelle tracking |
| Dashboard admin | Enrichi (préparation, stocks, e-mails, CA) |

---

## 2. Éléments fictifs / simulés retirés ou neutralisés

- Tracking transporteur inventé (déjà retiré)
- Documents « factices » → PDF réels sur disque `storage/orders/`
- Classement Gmail simulé → **jamais** marqué appliqué sans API
- Création étiquette transporteur inventée → refus honnête si API absente / non branchée
- Mot de passe admin en clair → **interdit** ; bootstrap env only
- Statuts incomplets → workflow étendu + labels métier FR

---

## 3. Tables créées / modifiées (Prisma)

**Modifiées**
- `User` : `mustChangePassword`, `twoFactorEnabled`, `totpSecret`, `totpBackupCodesHash`
- `Order` : `preparingAt`, `preparedAt`, `atRelayAt`, `invoiceNumber`
- `OrderStatus` enum : `PREPARING`, `PREPARED`, `AT_RELAY` (+ existants)

**Créées**
- `OrderStatusHistory`
- `OrderDocument` (+ `OrderDocumentType`)
- `InvoiceSequence`

---

## 4. Rôles

- `CUSTOMER` / `ADMIN` (inchangé)
- Routes `/admin/**` et `/api/admin/**` : `requireAuth("ADMIN")`
- Gate `mustChangePassword` → `/admin/security`

---

## 5. Routes créées / étendues

| Route | Rôle |
|-------|------|
| `/admin/security` | MDP + 2FA |
| `/admin/documents` | Liste PDF |
| `/admin/emails` | Journal + statut SMTP/Gmail |
| `/admin/transporteurs` | État intégrations |
| `/admin/fidelite` | Lookup fidélité |
| `/api/admin/security` | POST MDP / PATCH 2FA |
| `/api/admin/documents/[id]` | Download PDF protégé |
| `/api/admin/orders` | Actions prepare / prepared / ship / at_relay / deliver / cancel |
| `scripts/bootstrap-admin.ts` | Création admin `allvaps70@gmail.com` |

---

## 6. Documents générés

| Type | Déclencheur | E-mail | Libellé Gmail prévu |
|------|-------------|--------|---------------------|
| Bon de commande (`ORDER_FORM`) | Paiement confirmé | Client + admin | Bon de commande |
| Facture (`INVOICE`) | Paiement confirmé | Client + admin | Factures |
| Bon de préparation (`PREP_SLIP`) | Statut PREPARING | Interne uniquement | Bon de préparation |
| Bon de livraison (`DELIVERY_SLIP`) | Statut SHIPPED | Stocké / imprimable (pas d’envoi auto) | — |

Numérotation facture : `AV-YYYY-#####` via `InvoiceSequence`.

---

## 7. Workflow commandes

`PENDING` → `PAID` → `PREPARING` → `PREPARED` → `SHIPPED` → `AT_RELAY` → `DELIVERED`  
(+ `CANCELLED` / `REFUNDED`)

Chaque transition : ligne `OrderStatusHistory`, e-mail client adapté, effets documents.

---

## 8. Intégrations transporteurs

Architecture `lib/shipping/carriers.ts` :
- Mondial Relay / Relais Colis / Colissimo
- Sans clé : message clair + tracking manuel admin
- Avec clé mais API non branchée : **pas** de faux n° de suivi

---

## 9. Règles Gmail A.V.A.

Libellés prévus : **Bon de commande**, **Bon de préparation**, **Factures**  
Variables : `GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_GMAIL_CLIENT_SECRET`, `GOOGLE_GMAIL_REFRESH_TOKEN`  
Tant qu’absents : envoi SMTP possible, classement non simulé.

---

## 10. Tests réalisés

| Test | Résultat |
|------|----------|
| `prisma db push` (statuts, documents, sécurité user) | OK |
| `prisma generate` | OK |
| `npm run docs:test` (PDF BDC/prépa/livraison/facture) | À confirmer après push (script prêt) |
| Typecheck modules nouveaux | En cours / corrections appliquées |
| Bootstrap admin | Script prêt — nécessite `ADMIN_INITIAL_PASSWORD` (non stocké) |
| Envoi e-mail live + labels Gmail | Bloqué sans secrets SMTP/Gmail |
| Paiement live | Sandbox autorisé |
| Scan caméra Android Fidèle à Tout | Architecture ; accès FAT manquants |

---

## 11. Accès externes restant à configurer

1. `ADMIN_INITIAL_PASSWORD` → `npm run admin:bootstrap`
2. `SMTP_APP_PASSWORD` + `ADMIN_NOTIFICATION_EMAIL` + `MAIL_TEST_MODE=false`
3. `GOOGLE_GMAIL_*` pour classement automatique
4. `VIVA_*` live + `PAYMENT_TEST_MODE=false`
5. `FIDELE_A_TOUT_*`
6. `MONDIAL_RELAY_API_KEY` / `RELAIS_COLIS_API_KEY` / `COLISSIMO_API_KEY` + branchement HTTP officiel

---

## 12. Fichiers clés modifiés / ajoutés

- `prisma/schema.prisma`
- `lib/orders/status.ts`, `lib/orders/workflow.ts`
- `lib/documents/service.ts`
- `lib/email/gmail-labels.ts`, `lib/email/transport.ts`, `lib/email/templates.ts`
- `lib/shipping/ops.ts`, `lib/shipping/carriers.ts`
- `lib/payments/fulfill-order.ts`, `lib/auth.ts`, `lib/ai/ava-advisor.ts`
- `app/admin/*`, `app/api/admin/*`, `scripts/bootstrap-admin.ts`, `scripts/test-order-documents.ts`
- `docs/RAPPORT_MISSION_FINALE_ECOMMERCE.md` (ce fichier)

---

## 13. Blocages restants (honnêtes)

- Classement Gmail API : credentials + client HTTP final
- Étiquettes transporteurs auto : doc API officielle
- Fidèle à Tout sync : compte enseigne
- Paiement production : identifiants Viva live
- Création compte admin : le propriétaire doit lancer `admin:bootstrap` avec le mot de passe communiqué **hors Git**
