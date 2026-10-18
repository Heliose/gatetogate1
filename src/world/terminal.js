import * as THREE from 'three';
import { add, box, cyl, rbox, lathe, groundPlane, mergeByMaterial, boxUV, M4 } from '../core/geo.js';
import { rng } from '../core/rng.js';
import { dissolvePatch, screenMaterial, DISSOLVE } from './materials.js';
import { screenTex, padTex } from './textures.js';
import { TERMINAL, TOWER, HANGAR, FUEL_FARM, SUBSTATION, DATA_CENTRE, VERTIPORT, CITY, GATE_COUNT, gateX, STAND_Z, SERVICE_SPOTS, APRON, LANDSIDE_ROAD, HERO_GATE, PARKED_GATES } from './layout.js';

/* ------------------------------------------------------------------ *
 * Buildings: terminal (with concourse, roof vertiport, jet bridges),
 * control tower with the hidden ops room, hangar, fuel farm, utilities,
 * apron masts and the city skyline.
 * ------------------------------------------------------------------ */

export function buildTerminal(M, daylight) {
  const g = new THREE.Group();
  g.name = 'terminal';
  const { x0, x1, z0, z1, floorH, roofY } = TERMINAL;
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

  const shell = new THREE.Group();
  // floor slabs
  add(shell, box(W, 0.6, D), M.terminalFloor, cx, -0.3, cz, 0, 0, 0, { cast: false });
  for (let f = 1; f < 3; f++) add(shell, box(W - 2, 0.5, D - 14), M.terminalFloor, cx, f * floorH, cz + 7);
  // landside wall with window bands
  add(shell, box(W, roofY, 0.6), M.terminalWall, cx, roofY / 2, z1 - 0.3);
  for (let f = 0; f < 3; f++) add(shell, box(W - 40, 2.6, 0.3), M.glassDark, cx, f * floorH + 4.2, z1 - 0.1, 0, 0, 0, { cast: false });
  // end walls
  for (const x of [x0, x1]) add(shell, box(0.6, roofY, D), M.terminalWall, x, roofY / 2, cz);
  // roof
  add(shell, box(W + 4, 0.8, D + 4), M.roof, cx, roofY, cz);
  add(shell, box(W + 4, 1.4, 0.5), M.terminalWall, cx, roofY + 0.9, z0 - 2);
  add(shell, box(W + 4, 1.4, 0.5), M.terminalWall, cx, roofY + 0.9, z1 + 2);
  // skylights
  for (let x = x0 + 40; x < x1 - 20; x += 80) add(shell, box(30, 1.2, 60), M.glass, x, roofY + 0.9, cz + 10, 0, 0, 0, { cast: false });
  // columns inside
  for (let x = x0 + 20; x < x1; x += 40) for (const z of [z0 + 30, z0 + 80, z1 - 20]) add(shell, cyl(0.6, 0.6, roofY, 10), M.white, x, roofY / 2, z);
  // concourse: level 2 projects 8 m over the apron with glass all round
  const conc = new THREE.Group();
  add(conc, box(W, 0.6, 8), M.terminalFloor, cx, floorH, z0 - 4);
  add(conc, box(W, 0.6, 8), M.roof, cx, floorH * 2 + 0.6, z0 - 4);
  for (let x = x0 + 10; x < x1; x += 20) add(conc, cyl(0.45, 0.45, floorH, 8), M.steel, x, floorH * 1.5, z0 - 7.6);
  // airside glass facade: ground floor + concourse
  const facade = new THREE.Mesh(box(W, floorH - 0.6, 0.2), M.glass);
  facade.position.set(cx, floorH / 2 - 0.3, z0);
  facade.castShadow = false;
  facade.userData.noDepth = true;
  facade.userData.noPick = true;
  shell.add(facade);
  const facade2 = new THREE.Mesh(box(W, floorH - 1.2, 0.2), M.glass);
  facade2.position.set(cx, floorH * 1.5 + 0.3, z0 - 8);
  facade2.castShadow = false;
  facade2.userData.noDepth = true;
  facade2.userData.noPick = true;
  conc.add(facade2);
  const facade3 = new THREE.Mesh(box(W, roofY - floorH * 2 - 1.2, 0.2), M.glass);
  facade3.position.set(cx, (roofY + floorH * 2) / 2, z0);
  facade3.castShadow = false;
  facade3.userData.noDepth = true;
  shell.add(facade3);
  // mullions
  for (let x = x0; x <= x1; x += 6) {
    add(shell, box(0.18, floorH, 0.3), M.steelDark, x, floorH / 2, z0);
    add(conc, box(0.18, floorH, 0.3), M.steelDark, x, floorH * 1.5, z0 - 8);
    add(shell, box(0.18, roofY - floorH * 2, 0.3), M.steelDark, x, (roofY + floorH * 2) / 2, z0);
  }
  shell.add(conc);
  // departures board + lounge furniture (concourse), simple
  const boardMat = screenMaterial(screenTex('board'), 1.0);
  daylight.glow(boardMat, 1.0, 0.5);
  for (let i = 0; i < GATE_COUNT; i++) {
    const gx = gateX(i);
    add(shell, box(4, 2.2, 0.2), boardMat, gx, floorH + 4.5, z0 - 0.5, 0, 0, 0, { cast: false });
    for (let r = 0; r < 3; r++) for (let k = -2; k <= 2; k++) add(shell, rbox(0.6, 0.5, 0.6, 0.06), M.seat, gx + k * 0.75, floorH + 0.55, z0 + 6 + r * 2.5, 0, 0, 0, { cast: false });
  }
  // check-in hall desks (ground floor, landside) + queue barriers
  for (let i = -5; i <= 5; i++) {
    const x = cx + i * 12;
    add(shell, rbox(8, 1.1, 1.2, 0.04), M.white, x, 0.55, z1 - 22);
    add(shell, box(8, 0.12, 1.2), M.steelDark, x, 1.16, z1 - 22);
    add(shell, box(0.6, 1.6, 0.08), M.screenFrame, x + 3.6, 1.9, z1 - 22.6);
  }
  mergeByMaterial(shell);
  g.add(shell);

  // vertiport pads on the roof
  const padMat = new THREE.MeshStandardMaterial({ map: padTex(), roughness: 0.8, transparent: true });
  padMat.userData.noPick = true;
  const pads = new THREE.Group();
  for (const [px, pz] of VERTIPORT.pads) {
    const p = new THREE.Mesh(groundPlane(VERTIPORT.r * 2.2, VERTIPORT.r * 2.2), padMat);
    p.position.set(px, VERTIPORT.y, pz);
    p.receiveShadow = true;
    p.castShadow = false;
    pads.add(p);
  }
  mergeByMaterial(pads);
  g.add(pads);
  // roof terminal for the vertiport: a small glass lounge
  const lounge = new THREE.Group();
  add(lounge, box(44, 4, 14), M.glass, 0, roofY + 2.6, 91, 0, 0, 0, { cast: false, tags: { noDepth: true } });
  add(lounge, box(46, 0.5, 16), M.roof, 0, roofY + 4.8, 91);
  for (let x = -22; x <= 22; x += 5.5) add(lounge, box(0.2, 4, 0.2), M.steelDark, x, roofY + 2.6, 84);
  for (let x = -22; x <= 22; x += 5.5) add(lounge, box(0.2, 4, 0.2), M.steelDark, x, roofY + 2.6, 98);
  mergeByMaterial(lounge);
  g.add(lounge);

  // jet bridges, one per gate; the hero one stays articulated
  const bridges = [];
  const staticBridges = new THREE.Group();
  for (let i = 0; i < GATE_COUNT; i++) {
    const art = i === HERO_GATE;
    bridges.push(buildBridge(M, art ? g : staticBridges, gateX(i), { articulated: art, docked: PARKED_GATES.includes(i) }));
  }
  mergeByMaterial(staticBridges); // seven static bridges → a few draws
  g.add(staticBridges);

  // apron floodlight masts (poles; the heads are Points)
  const masts = new THREE.Group();
  const mast = (x, z) => {
    add(masts, cyl(0.35, 0.5, 28, 8), M.steelDark, x, 14, z);
    add(masts, box(3.4, 0.5, 0.8), M.steelDark, x, 27.8, z);
    add(masts, box(3.0, 0.9, 0.6), M.lightWarm, x, 28.3, z + 0.3, 0, 0, 0, { cast: false });
  };
  for (let x = APRON.x0 + 35; x < APRON.x1; x += 70) mast(x, APRON.z0 + 6);
  for (const x of [APRON.x0 - 8, APRON.x1 + 8]) for (const z of [-100, -40]) mast(x, z);
  for (const x of [HANGAR.x - 70, HANGAR.x + 70]) mast(x, HANGAR.z + HANGAR.d / 2 + 50);
  mergeByMaterial(masts);
  g.add(masts);

  // landside: car park and hotel blocks
  const land = new THREE.Group();
  add(land, box(220, 14, 60), M.concrete, 0, 7, LANDSIDE_ROAD.z + 50);
  for (let f = 1; f < 4; f++) add(land, box(222, 0.3, 62), M.steelDark, 0, f * 3.5, LANDSIDE_ROAD.z + 50);
  add(land, box(60, 38, 30), M.terminalWall, -260, 19, LANDSIDE_ROAD.z + 45);
  add(land, box(60, 38, 30), M.glassDark, -260, 19, LANDSIDE_ROAD.z + 45);
  add(land, box(50, 26, 40), M.terminalWall, 260, 13, LANDSIDE_ROAD.z + 50);
  mergeByMaterial(land);
  g.add(land);

  return { group: g, bridges, shell };
}

