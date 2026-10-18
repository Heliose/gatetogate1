import * as THREE from 'three';
import { add, box, cyl, rbox, cone, torus, sphere, loftRings, ellipseRing, airfoilRing, taperTube, mergeByMaterial, bakeGeometries, colorize, boxUV, M4 } from '../core/geo.js';
import { flatWhite } from '../core/canvas.js';
import { liveryTex, finTex } from './textures.js';
import { hologramMaterial, thermalPatch, scanPatch, xrayPatch, AIRX, TIME } from './materials.js';

/* ------------------------------------------------------------------ *
 * Procedural narrow-body airliner. Nose faces +Z, base (wheels) at y = 0.
 * Variants: hero (doors, systems-ready), parked, hangar (scan-patched),
 * hologram twin, and a lite vertex-coloured geometry for the swarm.
 * ------------------------------------------------------------------ */

export const AC = { R: 1.98, fuseY: 3.6, zTail: -18.8, zNose: 18.8, span: 17.9 };

const SECTIONS = [
  [-18.8, 0.22, 1.95], [-17.2, 0.55, 1.62], [-15.4, 0.95, 1.2], [-13.4, 1.4, 0.72], [-11.2, 1.78, 0.3], [-9, 1.94, 0.08],
  [-7, 1.98, 0], [10, 1.98, 0], [12.5, 1.95, -0.03], [14.5, 1.78, -0.12], [16, 1.5, -0.25], [17.2, 1.12, -0.38], [18.1, 0.65, -0.48], [18.7, 0.22, -0.52], [18.8, 0.04, -0.52],
];

function fuselageGeo(n = 32) {
  const rings = SECTIONS.map(([z, r, cy]) => ellipseRing(n, 0, cy, z, r, r));
  const g = loftRings(rings, { caps: false });
  // u along the length (tail→nose), v around (belly→right→top→left)
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v, u); }
  return g;
}

/* wing: swept, tapered, with dihedral; side ±1 */
const wingLE = (ax) => 3.2 - 0.51 * (ax - 1.7);
const wingChord = (ax) => THREE.MathUtils.lerp(7.2, 1.6, (ax - 1.7) / (AC.span - 1.7));
const wingY = (ax) => -1.1 + (ax - 1.7) * 0.096;
function wingGeo(side, n = 24) {
  const rings = [];
  for (const ax of [1.4, 4.5, 8, 12, 15.5, AC.span]) {
    rings.push(airfoilRing(n, side * ax, wingY(ax), wingLE(ax), wingChord(ax), THREE.MathUtils.lerp(0.12, 0.09, ax / AC.span), 0.02));
  }
  const g = loftRings(rings, { caps: true });
  if (side < 0) flipWinding(g);
  return g;
}
function wingletGeo(side, n = 16) {
  const ax = AC.span, y = wingY(ax), zle = wingLE(ax);
  const rings = [];
  for (const [dy, chord, dz] of [[0, 1.6, 0], [0.7, 1.15, -0.5], [1.5, 0.75, -1.0], [2.0, 0.45, -1.3]]) {
    const ring = airfoilRing(n, 0, 0, 0, chord, 0.08, 0.0);
    for (const p of ring) {
      // rotate thickness into x (vertical fin-like), lean outward 15°
      const px = -p.y, py = p.x;
      const lean = 0.26;
      p.set(side * (ax + 0.1 + px + dy * Math.sin(lean)), y + py + dy * Math.cos(lean), zle + dz + p.z);
    }
    rings.push(ring);
  }
  const g = loftRings(rings, { caps: true });
  if (side < 0) flipWinding(g);
  return g;
}
function stabGeo(side, n = 16) {
  const rings = [];
  for (const ax of [0.6, 3.4, 6.3]) {
    const t = (ax - 0.6) / 5.7;
    rings.push(airfoilRing(n, side * ax, 0.9 + ax * 0.1, -13.2 - ax * 0.58, THREE.MathUtils.lerp(3.6, 1.3, t), 0.1, 0));
  }
  const g = loftRings(rings, { caps: true });
  if (side < 0) flipWinding(g);
  return g;
}
function finGeo(n = 16) {
  const rings = [];
  for (const [h, chord, zle] of [[1.6, 6.0, -11.4], [4.0, 4.3, -13.4], [6.4, 2.8, -15.3], [8.0, 2.0, -16.4]]) {
    const ring = airfoilRing(n, 0, 0, zle, chord, 0.09, 0);
    for (const p of ring) p.set(-p.y, h + p.x, p.z);
    rings.push(ring);
  }
  const g = loftRings(rings, { caps: true });
  // fin texture: u along chord, v up
  const uv = g.attributes.uv, pos = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, THREE.MathUtils.clamp((pos.getZ(i) + 17) / 7, 0, 1), THREE.MathUtils.clamp((pos.getY(i) - 1.6) / 6.6, 0, 1));
  return g;
}
export function flipWinding(g) {
  const ix = g.index.array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}

