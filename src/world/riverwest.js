import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as b from './builder.js';
import { mulberry32, seedFromCode } from '../rng.js';
import { segDist } from '../segdist.js';
import { sureClawsTreePerch } from '../climbing.js';
import { createWater } from '../render/water.js';
import { addTrails } from './pathribbon.js';
import { withLocalUuids } from './localuuids.js';
import { colorParts, Tris, lin, scale3, unit, lerp3, smoothstep, clamp01, r2 } from './dressing.js';
import { cutTiles, tileSeed, TILE_SIZE } from './strips.js';
import { riverGroundTint } from './riverdress.js';

// The strip's on-screen lines, for a 9-year-old, no series words: the same in
// both word sets.
const WORDS = Object.freeze({
  'river.west.lookout': 'fallen willow lookout',
  'river.west.scenic': 'the fallen willow by the still pool',
  'river.west.feather': 'a grey heron feather on the fallen willow',
  'river.west.snail': 'a snail shell in the tall reeds',
  'river.west.wing': 'a blue dragonfly wing by the river',
  'river.west.pebble': 'a round white pebble at the far bank',
});
export const WEST_WORD_IDS = Object.freeze(Object.keys(WORDS));
const phrase = (id) => WORDS[id];

// =============================================================================
// The River's west strip (bigger areas, step 1: the trial).
//
// Forty metres of new marsh west of the River's old edge, x -90..-50, where
// the river comes from. Only built when the "bigger areas" switch is on
// (src/grow.js); river.js asks for everything here from its build().
//
// The old 100 x 100 m River is the CORE and nothing in it moves: this file
// scatters from its own seeds, one stream per tile, and adds its things after
// the core's, under local uuids, so the core's trees, reeds, colliders and
// random draws are exactly what they are with the switch off.
//
// What is whole from the start of a walk: the ground, the river running on
// west, the still pool, the trail, the fallen willow (the thing to find) and
// every tree's collider and Sure Claws fork. What streams in near the cat
// (render/striptiles.js): each tile's trees, and its reeds, tussocks,
// cattails, marsh marigolds and stones.
//
// river.js imports this module and this module must not read river.js at its
// top level, so what it needs of the River (the river-west footprint) is
// handed in.
// =============================================================================

export const WEST = Object.freeze({ id: 'west', minX: -90, maxX: -50, minZ: -50, maxZ: 50 });
export const WEST_TILES = cutTiles(WEST, TILE_SIZE);
// The ground and the horizon reach as far past the new edge as they did past
// the old one (10 m of ground, the band's inner rim 6 m out).
export const WEST_GROUND = Object.freeze({ minX: -100, maxX: -60, minZ: -60, maxZ: 60 });
export const WEST_BAND_RECT = Object.freeze({ cx: -20, cz: 0, ex: 20, ez: 0 });
// The river's water must run on under the hills as far as it did.
export const WEST_RIVER_MINX = -160;

// The still pool: a round backwater south of the river, shallow enough to wade.
export const STILL_POOL = Object.freeze({ id: 'pool-west', kind: 'circle', x: -72, z: 4, r: 4, shallow: 1.0 });
export const STILL_POOL_LOOK = Object.freeze({ y: 0.03, color: 0x6f8f80, foamStrength: 0.22 });

// The river-west water as the strip sees it: the same banks, run on west.
const RIVER_Z = Object.freeze({ minZ: -34, maxZ: -29 });
const RIVER_RECT = Object.freeze({ kind: 'rect', minX: WEST_RIVER_MINX, maxX: 19, ...RIVER_Z });
const WATERS = Object.freeze([RIVER_RECT, STILL_POOL]);
const waterDist = (x, z) => Math.min(b.waterGap(RIVER_RECT, x, z), b.waterGap(STILL_POOL, x, z));

// --- the faint trail ----------------------------------------------------------
// It leaves the long path at its bend by the wet meadow (4, 30), slips between
// the reedbed and the pool-side willows (the core's own trees, which do not
// move for it), passes the fallen willow and ends near the far bank. Narrow
// and pale: a track cats made, not a path.
export const WEST_TRAIL = Object.freeze([
  [4, 30, -6, 23.6], [-6, 23.6, -28, 23.3], [-28, 23.3, -46, 23.5], [-46, 23.5, -56, 21.5],
  [-56, 21.5, -61.5, 19], [-61.5, 19, -70, 17.5], [-70, 17.5, -80, 14], [-80, 14, -86, 7],
].map((s) => Object.freeze(s)));
export const WEST_TRAIL_W = 1.3;
const TRAIL_STYLE = { surface: 'sand', color: 0x9a8a66 };

