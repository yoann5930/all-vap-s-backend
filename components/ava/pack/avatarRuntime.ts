/**
 * Runtime Three.js Ava — cadrage vendeuse (tête+épaules), lip-sync & blink renforcés.
 * Import dynamique uniquement depuis un composant client (jamais SSR).
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { PackViseme } from "@/lib/ava/pack-lipsync";
import { sampleVisemeAt } from "@/lib/ava/pack-lipsync";
import type { AvaPackRuntime } from "./avaPackTypes";

export type { AvaPackRuntime } from "./avaPackTypes";

export const AVA_PACK_MODEL = "/assets/ava/avatar.glb";
export const AVA_PACK_COLOR = "/assets/ava/avatar-color.jpg";
export const AVA_PACK_NORMAL = "/assets/ava/avatar-normal.jpg";
export const AVA_PACK_MATERIAL = "/assets/ava/avatar-material.jpg";

type FacialUniforms = {
  open: { value: number };
  wide: { value: number };
  round: { value: number };
  blink: { value: number };
  breathe: { value: number };
};

const NEUTRAL: PackViseme = { open: 0, wide: 0, round: 0 };

/** Cadrage « face à une vendeuse » — tête + épaules dominent l’écran. */
function applySalesFloorFraming(
  camera: THREE.PerspectiveCamera,
  aspect: number
) {
  const isPortrait = aspect < 0.85;
  camera.fov = isPortrait ? 34 : 30;
  // Plus près : visage plein cadre (pas un buste lointain)
  const dist = isPortrait ? 1.08 : 1.22;
  const lookY = isPortrait ? 0.7 : 0.68;
  camera.position.set(0, lookY + 0.02, dist);
  camera.lookAt(0, lookY, 0);
  camera.updateProjectionMatrix();
}

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
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#05070d");
  // Fog plus lointain pour ne pas « miniaturiser » le visage
  scene.fog = new THREE.FogExp2("#05070d", 0.35);

  const camera = new THREE.PerspectiveCamera(30, w / h, 0.01, 20);
  applySalesFloorFraming(camera, w / h);

  let controls: OrbitControls | null = null;
  if (enableOrbit) {
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 0.85;
    controls.maxDistance = 2.2;
    controls.target.set(0, 0.68, 0);
  }

  scene.add(new THREE.HemisphereLight("#c8dcf5", "#0a1018", 2.1));
  const key = new THREE.DirectionalLight("#fff4ea", 4.2);
  key.position.set(-1.2, 2.0, 2.0);
  scene.add(key);
  const fill = new THREE.DirectionalLight("#dce8f8", 1.4);
  fill.position.set(1.6, 1.0, 1.4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight("#3a6cff", 3.2);
  rim.position.set(1.8, 1.1, -1.4);
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
      // Agrandit légèrement pour remplir le cadre « vendeuse »
      avatar.scale.setScalar(1.28);
      avatar.position.y = -0.02;

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
  return 1.0-smoothstep(.68,1.0,dot(q,q));
}`
            )
            .replace(
              "#include <begin_vertex>",
              `#include <begin_vertex>
