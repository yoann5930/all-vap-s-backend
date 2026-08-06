# Rapport — A.V.A. catalogue réel + conversation vocale continue

Date : 2026-07-30  
Statut : implémenté (pas de commit / push / déploiement)

## Architecture détectée

```
SiteShell → HolographicAssistant → ImmersiveAvaScreen
  → useVoiceConversation
    → useSpeechRecognition (Web Speech API)
    → useSpeechSynthesis (speechSynthesis navigateur)
    → POST /api/ai-assistant
      → chatAva / chatAvaWithVoice
        → lib/ai/ava/* (recherche catalogue)
        → Prisma Product + ProductFlavor + ProductVariant + StockLevel
```

`ChatWindow` = chemin texte secondaire (même API).

## Causes exactes des symptômes

### Réponses répétitives / génériques
1. `isAvailableForOffer` excluait **tous** les produits sans ligne `StockLevel` (`stockKnown === false` → false).
2. `loadCatalog()` ne chargeait ni saveurs (`ProductFlavor`) ni meta A.V.A. ni variantes nicotine.
3. Intros figées (« Voici les e-liquides… ») + reformulation OpenAI en 1 phrase générique.
4. **Aucune mémoire multi-tours** (chaque POST = message isolé).

### Obligation de rappuyer sur le micro
1. `rec.continuous = false` (one-shot).
2. Après TTS : retour à `idle` **sans** `startListening()`.
3. Mic désactivé pendant `speaking` / `thinking` sans reprise auto.

## Fichiers créés

| Fichier | Rôle |
|---------|------|
| `lib/ai/ava/config.ts` | Constantes voix + recherche |
| `lib/ai/ava/types.ts` | Types catalogue / contexte / critères |
| `lib/ai/ava/load-catalog.ts` | Chargement catalogue réel (flavors, variants, stock) |
| `lib/ai/ava/conversation-context.ts` | Parse + fusion mémoire de session |
| `lib/ai/ava/product-search.ts` | Recherche / ranking / stock |
| `lib/ai/ava/response-builder.ts` | Réponses naturelles 1–3 produits |
| `lib/ai/ava/index.ts` | Façade |
| `scripts/test-ava-catalog-search.ts` | Tests unitaires |
| `data/rebuild/RAPPORT_AVA_CATALOG_VOICE.md` | Ce rapport |

## Fichiers modifiés

| Fichier | Modification |
|---------|--------------|
| `lib/ai/ava-advisor.ts` | Branche sur moteur `lib/ai/ava` + contexte |
| `lib/ai/catalog-search.ts` | Fallback stock legacy si SumUp absent |
| `lib/ai/openai-voice.ts` | Ne pas écraser réponses produits / questions |
| `lib/ai/mic-permission.ts` | Constraints echoCancellation etc. |
| `app/api/ai-assistant/route.ts` | `conversationContext` |
| `hooks/useSpeechRecognition.ts` | Continu + silence + auto-restart |
| `hooks/useSpeechSynthesis.ts` | `speak` async (fin réelle) |
| `hooks/useVoiceConversation.ts` | Machine à états + reprise post-TTS |
| `components/ai/VoiceAssistant.tsx` | Labels pause/reprise (apparence inchangée) |
| `components/ai/ImmersiveAvaScreen.tsx` | Statuts vocaux |
| `components/ai/ChatWindow.tsx` | Même contexte conversation |
| `.env.example` | Variables A.V.A. documentées |

## Service de recherche

Point d’entrée unique : `lib/ai/ava/`  
Fonctions : `searchProductsForAva`, `searchNearbyAlternatives`, `loadCatalogForAva`, `mergeContextFromMessage`, `buildAvaProductAnswer`, etc.

## Champs catalogue accessibles à A.V.A.

id, name, slug, description, brand/manufacturer, range, category, volumeMl, flavors (primary/secondary/family/keywords + flags frais/fruité/gourmand…), avaMeta (keywords/saveurs), variants (nicotine, stock, prix), stock SumUp (`StockLevel.availableQuantity`), prix affichés, image, catalogStatus, liens fiche via slug.

**Exclus :** secrets, coûts, marges, admin, paiement.

## Classement

Score multicritère : famille aromatique / synonymes, fraîcheur (sans confondre « fraise » / « frais »), nicotine variante, volume, fabricant, termes libres, boost données validées. Top **3** max. Rupture → exclus de l’offre (message alternatif possible).

## Filtrage stock

- Somme des `StockLevel` par produit + stock variante.
- Fallback `Product.stock` / `ProductVariant.stock` si pas de niveau SumUp.
- Variante nicotine demandée : stock variante > 0 obligatoire.
- `Ajouter au panier` reste sur `ProductSuggestionCard` + garde-fous stock existants.

## Mémoire conversation

- `sessionStorage` clé `allvaps_ava_conversation_ctx` (client).
- Renvoyée / mise à jour à chaque tour via API.
- Conserve : catégorie, saveurs, fraîcheur, nicotine, format, produits proposés, boutique préférée, dernière question.
- Effacée à la fermeture A.V.A. (`stopAll`).

## Machine à états vocale

`IDLE → REQUESTING_PERMISSION → LISTENING → USER_SPEAKING → WAITING_FOR_END_OF_SPEECH → PROCESSING → AVA_SPEAKING → RESUMING_LISTENING → LISTENING`  
(+ `PAUSED`, `ERROR`)

UI legacy mappée : `idle | listening | thinking | speaking` (apparence hologramme inchangée).

## Délais retenus

| Paramètre | Valeur |
|-----------|--------|
| Fin de parole (silence) | **2000 ms** |
| Pause max utilisateur | **10000 ms** |
| Anti-écho post-TTS | **500 ms** |
| Barge-in | **false** (préparé, non activé) |

## Reprise automatique

Fin réelle TTS (`utterance.onend` / promesse `speak`) → délai echo → `startListening()` si conversation active.

## Protections

- **Auto-écoute** : `ignoreResultsRef` pendant TTS + stop recognition.
- **Doubles traitements** : `turnLockRef` + `AbortController` + verrou flush.
- **Une instance** recognition ; restart borné (`maxRecognitionRestarts`).
- Micro : première activation volontaire uniquement.

## Tests produits

`npx tsx scripts/test-ava-catalog-search.ts` → **17/17 OK**  
(parsers, multicritère fruits rouges sans frais 6 mg, rupture exclue, clarification, résistance sans modèle)

## Tests vocaux

Logique branchée ; validation manuelle requise sur Chrome / Safari / Edge / Android / iPhone (Web Speech variable selon navigateur).

## Limites navigateurs

| Navigateur | Notes |
|------------|-------|
| Chrome / Edge | Meilleur support continuous + fr-FR |
| Safari iOS | Reconnaissance parfois one-shot ; restart géré |
| Firefox | SpeechRecognition souvent absent → fallback texte |

## Erreurs restantes / limites

1. Barge-in désactivé (faux positifs HP).
2. Qualité STT dépend du navigateur / bruit.
3. Saveurs uniquement si données `ProductFlavor` / mots confirmés — pas d’invention depuis le seul nom ambigu.
4. Tests devices réels non exécutés dans l’environnement agent.
5. `ALLVAPS_PORTABLE` non synchronisé.

## Contraintes respectées

- Pas de modification design / apparence A.V.A. (labels aria uniquement)
- Pas de faux produits / stock contourné
- Pas d’enregistrement audio brut
- Pas de commit / push / déploiement
