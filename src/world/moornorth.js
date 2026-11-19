import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as b from './builder.js';
import { mulberry32, seedFromCode } from '../rng.js';
import { segDist } from '../segdist.js';
import { sureClawsTreePerch } from '../climbing.js';
import { createWater, MOOR_STREAM_LOOK } from '../render/water.js';
import { addTrails } from './pathribbon.js';
import { withLocalUuids } from './localuuids.js';
import { colorParts, lin, scale3, lerp3, smoothstep, clamp01, r2, once } from './dressing.js';
import { cutTiles, tileSeed, TILE_SIZE } from './strips.js';
import { streamSmall } from './streamcore.js';
import { FAR_TORS, moorGroundTint } from './moordress.js';
import { phrase } from '../clanphrases.js';

// =============================================================================
// The Moor's north strip (bigger areas, step 3).
//
// Forty metres of new moor north of the Moor's old edge, z -90..-50, across
// its whole width: the Moor's one free edge (the Woods are south, the Pines
// west, the Gorge east). Only built when the "bigger areas" switch is on
// (src/grow.js); moor.js asks for everything here from its build().
//
// THE CAMP STAYS TUCKED IN. The clan's camp sits 1 m inside the old north
// edge ((-1, -43), r 6). So the strip does not simply open out behind it: it
// begins behind an old dry-stone wall that runs right across the moor 1.5 m
// past the old edge, from tor to tor (the three big tors that stood out on
// the skyline, (-14, -54), (20, -54) and (38, -53.5), are inside the strip now
// and the wall runs up to their flanks). The wall is whole behind the camp;
// it has two tumbled gaps to walk through, one 28 m west of the camp and one
// 30 m east of it, where the sheep path by the warren carries on as a faint
// trail. So from the camp the moor still ends at a wall, with the tops of the
// standing stones showing over it.
//
// WHAT THERE IS TO FIND. The faint trail runs from the sheep path's end
// (30, -42.5) through the east gap, past a little peaty tarn, to a ring of
// standing stones on the moor top with an old stone table in the middle (a
// dolmen: two uprights and a capstone). A fallen slab beside it is the step
// up; the capstone is the lookout (too high to reach from the grass). Two
// spots to rest: a mossy hollow in the stone table's lee to nap in and a flat
// stone at the tarn's edge to drink from. Four finds, spread over the strip.
//
// The old 100 x 100 m Moor is the CORE and nothing in it moves: this file
// scatters from its own seeds and adds its things after the core's, under
// local uuids, so the core's trees, beds, colliders and random draws are
// exactly what they are with the switch off.
//
// What streams near the cat (render/striptiles.js): each tile's trees
// (thorns, and pines at the Pines' end), and its moor grass, stones,
// tormentil and the reeds round the tarn. The strip's heather and gorse are
// the core's own bed builders (builder.heatherBed, builder.gorseBed) on the
// strip's spots, built whole at the start of a walk and drawn per tile by the
// core's streams like the core's own merged scatter (see northBeds).
//
// moor.js imports this module and moordress.js imports moor.js, so nothing at
// this module's top level reads either's bindings: every list that needs them
// is worked out on first use and kept.
// =============================================================================

export const NORTH = Object.freeze({ id: 'north', minX: -50, maxX: 50, minZ: -90, maxZ: -50 });
export const NORTH_TILES = cutTiles(NORTH, TILE_SIZE);
// The grown Moor: the core and the strip.
export const GROWN = Object.freeze({ minX: -50, maxX: 50, minZ: -90, maxZ: 50 });
// The ground and the horizon reach as far past the new edge as they did past
// the old one (10 m of ground, the band's inner rim 6 m out).
export const NORTH_GROUND = Object.freeze({ minX: -60, maxX: 60, minZ: -100, maxZ: -60 });
export const NORTH_BAND_RECT = Object.freeze({ cx: 0, cz: -20, ex: 0, ez: 20 });

// --- the old wall ---------------------------------------------------------------
// Polylines, west to east, each [x, z] point. A run that meets a tor ends in
// its flank (the wall's end collider overlaps the tor's); a run that meets
// the area's side ends past the bounds, so nothing squeezes round it. The two
// gaps are 4 m between wall ends (2.9 m between the colliders' edges).
export const WALL_Z = -51.7;
export const WALL_RUNS = Object.freeze([
  [[-50.8, WALL_Z], [-30.5, WALL_Z]],
  [[-26.5, WALL_Z], [-18.5, WALL_Z], [-15.7, -52.5]],
  [[-12.3, -52.5], [-9.8, WALL_Z], [15.4, WALL_Z], [17.9, -52.5]],
  [[22.1, -52.5], [24.4, WALL_Z], [27, WALL_Z]],
  [[31, WALL_Z], [34.3, WALL_Z], [36.2, -52.4]],
  [[39.8, -52.4], [41.6, WALL_Z], [50.8, WALL_Z]],
].map((run) => Object.freeze(run.map((p) => Object.freeze(p)))));
export const WALL_GAPS = Object.freeze([
  Object.freeze({ id: 'west', x: -28.5, z: WALL_Z }),
  Object.freeze({ id: 'east', x: 29, z: WALL_Z }),
]);
const WALL_R = 0.55; // a collider every WALL_STEP along a run
const WALL_STEP = 0.9;
const WALL_H = [0.72, 0.9];
const WALL_THICK = 0.64;
// Points every `step` along a polyline, both ends included.
function alongRun(run, step) {
  const out = [];
  for (let i = 0; i < run.length - 1; i++) {
    const [x1, z1] = run[i], [x2, z2] = run[i + 1];
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.max(1, Math.round(len / step));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) out.push([x1 + ((x2 - x1) * k) / n, z1 + ((z2 - z1) * k) / n]);
  }
  return out;
}
export const WALL_COLLIDERS = Object.freeze(WALL_RUNS.flatMap((run) => alongRun(run, WALL_STEP)
  .map(([x, z]) => Object.freeze({ x: r2(x), z: r2(z), r: WALL_R }))));
