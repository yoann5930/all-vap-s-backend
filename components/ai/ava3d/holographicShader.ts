import * as THREE from "three";

export const holographicUniforms = {
  uTime: { value: 0 },
  uTexture: { value: null as THREE.Texture | null },
  uMouthOpen: { value: 0 },
  uSmile: { value: 0 },
  uOpacity: { value: 0.92 },
  uScanStrength: { value: 0.035 },
  uGlowColor: { value: new THREE.Color("#00d4ff") },
};

/** Déplacement vertex minimal — évite l’effet « visage décomposé » du mesh dense. */
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
    pos.z -= curve * 0.06;

    float mouthZone = smoothstep(0.54, 0.62, uv.y) * (1.0 - smoothstep(0.62, 0.70, uv.y));
    mouthZone *= 1.0 - abs(uv.x - 0.5) * 2.6;
    mouthZone = max(mouthZone, 0.0);
    vMouthMask = mouthZone;

    pos.z += mouthZone * uMouthOpen * 0.035;
    pos.y += mouthZone * uSmile * 0.008;

    pos.y += sin(uTime * 1.1 + uv.x * 2.0) * 0.0015;

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

    float mouthLift = vMouthMask * uMouthOpen * 0.012;
    uv.y += mouthLift;

    vec4 tex = texture2D(uTexture, uv);
    if (tex.a < 0.04 && tex.r + tex.g + tex.b < 0.05) discard;

    vec3 holo = tex.rgb;
    holo = mix(holo, holo * vec3(0.7, 0.96, 1.08), 0.35);
    holo += uGlowColor * 0.04;

    float scan = sin((uv.y + uTime * 0.06) * 280.0) * uScanStrength;
    holo += scan;

    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 2.8);
    holo += uGlowColor * fresnel * 0.28;

    float mouthGlow = vMouthMask * uMouthOpen * 0.06;
    holo += uGlowColor * mouthGlow;

    float alpha = uOpacity * (0.78 + fresnel * 0.22);
    alpha *= smoothstep(0.02, 0.1, tex.a + length(tex.rgb) * 0.15);

    gl_FragColor = vec4(holo, alpha);
  }
`;
