import * as THREE from 'three';
import { rng, hashStr, TileNoise, hex, mixc, smooth, lerp, rgb } from '../core/rng.js';
import { makeCanvas, paint, tex, roundRect } from '../core/canvas.js';
import { RUNWAY, APRON, GATE_COUNT, gateX, gateName, STAND_Z, SERVICE_ROAD, STAGING } from './layout.js';

/* ------------------------------------------------------------------ *
 * Procedural textures. Everything is painted on canvases; nothing is
 * loaded. Seeded, so every load looks the same.
 * ------------------------------------------------------------------ */

const cache = new Map();
const memo = (key, fn) => {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
};

/* ---------- tileable surfaces ---------- */
export const grassTex = () => memo('grass', () => {
  const n = new TileNoise(hashStr('grass'));
  const a = hex('#4f6a2e'), b = hex('#2f4520'), c = hex('#7f9444');
  const res = paint(512, (u, v) => {
    const f = n.fbm(u, v, 6, 6, 5, 0.55), g = n.fbm(u + 0.3, v + 0.7, 48, 48, 2);
    let col = mixc(b, a, f);
    col = mixc(col, c, Math.max(0, g - 0.62) * 1.4);
    // mowing stripes
    const stripe = 0.94 + 0.06 * Math.sin(u * Math.PI * 2 * 8);
    return col.map((x) => x * stripe);
  });
  return tex(res.canvas, { repeat: 1 / 14 });
});

export const asphaltTex = () => memo('asphalt', () => {
  const n = new TileNoise(hashStr('asphalt'));
  const a = hex('#3a3c40'), b = hex('#2b2d31'), c = hex('#50535a');
  const res = paint(512, (u, v, x, y, out) => {
    const f = n.fbm(u, v, 12, 12, 4), g = n.fbm(u, v, 96, 96, 2);
    let col = mixc(b, a, f);
    col = mixc(col, c, Math.max(0, g - 0.66) * 1.6);
    out.h = g;
    return col;
  }, true);
  const t = tex(res.canvas, { repeat: 1 / 9 });
  const bump = new THREE.CanvasTexture(res.height);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(1 / 9, 1 / 9);
  t.userData.bump = bump;
  return t;
});

export const concreteTex = (seed = 'concrete', base = '#9a9b98', dark = '#7b7c79', light = '#b6b7b3', slabs = 2) => memo(seed + base + slabs, () => {
  const n = new TileNoise(hashStr(seed));
  const a = hex(base), b = hex(dark), c = hex(light), joint = hex('#5b5c5a');
  const res = paint(512, (u, v, x, y, out) => {
    const f = n.fbm(u, v, 8, 8, 5), g = n.fbm(u + 0.5, v, 64, 64, 2);
    let col = mixc(b, a, f);
    col = mixc(col, c, Math.max(0, g - 0.6) * 0.9);
    const stain = n.fbm(u + 0.2, v + 0.4, 3, 3, 3);
    col = mixc(col, b, Math.max(0, stain - 0.6) * 0.8);
    // slab joints
    const fu = (u * slabs) % 1, fv = (v * slabs) % 1;
    const e = 0.008 * slabs;
    const j = Math.min(smooth(0, e, fu), smooth(0, e, 1 - fu), smooth(0, e, fv), smooth(0, e, 1 - fv));
    col = mixc(joint, col, j);
    out.h = lerp(0.2, 0.5 + (g - 0.5) * 0.3, j);
    return col;
  }, true);
  const t = tex(res.canvas, { repeat: 1 / 15 });
  const bump = new THREE.CanvasTexture(res.height);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(1 / 15, 1 / 15);
  t.userData.bump = bump;
  return t;
});

