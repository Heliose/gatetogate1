import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { TIME, XRAY, AIRX, ENGINE, SCAN, DISSOLVE, createMaterials, setXrayBlend, setTransparent } from './world/materials.js';
import { createSky } from './world/sky.js';
import { Daylight } from './world/lighting.js';
import { buildGround } from './world/ground.js';
import { buildTerminal, buildTower, buildHangar, buildUtilities } from './world/terminal.js';
import { buildUnderground } from './world/underground.js';
import { buildAirfieldLights, LIGHT_GROUPS } from './world/lights.js';
import { buildBaggage } from './world/baggage.js';
import { buildAirliner, airlinerMaterials, hologramMaterials, buildSystems, buildEngineDetail } from './world/aircraft.js';
import { buildFleet, drone as buildDrone } from './world/vehicles.js';
import { Traffic, AirTaxiFleet, SkyPaths } from './world/traffic.js';
import { TrailPool } from './fx/trails.js';
import { createPost } from './fx/post.js';
import { CameraRig } from './app/camera.js';
import { Labels } from './app/labels.js';
import { Sound, Narrator } from './app/audio.js';
import { Director } from './app/director.js';
import { UI } from './app/ui.js';
import { WORLD_SCHEMA, CAMERA_SCHEMA, LOOK_SCHEMA, defaultsOf, loadSettings, saveSettings, readHash, writeHash } from './app/state.js';
import { updateTweens, tweensActive } from './core/tween.js';
import { gateX, STAND_Z, HERO_GATE, PARKED_GATES, AIRLINES, HANGAR } from './world/layout.js';

import ch1 from './chapters/ch1-dawn.js';
import ch2 from './chapters/ch2-xray.js';
import ch3 from './chapters/ch3-bag.js';
import ch4 from './chapters/ch4-turnaround.js';
import ch5 from './chapters/ch5-aircraft.js';
import ch6 from './chapters/ch6-hangar.js';
import ch7 from './chapters/ch7-tower.js';
import ch8 from './chapters/ch8-sky.js';

/* ------------------------------------------------------------------ *
 * Gate to Gate — bootstrap: renderer, world, systems, director, loop.
 * ------------------------------------------------------------------ */
const canvas = document.getElementById('scene');
const host = document.getElementById('app');
const loaderBar = document.querySelector('#loader .ld-bar i');
const loaderStep = document.getElementById('ld-step');
const setProgress = (p, msg) => { loaderBar.style.width = `${Math.round(p * 100)}%`; if (msg) loaderStep.textContent = msg; };
const nextFrame = () => new Promise((r) => (document.hidden ? setTimeout(r, 0) : requestAnimationFrame(() => r())));
const size = () => ({ w: Math.max(1, host.clientWidth || innerWidth), h: Math.max(1, host.clientHeight || innerHeight) });

