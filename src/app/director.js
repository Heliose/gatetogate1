import * as THREE from 'three';
import { CameraRig } from './camera.js';
import { defaultsOf } from './state.js';

/* ------------------------------------------------------------------ *
 * The director runs the film: chapter sequencing, chapter-local time,
 * scripted camera, captions, per-chapter parameters, loop/scrub.
 * ------------------------------------------------------------------ */
export class Director {
  constructor(ctx, chapters) {
    this.ctx = ctx;
    this.chapters = chapters;
    this.index = -1;
    this.t = 0;
    this.playing = true;
    this.params = {};
    for (const c of chapters) this.params[c.id] = defaultsOf(c.params || []);
    this.onChange = () => {};
    this.lastCaption = null;
    this.captionShownAt = -1;
    this.pose = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 36 };
    this.loop = true;
    this.pendingGoto = false;
  }
  get chapter() { return this.chapters[this.index]; }
  get p() { return this.params[this.chapter?.id] || {}; }
  get duration() {
    const c = this.chapter;
    if (!c) return 1;
    return typeof c.duration === 'function' ? c.duration(this.ctx, this.p) : c.duration;
  }

  go(i, { t = 0, instant = false } = {}) {
    const n = this.chapters.length;
    i = ((i % n) + n) % n;
    const prev = this.chapter;
    if (prev) prev.exit?.(this.ctx, this.p);
    this.ctx.labels.removeWhere((id) => !id.startsWith('global:'));
    this.index = i;
    this.t = t;
    this.lastCaption = null;
    this.captionShownAt = -1;
    this.ctx.caption('');
    const c = this.chapter;
    this.ctx.params = this.p;
    this.ctx.sim.speed = 1;
    this.ctx.focusOverride = null;
    c.enter?.(this.ctx, this.p);
    // camera: fly to the first pose unless the user holds the camera
    const pose = this.poseAt(this.t);
    if (pose) {
      if (this.ctx.rig.mode === 'auto') {
        if (instant || prev == null) this.ctx.rig.setPose(pose.pos, pose.target, pose.fov);
        else this.ctx.rig.goto(pose.pos, pose.target, pose.fov, 1800 / (this.ctx.settings.camera.moveSpeed || 1));
      }
    }
    this.onChange('chapter');
    this.ctx.sound.cue('whoosh');
  }
  next() { this.go(this.index + 1); }
  prev() { this.go(this.index - 1); }
  play() { this.playing = true; this.onChange('play'); }
  pause() { this.playing = false; this.onChange('play'); }
  toggle() { this.playing ? this.pause() : this.play(); }

  /* scrub to a fraction of the chapter */
  scrub(frac) {
    const t = THREE.MathUtils.clamp(frac, 0, 1) * this.duration;
    this.t = t;
    this.chapter.scrub?.(this.ctx, t, this.p);
    const pose = this.poseAt(t);
    if (pose && this.ctx.rig.mode === 'auto') this.ctx.rig.goto(pose.pos, pose.target, pose.fov, 500);
    this.onChange('time');
  }

  setParam(key, value) {
    this.p[key] = value;
    this.chapter.onParam?.(this.ctx, key, value, this.p);
    this.onChange('params');
  }
  resetParams() {
    const d = defaultsOf(this.chapter.params || []);
    for (const k of Object.keys(d)) this.setParam(k, d[k]);
  }

  /* pose from the chapter's shot list or its custom camera */
  poseAt(t) {
    const c = this.chapter;
    if (!c) return null;
    if (c.camera) { if (c.camera(this.ctx, t, this.pose, this.p)) return this.pose; }
    if (c.shots?.length) return CameraRig.shotAt(c.shots, t, this.pose);
    return null;
  }

  /* hour for the current chapter time */
  hourAt(t) {
    const c = this.chapter;
    if (c.hourAt) return c.hourAt(this.ctx, t, this.p);
    const [h0, h1] = c.hour || [12, 12];
    return h0 + (h1 - h0) * THREE.MathUtils.clamp(t / this.duration, 0, 1);
  }

  update(dt) {
    const c = this.chapter;
    if (!c) return;
    const dur = this.duration;
    if (this.playing) {
      this.t += dt;
      if (this.t >= dur) {
        if (this.index === this.chapters.length - 1 && !this.loop) { this.t = dur; this.pause(); }
        else { this.go(this.index + 1); return; }
      }
    }
    // camera
    const pose = this.poseAt(this.t);
    if (pose && this.ctx.rig.mode === 'auto' && !this.ctx.rig.transitioning) this.ctx.rig.setPose(pose.pos, pose.target, pose.fov * (this.ctx.settings.camera.fovScale || 1));
    // captions
    if (c.captions) {
      let cur = null;
      for (const cap of c.captions) if (cap.at <= this.t) cur = cap;
      if (cur && cur !== this.lastCaption) {
        this.lastCaption = cur;
        this.captionShownAt = this.t;
        this.ctx.caption(cur.text);
        this.ctx.narrator.speak(cur.text);
      } else if (cur && this.t - this.captionShownAt > (cur.hold ?? 7)) {
        this.ctx.caption('');
      }
    }
    c.update?.(this.ctx, this.t, dt, this.p);
    this.onChange('time');
  }
}
