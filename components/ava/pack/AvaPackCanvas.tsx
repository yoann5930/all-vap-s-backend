"use client";

/**
 * Canvas Ava (pack Cursor) — Three.js chargé uniquement côté navigateur.
 * Lip-sync piloté par speechText / isSpeaking (voix ImmersiveAvaScreen).
 */
import { useEffect, useRef, useState } from "react";
import {
  createSpeechTimeline,
  estimateSpeechDurationMs,
} from "@/lib/ava/pack-lipsync";
import type { AvaPackRuntime } from "@/components/ava/pack/avatarRuntime";

interface AvaPackCanvasProps {
  isSpeaking: boolean;
  speechText?: string;
  className?: string;
  /** Orbit souris (désactivé en immersif plein écran). */
  enableOrbit?: boolean;
}

export function AvaPackCanvas({
  isSpeaking,
  speechText = "",
  className = "",
  enableOrbit = false,
}: AvaPackCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<AvaPackRuntime>({
    start: 0,
    timeline: [],
    speaking: false,
  });
  const [loaded, setLoaded] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [, setLevel] = useState(0);
  const lastSpeechRef = useRef("");

  // Montage runtime (dynamic import — pas de Three.js au SSR)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    void import("@/components/ava/pack/avatarRuntime").then(({ mountAvatar }) => {
      if (cancelled || !canvasRef.current) return;
      cleanup = mountAvatar(
        canvasRef.current,
        runtime,
        setLoaded,
        setWebgl,
        setLevel,
        { enableOrbit }
      );
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [enableOrbit]);

  // Sync lèvres avec le TTS / réponses Ava existantes
  useEffect(() => {
    const text = speechText.trim();
    if (!isSpeaking || !text) {
      runtime.current.speaking = false;
      lastSpeechRef.current = "";
      return;
    }
    if (text === lastSpeechRef.current && runtime.current.speaking) return;
    lastSpeechRef.current = text;
    const duration = estimateSpeechDurationMs(text);
    runtime.current.timeline = createSpeechTimeline(text, duration);
    runtime.current.start = performance.now();
    runtime.current.speaking = true;

    const endAt = window.setTimeout(() => {
      if (lastSpeechRef.current === text) {
        runtime.current.speaking = false;
      }
    }, duration + 120);

    return () => window.clearTimeout(endAt);
  }, [isSpeaking, speechText]);

  return (
    <div
      className={`ava-pack-canvas ${className}`}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#05070d",
      }}
    >
      <canvas
        ref={canvasRef}
        aria-label="Ava — assistante 3D"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          touchAction: "none",
        }}
      />
      {!webgl && (
        <div
          role="img"
          aria-label="Aperçu Ava (WebGL indisponible)"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at center, #1a2438 0%, #05070d 70%)",
          }}
        />
      )}
      {!loaded && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.45)",
            fontSize: 14,
            pointerEvents: "none",
          }}
        >
          Chargement d&apos;Ava…
        </div>
      )}
    </div>
  );
}