// --- the fallen willow --------------------------------------------------------
// A giant willow down beside the still pool, its root plate standing and its
// crown end in the water. A cat hops up at the pool end and along the trunk to
// the lookout at the roots: four perches, each higher than the last (so the
// jump key walks the chain upward), each over dry ground. Its solid block is
// a row of circles under the trunk and one under the roots.
const ROOT = Object.freeze({ x: -64.2, z: 13.6 });
const TIP = Object.freeze({ x: -70.2, z: 7.4 });
const TRUNK_LEN = Math.hypot(TIP.x - ROOT.x, TIP.z - ROOT.z);
const DIR = Object.freeze({ x: (TIP.x - ROOT.x) / TRUNK_LEN, z: (TIP.z - ROOT.z) / TRUNK_LEN });
const TRUNK_SINK = 0.12;
// The trunk's radius `s` metres from the roots: a slow taper, then the broken end.
const trunkR = (s) => (s <= 6.6 ? 0.714 - 0.0225 * s : Math.max(0.3, 0.5655 - 0.13 * (s - 6.6)));
const trunkTop = (s) => 2 * trunkR(s) - TRUNK_SINK;
const along = (s) => ({ x: r2(ROOT.x + DIR.x * s), z: r2(ROOT.z + DIR.z * s) });
export const FALLEN_WILLOW = Object.freeze({ root: ROOT, tip: TIP, length: TRUNK_LEN });

const WILLOW_STEPS = [6.4, 4.6, 2.6, 0.6];
export const WEST_PERCHES = Object.freeze(WILLOW_STEPS.map((s, i) => {
  const p = { ...along(s), y: r2(trunkTop(s)), kind: 'tree' };
  if (i === WILLOW_STEPS.length - 1) {
    Object.defineProperty(p, 'label', { enumerable: true, get() { return phrase('river.west.lookout'); } });
    p.vantage = true;
  }
  return Object.freeze(p);
}));
const TRUNK_COLLIDERS = [];
for (let s = 0.3; s <= 8.2; s += 0.9) TRUNK_COLLIDERS.push(Object.freeze({ ...along(s), r: r2(Math.min(0.62, trunkR(s))) }));
const ROOT_PLATE = Object.freeze({ ...along(-0.55), r: 1.1 });
export const WEST_COLLIDERS = Object.freeze([...TRUNK_COLLIDERS, ROOT_PLATE]);

// The two spots to rest: a mossy hollow in the lee of the roots to nap in,
// and a flat stone at the pool's edge to drink from. Rests as rests.js knows
// them; `mesh: false`, since the fallen willow's own mesh draws both.
const NAP = Object.freeze(along(-2.15));
const DRINK = Object.freeze({ x: r2(STILL_POOL.x + STILL_POOL.r + 0.65), z: STILL_POOL.z });
export const WEST_RESTS = Object.freeze([
  Object.freeze({ id: 'river-nap-1', kind: 'nap', x: NAP.x, z: NAP.z, mesh: false }),
  Object.freeze({ id: 'river-drink-1', kind: 'drink', x: DRINK.x, z: DRINK.z, mesh: false }),
]);

// The things to find. Labels go through the phrase table (both word sets).
const LOOKOUT = WEST_PERCHES[WEST_PERCHES.length - 1];
const find = (id, x, z, phraseId, y) => {
  const c = { id, x, z, ...(y === undefined ? {} : { y }) };
  Object.defineProperty(c, 'label', { enumerable: true, get() { return phrase(phraseId); } });
  return c;
};
export function westCollectibles() {
  return [
    find('river-find-6', LOOKOUT.x, LOOKOUT.z, 'river.west.feather', LOOKOUT.y),
    find('river-find-7', -58, -6, 'river.west.snail'),
    find('river-find-8', -72, -42, 'river.west.wing'),
    find('river-find-9', -86.5, 5, 'river.west.pebble'),
  ];
}
export function westScenics() {
  return [find('river-fallen-willow', -65.5, 9.5, 'river.west.scenic')];
}
const FINDS = Object.freeze([[-58, -6], [-72, -42], [-86.5, 5], [-65.5, 9.5], [NAP.x, NAP.z], [DRINK.x, DRINK.z]]);

