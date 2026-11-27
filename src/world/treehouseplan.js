// =============================================================================
// THE TREEHOUSE VILLAGE: THE PLAN (milestone T1, the tree world). Every coordinate of the roots, the great oak, the decks, the branch walk, the crown, the colliders,
// the perches and the forest rim: pure data and pure functions (no THREE, no clock, no Math.random; the scatters use seeded streams). treehouseparts.js and
// treehouselight.js draw from these; the tests read them. North is -z, east is +x, heights are metres over the ground (which is flat: levels are PERCHES, the engine
// has no multi-storey ground). docs/superpowers/plans/2026-11-27-new-areas-snowville-treehouse-jungle.md section 2, as the 2026-11-27 decisions change it: no gate,
// an ordinary map place after the Farm, entered by the Farm's north signpost. Numbers marked "start" are tuned from pictures.
//
// THE CLIMB (the no-skills rule, src/climbing.js BASE_CLIMB_BUDGET: a hop gains at most 1.6 and reaches 2.6 to a perch above y 1): every hop here gains at most
// HOP_MAX (1.4) and reaches at most HOP_SPAN (2.4) across, so an ordinary cat reaches every deck, and "down" is always a hop to the deck below. reachReport() proves it.
// =============================================================================

import { BASE_CLIMB_BUDGET, canReach } from '../climbing.js';
import { mulberry32 } from '../rng.js';
import { ZOOM_STEPS } from '../camzoom.js';

export const TREEHOUSE_NAME = 'Treehouse Village';
export const TREEHOUSE_BOUNDS = Object.freeze({ minX: -32, maxX: 32, minZ: -32, maxZ: 32 });
export const TREEHOUSE_SPAWN = Object.freeze({ x: 0, z: 25 }); // 4.5 m from the Farm signpost (z 29.5), which lands her at (0, 25.9) facing north
export const CAT_R = 0.35; // src/player.js CAT_RADIUS (copied: this file imports no player code)

export const HOP_MAX = 1.4; // metres gained in one hop, planned (the baseline allows 1.6)
export const HOP_SPAN = 2.4; // metres across in one hop, planned (the baseline allows 2.6 to a perch above y 1)
export const LEVELS = Object.freeze([0, 1.4, 2.8, 4.2, 5.6]); // the ground, the low deck, the middle canopy, the far platform and the crown

// ---- the great oak -----------------------------------------------------------------------------------------------------
export const OAK = Object.freeze({ x: 0, z: -6, r: 3.0, h: 15 }); // trunk at its foot (the collider), and how tall it stands before the leaves
// Everything the camera must stay clear of above: the leaves start here (the camera at zoom step 2 stands at most 5.6 + 3.8 = 9.4 m up, step 3 would reach 12.1).
export const CANOPY_MIN_Y = 11;
export const CANOPY_MAX_Y = 17;

// ---- the decks (axis-aligned slabs: centre, size, top height) ----------------------------------------------------------
const D = (id, name, x, z, w, d, y, hut = null) => Object.freeze({ id, name, x, z, w, d, y, hut });
export const DECKS = Object.freeze([
  D('bakery', 'the Bakery deck', -9, 9, 7, 5, 1.4, Object.freeze({ x: -9.6, z: 7.5, r: 2.0, h: 2.4, roof: 'thatch' })),
  D('books', 'the Bookshop deck', 9, 1, 6, 5, 2.8, Object.freeze({ x: 10.4, z: 0.4, r: 1.8, h: 2.3, roof: 'shingle' })),
  D('far', 'the far platform', 7, -5.7, 4, 5, 4.2, null),
  D('crown', 'the Crown deck', 0, -16, 8, 6, 5.6, Object.freeze({ x: 0, z: -17.7, r: 1.7, h: 4.6, roof: 'bell' })),
]);
export const deckOf = (id) => DECKS.find((k) => k.id === id) ?? null;
export const DECK_THICK = 0.22;
export const RAIL_H = 0.9; // the railing round every deck and the bridge

