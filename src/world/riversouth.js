import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as b from './builder.js';
import { mulberry32, seedFromCode } from '../rng.js';
import { segDist } from '../segdist.js';
import { sureClawsTreePerch } from '../climbing.js';
import { createWater } from '../render/water.js';
import { addTrails } from './pathribbon.js';
import { withLocalUuids } from './localuuids.js';
import { colorParts, paintMesh, ribbon, Tris, lin, scale3, unit, lerp3, smoothstep, clamp01, r2 } from './dressing.js';
import { cutTiles, tileSeed, TILE_SIZE } from './strips.js';
import { riverGroundTint } from './riverdress.js';
import { phrase } from '../clanphrases.js';

// =============================================================================
// The River's south strip (bigger areas, step 3).
//
// Forty metres of new water-meadow south of the River's old edge, z 50..90,
// from the west strip's rim to the Woods' side (x -90..50), so it also takes
// in the south-west corner where it meets the west strip's south end. With
// both strips the River is 140 x 140 m. Only built when the "bigger areas"
// switch is on (src/grow.js); river.js asks for everything here from its
// build(), after the core and the west strip.
//
// The old 100 x 100 m River is the CORE and nothing in it moves: this file
// scatters from its own seeds, one stream per tile, and adds its things after
// the core's and the west strip's, under local uuids.
//
// WHAT IS HERE. The south is the drier side of the marsh (its hills are the
// drier green), so it is a meadow: tussocks and buttercups, a few stones, a
// scatter of alders, thinner toward the rim. In it, under a crescent of high
// sandy bank, lies a round pool the old river left behind: the sand martins'
// bank, the thing to find. A faint trail leaves the long path where the pond
// path does (28, 40) and runs south-west across the meadow to it. The meadow
// between the old edge and the bank is kept open (few trees, no reeds), so a
// cat at the old edge sees the pale bank across it. A damp hollow of reeds
// fills the south-west corner, where the west strip's reeds left off.
//
// What is whole from the start of a walk: the ground, the pool, the trail,
// the bank (with its colliders and its climb) and every tree's collider and
// Sure Claws fork. What streams near the cat (render/striptiles.js): each
// tile's trees and its tussocks, buttercups, reeds, cattails and stones, with
// far stand-ins past their range.
//
// river.js imports this module and this module must not read river.js at its
// top level.
// =============================================================================

export const SOUTH = Object.freeze({ id: 'south', minX: -90, maxX: 50, minZ: 50, maxZ: 90 });
export const SOUTH_TILES = cutTiles(SOUTH, TILE_SIZE);
// The ground reaches as far past the new edge as it did past the old one
// (10 m), the west strip's patch covering x -100..-60 down to z 60 and the
// core's plane z -60..60; this one takes the rest.
export const SOUTH_GROUND = Object.freeze({ minX: -100, maxX: 60, minZ: 60, maxZ: 100 });
// The horizon band rings the grown River, x -90..50 and z -50..90, as it rang
// the old square (builder.horizonBand's rect: the centre, and how far each
// side moved out), so its inner rim is 6 m outside the new edges all round.
export const GROWN_BAND_RECT = Object.freeze({ cx: -20, cz: 20, ex: 20, ez: 20 });

// The martins' pool: round, shallow enough to wade, in the bank's lap.
export const SAND_POOL = Object.freeze({ id: 'pool-south', kind: 'circle', x: -14, z: 74, r: 4.2, shallow: 1.0 });
export const SAND_POOL_LOOK = Object.freeze({ y: 0.03, color: 0x6f8f80, foamStrength: 0.22 });
const WATERS = Object.freeze([SAND_POOL]);
const waterDist = (x, z) => b.waterGap(SAND_POOL, x, z);

// --- the sand bank -------------------------------------------------------------
// A crescent of steep sandy bank round the pool's south side, where the old
// river cut into the meadow on its bend. Its face looks north over the pool
// and is pocked with the martins' nest holes near the top; its back is a
// grassy slope down to the meadow. It rises from almost nothing at its two
// ends to 2 m in the middle. Angles are measured from the pool's centre, x
// east and z south, so 90 degrees is due south.
const DEG = Math.PI / 180;
const BANK = Object.freeze({
  from: 15 * DEG, to: 165 * DEG, // its two ends
  face: 6.6, // the face's foot, from the pool's centre (the pool is 4.2)
  height: 2.0, // the crest in the middle
  ramp: 60 * DEG, // how far in from an end the crest takes to reach full height
});
const CREST = BANK.face + 0.5; // the crest line, where the perches are
// The crest's height at angle `a`: from nothing at either end to full height
// `ramp` in from it.
export function bankHeight(a) {
  const d = Math.min(a - BANK.from, BANK.to - a);
  if (d < 0) return 0;
  return 0.05 + (BANK.height - 0.05) * Math.sin(Math.min(1, d / BANK.ramp) * Math.PI / 2);
}
// And how wide it is there, as a share of its full width about the crest
// line: the ends narrow as they sink, so the bank runs out into the meadow
// rather than stopping square.
const bankWidth = (a) => 0.3 + 0.7 * smoothstep(0, 30 * DEG, Math.min(a - BANK.from, BANK.to - a));
const across = (a, off) => CREST + off * bankWidth(a);
const polar = (a, r) => ({ x: r2(SAND_POOL.x + Math.cos(a) * r), z: r2(SAND_POOL.z + Math.sin(a) * r) });
// How far back the grassy slope runs behind the crest: further where it is high.
const backOf = (h) => 0.35 + 0.75 * h;

