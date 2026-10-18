import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ *
 * Geometry helpers (playbook §4). Every builder models in metres,
 * facing +Z, base at y = 0.
 * ------------------------------------------------------------------ */

/* Box-projected UVs in local metres */
export function boxUV(geo, scale = 1) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  if (!nor) geo.computeVertexNormals();
  const n = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = z; v = y; } else if (ay >= az) { u = x; v = z; } else { u = x; v = y; }
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export const rbox = (w, h, d, r = 0.02, seg = 2) => boxUV(new RoundedBoxGeometry(w, h, d, seg, Math.max(1e-4, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4))));
export const box = (w, h, d) => boxUV(new THREE.BoxGeometry(w, h, d));
export const cyl = (rt, rb, h, seg = 16, open = false) => boxUV(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
export const sphere = (r, ws = 16, hs = 12) => boxUV(new THREE.SphereGeometry(r, ws, hs));
export const cone = (r, h, seg = 16, open = false) => boxUV(new THREE.ConeGeometry(r, h, seg, 1, open));
export const torus = (r, t, rs = 8, ts = 32, arc = Math.PI * 2) => boxUV(new THREE.TorusGeometry(r, t, rs, ts, arc));
export function lathe(profile, seg = 24, phiStart = Math.PI, phiLen = Math.PI * 2) {
  const pts = profile.map(([x, y]) => new THREE.Vector2(x, y));
  return boxUV(new THREE.LatheGeometry(pts, seg, phiStart, phiLen));
}
/* flat plane lying on the ground (XZ), facing up, w along X, d along Z; uv u along X */
export function groundPlane(w, d, segs = 1) {
  const g = new THREE.PlaneGeometry(w, d, segs, segs);
  g.rotateX(-Math.PI / 2);
  return g;
}

/* Create a mesh and add it to a parent */
export function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = opts.cast !== false;
  m.receiveShadow = opts.receive !== false;
  if (opts.name) m.name = opts.name;
  if (opts.tags) Object.assign(m.userData, opts.tags);
  parent.add(m);
  return m;
}

/* Average normals of coincident vertices (fixes seams after displacement / lofts) */
export function smoothSeams(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, map = new Map();
  const key = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    let e = map.get(k);
    if (!e) map.set(k, (e = { x: 0, y: 0, z: 0, ids: [] }));
    e.x += nor.getX(i); e.y += nor.getY(i); e.z += nor.getZ(i);
    e.ids.push(i);
  }
  for (const e of map.values()) {
    if (e.ids.length < 2) continue;
    const l = Math.hypot(e.x, e.y, e.z) || 1;
    for (const i of e.ids) nor.setXYZ(i, e.x / l, e.y / l, e.z / l);
  }
  nor.needsUpdate = true;
  return geo;
}

/* ------------------------------------------------------------------ *
 * Loft: connect a sequence of closed rings (arrays of Vector3 with the
 * same count) into a skin. u runs around each ring, v along the loft.
 * ------------------------------------------------------------------ */
