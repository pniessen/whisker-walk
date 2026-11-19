import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as b from './builder.js';
import { mulberry32, seedFromCode } from '../rng.js';
import { segDist } from '../segdist.js';
import { createWater } from '../render/water.js';
import { addTrails } from './pathribbon.js';
import { withLocalUuids } from './localuuids.js';
import { cutTiles, tileSeed, TILE_SIZE } from './strips.js';
import { streamTree, streamSmall } from './streamcore.js';
import { forestFloorMesh, pinesFloorTint, pinesMossField, canopyShade } from './forestfloor.js';
import { ZOOM_STEPS } from '../camzoom.js';
import { Tris, lin, lerp3, unit, smoothstep, clamp01, r2, smoothField, scale3 } from './dressing.js';
import { segmentBlocked, OCCLUDER_PAD } from '../fightcam.js';
import { FADE_OPACITY, PAST_LOOK, NEAR_FOLIAGE, FOLIAGE_NEAR_OPACITY } from '../treefade.js';
import { CAT_LOOK_Y } from '../cat/model.js';
import * as north from './pinesnorth.js';
import * as west from './pineswest.js';
import * as pines from './pines.js';

// =============================================================================
// The Pines and Swamp, grown (bigger areas, step 3; the design is
// docs/superpowers/specs/2026-11-19-bigger-areas-design.md, this area's notes
// docs/superpowers/specs/2026-11-19-bigger-areas-pines.md).
//
// With the switch on (src/grow.js) the Pines gains two strips of new ground
// over its two free edges, and the north-west corner between them:
//
//   north  z -90..-50, x -90..50: more of the forest east of the Black Mire
//          (the Great Pine, pinesnorth.js), and west of it the deep swamp
//          going on;
//   west   x -90..-50, z -50..50: the swamp going on, the outer swamp south
//          of the mire (the Toadstool Ring, pineswest.js) and the deep swamp
//          north of it.
//
// The walkable bounds become x -90..50, z -90..50 (140 x 140 m). The lake,
// the island, the bridge, the camp and the border posts are all far from
// both edges. The Black Mire comes in from the north edge and leaves by the
// west one, so it runs on through both strips (and under the hills as far as
// it did); its two crossings stay the only ways into the deep swamp, which is
// now as big again as it was.
//
// The old 100 x 100 m Pines is the CORE and nothing in it moves: everything
// here is scattered from its own seeds, a stream a tile (strips.js tileSeed),
// and added after the core under local uuids.
//
// HOW IT STREAMS. The Pines' scatter is mostly merged meshes (a stand of
// pines is two meshes however many it holds), and a strip tile's own small
// layer would be one mesh a tile, too many draws for an area already at 119.
// So the strips' scatter is built the core's way, whole at the start of a
// walk, as a handful of merged meshes (the still stand of pines, the ferns,
// the forest floor, the reeds), and streamed through the core's seam
// (world/streamcore.js): the core stream covers the grown rectangle, and each
// merged mesh is drawn in runs, one per 10 m tile, near the cat, with far
// stand-ins past its layer's range. A pine by a trail sways and fades as the
// core's path-side pines do: its own Group, tagged as a tree. One draw a
// merged mesh however many tiles are near.
// =============================================================================

export const CORE = Object.freeze({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 });
export const GROWN = Object.freeze({ minX: -90, maxX: 50, minZ: -90, maxZ: 50 });
export const NORTH = Object.freeze({ id: 'north', minX: -90, maxX: 50, minZ: -90, maxZ: -50 });
export const WEST = Object.freeze({ id: 'west', minX: -90, maxX: -50, minZ: -50, maxZ: 50 });
// Each strip's tiles: their seeds hang on their indices (7 x 2 and 2 x 5).
export const NORTH_TILES = cutTiles(NORTH, TILE_SIZE);
export const WEST_TILES = cutTiles(WEST, TILE_SIZE);
export const STRIPS = Object.freeze([
  Object.freeze({ strip: NORTH, tiles: NORTH_TILES }),
  Object.freeze({ strip: WEST, tiles: WEST_TILES }),
]);
// The ground and the horizon reach as far past the new edges as they did past
// the old ones (10 m of ground, the band's inner rim 6 m out).
export const GROWN_GROUND = Object.freeze({ minX: -100, maxX: 60, minZ: -100, maxZ: 60 });
export const NORTH_GROUND = Object.freeze({ minX: -100, maxX: 60, minZ: -100, maxZ: -60 });
export const WEST_GROUND = Object.freeze({ minX: -100, maxX: -60, minZ: -60, maxZ: 60 });
export const BAND_RECT = Object.freeze({ cx: -20, cz: -20, ex: 20, ez: 20 });
// The mires run on under the hills as far past the new edges as they did past
// the old (to 70 m out: the band's outer rim is 66 m out).
export const MIRE_MIN = -160;
// A third bog out in the deep swamp's new north-west.
export const DEEP_BOG = Object.freeze({ id: 'bog-north', kind: 'circle', x: -62, z: -70, r: 3, shallow: 1.0 });
export const STRIP_WATERS = Object.freeze([north.SPRING, west.BOG_POOL, DEEP_BOG]);
const BOG_COLOR = 0x4a4a28;
const STRIP_WATER_LOOK = Object.freeze({
  'spring-north': north.SPRING_LOOK,
  'bog-pool-west': Object.freeze({ y: 0.03, color: BOG_COLOR, style: 'bog', foamStrength: 0.25, glare: 0.08, specCap: 0.1 }),
  'bog-north': Object.freeze({ y: 0.03, color: BOG_COLOR, style: 'bog', foamStrength: 0.25, glare: 0.08, specCap: 0.1 }),
});

