# Rapport avertissements SumUp restants

**Date :** 2026-08-03T18:17:49.542Z  
**Périmètre :** post `--apply-exact-only` — **aucune nouvelle application**

## Contrôles d’intégrité (re-vérifiés)

| Contrôle | Valeur |
|---|---:|
| Prix modifiés vs snapshot pré-apply | **0** |
| Stocks modifiés | **0** |
| Produits supprimés | **0** |
| sumupProductId remplacés | **0** |
| EAN altérés | **0** |
| Liaisons EAN appliquées (journal) | **139** |
| Liaisons refusées (journal) | **0** |

## Recalcul global

| Indicateur | Valeur |
|---|---:|
| Correspondances exactes réellement appliquées | **139** |
| Produits catalogue avec SumUp | **2057** |
| Produits restant sans sumupProductId | **613** |
| Produits SumUp sans fiche catalogue (NO_MATCH utiles) | **0** |
| Lignes NO_MATCH vides | **23** |
| Produits catalogue sans liaison SumUp | **613** |
| Conflits sumupProductId dupliqués | **0** |
| EAN catalogue dupliqués | **0** |
| Correspondances nom-seul (non appliquées) | **14** |

## Classification des entrées restantes

| Statut | Nb |
|---|---:|
| PRODUIT_INACTIF | 515 |
| DONNEES_MANQUANTES | 121 |
| VALIDATION_MANUELLE_SIMPLE | 14 |

File : `data/rebuild/QUEUE_VALIDATION_SUMUP_RESTANTE.json` (650 entrées)

---

## 1. Cas sûrs mais validation humaine (nom strict)

**Nombre :** 14

Ces lignes ont un nom catalogue **identique** (normalisé), prix souvent identique, mais **sans EAN SumUp** — non liées automatiquement.

| SumUp | Catalogue | Fabricant | Format | Nicotine | Différences |
|---|---|---|---|---|---|
| Ananamorphe 50ml - Modjo Vapors by Liquidarom | Ananamorphe 50ml - Modjo Vapors by Liquidarom | — | 50 ml | — | prix S=1990 / C=1990 ; image=IMAGE_MISSING ; sumupId catalogue=non |
| BLOODY SUMMER ELIQUIDFRANCE FRUIZEE 50ML 00MG | BLOODY SUMMER ELIQUIDFRANCE FRUIZEE 50ML 00MG | — | 50 ml | 0 mg | prix S=1990 / C=1990 ; image=IMAGE_MISSING ; sumupId catalogue=non |
| Bisou Black Swoke 50ml Swoke | Bisou Black Swoke 50ml Swoke | — | 50 ml | — | prix S=2090 / C=2090 ; image=IMAGE_MISSING ; sumupId catalogue=non |
| Bloody Dragon 50ml - Fruizee by ELIQUID France | Bloody Dragon 50ml - Fruizee by ELIQUID France | — | 50 ml | — | prix S=1990 / C=1990 ; image=IMAGE_MISSING ; sumupId catalogue=non |
| Booster 50/50 Sel de nicotine Liquideo 10ml 20mg | Booster 50/50 Sel de nicotine Liquideo 10ml 20mg | — | 10 ml | 20 mg | prix S=120 / C=120 ; image=IMAGE_MISSING ; sumupId catalogue=non |
| Breezer Saiyen Vapors 50ml Swoke | Breezer Saiyen Vapors 50ml Swoke | — | 50 ml | — | prix S=1990 / C=1990 ; image=IMAGE_MISSING ; sumupId catalogue=non |
| COLA LALA CANDY CO. VAPE MAKER 50ML | COLA LALA CANDY CO. VAPE MAKER 50ML | — | 50 ml | — | prix S=1990 / C=1990 ; image=IMAGE_MISSING ; sumupId catalogue=non |
| Chocolat Obsession 50ml - Absolut by Vape Maker | Chocolat Obsession 50ml - Absolut by Vape Maker | — | 50 ml | — | prix S=1990 / C=1990 ; image=IMAGE_MISSING ; sumupId catalogue=non |
| Chocolate Vanilla 50ml - Suprême by Vape Maker | Chocolate Vanilla 50ml - Suprême by Vape Maker | — | 50 ml | — | prix S=1990 / C=1990 ; image=IMAGE_MISSING ; sumupId catalogue=non |
| FIZZYPPLE CANDY CO. VAPE MAKER 50ML | FIZZYPPLE CANDY CO. VAPE MAKER 50ML | — | 50 ml | — | prix S=1990 / C=1990 ; image=IMAGE_MISSING ; sumupId catalogue=non |
| Frozen Paipai Saiyen Vapors 50ml Swoke | Frozen Paipai Saiyen Vapors 50ml Swoke | — | 50 ml | — | prix S=1990 / C=1990 ; image=IMAGE_MISSING ; sumupId catalogue=non |
| Itank T 6ml Vaporesso | Itank T 6ml Vaporesso | — | 6 ml | — | prix S=— / C=0 ; image=IMAGE_MISSING ; sumupId catalogue=non |
| Necromancer 50ml - Tribal Lords by Tribal Force | Necromancer 50ml - Tribal Lords by Tribal Force | — | 50 ml | — | prix S=1990 / C=1990 ; image=IMAGE_MISSING ; sumupId catalogue=non |
| Thief 50ml - Tribal Lords by Tribal Force | Thief 50ml - Tribal Lords by Tribal Force | — | 50 ml | — | prix S=1990 / C=1990 ; image=IMAGE_MISSING ; sumupId catalogue=non |