/* nacelle skin (open both ends) and inner duct */
const NACELLE = [[2.2, 1.0], [1.95, 1.1], [1.0, 1.15], [-0.4, 1.13], [-1.4, 1.04], [-2.1, 0.9]];
function nacelleGeo(n = 28) {
  return loftRings(NACELLE.map(([z, r]) => ellipseRing(n, 0, 0, z, r, r)), { caps: false });
}
function ductGeo(n = 28) {
  const g = loftRings([[2.2, 0.96], [1.2, 0.9], [-0.2, 0.84], [-1.3, 0.78]].map(([z, r]) => ellipseRing(n, 0, 0, z, r, r)), { caps: false });
  return flipWinding(g);
}

const ENGINE_X = 5.6, ENGINE_Y = -2.35, ENGINE_Z = 2.2;

/* Build one engine (simple) into a group centred on its axis */
function simpleEngine(T, { flat = false } = {}) {
  const e = new THREE.Group();
  if (!flat) e.userData.mergeBoundary = true;
  add(e, nacelleGeo(), T.nacelle, 0, 0, 0, 0, 0, 0, { tags: { part: 'nacelle' } });
  add(e, ductGeo(), T.engineDark, 0, 0, 0, 0, 0, 0, { cast: false });
  const fan = add(e, cyl(0.92, 0.92, 0.04, 28), T.rotor, 0, 0, 1.55, Math.PI / 2, 0, 0, { cast: false, tags: flat ? {} : { noMerge: true } });
  add(e, cone(0.3, 0.6, 16), T.engineDark, 0, 0, 1.85, Math.PI / 2, 0, 0);
  add(e, cyl(0.55, 0.3, 1.7, 16), T.engineDark, 0, 0, -2.1, Math.PI / 2, 0, 0);
  add(e, cyl(0.26, 0.05, 0.9, 12), T.engineDark, 0, 0, -3.2, Math.PI / 2, 0, 0);
  e.userData.fan = fan;
  mergeByMaterial(e);
  return e;
}

/* materials table for an airliner from the shared M + an airline livery */
export function airlinerMaterials(M, airline, { maintenance = false, scan = false, xray = false } = {}) {
  const liv = liveryTex(airline, { maintenance });
  const hull = new THREE.MeshStandardMaterial({ map: liv.map, roughness: 0.38, metalness: 0.25, emissive: '#ffffff', emissiveMap: liv.emissive, emissiveIntensity: 0 });
  const fin = new THREE.MeshStandardMaterial({ map: finTex(airline), roughness: 0.4, metalness: 0.25 });
  const wing = M.wing.clone();
  const nacelle = M.nacelle.clone();
  if (xray) {
    for (const m of [hull, fin, wing, nacelle]) { xrayPatch(m, AIRX, { key: 'xray-air' }); m.side = THREE.DoubleSide; }
  } else if (scan) {
    for (const m of [hull, fin, wing, nacelle]) scanPatch(m);
  }
  return { hull, fin, wing, nacelle, engineDark: M.engineDark, tyre: M.tyre, gear: M.gear, rotor: M.rotor, glass: M.windowGlass, navRed: M.lightRed, navGreen: M.lightCyan, strobe: M.strobe, beacon: M.beaconRed, white: M.white };
}

