"use client";

import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { AvaPortraitHead } from "@/components/ai/ava3d/AvaPortraitHead";
import { AvaGltfAvatar } from "@/components/ai/ava3d/AvaGltfAvatar";
import { HoloParticles3D } from "@/components/ai/ava3d/HoloParticles3D";
import { HoloProjectionBase } from "@/components/ai/ava3d/HoloProjectionBase";
import { useAvaLipSync } from "@/hooks/useAvaLipSync";
import type { AvaConversationState } from "@/hooks/useVoiceConversation";

interface AvaSceneContentProps {
  state: AvaConversationState;
  isSpeaking: boolean;
  audioElement: HTMLAudioElement | null;
  useGltf: boolean;
  onGltfError: (error?: unknown) => void;
}

/** Capture les erreurs de chargement GLB → bascule sur le portrait procédural */
class GltfErrorBoundary extends Component<
  { onError: (error?: unknown) => void; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[AVA 3D] Échec chargement modèle GLB — fallback portrait:", error);
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function CameraRig() {
  const { camera, size } = useThree();
  useEffect(() => {
    // Mobile : caméra un peu plus loin pour garder la tête entière dans le cadre
    const isNarrow = size.width < 640;
    const z = isNarrow ? 2.45 : 2.15;
    const y = isNarrow ? 0.22 : 0.18;
    camera.position.set(0, y, z);
    camera.lookAt(0, isNarrow ? 0.14 : 0.12, 0);
  }, [camera, size.width]);
  return null;
}

function AvaSceneContent({ state, isSpeaking, audioElement, useGltf, onGltfError }: AvaSceneContentProps) {
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

  const avatarProps = {
    state,
    lipSync,
    lookX: look.x,
    lookY: look.y,
    blink,
  };

  return (
    <>
      <color attach="background" args={["#000000"]} />
      <CameraRig />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#a8e8ff", "#001018", 0.45]} />
      <directionalLight position={[1.4, 2.2, 2.4]} intensity={1.1} color="#ffffff" />
      <directionalLight position={[-1.8, 1.0, 1.2]} intensity={0.55} color="#66e0ff" />
      <pointLight position={[0, 1.0, 1.6]} intensity={1.6} color="#00e5ff" distance={8} />
      <spotLight
        position={[0, 2.4, 2.0]}
        angle={0.5}
        penumbra={0.55}
        intensity={0.7}
        color="#c8f4ff"
        castShadow={false}
      />

      <HoloParticles3D count={140} />
      <HoloProjectionBase state={state} />

      <Suspense fallback={<AvaPortraitHead {...avatarProps} />}>
        {useGltf ? (
          <GltfErrorBoundary onError={onGltfError}>
            <AvaGltfAvatar {...avatarProps} />
          </GltfErrorBoundary>
        ) : (
          <GltfErrorBoundary
            onError={(err) => {
              console.error("[AVA 3D] Échec fallback portrait:", err);
            }}
          >
            <Suspense fallback={null}>
              <AvaPortraitHead {...avatarProps} />
            </Suspense>
          </GltfErrorBoundary>
        )}
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

export function AvaCanvas({ state, isSpeaking, audioElement, className = "" }: AvaCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [useGltf, setUseGltf] = useState(true);

  return (
    <div ref={containerRef} className={`ava-3d-canvas ${className}`}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: true }}
        camera={{ fov: 36, near: 0.1, far: 100 }}
        style={{ width: "100%", height: "100%" }}
      >
        <AvaSceneContent
          state={state}
          isSpeaking={isSpeaking}
          audioElement={audioElement}
          useGltf={useGltf}
          onGltfError={() => {
            console.warn("[AVA 3D] Bascule vers le visage de secours (AvaPortraitHead)");
            setUseGltf(false);
          }}
        />
      </Canvas>
      <div className="ava-3d-scanlines pointer-events-none absolute inset-0" aria-hidden />
      <div className="ava-3d-vignette pointer-events-none absolute inset-0" aria-hidden />
    </div>
  );
}