const wallDist = (x, z) => {
  let m = Infinity;
  for (const run of WALL_RUNS) for (let i = 0; i < run.length - 1; i++) m = Math.min(m, segDist(x, z, ...run[i], ...run[i + 1]));
  return m;
};

// The three tors of the old skyline (moordress.js FAR_TORS) that stand inside
// the strip now: solid, as the core's tors are. A collider a little inside the
// foot of each (its widest block is r across, 0.85 r deep).
export const strippedTors = once(() => FAR_TORS.filter((t) => t.z < NORTH.maxZ && t.x > NORTH.minX && t.x < NORTH.maxX));
export const torColliders = () => strippedTors().map((t) => ({ x: t.x, z: t.z, r: r2(0.9 * t.r) }));

// --- the tarn -------------------------------------------------------------------
// A little round pool of peaty water on the moor top, shallow enough to wade.
export const TARN = Object.freeze({ id: 'tarn', kind: 'circle', x: 13, z: -67, r: 3.4, shallow: 1.0 });
export const TARN_LOOK = Object.freeze({ y: 0.03, foamStrength: 0.12, ...MOOR_STREAM_LOOK });
const tarnDist = (x, z) => b.waterGap(TARN, x, z);

// --- the standing stones ----------------------------------------------------------
// A ring of eight standing stones, 6.5 m across from the centre, with a ninth
// place left open toward the trail (the way in), round an old stone table.
export const STONES_AT = Object.freeze({ x: -4, z: -73 });
const RING_R = 6.5;
const GATE = Math.atan2(4.5, 5.5); // toward the trail's end, south-east
export const RING_STONES = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8].map((k) => {
  const a = GATE + (k * Math.PI * 2) / 9;
  // two short stones a cat hops onto from the grass, the king stone at the
  // back (north), the rest taller than a cat can reach
  const h = [1.35, 1.9, 2.15, 2.65, 2.0, 1.45, 1.8, 2.2][k - 1];
  return Object.freeze({
    k, x: r2(STONES_AT.x + Math.cos(a) * RING_R), z: r2(STONES_AT.z + Math.sin(a) * RING_R), h, a: r2(a),
    w: r2(0.78 + 0.1 * b.hash01(k, 1, 4401) + (h > 2.5 ? 0.2 : 0)), d: 0.42, lean: r2((b.hash01(k, 2, 4401) - 0.5) * 0.12),
  });
}));
const STONE_R = 0.48;
// The stone table: two uprights under a capstone, its top at TABLE_TOP, with
// a fallen slab 1.9 m south of it as the step up.
export const TABLE = Object.freeze({ x: STONES_AT.x, z: STONES_AT.z, r: 1.1, top: 1.95 });
export const STEP_STONE = Object.freeze({ x: STONES_AT.x, z: r2(STONES_AT.z + 1.9), r: 0.6, top: 0.55 });
const CLIMB_PERCHES = [
  Object.freeze({ x: STEP_STONE.x, z: STEP_STONE.z, y: STEP_STONE.top, kind: 'stone' }),
  (() => {
    const p = { x: TABLE.x, z: TABLE.z, y: TABLE.top, kind: 'stone', vantage: true };
    Object.defineProperty(p, 'label', { enumerable: true, get() { return phrase('moor.north.lookout'); } });
    return Object.freeze(p);
  })(),
];
// The two short ring stones are places to sit and look out, as the core's tors are.
export const NORTH_PERCHES = Object.freeze([
  ...RING_STONES.filter((s) => s.h < 1.6).map((s) => Object.freeze({ x: s.x, z: s.z, y: s.h, kind: 'stone' })),
  ...CLIMB_PERCHES,
]);
export const STONE_COLLIDERS = Object.freeze([
  ...RING_STONES.map((s) => Object.freeze({ x: s.x, z: s.z, r: STONE_R })),
  Object.freeze({ x: TABLE.x, z: TABLE.z, r: TABLE.r }),
  Object.freeze({ x: STEP_STONE.x, z: STEP_STONE.z, r: STEP_STONE.r }),
]);
const stonesDist = (x, z) => Math.hypot(x - STONES_AT.x, z - STONES_AT.z);

// --- the faint trail ----------------------------------------------------------------
// From the end of the sheep path by the warren (moordress.js SHEEP_PATHS),
// round the tor there, through the east gap, along the north side of the
// tarn and in at the ring's open place. Narrow and pale: a track cats made.
export const NORTH_TRAIL = Object.freeze([
  [30, -42.5, 31, -47], [31, -47, 29, WALL_Z], [29, WALL_Z, 24.5, -57.5], [24.5, -57.5, 17, -62],
  [17, -62, 8, -63.5], [8, -63.5, 0.6, -69.4],
].map((s) => Object.freeze(s)));
export const NORTH_TRAIL_W = 1.3;
const TRAIL_STYLE = { surface: 'sand', color: 0x9a8a66 };
const trailDist = (x, z) => {
  let m = Infinity;
  for (const s of NORTH_TRAIL) m = Math.min(m, segDist(x, z, ...s));
  return m;
};