export function hologramMaterials(color = '#b48cff') {
  const h = hologramMaterial(color);
  const mk = () => { const m = h.clone(); m.uniforms.uTime = TIME.uTime; return m; };
  return { hull: h, fin: mk(), wing: mk(), nacelle: mk(), engineDark: mk(), tyre: mk(), gear: mk(), rotor: mk(), glass: mk(), navRed: mk(), navGreen: mk(), strobe: mk(), beacon: mk(), white: mk(), _clone: mk };
}

/**
 * Build an airliner.
 * opts: { T: materials table, doors: bool, lights: 'full'|'nav'|'none', holo: bool, radial }
 * Returns { group, parts, doors, fans, flaggable }
 */
export function buildAirliner(T, { doors = false, lights = 'nav', holo = false, radial = 32, flat = false } = {}) {
  const root = new THREE.Group();
  root.name = 'airliner';
  const body = new THREE.Group(); // at fuselage centre height
  body.position.y = AC.fuseY;
  root.add(body);
  const parts = {};
  const flaggable = {};

  const part = (name, obj) => { if (!flat) obj.userData.mergeBoundary = true; obj.name = name; body.add(obj); parts[name] = obj; return obj; };

  // fuselage
  const fuse = add(body, fuselageGeo(radial), T.hull, 0, 0, 0, 0, 0, 0, { tags: { part: 'fuselage' } });
  // radome (flaggable): a cap over the nose
  const radome = new THREE.Group();
  add(radome, sphere(0.62, 16, 12), holo ? T._clone() : T.white, 0, -0.48, 18.0, 0, 0, 0);
  radome.position.set(0, 0, 0);
  flaggable.radome = part('radome', radome);
  // wings
  add(body, wingGeo(1, radial > 16 ? 24 : 12), T.wing);
  add(body, wingGeo(-1, radial > 16 ? 24 : 12), T.wing);
  add(body, wingletGeo(1), T.fin);
  add(body, wingletGeo(-1), T.fin);
  add(body, stabGeo(1), T.wing);
  add(body, stabGeo(-1), T.wing);
  const finG = new THREE.Group();
  add(finG, finGeo(), T.fin);
  flaggable.fin = part('fin', finG);
  // wing-body fairing
  add(body, rbox(3.2, 1.3, 9, 0.5), T.hull, 0, -1.55, 0.4, 0, 0, 0, { tags: {} }).material = T.wing;
  // engines
  const engines = [];
  for (const s of [1, -1]) {
    const e = simpleEngine(T, { flat });
    e.position.set(s * ENGINE_X, ENGINE_Y, ENGINE_Z);
    e.name = s > 0 ? 'engineR' : 'engineL';
    body.add(e);
    parts[e.name] = e;
    flaggable[e.name] = e;
    engines.push(e);
    // pylon
    add(body, box(0.5, 1.2, 2.4), T.wing, s * ENGINE_X, ENGINE_Y + 1.5, ENGINE_Z - 0.6, 0.2, 0, 0);
  }
  // landing gear (flaggable)
  const gear = (name, x, z, strutTop, wheelR, twinSpacing, strutH) => {
    const gg = new THREE.Group();
    gg.position.set(x, strutTop, z);
    add(gg, cyl(0.14, 0.14, strutH, 8), T.gear, 0, -strutH / 2, 0);
    add(gg, box(0.6, 0.3, 0.4), T.gear, 0, -strutH + 0.1, 0);
    add(gg, cyl(0.05, 0.05, strutH * 0.7, 6), T.gear, 0.25, -strutH * 0.45, 0.2, 0.25, 0, 0);
    for (const s of [-1, 1]) add(gg, cyl(wheelR, wheelR, 0.34, 14), T.tyre, s * twinSpacing, -strutH, 0, 0, 0, Math.PI / 2);
    for (const s of [-1, 1]) add(gg, cyl(wheelR * 0.5, wheelR * 0.5, 0.36, 10), T.gear, s * twinSpacing, -strutH, 0, 0, 0, Math.PI / 2);
    flaggable[name] = part(name, gg);
    return gg;
  };
  gear('noseGear', 0, 13.2, -1.6, 0.45, 0.28, AC.fuseY - 1.6 - 0.45);
  gear('mainGearL', -3.8, -1.3, -1.5, 0.6, 0.45, AC.fuseY - 1.5 - 0.6);
  gear('mainGearR', 3.8, -1.3, -1.5, 0.6, 0.45, AC.fuseY - 1.5 - 0.6);
  // APU exhaust (flaggable)
  const apu = new THREE.Group();
  add(apu, cyl(0.22, 0.3, 1.2, 10), T.engineDark, 0, 1.9, -18.0, Math.PI / 2, 0, 0);
  flaggable.apu = part('apu', apu);
  // lights
  if (lights !== 'none') {
    for (const s of [1, -1]) {
      add(body, sphere(0.1, 8, 6), s > 0 ? T.navGreen : T.navRed, s * (AC.span + 0.2), wingY(AC.span) + 0.1, wingLE(AC.span) - 0.6, 0, 0, 0, { cast: false });
      if (lights === 'full') add(body, sphere(0.09, 8, 6), T.strobe, s * (AC.span + 0.1), wingY(AC.span) + 0.1, wingLE(AC.span) - 1.0, 0, 0, 0, { cast: false });
    }
    if (lights === 'full') {
      add(body, sphere(0.14, 8, 6), T.beacon, 0, AC.R + 0.05, 2, 0, 0, 0, { cast: false });
      add(body, sphere(0.14, 8, 6), T.beacon, 0, -AC.R - 0.02, 0.5, 0, 0, 0, { cast: false });
      add(body, sphere(0.1, 8, 6), T.strobe, 0, 1.95, -18.6, 0, 0, 0, { cast: false });
    }
  }
  // doors (hero): L1 pax door (hinge forward), fwd + aft cargo doors (hinge top)
  const doorsOut = {};
  if (doors) {
    const mkDoor = (name, side, zc, yc, w, h, hingeAt) => {
      const th = Math.acos(THREE.MathUtils.clamp(-yc / AC.R, -1, 1));
      const nx = side * Math.sin(th), ny = -Math.cos(th);
      const hinge = new THREE.Group();
      hinge.userData.mergeBoundary = true;
      hinge.position.set(nx * AC.R, ny * AC.R, zc + (hingeAt === 'fwd' ? w / 2 : 0));
      hinge.rotation.z = Math.atan2(ny, nx);
      if (hingeAt === 'top') hinge.position.y += h / 2 * 0.98;
      const panel = add(hinge, rbox(0.1, h, w, 0.03), T.hull, 0.05, hingeAt === 'top' ? -h / 2 : 0, hingeAt === 'fwd' ? -w / 2 : 0);
      panel.material = T.white;
      add(hinge, box(0.06, h * 0.6, 0.08), T.gear, 0.12, hingeAt === 'top' ? -h / 2 : 0, hingeAt === 'fwd' ? -w / 2 : 0);
      body.add(hinge);
      doorsOut[name] = { group: hinge, open: 0, hingeAt, set(k) { this.open = k; if (hingeAt === 'fwd') hinge.rotation.y = -k * 2.6; else hinge.rotation.x = 0; if (hingeAt === 'top') hinge.rotation.z = Math.atan2(ny, nx) + k * 1.9 * (side > 0 ? -1 : 1); } };
      return hinge;
    };
    mkDoor('L1', -1, 13.6, 0.1, 1.0, 1.9, 'fwd');
    mkDoor('L2', -1, -12.4, 0.1, 1.0, 1.9, 'fwd');
    mkDoor('cargoFwd', 1, 6.5, -1.0, 1.8, 1.25, 'top');
    mkDoor('cargoAft', 1, -8.5, -1.0, 1.8, 1.25, 'top');
  }
  mergeByMaterial(body);
  if (!flat) for (const p of Object.values(parts)) mergeByMaterial(p);
  const fans = flat ? [] : engines.map((e) => e.userData.fan).filter(Boolean);
  return { group: root, body, parts, doors: doorsOut, fans, flaggable, fuse };
}

