import * as THREE from 'three';
import { TOWER } from '../world/layout.js';

/* Chapter 7 — Digital tower: the tower dissolves into a remote ops room; every aircraft carries a label and a predicted path */
const CAB = [TOWER.x, 69.5, TOWER.z];
let sweep = null, links = null, sweepT = 0;
const _p = new THREE.Vector3();

export default {
  id: 'tower',
  title: 'Digital tower',
  sub: 'Every aircraft, labelled and predicted',
  blurb: 'The control tower dissolves into a remote operations room, where every aircraft carries a floating label and a predicted path. Conflicts are flagged before they happen.',
  duration: 62,
  hour: [19.15, 19.8],
  shots: [
    { at: 0, pos: [CAB[0] - 150, 66, CAB[2] + 190], target: [CAB[0], 70, CAB[2]], fov: 36 },
    { at: 10, pos: [CAB[0] + 9, 69.4, CAB[2] + 9], target: [CAB[0] - 1, 68.6, CAB[2] - 2], fov: 58 },
    { at: 19, pos: [CAB[0] + 1.2, 68.3, CAB[2] + 2.2], target: [CAB[0] - 4, 68.7, CAB[2] - 3.5], fov: 64, ease: 'sine' },
    { at: 26, pos: [CAB[0] - 4, 71.5, CAB[2] - 2], target: [40, 8, -220], fov: 50 },
    { at: 62, pos: [CAB[0] - 10, 76, CAB[2] - 8], target: [-250, 40, -420], fov: 48, ease: 'sine' },
  ],
  captions: [
    { at: 1.5, text: 'Dusk. The tower is the airport’s eye, and in 2035 it is also somewhere else.' },
    { at: 11, text: 'The cab <b>dissolves</b>. Inside, the remote operations room: ten screens, five people, one shared picture.' },
    { at: 24, text: 'Every aircraft carries its own <em>label</em> and a predicted path, ninety seconds ahead.' },
    { at: 36, text: 'Where two predictions come too close, both turn amber, long before either pilot would notice.' },
    { at: 50, text: 'The radar still turns. The decisions are made from the data, not the glass.' },
  ],
  params: [
    { key: 'follow', label: 'Dissolve follows the film', type: 'toggle', default: true },
    { key: 'dissolve', label: 'Dissolve', type: 'range', min: 0, max: 1, step: 0.01, default: 0.72 },
    { key: 'labels', label: 'Labels', type: 'seg', options: ['all', 'airborne', 'none'], default: 'all', group: 'Traffic picture' },
    { key: 'predict', label: 'Predicted paths', type: 'toggle', default: true, group: 'Traffic picture' },
    { key: 'horizon', label: 'Prediction horizon', type: 'range', min: 15, max: 240, step: 5, default: 90, fmt: 's', group: 'Traffic picture' },
    { key: 'conflictDist', label: 'Conflict distance', type: 'range', min: 60, max: 500, step: 10, default: 180, fmt: 'm', group: 'Traffic picture' },
    { key: 'sweep', label: 'Radar sweep', type: 'toggle', default: true, group: 'Traffic picture' },
    { key: 'links', label: 'Data links', type: 'toggle', default: true, group: 'Traffic picture' },
    { key: 'trafficRate', label: 'Flights per sim minute', type: 'range', min: 0, max: 6, step: 0.1, default: 2.4, group: 'Simulation' },
    { key: 'simSpeed', label: 'Simulation speed', type: 'range', min: 1, max: 12, step: 0.5, default: 5, fmt: 'x', group: 'Simulation' },
  ],
  enter(ctx, p) {
    const T = ctx.world.traffic;
    T.setPredict(p.predict);
    T.predict.horizon = p.horizon;
    T.conflictDist = p.conflictDist;
    ctx.sim.trafficRate = p.trafficRate;
    ctx.sim.speed = p.simSpeed;
    if (T.flights.length < 10) T.seed(10);
    if (!sweep) this.build(ctx);
    sweep.visible = p.sweep;
    links.visible = p.links;
    ctx.world.tower.holoTable.material.emissiveIntensity = 1.4;
    ctx.post.setWash('#5ee7ff', 0.2);
    ctx.sound.mix({ wind: 0.5, jets: 0.4, hum: 0.2, drone: 0, room: 0.5 });
  },
  build(ctx) {
    sweep = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color('#5ee7ff').multiplyScalar(2), transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    sweep.rotation.x = -Math.PI / 2;
    sweep.position.set(TOWER.x, 1.5, TOWER.z);
    sweep.userData.noDepth = true;
    sweep.renderOrder = 6;
    ctx.scene.add(sweep);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    links = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#5ee7ff', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    links.frustumCulled = false;
    links.userData.noDepth = true;
    ctx.scene.add(links);
  },
  onParam(ctx, key, v, p) {
    const T = ctx.world.traffic;
    if (key === 'predict') T.setPredict(v);
    if (key === 'horizon') T.predict.horizon = v;
    if (key === 'conflictDist') T.conflictDist = v;
    if (key === 'sweep') sweep.visible = v;
    if (key === 'links') links.visible = v;
    if (key === 'labels' && v === 'none') ctx.labels.removeWhere((id) => id.startsWith('flt:'));
  },
  update(ctx, t, dt, p) {
    const T = ctx.world.traffic;
    ctx.sim.trafficRate = p.trafficRate;
    ctx.sim.speed = p.simSpeed;
    // dissolve
    const scripted = THREE.MathUtils.smoothstep(t, 10, 19) * 0.72;
    ctx.DISSOLVE.uDissolve.value = p.follow ? scripted : p.dissolve;
    // radar sweep ring
    if (sweep.visible) {
      sweepT = (sweepT + dt * ctx.sim.speed * 0.25) % 4;
      const R = (sweepT / 4) * 2400;
      sweep.scale.setScalar(Math.max(1, R));
      sweep.material.opacity = 0.6 * (1 - sweepT / 4);
    }
    // labels + links
    const live = T.flights.filter((f) => !f.done);
    const lp = links.geometry.attributes.position;
    let li = 0;
    const seen = new Set();
    for (const f of live) {
      const show = p.labels === 'all' || (p.labels === 'airborne' && f.pos.y > 5);
      if (show) {
        seen.add('flt:' + f.id);
        ctx.labels.add('flt:' + f.id, {
          anchor: f.pos,
          html: `<div class="lk">${T.stateOf(f)}${f.conflict ? ' · CONFLICT' : ''}</div><div class="lt">${f.callsign}</div><div class="ls">${f.typeName} · ${f.type === 'dep' ? 'to ' + f.dest : 'from ' + f.dest} · G${f.gate + 1}<br>${Math.round(f.alt)} m · ${Math.round(f.speed * 3.6)} km/h${f.pos.y > 5 ? ` · ETA ${Math.max(0, Math.round((f.path.duration - f.t) / 60))} min` : ''}</div>`,
          cls: 'flight', offset: [0, -26], leader: true, maxDist: 4000, priority: f.conflict ? 8 : 2,
        });
        ctx.labels.setClass('flt:' + f.id, 'conflict', f.conflict);
      }
      if (p.links && li < 40) {
        lp.setXYZ(li * 2, CAB[0], CAB[1] + 4, CAB[2]);
        lp.setXYZ(li * 2 + 1, f.pos.x, f.pos.y + 3, f.pos.z);
        li++;
      }
    }
    ctx.labels.removeWhere((id) => id.startsWith('flt:') && !seen.has(id));
    lp.needsUpdate = true;
    links.geometry.setDrawRange(0, li * 2);
    // ops room pooled lights (cyan wash inside the cab)
    ctx.daylight.pointLight(2, _p.set(CAB[0], CAB[1] + 3.5, CAB[2]), '#5ee7ff', 6 * ctx.DISSOLVE.uDissolve.value, 18);
    ctx.world.tower.radar.rotation.y += dt * 1.2;
  },
  exit(ctx) {
    const T = ctx.world.traffic;
    T.setPredict(false);
    ctx.DISSOLVE.uDissolve.value = 0;
    sweep.visible = false;
    links.visible = false;
    ctx.sim.trafficRate = null;
    ctx.sim.speed = 1;
    ctx.daylight.releaseLight(2);
    ctx.world.tower.holoTable.material.emissiveIntensity = 0.9;
    ctx.post.setWash(null, 0);
    ctx.labels.removeWhere((id) => id.startsWith('flt:'));
  },
  panel(ctx, p, t) {
    const T = ctx.world.traffic;
    const live = T.flights.filter((f) => !f.done);
    const air = live.filter((f) => f.pos.y > 5).length, conf = live.filter((f) => f.conflict).length;
    return `<div class="legend"><div class="legend-row" style="--c:#5ee7ff"><i></i><span class="ln">Aircraft under control</span><span class="lm">${live.length}</span></div>
      <div class="legend-row" style="--c:#8fe9ff"><i></i><span class="ln">Airborne</span><span class="lm">${air}</span></div>
      <div class="legend-row" style="--c:#ff7a59"><i></i><span class="ln">Predicted conflicts</span><span class="lm">${conf}</span></div>
      <div class="legend-row" style="--c:#b48cff"><i></i><span class="ln">Tower dissolved</span><span class="lm">${Math.round(ctx.DISSOLVE.uDissolve.value / 0.72 * 100)}%</span></div></div>
      <div class="pnote">Predictions look ${p.horizon} s ahead along each aircraft’s cleared route. Two paths within ${p.conflictDist} m horizontally and 60 m vertically are flagged.</div>`;
  },
};