/* renderer, scene, camera */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.info.autoReset = false;
const { w: w0, h: h0 } = size();
renderer.setSize(w0, h0, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b1020');
const camera = new THREE.PerspectiveCamera(36, w0 / h0, 1, 7000);
camera.position.set(-1150, 540, 1200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.6;
controls.zoomSpeed = 0.9;
controls.panSpeed = 0.8;
controls.minDistance = 1.5;
controls.maxDistance = 4200;
controls.maxPolarAngle = THREE.MathUtils.degToRad(88);
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.enabled = false;
const rig = new CameraRig(camera, controls);

/* settings */
const saved = loadSettings();
const settings = {
  world: { ...defaultsOf(WORLD_SCHEMA), ...(saved.world || {}) },
  camera: { ...defaultsOf(CAMERA_SCHEMA), ...(saved.camera || {}) },
  look: { ...defaultsOf(LOOK_SCHEMA), ...(saved.look || {}) },
  lightGroups: saved.lightGroups || new Array(10).fill(true),
  sound: !!saved.sound,
  narrate: !!saved.narrate,
};
const hash = readHash();
if (hash.q && ['high', 'medium', 'low'].includes(hash.q)) settings.look.quality = hash.q;

/* the shared context every system and chapter sees */
const ctx = {
  scene, camera, renderer, controls, rig, canvas,
  M: null, daylight: null, sky: null, post: null, labels: null, sound: new Sound(), narrator: new Narrator(),
  world: {}, settings, params: {},
  sim: { speed: 1, trafficRate: null, flow: 1, time: 0 },
  XRAY, AIRX, ENGINE, SCAN, DISSOLVE,
  setXrayBlend: (on) => setXrayBlend(ctx.M, on),
  focusOverride: null,
  onCanvasClick: null,
  caption: (html) => ui?.caption(html),
  toast: (msg) => ui?.toast(msg),
  director: null,
  size: size(),
};
let ui = null;
const app = { ctx, settings, lightGroups: LIGHT_GROUPS, renderer, scene, camera, rig };
window.__app = app;

/* ------------------------------------------------------------------ */
async function init() {
  setProgress(0.04, 'mixing materials');
  await nextFrame();
  const M = (ctx.M = createMaterials());
  const sky = (ctx.sky = createSky());
  scene.add(sky.mesh);
  const daylight = (ctx.daylight = new Daylight(scene, renderer, sky, M));
  setProgress(0.12, 'paving the airfield');
  await nextFrame();

  const ground = buildGround(M);
  scene.add(ground.group);
  setProgress(0.22, 'raising the terminal');
  await nextFrame();
  const terminal = buildTerminal(M, daylight);
  scene.add(terminal.group);
  const tower = buildTower(M, daylight);
  scene.add(tower.group);
  const hangar = buildHangar(M, daylight);
  scene.add(hangar.group);
  const utilities = buildUtilities(M, daylight);
  scene.add(utilities.group);
  setProgress(0.36, 'digging the tunnels');
  await nextFrame();
  const underground = buildUnderground(M);
  underground.group.visible = false;
  scene.add(underground.group);
  const lights = buildAirfieldLights();
  scene.add(lights.points);
  setProgress(0.46, 'sorting the bags');
  await nextFrame();
  const baggage = buildBaggage(M, daylight);
  scene.add(baggage.group);
  setProgress(0.56, 'towing in the fleet');
  await nextFrame();

  // aircraft: hero (x-ray), parked decor, hangar (scan), hologram twin
  const heroMats = airlinerMaterials(M, AIRLINES[0], { xray: true });
  const heroAc = buildAirliner(heroMats, { doors: true, lights: 'full' });
  heroAc.group.position.set(gateX(HERO_GATE), 0, STAND_Z);
  scene.add(heroAc.group);
  daylight.glow(heroMats.hull, 0, 1.2);
  const sysMats = { ...M };
  for (const k of ['steel', 'cabinDark', 'seat', 'white', 'avionics', 'uld', 'wireRed', 'wireBlue', 'wireGreen', 'hydYellow', 'fuelTank']) sysMats[k] = M[k].clone();
  const systems = buildSystems(sysMats);
  systems.group.visible = false;
  heroAc.body.add(systems.group);
  const engineDetail = buildEngineDetail(M);
  engineDetail.group.position.set(-5.6, -2.35, 2.2);
  engineDetail.group.visible = false;
  heroAc.body.add(engineDetail.group);
  // cutaway clipping on hero + systems materials (one plane always bound; moved away when off)
  for (const m of [...Object.values(heroMats), ...Object.values(sysMats)]) if (m?.isMaterial && !m.userData.clipSet) { m.clippingPlanes = [ch5.clipPlane]; m.clipShadows = true; m.userData.clipSet = true; }
  const parked = [];
  PARKED_GATES.forEach((gi, i) => {
    const mats = airlinerMaterials(M, AIRLINES[(i + 1) % AIRLINES.length]);
    const ac = buildAirliner(mats, { lights: 'nav', radial: 24, flat: true });
    ac.group.position.set(gateX(gi), 0, STAND_Z);
    daylight.glow(mats.hull, 0, 0.9);
    scene.add(ac.group);
    parked.push({ ac, mats });
    terminal.bridges[gi].set(1);
  });
  const hangarMats = airlinerMaterials(M, AIRLINES[2], { maintenance: true, scan: true });
  const hangarAc = buildAirliner(hangarMats, { lights: 'none', radial: 28, flat: true });
  hangarAc.group.position.copy(hangar.aircraftPos);
  scene.add(hangarAc.group);
  const twinMats = hologramMaterials('#b48cff');
  const twinAc = buildAirliner(twinMats, { lights: 'none', holo: true, radial: 24 });
  twinAc.group.position.set(HANGAR.x, 16, HANGAR.z - 4);
  twinAc.group.visible = false;
  twinAc.group.traverse((o) => { o.castShadow = false; o.receiveShadow = false; if (o.isMesh) { o.userData.noDepth = true; o.renderOrder = 8; } });
  scene.add(twinAc.group);
  setProgress(0.68, 'briefing the ground crews');
  await nextFrame();

  // GSE fleet, drones
  const fleetItems = buildFleet(M);
  const fleet = { items: fleetItems, bays: {}, paths: {}, pathLines: null, pulse: null, group: null };
  const fleetGroup = new THREE.Group();
  fleetGroup.name = 'fleet';
  fleetGroup.visible = false;
  fleet.group = fleetGroup;
  let bi = 0;
  for (const [key, v] of Object.entries(fleetItems)) {
    fleetGroup.add(v.group);
    if (v.carts) for (const c of v.carts) fleetGroup.add(c.group);
    const bay = [410 + (bi % 2) * 26, 0, -124 + Math.floor(bi / 2) * 9];
    fleet.bays[key] = bay;
    v.group.position.set(bay[0], 0.05, bay[2]);
    v.group.rotation.y = Math.PI;
    if (v.carts) v.carts.forEach((c, i) => { c.group.position.set(bay[0], 0.05, bay[2] + 4.6 * (i + 1)); c.group.rotation.y = Math.PI; });
    bi++;
  }
  fleet.pathLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.45, depthWrite: false }));
  fleet.pathLines.visible = false;
  fleet.pathLines.userData.noDepth = true;
  fleetGroup.add(fleet.pathLines);
  fleet.pulse = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb347').multiplyScalar(2), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  fleet.pulse.rotation.x = -Math.PI / 2;
  fleet.pulse.visible = false;
  fleet.pulse.userData.noDepth = true;
  fleetGroup.add(fleet.pulse);
  scene.add(fleetGroup);
  const drones = [];
  for (let i = 0; i < 6; i++) {
    const d = buildDrone(M);
    d.group.visible = false;
    d.group.scale.setScalar(1.6);
    scene.add(d.group);
    drones.push(d);
  }
  setProgress(0.78, 'filing the flight plans');
  await nextFrame();

  // traffic, trails, taxis, sky paths
  const trails = new TrailPool(scene, 48, 180);
  const traffic = new Traffic(scene, trails);
  traffic.seed(5);
  const taxis = new AirTaxiFleet(scene, M, 12);
  taxis.group.visible = false;
  const skyPaths = new SkyPaths(scene, M, 900);

  Object.assign(ctx.world, {
    ground, terminal, tower, hangar, utilities, underground, lights, baggage, traffic, trails, taxis, skyPaths,
    hero: { ac: heroAc, mats: heroMats, systems, engineDetail }, parked, hangarAc: { ac: hangarAc, mats: hangarMats }, twin: { ac: twinAc, mats: twinMats }, drones, fleet,
  });
  // night glows
  daylight.glow(M.headlight, 0, 2.5);
  daylight.glow(M.lightWarm, 0.6, 2.4);
  daylight.glow(M.panelLight, 0.9, 0.5);

  setProgress(0.86, 'tuning the lenses');
  await nextFrame();
  const post = (ctx.post = createPost(renderer, scene, camera, settings.look.quality));
  ctx.labels = new Labels(document.getElementById('labels'), document.getElementById('leaders'));
  ctx.director = new Director(ctx, [ch1, ch2, ch3, ch4, ch5, ch6, ch7, ch8]);
  app.director = ctx.director;
  ui = new UI(app);
  app.ui = ui;
  if (size().w < 760) document.body.classList.add('panel-closed'); // phones: controls open on demand
  wire();
  applyLook();
  applyWorldSettings();
  for (let i = 0; i < 10; i++) lights.setGroup(i, settings.lightGroups[i] ? 1 : 0);
  daylight.set(5.6);

  // start chapter (from the hash if present)
  const startCh = Math.max(0, Math.min(7, (parseInt(hash.ch, 10) || 1) - 1));
  ctx.director.go(startCh, { t: parseFloat(hash.t) || 0, instant: true });
  if (hash.free === '1') setAutoCam(false);
  if (hash.pause === '1') ctx.director.pause();

  setProgress(0.92, 'warming the shaders');
  const bounded = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
  await bounded(renderer.compileAsync(scene, camera), 5000);
  // warm the blended (x-ray) variants too, so the glass never hitches the first time
  setXrayBlend(M, true);
  for (const m of Object.values(heroMats)) if (m.userData.xray) setTransparent(m, true);
  underground.group.visible = true;
  await bounded(renderer.compileAsync(scene, camera), 3000);
  underground.group.visible = false;
  setXrayBlend(M, false);
  for (const m of Object.values(heroMats)) if (m.userData.xray) setTransparent(m, false);
  setProgress(1, 'ready');
  await nextFrame();
  document.getElementById('loader').classList.add('done');
  onResize();
  start();
}