// --- what may grow where -------------------------------------------------------
const trunkDist = (x, z) => segDist(x, z, along(-1.6).x, along(-1.6).z, TIP.x, TIP.z);
const trailDist = (x, z) => {
  let m = Infinity;
  for (const s of WEST_TRAIL) m = Math.min(m, segDist(x, z, ...s));
  return m;
};
const findDist = (x, z) => {
  let m = Infinity;
  for (const [fx, fz] of FINDS) m = Math.min(m, Math.hypot(x - fx, z - fz));
  return m;
};
const inStrip = (x, z) => x >= WEST.minX && x <= WEST.maxX && z >= WEST.minZ && z <= WEST.maxZ;
// 0 at the old edge, 1 at the new rim: everything thins toward the rim.
const rimward = (x) => clamp01((WEST.maxX - x) / (WEST.maxX - WEST.minX));

// A low thing (reed, tussock, flower, stone): dry, off the trail, off the
// fallen willow and its spots.
function lowFits(x, z, { water = 0.3, trail = 1.3, find = 1.6 } = {}) {
  return inStrip(x, z) && waterDist(x, z) >= water && trailDist(x, z) >= trail
    && trunkDist(x, z) >= 1.5 && findDist(x, z) >= find;
}

// The trees: a 3 x 3 jittered grid a tile, each candidate kept with a chance
// that falls from 0.36 at the old edge to 0.16 at the rim (about half the
// core's trees to the square metre near it, a third at the rim). A willow
// within 10 m of water, an alder on drier ground. Candidates stay 2 m inside
// their tile and at least 4 m apart, so two tiles' trees never crowd and no
// tile needs to know its neighbour's. Every candidate draws its numbers
// whether or not it is kept.
const TREE_INSET = 2;
const TREE_GRID = 3;
const TREE_JITTER = 1.2;
const TREE_APART = 4;
function tileTrees(tile) {
  const rng = mulberry32(seedFromCode(tileSeed('river', WEST.id, tile.index, 'trees')));
  const cell = (tile.maxX - tile.minX - 2 * TREE_INSET) / TREE_GRID;
  const out = [];
  for (let j = 0; j < TREE_GRID; j++) {
    for (let i = 0; i < TREE_GRID; i++) {
      const x = r2(tile.minX + TREE_INSET + (i + 0.5) * cell + (rng() * 2 - 1) * TREE_JITTER);
      const z = r2(tile.minZ + TREE_INSET + (j + 0.5) * cell + (rng() * 2 - 1) * TREE_JITTER);
      const roll = rng();
      const size = rng();
      if (roll >= 0.36 - 0.2 * rimward(x)) continue;
      const wd = waterDist(x, z);
      const kind = wd < 10 ? 'willow' : 'alder';
      const scale = r2(kind === 'willow' ? 1.1 + 0.4 * size : 0.9 + 0.4 * size);
      const reach = 1.6 * scale;
      if (wd < 3 || trailDist(x, z) < WEST_TRAIL_W / 2 + reach + 0.5) continue;
      if (trunkDist(x, z) < 5 || findDist(x, z) < 4) continue;
      if (out.some((t) => Math.hypot(t.x - x, t.z - z) < TREE_APART)) continue;
      out.push(Object.freeze({ kind, x, z, scale, r: r2(0.5 * scale) }));
    }
  }
  return out;
}

