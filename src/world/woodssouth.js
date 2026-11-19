import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as b from './builder.js';
import { mulberry32, seedFromCode } from '../rng.js';
import { segDist } from '../segdist.js';
import { sureClawsTreePerch } from '../climbing.js';
import { createWater } from '../render/water.js';
import { addTrails } from './pathribbon.js';
import { withLocalUuids } from './localuuids.js';
import { colorParts, paintMesh, PAINT_Y, Tris, lin, scale3, unit, lerp3, smoothstep, clamp01, r2, once } from './dressing.js';
import { cutTiles, tileSeed, TILE_SIZE } from './strips.js';
import { woodsFloorTint, forestFloorMesh } from './forestfloor.js';
import { streamSmall } from './streamcore.js';
import { phrase } from '../clanphrases.js';

// =============================================================================
// The Woods' south strip (bigger areas, step 3).
//
// Forty metres of new oak wood south of the Woods' old edge, z 50..90, the
// Woods' only free edge (docs/superpowers/specs/2026-11-19-bigger-areas-woods.md).
// Only built when the "bigger areas" switch is on (src/grow.js); woods.js asks
// for everything here from its build().
//
// The old 100 x 100 m Woods is the CORE and nothing in it moves: this file
// scatters from its own seeds, tile by tile, and adds its things after the
// core's, under local uuids, so the core's trees, ferns, colliders and random
// draws are exactly what they are with the switch off.
//
// The thing to find is the SANDY HOLLOW: a round dip of pale sand ringed by a
// low earth bank, open to the north (where the faint trail comes in from the
// long path) and to the south-east (where a little spring pool lies just
// outside). On its west lip stands the old split stump, a broken giant of an
// oak with a shelf a cat climbs to by its biggest root: the lookout over the
// hollow. East across the strip, a bluebell glade.
//
// What is whole from the start of a walk: the ground, the hollow (bank,
// stump, sand, spring), the trail, and every tree's collider and Sure Claws
// fork. What is drawn only near the cat:
//   * the strip's own tiles (render/striptiles.js): each tile's trees, and its
//     tussocks, stones, marigolds and reeds, built when the cat comes near;
//   * its ferns, brambles and forest floor (leaves, moss, mushrooms,
//     bluebells, foxgloves), the Woods' own kinds, which the strip writer has
//     no shapes for: they are made once at the start, from the strip's own
//     per-tile seeds, as three merged meshes tagged to stream like the core's
//     (world/streamcore.js streamSmall), and drawn in runs, one per 10 m tile,
//     by the core's stream, which for the Woods covers the grown rectangle.
// Past their range everything is a far stand-in.
//
// woods.js imports this module and this module must not read woods.js at its
// top level (a cycle), so what it needs of the core (its trees, the clearing,
// the core's ground tint) is handed in.
// =============================================================================

export const SOUTH = Object.freeze({ id: 'south', minX: -50, maxX: 50, minZ: 50, maxZ: 90 });
export const SOUTH_TILES = cutTiles(SOUTH, TILE_SIZE);
// The Woods with its strip: the walkable bounds when the switch is on.
export const GROWN = Object.freeze({ minX: -50, maxX: 50, minZ: -50, maxZ: 90 });
// The ground and the horizon reach as far past the new edge as they did past
// the old one (10 m of ground, the band's inner rim 6 m out).
export const SOUTH_GROUND = Object.freeze({ minX: -60, maxX: 60, minZ: 60, maxZ: 100 });
export const SOUTH_BAND_RECT = Object.freeze({ cx: 0, cz: 20, ex: 0, ez: 20 });

const rimward = (z) => clamp01((z - SOUTH.minZ) / (SOUTH.maxZ - SOUTH.minZ));
const inStrip = (x, z) => x >= SOUTH.minX && x <= SOUTH.maxX && z >= SOUTH.minZ && z <= SOUTH.maxZ;

// --- the sandy hollow ------------------------------------------------------------
// The sand floor is an oval (rx, rz); the bank's crest runs round it on a wider
// oval (A, B), BANK_W across and BANK_H high, broken by two gaps.
export const HOLLOW = Object.freeze({ x: -14, z: 71, rx: 5, rz: 4.2 });
const A = 6.5;
const B = 5.6;
const BANK_W = 1.6;
const BANK_H = 0.72;
const BANK_N = 34; // crest points round the oval, about 1.1 m apart
const BANK_R = 0.75; // a crest point's collider
// The gaps, by the oval's angle (x = cos, z = sin; -pi/2 is north).
const GAPS = Object.freeze([
  Object.freeze({ a: -Math.PI / 2, half: 0.3 }), // north, where the trail comes in
  Object.freeze({ a: 0.7, half: 0.3 }), // south-east, to the spring
]);
const angDiff = (p, q) => Math.abs(Math.atan2(Math.sin(p - q), Math.cos(p - q)));
const onOval = (a, ax = A, bz = B) => ({ x: HOLLOW.x + Math.cos(a) * ax, z: HOLLOW.z + Math.sin(a) * bz });
// The hollow's oval measure: 1 on the bank's crest, less inside.
const ovalAt = (x, z) => Math.hypot((x - HOLLOW.x) / A, (z - HOLLOW.z) / B);
const gapNear = (a) => Math.min(...GAPS.map((g) => angDiff(a, g.a) - g.half));

// The old split stump, on the bank's west lip, and its great root running
// east into the hollow to a knuckle a cat hops up onto.
export const STUMP = Object.freeze({ x: -20.5, z: 71, r: 1.2, shelf: 1.75, spire: 2.3 });
const STUMP_A = Math.PI; // its place on the oval
const KNUCKLE = Object.freeze({ x: -18.45, z: 71.6, y: 0.62, r: 0.3 });