// The climb: up from the east end along the crest, four perches each higher
// than the last (so the jump key walks the chain upward), the first one hop
// from the meadow, the last the lookout over the pool and the meadow.
const CLIMB = [20, 31, 44, 60].map((d) => BANK.from + d * DEG);
export const SOUTH_PERCHES = Object.freeze(CLIMB.map((a, i) => {
  const p = { ...polar(a, CREST), y: r2(bankHeight(a)), kind: 'stone' };
  if (i === CLIMB.length - 1) {
    Object.defineProperty(p, 'label', { enumerable: true, get() { return phrase('river.south.lookout'); } });
    p.vantage = true;
  }
  return Object.freeze(p);
}));
// The bank's solid block: a row of circles under the crest, and a second row
// under the back slope where it is high enough to stand out of the grass.
// Where it is lower than a cat's shoulder at its two ends, a cat walks over it.
const BANK_COLLIDERS = [];
for (let a = BANK.from + 2 * DEG; a <= BANK.to - 2 * DEG + 1e-9; a += 1.0 / CREST) {
  const h = bankHeight(a);
  if (h < 0.3) continue;
  BANK_COLLIDERS.push(Object.freeze({ ...polar(a, across(a, -0.1)), r: r2((0.55 + 0.25 * Math.min(1, h)) * Math.min(1, 0.4 + bankWidth(a))) }));
}
for (let a = BANK.from + 14 * DEG; a <= BANK.to - 14 * DEG + 1e-9; a += 1.2 / (CREST + 1.2)) {
  const h = bankHeight(a);
  if (h < 0.9) continue;
  BANK_COLLIDERS.push(Object.freeze({ ...polar(a, across(a, 0.25 + 0.5 * backOf(h))), r: r2(0.3 + 0.2 * h) }));
}
export const SOUTH_COLLIDERS = Object.freeze(BANK_COLLIDERS);

// The two spots to rest: a warm sandy hollow on the shore under the bank's
// face, out of the wind, to nap in, and a flat stone on the pool's north rim
// to drink from. `mesh: false`: the bank's own mesh draws both.
const NAP = Object.freeze(polar(104 * DEG, 5.45));
const DRINK = Object.freeze(polar(-118 * DEG, SAND_POOL.r + 0.65));
export const SOUTH_RESTS = Object.freeze([
  Object.freeze({ id: 'river-nap-2', kind: 'nap', x: NAP.x, z: NAP.z, mesh: false }),
  Object.freeze({ id: 'river-drink-2', kind: 'drink', x: DRINK.x, z: DRINK.z, mesh: false }),
]);

// --- the faint trail ----------------------------------------------------------
// From the long path at its junction with the pond path (28, 40), south-west
// across the meadow, to the pool's east shore, short of the bank's east end.
// Two legs, so two of the hidden strips the grass and the paw prints read
// (each is a mesh in the budget).
export const SOUTH_TRAIL = Object.freeze([
  [28, 40, 8, 57], [8, 57, -6.5, 68.5],
].map((s) => Object.freeze(s)));
export const SOUTH_TRAIL_W = 1.3;
const TRAIL_STYLE = { surface: 'sand', color: 0x9a8a66 };

// The things to find. Labels go through the phrase table (both word sets).
const LOOKOUT = SOUTH_PERCHES[SOUTH_PERCHES.length - 1];
const SHORE_FIND = polar(150 * DEG, 5.3);
const find = (id, x, z, say, y) => {
  const c = { id, x, z, ...(y === undefined ? {} : { y }) };
  Object.defineProperty(c, 'label', { enumerable: true, get: say });
  return c;
};
export function southCollectibles() {
  return [
    find('river-find-10', LOOKOUT.x, LOOKOUT.z, () => phrase('river.south.eggshell'), LOOKOUT.y),
    find('river-find-11', -79, 79, () => phrase('river.south.feather')),
    find('river-find-12', 38, 81, () => phrase('river.south.clock')),
    find('river-find-13', SHORE_FIND.x, SHORE_FIND.z, () => phrase('river.south.pebble')),
  ];
}
const SCENIC = Object.freeze({ x: -7, z: 69.5 });
export function southScenics() {
  return [find('river-sand-bank', SCENIC.x, SCENIC.z, () => phrase('river.south.scenic'))];
}
const FINDS = Object.freeze([[-79, 79], [38, 81], [SHORE_FIND.x, SHORE_FIND.z], [SCENIC.x, SCENIC.z], [NAP.x, NAP.z], [DRINK.x, DRINK.z]]);

