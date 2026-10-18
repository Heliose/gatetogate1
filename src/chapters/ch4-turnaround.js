import * as THREE from 'three';
import { curveFrom, roundedPolyline, orientAlong } from '../core/curves.js';
import { textTexture } from '../core/canvas.js';
import { bakeGeometries, M4 } from '../core/geo.js';
import { SERVICE_SPOTS, STAGING, HERO_GATE, gateX, STAND_Z } from '../world/layout.js';

/* Chapter 4 — Turnaround ballet: GSE converge on a choreographed schedule; the AI reshuffles after a late arrival */

// [id, name, fleet vehicle, service spot, start (min after on-block), duration, colour]
const BASE = [
  ['chocks', 'Chocks & ground power', 'gpu', 'gpu', 0, 48, '#ffe066'],
  ['bridge', 'Jet bridge docks', null, null, 1, 3, '#5ee7ff'],
  ['deboard', 'Deboarding', null, null, 4, 14, '#5ee7ff'],
  ['beltF', 'Belt loader (fwd)', 'beltFwd', 'beltFwd', 3, 35, '#ffb347'],
  ['beltA', 'Belt loader (aft)', 'beltAft', 'beltAft', 4, 34, '#ffb347'],
  ['unloadF', 'Unload fwd hold', 'bagsFwd', 'bagsFwd', 4, 10, '#ffb347'],
  ['unloadA', 'Unload aft hold', 'bagsAft', 'bagsAft', 5, 11, '#ffb347'],
  ['fuel', 'Fuelling (hydrant)', 'fuel', 'fuel', 8, 18, '#ff7a3d'],
  ['caterF', 'Catering (fwd)', 'cateringFwd', 'cateringFwd', 10, 12, '#7cf2b0'],
  ['caterA', 'Catering (aft)', 'cateringAft', 'cateringAft', 9, 12, '#7cf2b0'],
  ['water', 'Potable water', 'water', 'water', 12, 8, '#6fa8ff'],
  ['lav', 'Lavatory service', 'lav', 'lav', 13, 8, '#9aa6b2'],
  ['clean', 'Cabin cleaning', 'cleaning', 'cleaning', 18, 12, '#3aa676'],
  ['loadF', 'Load fwd hold', 'bagsFwd', 'bagsFwd', 24, 12, '#ffb347'],
  ['loadA', 'Load aft hold', 'bagsAft', 'bagsAft', 25, 12, '#ffb347'],
  ['board', 'Boarding', null, null, 31, 13, '#5ee7ff'],
  ['doors', 'Doors & bridge off', null, null, 44, 2, '#5ee7ff'],
  ['push', 'Pushback', 'pushback', 'pushback', 44, 6, '#ffc83d'],
];
// the AI's compressed template: start times shift and some tasks parallelise or get a second team
const AI = {
  deboard: { start: 3, dur: 12 }, fuel: { start: 4, dur: 16 }, caterF: { start: 5 }, caterA: { start: 4 },
  water: { start: 6 }, lav: { start: 7 }, clean: { start: 12, dur: 10 }, unloadF: { start: 3, dur: 8 }, unloadA: { start: 4, dur: 8 },
  loadF: { start: 13, dur: 8 }, loadA: { start: 14, dur: 8 }, board: { start: 23, dur: 10 }, doors: { start: 34, dur: 2 }, push: { start: 35, dur: 5 },
  beltF: { start: 2, dur: 21 }, beltA: { start: 3, dur: 20 }, chocks: { start: 0, dur: 38 },
  extraBags: { id: 'extraBags', name: 'Second baggage team (AI)', vehicle: 'bagsExtra', spot: 'stairs', start: 13, dur: 8, color: '#ffb347' },
  stairs: { id: 'stairs', name: 'Aft stairs · dual-door boarding (AI)', vehicle: 'stairs', spot: 'stairs', start: 22, dur: 12, color: '#5ee7ff' },
};

const MIN_PER_SEC = 50 / 72; // sim minutes per real second at speed 1
let plan = null, planPrev = null, blendT0 = -1, replanned = false, delay = 0, aiOn = true, ring = null, ringParts = null, lastLabelMin = -99;
const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

