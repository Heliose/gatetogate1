import * as THREE from 'three';
import { HANGAR } from '../world/layout.js';

/* Chapter 6 — The hangar: drones scan the fuselage; the digital twin flags a part */
const AX = HANGAR.x, AZ = HANGAR.z - 4; // hangar aircraft origin
const PARTS = {
  engineR: { name: 'Engine 2 · fan blade set', detail: '212 cycles to limit · vibration trend +4% · replace at next C-check', pos: [5.6, 1.25, 2.2] },
  engineL: { name: 'Engine 1 · oil pressure sensor', detail: 'drift 2.1% over 40 flights · swap on the next stop', pos: [-5.6, 1.25, 2.2] },
  noseGear: { name: 'Nose gear · steering actuator', detail: 'response lag 180 ms · inspect seals', pos: [0, 1.6, 13.2] },
  mainGearL: { name: 'Left main gear · brake pack', detail: 'wear 91% · 6 landings remaining', pos: [-3.8, 1.4, -1.3] },
  mainGearR: { name: 'Right main gear · tyre', detail: 'tread 2.1 mm · change today', pos: [3.8, 1.4, -1.3] },
  fin: { name: 'Rudder · hinge bearing', detail: 'play 0.3 mm · within limits, watch', pos: [0, 9, -14] },
  apu: { name: 'APU · exhaust liner', detail: 'EGT margin 12 °C · overhaul due', pos: [0, 5.5, -18] },
  radome: { name: 'Radome · lightning strip', detail: 'resistance high · reseal', pos: [0, 3.2, 18] },
};
const DRONE_ORBIT_R = 6.2;
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _axis = new THREE.Vector3(0, -1, 0), _dir = new THREE.Vector3();
let scan = 0, flagged = false, scanLoops = 0, lastPart = null;

