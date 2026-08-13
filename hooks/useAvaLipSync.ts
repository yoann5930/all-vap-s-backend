"use client";

import { useEffect, useRef, useState } from "react";
import {
  AVA_SPEECH_BOUNDARY_EVENT,
  frenchVisemeAt,
  type AvaFacialViseme,
  type AvaSpeechBoundaryDetail,
} from "@/lib/ava/facial-speech";

export interface AvaLipSyncValues {
  mouthOpen: number;
  jawOpen: number;
  smile: number;
  viseme: number;
  visemeName: AvaFacialViseme;
}

const IDLE: AvaLipSyncValues = {
  mouthOpen: 0,
  jawOpen: 0,
  smile: 0,
  viseme: 0,
  visemeName: "REST",
};

const FALLBACK_VISEMES: AvaFacialViseme[] = ["AA", "E", "I", "O", "U", "MBP", "FV", "L", "CH", "RR"];

function visemeOpening(viseme: AvaFacialViseme) {
  if (viseme === "REST") return 0;
  if (viseme === "MBP") return 0.02;
  if (viseme === "FV") return 0.24;
  if (viseme === "U" || viseme === "O") return 0.52;
  return 0.58;
}

export function useAvaLipSync(isSpeaking: boolean, audioElement: HTMLAudioElement | null) {
  const [values, setValues] = useState<AvaLipSyncValues>(IDLE);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const phaseRef = useRef(0);
  const boundaryRef = useRef<{ viseme: AvaFacialViseme; at: number }>({
    viseme: "REST",
    at: 0,
  });

  useEffect(() => {
    const onBoundary = (event: Event) => {
      const detail = (event as CustomEvent<AvaSpeechBoundaryDetail>).detail;
      boundaryRef.current = {
        viseme: detail.ended ? "REST" : frenchVisemeAt(detail.text, detail.charIndex),
        at: performance.now(),
      };
    };
    window.addEventListener(AVA_SPEECH_BOUNDARY_EVENT, onBoundary);
    return () => window.removeEventListener(AVA_SPEECH_BOUNDARY_EVENT, onBoundary);
  }, []);

  useEffect(() => {
    if (!isSpeaking) {
      boundaryRef.current = { viseme: "REST", at: 0 };
      setValues(IDLE);
      return;
    }

    let source: MediaElementAudioSourceNode | null = null;

    const setupAnalyser = () => {
      if (!audioElement) return false;
      try {
        const ctx = ctxRef.current ?? new AudioContext();
        ctxRef.current = ctx;
        if (ctx.state === "suspended") void ctx.resume();
        analyserRef.current = ctx.createAnalyser();
        analyserRef.current.fftSize = 256;
        analyserRef.current.smoothingTimeConstant = 0.65;
        source = ctx.createMediaElementSource(audioElement);
        source.connect(analyserRef.current);
        analyserRef.current.connect(ctx.destination);
        return true;
      } catch {
        return false;
      }
    };

    const hasAnalyser = setupAnalyser();
    const data = new Uint8Array(hasAnalyser && analyserRef.current ? analyserRef.current.frequencyBinCount : 0);

    const tick = () => {
      phaseRef.current += 0.14;
      const boundaryIsFresh = performance.now() - boundaryRef.current.at < 700;
      const fallbackIndex = Math.floor(phaseRef.current * 1.65) % FALLBACK_VISEMES.length;
      const visemeName = boundaryIsFresh
        ? boundaryRef.current.viseme
        : FALLBACK_VISEMES[fallbackIndex];
      const phonemeOpen = visemeOpening(visemeName);

      if (hasAnalyser && analyserRef.current) {
        analyserRef.current.getByteFrequencyData(data);
        const low = avg(data, 2, 8);
        const mid = avg(data, 8, 24);
        const high = avg(data, 24, 48);
        const energy = (low * 0.5 + mid * 0.35 + high * 0.15) / 255;
        const mouthOpen = clamp(Math.max(phonemeOpen, energy * 1.35) + Math.sin(phaseRef.current) * 0.025, 0, 1);
        const jawOpen = clamp(mouthOpen * 0.85, 0, 1);
        const viseme = clamp((mid - low) / 128 + 0.5, 0, 1);
        setValues({
          mouthOpen,
          jawOpen,
          smile: clamp(mouthOpen * 0.35 + 0.12, 0, 0.55),
          viseme,
          visemeName,
        });
      } else {
        const wave = (Math.sin(phaseRef.current * 2.1) + Math.sin(phaseRef.current * 3.7)) * 0.5;
        const mouthOpen = clamp(phonemeOpen + wave * 0.07, visemeName === "REST" ? 0 : 0.01, 0.78);
        setValues({
          mouthOpen,
          jawOpen: mouthOpen * 0.8,
          smile: clamp(0.15 + mouthOpen * 0.25, 0, 0.5),
          viseme: (Math.sin(phaseRef.current) + 1) * 0.5,
          visemeName,
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        source?.disconnect();
        analyserRef.current?.disconnect();
      } catch {
        /* ignore */
      }
    };
  }, [isSpeaking, audioElement]);

  return values;
}

function avg(buf: Uint8Array, from: number, to: number) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += buf[i] ?? 0;
  return sum / Math.max(1, to - from);
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