/* ------------------------------------------------------------------ */
/* settings application                                                 */
/* ------------------------------------------------------------------ */
function applyLook() {
  const L = settings.look, post = ctx.post;
  post.setBloom(L.bloom, L.bloomThreshold);
  post.setFinish({ vignette: L.vignette, grain: settings.world.reducedMotion ? 0 : L.grain });
  post.setAO(L.ao);
  ctx.daylight.exposureScale = L.exposure;
  document.documentElement.style.setProperty('--accent', L.accent);
  const c = new THREE.Color(L.accent);
  document.documentElement.style.setProperty('--accent-rgb', `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`);
}
function applyWorldSettings() {
  const W = settings.world;
  ctx.world.lights.setLevel(ctx.daylight.lightsLevel * W.lights);
  ctx.labels.container.style.display = W.labels ? '' : 'none';
  ctx.labels.svg.style.display = W.labels ? '' : 'none';
  for (const k of ['beacon', 'beaconRed', 'strobe']) ctx.M[k].visible = W.vehicleBeacons;
}
app.lookPresets = {
  Cinematic: { ao: 0.85, bloom: 0.42, bloomThreshold: 1.25, vignette: 0.38, grain: 0.022, wash: 1, exposure: 1 },
  Technical: { ao: 1, bloom: 0.15, bloomThreshold: 1.6, vignette: 0.1, grain: 0, wash: 0.25, exposure: 1.05 },
  'Night ops': { ao: 0.7, bloom: 0.7, bloomThreshold: 1.0, vignette: 0.5, grain: 0.03, wash: 1, exposure: 1.15 },
};
app.setSetting = (group, key, value) => {
  settings[group][key] = value;
  if (group === 'look') {
    if (key === 'quality') { ctx.post.setQuality(value); ctx.post.setSize(ctx.size.w, ctx.size.h); applyLook(); ui.toast(`${value} quality`); }
    else applyLook();
  }
  if (group === 'world') {
    if (key === 'hour') { settings.world.hourFollow = false; ui.syncControl('hourFollow', false); ctx.daylight.set(value); }
    if (key === 'hourFollow' && value) ctx.daylight.set(ctx.director.hourAt(ctx.director.t));
    if (key === 'simSpeed' || key === 'trafficRate') { /* read each frame */ }
    applyWorldSettings();
    if (key === 'reducedMotion') applyLook();
  }
  if (group === 'camera') {
    if (key === 'autoCam') setAutoCam(value);
    if (key === 'dof') ctx.post.setDof(value);
    if (key === 'dofRange') ctx.post.settings.dofRangeK = value;
  }
  saveSettings({ world: settings.world, camera: settings.camera, look: settings.look, lightGroups: settings.lightGroups, sound: settings.sound, narrate: settings.narrate });
};
app.setLightGroup = (i, on) => { settings.lightGroups[i] = on; ctx.world.lights.setGroup(i, on ? 1 : 0); app.setSetting('world', 'lights', settings.world.lights); };

