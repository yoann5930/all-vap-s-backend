# Rapport UI — Administration > Utilisateurs

**Statut final :** ✅ Interface Administration Utilisateurs entièrement lisible.

**Déployé :** `inventaire.allvaps.fr/admin/users` (production Ready).

## Captures avant / après

| État | Fichier |
|------|---------|
| Avant (desktop) | `before-desktop.png` |
| Après (desktop 1440) | `after-desktop.png` |
| Après (tablette 900) | `after-tablet.png` |
| Après (mobile 390) | `after-mobile.png` |

## Composants / fichiers modifiés

1. `components/admin/AdminUsersClient.tsx` — tableau, cartes mobile, recherche, filtres, tri, panneaux Modifier / Boutiques  
2. `app/admin/admin-theme.css` — styles `.admin-users-*` (badges, barre d’actions, responsive)

## Ce qui a changé (UI seule)

- Colonnes : Nom · Email · Rôle · Boutique(s) · Statut · Dernière connexion · Sessions inventaire  
- Badges lisibles avec largeur minimale : `ADMIN`, `EMPLOYÉ`, `ACTIF`, `MDP À CHANGER`, `HAUTMONT`, `LE QUESNOY`  
- Actions horizontales sous chaque ligne : Modifier · Réinitialiser MDP · Boutiques · Désactiver · Supprimer  
- Recherche instantanée + filtres rôle / boutique / actif-inactif + tri par colonne  
- Desktop : toutes les colonnes (scroll horizontal si besoin)  
- Tablette : masquage intelligent (connexion / sessions / boutiques selon largeur)  
- Mobile : cartes utilisateur  
- Thème sombre All Vap’s  
- **Aucune** modification API, permissions, ni logique métier  
  (« Supprimer » = désactivation confirmée, pas de DELETE physique)

## Tests

### Desktop (≥1280px)

- [x] Badges entiers (rôles, statut, boutiques)
- [x] Actions horizontales lisibles (barre sous la ligne)
- [x] Tri sur en-têtes
- [x] Recherche + 3 filtres
- [x] Colonnes Dernière connexion / Sessions accessibles (scroll horizontal)

### Tablette (~768–1024px)

- [x] Réduction intelligente des colonnes
- [x] Actions toujours horizontales
- [x] Filtres utilisables

### Mobile (<768px)

- [x] Cartes utilisateur (tableau masqué)
- [x] Badges lisibles
- [x] Actions en flux horizontal (wrap si trop étroit)
