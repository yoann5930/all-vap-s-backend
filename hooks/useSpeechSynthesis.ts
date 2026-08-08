"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { humanizeForSpeech, splitSpokenSentences } from "@/lib/ai/ava-speech-utils";

export interface SpeechSynthesisState {
  isSpeaking: boolean;
  isPaused: boolean;
  canSpeak: boolean;
  error: string | null;
  selectedVoiceName: string | null;
}

const SPEECH_UNAVAILABLE =
  "La synthèse vocale du navigateur n'est pas disponible. Utilisez Chrome ou Edge pour entendre Ava.";

function scoreFrenchVoice(v: SpeechSynthesisVoice): number {
  const name = v.name.toLowerCase();
  const lang = v.lang.toLowerCase().replace(/_/g, "-");
  if (!lang.startsWith("fr")) return -100;

  let score = 10;
  // Priorité : français de France
  if (lang === "fr-fr") score += 40;
  else if (lang.startsWith("fr")) score += 15;

  // Éviter le québécois / belge / suisse
  if (/fr-ca|quebec|belg|fr-be|fr-ch|swiss|canada/i.test(`${lang} ${name}`)) score -= 70;

  if (/natural|neural|online|premium|enhanced|wavenet|studio/i.test(name)) score += 50;
  if (/denise|julie|marie|amelie|hortense|aria|claire|caroline|brigitte|eloise|léonie|leonie| millie|gabrielle/i.test(name))
    score += 45;
  if (/female|femme|woman|girl/i.test(name)) score += 20;
  if (/google.*fran[cç]ais|microsoft.*fr/i.test(name)) score += 25;
  if (/male|homme|paul|thomas|claude|hugo|jean|jacques|guy|henri/i.test(name)) score -= 40;
  if (/soft|gentle|calm|warm/i.test(name)) score += 20;
  if (v.localService) score += 3;
  return score;
}

function pickFrenchFemaleVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const ranked = voices
    .map((v) => ({ v, score: scoreFrenchVoice(v) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked[0]) return ranked[0].v;

  // Fallback : toute voix fr* (hors CA si possible), sinon null → voix défaut navigateur
  const anyFr = voices.find((v) => {
    const lang = v.lang.toLowerCase();
    return lang.startsWith("fr") && !lang.includes("ca");
  });
  return anyFr ?? voices.find((v) => v.lang.toLowerCase().startsWith("fr")) ?? null;
}

function speakUtterance(text: string, voice: SpeechSynthesisVoice | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "fr-FR";
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;
    if (voice) utterance.voice = voice;

    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      resolve();
    };
    // Chrome peut ne jamais émettre onend → débloque le dialogue
    const watchdog = window.setTimeout(done, Math.min(20000, 2500 + text.length * 70));

    utterance.onend = () => done();
    utterance.onerror = (ev) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      if (ev.error === "canceled" || ev.error === "interrupted") {
        resolve();
        return;
      }
      reject(new Error(ev.error || "speech-error"));
    };
    window.speechSynthesis.speak(utterance);
  });
}

function pauseMs(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function useSpeechSynthesis() {
  const [state, setState] = useState<SpeechSynthesisState>({
    isSpeaking: false,
    isPaused: false,
    canSpeak: false,
    error: null,
    selectedVoiceName: null,
  });
  const cancelRef = useRef(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const speakingGenRef = useRef(0);

  useEffect(() => {
    const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
    if (!canSpeak) {
      setState((s) => ({ ...s, canSpeak: false, error: SPEECH_UNAVAILABLE }));
      return;
    }

    setState((s) => ({ ...s, canSpeak: true, error: null }));

    const loadVoices = () => {
      const picked = pickFrenchFemaleVoice();
      voiceRef.current = picked;
      setState((s) => ({
        ...s,
        selectedVoiceName: picked?.name ?? null,
      }));
    };

    loadVoices();
    // Chrome charge souvent les voix de façon asynchrone
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    // Relance courte si liste encore vide
    const t = window.setTimeout(loadVoices, 250);

    return () => {
      window.clearTimeout(t);
      window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices);
      cancelRef.current = true;
      speakingGenRef.current += 1;
      window.speechSynthesis?.cancel();
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    cancelRef.current = true;
    speakingGenRef.current += 1;
    try {
      window.speechSynthesis?.cancel();
      window.speechSynthesis?.resume(); // évite un état "paused" bloqué sur certains navigateurs
    } catch {
      /* ignore */
    }
    setState((s) => ({ ...s, isSpeaking: false, isPaused: false }));
  }, []);

  const pauseSpeaking = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (!window.speechSynthesis.speaking) return;
    window.speechSynthesis.pause();
    setState((s) => ({ ...s, isPaused: true }));
  }, []);

  const resumeSpeaking = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.resume();
    setState((s) => ({ ...s, isPaused: false }));
  }, []);

  const speakBrowser = useCallback(async (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !window.speechSynthesis) {
      setState((s) => ({ ...s, error: SPEECH_UNAVAILABLE, isSpeaking: false }));
      return;
    }

    const clean = humanizeForSpeech(text);
    if (!clean) return;

    // Annule toute lecture précédente — pas de superposition
    cancelRef.current = true;
    speakingGenRef.current += 1;
    const gen = speakingGenRef.current;
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
    } catch {
      /* ignore */
    }

    cancelRef.current = false;
    if (!voiceRef.current) {
      voiceRef.current = pickFrenchFemaleVoice();
    }
    const voice = voiceRef.current;
    const sentences = splitSpokenSentences(clean);

    setState((s) => ({
      ...s,
      isSpeaking: true,
      isPaused: false,
      error: null,
      selectedVoiceName: voice?.name ?? s.selectedVoiceName,
    }));

    try {
      for (let i = 0; i < sentences.length; i++) {
        if (cancelRef.current || gen !== speakingGenRef.current) break;
        await speakUtterance(sentences[i], voice);
        if (!cancelRef.current && gen === speakingGenRef.current && i < sentences.length - 1) {
          await pauseMs(200);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // Autoplay / interaction requise
      if (/not-allowed|denied|interrupted/i.test(msg)) {
        setState((s) => ({
          ...s,
          error: "Appuyez sur le micro ou envoyez un message pour activer la voix d'Ava.",
        }));
      } else if (msg && msg !== "canceled") {
        setState((s) => ({
          ...s,
          error: "Impossible de lire la réponse à voix haute.",
        }));
      }
    } finally {
      if (gen === speakingGenRef.current) {
        setState((s) => ({ ...s, isSpeaking: false, isPaused: false }));
      }
    }
  }, []);

  /**
   * Voix 100 % navigateur — ignore tout audio distant (OpenAI TTS désactivé).
   * Signature conservée pour compatibilité des appels existants.
   */
  const speak = useCallback(
    async (text: string, _audioBase64?: string | null, _audioMime?: string) => {
      await speakBrowser(text);
    },
    [speakBrowser]
  );

  return {
    ...state,
    speak,
    stopSpeaking,
    pauseSpeaking,
    resumeSpeaking,
    /** Plus d’élément <audio> OpenAI — le hologramme s’appuie sur isSpeaking. */
    activeAudio: null as HTMLAudioElement | null,
  };
}