// The grown waters: the core's, in order, the two mires run on, then the
// strips' three. Worked out on first use (pines.js's bindings are not ready
// while this module is first read).
let watersOnce = null;
export function grownWaters() {
  if (!watersOnce) {
    watersOnce = Object.freeze([
      ...pines.PINES_WATERS.map((w) => (w.id === 'mire-north' ? Object.freeze({ ...w, minZ: MIRE_MIN })
        : w.id === 'mire-west' ? Object.freeze({ ...w, minX: MIRE_MIN }) : w)),
      ...STRIP_WATERS,
    ]);
  }
  return watersOnce;
}

// --- what may grow where --------------------------------------------------------
const TRAILS = Object.freeze([...north.NORTH_TRAIL, ...west.WEST_TRAIL]);
const TRAIL_W = north.NORTH_TRAIL_W;
const CAM_BACK = ZOOM_STEPS[2].dist;
const stretched = ([x1, z1, x2, z2]) => {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const ux = ((x2 - x1) / len) * CAM_BACK, uz = ((z2 - z1) / len) * CAM_BACK;
  return [x1 - ux, z1 - uz, x2 + ux, z2 + uz];
};
const CAM_TRAILS = TRAILS.map(stretched);
const minSeg = (segs, x, z) => { let m = Infinity; for (const s of segs) m = Math.min(m, segDist(x, z, ...s)); return m; };
const trailDist = (x, z) => minSeg(TRAILS, x, z);
const camTrailDist = (x, z) => minSeg(CAM_TRAILS, x, z);
const KEEP_CLEAR = Object.freeze([...north.NORTH_KEEP_CLEAR, ...west.WEST_KEEP_CLEAR]);
const keepDist = (x, z) => { let m = Infinity; for (const [kx, kz, r] of KEEP_CLEAR) m = Math.min(m, Math.hypot(x - kx, z - kz) - r); return m; };
let undecked = null;
const waterDist = (x, z) => {
  if (!undecked) undecked = grownWaters().map((w) => ({ ...w, decks: [] }));
  let m = Infinity;
  for (const w of undecked) m = Math.min(m, b.waterGap(w, x, z));
  return m;
};
const inRect = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
const inCore = (x, z) => inRect(CORE, x, z);
// 0 at the old edge, 1 at the new rim: everything thins toward it.
export const rimward = (x, z) => clamp01(Math.max(-50 - z, -50 - x) / 40);
// The forest is east of the Black Mire's north reach; everything west of it
// is swamp, the deep swamp north of mire-west.
const MIRE_EAST = -27;
export const isForest = (x) => x > MIRE_EAST;
const PINE_REACH = 1.3;
const canopyClear = (scale) => TRAIL_W / 2 + PINE_REACH * scale + 0.5;
let coreTrunks = null;
const coreTrees = () => {
  if (!coreTrunks) { const { near, stand } = pines.pinesTrees(); coreTrunks = [...near, ...stand]; }
  return coreTrunks;
};

// The swamp's wet hollows, 0-1: a broad field (9 m waves) that runs high in
// patches over the strips' swamp, nothing in the core or the forest, rising
// from nothing over the first 6 m past the old edge. The ground is darker
// and browner there, reeds and bog cotton grow in it.
export function wetHollow(x, z) {
  if (isForest(x) || inCore(x, z)) return 0;
  const inward = smoothstep(0, 6, Math.max(-50 - z, -50 - x));
  return inward * smoothstep(0.15, 0.6, smoothField(x, z, 271, 9));
}

// --- one tile's things -----------------------------------------------------------
const PINE = { cell: 4.2, inset: 1.6, jitter: 1.2, apart: 3.2 };
// Each candidate kept with a chance that falls toward the rim: about half the
// core's pines to the square metre in the forest (1.8 a 100 m2 there), the
// swamp's scatter of one or two to a tile at the old edge.
const pineShare = (x, z) => (isForest(x) ? 0.42 - 0.24 * rimward(x, z) : 0.09 - 0.05 * rimward(x, z));

function tilePines(sid, tile) {
  const rng = mulberry32(seedFromCode(tileSeed('pines', sid, tile.index, 'pines')));
  const n = Math.round((tile.maxX - tile.minX - 2 * PINE.inset) / PINE.cell);
  const cell = (tile.maxX - tile.minX - 2 * PINE.inset) / n;
  const out = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = r2(tile.minX + PINE.inset + (i + 0.5) * cell + (rng() * 2 - 1) * PINE.jitter);
      const z = r2(tile.minZ + PINE.inset + (j + 0.5) * cell + (rng() * 2 - 1) * PINE.jitter);
      const scale = r2(1.2 + 0.7 * rng());
      const roll = rng();
      if (roll >= pineShare(x, z) || inCore(x, z)) continue;
      if (waterDist(x, z) < 2.5 || camTrailDist(x, z) < canopyClear(scale) || keepDist(x, z) < 2) continue;
      if (out.some((t) => Math.hypot(t.x - x, t.z - z) < PINE.apart)) continue;
      if (coreTrees().some((t) => Math.hypot(t.x - x, t.z - z) < PINE.apart)) continue;
      // by the trail (where the chase camera goes), a swaying pine of its own
      // that fades when it is in the way, as the core's path-side pines are;
      // every other joins the still stand
      const near = trailDist(x, z) < canopyClear(scale) + 4;
      out.push(Object.freeze({ x, z, scale, r: r2(0.4 * scale), near }));
    }
  }
  return out;
}