/* Taxiway tile: 23 m square with a yellow centreline along u and double edge lines */
export const taxiwayTex = () => memo('taxiway', () => {
  const n = new TileNoise(hashStr('taxi'));
  const a = hex('#8e9092'), b = hex('#707275'), yel = hex('#e2c044');
  const res = paint(512, (u, v) => {
    const f = n.fbm(u, v, 10, 10, 4), g = n.fbm(u, v, 80, 80, 2);
    let col = mixc(b, a, f * 0.8 + g * 0.2);
    const cl = smooth(0.0045, 0.0025, Math.abs(v - 0.5)); // 0.15 m wide
    const edge = Math.max(smooth(0.03, 0.026, Math.abs(v - 0.04)), smooth(0.03, 0.026, Math.abs(v - 0.96)));
    const edge2 = Math.max(smooth(0.03, 0.026, Math.abs(v - 0.065)), smooth(0.03, 0.026, Math.abs(v - 0.935)));
    const wear = 0.75 + 0.25 * n.fbm(u, v, 30, 30, 2);
    col = mixc(col, yel.map((x) => x * wear), Math.max(cl, edge * 0.9, edge2 * 0.9));
    return col;
  });
  return tex(res.canvas, { repeat: 1 / 23 });
});

/* The whole runway on one canvas (not tiling). Markings per ICAO Annex 14, loosely. */
export const runwayTex = () => memo('runway', () => {
  const L = RUNWAY.x1 - RUNWAY.x0, W = RUNWAY.w;
  const cw = 4096, ch = 256;
  const sx = cw / L, sy = ch / W;
  const c = makeCanvas(cw, ch), ctx = c.getContext('2d');
  const n = new TileNoise(hashStr('rwy'));
  const img = ctx.createImageData(cw, ch), d = img.data;
  const a = hex('#45474b'), b = hex('#33353a');
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const u = x / cw, v = y / ch;
    const f = n.fbm(u, v, 64, 4, 4), g = n.fbm(u, v, 512, 32, 2);
    let col = mixc(b, a, f * 0.75 + g * 0.25);
    // rubber deposits in both touchdown zones
    const m = Math.min(u, 1 - u) * L;
    const rub = smooth(120, 260, m) * (1 - smooth(560, 760, m)) * (0.35 + 0.35 * n.fbm(u, v, 24, 6, 3)) * (1 - Math.min(1, Math.abs(v - 0.5) * 3.2));
    col = mixc(col, [26, 27, 30], rub);
    const i = (y * cw + x) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const white = 'rgba(235,235,230,0.9)';
  const rect = (x, z, w, h) => ctx.fillRect(x * sx, (z + W / 2) * sy, w * sx, h * sy); // x along, z across (centre 0)
  ctx.fillStyle = white;
  // edge lines
  rect(0, -W / 2 + 0.3, L, 0.9); rect(0, W / 2 - 1.2, L, 0.9);
  // centreline dashes 30 m / 20 m
  for (let x = 90; x < L - 90; x += 50) rect(x, -0.45, 30, 0.9);
  // thresholds: 12 stripes, 30 m long
  for (const end of [0, 1]) {
    const x0 = end ? L - 6 - 30 : 6;
    for (let i = 0; i < 12; i++) {
      const z = -W / 2 + 1.8 + i * 3.6;
      rect(x0, z, 30, 1.8);
    }
    // aiming point blocks at 300 m
    const ax = end ? L - 300 - 45 : 300;
    rect(ax, -9 - 3, 45, 6); rect(ax, 9 - 3, 45, 6);
    // touchdown zone stripes
    const tdz = [[150, 3], [450, 2], [600, 1], [750, 1]];
    for (const [dist, count] of tdz) {
      const x = end ? L - dist - 22.5 : dist;
      for (let k = 0; k < count; k++) {
        const z = 10.5 + k * 2.8;
        rect(x, z, 22.5, 1.8); rect(x, -z - 1.8, 22.5, 1.8);
      }
    }
  }
  // designations (rotated along the runway, read from the approach)
  ctx.save();
  ctx.fillStyle = white;
  ctx.font = `700 ${18 * sy}px Outfit`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.translate(70 * sx, ch / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillText(RUNWAY.name[0], 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate((L - 70) * sx, ch / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = white;
  ctx.font = `700 ${18 * sy}px Outfit`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(RUNWAY.name[1], 0, 0);
  ctx.restore();
  return tex(c, { wrap: false, aniso: 16 });
});

/* The apron with stand markings, numbers, restraint lines, pits and the service road */
export const apronTex = () => memo('apron', () => {
  const Lx = APRON.x1 - APRON.x0, Lz = APRON.z1 - APRON.z0;
  const cw = 4096, ch = 1024;
  const sx = cw / Lx, sz = ch / Lz;
  const X = (x) => (x - APRON.x0) * sx, Z = (z) => (z - APRON.z0) * sz;
  const c = makeCanvas(cw, ch), ctx = c.getContext('2d');
  const n = new TileNoise(hashStr('apron'));
  const img = ctx.createImageData(cw, ch), d = img.data;
  const a = hex('#8a8c8b'), b = hex('#6c6e6e'), joint = hex('#55575a');
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const u = x / cw, v = y / ch;
    const f = n.fbm(u, v, 40, 8, 4), g = n.fbm(u + 0.4, v, 400, 100, 2);
    let col = mixc(b, a, f * 0.8 + g * 0.2);
    const wx = u * Lx, wz = v * Lz;
    const fu = (wx / 7.5) % 1, fv = (wz / 7.5) % 1;
    const e = 0.03;
    const j = Math.min(smooth(0, e, fu), smooth(0, e, 1 - fu), smooth(0, e, fv), smooth(0, e, 1 - fv));
    col = mixc(joint, col, j);
    const i = (y * cw + x) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.lineCap = 'round';
  // stains and tyre marks
  const r = rng(7);
  for (let i = 0; i < GATE_COUNT; i++) {
    const gx = gateX(i);
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = `rgba(20,22,26,${0.08 + r() * 0.12})`;
      ctx.beginPath();
      ctx.ellipse(X(gx + (r() - 0.5) * 20), Z(STAND_Z + (r() - 0.5) * 30), (2 + r() * 5) * sx, (1 + r() * 3) * sz, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const yellow = '#e2c044', red = '#d8452c', white = 'rgba(240,240,236,0.92)';
  for (let i = 0; i < GATE_COUNT; i++) {
    const gx = gateX(i);
    // lead-in line from the taxilane edge to the stop
    ctx.strokeStyle = yellow;
    ctx.lineWidth = 0.3 * sx;
    ctx.beginPath();
    ctx.moveTo(X(gx + 34), Z(APRON.z0));
    ctx.bezierCurveTo(X(gx + 22), Z(-110), X(gx), Z(-100), X(gx), Z(-80));
    ctx.lineTo(X(gx), Z(STAND_Z + 13));
    ctx.stroke();
    // stop bar + type marks
    ctx.lineWidth = 0.45 * sx;
    ctx.beginPath(); ctx.moveTo(X(gx - 3), Z(STAND_Z + 13)); ctx.lineTo(X(gx + 3), Z(STAND_Z + 13)); ctx.stroke();
    ctx.lineWidth = 0.25 * sx;
    ctx.beginPath(); ctx.moveTo(X(gx - 2.2), Z(STAND_Z + 15)); ctx.lineTo(X(gx + 2.2), Z(STAND_Z + 15)); ctx.stroke();
    // equipment restraint line (red)
    ctx.strokeStyle = red;
    ctx.lineWidth = 0.25 * sx;
    ctx.setLineDash([]);
    ctx.strokeRect(X(gx - 24), Z(STAND_Z - 28), 48 * sx, 44 * sz);
    // safety zone (dashed red) in front of the stand toward the terminal
    ctx.setLineDash([1.5 * sx, 1.5 * sx]);
    ctx.beginPath(); ctx.moveTo(X(gx - 24), Z(STAND_Z + 16)); ctx.lineTo(X(gx + 24), Z(STAND_Z + 16)); ctx.stroke();
    ctx.setLineDash([]);
    // gate number
    ctx.fillStyle = white;
    ctx.font = `700 ${7 * sz}px Outfit`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(gateName(i), X(gx), Z(-4));
    // hydrant pit and GPU pit
    ctx.strokeStyle = yellow;
    ctx.lineWidth = 0.18 * sx;
    ctx.strokeRect(X(gx + 12 - 0.8), Z(-46 - 0.8), 1.6 * sx, 1.6 * sz);
    ctx.fillStyle = '#3a3c40';
    ctx.fillRect(X(gx + 12 - 0.5), Z(-46 - 0.5), 1.0 * sx, 1.0 * sz);
    ctx.strokeStyle = white;
    ctx.strokeRect(X(gx + 30 - 0.7), Z(8 - 0.7), 1.4 * sx, 1.4 * sz);
  }
  // service road: edge lines + dashed centre
  ctx.strokeStyle = white;
  ctx.lineWidth = 0.2 * sx;
  ctx.beginPath(); ctx.moveTo(X(APRON.x0), Z(SERVICE_ROAD.z0)); ctx.lineTo(X(APRON.x1), Z(SERVICE_ROAD.z0)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(X(APRON.x0), Z(SERVICE_ROAD.z1)); ctx.lineTo(X(APRON.x1), Z(SERVICE_ROAD.z1)); ctx.stroke();
  ctx.setLineDash([3 * sx, 3 * sx]);
  ctx.beginPath(); ctx.moveTo(X(APRON.x0), Z((SERVICE_ROAD.z0 + SERVICE_ROAD.z1) / 2)); ctx.lineTo(X(APRON.x1), Z((SERVICE_ROAD.z0 + SERVICE_ROAD.z1) / 2)); ctx.stroke();
  ctx.setLineDash([]);
  // staging bays
  ctx.lineWidth = 0.15 * sx;
  for (let z = STAGING.z0; z < STAGING.z1; z += 9) {
    ctx.strokeRect(X(STAGING.x0 + 4), Z(z), 20 * sx, 7 * sz);
    ctx.strokeRect(X(STAGING.x0 + 30), Z(z), 20 * sx, 7 * sz);
  }
  // apron edge line toward the taxilane
  ctx.strokeStyle = yellow;
  ctx.lineWidth = 0.2 * sx;
  ctx.beginPath(); ctx.moveTo(X(APRON.x0), Z(APRON.z0 + 1)); ctx.lineTo(X(APRON.x1), Z(APRON.z0 + 1)); ctx.stroke();
  return tex(c, { wrap: false, aniso: 16 });
});

/* Dark conveyor rubber with transverse pale cleats; scrolls along v */
export const beltTex = () => memo('belt', () => {
  const res = paint(64, (u, v) => {
    const cleat = smooth(0.08, 0.0, Math.abs(((v * 4) % 1) - 0.5) - 0.42);
    const base = 38 + 10 * Math.sin(u * 40);
    return mixc([base, base, base + 4], [120, 122, 126], cleat * 0.6);
  }, false, 256);
  const t = tex(res.canvas, { repeat: 1 });
  return t;
});

/* City facade with lit windows: colour + emissive variants */
export const cityTex = () => memo('city', () => {
  const r = rng(99);
  const w = 128, h = 256;
  const c = makeCanvas(w, h), ctx = c.getContext('2d');
  const e = makeCanvas(w, h), ectx = e.getContext('2d');
  ctx.fillStyle = '#1b2028';
  ctx.fillRect(0, 0, w, h);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, w, h);
  for (let y = 6; y < h - 6; y += 12) for (let x = 6; x < w - 6; x += 12) {
    const lit = r() < 0.42;
    ctx.fillStyle = lit ? '#2b3340' : '#121820';
    ctx.fillRect(x, y, 7, 8);
    if (lit) {
      const warm = r() < 0.7;
      ectx.fillStyle = warm ? `rgba(255,${190 + r() * 40 | 0},${120 + r() * 60 | 0},1)` : 'rgba(170,210,255,1)';
      ectx.fillRect(x, y, 7, 8);
    }
  }
  return { map: tex(c, { repeat: 1 }), emissive: tex(e, { repeat: 1 }) };
});

/* Spinning rotor / fan blur: radial alpha with a few bright arcs */
export const fanTex = () => memo('fan', () => {
  const s = 256;
  const c = makeCanvas(s), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.08, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(200,205,210,0.75)');
  g.addColorStop(0.3, 'rgba(160,165,170,0.35)');
  g.addColorStop(0.95, 'rgba(140,145,150,0.3)');
  g.addColorStop(1, 'rgba(140,145,150,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(s / 2, s / 2, s * (0.2 + i * 0.13), i, i + 4); ctx.stroke(); }
  return tex(c, { wrap: false });
});

/* Vertiport pad: ring, "V", touchdown circle */
export const padTex = () => memo('pad', () => {
  const s = 512;
  const c = makeCanvas(s), ctx = c.getContext('2d');
  ctx.fillStyle = '#4b4f57';
  ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#eef0f2';
  ctx.lineWidth = 14;
  ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.44, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.2, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#eef0f2';
  ctx.font = `800 ${s * 0.3}px Outfit`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('V', s / 2, s / 2 + 6);
  ctx.fillStyle = '#5ee7ff';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath(); ctx.arc(s / 2 + Math.cos(a) * s * 0.47, s / 2 + Math.sin(a) * s * 0.47, 5, 0, Math.PI * 2); ctx.fill();
  }
  return tex(c, { wrap: false });
});

/* ---------- aircraft liveries (fuselage: u along tail→nose, v around from the belly) ---------- */
export function liveryTex(airline, { R = 1.98, zTail = -18.8, zNose = 18.8, maintenance = false } = {}) {
  return memo('livery:' + airline.id + (maintenance ? ':m' : ''), () => {
    const W = 2048, H = 512;
    const c = makeCanvas(W, H), ctx = c.getContext('2d');
    const e = makeCanvas(W, H), ectx = e.getContext('2d'); // emissive: windows
    const L = zNose - zTail;
    const X = (z) => ((z - zTail) / L) * W;
    // angle from the belly for a given height above the centreline, per side (+1 right, -1 left) → canvas y
    const Y = (yRel, side) => {
      let th = Math.acos(Math.max(-1, Math.min(1, -yRel / R)));
      if (side < 0) th = Math.PI * 2 - th;
      return (1 - th / (Math.PI * 2)) * H;
    };
    // bands: belly, body, top
    ctx.fillStyle = airline.base;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = airline.belly;
    ctx.fillRect(0, Y(-1.2, 1), W, H - Y(-1.2, 1));
    ctx.fillRect(0, 0, W, Y(-1.2, -1));
    // cheatline
    ctx.fillStyle = airline.cheat;
    for (const side of [1, -1]) {
      const y0 = Y(-0.95, side), y1 = Y(-1.2, side);
      ctx.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0));
    }
    // accent swoosh on the tail
    ctx.fillStyle = airline.accent;
    for (const side of [1, -1]) {
      ctx.beginPath();
      ctx.moveTo(X(-18), Y(0.2, side));
      ctx.quadraticCurveTo(X(-10), Y(0.9, side), X(-4), Y(-0.6, side));
      ctx.lineTo(X(-4), Y(-0.95, side));
      ctx.quadraticCurveTo(X(-10), Y(-0.2, side), X(-18), Y(-0.7, side));
      ctx.closePath();
      ctx.fill();
    }
    if (maintenance) {
      ctx.fillStyle = 'rgba(0,0,0,0.0)';
      ctx.strokeStyle = 'rgba(60,70,80,0.35)';
      ctx.lineWidth = 2;
      for (let z = -17; z < 18; z += 1.6) { ctx.beginPath(); ctx.moveTo(X(z), 0); ctx.lineTo(X(z), H); ctx.stroke(); }
    }
    // panel lines (faint)
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1.5;
    for (let z = -16; z < 17; z += 3.2) { ctx.beginPath(); ctx.moveTo(X(z), 0); ctx.lineTo(X(z), H); ctx.stroke(); }
    // windows
    const winY = 0.55;
    for (const side of [1, -1]) {
      const yc = Y(winY, side);
      for (let z = -11.5; z <= 11.5; z += 0.72) {
        if (z > -1.2 && z < 0.4) continue; // overwing exit gap
        ctx.fillStyle = '#121820';
        roundRect(ctx, X(z) - 7, yc - 9, 14, 18, 5);
        ctx.fill();
        ectx.fillStyle = Math.random() < 0.85 ? '#ffd9a8' : '#223042';
        roundRect(ectx, X(z) - 6, yc - 8, 12, 16, 5);
        ectx.fill();
      }
      // doors
      ctx.strokeStyle = 'rgba(30,34,40,0.8)';
      ctx.lineWidth = 2.5;
      for (const dz of [13.6, -12.4]) { roundRect(ctx, X(dz) - 12, Y(0.95, side) - 2, 24, Math.abs(Y(-0.75, side) - Y(0.95, side)) + 4, 6); ctx.stroke(); }
      for (const dz of [-0.4]) { roundRect(ctx, X(dz) - 10, Y(0.95, side) - 2, 20, Math.abs(Y(0.0, side) - Y(0.95, side)) + 4, 5); ctx.stroke(); }
      // cargo doors, lower right only
      if (side > 0) for (const dz of [6.5, -8.5]) { roundRect(ctx, X(dz) - 20, Y(-0.45, side) - 2, 40, Math.abs(Y(-1.55, side) - Y(-0.45, side)) + 4, 6); ctx.stroke(); }
      // cockpit windows
      ctx.fillStyle = '#0d1218';
      const cz = 16.4;
      for (let k = 0; k < 3; k++) {
        const x0 = X(cz - k * 0.75), yy = Y(0.95 - k * 0.05, side);
        ctx.beginPath();
        ctx.moveTo(x0 - 15, yy - 10); ctx.lineTo(x0 + 10, yy - 12); ctx.lineTo(x0 + 10, yy + 8); ctx.lineTo(x0 - 15, yy + 10);
        ctx.closePath(); ctx.fill();
        ectx.fillStyle = '#9ec5ff';
        ectx.beginPath();
        ectx.moveTo(x0 - 14, yy - 9); ectx.lineTo(x0 + 9, yy - 11); ectx.lineTo(x0 + 9, yy + 7); ectx.lineTo(x0 - 14, yy + 9);
        ectx.closePath(); ectx.fill();
      }
      // airline name above the windows
      ctx.save();
      ctx.fillStyle = airline.fin;
      ctx.font = `800 ${H * 0.085}px Outfit`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tx = X(5.5), ty = Y(1.25, side);
      ctx.translate(tx, ty);
      if (side < 0) ctx.rotate(Math.PI);
      ctx.fillText(airline.name, 0, 0);
      ctx.restore();
      // registration near the tail
      ctx.save();
      ctx.fillStyle = 'rgba(40,44,52,0.9)';
      ctx.font = `600 ${H * 0.035}px JetBrains Mono`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.translate(X(-14.5), Y(0.35, side));
      if (side < 0) ctx.rotate(Math.PI);
      ctx.fillText(`G-${airline.name.slice(0, 2)}${maintenance ? 'MX' : '35'}`, 0, 0);
      ctx.restore();
    }
    // radome grey
    ctx.fillStyle = 'rgba(90,96,104,0.9)';
    ctx.fillRect(X(18.0), 0, W - X(18.0), H);
    const map = tex(c, { wrap: false, aniso: 8 });
    const emissive = tex(e, { wrap: false, aniso: 4 });
    return { map, emissive };
  });
}

export function finTex(airline) {
  return memo('fin:' + airline.id, () => {
    const s = 256;
    const c = makeCanvas(s), ctx = c.getContext('2d');
    ctx.fillStyle = airline.fin;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = airline.accent;
    ctx.beginPath(); ctx.arc(s * 0.5, s * 0.5, s * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = airline.fin;
    ctx.beginPath(); ctx.arc(s * 0.58, s * 0.46, s * 0.17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${s * 0.16}px Outfit`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(airline.name[0], s * 0.5, s * 0.84);
    return tex(c, { wrap: false });
  });
}

/* ---------- screens ---------- */
export function screenTex(kind, seed = 1) {
  return memo('screen:' + kind + seed, () => {
    const w = 512, h = 320;
    const c = makeCanvas(w, h), ctx = c.getContext('2d');
    const r = rng(seed);
    ctx.fillStyle = '#06101a';
    ctx.fillRect(0, 0, w, h);
    const grid = (col) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    };
    if (kind === 'radar') {
      grid('rgba(94,231,255,0.08)');
      ctx.strokeStyle = 'rgba(94,231,255,0.35)';
      for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.arc(w / 2, h / 2, i * 36, 0, Math.PI * 2); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
      const sweep = ctx.createConicGradient ? ctx.createConicGradient(0, w / 2, h / 2) : null;
      if (sweep) {
        sweep.addColorStop(0, 'rgba(94,231,255,0.0)');
        sweep.addColorStop(0.15, 'rgba(94,231,255,0.25)');
        sweep.addColorStop(0.16, 'rgba(94,231,255,0)');
        ctx.fillStyle = sweep;
        ctx.beginPath(); ctx.arc(w / 2, h / 2, 150, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 0; i < 14; i++) {
        const x = r() * w, y = r() * h;
        ctx.fillStyle = r() < 0.2 ? '#ffb347' : '#5ee7ff';
        ctx.fillRect(x - 3, y - 3, 6, 6);
        ctx.fillStyle = 'rgba(230,240,250,0.85)';
        ctx.font = '600 11px JetBrains Mono';
        ctx.fillText(`${['NV', 'LM', 'AE', 'SK'][i % 4]}${100 + Math.floor(r() * 899)}`, x + 7, y - 4);
        ctx.fillText(`${Math.floor(r() * 300) + 10}  ${Math.floor(r() * 240) + 120}`, x + 7, y + 8);
      }
    } else if (kind === 'strips') {
      for (let i = 0; i < 8; i++) {
        const y = 14 + i * 37;
        ctx.fillStyle = i % 3 === 0 ? 'rgba(255,179,71,0.18)' : 'rgba(94,231,255,0.12)';
        roundRect(ctx, 12, y, w - 24, 30, 4); ctx.fill();
        ctx.fillStyle = '#e8f1f8';
        ctx.font = '600 13px JetBrains Mono';
        ctx.fillText(`${['NOVA', 'LUMEN', 'AERO', 'SKYWAY'][i % 4]} ${120 + i * 37}`, 22, y + 20);
        ctx.fillStyle = '#8fb0c8';
        ctx.fillText(`${['DEP 09', 'ARR 09', 'TAXI B', 'HOLD A'][i % 4]}   ${String(5 + i).padStart(2, '0')}:${String((i * 13) % 60).padStart(2, '0')}   G${1 + (i % 8)}`, 170, y + 20);
      }
    } else if (kind === 'ct') {
      ctx.fillStyle = '#021018';
      ctx.fillRect(0, 0, w, h);
      // false-colour CT of a suitcase
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, '#0b2a46'); g.addColorStop(1, '#0d3a5a');
      ctx.fillStyle = g;
      roundRect(ctx, 60, 50, 390, 220, 26); ctx.fill();
      ctx.fillStyle = 'rgba(255,170,60,0.85)'; roundRect(ctx, 110, 90, 150, 100, 6); ctx.fill(); // laptop
      ctx.fillStyle = 'rgba(120,255,180,0.7)'; roundRect(ctx, 290, 80, 110, 60, 20); ctx.fill(); // clothes
      ctx.fillStyle = 'rgba(255,90,90,0.85)'; ctx.beginPath(); ctx.ellipse(330, 210, 18, 42, 0.3, 0, Math.PI * 2); ctx.fill(); // bottle
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; roundRect(ctx, 120, 210, 90, 40, 12); ctx.fill(); // shoes
      ctx.strokeStyle = 'rgba(94,231,255,0.7)'; ctx.lineWidth = 2; roundRect(ctx, 100, 82, 170, 118, 8); ctx.stroke();
      ctx.fillStyle = '#5ee7ff'; ctx.font = '600 13px JetBrains Mono';
      ctx.fillText('LAPTOP  ·  CLEARED', 104, 76);
      ctx.fillText('LIQUID 90 ml · OK', 300, 268);
      ctx.fillStyle = '#9fe6ff'; ctx.font = '500 12px JetBrains Mono';
      ctx.fillText('CT-X 2035 · AI SCREENING · threat 0.3%', 60, 300);
    } else if (kind === 'board') {
      ctx.fillStyle = '#0a1420'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffb347'; ctx.font = '700 18px Outfit'; ctx.fillText('DEPARTURES', 20, 34);
      for (let i = 0; i < 9; i++) {
        const y = 62 + i * 28;
        ctx.fillStyle = '#e8f1f8'; ctx.font = '500 14px JetBrains Mono';
        ctx.fillText(`${String(6 + i).padStart(2, '0')}:${String((i * 17) % 60).padStart(2, '0')}  ${['NV', 'LM', 'AE', 'SK'][i % 4]}${200 + i * 31}  ${['LISBON', 'OSLO', 'MILAN', 'DUBLIN', 'VIENNA', 'MALTA', 'NICE', 'PORTO', 'RIGA'][i]}`, 20, y);
        ctx.fillStyle = i < 2 ? '#7cf2b0' : '#5ee7ff';
        ctx.fillText(i < 2 ? 'BOARDING' : `G${1 + (i % 8)}`, 400, y);
      }
    } else if (kind === 'ops') {
      grid('rgba(255,255,255,0.05)');
      ctx.fillStyle = '#5ee7ff'; ctx.font = '700 14px Outfit'; ctx.fillText('TURNAROUND G6 · NOVA 1735', 16, 28);
      const cols = ['#5ee7ff', '#ffb347', '#7cf2b0', '#b48cff', '#ff7a59'];
      for (let i = 0; i < 9; i++) {
        const y = 50 + i * 28;
        ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(16, y, w - 32, 18);
        ctx.fillStyle = cols[i % cols.length];
        ctx.fillRect(16 + r() * 200, y, 80 + r() * 160, 18);
      }
    } else if (kind === 'camera') {
      ctx.fillStyle = '#131a22'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2a3340'; ctx.fillRect(0, h * 0.55, w, h * 0.45);
      ctx.fillStyle = '#9fb3c8'; ctx.fillRect(w * 0.3, h * 0.42, w * 0.4, 20);
      ctx.fillStyle = '#ff5c5c'; ctx.beginPath(); ctx.arc(24, 24, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8f1f8'; ctx.font = '600 12px JetBrains Mono'; ctx.fillText('CAM 14 · APRON EAST', 40, 29);
    }
    return tex(c, { wrap: false });
  });
}

/* Bag tag: barcode + destination */
export function bagTagTex(dest = 'LIS', name = 'GATE TO GATE') {
  return memo('tag:' + dest, () => {
    const w = 256, h = 96;
    const c = makeCanvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#f5f3ee'; ctx.fillRect(0, 0, w, h);
    const r = rng(hashStr(dest));
    ctx.fillStyle = '#111';
    let x = 14;
    while (x < w - 90) { const bw = 1 + Math.floor(r() * 3); ctx.fillRect(x, 54, bw, 32); x += bw + 1 + Math.floor(r() * 3); }
    ctx.font = '800 30px Outfit'; ctx.fillText(dest, 14, 42);
    ctx.font = '600 12px JetBrains Mono'; ctx.fillText(name, 110, 20);
    ctx.fillText(`NV 1735 · 2035-10-18`, 110, 40);
    ctx.fillStyle = '#ffb347'; ctx.fillRect(w - 70, 52, 56, 34);
    ctx.fillStyle = '#111'; ctx.font = '700 16px Outfit'; ctx.fillText('PRIO', w - 64, 76);
    return tex(c, { wrap: false });
  });
}

/* Hazard stripes (yellow/black) */
export const hazardTex = () => memo('hazard', () => {
  const res = paint(64, (u, v) => (((u + v) * 4) % 1) < 0.5 ? [226, 192, 68] : [26, 26, 28]);
  return tex(res.canvas, { repeat: 1 });
});

/* Soft radial glow sprite for apron masts */
export const glowTex = () => memo('glow', () => {
  const s = 128;
  const c = makeCanvas(s), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  return tex(c, { wrap: false });
});

export { rgb };