// The perches: the knuckle, then the shelf (the lookout). The shelf is too
// high to reach from the grass with plain claws, so the root is the way up.
export const SOUTH_PERCHES = Object.freeze([
  Object.freeze({ x: KNUCKLE.x, z: KNUCKLE.z, y: KNUCKLE.y, kind: 'tree' }),
  (() => {
    const p = { x: -20.3, z: 71, y: STUMP.shelf, kind: 'tree' };
    Object.defineProperty(p, 'label', { enumerable: true, get() { return phrase('woods.south.lookout'); } });
    p.vantage = true;
    return Object.freeze(p);
  })(),
]);

const BANK_POINTS = Object.freeze((() => {
  const out = [];
  for (let k = 0; k < BANK_N; k++) {
    const a = (k / BANK_N) * Math.PI * 2 - Math.PI;
    if (gapNear(a) < 0) continue;
    if (angDiff(a, STUMP_A) < 0.22) continue;
    out.push(Object.freeze({ ...onOval(a), a }));
  }
  return out;
})());
export const SOUTH_COLLIDERS = Object.freeze([
  ...BANK_POINTS.map((p) => Object.freeze({ x: r2(p.x), z: r2(p.z), r: BANK_R })),
  Object.freeze({ x: STUMP.x, z: STUMP.z, r: STUMP.r }),
  Object.freeze({ x: KNUCKLE.x, z: KNUCKLE.z, r: KNUCKLE.r }),
]);

// The spring: a small round pool just outside the south-east gap, shallow
// enough to wade.
export const SPRING = Object.freeze({ id: 'spring-south', kind: 'circle', x: -6.2, z: 77.6, r: 1.7, shallow: 0.6 });
export const SPRING_LOOK = Object.freeze({ y: 0.04, foamStrength: 0.2 });
const springGap = (x, z) => b.waterGap(SPRING, x, z);

// The bluebell glade, east across the strip: an opening in the oaks.
export const GLADE = Object.freeze({ x: 24, z: 72, r: 5 });

// --- the faint trail ----------------------------------------------------------------
// It leaves the long path at its bend (0, 44), slips south between the core's
// own trees (which do not move for it) and comes into the hollow through its
// north gap. Narrow and pale: a track cats made, not a path.
export const SOUTH_TRAIL = Object.freeze([
  [0, 44, -2, 52], [-2, 52, -7.5, 59], [-7.5, 59, -12.6, 63.6], [-12.6, 63.6, -14, 66.4],
].map((s) => Object.freeze(s)));
export const SOUTH_TRAIL_W = 1.3;
const TRAIL_STYLE = { surface: 'sand', color: 0x9c8460 };
const trailDist = (x, z) => {
  let m = Infinity;
  for (const s of SOUTH_TRAIL) m = Math.min(m, segDist(x, z, ...s));
  return m;
};

// --- the two rests and the things to find --------------------------------------------
const NAP = Object.freeze({ x: -13, z: 71.6 });
const DRINK = (() => {
  // on the spring's edge, on the side that faces the gap
  const gap = onOval(GAPS[1].a);
  const dx = gap.x - SPRING.x, dz = gap.z - SPRING.z, d = Math.hypot(dx, dz);
  return Object.freeze({ x: r2(SPRING.x + (dx / d) * (SPRING.r + 0.65)), z: r2(SPRING.z + (dz / d) * (SPRING.r + 0.65)) });
})();
export const SOUTH_RESTS = Object.freeze([
  Object.freeze({ id: 'woods-nap-1', kind: 'nap', x: NAP.x, z: NAP.z, mesh: false }),
  Object.freeze({ id: 'woods-drink-1', kind: 'drink', x: DRINK.x, z: DRINK.z, mesh: false }),
]);

const LOOKOUT = SOUTH_PERCHES[1];
const find = (id, x, z, say, y) => {
  const c = { id, x, z, ...(y === undefined ? {} : { y }) };
  Object.defineProperty(c, 'label', { enumerable: true, get: say });
  return c;
};
const PEBBLE = Object.freeze({ x: -5.3, z: 80.1 });
const FUR = Object.freeze({ x: 24.8, z: 71.4 });
const NUT = Object.freeze({ x: -41, z: 85 });
export function southCollectibles() {
  return [
    find('woods-find-6', LOOKOUT.x, LOOKOUT.z, () => phrase('woods.south.seed'), LOOKOUT.y),
    find('woods-find-7', PEBBLE.x, PEBBLE.z, () => phrase('woods.south.pebble')),
    find('woods-find-8', FUR.x, FUR.z, () => phrase('woods.south.fur')),
    find('woods-find-9', NUT.x, NUT.z, () => phrase('woods.south.nut')),
  ];
}
export function southScenics() {
  return [find('sandy-hollow', HOLLOW.x, HOLLOW.z, () => phrase('woods.south.scenic'))];
}
const FINDS = Object.freeze([[PEBBLE.x, PEBBLE.z], [FUR.x, FUR.z], [NUT.x, NUT.z], [NAP.x, NAP.z], [DRINK.x, DRINK.z]]);
const findDist = (x, z) => {
  let m = Infinity;
  for (const [fx, fz] of FINDS) m = Math.min(m, Math.hypot(x - fx, z - fz));
  return m;
};
const stumpDist = (x, z) => Math.min(Math.hypot(x - STUMP.x, z - STUMP.z), Math.hypot(x - KNUCKLE.x, z - KNUCKLE.z));