// Bouche — amplitudes renforcées (lisible en conversation)
float mouth=softRegion(position,vec3(0.,-.073,.438),vec3(.222,.118,.145));
float lowerLip=mouth*(1.0-smoothstep(-.073,-.018,position.y));
float upperLip=mouth*smoothstep(-.073,-.018,position.y);
float jaw=mouth*smoothstep(-.14,-.04,position.y)* (1.0-smoothstep(-.04,.04,position.y));
transformed.y-=lowerLip*uMouthOpen*.118;
transformed.y+=upperLip*uMouthOpen*.052;
transformed.y-=jaw*uMouthOpen*.028;
transformed.x*=1.0+mouth*uMouthWide*.095;
transformed.x*=1.0-mouth*uMouthRound*.125;
transformed.z+=mouth*uMouthOpen*.032;
// Yeux — clignement plus marqué
float eyes=max(
  softRegion(position,vec3(-.151,.192,.418),vec3(.155,.072,.125)),
  softRegion(position,vec3(.151,.192,.418),vec3(.155,.072,.125))
);
transformed.y+=eyes*uBlink*(.192-position.y)*1.45;
transformed.z-=eyes*uBlink*.022;
float chest=(1.0-smoothstep(-.84,-.42,position.y))*smoothstep(-.45,.37,position.z);
transformed.z+=chest*uBreathe*.006;`
            );
        };
        m.customProgramCacheKey = () => "ava-pack-face-v5-salesfloor";
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
  let nextBlink = 1.1;
  let blinkStart = -1;
  let doubleBlink = false;
  let last = performance.now();
  let frame = 0;
  const clock = new THREE.Clock();
  let wasSpeaking = false;

  const animate = () => {
    frame = requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    const time = clock.getElapsedTime();
    const speaking = runtime.current.speaking;

    if (speaking) {
      const elapsed = now - runtime.current.start;
      target = sampleVisemeAt(runtime.current.timeline, elapsed);
      // Micro-pulse pour éviter une bouche « figée » entre phonèmes
      const pulse = 0.04 + Math.abs(Math.sin(time * 11.5)) * 0.05;
      target = {
        open: Math.min(1, target.open + pulse * (target.open > 0.08 ? 0.35 : 1)),
        wide: target.wide,
        round: target.round,
      };
    } else {
      target = NEUTRAL;
    }

    // Ouverture rapide, fermeture un peu plus douce
    const openSpeed = target.open > current.open ? 28 : 16;
    const otherSpeed = 22;
    current.open = THREE.MathUtils.lerp(
      current.open,
      target.open,
      1 - Math.exp(-dt * openSpeed)
    );
    current.wide = THREE.MathUtils.lerp(
      current.wide,
      target.wide,
      1 - Math.exp(-dt * otherSpeed)
    );
    current.round = THREE.MathUtils.lerp(
      current.round,
      target.round,
      1 - Math.exp(-dt * otherSpeed)
    );
    facial.open.value = current.open;
    facial.wide.value = current.wide;
    facial.round.value = current.round;
    setLevel(Math.round(current.open * 100));

    // Clignement : rythme naturel + double clignement + à la fin de parole
    if (wasSpeaking && !speaking && blinkStart < 0) {
      blinkStart = time;
      doubleBlink = Math.random() < 0.35;
    }
    wasSpeaking = speaking;

    const blinkGapBase = speaking ? 2.1 : 1.7;
    if (time > nextBlink && blinkStart < 0) {
      blinkStart = time;
      doubleBlink = Math.random() < 0.22;
    }
    if (blinkStart >= 0) {
      const dur = 0.16;
      const p = (time - blinkStart) / dur;
      facial.blink.value =
        p < 0.38
          ? THREE.MathUtils.smootherstep(p / 0.38, 0, 1)
          : 1 - THREE.MathUtils.smootherstep((p - 0.38) / 0.62, 0, 1);
      if (p >= 1) {
        if (doubleBlink) {
          doubleBlink = false;
          blinkStart = time + 0.04;
        } else {
          blinkStart = -1;
          nextBlink = time + blinkGapBase + Math.random() * (speaking ? 2.0 : 3.0);
          facial.blink.value = 0;
        }
      }
    }

    facial.breathe.value = Math.sin(time * 1.25);
    if (avatar) {
      // Micro-mouvements tête — présence humaine, pas une statue
      const listen = speaking ? 0.6 : 1;
      avatar.rotation.y = Math.sin(time * 0.28) * 0.018 * listen;
      avatar.rotation.x = Math.sin(time * 0.19) * 0.008 * listen;
      avatar.position.y = -0.02 + Math.sin(time * 1.25) * 0.004;
    }

    controls?.update();
    renderer.render(scene, camera);
  };
  animate();

  const resize = () => {
    ({ w, h } = sizeOf());
    camera.aspect = w / h;
    applySalesFloorFraming(camera, w / h);
    if (controls) controls.target.set(0, 0.68, 0);
    renderer.setSize(w, h, false);
  };
  window.addEventListener("resize", resize);
  // Recalage après layout immersif
  window.setTimeout(resize, 50);
  window.setTimeout(resize, 300);

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