// --- the rests and the finds -----------------------------------------------------------
const NAP = Object.freeze({ x: r2(TABLE.x - 1.95), z: r2(TABLE.z + 0.2) });
const DRINK = Object.freeze({ x: r2(TARN.x - TARN.r - 0.65), z: TARN.z });
export const NORTH_RESTS = Object.freeze([
  Object.freeze({ id: 'moor-nap-1', kind: 'nap', x: NAP.x, z: NAP.z, mesh: false }),
  Object.freeze({ id: 'moor-drink-1', kind: 'drink', x: DRINK.x, z: DRINK.z, mesh: false }),
]);
const LOOKOUT = CLIMB_PERCHES[1];
const find = (id, x, z, say, y) => {
  const c = { id, x, z, ...(y === undefined ? {} : { y }) };
  Object.defineProperty(c, 'label', { enumerable: true, get: say });
  return c;
};
export function northCollectibles() {
  return [
    find('moor-find-6', LOOKOUT.x, LOOKOUT.z, () => phrase('moor.north.wool'), LOOKOUT.y),
    find('moor-find-7', 18.5, -69.5, () => phrase('moor.north.beetle')),
    find('moor-find-8', 40, -84, () => phrase('moor.north.bilberry')),
    find('moor-find-9', -40, -80, () => phrase('moor.north.feather')),
  ];
}
const SCENIC = Object.freeze({ x: -0.4, z: -70.2 });
export function northScenics() {
  return [find('moor-standing-stones', SCENIC.x, SCENIC.z, () => phrase('moor.north.scenic'))];
}
const FINDS = Object.freeze([[18.5, -69.5], [40, -84], [-40, -80], [SCENIC.x, SCENIC.z], [NAP.x, NAP.z], [DRINK.x, DRINK.z]]);
const findDist = (x, z) => {
  let m = Infinity;
  for (const [fx, fz] of FINDS) m = Math.min(m, Math.hypot(x - fx, z - fz));
  return m;
};

// --- what may grow where ---------------------------------------------------------------
const inStrip = (x, z) => x >= NORTH.minX && x <= NORTH.maxX && z >= NORTH.minZ && z <= NORTH.maxZ;
// 0 at the old edge, 1 at the new rim: everything thins toward the rim.
const rimward = (z) => clamp01((NORTH.maxZ - z) / (NORTH.maxZ - NORTH.minZ));
const torDist = (x, z) => {
  let m = Infinity;
  for (const t of strippedTors()) m = Math.min(m, Math.hypot(x - t.x, z - t.z) - t.r);
  return m;
};
// A low thing (heather, gorse, grass, a flower, a stone): on the strip, off
// the trail, the wall, the tors, the tarn, the stones and every spot to find.
function lowFits(x, z, { trail = 1.3, wall = 0.9, tor = 0.4, tarn = 0.6, ring = RING_R + 1, find = 1.6 } = {}) {
  return inStrip(x, z) && trailDist(x, z) >= trail && wallDist(x, z) >= wall && torDist(x, z) >= tor
    && tarnDist(x, z) >= tarn && stonesDist(x, z) >= ring && findDist(x, z) >= find;
}

// The trees: a 3 x 3 jittered grid a tile, each candidate kept with a chance
// that falls from 0.14 at the old edge to 0.06 at the rim: a thorn on the
// open moor, a pine where the Pines reach over the west border (x under
// -42), as in the core. Candidates stay 2 m inside their tile and 6 m apart
// (a moor's thorns stand alone), so no tile needs its neighbour. Every
// candidate draws its numbers whether or not it is kept. Four trees on the
// strip's 4,000 square metres (the core has 15 on 10,000), three of them in
// its near half.
const TREE_INSET = 2;
const TREE_GRID = 3;
const TREE_JITTER = 1.4;
const TREE_APART = 6;
const THORN_REACH = 1.6;
const PINE_REACH = 1.3;
function tileTrees(tile) {
  const rng = mulberry32(seedFromCode(tileSeed('moor', NORTH.id, tile.index, 'trees')));
  const cellX = (tile.maxX - tile.minX - 2 * TREE_INSET) / TREE_GRID;
  const cellZ = (tile.maxZ - tile.minZ - 2 * TREE_INSET) / TREE_GRID;
  const out = [];
  for (let j = 0; j < TREE_GRID; j++) {
    for (let i = 0; i < TREE_GRID; i++) {
      const x = r2(tile.minX + TREE_INSET + (i + 0.5) * cellX + (rng() * 2 - 1) * TREE_JITTER);
      const z = r2(tile.minZ + TREE_INSET + (j + 0.5) * cellZ + (rng() * 2 - 1) * TREE_JITTER);
      const roll = rng();
      const size = rng();
      const pine = x < -42;
      if (roll >= (pine ? 0.12 : 0.14 - 0.08 * rimward(z))) continue;
      const kind = pine ? 'pine' : 'thorn';
      const scale = r2(pine ? 1.1 + 0.4 * size : 0.8 + 0.35 * size);
      const reach = (pine ? PINE_REACH : THORN_REACH) * scale;
      if (trailDist(x, z) < NORTH_TRAIL_W / 2 + reach + 0.5) continue;
      if (wallDist(x, z) < reach + 1 || torDist(x, z) < 3 || tarnDist(x, z) < 4) continue;
      if (stonesDist(x, z) < RING_R + 4 || findDist(x, z) < 4) continue;
      if (out.some((t) => Math.hypot(t.x - x, t.z - z) < TREE_APART)) continue;
      out.push(Object.freeze({ kind, x, z, scale, r: r2((pine ? 0.4 : 0.5) * scale) }));
    }
  }
  return out;
}

