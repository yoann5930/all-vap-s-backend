# Transporteurs — documentation officielle & choix d’intégration All Vap’s

**La Poste / Colissimo : exclus** — aucun développement.

Date de revue : 2026-07-30  
Statut accès contrat All Vap’s : **clés API absentes** dans l’environnement local → **mode assisté** actif.

---

## Mondial Relay

### Documentation officielle consultée

| Source | URL |
|--------|-----|
| Présentation WebServices | https://storage.mondialrelay.fr/Presentation%20of%20WebServices.pdf |
| Dual Carrier (REST API V2) | https://storage.mondialrelay.fr/web-service-dual-carrier-v-271.pdf |
| Solution Web Service (legacy SOAP) | https://storage.mondialrelay.fr/solution-web-service-v514-FR.pdf |
| Import CSV Connect | https://storage.mondialrelay.fr/Cahier%20des%20charges%20FR%20CSV.pdf |

### Possibilités

| Voie | Disponible | Notes |
|------|------------|-------|
| **API REST Dual Carrier** (`connect-api[-sandbox].mondialrelay.com/api/shipment`) | Oui (contrat Connect) | Voie recommandée pour nouvelles intégrations ; crée expédition + étiquette PDF |
| SOAP WSI2_CreationEtiquette | Legacy | Déconseillé pour nouveaux comptes (restriction progressive) |
| Import CSV Connect | Oui | Étiquettes PDF récupérées hors site |

### Accès requis (non présents localement)

- Compte **Connect** Mondial Relay
- Identifiants API Dual Carrier (sandbox + prod)
- Variables prévues : `MONDIAL_RELAY_API_KEY` (+ éventuels `MONDIAL_RELAY_ENSEIGNE`, `MONDIAL_RELAY_PRIVATE_KEY` à ajouter au branchement HTTP)

### Décision All Vap’s

Sans credentials : **mode assisté** (`lib/shipping/workflow.ts`) — pack données + import PDF officiel + envoi gérant.  
Aucun numéro de suivi / QR inventé.  
Branchement HTTP Dual Carrier : **À CORRIGER** dès réception des accès contrat.

---

## Relais Colis

### Documentation officielle consultée

| Source | Contenu |
|--------|---------|
| Présentation Relais Colis FIRST 2025 | Espace pro, Easy Upload CSV, modules e-commerce |
| Widget Relais Colis 2025 | Sélection point relais checkout — **ne crée pas** les étiquettes |
| Modules WooCommerce / PrestaShop / Shopify | Génération d’étiquettes via clés module (activation + hash) |

### Possibilités

| Voie | Disponible pour site custom | Notes |
|------|-----------------------------|-------|
| Widget carte points relais | Oui | Checkout UX seulement |
| Easy Upload CSV sur relaiscolis.com | Oui | Étiquettes hors site → import assisté All Vap’s |
| Modules Woo/PS/Shopify | N/A (Next.js custom) | Clés module non exposées comme API publique ouverte |
| API REST publique étiquettes | **Non documentée** pour intégration libre | Contacter RelaisColisSurMonSite@relaiscolis.com |

### Décision All Vap’s

**Mode assisté obligatoire** tant qu’aucune API/contrat module n’est fourni : préparer pack, importer étiquette PDF officielle, archiver, e-mail gérant.  
La Poste non concernée.

---

## Mapping code

| Fichier | Rôle |
|---------|------|
| `lib/shipping/carriers.ts` | Stub honnête (configured / non configured) |
| `lib/shipping/workflow.ts` | Auto post-paiement + import assisté |
| `app/api/admin/shipments` | Import PDF + tracking |
| `lib/shipping/options.ts` | MR + RC + retrait — **pas** Colissimo |
