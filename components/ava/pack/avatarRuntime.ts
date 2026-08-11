/**
 * Runtime Three.js Ava — pack Cursor (GLB meshopt + textures PBR explicites).
 * Import dynamique uniquement depuis un composant client (jamais SSR).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { PackViseme, PackVisemeKeyframe } from "@/lib/ava/pack-lipsync";

export const AVA_PACK_MODEL = "/assets/ava/avatar.glb";
export const AVA_PACK_COLOR = "/assets/ava/avatar-color.jpg";
export const AVA_PACK_NORMAL = "/assets/ava/avatar-normal.jpg";
export const AVA_PACK_MATERIAL = "/assets/ava/avatar-material.jpg";

export type AvaPackRuntime = {
  start: number;
  timeline: PackVisemeKeyframe[];
  speaking: boolean;
};

type FacialUniforms = {
  open: { value: number };
  wide: { value: number };
  round: { value: number };
  blink: { value: number };
  breathe: { value: number };
};

const NEUTRAL: PackViseme = { open: 0, wide: 0, round: 0 };

export function mountAvatar(
  canvas: HTMLCanvasElement,
  runtime: MutableRefObject<AvaPackRuntime>,
  setLoaded: Dispatch<SetStateAction<boolean>>,
  setWebgl: Dispatch<SetStateAction<boolean>>,
  setLevel: Dispatch<SetStateAction<number>>,
  options?: { enableOrbit?: boolean }
): () => void {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch {
    setWebgl(false);
    setLoaded(true);
    return () => {};
  }

  const enableOrbit = options?.enableOrbit ?? false;
  const parent = canvas.parentElement;
  const sizeOf = () => {
    const w = Math.max(1, parent?.clientWidth || window.innerWidth);
    const h = Math.max(1, parent?.clientHeight || window.innerHeight);
    return { w, h };
  };

  let { w, h } = sizeOf();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#05070d");
  scene.fog = new THREE.FogExp2("#05070d", 0.7);

  const camera = new THREE.PerspectiveCamera(30, w / h, 0.01, 20);
  camera.position.set(0, 0.6, 2.05);

  let controls: OrbitControls | null = null;
  if (enableOrbit) {
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 1.05;
    controls.maxDistance = 3.1;
    controls.target.set(0, 0.56, 0);
  } else {
    camera.lookAt(0, 0.56, 0);
  }

  scene.add(new THREE.HemisphereLight("#b9d9ff", "#081020", 2.4));
  const key = new THREE.DirectionalLight("#fff1e5", 4.8);
  key.position.set(-1.6, 2.2, 2.4);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#247dff", 5.5);
  rim.position.set(2, 1.2, -1.2);
  scene.add(rim);

  const tl = new THREE.TextureLoader();
  const maxA = renderer.capabilities.getMaxAnisotropy();

  const color = tl.load(AVA_PACK_COLOR);
  color.colorSpace = THREE.SRGBColorSpace;
  color.flipY = false;
  color.anisotropy = maxA;

  const normal = tl.load(AVA_PACK_NORMAL);
  normal.flipY = false;
  normal.anisotropy = maxA;

  const pbr = tl.load(AVA_PACK_MATERIAL);
  pbr.flipY = false;
  pbr.anisotropy = maxA;

  const facial: FacialUniforms = {
    open: { value: 0 },
    wide: { value: 0 },
    round: { value: 0 },
    blink: { value: 0 },
    breathe: { value: 0 },
  };

  let avatar: THREE.Object3D | null = null;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(
    AVA_PACK_MODEL,
    (gltf) => {
      avatar = gltf.scene;
      avatar.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const src = mesh.material as THREE.MeshStandardMaterial;
        const m = src.clone();
        m.map = color;
        m.normalMap = normal;
        m.roughnessMap = pbr;
        m.metalnessMap = pbr;
        m.color.set(0xffffff);
        // Réglages PBR du pack validé (peau mate + maps explicites)
        m.roughness = 0.82;
        m.metalness = 0.22;
        m.normalScale.set(0.72, 0.72);
        m.envMapIntensity = 0.4;
        m.onBeforeCompile = (shader) => {
          Object.assign(shader.uniforms, {
            uMouthOpen: facial.open,
            uMouthWide: facial.wide,
            uMouthRound: facial.round,
            uBlink: facial.blink,
            uBreathe: facial.breathe,
          });
          shader.vertexShader = shader.vertexShader
            .replace(
              "#include <common>",
              `#include <common>
uniform float uMouthOpen;
uniform float uMouthWide;
uniform float uMouthRound;
uniform float uBlink;
uniform float uBreathe;
float softRegion(vec3 p,vec3 c,vec3 r){
  vec3 q=(p-c)/r;
  return 1.0-smoothstep(.72,1.0,dot(q,q));
}`
            )
            .replace(
              "#include <begin_vertex>",
              `#include <begin_vertex>
float mouth=softRegion(position,vec3(0.,-.073,.438),vec3(.214,.106,.132));
float lowerLip=mouth*(1.0-smoothstep(-.073,-.020,position.y));
float upperLip=mouth*smoothstep(-.073,-.020,position.y);
transformed.y-=lowerLip*uMouthOpen*.060;
transformed.y+=upperLip*uMouthOpen*.024;
transformed.x*=1.0+mouth*uMouthWide*.050;
transformed.x*=1.0-mouth*uMouthRound*.075;
transformed.z+=mouth*uMouthOpen*.014;
float eyes=max(
  softRegion(position,vec3(-.151,.192,.418),vec3(.149,.061,.112)),
  softRegion(position,vec3(.151,.192,.418),vec3(.149,.061,.112))
);
transformed.y+=eyes*uBlink*(.192-position.y)*.92;
transformed.z-=eyes*uBlink*.008;
float chest=(1.0-smoothstep(-.84,-.42,position.y))*smoothstep(-.45,.37,position.z);
transformed.z+=chest*uBreathe*.005;`
            );
        };
        m.customProgramCacheKey = () => "ava-pack-face-v3";
        m.needsUpdate = true;
        mesh.material = m;
        mesh.frustumCulled = false;
      });
      scene.add(avatar);
      setLoaded(true);
    },
    undefined,
    () => {
      setWebgl(false);
      setLoaded(true);
    }
  );

  let current = { ...NEUTRAL };
  let target = { ...NEUTRAL };
  let nextBlink = 1.7;
  let blinkStart = -1;
  let last = performance.now();
  let frame = 0;
  const clock = new THREE.Clock();

  const animate = () => {
    frame = requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    const time = clock.getElapsedTime();

    if (runtime.current.speaking) {
      const elapsed = now - runtime.current.start;
      target =
        runtime.current.timeline.find(
          (v) => elapsed >= v.start && elapsed < v.end
        ) || NEUTRAL;
    } else {
      target = NEUTRAL;
    }

    const response = 1 - Math.exp(-dt * 19);
    (["open", "wide", "round"] as const).forEach((k) => {
      current[k] = THREE.MathUtils.lerp(current[k], target[k], response);
      facial[k].value = current[k];
    });
    setLevel(Math.round(current.open * 100));

    if (time > nextBlink && blinkStart < 0) blinkStart = time;
    if (blinkStart >= 0) {
      const p = (time - blinkStart) / 0.19;
      facial.blink.value =
        p < 0.42
          ? THREE.MathUtils.smootherstep(p / 0.42, 0, 1)
          : 1 - THREE.MathUtils.smootherstep((p - 0.42) / 0.58, 0, 1);
      if (p >= 1) {
        blinkStart = -1;
        nextBlink = time + 2.4 + Math.random() * 3.8;
        facial.blink.value = 0;
      }
    }

    facial.breathe.value = Math.sin(time * 1.35);
    if (avatar) {
      avatar.rotation.y = Math.sin(time * 0.32) * 0.012;
      avatar.rotation.x = Math.sin(time * 0.21) * 0.004;
    }

    controls?.update();
    renderer.render(scene, camera);
  };
  animate();

  const resize = () => {
    ({ w, h } = sizeOf());
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  window.addEventListener("resize", resize);

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", resize);
    controls?.dispose();
    renderer.dispose();
    color.dispose();
    normal.dispose();
    pbr.dispose();
  };
}