// --- the trees ------------------------------------------------------------------------
// A 3 x 3 jittered grid a tile, each candidate kept with a chance that falls
// from 0.30 at the old edge to 0.11 at the rim: about half the core's oaks to
// the square metre where the strip meets it, thinner toward the hills. The
// core's own mix (builder.canopyKind: oak, round, birch) and sizes. A
// candidate stays 2 m inside its tile and every kept tree 4 m from the last,
// so no tile needs to know its neighbour's; none stands within 2.5 m of the
// old edge, so none crowds a core tree (those stand at most 1.5 m past
// z 47). Every candidate draws its numbers whether or not it is kept.
const TREE_INSET = 2;
const TREE_GRID = 3;
const TREE_JITTER = 1.2;
const TREE_APART = 4;
const TREE_FROM_Z = 52.5;
function treeFits(x, z, scale) {
  if (!inStrip(x, z) || z < TREE_FROM_Z) return false;
  if (trailDist(x, z) < SOUTH_TRAIL_W / 2 + 1.6 * scale + 0.5) return false;
  // the hollow stays open to the sky, the bank clear of canopies
  if (ovalAt(x, z) < 1 + (2.2 + 1.6 * scale) / B) return false;
  if (stumpDist(x, z) < 5 || springGap(x, z) < 3 || findDist(x, z) < 4) return false;
  return Math.hypot(x - GLADE.x, z - GLADE.z) >= GLADE.r + 1.5;
}
function tileTrees(tile) {
  const rng = mulberry32(seedFromCode(tileSeed('woods', SOUTH.id, tile.index, 'trees')));
  const cell = (tile.maxX - tile.minX - 2 * TREE_INSET) / TREE_GRID;
  const out = [];
  for (let j = 0; j < TREE_GRID; j++) {
    for (let i = 0; i < TREE_GRID; i++) {
      const x = r2(tile.minX + TREE_INSET + (i + 0.5) * cell + (rng() * 2 - 1) * TREE_JITTER);
      const z = r2(tile.minZ + TREE_INSET + (j + 0.5) * cell + (rng() * 2 - 1) * TREE_JITTER);
      const roll = rng();
      const scale = r2(1.0 + 0.6 * rng());
      if (roll >= 0.3 - 0.19 * rimward(z)) continue;
      if (!treeFits(x, z, scale)) continue;
      if (out.some((t) => Math.hypot(t.x - x, t.z - z) < TREE_APART)) continue;
      out.push(Object.freeze({ kind: b.canopyKind(x, z), x, z, scale, r: r2(0.5 * scale) }));
    }
  }
  return out;
}

// --- the low things the strip writer draws ---------------------------------------
// Woodland grass in tussocks, thickest round the hollow's bank and the glade's
// edge where the sun gets in; stones in twos and threes; marsh marigolds
// (kingcups) in the wet ground round the spring, and a few reeds on its far
// side.
function lowFits(x, z, { water = 0.3, trail = 1.2, find = 1.6 } = {}) {
  return inStrip(x, z) && springGap(x, z) >= water && trailDist(x, z) >= trail
    && stumpDist(x, z) >= 1.9 && findDist(x, z) >= find && ovalAt(x, z) > 1.18;
}
function tileLow(tile, trees) {
  const offTrunk = (x, z) => trees.every((t) => Math.hypot(x - t.x, z - t.z) >= 0.7 * t.scale);
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
  // where the sun gets in: the hollow's rim and the glade's edge
  const sunny = (x, z) => Math.max(
    1 - smoothstep(0.15, 0.7, Math.abs(ovalAt(x, z) - 1.45)),
    1 - smoothstep(0.5, 3, Math.abs(Math.hypot(x - GLADE.x, z - GLADE.z) - GLADE.r)),
  );
  const tussocks = [];
  grid(3.4, 2101, (cx, cz, roll) => {
    if (roll > 0.22 + 0.6 * sunny(cx, cz) - 0.12 * rimward(cz)) return;
    const n = 1 + Math.floor(b.hash01(cx, cz, 2115) * 3);
    for (let k = 0; k < n; k++) {
      const a = b.hash01(cx + k, cz, 2129) * Math.PI * 2;
      const d = k === 0 ? 0 : 0.45 + 0.5 * b.hash01(cx, cz + k, 2143);
      const x = r2(cx + Math.cos(a) * d), z = r2(cz + Math.sin(a) * d);
      if (!inTile(x, z) || !lowFits(x, z, { trail: 1.0 }) || !offTrunk(x, z)) continue;
      tussocks.push(Object.freeze({ x, z, h: r2(0.22 + 0.18 * b.hash01(x, z, 2157)), s: r2(0.8 + 0.4 * b.hash01(z, x, 2171)) }));
    }
  });
  const stones = [];
  grid(9, 2185, (cx, cz, roll) => {
    if (roll > 0.4) return;
    const n = 2 + Math.floor(b.hash01(cx, cz, 2199) * 2);
    for (let k = 0; k < n; k++) {
      const a = b.hash01(cx + k, cz, 2213) * Math.PI * 2;
      const d = k === 0 ? 0 : 0.35 + 0.4 * b.hash01(cx, cz + k, 2227);
      const x = r2(cx + Math.cos(a) * d), z = r2(cz + Math.sin(a) * d);
      if (!inTile(x, z) || !lowFits(x, z, { trail: 1.2 }) || !offTrunk(x, z)) continue;
      stones.push(Object.freeze({ x, z, r: r2(0.12 + 0.14 * b.hash01(x, z, 2241)) }));
    }
  });
  // kingcups round the spring, in a ring of damp ground, not on the drink side
  const marigolds = [];
  const reeds = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.3 * b.hash01(i, 1, 2255);
    const d = SPRING.r + 0.55 + 0.9 * b.hash01(i, 2, 2269);
    const x = r2(SPRING.x + Math.cos(a) * d), z = r2(SPRING.z + Math.sin(a) * d);
    if (!inTile(x, z) || Math.hypot(x - DRINK.x, z - DRINK.z) < 1.4 || !lowFits(x, z, { water: 0.4, find: 1.2 })) continue;
    if (b.hash01(i, 3, 2283) < 0.3 && Math.cos(a - Math.PI / 4) > 0.2) reeds.push(Object.freeze({ x, z }));
    else marigolds.push(Object.freeze({ x, z, s: r2(0.8 + 0.5 * b.hash01(i, 4, 2297)) }));
  }
  return { tussocks, stones, marigolds, reeds };
}

