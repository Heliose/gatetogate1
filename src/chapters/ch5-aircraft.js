import * as THREE from 'three';
import { HERO_GATE, gateX, STAND_Z } from '../world/layout.js';
import { ENGINE_X, ENGINE_Y, ENGINE_Z, AC } from '../world/aircraft.js';
import { setTransparent } from '../world/materials.js';

/* Chapter 5 — The aircraft: x-ray the airframe, then into an engine in glass or thermal view */
const HX = gateX(HERO_GATE), HZ = STAND_Z;
const ENG = [HX - ENGINE_X, AC.fuseY + ENGINE_Y, HZ + ENGINE_Z];
const LAYERS = ['structure', 'cabin', 'cargo', 'wiring', 'hydraulics', 'avionics', 'fuel'];
const LABELS = [
  { id: 'wiring', pos: [0.2, 1.7, 6], html: '<div class="lk">wiring</div><div class="lt">Harnesses</div><div class="ls">≈180 km of cable · fibre backbone</div>' },
  { id: 'hyd', pos: [3.8, -1.6, -1.2], html: '<div class="lk">hydraulics</div><div class="lt">Three systems</div><div class="ls">green · blue · yellow · 3000 psi</div>' },
  { id: 'avio', pos: [0, -1.2, 12.5], html: '<div class="lk">avionics</div><div class="lt">Avionics bay</div><div class="ls">flight computers · self-diagnosing</div>' },
  { id: 'fuel', pos: [-7.5, -1.0, -5.6], html: '<div class="lk">fuel</div><div class="lt">Wing tanks</div><div class="ls">18 t · sustainable fuel blend</div>' },
  { id: 'apu', pos: [0, 1.9, -17.5], html: '<div class="lk">power</div><div class="lt">APU</div><div class="ls">ground power & air when the engines sleep</div>' },
  { id: 'cabin', pos: [0, 0.6, 0], html: '<div class="lk">cabin</div><div class="lt">162 seats</div><div class="ls">single aisle · 27 rows</div>' },
];
const clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e6);
let spin = 0;

