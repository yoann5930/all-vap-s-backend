# Rapport d'intégration — offre dégressive Twenty

- Date : 2026-08-15T01:04:13.942Z
- Contrôles : 28/28 OK
- Échecs : 0

## Offre (panier / paiement, prix catalogue inchangé 12,90 €)

| Qté | Prix / unité | Offert (livré en plus) |
| --- | --- | --- |
| 1 | 12,90 € | — |
| 2 | 11,90 € | — |
| 3 | 10,90 € | — |
| 4 | 9,90 € | — |
| 5 | 7,90 € | — |
| 6 | 8,90 € | + 1 |
| 7 | 8,90 € | + 2 |
| 8 | 8,90 € | + 3 |
| 9 | 8,90 € | + 4 |
| 10 | 8,90 € | + 5 |

Saveurs Twenty cumulées. Au-delà de 10 : packs de 10 + palier du reste.
Source de vérité paiement : `app/api/orders/route.ts` + vérification A.V.A. `/api/ava/verify-checkout`.

## A.V.A.

- FAQ `faq-offre-twenty` + article `offre-twenty-degressive`
- Chat : détection offre Twenty dans `lib/ai/ava-advisor.ts`
- Checkout : bloc « A.V.A. — vérification avant paiement »

## Implantation UI PC / mobile

- `/gammes/twenty` — bannière paliers + cartes 2 colonnes mobile / 4 desktop
- `/promotions` — même offre + fiches Twenty
- Fiche produit — `TwentyOfferBanner` compact
- Panier / checkout — remise + flacons offerts
- Photos : `ProductCard` `object-contain`, `sizes=(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px`, packshots `/media/products` non recompressés

## Photos — validation

| Produit | EAN | imageUrl | imageStatus | Fichier | Offre |
| --- | --- | --- | --- | --- | --- |
| Twenty  double pêche | 3701418867090 | `/media/products/e-tasty/twenty/20ml/twenty-double-peche.webp` | official | OK 89950 o | oui |
| TWENTY fruit du dragon cerise | 3701418867083 | `/media/products/e-tasty/twenty/20ml/twenty-fruit-du-dragon-cerise.webp` | official | OK 93846 o | oui |
| Twenty fruits rouges | 3701418867106 | `/media/products/e-tasty/twenty/20ml/twenty-fruits-rouges.webp` | official | OK 97466 o | oui |
| Twenty limonade -cassis | 3701418867076 | `/media/products/e-tasty/twenty/20ml/twenty-limonade-cassis.webp` | official | OK 96098 o | oui |
| Twenty. Menthe polaire | 3701418867113 | `/media/products/e-tasty/twenty/20ml/twenty-menthe-polaire.webp` | official | OK 100990 o | oui |

- Logo fabricant : OK `/media/manufacturers/e-tasty/logo.webp`
- Cover gamme : OK `/media/manufacturers/e-tasty/ranges/twenty.webp`
- Sources packshots : pro.e-tasty.fr (EAN officiels Twenty 20 ml)
- Style : `ensureProductImageEtastyStyle` (fond noir, cutout)

## Checklist fichiers

- [x] Paliers 1 / 5 / 6 / 10
- [x] A.V.A. détecte la question offre Twenty
- [x] moteur paliers — lib/promotions/promo-twenty.ts
- [x] panier combiné — lib/promotions/cart-promos.ts
- [x] page panier — app/cart/page.tsx
- [x] checkout + AVA — app/checkout/page.tsx
- [x] commande serveur — app/api/orders/route.ts
- [x] API vérif AVA — app/api/ava/verify-checkout/route.ts
- [x] chat A.V.A. — lib/ai/ava-advisor.ts
- [x] FAQ AVA — data/ava/knowledge/faq.json
- [x] page gamme — app/gammes/[slug]/page.tsx
- [x] page promotions — app/promotions/page.tsx
- [x] cartes PC/mobile — components/products/ProductCard.tsx
- [x] fiche produit — components/products/ProductPurchasePanel.tsx
- [x] logo fabricant e-tasty (6454 o)
- [x] cover gamme /media/manufacturers/e-tasty/ranges/twenty.webp (82534 o)
- [x] base all_vaps_db
- [x] 5 fiches Twenty (attendu 5)
- [x] Twenty  double pêche — /media/products/e-tasty/twenty/20ml/twenty-double-peche.webp (official)
- [x] Twenty  double pêche éligible offre + 12,90 € + 20 ml
- [x] TWENTY fruit du dragon cerise — /media/products/e-tasty/twenty/20ml/twenty-fruit-du-dragon-cerise.webp (official)
- [x] TWENTY fruit du dragon cerise éligible offre + 12,90 € + 20 ml
- [x] Twenty fruits rouges — /media/products/e-tasty/twenty/20ml/twenty-fruits-rouges.webp (official)
- [x] Twenty fruits rouges éligible offre + 12,90 € + 20 ml
- [x] Twenty limonade -cassis — /media/products/e-tasty/twenty/20ml/twenty-limonade-cassis.webp (official)
- [x] Twenty limonade -cassis éligible offre + 12,90 € + 20 ml
- [x] Twenty. Menthe polaire — /media/products/e-tasty/twenty/20ml/twenty-menthe-polaire.webp (official)
- [x] Twenty. Menthe polaire éligible offre + 12,90 € + 20 ml

## Échecs
Aucun