export function loftRings(rings, { caps = true, capStart = caps, capEnd = caps, smooth = true } = {}) {
  const n = rings[0].length, R = rings.length;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < R; i++) {
    const v = i / (R - 1);
    for (let j = 0; j <= n; j++) {
      const p = rings[i][j % n];
      pos.push(p.x, p.y, p.z);
      uv.push(j / n, v);
    }
  }
  const stride = n + 1;
  for (let i = 0; i < R - 1; i++) for (let j = 0; j < n; j++) {
    const a = i * stride + j, b = a + stride;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const addCap = (ring, flip) => {
    const c = new THREE.Vector3();
    for (const p of ring) c.add(p);
    c.multiplyScalar(1 / n);
    const base = pos.length / 3;
    pos.push(c.x, c.y, c.z);
    uv.push(0.5, flip ? 0 : 1);
    for (let j = 0; j <= n; j++) {
      const p = ring[j % n];
      pos.push(p.x, p.y, p.z);
      uv.push(0.5 + (p.x - c.x) * 0.1, 0.5 + (p.y - c.y) * 0.1);
    }
    for (let j = 0; j < n; j++) {
      if (flip) idx.push(base, base + 1 + j + 1, base + 1 + j);
      else idx.push(base, base + 1 + j, base + 1 + j + 1);
    }
  };
  if (capStart) addCap(rings[0], true);
  if (capEnd) addCap(rings[R - 1], false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (smooth) smoothSeams(g);
  // the caps share vertices positions with the ring but should be flat: recompute their normals separately
  return g;
}

/* Ring builders for lofts. Angle 0 at the bottom (-y) so the UV seam sits on the belly. */
export function ellipseRing(n, cx, cy, cz, rx, ry, axis = 'z') {
  const out = [];
  for (let j = 0; j < n; j++) {
    const a = (j / n) * Math.PI * 2 - Math.PI / 2;
    const u = Math.cos(a) * rx, v = Math.sin(a) * ry;
    if (axis === 'z') out.push(new THREE.Vector3(cx + u, cy + v, cz));
    else if (axis === 'x') out.push(new THREE.Vector3(cx, cy + v, cz + u));
    else out.push(new THREE.Vector3(cx + u, cy, cz + v));
  }
  return out;
}

/* Airfoil ring (NACA-ish) for a wing section at span position x.
   chord runs toward -z from the leading edge at zLE; camber lifts the upper surface. */
export function airfoilRing(n, x, y, zLE, chord, thick = 0.12, camber = 0.02) {
  const out = [];
  const half = n / 2;
  const yt = (t) => 5 * thick * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t * t + 0.2843 * t * t * t - 0.1015 * t * t * t * t);
  // start at the trailing edge, go over the top to the leading edge, back under
  for (let j = 0; j < n; j++) {
    const k = j < half ? 1 - j / half : (j - half) / half; // 1 → 0 → 1 along the chord
    const t = k * k; // denser near the leading edge
    const th = yt(Math.max(t, 1e-4)) * chord;
    const cam = camber * chord * Math.sin(Math.PI * t);
    const yy = j < half ? y + th + cam : y - th + cam;
    out.push(new THREE.Vector3(x, yy, zLE - t * chord));
  }
  return out;
}

