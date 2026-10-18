import * as THREE from 'three';
import { VERTIPORT } from '../world/layout.js';

/* Chapter 8 — The future sky: air taxis on the roof vertiport, then a sky full of tracked paths */
const _p = new THREE.Vector3();
export default {
  id: 'sky',
  title: 'The future sky',
  sub: 'Everything that flies, tracked',
  blurb: 'Air taxis land on the vertiport on the terminal roof, and the camera pulls up into a sky full of tracked flight paths: airliners, air taxis, drones, corridors stacked by altitude.',
  duration: 72,
  hour: [20.8, 21.7],
  shots: [
    { at: 0, pos: [96, 33, 150], target: [-10, 26, 88], fov: 40 },
    { at: 14, pos: [-86, 40, 32], target: [0, 28, 92], fov: 40, orbit: true },
    { at: 26, pos: [40, 130, 330], target: [0, 60, 90], fov: 44 },
    { at: 42, pos: [0, 980, 920], target: [0, 360, -100], fov: 50 },
    { at: 58, pos: [-540, 1750, 1320], target: [0, 460, 0], fov: 55, orbit: true },
    { at: 72, pos: [-980, 2050, 1500], target: [0, 520, 0], fov: 56, orbit: true },
  ],
  captions: [
    { at: 1.5, text: 'Night. On the terminal roof, the <em>vertiport</em> takes its evening rush.' },
    { at: 9, text: 'Air taxis arrive on corridors stacked above the city, land on a V, swap passengers, and lift in ninety seconds.' },
    { at: 22, text: 'Pull up. Every airliner, every air taxi, every delivery drone: one picture.' },
    { at: 40, text: 'Paths coloured by altitude: <b>cyan</b> low, <em>violet</em> mid, white high. Nothing moves untracked.' },
    { at: 56, text: 'The organism never sleeps. Tomorrow at dawn, it breathes in again.' },
  ],
  params: [
    { key: 'taxis', label: 'Air taxis', type: 'range', min: 0, max: 12, step: 1, default: 8 },
    { key: 'taxiSpeed', label: 'Air-taxi speed', type: 'range', min: 0.3, max: 3, step: 0.1, default: 1, fmt: 'x' },
    { key: 'taxiLabels', label: 'Air-taxi labels', type: 'toggle', default: true },
    { key: 'padGlow', label: 'Pad lights', type: 'range', min: 0, max: 2.5, step: 0.05, default: 1.4 },
    { key: 'density', label: 'Tracked paths', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85, fmt: 'pct', group: 'The sky' },
    { key: 'pathsFrom', label: 'Paths appear', type: 'seg', options: [{ value: 'film', label: 'with the film' }, { value: 'always', label: 'always' }], default: 'film', group: 'The sky' },
    { key: 'corridors', label: 'UAM corridors', type: 'toggle', default: true, group: 'The sky' },
    { key: 'dotSpeed', label: 'Traffic speed', type: 'range', min: 0.1, max: 4, step: 0.1, default: 1, fmt: 'x', group: 'The sky' },
    { key: 'loop', label: 'Loop back to dawn at the end', type: 'toggle', default: true, group: 'The sky' },
  ],
  enter(ctx, p) {
    const W = ctx.world;
    W.taxis.setCount(p.taxis);
    W.taxis.speedK = p.taxiSpeed;
    W.taxis.group.visible = true;
    ctx.daylight.pointLight(2, new THREE.Vector3(-34, VERTIPORT.y + 9, 91), '#ffd9a0', 40, 70);
    ctx.daylight.pointLight(3, new THREE.Vector3(34, VERTIPORT.y + 9, 91), '#9fe9ff', 36, 70);
    W.skyPaths.setDensity(p.density);
    W.skyPaths.corridors.visible = p.corridors;
    W.lights.setGroup(7, p.padGlow);
    ctx.sim.trafficRate = 2.0;
    ctx.sim.speed = 3;
    ctx.director.loop = p.loop;
    ctx.post.setWash('#b48cff', 0.16);
    ctx.sound.mix({ wind: 0.6, jets: 0.3, hum: 0, drone: 0.35, room: 0 });
  },
  onParam(ctx, key, v, p) {
    const W = ctx.world;
    if (key === 'taxis') W.taxis.setCount(v);
    if (key === 'taxiSpeed') W.taxis.speedK = v;
    if (key === 'density') W.skyPaths.setDensity(v);
    if (key === 'corridors') W.skyPaths.corridors.visible = v;
    if (key === 'padGlow') W.lights.setGroup(7, v);
    if (key === 'loop') ctx.director.loop = v;
    if (key === 'taxiLabels' && !v) ctx.labels.removeWhere((id) => id.startsWith('taxi:'));
  },
  update(ctx, t, dt, p) {
    const W = ctx.world;
    const k = p.pathsFrom === 'always' ? 1 : THREE.MathUtils.smoothstep(t, 24, 34);
    W.skyPaths.group.visible = k > 0.01;
    W.skyPaths.lines.material.opacity = 0.85 * k;
    W.skyPaths.dotSpeedK = p.dotSpeed;
    ctx.sim.speed = 3;
    ctx.sim.trafficRate = 2.0;
    // labels on the nearest air taxis
    if (p.taxiLabels) {
      const seen = new Set();
      W.taxis.taxis.forEach((tx, i) => {
        if (ctx.camera.position.distanceTo(tx.pos) > 320) return;
        const id = 'taxi:' + i;
        seen.add(id);
        const phase = tx.phase === 'wait' ? `on pad ${tx.pad + 1} · boarding` : tx.phase === 'approach' ? 'approach · corridor ' + (tx.entry + 1) : 'departing · corridor ' + (tx.entry + 1);
        ctx.labels.add(id, { anchor: tx.pos, html: `<div class="lk">eVTOL ${tx.id}</div><div class="ls">${phase} · ${tx.pax} pax</div>`, cls: 'taxi', offset: [0, -12], maxDist: 320 });
      });
      ctx.labels.removeWhere((id) => id.startsWith('taxi:') && !seen.has(id));
    }
    ctx.labels.add('global:vertiport', { anchor: _p.set(0, VERTIPORT.y + 6, 91), html: `<div class="lk">vertiport</div><div class="lt">Roof level · 4 pads</div><div class="ls">${W.taxis.padBusy.filter(Boolean).length} occupied · ${W.taxis.taxis.length} in the pattern</div>`, cls: 'taxi', offset: [0, -14], leader: true, maxDist: 700 });
  },
  exit(ctx) {
    const W = ctx.world;
    W.taxis.setCount(0);
    W.taxis.group.visible = false;
    ctx.daylight.releaseLight(2);
    ctx.daylight.releaseLight(3);
    W.skyPaths.group.visible = false;
    W.lights.setGroup(7, 1);
    ctx.sim.trafficRate = null;
    ctx.sim.speed = 1;
    ctx.director.loop = true;
    ctx.post.setWash(null, 0);
    ctx.labels.removeWhere((id) => id.startsWith('taxi:') || id === 'global:vertiport');
  },
  panel(ctx, p) {
    const W = ctx.world;
    return `<div class="legend"><div class="legend-row" style="--c:#b48cff"><i></i><span class="ln">Air taxis in the pattern</span><span class="lm">${W.taxis.taxis.length}</span></div>
      <div class="legend-row" style="--c:#5ee7ff"><i></i><span class="ln">Pads occupied</span><span class="lm">${W.taxis.padBusy.filter(Boolean).length} / 4</span></div>
      <div class="legend-row" style="--c:#ffffff"><i></i><span class="ln">Tracked paths</span><span class="lm">${Math.round(W.skyPaths.n * p.density)}</span></div></div>
      <div class="pnote">Altitude colouring: <span style="color:#5ee7ff">■</span> below 1 km &nbsp;<span style="color:#b48cff">■</span> 1–2 km &nbsp;<span style="color:#fff">■</span> above. Corridors into the vertiport sit at 150–180 m.</div>`;
  },
};