// Dead pines standing in the swamp, silver-grey and bare: a 9 m grid a tile,
// a few kept, more of them at the old edge. Each has a thin collider (from
// the start of a walk) and keeps the pines' rules.
function tileSnags(sid, tile, pinesHere) {
  const rng = mulberry32(seedFromCode(tileSeed('pines', sid, tile.index, 'snags')));
  const out = [];
  for (let gz = tile.minZ + 5; gz < tile.maxZ - 2; gz += 10) {
    for (let gx = tile.minX + 5; gx < tile.maxX - 2; gx += 10) {
      const x = r2(gx + (rng() * 2 - 1) * 2.6);
      const z = r2(gz + (rng() * 2 - 1) * 2.6);
      const h = r2(3.2 + 2.4 * rng());
      const roll = rng();
      const lean = r3((rng() - 0.5) * 0.12);
      if (isForest(x) || inCore(x, z) || roll >= 0.3 - 0.15 * rimward(x, z)) continue;
      if (waterDist(x, z) < 2 || camTrailDist(x, z) < TRAIL_W / 2 + 1.5 || keepDist(x, z) < 2) continue;
      if ([...pinesHere, ...out].some((t) => Math.hypot(t.x - x, t.z - z) < 3.2)) continue;
      out.push(Object.freeze({ x, z, h, lean, r: 0.25 }));
    }
  }
  return out;
}

// A low thing: in the strip, dry, off the trail and the landmarks, off every
// trunk.
const lowFits = (x, z, trunks, { water = 1.0, trail = TRAIL_W / 2 + 0.8, keep = 0.5 } = {}) => !inCore(x, z)
  && inRect(GROWN, x, z) && waterDist(x, z) >= water && trailDist(x, z) >= trail && keepDist(x, z) >= keep
  && trunks.every((t) => Math.hypot(x - t.x, z - t.z) >= 0.9 * t.scale);

// jittered grid points over a tile (z outer, x inner), every candidate
// drawing its numbers whether or not it is kept
function gridOver(tile, rng, cell, jitter, fn) {
  for (let gz = tile.minZ + cell / 2; gz < tile.maxZ; gz += cell) {
    for (let gx = tile.minX + cell / 2; gx < tile.maxX; gx += cell) {
      const x = r2(gx + (rng() * 2 - 1) * jitter);
      const z = r2(gz + (rng() * 2 - 1) * jitter);
      const roll = rng();
      const s = rng();
      const a = rng();
      fn(x, z, roll, s, a);
    }
  }
}
const inTile = (t, x, z) => x >= t.minX && x < t.maxX && z >= t.minZ && z < t.maxZ;
const r3 = (v) => Math.round(v * 1000) / 1000;

