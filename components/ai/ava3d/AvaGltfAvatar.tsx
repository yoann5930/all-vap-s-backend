"use client";

/**
 * GLTF avatar loader with morph-target lip sync.
 * Place a Ready Player Me model at public/ava/ava-avatar.glb with ARKit + Oculus Visemes,
 * then swap AvaPortraitHead for AvaGltfAvatar in AvaCanvas.
 */
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { AvaLipSyncValues } from "@/hooks/useAvaLipSync";
import type { AvaConversationState } from "@/hooks/useVoiceConversation";

const MODEL_PATH = "/ava/ava-avatar.glb";

const MORPH = {
  mouthOpen: ["mouthOpen", "jawOpen", "viseme_aa"],
  smile: ["mouthSmile", "mouthSmileLeft", "mouthSmileRight"],
  blinkL: ["eyeBlinkLeft"],
  blinkR: ["eyeBlinkRight"],
};

interface AvaGltfAvatarProps {
  state: AvaConversationState;
  lipSync: AvaLipSyncValues;
  lookX: number;
  lookY: number;
  blink: number;
}

export function AvaGltfAvatar({ state, lipSync, lookX, lookY, blink }: AvaGltfAvatarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF(MODEL_PATH);

  const meshes = useMemo(() => {
    const found: THREE.Mesh[] = [];
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && (obj as THREE.Mesh).morphTargetDictionary) {
        found.push(obj as THREE.Mesh);
      }
    });
    return found;
  }, [scene]);

  useEffect(() => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((mat) => {
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          mat.transparent = true;
          mat.opacity = 0.92;
          mat.emissive = new THREE.Color("#003344");
          mat.emissiveIntensity = 0.35;
        }
      });
    });
  }, [scene]);

  const isSpeaking = state === "speaking";

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    meshes.forEach((mesh) => {
      const dict = mesh.morphTargetDictionary;
      const inf = mesh.morphTargetInfluences;
      if (!dict || !inf) return;

      setMorph(dict, inf, MORPH.mouthOpen, isSpeaking ? lipSync.mouthOpen : 0);
      setMorph(dict, inf, MORPH.smile, isSpeaking ? lipSync.smile + 0.1 : 0);
      setMorph(dict, inf, MORPH.blinkL, blink);
      setMorph(dict, inf, MORPH.blinkR, blink);
    });

    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(t * 1.15) * 0.012;
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, lookX * 0.18, 0.06);
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, -lookY * 0.1, 0.06);
    }
  });

  return (
    <group ref={groupRef} position={[0, -0.95, 0]} scale={1.35}>
      <primitive object={scene.clone()} />
    </group>
  );
}

function setMorph(
  dict: Record<string, number>,
  inf: number[],
  keys: string[],
  value: number
) {
  for (const key of keys) {
    const idx = dict[key];
    if (idx !== undefined) {
      inf[idx] = value;
      return;
    }
  }
}

useGLTF.preload(MODEL_PATH);
