import * as THREE from 'three';
import { tween, easeInOutCubic, easeInOutSine } from '../core/tween.js';

/* ------------------------------------------------------------------ *
 * Camera rig: scripted shots (position/target/fov keyframes with
 * optional orbit interpolation), follow callbacks, and a free-orbit
 * mode that takes over when the user grabs the view.
 * ------------------------------------------------------------------ */
export class CameraRig {
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    this.mode = 'auto';
    this.pos = new THREE.Vector3(0, 300, 600);
    this.target = new THREE.Vector3(0, 0, 0);
    this.fov = 36;
    this.follow = null;
    this.tweenT = null;
    this.portrait = 1;
    this.onModeChange = null;
    this._sp = new THREE.Spherical();
    this._v = new THREE.Vector3();
    controls.enabled = false;
  }

  /* evaluate a shot list at chapter time t */
  static shotAt(shots, t, out) {
    let i = 0;
    while (i < shots.length - 1 && t >= shots[i + 1].at) i++;
    const a = shots[i], b = shots[Math.min(shots.length - 1, i + 1)];
    let k = a === b ? 1 : THREE.MathUtils.clamp((t - a.at) / Math.max(1e-3, b.at - a.at), 0, 1);
    const ease = b.ease === 'linear' ? (x) => x : b.ease === 'sine' ? easeInOutSine : easeInOutCubic;
    k = ease(k);
    out.target.set(a.target[0] + (b.target[0] - a.target[0]) * k, a.target[1] + (b.target[1] - a.target[1]) * k, a.target[2] + (b.target[2] - a.target[2]) * k);
    if (b.orbit) {
      // spherical interpolation around the moving target
      const sa = new THREE.Spherical().setFromVector3(new THREE.Vector3(a.pos[0] - a.target[0], a.pos[1] - a.target[1], a.pos[2] - a.target[2]));
      const sb = new THREE.Spherical().setFromVector3(new THREE.Vector3(b.pos[0] - b.target[0], b.pos[1] - b.target[1], b.pos[2] - b.target[2]));
      let dth = sb.theta - sa.theta;
      if (dth > Math.PI) dth -= Math.PI * 2;
      if (dth < -Math.PI) dth += Math.PI * 2;
      const s = new THREE.Spherical(sa.radius + (sb.radius - sa.radius) * k, sa.phi + (sb.phi - sa.phi) * k, sa.theta + dth * k);
      out.pos.setFromSpherical(s).add(out.target);
    } else {
      out.pos.set(a.pos[0] + (b.pos[0] - a.pos[0]) * k, a.pos[1] + (b.pos[1] - a.pos[1]) * k, a.pos[2] + (b.pos[2] - a.pos[2]) * k);
    }
    out.fov = (a.fov ?? 36) + ((b.fov ?? 36) - (a.fov ?? 36)) * k;
    return out;
  }

  setPose(pos, target, fov) {
    this.pos.copy(pos);
    this.target.copy(target);
    if (fov != null) this.fov = fov;
  }

  /* smooth move to a pose (used when scrubbing or re-engaging the film camera) */
  goto(pos, target, fov, ms = 1200) {
    this.tweenT?.stop();
    const p0 = this.pos.clone(), t0 = this.target.clone(), f0 = this.fov;
    const p1 = pos.clone(), t1 = target.clone(), f1 = fov ?? this.fov;
    this.tweenT = tween({
      duration: ms, ease: easeInOutCubic,
      onUpdate: (k) => { this.pos.lerpVectors(p0, p1, k); this.target.lerpVectors(t0, t1, k); this.fov = f0 + (f1 - f0) * k; },
      onDone: () => (this.tweenT = null),
    });
  }
  get transitioning() { return !!this.tweenT; }

  takeFree() {
    if (this.mode === 'free') return;
    this.mode = 'free';
    this.tweenT?.stop();
    this.tweenT = null;
    this.controls.target.copy(this.target);
    this.camera.position.copy(this.pos);
    this.controls.enabled = true;
    this.controls.update();
    document.body.classList.add('free-cam');
    this.onModeChange?.('free');
  }
  resumeAuto() {
    if (this.mode === 'auto') return;
    this.mode = 'auto';
    this.controls.enabled = false;
    this.pos.copy(this.camera.position);
    this.target.copy(this.controls.target);
    document.body.classList.remove('free-cam');
    this.onModeChange?.('auto');
  }

  /* apply the current pose to the camera (auto) or let the controls run (free) */
  apply() {
    const cam = this.camera;
    if (this.mode === 'free') {
      this.controls.update();
      this.pos.copy(cam.position);
      this.target.copy(this.controls.target);
    } else {
      // portrait screens: pull back along the view direction
      this._v.subVectors(this.pos, this.target);
      const pull = this.portrait;
      cam.position.copy(this.target).addScaledVector(this._v, pull);
      cam.lookAt(this.target);
      if (Math.abs(cam.fov - this.fov) > 1e-3) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    }
    // adaptive near plane for depth precision at both scales
    const d = cam.position.distanceTo(this.target);
    const near = THREE.MathUtils.clamp(d * 0.0035, 0.05, 6);
    if (Math.abs(cam.near - near) > near * 0.2) { cam.near = near; cam.updateProjectionMatrix(); }
    return d;
  }
  setPortrait(aspect) { this.portrait = aspect < 1 ? Math.pow(1.15 / aspect, 0.8) : 1; }
}
