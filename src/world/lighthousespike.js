// =============================================================================
// LIGHTHOUSE POINT, MILESTONE 0: THE SPIKE. A throw-away test area, like
// traversalyard.js: it is not in the registry (areas.js) and nothing in the game
// loads it; only tests and verify-lighthouse.html do. It proves the risky parts
// of docs/superpowers/plans/2026-11-22-lighthouse.md before any art:
//   * a tower stair of three `stair` rail flights round a stub tower, two stone
//     landings, a top ledge on the gallery;
//   * a plateau left open round a sea cave, whose roof is a ground ceiling;
//   * a rock pool that is wadeable (a small circle with a shallow band).
// Metres, x east, z south. Numbers follow the design: plateau y 6, gallery 13.5,
// tower centre (-22, -20), shaft collider 3.6, stair radius 5.2. Pure data, no THREE.
// =============================================================================

import { createGround } from '../ground.js';
import { createTraversal } from '../traversal.js';

export const SPIKE_BOUNDS = Object.freeze({ minX: -46, maxX: 38, minZ: -44, maxZ: 44 });
export const SPIKE_SPAWN = Object.freeze({ x: -14, z: -8 }); // on the plateau, facing the tower
export const PLATEAU_Y = 6;
export const GALLERY_Y = 13.5;
export const TOWER = Object.freeze({ x: -22, z: -20, collider: 3.6, gallery: 4.6 });
export const CAVE = Object.freeze({ minX: -16, maxX: -6, minZ: -22, maxZ: -16, roof: 2.6 });
export const POOL = Object.freeze({ id: 'pool-1', kind: 'circle', x: 14, z: 22, r: 2.4, shallow: 2.6 });

const rect = (x0, x1, z0, z1, y) => ({ x0, z0: (z0 + z1) / 2, x1, z1: (z0 + z1) / 2, width: z1 - z0, y0: y });
const r3 = (n) => Math.round(n * 1000) / 1000;

// The stair: radius 5.2 round the tower, three flights of 112 degrees (336 in
// all), so the top ledge stands 21 degrees short of the foot's bearing: a full turn would put the
// top ledge (ground 13.5) over the first flight, and ground holds one height per spot. Each flight is flat across its
// two landings (LEDGE_FLAT m, the ledge disc is a little smaller) and climbs
// in STEPS chords between them: about 8.2 m at a grade of 1 in 3.3.
export const STAIR = Object.freeze({ r: 5.2, a0: 45, turn: 112, steps: 6, ledge: 0.95, flat: 1.0, ys: Object.freeze([PLATEAU_Y, 8.5, 11, GALLERY_Y]) });

const at = (deg, y) => {
  const a = (deg * Math.PI) / 180;
  return { x: r3(TOWER.x + STAIR.r * Math.cos(a)), z: r3(TOWER.z + STAIR.r * Math.sin(a)), y };
};

// The landings: [0] the foot (on the plateau), [1] [2] two ledges, [3] the top ledge.
export const LANDINGS = Object.freeze(STAIR.ys.map((y, i) => Object.freeze(at(STAIR.a0 + STAIR.turn * i, y))));

function flight(i) {
  const { turn, steps, flat, r, ys } = STAIR;
  const fa = (flat / r) * (180 / Math.PI);
  const d0 = STAIR.a0 + turn * i;
  const pts = [at(d0, ys[i]), at(d0 + fa, ys[i])];
  for (let k = 1; k < steps; k++) {
    pts.push(at(d0 + fa + ((turn - 2 * fa) * k) / steps, r3(ys[i] + ((ys[i + 1] - ys[i]) * k) / steps)));
  }
  pts.push(at(d0 + turn - fa, ys[i + 1]), at(d0 + turn, ys[i + 1]));
  return { id: `stair-${i + 1}`, kind: 'stair', width: 1.0, points: pts };
}

const ledge = (p, r) => ({ x: p.x, z: p.z, r, y: p.y });

export const SPIKE_GROUND = Object.freeze({
  base: 0,
  // the plateau, with the cave's footprint left out so its floor stays at 0
  strips: [
    rect(-46, -6, -44, CAVE.minZ, PLATEAU_Y),
    rect(-46, CAVE.minX, CAVE.minZ, CAVE.maxZ, PLATEAU_Y),
    rect(-46, -6, CAVE.maxZ, 4, PLATEAU_Y),
  ],
  discs: [
    { x: TOWER.x, z: TOWER.z, r: TOWER.gallery, y: GALLERY_Y },
    ledge(LANDINGS[1], STAIR.ledge),
    ledge(LANDINGS[2], STAIR.ledge),
    ledge(LANDINGS[3], STAIR.ledge),
  ],
  // the cave's roof, 0.001 inside its footprint (the Gorge's way)
  ceilings: [{ x0: CAVE.minX + 0.001, z0: (CAVE.minZ + CAVE.maxZ) / 2, x1: CAVE.maxX - 0.001, z1: (CAVE.minZ + CAVE.maxZ) / 2, width: CAVE.maxZ - CAVE.minZ - 0.002, y: CAVE.roof }],
});

export const SPIKE_COLLIDERS = Object.freeze([Object.freeze({ x: TOWER.x, z: TOWER.z, r: TOWER.collider })]);
export const SPIKE_WATERS = Object.freeze([POOL]);

const S = (x, z) => ({ x, z });
// A quick way down: off the first landing, outwards, onto the plateau (2.5 m).
const out = (p, d) => {
  const a = Math.atan2(p.z - TOWER.z, p.x - TOWER.x);
  return S(r3(TOWER.x + (STAIR.r + d) * Math.cos(a)), r3(TOWER.z + (STAIR.r + d) * Math.sin(a)));
};

export const SPIKE_TRAVERSAL = Object.freeze({
  crossings: [flight(0), flight(1), flight(2)],
  gaps: [],
  climbs: [],
  drops: [{ id: 'drop-landing-1', from: out(LANDINGS[1], 0.5), to: out(LANDINGS[1], 1.9) }],
});

export function spikeArea() {
  const ground = createGround(SPIKE_GROUND);
  return {
    name: 'lighthouse-spike',
    bounds: SPIKE_BOUNDS,
    spawn: SPIKE_SPAWN,
    colliders: SPIKE_COLLIDERS,
    waters: SPIKE_WATERS,
    perches: [],
    ground,
    traversal: createTraversal(SPIKE_TRAVERSAL, ground),
  };
}
