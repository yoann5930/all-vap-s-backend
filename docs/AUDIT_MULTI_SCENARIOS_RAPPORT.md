# Rapport d’audit multi-scénarios — All Vap’s / A.V.A.

**Date :** 2026-07-30 (UTC+2)  
**Règle respectée :** aucune modification corrective métier pendant cet audit  
**Verdict de clôture :** **AUDIT NON TERMINÉ / NON VALIDABLE**

---

## 0. Synthèse exécutive

L’audit a créé **3 clients d’audit**, **12 commandes PENDING** (9 scénarios ×3 + 3 isolation), exécuté des contrôles **×3** sur stock OOS, isolation, A.V.A. Gestion, rapports test, bus notifications et permissions employé.

**Aucune preuve de réception réelle** n’a pu être établie pour :

- e-mails dans une boîte autorisée (Yoann / test) ;
- notifications push sur appareil Android.

De plus :

- le mode **`AUDIT_ONLY`** demandé **n’existe pas** dans le code ;
- le serveur HTTP **localhost:3000** était **down** → parcours UI / cookies / navigateurs non exécutés ;
- **0** envoi `EmailLog` avec transport `smtp` ou `resend` ;
- **7** logs historiques `status=SENT` + `transport=console` → **statut « envoyé » trompeur** (console ≠ livraison).

Conformément aux règles §14 : **l’audit ne doit pas être marqué comme terminé**.

Preuves brutes : [`docs/AUDIT_MULTI_SCENARIOS_EVIDENCE.json`](./AUDIT_MULTI_SCENARIOS_EVIDENCE.json)  
Script d’exécution (non correctif) : `scripts/audit-multi-scenarios.ts`

---

## 1. Environnement observé

| Élément | Valeur observée | Preuve |
|--------|-----------------|--------|
| HTTP `localhost:3000` | Connexion refusée | Probe health |
| `PAYMENT_TEST_MODE` | `true` (au moment du script) | capabilities |
| SMTP mot de passe | **absent** | `smtpHasPassword: false` |
| Resend | non configuré | env |
| `EMAIL_TRANSPORT` | `auto` → fallback console | logs |
| `mail.configured` | `true` (localhost) | **trompeur** si lu comme « livrable » |
| Push | `not_configured` | push-provider |
| Android gateway / SMS | désactivés | env |
| Mode `AUDIT_ONLY` | **inexistant** | grep = 0 |

---

## 2. Comptes d’audit créés

| Label | E-mail | userId |
|-------|--------|--------|
| CLIENT-AUDIT-01 | `audit.c1.1@allvaps-audit.local` | `cms736m990000utncnnsepz2r` |
| CLIENT-AUDIT-02 | `audit.c2.2@allvaps-audit.local` | `cms736mfu0002utnc1a92uhou` |
| CLIENT-AUDIT-03 | `audit.c3.3@allvaps-audit.local` | `cms736mm70004utncttsb8uy7` |

- Mots de passe **non inclus** dans ce rapport.  
- Comptes distincts, historiques séparés.  
- **Pas** de comptes clients réels utilisés.

---

## 3. Commandes d’audit

### 3.1 Créées pendant l’audit

- **12 commandes** liées aux e-mails `*@allvaps-audit.local`
- **Statut :** toutes **`PENDING`** (aucune `PAID` volontairement pour ne pas décrémenter le stock réel sans mode AUDIT_ONLY)
- Livraisons distinctes : `MONDIAL_RELAY` / `STORE_PICKUP` / `RELAIS_COLIS`
- Quantités 1 et 2 testées
- **Documents :** `0` pour ces commandes (normal tant que non payées)
- **E-mails commande :** non générés (pas de fulfill)
- **Notifications commande réelle :** non déclenchées via fulfill

Exemples d’IDs :

- `cms736mpw000jutnctum2meyo` (C01, Mondial Relay, 11,80 €)
- `cms736mr1000vutncgnx3dibk` (C02, Store pickup)
- `cms736ms80017utnck7errjta` (C03, Relais Colis)
- Isolation : `cms736mn60007utncfgjcfub4`, `cms736mnw000butncjo4i8sbl`, `cms736moi000futnchpj20zw1`

### 3.2 Scénarios NON exécutés (bloqués)

