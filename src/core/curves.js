import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Paths: polylines → smooth curves, arc-length motion with a speed
 * profile, and orientation along a path (vehicles, aircraft, bags).
 * ------------------------------------------------------------------ */

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const toV = (p) => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2]));

export function curveFrom(points, { closed = false, tension = 0.5, type = 'centripetal' } = {}) {
  const c = new THREE.CatmullRomCurve3(points.map(toV), closed, type, tension);
  c.arcLengthDivisions = Math.max(200, points.length * 24);
  return c;
}

/* Polyline with rounded corners: inserts arc points at each interior vertex */
export function roundedPolyline(points, radius = 2, steps = 6) {
  const pts = points.map(toV);
  if (pts.length < 3) return pts;
  const out = [pts[0].clone()];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], a = pts[i - 1], b = pts[i + 1];
    const da = a.clone().sub(p), db = b.clone().sub(p);
    const la = da.length(), lb = db.length();
    const r = Math.min(radius, la * 0.45, lb * 0.45);
    da.normalize(); db.normalize();
    const pa = p.clone().addScaledVector(da, r), pb = p.clone().addScaledVector(db, r);
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      // quadratic bezier pa → p → pb
      const q = pa.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(p, 2 * (1 - t) * t).addScaledVector(pb, t * t);
      out.push(q);
    }
  }
  out.push(pts[pts.length - 1].clone());
  return out;
}

/* A curve with a speed profile: speeds given per waypoint (m/s), motion integrated by arc length */
export class SpeedPath {
  constructor(points, speeds, opts = {}) {
    this.points = points.map(toV);
    this.curve = curveFrom(this.points, opts);
    this.length = this.curve.getLength();
    const lengths = this.curve.getLengths(this.curve.arcLengthDivisions);
    const n = this.points.length;
    // arc fraction of each waypoint (waypoint k sits at parametric t = k/(n-1) for an open curve)
    this.wpU = [];
    for (let k = 0; k < n; k++) {
      const t = opts.closed ? k / n : k / (n - 1);
      const i = Math.min(lengths.length - 1, Math.round(t * (lengths.length - 1)));
      this.wpU.push(lengths[i] / this.length);
    }
    this.speeds = speeds && speeds.length === n ? speeds : new Array(n).fill(speeds?.[0] ?? 10);
    // integrate time over arc length
    const N = 600;
    this.tab = new Float32Array(N + 1); // time at s = i/N
    let t = 0;
    this.tab[0] = 0;
    for (let i = 1; i <= N; i++) {
      const u0 = (i - 1) / N, u1 = i / N;
      const v = Math.max(0.2, this.speedAtU((u0 + u1) / 2));
      t += ((u1 - u0) * this.length) / v;
      this.tab[i] = t;
    }
    this.duration = t;
    this._p = new THREE.Vector3();
    this._t = new THREE.Vector3();
  }
  speedAtU(u) {
    const wu = this.wpU, sp = this.speeds;
    let k = 0;
    while (k < wu.length - 2 && u > wu[k + 1]) k++;
    const a = wu[k], b = wu[k + 1];
    const f = b > a ? THREE.MathUtils.clamp((u - a) / (b - a), 0, 1) : 0;
    return sp[k] + (sp[k + 1] - sp[k]) * f;
  }
  /* arc fraction at time t (binary search in the table) */
  uAtTime(time) {
    const tab = this.tab, N = tab.length - 1;
    if (time <= 0) return 0;
    if (time >= this.duration) return 1;
    let lo = 0, hi = N;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (tab[mid] <= time) lo = mid; else hi = mid;
    }
    const f = (time - tab[lo]) / Math.max(1e-6, tab[hi] - tab[lo]);
    return (lo + f) / N;
  }
  pointAtU(u, out = this._p) { return this.curve.getPointAt(THREE.MathUtils.clamp(u, 0, 1), out); }
  tangentAtU(u, out = this._t) { return this.curve.getTangentAt(THREE.MathUtils.clamp(u, 0.0005, 0.9995), out); }
  pointAt(time, out) { return this.pointAtU(this.uAtTime(time), out); }
  tangentAt(time, out) { return this.tangentAtU(this.uAtTime(time), out); }
}

/* Orient an object along a tangent with optional bank (roll) and pitch from the tangent. */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _x = new THREE.Vector3(), _z = new THREE.Vector3(), _y = new THREE.Vector3();
export function orientAlong(obj, tangent, bank = 0, flat = false) {
  _z.copy(tangent);
  if (flat) _z.y = 0;
  if (_z.lengthSq() < 1e-8) return;
  _z.normalize();
  _x.crossVectors(_up, _z).normalize();
  if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
  _y.crossVectors(_z, _x).normalize();
  _m.makeBasis(_x, _y, _z);
  _q.setFromRotationMatrix(_m);
  obj.quaternion.copy(_q);
  if (bank) obj.rotateZ(bank);
}

/* curvature-based bank estimate: sign and magnitude from successive tangents */
const _t2 = new THREE.Vector3();
export function bankFor(path, u, du = 0.004, gain = 14) {
  const t1 = path.tangentAtU(u, new THREE.Vector3());
  const t2 = path.tangentAtU(Math.min(1, u + du), _t2);
  const turn = t1.x * t2.z - t1.z * t2.x; // signed horizontal turn
  return THREE.MathUtils.clamp(-turn * gain, -0.55, 0.55);
}

/* Evenly sample a curve into N points (arc-length) */
export function samplePoints(curve, n) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(curve.getPointAt(i / n, new THREE.Vector3()));
  return out;
}
