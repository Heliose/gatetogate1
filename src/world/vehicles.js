import * as THREE from 'three';
import { add, box, cyl, rbox, sphere, cone, torus, lathe, mergeByMaterial, beamGeo, bakeGeometries, M4 } from '../core/geo.js';
import { rng } from '../core/rng.js';
import { TIME } from './materials.js';

/* ------------------------------------------------------------------ *
 * Ground support equipment, air taxis and drones. Every builder faces
 * +Z, base at y = 0. Animated sub-parts are mergeBoundary groups.
 * ------------------------------------------------------------------ */

const PI = Math.PI;

function wheels(g, M, list, r = 0.5, w = 0.36) {
  for (const [x, z] of list) add(g, cyl(r, r, w, 14), M.tyre, x, r, z, 0, 0, PI / 2);
}
function label(g, y) {
  const a = new THREE.Object3D();
  a.position.set(0, y, 0);
  a.userData.keep = true;
  a.userData.labelAnchor = true;
  g.add(a);
  return a;
}
function beacon(g, M, x, y, z) {
  add(g, sphere(0.12, 8, 6), M.beacon, x, y, z, 0, 0, 0, { cast: false });
}
function cab(g, M, w, h, d, x, y, z, color) {
  add(g, rbox(w, h, d, 0.12), color, x, y + h / 2, z);
  add(g, box(w - 0.2, h * 0.42, d + 0.05), M.windowGlass, x, y + h * 0.68, z, 0, 0, 0, { cast: false });
  add(g, box(0.3, 0.14, 0.05), M.headlight, x - w / 2 + 0.35, y + 0.4, z + d / 2 + 0.02, 0, 0, 0, { cast: false });
  add(g, box(0.3, 0.14, 0.05), M.headlight, x + w / 2 - 0.35, y + 0.4, z + d / 2 + 0.02, 0, 0, 0, { cast: false });
}

export function fuelTruck(M) {
  const g = new THREE.Group();
  wheels(g, M, [[-1.1, 2.2], [1.1, 2.2], [-1.1, -1.4], [1.1, -1.4], [-1.1, -2.4], [1.1, -2.4]]);
  add(g, box(2.4, 0.5, 7.4), M.gseDark, 0, 0.75, 0);
  cab(g, M, 2.4, 1.9, 2.2, 0, 1.0, 2.6, M.gseWhite);
  add(g, rbox(2.3, 1.2, 4.4, 0.1), M.gseWhite, 0, 1.6, -1.1);
  add(g, box(2.32, 0.3, 4.4), M.gseRed, 0, 1.3, -1.1);
  add(g, box(2.32, 0.08, 4.4), M.hazard, 0, 1.0, -1.1);
  // lift platform with hose reel
  const lift = new THREE.Group();
  lift.userData.mergeBoundary = true;
  lift.position.set(0, 2.2, -1.0);
  add(lift, box(1.8, 0.1, 2.4), M.gseSilver, 0, 0, 0);
  add(lift, torus(0.45, 0.12, 8, 20), M.gseDark, 0.4, 0.5, 0.2, PI / 2, 0, 0);
  add(lift, cyl(0.06, 0.06, 1.0, 6), M.gseSilver, -0.7, 0.5, -0.8);
  add(lift, cyl(0.06, 0.06, 1.0, 6), M.gseSilver, 0.7, 0.5, -0.8);
  add(lift, box(1.6, 0.05, 0.05), M.gseSilver, 0, 1.0, -0.8);
  g.add(lift);
  beacon(g, M, 0, 3.0, 2.6);
  label(g, 3.4);
  mergeByMaterial(g);
  return { group: g, lift, kind: 'fuel' };
}

export function cateringTruck(M) {
  const g = new THREE.Group();
  wheels(g, M, [[-1.1, 2.4], [1.1, 2.4], [-1.1, -1.8], [1.1, -1.8]]);
  add(g, box(2.4, 0.5, 7.6), M.gseDark, 0, 0.75, 0);
  cab(g, M, 2.4, 1.9, 2.0, 0, 1.0, 2.8, M.gseSilver);
  const lift = new THREE.Group();
  lift.userData.mergeBoundary = true;
  lift.position.set(0, 1.0, -1.1);
  add(lift, rbox(2.4, 2.6, 5.0, 0.1), M.gseSilver, 0, 1.3, 0);
  add(lift, box(2.42, 0.4, 5.0), M.gseOrange, 0, 1.0, 0);
  add(lift, box(0.8, 1.6, 0.1), M.gseDark, 0.82, 1.3, -2.52);
  // scissor legs
  add(lift, box(0.1, 1.6, 2.6), M.gseDark, -0.9, -0.5, 0, 0.5, 0, 0);
  add(lift, box(0.1, 1.6, 2.6), M.gseDark, 0.9, -0.5, 0, -0.5, 0, 0);
  g.add(lift);
  beacon(g, M, 0, 3.0, 2.8);
  label(g, 4.2);
  mergeByMaterial(g);
  return { group: g, lift, kind: 'catering' };
}

