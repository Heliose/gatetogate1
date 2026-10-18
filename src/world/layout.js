/* ------------------------------------------------------------------ *
 * World layout. Metres. +X = east, +Z = south (toward the city),
 * -Z = north (toward the runway). Aircraft nose faces +Z when parked.
 * ------------------------------------------------------------------ */

export const WORLD = { size: 3200, groundY: 0 };

export const RUNWAY = { x0: -720, x1: 720, z: -330, w: 45, y: 0.1, name: ['09', '27'] };
export const TAXIWAY = { z: -215, x0: -720, x1: 720, w: 23, y: 0.08 };            // Alpha
export const APRON_LANE = { z: -150, x0: -440, x1: 440, w: 23, y: 0.08 };         // Bravo
export const CONNECTORS = [-680, -340, 0, 340, 680];                               // runway ↔ Alpha
export const LANE_LINKS = [-430, 430];                                             // Alpha ↔ Bravo
export const APRON = { x0: -420, x1: 420, z0: -140, z1: 20, y: 0.05 };
export const SERVICE_ROAD = { z0: 4, z1: 16 };

export const GATE_COUNT = 8;
export const GATE_SPACING = 90;
export const STAND_Z = -32;             // fuselage centre of a parked aircraft
export const gateX = (i) => -315 + i * GATE_SPACING;
export const HERO_GATE = 5;             // x = 135
export const PARKED_GATES = [0, 2, 7];  // static decor aircraft
export const TRAFFIC_GATES = [1, 3, 4, 6];
export const gateName = (i) => `G${i + 1}`;

export const TERMINAL = { x0: -400, x1: 400, z0: 20, z1: 150, floorH: 7.5, floors: 3, roofY: 24, pierH: 12 };
export const CHECKIN = { x0: -140, x1: 140, z0: 100, z1: 142, y: 0 };
export const BASEMENT = { x0: -230, x1: 230, z0: 24, z1: 146, floorY: -9, ceilY: -2.4 };
export const LANDSIDE_ROAD = { z: 172, w: 14 };

export const TOWER = { x: 470, z: 105, h: 78, cabH: 7, cabR: 7.5 };
export const HANGAR = { x: -560, z: -45, w: 120, d: 90, h: 32, doorZ: 0 }; // open toward +z (apron side)
export const FUEL_FARM = { x: 640, z: -70, tanks: [[-26, -18], [0, -18], [26, -18], [-13, 14], [13, 14]], r: 11, h: 15 };
export const SUBSTATION = { x: 445, z: 165 };
export const DATA_CENTRE = { x: -445, z: 165 };
export const STAGING = { x0: 400, x1: 460, z0: -130, z1: -40 };            // GSE equipment area
export const VERTIPORT = { y: 24.62, pads: [[-34, 70], [34, 70], [-34, 112], [34, 112]], r: 8 };
export const CITY = { z0: 1050, z1: 1500, x0: -1100, x1: 1100 };

