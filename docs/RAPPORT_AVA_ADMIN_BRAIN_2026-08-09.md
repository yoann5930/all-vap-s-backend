# Rapport — Cerveau conversationnel A.V.A. Admin (09/08/2026)

Branche : `fix/admin-data-consistency-ava-admin`  
Mode client / vendeuse : **non touché**.

## CAUSES TROUVÉES

1. **Réponses répétitives « Je te suis… »**  
   Les messages courts / smalltalk forçaient `preferLocalCompose: true` → templates locaux en boucle (`compose.ts`), sans passer par OpenAI ni l’historique.

2. **Contexte perdu**  
   Mémoire chargée mais **peu utilisée** en compose local ; historique LLM limité ; fil `activeThread` pollué par les salutations ; sujet différé gardé au détriment d’un nouveau sujet métier.

3. **Anti-répétition trop faible / parfois trop agressive**  
   Seuil élevé + reformulation inefficace ; puis `forceGroundedReply` cassait aussi les salutations.

4. **Réflexions « Analyse impossible »**  
   - UI masquait l’erreur réelle (`throw new Error("Analyse impossible")`).  
   - `fetch` sans Bearer (`authFetch`) → 401 possible.  
   - Pipeline BI pouvait planter sur `observeSales` / `observeStock` (ex. Prisma `isAudit`) sans isolation.  
   - Cartes réflexions filtrées trop strictement (`!hyp && !idea` → liste vide).

## CORRECTIONS

| Zone | Changement |
| --- | --- |
| `detect.ts` | Smalltalk / messages courts → LLM ; follow-ups `pourquoi ?` ; désaccord ; sujet métier depuis le message |
| `compose.ts` | Suppression des templates « Je te suis » ; usage mémoire/fil ; ne plus écraser le résumé sur salut |
| `anti-repeat.ts` | Ban phrases génériques ; seuil plus strict ; `forceGroundedReply` |
| `admin-conversation.ts` | `shouldPreferLocalCompose` ; OpenAI + anti-repeat ; fallback contextualisé |
| `retrieve.ts` / `extract.ts` | Préférences / décisions toujours injectées ; extraction décisions |
| Chat history | 24 tours côté API ; 12–20 pour LLM |
| `AdminAvaChatPanel` + réflexions | `authFetch` |
| Réflexions API / observe / pipeline | Erreurs détaillées ; try/catch ventes/stocks ; cartes même sans hyp/idée |

## MÉMOIRE

- Persistante structurée (`confirmed_fact`, `pending_decision`, `user_preference`, …)  
- Session : `activeThread`, fingerprints, résumé  
- Réinjection sélective + faits high-importance toujours présents  
- Ne prétend pas se souvenir hors CONTEXTE (consigne system)

## RÉFLEXIONS

- Distinctes de la mémoire (synthèses OBSERVATION / HYPOTHÈSE / IDÉE)  
- Erreur réelle affichée (HTTP + detail)  
- Analyse partielle possible avec `missingData` / warning

## TEST CONVERSATION 20 MESSAGES

`npx tsx scripts/smoke-ava-admin-brain.ts` → **49/49 PASS**  
`npx tsx scripts/smoke-ava-admin-social-router.ts` → **36/36 PASS**  
Aucun « Je te suis » / « Dis-moi ce qui te préoccupe » sur 20 tours.

## TEST APRÈS RECONNEXION

Même `conversationId` + mémoire persistée → « on reprend » retrouve **bannière Twenty**.

## PROBLÈMES RESTANTS

1. Sans `OPENAI_API_KEY`, le smalltalk reste en fallback local (meilleur qu’avant, moins riche qu’avec LLM).  
2. Certains dumps outils encore un peu « rapport » (humanisation à peaufiner).  
3. Test manuel navigateur `/admin/ava` + bouton Réflexions à valider en preview (auth cookie/Bearer).  
4. Production **non modifiée** (pas de push).

## PROCHAINE ACTION

Déployer cette branche en **preview** et valider manuellement 10 messages sur `/admin/ava` + « Relancer l'analyse » sur `/admin/ava/reflections`.
