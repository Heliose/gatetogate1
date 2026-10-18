import * as THREE from 'three';
import { flatWhite, flatBump } from '../core/canvas.js';
import { grassTex, asphaltTex, concreteTex, taxiwayTex, runwayTex, apronTex, beltTex, cityTex, fanTex, hazardTex } from './textures.js';

/* ------------------------------------------------------------------ *
 * Shared materials and shader patches. Patched materials share
 * uniform objects by reference and set a cache key so each patch is
 * one program. Maps are always bound so defines never flip.
 * ------------------------------------------------------------------ */

export const TIME = { uTime: { value: 0 } };

/* ---------- x-ray (ground + airframe) ---------- */
export const makeXrayUniforms = (center = [0, -60], radius = 0, alpha = 0.16, tint = '#6fb7d8', rim = '#5ee7ff') => ({
  uXray: { value: 0 },
  uXrayCenter: { value: new THREE.Vector2(center[0], center[1]) },
  uXrayRadius: { value: radius },
  uXrayEdge: { value: 40 },
  uXrayAlpha: { value: alpha },
  uXrayTint: { value: new THREE.Color(tint) },
  uXrayRim: { value: new THREE.Color(rim) },
  uXrayGrid: { value: 1 },
  uXrayGridSize: { value: 10 },
});
export const XRAY = makeXrayUniforms([0, -60], 0, 0.16);
export const AIRX = makeXrayUniforms([135, -32], 400, 0.14, '#7ec8e8', '#8fe9ff');
AIRX.uXrayEdge.value = 0.01;
AIRX.uXrayGrid.value = 0;

const worldVarying = (shader, name) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\nvarying vec3 ${name};`)
    .replace('#include <project_vertex>', `#include <project_vertex>
      { vec4 wp_ = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp_ = instanceMatrix * wp_;
        #endif
        ${name} = (modelMatrix * wp_).xyz; }`);
};
const localVarying = (shader, name) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\nvarying vec3 ${name};`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${name} = position;`);
};

export function xrayPatch(mat, U = XRAY, { macro = null, key = 'xray' } = {}) {
  if (!mat.map) mat.map = flatWhite;
  const extra = macro ? { uMacro: { value: macro } } : {};
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, TIME, extra);
    worldVarying(shader, 'vXW');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vXW;
        uniform float uXray, uXrayRadius, uXrayEdge, uXrayAlpha, uXrayGrid, uXrayGridSize, uTime;
        uniform vec2 uXrayCenter; uniform vec3 uXrayTint, uXrayRim;
        ${macro ? 'uniform sampler2D uMacro;' : ''}
        float xin_; float xring_;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        ${macro ? 'diffuseColor.rgb *= mix(0.78, 1.18, texture2D(uMacro, vXW.xz / 380.0).r);' : ''}
        { float xd = distance(vXW.xz, uXrayCenter);
          xin_ = (1.0 - smoothstep(uXrayRadius - uXrayEdge, uXrayRadius, xd)) * uXray;
          xring_ = exp(-pow((xd - uXrayRadius) / (uXrayEdge * 0.3 + 0.5), 2.0)) * uXray * step(0.01, uXrayRadius);
          diffuseColor.rgb = mix(diffuseColor.rgb, uXrayTint, xin_ * 0.55);
          diffuseColor.a *= mix(1.0, uXrayAlpha, xin_); }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.12, xin_);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float gx = smoothstep(0.47, 0.5, abs(fract(vXW.x / uXrayGridSize) - 0.5));
          float gz = smoothstep(0.47, 0.5, abs(fract(vXW.z / uXrayGridSize) - 0.5));
          float grid = max(gx, gz) * uXrayGrid;
          float fres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
          float sweep = 0.5 + 0.5 * sin(vXW.z * 0.08 - uTime * 2.5);
          totalEmissiveRadiance += uXrayRim * (xring_ * 2.6 + xin_ * (grid * 0.22 + fres * 0.45 + 0.03 + sweep * 0.03)); }`);
  };
  mat.customProgramCacheKey = () => key + (macro ? '-macro' : '');
  mat.userData.xray = true;
  return mat;
}