// --- what may grow where -------------------------------------------------------
// How far (x, z) is outside the bank's footprint (the face's foot to the back
// slope's toe, end to end), 0 on it.
const angleGap = (p, q) => { const d = Math.abs(p - q) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };
function bankDist(x, z) {
  const dx = x - SAND_POOL.x, dz = z - SAND_POOL.z;
  const r = Math.hypot(dx, dz);
  const a = Math.atan2(dz, dx);
  if (a >= BANK.from && a <= BANK.to) {
    return Math.max(BANK.face - 0.4 - r, r - (CREST + 0.4 + backOf(bankHeight(a))), 0);
  }
  // past an end: the distance to that end's low section
  const end = angleGap(a, BANK.from) <= angleGap(a, BANK.to) ? BANK.from : BANK.to;
  const ex = SAND_POOL.x + Math.cos(end) * CREST, ez = SAND_POOL.z + Math.sin(end) * CREST;
  return Math.max(0, Math.hypot(x - ex, z - ez) - 0.9);
}
const trailDist = (x, z) => {
  let m = Infinity;
  for (const s of SOUTH_TRAIL) m = Math.min(m, segDist(x, z, ...s));
  return m;
};
const findDist = (x, z) => {
  let m = Infinity;
  for (const [fx, fz] of FINDS) m = Math.min(m, Math.hypot(x - fx, z - fz));
  return m;
};
const inStrip = (x, z) => x >= SOUTH.minX && x <= SOUTH.maxX && z >= SOUTH.minZ && z <= SOUTH.maxZ;
// 0 at the old edge, 1 at the new rim: everything thins toward the rim.
const rimward = (z) => clamp01((z - SOUTH.minZ) / (SOUTH.maxZ - SOUTH.minZ));
// The open meadow between the old edge and the bank, and the damp hollow
// west of it: no trees, so the pale bank is seen from the old edge across it.
// (The hollow's reeds and cattails stand in it all the same.)
const OPEN_MEADOW = Object.freeze({ minX: -90, maxX: 12, minZ: 50, maxZ: 70 });
const inOpenMeadow = (x, z) => x >= OPEN_MEADOW.minX && x <= OPEN_MEADOW.maxX && z >= OPEN_MEADOW.minZ && z <= OPEN_MEADOW.maxZ;
// The damp hollow in the south-west corner, where reeds stand.
// It stops at z 60, where the west strip's ground (untinted by it) meets this
// strip's, so the two tints agree along the seam.
export const SOUTH_HOLLOW = Object.freeze({ x: -74, z: 68, rx: 12, rz: 8 });
const hollowAt = (x, z) => 1 - Math.hypot((x - SOUTH_HOLLOW.x) / SOUTH_HOLLOW.rx, (z - SOUTH_HOLLOW.z) / SOUTH_HOLLOW.rz);

// A low thing (tussock, flower, reed, stone): dry, off the trail, off the
// bank and its spots.
function lowFits(x, z, { water = 0.3, trail = 1.3, find = 1.6, bank = 0.3 } = {}) {
  return inStrip(x, z) && waterDist(x, z) >= water && trailDist(x, z) >= trail
    && bankDist(x, z) >= bank && findDist(x, z) >= find;
}

// The trees: a 3 x 3 jittered grid a tile, each candidate kept with a chance
// that falls from 0.3 at the old edge to 0.1 at the rim (none on the open
// meadow, which also keeps every strip tree out of the trees layer's range of
// the reedbed, the River's busiest place). A willow within 10 m of the pool,
// an alder on the drier meadow. Candidates stay 2 m inside their tile and 4 m apart, so two tiles'
// trees never crowd and no tile needs to know its neighbour's. Every
// candidate draws its numbers whether or not it is kept.
const POOL_WILLOW = Object.freeze({ kind: 'willow', ...polar(205 * DEG, SAND_POOL.r + 3.2), scale: 1.45, r: r2(0.5 * 1.45) });
const TREE_INSET = 2;
const TREE_GRID = 3;
const TREE_JITTER = 1.2;
const TREE_APART = 4;
function tileTrees(tile) {
  const rng = mulberry32(seedFromCode(tileSeed('river', SOUTH.id, tile.index, 'trees')));
  const cell = (tile.maxX - tile.minX - 2 * TREE_INSET) / TREE_GRID;
  const out = [];
  for (let j = 0; j < TREE_GRID; j++) {
    for (let i = 0; i < TREE_GRID; i++) {
      const x = r2(tile.minX + TREE_INSET + (i + 0.5) * cell + (rng() * 2 - 1) * TREE_JITTER);
      const z = r2(tile.minZ + TREE_INSET + (j + 0.5) * cell + (rng() * 2 - 1) * TREE_JITTER);
      const roll = rng();
      const size = rng();
      const chance = (0.3 - 0.2 * rimward(z)) * (inOpenMeadow(x, z) ? 0 : 1);
      if (roll >= chance) continue;
      const wd = waterDist(x, z);
      const kind = wd < 10 ? 'willow' : 'alder';
      const scale = r2(kind === 'willow' ? 1.1 + 0.4 * size : 0.9 + 0.4 * size);
      const reach = 1.6 * scale;
      if (wd < 3 || trailDist(x, z) < SOUTH_TRAIL_W / 2 + reach + 0.5) continue;
      if (bankDist(x, z) < 4 || findDist(x, z) < 4) continue;
      if (out.some((t) => Math.hypot(t.x - x, t.z - z) < TREE_APART)) continue;
      out.push(Object.freeze({ kind, x, z, scale, r: r2(0.5 * scale) }));
    }
  }
  // and one willow planted by hand on the pool's west shore, leaning over the
  // water by the bank's west end, on whichever tile it stands
  const w = POOL_WILLOW;
  if (w.x >= tile.minX && w.x < tile.maxX && w.z >= tile.minZ && w.z < tile.maxZ
    && out.every((t) => Math.hypot(t.x - w.x, t.z - w.z) >= TREE_APART)) out.push(w);
  return out;
}

