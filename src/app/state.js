/* ------------------------------------------------------------------ *
 * Global settings (World / Camera / Look), their control schemas, and
 * persistence to localStorage + a shareable URL hash.
 * ------------------------------------------------------------------ */

export const WORLD_SCHEMA = [
  { key: 'hourFollow', label: 'Time follows the film', type: 'toggle', default: true, hint: 'Each chapter sets its own hour. Turn off to pin the clock.' },
  { key: 'hour', label: 'Time of day', type: 'range', min: 0, max: 24, step: 0.05, default: 5.7, fmt: 'hour' },
  { key: 'simSpeed', label: 'Simulation speed', type: 'range', min: 0.25, max: 6, step: 0.25, default: 1, fmt: 'x', hint: 'Multiplies every moving thing: flights, pods, bags, taxis.' },
  { key: 'trafficRate', label: 'Background flights / min', type: 'range', min: 0, max: 6, step: 0.1, default: 1.2 },
  { key: 'lights', label: 'Airfield lights', type: 'range', min: 0, max: 2, step: 0.05, default: 1 },
  { key: 'labels', label: 'Labels', type: 'toggle', default: true },
  { key: 'vehicleBeacons', label: 'Vehicle beacons', type: 'toggle', default: true },
  { key: 'reducedMotion', label: 'Reduced motion', type: 'toggle', default: false, hint: 'Slower camera moves, no grain.' },
];

export const CAMERA_SCHEMA = [
  { key: 'autoCam', label: 'Film camera', type: 'toggle', default: true, hint: 'Off = free orbit (drag the view). F toggles.' },
  { key: 'fovScale', label: 'Field of view', type: 'range', min: 0.6, max: 1.6, step: 0.02, default: 1, fmt: 'x' },
  { key: 'dof', label: 'Depth of field', type: 'range', min: 0, max: 1.5, step: 0.05, default: 0.45, hint: 'Tilt-shift miniature look on the aerials. Needs high quality.' },
  { key: 'dofRange', label: 'Focus range', type: 'range', min: 0.1, max: 1.2, step: 0.05, default: 0.5 },
  { key: 'shake', label: 'Handheld drift', type: 'range', min: 0, max: 1, step: 0.05, default: 0.25 },
  { key: 'moveSpeed', label: 'Camera move speed', type: 'range', min: 0.5, max: 2, step: 0.1, default: 1, fmt: 'x' },
];

export const LOOK_SCHEMA = [
  { key: 'quality', label: 'Quality', type: 'seg', options: ['high', 'medium', 'low'], default: 'high', hint: 'High: AO + depth of field + MSAA. Medium: no AO. Low: no MSAA.' },
  { key: 'ao', label: 'Ambient occlusion', type: 'range', min: 0, max: 1, step: 0.05, default: 0.85 },
  { key: 'bloom', label: 'Bloom', type: 'range', min: 0, max: 1.2, step: 0.02, default: 0.42 },
  { key: 'bloomThreshold', label: 'Bloom threshold', type: 'range', min: 0.6, max: 2.5, step: 0.05, default: 1.25 },
  { key: 'exposure', label: 'Exposure', type: 'range', min: 0.5, max: 1.8, step: 0.02, default: 1, fmt: 'x' },
  { key: 'vignette', label: 'Vignette', type: 'range', min: 0, max: 1, step: 0.02, default: 0.38 },
  { key: 'grain', label: 'Grain', type: 'range', min: 0, max: 0.08, step: 0.002, default: 0.022 },
  { key: 'wash', label: 'Chapter colour wash', type: 'range', min: 0, max: 1, step: 0.05, default: 1, hint: 'Scales the per-chapter tint (x-ray cyan, thermal amber…).' },
  { key: 'accent', label: 'Interface accent', type: 'color', default: '#5ee7ff' },
];

export function defaultsOf(schema) {
  const o = {};
  for (const s of schema) o[s.key] = s.default;
  return o;
}

const LS_KEY = 'gate-to-gate:v1';
export function loadSettings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}
export function saveSettings(obj) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch { /* private mode */ }
}

/* URL hash: #ch=2&t=12.5&hour=8.1&q=high&free=1 */
export function readHash() {
  const h = location.hash.replace(/^#/, '');
  const out = {};
  if (!h) return out;
  for (const kv of h.split('&')) {
    const [k, v] = kv.split('=');
    if (k) out[decodeURIComponent(k)] = v == null ? '1' : decodeURIComponent(v);
  }
  return out;
}
export function writeHash(obj) {
  const parts = [];
  for (const [k, v] of Object.entries(obj)) if (v != null && v !== '') parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  const s = '#' + parts.join('&');
  if (location.hash !== s) history.replaceState(null, '', s);
  return location.origin + location.pathname + s;
}

export const fmtValue = (s, v) => {
  if (s.type === 'toggle') return v ? 'on' : 'off';
  if (s.fmt === 'hour') { const hh = Math.floor(v), mm = Math.floor((v - hh) * 60 + 1e-6); return `${String(hh % 24).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
  if (s.fmt === 'x') return `${Number(v).toFixed(2).replace(/\.?0+$/, '')}×`;
  if (s.fmt === 'pct') return `${Math.round(v * 100)}%`;
  if (s.fmt === 's') return `${Math.round(v)} s`;
  if (s.fmt === 'm') return `${Math.round(v)} m`;
  if (s.fmt === 'min') return `${Math.round(v)} min`;
  if (typeof v === 'number') return Number.isInteger(s.step) || s.step >= 1 ? String(Math.round(v)) : v.toFixed(s.step < 0.01 ? 3 : 2).replace(/\.?0+$/, '');
  return String(v);
};
