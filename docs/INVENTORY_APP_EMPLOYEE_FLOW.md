# Inventaire App — Flux employé

1. `/acces` ou `/inventaire` → `/login?next=/inventaire` si besoin
2. Changement MDP forcé si `mustChangePassword`
3. Choisir boutique (allowedStores)
4. Commencer session (`OPEN`)
5. Scanner EAN / saisie manuelle / photo anomalie
6. Voir produit, stock théorique, saisir quantité
7. Enregistrer ligne (ou file hors-ligne)
8. **Envoyer à validation** → `SUBMITTED` (**stock inchangé**)
9. Consulter historique admin (lecture)

Raccourcis : `/inventaire/connexion`, `/inventaire/nouvelle-session`, `/inventaire/scan` → redirects.