export function baggageTug(M) {
  const g = new THREE.Group();
  wheels(g, M, [[-0.75, 1.0], [0.75, 1.0], [-0.75, -0.9], [0.75, -0.9]], 0.38, 0.3);
  add(g, rbox(1.7, 0.7, 3.0, 0.08), M.gseBlue, 0, 0.7, 0);
  add(g, rbox(1.5, 0.9, 1.1, 0.08), M.gseBlue, 0, 1.45, -0.6);
  add(g, box(1.6, 0.08, 1.4), M.gseDark, 0, 2.05, -0.5);
  for (const s of [-1, 1]) add(g, box(0.08, 0.95, 0.08), M.gseDark, s * 0.72, 1.55, 0.1);
  add(g, rbox(0.5, 0.4, 0.5, 0.08), M.gseDark, 0, 1.25, -0.9);
  add(g, box(0.3, 0.12, 0.05), M.headlight, -0.5, 0.75, 1.52, 0, 0, 0, { cast: false });
  add(g, box(0.3, 0.12, 0.05), M.headlight, 0.5, 0.75, 1.52, 0, 0, 0, { cast: false });
  beacon(g, M, 0, 2.2, -0.5);
  label(g, 2.6);
  mergeByMaterial(g);
  return { group: g, kind: 'tug' };
}

export function baggageCart(M, seed = 1) {
  const g = new THREE.Group();
  const r = rng(seed);
  wheels(g, M, [[-0.7, 0.9], [0.7, 0.9], [-0.7, -0.9], [0.7, -0.9]], 0.25, 0.2);
  add(g, box(1.6, 0.1, 3.0), M.gseDark, 0, 0.5, 0);
  add(g, box(1.6, 0.06, 0.06), M.gseDark, 0, 1.6, 1.5);
  add(g, box(1.6, 0.06, 0.06), M.gseDark, 0, 1.6, -1.5);
  for (const z of [1.5, -1.5]) for (const x of [-0.78, 0.78]) add(g, box(0.06, 1.1, 0.06), M.gseDark, x, 1.05, z);
  add(g, box(1.7, 0.04, 3.2), M.gseBlue, 0, 1.63, 0, 0, 0, 0, { cast: false });
  add(g, cyl(0.03, 0.03, 1.0, 6), M.gseDark, 0, 0.45, 2.0, PI / 2, 0, 0);
  // the load: one vertex-coloured mesh instead of a material per bag
  const cols = ['#d8452c', '#2a6fd6', '#2d5f8f', '#2a2e34', '#3aa676', '#c7b89c'];
  const items = [];
  for (let i = 0; i < 7; i++) items.push({ geo: rbox(0.45 + r() * 0.2, 0.3 + r() * 0.15, 0.6 + r() * 0.2, 0.06), matrix: M4((r() - 0.5) * 0.9, 0.72 + (i > 3 ? 0.35 : 0), -1.0 + (i % 4) * 0.7, 0, (r() - 0.5) * 0.4, 0), color: cols[Math.floor(r() * cols.length)] });
  add(g, bakeGeometries(items), M.vcolor, 0, 0, 0);
  mergeByMaterial(g);
  return { group: g, kind: 'cart' };
}

