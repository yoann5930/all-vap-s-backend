# Rapport correction import — gammes complètes

Généré : 2026-07-31T16:53:53.472Z  
Mode : **apply effectué** (puis nettoyage des sur-rattachements SumUp)

## Diagnostic

Le ZIP `allvaps_catalogue.json` liste **31 fabricants** et **72 gammes**, dont **56** avec `"products": []`.

Ces tableaux vides signifient **CATALOGUE OFFICIEL À RECHERCHER**, jamais « gamme à ignorer ».

Le premier import n’avait traité que les lignes déjà remplies → d’où l’incomplétude.

## Synthèse chiffrée

| Indicateur | Valeur |
| --- | ---: |
| Fabricants dans le JSON | 31 |
| Gammes dans le JSON | 72 |
| Gammes présentes en base après correction | 33 / 72 |
| Gammes encore absentes (proposition seule) | 39 |
| Gammes créées durant le pass apply | 21 |
| Gammes marquées complètes (heuristique site) | 3 |
| Gammes partielles | 29 |
| Produits fiches catalogue ajoutés (pass) | 39 |
| Propositions CatalogRangeProposal | 72 (1 par gamme JSON) |
| Sur-liens SumUp corrigés ensuite | ~287 détachés + 56 reliés + 11 nettoyages |
| Éléments encore à confirmer (Yoann / source officielle) | 68 |

## Alias officiels appliqués

