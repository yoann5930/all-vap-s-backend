"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SpeechSynthesisState {
  isSpeaking: boolean;
  canSpeak: boolean;
  error: string | null;
}

function pickFrenchFemaleVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined") return null;
  const voices = window.speechSynthesis.getVoices();
  const fr = voices.filter((v) => v.lang.toLowerCase().startsWith("fr"));
  return (
    fr.find((v) => /amelie|marie|hortense|julie|female|femme|google.*fr/i.test(v.name)) ??
    fr.find((v) => /google|premium|natural/i.test(v.name)) ??
    fr.find((v) => v.localService) ??
    fr[0] ??
    null
  );
}

export function useSpeechSynthesis() {
  const [state, setState] = useState<SpeechSynthesisState>({
    isSpeaking: false,
    canSpeak: false,
    error: null,
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeAudio, setActiveAudio] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
    setState((s) => ({ ...s, canSpeak }));

    const loadVoices = () => {
      window.speechSynthesis.getVoices();
    };
    if (canSpeak) {
      loadVoices();
      window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    }
    return () => {
      window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices);
      audioRef.current?.pause();
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setActiveAudio(null);
    setState((s) => ({ ...s, isSpeaking: false }));
  }, []);

  const speakBrowser = useCallback((text: string) => {
    if (!window.speechSynthesis) {
      setState((s) => ({ ...s, error: "Synthèse vocale indisponible." }));
      return;
    }

    const clean = text.replace(/👋/g, "").trim();
    if (!clean) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = "fr-FR";
    utterance.rate = 0.92;
    utterance.pitch = 1.12;
    utterance.volume = 1;

    const voice = pickFrenchFemaleVoice();
    if (voice) utterance.voice = voice;

    utterance.onstart = () => setState((s) => ({ ...s, isSpeaking: true, error: null }));
    utterance.onend = () => setState((s) => ({ ...s, isSpeaking: false }));
    utterance.onerror = () => setState((s) => ({ ...s, isSpeaking: false }));

    window.speechSynthesis.speak(utterance);
  }, []);

  const speakFromBase64 = useCallback(
    (base64: string, mimeType = "audio/mpeg") => {
      stopSpeaking();
      const audio = new Audio(`data:${mimeType};base64,${base64}`);
      audioRef.current = audio;
      setActiveAudio(audio);
      audio.onplay = () => setState((s) => ({ ...s, isSpeaking: true, error: null }));
      audio.onended = () => setState((s) => ({ ...s, isSpeaking: false }));
      audio.onerror = () => {
        setState((s) => ({ ...s, isSpeaking: false, error: "Lecture audio impossible." }));
      };
      void audio.play();
    },
    [stopSpeaking]
  );

  const speak = useCallback(
    (text: string, audioBase64?: string | null, audioMime?: string) => {
      if (audioBase64) {
        speakFromBase64(audioBase64, audioMime);
        return;
      }
      speakBrowser(text);
    },
    [speakBrowser, speakFromBase64]
  );

  return {
    ...state,
    speak,
    stopSpeaking,
    activeAudio,
  };
}