/* Jet bridge: rotunda at the concourse, telescoping tunnel, cab. aim(point) swings and extends it. */
function buildBridge(M, parent, gx, { articulated = false, docked = false } = {}) {
  const root = new THREE.Group();
  root.userData.mergeBoundary = true;
  const px = gx + SERVICE_SPOTS.bridge.x - 8, pz = TERMINAL.z0 - 8; // rotunda pivot at the concourse edge
  root.position.set(px, 0, pz);
  // fixed walkway from the concourse to the rotunda
  add(root, box(2.8, 2.8, 2), M.white, 0, 5.9, 1);
  add(root, cyl(0.4, 0.5, 4.6, 8), M.steelDark, 0, 2.3, 0);
  const rotunda = add(root, cyl(2.1, 2.1, 3.2, 16), M.white, 0, 5.9, 0);
  // pivot
  const pivot = new THREE.Group();
  pivot.position.y = 5.9;
  root.add(pivot);
  const tunnelLen = 16;
  const outer = add(pivot, box(2.7, 2.9, tunnelLen), M.white, 0, 0, -tunnelLen / 2 - 1.5);
  add(pivot, box(2.9, 0.4, tunnelLen), M.steelDark, 0, -1.6, -tunnelLen / 2 - 1.5);
  add(pivot, box(2.5, 0.9, tunnelLen - 0.2), M.glassDark, 0, 0.6, -tunnelLen / 2 - 1.5, 0, 0, 0, { cast: false });
  const inner = new THREE.Group();
  inner.position.z = -tunnelLen - 1.5;
  pivot.add(inner);
  const innerLen = 14;
  add(inner, box(2.4, 2.6, innerLen), M.gseSilver, 0, -0.1, -innerLen / 2 + 0.5);
  add(inner, box(2.2, 0.8, innerLen - 0.2), M.glassDark, 0, 0.6, -innerLen / 2 + 0.5, 0, 0, 0, { cast: false });
  // wheel bogie under the inner tunnel's end
  add(inner, box(0.4, 4.6, 0.4), M.steelDark, -0.9, -2.9, -innerLen + 3);
  add(inner, box(0.4, 4.6, 0.4), M.steelDark, 0.9, -2.9, -innerLen + 3);
  add(inner, cyl(0.5, 0.5, 2.6, 10), M.tyre, 0, -5.4, -innerLen + 3, 0, 0, Math.PI / 2);
  // cab at the end, yawed toward the fuselage side
  const cab = new THREE.Group();
  cab.position.z = -innerLen + 0.5;
  inner.add(cab);
  add(cab, box(3.4, 2.8, 2.8), M.white, 0, 0, -1.2);
  add(cab, box(3.0, 1.0, 2.6), M.glassDark, 0, 0.5, -1.2, 0, 0, 0, { cast: false });
  add(cab, box(3.2, 0.2, 1.6), M.hazard, 1.9, -1.3, -1.2);
  const api = {
    root, pivot, inner, cab, gx,
    docked: 0,
    /* 0 = parked (swung back, retracted), 1 = docked at the L1 door */
    set(k) {
      api.docked = k;
      const doorX = gx - 2.1, doorZ = STAND_Z + 13.6, doorY = 3.6 + 0.6;
      const dx = doorX - px, dz = doorZ - pz;
      const yawDock = Math.atan2(-dx, -dz) ; // tunnel points along local -z
      const lenDock = Math.hypot(dx, dz) - 2.5;
      const yaw = THREE.MathUtils.lerp(0.35, yawDock, k);
      const ext = THREE.MathUtils.lerp(tunnelLen + 1.5 - 6, lenDock - innerLen + 0.5, k);
      pivot.rotation.y = yaw;
      inner.position.z = -ext;
      pivot.position.y = THREE.MathUtils.lerp(5.9, doorY + 1.2, k);
      cab.rotation.y = THREE.MathUtils.lerp(0, -yaw + Math.PI / 2 - 0.1, k);
    },
  };
  api.set(docked ? 1 : 0);
  if (articulated) {
    // keep the moving parts as separate merged units
    pivot.userData.mergeBoundary = inner.userData.mergeBoundary = cab.userData.mergeBoundary = true;
    mergeByMaterial(root);
    mergeByMaterial(pivot);
    mergeByMaterial(inner);
    mergeByMaterial(cab);
  } else {
    // baked in its pose by the parent group's merge
    root.userData.mergeBoundary = false;
    api.static = true;
    api.set = () => {};
  }
  parent.add(root);
  return api;
}

