"use client";

/**
 * Canvas Ava — plein viewport, lip-sync branché sur la voix immersive.
 */
import { useEffect, useRef, useState } from "react";
import {
  createSpeechTimeline,
  estimateSpeechDurationMs,
} from "@/lib/ava/pack-lipsync";
import type { AvaPackRuntime } from "@/components/ava/pack/avaPackTypes";

interface AvaPackCanvasProps {
  isSpeaking: boolean;
  speechText?: string;
  className?: string;
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
  const speakGen = useRef(0);

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

  useEffect(() => {
    const text = speechText.trim();
    if (!isSpeaking || !text) {
      runtime.current.speaking = false;
      lastSpeechRef.current = "";
      return;
    }
    if (text === lastSpeechRef.current && runtime.current.speaking) return;

    lastSpeechRef.current = text;
    const gen = ++speakGen.current;
    const duration = estimateSpeechDurationMs(text);
    runtime.current.timeline = createSpeechTimeline(text, duration);
    runtime.current.start = performance.now();
    runtime.current.speaking = true;

    const endAt = window.setTimeout(() => {
      if (speakGen.current === gen) {
        runtime.current.speaking = false;
      }
    }, duration + 180);

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
        minHeight: "100dvh",
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
            color: "rgba(255,255,255,0.4)",
            fontSize: 14,
            pointerEvents: "none",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Ava arrive…
        </div>
      )}
    </div>
  );
}
