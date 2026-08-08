# Déploiement allvaps.fr — rapport final

**Date :** 2026-08-06  
**Verdict :** ✅ BONNE VERSION LOCALE VALIDÉE ET DÉPLOYÉE SUR ALLVAPS.FR

---

## Chaîne prouvée

```text
/workspace (localhost:3000, commit d5a6490)
→ github.com/yoann5930/all-vap-s-backend
→ branche main
→ Vercel yoann3/all-vap-s-backend (cdg1)
→ https://allvaps.fr → https://www.allvaps.fr
```

## Synthèse opérationnelle

| Élément | Valeur |
|---|---|
| Chemin version locale déployée | `/workspace` |
| Dépôt Git | `https://github.com/yoann5930/all-vap-s-backend` |
| Branche production | `main` |
| Commit déployé (ancien = nouveau) | `d5a64904ce789119745f885d72e3ff07a7498843` |
| Plateforme | Vercel |
| URL Preview (même SHA) | `https://all-vap-s-backend-pdjw8klif-yoann3.vercel.app` |
| URL production | `https://www.allvaps.fr` (apex `https://allvaps.fr`) |
| Build local | OK (`npm run build`) |
| Build distant | OK (deployment Production success) |
| Migrations exécutées | **aucune** (rien de nouveau) |
| Sauvegarde | branche `backup/production-d5a6490-20260806` + tag `backup/prod-allvaps-fr-20260806-d5a6490` |
| Inventaire avant | 40 produits — fingerprint `d56394f6…` |
| Inventaire après | 40 produits — fingerprint identique |
| Δ prix / stocks / produits / EAN / SKU / SumUp | **0** |
| Tests A.V.A. | routes `/ia` 200 local+prod ; module exporté |
| Tests catalogue | `/api/products` 200 ; UI boutique 200 |
| Tests compte | `/login` 200 |
| Erreurs production majeures | aucune détectée sur smokes |
| Rollback disponible | oui — voir `docs/PLAN_ROLLBACK_ALLVAPS_FR.md` |

## Cause du signal « mauvaise interface »

Le **code UI** localhost et production sont **identiques**.  
L’écart visible vient du **mode DEMO local** (seed multi-marques) vs **base PostgreSQL production** (Liquidarom, prix/images souvent vides).  
**Ne pas** synchroniser la démo vers la prod.

## INVENTORY_PROTECTED_FILES

Fichiers inventaire non touchés (liste complète hashée en audit) — familles :

- `app/inventaire/**`
- `app/api/inventaire/**`
- `app/api/admin/inventaires/**`
- `app/api/admin/inventory/**`
- `components/inventory/**`
- `lib/inventory/**`
- migrations `202608041*` dual-store / staff / tracking
- `middleware.ts` (rewrite inventaire host)
- headers caméra `next.config.ts` / `vercel.json`
- `public/sw.js`, `public/manifest-inventaire.webmanifest`

## A.V.A. export

- Archive : `AVA_ALLVAPS_EXPORT.zip` (41 fichiers)
- Carte : `AVA_FILE_MAP.md`

## Actions volontairement non faites

- Aucun push sur `main` (déjà à jour)
- Aucun import catalogue / seed / migrate reset
- Aucune fusion automatique des PR #3/#4/#5/#6 (non présentes sur le localhost validé)
