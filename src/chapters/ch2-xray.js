import * as THREE from 'three';
import { UNDERGROUND } from '../world/layout.js';
import { smooth } from '../core/rng.js';

/* Chapter 2 — Airport x-ray: the ground turns to glass; the hidden networks come alive */
const LAYERS = Object.keys(UNDERGROUND);
let grow = null; // { from, to, t0, dur }
let lastClick = 0;

const metricOf = (key, t, ctx) => {
  const k = ctx.sim.flow || 1;
  const s = Math.sin(t * 0.37) * 0.5 + 0.5;
  switch (key) {
    case 'baggage': return `${Math.round((540 + s * 160) * k)} bags/min`;
    case 'fuel': return `${Math.round((2600 + s * 900) * k)} L/min`;
    case 'power': return `${(18.4 + s * 3.2).toFixed(1)} MW`;
    case 'data': return `${Math.round(640 + s * 220)} Gb/s`;
    case 'water': return `${Math.round(310 + s * 70)} m³/h`;
    case 'apm': return `${Math.round((1800 + s * 400) * k)} pax/h`;
  }
  return '';
};

export default {
  id: 'xray',
  title: 'Airport x-ray',
  sub: 'The hidden airport',
  blurb: 'The ground turns translucent and reveals what the airport is standing on: baggage tunnels, the fuel hydrant ring, power, data, water and the people mover. Click anywhere on the ground to open the glass there.',
  duration: 46,
  hour: [8.0, 8.7],
  shots: [
    { at: 0, pos: [-140, 300, 430], target: [0, -4, -40], fov: 38 },
    { at: 46, pos: [330, 230, 290], target: [40, -6, -20], fov: 38, orbit: true, ease: 'sine' },
  ],
  captions: [
    { at: 1, text: 'Under the apron the airport has a second body. Let the ground go <b>glassy</b>.' },
    { at: 8, text: '<em>Baggage pods</em> run in tunnels from the sorting hall to a lift at every stand.' },
    { at: 15, text: 'The <b>fuel hydrant ring</b> circles the apron at three metres down. No tankers needed: each stand has a pit.' },
    { at: 22, text: 'Power, data and water thread between them. The people mover runs deepest, under the terminal.' },
    { at: 30, text: 'Click anywhere on the ground to open the x-ray there. The panel toggles each network.' },
    { at: 39, text: 'This is the organism’s circulation. Everything above ground depends on it.' },
  ],
  params: [
    { key: 'radius', label: 'X-ray radius', type: 'range', min: 40, max: 1200, step: 10, default: 520, fmt: 'm', group: 'Glass' },
    { key: 'edge', label: 'Edge softness', type: 'range', min: 4, max: 160, step: 2, default: 46, fmt: 'm', group: 'Glass' },
    { key: 'alpha', label: 'Glass opacity', type: 'range', min: 0, max: 0.7, step: 0.01, default: 0.16, group: 'Glass' },
    { key: 'tint', label: 'Glass tint', type: 'color', default: '#6fb7d8', group: 'Glass' },
    { key: 'rim', label: 'Rim & grid colour', type: 'color', default: '#5ee7ff', group: 'Glass' },
    { key: 'grid', label: 'Schematic grid', type: 'toggle', default: true, group: 'Glass' },
    { key: 'gridSize', label: 'Grid spacing', type: 'range', min: 2, max: 50, step: 1, default: 10, fmt: 'm', group: 'Glass' },
    { key: 'everywhere', label: 'X-ray the whole site', type: 'button', group: 'Glass' },
    { key: 'reset', label: 'Reset to the apron centre', type: 'button', group: 'Glass' },
    { key: 'flow', label: 'Flow rate', type: 'range', min: 0, max: 4, step: 0.1, default: 1, fmt: 'x', group: 'Networks' },
    { key: 'glow', label: 'Pulse intensity', type: 'range', min: 0, max: 2.5, step: 0.05, default: 1, group: 'Networks' },
    { key: 'peel', label: 'Depth peel', type: 'range', min: 0, max: 1, step: 0.01, default: 0, hint: 'Hides the deeper layers first, down to the fibre near the surface.', group: 'Networks' },
    ...LAYERS.map((k) => ({ key: 'layer_' + k, label: UNDERGROUND[k].name, type: 'toggle', default: true, group: 'Networks' })),
    { key: 'labels', label: 'Network labels', type: 'toggle', default: true, group: 'Networks' },
  ],
  enter(ctx, p) {
    const U = ctx.world.underground;
    U.group.visible = true;
    ctx.XRAY.uXray.value = 1;
    ctx.XRAY.uXrayCenter.value.set(0, -60);
    ctx.setXrayBlend(true);
    grow = { from: 0, to: p.radius, t0: 1.2, dur: 5.5 };
    ctx.canvas.classList.add('xray');
    ctx.post.setWash('#5ee7ff', 0.3);
    ctx.post.setScan(0.6);
    ctx.sound.mix({ wind: 0.4, jets: 0.2, hum: 0.8, drone: 0, room: 0.5 });
    ctx.onCanvasClick = (hit) => {
      if (!hit) return;
      ctx.XRAY.uXrayCenter.value.set(hit.x, hit.z);
      grow = { from: 0, to: p.radius, t0: ctx.director.t, dur: 3.2 };
      lastClick = ctx.director.t;
      ctx.sound.cue('ping');
      ctx.toast('X-ray opened here');
    };
    this.applyAll(ctx, p);
  },
  applyAll(ctx, p) {
    const X = ctx.XRAY, U = ctx.world.underground;
    X.uXrayEdge.value = p.edge;
    X.uXrayAlpha.value = p.alpha;
    X.uXrayTint.value.set(p.tint);
    X.uXrayRim.value.set(p.rim);
    X.uXrayGrid.value = p.grid ? 1 : 0;
    X.uXrayGridSize.value = p.gridSize;
    U.setFlowRate(p.flow);
    U.setIntensity(p.glow);
    ctx.sim.flow = p.flow;
    for (const k of LAYERS) {
      const depthOk = UNDERGROUND[k].y >= -THREE.MathUtils.lerp(20, 1.2, p.peel);
      U.setLayer(k, p['layer_' + k] && depthOk);
    }
  },
  onParam(ctx, key, v, p) {
    if (key === 'everywhere') { grow = { from: ctx.XRAY.uXrayRadius.value, to: 2600, t0: ctx.director.t, dur: 3 }; ctx.toast('Glass everywhere'); return; }
    if (key === 'reset') { ctx.XRAY.uXrayCenter.value.set(0, -60); grow = { from: 0, to: p.radius, t0: ctx.director.t, dur: 3 }; return; }
    if (key === 'radius') { grow = { from: ctx.XRAY.uXrayRadius.value, to: v, t0: ctx.director.t, dur: 0.6 }; return; }
    this.applyAll(ctx, p);
  },
  scrub(ctx, t) { if (grow && t < grow.t0) grow = { from: 0, to: grow.to, t0: Math.min(1.2, t), dur: 5.5 }; },
  update(ctx, t, dt, p) {
    if (grow) {
      const k = THREE.MathUtils.clamp((t - grow.t0) / grow.dur, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      ctx.XRAY.uXrayRadius.value = grow.from + (grow.to - grow.from) * e;
    }
    const U = ctx.world.underground;
    if (p.labels) {
      for (const k of LAYERS) {
        const n = U.nets[k];
        const id = 'net:' + k;
        if (!n.on) { ctx.labels.remove(id); continue; }
        const html = `<div class="lk" style="--c:${n.color}">${n.name}</div><div class="ls">${metricOf(k, t, ctx)}</div>`;
        ctx.labels.add(id, { anchor: n.anchor, html, cls: 'net', offset: [0, -26], leader: true, maxDist: 2500 });
        ctx.labels.items.get(id).el.style.setProperty('--c', n.color);
      }
    } else ctx.labels.removeWhere((id) => id.startsWith('net:'));
  },
  exit(ctx) {
    ctx.onCanvasClick = null;
    ctx.canvas.classList.remove('xray');
    ctx.XRAY.uXray.value = 0;
    ctx.XRAY.uXrayRadius.value = 0;
    ctx.setXrayBlend(false);
    ctx.world.underground.group.visible = false;
    ctx.post.setWash(null, 0);
    ctx.post.setScan(0);
    ctx.labels.removeWhere((id) => id.startsWith('net:'));
  },
  panel(ctx, p, t) {
    const U = ctx.world.underground;
    let rows = '';
    for (const k of LAYERS) {
      const n = U.nets[k];
      rows += `<div class="legend-row ${n.on ? '' : 'off'}" style="--c:${n.color}"><i></i><span class="ln">${n.name}</span><span class="lm">${UNDERGROUND[k].y} m</span><span class="lm">${metricOf(k, t, ctx)}</span></div>`;
    }
    return `<div class="legend">${rows}</div><div class="pnote">Radius ${Math.round(ctx.XRAY.uXrayRadius.value)} m · centred at (${Math.round(ctx.XRAY.uXrayCenter.value.x)}, ${Math.round(ctx.XRAY.uXrayCenter.value.y)}) · click the ground to move it.</div>`;
  },
};