// southTileContent(index) -> what grows on that tile: a pure function of the
// index, worked out once and kept. `small` is what the strip writer draws.
const CONTENT = new Map();
export function southTileContent(index) {
  let c = CONTENT.get(index);
  if (!c) {
    const tile = SOUTH_TILES[index];
    const trees = tileTrees(tile);
    const { tussocks, stones, marigolds, reeds } = tileLow(tile, trees);
    c = Object.freeze({
      trees: Object.freeze(trees),
      small: Object.freeze({
        reed: Object.freeze(reeds), tussock: Object.freeze(tussocks),
        marigold: Object.freeze(marigolds), stone: Object.freeze(stones),
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

// One strip tree as the core builds its own (builder.tree, the same crown).
export function buildSouthTree(t, { wind } = {}) {
  return b.tree(t.x, t.z, t.scale, { wind, kind: t.kind });
}

// The strip, as render/striptiles.js streams it.
export const SOUTH_STRIP = Object.freeze({
  areaId: 'woods', id: SOUTH.id, rect: SOUTH, tiles: SOUTH_TILES,
  content: southTileContent, buildTree: buildSouthTree,
});

// --- the Woods' own undergrowth, from the strip's own seeds -------------------------
// Ferns all through, bramble thickets here and there, about half the core's
// to the square metre at the old edge and thinner toward the rim, keeping the
// core's rules (off the trail, the water, the finds, the trunks), and ferns
// along the hollow's bank. Each tile scatters its own from its own stream.
function undergrowthFits(x, z, trees, { trail, water, clear, trunk, glade, hollow }) {
  if (!inStrip(x, z) || trailDist(x, z) < trail || springGap(x, z) < water) return false;
  if (findDist(x, z) < clear || stumpDist(x, z) < clear) return false;
  if (ovalAt(x, z) < hollow) return false;
  if (Math.hypot(x - GLADE.x, z - GLADE.z) < glade) return false;
  return trees.every((t) => Math.hypot(x - t.x, z - t.z) >= trunk * t.scale);
}
const FERN = { cell: 4, jitter: 1.5, keep: 0.24, rim: 0.15, trail: 1.9, water: 1.2, clear: 2.5, trunk: 1, glade: 2.5, hollow: 1.12 };
const BRAMBLE = { cell: 9, jitter: 2.5, keep: 0.24, rim: 0.12, trail: 3.6, water: 2.5, clear: 4.5, trunk: 1.6, glade: GLADE.r + 1, hollow: 1.5 };
function tileUndergrowth(tile, rule, stream) {
  const rng = mulberry32(seedFromCode(tileSeed('woods', SOUTH.id, tile.index, stream)));
  const trees = southTrees();
  const out = [];
  for (let gz = tile.minZ + rule.cell / 2; gz < tile.maxZ; gz += rule.cell) {
    for (let gx = tile.minX + rule.cell / 2; gx < tile.maxX; gx += rule.cell) {
      const x = r2(gx + (rng() * 2 - 1) * rule.jitter);
      const z = r2(gz + (rng() * 2 - 1) * rule.jitter);
      const keep = rng() < rule.keep - rule.rim * rimward(z);
      if (x < tile.minX || x >= tile.maxX || z < tile.minZ || z >= tile.maxZ) continue;
      if (keep && undergrowthFits(x, z, trees, rule)) out.push(Object.freeze({ x, z }));
    }
  }
  return out;
}
// The ferns on the bank's outer flank, every other crest point, off the gaps.
const BANK_FERNS = Object.freeze(BANK_POINTS.filter((p, i) => i % 2 === 0 && gapNear(p.a) > 0.18 && angDiff(p.a, STUMP_A) > 0.45)
  .map((p) => Object.freeze({ ...onOval(p.a, A + 1.05, B + 1.05) }))
  .map((p) => Object.freeze({ x: r2(p.x), z: r2(p.z) })));
export const southFerns = once(() => [
  ...SOUTH_TILES.flatMap((t) => tileUndergrowth(t, FERN, 'ferns')),
  ...BANK_FERNS.filter((p) => trailDist(p.x, p.z) >= FERN.trail && springGap(p.x, p.z) >= FERN.water),
]);
export const southBrambles = once(() => SOUTH_TILES.flatMap((t) => tileUndergrowth(t, BRAMBLE, 'brambles')));

// The forest floor (forestfloor.js's shapes): fallen leaves round every strip
// tree, moss at the feet of about half of them, a mushroom cluster at every
// fourth, the bluebell glade, and foxgloves at the edges of the trees. Seeded
// per tile from the trees standing on it.
const FLOOR_LEAVES = 30;
const leafFits = (x, z) => inStrip(x, z) && trailDist(x, z) >= SOUTH_TRAIL_W / 2 + 0.15
  && springGap(x, z) >= 0.6 && ovalAt(x, z) > 1.15 && stumpDist(x, z) > 1.5;
const r3 = (v) => Math.round(v * 1000) / 1000;
function tileFloor(tile) {
  const rng = mulberry32(seedFromCode(tileSeed('woods', SOUTH.id, tile.index, 'floor')));
  const trees = southTileContent(tile.index).trees;
  const all = southTrees();
  const leaves = [], moss = [], mushrooms = [], bluebells = [], foxgloves = [];
  const around = (t, dMin, dMax) => {
    const a = rng() * Math.PI * 2;
    const d = (dMin + (dMax - dMin) * rng()) * t.scale;
    return { x: r2(t.x + Math.cos(a) * d), z: r2(t.z + Math.sin(a) * d), a: r3(a) };
  };
  const standFits = (x, z) => undergrowthFits(x, z, all, { ...FERN, trunk: 1, glade: 0 });
  for (const t of trees) {
    const n = Math.round(FLOOR_LEAVES * t.scale);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const near = rng() < 0.75;
      const d = (0.4 + (near ? 1.2 : 2.2) * Math.sqrt(rng())) * t.scale;
      const yaw = rng() * Math.PI * 2;
      const s = 0.85 + 0.3 * rng();
      const x = r2(t.x + Math.cos(a) * d), z = r2(t.z + Math.sin(a) * d);
      if (i % 2 === 0 && leafFits(x, z)) leaves.push({ x, z, s: r2(s), a: r3(yaw) });
    }
  }
  trees.forEach((t, i) => {
    const has = rng() < 0.5;
    for (let k = 0; k < 2; k++) {
      const p = around(t, 0.6, 0.9);
      const s = r2(0.8 + 0.4 * rng());
      if (has && leafFits(p.x, p.z)) moss.push({ ...p, s });
    }
    if (i % 4 === 0) {
      const p = around(t, 1.05, 1.35);
      if (standFits(p.x, p.z)) mushrooms.push({ ...p, s: 1 });
    }
    const f = around(t, 1.6, 2.4);
    const fs = r2(0.85 + 0.2 * rng());
    if (i % 3 === 1 && standFits(f.x, f.z)) foxgloves.push({ ...f, s: fs });
  });
  // the glade: bluebells close together, a carpet thinning to its edge
  if (Math.hypot(GLADE.x - (tile.minX + tile.maxX) / 2, GLADE.z - (tile.minZ + tile.maxZ) / 2) < 20) {
    for (let k = 0; k < 150; k++) {
      const a = rng() * Math.PI * 2;
      const d = (GLADE.r + 1) * Math.sqrt(rng());
      const x = r2(GLADE.x + Math.cos(a) * d), z = r2(GLADE.z + Math.sin(a) * d);
      const s = r2(1.1 + 0.4 * rng());
      const keep = rng() < 1 - 0.6 * smoothstep(GLADE.r - 2, GLADE.r + 1, d);
      if (x < tile.minX || x >= tile.maxX || z < tile.minZ || z >= tile.maxZ) continue;
      if (!keep || findDist(x, z) < 0.6 || !leafFits(x, z)) continue;
      if (bluebells.some((q) => Math.hypot(q.x - x, q.z - z) < 0.4)) continue;
      bluebells.push({ x, z, s, a: r3(a) });
    }
  }
  return { leaves, moss, mushrooms, bluebells, foxgloves };
}
export const southFloor = once(() => {
  const parts = { leaves: [], moss: [], mushrooms: [], bluebells: [], foxgloves: [] };
  for (const t of SOUTH_TILES) {
    const f = tileFloor(t);
    for (const k of Object.keys(parts)) parts[k].push(...f[k]);
  }
  return parts;
});

// What the merged undergrowth stands on, for cutting it per tile
// (render/tilesplit.js): each thing's centre and how far its parts reach.
export const fernItems = (ferns) => ferns.map(({ x, z }) => ({ x, z, r: 0.6 }));
export const brambleItems = (brambles) => brambles.map(({ x, z }) => ({ x, z, r: 1.0 }));
export function floorItems(f) {
  return [
    ...f.leaves.map(({ x, z }) => ({ x, z, r: 0.12 })),
    ...f.moss.map(({ x, z, s }) => ({ x, z, r: r2(0.35 * (s ?? 1)) })),
    ...f.mushrooms.map(({ x, z }) => ({ x, z, r: 0.2 })),
    ...f.bluebells.map(({ x, z }) => ({ x, z, r: 0.2 })),
    ...f.foxgloves.map(({ x, z }) => ({ x, z, r: 0.25 })),
  ];
}

// --- the ground ----------------------------------------------------------------------
// southGroundTint(coreTrees, clearing, coreTint) -> the grown Woods' ground
// multiplier for z past the old edge: the core's leaf litter, shade and moss,
// worked out over the core's trees and the strip's together, plain again at
// the grown ground's own edge (as the core's is at its), and the core's own
// tint at the old edge, so the two meet without a seam. Sand under the hollow.
const ONE = [1, 1, 1];
const SAND_TINT = [1.42, 1.28, 0.92];
// the bluebell glade's haze: a carpet of blue seen from across the wood
const BLUE_TINT = [1.9, 0.7, 4.4];
export function southGroundTint(coreTrees, clearing, coreTint) {
  const wood = woodsFloorTint([...coreTrees, ...southTrees()], clearing);
  return (x, z) => {
    if (z <= SOUTH.minZ) return coreTint(x, z);
    let m = wood(x, z);
    const k = (1 - smoothstep(52, 59, Math.abs(x))) * (1 - smoothstep(SOUTH_GROUND.maxZ - 8, SOUTH_GROUND.maxZ - 1, z));
    if (k < 1) m = lerp3(ONE, m, k);
    const sand = 1 - smoothstep(0.85, 1.25, Math.hypot((x - HOLLOW.x) / HOLLOW.rx, (z - HOLLOW.z) / HOLLOW.rz));
    if (sand > 0) m = lerp3(m, SAND_TINT, sand);
    const blue = 0.75 * (1 - smoothstep(GLADE.r - 2.5, GLADE.r + 1.5, Math.hypot(x - GLADE.x, z - GLADE.z)));
    if (blue > 0) m = lerp3(m, BLUE_TINT, blue);
    const seam = smoothstep(SOUTH.minZ, SOUTH.minZ + 4, z);
    return seam < 1 ? lerp3(coreTint(x, z), m, seam) : m;
  };
}

// --- the hollow's mesh ------------------------------------------------------------------
const EARTH = lin(0x5a4630);
const EARTH_PALE = lin(0x7a6244);
const BANK_GRASS = lin(0x5d8a3c);
const BANK_MOSS = lin(0x6f9640);
const BARK = lin(0x5e4a36);
const BARK_PALE = lin(0x7f6a52);
const HEART = lin(0xb89a6c);
const HEART_DARK = lin(0x8a6a44);
const MOSS = lin(0x5f7a32);
const KNOT = lin(0x2a2018);
const STONE = lin(0x8f8a80);
const SAND = lin(0xcfb98a);
const SAND_DARK = lin(0xc0a878);

function hollowGeometry() {
  const parts = [];
  const add = (g, color) => parts.push(colorParts(g, color));

  // the bank: a crest of earth mounds, lower toward each gap, grassy on top
  for (const [i, p] of BANK_POINTS.entries()) {
    const taper = 0.55 + 0.45 * smoothstep(0, 0.35, gapNear(p.a));
    const r = 0.95 + 0.22 * b.hash01(i, 1, 3101);
    const g = new THREE.IcosahedronGeometry(1, 1);
    const pos = g.attributes.position;
    const h = BANK_H * taper;
    const tx = -Math.sin(p.a), tz = Math.cos(p.a); // along the crest
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
      const j = 0.88 + 0.24 * b.hash01(Math.round(x * 1000) + i * 13, Math.round(z * 1000) + Math.round(y * 1000) * 7, 3115);
      // longer along the crest than across it, so the mounds run together
      const along = (x * tx + z * tz) * 1.25, across = (x * -tz + z * tx) * (BANK_W / 2) / r;
      pos.setXYZ(v, (along * tx - across * tz) * r * j, (y * h) * j, (along * tz + across * tx) * r * j);
    }
    g.translate(p.x, -0.08, p.z);
    g.computeVertexNormals();
    add(g, (x, y, z) => {
      const tone = 0.85 + 0.3 * b.hash01(Math.round(x * 3), Math.round(z * 3), 3129);
      const top = smoothstep(0.25, 0.55, y);
      const green = lerp3(BANK_GRASS, BANK_MOSS, b.hash01(Math.round(x * 2), Math.round(z * 2), 3143));
      return scale3(lerp3(lerp3(EARTH, EARTH_PALE, 0.4 * tone), green, top * 0.9), tone);
    });
  }

  // the old split stump: a flared trunk broken off at the shelf, its rim a
  // ring of jagged splinters, tallest on the west (low enough that the chase
  // camera behind a cat on the shelf sees over them), heartwood showing
  const SIDES = 14;
  const tris = new Tris();
  const tri = (a, b2, c, col) => {
    const ux = b2[0] - a[0], uy = b2[1] - a[1], uz = b2[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const n = unit(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    tris.v(...a, n, col(a)); tris.v(...b2, n, col(b2)); tris.v(...c, n, col(c));
  };
  const S = STUMP;
  const topAt = (k) => {
    const a = (k / SIDES) * Math.PI * 2;
    const west = smoothstep(-0.4, 0.9, -Math.cos(a));
    const tooth = k % 2 === 0 ? 0.55 + 0.45 * b.hash01(k, 8, 3171) : 0.1 * b.hash01(k, 7, 3157);
    return S.shelf + 0.06 + (S.spire - S.shelf - 0.06) * tooth * (0.25 + 0.75 * west);
  };
  const radius = (y, k) => {
    const flare = 0.32 * (1 - smoothstep(0, 0.7, y));
    const thin = 0.12 * smoothstep(S.shelf, S.spire, y);
    return (S.r - 0.08 + flare - thin) * (0.94 + 0.12 * b.hash01(k, Math.round(y * 4), 3185));
  };
  const LEVELS = 5;
  const ringPts = [];
  for (let l = 0; l <= LEVELS; l++) {
    const row = [];
    for (let k = 0; k < SIDES; k++) {
      const a = (k / SIDES) * Math.PI * 2;
      const y = l === 0 ? -0.05 : (l / LEVELS) * topAt(k);
      const r = radius(Math.max(0, y), k);
      row.push([S.x + Math.cos(a) * r, y, S.z + Math.sin(a) * r]);
    }
    ringPts.push(row);
  }
  const barkAt = (p) => {
    const tone = 0.8 + 0.32 * b.hash01(Math.round(p[0] * 4), Math.round(p[1] * 3), 3199);
    const up = clamp01(p[1] / S.spire);
    const ridge = b.hash01(Math.round(Math.atan2(p[2] - S.z, p[0] - S.x) * 5), 0, 3213) > 0.5 ? 1 : 0.86;
    const c = scale3(lerp3(BARK, BARK_PALE, up * 0.5), tone * ridge);
    const moss = smoothstep(0.55, 0, p[1]) * 0.55 * b.hash01(Math.round(p[0] * 2), Math.round(p[2] * 2), 3227);
    return lerp3(c, MOSS, moss);
  };
  for (let l = 0; l < LEVELS; l++) {
    for (let k = 0; k < SIDES; k++) {
      const k2 = (k + 1) % SIDES;
      tri(ringPts[l][k], ringPts[l + 1][k2], ringPts[l][k2], barkAt);
      tri(ringPts[l][k], ringPts[l + 1][k], ringPts[l + 1][k2], barkAt);
    }
  }
  // the broken top: the splinters' inner faces down to a flat shelf of pale
  // heartwood with its rings, where a cat sits
  const mid = [S.x, S.shelf, S.z];
  const top = ringPts[LEVELS];
  const inner = top.map((p) => [S.x + (p[0] - S.x) * 0.74, S.shelf, S.z + (p[2] - S.z) * 0.74]);
  const heartAt = (p) => {
    const ringK = 0.5 + 0.5 * Math.cos(Math.hypot(p[0] - S.x, p[2] - S.z) * 22);
    return scale3(lerp3(HEART, HEART_DARK, 0.25 + 0.5 * smoothstep(S.shelf, S.spire, p[1])), 0.9 + 0.12 * ringK);
  };
  for (let k = 0; k < SIDES; k++) {
    const k2 = (k + 1) % SIDES;
    tri(inner[k], top[k2], top[k], heartAt);
    tri(inner[k], inner[k2], top[k2], heartAt);
    tri(mid, inner[k2], inner[k], heartAt);
  }
  // a dark knot-hole on the south face, low down, and its lip
  const knotA = Math.PI / 2;
  const kr = radius(0.5, 0) * 1.06 + 0.06;
  const kc = [S.x + Math.cos(knotA) * kr, 0.55, S.z + Math.sin(knotA) * kr];
  const kOut = [Math.cos(knotA), 0, Math.sin(knotA)];
  const kSide = [-Math.sin(knotA), 0, Math.cos(knotA)];
  const knot = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    knot.push([kc[0] + kSide[0] * Math.cos(a) * 0.2 + kOut[0] * 0.03, kc[1] + Math.sin(a) * 0.27, kc[2] + kSide[2] * Math.cos(a) * 0.2 + kOut[2] * 0.03]);
  }
  for (let k = 0; k < 9; k++) tri(kc, knot[k], knot[(k + 1) % 9], () => KNOT);
  parts.push(tris.geometry());

  // the roots: four short ones splayed round the foot, and the great one east
  // into the hollow, ending in the knuckle
  const up = new THREE.Vector3(0, 1, 0);
  const dirV = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const root = (a, len, r0, lift, salt) => {
    const g = new THREE.CylinderGeometry(r0 * 0.35, r0, len, 6);
    g.translate(0, len / 2, 0);
    dirV.set(Math.cos(a), -lift, Math.sin(a)).normalize();
    g.applyQuaternion(quat.setFromUnitVectors(up, dirV));
    g.translate(S.x + Math.cos(a) * (S.r - 0.15), 0.32, S.z + Math.sin(a) * (S.r - 0.15));
    add(g, (x, y, z) => scale3(lerp3(BARK, EARTH_PALE, 0.3), 0.8 + 0.3 * b.hash01(Math.round(x * 4), Math.round(z * 4), salt)));
  };
  root(2.2, 1.3, 0.24, 0.3, 3255);
  root(3.4, 1.2, 0.22, 0.28, 3269);
  root(4.3, 1.4, 0.26, 0.26, 3283);
  root(5.4, 1.1, 0.2, 0.3, 3297);
  {
    const ax = KNUCKLE.x - S.x, az = KNUCKLE.z - S.z;
    const a = Math.atan2(az, ax);
    const len = Math.hypot(ax, az) - S.r + 0.45;
    const g = new THREE.CylinderGeometry(0.26, 0.4, len, 7);
    g.translate(0, len / 2, 0);
    dirV.set(Math.cos(a), -0.22, Math.sin(a)).normalize();
    g.applyQuaternion(quat.setFromUnitVectors(up, dirV));
    g.translate(S.x + Math.cos(a) * (S.r - 0.2), 0.52, S.z + Math.sin(a) * (S.r - 0.2));
    add(g, (x, y, z) => scale3(lerp3(BARK, BARK_PALE, 0.3 + 0.4 * clamp01(y / 0.6)), 0.85 + 0.25 * b.hash01(Math.round(x * 5), Math.round(z * 5), 3311)));
    // the knuckle: a gnarled hump, its top just under the perch
    const k = new THREE.IcosahedronGeometry(0.42, 1);
    k.scale(1.05, 0.72, 0.95);
    k.translate(KNUCKLE.x, KNUCKLE.y - 0.3, KNUCKLE.z);
    add(k, (x, y, z) => lerp3(scale3(BARK_PALE, 0.9 + 0.2 * b.hash01(Math.round(x * 7), Math.round(z * 7), 3325)), MOSS, smoothstep(0.45, 0.62, y) * 0.6));
  }

  // the spring's rim: flat grey stones round its edge, open on the drink side
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.25 * b.hash01(i, 0, 3339);
    const x = SPRING.x + Math.cos(a) * (SPRING.r + 0.12), z = SPRING.z + Math.sin(a) * (SPRING.r + 0.12);
    if (Math.hypot(x - DRINK.x, z - DRINK.z) < 1.0) continue;
    const s = 0.2 + 0.14 * b.hash01(i, 1, 3353);
    const g = new THREE.DodecahedronGeometry(s, 0);
    g.scale(1.25, 0.5, 1.0);
    g.rotateY(b.hash01(i, 2, 3367) * Math.PI);
    g.translate(x, 0.04, z);
    add(g, () => scale3(STONE, 0.78 + 0.32 * b.hash01(i, 3, 3381)));
  }
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

// The sand floor: its own flat disc, stretched to the oval, so the grass
// (render/grass.js flatFootprints, which keeps tufts off a flat circle) leaves
// it bare. Pale in the middle, darker toward the bank.
function sandFloor() {
  const geo = new THREE.CircleGeometry(1, 40);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const r = Math.hypot(x, y);
    if (r > 0.5) {
      const k = 1 + 0.07 * (b.hash01(i, 0, 3409) * 2 - 1);
      pos.setXY(i, x * k, y * k);
    }
    const c = lerp3(SAND, SAND_DARK, 0.15 + 0.6 * smoothstep(0.3, 1, r));
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  m.rotation.x = -Math.PI / 2;
  m.scale.set(HOLLOW.rx, HOLLOW.rz, 1);
  m.position.set(HOLLOW.x, PAINT_Y + 0.002, HOLLOW.z);
  m.name = 'hollowSand';
  m.castShadow = false;
  m.receiveShadow = true;
  m.userData.noCast = true;
  return m;
}

// The sand floor's rim, and a damp dark ring round the spring: flat paint. Every
// triangle is wound to face up (paintMesh draws front faces only).
function flatPart(pos, color) {
  for (let i = 0; i < pos.length; i += 9) {
    const ux = pos[i + 3] - pos[i], uz = pos[i + 5] - pos[i + 2];
    const vx = pos[i + 6] - pos[i], vz = pos[i + 8] - pos[i + 2];
    if (uz * vx - ux * vz < 0) {
      for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  const n = new Float32Array(pos.length);
  for (let i = 1; i < n.length; i += 3) n[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return colorParts(g, color);
}
const fan = (cx, cz, rim) => {
  const pos = [];
  for (let i = 0; i < rim.length; i++) {
    const p = rim[i], q = rim[(i + 1) % rim.length];
    pos.push(cx, 0, cz, q[0], 0, q[1], p[0], 0, p[1]);
  }
  return pos;
};
function hollowPaintParts() {
  const parts = [];
  const oval = (rx, rz, n, salt) => {
    const rim = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 1 + 0.08 * (b.hash01(i, 0, salt) * 2 - 1);
      rim.push([HOLLOW.x + Math.cos(a) * rx * k, HOLLOW.z + Math.sin(a) * rz * k]);
    }
    return fan(HOLLOW.x, HOLLOW.z, rim);
  };
  parts.push(flatPart(oval(HOLLOW.rx + 0.6, HOLLOW.rz + 0.6, 30, 3395), lerp3(SAND_DARK, EARTH_PALE, 0.5)));
  // the two gaps, worn to sand by paws
  for (const g of GAPS) {
    const p = onOval(g.a, A + 0.9, B + 0.9), q = onOval(g.a, HOLLOW.rx - 0.5, HOLLOW.rz - 0.5);
    const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
    const sx = (-dz / d) * 1.1, sz = (dx / d) * 1.1;
    parts.push(flatPart([p.x + sx, 0, p.z + sz, q.x - sx, 0, q.z - sz, p.x - sx, 0, p.z - sz,
      p.x + sx, 0, p.z + sz, q.x + sx, 0, q.z + sz, q.x - sx, 0, q.z - sz], lerp3(SAND_DARK, EARTH_PALE, 0.55)));
  }
  // the damp ground round the spring
  const ring = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ring.push([SPRING.x + Math.cos(a) * (SPRING.r + 0.9), SPRING.z + Math.sin(a) * (SPRING.r + 0.9)]);
  }
  parts.push(flatPart(fan(SPRING.x, SPRING.z, ring), lin(0x4f5a30)));
  return parts;
}

/**
 * addSouthStrip(scene, { groundMesh, water, waters, waterColor })
 *
 * Everything of the strip that is in the scene from the start of a walk,
 * added after the core's own things and wholly under local uuids. Each
 * top-level object is tagged userData.strip, so a test (and the budget) can
 * tell the strip from the core. Its ferns, brambles and forest floor are
 * tagged to stream (streamSmall) like the core's. Returns { waterFx } for the
 * spring.
 */
export function addSouthStrip(scene, { groundMesh, groundTint, water = {}, waters, waterColor }) {
  return withLocalUuids('woods-south-strip', () => {
    const tag = (o) => { o.userData.strip = SOUTH.id; return o; };
    // more of the same ground, tinted as the core's is
    const patch = b.groundPatch(groundMesh, SOUTH_GROUND, { surface: 'grass' });
    patch.updateMatrix();
    const attr = patch.geometry.attributes.color;
    const pos = patch.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const m = groundTint(patch.position.x + pos.getX(i), patch.position.z - pos.getY(i));
      attr.setXYZ(i, attr.getX(i) * m[0], attr.getY(i) * m[1], attr.getZ(i) * m[2]);
    }
    patch.name = 'stripGround';
    scene.add(tag(patch));

    // the spring
    const fx = createWater(SPRING, {
      color: waterColor, ...SPRING_LOOK,
      quality: water.quality ?? 'high', reducedMotion: water.reducedMotion ?? false, waters,
    });
    scene.add(tag(fx.mesh));

    // the sand, the worn gaps and the damp round the spring
    scene.add(tag(paintMesh(hollowPaintParts(), { name: 'stripPaint' })));
    scene.add(tag(sandFloor()));

    // the faint trail
    const before = new Set(scene.children);
    const { mesh: trail } = addTrails(scene, [{ segs: SOUTH_TRAIL, w: SOUTH_TRAIL_W }], TRAIL_STYLE, 'woods-south',
      { edge: 1e6, decks: [], waters });
    for (const o of scene.children) if (!before.has(o)) tag(o);
    if (trail) tag(trail);

    // the hollow: its bank, the old stump and the spring's stones
    const g = new THREE.Group();
    g.name = 'sandyHollow';
    const mesh = new THREE.Mesh(hollowGeometry(),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true, side: THREE.DoubleSide }));
    mesh.name = 'sandyHollowMesh';
    g.add(mesh);
    scene.add(tag(g));

    // the Woods' own undergrowth, drawn near the cat in runs as the core's is
    const ferns = southFerns();
    const fernMesh = b.fernBed(ferns, seedFromCode('woods|south|ferns'));
    fernMesh.name = 'stripFerns';
    scene.add(tag(streamSmall(fernMesh, fernItems(ferns))));
    const brambles = southBrambles();
    const brambleMesh = b.brambleBed(brambles, seedFromCode('woods|south|brambles'));
    brambleMesh.name = 'stripBrambles';
    scene.add(tag(streamSmall(brambleMesh, brambleItems(brambles))));
    const floor = southFloor();
    const floorMesh = forestFloorMesh(floor, { name: 'stripFloor' });
    scene.add(tag(streamSmall(floorMesh, floorItems(floor))));
    return { waterFx: fx };
  });
}