function makePlan(D, ai) {
  const tasks = BASE.map(([id, name, vehicle, spot, start, dur, color]) => ({ id, name, vehicle, spot, start: start + D, dur, color }));
  if (ai && D > 0) {
    for (const t of tasks) { const o = AI[t.id]; if (o) { if (o.start != null) t.start = o.start + D; if (o.dur != null) t.dur = o.dur; } }
    tasks.splice(7, 0, { ...AI.extraBags, start: AI.extraBags.start + D });
    tasks.splice(16, 0, { ...AI.stairs, start: AI.stairs.start + D });
  }
  const push = tasks.find((t) => t.id === 'push');
  return { tasks, D, ai: ai && D > 0, pushAt: push.start + push.dur, onBlock: D };
}

/* path for a vehicle from its staging bay to a spot (and back), around the stand */
function makeVehiclePath(bay, spotKey) {
  const gx = gateX(HERO_GATE);
  const s = SERVICE_SPOTS[spotKey];
  const sx = gx + s.x, sz = STAND_Z + s.z;
  const sideSign = s.x >= 0 ? 1 : -1;
  const approachX = gx + sideSign * 30;
  const pts = [bay, [bay[0] - 10, 0, 10], [approachX + sideSign * 6, 0, 10], [approachX, 0, Math.min(10, sz + 12)], [approachX, 0, sz], [sx, 0, sz]];
  if (spotKey === 'pushback') pts.splice(3, 3, [gx + 12, 0, 12], [gx, 0, STAND_Z + 26], [sx, 0, sz]);
  if (spotKey === 'gpu') pts.splice(3, 3, [gx + 12, 0, 12], [sx, 0, sz]);
  const curve = curveFrom(roundedPolyline(pts, 6, 4));
  return { curve, len: curve.getLength(), ry: s.ry ?? 0, spot: new THREE.Vector3(sx, 0, sz) };
}

