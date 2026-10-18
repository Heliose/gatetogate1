/* Deterministic randomness, tileable noise and small math helpers (playbook §6) */

export function rng(seed) {
  // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  // FNV-1a
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const mixc = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
export function hex(h) {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgb = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
export const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

/* Tileable value noise: integer base frequencies wrap seamlessly */
export class TileNoise {
  constructor(seed) {
    const r = rng(seed);
    const p = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    this.vals = new Float32Array(256);
    for (let i = 0; i < 256; i++) this.vals[i] = r();
  }
  h(ix, iy, px, py) {
    ix = ((ix % px) + px) % px;
    iy = ((iy % py) + py) % py;
    return this.vals[this.perm[(this.perm[ix & 255] + iy) & 255]];
  }
  value(x, y, px, py) {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = this.h(x0, y0, px, py), b = this.h(x0 + 1, y0, px, py), c = this.h(x0, y0 + 1, px, py), d = this.h(x0 + 1, y0 + 1, px, py);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  // u,v in [0,1); fx,fy integer base frequency
  fbm(u, v, fx, fy, oct = 4, gain = 0.5) {
    let sum = 0, amp = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      const m = 1 << i;
      sum += amp * this.value(u * fx * m, v * fy * m, fx * m, fy * m);
      norm += amp;
      amp *= gain;
    }
    return sum / norm;
  }
}
