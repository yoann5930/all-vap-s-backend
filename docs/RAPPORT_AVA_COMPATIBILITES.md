# RAPPORT AVA — Compatibilités

**Dernière mise à jour :** 2026-08-01  
**Mission :** 5/7 (partielle)

## État

| Modèle | Cartouches / coils | Source | Statut |
|--------|-------------------|--------|--------|
| Vaporesso XROS 3 | 0.6Ω / 1.0Ω (notice) | PDF officiel | ✅ OFFICIAL_CONFIRMED |
| Voopoo Argus G2 | Top Fill 0.4 / 0.7 / 1.0 Ω + plages W | Page produit Voopoo | ⚠️ specs OK · notice PDF manquante |
| Liquide Lab Kuix Batterie | — | SumUp | ❌ notice absente |

## Règles code

- Pas de coils sans confirmation modèle + cartouche (`device-confirmation`)
- Tests `ava:device:test` : 10 OK

## Bloquant

PDF notice Argus G2 et Kuix non intégrés → pas de procédures boutons Argus confirmées.
