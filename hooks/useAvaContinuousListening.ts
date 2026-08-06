"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createInitialInputModeState,
  recordEmptyRecognition,
  recordUserSpoke,
  recordUserTyped,
  resolveInputMode,
  shouldAutoOpenText,
  type AvaInputMode,
  type InputModeState,
} from "@/lib/ava/input-mode-manager";
import { detectMicrophoneState } from "@/lib/ava/microphone-state";
import {
  pickSilenceHint,
  shouldOpenTextAfterSilence,
  shouldShowSilenceHint,
  SILENCE_AUTO_TEXT_MS,
  SILENCE_FIRST_HINT_MS,
} from "@/lib/ava/silence-detector";
import {
  loadAccessibilityPrefs,
  saveAccessibilityPrefs,
  type AvaAccessibilityPrefs,
} from "@/lib/ava/accessibility-mode";

type Phase = "listening" | "thinking" | "speaking" | "idle";

type Options = {
  canListen: boolean;
  micPermission: string;
  isListening: boolean;
  voicePhase: Phase;
  /** Appelé pour démarrer l'écoute (après consentement) */
  startListening: () => Promise<boolean>;
  stopListening: () => void;
  /** Soft speak hint (pas de culpabilisation) */
  onSilenceHint?: (message: string) => void;
};

/**
 * Orchestration écoute permanente + bascule texte.
 * Ne démarre jamais le micro sans que startListening (qui demande le consentement) soit appelé.
 */
export function useAvaContinuousListening(options: Options) {
  const [inputState, setInputState] = useState<InputModeState>(() =>
    createInitialInputModeState()
  );
  const [a11y, setA11y] = useState<AvaAccessibilityPrefs>(() =>
    loadAccessibilityPrefs()
  );
  const [textPanelForced, setTextPanelForced] = useState(false);
  const listenStartedAt = useRef<number | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optsRef = useRef(options);
  optsRef.current = options;

  const mode: AvaInputMode = resolveInputMode({
    canListen: options.canListen,
    micPermission: options.micPermission,
    listeningPausedByUser: a11y.pauseListening || inputState.listeningPausedByUser,
    forceText: textPanelForced && !options.isListening,
  });

  // Détection initiale micro
  useEffect(() => {
    void detectMicrophoneState().then((d) => {
      setInputState((s) => ({
        ...s,
        mode: resolveInputMode({
          canListen: d.recognitionSupported,
          micPermission: d.permission,
          listeningPausedByUser: s.listeningPausedByUser,
        }),
      }));
    });
  }, []);

  // Chrono silence pendant LISTENING
  useEffect(() => {
    if (options.voicePhase === "listening" && options.isListening) {
      if (!listenStartedAt.current) listenStartedAt.current = Date.now();

      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => {
        setInputState((s) => {
          if (s.silencePrompts >= 2) return s;
          const msg = pickSilenceHint(s.silencePrompts);
          optsRef.current.onSilenceHint?.(msg);
          return { ...s, silencePrompts: s.silencePrompts + 1 };
        });
      }, SILENCE_FIRST_HINT_MS);

      if (autoTextTimer.current) clearTimeout(autoTextTimer.current);
      autoTextTimer.current = setTimeout(() => {
        setTextPanelForced(true);
      }, SILENCE_AUTO_TEXT_MS);

      return () => {
        if (hintTimer.current) clearTimeout(hintTimer.current);
        if (autoTextTimer.current) clearTimeout(autoTextTimer.current);
      };
    }

    listenStartedAt.current = null;
    return undefined;
  }, [options.voicePhase, options.isListening]);

  // Auto-ouvrir texte si trop de silences
  useEffect(() => {
    const listeningMs = listenStartedAt.current
      ? Date.now() - listenStartedAt.current
      : 0;
    if (
      shouldOpenTextAfterSilence({
        listeningMs,
        promptCount: inputState.silencePrompts,
        emptyResults: inputState.emptyRecognitionCount,
      }) ||
      shouldAutoOpenText(inputState)
    ) {
      setTextPanelForced(true);
    }
  }, [inputState]);

  const updateA11y = useCallback((patch: Partial<AvaAccessibilityPrefs>) => {
    setA11y((prev) => {
      const next = { ...prev, ...patch };
      saveAccessibilityPrefs(next);
      if (next.pauseListening) {
        optsRef.current.stopListening();
        setInputState((s) => ({ ...s, listeningPausedByUser: true }));
        setTextPanelForced(true);
      } else if (prev.pauseListening && !next.pauseListening) {
        setInputState((s) => ({ ...s, listeningPausedByUser: false }));
        void optsRef.current.startListening();
      }
      return next;
    });
  }, []);

  const onUserSpoke = useCallback(() => {
    setInputState((s) => recordUserSpoke(s));
    listenStartedAt.current = Date.now();
  }, []);

  const onUserTyped = useCallback(() => {
    setInputState((s) => recordUserTyped(s));
    setTextPanelForced(true);
  }, []);

  const onEmptyRecognition = useCallback(() => {
    setInputState((s) => recordEmptyRecognition(s));
  }, []);

  const ensureListening = useCallback(async () => {
    if (a11y.pauseListening || inputState.listeningPausedByUser) return false;
    if (!options.canListen) {
      setTextPanelForced(true);
      return false;
    }
    if (options.micPermission === "denied") {
      setTextPanelForced(true);
      return false;
    }
    return options.startListening();
  }, [
    a11y.pauseListening,
    inputState.listeningPausedByUser,
    options,
  ]);

  return {
    mode,
    inputState,
    a11y,
    updateA11y,
    textPanelForced,
    setTextPanelForced,
    onUserSpoke,
    onUserTyped,
    onEmptyRecognition,
    ensureListening,
    shouldShowHint: shouldShowSilenceHint({
      listeningMs: listenStartedAt.current
        ? Date.now() - listenStartedAt.current
        : 0,
      promptCount: inputState.silencePrompts,
    }),
  };
}
