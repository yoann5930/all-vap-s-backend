"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AvaVoiceState = "idle" | "listening" | "thinking" | "speaking";

export interface SpeechCapabilities {
  canListen: boolean;
  canSpeak: boolean;
}

export interface UseSpeechReturn {
  isListening: boolean;
  isSpeaking: boolean;
  isSupported: boolean;
  canListen: boolean;
  canSpeak: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  startListening: () => Promise<void>;
  stopListening: () => void;
  speak: (text: string) => void;
  stopSpeaking: () => void;
  clearError: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RecognitionInstance = any;

function getRecognitionCtor(): (new () => RecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

async function requestMicPermission(): Promise<{ granted: boolean; message?: string }> {
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
      return { granted: false, message: "Autorisez le micro dans votre navigateur pour parler à A.V.A." };
    }
    return { granted: false, message: "Micro indisponible sur cet appareil." };
  }
}

function pickFrenchVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined") return null;
  const voices = window.speechSynthesis.getVoices();
  const fr = voices.filter((v) => v.lang.toLowerCase().startsWith("fr"));
  return (
    fr.find((v) => /google|premium|natural|amelie|thomas|marie/i.test(v.name)) ??
    fr.find((v) => v.localService) ??
    fr[0] ??
    null
  );
}

export function useSpeech(onTranscript?: (text: string) => void): UseSpeechReturn {
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;

  const [state, setState] = useState({
    isListening: false,
    isSpeaking: false,
    canListen: false,
    canSpeak: false,
    transcript: "",
    interimTranscript: "",
    error: null as string | null,
  });

  const recognitionRef = useRef<RecognitionInstance>(null);
  const voicesReadyRef = useRef(false);

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
    const canListen = Boolean(Ctor);

    setState((s) => ({
      ...s,
      canListen,
      canSpeak,
    }));

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
      let message = "Erreur micro — réessayez ou utilisez le texte.";
      if (code === "not-allowed") message = "Micro refusé. Autorisez l'accès ou utilisez le champ texte.";
      if (code === "no-speech") message = "Je n'ai rien entendu. Réessayez.";
      if (code === "aborted") message = "";
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

    const loadVoices = () => {
      voicesReadyRef.current = true;
    };
    if (canSpeak) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
      loadVoices();
    }

    return () => {
      window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  const startListening = useCallback(async () => {
    if (!recognitionRef.current) {
      setState((s) => ({
        ...s,
        error: "Reconnaissance vocale non supportée — utilisez le champ texte.",
      }));
      return;
    }

    const perm = await requestMicPermission();
    if (!perm.granted) {
      setState((s) => ({ ...s, error: perm.message ?? "Micro refusé." }));
      return;
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
    } catch {
      setState((s) => ({
        ...s,
        isListening: false,
        error: "Micro déjà actif — patientez un instant.",
      }));
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

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setState((s) => ({ ...s, error: "Synthèse vocale indisponible — lisez le sous-titre." }));
      return;
    }

    const clean = text.replace(/👋/g, "").trim();
    if (!clean) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = "fr-FR";
    utterance.rate = 0.95;
    utterance.pitch = 1.08;
    utterance.volume = 1;

    const voice = pickFrenchVoice();
    if (voice) utterance.voice = voice;

    utterance.onstart = () => setState((s) => ({ ...s, isSpeaking: true, error: null }));
    utterance.onend = () => setState((s) => ({ ...s, isSpeaking: false }));
    utterance.onerror = () => setState((s) => ({ ...s, isSpeaking: false }));

    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setState((s) => ({ ...s, isSpeaking: false }));
  }, []);

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  return {
    isListening: state.isListening,
    isSpeaking: state.isSpeaking,
    isSupported: state.canListen || state.canSpeak,
    canListen: state.canListen,
    canSpeak: state.canSpeak,
    transcript: state.transcript,
    interimTranscript: state.interimTranscript,
    error: state.error,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    clearError,
  };
}

export function deriveAvaState(
  isListening: boolean,
  isSpeaking: boolean,
  isThinking: boolean
): AvaVoiceState {
  if (isListening) return "listening";
  if (isThinking) return "thinking";
  if (isSpeaking) return "speaking";
  return "idle";
}
