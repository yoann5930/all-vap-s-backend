# Rapport d'audit d'intégration client — All Vap's

**Date :** 2026-07-31T23:48:23.562Z
**Base URL :** http://127.0.0.1:3000
**Résultat :** 45 PASS / 0 FAIL
**Blockers :** 0 · **Majors :** 0

> Audit **pré-commit**. Ne pas committer tant que des blockers restent, sauf validation explicite du responsable.

## Verdict

**GO technique automate** — validation visuelle navigateur encore recommandée.

## Synthèse par zone

- **infra** : 1/1 PASS
- **pages** : 21/21 PASS
- **layout** : 3/3 PASS
- **media** : 2/2 PASS
- **sumup-stock** : 5/5 PASS
- **ava** : 5/5 PASS
- **ava-multi** : 8/8 PASS

## Échecs

_Aucun échec._

## Détail

| Statut | Sévérité | Zone | Id | Détail |
|--------|----------|------|----|--------|
| PASS | info | infra | infra:home | HTTP 200 |
| PASS | info | pages | route:/ | HTTP 200 |
| PASS | info | pages | route:/boutique | HTTP 200 |
| PASS | info | pages | route:/products | HTTP 200 |
| PASS | info | pages | route:/promotions | HTTP 200 |
| PASS | info | pages | route:/nouveautes | HTTP 200 |
| PASS | info | pages | route:/meilleures-ventes | HTTP 200 |
| PASS | info | pages | route:/boutiques | HTTP 200 |
| PASS | info | pages | route:/contact | HTTP 200 |
| PASS | info | pages | route:/faq | HTTP 200 |
| PASS | info | pages | route:/cart | HTTP 200 |
| PASS | info | pages | route:/login | HTTP 200 |
| PASS | info | pages | route:/register | HTTP 200 |
| PASS | info | pages | route:/favoris | HTTP 200 |
| PASS | info | pages | route:/cgv | HTTP 200 |
| PASS | info | pages | route:/mentions-legales | HTTP 200 |
| PASS | info | pages | route:/politique-confidentialite | HTTP 200 |
| PASS | info | pages | route:/api/products?limit=5 | HTTP 200 |
| PASS | info | pages | route:/api/categories | HTTP 200 |
| PASS | info | pages | route:/api/banners | HTTP 200 |
| PASS | info | pages | route:/api/search?q=bako | HTTP 200 |
| PASS | info | pages | route:/api/health | {"status":"ok","ok":true,"service":"all-vaps","timestamp":"2026-07-31T23:48:16.701Z","uptime":1257,"checks":{"application":"ok","database":"ok"},"details":{"database":{"ms":3}}} |
| PASS | info | layout | layout:home-html | home 119050 chars, brand=OK |
| PASS | blocker | layout | layout:home-no-error-boundary | pas d'error boundary visible |
| PASS | info | layout | layout:boutique | HTTP 200, 91807 chars |
| PASS | info | media | media:manufacturers | 13 fabricants, 13 avec logo, 0 sans |
| PASS | info | media | media:product-images-api | 12 produits API, 0 sans imageUrl |
| PASS | info | sumup-stock | stock:counts | actifs=421, visibles=172, sumup=311, visibles+sumup=172 |
| PASS | info | sumup-stock | stock:sumup-unique | pas de sumupProductId dupliqué |
| PASS | info | sumup-stock | stock:levels | 2188 stockLevels sur GLOBAL_ALL_VAPS |
| PASS | info | sumup-stock | stock:sample-link-site-to-level | échantillon 25: 25 liés StockLevel (site→stock) |
| PASS | info | sumup-stock | stock:visible-eliquide-sans-sumup | 0 e-liquides visibles sans sumupProductId |
| PASS | blocker | ava | ava:pronounce-etasty | spoken="Essayez i tésti Bako à" |
| PASS | major | ava | ava:anti-robot | sanitized="On va regarder ça ensemble.." |
| PASS | major | ava | ava:eliquide-not-hardware | e-liquide ≠ matériel |
| PASS | blocker | ava | ava:safety-swollen | danger prioritaire |
| PASS | blocker | ava | ava:coil-lock | pas de coils sans confirmation |
| PASS | blocker | ava-multi | ava:clientA-no-error | 3 tours OK |
| PASS | blocker | ava-multi | ava:clientB-no-error | 2 tours OK |
| PASS | major | ava-multi | ava:clientC-no-error | Voici nos boutiques :

All Vap's Hautmont
17 Avenue Marcel Aimé, 59330 Hautmont
03 27 49 61 00

Hora |
| PASS | major | ava-multi | ava:no-robotic-phrases | aucune phrase robotique interdite |
| PASS | blocker | ava-multi | ava:isolation-A-vs-B | A isolé: Je viens de trouver plusieurs produits susceptibles de vous intéresser. Par exemple Menthe polaire, Menthe Fraiche, Ment |
| PASS | major | ava-multi | ava:clientB-hardware-mode | B1: D'accord, dites-moi ce qui se passe. Pas de problème. Envoyez-moi une photo de face, puis une photo du côté ou du dessous où le nom est insc |
| PASS | major | ava-multi | ava:clientA-session-memory | turn=2 flavors=["fruite","fruit","menthe","the"] |
| PASS | blocker | ava-multi | ava:parallel-no-crash | P1:OK P2:OK P3:OK |

## Extraits AVA multi-clients

### Client A
```
A1: Je viens de trouver plusieurs produits susceptibles de vous intéresser. Par exemple Fruits rouges et Fruits Rouges Anisés. Je vous laisse les découvrir juste en dessous. Les informations détaillées et les tarifs sont directement affichés à l'écran.
A3: Je viens de trouver plusieurs produits susceptibles de vous intéresser. Par exemple Menthe polaire, Menthe Fraiche, Menthe fraiche. Je vous laisse les découvrir juste en dessous. Les informations détaillées et les tarifs sont directement affichés à l'écran.
```
### Client B
```
B1: D'accord, dites-moi ce qui se passe. Pas de problème. Envoyez-moi une photo de face, puis une photo du côté ou du dessous où le nom est inscrit. Une photo m'aiderait beaucoup.
B2: Je n'ai pas trouvé de produit disponible pour cette demande. Précisez une saveur, un format ou un type de matériel — je regarde dans le catalogue.
```
### Client C
```
C1: Voici nos boutiques :

All Vap's Hautmont
17 Avenue Marcel Aimé, 59330 Hautmont
03 27 49 61 00

Horaires :
Lundi – Samedi : 10h – 19h
Dimanche : Fermé
```
### Parallèle
```
P1: Avec plaisir. J'ai trouvé plusieurs références correspondant à votre recherche. Par exemple Vanille dorée, Vanille dore,
P2: D'accord, dites-moi ce qui se passe. Pas de problème. Envoyez-moi une photo de face, puis une photo du côté ou du dessou
P3: Voici nos boutiques :

All Vap's Le Quesnoy
10 Rue Léon Gambetta, 59530 Le Quesnoy
03 27 49 62 00

Horaires :
Lundi – Sa
```

## Déjà validé hors ce script

- `npm run ava:mission:test` → 95 OK
- `npm run catalog:validate:sumup` → ok (0 doublon, 0 visible sans SumUp)
- `npm run sumup:lock-test` → 16 passed
- `catalog:validate:media` / `routes` → 8 covers manquantes (majors catalogue)

## Non couvert

- Paiement réel, micro/TTS mobile, VoiceOver, vision photo, compte authentifié

```bash
npx tsx scripts/audit-integration-client.ts
```