// Moor grass in clumps, stones (a few half-buried groups, and clitter at the
// foot of each tor), tormentil (small yellow moor flowers, drawn as
// render/striptiles.js's marigold) and reed clumps round the tarn, off
// jittered grids by hash, as moordress.js scatters.
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
  grid(3.4, 4501, (cx, cz, roll) => {
    if (roll > 0.36 - 0.3 * rimward(cz)) return;
    const n = 1 + Math.floor(b.hash01(cx, cz, 4515) * 3);
    for (let k = 0; k < n; k++) {
      const a = b.hash01(cx + k, cz, 4529) * Math.PI * 2;
      const d = k === 0 ? 0 : 0.35 + 0.4 * b.hash01(cx, cz + k, 4543);
      const x = r2(cx + Math.cos(a) * d), z = r2(cz + Math.sin(a) * d);
      if (!inTile(x, z) || !lowFits(x, z, { trail: 1.1, wall: 0.7, tor: 0.2, ring: RING_R + 0.8 }) || !offTrunk(x, z)) continue;
      tussocks.push(Object.freeze({ x, z, h: r2(0.24 + 0.18 * b.hash01(x, z, 4557)), s: r2(0.75 + 0.35 * b.hash01(z, x, 4571)) }));
    }
  });
  const flowers = [];
  grid(4.8, 4585, (x, z, roll) => {
    if (roll > 0.26 - 0.12 * rimward(z) || !lowFits(x, z, { trail: 1.1 }) || !offTrunk(x, z)) return;
    flowers.push(Object.freeze({ x: r2(x), z: r2(z), s: r2(0.6 + 0.3 * b.hash01(x, z, 4599)) }));
  });
  const stones = [];
  grid(9, 4613, (cx, cz, roll) => {
    if (roll > 0.42 - 0.15 * rimward(cz)) return;
    const n = 2 + Math.floor(b.hash01(cx, cz, 4627) * 2);
    for (let k = 0; k < n; k++) {
      const a = b.hash01(cx + k, cz, 4641) * Math.PI * 2;
      const r = r2(k === 0 ? 0.26 + 0.12 * b.hash01(cx, cz, 4655) : 0.14 + 0.1 * b.hash01(cx, cz + k, 4669));
      const d = k === 0 ? 0 : 0.3 + r + 0.15 * b.hash01(cx + k, cz + k, 4683);
      const x = r2(cx + Math.cos(a) * d), z = r2(cz + Math.sin(a) * d);
      if (!inTile(x, z) || !lowFits(x, z, { trail: 1.4, wall: 1.0 }) || !offTrunk(x, z)) continue;
      stones.push(Object.freeze({ x, z, r }));
    }
  });
  // clitter: the broken rock at a tor's foot, as moordress.js rings the core's
  strippedTors().forEach((t, ti) => {
    for (let k = 0; k < 9; k++) {
      const a = ((k + 0.6 * b.hash01(k, ti, 4697)) / 9) * Math.PI * 2;
      const d = t.r * (1.0 + 0.3 * b.hash01(ti, k, 4711));
      const x = r2(t.x + Math.cos(a) * d), z = r2(t.z + Math.sin(a) * d);
      if (!inTile(x, z) || !inStrip(x, z) || trailDist(x, z) < 1.4 || wallDist(x, z) < 0.6) continue;
      stones.push(Object.freeze({ x, z, r: r2(0.16 + 0.16 * b.hash01(x, z, 4725)) }));
    }
  });
  // reeds round the tarn, half a metre out
  const reeds = [];
  const ringR = TARN.r + 0.5;
  const n = Math.round((Math.PI * 2 * ringR) / 2.1);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    const x = r2(TARN.x + Math.cos(a) * ringR), z = r2(TARN.z + Math.sin(a) * ringR);
    if (!inTile(x, z) || trailDist(x, z) < 1.4 || findDist(x, z) < 1.6) continue;
    reeds.push(Object.freeze({ x, z }));
  }
  return { reeds, tussocks, flowers, stones };
}

// northTileContent(index) -> what grows on that tile: a pure function of the
// index, worked out once and kept. `small` is the low layer by kind
// (render/striptiles.js SMALL_KINDS).
const CONTENT = new Map();
export function northTileContent(index) {
  let c = CONTENT.get(index);
  if (!c) {
    const tile = NORTH_TILES[index];
    const trees = tileTrees(tile);
    const { reeds, tussocks, flowers, stones } = tileLow(tile, trees);
    c = Object.freeze({
      trees: Object.freeze(trees),
      small: Object.freeze({
        reed: Object.freeze(reeds), tussock: Object.freeze(tussocks), cattail: Object.freeze([]),
        marigold: Object.freeze(flowers), stone: Object.freeze(stones),
      }),
    });
    CONTENT.set(index, c);
  }
  return c;
}

// Every strip tree, tile by tile: the colliders and Sure Claws forks a walk
// has from its first frame, read from the same content the meshes are built
// from later. A thorn has a low fork; a pine has none (the core's rule).
export function northTrees() {
  return NORTH_TILES.flatMap((t) => northTileContent(t.index).trees);
}
export const northTreeColliders = () => northTrees().map(({ x, z, r }) => ({ x, z, r }));
export const northTreePerches = () => northTrees().filter((t) => t.kind === 'thorn').map(({ x, z, scale }) => sureClawsTreePerch(x, z, scale));

// One strip tree as the core builds its own (builder.tree, builder.pine).
export function buildNorthTree(t, { wind } = {}) {
  return t.kind === 'pine' ? b.pine(t.x, t.z, t.scale, { wind }) : b.tree(t.x, t.z, t.scale, { wind });
}

