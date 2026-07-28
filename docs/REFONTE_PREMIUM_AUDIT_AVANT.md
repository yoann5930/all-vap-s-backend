# Audit avant refonte premium — All Vap's

**Date :** 2026-07-28  
**Branche :** `refonte-premium-allvaps`  
**Base :** commit `70df304` (`chore: backup before AVA evolution`) + WIP local (`package.json`, `ava-constants.ts`)  
**Projet officiel :** `D:\all vaps\all-vap-s-backend`  
**Référence visuelle :** pack `ALLVAPS_CURSOR_REDESIGN_SITE` (Downloads / à placer sous `D:\all vaps\`)  
**Hors scope :** `ALLVAPS_PORTABLE/` (copie ancienne — ne pas modifier)

---

## 1. État Git

| Élément | Valeur |
|---|---|
| Branche créée | `refonte-premium-allvaps` (depuis `main`) |
| `main` vs `origin/main` | +1 commit local non poussé (backup AVA) |
| Modifications non commitées conservées | `package.json`, `package-lock.json`, `lib/ai/ava-constants.ts` |
| Non suivis (à ignorer) | `ALLVAPS_PORTABLE/`, `portable-build.log` |

Aucun travail existant n’a été écrasé. Pas de force push.

---

## 2. Stack actuelle

- Next.js 15 (patch 15.5.22 en local WIP), React 19, TypeScript 5.9, Tailwind 4, Prisma 6, PostgreSQL
- Fonts : DM Sans (body) + Outfit (display) via `next/font` dans `app/layout.tsx`
- Thème déjà sombre (`data-theme="dark"`) — refonte = alignement maquette premium (#05070A / #00AEEF), pas un passage dark depuis zéro

---

## 3. Chrome & layout

| Pièce | Fichier | Notes |
|---|---|---|
| Layout racine | `app/layout.tsx` | BrandSplash, PremiumBackground, CartProvider, Header, Footer, FAB AVA |
| Header | `components/layout/Header.tsx` | Logo, recherche, favoris, compte, panier, menu mobile — **pas de bandeau top**, **pas d’AVA dans le header** |
| Recherche | `components/layout/HeaderSearch.tsx` | À agrandir / centrer façon maquette |
| Logo | `components/layout/Logo.tsx` + `components/brand/LogoMark.tsx` | Utilise déjà `public/brand/logo-official*.png` |
| Footer | `components/layout/Footer.tsx` | Nav, légal, contact, newsletter, carte |
| Nav data | `lib/navigation.ts` | Accueil, Boutique, E-liquides, Pods, DIY, Accessoires, Promotions, Boutiques, Contact |

**Écart maquette :** menu cible = E-cigarettes, E-liquides, Pods, Résistances, Accessoires, DIY, Promotions, Nouveautés, Marques + bandeau livraison/boutiques/téléphone.

---

## 4. Pages publiques (App Router)

| Route | Rôle |
|---|---|
| `/` | Accueil — Hero, nouveautés, promos, catégories, marques, avis, services, boutiques |
| `/boutique` | Catalogue |
| `/boutique/[slug]` | Fiche produit |
| `/promotions`, `/nouveautes`, `/meilleures-ventes` | Listings dérivés |
| `/boutiques`, `/boutiques/[slug]` | Magasins |
| `/contact`, `/faq` | Contact / FAQ |
| `/cart`, `/checkout`, `/checkout/pay`, `/checkout/success` | Achat |
| `/login`, `/register`, `/mot-de-passe-oublie`, `/confirmer-compte` | Auth |
| `/account/*`, `/favoris`, `/compte/profil-vape` | Espace client |
| `/ia` | Page AVA immersive |
| Légal | `/cgv`, `/mentions-legales`, `/politique-confidentialite` |
| Admin | `/admin/*` (layout clair — à harmoniser en surface seulement) |

Redirects catégories (`/e-liquides`, etc.) → `/boutique?category=…` via `next.config.ts`.

---

## 5. Composants home réutilisables

| Composant | Fichier | Action prévue |
|---|---|---|
| `HeroSection` | `components/home/HeroSection.tsx` | Refonte hero maquette |
| `CategoriesShowcase` | `components/home/CategoriesShowcase.tsx` | Cartes catégories |
| `StoresSection` | `components/home/StoresSection.tsx` | Hautmont / Le Quesnoy |
| `ServicesSection` | `components/home/ServicesSection.tsx` | Réassurance (vérifier claims) |
| `ReviewsSection`, `BrandsSection` | `components/home/*` | Harmoniser tokens |
| `AdvantagesSection` | existe, **non utilisé** sur home actuelle | Optionnel / claims à valider |

---

## 6. Catalogue & produit

| Rôle | Fichiers clés |
|---|---|
| Page boutique | `app/boutique/page.tsx` |
| Shell catalogue | `components/shop/ProductCatalog.tsx` |
| Filtres / tri / pagination / search | `AdvancedFilters`, `ProductSort`, `ProductPagination`, `InstantSearch`, `CategoryNav` |
| Cartes | `components/products/ProductCard.tsx`, `ProductGrid.tsx`, `AddToCartButton.tsx` |
| PDP | `app/boutique/[slug]/page.tsx` + `ProductGallery`, `FavoriteButton`, `ProductReviewsClient` |

Favoris : **déjà implémentés** (`/favoris`, `FavoriteButton`) — à conserver.

---

## 7. Primitives UI

Sous `components/ui/` : `Button`, `Card`, `Badge`, `Input` — à recalibrer sur les nouveaux tokens (#00AEEF, surfaces #0B1016…).

---

## 8. Tokens actuels vs cible

| Token | Actuel | Cible maquette |
|---|---|---|
| Fond | `#050505` | `#05070A` |
| Surfaces | `#141414` / `#0c0c0c` | `#0B1016`, `#101720`, `#151D27` |
| Accent | `#3D7EFF` | `#00AEEF` (+ action `#118DFF`) |
| Texte | blanc / `#8A8A8E` | `#F5F7FA` / `#A7B0BC` |
| Fichiers | `styles/design-tokens.css`, `app/globals.css` | Mettre à jour de façon centralisée |

Incohérence connue : glow panier header en cyan `rgba(0,217,255,…)` vs accent système.

---

## 9. Brand assets (déjà en place)

`public/brand/` :

- `logo-official.png`, `logo-official-dark.png`
- `logo-white.svg`, `logo-black.svg`, `logo-holo.svg`, `logo-mark-white.svg`
- `og-image.png`

Ne pas inventer de logo texte. Préférer `logo-official-dark.png` sur fond sombre.

---

## 10. A.V.A.

| Point | État |
|---|---|
| Présence header | Non |
| Présence UI | FAB flottant `HolographicAssistant` + CTA hero + `/ia` |
| Flag pause global | **Absent** — module toujours monté |
| Consigne refonte | Conserver emplacement / bouton ; marquer « bientôt disponible » si pause officielle |

Fichiers UI (skin only) : `AssistantButton.tsx`, `HolographicAssistant.tsx`, `ImmersiveAvaScreen.tsx`.  
Ne pas toucher logique advisor / TTS / stocks / SumUp.

---

## 11. Claims marketing à ne pas inventer

| Claim | Audit |
|---|---|
| Livraison offerte dès X € | **Absent** — ne pas ajouter |
| Satisfait ou remboursé | **Absent** — ne pas ajouter |
| Retrait boutique | **Gratuit** (`lib/shipping/options.ts`) — OK |
| Mondial Relay / Relais Colis | **3,90 €** |
| Colissimo | **5,90 €** |
| « Livraison rapide 24–48h » | Présent dans `AdvantagesSection` / CGV — à croiser avant affichage home |

---

## 12. APIs & logique métier — ne pas casser

- Auth JWT, panier (`CartProvider`, `lib/cart.ts`)
- Paiements Viva / SumUp (`app/api/payments/*`, `app/api/sumup/*`, `app/api/viva/*`)
- Catalogue / stocks / import SumUp admin
- Prisma schema & migrations — **aucun reset**
- Routes API existantes — signatures stables

---

## 13. Composants réutilisables (priorité refonte)

1. Tokens : `styles/design-tokens.css`, `app/globals.css`
2. Chrome : `Header`, `Footer`, `HeaderSearch`, `Logo` / `LogoMark`
3. Atmosphère : `PremiumBackground`, `BrandSplash`, `app/layout.tsx`
4. Home : `HeroSection` + sections `components/home/*`, `app/page.tsx`
5. Catalogue : `ProductCard`, `ProductCatalog`, filtres shop, PDP
6. Primitives : `Button`, `Card`, `Badge`, `Input`
7. Commerce : cart / checkout / `AuthForm` / account sidebar
8. AVA skin uniquement + éventuel badge « bientôt »
9. Admin : surfaces seulement (`admin/layout`, `AdminSidebar`)

---

## 14. Plan d’exécution suivant (étapes 2+)

1. **Étape 2** — Tokens premium centralisés (#05070A / #00AEEF…)
2. **Étape 3** — Header maquette (bandeau + search + nav)
3. **Étape 4** — Home
4. **Étape 5–6** — Catalogue + fiches
5. **Étape 7** — Panier / checkout / compte / admin skin
6. **Étapes 8–9** — CSV Liquidarom + architecture images (sans doublons stock)
7. **Étapes 10–12** — Responsive, lint/tsc/build, rapport final

**Déploiement production :** uniquement après validation humaine.

---

## 15. Risques connus

- Colonne Prisma `Product.normalizedName` manquante en base locale (erreur runtime déjà observée) — hors refonte visuelle, à traiter à part
- Assets AVA ~9 Mo — hors scope immédiat UI
- Admin encore en classes light — harmoniser sans changer les flux
- Ne pas committer `ALLVAPS_PORTABLE/`
