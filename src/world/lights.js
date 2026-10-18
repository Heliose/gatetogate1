import * as THREE from 'three';
import { TIME } from './materials.js';
import { RUNWAY, TAXIWAY, APRON_LANE, CONNECTORS, LANE_LINKS, APRON, TOWER, HANGAR, VERTIPORT, TERMINAL, FUEL_FARM } from './layout.js';

/* ------------------------------------------------------------------ *
 * Every airfield light as one THREE.Points draw. aParam = (mode, phase,
 * group, size). Modes: 0 steady, 1 sequenced flash, 2 slow pulse, 3 strobe.
 * Groups: 0 runway edge, 1 centreline, 2 taxi edge, 3 taxi centre,
 * 4 approach, 5 PAPI, 6 apron masts, 7 vertiport, 8 threshold, 9 obstruction.
 * ------------------------------------------------------------------ */
export const LIGHT_GROUPS = ['Runway edge', 'Runway centreline', 'Taxiway edge', 'Taxiway centreline', 'Approach', 'PAPI', 'Apron masts', 'Vertiport', 'Threshold', 'Obstruction'];

export function buildAirfieldLights() {
  const pos = [], col = [], par = [];
  const c = new THREE.Color();
  const put = (x, y, z, color, mode, phase, group, size) => {
    pos.push(x, y, z);
    c.set(color);
    col.push(c.r, c.g, c.b);
    par.push(mode, phase, group, size);
  };
  const W = RUNWAY.w, L = RUNWAY.x1 - RUNWAY.x0;
  // runway edge: white, amber in the last 600 m of each end
  for (let x = RUNWAY.x0; x <= RUNWAY.x1; x += 60) {
    const amber = Math.min(x - RUNWAY.x0, RUNWAY.x1 - x) < 600 && Math.min(x - RUNWAY.x0, RUNWAY.x1 - x) > 20;
    for (const s of [-1, 1]) put(x, 0.4, RUNWAY.z + s * (W / 2 + 1.5), amber ? '#ffd27a' : '#fff6e6', 0, 0, 0, 0.9);
  }
  // centreline (white, red/white near the ends)
  for (let x = RUNWAY.x0 + 30; x <= RUNWAY.x1 - 30; x += 30) {
    const nearEnd = Math.min(x - RUNWAY.x0, RUNWAY.x1 - x) < 300;
    put(x, 0.25, RUNWAY.z, nearEnd && Math.round(x / 30) % 2 ? '#ff5a4a' : '#ffffff', 0, 0, 1, 0.55);
  }
  // thresholds: green across, with red runway-end row just outside
  for (const end of [0, 1]) {
    const x = end ? RUNWAY.x1 : RUNWAY.x0;
    for (let z = -W / 2; z <= W / 2 + 0.01; z += 3) put(x + (end ? 2 : -2), 0.3, RUNWAY.z + z, '#3cff8a', 0, 0, 8, 0.8);
    for (let z = -W / 2; z <= W / 2 + 0.01; z += 3) put(x + (end ? 6 : -6), 0.3, RUNWAY.z + z, '#ff3b2f', 0, 0, 8, 0.7);
    // runway end identifier strobes
    for (const s of [-1, 1]) put(x + (end ? -10 : 10), 0.6, RUNWAY.z + s * (W / 2 + 12), '#ffffff', 3, end * 0.5, 4, 1.2);
  }
  // approach 09 (west): centreline bar + crossbar at 300 m, sequenced flashers
  const n = 30;
  for (let i = 0; i < n; i++) {
    const x = RUNWAY.x0 - 30 - i * 30;
    const ph = i / n;
    for (let k = -2; k <= 2; k++) put(x, 1.2 + i * 0.05, RUNWAY.z + k * 1.5, '#fff6e6', 0, 0, 4, 0.7);
    put(x, 1.6 + i * 0.05, RUNWAY.z, '#ffffff', 1, ph, 4, 1.4);
    if (i === 9) for (let k = -7; k <= 7; k++) if (Math.abs(k) > 2) put(x, 1.2 + i * 0.05, RUNWAY.z + k * 2.2, '#fff6e6', 0, 0, 4, 0.7);
  }
  // PAPI (left of 09 at 300 m)
  for (let i = 0; i < 4; i++) put(RUNWAY.x0 + 300, 0.6, RUNWAY.z - W / 2 - 15 - i * 9, i < 2 ? '#ffffff' : '#ff3b2f', 0, 0, 5, 1.1);
  // taxiway edge (blue) and centreline (green)
  const edge = (x0, z0, x1, z1, w) => {
    const len = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / len, dz = (z1 - z0) / len;
    const nx = -dz, nz = dx;
    for (let d = 0; d <= len; d += 30) {
      const x = x0 + dx * d, z = z0 + dz * d;
      for (const s of [-1, 1]) put(x + nx * s * (w / 2 + 1), 0.35, z + nz * s * (w / 2 + 1), '#3f7bff', 0, 0, 2, 0.6);
    }
    for (let d = 15; d < len; d += 15) put(x0 + dx * d, 0.2, z0 + dz * d, '#45ff9a', 0, 0, 3, 0.4);
  };
  edge(TAXIWAY.x0, TAXIWAY.z, TAXIWAY.x1, TAXIWAY.z, TAXIWAY.w);
  edge(APRON_LANE.x0, APRON_LANE.z, APRON_LANE.x1, APRON_LANE.z, APRON_LANE.w);
  for (const x of CONNECTORS) edge(x, TAXIWAY.z - 12, x, RUNWAY.z + 24, 23);
  for (const x of LANE_LINKS) edge(x, APRON_LANE.z + 12, x, TAXIWAY.z - 12, 23);
  // apron edge (yellow-white) along the apron north edge
  for (let x = APRON.x0; x <= APRON.x1; x += 30) put(x, 0.3, APRON.z0 + 0.5, '#ffe6b0', 0, 0, 2, 0.5);
  // apron masts: 3 heads each
  const masts = [];
  for (let x = APRON.x0 + 35; x < APRON.x1; x += 70) {
    masts.push([x, APRON.z0 + 6]);
    for (let k = -1; k <= 1; k++) put(x + k * 1.2, 28, APRON.z0 + 6 + 0.5, '#fff1d6', 0, 0, 6, 3.2);
    put(x, 29, APRON.z0 + 6, '#ff3b2f', 2, x * 0.01, 9, 0.8);
  }
  for (const x of [APRON.x0 - 8, APRON.x1 + 8]) for (const z of [-100, -40]) {
    masts.push([x, z]);
    for (let k = -1; k <= 1; k++) put(x + k * 1.2, 28, z + 0.5, '#fff1d6', 0, 0, 6, 3.2);
  }
  // hangar apron masts
  for (const x of [HANGAR.x - 70, HANGAR.x + 70]) {
    masts.push([x, HANGAR.z + HANGAR.d / 2 + 50]);
    for (let k = -1; k <= 1; k++) put(x + k * 1.2, 28, HANGAR.z + HANGAR.d / 2 + 50, '#fff1d6', 0, 0, 6, 3.2);
  }
  // vertiport pads: pulsing cyan rings + a steady white centre
  VERTIPORT.pads.forEach(([px, pz], pi) => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      put(px + Math.cos(a) * VERTIPORT.r, VERTIPORT.y + 0.15, pz + Math.sin(a) * VERTIPORT.r, '#5ee7ff', 2, i / 16 + pi * 0.3, 7, 0.45);
    }
    put(px, VERTIPORT.y + 0.15, pz, '#ffffff', 0, 0, 7, 0.6);
  });
  // obstruction lights: tower, hangar corners, fuel tanks, terminal roof corners
  put(TOWER.x, TOWER.h + 4, TOWER.z, '#ff3b2f', 2, 0, 9, 1.4);
  put(TOWER.x, TOWER.h + 12, TOWER.z, '#ff3b2f', 2, 0.5, 9, 1.0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(HANGAR.x + sx * HANGAR.w / 2, HANGAR.h + 0.5, HANGAR.z + sz * HANGAR.d / 2, '#ff3b2f', 2, sx * 0.25 + sz * 0.1, 9, 0.8);
  for (const [tx, tz] of FUEL_FARM.tanks) put(FUEL_FARM.x + tx, FUEL_FARM.h + 1, FUEL_FARM.z + tz, '#ff3b2f', 2, tx * 0.01, 9, 0.7);
  for (const x of [TERMINAL.x0, TERMINAL.x1]) for (const z of [TERMINAL.z0, TERMINAL.z1]) put(x, TERMINAL.roofY + 1.5, z, '#ff3b2f', 2, x * 0.002, 9, 0.7);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aParam', new THREE.Float32BufferAttribute(par, 4));
  const U = {
    uTime: TIME.uTime,
    uScale: { value: 1000 },
    uLevel: { value: 1 },
    uGroup: { value: new Float32Array(10).fill(1) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec3 aColor; attribute vec4 aParam;
      uniform float uTime, uScale, uLevel; uniform float uGroup[10];
      varying vec3 vColor; varying float vA;
      void main() {
        float mode = aParam.x, phase = aParam.y; int grp = int(aParam.z + 0.5); float size = aParam.w;
        float b = 1.0;
        if (mode > 0.5 && mode < 1.5) { float k = fract(uTime * 1.0 - phase); b = 0.08 + 4.0 * smoothstep(0.0, 0.03, k) * (1.0 - smoothstep(0.03, 0.09, k)); }
        else if (mode > 1.5 && mode < 2.5) { b = 0.45 + 0.55 * sin(uTime * 2.4 + phase * 6.2832); }
        else if (mode > 2.5) { b = 0.05 + 4.0 * pow(0.5 + 0.5 * sin(uTime * 6.2832 * 1.2 + phase * 6.2832), 24.0); }
        float g = uGroup[grp];
        // approach, PAPI, obstruction and vertiport lights stay on by day too; the rest follow the night level
        float dayOn = (grp == 4 || grp == 5 || grp == 9 || grp == 7) ? 0.55 : 0.0;
        float lvl = max(uLevel, dayOn);
        vColor = aColor * b * g * lvl * 3.0;
        vA = step(0.01, g * lvl);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(size * uScale / -mv.z, 1.5, 40.0) * (0.7 + 0.3 * min(b, 1.0));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor; varying float vA;
      void main() {
        vec2 pc = gl_PointCoord * 2.0 - 1.0; float r2 = dot(pc, pc); if (r2 > 1.0 || vA < 0.5) discard;
        float a = exp(-r2 * 7.0) * 1.5 + exp(-r2 * 2.4) * 0.22;
        gl_FragColor = vec4(vColor * a, a);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.userData.noDepth = true;
  points.userData.noPick = true;
  points.renderOrder = 6;
  return {
    points,
    masts,
    U,
    setLevel(v) { U.uLevel.value = v; },
    setGroup(i, v) { U.uGroup.value[i] = v; },
    resize(bufferH, fovDeg) { U.uScale.value = bufferH / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2)); },
    count: pos.length / 3,
  };
}