// The reeds: the damp hollow in the south-west corner (about half the core's
// reedbed to the square metre at its heart, thinning to its rim) and a ring
// round the pool's north half (its south half is the sandy shore under the
// bank).
const REED_GRID = 1.6;
const REED_JITTER = 0.55;
const REED_APART = 1.0;
function tileReeds(tile, trees) {
  const rng = mulberry32(seedFromCode(tileSeed('river', SOUTH.id, tile.index, 'reeds')));
  const out = [];
  const add = (x, z) => {
    x = r2(x); z = r2(z);
    if (x < tile.minX || x >= tile.maxX || z < tile.minZ || z >= tile.maxZ) return;
    if (!lowFits(x, z, { water: 0.25, trail: 1.5, find: 2, bank: 0.8 })) return;
    if (trees.some((t) => Math.hypot(x - t.x, z - t.z) < 0.8 * t.scale)) return;
    if (out.some((p) => Math.hypot(x - p.x, z - p.z) < REED_APART)) return;
    out.push(Object.freeze({ x, z }));
  };
  for (let gz = tile.minZ + REED_GRID / 2; gz < tile.maxZ; gz += REED_GRID) {
    for (let gx = tile.minX + REED_GRID / 2; gx < tile.maxX; gx += REED_GRID) {
      const x = gx + (rng() * 2 - 1) * REED_JITTER;
      const z = gz + (rng() * 2 - 1) * REED_JITTER;
      const keep = rng();
      const h = hollowAt(x, z);
      if (h > 0 && keep < 0.6 * smoothstep(0, 0.6, h)) add(x, z);
    }
  }
  const ringR = SAND_POOL.r + 0.5;
  const n = Math.round((Math.PI * 2 * ringR) / 2.2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (Math.sin(a) > -0.2) continue; // the north half only
    add(SAND_POOL.x + Math.cos(a) * ringR, SAND_POOL.z + Math.sin(a) * ringR);
  }
  return out;
}