// The reeds. The core's west reedbed (z -27..22) carries on into the strip and
// thins out by x -78; clumps stand along both river banks and round the still
// pool. About half the core's reeds to the square metre at the old edge.
const REED_BED = Object.freeze({ minZ: -27, maxZ: 22, fadeTo: -78 });
const REED_GRID = 1.6;
const REED_JITTER = 0.55;
const REED_APART = 1.0;
function tileReeds(tile, trees) {
  const rng = mulberry32(seedFromCode(tileSeed('river', WEST.id, tile.index, 'reeds')));
  const out = [];
  const add = (x, z) => {
    x = r2(x); z = r2(z);
    if (x < tile.minX || x >= tile.maxX || z < tile.minZ || z >= tile.maxZ) return;
    if (!lowFits(x, z, { water: 0.25, trail: 1.5, find: 2 })) return;
    if (trees.some((t) => Math.hypot(x - t.x, z - t.z) < 0.8 * t.scale)) return;
    if (out.some((p) => Math.hypot(x - p.x, z - p.z) < REED_APART)) return;
    out.push(Object.freeze({ x, z }));
  };
  for (let gz = tile.minZ + REED_GRID / 2; gz < tile.maxZ; gz += REED_GRID) {
    for (let gx = tile.minX + REED_GRID / 2; gx < tile.maxX; gx += REED_GRID) {
      const x = gx + (rng() * 2 - 1) * REED_JITTER;
      const z = gz + (rng() * 2 - 1) * REED_JITTER;
      const keep = rng();
      if (z < REED_BED.minZ || z > REED_BED.maxZ) continue;
      const thin = clamp01((x - REED_BED.fadeTo) / (WEST.maxX - REED_BED.fadeTo));
      if (keep < 0.9 * thin * thin && waterDist(x, z) >= 0.5) add(x, z);
    }
  }
  // the river's banks, half a metre out, every 4 m (the core: every 2 m)
  for (let x = Math.ceil(tile.minX / 4) * 4; x < tile.maxX; x += 4) {
    add(x + 1, RIVER_Z.minZ - 0.5);
    add(x + 3, RIVER_Z.maxZ + 0.5);
  }
  // round the still pool, half a metre out
  const ringR = STILL_POOL.r + 0.5;
  const n = Math.round((Math.PI * 2 * ringR) / 2.2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    add(STILL_POOL.x + Math.cos(a) * ringR, STILL_POOL.z + Math.sin(a) * ringR);
  }
  return out;
}

// Tussocks, marsh marigolds and stones, off jittered grids by hash (as
// riverdress.js scatters), and cattails in threes on the river's banks.
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
  grid(3.6, 901, (cx, cz, roll) => {
    if (roll > 0.8 - 0.35 * rimward(cx)) return;
    const n = 1 + Math.floor(b.hash01(cx, cz, 915) * 3);
    for (let k = 0; k < n; k++) {
      const a = b.hash01(cx + k, cz, 929) * Math.PI * 2;
      const d = k === 0 ? 0 : 0.45 + 0.5 * b.hash01(cx, cz + k, 943);
      const x = r2(cx + Math.cos(a) * d), z = r2(cz + Math.sin(a) * d);
      if (!inTile(x, z) || !lowFits(x, z, { trail: 1.1 }) || !offTrunk(x, z)) continue;
      tussocks.push(Object.freeze({ x, z, h: r2(0.25 + 0.2 * b.hash01(x, z, 957)), s: r2(0.8 + 0.4 * b.hash01(z, x, 971)) }));
    }
  });
  // marsh marigolds: yellow, in the damp ground within 9 m of water
  const flowers = [];
  grid(4.4, 985, (x, z, roll) => {
    const wd = waterDist(x, z);
    if (roll > 0.62 || wd > 9 || !lowFits(x, z, { water: 0.5 }) || !offTrunk(x, z)) return;
    flowers.push(Object.freeze({ x: r2(x), z: r2(z), s: r2(0.8 + 0.5 * b.hash01(x, z, 999)) }));
  });
  // stones: low, rounded, half-sunk; two or three to a spot
  const stones = [];
  grid(8.5, 1013, (cx, cz, roll) => {
    if (roll > 0.5) return;
    const n = 2 + Math.floor(b.hash01(cx, cz, 1027) * 2);
    for (let k = 0; k < n; k++) {
      const a = b.hash01(cx + k, cz, 1041) * Math.PI * 2;
      const d = k === 0 ? 0 : 0.35 + 0.4 * b.hash01(cx, cz + k, 1055);
      const x = r2(cx + Math.cos(a) * d), z = r2(cz + Math.sin(a) * d);
      if (!inTile(x, z) || !lowFits(x, z, { trail: 1.2 }) || !offTrunk(x, z)) continue;
      stones.push(Object.freeze({ x, z, r: r2(0.12 + 0.14 * b.hash01(x, z, 1069)) }));
    }
  });
  const cattails = [];
  for (let x0 = Math.ceil(tile.minX / 6) * 6; x0 < tile.maxX; x0 += 6) {
    for (const [bank, sign] of [[RIVER_Z.minZ, -1], [RIVER_Z.maxZ, 1]]) {
      const cx = x0 + 1.5 + 3 * b.hash01(x0, bank, 1083);
      const cz = bank + sign * 0.55;
      for (let k = 0; k < 3; k++) {
        const x = r2(cx + (k - 1) * 0.22 + (b.hash01(cx + k, cz, 1097) - 0.5) * 0.12);
        const z = r2(cz + sign * (b.hash01(cx, cz + k, 1111)) * 0.25);
        if (!inTile(x, z) || !lowFits(x, z, { water: 0.2 })) continue;
        cattails.push(Object.freeze({ x, z, h: r2(1.0 + 0.3 * b.hash01(x, z, 1125)) }));
      }
    }
  }
  return { tussocks, flowers, stones, cattails };
}

