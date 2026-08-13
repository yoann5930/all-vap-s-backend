"use client";

/**
 * Avatar GLB A.V.A. — conserve les matériaux / textures embarqués du modèle.
 * Ne jamais écraser les maps UV par une texture plate unique (cause du visage déformé).
 */
import { useFrame } from "@react-three/fiber";
import { useGLTF, Center } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { AvaLipSyncValues } from "@/hooks/useAvaLipSync";
import type { AvaConversationState } from "@/hooks/useVoiceConversation";
import { AVA_3D_ROADMAP } from "@/lib/ai/ava-constants";

/** GLB non compressé — fiable sans Meshopt decoder */
export const AVA_MODEL_PATH = AVA_3D_ROADMAP.modelPath;

/** @deprecated chemins historiques */
export const AVA_TEST_MODEL_PATH = AVA_MODEL_PATH;
export const AVA_TEST_TEXTURE_PATH = "/models/ava/ava-hologram-texture.png";
export const AVA_LEGACY_TEST_MODEL_PATH = "/models/ava/ava-test-model.glb";

const MODEL_TRANSFORM = {
  position: [0, -0.02, 0] as [number, number, number],
  rotation: [0, 0, 0] as [number, number, number],
  scale: 1,
};

const MORPH = {
  blinkL: ["blinkLeft"],
  blinkR: ["blinkRight"],
  smile: ["expressionSmile"],
  concern: ["expressionConcern"],
  browUp: ["browUp"],
  browDown: ["browDown"],
  jawOpen: ["jawOpen"],
  oralReveal: ["oralReveal"],
};

const VISEMES = ["AA", "E", "I", "O", "U", "MBP", "FV", "L", "CH", "RR"] as const;

interface AvaGltfAvatarProps {
  state: AvaConversationState;
  lipSync: AvaLipSyncValues;
  lookX: number;
  lookY: number;
  blink: number;
}

export function AvaGltfAvatar({ state, lipSync, lookX, lookY, blink }: AvaGltfAvatarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const jawBoneRef = useRef<THREE.Bone | null>(null);
  const leftEyeBoneRef = useRef<THREE.Bone | null>(null);
  const rightEyeBoneRef = useRef<THREE.Bone | null>(null);
  const jawRestRef = useRef(new THREE.Quaternion());
  const leftEyeRestRef = useRef(new THREE.Quaternion());
  const rightEyeRestRef = useRef(new THREE.Quaternion());
  const { scene } = useGLTF(AVA_MODEL_PATH);

  const cloned = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      mesh.frustumCulled = false;
      // Clone materials so we never mutate the GLTF cache
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((m) => m.clone());
      } else {
        mesh.material = mesh.material.clone();
      }
    });
    return root;
  }, [scene]);

  useEffect(() => {
    cloned.traverse((object) => {
      const bone = object as THREE.Bone;
      if (!bone.isBone) return;
      if (bone.name === "Jaw") {
        jawBoneRef.current = bone;
        jawRestRef.current.copy(bone.quaternion);
      } else if (bone.name === "Eye.L" || bone.name === "EyeL") {
        leftEyeBoneRef.current = bone;
        leftEyeRestRef.current.copy(bone.quaternion);
      } else if (bone.name === "Eye.R" || bone.name === "EyeR") {
        rightEyeBoneRef.current = bone;
        rightEyeRestRef.current.copy(bone.quaternion);
      }
    });
  }, [cloned]);

  const morphMeshes = useMemo(() => {
    const found: THREE.Mesh[] = [];
    cloned.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
        found.push(mesh);
      }
    });
    return found;
  }, [cloned]);

  useEffect(() => {
    cloned.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((mat) => {
        if (
          mat instanceof THREE.MeshStandardMaterial ||
          mat instanceof THREE.MeshPhysicalMaterial
        ) {
          // Teinte holo légère — ne touche JAMAIS map / normalMap / UV
          if (!mat.map) {
            mat.emissive = new THREE.Color("#003848");
            mat.emissiveIntensity = 0.15;
          } else {
            mat.emissive = new THREE.Color("#001820");
            mat.emissiveIntensity = 0.08;
          }
          mat.metalness = Math.min(mat.metalness, 0.25);
          mat.roughness = Math.max(mat.roughness, 0.35);
          mat.side = THREE.FrontSide;
          mat.needsUpdate = true;
        }
      });
    });
  }, [cloned]);

  const isSpeaking = state === "speaking";
  const isListening = state === "listening";

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    const mouth = isSpeaking ? lipSync.mouthOpen : 0;
    const activeViseme = isSpeaking ? lipSync.visemeName : "REST";
    const smile = isSpeaking ? 0.1 + lipSync.smile * 0.18 : isListening ? 0.07 : 0.045;
    const concern = state === "thinking" ? 0.08 : 0;

    morphMeshes.forEach((mesh) => {
      const dict = mesh.morphTargetDictionary!;
      const inf = mesh.morphTargetInfluences!;
      for (const viseme of VISEMES) {
        dampMorph(dict, inf, [`viseme_${viseme}`], activeViseme === viseme ? 1 : 0, 24, delta);
      }
      dampMorph(dict, inf, MORPH.jawOpen, mouth * 0.14, 19, delta);
      dampMorph(dict, inf, MORPH.oralReveal, activeViseme !== "REST" && activeViseme !== "MBP" ? 1 : 0, 22, delta);
      dampMorph(dict, inf, MORPH.smile, smile, 9, delta);
      dampMorph(dict, inf, MORPH.concern, concern, 9, delta);
      dampMorph(dict, inf, MORPH.browUp, isListening ? 0.08 : 0.035, 8, delta);
      dampMorph(dict, inf, MORPH.browDown, state === "thinking" ? 0.045 : 0, 8, delta);
      dampMorph(dict, inf, MORPH.blinkL, blink, 30, delta);
      dampMorph(dict, inf, MORPH.blinkR, blink, 30, delta);
    });

    const jawBone = jawBoneRef.current;
    if (jawBone) {
      const jawDelta = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        -mouth * 0.075
      );
      jawBone.quaternion.copy(jawRestRef.current).multiply(jawDelta);
    }

    const gaze = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-lookY * 0.035, lookX * 0.06, 0, "XYZ")
    );
    if (leftEyeBoneRef.current) {
      leftEyeBoneRef.current.quaternion.copy(leftEyeRestRef.current).multiply(gaze);
    }
    if (rightEyeBoneRef.current) {
      rightEyeBoneRef.current.quaternion.copy(rightEyeRestRef.current).multiply(gaze);
    }

    if (groupRef.current) {
      groupRef.current.position.y =
        MODEL_TRANSFORM.position[1] + Math.sin(t * 1.05) * 0.006;
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        lookX * 0.1,
        0.05
      );
      groupRef.current.rotation.x = THREE.MathUtils.lerp(
        groupRef.current.rotation.x,
        -lookY * 0.05,
        0.05
      );
    }
  });

  return (
    <group ref={groupRef} position={MODEL_TRANSFORM.position} scale={MODEL_TRANSFORM.scale}>
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

function dampMorph(
  dict: Record<string, number>,
  inf: number[],
  keys: string[],
  value: number,
  lambda: number,
  delta: number
) {
  for (const key of keys) {
    const idx = dict[key];
    if (idx !== undefined) {
      inf[idx] = THREE.MathUtils.damp(inf[idx] ?? 0, value, lambda, delta);
      return;
    }
  }
}

useGLTF.preload(AVA_MODEL_PATH);