/* Tapered tube along a curve (playbook F.1) */
export function taperTube(src, { segments = 20, radial = 10, radius = 0.05, caps = true } = {}) {
  const c = Array.isArray(src)
    ? new THREE.CatmullRomCurve3(src.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))), false, 'centripetal')
    : src;
  const rf = typeof radius === 'function' ? radius : () => radius;
  const frames = c.computeFrenetFrames(segments, false);
  const pos = [], nor = [], uv = [], idx = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    c.getPointAt(t, P);
    const r = rf(t), n = frames.normals[i], b = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2, s = Math.sin(a), co = -Math.cos(a);
      N.set(co * n.x + s * b.x, co * n.y + s * b.y, co * n.z + s * b.z).normalize();
      pos.push(P.x + r * N.x, P.y + r * N.y, P.z + r * N.z);
      nor.push(N.x, N.y, N.z);
      uv.push(j / radial, t);
    }
  }
  for (let i = 0; i < segments; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = (i + 1) * (radial + 1) + j;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  if (caps) {
    for (const end of [0, 1]) {
      const i = end ? segments : 0;
      c.getPointAt(end, P);
      const tan = c.getTangentAt(end).multiplyScalar(end ? 1 : -1);
      const base = pos.length / 3;
      pos.push(P.x, P.y, P.z);
      nor.push(tan.x, tan.y, tan.z);
      uv.push(0.5, end);
      for (let j = 0; j <= radial; j++) {
        const k = i * (radial + 1) + j;
        pos.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
        nor.push(tan.x, tan.y, tan.z);
        uv.push(0.5, end);
      }
      for (let j = 0; j < radial; j++) {
        if (end) idx.push(base, base + 1 + j, base + 2 + j);
        else idx.push(base, base + 2 + j, base + 1 + j);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/* Tube along a polyline/curve with u = metres along the path (so pulses travel at a real speed) */
export function pathTube(curve, radius, { segments = null, radial = 8 } = {}) {
  const len = curve.getLength();
  const segs = segments || Math.max(4, Math.round(len / Math.max(2, radius * 6)));
  const g = new THREE.TubeGeometry(curve, segs, radius, radial, false);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len);
  g.userData.length = len;
  return g;
}

/* Open cone for light beams: apex at the origin, opening toward -Y */
export function beamGeo(rTop, rBottom, len, seg = 24) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, len, seg, 1, true);
  g.translate(0, -len / 2, 0);
  return g;
}

/* ------------------------------------------------------------------ *
 * Merge every static mesh in a group into one mesh per material
 * (revised version: indexed, boundaries, colours, mirrored winding).
 * ------------------------------------------------------------------ */
export function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map(), keep = [], remove = [];
  const visit = (o) => {
    for (const ch of [...o.children]) {
      if (ch.userData.mergeBoundary || ch.isLight || ch.userData.keep || ch.isPoints || ch.isLine || ch.isSprite) {
        keep.push(ch);
        continue;
      }
      if (ch.isMesh) {
        if (ch.userData.noMerge || ch.isInstancedMesh || Array.isArray(ch.material) || !ch.visible) keep.push(ch);
        else {
          const key = `${ch.material.uuid}|${+ch.castShadow}${+ch.receiveShadow}|${ch.renderOrder}`;
          const g = ch.geometry.clone();
          for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(n)) g.deleteAttribute(n);
          if (!g.attributes.normal) g.computeVertexNormals();
          if (!g.attributes.uv) boxUV(g);
          if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
          g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, ch.matrixWorld));
          if (ch.matrixWorld.determinant() < 0) {
            const ix = g.index.array;
            for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
          }
          if (!buckets.has(key)) buckets.set(key, { mat: ch.material, cast: ch.castShadow, recv: ch.receiveShadow, order: ch.renderOrder, geos: [] });
          buckets.get(key).geos.push(g);
          remove.push(ch);
        }
      }
      visit(ch);
      if (!ch.isMesh && !ch.userData.keep) remove.push(ch);
    }
  };
  visit(group);
  for (const k of keep) {
    if (k.parent !== group) {
      const m = new THREE.Matrix4().multiplyMatrices(inv, k.matrixWorld);
      k.parent.remove(k);
      m.decompose(k.position, k.quaternion, k.scale);
      group.add(k);
    }
  }
  for (const o of remove) o.parent?.remove(o);
  for (const b of buckets.values()) {
    const hasColor = b.geos.some((g) => g.attributes.color);
    for (const g of b.geos) {
      if (hasColor && !g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
      if (!hasColor && g.attributes.color) g.deleteAttribute('color');
    }
    const merged = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    const m = new THREE.Mesh(merged, b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = b.recv;
    m.renderOrder = b.order;
    group.add(m);
  }
  return group;
}

/* Count drawables under an object (debugging) */
export function countDraws(o) {
  let n = 0;
  o.traverseVisible((m) => {
    if (m.isMesh || m.isPoints || m.isLine) n += Array.isArray(m.material) ? m.geometry.groups.length : 1;
  });
  return n;
}

/* Paint a flat colour into a vertex colour attribute (for vertex-coloured merges) */
export function colorize(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/* Merge a list of {geo, matrix?} into a single geometry (positions baked) */
export function bakeGeometries(items) {
  const geos = items.map(({ geo, matrix, color }) => {
    const g = geo.clone();
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(n)) g.deleteAttribute(n);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) boxUV(g);
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    if (matrix) g.applyMatrix4(matrix);
    if (color) colorize(g, color);
    return g;
  });
  const hasColor = geos.some((g) => g.attributes.color);
  for (const g of geos) if (hasColor && !g.attributes.color) colorize(g, '#ffffff');
  const out = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return out;
}

export const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));