function setAutoCam(on) {
  settings.camera.autoCam = on;
  if (on) {
    rig.resumeAuto();
    const pose = ctx.director.poseAt(ctx.director.t);
    if (pose) rig.goto(pose.pos, pose.target, pose.fov, 1400);
  } else rig.takeFree();
  ui?.syncControl('autoCam', on);
}
app.setAutoCam = setAutoCam;
rig.onModeChange = (m) => { settings.camera.autoCam = m === 'auto'; ui?.syncControl('autoCam', m === 'auto'); if (m === 'free') ui?.toast('You have the camera · F or “Film camera” hands it back'); };

/* ------------------------------------------------------------------ */
/* interaction                                                          */
/* ------------------------------------------------------------------ */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function pickGround(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const p = new THREE.Vector3();
  return raycaster.ray.intersectPlane(groundPlane, p) ? p : null;
}
function wire() {
  let press = null;
  canvas.addEventListener('pointerdown', (e) => {
    press = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button };
  }, { capture: true });
  window.addEventListener('pointermove', (e) => {
    if (!press) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6 && rig.mode === 'auto' && e.target === canvas) {
      // the user grabbed the view: hand over the camera on this press
      rig.takeFree();
      controls.enabled = true;
    }
  });
  window.addEventListener('pointerup', (e) => {
    if (!press) return;
    const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    const p = press;
    press = null;
    if (e.target !== canvas || moved > 6 || p.button !== 0) return;
    if (ctx.onCanvasClick) ctx.onCanvasClick(pickGround(e.clientX, e.clientY));
  });
  canvas.addEventListener('wheel', () => { if (rig.mode === 'auto' && !document.body.classList.contains('ui-hidden')) rig.takeFree(); }, { passive: true });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const d = ctx.director, k = e.key;
    if (k === ' ') { e.preventDefault(); d.toggle(); }
    else if (k === 'ArrowRight') d.next();
    else if (k === 'ArrowLeft') d.prev();
    else if (/^[1-8]$/.test(k)) d.go(parseInt(k, 10) - 1);
    else if (k.toLowerCase() === 'f') setAutoCam(rig.mode !== 'auto');
    else if (k.toLowerCase() === 'h') toggleUI();
    else if (k.toLowerCase() === 'c') ui.togglePanel();
    else if (k.toLowerCase() === 'x') { if (d.index !== 1) d.go(1); else { const X = XRAY; X.uXray.value = X.uXray.value > 0.5 ? 0 : 1; } }
    else if (k.toLowerCase() === 's') saveFrame();
    else if (k.toLowerCase() === 'l') copyLink();
    else if (k.toLowerCase() === 'm') toggleSound();
    else if (k.toLowerCase() === 'n') toggleNarration();
    else if (k === '?') ui.toggleHelp();
    else if (k === 'Escape') { ui.toggleHelp(false); }
  });
  // first gesture unlocks audio if the user had it on
  const unlock = () => { if (settings.sound) ctx.sound.enable(); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('pointerdown', unlock);
  ui.setButton('#btn-sound', settings.sound);
  ui.setButton('#btn-narrate', settings.narrate);
  ctx.narrator.enabled = settings.narrate;
}

