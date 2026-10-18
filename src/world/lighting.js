import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Daylight: keyframed by hour. One sun with a shadow frustum fitted to
 * the camera focus, one hemisphere, and a constant pool of point lights
 * the chapters borrow. Also drives sky, fog, exposure, environment,
 * airfield light level and every "glow" material.
 * ------------------------------------------------------------------ */

const KEYS = [
  { h: 0, sun: '#8aa0d8', sunI: 0.14, hemiS: '#1a2240', hemiG: '#0a0c10', hemiI: 0.26, top: '#05070f', hor: '#141a2c', exp: 1.12, env: 0.12, lights: 1, stars: 1, haze: 0.3, fog: '#0b1020' },
  { h: 4.8, sun: '#8aa0d8', sunI: 0.14, hemiS: '#1c2545', hemiG: '#0b0d12', hemiI: 0.28, top: '#070a16', hor: '#1a2238', exp: 1.1, env: 0.12, lights: 1, stars: 0.9, haze: 0.35, fog: '#0d1224' },
  { h: 5.6, sun: '#ff7a3a', sunI: 0.6, hemiS: '#4a5a86', hemiG: '#2a241f', hemiI: 0.38, top: '#1a2448', hor: '#ff9a5a', exp: 1.0, env: 0.16, lights: 0.95, stars: 0.3, haze: 0.7, fog: '#3a3448' },
  { h: 6.4, sun: '#ffb070', sunI: 2.6, hemiS: '#8aa3cf', hemiG: '#6b5a45', hemiI: 0.5, top: '#4b78b8', hor: '#ffd1a0', exp: 0.86, env: 0.22, lights: 0.5, stars: 0, haze: 0.75, fog: '#b7a79a' },
  { h: 8, sun: '#ffe2bf', sunI: 3.4, hemiS: '#a9c2e6', hemiG: '#8a7a63', hemiI: 0.55, top: '#3f7fd0', hor: '#cfe0ef', exp: 0.78, env: 0.26, lights: 0.05, stars: 0, haze: 0.55, fog: '#b9c9d8' },
  { h: 12.5, sun: '#fff4e6', sunI: 3.8, hemiS: '#b8cdee', hemiG: '#9a8b70', hemiI: 0.6, top: '#2f6fcc', hor: '#d9e6f2', exp: 0.72, env: 0.28, lights: 0, stars: 0, haze: 0.45, fog: '#c4d3e0' },
  { h: 16, sun: '#ffdcae', sunI: 3.4, hemiS: '#a9bfe2', hemiG: '#9a8060', hemiI: 0.55, top: '#3f7acb', hor: '#d8dde6', exp: 0.74, env: 0.26, lights: 0, stars: 0, haze: 0.5, fog: '#c2cad4' },
  { h: 17.6, sun: '#ff9a4e', sunI: 3.0, hemiS: '#8d9fcf', hemiG: '#a86a3c', hemiI: 0.5, top: '#4868aa', hor: '#ffb27a', exp: 0.76, env: 0.22, lights: 0.12, stars: 0, haze: 0.8, fog: '#c99a7a' },
  { h: 18.5, sun: '#ff6a3a', sunI: 1.2, hemiS: '#5c6ea8', hemiG: '#5a3c2c', hemiI: 0.4, top: '#283c78', hor: '#ff7f5c', exp: 0.9, env: 0.18, lights: 0.65, stars: 0.05, haze: 0.8, fog: '#6a4a52' },
  { h: 19.4, sun: '#8aa0d8', sunI: 0.22, hemiS: '#2f3c6e', hemiG: '#201c22', hemiI: 0.32, top: '#0f1738', hor: '#3d4a7c', exp: 1.02, env: 0.14, lights: 1, stars: 0.5, haze: 0.5, fog: '#1c2340' },
  { h: 21, sun: '#8aa0d8', sunI: 0.14, hemiS: '#1e2750', hemiG: '#0d0f14', hemiI: 0.26, top: '#06091a', hor: '#1a2340', exp: 1.12, env: 0.12, lights: 1, stars: 0.95, haze: 0.35, fog: '#0d1224' },
  { h: 24, sun: '#8aa0d8', sunI: 0.14, hemiS: '#1a2240', hemiG: '#0a0c10', hemiI: 0.26, top: '#05070f', hor: '#141a2c', exp: 1.12, env: 0.12, lights: 1, stars: 1, haze: 0.3, fog: '#0b1020' },
];