// The strip, as render/striptiles.js streams it.
export const NORTH_STRIP = Object.freeze({
  areaId: 'moor', id: NORTH.id, rect: NORTH, tiles: NORTH_TILES,
  content: northTileContent, buildTree: buildNorthTree,
});

// --- the heather and the gorse ------------------------------------------------------------
// The core's heather and gorse are each a Group of two merged meshes
// (builder.heatherBed, builder.gorseBed), which render/striptiles.js cannot
// cut per tile, so the core's stay whole. The strip's own are made by the
// same builders on the strip's spots, and their two meshes are put in the
// scene on their own, each tagged to stream (world/streamcore.js) with the
// spots they were built from: the core's streams (cut over the grown Moor,
// see moor.js) draw them per tile near the cat, with stand-ins further off,
// exactly as they draw the core's merged reeds and dressing. The heather's
// flowers keep their rustle (render/rustle.js finds them in the scene).
//
// Heather at about half the core's cushions to the square metre at the old
// edge, thinning to a third of that at the rim; gorse in a few clumps, most
// of them against the wall's north face, where it grows out of the wind.
const HEATHER = Object.freeze({ cell: 2.6, jitter: 0.9 });
const GORSE = Object.freeze({ cell: 11, jitter: 3 });
function tileBeds(tile) {
  const rng = mulberry32(seedFromCode(tileSeed('moor', NORTH.id, tile.index, 'beds')));
  const heather = [];
  for (let gz = tile.minZ + HEATHER.cell / 2; gz < tile.maxZ; gz += HEATHER.cell) {
    for (let gx = tile.minX + HEATHER.cell / 2; gx < tile.maxX; gx += HEATHER.cell) {
      const x = r2(gx + (rng() * 2 - 1) * HEATHER.jitter);
      const z = r2(gz + (rng() * 2 - 1) * HEATHER.jitter);
      const keep = rng() < 0.28 - 0.22 * rimward(z);
      if (!keep || x < tile.minX || x >= tile.maxX || z < tile.minZ || z >= tile.maxZ) continue;
      if (!lowFits(x, z, { trail: 2.0, wall: 1.1, tor: 0.6, tarn: 1.0, find: 2.4 })) continue;
      heather.push(Object.freeze({ x, z }));
    }
  }
  const gorse = [];
  for (let gz = tile.minZ + GORSE.cell / 2; gz < tile.maxZ; gz += GORSE.cell) {
    for (let gx = tile.minX + GORSE.cell / 2; gx < tile.maxX; gx += GORSE.cell) {
      const x = r2(gx + (rng() * 2 - 1) * GORSE.jitter);
      const z = r2(gz + (rng() * 2 - 1) * GORSE.jitter);
      const keep = rng() < 0.18;
      if (!keep || x < tile.minX || x >= tile.maxX || z < tile.minZ || z >= tile.maxZ) continue;
      if (!lowFits(x, z, { trail: 3.5, wall: 2.0, tor: 1.5, tarn: 2.5, find: 4 })) continue;
      gorse.push(Object.freeze({ x, z }));
    }
  }
  return { heather, gorse };
}
// Against the wall's north face, every 9 m or so along a run, off the gaps.
const wallGorse = once(() => {
  const out = [];
  WALL_RUNS.forEach((run, ri) => {
    alongRun(run, 1).forEach(([x, z], k) => {
      if (k % 9 !== 4 || b.hash01(x, ri, 4801) > 0.55) return;
      const gx = r2(x + (b.hash01(k, ri, 4815) - 0.5) * 0.8), gz = r2(z - 1.45);
      if (!lowFits(gx, gz, { trail: 3.5, wall: 1.2, tor: 1.5, find: 4 })) return;
      if (WALL_GAPS.some((g) => Math.abs(g.x - gx) < 5)) return;
      out.push(Object.freeze({ x: gx, z: gz }));
    });
  });
  return out;
});
const BEDS = once(() => {
  const per = NORTH_TILES.map(tileBeds);
  return Object.freeze({
    heather: Object.freeze(per.flatMap((p) => p.heather)),
    gorse: Object.freeze([...per.flatMap((p) => p.gorse), ...wallGorse()]),
  });
});
export const northHeather = () => BEDS().heather;
export const northGorse = () => BEDS().gorse;

// The four meshes, each a top-level scene child tagged to stream; a spot's
// parts reach about 0.9 m from it (heather) or 1.1 m (gorse).
function northBeds() {
  const out = [];
  const take = (group, items, r, layer) => {
    for (const m of [...group.children]) {
      group.remove(m);
      m.name = `north-${m.name}`;
      streamSmall(m, items.map(({ x, z }) => ({ x, z, r })), { layer });
      out.push(m);
    }
  };
  take(b.heatherBed(northHeather(), seedFromCode('moor-north-heather')), northHeather(), 0.9, 'fine');
  take(b.gorseBed(northGorse(), seedFromCode('moor-north-gorse')), northGorse(), 1.1, 'small');
  return out;
}

// --- the stone: the wall, the ring, the stone table, the far tors -------------------------
// One mesh, one draw: everything of granite the strip stands up, which casts
// (as the core's tors do).
const GRANITE = [lin(0x8e8c88), lin(0x9a968e), lin(0x7f7d78)];
const WALL_GREYS = [lin(0x6f6b64), lin(0x7d7970), lin(0x64615b)];
const CAPS = [lin(0x7a766d), lin(0x716e66)];
const LICHEN = lin(0xb8b48a);
const MOSS = lin(0x5f7a32);
const MOSS_LIGHT = lin(0x86a046);
const ICO_TOP = 0.8507; // IcosahedronGeometry(1, 0)'s highest vertex

