# Rapport d’audit — §§40 à 46 (multi-clients, preuves, nettoyage, restauration)

**Campagne :** `AUDIT-2026-07-30-MULTI`  
**Date :** 2026-07-30  
**Règle :** aucune correction métier appliquée  
**Statut affiché (obligatoire) :**

# AUDIT INCOMPLET — AU MOINS UNE VALIDATION RÉELLE OU UNE OPÉRATION DE NETTOYAGE RESTE À EFFECTUER

**Ne pas lire :** `AUDIT TERMINÉ`  
**Également :** `AUDIT NON VALIDÉ — LES PREUVES RÉELLES D’ENVOI OU DE RÉCEPTION SONT INCOMPLÈTES`

---

## A. Documents liés

| Fichier | Rôle |
|---------|------|
| [`AUDIT_MULTI_SCENARIOS_RAPPORT.md`](./AUDIT_MULTI_SCENARIOS_RAPPORT.md) | Audit initial multi-scénarios |
| [`AUDIT_MULTI_SCENARIOS_EVIDENCE.json`](./AUDIT_MULTI_SCENARIOS_EVIDENCE.json) | Preuves brutes exécution |
| [`AUDIT_CLEANUP_MANIFEST.json`](./AUDIT_CLEANUP_MANIFEST.json) | Manifeste nettoyage + actions |
| `scripts/audit-multi-scenarios.ts` | Exécuteur campagne (historique) |
| `scripts/audit-cleanup-campaign.ts` | Nettoyage contrôlé |
| `scripts/audit-verify-post-cleanup.ts` | Vérif post-nettoyage |

---

## B. §40 — Multi-clients et répétitions

### Profils

| Profil | E-mail audit | Fidélité Fidelatoo | Points attribués |
|--------|--------------|--------------------|------------------|
| Client Audit 1 | `audit.c1.1@allvaps-audit.local` | **aucun compte créé** | **0** |
| Client Audit 2 | `audit.c2.2@allvaps-audit.local` | aucun | **0** |
| Client Audit 3 | `audit.c3.3@allvaps-audit.local` | aucun | **0** |

Profils **supprimés** après nettoyage DB (voir §44).

### Checklist 25 étapes × client — couverture réelle

| # | Étape | Client 1 | Client 2 | Client 3 | ×3 ? | Preuve / écart |
|---|-------|----------|----------|----------|------|----------------|
| 1 | Arrivée site | NON | NON | NON | — | HTTP localhost down |
| 2 | Contrôle majorité | NON | NON | NON | — | UI non joignable |
| 3 | Navigation catégories | NON | NON | NON | — | UI |
| 4 | Recherche produits | NON | NON | NON | — | UI |
| 5 | Produits en stock | PARTIEL | PARTIEL | PARTIEL | oui | Sélection StockLevel via lib |
| 6 | Hors stock via mode Audit | **IMPOSSIBLE** | idem | idem | — | Mode Audit **inexistant** |
| 7–9 | Panier add/qty/remove | NON | NON | NON | — | UI / pas de panier HTTP |
| 10–11 | Compte + connexion | PARTIEL | PARTIEL | PARTIEL | — | Users créés en DB, **pas** login cookie UI |
| 12–13 | Adresse + livraison | PARTIEL | PARTIEL | PARTIEL | oui | Champs order : 3 modes livraison |
| 14–15 | Paiement test officiel + retour | **NON** | NON | NON | — | Pas de fulfill PAID (stock / preuves) |
| 16 | Commande audit | OUI PENDING | OUI | OUI | oui (9+3) | Puis **supprimées** au nettoyage |
| 17 | Documents | NON | NON | NON | — | 0 doc (PENDING) |
| 18 | E-mails reçus boîte | **NON** | NON | NON | — | SMTP absent |
| 19 | Notifications push reçues | **NON** | NON | NON | — | Push non configuré |
| 20 | Compte client voit commande | NON UI | — | — | — | Isolation DB OK ×3 |
| 21 | Admin voit commande | NON UI | — | — | — | Serveur down |
| 22 | A.V.A. Gestion | OUI (global) | — | — | oui | Questions ×3 tours |
| 23 | Journaux | OUI | — | — | — | EmailLog / NotificationDelivery |
| 24 | Absence doublon | PARTIEL | — | — | — | Events dupliquables (cf. NOTIF-DUP-02) |
| 25 | Déconnexion | NON | NON | NON | — | UI |

### Scénarios simultanés / concurrence

