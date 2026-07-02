"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

export function HoloParticles3D({ count = 120 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 2.8;
      positions[i * 3 + 1] = Math.random() * 2.2 - 0.8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1.6;
      speeds[i] = 0.2 + Math.random() * 0.8;
    }
    return { positions, speeds };
  }, [count]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const geo = pointsRef.current?.geometry;
    if (!geo) return;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      const y = pos.getY(i) + speeds[i]! * 0.004;
      pos.setY(i, y > 1.4 ? -0.9 : y);
      pos.setX(i, pos.getX(i) + Math.sin(t + i) * 0.0004);
    }
    pos.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#00d4ff"
        size={0.018}
        transparent
        opacity={0.65}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}