/* ---------- flow pulses along tubes (u = metres along the path) ---------- */
export function flowMaterial({ color = '#5ee7ff', speed = 10, spacing = 12, intensity = 1, roughness = 0.45, metalness = 0.3, opacity = 1 } = {}) {
  const U = {
    uFlowColor: { value: new THREE.Color(color) },
    uFlowSpeed: { value: speed },
    uFlowSpacing: { value: spacing },
    uFlowI: { value: intensity },
  };
  const c = new THREE.Color(color);
  const mat = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.35), roughness, metalness, map: flatWhite, transparent: opacity < 1, opacity, depthWrite: opacity >= 0.99 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, TIME);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uFlowColor; uniform float uFlowSpeed, uFlowSpacing, uFlowI, uTime;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float fp = fract(vMapUv.x / uFlowSpacing - uTime * uFlowSpeed / uFlowSpacing);
          float pulse = smoothstep(0.0, 0.32, fp) * smoothstep(0.62, 0.4, fp);
          totalEmissiveRadiance += uFlowColor * (0.14 + pulse * 2.6) * uFlowI; }`);
  };
  mat.customProgramCacheKey = () => 'flow-v1';
  mat.userData.flow = U;
  return mat;
}

/* ---------- hangar scan sweep (local z from tail to nose) ---------- */
export const SCAN = {
  uScan: { value: 0 },
  uScanZ0: { value: -19 },
  uScanZ1: { value: 19 },
  uScanColor: { value: new THREE.Color('#5ee7ff') },
  uScanOn: { value: 0 },
};
export function scanPatch(mat, U = SCAN) {
  if (!mat.map) mat.map = flatWhite;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, TIME);
    localVarying(shader, 'vSL');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vSL; uniform float uScan, uScanZ0, uScanZ1, uScanOn, uTime; uniform vec3 uScanColor;
        float hexDist_(vec2 p){ p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.732))), p.x); }
        float hexGrid_(vec2 uv){ vec2 r = vec2(1.0, 1.732); vec2 h = r * 0.5; vec2 a = mod(uv, r) - h; vec2 b = mod(uv - h, r) - h;
          vec2 gv = dot(a, a) < dot(b, b) ? a : b; return smoothstep(0.4, 0.5, hexDist_(gv)); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float sz = mix(uScanZ0, uScanZ1, uScan);
          float line = exp(-pow((vSL.z - sz) / 0.35, 2.0));
          float scanned = 1.0 - smoothstep(sz - 0.3, sz + 0.3, vSL.z);
          float ang = atan(vSL.y - 3.6, vSL.x);
          float hg = hexGrid_(vec2(vSL.z * 0.9, ang * 3.0 + vSL.y * 0.4));
          float flick = 0.85 + 0.15 * sin(uTime * 9.0 + vSL.z * 2.0);
          totalEmissiveRadiance += uScanColor * (line * 3.2 + scanned * hg * 0.28 * flick) * uScanOn * step(0.001, uScan); }`);
  };
  mat.customProgramCacheKey = () => 'scan-v1';
  return mat;
}

/* ---------- engine: glass nacelle + thermal view ---------- */
export const ENGINE = {
  uThermal: { value: 0 },
  uGlass: { value: 0 },
  uGlassAlpha: { value: 0.18 },
  uTz0: { value: -2.6 }, // exhaust (local z)
  uTz1: { value: 2.2 }, // fan face
  uSpin: { value: 0 },
};
const THERMAL_GLSL = `
  vec3 thermalPalette_(float t) {
    vec3 c0 = vec3(0.03, 0.06, 0.45), c1 = vec3(0.05, 0.55, 0.9), c2 = vec3(0.2, 0.9, 0.35), c3 = vec3(1.0, 0.85, 0.15), c4 = vec3(1.0, 0.35, 0.05), c5 = vec3(1.0, 0.98, 0.9);
    vec3 c = mix(c0, c1, smoothstep(0.0, 0.2, t));
    c = mix(c, c2, smoothstep(0.2, 0.4, t));
    c = mix(c, c3, smoothstep(0.4, 0.6, t));
    c = mix(c, c4, smoothstep(0.6, 0.8, t));
    c = mix(c, c5, smoothstep(0.8, 1.0, t));
    return c;
  }
  float engineTemp_(float tz, float rad) {
    // tz: 1 at the fan face, 0 at the exhaust
    float t = 0.08;
    t = mix(t, 0.22, smoothstep(0.95, 0.8, tz));   // LPC
    t = mix(t, 0.45, smoothstep(0.72, 0.56, tz));  // HPC
    t = mix(t, 1.0, smoothstep(0.52, 0.42, tz) * (1.0 - smoothstep(0.42, 0.33, tz)) );  // combustor
    t = mix(t, 0.8, smoothstep(0.42, 0.32, tz));   // HPT
    t = mix(t, 0.58, smoothstep(0.3, 0.16, tz));   // LPT
    t = mix(t, 0.42, smoothstep(0.16, 0.0, tz));   // exhaust
    t += (0.5 - rad) * 0.12;
    return clamp(t, 0.0, 1.0);
  }`;
