import * as THREE from 'three';
import { bagTagTex } from '../world/textures.js';

/* Chapter 3 — Follow the bag: ride one suitcase from check-in to the hold */
const sm = { pos: new THREE.Vector3(), target: new THREE.Vector3(), init: false };
const tan = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
let lastU = -1, scanned = false, capIdx = -1;
const CAPS = [
  { u: 0.0, text: 'One bag. Checked in at desk 14, tagged for <em>Lisbon</em>, and dropped into the dark.' },
  { u: 0.08, text: 'Under the hall it joins a river of luggage. Nobody touches it again until the hold.' },
  { u: 0.135, text: 'The <b>CT scanner</b> sees through the shell: a laptop, shoes, a 90 ml bottle. Cleared by the AI in a fifth of a second.' },
  { u: 0.3, text: 'The sorter reads the tag at every switch and diverts it toward gate 6.' },
  { u: 0.56, text: 'At make-up it rides a cart up the ramp into daylight.' },
  { u: 0.78, text: 'Across the apron to stand G6, where the belt loader is waiting at the forward hold.' },
  { u: 0.93, text: 'Into the hold, nets closed. Eleven minutes, gate to hold.' },
];
const STATIONS = [
  { id: 'checkin', pos: [-60, 1.6, 129], name: 'Check-in', sub: 'desk 14 · tag printed' },
  { id: 'ct', pos: [-60, -3.6, 82], name: 'CT screening', sub: 'AI clearance · 0.2 s' },
  { id: 'sorter', pos: [20, -3.6, 60], name: 'Sorter', sub: '14 switches · 2.4 m/s' },
  { id: 'makeup', pos: [110, -3.4, 38], name: 'Make-up', sub: 'onto the cart' },
  { id: 'hold', pos: [133, 5.5, -26], name: 'Forward hold', sub: 'G6 · NOVA 1735' },
];

