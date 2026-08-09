# Audit to Patch Matrix

| Finding | Severity | Problem | Correction | Files | Tests | Status | NeedsCursorIntegration | NeedsHumanValidation |
|---|---|---|---|---|---|---|---:|---:|
| AVAC-AGE-01 | CRITICAL | Correction matériel classée mineur | Détection âge explicite séparée | `patch/ava-client/core.ts` | âge/correction | PREPARED | YES | YES |
| AVAC-SOCIAL-01 | HIGH | Salut déclenche catalogue | Routeur social prioritaire | `patch/ava-client/core.ts` | small talk | PREPARED | YES | YES |
| AVAC-MEM-01 | HIGH | Contraintes perdues | État conversationnel structuré | `patch/ava-client/core.ts` | mémoire | PREPARED | YES | YES |
| AVAC-MATCH-01 | HIGH | XROS 4 devient XROS 3 | Exact match avant alias/fuzzy | `patch/ava-client/core.ts` | exact match | PREPARED | YES | YES |
| CAT-TYPE-01 | HIGH | Concentrés mélangés aux e-liquides | Taxonomie canonique + profil conseil | `patch/catalogue/core.ts` | taxonomie/conseils | PREPARED | YES | YES |
| CAT-REC-01 | MEDIUM | Recommandations de types différents | Filtre sameProductType | `patch/catalogue/core.ts` | recommandations | PREPARED | YES | YES |
| SEARCH-01 | HIGH | Recherche publique inactive | Contrat central SITE/A.V.A. | `patch/search/core.ts` | états/requêtes | PREPARED | YES | YES |
| STOCK-01 | CRITICAL | Dashboard/list incohérents | Contrat métriques/listes | `patch/admin/core.ts` | cohérence | PREPARED | YES | YES |
| INV-01 | CRITICAL | Chargement infini | AsyncState avec ERROR/EMPTY | `patch/admin/core.ts` | états | PREPARED | YES | YES |
| PRICE-01 | CRITICAL | Actif à 0 € | Garde NOT_PURCHASABLE | `patch/admin/core.ts` | prix | PREPARED | YES | YES |
| EAN-01 | HIGH | EAN absents/invalides | Validation non destructive | `scripts/dry-run/quality-audit.ts` | checksum | PREPARED | YES | YES |
| SKU-01 | HIGH | 1892 SKU absents | Rapport dry-run, aucune écriture | `scripts/dry-run/quality-audit.ts` | simulation | PREPARED | YES | YES |
| AVAA-SOCIAL-01 | HIGH | Small talk appelle outils | Routeur admin | `patch/ava-admin/core.ts` | salut/ça va | PREPARED | YES | YES |
| AVAA-DATA-01 | HIGH | Analyse ventes indisponible | Outils structurés sans données inventées | `patch/ava-admin/core.ts` | adapters | PREPARED | YES | YES |
| AVATAR-01 | HIGH | Bouche désynchronisée | Contrôleur visème/amplitude/fallback | `patch/ava-avatar/core.ts` | scénario audio | PREPARED | YES | YES |
| AVATAR-02 | HIGH | Blink mécanique/déformé | Blink irrégulier borné | `patch/ava-avatar/core.ts` | 30 s idle | PREPARED | YES | YES |