| Scénario demandé | Raison |
|------------------|--------|
| Paiement test confirmé ×3 + réception e-mail/push | SMTP/push absents + risque stock sans AUDIT_ONLY |
| Préparation / expédition / documents PDF commande | Nécessite PAID |
| Webhooks Viva/SumUp réels | Pas de paiement confirmé dans cette passe |
| Achat hors stock en mode audit | Mode audit inexistant |
| Reverrouillage post-audit hors stock | Prérequis mode audit absent |
| UI panier / promo / login / logout ×3 navigateurs | Serveur HTTP down |
| Session mobile / Android / navigation privée | Non disponible agent |
| Réception inbox Yoann | Pas d’accès boîte + pas de SMTP |
| Push app ouverte/fermée/verrouillée | Push non configuré + pas d’appareil |

---

## 4. Tests répétés ×3 — résultats

| Parcours | ×3 ? | Résultat | Preuve |
|----------|------|----------|--------|
| Isolation commandes A≠B | oui | **OK** 3/3 (pas de fuite liste/filtre userId) | `runs.isolation` |
| Blocage produit hors stock (`validateCartStock`) | oui | **OK** 3/3 `STOCK_INSUFFICIENT` | `runs.out_of_stock_block` |
| Création PENDING multi-clients / livraisons | oui (9 + 3) | **OK** création | `pendingOrdersCreated` |
| A.V.A. Gestion questions (5 × 3) | oui | **OK** sans conseil produit ; aligné compteurs jour | `runs.ava_gestion` / `ava_vs_db` |
| A.V.A. CA en rôle EMPLOYE | oui | **OK** refus 3/3 | `runs.employee_ava_finance` |
| Rapports `isTest=true` | oui | **OK** PDF + `emailStatus=skipped` | `runs.reports_test_mode` |
| Rapport envoi « live » sans SMTP | 1 | `SKIPPED` / console `CONSOLE_ONLY_NOT_DELIVERED` | EmailLog `cms736nfx002gutnc06pmtdxk` |
| Bus notif test | oui | events créés ; push/sms `not_configured` | `runs.notification_bus` |
| Inscription / login UI | non | **NON TESTABLE** (HTTP down) | HTTP-01 |
| Paiement confirmé + docs + mails | non | **NON EXÉCUTÉ** (volontaire / accès) | §3.2 |
| Push Android réelle | non | **NON TESTABLE** | PUSH-01, MOB-01 |
| E-mail inbox réelle | non | **NON TESTABLE / ÉCHEC CAPACITÉ** | MAIL-01 |

---

## 5. E-mails — chaîne événement → reçu

| Étape | Statut |
|-------|--------|
| Créé (EmailLog) | oui (ex. rapport) |
| Transport réel SMTP/Resend | **non** (0 SENT smtp/resend) |
| Accepté fournisseur | non |
| Délivré boîte | **non prouvé** |
| Lu | non |

### Anomalie critique de journalisation

| Métrique | Valeur |
|----------|--------|
| `SENT` + `console` | **7** |
| `SENT` + `smtp`/`resend` | **0** |
| `SKIPPED` + `CONSOLE_ONLY_NOT_DELIVERED` | **1** (récent, correct) |

**Conclusion :** un statut interne `SENT` avec transport `console` **ne constitue pas** une réception réelle. Des logs antérieurs violent la règle « console ≠ envoyé ». Le dernier essai rapport est correctement `SKIPPED`.

Destinataire masqué observé sur rapport : `a***@gmail.com` — **non reçu** (console only).

---

## 6. Notifications push — chaîne

| Étape | Statut |
|-------|--------|
| Événement créé | oui (test) |
| Canal admin | `sent` (alerte interne) |
| Canal push | `not_configured` |
| Accepté FCM | non |
| Reçu appareil | **NON** |
| Ouverture deep link | non testable |

**Une alerte admin ≠ notification push mobile.**

Appareils enregistrés : **0**.

---

## 7. A.V.A. Gestion

Après scénarios (snapshot jour) :

- commandes reçues DB : **13** (inclut audits PENDING + existantes)
- payées : **1**
- pending paiement : **12**
- CA confirmé : **6800** centimes

Réponse « Résumé du jour » : mentionne bien le compteur reçu (`replyMentionsReceived: true`).  
Pas de proposition produit détectée sur les questions de gestion.  
Employé : CA refusé ×3.

**Non couvert faute de PAID audit :** « commandes hors stock AUDIT_ONLY », « notifications reçues », distinction production vs audit dans le wording A.V.A. (pas de flag audit en base).

---

## 8. Rapports