### Détail côte à côte (nom seul)

#### Ananamorphe 50ml - Modjo Vapors by Liquidarom

| Champ | SumUp | Catalogue |
|---|---|---|
| Nom | Ananamorphe 50ml - Modjo Vapors by Liquidarom | Ananamorphe 50ml - Modjo Vapors by Liquidarom |
| ID SumUp | `6d835b4c-24f1-4c02-b9a6-ce3e8c058e11` | **absent** |
| EAN | **absent** | **absent** |
| Format | 50 ml | 50 ml |
| Nicotine | — mg | — mg |
| Fabricant | — | — |
| Gamme | — | — |
| Prix (cents) | 1990 | 1990 |

**Action proposée :** validation humaine pour renseigner `sumupProductId=6d835b4c-24f1-4c02-b9a6-ce3e8c058e11` sur `cms6euay6002futmkqpfviq8w` **si** confirmation métier.  
**Ne pas appliquer automatiquement.**

#### BLOODY SUMMER ELIQUIDFRANCE FRUIZEE 50ML 00MG

| Champ | SumUp | Catalogue |
|---|---|---|
| Nom | BLOODY SUMMER ELIQUIDFRANCE FRUIZEE 50ML 00MG | BLOODY SUMMER ELIQUIDFRANCE FRUIZEE 50ML 00MG |
| ID SumUp | `cc31491d-d289-43d9-a476-adc5d9e1f723` | **absent** |
| EAN | **absent** | **absent** |
| Format | 50 ml | 50 ml |
| Nicotine | 0 mg | 0 mg |
| Fabricant | — | — |
| Gamme | — | — |
| Prix (cents) | 1990 | 1990 |

**Action proposée :** validation humaine pour renseigner `sumupProductId=cc31491d-d289-43d9-a476-adc5d9e1f723` sur `cms6euba8004tutmkh48nubig` **si** confirmation métier.  
**Ne pas appliquer automatiquement.**

#### Bisou Black Swoke 50ml Swoke

| Champ | SumUp | Catalogue |
|---|---|---|
| Nom | Bisou Black Swoke 50ml Swoke | Bisou Black Swoke 50ml Swoke |
| ID SumUp | `bc584d4d-17eb-4f05-94de-b1005bfd0151` | **absent** |
| EAN | **absent** | **absent** |
| Format | 50 ml | 50 ml |
| Nicotine | — mg | — mg |
| Fabricant | — | — |
| Gamme | — | — |
| Prix (cents) | 2090 | 2090 |

