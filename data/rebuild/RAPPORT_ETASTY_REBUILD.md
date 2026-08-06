# Rapport rebuild e.Tasty

Date : 2026-07-30  
Script : `scripts/rebuild-etasty-catalog.ts`  
Scrape : `data/rebuild/ETASTY_OFFICIAL_SCRAPE_FULL.json`  
Détail JSON : `data/rebuild/RAPPORT_ETASTY_REBUILD.json`

## Sources croisées

| Source | Contenu utilisé |
|--------|-----------------|
| SumUp (DB locale, lecture seule) | **259** lignes e.Tasty / e-tasty |
| Médias ZIP déjà importés | **232** fichiers sous `public/media/products/e-tasty/` (bankiz, freezy-crush, gang-organise, god-fall-city, inspiration, letters, numbers, one-taste, smoke-wars, twenty) |
| Site officiel [pro.e-tasty.fr](https://pro.e-tasty.fr) | **375** produits scrapés sur **24** gammes |

Aucun produit inventé. Aucune écriture SumUp.

## Structure appliquée

```
e.Tasty
 ├── One Taste          (10 ml / 50 ml)
 ├── Bankiz
 ├── Inspiration
 ├── God Fall City       (100 ml e-liquides)
 ├── Numbers             (Concentrés 30 ml ≠ flacons 100 ml officiels)
 ├── Letters             (Concentrés 30 ml ≠ flacons 100 ml officiels)
 ├── Twenty              (20 ml)
 ├── Gang Organisé / Freezy Crush / Smoke Wars / Amalgam / Amazone
 └── Do It Yourself     (bases)
```

Règle dure : **concentré 30 ml ≠ e-liquide 100 ml** (Letters A/B/C et Numbers 01–11 SumUp = concentrés 30 ml uniquement).

## Bilan

| Indicateur | Valeur |
|------------|--------|
| Produits corrigés (nom / type / volume / catégorie) | **241** (passe principale) puis ajustements ciblés |
| Produits déplacés (gamme / format) | **78** puis **2** finitions |
| Doublons / corruptions désactivés | **2** Amalgam (CSV SumUp collé dans le nom) + **4** « Vaptasty » hors gamme |
| Mélange concentré/100 ml restant | **0** |

### Répartition finale (259 lignes SumUp)

| Gamme | Nb |
|-------|----|
| One Taste | 191 |
| Bankiz | 14 |
| Numbers (concentrés 30 ml) | 11 |
| Inspiration | 6 |
| Gang Organisé | 5 |
| Amalgam | 5 (dont 2 corrompus désactivés) |
| Twenty | 5 |
| God Fall City | 4 |
| Do It Yourself | 4 |
| Freezy Crush | 3 |
| Letters (concentrés 30 ml) | 3 |
| Amazone | 2 |
| Smoke Wars | 2 |
| Sans gamme (Vaptasty) | 4 — à vérifier manuellement |

### Formats

- 10 ml : 178  
- 50 ml : 48  
- Concentrés 30 ml : 14  
- 100 ml : 4 (God Fall City uniquement côté SumUp)  
- 20 ml : 5 (Twenty)  
- Indéterminé : ~10 (packs / lignes incomplètes)

## Produits corrigés (exemples critiques)

- **Letters A/B/C** : étaient en `100ml` / catégorie e-liquide → **Concentrés 30 ml**, noms officiels `LETTERS A/B/C CONCENTRÉ 30ml`
- **Numbers 01–11** : format `concentre-30ml`, gamme Numbers, noms officiels `Numbers XX - 30ml`
- **God Fall City** : ADESS / DZEUS / POSEI / THENA → e-liquides **100 ml** (titres officiels)
- **Twenty** : 5 références → **20 ml**, titres officiels
- **One Taste** : monofacets SumUp sans le mot « One Taste » rattaches à la gamme + format 10/50 ml
- **Bases DIY** : gamme Do It Yourself

## Produits déplacés

Voir liste complète dans `RAPPORT_ETASTY_REBUILD.json` → `moved`  
Principaux flux : `One Taste/?/null` → formats 10/50 ; `Letters/100ml` → `concentre-30ml` ; Numbers sans gamme → Numbers/concentre-30ml.

## Doublons / anomalies désactivés

- 2 fiches Amalgam avec `sumupName` = ligne CSV entière collée (`sumup_csv_corrompu_doublon_amalgam`)
- 4 lignes **Vaptasty** (flamme rush, elastic cloud, rock puff, invisivape) : pas une gamme e.Tasty liquides (`sumup_vaptasty_pas_gamme_etasty`)

## SumUp présent, introuvable / non matché sur le site officiel

À vérifier manuellement (extrait — total ~41 dans le JSON) :

- Variantes nicotine / orthographe SumUp sans fiche pro exacte (ex. United, Raisin exquis, Popcorn…)
- Packs / starters partiels
- Fiches Amalgam / lignes CSV corrompues
- Vaptasty (hors catalogue e-liquides)

Liste : `RAPPORT_ETASTY_REBUILD.json` → `sumupOnlyMissingOfficial`

## Officiel e.Tasty absent de SumUp All Vap's

**~288** références pro non vendues / non présentes dans l’export SumUp local, notamment :

- Amazone, Shootiz, La Cueillette de Louise (catalogue pro large)
- Numbers **100 ml** et Letters **100 ml** (flacons officiels — All Vap’s n’a en SumUp que les **concentrés 30 ml**)
- Nombreux 10/50 ml Bankiz, Smoke Wars, Freezy Crush, One Taste non stockés

Liste : `RAPPORT_ETASTY_REBUILD.json` → `officialOnlyAbsentFromSumup`

## Contrôle local

- http://localhost:3000/fabricants/e-tasty
- http://localhost:3000/gammes/god-fall-city?fabricant=e-tasty
- http://localhost:3000/gammes/letters?fabricant=e-tasty
- http://localhost:3000/gammes/numbers?fabricant=e-tasty
- http://localhost:3000/gammes/one-taste?fabricant=e-tasty
- http://localhost:3000/gammes/twenty?fabricant=e-tasty

Relancer :

```bash
npx tsx scripts/rebuild-etasty-catalog.ts
npx tsx scripts/rebuild-etasty-catalog.ts --refresh   # rescrape officiel
```