function toggleUI() {
  const hidden = document.body.classList.toggle('ui-hidden');
  ui.setButton('#btn-eye', hidden);
  ui.toast(hidden ? 'Interface hidden · H brings it back' : 'Interface back');
}
app.toggleUI = toggleUI;
function toggleSound() {
  settings.sound = !settings.sound;
  if (settings.sound) ctx.sound.enable(); else ctx.sound.disable();
  ui.setButton('#btn-sound', settings.sound);
  ui.toast(settings.sound ? 'Sound on' : 'Sound off');
  app.setSetting('world', 'labels', settings.world.labels);
}
app.toggleSound = toggleSound;
function toggleNarration() {
  settings.narrate = !settings.narrate;
  ctx.narrator.enabled = settings.narrate;
  if (!settings.narrate) ctx.narrator.stop();
  ui.setButton('#btn-narrate', settings.narrate);
  ui.toast(settings.narrate ? 'Narration on' : 'Narration off');
  app.setSetting('world', 'labels', settings.world.labels);
}
app.toggleNarration = toggleNarration;
function saveFrame() {
  ctx.post.render(focusDistance(), performance.now() / 1000);
  const url = renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `gate-to-gate-${String(ctx.director.index + 1).padStart(2, '0')}-${Math.round(ctx.director.t)}s.png`;
  a.click();
  ui.toast('Frame saved');
}
app.saveFrame = saveFrame;
function copyLink() {
  const d = ctx.director;
  const url = writeHash({ ch: d.index + 1, t: d.t.toFixed(1), q: settings.look.quality, free: rig.mode === 'free' ? 1 : undefined, pause: d.playing ? undefined : 1 });
  navigator.clipboard?.writeText(url).then(() => ui.toast('Link copied'), () => ui.toast(url));
}
app.copyLink = copyLink;

