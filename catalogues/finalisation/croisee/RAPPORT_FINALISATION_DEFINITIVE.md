# RAPPORT FINAL — Finalisation définitive catalogue All Vap's

**Date :** 2026-08-03T19:00:51.654Z  
**Dossier :** `catalogues/finalisation/croisee/`

## Contraintes

✓ Aucune invention  
✓ Aucun prix modifié  
✓ Aucun stock modifié  
✓ Aucun produit supprimé  
✓ Aucun sumupProductId remplacé en base  

## Synthèse demandée

| Indicateur | Valeur |
|---|---:|
| Produits totalement finalisés (web + archives) | **37** |
| Produits récupérés grâce aux archives (nouveaux finalisés EAN) | **0** |
| Photos associées depuis le projet (passe croisée) | voir dossiers photos / VALIDATION_MANUELLE |
| Produits encore incomplets | **61** |
| Dossiers VALIDATION_MANUELLE | **61** |
| **% achèvement mission des 98** | **37.8 %** (37/98) |
| Produits actifs catalogue | **409** |
| Actifs complets (SumUp + EAN + fabricant + gamme + image) | **177** |
| **% achèvement réel du catalogue actifs** | **43.3 %** |

## Produits totalement finalisés

Les **37** fiches complètes issues de la recherche web sont dans  
`catalogues/finalisation/croisee/produits-finalises/`  
(et `catalogues/finalisation/recherche-web/`).

La recherche croisée archives **n'a pas permis de finaliser de nouveau produit** :
les EAN manquants sont absents de Prisma et absents ou ambigus dans les CSV SumUp.

## Produits récupérés grâce aux archives

- **0 finalisation EAN supplémentaire** (CSV SumUp sans barcode univoque pour ces références)
- Photos / bannières / preuves documentées dans chaque dossier `VALIDATION_MANUELLE/<slug>/`
- Candidats SumUp ID **documentés mais non appliqués**

## Agrégation des blocages (61 incomplets)

- **ean** → 24 produit(s)
- **ean+photo** → 20 produit(s)
- **ean+nicotine+pgVg+photo** → 9 produit(s)
- **ean+pgVg+photo** → 3 produit(s)
- **ean+formatMl+pgVg+photo** → 2 produit(s)
- **ean+nicotine+pgVg** → 2 produit(s)
- **ean+formatMl+pgVg** → 1 produit(s)

## Liste — encore incomplets (raison précise)

