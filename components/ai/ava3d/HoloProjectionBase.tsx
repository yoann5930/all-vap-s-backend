"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { AvaConversationState } from "@/hooks/useVoiceConversation";

interface HoloProjectionBaseProps {
  state: AvaConversationState;
}

export function HoloProjectionBase({ state }: HoloProjectionBaseProps) {
  const ringsRef = useRef<THREE.Group>(null);
  const isActive = state === "listening" || state === "speaking" || state === "thinking";

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const group = ringsRef.current;
    if (!group) return;
    group.rotation.z = t * 0.15;
    let meshIndex = 0;
    for (let i = 0; i < group.children.length; i++) {
      const child = group.children[i];
      if (!(child as THREE.Mesh).isMesh) continue;
      const mesh = child as THREE.Mesh;
      const mat = mesh.material;
      const material = Array.isArray(mat) ? mat[0] : mat;
      if (!(material instanceof THREE.MeshBasicMaterial)) continue;
      material.opacity = (isActive ? 0.45 : 0.28) + Math.sin(t * 2 + meshIndex) * 0.08;
      mesh.scale.setScalar(1 + Math.sin(t * 1.5 + meshIndex * 0.8) * 0.02);
      meshIndex += 1;
    }
  });

  return (
    <group position={[0, -1.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <group ref={ringsRef}>
        {[0.95, 1.25, 1.55].map((radius) => (
          <mesh key={radius}>
            <ringGeometry args={[radius * 0.88, radius, 64]} />
            <meshBasicMaterial
              color="#00d4ff"
              transparent
              opacity={0.35}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 0, 0.01]}>
        <circleGeometry args={[0.35, 48]} />
        <meshBasicMaterial
          color="#00e5ff"
          transparent
          opacity={isActive ? 0.55 : 0.35}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <pointLight color="#00d4ff" intensity={isActive ? 2.2 : 1.4} distance={4} decay={2} position={[0, 0.3, 0.5]} />
    </group>
  );
}