export function thermalPatch(mat, { glass = false } = {}) {
  if (!mat.map) mat.map = flatWhite;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ENGINE, TIME);
    localVarying(shader, 'vEL');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vEL; uniform float uThermal, uGlass, uGlassAlpha, uTz0, uTz1, uTime;
        ${THERMAL_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        ${glass ? 'diffuseColor.a *= mix(1.0, uGlassAlpha, uGlass);' : ''}`)
      .replace('#include <opaque_fragment>', `
        { float tz = clamp((vEL.z - uTz0) / (uTz1 - uTz0), 0.0, 1.0);
          float rad = clamp(length(vEL.xy) / 1.1, 0.0, 1.0);
          float temp = engineTemp_(tz, rad);
          float shimmer = 0.94 + 0.06 * sin(uTime * 5.0 + vEL.z * 6.0 + rad * 10.0);
          vec3 therm = thermalPalette_(temp) * (0.7 + temp * 1.1) * shimmer;
          outgoingLight = mix(outgoingLight, therm, uThermal);
          ${glass ? 'diffuseColor.a = mix(diffuseColor.a, 0.08 + temp * 0.2, uThermal * uGlass);' : ''} }
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'thermal-v1' + (glass ? '-g' : '');
  return mat;
}

/* ---------- dissolve (tower → ops room) ---------- */
export const DISSOLVE = { uDissolve: { value: 0 }, uDissolveColor: { value: new THREE.Color('#5ee7ff') } };
export function dissolvePatch(mat, U = DISSOLVE) {
  if (!mat.map) mat.map = flatWhite;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, TIME);
    worldVarying(shader, 'vDW');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vDW; uniform float uDissolve, uTime; uniform vec3 uDissolveColor;
        float hash3_(vec3 p){ p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float vnoise_(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash3_(i), hash3_(i + vec3(1,0,0)), f.x), mix(hash3_(i + vec3(0,1,0)), hash3_(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash3_(i + vec3(0,0,1)), hash3_(i + vec3(1,0,1)), f.x), mix(hash3_(i + vec3(0,1,1)), hash3_(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float dn_ = vnoise_(vDW * 0.9) * 0.6 + vnoise_(vDW * 3.1) * 0.4;
        if (dn_ < uDissolve) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float edge = 1.0 - smoothstep(uDissolve, uDissolve + 0.09, dn_);
          totalEmissiveRadiance += uDissolveColor * edge * 3.0 * step(0.001, uDissolve); }`);
  };
  mat.customProgramCacheKey = () => 'dissolve-v1';
  return mat;
}

/* ---------- hologram (digital twin) ---------- */
export function hologramMaterial(color = '#b48cff') {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0.8 },
      uReveal: { value: 1 },
      uZ0: { value: -20 },
      uZ1: { value: 20 },
      uFlag: { value: 0 },
      uTime: TIME.uTime,
    },
    vertexShader: /* glsl */ `
      varying vec3 vN, vW, vL;
      void main() {
        vL = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vN, vW, vL;
      uniform vec3 uColor; uniform float uOpacity, uReveal, uZ0, uZ1, uFlag, uTime;
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - abs(dot(normalize(vN), V)), 2.2);
        float scan = 0.6 + 0.4 * sin(vW.y * 18.0 - uTime * 5.0);
        float sz = mix(uZ0, uZ1, uReveal);
        float reveal = 1.0 - smoothstep(sz - 0.4, sz + 0.4, vL.z);
        float edge = exp(-pow((vL.z - sz) / 0.5, 2.0)) * 2.5 * step(0.001, uReveal) * (1.0 - step(0.999, uReveal));
        float flick = 0.92 + 0.08 * sin(uTime * 23.0 + vW.x * 3.0);
        float a = (0.07 + fres * 0.85) * scan * reveal * uOpacity * flick + edge * uOpacity;
        vec3 col = mix(uColor, vec3(1.0, 0.3, 0.22), uFlag);
        col *= 1.0 + uFlag * (0.6 + 0.6 * sin(uTime * 7.0));
        gl_FragColor = vec4(col * a * 2.2, a);
      }`,
  });
  mat.userData.noDepth = true;
  return mat;
}

/* ---------- beacons & strobes: shared, flash in the shader ---------- */
export function beaconMaterial(color = '#ff3b2f', rate = 1.1) {
  const mat = new THREE.MeshStandardMaterial({ color: '#2a0a08', emissive: color, emissiveIntensity: 1, roughness: 0.4, map: flatWhite });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, TIME);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= 0.2 + 5.5 * pow(0.5 + 0.5 * sin(uTime * ${(rate * 6.283).toFixed(3)}), 10.0);`);
  };
  mat.customProgramCacheKey = () => 'beacon-' + rate;
  return mat;
}