**Action proposée :** validation humaine pour renseigner `sumupProductId=bc584d4d-17eb-4f05-94de-b1005bfd0151` sur `cms6eubgv006dutmkj4b0d5hx` **si** confirmation métier.  
**Ne pas appliquer automatiquement.**

#### Bloody Dragon 50ml - Fruizee by ELIQUID France

| Champ | SumUp | Catalogue |
|---|---|---|
| Nom | Bloody Dragon 50ml - Fruizee by ELIQUID France | Bloody Dragon 50ml - Fruizee by ELIQUID France |
| ID SumUp | `4f84606d-d721-49eb-b6ab-a74037212142` | **absent** |
| EAN | **absent** | **absent** |
| Format | 50 ml | 50 ml |
| Nicotine | — mg | — mg |
| Fabricant | — | — |
| Gamme | — | — |
| Prix (cents) | 1990 | 1990 |

**Action proposée :** validation humaine pour renseigner `sumupProductId=4f84606d-d721-49eb-b6ab-a74037212142` sur `cms6eubjl006zutmk245gtsun` **si** confirmation métier.  
**Ne pas appliquer automatiquement.**

#### Booster 50/50 Sel de nicotine Liquideo 10ml 20mg

| Champ | SumUp | Catalogue |
|---|---|---|
| Nom | Booster 50/50 Sel de nicotine Liquideo 10ml 20mg | Booster 50/50 Sel de nicotine Liquideo 10ml 20mg |
| ID SumUp | `b90f4561-3db4-42cc-b3c4-4e12564aabab` | **absent** |
| EAN | **absent** | **absent** |
| Format | 10 ml | 10 ml |
| Nicotine | 20 mg | 20 mg |
| Fabricant | — | — |
| Gamme | — | — |
| Prix (cents) | 120 | 120 |

**Action proposée :** validation humaine pour renseigner `sumupProductId=b90f4561-3db4-42cc-b3c4-4e12564aabab` sur `cms6eubmp007outmkrq0e22jw` **si** confirmation métier.  
**Ne pas appliquer automatiquement.**

#### Breezer Saiyen Vapors 50ml Swoke

| Champ | SumUp | Catalogue |
|---|---|---|
| Nom | Breezer Saiyen Vapors 50ml Swoke | Breezer Saiyen Vapors 50ml Swoke |
| ID SumUp | `0d8fa941-26fd-451c-bdff-4815d844ced0` | **absent** |
| EAN | **absent** | **absent** |
| Format | 50 ml | 50 ml |
| Nicotine | — mg | — mg |
| Fabricant | — | — |
| Gamme | — | — |
| Prix (cents) | 1990 | 1990 |

**Action proposée :** validation humaine pour renseigner `sumupProductId=0d8fa941-26fd-451c-bdff-4815d844ced0` sur `cms6eubp40087utmkigpgupnz` **si** confirmation métier.  
**Ne pas appliquer automatiquement.**

#### COLA LALA CANDY CO. VAPE MAKER 50ML

| Champ | SumUp | Catalogue |
|---|---|---|
| Nom | COLA LALA CANDY CO. VAPE MAKER 50ML | COLA LALA CANDY CO. VAPE MAKER 50ML |
| ID SumUp | `42ae175a-6f62-43f9-8007-4f3b25a64373` | **absent** |
| EAN | **absent** | **absent** |
| Format | 50 ml | 50 ml |
| Nicotine | — mg | — mg |
| Fabricant | — | — |
| Gamme | — | — |
| Prix (cents) | 1990 | 1990 |

**Action proposée :** validation humaine pour renseigner `sumupProductId=42ae175a-6f62-43f9-8007-4f3b25a64373` sur `cms6eubro008uutmkj5fusf3k` **si** confirmation métier.  
**Ne pas appliquer automatiquement.**

#### Chocolat Obsession 50ml - Absolut by Vape Maker

