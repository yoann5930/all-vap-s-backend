# Inventaire — photographie AVANT déploiement

**Date :** 2026-08-06T11:30Z approx  
**Source :** API publique production `https://www.allvaps.fr/api/products` (lecture seule)  
**Commit production :** `d5a6490`

> Aucune écriture DB, aucun seed, aucune migration exécutée pour ce snapshot.

## Compteurs catalogue public

| Métrique | Valeur |
|---|---|
| Produits total (pagination) | 40 |
| Produits actifs (`isActive`) | 40 |
| Produits visibles online (API publique) | 40 |
| Avec prix (`priceCents` > 0) | 0 |
| Avec stock (`stock` > 0) | 0 |
| Avec image (`imageUrl`) | 0 |
| Marques distinctes | 1 (Liquidarom) |
| Fingerprint `id:priceCents:stock` SHA-256 | `d56394f691f7bc11d88c0721b18c0f64736252f19961a7c3680fbdd59d96cf95` |

## EAN / SumUp / SKU

L’API publique produits ne expose pas exhaustivement EAN / SumUp IDs.  
Contrôle non destructif limité au fingerprint public ci-dessus.  
Contrôles EAN/SumUp fins = admin authentifié (non exécutés ici pour éviter toute mutation).

## Santé inventaire

| URL | HTTP | Notes |
|---|---|---|
| `https://inventaire.allvaps.fr/` | 200 | rewrite → `/inventaire` |
| `https://inventaire.allvaps.fr/inventaire` | 200 | UI login inventaire |
| `https://inventaire.allvaps.fr/api/health` | 200 | `mode:database` |

## Hash fichiers inventaire protégés (échantillon)

52 fichiers listés dans `INVENTORY_PROTECTED_FILES` (voir rapport final).  
Générés localement depuis le tip `d5a6490` (identique prod).

## Décision

Comme **aucun déploiement de code différentiel** n’est requis pour l’UI, ce snapshot sert de baseline de non-régression.  
Après contrôles : les métriques doivent rester **identiques** (delta 0).
