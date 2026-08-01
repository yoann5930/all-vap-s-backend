# RAPPORT AVA — Tests réels

**Date :** 2026-08-01  
**Mission :** 6/7  
**Règle :** un appareil inaccessible = `NON TESTÉ SUR APPAREIL RÉEL` — jamais remplacé par PASS.

## Environnements

| Environnement | Statut |
|---------------|--------|
| Chrome / Chromium embarqué Cursor (Windows) | ✅ smoke UI + texte |
| Chrome Windows natif (utilisateur) | `NON TESTÉ SUR APPAREIL RÉEL` |
| Edge Windows | `NON TESTÉ SUR APPAREIL RÉEL` |
| Chromium SumUp | `NON TESTÉ SUR APPAREIL RÉEL` |
| Android Chrome | `NON TESTÉ SUR APPAREIL RÉEL` |
| iPhone Safari | `NON TESTÉ SUR APPAREIL RÉEL` |
| Tablette Android | `NON TESTÉ SUR APPAREIL RÉEL` |
| PC micro réel (permission accordée) | `NON TESTÉ SUR APPAREIL RÉEL` |
| Appareil sans micro | `NON TESTÉ SUR APPAREIL RÉEL` (UI texte OK en auto) |
| Permission micro refusée | `NON TESTÉ SUR APPAREIL RÉEL` (panneau consentement vu) |

## Scénarios — voix

| Scénario | Appareil | Navigateur | Résultat | Preuve | Défaut | Correction | Statut final |
|----------|----------|------------|----------|--------|--------|------------|--------------|
| Ouverture AVA | Cursor Chromium | localhost:3000/ia | Overlay immersif + message d’accueil | snapshot UI | — | — | ✅ PARTIEL (auto) |
| Demande autorisation micro | idem | idem | Panneau « Autoriser le micro » / « Continuer par écrit » affiché à l’ouverture | snapshot | — | — | ✅ PARTIEL |
| Écoute automatique | — | — | — | — | pas de micro réel | — | `NON TESTÉ SUR APPAREIL RÉEL` |
| Reprise après réponse | — | — | — | — | — | — | `NON TESTÉ SUR APPAREIL RÉEL` |
| Fermeture micro | Cursor | idem | Bouton « Fermer AVA et couper le microphone » présent | snapshot | fermeture non rejouée | — | ✅ UI OK · audio `NON TESTÉ` |
| Écho / silence pendant TTS | — | — | — | — | — | — | `NON TESTÉ SUR APPAREIL RÉEL` |
| Prononciation « i tésti » | — | — | — | — | TTS oral | — | `NON TESTÉ SUR APPAREIL RÉEL` (couvert en unitaires) |
| Prix / stock / fiches oraux | — | — | — | — | TTS | — | `NON TESTÉ SUR APPAREIL RÉEL` |

## Scénarios — accessibilité

| Scénario | Résultat | Statut |
|----------|----------|--------|
| Clavier permanent | Champ « Écrivez votre message… » disponible | ✅ PARTIEL |
| Continuer par écrit | Champ activé sans micro | ✅ PARTIEL |
| Sous-titres | Option « Sous-titres toujours visibles » + bandeau texte réponse | ✅ PARTIEL |
| Panneau a11y | Pause écoute / texte grand / contraste | ✅ PARTIEL |
| Navigation clavier complète | — | `NON TESTÉ SUR APPAREIL RÉEL` |
| VoiceOver / TalkBack | — | `NON TESTÉ SUR APPAREIL RÉEL` |
| Zoom / rotation mobile | — | `NON TESTÉ SUR APPAREIL RÉEL` |

## Scénarios — matériel

| Scénario | Résultat | Statut |
|----------|----------|--------|
| Message danger batterie gonflée (texte) | Réponse : « N'utilisez plus l'appareil et ne le rechargez pas… » | ✅ PARTIEL (navigateur auto) |
| Activation mode assistance | Déclenché via intent danger | ✅ PARTIEL |
| Envoi photo / vidéo | — | `NON TESTÉ SUR APPAREIL RÉEL` |
| Consentement média / suppression | — | `NON TESTÉ SUR APPAREIL RÉEL` |
| Confirmation visuelle modèle | — | `NON TESTÉ SUR APPAREIL RÉEL` |
| Coils sans confirmation | — | unitaires OK · `NON TESTÉ` UI réelle |

## Grille ton humain (manuelle — session auto limitée)

| Critère | Note session | Commentaire |
|---------|--------------|-------------|
| Naturel | ⚠️ | Accueil OK ; TTS non évalué |
| Chaleur | ⚠️ | « Prenez votre temps » présent |
| Clarté | ✅ | Consigne danger claire |
| Concision | ✅ | Message danger court |
| Variété | ⚠️ | Non mesuré en multi-tours |
| Anti-robot | ⚠️ | Pas de lecture fiche observée |
| Anti-catalogue | ⚠️ | Session courte |
| Une question à la fois | ⚠️ | Non mesuré après danger |

**Correction code :** aucune — aucun défaut fonctionnel bloquant observé sur le périmètre testable. Doublons possibles dans l’historique sous-titres (« Prenez votre temps » x2) à surveiller, non bloquant.

## Synthèse

- Automates : 95 OK (mission tests unitaires) — **ne prouvent pas** le réel.
- Réel auto (Cursor Chromium) : ouverture, clavier, a11y panel, danger batterie → OK partiel.
- Mobile / Edge / SumUp / micro TTS / lecteurs d’écran → **tous** `NON TESTÉ SUR APPAREIL RÉEL`.

> Ne pas écrire « Mission 6 terminée produit ».

Tableau de bord : [`RAPPORT_GLOBAL.md`](./RAPPORT_GLOBAL.md)