// westTileContent(index) -> what grows on that tile: a pure function of the
// index, worked out once and kept. `small` is the low layer by kind.
const CONTENT = new Map();
export function westTileContent(index) {
  let c = CONTENT.get(index);
  if (!c) {
    const tile = WEST_TILES[index];
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
export function westTrees() {
  return WEST_TILES.flatMap((t) => westTileContent(t.index).trees);
}
export const westTreeColliders = () => westTrees().map(({ x, z, r }) => ({ x, z, r }));
export const westTreePerches = () => westTrees().map(({ x, z, scale }) => sureClawsTreePerch(x, z, scale));

// One strip tree as the core builds its own (builder.willow, builder.tree).
export function buildWestTree(t, { wind } = {}) {
  return t.kind === 'willow' ? b.willow(t.x, t.z, t.scale, { wind }) : b.tree(t.x, t.z, t.scale, { wind });
}

// The strip, as render/striptiles.js streams it.
export const WEST_STRIP = Object.freeze({
  areaId: 'river', id: WEST.id, rect: WEST, tiles: WEST_TILES,
  content: westTileContent, buildTree: buildWestTree,
});

// --- the ground ----------------------------------------------------------------
// The core's marsh tint, wet round the still pool as it is by the river.
const WET = [0.68, 0.82, 0.62];
export function westGroundTint(x, z) {
  const m = riverGroundTint(x, z);
  const near = smoothstep(0, 0.7, 1 - b.waterGap(STILL_POOL, x, z) / 6);
  return near > 0 ? lerp3(m, WET, near) : m;
}

// --- the fallen willow's mesh ----------------------------------------------------
const BARK = lin(0x6a4a2e);
const BARK_PALE = lin(0x8a6a48);
const HEART = lin(0xb89868);
const EARTH = lin(0x4a3a2a);
const MOSS = lin(0x5f7a32);
const MOSS_LIGHT = lin(0x86a046);
const SHOOT = lin(0x7fa04a);
const PAD = lin(0x4f8a3a);
const STONE = lin(0x8f8a80);

function fallenWillowGeometry() {
  const tris = new Tris();
  const tri = (a, b2, c, col) => {
    const ux = b2[0] - a[0], uy = b2[1] - a[1], uz = b2[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const n = unit(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    tris.v(...a, n, col(a)); tris.v(...b2, n, col(b2)); tris.v(...c, n, col(c));
  };
  // the trunk: rings along the axis, a little crooked, bark darker underneath
  // and mossy along the top
  const SIDES = 10;
  const side = { x: -DIR.z, z: DIR.x };
  const ring = (s) => {
    const r = trunkR(s);
    const bend = 0.18 * Math.sin(s * 0.9) * (s / TRUNK_LEN);
    const cx = ROOT.x + DIR.x * s + side.x * bend, cz = ROOT.z + DIR.z * s + side.z * bend;
    const cy = r - TRUNK_SINK;
    const pts = [];
    for (let k = 0; k < SIDES; k++) {
      const a = (k / SIDES) * Math.PI * 2;
      const rr = r * (0.94 + 0.12 * b.hash01(k, Math.round(s * 10), 1201));
      pts.push([cx + side.x * Math.cos(a) * rr, cy + Math.sin(a) * rr, cz + side.z * Math.cos(a) * rr]);
    }
    return { pts, c: [cx, cy, cz] };
  };
  const barkAt = (p) => {
    const up = clamp01(p[1] / 1.2);
    const tone = 0.82 + 0.3 * b.hash01(Math.round(p[0] * 3), Math.round(p[2] * 3), 1215);
    const bark = scale3(lerp3(BARK, BARK_PALE, up * 0.6), tone);
    const moss = smoothstep(0.78, 1.0, up) * (0.4 + 0.6 * b.hash01(Math.round(p[0] * 1.4), Math.round(p[2] * 1.4), 1229));
    return lerp3(bark, lerp3(MOSS, MOSS_LIGHT, tone - 0.8), moss * 0.85);
  };
  const stations = [];
  for (let s = -0.4; s < TRUNK_LEN + 0.01; s += TRUNK_LEN / 12) stations.push(s);
  const rings = stations.map(ring);
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i].pts, B = rings[i + 1].pts;
    for (let k = 0; k < SIDES; k++) {
      const k2 = (k + 1) % SIDES;
      tri(A[k], A[k2], B[k2], barkAt);
      tri(A[k], B[k2], B[k], barkAt);
    }
  }
  // the broken end, pale heartwood
  const end = rings[rings.length - 1];
  for (let k = 0; k < SIDES; k++) tri(end.c, end.pts[k], end.pts[(k + 1) % SIDES], () => HEART);

  const parts = [tris.geometry()];
  const add = (g, color) => parts.push(colorParts(g, color));

  // the root plate: a slab of earth and roots standing where the tree tore out
  const plate = new THREE.DodecahedronGeometry(1.5, 1);
  plate.scale(1, 0.92, 0.3);
  plate.rotateY(Math.atan2(DIR.x, DIR.z));
  plate.translate(along(-0.55).x, 0.95, along(-0.55).z);
  add(plate, (x, y, z) => scale3(lerp3(EARTH, BARK, clamp01(y / 2.2) * 0.6), 0.8 + 0.4 * b.hash01(Math.round(x * 4), Math.round(z * 4 + y * 4), 1243)));
  // roots reaching out of it
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3;
    const len = 0.7 + 0.6 * b.hash01(k, 1, 1257);
    const g = new THREE.CylinderGeometry(0.03, 0.11, len, 5);
    g.translate(0, len / 2, 0);
    g.rotateZ(0.5 + 0.5 * b.hash01(k, 2, 1271));
    g.rotateX(a);
    g.rotateY(Math.atan2(DIR.x, DIR.z) - Math.PI / 2);
    const px = along(-0.85), up = 0.95 + Math.sin(a) * 0.9;
    g.translate(px.x + side.x * Math.cos(a) * 0.9, Math.max(0.25, up), px.z + side.z * Math.cos(a) * 0.9);
    add(g, scale3(BARK, 0.75 + 0.3 * b.hash01(k, 3, 1285)));
  }
  // broken boughs at the crown end, two of them down in the water
  const bough = (s, lean, yaw, len, r) => {
    const g = new THREE.CylinderGeometry(r * 0.45, r, len, 6);
    g.translate(0, len / 2, 0);
    g.rotateZ(lean);
    g.rotateY(yaw);
    const p = along(s);
    g.translate(p.x, trunkR(s) * 0.8, p.z);
    add(g, (x, y) => scale3(lerp3(BARK, BARK_PALE, clamp01(y / 1.6) * 0.5), 0.9));
  };
  bough(7.9, 1.25, 0.4, 2.6, 0.16);
  bough(7.4, -1.1, 2.2, 2.2, 0.14);
  bough(6.9, 0.7, 4.0, 1.5, 0.12);
  bough(5.3, -0.5, 1.2, 1.1, 0.1);
  // a fallen willow lives on: green withies growing straight up off the trunk
  for (let k = 0; k < 6; k++) {
    const s = 1.6 + k * 0.95 + 0.3 * b.hash01(k, 4, 1299);
    const p = along(s);
    const off = (b.hash01(k, 5, 1313) - 0.5) * 0.5;
    const h = 1.0 + 0.9 * b.hash01(k, 6, 1327);
    const stem = new THREE.CylinderGeometry(0.015, 0.03, h, 4);
    stem.translate(p.x + side.x * off, trunkTop(s) - 0.06 + h / 2, p.z + side.z * off);
    add(stem, scale3(SHOOT, 0.7));
    const tuft = new THREE.IcosahedronGeometry(0.2 + 0.08 * b.hash01(k, 7, 1341), 0);
    tuft.scale(0.8, 1.5, 0.8);
    tuft.translate(p.x + side.x * off, trunkTop(s) + h - 0.1, p.z + side.z * off);
    add(tuft, (x, y) => scale3(SHOOT, 0.85 + 0.25 * b.hash01(Math.round(x * 9), Math.round(y * 9), 1355)));
  }
  // the mossy hollow to nap in, in the lee of the roots
  const bed = new THREE.CylinderGeometry(0.55, 0.66, 0.07, 9);
  bed.translate(NAP.x, 0.035, NAP.z);
  add(bed, (x, y, z) => scale3(lerp3(MOSS, MOSS_LIGHT, b.hash01(Math.round(x * 6), Math.round(z * 6), 1369)), 0.95));
  // the flat stone to drink from, at the pool's edge
  const slab = new THREE.DodecahedronGeometry(0.5, 0);
  slab.scale(1.1, 0.16, 0.8);
  slab.rotateY(0.6);
  slab.translate(DRINK.x - 0.15, 0.03, DRINK.z);
  add(slab, (x, y, z) => scale3(STONE, 0.85 + 0.25 * b.hash01(Math.round(x * 5), Math.round(z * 5), 1383)));
  // lily pads on the still pool
  const padRng = mulberry32(seedFromCode('river|west|pool-pads'));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + padRng() * 0.5;
    const rad = STILL_POOL.r * (0.3 + 0.45 * padRng());
    const size = 0.22 + 0.16 * padRng();
    const x = STILL_POOL.x + Math.cos(a) * rad, z = STILL_POOL.z + Math.sin(a) * rad;
    if (segDist(x, z, ROOT.x, ROOT.z, TIP.x + DIR.x * 2, TIP.z + DIR.z * 2) < 1.2) continue;
    const g = new THREE.CircleGeometry(size, 9, padRng() * 6, Math.PI * 2 - 0.5);
    g.rotateX(-Math.PI / 2);
    g.translate(x, 0.06, z);
    add(g, scale3(PAD, 0.9 + 0.2 * padRng()));
  }
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return geo;
}

