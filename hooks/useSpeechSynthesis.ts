"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { humanizeForSpeech, splitSpokenSentences } from "@/lib/ai/ava-speech-utils";

export interface SpeechSynthesisState {
  isSpeaking: boolean;
  canSpeak: boolean;
  error: string | null;
}

function scoreFrenchVoice(v: SpeechSynthesisVoice): number {
  const name = v.name.toLowerCase();
  const lang = v.lang.toLowerCase();
  if (!lang.startsWith("fr")) return -100;

  let score = 10;
  // Strictement français de France (évite accents CA/BE/CH)
  if (lang === "fr-fr" || lang === "fr_fr") score += 35;
  if (/fr-ca|fr_ca|quebec|belg|fr-be|fr-ch|swiss|canada/i.test(`${lang} ${name}`)) score -= 60;

  // Voix neurales / online = nettement plus humaines et douces
  if (/natural|neural|online|premium|enhanced|wavenet|studio/i.test(name)) score += 55;
  if (/denise|julie|marie|amelie|hortense|aria|claire|caroline|brigitte|eloise|léonie|leonie/i.test(name))
    score += 45;
  if (/female|femme|woman|girl/i.test(name)) score += 15;
  if (/google.*fran[cç]ais|microsoft.*fr/i.test(name)) score += 25;
  if (/male|homme|paul|thomas|claude|hugo|jean|jacques/i.test(name)) score -= 40;
  // Préférer les voix « soft / pleasant » si nommées ainsi
  if (/soft|gentle|calm|warm/i.test(name)) score += 20;
  if (v.localService) score += 3;
  return score;
}

function pickFrenchFemaleVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined") return null;
  const voices = window.speechSynthesis.getVoices();
  const ranked = voices
    .map((v) => ({ v, score: scoreFrenchVoice(v) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.v ?? null;
}

function speakUtterance(text: string, voice: SpeechSynthesisVoice | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "fr-FR";
    // Douce, posée, sans accélération ni pitch artificiel
    utterance.rate = 0.9;
    utterance.pitch = 0.98;
    utterance.volume = 0.88;
    if (voice) utterance.voice = voice;

    utterance.onend = () => resolve();
    utterance.onerror = () => reject(new Error("speech-error"));
    window.speechSynthesis.speak(utterance);
  });
}

function pause(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function useSpeechSynthesis() {
  const [state, setState] = useState<SpeechSynthesisState>({
    isSpeaking: false,
    canSpeak: false,
    error: null,
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeAudio, setActiveAudio] = useState<HTMLAudioElement | null>(null);
  const cancelRef = useRef(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
    setState((s) => ({ ...s, canSpeak }));

    const loadVoices = () => {
      voiceRef.current = pickFrenchFemaleVoice();
    };
    if (canSpeak) {
      loadVoices();
      window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    }
    return () => {
      window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices);
      cancelRef.current = true;
      audioRef.current?.pause();
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    cancelRef.current = true;
    window.speechSynthesis?.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setActiveAudio(null);
    setState((s) => ({ ...s, isSpeaking: false }));
  }, []);

  const speakBrowser = useCallback(async (text: string) => {
    if (!window.speechSynthesis) {
      setState((s) => ({ ...s, error: "Synthèse vocale indisponible." }));
      return;
    }

    const clean = humanizeForSpeech(text);
    if (!clean) return;

    cancelRef.current = false;
    window.speechSynthesis.cancel();
    setState((s) => ({ ...s, isSpeaking: true, error: null }));

    const voice = voiceRef.current ?? pickFrenchFemaleVoice();
    const sentences = splitSpokenSentences(clean);

    try {
      for (let i = 0; i < sentences.length; i++) {
        if (cancelRef.current) break;
        await speakUtterance(sentences[i], voice);
        // Micro-pause naturelle entre phrases
        if (!cancelRef.current && i < sentences.length - 1) {
          await pause(220);
        }
      }
    } catch {
      /* cancelled / engine error */
    } finally {
      if (!cancelRef.current) {
        setState((s) => ({ ...s, isSpeaking: false }));
      }
    }
  }, []);

  const speakFromBase64 = useCallback(
    (base64: string, mimeType = "audio/mpeg") => {
      stopSpeaking();
      cancelRef.current = false;
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
      void speakBrowser(text);
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
