"use client";

/**
 * Charge le modèle GLB de test Ava depuis /models/ava/ava-test-model.glb
 * Texture optionnelle : /models/ava/ava-test-texture.png
 * En cas d'échec → fallback AvaPortraitHead côté Canvas.
 */
import { useFrame } from "@react-three/fiber";
import { useGLTF, Center } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { AvaLipSyncValues } from "@/hooks/useAvaLipSync";
import type { AvaConversationState } from "@/hooks/useVoiceConversation";

export const AVA_TEST_MODEL_PATH = "/models/ava/AVA_HOLOGRAM.glb";
export const AVA_TEST_TEXTURE_PATH = "/models/ava/ava-hologram-texture.png";
/** Ancien chemin conservé en secours */
export const AVA_LEGACY_TEST_MODEL_PATH = "/models/ava/ava-test-model.glb";

/** Réglages d’affichage — ajustables uniquement ici (tête ~2.9 u → cadrage portrait) */
const MODEL_TRANSFORM = {
  position: [0, -0.02, 0] as [number, number, number],
  rotation: [0, 0, 0] as [number, number, number],
  scale: 0.48,
};

const MORPH = {
  mouthOpen: ["mouthOpen", "jawOpen", "viseme_aa", "MouthOpen"],
  smile: ["mouthSmile", "mouthSmileLeft", "mouthSmileRight", "MouthSmile"],
  blinkL: ["eyeBlinkLeft", "EyeBlinkLeft"],
  blinkR: ["eyeBlinkRight", "EyeBlinkRight"],
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
  const { scene } = useGLTF(AVA_TEST_MODEL_PATH);
  const [texReady, setTexReady] = useState(false);

  const cloned = useMemo(() => scene.clone(true), [scene]);

  const meshes = useMemo(() => {
    const found: THREE.Mesh[] = [];
    cloned.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && (obj as THREE.Mesh).morphTargetDictionary) {
        found.push(obj as THREE.Mesh);
      }
    });
    return found;
  }, [cloned]);

  useEffect(() => {
    cloned.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      mesh.frustumCulled = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((mat) => {
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          mat.transparent = false;
          mat.opacity = 1;
          mat.metalness = 0;
          mat.roughness = 0.55;
          mat.color.set("#d4a574");
          mat.needsUpdate = true;
        }
      });
    });

    const loader = new THREE.TextureLoader();
    loader.load(
      AVA_TEST_TEXTURE_PATH,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false;
        texture.needsUpdate = true;
        cloned.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh || !mesh.material) return;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((mat) => {
            if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
              mat.map = texture;
              mat.color.set("#ffffff");
              mat.needsUpdate = true;
            }
          });
        });
        setTexReady(true);
      },
      undefined,
      () => {
        // Texture optionnelle — le mesh reste visible sans map
        setTexReady(false);
      }
    );
  }, [cloned]);

  const isSpeaking = state === "speaking";

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    meshes.forEach((mesh) => {
      const dict = mesh.morphTargetDictionary;
      const inf = mesh.morphTargetInfluences;
      if (!dict || !inf) return;
      setMorph(dict, inf, MORPH.mouthOpen, isSpeaking ? lipSync.mouthOpen : 0);
      setMorph(dict, inf, MORPH.smile, isSpeaking ? lipSync.smile + 0.08 : 0.02);
      setMorph(dict, inf, MORPH.blinkL, blink);
      setMorph(dict, inf, MORPH.blinkR, blink);
    });

    if (groupRef.current) {
      groupRef.current.position.y = MODEL_TRANSFORM.position[1] + Math.sin(t * 1.05) * 0.008;
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        lookX * 0.12,
        0.06
      );
      groupRef.current.rotation.x = THREE.MathUtils.lerp(
        groupRef.current.rotation.x,
        -lookY * 0.06,
        0.06
      );
    }
  });

  return (
    <group
      ref={groupRef}
      position={MODEL_TRANSFORM.position}
      scale={MODEL_TRANSFORM.scale}
      userData={{ texReady }}
    >
      <Center>
        <primitive object={cloned} rotation={MODEL_TRANSFORM.rotation} />
      </Center>
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

useGLTF.preload(AVA_TEST_MODEL_PATH);
