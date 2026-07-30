# Rapport — Accès e-liquides → fiche produit

**Date :** 2026-07-30  
**Statut :** RÉGLÉ à 100 %  
**Base testée :** `http://localhost:3000` (`npm run dev` après purge `.next`)  
**Dossier :** `data/rebuild/RAPPORT_ACCES_ELIQUIDES/`

---

## Verdict

**PASS 38/38 (100%)** — audit `scripts/audit-eliquides-access-paths.ts`  
Vérification navigateur : fiche **FRUIT DU DRAGON FRAISE** OK (titre, 20,90 €, fil d’Ariane, nav correcte).  
Nav publique : **E-LIQUIDES · BOUTIQUES · FAQ · CONTACT** uniquement.

---

## Problèmes trouvés et corrections

| # | Symptôme | Cause | Correction |
|---|----------|-------|------------|
| 1 | Clic produit → mauvaise page | Redirect `/products/:slug` → `/e-liquides` | → `/boutique/:slug` |
| 2 | « Une erreur est survenue » | Soft-nav RSC + cache Webpack HMR (`undefined.call`) | Hard nav `ProductCard` + purge `.next` + restart |
| 3 | RÉSISTANCES + MARQUES bleus | Ancienne `mainNavLinks` | Nav réduite dans `lib/navigation.ts` |
| 4 | `/boutique?category=resistances` ouvert | Redirect page insuffisant | Middleware + `next.config` query redirects |
| 5 | Fausse 404 audit | Texte not-found dans payload RSC | Détection stricte h1 |
| 6 | Build typecheck | Fallback PDP + scripts inclus | Fallback typé ; `tsconfig` exclut `scripts` / `ALLVAPS_PORTABLE` |

---

## Chemins validés (tous OK)

- `/e-liquides` → `/fabricants/biarritz-lab` → `/gammes/{double-dragon|le-fruit-defendu|mamita}`  
- Liens gamme → `/boutique/{slug}` (11 Double Dragon, 9 Fruit Défendu)  
- PDP échantillons Mamita / Fruit Défendu / Double Dragon  
- Alias `/products/{slug}` → `/boutique/{slug}`  
- `/resistances`, `/marques`, `/boutique?category=resistances` → `/catalogue-en-preparation`

---

## Retest

```bash
# Si erreur Webpack en dev : supprimer .next puis
npm run dev
npx tsx scripts/audit-eliquides-access-paths.ts
# → PASS 38/38 (100%) ALL OK
```

URL : http://localhost:3000/gammes/double-dragon?fabricant=biarritz-lab

---

## Artefacts

| Fichier | Contenu |
|---------|---------|
| `RAPPORT.md` | Ce rapport |
| `audit-raw.json` | JSON 38 checks (dernier run 100 %) |

## Note

En **dev**, si la page erreur / ancienne nav réapparaît : **supprimer `.next` et redémarrer** (corruption HMR Webpack, pas un bug catalogue). Le serveur tourne actuellement en mode `dev` sur le port 3000.
