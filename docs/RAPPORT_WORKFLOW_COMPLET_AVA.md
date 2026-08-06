# Rapport workflow complet A.V.A. — circuit commandes / documents / transporteurs

**Campagne de test :** `WF-AVA-20260730085409`  
**Mise à jour :** 2026-07-30 (BCC circuit, Q&A mémoire, doc APIs officielles)  
**Statut données :** EN ATTENTE DE VALIDATION ET DE NETTOYAGE PAR YOANN  
**Aucune suppression** effectuée.

Preuves : `docs/test-client/WF-AVA-20260730085409/`  
Doc transporteurs : `docs/TRANSPORTEURS_API_OFFICIELLES.md`

---

## 1. Objectif atteint (architecture)

| Domaine | Implémentation |
|---------|----------------|
| Mémoire client A.V.A. | `AvaClientMemory` + `AvaMemoryArtifact` — `lib/ava-memory/service.ts` — API `/api/admin/ava-memory` |
| Circuit documentaire | BC + facture : **TO client + BCC gérant/A.V.A.** (`circuit-bcc`) ; PREP_SLIP gérant seul |
| Bon de préparation | PDF boutique (n° commande, client, produits, dosages, transporteur, point relais, observations) |
| Mondial Relay | Dual Carrier documenté ; sans clés → **mode assisté** validé |
| Relais Colis | Pas d’API publique étiquettes → **mode assisté** (Easy Upload / import PDF) |
| La Poste | **Exclue** |
| Anti-doublons | Unique doc/type ; clés `doc:…:circuit-bcc`, `shipment:…`, `mem:…` |
| A.V.A. Gestion | Q&A : dernière commande, facture, étiquette, colis, préparation, goûts, recommandations |

---

## 2. Destinataires documents / e-mails

| Document | Client | A.V.A. | Gérant |
|----------|--------|--------|--------|
| Bon de commande | TO | BCC (si boîte distincte) / mémoire | BCC |
| Facture | TO | BCC / mémoire | BCC |
| Bon de préparation | **jamais** | archive | TO seul |
| Étiquette + suivi | non | archive | TO (pack expédition) |

---

## 3. Transporteurs (revue officielle)

| Transporteur | API officielle | Accès local | Mode All Vap’s |
|--------------|----------------|-------------|----------------|
| Mondial Relay | Dual Carrier REST sandbox/prod | clés absentes | **assisted** VALIDÉ |
| Relais Colis | Widget + Easy Upload / modules ; pas d’API libre étiquettes | n/a | **assisted** VALIDÉ |
| La Poste | — | — | **exclu** VALIDÉ |

---

## 4. Résultats campagne WF-AVA-20260730085409

| Parcours | Commande | Paiement | Docs | Expédition | Mémoire | Statut |
|----------|----------|----------|------|------------|---------|--------|
| Mondial Relay | `cms7a1vmh000futawxdno3ftw` | `TEST_*` PAID | 3 uniques | assisted → label importée | 11 artefacts | VALIDÉ (SMTP) |
| Relais Colis | `cms7a2h80003xutawygtznvqc` | `TEST_*` PAID | 3 uniques | assisted → label importée | ok | VALIDÉ (SMTP) |

Idempotence e-mail / double sync / double import : **OK**.

---

## 5. Tableau récapitulatif

| Étape | Statut |
|-------|--------|
| Création compte test | VALIDÉ |
| Panier / commande | VALIDÉ |
| Paiement test | VALIDÉ |
| Bon de commande + facture (SMTP) | VALIDÉ |
| Circuit BCC client/gérant/A.V.A. | VALIDÉ (code) — retest live recommandé |
| Réception inbox Gmail réelle | NON TESTABLE (preuve inbox séparée) |
| Bon de préparation interne only | VALIDÉ |
| MR API Dual Carrier live | NON TESTABLE (pas de credentials) |
| MR mode assisté | VALIDÉ |
| Relais Colis API publique | NON TESTABLE (inexistante / non fournie) |
| Relais Colis mode assisté | VALIDÉ |
| Étiquette + suivi + e-mail gérant | VALIDÉ |
| Mémoire A.V.A. + Q&A | VALIDÉ |
| Anti-doublons | VALIDÉ |
| Exclusion La Poste | VALIDÉ |
| Suppression données test | **NON FAIT** (attente Yoann) |

---

## 6. Erreurs / suites

| Point | Action |
|-------|--------|
| Credentials Mondial Relay Connect | Brancher HTTP Dual Carrier quand fournis |
| Contrat Relais Colis | Confirmer avec RelaisColisSurMonSite@relaiscolis.com si API/module custom |
| Preuve Gmail inbox | IMAP / capture manuelle Yoann |
| Données test | Conservées jusqu’à ordre de nettoyage |

---

## 7. Verdict

**Circuit logiciel opérationnel** en local (paiement test, documents, mémoire, MR/RC assisté, anti-doublons, La Poste exclue).

**Pas « terminé » métier strict** tant que : (1) accès API MR réels ou validation assisté-only, (2) preuve réception Gmail, (3) validation Yoann + autorisation nettoyage.

**Ne rien supprimer sans ordre explicite de Yoann.**
