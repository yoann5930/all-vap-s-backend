"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { AvaRealisticFace } from "@/components/ai/ava3d/AvaRealisticFace";
import { HoloParticles3D } from "@/components/ai/ava3d/HoloParticles3D";
import { HoloProjectionBase } from "@/components/ai/ava3d/HoloProjectionBase";
import { useAvaLipSync } from "@/hooks/useAvaLipSync";
import type { AvaConversationState } from "@/hooks/useVoiceConversation";

interface AvaSceneContentProps {
  state: AvaConversationState;
  isSpeaking: boolean;
  audioElement: HTMLAudioElement | null;
  particleCount: number;
}

function CameraRig() {
  const { camera, size } = useThree();
  useEffect(() => {
    const isNarrow = size.width < 640;
    const z = isNarrow ? 2.35 : 2.05;
    const y = isNarrow ? 0.12 : 0.1;
    camera.position.set(0, y, z);
    camera.lookAt(0, 0.08, 0);
  }, [camera, size.width]);
  return null;
}

function AvaSceneContent({
  state,
  isSpeaking,
  audioElement,
  particleCount,
}: AvaSceneContentProps) {
  const lipSync = useAvaLipSync(isSpeaking, audioElement);
  const [blink, setBlink] = useState(0);
  const [look, setLook] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      setLook({ x: nx, y: ny });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const loop = () => {
      if (Math.random() > 0.55) {
        setBlink(1);
        timeout = setTimeout(() => setBlink(0), 85);
      }
      timeout = setTimeout(loop, isSpeaking ? 3000 : 1600 + Math.random() * 2600);
    };
    timeout = setTimeout(loop, 900);
    return () => clearTimeout(timeout);
  }, [isSpeaking]);

  return (
    <>
      <color attach="background" args={["#000000"]} />
      <CameraRig />
      <ambientLight intensity={0.35} />
      <directionalLight position={[0.8, 1.6, 2.2]} intensity={0.55} color="#ffffff" />
      <pointLight position={[0, -0.4, 1.2]} intensity={0.7} color="#00c8e8" distance={6} />

      <HoloParticles3D count={particleCount} />
      <HoloProjectionBase state={state} />

      <Suspense fallback={null}>
        <AvaRealisticFace
          state={state}
          lipSync={lipSync}
          lookX={look.x}
          lookY={look.y}
          blink={blink}
        />
      </Suspense>
    </>
  );
}

interface AvaCanvasProps {
  state: AvaConversationState;
  isSpeaking: boolean;
  audioElement: HTMLAudioElement | null;
  className?: string;
}

function useRenderBudget() {
  return useMemo(() => {
    if (typeof window === "undefined") {
      return { dpr: [1, 2] as [number, number], particles: 70 };
    }
    const narrow = window.innerWidth < 768;
    const cores = navigator.hardwareConcurrency || 4;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const lowEnd = cores <= 4 || (typeof mem === "number" && mem <= 4) || narrow;
    return {
      dpr: (lowEnd ? [1, 1.5] : [1, 2]) as [number, number],
      particles: lowEnd ? 28 : 55,
    };
  }, []);
}

export function AvaCanvas({ state, isSpeaking, audioElement, className = "" }: AvaCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const budget = useRenderBudget();

  return (
    <div ref={containerRef} className={`ava-3d-canvas ${className}`}>
      <Canvas
        dpr={budget.dpr}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          preserveDrawingBuffer: true,
        }}
        camera={{ fov: 34, near: 0.1, far: 100 }}
        style={{ width: "100%", height: "100%" }}
      >
        <AvaSceneContent
          state={state}
          isSpeaking={isSpeaking}
          audioElement={audioElement}
          particleCount={budget.particles}
        />
      </Canvas>
      <div className="ava-3d-vignette pointer-events-none absolute inset-0 opacity-60" aria-hidden />
    </div>
  );
}
