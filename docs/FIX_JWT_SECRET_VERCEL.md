# Fix urgent — JWT_SECRET manquant sur Vercel

**Symptôme :** connexion employés → « Erreur serveur » / puis message JWT_SECRET.

**Diagnostic (2026-08-06) :**
- Mauvais mot de passe → `401` (OK)
- Bon mot de passe → échec création session faute de `JWT_SECRET` sur le projet Vercel `yoann3/all-vap-s-backend`

## Action (Yoann) — 2 minutes

1. Ouvrir https://vercel.com/yoann3/all-vap-s-backend/settings/environment-variables
2. Ajouter pour **Production** (et Preview si besoin) :

| Name | Value |
|------|--------|
| `JWT_SECRET` | *(chaîne aléatoire ≥ 32 caractères — générer une fois, ne jamais committer)* |

3. **Redeploy** Production (Deployments → … → Redeploy) **sans** utiliser l’ancien build cache si proposé.
4. Tester : https://inventaire.allvaps.fr/login?next=/inventaire

## Codes employés

Les mots de passe temporaires déjà communiqués dans `.local/inventory-user-credentials.txt` restent valides une fois `JWT_SECRET` en place (hashes synchronisés en base via seed CI).

Après première connexion : changement de mot de passe forcé (`mustChangePassword`) selon le compte.