function tileLow(sid, tile, pinesHere, snags) {
  const trunks = [...pinesHere, ...snags.map((t) => ({ x: t.x, z: t.z, scale: 0.4 })), ...coreTrees()];
  const rng = mulberry32(seedFromCode(tileSeed('pines', sid, tile.index, 'floor')));
  // ferns: under the forest's pines only, as the core's (about half its 2.5 a
  // 100 m2), none in the swamp
  const ferns = [];
  gridOver(tile, rng, 4, 1.5, (x, z, roll) => {
    if (!isForest(x) || roll >= 0.36 - 0.2 * rimward(x, z)) return;
    if (inTile(tile, x, z) && lowFits(x, z, trunks, { trail: TRAIL_W / 2 + 0.8 })) ferns.push(Object.freeze({ x, z }));
  });
  // little mushrooms, anywhere dry
  const mushrooms = [];
  gridOver(tile, rng, 7, 2.5, (x, z, roll, s, a) => {
    if (roll >= 0.32 - 0.15 * rimward(x, z)) return;
    if (inTile(tile, x, z) && lowFits(x, z, trunks)) mushrooms.push(Object.freeze({ x, z, s: r2(0.9 + 0.5 * s), a: r3(a * Math.PI * 2) }));
  });
  // moss: cushions where the ground's moss patches are, out from under the
  // pines, in threes; thicker in the swamp
  const moss = [];
  gridOver(tile, rng, 5, 2, (x, z, roll, s, a) => {
    const keep = (isForest(x) ? 0.45 : 0.7) * (1 - 0.5 * rimward(x, z));
    if (roll >= keep || pinesMossField(x, z) <= 0.4 || canopyShade(trunks, x, z) >= 0.6) return;
    for (let k = 0; k < 3; k++) {
      const ang = a * Math.PI * 2 + k * 2.1;
      const d = k === 0 ? 0 : 0.45 + 0.7 * ((s + k * 0.37) % 1);
      const mx = r2(x + Math.cos(ang) * d), mz = r2(z + Math.sin(ang) * d);
      if (inTile(tile, mx, mz) && lowFits(mx, mz, trunks, { trail: TRAIL_W / 2 + 0.3 })) moss.push(Object.freeze({ x: mx, z: mz, s: r2(0.8 + 0.45 * s), a: r3(ang) }));
    }
  });
  // blueberries: at the forest's edges of shade
  const blueberries = [];
  gridOver(tile, rng, 7, 2.8, (x, z, roll, s, a) => {
    if (!isForest(x) || roll >= 0.55) return;
    const sh = canopyShade(trunks, x, z);
    if (sh <= 0.05 || sh >= 0.7) return;
    if (inTile(tile, x, z) && lowFits(x, z, trunks)) blueberries.push(Object.freeze({ x, z, a: r3(a * Math.PI * 2) }));
  });
  // needles drifted round each pine, and its cones (the core's stand pine has
  // ten and one; one by a trail twenty-six and three)
  const needles = [];
  const cones = [];
  for (const t of pinesHere) {
    const drop = (n, reach, minD, out, s0, fits) => {
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2;
        const d = (minD + (reach - minD) * Math.sqrt(rng())) * t.scale;
        const yaw = rng() * Math.PI * 2;
        const s = s0 + 0.3 * rng();
        const x = r2(t.x + Math.cos(a) * d), z = r2(t.z + Math.sin(a) * d);
        if (fits(x, z)) out.push(Object.freeze({ x, z, s: r2(s), a: r3(yaw) }));
      }
    };
    const flat = (x, z) => !inCore(x, z) && waterDist(x, z) >= 0.6 && trailDist(x, z) >= TRAIL_W / 2 + 0.15;
    drop(t.near ? 26 : 10, 2.4, 0.35, needles, 0.85, flat);
    drop(t.near ? 3 : 1, 1.8, 0.5, cones, 0.9, (x, z) => flat(x, z) && trailDist(x, z) >= TRAIL_W / 2 + 0.8);
  }
  return { ferns, mushrooms, moss, blueberries, needles, cones };
}

// The reeds: half the core's along the mire's banks (a clump every 4 m, the
// core's every 2), and a full ring round each new bog (as the core's bogs).
// And bog cotton: white tufts on the wet ground round the swamp's bogs.
function tileWet(sid, tile) {
  const reeds = [];
  const add = (x, z) => {
    x = r2(x); z = r2(z);
    if (!inTile(tile, x, z) || inCore(x, z) || !inRect(GROWN, x, z)) return;
    if (b.inWater(grownWaters(), x, z) || trailDist(x, z) < 1.5 || keepDist(x, z) < -0.6) return;
    reeds.push(Object.freeze({ x, z }));
  };
  const mn = pines.PINES_WATERS.find((w) => w.id === 'mire-north');
  const mw = pines.PINES_WATERS.find((w) => w.id === 'mire-west');
  for (let z = -52; z >= GROWN.minZ; z -= 4) { add(mn.minX - 0.5, z); add(mn.maxX + 0.5, z - 2); }
  for (let x = -52; x >= GROWN.minX; x -= 4) { add(x, mw.minZ - 0.5); add(x - 2, mw.maxZ + 0.5); }
  for (const bog of [west.BOG_POOL, DEEP_BOG]) {
    const r = bog.r + 0.5;
    const n = Math.round((2 * Math.PI * r) / 2);
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n + 0.3;
      add(bog.x + Math.cos(a) * r, bog.z + Math.sin(a) * r);
    }
  }
  const rng = mulberry32(seedFromCode(tileSeed('pines', sid, tile.index, 'cotton')));
  // reeds in clumps over the wet hollows
  gridOver(tile, rng, 3.2, 1.2, (x, z, roll) => {
    if (roll < 0.42 * wetHollow(x, z) * (1 - 0.4 * rimward(x, z)) && trailDist(x, z) >= 1.8 && keepDist(x, z) >= 0.5) add(x, z);
  });
  const cotton = [];
  gridOver(tile, rng, 2.6, 1.0, (x, z, roll, s) => {
    if (isForest(x)) return;
    const near = Math.min(...[west.BOG_POOL, DEEP_BOG].map((w) => b.waterGap(w, x, z)));
    const keep = near < 7 ? 0.62 : (0.05 + 0.3 * wetHollow(x, z)) * (1 - 0.5 * rimward(x, z));
    if (roll >= keep || !inTile(tile, x, z)) return;
    if (lowFits(x, z, [], { water: 0.6, trail: TRAIL_W / 2 + 0.6, keep: 0.2 })) cotton.push(Object.freeze({ x, z, s: r2(0.8 + 0.5 * s) }));
  });
  return { reeds, cotton };
}

