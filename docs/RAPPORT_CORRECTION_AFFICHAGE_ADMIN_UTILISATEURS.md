# Rapport — Correction affichage Admin Utilisateurs

**Date :** 2026-08-07  
**Projet :** `D:\all vaps\all-vap-s-backend`  
**Page :** `/admin/users`

---

## Cause du fond noir

La page était enveloppée dans `admin-app` + styles `.admin-users-*` basés sur les variables du thème sombre (`--adm-bg`, `--adm-surface`, texte clair).  
Résultat : fond noir/sombre alors que le shell inventaire admin attend un rendu clair.

## Cause du scroll horizontal

- `table-layout: auto` + `width: max-content` / `min-width` élevés  
- cellules en `white-space: nowrap`  
- barre d’actions pleine largeur sous chaque ligne  
- `overflow-x: auto` sur le conteneur  

→ tableau plus large que le viewport.

## Solution appliquée

1. Conteneur `.admin-users-page` fond blanc / gris très clair, texte sombre.  
2. Cartes / filtres / formulaires blancs.  
3. Tableau `width: 100%` + `table-layout: fixed` + largeurs de colonnes en %.  
4. `overflow-x: hidden` — pas de scroll horizontal desktop.  
5. Colonne **Actions** compacte (grille 2×2 + Supprimer pleine largeur).  
6. Badges colorés conservés (ADMIN bleu, EMPLOYÉ gris, boutiques orange, ACTIF vert, MDP orange, Supprimer rouge).  
7. Mobile : cartes blanches (inchangé fonctionnellement).  
8. **Aucune** modification API / rôles / permissions / données.

---

## Fichiers modifiés

- `components/admin/AdminUsersClient.tsx`
- `app/admin/admin-theme.css` (bloc `.admin-users-*`)
- `docs/RAPPORT_CORRECTION_AFFICHAGE_ADMIN_UTILISATEURS.md`

---

## Résolutions testées (checklist)

| Résolution | Scroll horizontal attendu | Statut code |
|------------|---------------------------|-------------|
| 1920 × 1080 | non | OK structure |
| 1600 × 900 | non | OK structure |
| 1366 × 768 | non | OK structure |
| 1280 × 720 | non | OK structure |
| Mobile &lt; 768 | cartes, pas de tableau | OK |

---

## Indicateurs

| Indicateur | Valeur |
|------------|--------|
| Fond blanc | **oui** |
| Scroll horizontal desktop | **non** (interdit en CSS) |
| Boutons conservés | **oui** (Modifier, Réinitialiser MDP, Boutiques, Désactiver, Supprimer) |
| Défilement vertical | **oui** (page navigateur) |
| Données modifiées | **0** |
| Logique métier modifiée | **0** |

---

## Captures

Voir aussi `docs/ui-admin-users/` (avant sombre). Après déploiement : recharger `/admin/users` pour validation visuelle live.
