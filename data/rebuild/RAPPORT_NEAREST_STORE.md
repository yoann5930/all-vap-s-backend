# Rapport — Boutique All Vap’s la plus proche (localisation)

Date : 2026-07-30  
Statut : implémenté (pas de commit / push / déploiement)

## Fichiers créés

| Fichier | Rôle |
|---------|------|
| `lib/stores/nearest.ts` | Haversine, format téléphone, liens Maps / Waze / tel |
| `lib/stores/geocode-fr.ts` | Recherche manuelle ville / CP (hints locaux + Nominatim FR) |
| `lib/stores/preferred-store.ts` | localStorage id boutique uniquement |
| `components/home/FindNearestStore.tsx` | Encart UI (consentement + états) |
| `app/api/stores/nearest/route.ts` | API recherche manuelle (sans GPS client) |
| `scripts/test-nearest-store.ts` | Tests unitaires |
| `data/rebuild/RAPPORT_NEAREST_STORE.md` | Ce rapport |

## Fichiers modifiés

| Fichier | Modification |
|---------|--------------|
| `components/home/HomeShowcase.tsx` | Insertion de `<FindNearestStore />` |
| `lib/ai/ava-advisor.ts` | Utilisation boutique préférée / demande ville-CP |
| `lib/ai/openai-voice.ts` | Passage de `preferredStoreId` |
| `app/api/ai-assistant/route.ts` | Accepte `preferredStoreId` |
| `components/ai/ChatWindow.tsx` | Envoie l’id boutique mémorisé à l’API |

## Emplacement de l’encart

Accueil (`HomeShowcase`) : **entre la barre de confiance (`TrustBar`) et la section boutiques (`StoresSection`)**.

Pas de popup au chargement. La géolocalisation navigateur n’est appelée qu’après :

1. clic « Trouver ma boutique »
2. confirmation « Autoriser et trouver » (explication confidentialité)

## Méthode de distance

**Formule de Haversine** (rayon terrestre 6371 km) entre la position client (mémoire navigateur uniquement) et les coordonnées officielles de `lib/stores.ts` :

- Hautmont : 50.2508, 3.9217  
- Le Quesnoy : 50.2488, 3.6365  

Temps de trajet : estimation indicative `(distanceKm / 45) * 60` minutes (pas d’API trafic).

## Recherche manuelle

1. Table locale de codes postaux / villes du bassin (59330, 59530, Maubeuge, Valenciennes, etc.) → Haversine depuis le centre commune.  
2. Sinon fallback **Nominatim** (France) côté serveur via `POST /api/stores/nearest` — la lat/lng Nominatim n’est **pas** journalisée ni stockée.  
3. Rate-limit IP (20 req / min).

## Intégration A.V.A.

- `ChatWindow` lit `localStorage` (`allvaps_preferred_store`) et envoie `preferredStoreId` à `/api/ai-assistant`.  
- Si boutique connue : phrase du type « … celle de Hautmont … 03 27 49 61 00 » (téléphones issus de `lib/stores.ts`).  
- Sinon : demande ville / code postal ; si le message contient un CP / ville, résolution via `searchStoreByCityOrPostal`.  
- Aucune invention d’adresse / numéro / horaire : source unique `lib/stores.ts`.

## Confidentialité appliquée

| Règle | Application |
|-------|-------------|
| Pas de GPS en base | Oui |
| Pas de GPS dans les logs | Oui (calcul client ; API manuelle ne reçoit que ville/CP) |
| Pas d’envoi SumUp | Oui |
| Pas de lien compte | Oui |
| Mémorisation | Uniquement `hautmont` \| `le-quesnoy` en `localStorage` |
| Message privacy | Affiché dans l’encart |

## Téléphones / adresses

Source officielle projet (`lib/stores.ts`) :

- Hautmont : 17 Avenue Marcel Aimé, 59330 — **03 27 49 61 00** (`+33327496100`)  
- Le Quesnoy : 10 Rue Léon Gambetta, 59530 — **03 27 49 62 00** (`+33327496200`)  

Les numéros « 09 … » de la mission n’ont **pas** été utilisés (évite d’écraser la config validée du projet). Horaires : `store.hours` existants.

## Liens itinéraire

- Google Maps : `https://www.google.com/maps/dir/?api=1&destination=<adresse>`  
- Waze : `https://waze.com/ul?q=<adresse>&navigate=yes`  
- Aucune position client dans l’URL.

## Résultats des tests (`npx tsx scripts/test-nearest-store.ts`)

**14 OK / 0 FAIL**

- GPS près Hautmont → Hautmont  
- GPS près Le Quesnoy → Le Quesnoy  
- Distance inter-boutiques ~20,3 km  
- CP 59330 / 59530 / Maubeuge  
- Format téléphone  
- Requête trop courte refusée  

### Tests navigateur (à valider manuellement)

| Cas | Statut |
|-----|--------|
| Autorisation acceptée | Logique prête — à valider sur device réel |
| Refus / blocage | Messages soft + fallback manuel |
| Appel / Maps / Waze | Liens générés dynamiquement |
| Mobile / desktop | UI responsive (encart dark premium) |
| A.V.A. + preferredStore | Branché côté chat |

## Erreurs / limites restantes

1. Distinction refus vs blocage navigateur imparfaite (Permissions API selon navigateur).  
2. Temps de trajet = estimation, pas trafic réel.  
3. Nominatim dépend du réseau (fallback message clair si indisponible).  
4. Tests UI multi-navigateurs non exécutés ici (environnement agent).  
5. Miroir `ALLVAPS_PORTABLE/` non synchronisé (hors scope mission).

## Contraintes respectées

- Pas de demande de localisation au chargement  
- Pas de commit / push / déploiement  
- Design général non modifié (encart aligné HomeShowcase)  
- Site utilisable sans géolocalisation  
