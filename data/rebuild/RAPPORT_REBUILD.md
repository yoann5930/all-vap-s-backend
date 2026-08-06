# Rapport reconstruction All Vap's — en cours

Date : 2026-07-29T22:05:00Z

## ÉTAPE 1 — Sauvegarde
- Dump : `backups/rebuild_2026-07-29/allvaps_pre_rebuild_20260729_235858.dump` (410 Ko)
- SQL : `backups/rebuild_2026-07-29/allvaps_pre_rebuild.sql` (~1,4 Mo)

## ÉTAPE 4 — Nettoyage public (FAIT)
- Produits `visibleOnline` avant : **33** → après : **0**
- Promotions / nouveautés / bestsellers badges : **0**
- Lignes touchées : 2554 (désactivation flags public)
- Règle : site vide préféré aux fausses données

### Attention nom « Iced »
- Remplacement aveugle a touché à tort 2 saveurs Revenge (`twin venom iced`, `undertaker iced`).
- **À restaurer manuellement** (script `scripts/rebuild-revert-false-iced.ts` préparé, non exécuté — skip utilisateur).
- Script cleanup corrigé : Iced→Ice uniquement si contexte Ice Cool / Liquidarom.

## Navigation publique
- Conservé visible : E-LIQUIDES, BOUTIQUES, FAQ, CONTACT
- Masqué : e-cigs, pods, résistances, accessoires, DIY, promos, nouveautés → `/catalogue-en-preparation`

## Accueil
- Bandeau : institutionnel (plus de flacons produits)
- Suppression section collections rayon Liquidarom
- TrustBar : plus de « +250 saveurs » inventé
- AVA + boutiques conservés

## Pages structure créées
- `/e-liquides` — hub formats + fabricants (0 produit publié)
- `/fabricants/[slug]` — bandeau + gammes, sans produits non publiés
- `/gammes/[slug]` — structure gamme
- `/catalogue-en-preparation` — catégories non prêtes

## Esthétique
- Charte noire/bleue, logo, header (nettoyé), placement AVA : **conservés**

## Suite obligatoire (non terminée)
5–10 Référentiel + photos officielles + SumUp (données)
11–14 Pages enrichies + fiches
15 Accueil final
16–18 Tests + rapport final complet

## URLs locales
- Frontend / API monolithe : http://localhost:3000
- PostgreSQL : localhost:5433

## Statut mission
**Nettoyage public démarré et effectif (0 produit visible).**  
Reconstruction catalogue / pages premium **en cours** — pas terminée.
