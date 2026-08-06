# Inventaire App — Mode hors ligne

## Ce qui existe

- Service worker `public/sw.js` (shell `/inventaire`, pas d’API en cache)
- File `localStorage` : `lib/inventory/offline-queue.ts`
- Employé : enqueue si `navigator.onLine === false`
- Flush à l’événement `online` + anti-doublon `clientLineId`

## Limites

- Démarrage de session / lookup catalogue nécessite le réseau
- Photos hors ligne : non prioritaires (v1)
- Pas de base catalogue embarquée complète
- Conflits distants : lignes en échec restent en file (retry)

## Interdit

Stocker JWT secrets / clés SumUp / mots de passe hors cookies httpOnly existants.