// content(stripId, index) -> what grows on that tile: a pure function of the
// strip and the index, worked out once and kept.
const CONTENT = new Map();
export function tileContent(sid, index) {
  const k = `${sid}|${index}`;
  let c = CONTENT.get(k);
  if (!c) {
    const tile = (sid === NORTH.id ? NORTH_TILES : WEST_TILES)[index];
    const pinesHere = tilePines(sid, tile);
    const snags = tileSnags(sid, tile, pinesHere);
    c = Object.freeze({
      pines: Object.freeze(pinesHere), snags: Object.freeze(snags),
      ...freezeAll(tileLow(sid, tile, pinesHere, snags)), ...freezeAll(tileWet(sid, tile)),
    });
    CONTENT.set(k, c);
  }
  return c;
}
const freezeAll = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Object.freeze(v)]));
// Everything of one kind, over both strips, tile by tile.
export function stripAll(kind) {
  const out = [];
  for (const { strip, tiles } of STRIPS) for (const t of tiles) out.push(...tileContent(strip.id, t.index)[kind]);
  return out;
}
export const stripPines = () => stripAll('pines');
export const stripSnags = () => stripAll('snags');
// Every collider of the strips' scatter, pines then snags.
export const stripPineColliders = () => [...stripPines(), ...stripSnags()].map(({ x, z, r }) => ({ x, z, r }));

// --- the ground ----------------------------------------------------------------
// The Pines' needle-and-moss tint, with the strips' pines in it, faded to the
// plain ground over the last 8 m before the grown ground's edge (the core's
// fades over the last 8 m before its own).
const ONE = [1, 1, 1];
const WET_TINT = [0.78, 0.8, 0.66];
let tintOnce = null;
export function grownGroundTint(x, z) {
  if (!tintOnce) {
    const island = pines.PINES_ISLAND_PLAIN;
    // the Great Pine's needle bed is as wide as its boughs
    const great = { x: north.GREAT_PINE.x, z: north.GREAT_PINE.z, scale: north.GREAT_PINE.scale };
    tintOnce = pinesFloorTint([...coreTrees(), ...stripPines(), great], { plain: [island] });
  }
  let m = tintOnce(x, z);
  const wet = wetHollow(x, z);
  if (wet > 0) m = lerp3(m, WET_TINT, wet * 0.85);
  const out = Math.max(x - GROWN_GROUND.maxX, GROWN_GROUND.minX - x, z - GROWN_GROUND.maxZ, GROWN_GROUND.minZ - z);
  const k = 1 - smoothstep(-8, -1, out);
  return k < 1 ? lerp3(ONE, m, k) : m;
}

// --- bog cotton ------------------------------------------------------------------
// A tuft: three thin stems, each a single upright blade, each with a white
// puff (an eight-faced ball) at its top. Into the forest floor's mesh.
const COTTON_STEM = lin(0x6a7a3e);
const COTTON = lin(0xf4f2ea);
const COTTON_SHADE = lin(0xd8d6cc);
function cottonGeometry(spots) {
  const t = new Tris();
  for (const p of spots) {
    for (let k = 0; k < 3; k++) {
      const a = b.hash01(p.x + k, p.z, 3301) * Math.PI * 2;
      const d = k === 0 ? 0 : 0.08 + 0.1 * b.hash01(p.x, p.z + k, 3315);
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      const h = (0.28 + 0.16 * b.hash01(x, z, 3329)) * p.s;
      const lean = (b.hash01(z, x, 3343) - 0.5) * 0.08;
      const tx = x + lean, tz = z + lean * 0.5;
      const w = 0.012;
      const n = unit(Math.cos(a), 0.2, Math.sin(a));
      t.v(x - w * Math.sin(a), 0, z + w * Math.cos(a), n, COTTON_STEM);
      t.v(x + w * Math.sin(a), 0, z - w * Math.cos(a), n, COTTON_STEM);
      t.v(tx, h, tz, n, COTTON_STEM);
      const r = (0.035 + 0.02 * b.hash01(x, z, 3357)) * p.s;
      const P = [[r, 0, 0], [-r, 0, 0], [0, r * 1.2, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]];
      const F = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];
      for (const [i, j, l] of F) {
        for (const v of [i, j, l]) {
          const q = P[v];
          t.v(tx + q[0], h + q[1], tz + q[2], unit(q[0], q[1] + r * 0.3, q[2]), q[1] < 0 ? COTTON_SHADE : COTTON);
        }
      }
    }
  }
  return t.geometry();
}