/* Control tower with a hidden remote-ops room in the cab. Its shell materials dissolve. */
export function buildTower(M, daylight) {
  const g = new THREE.Group();
  g.name = 'tower';
  g.position.set(TOWER.x, 0, TOWER.z);
  const shaftMat = dissolvePatch(new THREE.MeshStandardMaterial({ color: '#dfe3e8', roughness: 0.6, metalness: 0.1 }));
  const glassMat = dissolvePatch(new THREE.MeshStandardMaterial({ color: '#2a3c50', roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.82, depthWrite: false }));
  glassMat.userData.noDepth = true;
  const darkMat = dissolvePatch(new THREE.MeshStandardMaterial({ color: '#3c4249', roughness: 0.5, metalness: 0.6 }));
  const shell = new THREE.Group();
  shell.userData.mergeBoundary = true;
  add(shell, rbox(16, 9, 16, 0.3), shaftMat, 0, 4.5, 0);
  add(shell, lathe([[0, 9], [5.2, 9], [4.6, 30], [3.4, 56], [3.6, 62], [0, 62]], 24), shaftMat, 0, 0, 0);
  add(shell, lathe([[3.6, 62], [8.4, 63.5], [8.6, 66.2], [7.8, 66.4], [0, 66.4]], 24), darkMat, 0, 0, 0);
  // cab: octagonal glass with mullions, a sloped roof
  const cabY = 66.4, cabH = TOWER.cabH, R = TOWER.cabR;
  add(shell, cyl(R, R, cabH, 8, true), glassMat, 0, cabY + cabH / 2, 0, 0, Math.PI / 8, 0, { cast: false });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    add(shell, box(0.25, cabH, 0.25), darkMat, Math.cos(a) * R, cabY + cabH / 2, Math.sin(a) * R);
  }
  add(shell, cyl(R + 0.8, R + 1.4, 0.5, 8), darkMat, 0, cabY + cabH + 0.25, 0, 0, Math.PI / 8, 0);
  add(shell, lathe([[R + 0.8, cabY + cabH + 0.5], [2, cabY + cabH + 2.6], [0, cabY + cabH + 2.6]], 8, Math.PI + Math.PI / 8), darkMat, 0, 0, 0);
  add(shell, cyl(0.12, 0.2, 10, 6), darkMat, 0, cabY + cabH + 7, 0);
  mergeByMaterial(shell);
  g.add(shell);
  // radar antenna, rotating
  const radar = new THREE.Group();
  radar.position.set(0, cabY + cabH + 3.2, 0);
  add(radar, box(5.5, 0.3, 1.2), M.white, 0, 0.6, 0);
  add(radar, box(5.0, 1.4, 0.15), M.white, 0, 1.4, 0.4);
  add(radar, cyl(0.2, 0.3, 1.2, 6), M.steelDark, 0, 0, 0);
  mergeByMaterial(radar);
  g.add(radar);

  // remote operations room inside the cab
  const ops = new THREE.Group();
  ops.position.y = cabY + 0.2;
  add(ops, cyl(R - 0.3, R - 0.3, 0.3, 16), M.opsDark, 0, 0.15, 0);
  const screens = [];
  const kinds = ['radar', 'strips', 'camera', 'ops', 'radar', 'camera', 'strips', 'camera', 'radar', 'ops'];
  const screenMats = {};
  for (const k of new Set(kinds)) { screenMats[k] = screenMaterial(screenTex(k, 1), 1.1); daylight.glow(screenMats[k], 1.1, 0.4); }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = R - 1.1;
    const sm = screenMats[kinds[i]];
    const s = add(ops, box(3.6, 2.0, 0.12), sm, Math.cos(a) * r, 2.3, Math.sin(a) * r, 0, -a - Math.PI / 2, 0, { cast: false, tags: { noMerge: true } });
    screens.push(s);
    add(ops, box(3.8, 0.9, 0.7), M.opsDesk, Math.cos(a) * (r - 0.5), 1.0, Math.sin(a) * (r - 0.5), 0, -a - Math.PI / 2, 0);
  }
  // operators: capsule silhouettes
  const people = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.9, 4, 8), M.paintDark);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3, r = R - 2.9;
    const p = people.clone();
    p.position.set(Math.cos(a) * r, 1.1, Math.sin(a) * r);
    p.rotation.y = -a - Math.PI / 2;
    ops.add(p);
    add(ops, rbox(0.7, 0.9, 0.7, 0.1), M.opsDesk, Math.cos(a) * (r + 0.4), 0.55, Math.sin(a) * (r + 0.4), 0, -a, 0);
  }
  // central holographic table (the airport map)
  add(ops, cyl(1.6, 1.8, 0.9, 16), M.opsDesk, 0, 0.6, 0);
  const tableMat = new THREE.MeshStandardMaterial({ color: '#0a1a22', emissive: '#5ee7ff', emissiveIntensity: 0.9, roughness: 0.3 });
  const holoTable = add(ops, cyl(1.5, 1.5, 0.05, 24), tableMat, 0, 1.08, 0, 0, 0, 0, { cast: false, tags: { noMerge: true } });
  add(ops, cyl(0.3, 0.3, 0.6, 8), M.steelDark, 0, 0.3, 0);
  mergeByMaterial(ops);
  g.add(ops);

  return { group: g, radar, ops, screens, holoTable, shellMats: [shaftMat, glassMat, darkMat], cabPos: new THREE.Vector3(TOWER.x, cabY + 3, TOWER.z) };
}

