# Rapport obligation — logos fabricants & covers gammes

Généré : 2026-08-01T00:26:22.658Z

## Obligation

Navigation catalogue **strictement** :

1. `/e-liquides` → case **logo fabricant seul**
2. `/fabricants/[slug]` → case **visuel / logo de gamme**
3. `/gammes/[slug]` → produits

**Ne jamais oublier** : logo fabricant + cover gamme pour toute gamme publiée.

## Synthèse

| Indicateur | Valeur |
| --- | ---: |
| Logos fabricants OK | 35 |
| Logos manquants | 0 |
| Covers gammes publiées OK | 40 |
| Gammes publiées sans cover | 0 |

## Logos — détail

| Fabricant | Statut | Source |
| --- | --- | --- |
| avap | already_present | — |
| airmust | already_present | — |
| alfa | SOURCE_OFFICIELLE_INTROUVABLE | — |
| aromes-secrets | already_present | — |
| biarritz-lab | already_present | — |
| budz-vape | SOURCE_OFFICIELLE_INTROUVABLE | — |
| cloud-vapor | already_present | — |
| cookin-cloud | already_present | — |
| eliquid-france | already_present | — |
| fruity-cool | SOURCE_OFFICIELLE_INTROUVABLE | — |
| fruizee | download_fail | https://www.fruizee.fr/img/logo.png |
| guilab | download_fail | https://www.guilab.fr/img/logo.png |
| illusion | SOURCE_OFFICIELLE_INTROUVABLE | — |
| juice-66 | already_present | — |
| kf-studio | SOURCE_OFFICIELLE_INTROUVABLE | — |
| le-maudit | SOURCE_OFFICIELLE_INTROUVABLE | — |
| liquidarom | already_present | — |
| liquide-lab | already_present | — |
| liquideo | already_present | — |
| mds-juice | SOURCE_OFFICIELLE_INTROUVABLE | — |
| mg-vape | SOURCE_OFFICIELLE_INTROUVABLE | — |
| made-in-vape-distrib | SOURCE_OFFICIELLE_INTROUVABLE | — |
| mukk-mukk | SOURCE_OFFICIELLE_INTROUVABLE | — |
| overdrive-juices | SOURCE_OFFICIELLE_INTROUVABLE | — |
| protect | already_present | — |
| raneki-liquide | already_present | — |
| revenge-juices | download_fail | https://www.revengejuices.com/img/logo.png |
| swoke | already_present | — |
| t-juice | already_present | — |
| the-fuu | already_present | — |
| vape-47 | already_present | — |
| vape-city | SOURCE_OFFICIELLE_INTROUVABLE | — |
| vape-maker | SOURCE_OFFICIELLE_INTROUVABLE | — |
| yum-ebot | SOURCE_OFFICIELLE_INTROUVABLE | — |
| e-tasty | already_present | — |

## Covers — détail

| Gamme | Statut |
| --- | --- |
| liquide-lab/big-kawa | already_present |
| liquideo/dragonzz-liquideo | already_present |
| liquideo/evolution-liquideo | already_present |
| liquideo/freeze-liquideo | already_present |
| vape-47/enfer | already_present |
| vape-47/les-fruits-d-enfer | already_present |
| vape-47/furiosa-eggz | already_present |
| t-juice/t-juice-50-ml | already_present |
| cookin-cloud/myst | already_present |
| eliquid-france/fruizee-max-eliquid-france | already_present |
| eliquid-france/lemon-time-eliquid-france | already_present |
| eliquid-france/mintaia-eliquid-france | already_present |

## Commandes

```bash
npm run logos:manufacturers
npm run catalog:range-covers
npx tsx scripts/complete-logos-and-range-covers.ts
npx tsx scripts/audit-logos-and-range-covers.ts
```

Chemins :
- `public/media/manufacturers/{slug}/logo.webp`
- `public/media/manufacturers/{slug}/ranges/{gamme}.webp`