// Tussocks, buttercups (the marsh marigold's mesh, scattered thin over the
// meadow and thicker by the pool) and stones, off jittered grids by hash (as
// riverdress.js scatters), and cattails in threes round the pool's north rim
// and in the hollow.
function tileLow(tile, trees) {
  const offTrunk = (x, z) => trees.every((t) => Math.hypot(x - t.x, z - t.z) >= 0.8 * t.scale);
  const inTile = (x, z) => x >= tile.minX && x < tile.maxX && z >= tile.minZ && z < tile.maxZ;
  const grid = (step, salt, fn) => {
    for (let gz = Math.ceil(tile.minZ / step) * step; gz < tile.maxZ; gz += step) {
      for (let gx = Math.ceil(tile.minX / step) * step; gx < tile.maxX; gx += step) {
        const x = gx + (b.hash01(gx, gz, salt) * 2 - 1) * step * 0.38;
        const z = gz + (b.hash01(gz, gx, salt + 7) * 2 - 1) * step * 0.38;
        if (inTile(x, z)) fn(x, z, b.hash01(gx, gz, salt + 14));
      }
    }
  };
  const tussocks = [];
  grid(4.6, 2101, (cx, cz, roll) => {
    if (roll > 0.62 - 0.3 * rimward(cz)) return;
    const n = 1 + Math.floor(b.hash01(cx, cz, 2115) * 2);
    for (let k = 0; k < n; k++) {
      const a = b.hash01(cx + k, cz, 2129) * Math.PI * 2;
      const d = k === 0 ? 0 : 0.45 + 0.5 * b.hash01(cx, cz + k, 2143);
      const x = r2(cx + Math.cos(a) * d), z = r2(cz + Math.sin(a) * d);
      if (!inTile(x, z) || !lowFits(x, z, { trail: 1.1 }) || !offTrunk(x, z)) continue;
      tussocks.push(Object.freeze({ x, z, h: r2(0.3 + 0.22 * b.hash01(x, z, 2157)), s: r2(1.0 + 0.5 * b.hash01(z, x, 2171)) }));
    }
  });
  const flowers = [];
  grid(4.4, 2185, (x, z, roll) => {
    const near = waterDist(x, z) < 9;
    if (roll > (near ? 0.62 : 0.22 - 0.1 * rimward(z)) || !lowFits(x, z, { water: 0.5 }) || !offTrunk(x, z)) return;
    flowers.push(Object.freeze({ x: r2(x), z: r2(z), s: r2(0.8 + 0.5 * b.hash01(x, z, 2199)) }));
  });
  const stones = [];
  grid(8.5, 2213, (cx, cz, roll) => {
    if (roll > 0.35) return;
    const n = 2 + Math.floor(b.hash01(cx, cz, 2227) * 2);
    for (let k = 0; k < n; k++) {
      const a = b.hash01(cx + k, cz, 2241) * Math.PI * 2;
      const d = k === 0 ? 0 : 0.35 + 0.4 * b.hash01(cx, cz + k, 2255);
      const x = r2(cx + Math.cos(a) * d), z = r2(cz + Math.sin(a) * d);
      if (!inTile(x, z) || !lowFits(x, z, { trail: 1.2 }) || !offTrunk(x, z)) continue;
      stones.push(Object.freeze({ x, z, r: r2(0.12 + 0.14 * b.hash01(x, z, 2269)) }));
    }
  });
  const cattails = [];
  const clump = (cx, cz, salt) => {
    for (let k = 0; k < 3; k++) {
      const x = r2(cx + (k - 1) * 0.22 + (b.hash01(cx + k, cz, salt) - 0.5) * 0.12);
      const z = r2(cz + (b.hash01(cx, cz + k, salt + 14) - 0.5) * 0.25);
      if (!inTile(x, z) || !lowFits(x, z, { water: 0.2, bank: 0.8 })) continue;
      cattails.push(Object.freeze({ x, z, h: r2(1.0 + 0.3 * b.hash01(x, z, salt + 28)) }));
    }
  };
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI * (0.15 + 0.7 * (i + 0.5) / 5);
    const rr = SAND_POOL.r + 0.55;
    clump(SAND_POOL.x + Math.cos(a) * rr, SAND_POOL.z + Math.sin(a) * rr, 2283 + i);
  }
  for (let i = 0; i < 6; i++) {
    const a = b.hash01(i, 1, 2297) * Math.PI * 2, d = 0.7 * b.hash01(i, 2, 2297);
    clump(SOUTH_HOLLOW.x + Math.cos(a) * d * SOUTH_HOLLOW.rx, SOUTH_HOLLOW.z + Math.sin(a) * d * SOUTH_HOLLOW.rz, 2311 + i);
  }
  return { tussocks, flowers, stones, cattails };
}

// southTileContent(index) -> what grows on that tile: a pure function of the
// index, worked out once and kept. `small` is the low layer by kind.
const CONTENT = new Map();
export function southTileContent(index) {
  let c = CONTENT.get(index);
  if (!c) {
    const tile = SOUTH_TILES[index];
    const trees = tileTrees(tile);
    const reeds = tileReeds(tile, trees);
    const { tussocks, flowers, stones, cattails } = tileLow(tile, trees);
    c = Object.freeze({
      trees: Object.freeze(trees),
      small: Object.freeze({
        reed: Object.freeze(reeds), tussock: Object.freeze(tussocks), cattail: Object.freeze(cattails),
        marigold: Object.freeze(flowers), stone: Object.freeze(stones),
      }),
    });
    CONTENT.set(index, c);
  }
  return c;
}

// Every strip tree, tile by tile: the colliders and Sure Claws forks a walk
// has from its first frame, read from the same content the meshes are built
// from later.
export function southTrees() {
  return SOUTH_TILES.flatMap((t) => southTileContent(t.index).trees);
}
export const southTreeColliders = () => southTrees().map(({ x, z, r }) => ({ x, z, r }));
export const southTreePerches = () => southTrees().map(({ x, z, scale }) => sureClawsTreePerch(x, z, scale));

// One strip tree as the core builds its own (builder.willow, builder.tree).
export function buildSouthTree(t, { wind } = {}) {
  return t.kind === 'willow' ? b.willow(t.x, t.z, t.scale, { wind }) : b.tree(t.x, t.z, t.scale, { wind });
}

// The strip, as render/striptiles.js streams it.
export const SOUTH_STRIP = Object.freeze({
  areaId: 'river', id: SOUTH.id, rect: SOUTH, tiles: SOUTH_TILES,
  content: southTileContent, buildTree: buildSouthTree,
});