/* Interior systems for the hero aircraft (local to the body group: fuselage centre at the origin) */
export function buildSystems(M) {
  const S = new THREE.Group();
  S.name = 'systems';
  const layer = (name) => { const l = new THREE.Group(); l.name = name; S.add(l); return l; };
  const L = { structure: layer('structure'), cabin: layer('cabin'), cargo: layer('cargo'), wiring: layer('wiring'), hydraulics: layer('hydraulics'), avionics: layer('avionics'), fuel: layer('fuel') };

  // structure: frames and keel beams
  for (let z = -13; z <= 13; z += 1.3) {
    const r = AC.R - 0.06;
    add(L.structure, torus(r, 0.035, 6, 36), M.steel, 0, 0, z, 0, 0, 0, { cast: false });
  }
  add(L.structure, box(0.12, 0.3, 30), M.steel, -1.2, -0.75, 0, 0, 0, 0, { cast: false });
  add(L.structure, box(0.12, 0.3, 30), M.steel, 1.2, -0.75, 0, 0, 0, 0, { cast: false });
  for (let z = -13; z <= 13; z += 1.3) add(L.structure, box(3.6, 0.08, 0.12), M.steel, 0, -0.62, z, 0, 0, 0, { cast: false });
  // wing spars
  for (const s of [1, -1]) {
    add(L.structure, box(14, 0.22, 0.14), M.steel, s * 8.5, -1.0, 1.9 - 0.51 * 6.8, 0, s * 0.47, s * 0.09, { cast: false });
    add(L.structure, box(14, 0.18, 0.12), M.steel, s * 8.5, -1.05, -2.2 - 0.51 * 6.8, 0, s * 0.47, s * 0.09, { cast: false });
  }
  // cabin: floor + seats (instanced)
  add(L.cabin, box(3.5, 0.08, 27), M.cabinDark, 0, -0.62, -0.5, 0, 0, 0, { cast: false });
  const seatGeo = bakeGeometries([
    { geo: rbox(0.46, 0.12, 0.48, 0.04), matrix: M4(0, 0.4, 0) },
    { geo: rbox(0.46, 0.55, 0.1, 0.04), matrix: M4(0, 0.7, -0.22, -0.15) },
    { geo: box(0.08, 0.36, 0.4), matrix: M4(0, 0.18, 0) },
  ]);
  const rows = 27, seats = new THREE.InstancedMesh(seatGeo, M.seat, rows * 6);
  seats.castShadow = false;
  const m = new THREE.Matrix4();
  let si = 0;
  for (let r = 0; r < rows; r++) {
    const z = 10.5 - r * 0.78;
    for (const x of [-1.52, -1.02, -0.52, 0.52, 1.02, 1.52]) { m.makeTranslation(x, -0.58, z); seats.setMatrixAt(si++, m); }
  }
  seats.instanceMatrix.needsUpdate = true;
  L.cabin.add(seats);
  // overhead bins
  for (const s of [1, -1]) add(L.cabin, box(0.8, 0.5, 22), M.white, s * 1.25, 0.95, -0.5, 0, 0, s * 0.3, { cast: false });
  // cockpit seats + panel
  for (const s of [1, -1]) add(L.cabin, rbox(0.5, 1.0, 0.6, 0.06), M.cabinDark, s * 0.6, -0.1, 14.5, 0, 0, 0, { cast: false });
  add(L.cabin, box(2.0, 0.6, 0.6), M.avionics, 0, 0.3, 16.0, -0.4, 0, 0, { cast: false });
  // cargo: ULDs in both holds
  for (const z of [3.6, 5.6, 7.6, -4.2, -6.2, -8.2]) add(L.cargo, rbox(2.4, 1.0, 1.5, 0.12), M.uld, 0, -1.35, z, 0, 0, 0, { cast: false });
  // wiring: harness bundles along the crown and under the floor
  const harness = (mat, y, x, wob, seed) => {
    const pts = [];
    for (let z = 15; z >= -15; z -= 2) pts.push(new THREE.Vector3(x + Math.sin(z * 0.7 + seed) * wob, y + Math.cos(z * 0.5 + seed) * wob * 0.5, z));
    add(L.wiring, taperTube(pts, { segments: 40, radial: 6, radius: 0.045 }), mat, 0, 0, 0, 0, 0, 0, { cast: false });
  };
  harness(M.wireRed, 1.62, 0.3, 0.08, 0); harness(M.wireBlue, 1.6, -0.3, 0.08, 1.3); harness(M.wireGreen, 1.55, 0.0, 0.06, 2.1);
  harness(M.wireRed, -1.2, -1.6, 0.04, 3); harness(M.wireBlue, -1.2, 1.6, 0.04, 4);
  // branches to the wings and tail
  for (const s of [1, -1]) {
    add(L.wiring, taperTube([new THREE.Vector3(s * 0.3, -1.2, 0.5), new THREE.Vector3(s * 4, -1.1, -0.4), new THREE.Vector3(s * 9, -0.6, -2.8), new THREE.Vector3(s * 16, 0.1, -5.5)], { segments: 24, radial: 6, radius: 0.035 }), M.wireBlue, 0, 0, 0, 0, 0, 0, { cast: false });
    add(L.wiring, taperTube([new THREE.Vector3(s * 0.3, -1.2, 1.5), new THREE.Vector3(s * 5.6, -1.6, 1.8), new THREE.Vector3(s * 5.6, -2.0, 2.2)], { segments: 12, radial: 6, radius: 0.04 }), M.wireRed, 0, 0, 0, 0, 0, 0, { cast: false });
  }
  add(L.wiring, taperTube([new THREE.Vector3(0.2, 1.6, -14), new THREE.Vector3(0.1, 2.2, -15.5), new THREE.Vector3(0, 4.5, -15.8), new THREE.Vector3(0, 7.5, -16.2)], { segments: 16, radial: 6, radius: 0.035 }), M.wireGreen, 0, 0, 0, 0, 0, 0, { cast: false });
  // hydraulics: three systems to the gear bays, engines and tail
  const hyd = (mat, pts) => add(L.hydraulics, taperTube(pts.map((p) => new THREE.Vector3(...p)), { segments: 30, radial: 6, radius: 0.05 }), mat, 0, 0, 0, 0, 0, 0, { cast: false });
  hyd(M.hydYellow, [[5.6, -2.0, 1.5], [3.8, -1.5, 0.2], [3.8, -1.6, -1.3], [1.4, -1.5, -2], [0.8, -1.4, -12], [0.3, 0.5, -14.5], [0.2, 2.5, -15.8]]);
  hyd(M.wireGreen, [[-5.6, -2.0, 1.5], [-3.8, -1.5, 0.2], [-3.8, -1.6, -1.3], [-1.4, -1.5, -2], [-0.8, -1.4, -12], [-0.3, 0.5, -14.5], [-0.2, 2.5, -15.8]]);
  hyd(M.wireBlue, [[-1.0, -1.4, 10], [-0.6, -1.6, 12.5], [0, -1.6, 13.2], [0.6, -1.4, 10], [0.9, -1.3, 2], [1.2, -1.3, -6]]);
  // avionics bay: racks under the cockpit with blinking LEDs
  for (let i = 0; i < 4; i++) add(L.avionics, rbox(0.5, 0.7, 0.9, 0.03), M.avionics, -0.9 + i * 0.6, -1.2, 12.2, 0, 0, 0, { cast: false });
  add(L.avionics, rbox(1.4, 0.4, 0.6, 0.03), M.avionics, 0, 0.9, -17.2, 0, 0, 0, { cast: false }); // tail avionics
  L.avionics.add(blinkPoints(Array.from({ length: 48 }, (_, i) => [-1.1 + (i % 12) * 0.2, -1.5 + Math.floor(i / 12) * 0.16, 12.68]), ['#5ee7ff', '#7cf2b0', '#ffb347']));
  // fuel: centre tank + wing tanks
  add(L.fuel, rbox(3.0, 0.8, 4.6, 0.1), M.fuelTank, 0, -1.25, 0.2, 0, 0, 0, { cast: false });
  for (const s of [1, -1]) {
    add(L.fuel, rbox(9.5, 0.5, 2.8, 0.1), M.fuelTank, s * 6.5, -1.0, -0.9 - 0.51 * 4.8, 0, s * 0.47, s * 0.09, { cast: false });
    add(L.fuel, rbox(5.5, 0.3, 1.5, 0.1), M.fuelTank, s * 14, -0.55, -0.9 - 0.51 * 12.3, 0, s * 0.47, s * 0.09, { cast: false });
  }
  for (const l of Object.values(L)) mergeByMaterial(l);
  return { group: S, layers: L };
}