/* Underground networks: each route is a polyline (x, y, z). u along each tube = metres. */
export const UNDERGROUND = {
  baggage: {
    color: '#ffb347', y: -7, radius: 2.1, speed: 9, spacing: 22, name: 'Baggage pods', unit: 'bags/min',
    routes: [
      // trunk under the stand line, both directions
      [[-335, -7, -6], [335, -7, -6]],
      // from the basement east and west mouths to the trunk
      [[200, -7, 60], [250, -7, 50], [300, -7, 20], [320, -7, -6]],
      [[-200, -7, 60], [-250, -7, 50], [-300, -7, 20], [-320, -7, -6]],
      // branches to each stand (riser to a lift at the stand)
      ...Array.from({ length: GATE_COUNT }, (_, i) => [[gateX(i) - 22, -7, -6], [gateX(i) - 22, -7, -18], [gateX(i) - 22, -2.5, -22], [gateX(i) - 22, -0.6, -23]]),
    ],
  },
  fuel: {
    color: '#ff7a3d', y: -3.2, radius: 1.1, speed: 6, spacing: 14, name: 'Fuel hydrant ring', unit: 'L/min',
    routes: [
      // ring main around the apron
      [[-380, -3.2, -12], [380, -3.2, -12], [380, -3.2, -126], [-380, -3.2, -126], [-380, -3.2, -12]],
      // from the farm
      [[640, -3.2, -40], [640, -3.2, -60], [520, -3.2, -70], [380, -3.2, -70]],
      // hydrant risers at each stand
      ...Array.from({ length: GATE_COUNT }, (_, i) => [[gateX(i) + 12, -3.2, -12], [gateX(i) + 12, -3.2, -44], [gateX(i) + 12, -0.3, -46]]),
    ],
  },
  power: {
    color: '#ffe066', y: -2, radius: 0.8, speed: 18, spacing: 9, name: 'Power grid', unit: 'MW',
    routes: [
      [[445, -2, 165], [445, -2, 60], [430, -2, 26], [-430, -2, 26]],
      [[430, -2, 26], [430, -2, -200], [-700, -2, -200]], // airfield lighting feeder
      [[-430, -2, 26], [-560, -2, 26], [-560, -2, -10]],  // hangar
      ...Array.from({ length: GATE_COUNT }, (_, i) => [[gateX(i) + 30, -2, 26], [gateX(i) + 30, -2, 10], [gateX(i) + 30, -0.4, 8]]),
    ],
  },
  data: {
    color: '#5ee7ff', y: -1.4, radius: 0.6, speed: 40, spacing: 7, name: 'Data fibre', unit: 'Gb/s',
    routes: [
      [[-445, -1.4, 165], [-445, -1.4, 60], [-410, -1.4, 32], [410, -1.4, 32], [470, -1.4, 60], [470, -1.4, 100]],
      [[0, -1.4, 32], [0, -1.4, -195], [-700, -1.4, -195]],
      [[0, -1.4, -195], [700, -1.4, -195]],
      ...Array.from({ length: GATE_COUNT }, (_, i) => [[gateX(i) + 36, -1.4, 32], [gateX(i) + 36, -1.4, 12], [gateX(i) + 36, -0.3, 10]]),
    ],
  },
  water: {
    color: '#6fa8ff', y: -4.4, radius: 0.9, speed: 3, spacing: 16, name: 'Water & drainage', unit: 'm³/h',
    routes: [
      [[-430, -4.4, -134], [430, -4.4, -134]],
      [[-420, -4.4, 60], [420, -4.4, 60]],
      ...Array.from({ length: 5 }, (_, i) => [[-320 + i * 160, -4.4, 60], [-320 + i * 160, -4.4, -134]]),
    ],
  },
  apm: {
    color: '#b48cff', y: -14, radius: 3.6, speed: 14, spacing: 90, name: 'People mover', unit: 'pax/h',
    routes: [[[-800, -14, 150], [-380, -14, 150], [380, -14, 150], [800, -14, 150]]],
  },
};

/* GSE service positions around a parked aircraft (relative to the stand centre, nose toward +z) */
export const SERVICE_SPOTS = {
  bridge: { x: -3.6, z: 10, name: 'Jet bridge' },
  gpu: { x: 5, z: 12, ry: -Math.PI / 2, name: 'Ground power' },
  fuel: { x: -9.5, z: -2.5, ry: 0, name: 'Fuel hydrant dispenser' },
  cateringFwd: { x: 6.2, z: 8.5, ry: Math.PI / 2, name: 'Catering (fwd)' },
  cateringAft: { x: 6.2, z: -9, ry: Math.PI / 2, name: 'Catering (aft)' },
  bagsFwd: { x: -6.5, z: 6, ry: -Math.PI / 2, name: 'Baggage (fwd hold)' },
  bagsAft: { x: -6.5, z: -10, ry: -Math.PI / 2, name: 'Baggage (aft hold)' },
  beltFwd: { x: -3.8, z: 7.5, ry: -Math.PI / 2 - 0.5, name: 'Belt loader (fwd)' },
  beltAft: { x: -3.8, z: -8, ry: -Math.PI / 2 + 0.5, name: 'Belt loader (aft)' },
  cleaning: { x: 9, z: 16, ry: Math.PI, name: 'Cabin cleaning' },
  water: { x: 7.5, z: -15, ry: Math.PI / 2, name: 'Potable water' },
  lav: { x: 4.5, z: -21, ry: 0, name: 'Lavatory service' },
  pushback: { x: 0, z: 22.5, ry: Math.PI, name: 'Pushback tug' },
  stairs: { x: -6.5, z: -12, ry: -Math.PI / 2, name: 'Stairs (aft)' },
};

