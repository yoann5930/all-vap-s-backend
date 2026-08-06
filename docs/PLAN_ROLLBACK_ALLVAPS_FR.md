# Plan de rollback — allvaps.fr

**Date :** 2026-08-06

## État de référence sauvegardé

| Élément | Valeur |
|---|---|
| Commit production | `d5a64904ce789119745f885d72e3ff07a7498843` |
| Branche Git locale backup | `backup/production-d5a6490-20260806` |
| Tag annoté | `backup/prod-allvaps-fr-20260806-d5a6490` |
| Déploiement Vercel Production | GitHub deployment `5778338241` |
| URL déploiement | `https://all-vap-s-backend-pdjw8klif-yoann3.vercel.app` |

## Méthode de restauration (si un futur déploiement casse)

1. Sur GitHub/Vercel : redéployer / promouvoir le déploiement du SHA `d5a6490` (ou rollback Vercel Instant).
2. Ou : `git push origin d5a6490:main` **uniquement** si un commit ultérieur a cassé la prod (évite force-push si possible : revert commit).
3. Préférer `git revert` des commits fautifs sur `main` plutôt que `reset --hard` public.
4. **Ne jamais** restaurer une base locale DEMO vers PostgreSQL prod.
5. Si migration destructive un jour : restaurer dump PostgreSQL (à créer avant migration — non requis ici car aucune migration).

## Critères de rollback immédiat

- Inventaire cassé (scan / login / sessions)
- Catalogue vide inattendu
- Perte prix / stock / EAN / SKU / SumUp
- Erreur Prisma généralisée
- Auth cassée
- Panier cassé
- Erreurs 500 majeures
- A.V.A. bloque le site
- Images massivement absentes (régression assets)

## Note mission actuelle

Aucun nouveau commit applicatif n’a été poussé sur `main` dans cette mission (code déjà aligné). Rollback non déclenché.