| ID rapport | Mode | PDF | E-mail |
|------------|------|-----|--------|
| `cms736nay002cutnc1f37o3py` | test | oui | skipped |
| `cms736nct002dutncnh545d20` | test | oui | skipped |
| `cms736ndw002eutnc82sj8h79` | test | oui | skipped |
| `cms736nf4002futncdrahm70j` | live attempt | oui | skipped (console) |

Lien admin `/admin/rapports` : **non ouvert en UI** (serveur down).  
Réception boîte : **non**.

---

## 9. Doublons / concurrence

- Isolation clients : pas de fuite observée ×3.  
- Anti-doublon **delivery** : contrainte unique `idempotencyKey` active (erreurs Prisma loggées puis catch sur re-création `not_configured`).  
- **2** `NotificationEvent` pour `orderId=AUDIT-DUP-ORDER` → idempotence **au niveau event** incomplète (deux events, deliveries limitées par clé).  
- Classé : **NOTIF-DUP-02** (majeur) ci-dessous.

---

## 10. Stock

- OOS bloqué ×3 via `validateCartStock` : **OK**.  
- Achat OOS « mode audit » : **impossible** (AUD-01).  
- Les PENDING d’audit **n’ont pas** appelé `commitSaleForOrder` → stock réel non décrémenté par fulfill dans cette passe.  
- **Attention :** les PENDING peuvent avoir des réservations selon le chemin API ; ici création Prisma directe **sans** `reserveStockForOrder` → ne reproduit pas 100 % le chemin HTTP commande.

---

## 11. Problèmes détaillés

### MAIL-01 — Critique
- **Fonctionnalité :** E-mails réels  
- **Fréquence :** systémique  
- **Attendu :** livraison SMTP/Resend + réception inbox  
- **Obtenu :** pas de mot de passe SMTP / Resend ; console only  
- **Impact :** §6 non satisfait → clôture interdite  
- **Fichiers probables :** `lib/email/config.ts`, `lib/email/service.ts`, `.env.local`  
- **Correction future :** configurer credentials hors Git ; retester réception ×3 commandes

### MAIL-03 — Critique
- **Fonctionnalité :** Journal EmailLog  
- **Fréquence :** 7 occurrences historiques  
- **Attendu :** console → jamais `SENT`  
- **Obtenu :** `SENT` + `transport=console`  
- **Impact :** fausse preuve d’envoi  
- **Fichiers probables :** `lib/email/service.ts` (chemins anciens / tests)  
- **Correction future :** audit rétroactif des SENT console ; ne jamais re-marquer SENT pour console

### PUSH-01 — Critique
- **Fonctionnalité :** Push Android  
- **Attendu :** réception réelle multi-états app  
- **Obtenu :** `not_configured`, 0 device  
- **Correction future :** brancher FCM + device Yoann + preuves captures

### AUD-01 — Critique
- **Fonctionnalité :** Mode audit hors stock  
- **Attendu :** `AUDIT_ONLY`, stock/CA/fidélité protégés  
- **Obtenu :** code absent  
- **Correction future :** flag commande + garde stock + exclusion stats/rapports production

### HTTP-01 — Non testable
- Serveur Next non démarré → UI, CSRF, cookies, multi-navigateurs non couverts

### MOB-01 — Non testable
- Pas d’accès Gmail Yoann / Samsung / émulateur dans l’agent

### EMP-01 — Non testable (UI)
- Rôle EMPLOYE testé en lib A.V.A. seulement, pas session admin UI

### NOTIF-DUP-02 — Majeur
- **Scénario :** double `emitNotificationEvent` même `orderId`  
- **Obtenu :** 2 events (`dupEvents=2`)  
- **Attendu :** 1 event métier idempotent  
- **Fichiers :** `lib/notifications/bus.ts`  
- **Correction future :** clé d’idempotence aussi sur `NotificationEvent`

### CFG-01 — Moyen
- `getEmailConfig().configured === true` en local sans SMTP password → risque de croire le mail opérationnel  
- **Fichiers :** `lib/email/config.ts`

### PATH-01 — Moyen
- Création commandes audit via Prisma direct ≠ chemin `POST /api/orders` (CSRF, réserve stock, coupon)  
- Couverture panier/promo HTTP : **0**

### PAY-01 — Majeur (non exécuté)
- Aucun paiement test confirmé / webhook / document / mail / push pour les 12 commandes audit  
- **Cause :** décision de ne pas PAID sans AUDIT_ONLY + absence SMTP/push  
- **Impact :** scénarios 1–3 incomplets

---

## 12. Tableau final

