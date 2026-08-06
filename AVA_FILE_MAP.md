# AVA_FILE_MAP — All Vap's

**Date :** 2026-08-06  
**Fichiers :** 41  
**Archive :** `AVA_ALLVAPS_EXPORT.zip`

## Liste des fichiers

| Fichier | Rôle |
|---|---|
| `app/admin/ai/page.tsx` | Admin configuration A.V.A. |
| `app/api/ai/route.ts` | API IA |
| `app/api/ai-assistant/route.ts` | API assistant |
| `app/ia/page.tsx` | Page immersive A.V.A. |
| `components/ai/AIAssistantChat.tsx` | UI A.V.A. (chat, voix, hologramme, FAB) |
| `components/ai/AssistantButton.tsx` | UI A.V.A. (chat, voix, hologramme, FAB) |
| `components/ai/AudioWaveform.tsx` | UI A.V.A. (chat, voix, hologramme, FAB) |
| `components/ai/ChatWindow.tsx` | UI A.V.A. (chat, voix, hologramme, FAB) |
| `components/ai/HolographicAssistant.tsx` | UI A.V.A. (chat, voix, hologramme, FAB) |
| `components/ai/HolographicAvatar.tsx` | UI A.V.A. (chat, voix, hologramme, FAB) |
| `components/ai/ImmersiveAvaScreen.tsx` | UI A.V.A. (chat, voix, hologramme, FAB) |
| `components/ai/MicPermissionPanel.tsx` | UI A.V.A. (chat, voix, hologramme, FAB) |
| `components/ai/Particles.tsx` | UI A.V.A. (chat, voix, hologramme, FAB) |
| `components/ai/ProductSuggestionCard.tsx` | UI A.V.A. (chat, voix, hologramme, FAB) |
| `components/ai/Voice.tsx` | UI A.V.A. (chat, voix, hologramme, FAB) |
| `components/ai/VoiceAssistant.tsx` | UI A.V.A. (chat, voix, hologramme, FAB) |
| `components/ai/ava3d/AvaCanvas.tsx` | Rendu 3D / portrait holographique / GLB prototype |
| `components/ai/ava3d/AvaGltfAvatar.tsx` | Rendu 3D / portrait holographique / GLB prototype |
| `components/ai/ava3d/AvaHologramScene.tsx` | Rendu 3D / portrait holographique / GLB prototype |
| `components/ai/ava3d/AvaPortraitHead.tsx` | Rendu 3D / portrait holographique / GLB prototype |
| `components/ai/ava3d/HoloParticles3D.tsx` | Rendu 3D / portrait holographique / GLB prototype |
| `components/ai/ava3d/HoloProjectionBase.tsx` | Rendu 3D / portrait holographique / GLB prototype |
| `components/ai/ava3d/holographicShader.ts` | Rendu 3D / portrait holographique / GLB prototype |
| `components/home/AvaSidePanel.tsx` | Panneau A.V.A. accueil/boutique |
| `hooks/useAvaLipSync.ts` | Hook lip-sync avatar |
| `lib/ai/ava-advisor.ts` | Logique conseiller, recherche catalogue, constantes, providers |
| `lib/ai/ava-constants.ts` | Logique conseiller, recherche catalogue, constantes, providers |
| `lib/ai/ava-speech-utils.ts` | Logique conseiller, recherche catalogue, constantes, providers |
| `lib/ai/catalog-search.ts` | Logique conseiller, recherche catalogue, constantes, providers |
| `lib/ai/holographic-advisor.ts` | Logique conseiller, recherche catalogue, constantes, providers |
| `lib/ai/index.ts` | Logique conseiller, recherche catalogue, constantes, providers |
| `lib/ai/local-advisor-provider.ts` | Logique conseiller, recherche catalogue, constantes, providers |
| `lib/ai/local-advisor.ts` | Logique conseiller, recherche catalogue, constantes, providers |
| `lib/ai/mic-permission.ts` | Logique conseiller, recherche catalogue, constantes, providers |
| `lib/ai/openai-voice.ts` | Logique conseiller, recherche catalogue, constantes, providers |
| `lib/ai/sales-script.ts` | Logique conseiller, recherche catalogue, constantes, providers |
| `public/ava/ava-face-base.svg` | Assets portrait / textures A.V.A. |
| `public/ava/ava-face-texture.png` | Assets portrait / textures A.V.A. |
| `public/ava/ava-hologram-portrait.png` | Assets portrait / textures A.V.A. |
| `public/ava/ava-portrait.png` | Assets portrait / textures A.V.A. |
| `scripts/ava-behavior-smoke.ts` | Smoke tests comportement A.V.A. |

## Dépendances npm directes

- `three`, `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`
- `framer-motion`, `lucide-react`
- OpenAI optionnel : `OPENAI_API_KEY`, `OPENAI_MODEL` (texte) ; voix navigateur `speechSynthesis`

## Routes

| Route | Rôle |
|---|---|
| `/ia` | Écran immersif A.V.A. |
| `/api/ai` | Endpoint IA |
| `/api/ai-assistant` | Assistant |
| `/admin/ai` | Admin IA |

## Variables d’environnement (noms seulement)

- `AI_PROVIDER`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_VISION_MODEL` (OCR inventaire, adjacent)

## Réintégration

1. Extraire en conservant l’arborescence à la racine Next.js All Vap’s.
2. Vérifier dépendances 3D/motion dans `package.json`.
3. Ne pas écraser inventaire / Prisma / paiements.
4. `npm install` → `npm run lint` → `npm run build`.
5. Smoke `/`, `/ia`, FAB A.V.A.

## Tests

- `npx tsx scripts/ava-behavior-smoke.ts`
- Parcours : débutant, nicotine, fruits, matériel, Check Atomizer / non atomiseur
- Exclusions puff/jetables (`lib/ai/ava-advisor.ts`)
- Fallback portrait holographique si GLB indisponible

Extraction sans modification du module.
