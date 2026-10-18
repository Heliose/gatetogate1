/* Tiny tween scheduler driven by the render loop (playbook §10.2) */

const active = new Set();

export const linear = (t) => t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutBack = (t) => {
  const c1 = 1.4, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

export function tween({ duration = 600, delay = 0, ease = easeOutCubic, onUpdate, onDone, tag = null }) {
  const t = {
    start: performance.now() + delay,
    duration,
    ease,
    onUpdate,
    onDone,
    tag,
    stop() {
      active.delete(this);
    },
  };
  active.add(t);
  return t;
}

/* promise variant for scripted sequences */
export const tweenP = (opts) => new Promise((res) => tween({ ...opts, onDone: () => (opts.onDone?.(), res()) }));
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const tweensActive = () => active.size > 0;
export function stopTag(tag) {
  for (const t of [...active]) if (t.tag === tag) active.delete(t);
}

export function updateTweens(now) {
  for (const t of [...active]) {
    if (now < t.start) continue;
    const k = Math.min(1, (now - t.start) / t.duration);
    t.onUpdate?.(t.ease(k), k);
    if (k >= 1) {
      active.delete(t);
      t.onDone?.();
    }
  }
}

/* Smoothly drive a {value} holder toward a target: v.value = damp(...) each frame */
export const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