// ---- the perches: one point per hop, every hop within HOP_MAX up and HOP_SPAN across ------------------------------------
// kind 'roof' (smooth, no claw lift). The branch walk (the rope bridge) is a line of level perches along the planks, 2.3 m or less apart.
const P = (id, x, z, y, extra = {}) => Object.freeze({ id, x, z, y, kind: 'roof', ...extra });
const BRIDGE_A = Object.freeze([ // the branch walk, from the stair landing to the Bookshop deck (level 2.8)
  P('w1', -4.4, 8.0, 2.8), P('w2', -2.4, 6.8, 2.8), P('w3', -0.2, 6.0, 2.8), P('w4', 1.475, 4.75, 2.8), P('w5', 3.15, 3.5, 2.8), P('w6', 4.825, 2.25, 2.8), P('w7', 6.5, 1.0, 2.8),
]);
const BRIDGE_B = Object.freeze([ // the rope bridge, from the far platform towards the crown (level 4.2)
  P('r1', 5.0, -7.6, 4.2), P('r2', 3.8, -9.6, 4.2), P('r3', 2.6, -11.5, 4.2),
]);
export const TREEHOUSE_PERCHES = Object.freeze([
  P('a1', -8.2, 10.4, 1.4), P('a2', -6.4, 9.2, 1.4), // the Bakery deck
  ...BRIDGE_A,
  P('b1', 7.6, 1.2, 2.8), P('b2', 7.2, -1.1, 2.8), // the Bookshop deck
  P('f1', 7.0, -3.4, 4.2), P('f2', 6.2, -5.6, 4.2), // the far platform
  ...BRIDGE_B,
  P('k1', 1.4, -13.2, 5.6), P('k2', -0.6, -14.0, 5.6), P('k3', -2.6, -14.6, 5.6), // the Crown deck
]);
export const BRIDGE_LINES = Object.freeze([BRIDGE_A, BRIDGE_B].map((l) => Object.freeze(l.map((p) => Object.freeze({ x: p.x, z: p.z, y: p.y })))));

// The places the later milestones will use, by name (T2 to T5: the post box and Nutmeg at the roots, the three houses, the lookout, the bridge's middle).
export const ANCHORS = Object.freeze({
  spawn: TREEHOUSE_SPAWN,
  postBox: Object.freeze({ x: 4, z: 23, y: 0 }),
  bakery: Object.freeze({ x: -8.2, z: 10.4, y: 1.4 }),
  bookshop: Object.freeze({ x: 7.6, z: 1.2, y: 2.8 }),
  bell: Object.freeze({ x: -0.6, z: -14.0, y: 5.6 }),
  lookout: Object.freeze({ x: -2.6, z: -14.6, y: 5.6 }),
  bridge: Object.freeze({ x: 1.475, z: 4.75, y: 2.8 }),
});

// ---- the colliders (circles, ground level only: a perched cat is never pushed) ---------------------------------------
const corners = (k) => [[k.x - k.w / 2, k.z - k.d / 2], [k.x + k.w / 2, k.z - k.d / 2], [k.x - k.w / 2, k.z + k.d / 2], [k.x + k.w / 2, k.z + k.d / 2]];
// A few trees that stand in the village itself (each a trunk to walk round): [x, z, r].
export const FRIEND_TREES = Object.freeze([[-22, 18, 0.6], [22, 16, 0.6], [-24, -6, 0.7], [-16, -22, 0.6], [20, -22, 0.7], [26, 4, 0.6], [-12, 24, 0.5], [14, 26, 0.5]].map((t) => Object.freeze(t)));
export const treehouseColliders = () => [
  Object.freeze({ x: OAK.x, z: OAK.z, r: OAK.r }),
  ...DECKS.flatMap((k) => corners(k).map(([x, z]) => Object.freeze({ x, z, r: 0.22 }))), // each deck's four stilts
  ...FRIEND_TREES.map(([x, z, r]) => Object.freeze({ x, z, r })),
];

// Places a wanderer or a buried treat may be: open ground, each at least 1.5 m clear of every collider (a hop from a deck, the roots, the brook-side).
export const TREEHOUSE_POIS = Object.freeze(
  [[0, 22], [-8, 15], [8, 14], [-17, 8], [-16, 0], [-14, -14], [-3, 1], [14, 6], [18, -8], [-8, -26], [10, -22], [24, -14], [-26, 26], [26, 24]]
    .filter(([x, z]) => treehouseColliders().every((c) => Math.hypot(x - c.x, z - c.z) > c.r + 1.5))
    .map(([x, z]) => Object.freeze({ x, z })),
);
export const TREEHOUSE_SCENICS = Object.freeze([
  Object.freeze({ id: 'treehouse-bakery', x: -8.2, z: 10.4, y: 1.4, label: 'the Bakery deck' }),
  Object.freeze({ id: 'treehouse-bridge', x: 1.475, z: 4.75, y: 2.8, label: 'the branch walk' }),
  Object.freeze({ id: 'treehouse-crown', x: -0.6, z: -14.0, y: 5.6, label: 'the Crown deck' }),
]);