/* Blinking LEDs as a tiny Points */
export function blinkPoints(positions, palette) {
  const pos = [], col = [], ph = [];
  const c = new THREE.Color();
  positions.forEach((p, i) => {
    pos.push(...p);
    c.set(palette[i % palette.length]);
    col.push(c.r, c.g, c.b);
    ph.push(Math.random() * 6.28, 1 + Math.random() * 4);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aPh', new THREE.Float32BufferAttribute(ph, 2));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: TIME.uTime },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aColor; attribute vec2 aPh; uniform float uTime; varying vec3 vC;
      void main(){ float b = step(0.5, fract(uTime * aPh.y * 0.3 + aPh.x)); vC = aColor * (0.15 + b * 2.5);
        vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(60.0 / -mv.z, 2.0, 9.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float r2 = dot(p,p); if (r2 > 1.0) discard; gl_FragColor = vec4(vC * exp(-r2 * 3.0), exp(-r2 * 3.0)); }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.userData.noDepth = true;
  pts.frustumCulled = false;
  return pts;
}

/* Detailed engine for the thermal / glass views: local axis +z = front, centred on the axis */
export function buildEngineDetail(M) {
  const e = new THREE.Group();
  e.name = 'engineDetail';
  const metal = thermalPatch(new THREE.MeshStandardMaterial({ color: '#b4bac2', roughness: 0.38, metalness: 0.85 }));
  const dark = thermalPatch(new THREE.MeshStandardMaterial({ color: '#3a3f46', roughness: 0.5, metalness: 0.6 }));
  const hot = thermalPatch(new THREE.MeshStandardMaterial({ color: '#6a5a50', roughness: 0.6, metalness: 0.4, emissive: '#ff6a1a', emissiveIntensity: 0.9 }));
  const skin = thermalPatch(new THREE.MeshStandardMaterial({ color: '#dfe3e7', roughness: 0.35, metalness: 0.4, transparent: true, opacity: 1, side: THREE.DoubleSide }), { glass: true });
  const casing = thermalPatch(new THREE.MeshStandardMaterial({ color: '#8f969e', roughness: 0.4, metalness: 0.7, transparent: true, opacity: 1, side: THREE.DoubleSide }), { glass: true });
  skin.userData.noDepth = true;
  casing.userData.noDepth = true;
  // nacelle skin + duct
  const nac = add(e, nacelleGeo(36), skin, 0, 0, 0);
  nac.renderOrder = 3;
  const duct = add(e, ductGeo(36), casing, 0, 0, 0, 0, 0, 0, { cast: false });
  duct.renderOrder = 2;
  // fan: hub + instanced blades
  const fanG = new THREE.Group();
  fanG.position.z = 1.55;
  fanG.userData.mergeBoundary = true;
  add(fanG, cone(0.3, 0.55, 20), dark, 0, 0, 0.3, Math.PI / 2, 0, 0);
  add(fanG, cyl(0.32, 0.32, 0.25, 20), metal, 0, 0, 0, Math.PI / 2, 0, 0);
  const blade = box(0.09, 0.62, 0.2);
  blade.translate(0, 0.31 + 0.3, 0);
  const blades = new THREE.InstancedMesh(blade, metal, 22);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    q.setFromEuler(new THREE.Euler(0, 0, a)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.6, 0)));
    m.compose(pos, q, scl);
    blades.setMatrixAt(i, m);
  }
  blades.instanceMatrix.needsUpdate = true;
  fanG.add(blades);
  e.add(fanG);
  // compressor stages (LPC, HPC), combustor, turbines, shaft, exhaust
  const stage = (z, r, mat, h = 0.1) => add(e, cyl(r, r * 0.92, h, 24), mat, 0, 0, z, Math.PI / 2, 0, 0, { cast: false });
  for (const [z, r] of [[1.0, 0.56], [0.72, 0.52], [0.46, 0.48]]) stage(z, r, metal);
  for (let i = 0; i < 6; i++) stage(0.15 - i * 0.14, 0.42 - i * 0.02, metal, 0.06);
  add(e, torus(0.4, 0.13, 10, 24), hot, 0, 0, -0.85, 0, 0, 0, { cast: false });
  add(e, cyl(0.46, 0.46, 0.3, 24, true), hot, 0, 0, -0.85, Math.PI / 2, 0, 0, { cast: false });
  for (const [z, r] of [[-1.1, 0.36], [-1.28, 0.38]]) stage(z, r, dark, 0.08);
  for (const [z, r] of [[-1.5, 0.44], [-1.68, 0.48], [-1.86, 0.52], [-2.04, 0.55]]) stage(z, r, dark, 0.08);
  add(e, cyl(0.08, 0.08, 3.8, 10), metal, 0, 0, -0.5, Math.PI / 2, 0, 0, { cast: false });
  add(e, cone(0.3, 1.0, 16), dark, 0, 0, -2.6, -Math.PI / 2, 0, 0, { cast: false });
  // core casing (glass-able)
  const core = add(e, cyl(0.62, 0.5, 2.7, 24, true), casing, 0, 0, -0.9, Math.PI / 2, 0, 0, { cast: false });
  core.renderOrder = 2;
  // accessory gearbox + pipes
  add(e, rbox(0.5, 0.3, 0.8, 0.05), dark, 0, -0.85, 0.2, 0, 0, 0, { cast: false });
  add(e, taperTube([new THREE.Vector3(0.3, -0.75, 0.6), new THREE.Vector3(0.5, -0.4, -0.3), new THREE.Vector3(0.45, -0.3, -1.2)], { segments: 12, radial: 6, radius: 0.03 }), metal, 0, 0, 0, 0, 0, 0, { cast: false });
  mergeByMaterial(e);
  return { group: e, fan: fanG, mats: { metal, dark, hot, skin, casing } };
}

/* Lite vertex-coloured airliner geometry for the instanced swarm */
export function liteAirlinerGeometry() {
  const items = [];
  items.push({ geo: fuselageGeo(14), matrix: M4(0, AC.fuseY, 0), color: '#eef1f4' });
  for (const s of [1, -1]) {
    items.push({ geo: wingGeo(s, 10), matrix: M4(0, AC.fuseY, 0), color: '#c9cfd5' });
    items.push({ geo: stabGeo(s, 8), matrix: M4(0, AC.fuseY, 0), color: '#c9cfd5' });
    items.push({ geo: cyl(1.05, 0.95, 3.6, 12), matrix: M4(s * ENGINE_X, AC.fuseY + ENGINE_Y, ENGINE_Z, Math.PI / 2), color: '#3a3f46' });
  }
  items.push({ geo: finGeo(8), matrix: M4(0, AC.fuseY, 0), color: '#2f5fd0' });
  return bakeGeometries(items);
}

export { ENGINE_X, ENGINE_Y, ENGINE_Z };