/* vitals derived from the simulation */
let bpm = 60;
app.vitals = () => {
  const W = ctx.world, d = ctx.director;
  const live = W.traffic.flights.filter((f) => !f.done).length;
  const rate = ctx.sim.trafficRate ?? settings.world.trafficRate;
  const h = ctx.daylight.hour;
  const day = Math.max(0, Math.sin((Math.PI * (h - 5.5)) / 15));
  const lights = ctx.daylight.lightsLevel;
  const fuelFlow = d.chapter?.id === 'turnaround' ? 2400 : 900 + live * 180;
  return [
    { label: 'ACTIVITY PULSE', value: Math.round(bpm), unit: 'bpm', pct: (bpm - 40) / 80, cls: 'warm' },
    { label: 'MOVEMENTS', value: Math.round(rate * 60), unit: '/h', pct: rate / 6 },
    { label: 'AIRCRAFT MOVING', value: live, unit: '', pct: live / 24 },
    { label: 'BAGS SORTED', value: Math.round((540 + 160 * day) * (ctx.sim.flow || 1)), unit: '/min', pct: 0.5 + day * 0.4, cls: 'warm' },
    { label: 'FUEL FLOW', value: fuelFlow, unit: 'L/min', pct: fuelFlow / 4000, cls: 'warm' },
    { label: 'POWER DRAW', value: (12 + lights * 9 + live * 0.4).toFixed(1), unit: 'MW', pct: (12 + lights * 9) / 30 },
    { label: 'DATA', value: Math.round(420 + live * 30 + (d.chapter?.id === 'tower' ? 300 : 0)), unit: 'Gb/s', pct: 0.5 },
    { label: 'PASSENGERS IN TERMINAL', value: Math.round(2400 + 9000 * day), unit: '', pct: 0.25 + day * 0.7, cls: 'holo' },
    { label: 'AIR TAXIS', value: W.taxis.taxis.length, unit: 'in pattern', pct: W.taxis.taxis.length / 12, cls: 'holo' },
    { label: 'ON-TIME', value: d.chapter?.id === 'turnaround' ? '91' : '94', unit: '%', pct: 0.93 },
  ];
};

