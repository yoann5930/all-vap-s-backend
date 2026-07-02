"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SpeechState {
  isListening: boolean;
  isSpeaking: boolean;
  isSupported: boolean;
  transcript: string;
  error: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RecognitionInstance = any;

export function useSpeech(onTranscript?: (text: string) => void) {
  const callbackRef = useRef(onTranscript);
  callbackRef.current = onTranscript;

  const [state, setState] = useState<SpeechState>({
    isListening: false,
    isSpeaking: false,
    isSupported: false,
    transcript: "",
    error: null,
  });

  const recognitionRef = useRef<RecognitionInstance>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const Ctor =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    setState((s) => ({
      ...s,
      isSupported: Boolean(Ctor && window.speechSynthesis),
    }));

    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = "fr-FR";
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => {
      const text = event.results[0]?.[0]?.transcript ?? "";
      setState((s) => ({ ...s, transcript: text, isListening: false }));
      callbackRef.current?.(text);
    };

    rec.onerror = () => {
      setState((s) => ({ ...s, isListening: false, error: "Micro indisponible" }));
    };

    rec.onend = () => {
      setState((s) => ({ ...s, isListening: false }));
    };

    recognitionRef.current = rec;
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      setState((s) => ({ ...s, error: "Reconnaissance vocale non supportée" }));
      return;
    }
    setState((s) => ({ ...s, error: null, transcript: "", isListening: true }));
    try {
      recognitionRef.current.start();
    } catch {
      setState((s) => ({ ...s, isListening: false, error: "Micro déjà actif" }));
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setState((s) => ({ ...s, isListening: false }));
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/👋/g, ""));
    utterance.lang = "fr-FR";
    utterance.rate = 1;
    utterance.pitch = 1.05;

    utterance.onstart = () => setState((s) => ({ ...s, isSpeaking: true }));
    utterance.onend = () => setState((s) => ({ ...s, isSpeaking: false }));
    utterance.onerror = () => setState((s) => ({ ...s, isSpeaking: false }));

    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setState((s) => ({ ...s, isSpeaking: false }));
  }, []);

  return {
    ...state,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  };
}