| Scénario | Exécuté ? | Résultat |
|----------|-----------|----------|
| 3 commandes successives même client | OUI (PENDING ×3 / client) | Créées puis nettoyées |
| 1 commande / 3 clients | OUI | OK |
| 2 commandes quasi simultanées | PARTIEL (boucle rapide script) | Pas de charge HTTP réelle |
| 2 clients dernier exemplaire | **NON** | Non instrumenté |
| Refresh page confirmation | NON | UI down |
| Retours URL paiement | NON | Pas de paiement |
| Webhook test répété | NON | Non rejoué |
| Multi-onglets / appareils | NON | Non dispo |
| Login/logout répétés | NON | UI |
| Expiration session | NON | UI |
| Réseau coupé/rétabli | NON | Non dispo |
| Admin après chaque client | **NON UI** | Bloqué HTTP |
| Admin global après 3 | **NON UI** | Bloqué HTTP |

### Contrôles admin ×3 après chaque client

**Non réalisés en interface.** Cause : `localhost:3000` inaccessible.  
Les commandes existaient en DB au moment de la campagne (preuve JSON) puis ont été purgées.

---

## C. §41 — Preuves e-mails et notifications

### Chaîne e-mail (campagne)

| Étape | Observé |
|-------|---------|
| Déclencheur | Rapport management + logs historiques |
| File / EmailLog | oui |
| Fournisseur SMTP/Resend | **non configuré** (`smtpHasPassword=false`) |
| Statut serveur | `SKIPPED` + `CONSOLE_ONLY_NOT_DELIVERED` (dernier rapport) ; historiques `SENT`+`console` trompeurs |
| Réception boîte test | **0** |
| Pièce jointe ouverte | **non** (console only) |
| Liens testés | **non** |

### Chaîne push

| Étape | Observé |
|-------|---------|
| Déclencheur test | oui (`not_configured`) |
| Device token | **0 appareil** |
| Fournisseur FCM | non |
| Reçu app ouverte / fond / fermée / verrouillée | **NON** |
| Réseau cut/restore | **NON** |

### Tableau preuves par commande d’audit

Toutes les commandes étaient `PENDING` sans fulfill → **aucun** e-mail confirmation / admin new order / push « nouvelle commande » attendu métier n’a été réellement produit puis reçu.

| orderId (ex.) | Dest. masqué | Objet | Envoi | Réception | Canal | Statut serveur | Observé | PJ | Doublon |
|---------------|--------------|-------|-------|-----------|-------|----------------|---------|----|---------|
| *(12 PENDING)* | n/a | — | — | **NON** | — | n/a | non reçu | non | n/a |
| Rapport `cms736nf…` | `a***@gmail.com` | Rapport de gestion… | console | **NON** | email | SKIPPED | non en boîte | PDF local only | non |

**Conclusion §41 :** preuves réelles **incomplètes** → audit **non validé**.

---

## D. §42–43 — Identification et nettoyage Gmail

### Marquage attendu vs réel

| Attendu | Réel |
|---------|------|
| Préfixe `[AUDIT ALL VAP’S — TEST]` | **Non implémenté** dans le service e-mail |
| Métadonnées campagne + orderId | Partiel via EmailLog type / relatedOrderId |
| Identifiant campagne | `AUDIT-2026-07-30-MULTI` (manifeste local uniquement) |

### Nettoyage Gmail

| Indicateur | Valeur |
|------------|--------|
| E-mails générés (logs candidats) | 7 |
| Réellement reçus | **0** |
| Vérifiés en boîte | **0** |
| Déplacés corbeille | **0** |
| Conservés (journaux DB) | 7 |
| Non supprimés par sécurité | tous les Gmail (aucun message provider) |
| Erreurs nettoyage Gmail | aucune opération tentée |

**Raison :** API Gmail non configurée + aucun message réellement livré → **ne rien supprimer** (procédure respectée).  
Libellé `Audit All Vap’s — À supprimer` : **non appliqué** (connecteur absent).  
**Aucune suppression définitive. Aucun vidage corbeille.**

---

## E. §44 — Nettoyage autres données de test

| Catégorie | Statut | Détail |
|-----------|--------|--------|
| Commandes audit PENDING | **supprimé** | 12 |
| Users `@allvaps-audit.local` | **supprimé** | 3 |
| ManagementReport isTest / audit* | **supprimé** | 5 |
| NotificationEvent test / AUDIT-* | **supprimé** | 6 |
| AdminAlert isTest | **supprimé** | 2 |
| SmsOutbox isTest | aucun trouvé | 0 |
| Documents commandes audit | aucun | 0 |
| EmailLog | **conservé comme preuve** | 7 |
| Notifications réelles / commandes réelles | **non touchées** | — |
| Stock réel | **non modifié** par cleanup | — |
| Fidélité | **0 point** sur users audit | pas Fidelatoo |

Post-vérif leftovers : `auditUsers=0`, `auditOrders=0`, `testEvents=0`, `testReports=0`, `testAlerts=0`.