// A granite rock as moordress.js draws one: a squashed icosahedron, its top
// at y0 + h, part of it buried, grey, lighter toward the top, lichen on one
// in five.
function rock(x, z, r, h, salt, { buried = 0.5, y0 = 0 } = {}) {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const sy = ((1 + buried) * h) / (2 * ICO_TOP);
  g.scale(r, sy, r * 0.85);
  g.rotateY(b.hash01(x, z, salt) * Math.PI * 2);
  g.translate(x, y0 + h - ICO_TOP * sy, z);
  const grey = GRANITE[Math.floor(b.hash01(z, x, salt + 1) * 3)];
  const lichen = b.hash01(x, z, salt + 2) < 0.2;
  return colorParts(g, (vx, vy, vz) => {
    const up = clamp01((vy - y0) / h);
    const k = (0.78 + 0.32 * up) * (0.94 + 0.12 * b.hash01(Math.round(vx * 50), Math.round(vz * 50), salt + 3));
    let c = scale3(grey, k);
    if (lichen && up > 0.45 && b.hash01(Math.round(vx * 60), Math.round(vz * 60), salt + 4) < 0.5) c = lerp3(c, LICHEN, 0.65);
    return c;
  });
}

// A box with its corners nudged (a quarried stone), its foot at y 0, turned
// by `yaw` and leaning by `lean`, coloured from the foot up.
function slab(x, z, w, d, h, yaw, lean, salt, { foot = 0, colours = GRANITE, top = null, segs = [1, 1] } = {}) {
  const g = new THREE.BoxGeometry(w, h, d, segs[0], segs[1], 1);
  g.translate(0, h / 2 + foot, 0);
  const p = g.attributes.position;
  for (let v = 0; v < p.count; v++) {
    const px = p.getX(v), py = p.getY(v), pz = p.getZ(v);
    const key = [Math.round(px * 100), Math.round(py * 100), Math.round(pz * 100)];
    const j = 0.88 + 0.24 * b.hash01(key[0] + key[1], key[2], salt);
    const taper = py > foot + h * 0.5 ? 0.86 : 1;
    const dy = py > foot + h - 1e-6 ? (b.hash01(key[0], key[2], salt + 7) - 0.5) * 0.12 * Math.min(1, h * 2) : 0;
    p.setXYZ(v, px * j * taper, py + dy, pz * (0.9 + 0.2 * b.hash01(key[2], key[0] + key[1], salt + 1)) * taper);
  }
  g.rotateZ(lean);
  g.rotateY(yaw);
  g.translate(x, 0, z);
  const grey = colours[Math.floor(b.hash01(x, z, salt + 2) * colours.length)];
  const lichen = b.hash01(z, x, salt + 3) < 0.45;
  return colorParts(g, (vx, vy, vz) => {
    const up = clamp01(vy / Math.max(0.3, h + foot));
    let c = scale3(grey, (0.74 + 0.34 * up) * (0.94 + 0.12 * b.hash01(Math.round(vx * 40), Math.round(vz * 40), salt + 4)));
    if (top && vy > foot + h - 0.04) c = top;
    if (lichen && up > 0.5 && b.hash01(Math.round(vx * 30), Math.round(vz * 30 + vy * 30), salt + 5) < 0.4) c = lerp3(c, LICHEN, 0.6);
    return c;
  });
}

// A weathered standing stone: a seven-sided column, wider at the foot, its
// sides nudged in and out (keyed on the corner, so it stays closed) and its
// top pulled in and rounded, flat-shaded, each facet its own tone of grey.
// `w` x `d` is its foot, `h` its height above `foot`.
function roughStone(x, z, w, d, h, yaw, lean, salt, { foot = 0, sides = 7, rings = 3, roundTop = 0.35, colours = GRANITE } = {}) {
  const pts = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const y = foot + h * t;
    const shrink = (1 - 0.22 * t) * (j === rings ? 1 - roundTop : 1);
    const ring = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 + 0.3 * b.hash01(i, 0, salt);
      const k = shrink * (0.86 + 0.28 * b.hash01(i, j, salt + 1));
      ring.push([Math.cos(a) * (w / 2) * k, y + (j === rings ? -h * 0.06 * b.hash01(i, j, salt + 2) : 0), Math.sin(a) * (d / 2) * k]);
    }
    pts.push(ring);
  }
  const top = [0, foot + h * (1 + 0.02 * b.hash01(salt, 1, salt + 3)), 0];
  const tris = [];
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < sides; i++) {
      const i2 = (i + 1) % sides;
      const A = pts[j][i], B = pts[j][i2], C = pts[j + 1][i2], D = pts[j + 1][i];
      tris.push([A, C, B], [A, D, C]);
    }
  }
  for (let i = 0; i < sides; i++) tris.push([pts[rings][i], top, pts[rings][(i + 1) % sides]]);
  const pos = new Float32Array(tris.length * 9);
  tris.forEach((t, f) => t.forEach((v, k) => pos.set(v, f * 9 + k * 3)));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.rotateZ(lean);
  g.rotateY(yaw);
  g.translate(x, 0, z);
  return patchwork(colorParts(g, stoneTone(x, z, h + foot, salt, colours)), salt);
}