/**
 * addWestStrip(scene, { groundMesh, water, riverWest, waters, wind })
 *
 * Everything of the strip that is whole from the start of a walk, added after
 * the core's own things and wholly under local uuids. Each top-level object
 * is tagged userData.strip, so a test (and the budget) can tell the strip
 * from the core. Returns { waterFx } for the still pool.
 */
export function addWestStrip(scene, { groundMesh, water = {}, waters, waterColor }) {
  return withLocalUuids('river-west-strip', () => {
    const tag = (o) => { o.userData.strip = WEST.id; return o; };
    // more of the same ground, tinted as the core's is
    const patch = b.groundPatch(groundMesh, WEST_GROUND, { surface: 'grass' });
    patch.updateMatrix();
    const attr = patch.geometry.attributes.color;
    const pos = patch.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const m = westGroundTint(patch.position.x + pos.getX(i), patch.position.z - pos.getY(i));
      attr.setXYZ(i, attr.getX(i) * m[0], attr.getY(i) * m[1], attr.getZ(i) * m[2]);
    }
    patch.name = 'stripGround';
    scene.add(tag(patch));

    // the still pool
    const fx = createWater(STILL_POOL, {
      color: waterColor, ...STILL_POOL_LOOK,
      quality: water.quality ?? 'high', reducedMotion: water.reducedMotion ?? false, waters,
    });
    scene.add(tag(fx.mesh));

    // the faint trail
    const { mesh: trail } = addTrails(scene, [{ segs: WEST_TRAIL, w: WEST_TRAIL_W }], TRAIL_STYLE, 'river-west',
      { edge: 1e6, decks: [], waters });
    for (const o of scene.children) if (o.name === 'path' && !o.userData.strip && isWestTrailStrip(o)) tag(o);
    if (trail) tag(trail);

    // the fallen willow
    const g = new THREE.Group();
    g.name = 'fallenWillow';
    const mesh = new THREE.Mesh(fallenWillowGeometry(),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }));
    mesh.name = 'fallenWillowMesh';
    g.add(mesh);
    scene.add(tag(g));
    return { waterFx: fx };
  });
}

// A hidden 'path' data strip that is one of the trail's (addTrails adds them
// in order, at each segment's midpoint).
function isWestTrailStrip(o) {
  return WEST_TRAIL.some(([x1, z1, x2, z2]) => Math.abs(o.position.x - (x1 + x2) / 2) < 1e-6 && Math.abs(o.position.z - (z1 + z2) / 2) < 1e-6);
}

export { WATERS as WEST_WATERS };