/* Baggage route of the hero bag (world coordinates). Speeds m/s. */
export const BAG_ROUTE = {
  points: [
    [-60, 0.85, 128], [-60, 0.85, 120], [-60, 0.85, 114],            // check-in belt
    [-60, 0.4, 110], [-60, -2.0, 104], [-60, -5.2, 98], [-60, -6.3, 94], // chute down
    [-60, -6.3, 86], [-60, -6.3, 78],                                // CT scanner at z≈82
    [-60, -6.3, 70], [-52, -6.3, 62], [-40, -6.3, 58], [-20, -6.3, 58], [0, -6.3, 62], [14, -6.3, 72],  // sorter maze
    [26, -6.3, 86], [40, -6.3, 92], [56, -6.3, 86], [66, -6.3, 72], [72, -6.3, 56], [84, -6.3, 44],
    [100, -6.3, 36], [120, -6.3, 36],                                // makeup: onto the cart at x≈112
    [150, -5.4, 36], [182, -2.6, 36], [206, -0.3, 36],               // ramp up to the apron
    [220, 0.3, 30], [224, 0.3, 14], [200, 0.3, 2], [164, 0.3, -6], [146, 0.3, -14], // drive to the stand
    [133, 0.3, -20], [131, 0.8, -24.5], [131.3, 1.5, -26.5], [131.6, 2.2, -27.4], // belt loader up to the fwd hold
    [132.8, 2.3, -27.6], [134.2, 2.3, -27.8],                        // into the hold
  ],
  speeds: [1.0, 1.0, 1.0, 1.2, 3.0, 3.0, 1.2, 1.0, 1.0, 2.2, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.4, 2.0, 1.2, 3.5, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 4.0, 1.2, 0.8, 0.8, 0.8, 0.6, 0.6],
  ctZ: 82,                 // bag is inside the CT scanner around this z
  cartFrom: 23, cartTo: 30, // waypoint indices where the bag rides the cart
};

/* Flight paths. Departures roll east on 09 and climb out; arrivals come in from the west. */
export function departurePoints(gx) {
  return [
    [gx, 0, STAND_Z], [gx, 0, -70], [gx - 10, 0, -105], [gx - 34, 0, -150],
    [-400, 0, -150], [-430, 0, -175], [-430, 0, -215], [-650, 0, -215], [-680, 0, -255], [-680, 0, -330],
    [-640, 0, -330], [-100, 0, -330], [180, 0.5, -330], [420, 18, -330], [900, 150, -330], [1500, 420, -300], [2200, 720, -120], [3000, 980, 260],
  ];
}
export const DEPARTURE_SPEEDS = [0.6, 2.5, 4, 8, 9, 7, 7, 9, 6, 4, 30, 72, 82, 86, 95, 120, 150, 170];

export function arrivalPoints(gx) {
  return [
    [-3000, 640, -330], [-1700, 330, -330], [-1000, 120, -330], [-760, 20, -330], [-600, 0.5, -330],
    [-200, 0, -330], [300, 0, -330], [340, 0, -300], [340, 0, -240], [360, 0, -215], [430, 0, -215], [430, 0, -180],
    [400, 0, -150], [gx + 34, 0, -150], [gx + 10, 0, -105], [gx, 0, -70], [gx, 0, STAND_Z],
  ];
}
export const ARRIVAL_SPEEDS = [160, 130, 85, 72, 68, 55, 18, 9, 9, 8, 8, 7, 8, 9, 6, 3, 0.6];

/* Air taxi corridors: from the city edge to the vertiport */
export const UAM_ENTRIES = [[-700, 180, 820], [-200, 170, 900], [350, 180, 880], [800, 170, 760], [-900, 160, 300], [900, 160, 350]];

export const CALLSIGNS = ['NOVA', 'LUMEN', 'AERO', 'SKYWAY', 'ORBIT', 'ZEPHYR', 'MERIDIAN', 'VECTOR'];
export const AIRLINES = [
  { id: 'nova', name: 'NOVA', base: '#f4f6f8', belly: '#9aa6b2', cheat: '#1f6fe0', fin: '#1f6fe0', accent: '#ffb347' },
  { id: 'lumen', name: 'LUMEN', base: '#f7f3ea', belly: '#8e8a84', cheat: '#e0552b', fin: '#e0552b', accent: '#ffe066' },
  { id: 'aero', name: 'AERO', base: '#eef3f5', belly: '#6d7f8c', cheat: '#17a589', fin: '#0f3d4a', accent: '#5ee7ff' },
  { id: 'skyway', name: 'SKYWAY', base: '#f2f2f5', belly: '#8b8fa3', cheat: '#8a4bd6', fin: '#4b2a8a', accent: '#ff7ab6' },
];