// The colour of granite at a point: the stone's grey, darker at the foot,
// with lichen on the upper half of about half the stones.
function stoneTone(x, z, h, salt, colours) {
  const grey = colours[Math.floor(b.hash01(x, z, salt + 4) * colours.length)];
  const lichen = b.hash01(z, x, salt + 5) < 0.5;
  return (vx, vy, vz) => {
    const up = clamp01(vy / Math.max(0.3, h));
    let c = scale3(grey, 0.7 + 0.36 * up);
    if (lichen && up > 0.45 && b.hash01(Math.round(vx * 9), Math.round(vz * 9 + vy * 9), salt + 6) < 0.35) c = lerp3(c, LICHEN, 0.55);
    return c;
  };
}

// Each triangle a little lighter or darker than the next, so a flat-shaded
// stone reads as worked, weathered granite rather than one smooth grey.
function patchwork(g, salt, amount = 0.16) {
  const c = g.attributes.color;
  for (let f = 0; f < c.count; f += 3) {
    const k = 1 - amount / 2 + amount * b.hash01(f, salt, 5501);
    for (let v = f; v < f + 3; v++) c.setXYZ(v, c.getX(v) * k, c.getY(v) * k, c.getZ(v) * k);
  }
  return g;
}

// A box's two downward faces are never seen (it stands on the ground or on
// the course below).
function dropBottom(g) {
  const p = g.attributes.position;
  let low = Infinity;
  for (let v = 0; v < p.count; v++) low = Math.min(low, p.getY(v));
  const keep = [];
  for (let f = 0; f < p.count; f += 3) {
    const y0 = p.getY(f), y1 = p.getY(f + 1), y2 = p.getY(f + 2);
    if (!(Math.abs(y0 - low) < 1e-6 && Math.abs(y1 - low) < 1e-6 && Math.abs(y2 - low) < 1e-6)) keep.push(f);
  }
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const a = g.attributes[name];
    const arr = new Float32Array(keep.length * 9);
    let o = 0;
    for (const f of keep) for (let v = 0; v < 3; v++) for (let c = 0; c < 3; c++) arr[o++] = a.array[(f + v) * 3 + c];
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  g.dispose();
  return out;
}

// The wall: blocks about 2 m long laid along each run, two courses under
// capstones, as the band's edge wall is drawn; the last block or two by a
// gap tumbled lower, and a few fallen stones in the gap's mouth.
function wallParts() {
  const parts = [];
  WALL_RUNS.forEach((run, ri) => {
    for (let i = 0; i < run.length - 1; i++) {
      const [x1, z1] = run[i], [x2, z2] = run[i + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      const n = Math.max(1, Math.round(len / 2));
      const yaw = Math.atan2(-(z2 - z1), x2 - x1);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
        const h0 = WALL_H[0] + (WALL_H[1] - WALL_H[0]) * b.hash01(x, z, 4901 + ri);
        const gap = Math.min(...WALL_GAPS.map((g) => Math.hypot(g.x - x, g.z - z)));
        const h = gap < 3.2 ? h0 * 0.55 : gap < 5 ? h0 * 0.8 : h0;
        const L = len / n + 0.18;
        const body = slab(x, z, L, WALL_THICK, h * 0.86, yaw + (b.hash01(k, ri, 4911) - 0.5) * 0.04, 0, 4921 + ri * 31 + k,
          { colours: WALL_GREYS, segs: [2, 2] });
        const cap = slab(x, z, L * 0.96, WALL_THICK * 0.74, h * 0.14, yaw, 0, 4945 + ri * 31 + k, { foot: h * 0.86, colours: CAPS });
        parts.push(patchwork(dropBottom(body), 4931 + ri * 31 + k, 0.42), patchwork(dropBottom(cap), 4957 + ri * 31 + k, 0.24));
      }
    }
  });
  // fallen stones in each gap's mouth, either side of the way through
  WALL_GAPS.forEach((g, gi) => {
    for (let k = 0; k < 5; k++) {
      const side = k % 2 === 0 ? -1 : 1;
      const x = g.x + side * (1.5 + 0.35 * b.hash01(k, gi, 4961));
      const z = g.z + (b.hash01(gi, k, 4975) - 0.5) * 2.4;
      parts.push(rock(r2(x), r2(z), 0.22 + 0.12 * b.hash01(k, gi, 4989), 0.2 + 0.1 * b.hash01(gi, k, 5003), 5017 + gi * 7 + k));
    }
  });
  return parts;
}

// The ring and the stone table, and the moss under the nap.
function stoneRingParts() {
  const parts = [];
  for (const s of RING_STONES) {
    // broadside to the centre, as a ring's stones stand
    const yaw = -(s.a + Math.PI / 2);
    parts.push(roughStone(s.x, s.z, s.w * 1.15, s.d * 1.3, s.h, yaw, s.lean, 5101 + s.k * 13));
  }
  // the stone table: two uprights east and west, the capstone over them, its
  // top TABLE.top, a little tilted
  const T = TABLE;
  const capH = 0.36;
  for (const side of [-1, 1]) {
    parts.push(roughStone(T.x + side * 0.72, T.z, 0.6, 1.25, T.top - capH + 0.08, 0.15 * side, 0, 5201 + side, { roundTop: 0.1 }));
  }
  parts.push(roughStone(T.x, T.z, 2.8, 1.8, capH, 0.12, 0.03, 5221, { foot: T.top - capH, sides: 9, rings: 1, roundTop: 0.12 }));
  // the fallen slab, the step up: long, low, half sunk
  parts.push(roughStone(STEP_STONE.x, STEP_STONE.z, 1.6, 1.05, STEP_STONE.top + 0.05, 0.4, 0, 5241, { foot: -0.05, sides: 8, rings: 1, roundTop: 0.15 }));
  // the mossy hollow to nap in, and the flat stone at the tarn to drink from
  const bed = new THREE.CylinderGeometry(0.6, 0.7, 0.07, 9);
  bed.translate(NAP.x, 0.035, NAP.z);
  parts.push(colorParts(bed, (x, y, z) => scale3(lerp3(MOSS, MOSS_LIGHT, b.hash01(Math.round(x * 6), Math.round(z * 6), 5261)), 0.95)));
  const flat = new THREE.DodecahedronGeometry(0.5, 0);
  flat.scale(1.1, 0.16, 0.8);
  flat.rotateY(0.9);
  flat.translate(DRINK.x - 0.15, 0.03, DRINK.z);
  parts.push(patchwork(colorParts(flat, (x, y, z) => scale3(GRANITE[2], 0.62 + 0.2 * b.hash01(Math.round(x * 5), Math.round(z * 5), 5275))), 5281));
  return parts;
}