/* ---------- the shared table ---------- */
export function createMaterials() {
  const std = (color, rough = 0.6, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const grass = grassTex(), asphalt = asphaltTex(), concrete = concreteTex(), taxi = taxiwayTex(), runway = runwayTex(), apron = apronTex();
  const macro = concreteTex('macro', '#8c8c8c', '#5c5c5c', '#c0c0c0', 1);
  const city = cityTex();
  const M = {
    // ground (x-ray able)
    grass: xrayPatch(std('#ffffff', 0.95, 0, { map: grass }), XRAY, { macro, key: 'xray-ground' }),
    runway: xrayPatch(std('#ffffff', 0.9, 0, { map: runway, bumpMap: asphalt.userData.bump, bumpScale: 0.6 }), XRAY, { key: 'xray-ground' }),
    taxiway: xrayPatch(std('#ffffff', 0.9, 0, { map: taxi, bumpMap: concrete.userData.bump, bumpScale: 0.4 }), XRAY, { key: 'xray-ground' }),
    apron: xrayPatch(std('#ffffff', 0.88, 0, { map: apron, bumpMap: concrete.userData.bump, bumpScale: 0.4 }), XRAY, { key: 'xray-ground' }),
    concrete: xrayPatch(std('#ffffff', 0.9, 0, { map: concrete, bumpMap: concrete.userData.bump, bumpScale: 0.4 }), XRAY, { key: 'xray-ground' }),
    terminalWall: xrayPatch(std('#d9dde2', 0.7, 0.05, { map: flatWhite }), XRAY, { key: 'xray-ground' }),
    terminalFloor: xrayPatch(std('#c8ccd1', 0.5, 0.02, { map: flatWhite }), XRAY, { key: 'xray-ground' }),
    roof: xrayPatch(std('#b9bfc6', 0.8, 0.1, { map: flatWhite }), XRAY, { key: 'xray-ground' }),
    earth: std('#07090d', 1, 0),
    vcolor: std('#ffffff', 0.7, 0, { vertexColors: true }),
    // buildings
    glass: std('#9fc3dc', 0.08, 0.2, { transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.4 }),
    glassDark: std('#223040', 0.08, 0.4, { transparent: true, opacity: 0.7, depthWrite: false, envMapIntensity: 1.6 }),
    steel: std('#b8bec6', 0.35, 0.85),
    steelDark: std('#3c4249', 0.5, 0.7),
    white: std('#eef0f2', 0.6, 0.05),
    paintDark: std('#262a30', 0.55, 0.2),
    basement: std('#6c7076', 0.9, 0.02, { map: concreteTex('base', '#6c7076', '#4e5257', '#8a8f95', 1) }),
    hangarWall: std('#8f969e', 0.8, 0.15),
    hangarRoof: std('#5a6168', 0.7, 0.3),
    hazard: std('#ffffff', 0.7, 0, { map: hazardTex() }),
    city: std('#ffffff', 0.85, 0.05, { map: city.map, emissive: '#ffffff', emissiveMap: city.emissive, emissiveIntensity: 0 }),
    // aircraft
    wing: std('#d6dadf', 0.42, 0.35),
    engineDark: std('#2b2f35', 0.4, 0.6),
    nacelle: std('#dfe3e7', 0.35, 0.4),
    tyre: std('#17181b', 0.9, 0),
    gear: std('#9fa6ae', 0.45, 0.7),
    cabinDark: std('#1b2230', 0.6, 0.1),
    seat: std('#2d5f8f', 0.8, 0),
    fuelTank: std('#ffb347', 0.3, 0, { transparent: true, opacity: 0.45, depthWrite: false, emissive: '#ff9a2a', emissiveIntensity: 0.25 }),
    wireRed: std('#ff5a3d', 0.6, 0, { emissive: '#ff5a3d', emissiveIntensity: 0.35 }),
    wireBlue: std('#5ea8ff', 0.6, 0, { emissive: '#5ea8ff', emissiveIntensity: 0.35 }),
    wireGreen: std('#7cf2b0', 0.6, 0, { emissive: '#7cf2b0', emissiveIntensity: 0.35 }),
    hydYellow: std('#ffe066', 0.5, 0.2, { emissive: '#ffe066', emissiveIntensity: 0.3 }),
    avionics: std('#1f2a36', 0.5, 0.3),
    // vehicles
    gseWhite: std('#eef0f2', 0.5, 0.1),
    gseRed: std('#d8452c', 0.5, 0.1),
    gseBlue: std('#2a6fd6', 0.5, 0.1),
    gseYellow: std('#ffc83d', 0.5, 0.1),
    gseGreen: std('#3aa676', 0.5, 0.1),
    gseOrange: std('#ff8a3d', 0.5, 0.1),
    gseSilver: std('#c9cfd6', 0.35, 0.7),
    gseDark: std('#2a2e34', 0.6, 0.3),
    droneDark: std('#1d2126', 0.45, 0.5),
    taxiWhite: std('#f2f4f6', 0.35, 0.2),
    taxiPurple: std('#7b4fd6', 0.4, 0.2),
    windowGlass: std('#101820', 0.1, 0.5, { envMapIntensity: 1.5 }),
    headlight: std('#ffffff', 0.3, 0, { emissive: '#ffffff', emissiveIntensity: 0 }),
    beacon: beaconMaterial('#ffb020', 1.1),
    beaconRed: beaconMaterial('#ff3b2f', 0.9),
    strobe: beaconMaterial('#ffffff', 1.4),
    rotor: new THREE.MeshBasicMaterial({ map: fanTex(), transparent: true, depthWrite: false, side: THREE.DoubleSide, color: '#d8dde2' }),
    // baggage
    belt: std('#ffffff', 0.85, 0, { map: beltTex() }),
    conveyorFrame: std('#7f8790', 0.5, 0.6),
    conveyorRail: std('#3b4047', 0.55, 0.5),
    bagShellDefault: std('#2d5f8f', 0.45, 0.1),
    bagDark: std('#1a1d22', 0.6, 0.1),
    ctBody: std('#e6e9ec', 0.5, 0.1),
    ctInner: std('#0d1824', 0.6, 0.2),
    uld: std('#aeb6bf', 0.5, 0.6),
    // emissives
    lightWhite: std('#ffffff', 0.4, 0, { emissive: '#ffffff', emissiveIntensity: 3.5, toneMapped: false }),
    lightWarm: std('#ffffff', 0.4, 0, { emissive: '#ffd9a0', emissiveIntensity: 3.0 }),
    lightCyan: std('#ffffff', 0.4, 0, { emissive: '#5ee7ff', emissiveIntensity: 3.0 }),
    lightAmber: std('#ffffff', 0.4, 0, { emissive: '#ffb347', emissiveIntensity: 3.0 }),
    lightRed: std('#ffffff', 0.4, 0, { emissive: '#ff3b2f', emissiveIntensity: 3.0 }),
    panelLight: std('#ffffff', 0.5, 0, { emissive: '#dfe9f4', emissiveIntensity: 1.2 }),
    screenFrame: std('#0c0f13', 0.4, 0.4),
    // misc
    black: std('#111316', 0.6, 0.3),
    darkFloor: std('#1a1d22', 0.7, 0.1),
    opsDark: std('#0f141b', 0.8, 0.1),
    opsDesk: std('#263040', 0.5, 0.2),
  };
  // keep the normal/bump defines constant where we might swap maps later
  for (const k of ['grass', 'runway', 'taxiway', 'apron', 'concrete', 'terminalWall', 'terminalFloor', 'roof']) if (!M[k].bumpMap) M[k].bumpMap = flatBump;
  M.glass.userData.noDepth = true;
  M.glass.userData.noPick = true;
  M.glassDark.userData.noDepth = true;
  M.fuelTank.userData.noDepth = true;
  M.rotor.userData.noDepth = true;
  return M;
}

/* Since r152 a material compiled with transparent=false bakes an OPAQUE define (alpha forced to 1),
   so flipping `transparent` needs a recompile. Both variants are warmed at load; after that the
   program cache serves them, so the flip costs nothing. */
export function setTransparent(m, on) {
  if (m.transparent === on) return false;
  m.transparent = on;
  m.needsUpdate = true;
  return true;
}
export function setXrayBlend(M, on) {
  for (const m of Object.values(M)) if (m.userData?.xray) setTransparent(m, on);
}

export function screenMaterial(map, base = 1.0) {
  const m = new THREE.MeshStandardMaterial({ color: '#05080c', emissive: '#ffffff', emissiveMap: map, emissiveIntensity: base, roughness: 0.25, metalness: 0.1, map: flatWhite });
  m.userData.glow = { base, gain: 0.6 };
  return m;
}