export function beltLoader(M) {
  const g = new THREE.Group();
  wheels(g, M, [[-0.8, 1.2], [0.8, 1.2], [-0.8, -1.2], [0.8, -1.2]], 0.4, 0.3);
  add(g, box(1.8, 0.5, 4.2), M.gseDark, 0, 0.7, 0);
  add(g, rbox(1.4, 0.8, 1.2, 0.08), M.gseYellow, 0, 1.3, -1.3);
  add(g, box(0.3, 0.12, 0.05), M.headlight, 0.5, 0.8, 2.12, 0, 0, 0, { cast: false });
  const belt = new THREE.Group();
  belt.userData.mergeBoundary = true;
  belt.position.set(0, 1.1, -0.3);
  add(belt, box(0.9, 0.12, 6.4), M.belt, 0, 0.1, 3.0);
  add(belt, box(0.08, 0.3, 6.4), M.gseYellow, -0.5, 0.2, 3.0);
  add(belt, box(0.08, 0.3, 6.4), M.gseYellow, 0.5, 0.2, 3.0);
  add(belt, box(1.0, 0.08, 0.3), M.gseDark, 0, 0.0, 6.2);
  belt.rotation.x = -0.32;
  g.add(belt);
  beacon(g, M, 0, 1.9, -1.3);
  label(g, 2.6);
  mergeByMaterial(g);
  return { group: g, belt, kind: 'belt' };
}

export function cleaningVan(M) {
  const g = new THREE.Group();
  wheels(g, M, [[-0.95, 1.6], [0.95, 1.6], [-0.95, -1.5], [0.95, -1.5]], 0.42, 0.3);
  cab(g, M, 2.1, 2.3, 5.2, 0, 0.6, 0, M.gseGreen);
  add(g, box(2.12, 0.35, 5.2), M.gseWhite, 0, 1.6, 0);
  beacon(g, M, 0, 3.0, 1.2);
  label(g, 3.4);
  mergeByMaterial(g);
  return { group: g, kind: 'cleaning' };
}

export function tankTruck(M, color) {
  const g = new THREE.Group();
  wheels(g, M, [[-1.0, 2.0], [1.0, 2.0], [-1.0, -1.6], [1.0, -1.6]], 0.48, 0.34);
  add(g, box(2.2, 0.5, 6.4), M.gseDark, 0, 0.75, 0);
  cab(g, M, 2.2, 1.8, 1.9, 0, 1.0, 2.3, M.gseWhite);
  add(g, cyl(0.9, 0.9, 3.6, 18), color, 0, 1.95, -0.9, PI / 2, 0, 0);
  add(g, cyl(0.1, 0.1, 1.4, 8), M.gseSilver, 0.8, 1.4, -2.8, 0.6, 0, 0);
  beacon(g, M, 0, 2.95, 2.3);
  label(g, 3.4);
  mergeByMaterial(g);
  return { group: g, kind: 'tank' };
}

export function gpuUnit(M) {
  const g = new THREE.Group();
  wheels(g, M, [[-0.6, 0.8], [0.6, 0.8], [-0.6, -0.8], [0.6, -0.8]], 0.28, 0.2);
  add(g, rbox(1.4, 1.2, 2.4, 0.1), M.gseYellow, 0, 0.9, 0);
  add(g, box(1.42, 0.2, 2.4), M.gseDark, 0, 0.75, 0);
  add(g, cyl(0.04, 0.04, 3.0, 6), M.gseDark, 0, 0.2, 2.6, PI / 2, 0, 0);
  add(g, sphere(0.1, 8, 6), M.lightCyan, 0.4, 1.55, 0.9, 0, 0, 0, { cast: false });
  label(g, 2.0);
  mergeByMaterial(g);
  return { group: g, kind: 'gpu' };
}

export function pushbackTug(M) {
  const g = new THREE.Group();
  wheels(g, M, [[-1.2, 1.4], [1.2, 1.4], [-1.2, -1.4], [1.2, -1.4]], 0.55, 0.5);
  add(g, rbox(2.8, 1.0, 5.4, 0.15), M.gseYellow, 0, 0.9, 0);
  add(g, box(2.82, 0.2, 5.4), M.gseDark, 0, 1.0, 0);
  add(g, rbox(1.4, 1.1, 1.4, 0.1), M.gseYellow, 0.6, 1.95, -1.4);
  add(g, box(1.2, 0.5, 1.4), M.windowGlass, 0.6, 2.2, -1.4, 0, 0, 0, { cast: false });
  add(g, box(0.5, 0.4, 1.2), M.gseDark, 0, 1.6, 3.0);
  add(g, box(0.3, 0.14, 0.05), M.headlight, -0.9, 0.9, 2.72, 0, 0, 0, { cast: false });
  add(g, box(0.3, 0.14, 0.05), M.headlight, 0.9, 0.9, 2.72, 0, 0, 0, { cast: false });
  beacon(g, M, 0.6, 2.6, -1.4);
  label(g, 3.0);
  mergeByMaterial(g);
  return { group: g, kind: 'pushback' };
}