// Three big tors out past the new edge, in front of the far wall, so the
// skyline from the strip is a moor's (moordress.js's far tors, the same make).
export const NEW_FAR_TORS = Object.freeze([
  { x: -30, z: -95, r: 2.2, h: 3.2 },
  { x: 7, z: -95.5, r: 2.6, h: 3.8 },
  { x: 33, z: -94.5, r: 2.0, h: 2.9 },
].map((t) => Object.freeze(t)));
function farTorParts() {
  const parts = [];
  const blocks = [[1, 0, 0.46, 0], [0.72, 0.36, 0.38, 0.14], [0.48, 0.66, 0.34, 0.12]];
  NEW_FAR_TORS.forEach((t, i) => {
    blocks.forEach(([rs, foot, tall, drift], k) => {
      const a = b.hash01(t.x, t.z, 5301 + k) * Math.PI * 2;
      parts.push(rock(t.x + Math.cos(a) * t.r * drift, t.z + Math.sin(a) * t.r * drift, t.r * rs, t.h * tall, 5311 + i * 7 + k,
        { buried: k === 0 ? 0.4 : 0.15, y0: t.h * foot }));
    });
  });
  return parts;
}

function stoneGeometry() {
  const parts = [...wallParts(), ...stoneRingParts(), ...farTorParts()];
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return geo;
}

// --- the ground --------------------------------------------------------------------------
// The core's rolling heath tint, greener and wetter round the tarn, and worn
// to short pale turf inside the ring.
const WET = [0.88, 0.98, 0.86];
const WORN = [1.08, 1.06, 0.9];
export function northGroundTint(x, z) {
  let m = moorGroundTint(x, z);
  const wet = smoothstep(0, 1, 1 - tarnDist(x, z) / 3);
  if (wet > 0) m = lerp3(m, WET, wet);
  const worn = 1 - smoothstep(RING_R - 1.5, RING_R + 1.5, stonesDist(x, z));
  if (worn > 0) m = lerp3(m, WORN, worn * 0.7);
  return m;
}

/**
 * addNorthStrip(scene, { groundMesh, water, waters, waterColor })
 *
 * Everything of the strip that is whole from the start of a walk, added after
 * the core's own things and wholly under local uuids. Each top-level object
 * is tagged userData.strip, so a test (and the budget) can tell the strip
 * from the core. Returns { waterFx } for the tarn.
 */
export function addNorthStrip(scene, { groundMesh, water = {}, waters, waterColor }) {
  return withLocalUuids('moor-north-strip', () => {
    const tag = (o) => { o.userData.strip = NORTH.id; return o; };
    // more of the same ground, tinted as the core's is
    const patch = b.groundPatch(groundMesh, NORTH_GROUND, { surface: 'grass' });
    patch.updateMatrix();
    const attr = patch.geometry.attributes.color;
    const pos = patch.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const m = northGroundTint(patch.position.x + pos.getX(i), patch.position.z - pos.getY(i));
      attr.setXYZ(i, attr.getX(i) * m[0], attr.getY(i) * m[1], attr.getZ(i) * m[2]);
    }
    patch.name = 'stripGround';
    scene.add(tag(patch));

    // the tarn
    const fx = createWater(TARN, {
      color: waterColor, ...TARN_LOOK,
      quality: water.quality ?? 'high', reducedMotion: water.reducedMotion ?? false, waters,
    });
    scene.add(tag(fx.mesh));

    // the faint trail
    const { mesh: trail } = addTrails(scene, [{ segs: NORTH_TRAIL, w: NORTH_TRAIL_W }], TRAIL_STYLE, 'moor-north',
      { edge: 1e6, decks: [], waters });
    for (const o of scene.children) if (o.name === 'path' && !o.userData.strip && isNorthTrailStrip(o)) tag(o);
    if (trail) tag(trail);

    // the wall, the standing stones, the stone table and the far tors
    const stone = new THREE.Mesh(stoneGeometry(),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
    stone.name = 'northStones';
    scene.add(tag(stone));

    // the heather and the gorse, streamed by the core's streams
    for (const m of northBeds()) scene.add(tag(m));
    return { waterFx: fx };
  });
}

// A hidden 'path' data strip that is one of the trail's (addTrails adds them
// in order, at each segment's midpoint).
function isNorthTrailStrip(o) {
  return NORTH_TRAIL.some(([x1, z1, x2, z2]) => Math.abs(o.position.x - (x1 + x2) / 2) < 1e-6 && Math.abs(o.position.z - (z1 + z2) / 2) < 1e-6);
}

// Everything solid the strip adds, in the order moor.js pushes them: the
// trees, the wall, the tors, the stones.
export const northColliders = () => [...northTreeColliders(), ...WALL_COLLIDERS, ...torColliders(), ...STONE_COLLIDERS];