// --- the ground ----------------------------------------------------------------
// The core's marsh tint, wet round the pool and in the hollow.
const WET = [0.68, 0.82, 0.62];
export function southGroundTint(x, z) {
  const m = riverGroundTint(x, z);
  const near = Math.max(smoothstep(0, 0.7, 1 - waterDist(x, z) / 6), 0.8 * smoothstep(0, 0.5, hollowAt(x, z)));
  return near > 0 ? lerp3(m, WET, near) : m;
}

// --- the bank's mesh ---------------------------------------------------------------
const SAND = lin(0xc9ab72);
const SAND_PALE = lin(0xdcc48e);
const SAND_DARK = lin(0x9c7f4e);
const HOLE = lin(0x3a2a1c);
const TURF = lin(0x6f8f4a);
const TURF_DRY = lin(0x9a9a5a);
const STONE = lin(0x8f8a80);

function bankGeometry() {
  const tris = new Tris();
  const tri = (a, b2, c, col) => {
    const ux = b2[0] - a[0], uy = b2[1] - a[1], uz = b2[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const n = unit(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    tris.v(...a, n, col(a)); tris.v(...b2, n, col(b2)); tris.v(...c, n, col(c));
  };
  // The cross-section at angle a: (radius, height) from the face's sandy foot,
  // up the steep face, over the turfed crest and down the grassy back.
  const section = (a) => {
    const h = bankHeight(a);
    const wob = 0.12 * (b.hash01(Math.round(a / DEG), 1, 2401) - 0.5);
    const back = backOf(h);
    const f = BANK.face + wob - CREST; // from the crest line, narrowed at the ends
    return [
      [f - 0.35, -0.02], [f, 0.18 * h], [f + 0.1, 0.62 * h], [f + 0.22, 0.93 * h],
      [f + 0.45, h], [0.25, 0.96 * h], [0.25 + 0.5 * back, 0.5 * h], [0.25 + back, -0.02],
    ].map(([r, y]) => [across(a, r), y]);
  };
  // Colour by where on the section a vertex is: sand on the face, banded by
  // height (the old river's layers), turf over the crest and down the back.
  const at = (a, k, r, y) => {
    const p = [SAND_POOL.x + Math.cos(a) * r, y, SAND_POOL.z + Math.sin(a) * r];
    const band = 0.5 + 0.5 * Math.sin(y * 9 + 1.3 * b.hash01(Math.round(a / (3 * DEG)), 2, 2415));
    let c;
    if (k <= 3) c = lerp3(lerp3(SAND_DARK, SAND, 0.5 + 0.5 * clamp01(y / 1.2)), SAND_PALE, band * 0.35);
    else if (k === 4) c = lerp3(SAND_PALE, TURF_DRY, 0.5);
    else c = lerp3(TURF, TURF_DRY, b.hash01(Math.round(p[0] * 2), Math.round(p[2] * 2), 2429) * 0.6);
    const tone = 0.9 + 0.18 * b.hash01(Math.round(p[0] * 3), Math.round(p[2] * 3 + y * 3), 2443);
    return { p, c: scale3(c, tone) };
  };
  const STEPS = 30;
  const rows = [];
  for (let i = 0; i <= STEPS; i++) {
    const a = BANK.from + ((BANK.to - BANK.from) * i) / STEPS;
    rows.push(section(a).map(([r, y], k) => at(a, k, r, y)));
  }
  const cols = new Map();
  const colour = (v) => cols.get(v);
  const put = (v) => { const key = v.p; cols.set(key, v.c); return key; };
  for (let i = 0; i < STEPS; i++) {
    const A = rows[i], B = rows[i + 1];
    for (let k = 0; k < A.length - 1; k++) {
      const a0 = put(A[k]), a1 = put(A[k + 1]), b0 = put(B[k]), b1 = put(B[k + 1]);
      tri(a0, b0, b1, colour);
      tri(a0, b1, a1, colour);
    }
  }
  // the two ends, closed with a fan from the crest
  for (const [row, flip] of [[rows[0], false], [rows[STEPS], true]]) {
    const hub = put(row[4]);
    for (let k = 0; k < row.length; k++) {
      const k2 = (k + 1) % row.length;
      if (k === 4 || k2 === 4) continue;
      const p = put(row[k]), q = put(row[k2]);
      if (flip) tri(hub, p, q, colour); else tri(hub, q, p, colour);
    }
  }
  const parts = [tris.geometry()];
  const add = (g, color) => parts.push(colorParts(g, color));

  // the martins' nest holes: dark ovals near the top of the face where it is high
  const holes = [];
  for (let k = 0; k < 16; k++) {
    const a = (52 + 76 * b.hash01(k, 1, 2457)) * DEG;
    const h = bankHeight(a);
    const y = h * (0.66 + 0.2 * b.hash01(k, 2, 2471));
    if (holes.some((o) => Math.abs(o.a - a) * CREST < 0.35 && Math.abs(o.y - y) < 0.2)) continue;
    holes.push({ a, y });
    const g = new THREE.CircleGeometry(0.075 + 0.02 * b.hash01(k, 3, 2485), 6);
    g.scale(1.25, 1, 1);
    // stand it on the face, facing the pool (inward), a hair proud of the sand
    g.rotateY(-a - Math.PI / 2);
    const r = BANK.face + 0.1 + 0.39 * (y / h - 0.62) - 0.08;
    g.translate(SAND_POOL.x + Math.cos(a) * r, y, SAND_POOL.z + Math.sin(a) * r);
    add(g, HOLE);
  }
  // fallen clods of sand at the face's foot, and tufts of grass along the crest
  for (let k = 0; k < 4; k++) {
    const a = (30 + 120 * (k + b.hash01(k, 4, 2499)) / 4) * DEG;
    const g = new THREE.IcosahedronGeometry(0.16 + 0.12 * b.hash01(k, 5, 2513), 0);
    g.scale(1.2, 0.6, 1);
    const r = BANK.face - 0.25 - 0.3 * b.hash01(k, 6, 2527);
    g.translate(SAND_POOL.x + Math.cos(a) * r, 0.06, SAND_POOL.z + Math.sin(a) * r);
    add(g, (x, y, z) => scale3(SAND, 0.88 + 0.2 * b.hash01(Math.round(x * 7), Math.round(z * 7), 2541)));
  }
  // tufts of grass along the crest: five blades each, as a tussock's
  const blades = new Tris();
  for (let k = 0; k < 9; k++) {
    const a = (24 + 132 * (k + b.hash01(k, 7, 2555)) / 9) * DEG;
    const h = bankHeight(a);
    const r = CREST + 0.05 * (b.hash01(k, 8, 2569) - 0.5);
    const tx = SAND_POOL.x + Math.cos(a) * r, tz = SAND_POOL.z + Math.sin(a) * r;
    if (SOUTH_PERCHES.some((p) => Math.hypot(p.x - tx, p.z - tz) < 0.8)) continue; // a cat sits there
    for (let j = 0; j < 5; j++) {
      const ba = ((j + b.hash01(k, j, 2571) * 0.7) / 5) * Math.PI * 2;
      const dx = Math.cos(ba), dz = Math.sin(ba);
      const w = 0.06, lean = 0.18 + 0.12 * b.hash01(j, k, 2573), up = 0.3 + 0.15 * b.hash01(k + j, 1, 2575);
      const n = unit(dx * 0.5, 1, dz * 0.5);
      blades.v(tx - dz * w, h - 0.03, tz + dx * w, n, scale3(TURF, 0.85));
      blades.v(tx + dz * w, h - 0.03, tz - dx * w, n, scale3(TURF, 0.85));
      blades.v(tx + dx * lean, h + up, tz + dz * lean, n, TURF_DRY);
    }
  }
  parts.push(blades.geometry());
  // the warm sandy hollow to nap in
  const bed = new THREE.CylinderGeometry(0.6, 0.72, 0.05, 9);
  bed.translate(NAP.x, 0.02, NAP.z);
  add(bed, (x, y, z) => scale3(SAND_PALE, 0.95 + 0.1 * b.hash01(Math.round(x * 6), Math.round(z * 6), 2583)));
  // the flat stone to drink from, at the pool's north rim
  const slab = new THREE.DodecahedronGeometry(0.5, 0);
  slab.scale(1.1, 0.16, 0.8);
  slab.rotateY(-0.5);
  slab.translate(DRINK.x, 0.03, DRINK.z);
  add(slab, (x, y, z) => scale3(STONE, 0.85 + 0.25 * b.hash01(Math.round(x * 5), Math.round(z * 5), 2597)));
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return geo;
}

// Peaty mud round the pool's north half, as the core paints its own pools, and
// the pale sand of the shore under the bank's face.
const PEAT_DARK = lin(0x655a3a);
const PEAT_LIGHT = lin(0x7a7448);
const PEAT_EDGE = lin(0x8a8a56);
const peat = (x, y, z) => {
  const c = lerp3(PEAT_DARK, PEAT_LIGHT, b.hash01(Math.round(x * 1.5), Math.round(z * 1.5), 2611));
  return lerp3(c, PEAT_EDGE, smoothstep(0.5, 1.3, waterDist(x, z)));
};
const shoreSand = (x, y, z) => lerp3(lin(0xb39a68), SAND_PALE, 0.35 * b.hash01(Math.round(x * 1.7), Math.round(z * 1.7), 2625));
function southPaintParts() {
  const arc = (r, from, to, step) => {
    const pts = [];
    const n = Math.max(2, Math.round(((to - from) * r) / step));
    for (let i = 0; i <= n; i++) {
      const a = from + ((to - from) * i) / n;
      pts.push([SAND_POOL.x + Math.cos(a) * r, SAND_POOL.z + Math.sin(a) * r]);
    }
    return pts;
  };
  return [
    colorParts(ribbon(arc(SAND_POOL.r + 0.7, Math.PI + 0.25, 2 * Math.PI - 0.25, 0.5), 0.6, { salt: 2639, wobble: 0.35, step: 0.8 }), peat),
    colorParts(ribbon(arc((SAND_POOL.r + BANK.face) / 2, BANK.from - 0.1, BANK.to + 0.1, 0.5), 1.15, { salt: 2653, wobble: 0.3, step: 1.0 }), shoreSand),
  ];
}

// A strip's ground is drawn on a 5 m grid, not the plane's 2.5 m: its tint
// changes slowly, and the triangles saved (1,500 here, 1,050 on the west
// strip's) are what let the grown River stay under its budget. Every vertex of
// the 2.5 m patch b.groundPatch made is kept (so the uvs, the macro patches and
// the tint are the plane's own, point for point) and only the index changes:
// 5 m cells, each two triangles, but along a `seam` (an edge where the patch
// meets the core's plane or another patch, named by its world side: minX,
// maxX, minZ or maxZ). There a cell is a fan from its middle vertex that takes
// in the 2.5 m vertex halfway along its seam edge too, so the seam is made of
// the neighbour's own vertices and nothing can open in it. The plane lies
// rotated flat, its rows running from world minZ (row 0) to maxZ.
export function coarseGround(geo, seams) {
  const { widthSegments: sx, heightSegments: sy } = geo.parameters;
  const at = (ix, iy) => iy * (sx + 1) + ix;
  const index = [];
  for (let iy = 0; iy < sy; iy += 2) {
    for (let ix = 0; ix < sx; ix += 2) {
      const A = at(ix, iy), B = at(ix, iy + 2), C = at(ix + 2, iy + 2), D = at(ix + 2, iy);
      const left = ix === 0 && seams.minX, right = ix + 2 === sx && seams.maxX;
      const top = iy === 0 && seams.minZ, bottom = iy + 2 === sy && seams.maxZ;
      if (!left && !right && !top && !bottom) { index.push(A, B, D, B, C, D); continue; }
      // round the cell the way the plane winds its own (A, B, D)
      const rim = [A, ...(left ? [at(ix, iy + 1)] : []), B, ...(bottom ? [at(ix + 1, iy + 2)] : []),
        C, ...(right ? [at(ix + 2, iy + 1)] : []), D, ...(top ? [at(ix + 1, iy)] : [])];
      const O = at(ix + 1, iy + 1);
      for (let k = 0; k < rim.length; k++) index.push(O, rim[k], rim[(k + 1) % rim.length]);
    }
  }
  geo.setIndex(index);
  return geo;
}

/**
 * addSouthStrip(scene, { groundMesh, water, waters, waterColor })
 *
 * Everything of the strip that is whole from the start of a walk, added after
 * the core's and the west strip's own things and wholly under local uuids.
 * Each top-level object is tagged userData.strip = 'south'. Returns
 * { waterFx } for the pool.
 */
export function addSouthStrip(scene, { groundMesh, water = {}, waters, waterColor }) {
  return withLocalUuids('river-south-strip', () => {
    const tag = (o) => { o.userData.strip = SOUTH.id; return o; };
    // more of the same ground, tinted as the core's is
    const patch = b.groundPatch(groundMesh, SOUTH_GROUND, { surface: 'grass' });
    patch.updateMatrix();
    const attr = patch.geometry.attributes.color;
    const pos = patch.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const m = southGroundTint(patch.position.x + pos.getX(i), patch.position.z - pos.getY(i));
      attr.setXYZ(i, attr.getX(i) * m[0], attr.getY(i) * m[1], attr.getZ(i) * m[2]);
    }
    // its north edge meets the core's plane and the west strip's patch
    coarseGround(patch.geometry, { minZ: true });
    patch.name = 'stripGround';
    scene.add(tag(patch));

    // the pool
    const fx = createWater(SAND_POOL, {
      color: waterColor, ...SAND_POOL_LOOK,
      quality: water.quality ?? 'high', reducedMotion: water.reducedMotion ?? false, waters,
    });
    scene.add(tag(fx.mesh));

    // the peaty rim and the sandy shore
    scene.add(tag(paintMesh(southPaintParts(), { name: 'stripPaint' })));

    // the faint trail
    const before = new Set(scene.children);
    const { mesh: trail } = addTrails(scene, [{ segs: SOUTH_TRAIL, w: SOUTH_TRAIL_W }], TRAIL_STYLE, 'river-south',
      { edge: 1e6, decks: [], waters });
    for (const o of scene.children) if (!before.has(o)) tag(o);
    if (trail) tag(trail);

    // the sand bank
    const g = new THREE.Group();
    g.name = 'sandBank';
    const mesh = new THREE.Mesh(bankGeometry(),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }));
    mesh.name = 'sandBankMesh';
    g.add(mesh);
    scene.add(tag(g));
    return { waterFx: fx };
  });
}

export { WATERS as SOUTH_WATERS };