| JSON | Officiel / base |
| --- | --- |
| Golf City | **Godfall City** (e.Tasty) |
| Dragonz | **Dragonzz** (Liquideo) |
| MIST | **Myst** (Cookin'Cloud) |
| Big Kawa / Café | gamme **Big Kawa** sous Liquide Lab |

## Matrice exhaustive

| Fabricant | Gamme demandée | Présente avant | Action effectuée | Produits officiels trouvés | Produits SumUp liés | Visible sur site | Statut |
| --- | --- | ---: | --- | ---: | ---: | ---: | --- |
| Guilab | Vapetasty | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Guilab | Red Valentine | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Guilab | Faken' Vape | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Guilab | Ark Vape | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Guilab | Les Trois Mousquet'Air | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Guilab | Assassin Vape | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Swoke | Force Vape | oui | CRÉÉE OU FUSIONNÉE (à confirmer) | 6 | 6 | non | PARTIELLE |
| Swoke | Kiss Cool | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Swoke | Saint Flava | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Swoke | Bisou | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Swoke | Freeze | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Swoke | Titi | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Juice 66 | Icebreak | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Juice 66 | Empire | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Juice 66 | Dollar | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Juice 66 | Illusion | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Juice 66 | Paradise | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Juice 66 | Dinos | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Juice 66 | Chaser | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Juice 66 | Juice Machine | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Juice 66 | 66 Juice | oui | CRÉÉE OU FUSIONNÉE (à confirmer) | 5 | 12 | non | PARTIELLE |
| Aromes & Secrets | Mythologie | oui | CRÉÉE OU FUSIONNÉE (à confirmer) | 7 | 20 | non | PARTIELLE |
| Made In Vape Distrib | MIV Distrib | oui | CRÉÉE OU FUSIONNÉE (à confirmer) | 2 | 16 | non | PARTIELLE |
| Cloud Vapor | Call Of Vape | oui | CRÉÉE OU FUSIONNÉE (à confirmer) | 15 | 15 | non | PARTIELLE |
| Cloud Vapor | Call Of Vape Blackout | oui | CRÉÉE OU FUSIONNÉE (à confirmer) | 15 | 15 | non | PARTIELLE |
| Cloud Vapor | Grand Taste City | oui | CRÉÉE OU FUSIONNÉE (à confirmer) | 5 | 5 | non | PARTIELLE |
| e.Tasty | Golf City | oui | FUSIONNÉE / VISIBLE | 7 | 7 | oui | CORRIGÉE ET COMPLÈTE |
| e.Tasty | Twenty | oui | FUSIONNÉE / VISIBLE | 5 | 6 | oui | CORRIGÉE ET COMPLÈTE |
| e.Tasty | Letters | oui | FUSIONNÉE / VISIBLE | 3 | 12 | oui | CORRIGÉE ET COMPLÈTE |
| The FUU | Cloud Empire | oui | FUSIONNÉE / VISIBLE | 5 | 5 | non | PARTIELLE |
| AirMust | Blue Hopper | oui | FUSIONNÉE / VISIBLE | 1 | 1 | non | PARTIELLE |
| AirMust | Hopper | oui | FUSIONNÉE / VISIBLE | 1 | 1 | non | PARTIELLE |
| AirMust | Society Club | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| AirMust | Ferox | oui | FUSIONNÉE / VISIBLE | 7 | 7 | non | PARTIELLE |
| AirMust | L'Ovalie | oui | CRÉÉE OU FUSIONNÉE (à confirmer) | 3 | 3 | non | PARTIELLE |
| AirMust | Press Start | oui | FUSIONNÉE / VISIBLE | 5 | 5 | non | PARTIELLE |
| AirMust | UNIK | oui | CRÉÉE OU FUSIONNÉE (à confirmer) | 13 | 27 | non | PARTIELLE |
| MG Vape | Medusa | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| KF Studio | King Freeze | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Budz Vape | Pandora | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| AVAP | Devil | oui | CRÉÉE OU FUSIONNÉE (à confirmer) | 1 | 3 | non | PARTIELLE |
| Cookin'Cloud | MIST | oui | FUSIONNÉE / VISIBLE | 15 | 15 | non | PARTIELLE |
| Vape 47 | ENFER | oui | FUSIONNÉE / VISIBLE | 5 | 5 | non | PARTIELLE |
| Vape 47 | Les Fruits d'ENFER | oui | FUSIONNÉE / VISIBLE | 5 | 5 | non | PARTIELLE |
| Vape 47 | Furiosa EGGZ V2 | oui | FUSIONNÉE / VISIBLE | 9 | 10 | non | PARTIELLE |
| Eliquid France | Mintaïa | oui | FUSIONNÉE / VISIBLE | 6 | 6 | non | PARTIELLE |
| Eliquid France | Lemon'Time | oui | FUSIONNÉE / VISIBLE | 1 | 1 | non | PARTIELLE |
| Eliquid France | Fruizee Max | oui | FUSIONNÉE / VISIBLE | 7 | 7 | non | PARTIELLE |
| Eliquid France | Juice Heroes | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Eliquid France | Fureur du Dragon | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Eliquid France | Mister Pop Corn | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Protect | Les Pollinisateurs | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Protect | Les 4 Saisons | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Protect | Parrainage | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Liquideo | Evolution | oui | FUSIONNÉE / VISIBLE | 0 | 0 | non | ABSENTE DE SUMUP |
| Liquideo | Dragonz | oui | FUSIONNÉE / VISIBLE | 6 | 6 | non | PARTIELLE |
| Liquideo | Freeze Citrus | oui | FUSIONNÉE / VISIBLE | 8 | 8 | non | PARTIELLE |
| Liquideo | Les Essentiels | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Fruity Cool | Fruity Cool | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Big Kawa | Café | oui | FUSIONNÉE / VISIBLE | 3 | 6 | non | PARTIELLE |
| Mukk Mukk | Crazy Juice | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Mukk Mukk | Crazy Barnacle | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Mukk Mukk | Mukkies | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| OverDrive Juices | OverDrive Juices | oui | CRÉÉE OU FUSIONNÉE (à confirmer) | 4 | 4 | non | PARTIELLE |
| Revenge Juices | Revenge Juices | oui | CRÉÉE OU FUSIONNÉE (à confirmer) | 3 | 8 | non | PARTIELLE |
| Alfa | Granita Soft | oui | CRÉÉE OU FUSIONNÉE (à confirmer) | 8 | 17 | non | PARTIELLE |
| Le Maudit | Le Maudit | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Fruizee | Fruizee | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Yum E-Bot | Yum E-Bot | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| T-Juice | T-Juice | oui | FUSIONNÉE / VISIBLE | 4 | 21 | non | PARTIELLE |
| Vape City | Vape City | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |
| Vape City | Magic Potion | non | PROPOSITION SEULE | 0 | 0 | non | ABSENTE / PROPOSITION SEULE |

## Ce qui est réellement abouti

- **e.Tasty** : Twenty, Letters (dont concentrés 30 ml en fiches hors stock), Godfall City (ex-Golf City)
- **Liquideo** : Dragonzz créée + produits officiels 50 ml ; Evolution créée (catalogue large → rattachement SumUp à affiner)
- **Vape 47** : Enfer / Les Fruits d'Enfer / Furiosa Eggz resserrés
- **Cookin'Cloud** : MIST fusionnée avec Myst
- **Big Kawa** : rattachée à Liquide Lab
- **Toutes les 72 gammes** ont une proposition `CatalogRangeProposal` (aucune omission silencieuse)

## Bloqué / partiel — raisons précises

1. **Guilab** (Vapetasty, Red Valentine, etc.) : le catalogue public actuel (Thunder Vape, Wonder Vape, Wanted Juice, Goo Puff) ne correspond pas aux gammes du ZIP → **SOURCE OFFICIELLE INTROUVABLE** pour ces noms. Confirmation Yoann requise.
2. **Swoke / Juice 66 / Protect / AVAP / Fruizee / etc.** : sites officiels souvent SPA, login pro, ou absents → crawl HTML insuffisant. Gammes **non inventées**.
3. **AirMust UNIK** : produits SumUp « Unik » reliés après filtre strict ; liste officielle complète encore à scrapeper.
4. **Alfa Granita Soft** : boissons « Granita » soda exclues ; e-liquides Alfa à confirmer sur source officielle.
5. **Cumulus / Mexican Cartel** : absents du JSON parcouru ici (hors tableau manufacturers du fichier fourni) — à traiter si présents ailleurs dans le ZIP.

## Règles respectées

- Stock SumUp **jamais écrasé**
- Pas d’invention de produits / logos / EAN
- `products: []` = recherche, pas ignore
- Navigation Fabricant → Gamme → Produit inchangée
- Sur-matching SumUp (arômes génériques) détecté puis corrigé

## Commandes

```bash
npm run catalog:yoann-audit
npm run catalog:yoann-correct          # dry-run
npm run catalog:yoann-correct:apply    # écriture
npx tsx scripts/fix-yoann-overlinks.ts --apply
npx tsx scripts/repair-yoann-range-links.ts --apply
```

## Fichiers

- `data/catalog/yoann/allvaps_catalogue.json`
- `data/catalog/yoann/official-confirmed-catalog.json`
- `data/catalog/yoann/AUDIT_COMPLETENESS_2026-07-31.md`
- `data/catalog/yoann/CORRECTION_PASS_2026-07-31.json`