// --- the snags ---------------------------------------------------------------------
// A dead pine: a tapered six-sided trunk, leaning a little, broken off at the
// top, and three or four bare branch stubs pointing up and out. Silver-grey,
// darker at the foot.
const SNAG_GREY = lin(0x9a948a);
const SNAG_DARK = lin(0x5a5048);
function snagGeometry(list) {
  const t = new Tris();
  const tri = (p, q, r, col) => {
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2];
    const vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    const nn = unit(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    t.v(...p, nn, col(p)); t.v(...q, nn, col(q)); t.v(...r, nn, col(r));
  };
  for (const s of list) {
    const col = (p) => scale3(lerp3(SNAG_DARK, SNAG_GREY, clamp01(p[1] / 1.6)), 0.85 + 0.25 * b.hash01(Math.round(p[0] * 4), Math.round(p[1] * 4), 3401));
    const turn = b.hash01(s.x, s.z, 3415) * Math.PI * 2;
    const lx = Math.cos(turn) * s.lean, lz = Math.sin(turn) * s.lean;
    const ring = (y, r) => {
      const pts = [];
      for (let k = 0; k < 6; k++) {
        const a = turn + (k / 6) * Math.PI * 2;
        pts.push([s.x + lx * y + Math.cos(a) * r, y, s.z + lz * y + Math.sin(a) * r]);
      }
      return pts;
    };
    const rs = [[0, 0.3], [0.5, 0.2], [s.h * 0.6, 0.13], [s.h, 0.07]].map(([y, r]) => ring(y, r));
    for (let i = 0; i < rs.length - 1; i++) {
      for (let k = 0; k < 6; k++) {
        const k2 = (k + 1) % 6;
        tri(rs[i][k], rs[i][k2], rs[i + 1][k2], col);
        tri(rs[i][k], rs[i + 1][k2], rs[i + 1][k], col);
      }
    }
    const tip = rs[rs.length - 1];
    for (let k = 0; k < 6; k++) tri(tip[k], tip[(k + 1) % 6], [s.x + lx * s.h, s.h + 0.12 * b.hash01(s.x, k, 3429), s.z + lz * s.h], col);
    const stubs = 3 + Math.floor(b.hash01(s.z, s.x, 3443) * 2);
    for (let k = 0; k < stubs; k++) {
      const y = s.h * (0.35 + 0.5 * (k / stubs)) + 0.2 * b.hash01(k, s.x, 3457);
      const a = turn + k * 2.4;
      const len = 0.45 + 0.5 * b.hash01(s.x, k, 3471) * (1 - k / (stubs + 1));
      const bx = s.x + lx * y, bz = s.z + lz * y;
      const ex = bx + Math.cos(a) * len, ez = bz + Math.sin(a) * len, ey = y + len * 0.55;
      const w = 0.05;
      const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
      tri([bx + px, y - w, bz + pz], [bx - px, y - w, bz - pz], [ex, ey, ez], col);
      tri([bx - px, y + w, bz - pz], [bx + px, y + w, bz + pz], [ex, ey, ez], col);
    }
  }
  return t.geometry();
}

// --- lily pads ---------------------------------------------------------------------
// The core's ring rule (pines.js pinesLilyPads) on the two new bogs, on their
// own seeds.
export function stripLilyPads() {
  const pads = [];
  for (const c of [west.BOG_POOL, DEEP_BOG]) {
    const rng = mulberry32(seedFromCode(`pines|lilies|${c.id}`));
    const ringR = 0.6 * c.r;
    const n = Math.round((2 * Math.PI * ringR) / 1.2);
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * (i + 0.5)) / n;
      const rad = ringR + (rng() * 2 - 1) * 0.15 * c.r;
      const keep = rng() < 0.6;
      const r = r2(0.22 + 0.16 * rng());
      if (keep) pads.push({ x: r2(c.x + Math.cos(a) * rad), z: r2(c.z + Math.sin(a) * rad), r });
    }
  }
  return pads;
}

// What each merged mesh's things stand on, for cutting it per tile
// (render/tilesplit.js): each thing's centre and how far its parts reach.
export function stripFloorItems() {
  return [
    ...stripAll('needles').map((p) => ({ x: p.x, z: p.z, r: 0.12 })),
    ...stripAll('cones').map((p) => ({ x: p.x, z: p.z, r: 0.06 })),
    ...stripAll('moss').map((p) => ({ x: p.x, z: p.z, r: r2(0.36 * p.s) })),
    ...stripAll('blueberries').map((p) => ({ x: p.x, z: p.z, r: 0.35 })),
    ...stripAll('mushrooms').map((p) => ({ x: p.x, z: p.z, r: r2(0.16 * p.s) })),
    ...stripAll('cotton').map((p) => ({ x: p.x, z: p.z, r: r2(0.2 * p.s) })),
  ];
}

const STAND_SEED = seedFromCode('pines-strip-stand');

/**
 * addPinesStrips(scene, { groundMesh, water, wind }) -> { waterFx, stand }
 *
 * Everything of the two strips, added after the core's own things and wholly
 * under local uuids. Every top-level object is tagged userData.strip (its
 * strip's id, or 'strips' when it spans both). The merged scatter and the
 * trail-side pines are tagged to stream (world/streamcore.js); the ground,
 * the waters, the trails and the two landmarks are whole.
 */