const cA = new THREE.Color(), cB = new THREE.Color();
export function sampleDay(h) {
  h = ((h % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && h > KEYS[i + 1].h) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = THREE.MathUtils.clamp((h - a.h) / (b.h - a.h), 0, 1);
  const out = {};
  for (const k of Object.keys(a)) {
    if (k === 'h') continue;
    if (typeof a[k] === 'number') out[k] = a[k] + (b[k] - a[k]) * t;
    else out[k] = cA.set(a[k]).lerp(cB.set(b[k]), t).clone();
  }
  return out;
}

export const SUNRISE = 5.7, SUNSET = 18.4;
export function sunDirection(h) {
  const t = (h - SUNRISE) / (SUNSET - SUNRISE);
  const dir = new THREE.Vector3();
  if (t > 0 && t < 1) {
    const el = Math.max(THREE.MathUtils.degToRad(2), THREE.MathUtils.degToRad(56) * Math.sin(Math.PI * t) - THREE.MathUtils.degToRad(6));
    const az = Math.PI * t; // east → south → west
    dir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    return { dir, moon: false, t };
  }
  dir.set(-0.4, 0.7, 0.35).normalize();
  return { dir, moon: true, t };
}

export function timeWord(h) {
  if (h < 5.3) return 'night';
  if (h < 6.6) return 'first light';
  if (h < 9.5) return 'morning';
  if (h < 15) return 'midday';
  if (h < 17.3) return 'afternoon';
  if (h < 19.6) return 'dusk';
  return 'night';
}

export function fmtHour(h) {
  h = ((h % 24) + 24) % 24;
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60 + 1e-6);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export class Daylight {
  constructor(scene, renderer, sky, M) {
    this.scene = scene;
    this.renderer = renderer;
    this.sky = sky;
    this.M = M;
    this.hour = 12;
    this.glowMats = []; // { mat, base, gain } → emissiveIntensity = base + lights*gain
    this.lightsLevel = 0;

    const sun = new THREE.DirectionalLight('#ffffff', 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.06;
    sun.shadow.radius = 3;
    sun.shadow.blurSamples = 8;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;
    this.shadowCenter = new THREE.Vector3();
    this.shadowRadius = 200;
    this.fitShadow(new THREE.Vector3(0, 0, -100), 600);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 0.5);
    scene.add(this.hemi);

    // constant pool of point lights the chapters borrow (never added/removed)
    this.pool = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 60, 2);
      l.position.set(0, -500, 0);
      scene.add(l);
      this.pool.push({ light: l, target: 0, level: 0 });
    }

    // environment: a simple sky-and-ground scene baked through PMREM
    const pm = new THREE.PMREMGenerator(renderer);
    const es = new THREE.Scene();
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {},
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = mix(vec3(0.42,0.4,0.36), mix(vec3(0.9,0.93,0.98), vec3(0.3,0.5,0.95), pow(max(h,0.0),0.5)), smoothstep(-0.05,0.05,h)); gl_FragColor = vec4(c * 1.6, 1.0); }',
    });
    es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat));
    const sunPanel = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2dc').multiplyScalar(6), side: THREE.DoubleSide }));
    sunPanel.position.set(20, 30, 20);
    sunPanel.lookAt(0, 0, 0);
    es.add(sunPanel);
    scene.environment = pm.fromScene(es, 0.03).texture;
    pm.dispose();
    skyMat.dispose();
    scene.environmentIntensity = 0.25;
    scene.fog = new THREE.FogExp2('#c4d3e0', 0.00026);
  }

  /* Register an emissive material that follows the night level */
  glow(mat, base = 0, gain = 1) {
    this.glowMats.push({ mat, base, gain });
  }

  fitShadow(center, radius) {
    if (center.distanceTo(this.shadowCenter) < radius * 0.04 && Math.abs(radius - this.shadowRadius) < radius * 0.05) return false;
    this.shadowCenter.copy(center);
    this.shadowRadius = radius;
    const sc = this.sun.shadow.camera;
    sc.left = -radius; sc.right = radius; sc.top = radius; sc.bottom = -radius;
    sc.near = radius * 0.2; sc.far = radius * 4.2;
    sc.updateProjectionMatrix();
    this.sun.shadow.normalBias = THREE.MathUtils.clamp(radius * 0.0012, 0.01, 0.8);
    this.sun.shadow.bias = -0.00015;
    this._placeSun();
    return true;
  }

  _placeSun() {
    const { dir } = sunDirection(this.hour);
    this.sun.position.copy(this.shadowCenter).addScaledVector(dir, this.shadowRadius * 2.2);
    this.sun.target.position.copy(this.shadowCenter);
    this.sun.target.updateMatrixWorld();
  }

  set(h) {
    this.hour = ((h % 24) + 24) % 24;
    const s = sampleDay(this.hour);
    const { dir, moon } = sunDirection(this.hour);
    this._placeSun();
    this.sun.color.copy(s.sun);
    this.sun.intensity = s.sunI;
    this.hemi.color.copy(s.hemiS);
    this.hemi.groundColor.copy(s.hemiG);
    this.hemi.intensity = s.hemiI;
    this.scene.environmentIntensity = s.env;
    this.renderer.toneMappingExposure = s.exp * this.exposureScale;
    if (this.scene.fog) this.scene.fog.color.copy(s.fog);
    const U = this.sky.U;
    U.uTop.value.copy(s.top);
    U.uHorizon.value.copy(s.hor);
    U.uSunDir.value.copy(dir);
    U.uSunColor.value.copy(s.sun);
    U.uSunI.value = moon ? 0 : Math.min(1, s.sunI / 2.5);
    U.uStars.value = s.stars;
    U.uMoonI.value = moon ? 0.9 : 0;
    U.uHaze.value = s.haze;
    this.lightsLevel = s.lights;
    for (const g of this.glowMats) g.mat.emissiveIntensity = g.base + s.lights * g.gain;
    this.sample = s;
    return s;
  }

  get exposureScale() { return this._expScale ?? 1; }
  set exposureScale(v) { this._expScale = v; }

  /* borrow a pooled light: i in 0..3 */
  pointLight(i, pos, color, intensity, distance = 60) {
    const p = this.pool[i];
    p.light.position.copy(pos);
    p.light.color.set(color);
    p.light.distance = distance;
    p.target = intensity;
  }
  releaseLight(i) { this.pool[i].target = 0; }
  update(dt) {
    for (const p of this.pool) {
      p.level += (p.target - p.level) * Math.min(1, dt * 3);
      p.light.intensity = p.level;
    }
  }
}
