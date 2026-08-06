# Inbox export SumUp (stock absolu + base push)

SumUp **n’a pas d’API inventaire/catalogue publique**.

## Pull (stock) — manuel (conservé)

1. SumUp → **Articles** → Exporter
2. Déposer ici (`*_items-export_*.csv`)
3. `npm run sumup:connect-stock`

## Pull — automatique (nouveau)

```bash
npm run sumup:inbox-watch
```

- Surveille `inbox_sumup/`
- Détecte un nouveau CSV
- Calcule le **hash SHA-256**
- **Ne réimporte jamais** le même contenu
- Lance le même orchestrateur `connectSumUpStock`

## Push (noms + images) — obligatoire

Le connecteur génère `outbox_sumup/LATEST_items-push_ALLVAPS.csv`.

1. Importer ce fichier dans SumUp → Articles → Importer
2. Re-exporter ici pour confirmer
3. `SUMUP_PUSH_PUBLIC_BASE_URL=https://votre-domaine` pour les images

Voir `docs/SUMUP_CATALOGUE_SYNC.md` et `docs/RAPPORT_FINAL_SYNC_SUMUP.md`.