// ---- the look ---------------------------------------------------------------------------------------------------------
// Sky and leaf light: a clear blue over a green-gold haze, warm sun, a green fill. The haze's colour is the fog's, so the two agree.
export const TREE_LOOK = Object.freeze({
  top: 0x8fc6e8, horizon: 0xe3eec0, fog: 0xdce8b8, fogNear: 30, fogFar: 125,
  floor: 0x5f8a45, floorLeaf: 0x8a7a3a, trunk: 0x7a5a3c, trunkDark: 0x5a4028, plank: 0xb98a5a, plankDark: 0x8a6240, rope: 0xc9a86a,
  leaf: 0x4f9a48, leafLight: 0x7cbc54, leafDark: 0x3a7a3c, thatch: 0xd8b25a, shingle: 0x9a5a3a, bell: 0xd9b44a, wall: 0xf0dfb8, glow: 0xffd78a,
});
export const LIGHT_AT = Object.freeze({ x: 0, y: 3.2, z: 24 }); // the one PointLight's first place (it moves with the lit house later), made at intensity 0

// ---- the forest rim: trees outside the walk's edge, and the leaf canopy overhead (seeded streams) ----------------------------
export function scatterRim() {
  const rng = mulberry32(0x74726565);
  const out = [];
  const B = TREEHOUSE_BOUNDS;
  const side = (n, f) => { for (let i = 0; i < n; i++) { const t = (i + 0.15 + rng() * 0.7) / n; out.push({ ...f(t), s: 1.3 + rng() * 1.1, yaw: rng() * 6.28, kind: rng() < 0.35 ? 1 : 0 }); } };
  const off = () => 3.5 + rng() * 4;
  side(10, (t) => ({ x: B.minX + t * (B.maxX - B.minX), z: B.minZ - off() }));
  side(10, (t) => ({ x: B.minX + t * (B.maxX - B.minX), z: B.maxZ + off() }));
  side(10, (t) => ({ x: B.minX - off(), z: B.minZ + t * (B.maxZ - B.minZ) }));
  side(10, (t) => ({ x: B.maxX + off(), z: B.minZ + t * (B.maxZ - B.minZ) }));
  return out.filter((k) => Math.hypot(k.x - 0, k.z - 33) > 5); // the south signpost's gap stays open
}
// Leaf clumps of the canopy: { x, y, z, s }. Every one is at or above CANOPY_MIN_Y over its lowest point, so the camera at zoom step 2 never clips one.
export const CANOPY_COUNT = 34;
export function scatterCanopy() {
  const rng = mulberry32(0x6c656166);
  const out = [];
  for (let i = 0; i < CANOPY_COUNT; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 30;
    const s = 3 + rng() * 2.6;
    out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r - 4, y: CANOPY_MIN_Y + s * 0.8 + rng() * (CANOPY_MAX_Y - CANOPY_MIN_Y - 3), s, hue: rng() });
  }
  out.push({ x: OAK.x, z: OAK.z, y: OAK.h + 1.5, s: 7.5, hue: 0.4 }, { x: OAK.x + 5, z: OAK.z - 2, y: OAK.h, s: 5.5, hue: 0.7 }, { x: OAK.x - 5, z: OAK.z + 1, y: OAK.h - 0.6, s: 5.5, hue: 0.2 });
  return out;
}
// Scattered leaf litter on the floor: { x, z, s, hue }.
export function scatterLitter() {
  const rng = mulberry32(0x6c697474);
  const out = [];
  for (let i = 0; i < 70; i++) out.push({ x: (rng() - 0.5) * 62, z: (rng() - 0.5) * 62, s: 0.5 + rng() * 1.1, hue: rng() });
  return out;
}
// Where the ferns and bushes stand (no colliders: a cat walks through them): { x, z, s }.
export function scatterFerns() {
  const rng = mulberry32(0x6665726e);
  const cs = treehouseColliders();
  const out = [];
  let tries = 0;
  while (out.length < 46 && tries++ < 600) {
    const x = (rng() - 0.5) * 60; const z = (rng() - 0.5) * 60;
    if (Math.hypot(x - TREEHOUSE_SPAWN.x, z - TREEHOUSE_SPAWN.z) < 5) continue;
    if (cs.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 1)) continue;
    out.push({ x, z, s: 0.6 + rng() * 0.7 });
  }
  return out;
}

// ---- the area's ground: flat (the levels are perches). No `ceil`: the camera is never pulled in, so the leaves above must not be near (CANOPY_MIN_Y). ----
export const TREEHOUSE_GROUND = null; // the walk's FLAT_GROUND (src/ground.js groundOf): nothing here lifts or lowers the ground