| ID | Problème | Gravité | Reproduit | Clients | Admin | E-mail reçu | Push reçu | Cause probable | Correction future |
|---|---|---|---:|---|---|---|---|---|---|
| MAIL-01 | Pas de livraison e-mail réelle (SMTP/Resend absents) | critique | 3+ | 01–03 | partiel | **NON** | n/a | Credentials absents | Configurer SMTP/Resend + preuve inbox ×3 |
| MAIL-03 | `SENT` + transport `console` (7 logs) | critique | 7 | ALL | journal | **NON** | n/a | Ancien marquage SENT console | Aligner tous chemins sur SKIPPED ; purge/flag historique |
| PUSH-01 | Push non configuré / 0 device | critique | 3+ | — | alertes ≠ push | n/a | **NON** | Architecture seule | FCM + device + tests app états |
| AUD-01 | Mode `AUDIT_ONLY` inexistant | critique | 3 | 02 | n/a | n/a | n/a | Non développé | Implémenter flag + exclusions |
| PAY-01 | Paiements/docs/mails commande non exécutés | majeur | 0/3 | 01–03 | pending only | NON | NON | Stock + accès | Après AUDIT_ONLY + SMTP, fulfill ×3 |
| NOTIF-DUP-02 | Double `NotificationEvent` même commande | majeur | 1 | — | oui | n/a | NON | Idempotence delivery seule | Idempotence event |
| CFG-01 | `configured=true` sans SMTP réel | moyen | 1 | — | paramètres | NON | n/a | Heuristique localhost | Distinguer « local console » / « livrable » |
| PATH-01 | Audit lib ≠ parcours HTTP complet | moyen | 1 | 01–03 | n/a | NON | NON | Serveur down | Relancer avec `npm run dev` + Playwright ×3 |
| HTTP-01 | Next.js non joignable | non_testable | 3 | 01–03 | UI non | NON | NON | Process absent | Démarrer serveur puis re-audit UI |
| MOB-01 | Pas d’accès inbox/device Yoann | non_testable | 1 | — | n/a | NON vérif. | NON vérif. | Limite agent | Fournir accès/captures Yoann |
| EMP-01 | Session EMPLOYE UI non testée | non_testable | 0 | — | partiel lib | n/a | n/a | Scope | Créer EMPLOYE-AUDIT + UI ×3 |

---

## 13. Ce qui a fonctionné (avec preuves, sans valider la clôture)

- Isolation commandes entre clients d’audit ×3  
- Blocage stock insuffisant ×3  
- Refus CA A.V.A. pour EMPLOYE ×3  
- A.V.A. Gestion sans conseil produit sur questions testées  
- Alignement résumé A.V.A. / compteur DB du jour  
- Génération PDF rapports test ×3 + skip e-mail test  
- Journalisation honnête du dernier rapport (`CONSOLE_ONLY_NOT_DELIVERED`)

**Aucun de ces succès ne valide seuls les parcours e-mail/push/paiement/UI.**

---

## 14. Conditions §14 — checklist clôture

| Condition bloquante | État |
|---------------------|------|
| Aucun e-mail réellement reçu | **OUI — bloque** |
| Aucune push réellement reçue | **OUI — bloque** |
| Mode audit encore absent / non reverrouillé | **OUI — bloque** (inexistant) |
| Service déclaré OK sans preuve réelle | **évité** (ce rapport refuse la clôture) |
| Tests UI une seule fois / absents | **absents — bloque couverture** |
| Accès externes manquants | **OUI — bloque** |

---

## 15. Données laissées en base (transparence)

Sans correction métier, l’audit a **créé** :

- 3 users `*@allvaps-audit.local`  
- 12 orders `PENDING`  
- plusieurs `ManagementReport` test  
- `NotificationEvent` / `AdminAlert` de test  
- 1 `EmailLog` SKIPPED console pour rapport  

**À traiter dans une phase future (après validation Yoann) :** nettoyage ou marquage de ces données d’audit — **non fait maintenant**.

---

## 16. Prochaine étape recommandée (hors scope — pas appliquée)

1. Yoann valide ce rapport + fournit captures inbox / push si disponibles.  
2. Prompt de correction séparé : SMTP, push, `AUDIT_ONLY`, idempotence event, SENT console.  
3. Re-audit complet avec `npm run dev`, 3 navigateurs, 3 paiements test, preuves + boîte.

---

**Fin du rapport — aucune correction appliquée.**  
**Statut :** `AUDIT_INCOMPLET_PREUVES_EXTERNES_MANQUANTES`
