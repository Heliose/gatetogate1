import * as THREE from 'three';
import { SpeedPath, orientAlong, bankFor, curveFrom } from '../core/curves.js';
import { rng } from '../core/rng.js';
import { liteAirlinerGeometry } from './aircraft.js';
import { airTaxi } from './vehicles.js';
import { TIME, flowMaterial } from './materials.js';
import { departurePoints, DEPARTURE_SPEEDS, arrivalPoints, ARRIVAL_SPEEDS, TRAFFIC_GATES, gateX, gateName, CALLSIGNS, UAM_ENTRIES, VERTIPORT } from './layout.js';

/* ------------------------------------------------------------------ *
 * Flights: arrivals and departures along speed-profiled paths, drawn
 * as one instanced swarm plus nav-light points, with optional ribbon
 * trails and predicted paths. Also the air-taxi fleet and sky paths.
 * ------------------------------------------------------------------ */

const MAX = 40;
export class Traffic {
  constructor(scene, trails) {
    this.scene = scene;
    this.trails = trails;
    this.flights = [];
    this.paths = new Map();
    this.rate = 0;              // flights per sim minute (0 = off)
    this.spawnAcc = 0;
    this.nextType = 'arr';
    this.counter = 100;
    this.onEvent = null;
    this.trailStyle = { on: false, tail: 0.35, linger: 20, width: 5, colorDep: '#ffb347', colorArr: '#5ee7ff' };
    this.predict = { on: false, horizon: 90, dash: 1, width: 3 };
    this.conflicts = new Set();
    this.conflictDist = 180;

    const geo = liteAirlinerGeometry();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.3 });
    this.swarm = new THREE.InstancedMesh(geo, mat, MAX);
    this.swarm.frustumCulled = false;
    this.swarm.castShadow = true;
    this.swarm.count = 0;
    scene.add(this.swarm);

    // nav lights: 3 per aircraft (red, green, white strobe)
    const n = MAX * 3;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const col = new Float32Array(n * 3), ph = new Float32Array(n);
    const c = new THREE.Color();
    for (let i = 0; i < MAX; i++) {
      c.set('#ff3b2f'); col.set([c.r, c.g, c.b], i * 9);
      c.set('#3cff8a'); col.set([c.r, c.g, c.b], i * 9 + 3);
      c.set('#ffffff'); col.set([c.r, c.g, c.b], i * 9 + 6);
      ph[i * 3] = -1; ph[i * 3 + 1] = -1; ph[i * 3 + 2] = (i * 0.37) % 1;
    }
    lg.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    lg.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    this.navU = { uTime: TIME.uTime, uScale: { value: 1000 }, uLevel: { value: 1 } };
    const lm = new THREE.ShaderMaterial({
      uniforms: this.navU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec3 aColor; attribute float aPh; uniform float uTime, uScale, uLevel; varying vec3 vC;
        void main(){ float b = aPh < 0.0 ? 1.0 : 0.05 + 4.0 * pow(0.5 + 0.5 * sin(uTime * 6.2832 * 1.1 + aPh * 6.2832), 24.0);
          vC = aColor * b * (0.5 + uLevel * 1.5) * 2.5; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(1.2 * uScale / -mv.z, 1.5, 14.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float r2 = dot(p, p); if (r2 > 1.0) discard; float a = exp(-r2 * 5.0); gl_FragColor = vec4(vC * a, a); }`,
    });
    this.nav = new THREE.Points(lg, lm);
    this.nav.frustumCulled = false;
    this.nav.userData.noDepth = true;
    this.nav.geometry.setDrawRange(0, 0);
    scene.add(this.nav);

    this._o = new THREE.Object3D();
    this._p = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._p2 = new THREE.Vector3();
  }

  path(type, gate) {
    const key = type + gate;
    if (!this.paths.has(key)) {
      const gx = gateX(gate);
      this.paths.set(key, type === 'dep' ? new SpeedPath(departurePoints(gx), DEPARTURE_SPEEDS) : new SpeedPath(arrivalPoints(gx), ARRIVAL_SPEEDS));
    }
    return this.paths.get(key);
  }

  gateFree(gate) { return !this.flights.some((f) => f.gate === gate && f.t < f.path.duration); }

  spawn(type = null, gate = null, { startT = 0 } = {}) {
    if (this.flights.length >= MAX) return null;
    type = type || this.nextType;
    this.nextType = type === 'arr' ? 'dep' : 'arr';
    const gates = TRAFFIC_GATES.filter((g) => this.gateFree(g));
    if (!gates.length) return null;
    gate = gate != null ? gate : gates[Math.floor(Math.random() * gates.length)];
    const path = this.path(type, gate);
    const airline = CALLSIGNS[this.counter % CALLSIGNS.length];
    const f = {
      id: 'f' + this.counter, type, gate, path, t: startT, done: false,
      callsign: `${airline} ${100 + ((this.counter * 37) % 880)}`,
      typeName: ['A320neo', 'A321XLR', 'B737-10', 'A220-300', 'E195-E2'][this.counter % 5],
      pos: new THREE.Vector3(), tan: new THREE.Vector3(), speed: 0, alt: 0, trail: null, pred: null, conflict: false,
      dest: ['LISBON', 'OSLO', 'MILAN', 'DUBLIN', 'VIENNA', 'MALTA', 'NICE', 'PORTO', 'RIGA', 'ZÜRICH'][this.counter % 10],
    };
    this.counter++;
    if (this.trailStyle.on) f.trail = this.trails.acquire(path.curve, { color: type === 'dep' ? this.trailStyle.colorDep : this.trailStyle.colorArr, width: this.trailStyle.width, tail: this.trailStyle.tail, mode: 0 });
    this.flights.push(f);
    this.onEvent?.('spawn', f);
    return f;
  }

  /* pre-populate so the sky and taxiways aren't empty at the start */
  seed(n) {
    for (let i = 0; i < n; i++) {
      const f = this.spawn();
      if (f) f.t = Math.random() * f.path.duration * 0.9;
    }
  }

  clear() {
    for (const f of this.flights) { this.trails.release(f.trail); this.trails.release(f.pred); }
    this.flights.length = 0;
    this.swarm.count = 0;
    this.nav.geometry.setDrawRange(0, 0);
  }

  /* dtSim: simulated seconds elapsed this frame */
  update(dtSim, dtReal) {
    // spawner
    if (this.rate > 0) {
      this.spawnAcc += (dtSim / 60) * this.rate;
      while (this.spawnAcc >= 1) { this.spawnAcc -= 1; this.spawn(); }
    }
    const navPos = this.nav.geometry.attributes.position;
    let idx = 0;
    const linger = this.trailStyle.linger;
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      f.t += dtSim;
      const dur = f.path.duration;
      if (f.t >= dur) {
        if (!f.done) { f.done = true; f.doneAt = 0; this.onEvent?.('done', f); }
        f.doneAt += dtReal;
        if (f.trail) f.trail.u.uFade.value = Math.max(0, 1 - f.doneAt / Math.max(0.1, linger));
        if (f.doneAt > linger || !f.trail) {
          this.trails.release(f.trail);
          this.trails.release(f.pred);
          this.flights.splice(i, 1);
        }
        continue;
      }
      const u = f.path.uAtTime(f.t);
      f.u = u;
      f.path.pointAtU(u, f.pos);
      f.path.tangentAtU(u, f.tan);
      f.speed = f.path.speedAtU(u);
      f.alt = f.pos.y;
      const airborne = THREE.MathUtils.smoothstep(f.pos.y, 1, 25);
      const bank = bankFor(f.path, u, 0.003, 16) * airborne;
      this._o.position.copy(f.pos);
      orientAlong(this._o, f.tan, bank, airborne < 0.01);
      this._o.updateMatrix();
      this.swarm.setMatrixAt(idx, this._o.matrix);
      // nav lights: wingtips and tail in world space
      const m = this._o.matrix;
      this._p.set(-18.1, 3.6 + 0.6, -5.2).applyMatrix4(m); navPos.setXYZ(idx * 3, this._p.x, this._p.y, this._p.z);
      this._p.set(18.1, 3.6 + 0.6, -5.2).applyMatrix4(m); navPos.setXYZ(idx * 3 + 1, this._p.x, this._p.y, this._p.z);
      this._p.set(0, 3.6 + 2.0, -18.5).applyMatrix4(m); navPos.setXYZ(idx * 3 + 2, this._p.x, this._p.y, this._p.z);
      if (f.trail) f.trail.u.uHead.value = u;
      // predicted path ribbon
      if (this.predict.on) {
        if (!f.pred) f.pred = this.trails.acquire(f.path.curve, { color: '#5ee7ff', width: this.predict.width, tail: 0.2, dash: this.predict.dash, mode: 1 });
        if (f.pred) {
          const uEnd = f.path.uAtTime(Math.min(dur, f.t + this.predict.horizon));
          f.pred.u.uHead.value = u;
          f.pred.u.uTail.value = Math.max(0.002, uEnd - u);
          f.pred.u.uColor.value.set(f.conflict ? '#ff7a59' : '#5ee7ff');
          f.pred.u.uFade.value = 1;
        }
      } else if (f.pred) { this.trails.release(f.pred); f.pred = null; }
      idx++;
    }
    this.swarm.count = idx;
    this.swarm.instanceMatrix.needsUpdate = true;
    navPos.needsUpdate = true;
    this.nav.geometry.setDrawRange(0, idx * 3);
    if (this.predict.on) this.detectConflicts();
  }

  detectConflicts() {
    const live = this.flights.filter((f) => !f.done);
    for (const f of live) f.conflict = false;
    this.conflicts.clear();
    const H = this.predict.horizon, N = 12;
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      for (let k = 1; k <= N; k++) {
        const dt = (k / N) * H;
        a.path.pointAt(a.t + dt, this._p);
        b.path.pointAt(b.t + dt, this._p2);
        if (a.t + dt > a.path.duration || b.t + dt > b.path.duration) break;
        const dxz = Math.hypot(this._p.x - this._p2.x, this._p.z - this._p2.z), dy = Math.abs(this._p.y - this._p2.y);
        const ground = this._p.y < 3 && this._p2.y < 3;
        if (dxz < (ground ? Math.min(45, this.conflictDist) : this.conflictDist) && dy < 60) { a.conflict = b.conflict = true; this.conflicts.add(a.id + b.id); break; }
      }
    }
  }

  setTrails(on) {
    this.trailStyle.on = on;
    if (!on) for (const f of this.flights) { this.trails.release(f.trail); f.trail = null; }
    else for (const f of this.flights) if (!f.trail && !f.done) f.trail = this.trails.acquire(f.path.curve, { color: f.type === 'dep' ? this.trailStyle.colorDep : this.trailStyle.colorArr, width: this.trailStyle.width, tail: this.trailStyle.tail, mode: 0 });
  }
  setTrailStyle(s) {
    Object.assign(this.trailStyle, s);
    for (const f of this.flights) if (f.trail) { f.trail.u.uTail.value = this.trailStyle.tail; f.trail.u.uWidth.value = this.trailStyle.width; f.trail.u.uColor.value.set(f.type === 'dep' ? this.trailStyle.colorDep : this.trailStyle.colorArr); }
  }
  setPredict(on) { this.predict.on = on; if (!on) for (const f of this.flights) { this.trails.release(f.pred); f.pred = null; f.conflict = false; } }
  resize(bufferH, fov) { this.navU.uScale.value = bufferH / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)); }
  stateOf(f) {
    if (f.done) return 'ON BLOCKS';
    if (f.type === 'dep') return f.pos.y > 5 ? 'CLIMB' : f.speed > 40 ? 'ROLLING' : f.pos.z > -100 ? 'PUSHBACK' : 'TAXI';
    return f.pos.y > 5 ? 'FINAL' : f.speed > 40 ? 'ROLL-OUT' : 'TAXI IN';
  }
}

/* ------------------------------------------------------------------ *
 * Air taxis: instanced bodies + instanced rotors, a small state machine.
 * ------------------------------------------------------------------ */
export class AirTaxiFleet {
  constructor(scene, M, max = 12) {
    this.max = max;
    this.group = new THREE.Group();
    this.group.name = 'airtaxis';
    scene.add(this.group);
    const proto = airTaxi(M, { withRotors: false });
    this.parts = [];
    proto.group.updateMatrixWorld(true);
    proto.group.traverse((o) => {
      if (o.isMesh) {
        const im = new THREE.InstancedMesh(o.geometry, o.material, max);
        im.frustumCulled = false;
        im.castShadow = true;
        im.userData.local = o.matrixWorld.clone();
        this.group.add(im);
        this.parts.push(im);
      }
    });
    this.hubs = proto.hubs;
    const rotorGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.03, 20);
    this.rotors = new THREE.InstancedMesh(rotorGeo, M.rotor, max * 4);
    this.rotors.frustumCulled = false;
    this.rotors.castShadow = false;
    this.group.add(this.rotors);
    this.taxis = [];
    this.count = 0;
    this.speedK = 1;
    this.rotorSpin = 0;
    this._o = new THREE.Object3D();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._r = new THREE.Object3D();
    this.r = rng(77);
    this.padBusy = new Array(VERTIPORT.pads.length).fill(false);
  }
  setCount(n) {
    n = Math.min(this.max, Math.max(0, Math.round(n)));
    while (this.taxis.length < n) this.taxis.push(this.newTaxi());
    while (this.taxis.length > n) { const t = this.taxis.pop(); if (t.pad >= 0) this.padBusy[t.pad] = false; }
  }
  newTaxi() {
    const pads = VERTIPORT.pads;
    const t = { phase: 'approach', t: 0, pad: -1, entry: Math.floor(this.r() * UAM_ENTRIES.length), pos: new THREE.Vector3(), tan: new THREE.Vector3(0, 0, 1), id: 'T' + Math.floor(100 + this.r() * 900), pax: 1 + Math.floor(this.r() * 4), hover: 0 };
    this.plan(t, true);
    t.t = this.r() * t.path.duration * 0.8;
    return t;
  }
  plan(t, approach) {
    const pads = VERTIPORT.pads;
    if (approach) {
      let pad = -1;
      for (let k = 0; k < pads.length; k++) { const i = (k + Math.floor(this.r() * pads.length)) % pads.length; if (!this.padBusy[i]) { pad = i; break; } }
      t.pad = pad;
      if (pad >= 0) this.padBusy[pad] = true;
      const e = UAM_ENTRIES[t.entry];
      const target = pad >= 0 ? [pads[pad][0], VERTIPORT.y + 0.1, pads[pad][1]] : [0, 60, 90];
      const mid = [target[0] + (e[0] - target[0]) * 0.35, 90, target[2] + (e[2] - target[2]) * 0.35];
      t.path = new SpeedPath([e, mid, [target[0], 45, target[2] + 6], [target[0], 14, target[2]], target], [22, 20, 10, 3, 0.4]);
      t.phase = 'approach';
    } else {
      const pad = t.pad;
      const from = pad >= 0 ? [pads[pad][0], VERTIPORT.y + 0.1, pads[pad][1]] : [0, 60, 90];
      t.entry = Math.floor(this.r() * UAM_ENTRIES.length);
      const e = UAM_ENTRIES[t.entry];
      t.path = new SpeedPath([from, [from[0], 16, from[2] - 2], [from[0] + (e[0] - from[0]) * 0.2, 70, from[2] + (e[2] - from[2]) * 0.2], e], [0.4, 4, 14, 22]);
      t.phase = 'depart';
    }
    t.t = 0;
  }
  update(dt) {
    dt *= this.speedK;
    this.rotorSpin += dt * 40;
    let i = 0;
    for (const t of this.taxis) {
      if (t.phase === 'wait') {
        t.t += dt;
        if (t.t > 18) { this.plan(t, false); }
      } else {
        t.t += dt;
        if (t.t >= t.path.duration) {
          if (t.phase === 'approach') { t.phase = 'wait'; t.t = 0; }
          else { if (t.pad >= 0) this.padBusy[t.pad] = false; t.pad = -1; t.entry = Math.floor(this.r() * UAM_ENTRIES.length); this.plan(t, true); }
        }
      }
      if (t.phase !== 'wait') {
        const u = t.path.uAtTime(t.t);
        t.path.pointAtU(u, t.pos);
        t.path.tangentAtU(u, t.tan);
      } else {
        t.tan.set(0, 0, 1);
      }
      const bob = t.phase === 'wait' ? 0 : Math.sin(t.t * 1.7 + i) * 0.15;
      this._o.position.copy(t.pos);
      this._o.position.y += bob;
      const horiz = Math.hypot(t.tan.x, t.tan.z);
      if (horiz > 0.2) orientAlong(this._o, t.tan, 0, true); else this._o.rotation.set(0, i * 0.7, 0);
      this._o.rotateX(-Math.min(0.25, horiz * 0.25 * (t.phase === 'wait' ? 0 : 1)));
      this._o.updateMatrix();
      for (const im of this.parts) { this._m.multiplyMatrices(this._o.matrix, im.userData.local); im.setMatrixAt(i, this._m); }
      for (let k = 0; k < 4; k++) {
        const [hx, hz] = this.hubs[k];
        this._r.position.set(hx, 2.5, hz);
        this._r.rotation.set(0, this.rotorSpin * (k % 2 ? 1 : -1), 0);
        this._r.updateMatrix();
        this._m.multiplyMatrices(this._o.matrix, this._r.matrix);
        this.rotors.setMatrixAt(i * 4 + k, this._m);
      }
      i++;
    }
    for (const im of this.parts) { im.count = i; im.instanceMatrix.needsUpdate = true; }
    this.rotors.count = i * 4;
    this.rotors.instanceMatrix.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ *
 * Sky full of tracked paths: arcs over the region as line segments with
 * fading vertex colours, moving dots, and UAM corridors as tubes.
 * ------------------------------------------------------------------ */
export class SkyPaths {
  constructor(scene, M, n = 900) {
    this.n = n;
    this.group = new THREE.Group();
    this.group.name = 'skypaths';
    this.group.visible = false;
    scene.add(this.group);
    const r = rng(2035);
    const SEG = 24;
    const pos = new Float32Array(n * SEG * 2 * 3), col = new Float32Array(n * SEG * 2 * 3);
    this.arcs = [];
    const c = new THREE.Color(), c2 = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a0 = r() * Math.PI * 2, a1 = a0 + Math.PI * (0.5 + r() * 1.0);
      const R = 2200 + r() * 600;
      const p0 = new THREE.Vector3(Math.cos(a0) * R, 0, Math.sin(a0) * R), p1 = new THREE.Vector3(Math.cos(a1) * R, 0, Math.sin(a1) * R);
      const hmax = 500 + r() * r() * 2600;
      const alt = hmax / 3100;
      const pts = [];
      for (let k = 0; k <= SEG; k++) {
        const t = k / SEG;
        const p = p0.clone().lerp(p1, t);
        p.y = 350 + hmax * Math.sin(Math.PI * t) ** 0.6;
        pts.push(p);
      }
      // colour by altitude: cyan (low) → violet (mid) → white (high)
      c.set('#5ee7ff').lerp(c2.set('#b48cff'), THREE.MathUtils.smoothstep(alt, 0.1, 0.6)).lerp(c2.set('#ffffff'), THREE.MathUtils.smoothstep(alt, 0.6, 1.0));
      const fadeK = 0.25 + r() * 0.5;
      for (let k = 0; k < SEG; k++) {
        const o = (i * SEG + k) * 6;
        pos.set([pts[k].x, pts[k].y, pts[k].z, pts[k + 1].x, pts[k + 1].y, pts[k + 1].z], o);
        const f0 = Math.sin(Math.PI * (k / SEG)) * fadeK, f1 = Math.sin(Math.PI * ((k + 1) / SEG)) * fadeK;
        col.set([c.r * f0, c.g * f0, c.b * f0, c.r * f1, c.g * f1, c.b * f1], o);
      }
      this.arcs.push({ pts, speed: 0.02 + r() * 0.04, phase: r(), color: c.clone() });
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    lg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.lines.frustumCulled = false;
    this.lines.userData.noDepth = true;
    this.group.add(this.lines);
    // dots
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const dc = new Float32Array(n * 3);
    this.arcs.forEach((a, i) => dc.set([a.color.r, a.color.g, a.color.b], i * 3));
    dg.setAttribute('aColor', new THREE.BufferAttribute(dc, 3));
    this.dotU = { uScale: { value: 1000 } };
    this.dots = new THREE.Points(dg, new THREE.ShaderMaterial({
      uniforms: this.dotU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec3 aColor; uniform float uScale; varying vec3 vC; void main(){ vC = aColor * 2.5; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(14.0 * uScale / -mv.z, 2.0, 12.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float r2 = dot(p,p); if (r2 > 1.0) discard; float a = exp(-r2 * 4.0); gl_FragColor = vec4(vC * a, a); }`,
    }));
    this.dots.frustumCulled = false;
    this.dots.userData.noDepth = true;
    this.group.add(this.dots);
    // UAM corridors
    const cor = new THREE.Group();
    const cm = flowMaterial({ color: '#b48cff', speed: 25, spacing: 60, intensity: 0.6, opacity: 0.22, roughness: 0.3 });
    cm.depthWrite = false;
    cm.side = THREE.DoubleSide;
    for (const e of UAM_ENTRIES) {
      const curve = curveFrom([e, [e[0] * 0.5, 120, 90 + (e[2] - 90) * 0.5], [0, 70, 90]]);
      const geo = new THREE.TubeGeometry(curve, 24, 12, 10, false);
      const uv = geo.attributes.uv;
      const len = curve.getLength();
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len);
      const m = new THREE.Mesh(geo, cm);
      m.userData.noDepth = true;
      m.castShadow = false;
      m.renderOrder = 2;
      cor.add(m);
    }
    this.corridors = cor;
    this.group.add(cor);
    this.density = 1;
    this.time = 0;
    this.altMin = 0; this.altMax = 1;
    this._p = new THREE.Vector3();
  }
  setDensity(k) {
    this.density = k;
    const n = Math.round(this.n * k);
    this.lines.geometry.setDrawRange(0, n * 24 * 2);
    this.dots.geometry.setDrawRange(0, n);
  }
  resize(bufferH, fov) { this.dotU.uScale.value = bufferH / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)); }
  update(dt) {
    if (!this.group.visible) return;
    this.time += dt;
    const pos = this.dots.geometry.attributes.position;
    for (let i = 0; i < this.arcs.length; i++) {
      const a = this.arcs[i];
      const t = (a.phase + this.time * a.speed) % 1;
      const k = t * 24, k0 = Math.floor(k), f = k - k0;
      const p0 = a.pts[Math.min(24, k0)], p1 = a.pts[Math.min(24, k0 + 1)];
      this._p.lerpVectors(p0, p1, f);
      pos.setXYZ(i, this._p.x, this._p.y, this._p.z);
    }
    pos.needsUpdate = true;
  }
}

export { gateName };