/* Hangar open toward +z, with trusses, interior lights, floor markings */
export function buildHangar(M, daylight) {
  const g = new THREE.Group();
  g.name = 'hangar';
  g.position.set(HANGAR.x, 0, HANGAR.z);
  const { w, d, h } = HANGAR;
  const s = new THREE.Group();
  add(s, box(w, 0.1, d), M.concrete, 0, 0.06, 0, 0, 0, 0, { cast: false });
  add(s, box(w, h, 0.8), M.hangarWall, 0, h / 2, -d / 2);
  for (const sx of [-1, 1]) add(s, box(0.8, h, d), M.hangarWall, sx * w / 2, h / 2, 0);
  // roof: shallow arch from boxes
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI, a1 = ((i + 1) / segs) * Math.PI;
    const x0 = -Math.cos(a0) * w / 2, x1 = -Math.cos(a1) * w / 2;
    const y0 = h + Math.sin(a0) * 6, y1 = h + Math.sin(a1) * 6;
    const len = Math.hypot(x1 - x0, y1 - y0);
    add(s, box(len + 0.6, 0.5, d + 1), M.hangarRoof, (x0 + x1) / 2, (y0 + y1) / 2, 0, 0, 0, Math.atan2(y1 - y0, x1 - x0));
  }
  // front header beam + door tracks
  add(s, box(w, 3, 1.2), M.hangarWall, 0, h - 1.5, d / 2);
  for (const sx of [-1, 1]) add(s, box(w * 0.18, h - 3, 0.6), M.steelDark, sx * (w / 2 - w * 0.09), (h - 3) / 2, d / 2 + 0.8); // doors parked open at the sides
  // trusses
  for (let z = -d / 2 + 8; z < d / 2; z += 12) {
    add(s, box(w - 2, 0.6, 0.6), M.steel, 0, h - 1, z);
    for (let x = -w / 2 + 8; x < w / 2; x += 10) add(s, box(0.3, 4, 0.3), M.steel, x, h + 1, z, 0, 0, 0.3);
  }
  // floor markings
  for (const z of [-20, 0, 20]) add(s, box(w - 10, 0.02, 0.3), M.gseYellow, 0, 0.12, z, 0, 0, 0, { cast: false });
  add(s, box(0.3, 0.02, d - 10), M.gseYellow, 0, 0.12, 0, 0, 0, 0, { cast: false });
  // tool carts and benches along the walls
  const r = rng(5);
  for (let i = 0; i < 10; i++) {
    const x = -w / 2 + 3 + r() * 4, z = -d / 2 + 6 + i * 8;
    add(s, rbox(1.2, 1.0, 2.2, 0.05), [M.gseRed, M.gseBlue, M.gseYellow][i % 3], x, 0.5, z);
    add(s, rbox(2.4, 0.9, 0.9, 0.05), M.steel, w / 2 - 2.5, 0.45, z);
  }
  mergeByMaterial(s);
  g.add(s);
  // interior light panels (always on inside, brighter at night)
  const lamps = new THREE.Group();
  const lampMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#e8f0ff', emissiveIntensity: 1.5 });
  daylight.glow(lampMat, 1.3, 1.2);
  for (let z = -d / 2 + 12; z < d / 2; z += 16) for (const x of [-w / 3, 0, w / 3]) add(lamps, box(6, 0.2, 1.2), lampMat, x, h - 1.8, z, 0, 0, 0, { cast: false });
  mergeByMaterial(lamps);
  g.add(lamps);
  return { group: g, lampMat, aircraftPos: new THREE.Vector3(HANGAR.x, 0, HANGAR.z - 4) };
}

