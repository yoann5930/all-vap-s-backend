"use client";

import { useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  holographicFragmentShader,
  holographicUniforms,
  holographicVertexShader,
} from "@/components/ai/ava3d/holographicShader";
import type { AvaLipSyncValues } from "@/hooks/useAvaLipSync";
import type { AvaConversationState } from "@/hooks/useVoiceConversation";

interface AvaPortraitHeadProps {
  state: AvaConversationState;
  lipSync: AvaLipSyncValues;
  lookX: number;
  lookY: number;
  blink: number;
}

export function AvaPortraitHead({ state, lipSync, lookX, lookY, blink }: AvaPortraitHeadProps) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const leftLidRef = useRef<THREE.Mesh>(null);
  const rightLidRef = useRef<THREE.Mesh>(null);

  const texture = useLoader(THREE.TextureLoader, "/ava/ava-face-texture.png");
  texture.colorSpace = THREE.SRGBColorSpace;

  const uniforms = useMemo(() => {
    const u = THREE.UniformsUtils.clone(holographicUniforms);
    u.uTexture.value = texture;
    return u;
  }, [texture]);

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTexture.value = texture;
    }
  }, [texture]);

  const isSpeaking = state === "speaking";
  const isThinking = state === "thinking";
  const isListening = state === "listening";

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const mat = materialRef.current;
    if (!mat) return;

    mat.uniforms.uTime.value = t;
    mat.uniforms.uMouthOpen.value = THREE.MathUtils.lerp(
      mat.uniforms.uMouthOpen.value,
      isSpeaking ? lipSync.mouthOpen : 0,
      0.28
    );
    mat.uniforms.uSmile.value = THREE.MathUtils.lerp(
      mat.uniforms.uSmile.value,
      isSpeaking ? lipSync.smile + 0.08 : isListening ? 0.06 : 0,
      0.12
    );
    mat.uniforms.uOpacity.value = isThinking ? 0.78 + Math.sin(t * 2) * 0.06 : 0.9;

    if (groupRef.current) {
      const breathe = Math.sin(t * 1.15) * 0.008;
      groupRef.current.position.y = breathe;
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, lookX * 0.14, 0.06);
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, -lookY * 0.08, 0.06);
      const speakPulse = isSpeaking ? 1 + Math.sin(t * 8) * 0.004 : 1;
      groupRef.current.scale.setScalar(speakPulse);
    }

    const lidScale = 1 - blink * 0.92;
    if (leftLidRef.current) leftLidRef.current.scale.y = lidScale;
    if (rightLidRef.current) rightLidRef.current.scale.y = lidScale;
  });

  return (
    <group ref={groupRef} position={[0, 0.05, 0]}>
      <mesh>
        <planeGeometry args={[1.65, 2.05, 96, 96]} />
        <shaderMaterial
          ref={materialRef}
          uniforms={uniforms}
          vertexShader={holographicVertexShader}
          fragmentShader={holographicFragmentShader}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh ref={leftLidRef} position={[-0.28, 0.38, 0.04]}>
        <planeGeometry args={[0.22, 0.1]} />
        <meshBasicMaterial color="#020810" transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <mesh ref={rightLidRef} position={[0.28, 0.38, 0.04]}>
        <planeGeometry args={[0.22, 0.1]} />
        <meshBasicMaterial color="#020810" transparent opacity={0.85} depthWrite={false} />
      </mesh>

      <mesh position={[0, 0, -0.12]}>
        <planeGeometry args={[2.1, 2.5]} />
        <meshBasicMaterial color="#00d4ff" transparent opacity={0.06} depthWrite={false} />
      </mesh>
    </group>
  );
}
