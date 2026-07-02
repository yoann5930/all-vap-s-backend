"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { AvaConversationState } from "@/hooks/useVoiceConversation";

interface HoloProjectionBaseProps {
  state: AvaConversationState;
}

export function HoloProjectionBase({ state }: HoloProjectionBaseProps) {
  const ringsRef = useRef<THREE.Group>(null);
  const isActive = state === "listening" || state === "speaking" || state === "thinking";

  const ringMats = useMemo(
    () =>
      [0.95, 1.25, 1.55].map(
        () =>
          new THREE.MeshBasicMaterial({
            color: "#00d4ff",
            transparent: true,
            opacity: 0.35,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          })
      ),
    []
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (!ringsRef.current) return;
    ringsRef.current.rotation.z = t * 0.15;
    ringsRef.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = (isActive ? 0.45 : 0.28) + Math.sin(t * 2 + i) * 0.08;
      mesh.scale.setScalar(1 + Math.sin(t * 1.5 + i * 0.8) * 0.02);
    });
  });

  return (
    <group ref={ringsRef} position={[0, -1.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {[0.95, 1.25, 1.55].map((radius, i) => (
        <mesh key={radius} material={ringMats[i]}>
          <ringGeometry args={[radius * 0.88, radius, 64]} />
        </mesh>
      ))}
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
