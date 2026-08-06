# Manifeste campagne — CLIENT-TEST-ACHAT-20260730-093007

**Statut données :** EN ATTENTE DE VALIDATION ET DE NETTOYAGE PAR YOANN  
**Ne rien supprimer** sans ordre explicite de Yoann.

## Métadonnées

| Champ | Valeur |
|-------|--------|
| Campagne | `CLIENT-TEST-ACHAT-20260730-093007` |
| Démarrage (UTC) | 2026-07-30T07:30:07Z (approx.) |
| Projet | `D:\all vaps\all-vap-s-backend` |
| Environnement | localhost:3000 — test sécurisé |

## Flags / préconditions (état pendant le test)

| Flag | Avant | Pendant test |
|------|-------|----------------|
| `MAIL_TEST_MODE` | true | **false** (destinataires réels = adresses de test contrôlées) |
| `SUMUP_SYNC_ENABLED` | true | **false** (pas de sync SumUp prod pendant le scénario) |
| `PAYMENT_TEST_MODE` | true | true |
| Viva keys | vides | vides → checkout `TEST_*` local |
| SumUp online checkout | non préféré | non utilisé (provider défaut viva + test) |
| Clés transporteurs | absentes | stubs uniquement |

## Objets créés (à compléter pendant le run)

### Comptes clients

| Alias | Email (masqué) | User ID | Notes |
|-------|----------------|---------|-------|
| CLIENT-TEST-01 | _à renseigner_ | | Retrait boutique |
| CLIENT-TEST-02 | _à renseigner_ | | Mondial Relay |
| CLIENT-TEST-03 | _à renseigner_ | | Relais Colis |

### Commandes / paiements

| Parcours | Order ID | Checkout ID | Livraison | Total | Statut |
|----------|----------|-------------|-----------|-------|--------|
| 01 | | | STORE_PICKUP | | |
| 02 | | | MONDIAL_RELAY | | |
| 03 | | | RELAIS_COLIS | | |

### E-mails (EmailLog IDs)

_à renseigner_

### Notifications / documents / événements

_à renseigner_

### Preuves fichiers

- `captures/`
- `logs/`
- `evidence/`

## Nettoyage ultérieur (checklist Yoann)

- [ ] 3 comptes clients test
- [ ] Commandes associées + items + historique
- [ ] Paiements / checkout `TEST_*`
- [ ] EmailLog liés
- [ ] Documents commande (PDF) liés
- [ ] NotificationEvent / deliveries liés
- [ ] Tokens confirmation e-mail
- [ ] Mode AUDIT désactiver si encore actif
- [ ] Restaurer `MAIL_TEST_MODE` / `SUMUP_SYNC_ENABLED` si besoin
- [ ] Dossier `docs/test-client/CLIENT-TEST-ACHAT-20260730-093007/`
- [ ] `tmp/client-test-campaign-secrets.json` (gitignored)