/* Fuel farm, substation, data centre and the city skyline */
export function buildUtilities(M, daylight) {
  const g = new THREE.Group();
  g.name = 'utilities';
  // fuel farm
  const ff = new THREE.Group();
  ff.position.set(FUEL_FARM.x, 0, FUEL_FARM.z);
  add(ff, box(100, 1.6, 70), M.concrete, 0, 0.8, 0);
  add(ff, box(104, 1.2, 1), M.hazard, 0, 2.1, -35.5);
  add(ff, box(104, 1.2, 1), M.hazard, 0, 2.1, 35.5);
  for (const [tx, tz] of FUEL_FARM.tanks) {
    add(ff, cyl(FUEL_FARM.r, FUEL_FARM.r, FUEL_FARM.h, 24), M.gseWhite, tx, 1.6 + FUEL_FARM.h / 2, tz);
    add(ff, cyl(FUEL_FARM.r * 0.3, FUEL_FARM.r, 1.6, 24), M.gseSilver, tx, 1.6 + FUEL_FARM.h + 0.8, tz);
    add(ff, cyl(0.25, 0.25, 50, 8), M.gseOrange, tx + 10, 2.3, tz - 14, 0, 0, Math.PI / 2);
    add(ff, box(2, 2.2, 2), M.gseDark, tx, 2.7, tz + FUEL_FARM.r + 2);
  }
  add(ff, box(16, 6, 8), M.terminalWall, 42, 4.6, 26);
  mergeByMaterial(ff);
  g.add(ff);
  // substation
  const sub = new THREE.Group();
  sub.position.set(SUBSTATION.x, 0, SUBSTATION.z);
  add(sub, box(60, 0.4, 40), M.concrete, 0, 0.2, 0);
  for (let i = 0; i < 4; i++) {
    add(sub, box(5, 4, 3.5), M.gseDark, -20 + i * 13, 2.4, -8);
    for (let k = 0; k < 3; k++) add(sub, cyl(0.25, 0.35, 2.2, 8), M.white, -21.5 + i * 13 + k * 1.5, 5.5, -8);
    add(sub, box(3, 6, 3), M.steelDark, -20 + i * 13, 3.4, 8);
  }
  add(sub, box(14, 5, 8), M.terminalWall, 20, 2.9, 10);
  mergeByMaterial(sub);
  g.add(sub);
  // data centre
  const dc = new THREE.Group();
  dc.position.set(DATA_CENTRE.x, 0, DATA_CENTRE.z);
  add(dc, box(70, 10, 36), M.paintDark, 0, 5, 0);
  for (let i = 0; i < 6; i++) add(dc, box(6, 2.4, 4), M.gseSilver, -25 + i * 10, 11.2, -10);
  add(dc, box(70, 0.6, 2), M.lightCyan, 0, 6, 18.2, 0, 0, 0, { cast: false });
  mergeByMaterial(dc);
  g.add(dc);

  // city skyline: instanced boxes with lit windows
  const r = rng(2035);
  const count = 160;
  const geo = boxUV(new THREE.BoxGeometry(1, 1, 1), 0.08);
  geo.translate(0, 0.5, 0);
  const city = new THREE.InstancedMesh(geo, M.city, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const x = CITY.x0 + r() * (CITY.x1 - CITY.x0), z = CITY.z0 + r() * (CITY.z1 - CITY.z0);
    const central = 1 - Math.min(1, Math.abs(x) / 900);
    const h = 18 + r() * r() * 130 * (0.4 + central) + 10;
    const w = 18 + r() * 30, d = 18 + r() * 30;
    m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 0.3, 0)), new THREE.Vector3(w, h, d));
    city.setMatrixAt(i, m);
  }
  city.instanceMatrix.needsUpdate = true;
  city.castShadow = false;
  city.receiveShadow = false;
  city.frustumCulled = false;
  daylight.glow(M.city, 0.0, 1.6);
  g.add(city);
  // distant hills (dark silhouette band) toward the north and the city base haze
  const hills = new THREE.Mesh(new THREE.PlaneGeometry(3200, 90), new THREE.MeshStandardMaterial({ color: '#2a3a2c', roughness: 1 }));
  hills.position.set(0, 20, -1500);
  hills.castShadow = false;
  g.add(hills);
  return { group: g, city };
}

export { M4 };
