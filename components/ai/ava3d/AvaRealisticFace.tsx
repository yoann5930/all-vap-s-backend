"use client";

/**
 * Visage A.V.A. photoréaliste — priorité au portrait validé.
 * Pas de mesh GLB déformé, pas de teinte cyan qui « mange » la peau.
 */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { AvaLipSyncValues } from "@/hooks/useAvaLipSync";
import type { AvaConversationState } from "@/hooks/useVoiceConversation";

export const AVA_REALISTIC_FACE_PATHS = [
  "/ava/ava-realistic-face.png",
  "/ava/ava-face-texture.png",
  "/ava/ava-hologram-portrait.png",
  "/ava/ava-portrait.png",
] as const;

interface AvaRealisticFaceProps {
  state: AvaConversationState;
  lipSync: AvaLipSyncValues;
  lookX: number;
  lookY: number;
  blink: number;
}

const PLACEHOLDER = (() => {
  const t = new THREE.DataTexture(new Uint8Array([8, 20, 32, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

export function AvaRealisticFace({
  state,
  lipSync,
  lookX,
  lookY,
  blink,
}: AvaRealisticFaceProps) {
  const groupRef = useRef<THREE.Group>(null);
  const faceRef = useRef<THREE.Mesh>(null);
  const mouthRef = useRef<THREE.Mesh>(null);
  const leftLidRef = useRef<THREE.Mesh>(null);
  const rightLidRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.Texture>(PLACEHOLDER);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    let i = 0;

    const tryNext = () => {
      if (cancelled || i >= AVA_REALISTIC_FACE_PATHS.length) {
        if (!cancelled) {
          console.error("[AVA 3D] Aucune texture visage réaliste chargée");
        }
        return;
      }
      const url = AVA_REALISTIC_FACE_PATHS[i++];
      loader.load(
        url,
        (tex) => {
          if (cancelled) return;
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.generateMipmaps = true;
          setTexture(tex);
          setReady(true);
        },
        undefined,
        () => tryNext()
      );
    };

    tryNext();
    return () => {
      cancelled = true;
    };
  }, []);

  const material = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
  }, [texture]);

  useEffect(() => {
    material.map = texture;
    material.needsUpdate = true;
  }, [material, texture]);

  const isSpeaking = state === "speaking";
  const isThinking = state === "thinking";
  const isListening = state === "listening";

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const g = groupRef.current;
    if (!g) return;

    const breathe = Math.sin(t * 1.05) * 0.004;
    const thinkPulse = isThinking ? Math.sin(t * 2.2) * 0.003 : 0;
    g.position.y = breathe + thinkPulse;

    // Regard / micro-rotation — très discrets pour rester crédible
    const targetY = lookX * 0.06 + Math.sin(t * 0.35) * 0.012;
    const targetX = -lookY * 0.035 + Math.sin(t * 0.28) * 0.008;
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, targetY, 0.04);
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, targetX, 0.04);

    // Lip-sync : léger « ovale » bouche — pas de déformation du visage entier
    if (mouthRef.current) {
      const open = isSpeaking ? lipSync.mouthOpen : 0;
      const sy = 1 + open * 0.22;
      const sx = 1 + open * 0.06;
      mouthRef.current.scale.set(sx, sy, 1);
      mouthRef.current.position.y = -0.18 - open * 0.01;
      (mouthRef.current.material as THREE.MeshBasicMaterial).opacity = open * 0.22;
    }

    if (faceRef.current) {
      const smileBoost = isListening ? 1.002 : 1;
      const speakPulse = isSpeaking ? 1 + lipSync.mouthOpen * 0.004 : 1;
      faceRef.current.scale.setScalar(smileBoost * speakPulse);
    }

    const lid = 1 - blink * 0.92;
    if (leftLidRef.current) {
      leftLidRef.current.scale.y = lid;
      (leftLidRef.current.material as THREE.MeshBasicMaterial).opacity = blink * 0.55;
    }
    if (rightLidRef.current) {
      rightLidRef.current.scale.y = lid;
      (rightLidRef.current.material as THREE.MeshBasicMaterial).opacity = blink * 0.55;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0.06, 0]} visible={ready}>
      {/* Portrait photoréaliste — unlit pour garder les couleurs du rendu */}
      <mesh ref={faceRef}>
        <planeGeometry args={[1.72, 2.15]} />
        <primitive object={material} attach="material" />
      </mesh>

      {/* Soft mouth cue (overlay sombre très léger, pas un morph mesh cassé) */}
      <mesh ref={mouthRef} position={[0, -0.18, 0.02]}>
        <planeGeometry args={[0.28, 0.08]} />
        <meshBasicMaterial color="#020508" transparent opacity={0} depthWrite={false} />
      </mesh>

      <mesh ref={leftLidRef} position={[-0.27, 0.34, 0.025]}>
        <planeGeometry args={[0.22, 0.09]} />
        <meshBasicMaterial color="#010408" transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={rightLidRef} position={[0.27, 0.34, 0.025]}>
        <planeGeometry args={[0.22, 0.09]} />
        <meshBasicMaterial color="#010408" transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

