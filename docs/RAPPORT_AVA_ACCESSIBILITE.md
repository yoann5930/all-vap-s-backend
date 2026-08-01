# RAPPORT AVA — Accessibilité

**Dernière mise à jour :** 2026-08-01  
**État :** ⚠️ Partiel — écoute permanente + bascule texte OK ; a11y réelle (VoiceOver/TalkBack) non validée

## Livré

- Indicateur d’état (plus de bouton micro central sur Immersive)
- Clavier toujours disponible (`TextFallback`)
- Sous-titres (`LiveSubtitles`) + historique
- Accessibilité et confidentialité (pause écoute, grand texte, contraste)
- Consentement micro + « Continuer par écrit »
- Modes `AvaInputMode` + silence → texte

## Fichiers

- `lib/ava/input-mode-manager.ts`, `silence-detector.ts`, `accessibility-mode.ts`, `microphone-state.ts`
- `hooks/useAvaContinuousListening.ts`
- `components/ava/ConversationStatus.tsx`, `AccessibilitySettings.tsx`, `TextFallback.tsx`, `LiveSubtitles.tsx`

## Tests

- `npm run ava:continuous:test` → **34 OK**
- `npm run ava:a11y:test` → **15 OK**
- `npm run ava:listening:report`

## Restant

- Audit VoiceOver / TalkBack → **`NON TESTÉ SUR APPAREIL RÉEL`**
- Navigation clavier complète immersive + panneau matériel → partiel UI (panneau a11y vu en Cursor Chromium)
- Contraste WCAG mesuré → non mesuré
- Preuve réelle : [`RAPPORT_AVA_TESTS_REELS.md`](./RAPPORT_AVA_TESTS_REELS.md)