export default {
  id: 'hangar',
  title: 'The hangar',
  sub: 'The twin knows first',
  blurb: 'Drones sweep the fuselage with scanning light while a digital twin of this specific aircraft materialises beside it. When the scan completes, the twin lights up the part that is due for replacement.',
  duration: 62,
  hour: [17.5, 18.2],
  shots: [
    { at: 0, pos: [AX + 30, 24, AZ + 150], target: [AX, 8, AZ], fov: 38 },
    { at: 12, pos: [AX + 52, 11, AZ - 26], target: [AX, 7, AZ], fov: 38, orbit: true },
    { at: 28, pos: [AX - 40, 27, AZ + 42], target: [AX, 12, AZ], fov: 38, orbit: true },
    { at: 44, pos: [AX + 34, 10, AZ + 28], target: [AX, 9, AZ], fov: 36, orbit: true },
    { at: 62, pos: [AX - 30, 14, AZ + 40], target: [AX, 9, AZ], fov: 36, orbit: true },
  ],
  captions: [
    { at: 1.5, text: 'Golden hour in the hangar. The aircraft that landed this morning gets its nightly read.' },
    { at: 8, text: '<b>Drones</b> sweep the skin with structured light, tail to nose. Every rivet, every hairline.' },
    { at: 18, text: 'Above it, the <em>digital twin</em> materialises: not a model of the type, a model of this airframe, every flight it ever flew.' },
    { at: 34, text: 'The scan closes. The twin compares, and one part lights up.' },
    { at: 46, text: 'Engine 2, fan blade set: two hundred cycles left. It will be swapped before anyone notices.' },
  ],
  params: [
    { key: 'drones', label: 'Drones', type: 'range', min: 1, max: 6, step: 1, default: 3 },
    { key: 'scanSpeed', label: 'Scan speed', type: 'range', min: 0.3, max: 3, step: 0.1, default: 1, fmt: 'x' },
    { key: 'beams', label: 'Scanner beams', type: 'toggle', default: true },
    { key: 'hex', label: 'Scanned-skin grid', type: 'toggle', default: true },
    { key: 'scanColor', label: 'Scan colour', type: 'color', default: '#5ee7ff' },
    { key: 'loop', label: 'Repeat the scan', type: 'toggle', default: false },
    { key: 'holoPlace', label: 'Twin placement', type: 'seg', options: ['above', 'beside', 'overlay'], default: 'above', group: 'Digital twin' },
    { key: 'holoColor', label: 'Twin colour', type: 'color', default: '#b48cff', group: 'Digital twin' },
    { key: 'holoOpacity', label: 'Twin opacity', type: 'range', min: 0.1, max: 1.5, step: 0.05, default: 0.8, group: 'Digital twin' },
    { key: 'holoSpin', label: 'Twin rotates', type: 'toggle', default: true, group: 'Digital twin' },
    { key: 'part', label: 'Flagged part', type: 'select', options: Object.entries(PARTS).map(([k, v]) => ({ value: k, label: v.name })), default: 'engineR', group: 'Digital twin' },
    { key: 'flagNow', label: 'Flag it now', type: 'button', group: 'Digital twin' },
  ],
  enter(ctx, p) {
    const W = ctx.world;
    W.twin.ac.group.visible = true;
    for (const d of W.drones) d.group.visible = true;
    ctx.SCAN.uScanOn.value = p.hex ? 1 : 0;
    ctx.SCAN.uScanColor.value.set(p.scanColor);
    scan = 0; flagged = false; scanLoops = 0; lastPart = null;
    this.applyHolo(ctx, p);
    ctx.post.setWash('#b48cff', 0.14);
    ctx.sound.mix({ wind: 0.15, jets: 0.05, hum: 0.3, drone: 0.9, room: 0.4 });
    ctx.focusOverride = new THREE.Vector3(AX, 6, AZ);
  },
  applyHolo(ctx, p) {
    const T = ctx.world.twin;
    for (const m of Object.values(T.mats)) if (m.uniforms) { m.uniforms.uColor.value.set(p.holoColor); m.uniforms.uOpacity.value = p.holoOpacity; }
    const off = p.holoPlace === 'above' ? [0, 16, 0] : p.holoPlace === 'beside' ? [-34, 0.2, 0] : [0, 0.12, 0];
    T.ac.group.position.set(AX + off[0], off[1], AZ + off[2]);
    if (p.holoPlace !== 'above' || !p.holoSpin) T.ac.group.rotation.y = 0;
  },
  onParam(ctx, key, v, p) {
    if (['holoPlace', 'holoColor', 'holoOpacity', 'holoSpin'].includes(key)) this.applyHolo(ctx, p);
    if (key === 'hex') ctx.SCAN.uScanOn.value = v ? 1 : 0;
    if (key === 'scanColor') { ctx.SCAN.uScanColor.value.set(v); for (const d of ctx.world.drones) d.beamMat.uniforms.uColor.value.set(v); }
    if (key === 'flagNow') { scan = 1; flagged = false; }
    if (key === 'part') { flagged = false; }
  },
  scrub(ctx, t, p) { flagged = false; },
  update(ctx, t, dt, p) {
    const W = ctx.world, T = W.twin;
    // scan progress: 4 s in, then ~32 s at speed 1
    const dur = 32 / p.scanSpeed;
    let s = THREE.MathUtils.clamp((t - 4) / dur, 0, 1);
    if (p.loop && t - 4 > dur) { const k = ((t - 4) % (dur + 6)) / dur; s = THREE.MathUtils.clamp(k, 0, 1); if (k > 1) s = 1; }
    if (p.loop && s < 0.02) flagged = false;
    scan = s;
    ctx.SCAN.uScan.value = s;
    for (const m of Object.values(T.mats)) if (m.uniforms) m.uniforms.uReveal.value = s;
    // drones orbit the scan plane
    const z0 = ctx.SCAN.uScanZ0.value, z1 = ctx.SCAN.uScanZ1.value;
    const zScan = AZ + z0 + (z1 - z0) * s;
    const n = Math.round(p.drones);
    W.drones.forEach((d, i) => {
      d.group.visible = i < n;
      if (i >= n) return;
      const a = (i / n) * Math.PI * 2 + t * 0.55 + Math.sin(t * 0.3 + i) * 0.2;
      const r = DRONE_ORBIT_R + Math.sin(t * 0.7 + i * 2) * 0.6;
      const y = Math.max(1.6, 3.6 + Math.sin(a) * r);
      d.group.position.set(AX + Math.cos(a) * r, y, zScan + Math.sin(t * 1.3 + i) * 0.6);
      d.group.rotation.set(Math.sin(t * 2 + i) * 0.04, a, Math.cos(t * 1.7 + i) * 0.04);
      for (const rt of d.rotors) rt.rotation.y += dt * 60;
      // beam toward the fuselage axis
      _p.set(AX, 3.6, zScan).sub(d.group.position).normalize();
      _q.copy(_p).applyQuaternion(d.group.quaternion.clone().invert());
      d.beam.quaternion.setFromUnitVectors(_axis, _q);
      d.beam.visible = p.beams && s > 0 && s < 1;
      d.beamMat.uniforms.uI.value = 0.35 + 0.15 * Math.sin(t * 7 + i);
      if (i < 2) ctx.daylight.pointLight(i, d.group.position, p.scanColor, s > 0 && s < 1 ? 26 : 0, 18);
    });
    // twin: rotate slowly when above
    if (p.holoPlace === 'above' && p.holoSpin) T.ac.group.rotation.y = Math.sin(t * 0.12) * 0.35;
    // flag the part when the scan completes
    const partKey = PARTS[p.part] ? p.part : 'engineR';
    if (s >= 1 && !flagged) {
      flagged = true;
      ctx.sound.cue('alert');
      ctx.toast(`Twin flags: ${PARTS[partKey].name}`);
    }
    if (lastPart !== partKey) { for (const k of Object.keys(PARTS)) T.ac.flaggable[k]?.traverse((o) => { if (o.material?.uniforms) o.material.uniforms.uFlag.value = 0; }); lastPart = partKey; }
    T.ac.flaggable[partKey]?.traverse((o) => { if (o.material?.uniforms) o.material.uniforms.uFlag.value = flagged ? 1 : 0; });
    // the real aircraft's part glows too (emissive pulse via a label only)
    const part = PARTS[partKey];
    if (flagged) {
      ctx.labels.add('hangar:part', { anchor: () => T.ac.body.localToWorld(_p.set(...part.pos)), html: `<div class="lk">digital twin · flagged</div><div class="lt">${part.name}</div><div class="ls">${part.detail}<br>confidence 94% · work order raised</div>`, cls: 'part', offset: [0, -22], leader: true, priority: 9 });
    } else ctx.labels.remove('hangar:part');
    ctx.labels.add('hangar:scan', { anchor: new THREE.Vector3(AX, 11, zScan), html: `<div class="lk">structured-light scan</div><div class="ls">${Math.round(s * 100)}% · ${n} drone${n > 1 ? 's' : ''} · ${(0.12 / p.scanSpeed).toFixed(2)} mm resolution</div>`, cls: 'holo', offset: [0, -10], maxDist: 300 });
    if (s >= 1 || s <= 0) ctx.labels.remove('hangar:scan');
    ctx.labels.add('hangar:twin', { anchor: () => _q.copy(T.ac.group.position).add(new THREE.Vector3(0, 10, -12)), html: `<div class="lk">digital twin</div><div class="lt">G-NOMX · 14,208 cycles</div><div class="ls">materialised ${Math.round(s * 100)}% · ${flagged ? '1 part flagged' : 'comparing…'}</div>`, cls: 'holo', offset: [0, -12], maxDist: 400 });
  },
  camera(ctx, t, out, p) {
    // after the flag, orbit the flagged part
    if (t < 44 || !flagged) return false;
    const T = ctx.world.twin;
    const part = PARTS[PARTS[p.part] ? p.part : 'engineR'];
    const target = T.ac.body.localToWorld(new THREE.Vector3(...part.pos));
    const k = (t - 44) * 0.25;
    out.target.copy(target);
    out.pos.set(target.x + Math.cos(k) * 11, target.y + 4, target.z + Math.sin(k) * 11);
    out.fov = 36;
    return true;
  },
  exit(ctx) {
    const W = ctx.world;
    W.twin.ac.group.visible = false;
    for (const d of W.drones) { d.group.visible = false; d.beam.visible = false; }
    ctx.SCAN.uScan.value = 0;
    ctx.daylight.releaseLight(0);
    ctx.daylight.releaseLight(1);
    ctx.post.setWash(null, 0);
    ctx.labels.removeWhere((id) => id.startsWith('hangar:'));
    ctx.focusOverride = null;
  },
  panel(ctx, p, t) {
    const part = PARTS[PARTS[p.part] ? p.part : 'engineR'];
    return `<div class="g-head"><span class="big">${Math.round(scan * 100)}%</span><span class="small">scanned · ${flagged ? 'twin has flagged a part' : scan > 0 ? 'drones sweeping tail → nose' : 'preparing'}</span></div>
      <div class="legend" style="margin-top:8px"><div class="legend-row" style="--c:${p.scanColor}"><i></i><span class="ln">Scan plane</span><span class="lm">z ${(ctx.SCAN.uScanZ0.value + (ctx.SCAN.uScanZ1.value - ctx.SCAN.uScanZ0.value) * scan).toFixed(1)} m</span></div>
      <div class="legend-row" style="--c:${p.holoColor}"><i></i><span class="ln">Twin</span><span class="lm">${p.holoPlace}</span></div>
      <div class="legend-row" style="--c:#ff7a59"><i></i><span class="ln">${part.name}</span><span class="lm">${flagged ? 'FLAGGED' : 'watching'}</span></div></div>`;
  },
};
