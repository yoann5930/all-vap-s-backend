# Outbox SumUp — push noms + images (obligation)

SumUp **n'a pas d'API catalogue**. La sync All Vap's → SumUp passe par ce CSV.

## Procédure obligatoire

- 1. Ouvrir SumUp → Articles (Item catalogue)
- 2. Importer le CSV généré dans outbox_sumup/ (même format que l'export)
- 3. Vérifier noms + images sur quelques e-liquides en caisse
- 4. Ré-exporter Articles → déposer dans inbox_sumup/
- 5. npm run sumup:connect-stock (confirme le pull)
- ⚠ Images préparées avec base https://www.allvaps.fr — le site doit servir ces URLs en HTTPS pour que SumUp les télécharge à l'import.

## Fichiers

- `LATEST_items-push_ALLVAPS.csv` — à importer dans SumUp
- `LATEST_items-push_manifest.json` — détail des lignes modifiées

## Variables

- `SUMUP_PUSH_PUBLIC_BASE_URL` — URL HTTPS publique du site (images)
- `SUMUP_OUTBOX_PATH` — dossier outbox (défaut `outbox_sumup`)
