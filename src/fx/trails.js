import * as THREE from 'three';
import { TIME } from '../world/materials.js';

/* ------------------------------------------------------------------ *
 * Camera-facing ribbons along a path with a moving head. Mode 0 draws
 * the travelled tail behind the head (time-lapse trails); mode 1 draws
 * the stretch ahead of the head (predicted paths).
 * ------------------------------------------------------------------ */

const vert = /* glsl */ `
  attribute float aT; attribute float aSide; attribute vec3 aTan;
  uniform float uWidth, uHead, uTail, uMode;
  varying float vT, vS;
  void main() {
    vT = aT; vS = aSide;
    vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 toCam = cameraPosition - wp;
    vec3 side = normalize(cross(normalize(aTan), normalize(toCam)));
    float k = uMode < 0.5 ? smoothstep(uHead - uTail, uHead, aT) : 1.0 - smoothstep(uHead, uHead + uTail, aT);
    float w = uWidth * (0.3 + 0.7 * k);
    wp += side * aSide * w;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;
const frag = /* glsl */ `
  uniform vec3 uColor; uniform float uHead, uTail, uFade, uDash, uMode, uTime;
  varying float vT, vS;
  void main() {
    float along;
    if (uMode < 0.5) {
      float behind = step(vT, uHead);
      float age = (uHead - vT) / max(uTail, 1e-4);
      along = behind * (1.0 - smoothstep(0.0, 1.0, age));
    } else {
      float ahead = step(uHead, vT);
      float age = (vT - uHead) / max(uTail, 1e-4);
      along = ahead * (1.0 - smoothstep(0.3, 1.0, age));
    }
    float across = 1.0 - vS * vS;
    float head = exp(-pow((uHead - vT) / 0.0035, 2.0)) * 2.2;
    float dash = uDash > 0.5 ? (0.25 + 0.75 * step(0.5, fract(vT * 80.0 - uTime * 0.6))) : 1.0;
    float a = (along * across * across * dash + head * across) * uFade;
    gl_FragColor = vec4(uColor * a * 1.9, a);
  }`;

export class TrailPool {
  constructor(scene, max = 48, segments = 180) {
    this.max = max;
    this.segments = segments;
    this.slots = [];
    this.group = new THREE.Group();
    this.group.name = 'trails';
    scene.add(this.group);
    const base = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color('#ffb347') }, uWidth: { value: 5 }, uHead: { value: 0 }, uTail: { value: 0.3 }, uFade: { value: 0 }, uDash: { value: 0 }, uMode: { value: 0 }, uTime: TIME.uTime },
    });
    for (let i = 0; i < max; i++) {
      const n = (segments + 1) * 2;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      geo.setAttribute('aTan', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const aT = new Float32Array(n), aSide = new Float32Array(n);
      for (let k = 0; k <= segments; k++) { aT[k * 2] = aT[k * 2 + 1] = k / segments; aSide[k * 2] = -1; aSide[k * 2 + 1] = 1; }
      geo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
      geo.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1));
      const idx = [];
      for (let k = 0; k < segments; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      geo.setIndex(idx);
      const mat = base.clone();
      mat.uniforms.uTime = TIME.uTime;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.userData.noDepth = true;
      mesh.userData.noPick = true;
      mesh.renderOrder = 7;
      this.group.add(mesh);
      this.slots.push({ mesh, mat, geo, busy: false, u: mat.uniforms });
    }
    this._p = new THREE.Vector3();
    this._t = new THREE.Vector3();
  }
  /* curve: anything with getPointAt/getTangentAt by arc fraction */
  acquire(curve, { color = '#ffb347', width = 5, tail = 0.3, dash = 0, mode = 0 } = {}) {
    const s = this.slots.find((x) => !x.busy);
    if (!s) return null;
    s.busy = true;
    const pos = s.geo.attributes.position, tan = s.geo.attributes.aTan;
    const N = this.segments;
    for (let k = 0; k <= N; k++) {
      const u = k / N;
      curve.getPointAt(u, this._p);
      curve.getTangentAt(Math.min(0.9995, Math.max(0.0005, u)), this._t);
      for (const j of [0, 1]) {
        pos.setXYZ(k * 2 + j, this._p.x, this._p.y, this._p.z);
        tan.setXYZ(k * 2 + j, this._t.x, this._t.y, this._t.z);
      }
    }
    pos.needsUpdate = true;
    tan.needsUpdate = true;
    s.u.uColor.value.set(color);
    s.u.uWidth.value = width;
    s.u.uTail.value = tail;
    s.u.uDash.value = dash;
    s.u.uMode.value = mode;
    s.u.uHead.value = 0;
    s.u.uFade.value = 1;
    s.mesh.visible = true;
    return s;
  }
  release(s) {
    if (!s) return;
    s.busy = false;
    s.mesh.visible = false;
  }
  releaseAll() { for (const s of this.slots) this.release(s); }
  get active() { return this.slots.filter((s) => s.busy).length; }
}
