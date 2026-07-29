# Synchronisation catalogue SumUp → All Vap's

## Architecture

- **PostgreSQL** = source de vérité stock / catalogue
- **SumUp API** = historique des transactions (ventes / remboursements)
- **Worker / Cron** = toutes les **30 minutes** (`SUMUP_SYNC_INTERVAL_SECONDS=1800`)
- **Exports CSV** après sync :
  - `catalogues/catalogue-magasin-all-vaps.csv`
  - `catalogues/catalogue-ava-all-vaps.csv`
- **Rapports** : `rapports/sumup-sync-latest.md`

## Composants

| Élément | Chemin |
|---------|--------|
| Client API | `lib/sumup/api-client.ts` |
| Sync | `lib/sumup/sync-service.ts` |
| Matching | `lib/sumup/transaction-matcher.ts` |
| Config | `lib/sumup/config.ts` |
| Worker CLI | `scripts/sumup-worker.ts` |
| Cron HTTP | `app/api/cron/sumup-sync/route.ts` |
| Export CSV | `lib/catalog/catalogue-csv-export.ts` |
| Cron Render | `render.yaml` → `*/30 * * * *` |

## Commandes npm

```bash
npm run sumup:test-connection   # ping API SumUp (clés requises)
npm run sumup:dry-run           # sync simulée
npm run sumup:sync-once         # une sync réelle (force, même si disabled)
npm run sumup:worker            # boucle 30 min (nécessite SUMUP_SYNC_ENABLED=true)
npm run sumup:test              # tests unitaires sans API
npm run catalog:export          # export magasin + A.V.A. depuis PostgreSQL
npm run catalog:test            # tests catalogue professionnel
```

## Variables d'environnement

| Variable | Rôle |
|----------|------|
| `SUMUP_API_KEY` | Clé API SumUp |
| `SUMUP_MERCHANT_CODE` | Code marchand |
| `SUMUP_SYNC_ENABLED` | `true` pour activer cron/worker |
| `SUMUP_SYNC_INTERVAL_SECONDS` | Défaut `1800` |
| `CRON_SECRET` | Bearer pour `/api/cron/sumup-sync` |
| `CATALOGUE_MAGASIN_PATH` | Chemin CSV magasin |
| `CATALOGUE_AVA_PATH` | Chemin CSV A.V.A. |

## Activer en production

1. Renseigner `SUMUP_API_KEY`, `SUMUP_MERCHANT_CODE`, `CRON_SECRET`
2. Mettre `SUMUP_SYNC_ENABLED=true`
3. Vérifier que le cron Render (ou le worker) appelle `POST/GET /api/cron/sumup-sync` avec `Authorization: Bearer $CRON_SECRET`
4. Contrôler `rapports/sumup-sync-latest.md` et les CSV dans `catalogues/`

## Règles métier

- Ventes appliquées uniquement si statut `SUCCESSFUL` ou `PAID_OUT` (pas `PENDING`)
- Idempotence via `SumUpSyncedTransaction` + `externalReference` mouvements stock
- Lignes non reconnues → `ProductMatch` (`UNMATCHED`) + `SyncError`
- Stock unique `GLOBAL_ALL_VAPS` (pas de stocks boutiques séparés dans cette sync)