export default {
  id: 'bag',
  title: 'Follow the bag',
  sub: 'Gate to hold in eleven minutes',
  blurb: 'Ride a single suitcase through check-in, down the chute, through a stylised CT scan, across the high-speed sorter, up to the apron on a cart and into the aircraft hold.',
  duration: (ctx, p) => ctx.world.baggage.route.duration / p.speed + 3,
  hour: [9.5, 10.2],
  shots: null,
  captions: null,
  params: [
    { key: 'speed', label: 'Ride speed', type: 'range', min: 0.4, max: 4, step: 0.1, default: 1.6, fmt: 'x' },
    { key: 'cam', label: 'Camera', type: 'seg', options: ['chase', 'side', 'top', 'pov'], default: 'chase' },
    { key: 'smooth', label: 'Camera smoothing', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6 },
    { key: 'bagColor', label: 'Suitcase colour', type: 'color', default: '#2d5f8f', group: 'The bag' },
    { key: 'dest', label: 'Destination tag', type: 'text', default: 'LIS', max: 4, group: 'The bag' },
    { key: 'scanTint', label: 'CT false colour', type: 'color', default: '#3fb8ff', group: 'The bag' },
    { key: 'ctHold', label: 'Linger in the scanner', type: 'toggle', default: true, group: 'The bag', hint: 'Shows the see-through view a little longer.' },
    { key: 'others', label: 'Other bags on the sorter', type: 'toggle', default: true, group: 'Baggage hall' },
    { key: 'bagFlow', label: 'Sorter speed', type: 'range', min: 0, max: 3, step: 0.1, default: 1, fmt: 'x', group: 'Baggage hall' },
    { key: 'stations', label: 'Station labels', type: 'toggle', default: true, group: 'Baggage hall' },
    { key: 'bagLabel', label: 'Bag label', type: 'toggle', default: true, group: 'Baggage hall' },
  ],
  enter(ctx, p) {
    const B = ctx.world.baggage;
    ctx.world.underground.group.visible = true;
    B.setBagColor(p.bagColor);
    B.setBagFlow(p.bagFlow);
    B.bags.visible = p.others;
    B.ctU.uScanTint.value.set(p.scanTint);
    sm.init = false;
    lastU = -1; scanned = false; capIdx = -1;
    ctx.post.setWash('#ffb347', 0.08);
    ctx.sound.mix({ wind: 0.1, jets: 0.05, hum: 0.9, drone: 0, room: 0.9 });
    ctx.focusOverride = B.hero.position;
  },
  onParam(ctx, key, v, p) {
    const B = ctx.world.baggage;
    if (key === 'bagColor') B.setBagColor(v);
    if (key === 'bagFlow') B.setBagFlow(v);
    if (key === 'others') B.bags.visible = v;
    if (key === 'scanTint') B.ctU.uScanTint.value.set(v);
    if (key === 'dest') { const tex = bagTagTex((v || 'LIS').toUpperCase().slice(0, 4)); B.hero.traverse((o) => { if (o.isMesh && o.material.map?.userData?.tag !== undefined) { /* noop */ } }); B.tagMat = tex; }
    if (key === 'cam') sm.init = false;
  },
  scrub(ctx, t) { sm.init = false; capIdx = -1; },
  update(ctx, t, dt, p) {
    const B = ctx.world.baggage;
    const simT = t * p.speed;
    const u = B.route.uAtTime(simT);
    const r = B.place(u);
    tan.copy(r.tan);
    // CT scan state
    const [c0, c1] = B.ctRange;
    const w = p.ctHold ? 0.022 : 0.012;
    const k = THREE.MathUtils.smoothstep(u, c0 - w, c0 + 0.004) * (1 - THREE.MathUtils.smoothstep(u, c1 - 0.004, c1 + w));
    B.setScan(k);
    if (k > 0.5 && !scanned) { scanned = true; ctx.sound.cue('scan'); }
    if (k < 0.1) scanned = false;
    // cargo door
    const door = ctx.world.hero.ac.doors.cargoFwd;
    door?.set(THREE.MathUtils.smoothstep(u, 0.84, 0.9));
    // lights follow the bag underground
    const hp = B.hero.position;
    if (hp.y < -1) ctx.daylight.pointLight(0, tmp.set(hp.x, hp.y + 2.2, hp.z), '#ffd9a0', 22, 16); else ctx.daylight.releaseLight(0);
    ctx.daylight.pointLight(1, tmp2.set(-60, -3.8, 82), '#5ee7ff', 14 + k * 30, 12);
    // captions keyed on route progress
    let ci = -1;
    for (let i = 0; i < CAPS.length; i++) if (u >= CAPS[i].u) ci = i;
    if (ci !== capIdx) { capIdx = ci; if (ci >= 0) { ctx.caption(CAPS[ci].text); ctx.narrator.speak(CAPS[ci].text); setTimeout(() => { if (capIdx === ci) ctx.caption(''); }, 6500); } }
    // labels
    if (p.bagLabel) ctx.labels.add('bag:hero', { anchor: () => tmp.copy(B.hero.position).add(up), html: `<div class="lk">your bag</div><div class="lt">${(p.dest || 'LIS').toUpperCase()} · NOVA 1735</div><div class="ls">${k > 0.3 ? 'CT: laptop · shoes · 90 ml liquid · cleared' : u < 0.08 ? 'checked in · desk 14' : u < 0.58 ? `sorter · ${(B.route.speedAtU(u) * p.speed).toFixed(1)} m/s` : u < 0.93 ? 'on the cart · stand G6' : 'in the hold'}</div>`, cls: 'bag', offset: [0, -18], leader: true, priority: 5 });
    else ctx.labels.remove('bag:hero');
    if (k > 0.2) ctx.labels.add('bag:ct', { anchor: new THREE.Vector3(-58.2, -3.2, 82), html: `<div class="lk">CT-X · AI screening</div><div class="lt">Items detected</div><div class="ls">laptop (cleared) · shoes · clothes<br>liquid 90 ml · within limit<br>threat score 0.3% · <b>cleared</b> in 0.21 s</div>`, cls: 'ct', offset: [120, -10], leader: true, priority: 4 });
    else ctx.labels.remove('bag:ct');
    if (p.stations) for (const s of STATIONS) ctx.labels.add('bag:' + s.id, { anchor: new THREE.Vector3(...s.pos), html: `<div class="lt">${s.name}</div><div class="ls">${s.sub}</div>`, cls: '', offset: [0, -14], leader: true, maxDist: 70 });
    else for (const s of STATIONS) ctx.labels.remove('bag:' + s.id);
    lastU = u;
  },
  camera(ctx, t, out, p) {
    const B = ctx.world.baggage;
    if (lastU < 0) { const u = B.route.uAtTime(t * p.speed); const r = B.place(u); tan.copy(r.tan); lastU = u; }
    const bag = B.hero.position;
    const u = lastU;
    side.crossVectors(up, tan).normalize();
    const [c0, c1] = B.ctRange;
    const inCT = THREE.MathUtils.smoothstep(u, c0 - 0.02, c0) * (1 - THREE.MathUtils.smoothstep(u, c1, c1 + 0.02));
    const onCart = THREE.MathUtils.smoothstep(u, B.cartRange[0] - 0.01, B.cartRange[0] + 0.01) * (1 - THREE.MathUtils.smoothstep(u, B.cartRange[1] + 0.02, B.cartRange[1] + 0.05));
    const inHold = THREE.MathUtils.smoothstep(u, 0.975, 0.99);
    const P = new THREE.Vector3(), T = new THREE.Vector3();
    let fov = 46;
    const mode = p.cam;
    if (mode === 'pov') { P.copy(bag).addScaledVector(up, 0.5).addScaledVector(tan, 0.3); T.copy(bag).addScaledVector(tan, 6).addScaledVector(up, 0.3); fov = 60; }
    else if (mode === 'top') { P.copy(bag).addScaledVector(up, 9 + onCart * 10).addScaledVector(tan, -0.6); T.copy(bag); fov = 40; }
    else if (mode === 'side') { P.copy(bag).addScaledVector(side, 3.4 + onCart * 5).addScaledVector(up, 1.0 + onCart * 2); T.copy(bag).addScaledVector(up, 0.2); }
    else {
      P.copy(bag).addScaledVector(tan, -3.4 - onCart * 4).addScaledVector(up, 1.7 + onCart * 2.2).addScaledVector(side, 0.9 + onCart * 1.5);
      T.copy(bag).addScaledVector(tan, 2.0).addScaledVector(up, 0.25);
      // side view through the CT scanner
      const sp = new THREE.Vector3().copy(bag).addScaledVector(side, 3.6).addScaledVector(up, 1.1);
      P.lerp(sp, inCT);
      T.lerp(new THREE.Vector3().copy(bag).addScaledVector(up, 0.3), inCT);
      // inside the hold: pull back behind the bag
      const hp = new THREE.Vector3().copy(bag).addScaledVector(tan, -3).addScaledVector(up, 1.3);
      P.lerp(hp, inHold);
      fov = 46 + inHold * 10;
    }
    // smoothing
    const lam = 2 + (1 - p.smooth) * 18;
    if (!sm.init) { sm.pos.copy(P); sm.target.copy(T); sm.init = true; }
    const k = 1 - Math.exp(-lam * (1 / 60));
    sm.pos.lerp(P, k);
    sm.target.lerp(T, k);
    out.pos.copy(sm.pos);
    out.target.copy(sm.target);
    out.fov = fov;
    return true;
  },
  exit(ctx) {
    const B = ctx.world.baggage;
    B.setScan(0);
    ctx.world.hero.ac.doors.cargoFwd?.set(0);
    B.tug.group.visible = B.cart.group.visible = false;
    ctx.daylight.releaseLight(0);
    ctx.daylight.releaseLight(1);
    ctx.world.underground.group.visible = false;
    ctx.post.setWash(null, 0);
    ctx.labels.removeWhere((id) => id.startsWith('bag:'));
    ctx.focusOverride = null;
    lastU = -1;
  },
  panel(ctx, p, t) {
    const B = ctx.world.baggage;
    const u = Math.max(0, lastU);
    const stage = u < 0.08 ? 'Check-in & drop' : u < B.ctRange[1] + 0.02 ? 'CT screening' : u < 0.56 ? 'Sorter' : u < 0.62 ? 'Make-up' : u < 0.78 ? 'Ramp & apron' : u < 0.93 ? 'Belt loader' : 'In the hold';
    return `<div class="g-head"><span class="big">${Math.round(u * 100)}%</span><span class="small">${stage} · ${Math.round(u * B.route.length)} m of ${Math.round(B.route.length)} m</span></div>
      <div class="legend" style="margin-top:8px"><div class="legend-row" style="--c:#ffb347"><i></i><span class="ln">Bag speed</span><span class="lm">${(B.route.speedAtU(u) * p.speed).toFixed(1)} m/s</span></div>
      <div class="legend-row" style="--c:#3fb8ff"><i></i><span class="ln">CT see-through</span><span class="lm">${Math.round(B.ctU.uScan.value * 100)}%</span></div></div>`;
  },
};
