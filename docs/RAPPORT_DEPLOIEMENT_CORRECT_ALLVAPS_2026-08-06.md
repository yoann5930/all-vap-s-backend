# Rapport — déploiement correct allvaps.fr (2026-08-06)

## Verdict

❌ **MAUVAISE VERSION TOUJOURS DÉPLOYÉE — CAUSE DOCUMENTÉE**

*(Plus précisément : la production sert bien le dépôt/branche GitHub connectés, mais la version Windows déclarée comme « bonne » n’est pas dans ce dépôt et ne peut donc pas être déployée depuis cet environnement.)*

---

## Cause exacte du mauvais déploiement

| | |
|---|---|
| Cause principale | Branche / dossier de référence `preprod/validation-all-vaps-2026-08-04` (`D:\all vaps\`) **jamais disponible** sur le remote Vercel |
| Ancien dépôt (confusion) | `yoann5930/all-vap-s` (stub 2026-07-01) — **non relié** au domaine |
| Ancien projet Vercel | N/A — domaine pointe déjà sur `yoann3/all-vap-s-backend` |
| Ancienne branche prod | `main` |
| Ancien commit prod | `d5a6490` |
| Bon dépôt (cible) | `yoann5930/all-vap-s-backend` *(déjà connecté)* |
| Bon projet Vercel | `yoann3/all-vap-s-backend` *(déjà connecté)* |
| Bonne branche | `preprod/validation-all-vaps-2026-08-04` — **manquante sur GitHub** |
| Bon commit | **inconnu** (branche absente) |
| Bon Root Directory | `/` (racine) — déjà correct |

## URLs

| | |
|---|---|
| Preview | **non créée** (rien de nouveau à prévisualiser sans la branche manquante) |
| Production | `https://www.allvaps.fr` (apex → www) — commit `d5a6490` |

## Données métier (aucune mutation)

| Contrôle | Résultat |
|---|---|
| Prix modifiés | **0** |
| Stocks modifiés | **0** |
| Produits modifiés | **0** |
| EAN modifiés | **0** |
| SKU modifiés | **0** |
| Données SumUp modifiées | **0** |
| Migrations destructives | **0** |

## Sauvegardes créées

- `backups/pre-deployment-recovery-2026-08-06/`
- `backups/pre-deployment-recovery-2026-08-06/git-diff.patch`
- Branche agent : `cursor/recovery-deploy-correct-20260806-e2e4`
- Tag déjà existant : `backup/prod-allvaps-fr-20260806-d5a6490`

## Rollback

Disponible vers `d5a6490` / déploiement Vercel `5778338241` — voir `docs/PLAN_ROLLBACK_ALLVAPS_FR.md`.

## Erreurs restantes / bloqueurs

1. Pousser depuis le PC : `preprod/validation-all-vaps-2026-08-04` → `origin` sur `all-vap-s-backend`
2. Ou ouvrir ce dossier Windows dans Cursor Cloud / synchroniser le worktree
3. Ensuite seulement : Preview Vercel → validation visuelle → Production

## Actions volontairement non faites

- Aucun nouveau projet Vercel/Render
- Aucun push sur `main`
- Aucune modification inventaire / catalogue / A.V.A. / design
- Aucun seed / migrate reset / db push prod