export function stairsTruck(M) {
  const g = new THREE.Group();
  wheels(g, M, [[-0.9, 1.8], [0.9, 1.8], [-0.9, -1.6], [0.9, -1.6]], 0.42, 0.3);
  add(g, box(2.0, 0.5, 5.6), M.gseDark, 0, 0.7, 0);
  cab(g, M, 2.0, 1.7, 1.6, 0, 0.95, 2.0, M.gseWhite);
  const stairs = new THREE.Group();
  stairs.userData.mergeBoundary = true;
  stairs.position.set(0, 1.0, -0.4);
  for (let i = 0; i < 14; i++) add(stairs, box(1.3, 0.06, 0.3), M.gseSilver, 0, i * 0.2, -i * 0.3);
  for (const s of [-1, 1]) add(stairs, box(0.05, 1.0, 4.4), M.gseSilver, s * 0.7, 1.9, -2.0, -0.59, 0, 0);
  add(stairs, box(1.5, 0.08, 1.2), M.gseSilver, 0, 2.75, -4.5);
  g.add(stairs);
  beacon(g, M, 0, 2.7, 2.0);
  label(g, 3.4);
  mergeByMaterial(g);
  return { group: g, stairs, kind: 'stairs' };
}

export function followMeCar(M) {
  const g = new THREE.Group();
  wheels(g, M, [[-0.8, 1.3], [0.8, 1.3], [-0.8, -1.3], [0.8, -1.3]], 0.34, 0.24);
  add(g, rbox(1.8, 0.7, 4.2, 0.15), M.gseYellow, 0, 0.75, 0);
  add(g, rbox(1.6, 0.6, 2.2, 0.15), M.gseYellow, 0, 1.35, -0.2);
  add(g, box(1.5, 0.3, 2.2), M.windowGlass, 0, 1.45, -0.2, 0, 0, 0, { cast: false });
  add(g, box(1.4, 0.4, 0.1), M.hazard, 0, 1.9, -0.2);
  beacon(g, M, 0, 2.2, -0.2);
  mergeByMaterial(g);
  return { group: g, kind: 'followme' };
}

/* eVTOL air taxi. Rotors are returned separately so the swarm can instance them. */
export function airTaxi(M, { withRotors = true } = {}) {
  const g = new THREE.Group();
  // cabin pod
  add(g, lathe([[0, 0], [0.9, 0.05], [1.25, 0.6], [1.3, 1.3], [1.0, 1.9], [0.4, 2.1], [0, 2.1]], 20), M.taxiWhite, 0, 0.9, 0, -PI / 2, 0, 0).scale.set(1, 1.9, 1);
  add(g, box(1.9, 0.9, 2.6), M.windowGlass, 0, 1.75, 0.5, 0, 0, 0, { cast: false });
  add(g, box(2.4, 0.18, 1.2), M.taxiPurple, 0, 1.05, -1.4);
  // arms
  const hubs = [[2.6, 2.2], [-2.6, 2.2], [2.9, -2.0], [-2.9, -2.0]];
  for (const [x, z] of hubs) {
    const len = Math.hypot(x, z);
    add(g, box(0.18, 0.12, len), M.taxiPurple, x / 2, 2.25, z / 2, 0, Math.atan2(x, z), 0);
    add(g, cyl(0.16, 0.2, 0.3, 10), M.gseDark, x, 2.3, z);
  }
  // skids
  for (const s of [-1, 1]) {
    add(g, box(0.1, 0.1, 3.2), M.gseDark, s * 0.9, 0.08, 0.2);
    add(g, box(0.08, 0.6, 0.08), M.gseDark, s * 0.9, 0.4, 1.2);
    add(g, box(0.08, 0.6, 0.08), M.gseDark, s * 0.9, 0.4, -0.8);
  }
  add(g, sphere(0.08, 8, 6), M.lightRed, -1.3, 1.4, -0.4, 0, 0, 0, { cast: false });
  add(g, sphere(0.08, 8, 6), M.lightCyan, 1.3, 1.4, -0.4, 0, 0, 0, { cast: false });
  add(g, sphere(0.1, 8, 6), M.strobe, 0, 2.5, -1.6, 0, 0, 0, { cast: false });
  label(g, 3.2);
  mergeByMaterial(g);
  const rotors = [];
  if (withRotors) {
    for (const [x, z] of hubs) {
      const r = add(g, cyl(1.5, 1.5, 0.03, 20), M.rotor, x, 2.5, z, 0, 0, 0, { cast: false, tags: { noMerge: true } });
      rotors.push(r);
    }
  }
  return { group: g, rotors, hubs, kind: 'airtaxi' };
}

