"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { AvaPortraitHead } from "@/components/ai/ava3d/AvaPortraitHead";
import { HoloParticles3D } from "@/components/ai/ava3d/HoloParticles3D";
import { HoloProjectionBase } from "@/components/ai/ava3d/HoloProjectionBase";
import { useAvaLipSync } from "@/hooks/useAvaLipSync";
import type { AvaConversationState } from "@/hooks/useVoiceConversation";

interface AvaSceneContentProps {
  state: AvaConversationState;
  isSpeaking: boolean;
  audioElement: HTMLAudioElement | null;
}

function CameraRig() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 0.05, 2.35);
    camera.lookAt(0, 0.05, 0);
  }, [camera]);
  return null;
}

function AvaSceneContent({ state, isSpeaking, audioElement }: AvaSceneContentProps) {
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
      if (Math.random() > 0.58) {
        setBlink(1);
        timeout = setTimeout(() => setBlink(0), 90);
      }
      timeout = setTimeout(loop, isSpeaking ? 2800 : 1200 + Math.random() * 2200);
    };
    timeout = setTimeout(loop, 800);
    return () => clearTimeout(timeout);
  }, [isSpeaking]);

  return (
    <>
      <color attach="background" args={["#000000"]} />
      <CameraRig />
      <ambientLight intensity={0.15} />
      <directionalLight position={[1.2, 1.5, 2.5]} intensity={0.35} color="#88eeff" />
      <directionalLight position={[-1.5, 0.5, 1.5]} intensity={0.25} color="#00d4ff" />
      <pointLight position={[0, 0.6, 1.2]} intensity={1.2} color="#00e5ff" distance={6} />

      <HoloParticles3D count={140} />
      <HoloProjectionBase state={state} />

      <Suspense fallback={null}>
        <AvaPortraitHead state={state} lipSync={lipSync} lookX={look.x} lookY={look.y} blink={blink} />
      </Suspense>

      <EffectComposer multisampling={4}>
        <Bloom intensity={1.15} luminanceThreshold={0.12} luminanceSmoothing={0.85} mipmapBlur />
        <Noise opacity={0.025} />
        <Vignette eskil offset={0.12} darkness={0.92} />
      </EffectComposer>
    </>
  );
}

interface AvaCanvasProps {
  state: AvaConversationState;
  isSpeaking: boolean;
  audioElement: HTMLAudioElement | null;
  className?: string;
}

export function AvaCanvas({ state, isSpeaking, audioElement, className = "" }: AvaCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className={`ava-3d-canvas ${className}`}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ fov: 38, near: 0.1, far: 100 }}
        style={{ width: "100%", height: "100%" }}
      >
        <AvaSceneContent state={state} isSpeaking={isSpeaking} audioElement={audioElement} />
      </Canvas>
      <div className="ava-3d-scanlines pointer-events-none absolute inset-0" aria-hidden />
      <div className="ava-3d-vignette pointer-events-none absolute inset-0" aria-hidden />
    </div>
  );
}
