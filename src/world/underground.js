import * as THREE from 'three';
import { add, box, cyl, rbox, pathTube, mergeByMaterial } from '../core/geo.js';
import { curveFrom, roundedPolyline, orientAlong } from '../core/curves.js';
import { rng } from '../core/rng.js';
import { flowMaterial } from './materials.js';
import { UNDERGROUND, BASEMENT, TOWER, FUEL_FARM, SUBSTATION, DATA_CENTRE } from './layout.js';

/* ------------------------------------------------------------------ *
 * The hidden airport: networks as pulsing tubes (one draw each),
 * baggage pods and people-mover trains moving inside their tunnels,
 * plant rooms, and the basement shell under the terminal.
 * ------------------------------------------------------------------ */
export function buildUnderground(M) {
  const g = new THREE.Group();
  g.name = 'underground';
  const nets = {};
  const r = rng(11);

  // basement shell (the baggage hall lives inside it: see baggage.js)
  const shell = new THREE.Group();
  const { x0, x1, z0, z1, floorY, ceilY } = BASEMENT;
  const W = x1 - x0, D = z1 - z0;
  add(shell, box(W, 0.5, D), M.basement, (x0 + x1) / 2, floorY - 0.25, (z0 + z1) / 2, 0, 0, 0, { cast: false });
  for (const x of [x0, x1]) add(shell, box(0.6, ceilY - floorY, D), M.basement, x, (floorY + ceilY) / 2, (z0 + z1) / 2);
  add(shell, box(W, ceilY - floorY, 0.6), M.basement, (x0 + x1) / 2, (floorY + ceilY) / 2, z1);
  // north wall, split around the cart ramp portal
  add(shell, box(210 - x0, ceilY - floorY, 0.6), M.basement, (x0 + 210) / 2, (floorY + ceilY) / 2, z0);
  add(shell, box(x1 - 222, ceilY - floorY, 0.6), M.basement, (222 + x1) / 2, (floorY + ceilY) / 2, z0);
  for (let x = x0 + 20; x < x1; x += 40) for (let z = z0 + 20; z < z1; z += 40) add(shell, box(1.2, ceilY - floorY, 1.2), M.basement, x, (floorY + ceilY) / 2, z);
  // ceiling light strips
  for (let x = x0 + 30; x < x1; x += 60) add(shell, box(40, 0.15, 0.6), M.panelLight, x, ceilY - 0.2, (z0 + z1) / 2, 0, 0, 0, { cast: false });
  mergeByMaterial(shell);
  g.add(shell);

  // plant rooms
  const rooms = new THREE.Group();
  const room = (x, y, z, w, h, d, mat, light) => {
    add(rooms, box(w, h, d), mat, x, y + h / 2, z);
    if (light) add(rooms, box(w * 0.7, 0.1, 0.4), light, x, y + h - 0.3, z, 0, 0, 0, { cast: false });
  };
  room(FUEL_FARM.x - 110, -8, FUEL_FARM.z + 10, 24, 6, 14, M.basement, M.lightAmber);     // hydrant pump house
  room(SUBSTATION.x, -9, SUBSTATION.z - 60, 20, 7, 20, M.basement, M.lightWarm);           // switchgear vault
  room(DATA_CENTRE.x, -9, DATA_CENTRE.z - 60, 26, 7, 18, M.basement, M.lightCyan);         // network hub
  room(TOWER.x, -7, TOWER.z - 40, 14, 5, 14, M.basement, M.lightCyan);                     // tower data vault
  room(0, -10, -70, 30, 7, 16, M.basement, M.lightAmber);                                   // stormwater pump pit
  mergeByMaterial(rooms);
  g.add(rooms);

  // networks
  const labelAnchors = {};
  for (const [key, net] of Object.entries(UNDERGROUND)) {
    const tunnel = key === 'baggage' || key === 'apm';
    const mat = flowMaterial({ color: net.color, speed: net.speed, spacing: net.spacing, intensity: 1, opacity: tunnel ? 0.42 : 1, roughness: tunnel ? 0.3 : 0.45 });
    const grp = new THREE.Group();
    const curves = [];
    for (const pts of net.routes) {
      const poly = roundedPolyline(pts, Math.max(3, net.radius * 3), 5);
      const curve = curveFrom(poly, { tension: 0.5 });
      curves.push(curve);
      const geo = pathTube(curve, net.radius, { radial: tunnel ? 14 : 8 });
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = false;
      m.receiveShadow = false;
      if (tunnel) { m.renderOrder = 1; m.userData.noDepth = true; }
      grp.add(m);
    }
    mergeByMaterial(grp);
    g.add(grp);
    const anchor = curves[0].getPointAt(0.5);
    labelAnchors[key] = anchor;
    nets[key] = { key, mat, group: grp, U: mat.userData.flow, curves, color: net.color, name: net.name, unit: net.unit, anchor, on: true, level: 1 };
  }

  // baggage pods inside the tunnels
  const podGeo = rbox(1.0, 0.9, 1.7, 0.12);
  const podMat = new THREE.MeshStandardMaterial({ color: '#ffb347', roughness: 0.5, metalness: 0.2, emissive: '#ff9a2a', emissiveIntensity: 0.5 });
  const POD_N = 180;
  const pods = new THREE.InstancedMesh(podGeo, podMat, POD_N);
  pods.castShadow = false;
  pods.frustumCulled = false;
  const podState = [];
  const bagCurves = nets.baggage.curves;
  for (let i = 0; i < POD_N; i++) {
    const ci = i < POD_N * 0.6 ? 0 : 1 + Math.floor(r() * (bagCurves.length - 1));
    const c = bagCurves[ci];
    podState.push({ curve: c, len: c.getLength(), u: r(), dir: r() < 0.5 ? 1 : -1, speed: 7 + r() * 4, lane: r() < 0.5 ? -0.55 : 0.55 });
  }
  g.add(pods);

  // people mover: two 3-car trains shuttling along the APM tunnel
  const apmCurve = nets.apm.curves[0];
  const apmLen = apmCurve.getLength();
  const trainGeo = rbox(2.6, 2.6, 11, 0.3);
  const trainMat = new THREE.MeshStandardMaterial({ color: '#dfe3ea', roughness: 0.35, metalness: 0.4, emissive: '#b48cff', emissiveIntensity: 0.25 });
  const trains = new THREE.InstancedMesh(trainGeo, trainMat, 6);
  trains.frustumCulled = false;
  trains.castShadow = false;
  g.add(trains);
  const trainState = [{ s: 0.2 * apmLen, dir: 1 }, { s: 0.75 * apmLen, dir: -1 }];

  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _t = new THREE.Vector3(), _o = new THREE.Object3D(), _n = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  let flowRate = 1;

  return {
    group: g,
    nets,
    labelAnchors,
    pods,
    trains,
    setLayer(key, on) {
      const n = nets[key];
      n.on = on;
      n.group.visible = on;
      if (key === 'baggage') pods.visible = on;
      if (key === 'apm') trains.visible = on;
    },
    setLayerColor(key, color) {
      const n = nets[key];
      n.U.uFlowColor.value.set(color);
      n.mat.color.set(color).multiplyScalar(0.35);
      n.color = color;
    },
    setFlowRate(k) { flowRate = k; for (const n of Object.values(nets)) n.U.uFlowSpeed.value = UNDERGROUND[n.key].speed * k; },
    setIntensity(k) { for (const n of Object.values(nets)) n.U.uFlowI.value = k; },
    update(dt) {
      if (!g.visible) return;
      for (let i = 0; i < POD_N; i++) {
        const s = podState[i];
        s.u += (s.dir * s.speed * flowRate * dt) / s.len;
        if (s.u > 1) { s.u = 1; s.dir = -1; } else if (s.u < 0) { s.u = 0; s.dir = 1; }
        s.curve.getPointAt(s.u, _p);
        s.curve.getTangentAt(s.u, _t);
        _n.crossVectors(UP, _t).normalize();
        _p.addScaledVector(_n, s.lane);
        _p.y -= 0.4;
        _o.position.copy(_p);
        orientAlong(_o, _t.multiplyScalar(s.dir));
        _o.updateMatrix();
        pods.setMatrixAt(i, _o.matrix);
      }
      pods.instanceMatrix.needsUpdate = true;
      let idx = 0;
      for (const tr of trainState) {
        tr.s += tr.dir * 14 * flowRate * dt;
        if (tr.s > apmLen - 20) { tr.s = apmLen - 20; tr.dir = -1; } else if (tr.s < 20) { tr.s = 20; tr.dir = 1; }
        for (let c = 0; c < 3; c++) {
          const u = THREE.MathUtils.clamp((tr.s - c * 11.6 * tr.dir) / apmLen, 0, 1);
          apmCurve.getPointAt(u, _p);
          apmCurve.getTangentAt(u, _t);
          _p.y -= 0.6;
          _o.position.copy(_p);
          orientAlong(_o, _t);
          _o.updateMatrix();
          trains.setMatrixAt(idx++, _o.matrix);
        }
      }
      trains.instanceMatrix.needsUpdate = true;
    },
  };
}
