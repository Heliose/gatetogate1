/* Chapter 1 — Dawn: wide aerial at sunrise, runway lights fading, time-lapse trails */
export default {
  id: 'dawn',
  title: 'Dawn',
  sub: 'The organism wakes',
  blurb: 'A wide aerial at sunrise. The runway lights fade as the sun clears the horizon, and time-lapse aircraft draw glowing trails across the taxiways and into the sky.',
  duration: 40,
  hour: [5.55, 7.2],
  shots: [
    { at: 0, pos: [-1150, 540, 1200], target: [-80, 0, -220], fov: 40 },
    { at: 40, pos: [-540, 400, 720], target: [60, 0, -240], fov: 38, ease: 'sine' },
  ],
  captions: [
    { at: 1.5, text: 'Before the first passenger, the airport is already breathing.' },
    { at: 9, text: 'Runway lights fade as the sun clears the horizon. The <b>approach lights</b> keep pulsing toward the threshold.' },
    { at: 17, text: 'In time-lapse, every departure draws an <em>amber</em> trail into the sky, and every arrival a <b>cyan</b> one to its gate.' },
    { at: 27, text: 'Taxiways are the arteries. The runway is the heart valve: one aircraft at a time.' },
    { at: 35, text: 'Fifty movements an hour, and the day has barely started.' },
  ],
  params: [
    { key: 'timeLapse', label: 'Time-lapse', type: 'range', min: 0.5, max: 6, step: 0.1, default: 2.5, hint: 'Simulated hours per real minute. The clock in the corner follows.' },
    { key: 'flightsPerMin', label: 'Flights per sim minute', type: 'range', min: 0, max: 1.5, step: 0.05, default: 0.4 },
    { key: 'trails', label: 'Trails', type: 'toggle', default: true, group: 'Trails' },
    { key: 'trailLength', label: 'Trail length', type: 'range', min: 0.05, max: 1, step: 0.05, default: 0.45, fmt: 'pct', group: 'Trails' },
    { key: 'trailLinger', label: 'Trail linger', type: 'range', min: 2, max: 60, step: 1, default: 22, fmt: 's', group: 'Trails' },
    { key: 'trailWidth', label: 'Trail width', type: 'range', min: 1, max: 14, step: 0.5, default: 5, fmt: 'm', group: 'Trails' },
    { key: 'colorDep', label: 'Departure colour', type: 'color', default: '#ffb347', group: 'Trails' },
    { key: 'colorArr', label: 'Arrival colour', type: 'color', default: '#5ee7ff', group: 'Trails' },
    { key: 'showAircraft', label: 'Show aircraft', type: 'toggle', default: true, group: 'Trails' },
  ],
  hourAt(ctx, t, p) { return 5.55 + t * (p.timeLapse / 60); },
  enter(ctx, p) {
    const T = ctx.world.traffic;
    T.setTrailStyle({ tail: p.trailLength, linger: p.trailLinger, width: p.trailWidth, colorDep: p.colorDep, colorArr: p.colorArr });
    T.setTrails(p.trails);
    ctx.sim.trafficRate = p.flightsPerMin;
    ctx.sim.speed = p.timeLapse * 60;
    if (T.flights.length < 6) T.seed(8);
    ctx.post.setWash('#ffb347', 0.12);
    ctx.sound.mix({ wind: 0.9, jets: 0.5, hum: 0, drone: 0, room: 0 });
  },
  update(ctx, t, dt, p) {
    ctx.sim.speed = p.timeLapse * 60;
    ctx.sim.trafficRate = p.flightsPerMin;
    ctx.world.traffic.swarm.visible = p.showAircraft;
  },
  onParam(ctx, key, v, p) {
    const T = ctx.world.traffic;
    if (key === 'trails') T.setTrails(v);
    if (['trailLength', 'trailLinger', 'trailWidth', 'colorDep', 'colorArr'].includes(key)) T.setTrailStyle({ tail: p.trailLength, linger: p.trailLinger, width: p.trailWidth, colorDep: p.colorDep, colorArr: p.colorArr });
  },
  exit(ctx) {
    const T = ctx.world.traffic;
    T.setTrails(false);
    T.swarm.visible = true;
    ctx.sim.trafficRate = null;
    ctx.sim.speed = 1;
    ctx.post.setWash(null, 0);
  },
  panel(ctx, p) {
    const T = ctx.world.traffic;
    const live = T.flights.filter((f) => !f.done).length;
    return `<div class="legend"><div class="legend-row" style="--c:#ffb347"><i></i><span class="ln">Departures (runway 09, climbing east)</span><span class="lm">${T.flights.filter((f) => f.type === 'dep' && !f.done).length}</span></div>
      <div class="legend-row" style="--c:#5ee7ff"><i></i><span class="ln">Arrivals (from the west)</span><span class="lm">${T.flights.filter((f) => f.type === 'arr' && !f.done).length}</span></div>
      <div class="legend-row" style="--c:#ffffff"><i></i><span class="ln">Live trails</span><span class="lm">${ctx.world.trails.active}</span></div></div>
      <div class="pnote">${live} aircraft moving · ${Math.round(p.flightsPerMin * 60)} movements per simulated hour · one real second is ${Math.round(p.timeLapse * 60)} simulated seconds.</div>`;
  },
};