/* Maintenance drone: quad with a downward scanner light and a beam cone */
export function drone(M) {
  const g = new THREE.Group();
  add(g, cyl(0.26, 0.3, 0.18, 12), M.droneDark, 0, 0.3, 0);
  add(g, sphere(0.14, 10, 8), M.windowGlass, 0, 0.22, 0.2, 0, 0, 0, { cast: false });
  const hubs = [[0.55, 0.55], [-0.55, 0.55], [0.55, -0.55], [-0.55, -0.55]];
  for (const [x, z] of hubs) {
    add(g, box(0.06, 0.05, 0.8), M.droneDark, x / 2, 0.32, z / 2, 0, Math.atan2(x, z), 0);
    add(g, cyl(0.05, 0.06, 0.1, 8), M.gseDark, x, 0.36, z);
  }
  add(g, cyl(0.1, 0.14, 0.14, 10), M.gseSilver, 0, 0.14, 0);
  add(g, sphere(0.07, 8, 6), M.lightCyan, 0, 0.1, 0, 0, 0, 0, { cast: false });
  add(g, sphere(0.04, 6, 5), M.lightRed, 0.5, 0.42, 0.5, 0, 0, 0, { cast: false });
  add(g, sphere(0.04, 6, 5), M.lightCyan, -0.5, 0.42, -0.5, 0, 0, 0, { cast: false });
  mergeByMaterial(g);
  const rotors = hubs.map(([x, z]) => add(g, cyl(0.34, 0.34, 0.02, 14), M.rotor, x, 0.43, z, 0, 0, 0, { cast: false, tags: { noMerge: true } }));
  // scanner beam
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color('#5ee7ff') }, uI: { value: 0.35 }, uTime: TIME.uTime },
    vertexShader: `varying vec3 vN, vV; varying float vY; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); vY = -position.y; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vN, vV; varying float vY; uniform vec3 uColor; uniform float uI, uTime;
      void main(){ float core = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float fade = 1.0 - smoothstep(0.0, 1.0, vY / 6.0);
        float dust = 0.85 + 0.15 * sin(vY * 6.0 - uTime * 4.0); float a = core * fade * dust * uI; gl_FragColor = vec4(uColor * a * 2.0, a); }`,
  });
  const beam = new THREE.Mesh(beamGeo(0.08, 1.4, 6, 20), beamMat);
  beam.position.y = 0.1;
  beam.userData.noDepth = true;
  beam.userData.noPick = true;
  beam.renderOrder = 5;
  g.add(beam);
  return { group: g, rotors, beam, beamMat, kind: 'drone' };
}

/* Fleet helper: build one of each GSE type keyed by task vehicle names */
export function buildFleet(M) {
  return {
    fuel: fuelTruck(M),
    cateringFwd: cateringTruck(M),
    cateringAft: cateringTruck(M),
    bagsFwd: trainOf(M, 2),
    bagsAft: trainOf(M, 3),
    bagsExtra: trainOf(M, 2),
    beltFwd: beltLoader(M),
    beltAft: beltLoader(M),
    cleaning: cleaningVan(M),
    water: tankTruck(M, M.gseBlue),
    lav: tankTruck(M, M.gseDark),
    gpu: gpuUnit(M),
    pushback: pushbackTug(M),
    stairs: stairsTruck(M),
    followme: followMeCar(M),
  };
}

/* a tug with N carts; carts are positioned by the chapter along the path */
export function trainOf(M, n) {
  const tug = baggageTug(M);
  const carts = [];
  for (let i = 0; i < n; i++) carts.push(baggageCart(M, i + 3));
  return { group: tug.group, tug, carts, kind: 'train' };
}

/* People as an instanced capsule crowd (queues, boarding) */
export function crowd(M, count = 40, color = '#3a4a5a') {
  const geo = bakeGeometries([
    { geo: new THREE.CapsuleGeometry(0.2, 0.9, 3, 8), matrix: M4(0, 0.85, 0) },
    { geo: sphere(0.14, 8, 6), matrix: M4(0, 1.55, 0) },
  ]);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}
