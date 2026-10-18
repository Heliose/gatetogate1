import * as THREE from 'three';
import { TIME } from './materials.js';

/* Sky dome: gradient, sun disc + glow, stars, a small moon. Always at the far plane. */
export function createSky() {
  const U = {
    uTop: { value: new THREE.Color('#2f6fcc') },
    uHorizon: { value: new THREE.Color('#d9e6f2') },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color('#fff4e6') },
    uSunI: { value: 1 },
    uStars: { value: 0 },
    uMoonDir: { value: new THREE.Vector3(-0.4, 0.7, 0.35).normalize() },
    uMoonI: { value: 0 },
    uHaze: { value: 0.5 },
    uTime: TIME.uTime,
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uTop, uHorizon, uSunDir, uSunColor, uMoonDir;
      uniform float uSunI, uStars, uMoonI, uHaze, uTime;
      float hash3(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.45 + uHaze * 0.3));
        col = mix(col, uHorizon * 0.5, smoothstep(0.0, -0.25, h));
        float s = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (pow(s, 6.0) * 0.18 + pow(s, 48.0) * 0.5) * uSunI * (0.6 + uHaze * 0.8);
        col += uSunColor * smoothstep(0.99955, 0.99985, s) * 22.0 * uSunI;
        // stars
        float st = hash3(floor(d * 1100.0));
        float tw = 0.55 + 0.45 * sin(uTime * 2.0 + st * 120.0);
        col += vec3(0.9, 0.95, 1.0) * step(0.9993, st) * uStars * smoothstep(0.0, 0.2, h) * tw * 1.1;
        // moon
        float m = dot(d, uMoonDir);
        col += vec3(0.85, 0.9, 1.0) * smoothstep(0.99935, 0.99965, m) * 4.0 * uMoonI;
        col += vec3(0.45, 0.55, 0.85) * pow(max(m, 0.0), 40.0) * 0.18 * uMoonI;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(2400, 48, 24), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  mesh.userData.noDepth = true;
  mesh.userData.noPick = true;
  return { mesh, U };
}