| Champ | SumUp | Catalogue |
|---|---|---|
| Nom | Chocolat Obsession 50ml - Absolut by Vape Maker | Chocolat Obsession 50ml - Absolut by Vape Maker |
| ID SumUp | `dff87fb7-5f2f-4ed0-a574-483529fe5b7e` | **absent** |
| EAN | **absent** | **absent** |
| Format | 50 ml | 50 ml |
| Nicotine | — mg | — mg |
| Fabricant | — | — |
| Gamme | — | — |
| Prix (cents) | 1990 | 1990 |

**Action proposée :** validation humaine pour renseigner `sumupProductId=dff87fb7-5f2f-4ed0-a574-483529fe5b7e` sur `cms6euc4w00bjutmk39ny4o4t` **si** confirmation métier.  
**Ne pas appliquer automatiquement.**

#### Chocolate Vanilla 50ml - Suprême by Vape Maker

| Champ | SumUp | Catalogue |
|---|---|---|
| Nom | Chocolate Vanilla 50ml - Suprême by Vape Maker | Chocolate Vanilla 50ml - Suprême by Vape Maker |
| ID SumUp | `d5eecfc8-d9f9-4f5f-98a2-4f595131f68d` | **absent** |
| EAN | **absent** | **absent** |
| Format | 50 ml | 50 ml |
| Nicotine | — mg | — mg |
| Fabricant | — | — |
| Gamme | — | — |
| Prix (cents) | 1990 | 1990 |

**Action proposée :** validation humaine pour renseigner `sumupProductId=d5eecfc8-d9f9-4f5f-98a2-4f595131f68d` sur `cms6euc5700bmutmkt5obhly4` **si** confirmation métier.  
**Ne pas appliquer automatiquement.**

#### FIZZYPPLE CANDY CO. VAPE MAKER 50ML

| Champ | SumUp | Catalogue |
|---|---|---|
| Nom | FIZZYPPLE CANDY CO. VAPE MAKER 50ML | FIZZYPPLE CANDY CO. VAPE MAKER 50ML |
| ID SumUp | `7e2d548e-b906-491b-9603-a2786fec73e2` | **absent** |
| EAN | **absent** | **absent** |
| Format | 50 ml | 50 ml |
| Nicotine | — mg | — mg |
| Fabricant | — | — |
| Gamme | — | — |
| Prix (cents) | 1990 | 1990 |

**Action proposée :** validation humaine pour renseigner `sumupProductId=7e2d548e-b906-491b-9603-a2786fec73e2` sur `cms6eud9800k2utmk1vzy2i90` **si** confirmation métier.  
**Ne pas appliquer automatiquement.**

#### Frozen Paipai Saiyen Vapors 50ml Swoke

| Champ | SumUp | Catalogue |
|---|---|---|
| Nom | Frozen Paipai Saiyen Vapors 50ml Swoke | Frozen Paipai Saiyen Vapors 50ml Swoke |
| ID SumUp | `b957453c-17e9-4c00-a115-665d6e5ded2c` | **absent** |
| EAN | **absent** | **absent** |
| Format | 50 ml | 50 ml |
| Nicotine | — mg | — mg |
| Fabricant | — | — |
| Gamme | — | — |
| Prix (cents) | 1990 | 1990 |

**Action proposée :** validation humaine pour renseigner `sumupProductId=b957453c-17e9-4c00-a115-665d6e5ded2c` sur `cms6eudls00n7utmkdjuj2srk` **si** confirmation métier.  
**Ne pas appliquer automatiquement.**

#### Itank T 6ml Vaporesso

| Champ | SumUp | Catalogue |
|---|---|---|
| Nom | Itank T 6ml Vaporesso | Itank T 6ml Vaporesso |
| ID SumUp | `86f366b4-3703-42f8-aa54-c6f66b8f84ea` | **absent** |
| EAN | **absent** | **absent** |
| Format | 6 ml | 6 ml |
| Nicotine | — mg | — mg |
| Fabricant | — | — |
| Gamme | — | — |
| Prix (cents) | — | 0 |

**Action proposée :** validation humaine pour renseigner `sumupProductId=86f366b4-3703-42f8-aa54-c6f66b8f84ea` sur `cms6euen500vlutmkweftib1o` **si** confirmation métier.  
**Ne pas appliquer automatiquement.**

