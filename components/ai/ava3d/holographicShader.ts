import * as THREE from "three";

export const holographicUniforms = {
  uTime: { value: 0 },
  uTexture: { value: null as THREE.Texture | null },
  uMouthOpen: { value: 0 },
  uSmile: { value: 0 },
  uOpacity: { value: 0.88 },
  uScanStrength: { value: 0.08 },
  uGlowColor: { value: new THREE.Color("#00d4ff") },
};

export const holographicVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uMouthOpen;
  uniform float uSmile;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying float vMouthMask;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);

    vec3 pos = position;

    float curve = pow(abs(uv.x - 0.5) * 2.0, 2.0);
    pos.z -= curve * 0.18;

    float mouthZone = smoothstep(0.52, 0.62, uv.y) * (1.0 - smoothstep(0.62, 0.72, uv.y));
    mouthZone *= 1.0 - abs(uv.x - 0.5) * 2.8;
    vMouthMask = mouthZone;

    pos.z += mouthZone * uMouthOpen * 0.09;
    pos.y += mouthZone * uSmile * 0.015;
    pos.x += (uv.x - 0.5) * mouthZone * uSmile * 0.012;

    pos.y += sin(uTime * 1.2 + uv.x * 3.0) * 0.003;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const holographicFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform sampler2D uTexture;
  uniform float uMouthOpen;
  uniform float uSmile;
  uniform float uOpacity;
  uniform float uScanStrength;
  uniform vec3 uGlowColor;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying float vMouthMask;

  void main() {
    vec2 uv = vUv;

    float mouthLift = vMouthMask * uMouthOpen * 0.035;
    uv.y += mouthLift;

    vec4 tex = texture2D(uTexture, uv);

    vec3 holo = tex.rgb;
    holo = mix(holo, holo * vec3(0.55, 0.95, 1.15), 0.72);
    holo += uGlowColor * 0.08;

    float scan = sin((uv.y + uTime * 0.08) * 420.0) * uScanStrength;
    holo += scan;

    float grid = step(0.92, fract(uv.x * 90.0)) * step(0.92, fract(uv.y * 110.0));
    holo += grid * 0.025 * uGlowColor;

    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 2.4);
    holo += uGlowColor * fresnel * 0.55;

    float mouthGlow = vMouthMask * uMouthOpen * 0.12;
    holo += uGlowColor * mouthGlow;

    float alpha = uOpacity * (0.55 + fresnel * 0.45);
    alpha *= smoothstep(0.02, 0.12, tex.a + tex.r * 0.2);

    gl_FragColor = vec4(holo, alpha);
  }
`;
