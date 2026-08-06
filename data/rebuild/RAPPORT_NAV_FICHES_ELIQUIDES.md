# Rapport — Navigation & fiches e-liquides 20 ml

Date : 2026-07-30  
Statut : corrigé (pas de commit / push / déploiement)

## Causes exactes

### Activation erronée de RÉSISTANCES (et risque MARQUES)

Fonction fautive : `isActiveLink` dans `components/layout/Header.tsx`.

Logique précédente pour tout lien hors cas e-liquides spéciaux :

```ts
return pathname === base || pathname.startsWith(base + "/");
```

Conséquence : **tout lien dont le `base` est `/boutique`** (ex. `/boutique?category=resistances`, futurs onglets catalogue) devenait actif sur **toutes** les fiches `/boutique/[slug]`.

Si plusieurs onglets pointaient vers `/boutique?…` (résistances, marques/filtres, etc.), **plusieurs pouvaient être bleus en même temps**.

De plus, l’onglet E-LIQUIDES **n’incluait pas** `/formats/*` ni les fiches `/boutique/[slug]` → il s’éteignait dès l’ouverture d’un produit.

### Erreur de fiche produit (« Une erreur est survenue »)

- Le produit `twenty-double-peche-20ml` **existe** en base, publié (`valide`, `visibleOnline`, `isActive`).
- Au moment du diagnostic, le chargement serveur renvoie **200** avec le bon contenu.
- Cause structurelle identifiée : le `try/catch` global de la page convertissait **toute** erreur satellite (similaires, avis, stock) en `product = null` → `notFound()`, ou une exception **après** le try (stock / `toCatalogProduct` / rendu) remontait vers `app/error.tsx` (« Une erreur est survenue ») au lieu d’isoler le champ défaillant.
- Correction : chargement produit strict ; erreurs isolées sur similaires / avis / stock ; `not-found` dédié ; garde-fous `profilGustatif` / `saveursSecondaires`.

## Route & slug

| Élément | Valeur |
|---------|--------|
| Route appelée | `/boutique/[slug]` |
| Slug Double Pêche | `twenty-double-peche-20ml` |
| Recherche DB | trouvé — e.Tasty / Twenty / 20 ml / catégorie « E-liquides 20 ml » |

Les 5 produits Twenty 20 ml publiés :

1. `twenty-double-peche-20ml`
2. `twenty-fruit-du-dragon-cerise-20ml`
3. `twenty-fruits-rouges-20ml`
4. `twenty-limonade-citron-cassis-20ml`
5. `twenty-menthe-polaire-20ml`

Liens format : déjà `href={/boutique/${p.slug}}` (slug DB, pas recalculé).

## Fichiers créés

- `lib/navigation/active-main-nav.ts` — `getActiveMainNavigation` (un seul onglet)
- `components/layout/MainNavContext.tsx` — contexte produit → header
- `app/boutique/[slug]/not-found.tsx` — produit introuvable
- `scripts/test-active-main-nav.ts`
- `scripts/verify-pdp-nav.ts`
- `data/rebuild/RAPPORT_NAV_FICHES_ELIQUIDES.md`

## Fichiers modifiés

- `components/layout/Header.tsx` — détection exclusive
- `components/layout/SiteShell.tsx` — `MainNavProvider`
- `app/boutique/[slug]/page.tsx` — nav contexte, fil d’Ariane, retour, erreurs isolées
- `app/formats/[code]/page.tsx` — liens retour
- `components/catalog/ProductDetailSections.tsx` — null-safe
- `lib/navigation.ts` — réexports

## Fonction de détection

`getActiveMainNavigation(pathname, search, productContext)`

Priorité : contexte produit → route métier (`/formats`, `/e-liquides`, `/fabricants`, `/gammes`, …) → null.

`isMainNavLinkActive` compare l’id du lien à **un seul** `activeId`.

## Fil d’Ariane (e-liquide)

Accueil → E-liquides → 20 ml → e.Tasty → Twenty → Double Pêche 20ML

Retour : `/formats/20ml` (« Retour aux e-liquides 20 ml »).

## Tests

| Test | Résultat |
|------|----------|
| `test-active-main-nav.ts` | **16/16 OK** |
| 5 fiches Twenty 20 ml HTTP | **200**, pas de page erreur |
| Slug inexistant | « Produit introuvable » |
| `/formats/20ml` E-LIQUIDES actif | **oui** (SSR) |
| Fil d’Ariane Double Pêche | formats + fabricant + gamme présents |
| RÉSISTANCES / MARQUES sur fiche e-liquide | **inactifs** (tests unitaires) |

## Erreurs restantes / limites

1. Sur fiche produit, l’état bleu E-LIQUIDES est posé via `useLayoutEffect` (contexte client) — flash théorique minime au tout premier paint SSR.
2. Nav publique actuelle ne liste que E-LIQUIDES / BOUTIQUES / FAQ / CONTACT ; la logique exclusive est prête pour RÉSISTANCES / MARQUES futurs.
3. Stock SumUp parfois `INCONNU` pour ces 20 ml (niveaux absents) — n’empêche plus l’affichage de la fiche.

## Contraintes

- Design / couleurs / header layout inchangés (seule la logique d’état actif)
- Pas de commit / push / déploiement