export default {
  id: 'aircraft',
  title: 'The aircraft',
  sub: 'Skin, nerves, and a heart of fire',
  blurb: 'X-ray through the airframe to see the wiring, hydraulics, avionics and fuel, then fly into an engine rendered as glass or as a thermal map. A cutaway plane slices the airframe wherever you want.',
  duration: 72,
  hour: [14.0, 14.6],
  shots: [
    { at: 0, pos: [HX + 58, 9, HZ - 50], target: [HX, 4, HZ + 2], fov: 36 },
    { at: 12, pos: [HX + 28, 15, HZ + 44], target: [HX, 4, HZ + 2], fov: 36, orbit: true },
    { at: 30, pos: [HX - 26, 9, HZ + 34], target: [HX, 3.6, HZ + 2], fov: 36, orbit: true },
    { at: 37, pos: [ENG[0] - 9, ENG[1] + 2.2, ENG[2] + 12], target: ENG, fov: 34 },
    { at: 52, pos: [ENG[0] - 10, ENG[1] + 1.5, ENG[2] - 9], target: ENG, fov: 34, orbit: true },
    { at: 72, pos: [ENG[0] + 7, ENG[1] + 3, ENG[2] + 7], target: ENG, fov: 34, orbit: true },
  ],
  captions: [
    { at: 1.5, text: 'NOVA 1735, on stand. Thirty-seven metres of aluminium and composite, and a nervous system.' },
    { at: 7, text: 'The skin goes to <b>glass</b>. Frames and floor beams first: the skeleton.' },
    { at: 15, text: '<em>Wiring</em> along the crown, hydraulics under the floor, the avionics bay beneath the cockpit. Fuel lives in the wings.' },
    { at: 26, text: 'Every system reports its own health. The hangar in the next chapter already knows what will wear out.' },
    { at: 38, text: 'Into the left engine. In <b>glass</b>: fan, compressors, combustor, turbines, one shaft.' },
    { at: 53, text: 'In <em>thermal</em>: cold blue at the fan, white at the combustor, cooling through the turbines to the exhaust.' },
  ],
  params: [
    { key: 'follow', label: 'X-ray follows the film', type: 'toggle', default: true, hint: 'Off: use the sliders below.' },
    { key: 'xray', label: 'Airframe x-ray', type: 'range', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'skinAlpha', label: 'Skin opacity', type: 'range', min: 0, max: 0.6, step: 0.01, default: 0.14 },
    { key: 'cut', label: 'Cutaway plane', type: 'range', min: -20, max: 20, step: 0.1, default: 20, fmt: 'm', hint: 'Slices the airframe along its width. 20 = off.' },
    ...LAYERS.map((k) => ({ key: 'layer_' + k, label: k[0].toUpperCase() + k.slice(1), type: 'toggle', default: true, group: 'Systems' })),
    { key: 'labels', label: 'System labels', type: 'toggle', default: true, group: 'Systems' },
    { key: 'engineView', label: 'Engine view', type: 'seg', options: ['solid', 'glass', 'thermal'], default: 'glass', group: 'Engine' },
    { key: 'rpm', label: 'Fan speed', type: 'range', min: 0, max: 100, step: 1, default: 35, fmt: 'pct', group: 'Engine' },
    { key: 'glassAlpha', label: 'Nacelle opacity', type: 'range', min: 0.02, max: 0.6, step: 0.01, default: 0.18, group: 'Engine' },
    { key: 'engineAlways', label: 'Show the detailed engine', type: 'toggle', default: false, group: 'Engine', hint: 'Otherwise it appears when the film flies to it.' },
  ],
  enter(ctx, p) {
    const H = ctx.world.hero;
    H.systems.group.visible = true;
    H.engineDetail.group.visible = false;
    ctx.AIRX.uXray.value = 0;
    ctx.AIRX.uXrayAlpha.value = p.skinAlpha;
    ctx.renderer.localClippingEnabled = true;
    ctx.post.setWash('#5ee7ff', 0.18);
    ctx.sound.mix({ wind: 0.35, jets: 0.25, hum: 0.2, drone: 0, room: 0 });
    this.applyLayers(ctx, p);
  },
  applyLayers(ctx, p) {
    const S = ctx.world.hero.systems;
    for (const k of LAYERS) S.layers[k].visible = !!p['layer_' + k];
  },
  onParam(ctx, key, v, p) {
    if (key.startsWith('layer_')) this.applyLayers(ctx, p);
    if (key === 'skinAlpha') ctx.AIRX.uXrayAlpha.value = v;
    if (key === 'glassAlpha') ctx.ENGINE.uGlassAlpha.value = v;
    if (!p.labels) ctx.labels.removeWhere((id) => id.startsWith('sys:'));
  },
  update(ctx, t, dt, p) {
    const H = ctx.world.hero;
    const body = H.ac.body;
    // airframe x-ray
    const scripted = THREE.MathUtils.smoothstep(t, 5, 11) * (1 - THREE.MathUtils.smoothstep(t, 34, 37));
    const x = p.follow ? scripted : p.xray;
    ctx.AIRX.uXray.value = x;
    const xrayOn = x > 0.01;
    for (const m of Object.values(H.mats)) if (m.userData.xray) { setTransparent(m, xrayOn); m.depthWrite = !xrayOn || x < 0.5; }
    H.systems.group.visible = xrayOn;
    // cutaway
    const cutOn = p.cut < 19.9;
    clipPlane.constant = cutOn ? HX + p.cut : 1e6;
    // engine
    const engineTime = t >= 36;
    const showEngine = p.engineAlways || engineTime;
    H.engineDetail.group.visible = showEngine;
    H.ac.parts.engineL.visible = !showEngine;
    const view = p.follow ? (t < 51 ? 'glass' : 'thermal') : p.engineView;
    const glassTarget = view === 'glass' || view === 'thermal' ? 1 : 0;
    const thermTarget = view === 'thermal' ? 1 : 0;
    const E = ctx.ENGINE;
    E.uGlass.value += (glassTarget - E.uGlass.value) * Math.min(1, dt * 3);
    E.uThermal.value += (thermTarget - E.uThermal.value) * Math.min(1, dt * 2.5);
    E.uGlassAlpha.value = p.glassAlpha;
    const glassy = E.uGlass.value > 0.05;
    H.engineDetail.mats.skin.depthWrite = !glassy;
    H.engineDetail.mats.casing.depthWrite = !glassy;
    spin += dt * (p.rpm / 100) * 28;
    H.engineDetail.fan.rotation.z = spin;
    for (const f of H.ac.fans) f.rotation.y = spin;
    ctx.post.setWash(thermTarget ? '#ff9a3d' : '#5ee7ff', 0.18 + E.uThermal.value * 0.15);
    // labels
    if (p.labels && xrayOn && !showEngine) {
      for (const l of LABELS) ctx.labels.add('sys:' + l.id, { anchor: () => body.localToWorld(new THREE.Vector3(...l.pos)), html: l.html, cls: 'holo', offset: [0, -16], leader: true, maxDist: 160 });
    } else ctx.labels.removeWhere((id) => id.startsWith('sys:'));
    if (showEngine) {
      ctx.labels.add('sys:eng', { anchor: new THREE.Vector3(ENG[0], ENG[1] + 1.4, ENG[2]), html: `<div class="lk">${view} view</div><div class="lt">Left engine</div><div class="ls">${view === 'thermal' ? 'combustor ≈1700 °C · exhaust ≈600 °C' : 'fan · LPC · HPC · combustor · HPT · LPT'} · ${Math.round(p.rpm)}% N1</div>`, cls: 'holo', offset: [0, -16], leader: true });
    } else ctx.labels.remove('sys:eng');
    ctx.focusOverride = showEngine ? new THREE.Vector3(...ENG) : null;
  },
  exit(ctx) {
    const H = ctx.world.hero;
    ctx.AIRX.uXray.value = 0;
    for (const m of Object.values(H.mats)) if (m.userData.xray) { setTransparent(m, false); m.depthWrite = true; }
    H.systems.group.visible = false;
    H.engineDetail.group.visible = false;
    H.ac.parts.engineL.visible = true;
    clipPlane.constant = 1e6;
    ctx.ENGINE.uGlass.value = 0;
    ctx.ENGINE.uThermal.value = 0;
    ctx.post.setWash(null, 0);
    ctx.labels.removeWhere((id) => id.startsWith('sys:'));
    ctx.focusOverride = null;
  },
  panel(ctx, p, t) {
    const E = ctx.ENGINE;
    return `<div class="legend"><div class="legend-row" style="--c:#8fe9ff"><i></i><span class="ln">Airframe x-ray</span><span class="lm">${Math.round(ctx.AIRX.uXray.value * 100)}%</span></div>
      <div class="legend-row" style="--c:#dfe3e7"><i></i><span class="ln">Engine glass</span><span class="lm">${Math.round(E.uGlass.value * 100)}%</span></div>
      <div class="legend-row" style="--c:#ff9a3d"><i></i><span class="ln">Thermal view</span><span class="lm">${Math.round(E.uThermal.value * 100)}%</span></div></div>
      <div class="pnote">Thermal palette: <span style="color:#1a5fd0">■</span> fan &nbsp;<span style="color:#38c86a">■</span> compressors &nbsp;<span style="color:#ffd93a">■</span> HPC exit &nbsp;<span style="color:#ffffff">■</span> combustor &nbsp;<span style="color:#ff7a3d">■</span> turbines & exhaust.</div>`;
  },
  clipPlane,
};
