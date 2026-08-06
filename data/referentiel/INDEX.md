# Référentiel catalogue All Vap's

Date : 2026-07-29T21:09:29.781Z

> Source de vérité données — **aucune page front générée**.
> Ambigu / manquant → **a_verifier** (jamais inventé).

## Ordre de construction

| # | Étape | Fichier | Statut |
|---|---|---|---|
| 1 | Fabricants | `01_FABRICANTS.json` | ✅ 15 |
| 2 | Gammes | `02_GAMMES.json` | ✅ 25 |
| 3 | Formats | `03_FORMATS.json` | ✅ 5 |
| 4 | Photos | `04_PHOTOS.json` | ✅ |
| 5 | SumUp | `05_SUMUP.json` | ✅ |
| 6 | Produits + arbre + sync DB | `06_PRODUITS.json`, `07_ARBRE.json`, `08_SYNC_DB.json` | ✅ DB: 15 fab / 27 gammes / 5 formats / 91 produits liés |
| 7–11 | Pages Fabricant / Gamme / Format / Produit / Home | — | ⏸ **bloqué jusqu'à validation données** |

## Synthèse

| Indicateur | Valeur |
|---|---|
| Fabricants | 15 (vérifiés 5, partiels 5, à vérifier 5) |
| Gammes | 25 |
| Formats référencés | 10ml, 30ml, 50ml, 70ml, 100ml |
| Produits MASTER | 127 |
| Match SumUp AUTO (validés) | 91 |
| SumUp à valider | 11 |
| Absents de SumUp | 25 |
| Photos officielles (validés) | 34 / 91 |
| Validés sans photo | 57 |
| Validés sans format clair | 14 |
| EAN connus MASTER | 6 |
| EAN à compléter | 121 |

## Arbre (validés uniquement)

### Biarritz Lab (`biarritz-lab`) — verifie
- **Mamita**
  - `50ml` — 5 validé(s) ; photos 5/5
    - Bowl de Céréales Noisette Pécan Crème [officielle] ⚠ ean_manquant, pg_vg_a_verifier
    - Café Stout [officielle] ⚠ ean_manquant, pg_vg_a_verifier
    - Café Vanille Custard [officielle] ⚠ ean_manquant, pg_vg_a_verifier
    - Cookie Choco Noisette [officielle] ⚠ ean_manquant, pg_vg_a_verifier
    - Custard Vanille Pécan [officielle] ⚠ ean_manquant, pg_vg_a_verifier

