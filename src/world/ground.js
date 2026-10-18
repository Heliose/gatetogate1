import * as THREE from 'three';
import { groundPlane, mergeByMaterial } from '../core/geo.js';
import { WORLD, RUNWAY, TAXIWAY, APRON_LANE, CONNECTORS, LANE_LINKS, APRON, LANDSIDE_ROAD, HANGAR } from './layout.js';

/* Terrain, runway, taxiways and the apron. All receive shadows; all are x-ray-able. */
export function buildGround(M) {
  const g = new THREE.Group();
  g.name = 'ground';

  const terrain = new THREE.Mesh(groundPlane(WORLD.size, WORLD.size), M.grass);
  terrain.receiveShadow = true;
  terrain.userData.ground = true;
  g.add(terrain);

  // runway
  const L = RUNWAY.x1 - RUNWAY.x0;
  const rw = new THREE.Mesh(groundPlane(L, RUNWAY.w), M.runway);
  rw.position.set((RUNWAY.x0 + RUNWAY.x1) / 2, RUNWAY.y, RUNWAY.z);
  rw.receiveShadow = true;
  rw.userData.ground = true;
  g.add(rw);
  // runway shoulders (slightly lighter asphalt)
  for (const s of [-1, 1]) {
    const sh = new THREE.Mesh(groundPlane(L + 60, 7.5), M.concrete);
    sh.position.set((RUNWAY.x0 + RUNWAY.x1) / 2, RUNWAY.y - 0.03, RUNWAY.z + s * (RUNWAY.w / 2 + 3.75));
    sh.receiveShadow = true;
    g.add(sh);
  }

  // the earth below: what you see through the glass in the x-ray chapter
  const earth = new THREE.Mesh(groundPlane(WORLD.size, WORLD.size), M.earth);
  earth.position.y = -28;
  earth.receiveShadow = false;
  g.add(earth);

  // taxiways: planes with u along the length (taxiway tile = 23 m), merged into one mesh per material
  const taxiGroup = new THREE.Group();
  const taxi = (x0, z0, x1, z1, w = TAXIWAY.w, y = TAXIWAY.y) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const geo = groundPlane(len, w);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len / 23), uv.getY(i));
    const m = new THREE.Mesh(geo, M.taxiway);
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    m.receiveShadow = true;
    m.castShadow = false;
    m.userData.ground = true;
    taxiGroup.add(m);
    return m;
  };
  taxi(TAXIWAY.x0, TAXIWAY.z, TAXIWAY.x1, TAXIWAY.z);
  taxi(APRON_LANE.x0, APRON_LANE.z, APRON_LANE.x1, APRON_LANE.z);
  for (const x of CONNECTORS) taxi(x, TAXIWAY.z - 8, x, RUNWAY.z + 16, 23, TAXIWAY.y + 0.01);
  for (const x of LANE_LINKS) taxi(x, APRON_LANE.z + 8, x, TAXIWAY.z - 8, 23, TAXIWAY.y + 0.01);
  // hangar taxi link
  taxi(-470, APRON_LANE.z, HANGAR.x, HANGAR.z + HANGAR.d / 2 + 30, 23, TAXIWAY.y + 0.01);
  taxi(HANGAR.x, HANGAR.z + HANGAR.d / 2 + 30, HANGAR.x, HANGAR.z + 10, 23, TAXIWAY.y + 0.02);
  // fillets at the connector junctions (small squares)
  for (const x of [...CONNECTORS, ...LANE_LINKS]) {
    const f = new THREE.Mesh(groundPlane(40, 40), M.concrete);
    const z = CONNECTORS.includes(x) ? TAXIWAY.z : APRON_LANE.z;
    f.position.set(x, TAXIWAY.y - 0.015, z);
    f.receiveShadow = true;
    f.castShadow = false;
    taxiGroup.add(f);
  }
  mergeByMaterial(taxiGroup);
  g.add(taxiGroup);

  // apron
  const ap = new THREE.Mesh(groundPlane(APRON.x1 - APRON.x0, APRON.z1 - APRON.z0), M.apron);
  ap.position.set((APRON.x0 + APRON.x1) / 2, APRON.y, (APRON.z0 + APRON.z1) / 2);
  ap.receiveShadow = true;
  ap.userData.ground = true;
  ap.name = 'apron';
  g.add(ap);
  // hangar apron
  const hap = new THREE.Mesh(groundPlane(HANGAR.w + 60, 70), M.concrete);
  hap.position.set(HANGAR.x, APRON.y, HANGAR.z + HANGAR.d / 2 + 35);
  hap.receiveShadow = true;
  g.add(hap);

  // landside road
  const road = new THREE.Mesh(groundPlane(1900, LANDSIDE_ROAD.w), M.runway);
  road.position.set(0, 0.04, LANDSIDE_ROAD.z);
  const ruv = road.geometry.attributes.uv;
  for (let i = 0; i < ruv.count; i++) ruv.setXY(i, ruv.getX(i) * 0.1 + 0.3, ruv.getY(i) * 0.3 + 0.35);
  road.receiveShadow = true;
  g.add(road);

  return { group: g, terrain, apron: ap, runway: rw };
}