- **Café Frappé 50 ml** (Liquide Lab / Big Kawa) — manque **ean, pgVg, photo** → `VALIDATION_MANUELLE/cafe-frappe-50-ml/`
- **Café Noisette 50 ml** (Liquide Lab / Big Kawa) — manque **ean, pgVg, photo** → `VALIDATION_MANUELLE/cafe-noisette-50-ml/`
- **Café Caramel 50 ml** (Liquide Lab / Big Kawa) — manque **ean, pgVg, photo** → `VALIDATION_MANUELLE/cafe-caramel-50-ml/`
- **Force Violette 100 ml** (Swoke / Force Vape) — manque **ean** → `VALIDATION_MANUELLE/force-violette-100-ml/`
- **Milo 50 ml** (Swoke / Saint Flava) — manque **ean** → `VALIDATION_MANUELLE/milo-50-ml/`
- **Pyro 50 ml** (Swoke / Saint Flava) — manque **ean, photo** → `VALIDATION_MANUELLE/pyro-50-ml/`
- **Pêche Abricot 50 ml** (Alfa / Granita Soft) — manque **ean** → `VALIDATION_MANUELLE/peche-abricot-50-ml/`
- **Candy 50 ml** (Swoke / Saint Flava) — manque **ean, photo** → `VALIDATION_MANUELLE/candy-50-ml/`
- **Candy Gold Edition 50 ml** (Swoke / Saint Flava) — manque **ean, photo** → `VALIDATION_MANUELLE/candy-gold-edition-50-ml/`
- **Xena 50 ml** (Swoke / Saint Flava) — manque **ean, photo** → `VALIDATION_MANUELLE/xena-50-ml/`
- **Yumi 50 ml** (Swoke / Saint Flava) — manque **ean, photo** → `VALIDATION_MANUELLE/yumi-50-ml/`
- **Fraise Fruit du Dragon 50 ml** (Alfa / Granita Soft) — manque **ean** → `VALIDATION_MANUELLE/fraise-fruit-du-dragon-50-ml/`
- **Citron Vert Melon 50 ml** (Alfa / Granita Soft) — manque **ean** → `VALIDATION_MANUELLE/citron-vert-melon-50-ml/`
- **Mûre Cassis 50 ml** (Alfa / Granita Soft) — manque **ean** → `VALIDATION_MANUELLE/mure-cassis-50-ml/`
- **Lilya 50 ml** (Swoke / Saint Flava) — manque **ean, photo** → `VALIDATION_MANUELLE/lilya-50-ml/`
- **Ruby 50 ml** (Swoke / Saint Flava) — manque **ean, photo** → `VALIDATION_MANUELLE/ruby-50-ml/`
- **Vigo 50 ml** (Swoke / Saint Flava) — manque **ean, photo** → `VALIDATION_MANUELLE/vigo-50-ml/`
- **Sour Sorbet** (T-Juice / T-Juice 50 mL) — manque **ean, formatMl, pgVg** → `VALIDATION_MANUELLE/sour-sorbet/`
- **Bisou Red 50 ml** (Swoke / Bisou) — manque **ean** → `VALIDATION_MANUELLE/bisou-red-50-ml/`
- **Bisou Black 50 ml** (Swoke / Bisou) — manque **ean** → `VALIDATION_MANUELLE/bisou-black-50-ml/`
- **Bisou Yellow 50 ml** (Swoke / Bisou) — manque **ean** → `VALIDATION_MANUELLE/bisou-yellow-50-ml/`
- **Bisou V2 50 ml** (Swoke / Bisou) — manque **ean** → `VALIDATION_MANUELLE/bisou-v2-50-ml/`
- **Greensound 100 ml** (AirMust / Blue Hopper) — manque **ean** → `VALIDATION_MANUELLE/greensound-100-ml/`
- **Purplenuclear 100 ml** (AirMust / Blue Hopper) — manque **ean** → `VALIDATION_MANUELLE/purplenuclear-100-ml/`
- **Yellowstorm 100 ml** (AirMust / Blue Hopper) — manque **ean** → `VALIDATION_MANUELLE/yellowstorm-100-ml/`
- **Bluevolt 200 ml** (AirMust / Blue Hopper) — manque **ean** → `VALIDATION_MANUELLE/bluevolt-200-ml/`
- **Purplenuclear 200 ml** (AirMust / Blue Hopper) — manque **ean** → `VALIDATION_MANUELLE/purplenuclear-200-ml/`
- **Redfire 200 ml** (AirMust / Blue Hopper) — manque **ean** → `VALIDATION_MANUELLE/redfire-200-ml/`
- **Aspik 60 ml** (AirMust / Ferox) — manque **ean, photo** → `VALIDATION_MANUELLE/aspik-60-ml/`
- **Krak 60 ml** (AirMust / Ferox) — manque **ean, photo** → `VALIDATION_MANUELLE/krak-60-ml/`
- **Grizz 60 ml** (AirMust / Ferox) — manque **ean, photo** → `VALIDATION_MANUELLE/grizz-60-ml/`
- **Konga 100 ml** (AirMust / Ferox) — manque **ean, photo** → `VALIDATION_MANUELLE/konga-100-ml/`
- **Hippox 100 ml** (AirMust / Ferox) — manque **ean, photo** → `VALIDATION_MANUELLE/hippox-100-ml/`
- **Grizz 100 ml** (AirMust / Ferox) — manque **ean, photo** → `VALIDATION_MANUELLE/grizz-100-ml/`
- **Krak 100 ml** (AirMust / Ferox) — manque **ean, photo** → `VALIDATION_MANUELLE/krak-100-ml/`
- **Aspik 100 ml** (AirMust / Ferox) — manque **ean** → `VALIDATION_MANUELLE/aspik-100-ml/`
- **Red Devil 100 ml** (AVAP / Devil) — manque **ean** → `VALIDATION_MANUELLE/red-devil-100-ml/`
- **Mint & Dragon fruit 50 ml** (Eliquid France / Mintaïa) — manque **ean, photo** → `VALIDATION_MANUELLE/mint-dragon-fruit-50-ml/`
- **Atlas 50 ml** (Swoke / Saint Flava) — manque **ean, photo** → `VALIDATION_MANUELLE/atlas-50-ml/`
- **Drago 50 ml** (Swoke / Saint Flava) — manque **ean, photo** → `VALIDATION_MANUELLE/drago-50-ml/`
- **Frost 50 ml** (Swoke / Saint Flava) — manque **ean, photo** → `VALIDATION_MANUELLE/frost-50-ml/`
- **Bisou Pink 50 ml** (Swoke / Bisou) — manque **ean** → `VALIDATION_MANUELLE/bisou-pink-50-ml/`
- **Bluevolt 100 ml** (AirMust / Blue Hopper) — manque **ean** → `VALIDATION_MANUELLE/bluevolt-100-ml/`
- **Redfire 100 ml** (AirMust / Blue Hopper) — manque **ean** → `VALIDATION_MANUELLE/redfire-100-ml/`
- **Greensound 200 ml** (AirMust / Blue Hopper) — manque **ean** → `VALIDATION_MANUELLE/greensound-200-ml/`
- **Yellowstorm 200 ml** (AirMust / Blue Hopper) — manque **ean** → `VALIDATION_MANUELLE/yellowstorm-200-ml/`
- **Leox 60 ml** (AirMust / Ferox) — manque **ean, photo** → `VALIDATION_MANUELLE/leox-60-ml/`
- **Senka** (Juice 66 / 66 Juice) — manque **ean, formatMl, pgVg, photo** → `VALIDATION_MANUELLE/senka/`
- **Force Verte** (Swoke / Force Vape) — manque **ean** → `VALIDATION_MANUELLE/force-verte/`
- **Yuluma** (Juice 66 / 66 Juice) — manque **ean, formatMl, pgVg, photo** → `VALIDATION_MANUELLE/yuluma/`
- **Fruits Rouges 60 ml** (AirMust / UNIK) — manque **ean, nicotine, pgVg** → `VALIDATION_MANUELLE/fruits-rouges-60-ml/`
- **Pomme Harmonie 60 ml** (AirMust / UNIK) — manque **ean, nicotine, pgVg, photo** → `VALIDATION_MANUELLE/pomme-harmonie-60-ml/`
- **Poire 60 ml** (AirMust / UNIK) — manque **ean, nicotine, pgVg, photo** → `VALIDATION_MANUELLE/poire-60-ml/`
- **Menthe Glaciale 60 ml** (AirMust / UNIK) — manque **ean, nicotine, pgVg, photo** → `VALIDATION_MANUELLE/menthe-glaciale-60-ml/`
- **Framboise 60 ml** (AirMust / UNIK) — manque **ean, nicotine, pgVg, photo** → `VALIDATION_MANUELLE/framboise-60-ml/`
- **Pêche 60 ml** (AirMust / UNIK) — manque **ean, nicotine, pgVg, photo** → `VALIDATION_MANUELLE/peche-60-ml/`
- **Pure Passion 60 ml** (AirMust / UNIK) — manque **ean, nicotine, pgVg, photo** → `VALIDATION_MANUELLE/pure-passion-60-ml/`
- **Mangue 60 ml** (AirMust / UNIK) — manque **ean, nicotine, pgVg, photo** → `VALIDATION_MANUELLE/mangue-60-ml/`
- **Raisin Noir 60 ml** (AirMust / UNIK) — manque **ean, nicotine, pgVg, photo** → `VALIDATION_MANUELLE/raisin-noir-60-ml/`
- **Custard Vanille 60 ml** (AirMust / UNIK) — manque **ean, nicotine, pgVg** → `VALIDATION_MANUELLE/custard-vanille-60-ml/`
- **Menthe du Jardin 60 ml** (AirMust / UNIK) — manque **ean, nicotine, pgVg, photo** → `VALIDATION_MANUELLE/menthe-du-jardin-60-ml/`

## Conclusion

Après croisement Prisma + CSV SumUp + rapports + images projet + backups/data/catalogues :

1. **37/98** produits de la file « impossibles » sont entièrement documentés (web).  
2. **61/98** restent bloqués, presque toujours par **absence d'EAN certain**.  
3. Ces 61 sont prêts pour validation humaine dans `VALIDATION_MANUELLE/`.  
4. Le catalogue actifs global est à **43.3 %** de complétude stricte (SumUp+EAN+fabricant+gamme+image).