export function addPinesStrips(scene, { groundMesh, water = {}, wind } = {}) {
  return withLocalUuids('pines-strips', () => {
    const tag = (o, id = 'strips') => { o.userData.strip = id; return o; };
    const waters = grownWaters();
    // more of the same ground, tinted as the core's is
    for (const [rect, id, name] of [[NORTH_GROUND, NORTH.id, 'stripGroundNorth'], [WEST_GROUND, WEST.id, 'stripGroundWest']]) {
      const patch = b.groundPatch(groundMesh, rect, { surface: 'grass' });
      patch.updateMatrix();
      const attr = patch.geometry.attributes.color;
      const pos = patch.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const m = grownGroundTint(patch.position.x + pos.getX(i), patch.position.z - pos.getY(i));
        attr.setXYZ(i, attr.getX(i) * m[0], attr.getY(i) * m[1], attr.getZ(i) * m[2]);
      }
      patch.name = name;
      scene.add(tag(patch, id));
    }

    // the spring, the bog pool and the far bog
    const waterFx = STRIP_WATERS.map((w) => {
      const fx = createWater(w, {
        color: 0x5f98a8, ...STRIP_WATER_LOOK[w.id],
        quality: water.quality ?? 'high', reducedMotion: water.reducedMotion ?? false, waters,
      });
      scene.add(tag(fx.mesh));
      return fx;
    });

    // the two faint trails, one ribbon (and the hidden data strips the grass
    // and the paw prints read)
    const before = new Set(scene.children);
    addTrails(scene, [{ segs: north.NORTH_TRAIL, w: TRAIL_W }, { segs: west.WEST_TRAIL, w: west.WEST_TRAIL_W }],
      { surface: 'sand', color: 0x7a6a50 }, 'pines-strips', { edge: 1e6, decks: [], waters });
    for (const o of scene.children) if (!before.has(o)) tag(o);

    // the landmarks
    const great = north.addGreatPine(scene, { wind });
    tag(great.tree, NORTH.id); tag(great.roots, NORTH.id);
    tag(west.addToadstoolRing(scene), WEST.id);

    // the pines: by a trail, each its own swaying Group, tagged as a tree; the
    // rest one still stand, its two meshes lifted out of builder.pineStand's
    // Group so the seam can draw each in runs, with the stand's crowns for the
    // corner map. (No stand fade for these: see the notes.)
    const all = stripPines();
    for (const t of all.filter((p) => p.near)) {
      const g = b.pine(t.x, t.z, t.scale, { wind });
      scene.add(tag(streamTree(g)));
    }
    const standPines = all.filter((p) => !p.near);
    const stand = b.pineStand(standPines, STAND_SEED);
    const crowns = stand.userData.mapCrowns;
    const standMeshes = [];
    for (const m of [...stand.children]) {
      stand.remove(m);
      m.name = m.name === 'standTrunks' ? 'stripStandTrunks' : 'stripStandFoliage';
      if (m.name === 'stripStandFoliage') m.userData.mapCrowns = crowns;
      scene.add(tag(streamSmall(m, standPines.map(({ x, z }) => ({ x, z, r: 0 })), { layer: 'trees', reach: 2.6 })));
      standMeshes.push(m);
    }

    // the swamp's dead pines, one mesh in runs like the stand
    const snags = stripSnags();
    const snagMesh = new THREE.Mesh(snagGeometry(snags),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }));
    snagMesh.name = 'stripSnags';
    scene.add(tag(streamSmall(snagMesh, snags.map(({ x, z }) => ({ x, z, r: 0.3 })), { layer: 'trees', reach: 1.4 })));

    // the ferns
    const ferns = stripAll('ferns');
    const fernMesh = b.fernBed(ferns, seedFromCode('pines-strip-ferns'));
    fernMesh.name = 'stripFerns';
    scene.add(tag(streamSmall(fernMesh, ferns.map(({ x, z }) => ({ x, z, r: 0 })), { layer: 'fine' })));

    // the floor: needles, cones, moss, blueberries, mushrooms, and the bog
    // cotton, one mesh
    const floor = forestFloorMesh({
      needles: stripAll('needles'), cones: stripAll('cones'), moss: stripAll('moss'),
      blueberries: stripAll('blueberries'), mushrooms: stripAll('mushrooms'),
    }, { name: 'stripFloor' });
    const cotton = cottonGeometry(stripAll('cotton'));
    const merged = mergeGeometries([floor.geometry, cotton], false);
    floor.geometry.dispose(); cotton.dispose();
    floor.geometry = merged;
    scene.add(tag(streamSmall(floor, stripFloorItems(), { reach: 0.6 })));

    // the reeds (the fine layer, as the core's), and the lily pads (flat: whole)
    const reeds = stripAll('reeds');
    const reedMesh = b.reedBed(reeds, seedFromCode('pines-strip-reeds'));
    reedMesh.name = 'stripReeds';
    scene.add(tag(streamSmall(reedMesh, reeds.map(({ x, z }) => ({ x, z, r: 0 })), { layer: 'fine' })));
    const pads = b.lilyPads(stripLilyPads(), seedFromCode('pines-strip-lilies'));
    pads.name = 'stripLilyPads';
    scene.add(tag(pads));

    return { waterFx, stand: { meshes: standMeshes, pines: standPines, seed: STAND_SEED } };
  });
}


// --- the strip stand's fade ----------------------------------------------------------
// The core's still stand fades tree by tree (treefade.js reads each tree's
// range of its index). The strips' stand is drawn in runs, whose index is
// rewritten as tiles come and go, so that fade cannot see its trees. This is
// the same fade done here, from the area's own per-walk life (walk.js calls
// areaData.life's update every frame with the cat and the camera): a stand
// pine the camera is in or looks through is folded away in the stand (its
// vertices drawn to a point; the runs never touch the vertices) and a single
// pine of its own, the same shape and turn (builder.pine), stands in its place
// in see-through copies of its materials, easing out and back in at the tree
// fade's own rates. In the steady state it allocates nothing.
const LINE_PAD = 0.15; // treefade.js's
const DOWN_RATE = (1 - FADE_OPACITY) / 0.2;
const UP_RATE = (1 - FADE_OPACITY) / 0.4;

