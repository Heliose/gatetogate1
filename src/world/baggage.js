import * as THREE from 'three';
import { add, box, cyl, rbox, torus, mergeByMaterial, beltStrip } from '../core/geo.js';
import { SpeedPath, curveFrom, orientAlong } from '../core/curves.js';
import { rng } from '../core/rng.js';
import { flatWhite } from '../core/canvas.js';
import { screenMaterial, TIME } from './materials.js';
import { screenTex, bagTagTex } from './textures.js';
import { BAG_ROUTE, BASEMENT } from './layout.js';
import { crowd, baggageTug, baggageCart, beltLoader } from './vehicles.js';

/* ------------------------------------------------------------------ *
 * The baggage system: check-in desks, a drop chute, the CT scanner,
 * the sorter maze with hundreds of moving bags, the make-up area, the
 * cart that drives up the ramp to the stand, and the hero suitcase.
 * Every belt is one continuous strip along the exact route curve, so
 * the bag always sits on it (belt top = route − 1 cm).
 * ------------------------------------------------------------------ */

const BELT_TOP = -0.01;   // belt surface relative to the route point (the bag's base)
const BELT_THICK = 0.12;

/* Suitcase shell material with a CT "see-through" state */
export function bagMaterial(color = '#2d5f8f') {
  const U = { uScan: { value: 0 }, uScanTint: { value: new THREE.Color('#3fb8ff') } };
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.08, map: flatWhite, transparent: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, TIME);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uScan, uTime; uniform vec3 uScanTint;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, uScanTint * 0.5, uScan);
        diffuseColor.a *= mix(1.0, 0.1, uScan);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float fres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.5);
          float sl = 0.5 + 0.5 * sin(vViewPosition.y * 60.0 + uTime * 8.0);
          totalEmissiveRadiance += uScanTint * uScan * (fres * 1.6 + 0.15 + sl * 0.1); }`);
  };
  m.customProgramCacheKey = () => 'bag-ct';
  m.userData.ct = U;
  return m;
}

/* belt + rails + legs along a curve between arc fractions */
function conveyor(M, parent, curve, u0, u1, { width = 1.1, closed = false, legs = true } = {}) {
  const yc = BELT_TOP - BELT_THICK / 2;
  add(parent, beltStrip(curve, u0, u1, { width, thick: BELT_THICK, yOffset: yc, closed }), M.belt, 0, 0, 0, 0, 0, 0, { cast: false });
  for (const s of [-1, 1]) add(parent, beltStrip(curve, u0, u1, { width: 0.07, thick: 0.22, yOffset: yc + 0.05, xOffset: s * (width / 2 + 0.05), closed }), M.conveyorRail, 0, 0, 0, 0, 0, 0, { cast: false });
  add(parent, beltStrip(curve, u0, u1, { width: width + 0.26, thick: 0.05, yOffset: yc - BELT_THICK / 2 - 0.03, closed }), M.conveyorFrame, 0, 0, 0, 0, 0, 0, { cast: false });
  if (!legs) return;
  const len = curve.getLength() * (u1 - u0);
  const P = new THREE.Vector3();
  for (let d = 1.5; d < len; d += 3) {
    const u = u0 + (u1 - u0) * (d / len);
    curve.getPointAt(closed ? u % 1 : u, P);
    const floor = P.y > -1.2 ? 0 : BASEMENT.floorY;
    const top = P.y + yc - BELT_THICK / 2 - 0.05;
    if (top - floor > 0.3) add(parent, box(0.08, top - floor, 0.08), M.conveyorFrame, P.x, (top + floor) / 2, P.z);
  }
}

export function buildBaggage(M, daylight) {
  const g = new THREE.Group();
  g.name = 'baggage';
  const r = rng(21);
  const pts = BAG_ROUTE.points;

  // route for the hero bag (built first: the belts follow its exact curve)
  const route = new SpeedPath(pts, BAG_ROUTE.speeds, { tension: 0.5 });
  const wpU = route.wpU;

  // ---- conveyors along the hero route: check-in → make-up, and the belt loader climb ----
  const belts = new THREE.Group();
  conveyor(M, belts, route.curve, 0, wpU[BAG_ROUTE.cartFrom - 1], { width: 1.0 });
  conveyor(M, belts, route.curve, wpU[BAG_ROUTE.cartTo], wpU[BAG_ROUTE.loaderTo], { width: 0.9, legs: false });
  mergeByMaterial(belts);
  g.add(belts);

  // ---- secondary sorter loops with instanced bags ----
  const loops = [
    [[-150, -6.3, 66], [-90, -6.3, 66], [-80, -6.3, 90], [-100, -6.3, 120], [-150, -6.3, 126], [-170, -6.3, 100]],
    [[-30, -6.3, 90], [40, -6.3, 100], [60, -6.3, 124], [10, -6.3, 134], [-40, -6.3, 124], [-50, -6.3, 106]],
    [[90, -6.3, 60], [160, -6.3, 70], [190, -6.3, 100], [150, -6.3, 130], [100, -6.3, 120], [80, -6.3, 90]],
  ];
  const loopCurves = loops.map((pl) => curveFrom(pl, { closed: true, tension: 0.5 }));
  const loopBelts = new THREE.Group();
  for (const c of loopCurves) conveyor(M, loopBelts, c, 0, 1, { width: 1.1, closed: true });
  mergeByMaterial(loopBelts);
  g.add(loopBelts);
  const BAG_N = 260;
  const bagGeo = rbox(0.62, 0.26, 0.42, 0.06);
  bagGeo.translate(0, 0.13, 0); // base at the origin, so instances sit on the belt
  const bagMat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05 });
  const bags = new THREE.InstancedMesh(bagGeo, bagMat, BAG_N);
  bags.castShadow = false;
  bags.frustumCulled = false;
  const bagCols = ['#2d5f8f', '#1a1d22', '#8a2f22', '#c7b89c', '#4d5b4a', '#b0693e', '#d8452c', '#6a7a8c', '#ffb347', '#e9e2d4'];
  const bagState = [];
  const cc = new THREE.Color();
  for (let i = 0; i < BAG_N; i++) {
    const li = i % loopCurves.length;
    const c = loopCurves[li];
    bagState.push({ curve: c, len: c.getLength(), u: r(), speed: 1.8 + r() * 1.2, rot: r() * 0.4 - 0.2, s: 0.85 + r() * 0.4 });
    cc.set(bagCols[Math.floor(r() * bagCols.length)]);
    bags.setColorAt(i, cc);
  }
  bags.instanceColor.needsUpdate = true;
  g.add(bags);

  // ---- check-in: desks and queue ----
  const checkin = new THREE.Group();
  const deskScreen = screenMaterial(screenTex('board', 3), 0.9);
  daylight.glow(deskScreen, 0.9, 0.4);
  for (let i = -3; i <= 3; i++) {
    const x = -60 + i * 6;
    add(checkin, rbox(2.6, 1.1, 1.0, 0.04), M.white, x, 0.55, 130);
    add(checkin, box(2.6, 0.12, 1.0), M.steelDark, x, 1.16, 130);
    add(checkin, box(0.9, 0.55, 0.06), deskScreen, x, 1.6, 129.6, 0, 0, 0, { cast: false });
    add(checkin, box(0.9, 0.12, 1.4), M.belt, x + 1.6, 0.85, 128, 0, 0, 0, { cast: false });
  }
  // hatch where the belt dives through the floor
  add(checkin, box(2.0, 0.4, 2.2), M.cabinDark, -60, -0.2, 110);
  add(checkin, box(2.2, 0.08, 2.4), M.hazard, -60, 0.02, 110, 0, 0, 0, { cast: false });
  mergeByMaterial(checkin);
  g.add(checkin);
  const people = crowd(M, 36, '#3b4756');
  const pm = new THREE.Matrix4();
  for (let i = 0; i < 36; i++) {
    const lane = i % 6, k = Math.floor(i / 6);
    pm.compose(new THREE.Vector3(-60 + (lane - 2.5) * 6 + (r() - 0.5) * 0.8, 0, 132.5 + k * 1.2 + r() * 0.4), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI + (r() - 0.5) * 0.6, 0)), new THREE.Vector3(1, 1, 1));
    people.setMatrixAt(i, pm);
  }
  people.instanceMatrix.needsUpdate = true;
  g.add(people);

  // ---- CT scanner: a translucent shell around an open tunnel, so the scan reads from outside ----
  const ct = new THREE.Group();
  const beltY = -6.3 + BELT_TOP;           // belt surface height inside the scanner
  ct.position.set(-60, beltY, BAG_ROUTE.ctZ);
  const ctShell = M.ctBody.clone();
  ctShell.transparent = true;
  ctShell.opacity = 0.42;
  ctShell.depthWrite = false;
  ctShell.userData.noDepth = true;
  const tunnelH = 1.5, tunnelW = 1.6;
  const top = add(ct, rbox(3.2, 1.0, 4.2, 0.1), ctShell, 0, tunnelH + 0.5, 0, 0, 0, 0, { cast: false });
  top.renderOrder = 1;
  for (const s of [-1, 1]) { const w = add(ct, rbox(0.8, tunnelH + 1.0, 4.2, 0.1), ctShell, s * (tunnelW / 2 + 0.4), (tunnelH + 1.0) / 2 - 0.5, 0, 0, 0, 0, { cast: false }); w.renderOrder = 1; }
  // tunnel frame + scanning ring (its own material, so pulsing it touches nothing else)
  for (const z of [-2.0, 2.0]) add(ct, torus(1.0, 0.05, 8, 32), M.steelDark, 0, 0.75, z, 0, 0, 0, { cast: false });
  const ringMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#5ee7ff', emissiveIntensity: 2, roughness: 0.4 });
  const ring = add(ct, torus(1.0, 0.07, 8, 32), ringMat, 0, 0.75, 0, 0, 0, 0, { cast: false, tags: { noMerge: true } });
  add(ct, box(3.22, 0.12, 4.2), M.lightCyan, 0, tunnelH + 1.05, 0, 0, 0, 0, { cast: false });
  const ctScreenMat = screenMaterial(screenTex('ct'), 1.2);
  daylight.glow(ctScreenMat, 1.2, 0.3);
  add(ct, box(1.6, 1.0, 0.08), ctScreenMat, 1.75, 1.6, 0, 0, Math.PI / 2, 0, { cast: false, tags: { noMerge: true } });
  add(ct, box(0.3, 1.8, 0.3), M.steelDark, 1.85, 0.6, 0);
  mergeByMaterial(ct);
  g.add(ct);

  // ---- make-up area on the hall floor: ULDs on dollies, waiting carts ----
  const floorY = BASEMENT.floorY;
  const makeup = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const x = 118 + i * 7;
    add(makeup, box(2.6, 0.12, 1.8), M.gseDark, x, floorY + 0.36, 42);
    for (const [dx, dz] of [[-1, -0.7], [1, -0.7], [-1, 0.7], [1, 0.7]]) add(makeup, cyl(0.18, 0.18, 0.12, 10), M.tyre, x + dx, floorY + 0.18, 42 + dz, 0, 0, Math.PI / 2);
    add(makeup, rbox(2.4, 1.6, 1.6, 0.14), M.uld, x, floorY + 0.42 + 0.8, 42);
  }
  // the cart ramp: a sloped slab with kerbs, from the hall floor up to the apron
  const R = BAG_ROUTE.ramp;
  const rampLen = Math.hypot(R.z0 - R.z1, R.y1 - R.y0);
  const tilt = Math.atan2(R.y1 - R.y0, R.z0 - R.z1);
  const rampY = (R.y0 + R.y1) / 2 - 0.15, rampZ = (R.z0 + R.z1) / 2;
  add(makeup, box(10, 0.3, rampLen + 1.2), M.concrete, R.x, rampY, rampZ, tilt, 0, 0);
  for (const s of [-1, 1]) add(makeup, box(0.3, 0.6, rampLen + 1.2), M.basement, R.x + s * 5.15, rampY + 0.3, rampZ, tilt, 0, 0);
  // portal where the ramp leaves the terminal front
  add(makeup, box(11.4, 0.6, 2.4), M.paintDark, R.x, 4.3, 21);
  for (const s of [-1, 1]) add(makeup, box(0.5, 4.6, 2.4), M.paintDark, R.x + s * 5.45, 2.0, 21);
  add(makeup, box(11, 0.3, 1.2), M.hazard, R.x, 4.1, 22.4, 0, 0, 0, { cast: false });
  mergeByMaterial(makeup);
  g.add(makeup);

  // ---- the ride: tug + cart; positioned by place() ----
  const tug = baggageTug(M);
  const cart = baggageCart(M, 9);
  g.add(tug.group, cart.group);
  tug.group.visible = cart.group.visible = false;

  // ---- belt loader at the hero aircraft's forward hold (its own belt is hidden: the strip is the belt) ----
  const loader = beltLoader(M);
  const a = pts[BAG_ROUTE.cartTo], b = pts[BAG_ROUTE.cartTo + 1];
  loader.group.position.set(a[0] + 0.3, 0.05, a[2] + 0.6);
  loader.group.rotation.y = Math.atan2(b[0] - a[0], b[2] - a[2]);
  loader.belt.visible = false;
  g.add(loader.group);

  // ---- hero bag ----
  const hero = new THREE.Group();
  hero.name = 'heroBag';
  const shellMat = bagMaterial('#2d5f8f');
  const bagW = 0.46, bagH = 0.26, bagL = 0.72;
  const shell = add(hero, rbox(bagW, bagH, bagL, 0.06), shellMat, 0, bagH / 2, 0, 0, 0, 0, { tags: { noMerge: true } });
  shell.renderOrder = 2;
  add(hero, box(bagW + 0.01, 0.02, 0.025), M.bagDark, 0, bagH / 2 + 0.003, 0.0);
  for (const s of [-1, 1]) add(hero, cyl(0.035, 0.035, 0.03, 10), M.bagDark, s * (bagW / 2 - 0.05), 0.035, -bagL / 2 + 0.03, 0, 0, Math.PI / 2);
  add(hero, box(0.08, 0.04, 0.14), M.bagDark, 0, bagH / 2 + 0.02, bagL / 2 - 0.1);
  const tagMat = new THREE.MeshStandardMaterial({ map: bagTagTex('LIS'), roughness: 0.8, side: THREE.DoubleSide });
  add(hero, box(0.09, 0.002, 0.045), tagMat, bagW / 2 - 0.06, bagH + 0.01, bagL / 2 - 0.2, 0, 0.3, 0, { cast: false });
  // inner items for the CT view (false colour)
  const inner = new THREE.Group();
  const item = (geo, color, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, transparent: true, opacity: 0, roughness: 0.6, depthWrite: false });
    const o = add(inner, geo, m, x, y, z, rx, ry, rz, { cast: false, tags: { noMerge: true, noDepth: true } });
    o.renderOrder = 3;
    return m;
  };
  const innerMats = [
    item(rbox(0.3, 0.02, 0.22, 0.01), '#ffaa3c', 0, 0.16, 0.08, 0, 0.1, 0),          // laptop
    item(rbox(0.3, 0.1, 0.22, 0.05), '#78ffb4', -0.05, 0.08, 0.1, 0, 0.2, 0),          // clothes roll
    item(cyl(0.03, 0.03, 0.18, 10), '#ff5a5a', 0.15, 0.08, -0.2, 0.2, 0, 0.3),         // bottle
    item(rbox(0.1, 0.06, 0.26, 0.03), '#ffffff', -0.14, 0.05, -0.18, 0, -0.2, 0),      // shoes
    item(rbox(0.06, 0.05, 0.06, 0.02), '#ffe066', 0.15, 0.05, 0.25),                   // charger
  ];
  hero.add(inner);
  mergeByMaterial(hero);
  g.add(hero);

  // ---- update ----
  const _o = new THREE.Object3D(), _p = new THREE.Vector3(), _t = new THREE.Vector3(), _ht = new THREE.Vector3();
  let bagFlow = 1;
  const api = {
    group: g, hero, shellMat, innerMats, route, ct, ring, tug, cart, loader, bags, people, loopCurves,
    ctU: shellMat.userData.ct,
    cartRange: [wpU[BAG_ROUTE.cartFrom], wpU[BAG_ROUTE.cartTo]],
    ctRange: [wpU[BAG_ROUTE.ctFrom], wpU[BAG_ROUTE.ctTo]],
    setBagColor(c) { shellMat.color.set(c); },
    setScan(k) {
      shellMat.userData.ct.uScan.value = k;
      shellMat.depthWrite = k < 0.05;
      for (const m of innerMats) m.opacity = k * 0.95;
      ringMat.emissiveIntensity = 2 + k * 5;
    },
    setBagFlow(k) { bagFlow = k; },
    /* place the hero (and the cart) at arc fraction u; the route already is the bag's base height */
    place(u) {
      route.pointAtU(u, _p);
      route.tangentAtU(u, _t);
      const [c0, c1] = api.cartRange;
      const onCart = THREE.MathUtils.smoothstep(u, c0 - 0.004, c0 + 0.004) * (1 - THREE.MathUtils.smoothstep(u, c1 - 0.004, c1 + 0.004));
      hero.position.copy(_p);
      _ht.copy(_t);
      orientAlong(hero, _t, 0, u > c0);
      hero.rotation.z = 0;
      // the cart waits at the pick-up, carries the bag, then waits at the loader
      const uc = THREE.MathUtils.clamp(u, c0, c1);
      route.pointAtU(uc, _p);
      route.tangentAtU(uc, _t);
      _t.y = 0;
      _t.normalize();
      cart.group.position.set(_p.x, _p.y - 0.95, _p.z);
      orientAlong(cart.group, _t, 0, true);
      tug.group.position.copy(cart.group.position).addScaledVector(_t, 3.6);
      orientAlong(tug.group, _t, 0, true);
      return { pos: hero.position, tan: _ht, onCart };
    },
    update(dt) {
      if (!g.visible) return;
      for (let i = 0; i < BAG_N; i++) {
        const s = bagState[i];
        s.u = (s.u + (s.speed * bagFlow * dt) / s.len) % 1;
        s.curve.getPointAt(s.u, _p);
        s.curve.getTangentAt(s.u, _t);
        _o.position.copy(_p);
        _o.position.y += BELT_TOP;
        orientAlong(_o, _t);
        _o.rotateY(s.rot);
        _o.scale.setScalar(s.s);
        _o.updateMatrix();
        bags.setMatrixAt(i, _o.matrix);
      }
      bags.instanceMatrix.needsUpdate = true;
      M.belt.map.offset.y -= dt * 0.9 * bagFlow;
    },
  };
  return api;
}
