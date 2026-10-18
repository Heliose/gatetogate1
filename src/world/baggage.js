import * as THREE from 'three';
import { add, box, cyl, rbox, torus, mergeByMaterial, boxUV } from '../core/geo.js';
import { SpeedPath, curveFrom, orientAlong } from '../core/curves.js';
import { rng } from '../core/rng.js';
import { flatWhite } from '../core/canvas.js';
import { screenMaterial, TIME } from './materials.js';
import { screenTex, bagTagTex } from './textures.js';
import { BAG_ROUTE, BASEMENT, CHECKIN, TERMINAL } from './layout.js';
import { crowd, baggageTug, baggageCart, beltLoader } from './vehicles.js';

/* ------------------------------------------------------------------ *
 * The baggage system: check-in desks, a drop chute, the CT scanner,
 * the sorter maze with hundreds of moving bags, the make-up area, the
 * cart that drives to the stand, and the hero suitcase itself.
 * ------------------------------------------------------------------ */

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

export function buildBaggage(M, daylight) {
  const g = new THREE.Group();
  g.name = 'baggage';
  const r = rng(21);
  const pts = BAG_ROUTE.points;

  // ---- conveyors along the hero route up to the make-up area ----
  const belts = new THREE.Group();
  const beltSeg = (a, b, w = 1.0) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const seg = new THREE.Group();
    seg.position.set(mid[0], mid[1] - 0.2, mid[2]);
    seg.lookAt(b[0], b[1] - 0.2, b[2]);
    const bg = box(w, 0.12, len + 0.2);
    const uv = bg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.6, uv.getY(i) * 0.55);
    add(seg, bg, M.belt, 0, 0, 0, 0, 0, 0, { cast: false });
    add(seg, box(0.08, 0.3, len + 0.2), M.conveyorRail, -w / 2 - 0.04, 0.08, 0);
    add(seg, box(0.08, 0.3, len + 0.2), M.conveyorRail, w / 2 + 0.04, 0.08, 0);
    add(seg, box(w + 0.3, 0.06, len + 0.2), M.conveyorFrame, 0, -0.14, 0);
    return seg;
  };
  for (let i = 0; i < BAG_ROUTE.cartFrom; i++) {
    const a = pts[i], b = pts[i + 1];
    const seg = beltSeg(a, b, i < 3 ? 0.9 : 1.1);
    belts.add(seg);
    // legs
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    for (let d = 1.5; d < len; d += 3) {
      const t = d / len;
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
      const floor = y > -1 ? 0 : BASEMENT.floorY;
      if (y - floor > 0.4) add(belts, box(0.08, y - 0.3 - floor, 0.08), M.conveyorFrame, x, (y - 0.3 + floor) / 2, z);
    }
  }
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
  for (const c of loopCurves) {
    const n = 48;
    for (let i = 0; i < n; i++) {
      const a = c.getPointAt(i / n), b = c.getPointAt(((i + 1) % n) / n);
      loopBelts.add(beltSeg([a.x, a.y, a.z], [b.x, b.y, b.z], 1.1));
      if (i % 3 === 0) add(loopBelts, box(0.08, a.y - 0.3 - BASEMENT.floorY, 0.08), M.conveyorFrame, a.x, (a.y - 0.3 + BASEMENT.floorY) / 2, a.z);
    }
  }
  mergeByMaterial(loopBelts);
  g.add(loopBelts);
  const BAG_N = 260;
  const bagGeo = rbox(0.62, 0.26, 0.42, 0.06);
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

  // ---- CT scanner around the route at z ≈ ctZ ----
  const ct = new THREE.Group();
  ct.position.set(-60, -6.3 - 0.3, BAG_ROUTE.ctZ);
  add(ct, rbox(3.2, 2.6, 4.2, 0.12), M.ctBody, 0, 1.0, 0);
  add(ct, box(1.5, 1.4, 4.4), M.ctInner, 0, 0.75, 0, 0, 0, 0, { cast: false });
  add(ct, box(1.6, 1.5, 0.3), M.ctInner, 0, 0.8, 2.1, 0, 0, 0, { cast: false });
  add(ct, box(1.6, 1.5, 0.3), M.ctInner, 0, 0.8, -2.1, 0, 0, 0, { cast: false });
  add(ct, box(3.22, 0.12, 4.2), M.lightCyan, 0, 2.2, 0, 0, 0, 0, { cast: false, tags: { noMerge: true } });
  const ring = add(ct, torus(1.0, 0.07, 8, 32), M.lightCyan, 0, 0.8, 0, 0, 0, 0, { cast: false, tags: { noMerge: true } });
  const ctScreenMat = screenMaterial(screenTex('ct'), 1.2);
  daylight.glow(ctScreenMat, 1.2, 0.3);
  add(ct, box(1.6, 1.0, 0.08), ctScreenMat, 1.65, 1.9, 0, 0, Math.PI / 2, 0, { cast: false, tags: { noMerge: true } });
  add(ct, box(0.3, 1.6, 0.3), M.ctBody, 1.75, 1.0, 0);
  mergeByMaterial(ct);
  g.add(ct);

  // ---- make-up area: ULDs and a dolly row near x 100..120 ----
  const makeup = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const x = 96 + i * 7;
    add(makeup, rbox(2.4, 1.6, 1.6, 0.14), M.uld, x, -6.3 + 0.9, 42);
    add(makeup, box(2.6, 0.1, 1.8), M.gseDark, x, -6.3 + 0.05, 42);
  }
  // ramp walls up to the apron
  add(makeup, box(0.4, 7, 60), M.basement, 149, -3.5, 36 - 7.5 + 2);
  add(makeup, box(0.4, 7, 60), M.basement, 149, -3.5, 36 + 7.5 - 2);
  mergeByMaterial(makeup);
  g.add(makeup);
  // ramp surface from (120, -6.3) to (206, 0) along x
  const ramp = add(g, box(90, 0.3, 10), M.concrete, 163, -3.4, 36, 0, 0, Math.atan2(6.3, 86));
  ramp.receiveShadow = true;

  // ---- the ride: tug + cart for the apron stretch ----
  const tug = baggageTug(M);
  const cart = baggageCart(M, 9);
  g.add(tug.group, cart.group);
  tug.group.visible = cart.group.visible = false;

  // ---- belt loader at the hero aircraft fwd hold ----
  const loader = beltLoader(M);
  loader.group.position.set(130.2, 0.05, -21.6);
  loader.group.rotation.y = -0.45;
  loader.belt.rotation.x = -0.36;
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

  // route for the hero bag
  const route = new SpeedPath(pts, BAG_ROUTE.speeds, { tension: 0.5 });
  const wpU = route.wpU;

  // ---- update ----
  const _o = new THREE.Object3D(), _p = new THREE.Vector3(), _t = new THREE.Vector3();
  let bagFlow = 1;
  const api = {
    group: g, hero, shellMat, innerMats, route, ct, ring, tug, cart, loader, bags, people, loopCurves,
    ctU: shellMat.userData.ct,
    cartRange: [wpU[BAG_ROUTE.cartFrom], wpU[BAG_ROUTE.cartTo]],
    ctRange: [wpU[7], wpU[9]],
    setBagColor(c) { shellMat.color.set(c); },
    setScan(k) {
      shellMat.userData.ct.uScan.value = k;
      shellMat.depthWrite = k < 0.05;
      for (const m of innerMats) m.opacity = k * 0.95;
      ring.material.emissiveIntensity = 2 + k * 6;
    },
    setBagFlow(k) { bagFlow = k; },
    /* place the hero (and the cart) at arc fraction u */
    place(u) {
      route.pointAtU(u, _p);
      route.tangentAtU(u, _t);
      const [c0, c1] = api.cartRange;
      const onCart = THREE.MathUtils.smoothstep(u, c0 - 0.004, c0 + 0.004) * (1 - THREE.MathUtils.smoothstep(u, c1 - 0.004, c1 + 0.004));
      hero.position.copy(_p);
      hero.position.y += onCart * 0.95;
      orientAlong(hero, _t, 0, u > c0);
      hero.rotation.z = 0;
      const show = u > c0 - 0.03 && u < c1 + 0.08;
      tug.group.visible = cart.group.visible = show;
      if (show) {
        const uc = THREE.MathUtils.clamp(u, c0, c1);
        route.pointAtU(uc, _p);
        route.tangentAtU(uc, _t);
        _t.y = 0;
        _t.normalize();
        cart.group.position.set(_p.x, 0.05, _p.z);
        orientAlong(cart.group, _t, 0, true);
        tug.group.position.copy(cart.group.position).addScaledVector(_t, 3.6);
        orientAlong(tug.group, _t, 0, true);
      }
      return { pos: hero.position, tan: _t, onCart };
    },
    update(dt) {
      if (!g.visible) return;
      for (let i = 0; i < BAG_N; i++) {
        const s = bagState[i];
        s.u = (s.u + (s.speed * bagFlow * dt) / s.len) % 1;
        s.curve.getPointAt(s.u, _p);
        s.curve.getTangentAt(s.u, _t);
        _o.position.copy(_p);
        _o.position.y += 0.0;
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
