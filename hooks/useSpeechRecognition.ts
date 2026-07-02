"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SpeechRecognitionState {
  isListening: boolean;
  canListen: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RecognitionInstance = any;

function getRecognitionCtor(): (new () => RecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export async function requestMicPermission(): Promise<{ granted: boolean; message?: string }> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { granted: true };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return { granted: true };
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return { granted: false, message: "Autorisez le micro pour parler à A.V.A." };
    }
    return { granted: false, message: "Micro indisponible." };
  }
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
  });

  const recognitionRef = useRef<RecognitionInstance>(null);

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    setState((s) => ({ ...s, canListen: Boolean(Ctor) }));
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
      let message = "";
      if (code === "not-allowed") message = "Micro refusé.";
      if (code === "no-speech") message = "Je n'ai rien entendu.";
      if (code === "network") message = "Connexion requise pour la reconnaissance vocale.";
      setState((s) => ({
        ...s,
        isListening: false,
        error: message || s.error,
      }));
    };

    rec.onend = () => {
      setState((s) => ({ ...s, isListening: false, interimTranscript: "" }));
    };

    recognitionRef.current = rec;
  }, []);

  const startListening = useCallback(async () => {
    if (!recognitionRef.current) {
      setState((s) => ({ ...s, error: "Reconnaissance vocale non supportée." }));
      return false;
    }

    const perm = await requestMicPermission();
    if (!perm.granted) {
      setState((s) => ({ ...s, error: perm.message ?? "Micro refusé." }));
      return false;
    }

    setState((s) => ({
      ...s,
      error: null,
      transcript: "",
      interimTranscript: "",
      isListening: true,
    }));

    try {
      recognitionRef.current.start();
      return true;
    } catch {
      setState((s) => ({
        ...s,
        isListening: false,
        error: "Micro occupé — réessayez.",
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
    setState((s) => ({ ...s, isListening: false, interimTranscript: "" }));
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
