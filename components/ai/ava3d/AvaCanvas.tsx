"use client";

import {
  Component,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { AvaGltfAvatar } from "@/components/ai/ava3d/AvaGltfAvatar";
import { AvaRealisticFace } from "@/components/ai/ava3d/AvaRealisticFace";
import { HoloParticles3D } from "@/components/ai/ava3d/HoloParticles3D";
import { HoloProjectionBase } from "@/components/ai/ava3d/HoloProjectionBase";
import { useAvaLipSync } from "@/hooks/useAvaLipSync";
import { getAvaCameraFraming } from "@/lib/ava/camera-framing";
import type { AvaConversationState } from "@/hooks/useVoiceConversation";

interface AvaSceneContentProps {
  state: AvaConversationState;
  isSpeaking: boolean;
  audioElement: HTMLAudioElement | null;
  particleCount: number;
}

function CameraRig() {
  const { camera, gl, size } = useThree();
  useLayoutEffect(() => {
    const framing = getAvaCameraFraming(size.width, size.height);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = framing.fov;
    }
    camera.position.set(0, framing.cameraY, framing.cameraZ);
    camera.lookAt(0, framing.targetY, 0);
    camera.updateProjectionMatrix();
    gl.domElement.dataset.avaScreenProfile = framing.profile;
  }, [camera, gl, size.height, size.width]);
  return null;
}

class AvaModelErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AVA 3D] Modèle facial indisponible, fallback portrait actif", error, info);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
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
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, delayMs: number) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!cancelled) fn();
      }, delayMs);
      timers.add(timer);
    };
    const blinkOnce = (after: () => void) => {
      setBlink(1);
      later(() => {
        setBlink(0);
        after();
      }, 85 + Math.random() * 55);
    };
    const schedule = () => {
      const delay = isSpeaking ? 2400 + Math.random() * 2800 : 1800 + Math.random() * 3600;
      later(() => {
        const doubleBlink = Math.random() < 0.09;
        blinkOnce(() => {
          if (doubleBlink) later(() => blinkOnce(schedule), 90 + Math.random() * 80);
          else schedule();
        });
      }, delay);
    };
    schedule();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [isSpeaking]);

  return (
    <>
      <color attach="background" args={["#000000"]} />
      <CameraRig />
      <ambientLight intensity={0.7} />
      <hemisphereLight args={["#d9f4ff", "#07121d", 1.05]} />
      <directionalLight position={[-1.4, 1.8, 2.4]} intensity={1.8} color="#fff2e8" />
      <directionalLight position={[1.8, 1.1, -1.4]} intensity={1.35} color="#3ab9ff" />
      <pointLight position={[0, -0.25, 1.35]} intensity={1.1} color="#00c8e8" distance={6} />

      <HoloParticles3D count={particleCount} />
      <HoloProjectionBase state={state} />

      <AvaModelErrorBoundary
        fallback={
          <AvaRealisticFace
            state={state}
            lipSync={lipSync}
            lookX={look.x}
            lookY={look.y}
            blink={blink}
          />
        }
      >
        <Suspense
          fallback={
            <AvaRealisticFace
              state={state}
              lipSync={lipSync}
              lookX={look.x}
              lookY={look.y}
              blink={blink}
            />
          }
        >
          <AvaGltfAvatar
            state={state}
            lipSync={lipSync}
            lookX={look.x}
            lookY={look.y}
            blink={blink}
          />
        </Suspense>
      </AvaModelErrorBoundary>
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
          preserveDrawingBuffer: false,
        }}
        camera={{ fov: 48, near: 0.1, far: 100 }}
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
