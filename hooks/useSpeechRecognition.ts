"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isSpeechRecognitionSupported,
  MIC_MESSAGES,
  queryMicPermission,
  requestMicPermission,
  type MicPermissionStatus,
} from "@/lib/ai/mic-permission";
import { AVA_VOICE_CONFIG } from "@/lib/ai/ava/config";

export interface SpeechRecognitionState {
  isListening: boolean;
  canListen: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  micPermission: MicPermissionStatus;
  isPrompting: boolean;
  /** Parole utilisateur détectée dans le tour en cours */
  userSpeaking: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RecognitionInstance = any;

function getRecognitionCtor(): (new () => RecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export type SpeechRecognitionOptions = {
  continuous?: boolean;
  speechEndSilenceMs?: number;
  maxUserPauseMs?: number;
  /** true = ignorer les résultats (ex. pendant TTS) */
  shouldIgnoreResults?: () => boolean;
  /** true = redémarrer après onend si conversation active */
  shouldAutoRestart?: () => boolean;
};

/**
 * Reconnaissance vocale avec fin de parole par silence (pas de réponse trop tôt).
 * Une seule instance ; redémarrage contrôlé.
 */
export function useSpeechRecognition(
  onFinal?: (text: string) => void,
  options: SpeechRecognitionOptions = {}
) {
  const callbackRef = useRef(onFinal);
  callbackRef.current = onFinal;

  const optsRef = useRef(options);
  optsRef.current = options;

  const continuous = options.continuous ?? AVA_VOICE_CONFIG.continuousMode;
  const silenceMs = options.speechEndSilenceMs ?? AVA_VOICE_CONFIG.speechEndSilenceMs;
  const maxPauseMs = options.maxUserPauseMs ?? AVA_VOICE_CONFIG.maxUserPauseMs;

  const [state, setState] = useState<SpeechRecognitionState>({
    isListening: false,
    canListen: false,
    transcript: "",
    interimTranscript: "",
    error: null,
    micPermission: "unknown",
    isPrompting: false,
    userSpeaking: false,
  });

  const recognitionRef = useRef<RecognitionInstance>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const bufferRef = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingLockRef = useRef(false);
  const wantListeningRef = useRef(false);
  const restartCountRef = useRef(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnIdRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (maxPauseTimerRef.current) clearTimeout(maxPauseTimerRef.current);
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    silenceTimerRef.current = null;
    maxPauseTimerRef.current = null;
    restartTimerRef.current = null;
  }, []);

  const flushUtterance = useCallback((reason: string) => {
    if (processingLockRef.current) return;
    const text = bufferRef.current.trim();
    bufferRef.current = "";
    clearTimers();
    setState((s) => ({
      ...s,
      transcript: text,
      interimTranscript: "",
      userSpeaking: false,
    }));
    if (!text) return;
    if (optsRef.current.shouldIgnoreResults?.()) return;
    processingLockRef.current = true;
    turnIdRef.current += 1;
    try {
      // Journal technique minimal (pas d'audio, pas de PII longue)
      if (process.env.NODE_ENV === "development") {
        console.info("[ava-voice]", reason, "chars=", text.length);
      }
      callbackRef.current?.(text);
    } finally {
      // Le verrou est libéré par le caller via releaseProcessingLock
      // après envoi — sinon timeout de sécurité
      window.setTimeout(() => {
        processingLockRef.current = false;
      }, 50);
    }
  }, [clearTimers]);

  const scheduleSilenceFlush = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      flushUtterance("silence-end");
    }, silenceMs);
  }, [flushUtterance, silenceMs]);

  const ensureMaxPause = useCallback(() => {
    if (maxPauseTimerRef.current) return;
    maxPauseTimerRef.current = setTimeout(() => {
      if (bufferRef.current.trim()) {
        flushUtterance("max-pause");
      } else {
        setState((s) => ({
          ...s,
          userSpeaking: false,
          error:
            s.error ||
            "Vous pouvez aussi m'écrire — le clavier est disponible juste en dessous.",
        }));
      }
    }, maxPauseMs);
  }, [flushUtterance, maxPauseMs]);

  useEffect(() => {
    const supported = isSpeechRecognitionSupported();
    setState((s) => ({
      ...s,
      canListen: supported,
      micPermission: supported ? s.micPermission : "unsupported",
    }));

    if (!supported) return;

    void queryMicPermission().then((status) => {
      if (status !== "unknown") {
        setState((s) => ({ ...s, micPermission: status }));
      }
    });

    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = "fr-FR";
    rec.interimResults = true;
    rec.continuous = continuous;
    rec.maxAlternatives = 1;

    rec.onresult = (event: {
      resultIndex: number;
      results: ArrayLike<{ [j: number]: { transcript: string }; isFinal: boolean }>;
    }) => {
      if (optsRef.current.shouldIgnoreResults?.()) return;
      if (processingLockRef.current) return;

      let interim = "";
      let finalChunk = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) finalChunk += chunk;
        else interim += chunk;
      }

      if (finalChunk.trim()) {
        bufferRef.current = `${bufferRef.current} ${finalChunk}`.replace(/\s+/g, " ").trim();
      }

      const hasSpeech = Boolean(finalChunk.trim() || interim.trim() || bufferRef.current);
      if (hasSpeech) {
        setState((s) => ({
          ...s,
          interimTranscript: interim.trim(),
          userSpeaking: true,
          error: null,
        }));
        scheduleSilenceFlush();
        ensureMaxPause();
      }
    };

    rec.onerror = (event: { error?: string }) => {
      const code = event.error ?? "";
      if (code === "aborted") return;
      if (code === "no-speech") {
        // En mode continu : ne pas tuer la session pour un silence
        if (continuous && wantListeningRef.current) return;
        setState((s) => ({
          ...s,
          error:
            "Vous pouvez me répondre à l'oral ou par écrit, comme vous préférez.",
        }));
        return;
      }
      if (code === "not-allowed") {
        wantListeningRef.current = false;
        setState((s) => ({
          ...s,
          isListening: false,
          micPermission: "denied",
          error: MIC_MESSAGES.denied,
        }));
        return;
      }
      if (code === "network") {
        setState((s) => ({
          ...s,
          error: "Connexion requise pour la reconnaissance vocale.",
        }));
      }
    };

    rec.onend = () => {
      setState((s) => ({
        ...s,
        isListening: false,
        interimTranscript: "",
        isPrompting: false,
        userSpeaking: false,
      }));

      // Flush buffer restant si on arrête volontairement
      if (!wantListeningRef.current && bufferRef.current.trim()) {
        flushUtterance("session-end");
        return;
      }

      const auto =
        wantListeningRef.current &&
        (optsRef.current.shouldAutoRestart?.() ?? true) &&
        !optsRef.current.shouldIgnoreResults?.();

      if (!auto) return;

      if (restartCountRef.current >= AVA_VOICE_CONFIG.maxRecognitionRestarts) {
        setState((s) => ({
          ...s,
          error:
            "L'écoute s'est interrompue. Vous pouvez m'écrire, ou AVA reprendra si le micro est autorisé.",
        }));
        wantListeningRef.current = false;
        return;
      }

      const delay =
        AVA_VOICE_CONFIG.recognitionRestartBaseMs *
        Math.min(4, 1 + restartCountRef.current);
      restartCountRef.current += 1;
      restartTimerRef.current = setTimeout(() => {
        if (!wantListeningRef.current || !recognitionRef.current) return;
        try {
          recognitionRef.current.start();
          setState((s) => ({ ...s, isListening: true, error: null }));
        } catch {
          /* déjà démarré */
        }
      }, delay);
    };

    recognitionRef.current = rec;

    return () => {
      wantListeningRef.current = false;
      clearTimers();
      try {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.abort?.();
      } catch {
        /* ignore */
      }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    };
  }, [continuous, clearTimers, ensureMaxPause, flushUtterance, scheduleSilenceFlush]);

  const releaseMedia = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
  }, []);

  const startListening = useCallback(async () => {
    if (!isSpeechRecognitionSupported()) {
      setState((s) => ({
        ...s,
        micPermission: "unsupported",
        error: MIC_MESSAGES.unsupported,
      }));
      return false;
    }

    if (!recognitionRef.current) return false;

    setState((s) => ({
      ...s,
      isPrompting: true,
      error: null,
      micPermission: "prompting",
    }));

    const perm = await requestMicPermission({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    if (!perm.granted) {
      setState((s) => ({
        ...s,
        isPrompting: false,
        isListening: false,
        micPermission: perm.status,
        error: perm.message ?? MIC_MESSAGES.denied,
      }));
      return false;
    }

    // Conserver le stream pour libération propre (si exposé)
    if (perm.stream) {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = perm.stream;
    }

    wantListeningRef.current = true;
    restartCountRef.current = 0;
    bufferRef.current = "";
    processingLockRef.current = false;
    clearTimers();

    setState((s) => ({
      ...s,
      error: null,
      transcript: "",
      interimTranscript: "",
      isListening: true,
      isPrompting: false,
      micPermission: "granted",
      userSpeaking: false,
    }));

    try {
      recognitionRef.current.start();
      return true;
    } catch {
      // Souvent "already started"
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      try {
        recognitionRef.current.start();
        return true;
      } catch {
        wantListeningRef.current = false;
        setState((s) => ({
          ...s,
          isListening: false,
          isPrompting: false,
          error: "Micro occupé — patientez un instant.",
        }));
        return false;
      }
    }
  }, [clearTimers]);

  const stopListening = useCallback(() => {
    wantListeningRef.current = false;
    clearTimers();
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    setState((s) => ({
      ...s,
      isListening: false,
      interimTranscript: "",
      isPrompting: false,
      userSpeaking: false,
    }));
  }, [clearTimers]);

  /** Arrêt complet + libération pistes */
  const abortListening = useCallback(() => {
    wantListeningRef.current = false;
    clearTimers();
    bufferRef.current = "";
    try {
      recognitionRef.current?.abort?.();
    } catch {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
    }
    releaseMedia();
    setState((s) => ({
      ...s,
      isListening: false,
      interimTranscript: "",
      isPrompting: false,
      userSpeaking: false,
    }));
  }, [clearTimers, releaseMedia]);

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  const releaseProcessingLock = useCallback(() => {
    processingLockRef.current = false;
  }, []);

  return {
    ...state,
    startListening,
    stopListening,
    abortListening,
    clearError,
    releaseProcessingLock,
    wantListening: wantListeningRef,
  };
}

export { requestMicPermission } from "@/lib/ai/mic-permission";