// ---- the proofs -------------------------------------------------------------------------------------------------------------
const STEP = 0.5;
const walkable = (x, z, cs, b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && cs.every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + CAT_R);
// The ground cells a cat on foot can stand on from the spawn (0.5 m grid, four neighbours): [{ x, z }].
export function groundFlood(colliders = treehouseColliders(), bounds = TREEHOUSE_BOUNDS, spawn = TREEHOUSE_SPAWN) {
  const nx = Math.round((bounds.maxX - bounds.minX) / STEP) + 1;
  const nz = Math.round((bounds.maxZ - bounds.minZ) / STEP) + 1;
  const seen = new Uint8Array(nx * nz);
  const at = (i, j) => [bounds.minX + i * STEP, bounds.minZ + j * STEP];
  const ok = (i, j) => { const [x, z] = at(i, j); return walkable(x, z, colliders, bounds); };
  const si = Math.round((spawn.x - bounds.minX) / STEP);
  const sj = Math.round((spawn.z - bounds.minZ) / STEP);
  if (!ok(si, sj)) return [];
  const stack = [[si, sj]];
  seen[si * nz + sj] = 1;
  const out = [];
  while (stack.length) {
    const [i, j] = stack.pop();
    const [x, z] = at(i, j);
    out.push({ x, z });
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const p = i + di; const q = j + dj;
      if (p < 0 || q < 0 || p >= nx || q >= nz || seen[p * nz + q] || !ok(p, q)) continue;
      seen[p * nz + q] = 1;
      stack.push([p, q]);
    }
  }
  return out;
}

// The no-skills reach test: from every ground cell the cat can walk to (standing at y 0), follow canReach hops under `budget` (no skill: the baseline) across the perches.
// { reached, missing, hops: { id: hops from the ground }, maxHop: the tallest gain in any hop used, maxSpan: the widest reach in any hop between two perches,
//   down: perches that cannot step down to the lowest deck by hops that never climb (none) }.
export function reachReport({ perches = TREEHOUSE_PERCHES, budget = BASE_CLIMB_BUDGET, ground = groundFlood() } = {}) {
  const hops = {};
  let maxHop = 0;
  let maxSpan = 0;
  let frontier = perches.filter((p) => ground.some((g) => canReach(p, g, 0, budget)));
  for (const p of frontier) { hops[p.id] = 1; maxHop = Math.max(maxHop, p.y); }
  let n = 1;
  while (frontier.length) {
    n++;
    const next = [];
    for (const from of frontier) {
      for (const p of perches) {
        if (hops[p.id] !== undefined || !canReach(p, from, from.y, budget)) continue;
        hops[p.id] = n;
        next.push(p);
        maxHop = Math.max(maxHop, p.y - from.y);
        maxSpan = Math.max(maxSpan, Math.hypot(p.x - from.x, p.z - from.z));
      }
    }
    frontier = next;
  }
  // "down is always a hop to the deck below": every perch can step down, by hops that never climb, to the lowest deck (which steps to the ground)
  const low = new Set(perches.filter((p) => p.y <= HOP_MAX + 1e-9).map((p) => p.id));
  for (let grew = true; grew;) {
    grew = false;
    for (const p of perches) {
      if (low.has(p.id)) continue;
      if (perches.some((q) => low.has(q.id) && q.y <= p.y && canReach(q, p, p.y, budget))) { low.add(p.id); grew = true; }
    }
  }
  const down = perches.filter((p) => !low.has(p.id)).map((p) => p.id);
  const ids = perches.map((p) => p.id);
  return { reached: ids.filter((id) => hops[id] !== undefined), missing: ids.filter((id) => hops[id] === undefined), hops, maxHop, maxSpan, down };
}

// The camera spike (plan 2.6): where the chase camera is, relative to what is drawn. For each zoom step from 0 to `maxStep` the camera stands ZOOM_STEPS[step].height above
// the cat. `ceiling`: the highest camera over every place a cat can stand (a perch at its height, the ground at 0); `clear`: the canopy's lowest leaf minus that.
export function cameraSpike(maxStep = 2) {
  const top = TREEHOUSE_PERCHES.reduce((m, p) => Math.max(m, p.y), 0);
  const rows = [];
  for (let s = 0; s <= maxStep; s++) {
    const { dist, height } = ZOOM_STEPS[s];
    const cameraY = top + height;
    // the camera sits `dist` behind the cat on the ground plane: how often it would stand inside a deck's slab (a thin box: DECK_THICK) at the cat's own level or below
    let inside = 0;
    let n = 0;
    for (const p of TREEHOUSE_PERCHES) {
      for (let a = 0; a < 8; a++) {
        const cx = p.x + Math.cos((a / 8) * Math.PI * 2) * dist;
        const cz = p.z + Math.sin((a / 8) * Math.PI * 2) * dist;
        const cy = p.y + height;
        n++;
        if (DECKS.some((k) => Math.abs(cx - k.x) <= k.w / 2 && Math.abs(cz - k.z) <= k.d / 2 && cy <= k.y && cy >= k.y - DECK_THICK)) inside++;
      }
    }
    rows.push({ step: s, dist, height, cameraY, clear: CANOPY_MIN_Y - cameraY, inside, of: n });
  }
  return rows;
}
