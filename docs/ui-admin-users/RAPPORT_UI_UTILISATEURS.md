# Rapport UI — Administration > Utilisateurs

**Statut :** ✅ Interface Administration Utilisateurs entièrement lisible (code local).

## Problème (avant)

- Colonnes trop étroites, mots coupés
- Badges écrasés (`Actif`, `ADMIN`, `EMPLOYÉ`, `MDP à changer`)
- Boutons empilés verticalement
- Thème clair peu lisible dans le shell admin inventaire

Capture avant : `docs/ui-admin-users/before-desktop.png`

## Objectif atteint

Tableau refait avec colonnes :

| Nom | Email | Rôle | Boutique(s) | Statut | Dernière connexion | Sessions inventaire | Actions |

- Largeur auto, `nowrap` sur badges / actions
- Badges avec largeur minimale
- Actions horizontales : Modifier · Réinitialiser MDP · Boutiques · Désactiver · Supprimer
- Recherche instantanée + filtres rôle / boutique / actif-inactif + tri par colonne
- Responsive : table desktop, colonnes réduites tablette, cartes mobile
- Thème sombre All Vap’s (`admin-theme.css`)
- **Aucune** modification API / permissions / logique métier  
  (« Supprimer » = désactivation confirmée, pas de DELETE physique)

## Composants / fichiers modifiés

1. `components/admin/AdminUsersClient.tsx` — UI complète (table, cartes, filtres, tri)
2. `app/admin/admin-theme.css` — styles `.admin-users-*`

## Tests à valider

### Desktop (≥1280px)

- [ ] Toutes les colonnes visibles
- [ ] Badges entiers (ADMIN, EMPLOYÉ, ACTIF, MDP À CHANGER, HAUTMONT, LE QUESNOY)
- [ ] 5 boutons d’actions sur une seule ligne
- [ ] Tri au clic sur en-têtes
- [ ] Recherche + 3 filtres fonctionnels

### Tablette (768–1279px)

- [ ] Colonnes « Dernière connexion » / « Sessions » masquées intelligemment
- [ ] Boutiques masquées sous 1024px (visibles dans panneau Boutiques)
- [ ] Actions toujours horizontales (scroll horizontal si besoin)
- [ ] Toolbar filtres en 2 colonnes

### Mobile (&lt;768px)

- [ ] Cartes utilisateur (pas de tableau)
- [ ] Badges lisibles
- [ ] Actions en wrap horizontal
- [ ] Recherche + filtres empilés

## Captures

| État | Fichier |
|------|---------|
| Avant desktop | `before-desktop.png` |
| Après desktop | `after-desktop.png` (à prendre après déploiement / preview) |
| Après tablette | `after-tablet.png` |
| Après mobile | `after-mobile.png` |