Manifeste complet : [`AUDIT_CLEANUP_MANIFEST.json`](./AUDIT_CLEANUP_MANIFEST.json).

### Exclusion stats production

- Aucune commande audit n’était `PAID` → **pas entrée dans CA confirmé** via fulfill.  
- Absence de flag `AUDIT_ONLY` en base → **pas de séparation native** production/audit dans A.V.A. (lacune produit).  
- Après cleanup, plus de commandes audit en DB.

---

## F. §45 — Restauration mode Audit

| Contrôle | Résultat |
|----------|----------|
| Désactiver mode Audit | **N/A** — mode **jamais présent** dans le code |
| Reverrouiller hors stock audit | **N/A** — aucun déverrouillage audit n’a eu lieu |
| Règles panier/commande normales | **en vigueur** (pas de flag temporaire trouvé) |
| Refus hors stock | **prouvé** via produit `stock=0` legacy → `STOCK_INSUFFICIENT` |
| Refus sur-quantité | **prouvé** (`available+50` → bloqué) |
| StockLevel `availableQuantity<=0` | **0 ligne** au moment du post-check (état catalogue) |
| Events audit → e-mails/push | Plus d’events test ; SMTP/push toujours off |
| Config temporaire restante | **non détectée** (hors env vars habituelles) |

**Preuve refus post-campagne :**

```json
{
  "legacyBlock": {
    "productId": "cms6euefu00u1utmkyur6sk2f",
    "stock": 0,
    "ok": false,
    "code": "STOCK_INSUFFICIENT"
  },
  "overQty": { "blocked": true, "code": "STOCK_INSUFFICIENT" }
}
```

UI « ouvrir fiche → ajouter panier → commander » : **non rejouée** (HTTP down) → preuve UI manquante dans §45 étapes 1–8 navigateur.

---

## G. §46 — Conditions de fin

| Condition | Prouvée ? |
|-----------|-----------|
| ≥3 clients parcours obligatoires | **NON** (parcours UI incomplets) |
| Chaque parcours majeur ×3 | **NON** |
| Scénarios simultanés | **PARTIEL / NON** |
| Visible client + admin | **NON UI** |
| A.V.A. Gestion retrouve audits | PARTIEL puis données purgées |
| E-mails réellement reçus | **NON** |
| Notifications réellement reçues | **NON** |
| Documents réellement ouverts | **NON** |
| Liens réellement testés | **NON** |
| Doublons recherchés | PARTIEL |
| Erreurs intermittentes recherchées | PARTIEL |
| Production non affectée | PARTIEL (PENDING sans PAID) |
| E-mails test identifiés précisément | **NON** (préfixe objet non implémenté) |
| E-mails test → corbeille si sûr | **NON** (0 message / pas d’API) |
| Aucun e-mail réel supprimé | **OUI** (aucune suppression Gmail) |
| Autres données test nettoyées | **OUI** (DB audit) |
| Mode Audit désactivé | **N/A / NON prouvable comme désactivation** |
| Hors stock reverrouillé | **N/A** (jamais déverrouillé) + garde stock OK en lib |
| Comportement prod revérifié UI | **NON** |

→ **Un seul échec suffit :** plusieurs conditions non prouvées → **pas de fin d’audit**.

---

## H. Anomalies ajoutées / confirmées (sans correction)

| ID | Gravité | Problème |
|----|---------|----------|
| MAIL-01 | critique | Pas de réception e-mail réelle |
| MAIL-03 | critique | Historique `SENT`+`console` |
| PUSH-01 | critique | Pas de push réelle |
| AUD-01 | critique | Mode Audit / `AUDIT_ONLY` inexistant |
| HTTP-01 | non_testable | Next.js down → UI/admin/sessions |
| GMAIL-CLN-01 | non_testable | Cleanup Gmail impossible sans API + messages |
| MARK-01 | majeur | Pas de préfixe `[AUDIT ALL VAP’S — TEST]` dans les envois |
| CONC-01 | non_testable | Course au dernier stock / webhooks non joués |
| STK-POST-01 | information | Plus de `StockLevel<=0` au post-check ; refus prouvé via `Product.stock=0` + over-qty |

---

## I. Fidélité

- **Aucun** compte Fidelatoo créé pour l’audit.  
- Points loyalty users audit avant suppression : **0**.

---

## J. Prochaines actions (pour Yoann — hors exécution)

1. Démarrer `npm run dev` + fournir SMTP réel / boîte test + device push.  
2. Prompt **correction** : mode Audit isolé, marquage e-mails, exclusion CA, SENT console.  
3. Rejouer §§40–41 en HTTP réel ×3 clients.  
4. Ensuite seulement : cleanup Gmail avec manifeste + validation humaine pour corbeille.

---

**Fin du complément §§40–46 — aucune correction métier.**