#### Necromancer 50ml - Tribal Lords by Tribal Force

| Champ | SumUp | Catalogue |
|---|---|---|
| Nom | Necromancer 50ml - Tribal Lords by Tribal Force | Necromancer 50ml - Tribal Lords by Tribal Force |
| ID SumUp | `6ac4c0f1-69de-4768-a75f-4c9f0652c0fb` | **absent** |
| EAN | **absent** | **absent** |
| Format | 50 ml | 50 ml |
| Nicotine | — mg | — mg |
| Fabricant | — | — |
| Gamme | — | — |
| Prix (cents) | 1990 | 1990 |

**Action proposée :** validation humaine pour renseigner `sumupProductId=6ac4c0f1-69de-4768-a75f-4c9f0652c0fb` sur `cms6euggm019futmkwlok0f9l` **si** confirmation métier.  
**Ne pas appliquer automatiquement.**

#### Thief 50ml - Tribal Lords by Tribal Force

| Champ | SumUp | Catalogue |
|---|---|---|
| Nom | Thief 50ml - Tribal Lords by Tribal Force | Thief 50ml - Tribal Lords by Tribal Force |
| ID SumUp | `76581542-dd57-42fb-b852-81d319f9c429` | **absent** |
| EAN | **absent** | **absent** |
| Format | 50 ml | 50 ml |
| Nicotine | — mg | — mg |
| Fabricant | — | — |
| Gamme | — | — |
| Prix (cents) | 1990 | 1990 |

**Action proposée :** validation humaine pour renseigner `sumupProductId=76581542-dd57-42fb-b852-81d319f9c429` sur `cms6euif601oiutmkgl0kkgrj` **si** confirmation métier.  
**Ne pas appliquer automatiquement.**


---

## 2. Conflits techniques

- Doublons `sumupProductId` catalogue : **0**
- Autres conflits audit : **0**

_aucun conflit sumupProductId_

---

## 3. Doublons EAN catalogue

**Nombre :** 0

_aucun_

---

## 4. Produits SumUp sans correspondance

_aucun produit nommé_

Lignes vides ignorables : 23

---

## 5. Produits anciens / inactifs (catalogue sans SumUp)

| Statut file | Nb |
|---|---:|
| PRODUIT_INACTIF | 515 |
| PRODUIT_HISTORIQUE | 0 |

---

## 6. Lignes ne représentant pas un produit

| SERVICE_OU_REMISE | 0 |
| DONNEES_MANQUANTES (lignes vides incluses) | 121 |

---

## 7. Produits manquant dans le catalogue (SumUp → à créer ?)

Statut `AUCUNE_CORRESPONDANCE` issus de NO_MATCH : voir section 4.  
**Ne pas créer automatiquement.**

---

## 8. Produits catalogue absents de SumUp

**Total :** 613

Répartition dans la file : `CATALOG_WITHOUT_SUMUP` (statuts INACTIF / HISTORIQUE / DONNEES_MANQUANTES / AUCUNE_CORRESPONDANCE).

---

## Cas impossibles à décider automatiquement

**Nombre :** 0

_aucun hors doublons/conflits déjà listés_

---

## Synthèse chiffrée finale

- liaisons exactes appliquées : **139**
- produits encore sans liaison SumUp : **613**
- produits SumUp sans catalogue : **0** produit nommé (**23** lignes vides d’export → `DONNEES_MANQUANTES`)
- produits catalogue sans SumUp : **613** (**515** `PRODUIT_INACTIF` + **98** actifs/`DONNEES_MANQUANTES`)
- conflits : **0**
- doublons : **0** (EAN) / **0** (SumUp ID)
- validations manuelles simples : **14**
- cas impossibles à décider automatiquement : **0**
- prix modifiés : **0**
- stocks modifiés : **0**
- produits supprimés : **0**
- TypeScript : **OK**
- ESLint : **OK**
- build : **OK** (validé après apply EAN ; aucune commande d’application supplémentaire)

ÉTAT FINAL : AUDIT DES AVERTISSEMENTS TERMINÉ — VALIDATION HUMAINE REQUISE