/* ------------------------------------------------------------------ */
/* loop                                                                 */
/* ------------------------------------------------------------------ */
const _focus = new THREE.Vector3();
function focusDistance() {
  const f = ctx.focusOverride || rig.target;
  return Math.max(0.5, camera.position.distanceTo(f));
}
let lastShadowFrame = 0, frameCount = 0, errored = false, statT = 0;
const shadowCenter = new THREE.Vector3();
function start() {
  let last = performance.now();
  const frame = (now) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    try {
      renderer.info.reset();
      TIME.uTime.value = (now / 1000) % 3600;
      updateTweens(now);
      const d = ctx.director;
      const camDtScale = settings.world.reducedMotion ? 0.6 : 1;
      d.update(dt * camDtScale);
      const dist = rig.apply();
      // time of day
      if (settings.world.hourFollow) { const h = d.hourAt(d.t); ctx.daylight.set(h); settings.world.hour = h; }
      ctx.daylight.update(dt);
      // sims
      const simK = settings.world.simSpeed;
      const dtSim = dt * ctx.sim.speed * simK;
      ctx.sim.time += dtSim;
      ctx.world.traffic.rate = ctx.sim.trafficRate ?? settings.world.trafficRate;
      ctx.world.traffic.update(dtSim, dt);
      ctx.world.underground.update(dt * simK * (ctx.sim.flow || 1));
      ctx.world.baggage.update(dt * simK);
      ctx.world.taxis.update(dt * simK);
      ctx.world.skyPaths.update(dt * simK * (ctx.world.skyPaths.dotSpeedK || 1));
      ctx.world.tower.radar.rotation.y += dt * 0.6;
      // hero fans idle
      // lights follow the night level
      ctx.world.lights.setLevel(ctx.daylight.lightsLevel * settings.world.lights);
      ctx.world.traffic.navU.uLevel.value = ctx.daylight.lightsLevel;
      // point-size scale for every Points shader (fov changes per shot)
      const bufH = renderer.domElement.height;
      ctx.world.lights.resize(bufH, camera.fov);
      ctx.world.traffic.resize(bufH, camera.fov);
      ctx.world.skyPaths.resize(bufH, camera.fov);
      // shadows: fitted to the focus, refreshed while anything moves
      const focus = ctx.focusOverride || rig.target;
      const radius = THREE.MathUtils.clamp(dist * 1.1, 14, 900);
      const refit = ctx.daylight.fitShadow(focus, radius);
      if (refit || d.playing || tweensActive() || rig.mode === 'free' || frameCount < 5) renderer.shadowMap.needsUpdate = true;
      frameCount++;
      // pulse
      const live = ctx.world.traffic.flights.filter((f) => !f.done).length;
      bpm += ((54 + live * 2.2 + (ctx.sim.speed > 10 ? 20 : 0)) - bpm) * Math.min(1, dt);
      ui.clock(ctx.daylight.hour, bpm);
      ctx.post.render(focusDistance(), now / 1000);
      ctx.labels.update(camera, ctx.size.w, ctx.size.h);
      // render stats (Look tab) once a second
      statT += dt;
      if (statT > 1) { statT = 0; const i = renderer.info; ui.renderStats(`<b>${i.render.calls}</b> draws per frame (all passes) · ${(i.render.triangles / 1000).toFixed(0)}k triangles · ${i.programs?.length ?? 0} programs · ${i.memory.textures} textures · ${renderer.getPixelRatio().toFixed(2)}× pixels`); }
    } catch (err) {
      if (!errored) console.error(err);
      errored = true;
    }
  };
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */
/* resize                                                               */
/* ------------------------------------------------------------------ */
function onResize() {
  const { w, h } = size();
  ctx.size = { w, h };
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  ctx.post?.setSize(w, h);
  const z = THREE.MathUtils.clamp(Math.min(w / 1500, h / 1000), 0.62, 1.15);
  document.documentElement.style.setProperty('--z', z.toFixed(3));
  if (ctx.labels) ctx.labels.zoom = z;
  rig.setPortrait(w / h);
}
new ResizeObserver(onResize).observe(host);
window.addEventListener('resize', onResize);
onResize();

init().catch((err) => {
  console.error(err);
  loaderStep.textContent = 'something broke while loading — see the console';
  loaderStep.style.color = '#ff7a59';
});
