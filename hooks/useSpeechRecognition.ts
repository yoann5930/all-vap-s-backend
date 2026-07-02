"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isSpeechRecognitionSupported,
  MIC_MESSAGES,
  queryMicPermission,
  requestMicPermission,
  type MicPermissionStatus,
} from "@/lib/ai/mic-permission";

export interface SpeechRecognitionState {
  isListening: boolean;
  canListen: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  micPermission: MicPermissionStatus;
  isPrompting: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RecognitionInstance = any;

function getRecognitionCtor(): (new () => RecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function useSpeechRecognition(onFinal?: (text: string) => void) {
  const callbackRef = useRef(onFinal);
  callbackRef.current = onFinal;

  const [state, setState] = useState<SpeechRecognitionState>({
    isListening: false,
    canListen: false,
    transcript: "",
    interimTranscript: "",
    error: null,
    micPermission: "unknown",
    isPrompting: false,
  });

  const recognitionRef = useRef<RecognitionInstance>(null);

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
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event: {
      resultIndex: number;
      results: ArrayLike<{ [j: number]: { transcript: string }; isFinal: boolean }>;
    }) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) final += chunk;
        else interim += chunk;
      }

      if (final.trim()) {
        setState((s) => ({
          ...s,
          transcript: final.trim(),
          interimTranscript: "",
          isListening: false,
        }));
        callbackRef.current?.(final.trim());
      } else {
        setState((s) => ({ ...s, interimTranscript: interim.trim() }));
      }
    };

    rec.onerror = (event: { error?: string }) => {
      const code = event.error ?? "";
      if (code === "not-allowed") {
        setState((s) => ({
          ...s,
          isListening: false,
          micPermission: "denied",
          error: MIC_MESSAGES.denied,
        }));
        return;
      }
      let message = "";
      if (code === "no-speech") message = "Je n'ai rien entendu. Réessayez.";
      if (code === "network") message = "Connexion requise pour la reconnaissance vocale.";
      setState((s) => ({
        ...s,
        isListening: false,
        error: message || s.error,
      }));
    };

    rec.onend = () => {
      setState((s) => ({ ...s, isListening: false, interimTranscript: "", isPrompting: false }));
    };

    recognitionRef.current = rec;
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

    const perm = await requestMicPermission();

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

    setState((s) => ({
      ...s,
      error: null,
      transcript: "",
      interimTranscript: "",
      isListening: true,
      isPrompting: false,
      micPermission: "granted",
    }));

    try {
      recognitionRef.current.start();
      return true;
    } catch {
      setState((s) => ({
        ...s,
        isListening: false,
        isPrompting: false,
        error: "Micro occupé — patientez un instant.",
      }));
      return false;
    }
  }, []);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    setState((s) => ({ ...s, isListening: false, interimTranscript: "", isPrompting: false }));
  }, []);

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  return {
    ...state,
    startListening,
    stopListening,
    clearError,
  };
}

export { requestMicPermission } from "@/lib/ai/mic-permission";