### Cloud Vapor (`cloud-vapor`) — partiel
- **Call of Vape**
  - `50ml` — 1 validé(s) ; photos 0/1
    - Zombie [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante

### Cookin Cloud (`cookin-cloud`) — a_verifier
- **Myst**
  - `50ml` — 6 validé(s) ; photos 0/6
    - Da Crazy Bird [manquante] ⚠ photo_manquante, ean_manquant, db:photo_officielle_manquante
    - Da Crusty King [manquante] ⚠ photo_manquante, ean_manquant, db:photo_officielle_manquante
    - Da Good Snake [manquante] ⚠ photo_manquante, ean_manquant, db:photo_officielle_manquante
    - Da Loving Witch [manquante] ⚠ photo_manquante, ean_manquant, db:photo_officielle_manquante
    - Da Smoky Eye [manquante] ⚠ photo_manquante, ean_manquant, db:photo_officielle_manquante
    - Da Sweet Face [manquante] ⚠ photo_manquante, ean_manquant, db:photo_officielle_manquante

### Illusion (`illusion`) — a_verifier
- **Illusion**

### Juice 66 (`juice-66`) — a_verifier
- **Juice 66**
  - `50ml` — 2 validé(s) ; photos 0/2
    - Frost [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Snow [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante

### Liquidarom (`liquidarom`) — verifie
- **Edition Collection**
- **Ice Cool X**
  - `50ml` — 5 validé(s) ; photos 5/5
    - Ice Cool X - Blackberry Raspberry [officielle] ⚠ ean_manquant
    - Ice Cool X - Blackcurrant Raspberry Grape [officielle] ⚠ ean_manquant
    - Ice Cool X - Blue Raspberry Pitaya [officielle] ⚠ ean_manquant
    - Ice Cool X - Mixed Red Berries [officielle] ⚠ ean_manquant
    - Ice Cool X - Watermelon Lemon [officielle] ⚠ ean_manquant
- **Ice Cool**
  - `50ml` — 18 validé(s) ; photos 18/18
    - Ice Cool - Ananas Kiwi jaune [officielle] ⚠ ean_manquant
    - Ice Cool - Cassis Citron [officielle]
    - Ice Cool - Cassis Framboise Raisin [officielle]
    - Ice Cool - Cassis Mangue [officielle]
    - Ice Cool - Citron Pastèque [officielle] ⚠ ean_manquant
    - Ice Cool - Citron vert Orange sanguine [officielle] ⚠ ean_manquant
    - Ice Cool - Cocktail exotique [officielle] ⚠ ean_manquant
    - Ice Cool - Cola Pomme [officielle] ⚠ ean_manquant
    - Ice Cool - Extra Fruits rouges [officielle] ⚠ ean_manquant
    - Ice Cool - Fraise Framboise Basilic [officielle]
    - Ice Cool - Framboise bleue Pitaya [officielle] ⚠ ean_manquant
    - Ice Cool - Fruit du dragon Fruits rouges [officielle] ⚠ ean_manquant
    - Ice Cool - Fruit du serpent Framboise [officielle] ⚠ ean_manquant
    - Ice Cool - Grenade tropicale [officielle] ⚠ ean_manquant
    - Ice Cool - Kiwi Banane [officielle] ⚠ ean_manquant
    - Ice Cool - Mangue Passion [officielle]
    - Ice Cool - Pastèque Fruits rouges [officielle] ⚠ ean_manquant
    - Ice Cool - Pêche Raisin [officielle]
- **Les Collègues**
  - `50ml` — 8 validé(s) ; photos 4/8
    - Les Collègues - La Coquette [manquante] ⚠ photo_manquante, ean_manquant, db:faux_positif_photo_tchatcheur
    - Les Collègues - La Mimi [manquante] ⚠ photo_manquante, ean_manquant, db:faux_positif_photo_tchatcheur
    - Les Collègues - Le Balèze [manquante] ⚠ photo_manquante, ean_manquant, db:faux_positif_photo_tchatcheur
    - Les Collègues - Le Charmeur [manquante] ⚠ photo_manquante, ean_manquant, db:faux_positif_photo_tchatcheur
    - Les Collègues - Le ChocoStar [officielle] ⚠ ean_manquant
    - Les Collègues - Le Flambeur [officielle] ⚠ ean_manquant
    - Les Collègues - Le Funkie [officielle] ⚠ ean_manquant
    - Les Collègues - Le Tchatcheur [officielle] ⚠ ean_manquant
- **Les Essentiels**
  - `50ml` — 3 validé(s) ; photos 1/3
    - Les Essentiels - Le P'tit Blond [manquante] ⚠ photo_manquante, ean_manquant, db:photo_mauvais_format_retiree
    - Les Essentiels - Mojito des îles [officielle] ⚠ ean_manquant
    - Les Essentiels - Pastis 13 [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_mauvais_format_retiree

### MDS Juice (`mds-juice`) — partiel
- **MDS Juice**
  - `format-a-verifier` — 13 validé(s) ; photos 0/13
    - Beast [manquante] ⚠ format_a_verifier, photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Black Summer [manquante] ⚠ format_a_verifier, photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Blue [manquante] ⚠ format_a_verifier, photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Dark Rainbow [manquante] ⚠ format_a_verifier, photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Delicious [manquante] ⚠ format_a_verifier, photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Gold [manquante] ⚠ format_a_verifier, photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Green [manquante] ⚠ format_a_verifier, photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Lime [manquante] ⚠ format_a_verifier, photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Mojito [manquante] ⚠ format_a_verifier, photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Pink [manquante] ⚠ format_a_verifier, photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Red Wedding [manquante] ⚠ format_a_verifier, photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Sunny [manquante] ⚠ format_a_verifier, photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Virgo [manquante] ⚠ format_a_verifier, photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante

### Raneki Liquide (`raneki-liquide`) — partiel
- **Kyoto Storm**
  - `50ml` — 6 validé(s) ; photos 0/6
    - Akashi [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:faux_positif_logo_fabricant
    - Hanzo [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:faux_positif_logo_fabricant
    - Maneki [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:faux_positif_logo_fabricant
    - Musashi [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:faux_positif_logo_fabricant
    - Ryujin [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:faux_positif_logo_fabricant
    - Zenko [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:faux_positif_logo_fabricant
- **Olympe**
  - `50ml` — 5 validé(s) ; photos 0/5
    - Aphrodite [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Athéna [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Hadès [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Poséidon [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Zeus [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante

### T-Juice (`t-juice`) — verifie
- **T-Juice 50 mL**

### Vape 47 (`vape-47`) — verifie
- **Enfer**
  - `50ml` — 8 validé(s) ; photos 1/8
    - Enfer Blue [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Enfer Green [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Enfer Mango [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Enfer Original [officielle] ⚠ ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Enfer Purple [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Enfer Red [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Enfer Ultimate Freeze [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Enfer Yellow [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
- **Furiosa Eggz**
  - `50ml` — 7 validé(s) ; photos 0/7
    - Aria [manquante] ⚠ photo_manquante, ean_manquant, db:photo_officielle_manquante
    - Doom [manquante] ⚠ photo_manquante, ean_manquant, db:photo_officielle_manquante
    - Griffon [manquante] ⚠ photo_manquante, ean_manquant, db:photo_officielle_manquante
    - Ivy [manquante] ⚠ photo_manquante, ean_manquant, db:photo_officielle_manquante
    - Juno [manquante] ⚠ photo_manquante, ean_manquant, db:photo_officielle_manquante
    - Nova [manquante] ⚠ photo_manquante, ean_manquant, db:photo_officielle_manquante
    - Volta [manquante] ⚠ photo_manquante, ean_manquant, db:photo_officielle_manquante
- **Furiosa Skinz**
  - `format-a-verifier` — 1 validé(s) ; photos 0/1
    - Kaiser [manquante] ⚠ format_a_verifier, photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
- **L'Invapable**
  - `100ml` — 3 validé(s) ; photos 0/3
    - Baron Rouge [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Hyper Dragon [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante
    - Ultra Fraise [manquante] ⚠ photo_manquante, ean_manquant, pg_vg_a_verifier, db:photo_officielle_manquante

### Vape Maker (`vape-maker`) — a_verifier
- **Kaiju**

## Règles

1. Ne jamais inventer fabricant / gamme / format / photo / nom.
2. SumUp : seuls les `MATCH_AUTO` ∩ `IMPORT_SUMUP_FINAL` sont `valide`.
3. `MATCH_A_VALIDER` et absents restent hors publication.
4. Photo : officielle locale ou site fabricant uniquement ; sinon manquante.
5. Front (étapes 7–11) uniquement après validation de ce référentiel.

## Prochaine étape données

Synchroniser ce référentiel vers PostgreSQL (`Brand` / gammes / `productType` / liens) **sans publier de pages**.

## Sync DB

```json
{
  "date": "2026-07-29T21:13:15.185Z",
  "manufacturers": 15,
  "brands": 35,
  "ranges": 27,
  "formats": 5,
  "productsLinked": 91,
  "productsSkipped": 36,
  "formatsApplied": 77,
  "validesSansFormat": 0,
  "validesSansManufacturer": 0,
  "frontBloque": true
}
```

### Correction formats non prouvés

14 produits validés (13 MDS + Kaiser) : productType remis à ull (ormat_a_verifier) — aucune invention de format.