export default {
  id: 'turnaround',
  title: 'Turnaround ballet',
  sub: 'Fifty minutes, choreographed',
  blurb: 'From above the gate, fuel, catering, baggage, water and cleaning crews converge on the aircraft in choreographed paths while a 3D timeline counts down to pushback. With a late arrival, the AI reshuffles the plan to recover the slot.',
  duration: (ctx, p) => ((plan ? plan.pushAt : 50) + 2 + 3) / (MIN_PER_SEC * p.simSpeed),
  hour: [12.2, 13.1],
  shots: [
    { at: 0, pos: [135, 150, 20], target: [135, 0, -32], fov: 40 },
    { at: 22, pos: [60, 42, 40], target: [135, 3, -30], fov: 38 },
    { at: 46, pos: [182, 58, -98], target: [135, 3, -32], fov: 38, orbit: true },
    { at: 72, pos: [135, 165, -24], target: [135, 0, -32], fov: 40 },
  ],
  captions: [
    { at: 1.5, text: 'Stand G6. The inbound is <em>twelve minutes late</em>, and the slot after it is not.' },
    { at: 8, text: 'The naive plan simply slides: pushback at +12. The ring above the stand is the schedule, one lap for an hour.' },
    { at: 15.5, text: 'On blocks. The <b>AI replans</b>: fuel earlier, catering alongside deboarding, a second baggage team, boarding through two doors.' },
    { at: 24, text: 'Every vehicle has a path, a window and a safety zone. Nothing crosses the fuelling area while the hydrant is open.' },
    { at: 40, text: 'Loading starts the minute unloading ends. Cleaning finishes as the first passengers board.' },
    { at: 56, text: 'Doors closed, bridge off, tug on. Nine minutes recovered.' },
  ],
  params: [
    { key: 'simSpeed', label: 'Simulation speed', type: 'range', min: 0.25, max: 4, step: 0.25, default: 1, fmt: 'x', hint: 'At 1×, fifty minutes play in seventy seconds.' },
    { key: 'delay', label: 'Inbound delay', type: 'range', min: 0, max: 20, step: 1, default: 12, fmt: 'min' },
    { key: 'ai', label: 'AI replanning', type: 'toggle', default: true, hint: 'Off: the plan just slides by the delay.' },
    { key: 'restart', label: 'Restart the turnaround', type: 'button', variant: 'accent' },
    { key: 'ring', label: '3D timeline ring', type: 'toggle', default: true, group: 'Display' },
    { key: 'paths', label: 'Vehicle paths', type: 'toggle', default: false, group: 'Display' },
    { key: 'vehicleLabels', label: 'Vehicle labels', type: 'toggle', default: true, group: 'Display' },
    { key: 'countdown', label: 'Floating countdown', type: 'toggle', default: true, group: 'Display' },
  ],
  minute(t, p) { return t * MIN_PER_SEC * p.simSpeed - 3; },
  enter(ctx, p) {
    delay = p.delay; aiOn = p.ai;
    plan = makePlan(delay, false); // the naive plan is shown first; the AI replans on-block
    planPrev = null; blendT0 = -1; replanned = false;
    const F = ctx.world.fleet;
    F.group.visible = true;
    for (const v of Object.values(F.items)) v.group.visible = true;
    this.buildPaths(ctx);
    if (!ring) this.buildRing(ctx);
    ring.visible = p.ring;
    ctx.world.fleet.pathLines.visible = p.paths;
    ctx.post.setWash('#ffb347', 0.06);
    ctx.sound.mix({ wind: 0.5, jets: 0.4, hum: 0, drone: 0, room: 0 });
    ctx.focusOverride = null;
  },
  buildPaths(ctx) {
    const F = ctx.world.fleet;
    F.paths = {};
    const bays = Object.keys(F.items);
    bays.forEach((key, i) => {
      const bay = [STAGING.x0 + 14 + (i % 2) * 26, 0, STAGING.z0 + 6 + Math.floor(i / 2) * 9];
      F.bays[key] = bay;
    });
    const used = new Set();
    for (const t of [...BASE.map((b) => ({ vehicle: b[2], spot: b[3] })), { vehicle: 'bagsExtra', spot: 'stairs' }, { vehicle: 'stairs', spot: 'stairs' }]) {
      if (!t.vehicle || used.has(t.vehicle + t.spot)) continue;
      used.add(t.vehicle + t.spot);
      F.paths[t.vehicle + '|' + t.spot] = makeVehiclePath(F.bays[t.vehicle], t.spot);
    }
    // path lines for display
    const pos = [];
    for (const pth of Object.values(F.paths)) for (let i = 0; i < 40; i++) { const a = pth.curve.getPointAt(i / 40), b = pth.curve.getPointAt((i + 1) / 40); pos.push(a.x, 0.3, a.z, b.x, 0.3, b.z); }
    F.pathLines.geometry.dispose();
    F.pathLines.geometry = new THREE.BufferGeometry();
    F.pathLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  },
  buildRing(ctx) {
    ring = new THREE.Group();
    ring.name = 'timelineRing';
    ring.position.set(gateX(HERO_GATE), 34, STAND_Z);
    ring.userData.noDepth = true;
    ctx.scene.add(ring);
    ringParts = { bars: [], now: null, label: null, labelMat: null, lastText: '' };
    // hour ring (dim) + minute ticks
    const base = new THREE.Mesh(new THREE.RingGeometry(8.5, 9.0, 96), new THREE.MeshBasicMaterial({ color: '#5ee7ff', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    base.rotation.x = -Math.PI / 2;
    ring.add(base);
    const tickItems = [];
    for (let i = 0; i < 60; i += 5) {
      const a = Math.PI / 2 - (i / 60) * Math.PI * 2;
      tickItems.push({ geo: new THREE.BoxGeometry(i % 15 === 0 ? 1.4 : 0.7, 0.05, 0.15), matrix: M4(Math.cos(a) * 8.0, 0, -Math.sin(a) * 8.0, 0, a, 0) });
    }
    ring.add(new THREE.Mesh(bakeGeometries(tickItems), new THREE.MeshBasicMaterial({ color: '#dfe9f4', transparent: true, opacity: 0.6, depthWrite: false })));
    // the now hand
    const hand = new THREE.Mesh(new THREE.BoxGeometry(31, 0.08, 0.25), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(2.2), transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
    hand.position.set(15.5, 0.2, 0);
    const handPivot = new THREE.Group();
    handPivot.add(hand);
    ring.add(handPivot);
    ringParts.now = handPivot;
    // countdown label plane
    const labelMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.6), labelMat);
    label.position.set(0, 1.0, 0);
    ring.add(label);
    ringParts.label = label;
    ringParts.labelMat = labelMat;
    ring.traverse((o) => { o.userData.noDepth = true; o.userData.noPick = true; o.renderOrder = 6; o.castShadow = false; o.receiveShadow = false; });
  },
  /* rebuild bar geometries for the current plan blend */
  updateRing(ctx, m, p) {
    if (!ring) return;
    ring.visible = p.ring;
    if (!p.ring) return;
    const tasks = plan.tasks;
    const blend = blendT0 >= 0 ? THREE.MathUtils.clamp((ctx.director.t - blendT0) / 1.6, 0, 1) : 1;
    const eb = 1 - Math.pow(1 - blend, 3);
    while (ringParts.bars.length < tasks.length) {
      const matP = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
      const matD = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
      const planned = new THREE.Mesh(new THREE.RingGeometry(1, 2, 8, 1, 0, 0.1), matP);
      const done = new THREE.Mesh(new THREE.RingGeometry(1, 2, 8, 1, 0, 0.1), matD);
      planned.rotation.x = done.rotation.x = -Math.PI / 2;
      done.position.y = 0.05;
      for (const o of [planned, done]) { o.userData.noDepth = true; o.renderOrder = 6; ring.add(o); }
      ringParts.bars.push({ planned, done, matP, matD });
    }
    ringParts.bars.forEach((b, i) => {
      const t = tasks[i];
      if (!t) { b.planned.visible = b.done.visible = false; return; }
      const prev = planPrev?.tasks.find((x) => x.id === t.id);
      const start = prev ? prev.start + (t.start - prev.start) * eb : t.start;
      const dur = prev ? prev.dur + (t.dur - prev.dur) * eb : t.dur;
      const r0 = 9.6 + i * 1.05, r1 = r0 + 0.8;
      // angle: 0 min at the top (−z), clockwise; RingGeometry theta runs CCW from +x in its local XY → after rotation.x = −90°, local +y maps to −z
      const a0 = Math.PI / 2 - ((start + dur) / 60) * Math.PI * 2, len = (dur / 60) * Math.PI * 2;
      b.planned.geometry.dispose();
      b.planned.geometry = new THREE.RingGeometry(r0, r1, Math.max(4, Math.round(len * 24)), 1, a0, len);
      const prog = THREE.MathUtils.clamp((m - start) / Math.max(0.1, dur), 0, 1);
      b.done.visible = prog > 0.001;
      if (b.done.visible) {
        b.done.geometry.dispose();
        b.done.geometry = new THREE.RingGeometry(r0, r1, Math.max(4, Math.round(len * prog * 24) + 1), 1, Math.PI / 2 - ((start + dur * prog) / 60) * Math.PI * 2, len * prog);
      }
      b.planned.visible = true;
      b.matP.color.set(t.color);
      b.matD.color.set(t.color).multiplyScalar(prog < 1 && m >= start ? 2.4 : 1.2);
      const fresh = prev && Math.abs(prev.start - t.start) + Math.abs(prev.dur - t.dur) > 0.1 && blend < 1;
      b.matP.opacity = fresh ? 0.35 + 0.5 * Math.sin(blend * Math.PI) : 0.35;
    });
    ringParts.now.rotation.y = -(Math.PI / 2 - (m / 60) * Math.PI * 2) + Math.PI / 2 - Math.PI / 2;
    ringParts.now.rotation.y = (m / 60) * Math.PI * 2 - Math.PI / 2 + Math.PI;
    // countdown text, refreshed every few seconds of sim time
    const remain = plan.pushAt - m;
    const txt = p.countdown ? (remain > 0 ? `PUSHBACK IN ${Math.floor(remain)}:${String(Math.floor((remain % 1) * 60)).padStart(2, '0')}` : m < plan.onBlock ? 'INBOUND · ON BLOCKS SOON' : 'PUSHED BACK') : '';
    if (txt !== ringParts.lastText) {
      ringParts.lastText = txt;
      ringParts.label.visible = !!txt;
      if (txt) {
        ringParts.labelMat.map?.dispose();
        const tex = textTexture(txt, { font: '700 72px JetBrains Mono', color: remain < 0 ? '#7cf2b0' : plan.ai ? '#7cf2b0' : delay > 0 ? '#ffb347' : '#eaf2f8', pad: 36, glow: 18, height: 110 });
        ringParts.labelMat.map = tex;
        ringParts.labelMat.color.setScalar(1.8);
        ringParts.labelMat.needsUpdate = true;
        ringParts.label.scale.set(tex.userData.aspect * 2.6 / 10 * 1.0, 1, 1);
      }
    }
    ringParts.label.lookAt(ctx.camera.position);
  },
  onParam(ctx, key, v, p) {
    if (key === 'restart' || key === 'delay' || key === 'ai') { delay = p.delay; aiOn = p.ai; plan = makePlan(delay, false); planPrev = null; replanned = false; blendT0 = -1; ctx.director.t = 0; ctx.director.scrub(0); ctx.toast(key === 'restart' ? 'Turnaround restarted' : `Inbound delay ${p.delay} min`); }
    if (key === 'ring' && ring) ring.visible = v;
    if (key === 'paths') ctx.world.fleet.pathLines.visible = v;
    if (key === 'vehicleLabels' && !v) ctx.labels.removeWhere((id) => id.startsWith('veh:'));
  },
  scrub(ctx, t, p) {
    const m = this.minute(t, p);
    if (m < plan.onBlock && replanned) { plan = makePlan(delay, false); planPrev = null; replanned = false; blendT0 = -1; }
  },
  update(ctx, t, dt, p) {
    const m = this.minute(t, p);
    const hero = ctx.world.hero.ac.group;
    const F = ctx.world.fleet;
    // on-block: the AI replans
    if (!replanned && m >= plan.onBlock && aiOn && delay > 0) {
      planPrev = plan;
      plan = makePlan(delay, true);
      replanned = true;
      blendT0 = t;
      ctx.toast(`AI replanned · pushback recovered to +${Math.round(plan.pushAt - 50)} min`);
      ctx.sound.cue('chime');
    }
    // taxi-in during the last three minutes before on-block, pushback at the end
    const taxiK = THREE.MathUtils.smoothstep(m, plan.onBlock - 3, plan.onBlock);
    const push = plan.tasks.find((x) => x.id === 'push');
    const pushK = THREE.MathUtils.smoothstep(m, push.start + 1, push.start + push.dur);
    hero.position.z = STAND_Z - (1 - taxiK) * 80 - pushK * 46;
    hero.position.x = gateX(HERO_GATE) + pushK * pushK * 6;
    hero.rotation.y = pushK * 0.45;
    // bridge & doors
    const bridge = ctx.world.terminal.bridges[HERO_GATE];
    const bt = plan.tasks.find((x) => x.id === 'bridge'), dt2 = plan.tasks.find((x) => x.id === 'doors');
    const dock = THREE.MathUtils.smoothstep(m, bt.start, bt.start + bt.dur) * (1 - THREE.MathUtils.smoothstep(m, dt2.start, dt2.start + dt2.dur));
    bridge.set(dock);
    const doors = ctx.world.hero.ac.doors;
    doors.L1?.set(THREE.MathUtils.smoothstep(m, bt.start + 1.5, bt.start + 3) * (1 - THREE.MathUtils.smoothstep(m, dt2.start - 0.5, dt2.start + 1)));
    const st = plan.tasks.find((x) => x.id === 'stairs');
    doors.L2?.set(st ? THREE.MathUtils.smoothstep(m, st.start + 2, st.start + 3) * (1 - THREE.MathUtils.smoothstep(m, st.start + st.dur - 1, st.start + st.dur)) : 0);
    const uF = plan.tasks.find((x) => x.id === 'unloadF'), lF = plan.tasks.find((x) => x.id === 'loadF');
    doors.cargoFwd?.set(THREE.MathUtils.smoothstep(m, uF.start - 0.5, uF.start + 0.5) * (1 - THREE.MathUtils.smoothstep(m, lF.start + lF.dur, lF.start + lF.dur + 1)));
    const uA = plan.tasks.find((x) => x.id === 'unloadA'), lA = plan.tasks.find((x) => x.id === 'loadA');
    doors.cargoAft?.set(THREE.MathUtils.smoothstep(m, uA.start - 0.5, uA.start + 0.5) * (1 - THREE.MathUtils.smoothstep(m, lA.start + lA.dur, lA.start + lA.dur + 1)));
    // vehicles: each fleet item takes the union of its tasks' windows
    const byVehicle = {};
    for (const task of plan.tasks) if (task.vehicle) (byVehicle[task.vehicle] ||= []).push(task);
    for (const [key, v] of Object.entries(F.items)) {
      const tasks = byVehicle[key];
      const g = v.group;
      if (!tasks) { this.park(F, key, v); continue; }
      const first = tasks.reduce((a, b) => (a.start < b.start ? a : b)), last = tasks.reduce((a, b) => (a.start + a.dur > b.start + b.dur ? a : b));
      const pth = F.paths[key + '|' + first.spot];
      if (!pth) { this.park(F, key, v); continue; }
      const travel = Math.max(1.2, pth.len / 6 / 60); // minutes at 6 m/s
      const tIn0 = first.start - travel, tOut1 = last.start + last.dur + travel;
      let u = 0, phase = 'parked';
      if (m < tIn0) { u = 0; phase = 'parked'; }
      else if (m < first.start) { u = (m - tIn0) / travel; phase = 'in'; }
      else if (m <= last.start + last.dur) { u = 1; phase = 'service'; }
      else if (m < tOut1) { u = 1 - (m - (last.start + last.dur)) / travel; phase = 'out'; }
      else { u = 0; phase = 'parked'; }
      const ue = u * u * (3 - 2 * u);
      pth.curve.getPointAt(ue, _p);
      pth.curve.getTangentAt(THREE.MathUtils.clamp(ue, 0.001, 0.999), _t);
      _t.y = 0;
      g.position.set(_p.x, 0.05, _p.z);
      if (phase === 'service') { g.rotation.set(0, pth.ry, 0); } else { orientAlong(g, phase === 'out' ? _t.negate() : _t, 0, true); }
      if (phase === 'parked') { g.position.set(F.bays[key][0], 0.05, F.bays[key][2]); g.rotation.set(0, Math.PI, 0); }
      // trains: carts trail the tug along the path
      if (v.carts) {
        v.carts.forEach((c, i) => {
          const d = 4.6 * (i + 1);
          const uc = THREE.MathUtils.clamp(ue - d / pth.len, 0, 1);
          if (phase === 'parked' || phase === 'service') { c.group.position.copy(g.position); c.group.quaternion.copy(g.quaternion); c.group.translateZ(-d); }
          else { pth.curve.getPointAt(uc, _p); pth.curve.getTangentAt(THREE.MathUtils.clamp(uc, 0.001, 0.999), _t); _t.y = 0; c.group.position.set(_p.x, 0.05, _p.z); orientAlong(c.group, phase === 'out' ? _t.negate() : _t, 0, true); }
        });
      }
      // service animations
      const active = tasks.find((task) => m >= task.start && m <= task.start + task.dur);
      const k = active ? Math.min(1, (m - active.start) / 0.8) * Math.min(1, (active.start + active.dur - m) / 0.8) : 0;
      if (v.lift) v.lift.position.y = (v.kind === 'catering' ? 1.0 : 2.2) + k * (v.kind === 'catering' ? 2.4 : 1.6);
      if (v.belt) v.belt.rotation.x = -0.1 - k * 0.3;
      if (v.stairs) v.stairs.rotation.x = 0;
      // labels
      if (p.vehicleLabels && phase !== 'parked') {
        const anchor = () => { const a = g.getObjectByProperty('labelAnchor', true); return a ? a.getWorldPosition(_p) : _p.copy(g.position).setY(3); };
        const task = active || first;
        ctx.labels.add('veh:' + key, { anchor: () => { _p.copy(g.position); _p.y += 3.4; return _p; }, html: `<div class="lt">${SERVICE_SPOTS[first.spot]?.name || key}</div><div class="ls">${phase === 'service' ? (active ? `${task.name} · ${Math.max(0, Math.round(task.start + task.dur - m))} min` : 'waiting') : phase === 'in' ? 'approaching' : 'leaving'}</div>`, cls: 'vehicle', offset: [0, -8], maxDist: 420 });
      } else ctx.labels.remove('veh:' + key);
    }
    this.updateRing(ctx, m, p);
    // a pulse ring around the aircraft while replanning
    if (blendT0 >= 0 && t - blendT0 < 2.5) {
      const k = (t - blendT0) / 2.5;
      ctx.world.fleet.pulse.visible = true;
      ctx.world.fleet.pulse.position.set(hero.position.x, 0.3, hero.position.z);
      ctx.world.fleet.pulse.scale.setScalar(1 + k * 55);
      ctx.world.fleet.pulse.material.opacity = (1 - k) * 0.8;
    } else ctx.world.fleet.pulse.visible = false;
  },
  park(F, key, v) {
    const bay = F.bays[key];
    v.group.position.set(bay[0], 0.05, bay[2]);
    v.group.rotation.set(0, Math.PI, 0);
    if (v.carts) v.carts.forEach((c, i) => { c.group.position.set(bay[0], 0.05, bay[2] + 4.6 * (i + 1)); c.group.rotation.set(0, Math.PI, 0); });
  },
  exit(ctx) {
    const hero = ctx.world.hero.ac.group;
    hero.position.set(gateX(HERO_GATE), 0, STAND_Z);
    hero.rotation.y = 0;
    ctx.world.terminal.bridges[HERO_GATE].set(0);
    for (const d of Object.values(ctx.world.hero.ac.doors)) d.set(0);
    const F = ctx.world.fleet;
    for (const [key, v] of Object.entries(F.items)) this.park(F, key, v);
    F.group.visible = false;
    F.pathLines.visible = false;
    F.pulse.visible = false;
    if (ring) ring.visible = false;
    ctx.labels.removeWhere((id) => id.startsWith('veh:'));
    ctx.post.setWash(null, 0);
  },
  panel(ctx, p, t) {
    if (!plan) return '';
    const m = this.minute(t, p);
    const remain = plan.pushAt - m;
    const late = plan.pushAt - 50;
    let rows = '';
    for (const task of plan.tasks) {
      const done = m > task.start + task.dur, live = m >= task.start && !done;
      rows += `<div class="g-row"><span class="gn" title="${task.name}">${task.name}</span><span class="gt"><i class="gb ${done ? 'done' : ''} ${live ? 'live' : ''}" style="--c:${task.color};left:${(task.start / 60) * 100}%;width:${(task.dur / 60) * 100}%"></i></span></div>`;
    }
    const nowPct = THREE.MathUtils.clamp(m / 60, 0, 1) * 100;
    const cd = remain > 0 ? `${Math.floor(remain)}:${String(Math.floor((remain % 1) * 60)).padStart(2, '0')}` : 'pushed back';
    return `<div class="g-head"><span class="big ${late > 3 ? 'late' : 'ok'}">${cd}</span><span class="small">to pushback · ${late > 0 ? `+${Math.round(late)} min` : 'on time'}${plan.ai ? ' · AI plan' : delay > 0 ? ' · naive plan' : ''}</span></div>
      ${plan.ai ? `<div class="replan"><b>AI replanned on blocks.</b> Fuel moved earlier, catering alongside deboarding, a second baggage team, boarding through both doors. Recovered <b>${Math.round(50 + delay - plan.pushAt)} min</b> of the ${delay} min delay.</div>` : delay > 0 && !replanned ? `<div class="replan">Inbound <b>${delay} min late</b>. The naive plan slides everything by ${delay} min. ${aiOn ? 'The AI will replan on blocks.' : 'AI replanning is off.'}</div>` : ''}
      <div class="g-now"><i style="left:${nowPct}%"></i><span style="left:${nowPct}%">${m < 0 ? 'taxi in' : `+${Math.floor(Math.max(0, m))} min`}</span></div><div class="gantt">${rows}</div>`;
  },
};