export function createStandFade(scene, { meshes, pines: list, seed }, { reducedMotion = false } = {}) {
  const n = list.length;
  if (!n || meshes.length === 0) return { update() {}, dispose() {}, faded: () => 0 };
  // each pine's vertex range in each mesh (builder.pineStand: every pine has
  // the same parts, merged in order)
  const spans = meshes.map((m) => {
    const count = m.geometry.attributes.position.count;
    if (count % n !== 0) throw new Error('pines strip stand: uneven pines');
    return count / n;
  });
  const trees = list.map((p) => {
    const s = p.scale;
    const shapes = b.PINE_OCCLUDER.map((sh) => ({ t: 'cyl', x: p.x, z: p.z, r: sh.r * s, y0: sh.y0 * s, y1: sh.y1 * s, p: OCCLUDER_PAD }));
    const R = Math.max(...shapes.map((q) => q.r + q.p));
    const top = Math.max(...shapes.map((q) => q.y1 + q.p));
    return { p, occ: { x: p.x, z: p.z, R, top, shapes }, op: 1, folded: false, saved: null, clone: null, mats: null, foliage: null };
  });
  const cam = { x: 0, y: 0, z: 0 }, look = { x: 0, y: 0, z: 0 }, far = { x: 0, y: 0, z: 0 };
  let faded = 0;

  function fold(t, i, on) {
    meshes.forEach((m, k) => {
      const pos = m.geometry.attributes.position;
      const a = i * spans[k] * 3, len = spans[k] * 3;
      if (on) {
        if (!t.saved) t.saved = [];
        t.saved[k] = pos.array.slice(a, a + len);
        for (let v = 0; v < spans[k]; v++) { pos.array[a + v * 3] = t.p.x; pos.array[a + v * 3 + 1] = 0; pos.array[a + v * 3 + 2] = t.p.z; }
      } else {
        pos.array.set(t.saved[k], a);
      }
      pos.addUpdateRange(a, len);
      pos.needsUpdate = true;
    });
    t.folded = on;
  }
  function cloneOf(t) {
    if (t.clone) return t.clone;
    withLocalUuids(`pines-strip-fade|${t.p.x}|${t.p.z}`, () => {
      const g = b.pine(t.p.x, t.p.z, t.p.scale);
      g.rotation.y = b.hash01(t.p.x, t.p.z, seed) * Math.PI * 2;
      g.name = 'stripStandFade';
      t.mats = [];
      g.traverse((o) => {
        if (!o.isMesh) return;
        const c = o.material.clone();
        c.onBeforeCompile = o.material.onBeforeCompile;
        c.customProgramCacheKey = o.material.customProgramCacheKey;
        o.material.dispose();
        c.transparent = true;
        c.depthWrite = false;
        o.material = c;
        o.castShadow = true;
        o.receiveShadow = true;
        o.userData.noMerge = true;
        t.mats.push({ m: c, base: c.opacity, trunk: o === g.children[0] });
      });
      g.visible = false;
      scene.add(g);
      t.clone = g;
    });
    return t.clone;
  }

  return {
    faded: () => faded,
    update(dt, _t, catPos, camera) {
      if (!camera || !catPos) return;
      cam.x = camera.position.x; cam.y = camera.position.y; cam.z = camera.position.z;
      look.x = catPos.x; look.y = catPos.y + CAT_LOOK_Y; look.z = catPos.z;
      const camDist = Math.hypot(cam.x - look.x, cam.y - look.y, cam.z - look.z);
      const h = Math.hypot(look.x - cam.x, look.z - cam.z);
      if (h > 1e-3) { far.x = look.x + ((look.x - cam.x) / h) * PAST_LOOK; far.z = look.z + ((look.z - cam.z) / h) * PAST_LOOK; } else { far.x = look.x; far.z = look.z; }
      far.y = look.y;
      for (let i = 0; i < n; i++) {
        const t = trees[i];
        const o = t.occ;
        let want = false, close = false;
        if (Math.hypot(o.x - look.x, o.z - look.z) <= camDist + o.R + PAST_LOOK) {
          const dCam = Math.hypot(cam.x - o.x, cam.z - o.z);
          want = (dCam < o.R && cam.y < o.top) || segmentBlocked(cam, far, o, LINE_PAD);
          close = want && dCam < o.R + NEAR_FOLIAGE && cam.y < o.top + 1;
        }
        if (!want && t.op >= 1) continue;
        const target = close ? FOLIAGE_NEAR_OPACITY : want ? FADE_OPACITY : 1;
        if (reducedMotion) t.op = target;
        else if (t.op > target) t.op = Math.max(target, t.op - DOWN_RATE * dt);
        else t.op = Math.min(target, t.op + UP_RATE * dt);
        if (t.op >= 1) {
          t.op = 1;
          if (t.folded) { fold(t, i, false); t.clone.visible = false; faded--; }
          continue;
        }
        if (!t.folded) { fold(t, i, true); cloneOf(t).visible = true; faded++; }
        const floor = Math.max(t.op, FADE_OPACITY);
        for (const q of t.mats) q.m.opacity = q.base * (q.trunk ? floor : t.op);
      }
    },
    dispose() {
      trees.forEach((t, i) => {
        if (t.folded) fold(t, i, false);
        if (t.clone) {
          scene.remove(t.clone);
          t.clone.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
          t.clone = null;
        }
      });
      faded = 0;
    },
  };
}
