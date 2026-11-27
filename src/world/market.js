import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as b from './builder.js';
import { litMaterial, surfaceMaterialNoMap, tileMetres } from '../render/materials.js';
import { getTextureAnisotropy } from '../render/textures.js';
import { withLocalUuids } from './localuuids.js';
import { hash01 } from './warehouselook.js';
import { createMarketParts, marketMaterials, atlasCell, frontCell, buildTreatMesh, createCobbleTexture, bloomGeometry, BLOOMS, ATLAS_W, ATLAS_H } from './marketparts.js';
import { buildAppleCrate, buildYarnBasket, buildPullToy } from './marketfruit.js';
import { createMarketLife } from './marketlife.js';
import {
  BASIN_PROFILE, SPIRE_PROFILE, BASIN_WATER, FOUNTAIN_STONE, fountainWaterMaterial, latheGeometry, dressFountain,
} from './parkfountain.js';
import {
  MARKET_BOUNDS, MARKET_SPAWN, FOUNTAIN, CAFE, STALLS, TREAT_STALLS, stallById, fromStall,
  MARKET_COLLIDERS, MARKET_KEEPOUT, MARKET_POIS, MARKET_COLLECTIBLES, FRUIT_CRATE, MARKET_LAMPS, FLOUR_SACKS,
  MARKET_CLUTTER, BENCH_AT, BICYCLE_AT, MILK_SHAFTS, AWNING, awningHeight, BIKE, BICYCLE_BASKET_AT, CLIMB_STACK, MARKET_PERCHES,
  PIGEON_PATCH, STALL_PROPS, RAIL_STACK, toStall, TOY_TIPS,
} from './marketplan.js';

// =============================================================================
// THE MARKET SQUARE, DRAWN (Market step 1, Task 3). Every position comes from
// marketplan.js; this file only draws it. Morning-busy and calm to look at:
// striped awnings in warm colours, cobbles, bunting across the square from
// every stall to a mast on the fountain, stacked crates and baskets of
// produce, the town's shop fronts closing it in. At dusk the stalls start
// packing up (cloths over two displays, more crates stacked, the baskets put
// away), the lanterns glow, and the treats are still there (setMarketDusk).
//
// The square's layout and its map are marketplan.js's (42 x 44 m, Task 6's
// ruling): the six stalls, the café, the four lamp posts, the clutter, the
// spawn and the south row's gap for step 4's gateway (U3).
//
// HOW IT IS BUILT. Everything is made inside withLocalUuids, so the build
// draws nothing from Math.random (variation is hash01); the shared builders'
// calls each on a stream of their own (own() below), so the square's own
// models get the same uuids on every build. The kit's shared
// geometries (marketparts.js createMarketParts, made once per build) are
// cloned into place and merged by bucket, one mesh per material per stall
// (roofs.js's way); the originals are disposed at the end of the build, as
// nothing in the scene holds them.
//
// THE TOP-LEVEL CHILDREN, and why each is one:
//   * the ground (cobbles) and the flagstone ring round the fountain: flat;
//   * the fountain (the Park's basin, water and spire, scaled to the plan's
//     r 3.2, with a third small bowl and the bunting's mast on top);
//   * each of the six stalls, a group at its `at`, turned to its `face`
//     (userData.stall = its id): paint (posts, counter, shelf, crates, the
//     treat's stand, the trestle over its hide), awning, atlas (sign and
//     produce), metal and cloth, one mesh each;
//   * each café table with its chairs, and the café's front (a painted
//     shopfront with its windows, window boards and door, a steep striped
//     awning with a scalloped valance, its cup sign): awning (casting, as it
//     did), atlas and paint, one mesh each; its A-frame chalkboard stands on
//     the cobbles in the clutter's kit (step 3, V11);
//   * the four lamp posts (builder.lampPost), the only things that fade;
//   * the five display treats (record.treatMeshes), each its own child,
//     noMerge and casting nothing, so step 2 can hide and show them;
//   * the lanterns: one mesh, one material, lit by setMarketDusk;
//   * the baskets of produce (hidden at dusk) and the packing-up (shown at
//     dusk): one group each, noMerge, casting nothing;
//   * the bunting: one noCast mesh, every pennant and string;
//   * the parked bicycle (record.bicycle), its own group, noMerge, casting
//     nothing, so the life can rock it on its stand when she lands in its
//     basket (step 3, V8); the rest of the clutter is one kit;
//   * the shop fronts, one vertex-coloured mesh a side, casting nothing;
//   * the far town: builder.horizonBand's skyline, noCast.
//
// THE PLAN'S FRAME AND THREE'S. A stall group turned by yaw = atan2(fx, fz)
// carries its local +z along `face`, as the plan's frame does, but three's
// local +x is the plan's -x (the plan's +x is (-fz, fx)). So a plan-local
// point (lx, lz) is the group-local point (-lx, lz): pl() below.
//
// WHAT CASTS. Stalls (their paint and awning), the fountain's stone and mast
// and the lamp posts. Everything else under 1.3 m (the café, the treats, the
// baskets, the packing-up), the high, thin bunting and the shop fronts do not.
// The shop fronts did (Task 6's pictures): at the morning sun's 20 degrees a
// 10 m row throws its shadow ~27 m into the square, so the walk's ±20 m shadow
// box (render/shadowfit.js) cut it off in a hard line across the cobbles that
// moved with the camera, and the seams between the houses let thin lit slits
// through that read as painted road lines. The square is in full sun instead.
//
// NOTHING FADES but the four lamp posts: no mesh carries userData.window.
// =============================================================================

export const MARKET_COBBLE = 0x8b8478; // the cobbles, and the ground bounce
export const MARKET_SKY = Object.freeze({ top: 0x8ec4ea, horizon: 0xe8e0cc }); // a clear, warm morning
export const MARKET_SKY_DUSK = Object.freeze({ top: 0x2a3358, horizon: 0xa86e62 });
export const LANTERN_MAX = 1.6; // the lanterns' emissiveIntensity at full dusk
export const WINDOW_GLOW = 1.0; // the lit shop and house windows' at full dusk
const GROUND_SIZE = 96;
// The cobbles (Task 6): tiled at 0.6 m, so a tile's four rows are 15 cm stones
// (the shared tile's are 30 cm, which read as big even tiles at a cat's height),
// and a gentle tone step per ground vertex (2 m apart) on top of
// builder.ground's macro patches, so the fine tile never reads as one even
// sheet. Step 3 (V11): the square's own tile (marketparts.js
// createCobbleTexture), its rows laid half a stone apart and its stones uneven
// in width and tone, in place of the shared 'cobble' grid of even squares; the
// shared surface's light response (its roughness) is kept, its relief map is
// not (it would not match these stones).
const COBBLE_TILE = 0.6;
const COBBLE_TONE = 0.06; // ± this much value, vertex to vertex
const FLAG_RING = Object.freeze({ r0: 3.15, r1: 5.4, y: 0.012, color: 0x9a9284 });

// The far town, round the shop fronts: blocks hazed by the fog, some tall
// enough to show over the roofs.
export const MARKET_HORIZON = Object.freeze({
  kind: 'skyline', inner: 32, outer: 92, height: 16, wavelength: 40, blocks: 26, color: 0x8f8584, salt: 67,
});

// The fountain: the Park's (r 2.65 at its plinth) scaled to the plan's r 3.2,
// a small third bowl on its finial, and a mast for the bunting.
const FOUNTAIN_SCALE = FOUNTAIN.r / BASIN_PROFILE[0][0];
const MAST_TOP = 6.2;
const TOP_BOWL_PROFILE = Object.freeze([
  [0.05, 2.04], [0.14, 2.08], [0.25, 2.13], [0.32, 2.18], [0.33, 2.21], [0.3, 2.23],
  [0.23, 2.2], [0.1, 2.19], [0.0, 2.19],
]);

// A stall's shape (the plan's w x d is its footprint: counter at the front,
// the keeper behind it, the back shelf at the back).
const COUNTER_H = 0.9;
// (the awning's shape, AWNING, is the plan's: its perches stand on it)
// the stall's sign: a square board standing on the awning's front edge, `inset`
// back from it, its middle `lift` over the sheet there
const SIGN = Object.freeze({ size: 0.7, thick: 0.05, inset: 0.25, lift: 0.38 });
const POLE_H = 4.7; // the bunting's pole, the stall's back post on the plan's -x side
const BUNTING_SAG = 0.45;
const PENNANT = Object.freeze({ w: 0.26, h: 0.32, every: 0.5 });
const PENNANT_COLORS = Object.freeze([0xd2453b, 0xe8b92c, 0x3f6fb5, 0x4c9a52, 0xe58fb0, 0xf3ead2, 0xe0813a]);

// Paint (vertex colours on one material).
const WOOD = 0x8a6a48;
const WOOD_DARK = 0x6e5038;
const CRATE = 0xb08d5e;
const TOPBOARD = 0x7a5a3c;
const ICE = 0xdde9ee;
const WICKER = 0xb08a52;

// Each stall's own look: its awning cell, its sign's picture cell, the
// painted counter front and what is on the counter.
const STALL_LOOK = Object.freeze({
  fish: { awning: 0, sign: 11, paint: 0x5d7fa8, goods: 'fish' },
  baker: { awning: 1, sign: 12, paint: 0xa8524a, goods: [9] },
  cheese: { awning: 2, sign: 13, paint: 0xc9a24a, goods: [10] },
  milk: { awning: 3, sign: 14, paint: 0x5f8f5e, goods: 'churns' },
  flowers: { awning: 4, sign: 8, paint: 0xc98aa0, goods: 'buckets' },
  fruit: { awning: 0, sign: 6, paint: 0x6b8fb8, goods: [6, 7] },
  // 2026-11-22: atlas cells 18-21 (awnings), 22-25 (signs), 26-29 (goods)
  toys: { awning: 18, sign: 22, paint: 0x7a5aa8, goods: 'toys', front: 0, valance: 40 },
  plants: { awning: 19, sign: 24, paint: 0x3f7a5a, goods: 'plants', front: 1, valance: 41 },
  bric: { awning: 20, sign: 25, paint: 0xb87a3a, goods: 'bric', front: 2, valance: 42 },
  butcher: { awning: 21, sign: 23, paint: 0xe6d6c6, goods: 'meat', front: 3, valance: 43 },
});
// what sits in the baskets on each stall's trestle (produce cells)
const TRESTLE_GOODS = Object.freeze({ fish: 7, baker: 9, cheese: 10, milk: 6, flowers: 8, fruit: 6, toys: 26, plants: 28, bric: 39, butcher: 27 });
// the two displays the cloths go over at dusk, and the stalls whose crates are stacked
const CLOTHED = Object.freeze(['flowers', 'fruit']);
const STACKED = Object.freeze(['fish', 'baker', 'cheese']);
const CAFE_CELL = 5;
const CAFE_SIGN = 15;
const CAFE_BOARD_CELL = 17; // the window boards' painted panel (marketparts.js)

// The shop fronts: facade lines just outside the bounds, rows of town
// buildings behind them, each side one mesh.
const FRONT_DEPTH = 6;
// U3: step 4's gateway goes through the south row behind the spawn, here
export const GATEWAY_GAP = Object.freeze({ x: 0, z: MARKET_BOUNDS.maxZ + 0.8, w: 3.2 });
const SIDES = Object.freeze([
  { id: 'north', yaw: 0, x: 0, z: MARKET_BOUNDS.minZ - 0.8, u0: MARKET_BOUNDS.minX - 0.8, u1: MARKET_BOUNDS.maxX + 0.8, gaps: [] },
  // world x = -u on this side, so the gateway's gap (U3) is u -1.6..1.6
  { id: 'south', yaw: Math.PI, x: 0, z: MARKET_BOUNDS.maxZ + 0.8, u0: MARKET_BOUNDS.minX - 0.8, u1: MARKET_BOUNDS.maxX + 0.8, gaps: [[-GATEWAY_GAP.w / 2, GATEWAY_GAP.w / 2]] },
  // world z = -u (west) and u (east); these rows run on past the corners
  { id: 'west', yaw: Math.PI / 2, x: MARKET_BOUNDS.minX - 0.8, z: 0, u0: -(MARKET_BOUNDS.maxZ + 7), u1: -(MARKET_BOUNDS.minZ - 7), gaps: [] },
  { id: 'east', yaw: -Math.PI / 2, x: MARKET_BOUNDS.maxX + 0.8, z: 0, u0: MARKET_BOUNDS.minZ - 7, u1: MARKET_BOUNDS.maxZ + 7, gaps: [] },
].map((s) => Object.freeze(s)));
const WALLS = Object.freeze([0xe8dcc0, 0xd9b26f, 0xc4775a, 0x9fb08c, 0xa9c0cc, 0xa65a44, 0xd9a3a0, 0xe3cfa4, 0xb9a38a]);
const ROOFS = Object.freeze([0x5a5f6a, 0x6b6f78, 0xa0543c, 0x8a4a38, 0x4f545e]);
const FASCIAS = Object.freeze([0x3d6b4f, 0x7a2f35, 0x2f4268, 0x5a3b26, 0x6b4d7a, 0x2f5f5f]);
const GLASS = 0x34404c;
const FRAME = 0xefe9dc;
const DOORS = Object.freeze([0x4a3426, 0x2f4268, 0x3d6b4f, 0x7a2f35]);
// The café's front, on the south row behind its tables (step 3, V11): a
// shopfront painted over the houses' ground floor from x0 to x1, two windows
// either side of its door, the awning from `top` on the wall down to `low`,
// `depth` out over the cobbles, its valance's scallops one to each stripe.
const CAFE_FRONT = Object.freeze({ x0: -10, x1: -5, top: 3.25, low: 2.45, depth: 1.95, band: 0.13, scallop: 0.12 });
const CAFE_LOOK = Object.freeze({ front: 0x2c5646, trim: 0xefe6cf, door: 0x7a4a30, step: 0x9a9284, curtain: 0xf6eedc, brass: 0xc9a040 });

// The clutter's shapes (marketplan.js MARKET_CLUTTER places them).
const BENCH_SEAT_Y = 0.48;
// (the bicycle's shape, BIKE, is the plan's: its basket is a perch)

// The anchors for step 3: where things will be, { x, z, y } (y their top).
const FRUIT = stallById('fruit');
export const MARKET_ANCHORS = Object.freeze({
  // the baker's warm flour sacks, beside the stall on the side away from its hide (step 3's nap)
  flourSacks: Object.freeze({ x: FLOUR_SACKS.x, z: FLOUR_SACKS.z, y: 0.45 }),
  // the crate of apples at the fruit stall's end: a tippable (the record's row, drawn by
  // marketfruit.js), solid in the plan; y the drawn crate's height
  apples: Object.freeze({ ...fromStall(FRUIT, FRUIT_CRATE.lx, FRUIT_CRATE.lz), y: FRUIT_CRATE.h }),
  // the bench facing the fountain (drawn here, MARKET_CLUTTER; not a perch: she walks under its seat): its seat
  bench: Object.freeze({ x: BENCH_AT.x, z: BENCH_AT.z, y: BENCH_SEAT_Y }),
  // the bicycle on its stand by the south row (drawn here, MARKET_CLUTTER): the centre of
  // its basket, as drawn (its yaw is 0: the basket is basketX east of it, leaning to the
  // wall); V8's perch (marketplan.js BICYCLE_BASKET)
  basket: BICYCLE_BASKET_AT,
});

const MARKET_SCENICS = Object.freeze([Object.freeze({ id: 'market-fountain', x: 0, z: 5.6, label: 'the fountain' })]);
const MARKET_BIRDS = Object.freeze([
  Object.freeze({ type: 'bird', x: -2.5, z: 12 }),
  Object.freeze({ type: 'bird', x: 14, z: -14 }),
]);
// Step 3 (V6): five pigeons pecking their patch between the fountain and its
// bench (marketplan.js PIGEON_PATCH), each a 'bird' that reads as a pigeon
// (labelAs, as the Rooftops' are: game/labels.js). Fixed spots, inside the
// patch; they take off as she comes near (critters.js), and run at them is
// the pigeons' find (marketfinds.js).
const MARKET_PIGEONS = Object.freeze([[0, 0], [0.55, 0.3], [-0.5, 0.35], [0.3, -0.55], [-0.4, -0.45]].map(([dx, dz]) => Object.freeze({
  type: 'bird', x: PIGEON_PATCH.x + dx, z: PIGEON_PATCH.z + dz, labelAs: 'pigeon',
})));

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const yawOf = (s) => Math.atan2(s.face.x, s.face.z);
const pl = (lx, lz) => [-lx, lz]; // plan-local -> group-local (the header)
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
function mat4(x, y, z, { yaw = 0, pitch = 0, roll = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  _e.set(pitch, yaw, roll, 'YXZ');
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz));
}
const stallMatrix = (s) => mat4(s.at.x, 0, s.at.z, { yaw: yawOf(s) });

// UVs squeezed into one atlas cell, inset half a texel so no neighbour bleeds in.
function intoCell(g, cell) {
  const { u0, v0, u1, v1 } = atlasCell(cell);
  const pu = 0.5 / ATLAS_W;
  const pv = 0.5 / ATLAS_H;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + pu + uv.getX(i) * (u1 - u0 - 2 * pu), v0 + pv + uv.getY(i) * (v1 - v0 - 2 * pv));
  }
  uv.needsUpdate = true;
  return g;
}

const KEEP = ['position', 'normal', 'uv'];
// A clone of `geo`, moved into place, with exactly the attributes a bucket
// merges (position, normal, uv, and color for a vertex-coloured material).
// `own`: keep the geometry's own vertex colours (a flower's petals and middle).
function prep(geo, matrix, { color = null, cell = null, own = false } = {}) {
  const g = geo.clone();
  for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k) && !(own && k === 'color')) g.deleteAttribute(k);
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.index) g.setIndex(Array.from({ length: n }, (_, i) => i));
  g.clearGroups();
  if (cell != null) intoCell(g, cell);
  if (matrix) g.applyMatrix4(matrix);
  if (color != null) {
    const c = new THREE.Color(color);
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  return g;
}

// The kit: pieces by bucket (a material and whether it casts), one merged mesh each.
function makeKit(prefix) {
  const buckets = new Map();
  return {
    put(key, mat, geo, matrix, { color = null, cell = null, noCast = false, tag = null, own = false } = {}) {
      let k = buckets.get(key);
      if (!k) buckets.set(key, (k = { mat, noCast, tag, geos: [] }));
      k.geos.push(prep(geo, matrix, { color: mat.vertexColors && !own ? (color ?? 0xffffff) : null, cell, own }));
    },
    meshes() {
      return [...buckets.entries()].map(([key, k]) => {
        const geo = k.geos.length === 1 ? k.geos[0] : mergeGeometries(k.geos, false);
        if (!geo) throw new Error(`market: could not merge ${prefix}:${key}`);
        if (k.geos.length > 1) for (const g of k.geos) g.dispose();
        geo.computeBoundingSphere();
        const m = new THREE.Mesh(geo, k.mat);
        m.name = `${prefix}:${key}`;
        m.castShadow = !k.noCast;
        m.receiveShadow = true;
        if (k.noCast) m.userData.noCast = true;
        if (k.tag) Object.assign(m.userData, k.tag);
        return m;
      });
    },
  };
}

// A roof prism along x (0..w): eaves at y 0 over z `over` (front) and
// -depth-over (back), the ridge at `rise` over z -depth/2. Flat faces.
function roofPrism(w, depth, rise, over) {
  const zf = over;
  const zb = -depth - over;
  const zr = -depth / 2;
  const A = [0, 0, zf], B = [w, 0, zf], C = [w, rise, zr], D = [0, rise, zr], E = [0, 0, zb], F = [w, 0, zb];
  const tris = [[A, B, C], [A, C, D], [F, E, D], [F, D, C], [A, D, E], [F, C, B]];
  const pos = new Float32Array(tris.length * 9);
  tris.forEach((t, i) => t.forEach((p, j) => pos.set(p, i * 9 + j * 3)));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// An awning's valance: the striped flap hanging from its front edge, so the
// stripes read from a cat's height too. A strip across x (-sx/2..sx/2) at z,
// its top following the sheet's sagging edge (yTop(x)), `h` deep, its stripes
// (UVs across one cell) running down it; scalloped along the bottom.
function valance(sx, z, yTop, h, n = 8) {
  const pos = [];
  const uv = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const x = (s - 0.5) * sx;
    const y = yTop(x);
    const scallop = i % 2 ? 0.05 : 0;
    pos.push(x, y, z, x, y - h + scallop, z);
    uv.push(s, 1, s, 0);
  }
  const idx = [];
  for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// The beauty pass's valance (the four new stalls): a flap `h` deep with a real scalloped hem, one
// scallop to each stripe (n of them, 4 segments each); its top follows the sheet's edge, three
// rows of vertices (top, the trim band's top, the hem) so the atlas cell's stripes run down it
// and its accent band follows the scallops. UVs 0..1 (the cell squeezes them: valancePixel).
function scallopValance(sx, z, yTop, h, n = 8) {
  const SEG = 4;
  const cols = n * SEG;
  const depth = 0.09;
  const bandH = 0.1;
  const pos = [];
  const uv = [];
  for (let i = 0; i <= cols; i++) {
    const f = i / cols;
    const x = (f - 0.5) * sx;
    const k = i / SEG;
    const l = i === cols ? 1 : k - Math.floor(k);
    const arc = Math.sqrt(Math.max(0, 1 - (2 * l - 1) ** 2));
    const yb = yTop(x) - h + depth * (1 - arc);
    pos.push(x, yTop(x), z, x, yb + bandH, z, x, yb, z);
    uv.push(f, 1, f, 0.28, f, 0);
  }
  const idx = [];
  for (let i = 0; i < cols; i++) {
    for (let r = 0; r < 2; r++) { const a = i * 3 + r; idx.push(a, a + 1, a + 3, a + 3, a + 1, a + 4); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// setMarketDusk(area, k): k 0 (day) .. 1 (dusk). The lanterns' one material
// glows LANTERN_MAX * k; past half way the stalls pack up (cloths over two
// displays, crates stacked) and the baskets of produce are put away. The
// treats stay. Idempotent.
// ---------------------------------------------------------------------------
export function setMarketDusk(area, k) {
  const t = Math.min(1, Math.max(0, Number.isFinite(k) ? k : 0));
  const look = area?.look;
  if (!look) return;
  look.lantern.emissiveIntensity = LANTERN_MAX * t;
  look.windows.emissiveIntensity = WINDOW_GLOW * t;
  const packed = t > 0.5;
  look.packing.visible = packed;
  look.baskets.visible = !packed;
  look.level = t;
}

// The record's `life` (walk.js: areaData.life(ctx), ctx.dusk the walk's
// evening look) is world/marketlife.js's createMarketLife: it sets the
// square's dusk once, and rolls the apples and scatters the petals (step 3).

// ---------------------------------------------------------------------------
// The build
// ---------------------------------------------------------------------------
export function build(scene, { water = {}, wind } = {}) { // eslint-disable-line no-unused-vars
  return withLocalUuids('market-models', () => {
    own('market-sky', () => b.applySky(scene, MARKET_SKY.top, MARKET_SKY.horizon));
    const PARTS = createMarketParts();
    const M = marketMaterials();
    const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
    const flags = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
    const barrel = new THREE.CylinderGeometry(0.5, 0.5, 1, 12).translate(0, 0.5, 0);
    const wheel = new THREE.CylinderGeometry(0.5, 0.5, 1, 14).translate(0, 0.5, 0);
    const disc = new THREE.CircleGeometry(0.5, 10).rotateX(-Math.PI / 2);
    const quad = new THREE.PlaneGeometry(1, 1);

    own('market-ground', () => drawGround(scene));
    drawFountain(scene, M, water);
    const lanterns = []; // world spots of every lantern bulb
    const poles = []; // the bunting's pole tops, one per stall
    const basketKit = makeKit('marketBaskets');
    const packKit = makeKit('marketPacking');
    for (const s of STALLS) {
      if (s.w <= 0) continue;
      scene.add(drawStall(s, { PARTS, M, paint, barrel, wheel, disc, quad, lanterns, poles, basketKit, packKit }));
    }
    // the shop fronts' windows lit at dusk, the café's among them: one mesh for all
    const winLit = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, emissive: 0xffc070, emissiveIntensity: 0 });
    const litKit = makeKit('marketWindowsLit');
    drawCafe(scene, { PARTS, M, paint, quad, lanterns, litKit, winLit });
    for (const { x, z } of MARKET_LAMPS) {
      const lamp = own(`market-lamp-${x},${z}`, () => b.lampPost(x, z));
      lamp.name = `marketLamp:${x},${z}`;
      scene.add(lamp);
    }
    // the clutter (Task 6): everything under 1.3 m drawn into one kit, one
    // mesh per material for the whole square (two draws, casting nothing), and
    // one invisible box per thing, its own top-level child, so the walk's
    // contact shadows still find each one. The noticeboard, the one thing that
    // casts, is its own child: the walk's merge joins meshes by material, and
    // would otherwise make the whole kit cast.
    const tyre = new THREE.TorusGeometry(0.5, 0.07, 6, 20);
    const clutterKit = makeKit('marketClutter');
    const anchorGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const anchorMat = new THREE.MeshBasicMaterial();
    let bicycle = null;
    for (const c of MARKET_CLUTTER) {
      if (c.kind === 'bicycle') {
        // its own group at its spot (no anchor: the group is its own contact
        // shadow's), drawn about its origin, rocked about its own length (x)
        const bk = makeKit(`marketClutter:${c.id}`);
        drawClutter({ ...c, x: 0, z: 0, yaw: 0 }, bk, { PARTS, M, paint, barrel, wheel, tyre, disc, quad });
        bicycle = new THREE.Group();
        bicycle.name = `marketClutter:${c.id}`;
        bicycle.userData.clutter = c.kind;
        bicycle.userData.noMerge = true;
        bicycle.userData.noCast = true;
        bicycle.position.set(c.x, 0, c.z);
        bicycle.rotation.order = 'YXZ'; // its yaw outermost, so a rock (x) is about its own length
        bicycle.rotation.y = c.yaw;
        for (const m of bk.meshes()) bicycle.add(m);
        scene.add(bicycle);
        continue;
      }
      if (c.kind === 'board') {
        const bk = makeKit(`marketClutter:${c.id}`);
        drawClutter(c, bk, { PARTS, M, paint, barrel, wheel, tyre, disc, quad });
        const board = new THREE.Group();
        board.name = `marketClutter:${c.id}`;
        board.userData.clutter = c.kind;
        for (const m of bk.meshes()) board.add(m);
        scene.add(board);
        continue;
      }
      const box = drawClutter(c, clutterKit, { PARTS, M, paint, barrel, wheel, tyre, disc, quad });
      scene.add(clutterAnchor(c, box, anchorGeo, anchorMat));
    }
    const clutter = new THREE.Group();
    clutter.name = 'marketClutter';
    for (const m of clutterKit.meshes()) clutter.add(m);
    scene.add(clutter);
    tyre.dispose();

    // the treats on display, each its own top-level child
    const treatMeshes = {};
    for (const id of [...TREAT_STALLS, 'cafe']) {
      const s = stallById(id);
      const t = buildTreatMesh(s.treat.kind);
      t.position.set(s.treat.x, s.treat.y, s.treat.z);
      t.rotation.y = yawOf(s);
      t.name = `marketTreat:${id}`;
      t.userData.noMerge = true;
      t.userData.treat = id;
      scene.add(t);
      treatMeshes[id] = t;
    }

    // the lanterns: one mesh, one material
    const lk = makeKit('marketLanterns');
    for (const p of lanterns) lk.put('lantern', M.lantern, PARTS.dome, mat4(p.x, p.y, p.z, { sx: 0.16, sy: 0.19, sz: 0.16 }), { noCast: true });
    const lanternMesh = lk.meshes()[0];
    lanternMesh.name = 'marketLanterns';
    scene.add(lanternMesh);

    // the baskets of produce (put away at dusk) and the packing-up (out at dusk)
    const baskets = groupOf('marketBaskets', basketKit);
    const packing = groupOf('marketPacking', packKit);
    packing.visible = false;
    scene.add(baskets, packing);

    scene.add(drawBunting(PARTS, flags, poles));
    // the shop fronts, and a share of their windows lit at dusk (the lit kit above)
    const sack = new THREE.SphereGeometry(0.5, 6, 4);
    const footBarrel = new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0); // eight sides: the foot's barrels are small and far
    for (const side of SIDES) scene.add(drawShopFront(side, { paint, winLit, litKit, barrel: footBarrel, sack }));
    footBarrel.dispose();
    const windows = litKit.meshes()[0];
    windows.name = 'marketWindowsLit';
    windows.userData.shopWindows = true;
    scene.add(windows);
    sack.dispose();
    const band = own('market-band', () => b.horizonBand(MARKET_HORIZON));
    band.userData.noCast = true;
    band.castShadow = false;
    scene.add(band);

    // nothing in the scene holds the kit's own geometries: they were cloned into place
    PARTS.dispose();
    barrel.dispose();
    wheel.dispose();
    disc.dispose();
    quad.dispose();

    const record = {
      name: 'The Market Square',
      colliders: MARKET_COLLIDERS.map((c) => ({ ...c })),
      bounds: { ...MARKET_BOUNDS },
      spawn: { x: MARKET_SPAWN.x, z: MARKET_SPAWN.z },
      boxes: [],
      waters: [],
      waterFx: [],
      pois: MARKET_POIS.map((p) => ({ ...p })),
      collectibles: MARKET_COLLECTIBLES.map((c) => ({ ...c })),
      scenics: MARKET_SCENICS.map((c) => ({ ...c })),
      critterSpawns: [...MARKET_BIRDS, ...MARKET_PIGEONS].map((c) => ({ ...c })), // two birds and five pigeons at their patch
      moments: [],
      puddles: [],
      groundBounce: MARKET_COBBLE,
      skyDusk: { ...MARKET_SKY_DUSK },
      // V1 (step 3): the fruit stall's apple crate, paw it over and its apples
      // roll (marketfruit.js, marketlife.js); still solid in MARKET_COLLIDERS
      // (2026-11-22: the toy stall's yarn basket and pull-along toy come after it, so the crate stays tip-0)
      tippables: [
        { x: MARKET_ANCHORS.apples.x, z: MARKET_ANCHORS.apples.z, kind: 'applecrate', build: buildAppleCrate },
        { x: TOY_TIPS.basket.x, z: TOY_TIPS.basket.z, kind: 'yarnbasket', build: buildYarnBasket },
        { x: TOY_TIPS.toy.x, z: TOY_TIPS.toy.z, kind: 'pulltoy', build: buildPullToy },
      ],
      // V5 (step 3): up the crates onto every awning, the flower trestle, the bicycle's
      // basket, the two crate stacks' tops and the café tables (marketplan.js)
      perches: MARKET_PERCHES.map((p) => ({ ...p })), // the walk's own copy (walk.js may push into it), as roofs.js gives
      // U5: strays come as anywhere, kept off the counters' zones and the hides
      keepOut: MARKET_KEEPOUT,
      // one display treat per treat stall and the café (step 2 hides and shows them)
      treatMeshes,
      // where each stallholder stands, facing front (step 2 puts the people there),
      // and the top of the stall's roof and sign over them (the bubble floats above it)
      keepers: Object.fromEntries(STALLS.filter((s) => s.keeper).map((s) => [s.id, { x: s.keeper.x, z: s.keeper.z, yaw: yawOf(s), roof: stallRoof(s) }])),
      anchors: Object.fromEntries(Object.entries(MARKET_ANCHORS).map(([k, v]) => [k, { ...v }])),
      // the parked bicycle's group: the life rocks it when she lands in its basket (V8)
      bicycle,
      // what setMarketDusk drives
      look: { lantern: M.lantern, windows: winLit, packing, baskets, level: 0 },
    };
    record.life = (ctx) => createMarketLife(record, ctx);
    return record;
  });
}

// The shared builders (the sky, the ground's and the lamps' tiles, the far
// town) each on a stream of their own: what they draw (a texture made on the
// first build, memoised for the next) never moves the square's own uuids.
const own = (key, fn) => withLocalUuids(key, fn);

function groupOf(name, kit) {
  const g = new THREE.Group();
  g.name = name;
  g.userData.noMerge = true;
  for (const m of kit.meshes()) g.add(m);
  return g;
}

// --- the cobbles and the flagstones round the fountain
function drawGround(scene) {
  const ground = b.ground(GROUND_SIZE, MARKET_COBBLE, { surface: 'cobble' });
  // the square's own setts (COBBLE_TILE), keeping builder.ground's macro patches (vertex colours)
  const n = Math.round(GROUND_SIZE / COBBLE_TILE);
  ground.material.dispose();
  const setts = createCobbleTexture(); // freed with the walk's scene (not a shared 'surface:' tile)
  setts.repeat.set(n, n);
  setts.anisotropy = getTextureAnisotropy();
  ground.material = surfaceMaterialNoMap('cobble', MARKET_COBBLE, { map: setts, vertexColors: true });
  const col = ground.geometry.attributes.color;
  const gp = ground.geometry.attributes.position;
  for (let i = 0; i < col.count; i++) {
    const k = 1 + COBBLE_TONE * (2 * hash01(Math.round(gp.getX(i) * 10), Math.round(gp.getY(i) * 10), 57) - 1);
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  col.needsUpdate = true;
  ground.name = 'marketCobbles';
  scene.add(ground);
  const ring = new THREE.RingGeometry(FLAG_RING.r0, FLAG_RING.r1, 48, 1);
  ring.rotateX(-Math.PI / 2);
  const tile = tileMetres('flagstone') || 1;
  const pos = ring.attributes.position;
  const uv = ring.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / tile, pos.getZ(i) / tile);
  const flags = new THREE.Mesh(ring, litMaterial(FLAG_RING.color, { surface: 'flagstone', repeat: [1, 1] }));
  flags.position.set(FOUNTAIN.x, FLAG_RING.y, FOUNTAIN.z);
  flags.name = 'marketFlagstones';
  flags.userData.ground = true;
  flags.receiveShadow = true;
  scene.add(flags);
}

// --- the fountain: the Park's, scaled, with a third bowl and the bunting's mast
function drawFountain(scene, M, water) {
  const stoneMat = surfaceMaterialNoMap('cobble', FOUNTAIN_STONE.color, { roughness: FOUNTAIN_STONE.roughness });
  const stone = () => stoneMat; // one material for the basin, the spire and the top bowl
  const f = new THREE.Group();
  f.name = 'marketFountain';
  const basin = new THREE.Mesh(latheGeometry(BASIN_PROFILE), stone());
  basin.name = 'fountainBasin';
  const pool = new THREE.Mesh(
    new THREE.CylinderGeometry(BASIN_WATER.r, BASIN_WATER.r, BASIN_WATER.h, BASIN_WATER.segments),
    fountainWaterMaterial());
  pool.position.y = BASIN_WATER.top - BASIN_WATER.h / 2;
  pool.name = 'fountainWater';
  // flat in the basin: no shadow, and kept apart from the upper water so the
  // walk's merge cannot drop its noCast
  pool.castShadow = false;
  pool.userData.noCast = true;
  pool.userData.noMerge = true;
  const spire = new THREE.Mesh(latheGeometry(SPIRE_PROFILE), stone());
  spire.name = 'fountainSpire';
  const bowl = new THREE.Mesh(latheGeometry(TOP_BOWL_PROFILE, 16), stone());
  bowl.name = 'fountainTopBowl';
  const mastH = MAST_TOP / FOUNTAIN_SCALE - 2.15;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.036, mastH, 6), M.metal);
  mast.position.y = 2.15 + mastH / 2;
  mast.name = 'fountainMast';
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), M.metal);
  knob.position.y = MAST_TOP / FOUNTAIN_SCALE + 0.03;
  knob.name = 'fountainMastKnob';
  f.add(basin, pool, spire, bowl, mast, knob);
  dressFountain(f, { reducedMotion: !!water.reducedMotion });
  f.scale.setScalar(FOUNTAIN_SCALE);
  f.position.set(FOUNTAIN.x, 0, FOUNTAIN.z);
  scene.add(f);
}

// The awning sheet's height at a group-local point (its sag and slope, as
// marketparts.js makes it, scaled by AWNING.rise about AWNING.y).
function awningGeom(s) {
  const sx = s.w + AWNING.over;
  const z0 = -s.d / 2 - AWNING.back;
  const z1 = s.d / 2 + AWNING.front;
  const sz = z1 - z0;
  const cz = (z0 + z1) / 2;
  const yAt = (x, z) => awningHeight(s, -x, z); // group-local x is the plan's -lx (pl)
  return { sx, sz, cz, z1, yAt };
}

// The highest point of a stall's roof: its sign's top edge, or the awning's
// back edge (the sheet's highest line) if that were higher. The lanterns and
// the valance hang below the front edge. marketlive.js floats the busy bubble
// over it (keepers[id].roof), so no awning or sign ever hides the tell.
function stallRoof(s) {
  const awn = awningGeom(s);
  const sign = awn.yAt(0, awn.z1 - SIGN.inset) + SIGN.lift + SIGN.size / 2;
  return Math.max(sign, AWNING.y + AWNING.rise * 0.12 * 0.5);
}

// A cart's spoked wheel in a kit's frame: its centre at (x, r, z), its face
// to `side` (+1 +z, -1 -z): a dark rim, a pale disc set in it, four spokes and
// a hub. `wood` and `box` are the kit's painters, `wheel` the build's unit
// cylinder (base at 0).
function cartWheel(wood, box, wheel, x, z, side, r) {
  const face = (dz, rr, t, color) => wood(wheel, mat4(x, r, z + side * dz, { pitch: Math.PI / 2, sx: 2 * rr, sy: t, sz: 2 * rr }).multiply(mat4(0, -0.5, 0)), color);
  face(0, r, 0.06, WOOD_DARK); // the rim
  face(0.012, r * 0.8, 0.06, 0xc9a26e); // the wheel's pale face, inside the rim
  for (let k = 0; k < 4; k++) {
    box(x, r - 0.02, z + side * 0.05, 2 * r * 0.78, 0.04, 0.02, WOOD_DARK, { roll: (k * Math.PI) / 4 });
  }
  face(0.05, 0.07, 0.06, WOOD_DARK); // the hub
}

// --- one stall, in its own group at its plan spot
function drawStall(s, { PARTS, M, paint, barrel, wheel, disc, quad, lanterns, poles, basketKit, packKit }) {
  const look = STALL_LOOK[s.id];
  const g = new THREE.Group();
  g.name = `marketStall:${s.id}`;
  g.userData.stall = s.id;
  g.position.set(s.at.x, 0, s.at.z);
  g.rotation.y = yawOf(s);
  const K = makeKit(`marketStall:${s.id}`);
  const wood = (geo, m, color = WOOD) => K.put('paint', paint, geo, m, { color });
  const atlas = (geo, m, cell) => K.put('atlas', M.stall, geo, m, { cell, noCast: true });
  const metal = (geo, m) => K.put('metal', M.metal, geo, m, { noCast: true });
  const box = (x, y, z, w, h, d, color, extra = {}) => wood(PARTS.crate, mat4(x, y, z, { sx: w, sy: h, sz: d, ...extra }), color);
  const W = s.w;
  const D = s.d;
  const cart = s.id === 'milk';
  const cd = cart ? 0.8 : Math.min(0.7, D * 0.4);
  const awn = awningGeom(s);
  const toWorld = stallMatrix(s);
  // small shapes for the beauty pass (the four new stalls): paint-coloured, in the stall's own kit
  const sz0 = -D / 2 + 0.15; // the back shelf's z
  // (a bulb is the kit's twenty-sided ball, 20 triangles, not the sphere's 80: the budget's)
  const bulb = (x, y, z, sx, sy, sz, color, extra = {}) => wood(PARTS.dome, mat4(x, y, z, { sx, sy, sz, ...extra }), color);
  // (a drum is a six-sided post unless `round`: 24 triangles, not the barrel's 48; the budget's)
  const drum = (x, y, z, sx, sy, sz, color, extra = {}, round = false) => wood(round ? barrel : PARTS.post, mat4(x, y, z, { sx, sy, sz, ...extra }), color);
  const dome = (x, y, z, sx, sy, sz, color) => wood(PARTS.dome, mat4(x, y, z, { sx, sy, sz }), color);
  // a price slate (coins, no words) leaning back on the counter's front edge at x
  const slate = (x, y, z) => {
    const base = mat4(x, y, z, { pitch: -0.3 });
    wood(PARTS.crate, base.clone().multiply(mat4(0, 0, 0, { sx: 0.31, sy: 0.25, sz: 0.03 })), WOOD);
    atlas(quad, base.clone().multiply(mat4(0, 0.125, 0.018, { sx: 0.28, sy: 0.22 })), 36);
  };
  // a counter lantern: a dark foot and a bulb that glows at dusk (the lantern mesh is shared)
  const glow = (x, y, z) => {
    box(x, y, z, 0.12, 0.04, 0.12, WOOD_DARK);
    const p = new THREE.Vector3(x, y + 0.14, z).applyMatrix4(toWorld);
    lanterns.push({ x: p.x, y: p.y, z: p.z });
  };

  // posts: front and back at the footprint's corners; the plan's -x back post is the bunting's pole
  for (const lxs of [-1, 1]) {
    for (const lzs of [-1, 1]) {
      const [x, z] = pl(lxs * W / 2, lzs * D / 2);
      const pole = lzs < 0 && lxs < 0;
      const h = pole ? POLE_H : awn.yAt(x, z) - 0.01;
      wood(PARTS.post, mat4(x, 0, z, { sx: 0.1, sy: h, sz: 0.1 }), WOOD_DARK);
      if (pole) poles.push({ ...new THREE.Vector3(x, POLE_H, z).applyMatrix4(toWorld) });
    }
  }
  // the awning
  K.put('awning', M.awning, PARTS.awningSheet(look.awning), mat4(0, AWNING.y, awn.cz, { sx: awn.sx, sy: AWNING.rise, sz: awn.sz }), { tag: { awning: true } });
  {
    const flap = look.valance != null
      ? scallopValance(awn.sx, awn.z1, (x) => awn.yAt(x, awn.z1) + 0.01, 0.32)
      : valance(awn.sx, awn.z1, (x) => awn.yAt(x, awn.z1) + 0.01, 0.26);
    K.put('awning', M.awning, flap, null, { cell: look.valance ?? look.awning });
    flap.dispose();
  }
  // the sign, standing on the awning's front edge, its picture both ways
  {
    const sz = awn.z1 - SIGN.inset;
    const sign = new THREE.BoxGeometry(SIGN.size, SIGN.size, SIGN.thick);
    atlas(sign, mat4(0, awn.yAt(0, sz) + SIGN.lift, sz), look.sign);
    sign.dispose();
  }
  // the lanterns: a string along the awning's front edge (the treat stalls)
  if (TREAT_STALLS.includes(s.id)) {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const lx = -W / 2 + 0.15 + (i * (W - 0.3)) / (n - 1);
      const z = awn.z1 - 0.04;
      const p = new THREE.Vector3(lx, awn.yAt(lx, z) - 0.16 - 0.06 * Math.sin((Math.PI * i) / (n - 1)), z).applyMatrix4(toWorld);
      lanterns.push({ x: p.x, y: p.y, z: p.z });
    }
  }

  if (cart) {
    // the milk cart, its long side to the square (Task 6: it must read as a
    // cart from the front): a green body on four spoked wheels, two each
    // side, the shafts lying out from the end away from the hide down to the
    // cobbles (marketplan.js MILK_SHAFTS, solid), churns on top
    const bz = D / 2 - cd / 2;
    box(0, 0.42, bz, W, 0.53, cd, look.paint);
    box(0, 0.42, bz, W + 0.04, 0.05, cd + 0.04, WOOD_DARK); // the chassis rail
    box(0, 0.95, bz, W + 0.04, 0.04, cd + 0.04, TOPBOARD);
    for (const side of [-1, 1]) {
      const z = bz + side * (cd / 2 + 0.045);
      for (const wx of [-1, 1]) cartWheel(wood, box, wheel, wx * (W / 2 - 0.42), z, side, 0.36);
    }
    {
      // two poles, from the chassis at the cart's end (0.68 up) to their tips on the cobbles
      const [xm] = pl(MILK_SHAFTS.lx, 0); // their middle, over the plan's circle
      const rise = 0.62;
      const tilt = Math.sign(xm) * -Math.atan2(rise, MILK_SHAFTS.len);
      for (const dz of [-0.24, 0.24]) {
        wood(PARTS.box, mat4(xm, 0.06 + rise / 2, bz + dz, { roll: tilt, sx: Math.hypot(MILK_SHAFTS.len, rise), sy: 0.05, sz: 0.05 }), WOOD);
      }
      // the swingle-bar across their tips
      box(xm + Math.sign(xm) * (MILK_SHAFTS.len / 2 - 0.05), 0.02, bz, 0.05, 0.05, 0.6, WOOD_DARK);
    }
    for (let i = 0; i < 3; i++) {
      const x = -W / 2 + 0.45 + i * ((W - 0.9) / 2);
      metal(barrel, mat4(x, 0.99, bz, { sx: 0.3, sy: 0.42, sz: 0.3 }));
      metal(PARTS.bulb, mat4(x, 1.41, bz, { sx: 0.3, sy: 0.12, sz: 0.3 })); // the shoulder
      metal(barrel, mat4(x, 1.44, bz, { sx: 0.16, sy: 0.1, sz: 0.16 })); // the neck
      metal(barrel, mat4(x, 1.54, bz, { sx: 0.2, sy: 0.04, sz: 0.2 })); // the lid
    }
  } else {
    // the counter: a painted front with a board on top
    box(0, 0, D / 2 - cd / 2, W, COUNTER_H - 0.05, cd, look.paint);
    box(0, COUNTER_H - 0.05, D / 2 - cd / 2, W + 0.06, 0.05, cd + 0.06, TOPBOARD);
    // the beauty pass: a painted front (planks, rug, apron or cloth) in two halves of the atlas cell
    if (look.front != null) {
      const { u0, v0, u1, v1 } = frontCell(look.front);
      for (const hx of [-1, 1]) {
        const q = quad.clone();
        const uv = q.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
        K.put('front', M.front, q, mat4(hx * W / 4, (COUNTER_H - 0.05) / 2, D / 2 + 0.006, { sx: W / 2, sy: COUNTER_H - 0.05 }), { noCast: true });
        q.dispose();
      }
    }
    // the back shelf: two uprights, three boards, two crates on top
    const sz = -D / 2 + 0.15;
    for (const sx of [-1, 1]) box(sx * (W / 2 - 0.2), 0, sz, 0.06, 1.42, 0.3, WOOD);
    for (const y of [0.45, 0.95, 1.4]) box(0, y, sz, W - 0.35, 0.04, 0.3, WOOD);
    for (const sx of [-1, 1]) box(sx * (W / 4), 1.44, sz, 0.42, 0.28, 0.3, CRATE, { yaw: sx * 0.08 });
  }

  // what is on the counter
  const top = cart ? 0.97 : COUNTER_H;
  const cz = D / 2 - cd / 2;
  if (Array.isArray(look.goods)) {
    const n = Math.max(2, Math.floor((W - 0.3) / 0.6));
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + 0.15 + 0.3 + (i * (W - 0.9)) / (n - 1);
      const tilt = { yaw: 0, pitch: 0.28 };
      box(x, top, cz, 0.5, 0.16, cd - 0.15, CRATE, tilt);
      const m = mat4(x, top, cz, tilt).multiply(mat4(0, 0.15, 0, { pitch: -Math.PI / 2, sx: 0.46, sy: cd - 0.2 }));
      atlas(quad, m, look.goods[i % look.goods.length]);
    }
  } else if (look.goods === 'fish') {
    box(0, top, cz, W - 0.2, 0.05, cd - 0.1, ICE);
    for (let i = 0; i < 4; i++) {
      const x = -W / 2 + 0.5 + (i * (W - 1.0)) / 3;
      wood(PARTS.bulb, mat4(x, top + 0.08, cz + (i % 2 ? 0.08 : -0.08), { yaw: 0.3 - i * 0.2, sx: 0.36, sy: 0.08, sz: 0.11 }), 0x9aaebb);
    }
  } else if (look.goods === 'toys') {
    // a tray of toy blocks, a teddy, a pyramid of blocks, wool balls
    box(-0.55, top, cz, 0.6, 0.05, cd - 0.15, WOOD_DARK);
    atlas(quad, mat4(-0.55, top + 0.052, cz, { pitch: -Math.PI / 2 }).multiply(mat4(0, 0, 0, { sx: 0.56, sy: cd - 0.2 })), 26);
    bulb(0.02, top + 0.14, cz, 0.26, 0.28, 0.22, 0xb8793c); // the teddy: body, head, ears, snout, a bow
    bulb(0.02, top + 0.35, cz + 0.02, 0.2, 0.19, 0.18, 0xc8894a);
    for (const e of [-1, 1]) bulb(0.02 + e * 0.085, top + 0.46, cz + 0.02, 0.085, 0.085, 0.07, 0xb8793c);
    bulb(0.02, top + 0.33, cz + 0.12, 0.09, 0.07, 0.07, 0xf0dcb4);
    bulb(0.02, top + 0.255, cz + 0.1, 0.12, 0.05, 0.05, 0xd8433c);
    for (const [bx, by, bc, byaw] of [[0.5, 0, 0xd8433c, 0.2], [0.76, 0, 0x4a86b8, -0.15], [0.63, 0.19, 0xf2c94c, 0.1]]) box(bx, top + by, cz, 0.22, 0.19, 0.22, bc, { yaw: byaw });
    [[0.95, 0xc04a8a], [1.12, 0x4c9a52], [1.0, 0xf2c94c]].forEach(([bx, bc], i) => bulb(bx, top + 0.09 + (i === 2 ? 0.17 : 0), cz + (i === 2 ? 0 : (i ? -0.1 : 0.1)), 0.18, 0.18, 0.18, bc));
    slate(0.82, top, D / 2 - 0.12);
    glow(-W / 2 + 0.14, top, cz + 0.12);
    // up on the shelf: a toy drum, a duck, a small bear
    drum(-0.7, 0.99, sz0, 0.26, 0.2, 0.26, 0xd8433c);
    drum(-0.7, 1.19, sz0, 0.28, 0.025, 0.28, 0xf3ead2);
  } else if (look.goods === 'plants') {
    // pots of four sorts (leafy, flowering, a cactus, a tall one), a tray of seedlings
    const pot = (x, h) => { drum(x, top, cz, 0.24, h, 0.24, 0xb5622f, {}); drum(x, top + h - 0.04, cz, 0.29, 0.05, 0.29, 0xc9733a, {}); };
    pot(-1.0, 0.2);
    dome(-1.0, top + 0.34, cz, 0.3, 0.26, 0.3, 0x2f6a30);
    dome(-0.94, top + 0.42, cz + 0.02, 0.22, 0.2, 0.22, 0x3f8f4a);
    pot(-0.55, 0.18);
    dome(-0.55, top + 0.3, cz, 0.3, 0.2, 0.3, 0x3f8f4a);
    for (const [fx, fz, fc] of [[-0.07, 0.05, 0xe85a8c], [0.05, -0.04, 0xf5d142], [0, 0.08, 0xe85a8c]]) bulb(-0.55 + fx, top + 0.43, cz + fz, 0.09, 0.09, 0.09, fc);
    box(0.15, top, cz, 0.62, 0.05, cd - 0.15, WOOD_DARK);
    atlas(quad, mat4(0.15, top + 0.052, cz, { pitch: -Math.PI / 2 }).multiply(mat4(0, 0, 0, { sx: 0.58, sy: cd - 0.2 })), 28);
    pot(0.75, 0.16);
    drum(0.75, top + 0.16, cz, 0.15, 0.3, 0.15, 0x5a9a4a); // the cactus
    for (const e of [-1, 1]) bulb(0.75 + e * 0.11, top + 0.34, cz, 0.08, 0.17, 0.08, 0x5a9a4a);
    bulb(0.75, top + 0.5, cz, 0.07, 0.05, 0.07, 0xe85a8c);
    pot(1.05, 0.22);
    for (const [dy, r] of [[0.32, 0.26], [0.5, 0.2], [0.65, 0.14]]) dome(1.05, top + dy, cz, r, r * 0.9, r, 0x2f6a30);
    slate(-0.2, top, D / 2 - 0.12);
    glow(-W / 2 + 0.12, top, cz - 0.1);
    // a hook rail across the front under the valance, and a basket on two chains at each corner
    box(0, 1.98, D / 2 - 0.1, W - 0.1, 0.04, 0.04, WOOD_DARK);
    for (const hx of [-1, 1]) {
      const x = hx * (W / 2 - 0.3);
      wood(PARTS.dome, mat4(x, 1.58, D / 2 - 0.1, { sx: 0.3, sy: 0.16, sz: 0.3 }), WICKER);
      dome(x, 1.72, D / 2 - 0.1, 0.34, 0.22, 0.34, 0x3f8f4a);
      for (const dx of [-0.1, 0.1]) box(x + dx, 1.66, D / 2 - 0.1, 0.02, 0.34, 0.02, IRON);
    }
  } else if (look.goods === 'bric') {
    // a teapot, a stack of plates, a lamp, books, a vase and a painting
    bulb(-0.85, top + 0.13, cz, 0.3, 0.26, 0.3, 0x4a7fb5); // the teapot: body, lid, knob, spout, handle
    bulb(-0.85, top + 0.28, cz, 0.16, 0.06, 0.16, 0xe9dcb9);
    bulb(-0.85, top + 0.32, cz, 0.05, 0.05, 0.05, 0xe9dcb9);
    bulb(-0.66, top + 0.17, cz, 0.15, 0.06, 0.06, 0x4a7fb5, { roll: 0.7 });
    drum(-1.04, top + 0.06, cz, 0.1, 0.16, 0.05, 0x4a7fb5);
    bulb(-0.85, top + 0.13, cz + 0.141, 0.3, 0.03, 0.01, 0xf2efe6);
    for (let i = 0; i < 3; i++) drum(-0.3, top + i * 0.04, cz, 0.34 - i * 0.012, 0.035, 0.34 - i * 0.012, i % 2 ? 0xf2efe6 : 0xdfe9f2);
    drum(-0.3, top + 0.12, cz, 0.12, 0.012, 0.12, 0xc23b34);
    drum(0.15, top, cz, 0.1, 0.36, 0.1, 0xd8b072); // the lamp: a post, a shade
    drum(0.15, top, cz, 0.2, 0.025, 0.2, 0x6e4a33);
    wood(PARTS.dome, mat4(0.15, top + 0.4, cz, { sx: 0.34, sy: 0.22, sz: 0.34 }), 0xf2c94c);
    for (const [bx, by, bc, bw] of [[0.62, 0, 0x3f6fb5, 0.3], [0.64, 0.05, 0xc23b34, 0.27]]) box(bx, top + by, cz, bw, 0.05, 0.2, bc, { yaw: bx - 0.62 });
    bulb(0.95, top + 0.16, cz, 0.2, 0.24, 0.2, 0xf2efe6); // a vase with a flower
    drum(0.95, top + 0.27, cz, 0.09, 0.1, 0.09, 0xf2efe6);
    bulb(0.95, top + 0.46, cz, 0.1, 0.1, 0.1, 0xe85a8c);
    drum(0.95, top + 0.3, cz, 0.012, 0.15, 0.012, 0x4f8f3e);
    box(1.1, top, cz - 0.1, 0.05, 0.04, 0.05, WOOD);
    // the painting, leaning on the shelf; a price slate; a lantern at each end
    box(-0.15, top + 0.5, sz0 + 0.2, 0.46, 0.46, 0.04, 0xc9a040, { pitch: -0.2 });
    atlas(quad, mat4(-0.15, top + 0.5, sz0 + 0.2, { pitch: -0.2 }).multiply(mat4(0, 0.23, 0.025, { sx: 0.4, sy: 0.4 })), 29);
    slate(0.4, top, D / 2 - 0.12);
    glow(-W / 2 + 0.12, top, cz + 0.12);
    for (const [x, y, c] of [[0.5, 1.15, 0x3f6fb5], [0.62, 1.15, 0xc23b34]]) box(x, y - 0.06, sz0, 0.1, 0.28, 0.2, c); // books on the shelf
  } else if (look.goods === 'meat') {
    box(0, top, cz, W - 0.2, 0.05, cd - 0.1, 0xf6efe4);
    // a ham on the bone, a pile of sausages, a pie, a tray of chops
    bulb(-1.0, top + 0.17, cz, 0.38, 0.24, 0.26, 0xe0877d);
    bulb(-1.0, top + 0.21, cz + 0.07, 0.24, 0.12, 0.14, 0xf0b4ac);
    drum(-1.22, top + 0.16, cz, 0.05, 0.08, 0.05, 0xf3ead2);
    for (const [dx, dy, dz, c] of [[-0.12, 0.05, -0.08, 0xc0614a], [0.12, 0.05, -0.04, 0xa83a34], [0, 0.05, 0.1, 0xc0614a], [0, 0.13, 0, 0xd96a5a], [-0.1, 0.05, 0.1, 0xa83a34]]) drum(-0.5 + dx - 0.16, top + dy - 0.05 + 0.0, cz + dz, 0.1, 0.32, 0.1, c, { roll: -Math.PI / 2, yaw: dz * 1.5 });
    drum(0.05, top, cz, 0.34, 0.1, 0.34, 0xc8873c); // the pie
    wood(PARTS.dome, mat4(0.05, top + 0.09, cz, { sx: 0.32, sy: 0.12, sz: 0.32 }), 0xd9a050);
    slate(1.12, top, D / 2 - 0.12);
    glow(-W / 2 + 0.1, top, cz - 0.12);
    for (let k = 0; k < 3; k++) { // three hung meat panels along the back, two pictures alternating
      atlas(quad, mat4((k - 1) * ((W - 0.6) / 3), top + 0.4, -D / 2 + 0.31).multiply(mat4(0, 0, 0, { sx: (W - 0.6) / 3 - 0.02, sy: 0.4 })), k === 1 ? 38 : 27);
    }
    for (let k = 0; k < 3; k++) drum(-0.7 + k * 0.7, 0.99, sz0, 0.14, 0.16 + (k % 2) * 0.04, 0.14, [0xb83a34, 0xc9871a, 0x4c8a3c, 0xb83a34, 0xc9871a][k]); // jars of preserves
  } else if (look.goods === 'buckets') {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + 0.35 + (i * (W - 0.7)) / (n - 1);
      metal(PARTS.basket, mat4(x, top, cz, { sx: 0.34, sy: 0.3, sz: 0.34 }));
      atlas(disc, mat4(x, top + 0.29, cz, { sx: 0.4, sz: 0.4 }), 8);
    }
  }

  // the treat's stand, at the counter's front corner on the hide's side
  if (s.treat) {
    const t = s.treat;
    const [x, z] = pl(s.hideSide * (W / 2 - 0.3), D / 2 + 0.35);
    if (t.kind === 'fishhead') {
      box(x, 0, z, 0.42, t.y - 0.056 - 0.04, 0.42, CRATE);
      box(x, t.y - 0.056 - 0.04, z, 0.46, 0.04, 0.46, ICE);
    } else if (t.kind === 'sausageroll') {
      box(x, 0, z, 0.36, t.y - 0.04 - 0.02, 0.36, WOOD);
      metal(PARTS.crate, mat4(x, t.y - 0.04 - 0.02, z, { sx: 0.42, sy: 0.02, sz: 0.32 }));
    } else if (t.kind === 'cheddar') {
      wood(barrel, mat4(x, 0, z, { sx: 0.46, sy: t.y - 0.04 - 0.03, sz: 0.46 }), WOOD);
      box(x, t.y - 0.04 - 0.03, z, 0.4, 0.03, 0.4, TOPBOARD);
    } else if (t.kind === 'cream') {
      box(x, 0, z, 0.5, t.y - 0.0225, 0.32, WOOD_DARK);
    } else if (t.kind === 'wool') { // a basket of yarn on a crate
      box(x, 0, z, 0.4, t.y - 0.04, 0.4, CRATE);
      box(x, t.y - 0.04, z, 0.44, 0.03, 0.44, TOPBOARD);
    } else if (t.kind === 'catnip') { // a clay planter of catnip at the end of the shelf
      box(x, 0, z, 0.4, t.y - 0.05, 0.4, 0xb5622f);
      box(x, t.y - 0.05, z, 0.46, 0.04, 0.46, 0xc9733a);
    } else if (t.kind === 'sardines') { // a crate with a cloth over its lid
      box(x, 0, z, 0.42, t.y - 0.03, 0.42, CRATE);
      box(x, t.y - 0.03, z, 0.46, 0.02, 0.46, 0xe9dcb9);
    } else if (t.kind === 'sausages') { // the butcher's block under the string, the hook rail over it
      box(x, 0, z, 0.4, 0.42, 0.4, WOOD_DARK);
      box(x, 0.42, z, 0.46, 0.05, 0.46, TOPBOARD);
      const y = 2.05; // the rail: a bar from the awning's front edge, over the string, two short hangers
      const BRASS = 0xb98a3a; // brass, so it reads against the pink houses
      box(x, t.y + 0.3, z, 0.012, y - t.y - 0.3, 0.012, IRON); // the cord the string hangs from (the links are the treat's mesh)
      box(x - 0.15, y, z, 1.2, 0.05, 0.05, BRASS);
      for (const dx of [-0.7, 0.4]) box(x + dx, y + 0.04, z, 0.03, 0.12, 0.03, BRASS);
      for (const dx of [-0.6, -0.4, 0.2]) { // a hung string of two links on a hook
        for (const [dy, c] of [[0.28, 0xc0614a], [0.08, 0xa83a34]]) wood(PARTS.post, mat4(x + dx, y - 0.4 + dy - 0.11, z, { sx: 0.11, sy: 0.22, sz: 0.11 }), c);
        box(x + dx, y - 0.02, z, 0.015, 0.1, 0.015, BRASS);
      }
      { // a lantern on the rail's end: the warm spot over the crates
        const p = new THREE.Vector3(x + 0.38, y - 0.24, z).applyMatrix4(toWorld);
        box(x + 0.38, y - 0.07, z, 0.012, 0.07, 0.012, BRASS);
        lanterns.push({ x: p.x, y: p.y, z: p.z });
      }
    }
  }

  // the trestle over the hide, its cloth and its baskets
  if (s.hide) {
    const [x, z] = pl(s.hideSide * (W / 2 + 1.2), D / 2 - 0.3);
    wood(PARTS.trestle, mat4(x, 0, z, { yaw: Math.PI / 2, sx: 1.4, sz: 1.8 }), WOOD);
    K.put('cloth', M.cloth, PARTS.box, mat4(x, 0.765, z, { sx: 0.95, sy: 0.02, sz: 1.46 }), { noCast: true });
    for (const dz of [-0.35, 0.35]) {
      const m = mat4(x, 0.775, z + dz);
      basketAt(basketKit, PARTS, paint, M, disc, toWorld.clone().multiply(m), TRESTLE_GOODS[s.id]);
    }
  }
  // the four stalls of 2026-11-22: shelves, trunks, the chopping block and the rail's crates (plan: STALL_PROPS)
  {
    const P = STALL_PROPS[s.id];
    const side = -s.hideSide;
    const at = (out, lz) => pl(side * (W / 2 + out), lz);
    if (s.id === 'plants') {
      for (const [out, top] of [[P.lowOut, P.lowTop], [P.highOut, P.highTop]]) {
        const [x, z] = at(out, P.lz);
        for (const dz of [-0.5, 0.5]) box(x, 0, z + dz, 0.34, top - 0.05, 0.08, WOOD_DARK); // two trestle ends
        box(x, top - 0.05, z, 0.4, 0.05, 1.2, TOPBOARD);
      }
      { // a leafy plant in a pot on the low tier, clear of its perch (the pots stand on the tiers: knockables)
        const [x, z] = at(P.lowOut, P.lz - 0.4);
        wood(barrel, mat4(x, P.lowTop, z, { sx: 0.2, sy: 0.16, sz: 0.2 }), 0xb5622f);
        wood(PARTS.dome, mat4(x, P.lowTop + 0.26, z, { sx: 0.28, sy: 0.24, sz: 0.28 }), 0x3f8f4a);
      }
    } else if (s.id === 'bric') {
      P.outs.forEach((out, i) => {
        const [x, z] = at(out, P.lz);
        const top = P.tops[i];
        box(x, 0, z, 0.5, top - 0.04, 0.9, 0x6e4a33, { yaw: i * 0.05 }); // a travelling trunk
        box(x, top * 0.35, z, 0.52, 0.04, 0.92, IRON, { yaw: i * 0.05 }); // its iron bands
        box(x, top * 0.75, z, 0.52, 0.04, 0.92, IRON, { yaw: i * 0.05 });
        box(x, top - 0.04, z, 0.54, 0.04, 0.94, TOPBOARD, { yaw: i * 0.05 });
      });
    } else if (s.id === 'butcher') {
      const [x, z] = at(P.blockOut, P.lz);
      box(x, 0, z, 0.5, P.blockTop - 0.06, 0.5, WOOD); // the chopping block the bucket stands on
      box(x, P.blockTop - 0.06, z, 0.56, 0.06, 0.56, TOPBOARD);
      // the crates under the sausage string: three, as the climb stacks
      const rl = toStall(s, RAIL_STACK.x, RAIL_STACK.z);
      const [rx, rz] = pl(rl.lx, rl.lz);
      for (let i = 0; i < 3; i++) box(rx + (i % 2 ? 0.02 : -0.02), i * 0.317, rz, 0.5, 0.31, 0.5, CRATE, { yaw: i * 0.15 });
    }
  }
  // (the apples' crate at the fruit stall's end is a tippable since step 3:
  // marketfruit.js's buildAppleCrate, the record's `tippables` row)

  // morning-busy: crates stacked at the back corners, a sack on one, inside the
  // plan's r 0.3 corner colliders (a crate's half-diagonal is 0.27)
  {
    const [x0, z0] = pl(-W / 2, -D / 2);
    const n = 2 + Math.floor(hash01(s.at.x, s.at.z, 41) * 2);
    for (let i = 0; i < n; i++) box(x0 + (i % 2 ? 0.02 : -0.01), i * 0.29, z0, 0.4, 0.28, 0.36, CRATE, { yaw: (i % 3) * 0.06 });
    const [x1, z1] = pl(W / 2, -D / 2);
    box(x1, 0, z1, 0.4, 0.28, 0.36, CRATE, { yaw: -0.05 });
    wood(PARTS.bulb, mat4(x1, 0.28 + 0.21, z1, { yaw: 0.4, sx: 0.32, sy: 0.44, sz: 0.26 }), 0xc9b48a);
  }

  // the baker's flour sacks, where the nap is (marketplan.js FLOUR_SACKS, MARKET_ANCHORS.flourSacks):
  // two low sacks side by side on the cobbles, a cat's bed (the nap rests at the ground)
  if (s.id === 'baker') {
    const [x, z] = pl(-(W / 2 + 0.6), -D / 2 + 0.5);
    wood(PARTS.bulb, mat4(x - 0.17, 0.07, z + 0.03, { yaw: 0.25, sx: 0.5, sy: 0.14, sz: 0.34 }), 0xc9b48a);
    wood(PARTS.bulb, mat4(x + 0.2, 0.07, z - 0.06, { yaw: -0.35, sx: 0.5, sy: 0.14, sz: 0.34 }), 0xbfa77a);
  }

  // packing up (dusk): cloths over two displays, crates stacked behind two counters
  if (CLOTHED.includes(s.id)) {
    packKit.put('cloth', M.cloth, PARTS.box, toWorld.clone().multiply(mat4(0, top + 0.17, cz, { sx: W + 0.1, sy: 0.34, sz: cd + 0.1 })), { noCast: true });
    packKit.put('cloth', M.cloth, quad, toWorld.clone().multiply(mat4(0, top - 0.1, D / 2 + 0.06, { sx: W + 0.1, sy: 0.6 })), { noCast: true });
  }
  if (STACKED.includes(s.id)) {
    const [x, z] = pl(-(W / 2 - 0.32), -D / 2 + 0.55);
    for (let i = 0; i < 4; i++) {
      packKit.put('crates', paint, PARTS.crate, toWorld.clone().multiply(mat4(x + (i % 2 ? 0.03 : -0.02), i * 0.3, z, { yaw: (i % 3) * 0.07, sx: 0.44, sy: 0.29, sz: 0.36 })), { color: CRATE, noCast: true });
    }
  }

  for (const m of K.meshes()) g.add(m);
  return g;
}

// A basket of produce at `m` (world), into the baskets' kit: the wicker and its fill.
function basketAt(kit, PARTS, paint, M, disc, m, cell) {
  kit.put('wicker', paint, PARTS.basket, m.clone().multiply(mat4(0, 0, 0, { sx: 0.36, sy: 0.22, sz: 0.36 })), { color: WICKER, noCast: true });
  kit.put('produce', M.stall, disc, m.clone().multiply(mat4(0, 0.2, 0, { sx: 0.34, sz: 0.34 })), { cell, noCast: true });
}

// --- the clutter (marketplan.js MARKET_CLUTTER): every thing drawn into the
// one shared kit `K`, in place (its spot, its yaw, the bicycle's lean), one
// mesh per material for them all; everything under 1.3 m casts nothing, the
// noticeboard (1.95 m) does. Answers the thing's world box, for its anchor.
const BENCH_GREEN = 0x3d6b4f;
const IRON = 0x34383c;
const SACK = 0xc9b48a;
const NOTES = Object.freeze([0xf3ead2, 0xe8d36a, 0xa9cfdc, 0xe7a5b5, 0xffffff]);
// The flower tubs' blooms (step 3, V11): 5-7 a tub, [petals, middle], and their stems.
const TUB_BLOOMS = Object.freeze({ min: 5, max: 7 });
const TUB_SALT = 173;
const STEM_GREEN = 0x4f8f3e;
const LEAF_GREEN = 0x2f5e2c;
const UP = new THREE.Vector3(0, 1, 0);
// (the flowers themselves, bloomGeometry and BLOOMS, are marketparts.js's: the flower stall's
// bucket in marketlife.js carries a bunch of them too)
// The café's A-frame chalkboard: `h` high at its hinge, `w` wide, each board
// `tilt` off upright; its slate is atlas cell 16 (marketparts.js).
const CHALKBOARD = Object.freeze({ h: 0.86, w: 0.52, tilt: 0.24, cell: 16 });
function drawClutter(c, K, { PARTS, M, paint, barrel, wheel, tyre, disc, quad }) {
  const casts = c.kind === 'board';
  const lean = c.kind === 'bicycle' ? BIKE.lean : 0;
  const at = mat4(c.x, 0, c.z, { yaw: c.yaw }).multiply(new THREE.Matrix4().makeRotationX(lean));
  const box3 = new THREE.Box3();
  const grow = (geo, m) => {
    if (!geo.boundingBox) geo.computeBoundingBox();
    box3.union(geo.boundingBox.clone().applyMatrix4(m));
  };
  const wood = (geo, m, color = WOOD) => {
    const w = at.clone().multiply(m);
    K.put(casts ? 'paint:cast' : 'paint', paint, geo, w, { color, noCast: !casts });
    grow(geo, w);
  };
  const atlas = (geo, m, cell) => {
    const w = at.clone().multiply(m);
    K.put('atlas', M.stall, geo, w, { cell, noCast: true });
    grow(geo, w);
  };
  const box = (x, y, z, w, h, d, color, extra = {}) => wood(PARTS.crate, mat4(x, y, z, { sx: w, sy: h, sz: d, ...extra }), color);
  // a beam between two points in the x-y plane, at depth z
  const tube = (ax, ay, bx, by, z, t, color) => wood(PARTS.box, mat4((ax + bx) / 2, (ay + by) / 2, z, { roll: Math.atan2(by - ay, bx - ax), sx: Math.hypot(bx - ax, by - ay), sy: t, sz: t }), color);
  const crateOf = (x, y, z, cell, yaw = 0) => {
    box(x, y, z, 0.5, 0.22, 0.42, CRATE, { yaw });
    atlas(quad, mat4(x, y + 0.225, z, { yaw, pitch: -Math.PI / 2, sx: 0.46, sy: 0.38 }), cell);
  };
  if (c.kind === 'barrow') {
    // a market handcart: a tray of crates on two wheels, legs at one end, handles at the other
    box(0, 0.38, 0, 1.3, 0.05, 0.72, WOOD);
    for (const sz of [-1, 1]) box(0, 0.43, sz * 0.36, 1.3, 0.22, 0.04, WOOD);
    for (const sx of [-1, 1]) box(sx * 0.65, 0.43, 0, 0.04, 0.22, 0.72, WOOD);
    for (const sz of [-1, 1]) {
      cartWheel(wood, box, wheel, 0.2, sz * 0.43, sz, 0.3);
      box(-0.55, 0, sz * 0.3, 0.05, 0.38, 0.05, WOOD_DARK);
      box(0.95, 0.5, sz * 0.3, 0.62, 0.04, 0.04, WOOD_DARK);
    }
    crateOf(-0.32, 0.43, 0, 6, 0.06);
    crateOf(0.3, 0.43, 0.02, 7, -0.05);
    crateOf(-0.02, 0.65, 0, c.id.endsWith('w') ? 9 : 10, 0.1);
  } else if (c.kind === 'bench') {
    // a park bench, its front (+z) to the fountain: iron ends, green slats
    for (const sx of [-1, 1]) {
      box(sx * 0.7, 0, 0.13, 0.05, BENCH_SEAT_Y - 0.04, 0.05, IRON);
      tube(sx * 0.7, 0, sx * 0.7, 0.95, -0.17, 0.05, IRON);
      box(sx * 0.7, BENCH_SEAT_Y - 0.08, -0.02, 0.05, 0.04, 0.36, IRON);
    }
    for (const sz of [-0.12, 0, 0.12]) box(0, BENCH_SEAT_Y - 0.03, sz, 1.62, 0.03, 0.1, BENCH_GREEN);
    for (const y of [0.62, 0.79]) box(0, y, -0.18, 1.62, 0.1, 0.03, BENCH_GREEN);
  } else if (c.kind === 'tub') {
    // a half-barrel of flowers: two iron hoops, a low mound of leaves, and
    // over it 5-7 flowers on short green stems, each a cup of five petals
    // round a bright middle (step 3, V11: it was a dome painted with blooms)
    wood(barrel, mat4(0, 0, 0, { sx: 0.76, sy: 0.45, sz: 0.76 }), WOOD);
    for (const y of [0.07, 0.33]) wood(barrel, mat4(0, y, 0, { sx: 0.785, sy: 0.04, sz: 0.785 }), IRON);
    wood(PARTS.dome, mat4(0, 0.43, 0, { yaw: 6 * hash01(c.x, c.z, TUB_SALT + 9), sx: 0.74, sy: 0.38, sz: 0.74 }), LEAF_GREEN);
    const n = TUB_BLOOMS.min + Math.floor(hash01(c.x, c.z, TUB_SALT) * (TUB_BLOOMS.max - TUB_BLOOMS.min + 1));
    const turn = 2 * Math.PI * hash01(c.z, c.x, TUB_SALT + 1);
    const hue = Math.floor(hash01(c.x, c.z, TUB_SALT + 2) * BLOOMS.length);
    for (let i = 0; i < n; i++) {
      const h = (k) => hash01(c.x + i, c.z - i, TUB_SALT + 3 + k);
      // the first in the middle, the rest round it
      const a = turn + (i * 2 * Math.PI) / (n - 1) + 0.3 * (h(0) - 0.5);
      const r = i === 0 ? 0.03 : 0.22 + 0.04 * h(1);
      const head = new THREE.Vector3(r * Math.sin(a), 0.66 + 0.08 * h(2) + (i === 0 ? 0.05 : 0), r * Math.cos(a));
      const foot = new THREE.Vector3(head.x * 0.45, 0.5, head.z * 0.45);
      const dir = head.clone().sub(foot);
      const stemM = new THREE.Matrix4().compose(foot, _q.setFromUnitVectors(UP, dir.clone().normalize()), _s.set(0.016, dir.length(), 0.016));
      wood(PARTS.stem, stemM, STEM_GREEN);
      // the flower faces up and a little out, toward whoever looks at the tub
      const face = new THREE.Vector3(head.x * 1.6, 1, head.z * 1.6).normalize();
      const [petal, middle] = BLOOMS[(hue + i * 3) % BLOOMS.length];
      const bloom = bloomGeometry(petal, middle);
      const s = 0.17 + 0.03 * h(3);
      const w = at.clone().multiply(new THREE.Matrix4().compose(head, _q.setFromUnitVectors(UP, face), _s.set(s, s, s)));
      K.put('paint', paint, bloom, w, { own: true, noCast: true });
      grow(bloom, w);
      bloom.dispose();
    }
  } else if (c.kind === 'stack') {
    // crates three high, one beside, two sacks and a basket of apples on top
    box(-0.15, 0, 0, 0.5, 0.3, 0.42, CRATE);
    box(-0.13, 0.3, 0.02, 0.48, 0.3, 0.4, CRATE, { yaw: 0.1 });
    box(-0.16, 0.6, 0, 0.46, 0.28, 0.4, CRATE, { yaw: -0.08 });
    box(0.33, 0, 0.08, 0.44, 0.3, 0.4, CRATE, { yaw: 0.25 });
    wood(PARTS.bulb, mat4(0.3, 0.22, -0.32, { yaw: 0.4, sx: 0.36, sy: 0.46, sz: 0.3 }), SACK);
    wood(PARTS.bulb, mat4(0.34, 0.48, 0.08, { yaw: -0.3, sx: 0.34, sy: 0.38, sz: 0.28 }), 0xbfa77a);
    wood(PARTS.basket, mat4(-0.16, 0.88, 0, { sx: 0.32, sy: 0.18, sz: 0.32 }), WICKER);
    atlas(disc, mat4(-0.16, 1.04, 0, { sx: 0.3, sz: 0.3 }), 6);
  } else if (c.kind === 'crates') {
    // V5: a climbing stack, three crates to CLIMB_STACK.h, a flat top to stand on
    const h = CLIMB_STACK.h / 3;
    box(0, 0, 0, 0.42, h, 0.4, CRATE);
    box(0.01, h, -0.01, 0.42, h, 0.4, CRATE, { yaw: 0.07 });
    box(-0.01, 2 * h, 0.01, 0.42, h, 0.4, CRATE, { yaw: -0.05 });
  } else if (c.kind === 'board') {
    // the noticeboard: two posts, a green frame, a cork face with notes, a little roof
    for (const sx of [-1, 1]) box(sx * 0.55, 0, 0, 0.08, 1.95, 0.08, WOOD_DARK);
    box(0, 0.95, 0, 1.3, 0.85, 0.05, BENCH_GREEN);
    box(0, 1.0, 0.026, 1.16, 0.75, 0.01, 0xb98a5a);
    NOTES.forEach((col, i) => {
      const x = -0.42 + i * 0.21 + 0.03 * Math.sin(i * 2.1);
      const y = 1.12 + 0.24 * ((i % 2) - 0.5) + 0.04 * Math.cos(i * 1.7);
      box(x, y, 0.034, 0.17 + 0.04 * (i % 3), 0.22, 0.006, col, { roll: 0.12 * Math.sin(i * 3.3) });
    });
    box(0, 1.92, 0, 1.5, 0.05, 0.26, WOOD_DARK);
  } else if (c.kind === 'chalkboard') {
    // the café's A-frame chalkboard (step 3, V11), its front (+z) to the square:
    // two framed boards leaning together from a hinged top, the front one's
    // slate the atlas's chalk pictures (a cup, a slice of cake, a croissant:
    // no letters, M12) with a little ledge for the chalk; the back one plain
    const { h, w, tilt } = CHALKBOARD;
    const len = h / Math.cos(tilt);
    const foot = Math.tan(tilt) * h; // each board's foot, out from under the hinge
    for (const side of [1, -1]) {
      // a board stands on its foot and leans in to the hinge (a box turns about its base)
      const pitch = -side * tilt;
      box(0, 0, side * foot, w, len, 0.03, WOOD, { pitch });
      if (side > 0) {
        // the slate, just proud of the frame, and the ledge across its foot
        const n = [Math.sin(tilt), Math.cos(tilt)]; // its outward normal's (y, z)
        const mid = (0.13 + len - 0.035) / 2; // the slate's middle, this far up the board
        atlas(quad, mat4(0, mid * Math.cos(tilt) + n[0] * 0.017, foot - mid * Math.sin(tilt) + n[1] * 0.017, { pitch, sx: w - 0.06, sy: len - 0.165 }), CHALKBOARD.cell);
        const up = 0.08; // the ledge, this far up the board, under the slate
        box(0, up * Math.cos(tilt) + n[0] * 0.035 - 0.0125, foot - up * Math.sin(tilt) + n[1] * 0.035, w - 0.04, 0.025, 0.05, WOOD_DARK, { pitch });
      }
    }
    box(0, h - 0.02, 0, w + 0.02, 0.04, 0.07, WOOD_DARK); // the hinge along the top
  } else if (c.kind === 'bicycle') {
    // a bicycle on its stand, leaning a touch to the wall (+z), its basket over the front wheel
    const fr = 0x2f5f5f;
    const A = BIKE.axle;
    const R = BIKE.wheelR;
    for (const sx of [-1, 1]) {
      wood(tyre, mat4(sx * A, R, 0, { sx: 2 * R / 1.07, sy: 2 * R / 1.07, sz: 0.6 }), 0x26282a);
      wood(barrel, mat4(sx * A, R, -0.04, { pitch: Math.PI / 2, sx: 0.06, sy: 0.08, sz: 0.06 }), IRON);
    }
    const BB = [-0.06, 0.3], S = [-0.2, 0.8], H = [0.36, 0.84], Hb = [0.4, 0.64];
    tube(-A, R, BB[0], BB[1], 0, 0.035, fr);
    tube(-A, R, S[0], S[1], 0, 0.03, fr);
    tube(BB[0], BB[1], S[0], S[1], 0, 0.04, fr);
    tube(BB[0], BB[1], Hb[0], Hb[1], 0, 0.04, fr);
    tube(S[0], S[1], H[0], H[1], 0, 0.035, fr);
    tube(H[0], H[1], Hb[0], Hb[1], 0, 0.04, fr);
    tube(Hb[0], Hb[1], A, R, 0, 0.03, fr);
    box(S[0] - 0.03, S[1] + 0.02, 0, 0.24, 0.05, 0.1, 0x4a3426); // the saddle
    tube(H[0], H[1], H[0] - 0.02, H[1] + 0.08, 0, 0.03, fr);
    box(H[0] - 0.02, H[1] + 0.08, 0, 0.04, 0.035, 0.52, IRON); // the handlebar
    wood(PARTS.basket, mat4(BIKE.basketX, BIKE.basketY - 0.11, 0, { sx: 0.3, sy: 0.22, sz: 0.34 }), WICKER);
    atlas(disc, mat4(BIKE.basketX, BIKE.basketY + 0.08, 0, { sx: 0.26, sz: 0.3 }), 9);
    tube(BB[0], BB[1], BB[0] - 0.12, 0.0, 0.08, 0.025, IRON); // the stand
  }
  return box3;
}

// One thing's contact-shadow anchor: an invisible box over its drawn footprint,
// a top-level child of its own (render/contactshadows.js scans each top-level
// child's box; the walk's merge skips a hidden mesh). It draws nothing.
function clutterAnchor(c, box, geo, mat) {
  const a = new THREE.Mesh(geo, mat);
  a.name = `marketClutter:${c.id}`;
  a.userData.clutter = c.kind;
  a.userData.noCast = true;
  a.castShadow = false;
  a.receiveShadow = false;
  a.visible = false;
  const size = box.getSize(new THREE.Vector3());
  const mid = box.getCenter(new THREE.Vector3());
  a.position.set(mid.x, box.min.y, mid.z);
  a.scale.set(size.x, size.y, size.z);
  return a;
}

// --- the café: three tables with their chairs, and its front on the south row
function drawCafe(scene, { PARTS, M, paint, quad, lanterns, litKit, winLit }) {
  // the crumbs (marketplan.js CAFE) lie under table 0's top's edge, clear of its foot
  const CHAIRS = [[0.6, 2.1, 3.4], [0.4, 2.4, 4.3], [1.1, 3.1, 5.0]];
  CAFE.tables.forEach((t, i) => {
    const at = t;
    const g = new THREE.Group();
    g.name = `marketCafe:${i}`;
    g.userData.cafeTable = i;
    g.position.set(at.x, 0, at.z);
    const K = makeKit(`marketCafe:${i}`);
    K.put('paint', paint, PARTS.cafeTable, null, { color: 0x3f4a3f, noCast: true });
    for (const a of CHAIRS[i]) {
      K.put('paint', paint, PARTS.cafeChair, mat4(Math.sin(a) * 0.62, 0, Math.cos(a) * 0.62, { yaw: a + Math.PI }), { color: 0x6b4d3a, noCast: true });
    }
    for (const m of K.meshes()) g.add(m);
    scene.add(g);
  });
  // The café's front on the south row (step 3, V11): a painted shopfront over
  // the houses' ground floor, cream pilasters, a window either side of the
  // door, café curtains, painted window boards under the windows; a steep
  // striped awning from high on the wall down over the cobbles, its valance
  // scalloped one tongue to a stripe, closed at the ends; the cup sign above
  // it. Everything but the awning casts nothing. Its world frame: x along
  // the row, v out from the house fronts (world z = zf - v).
  const F = CAFE_FRONT;
  const zf = MARKET_BOUNDS.maxZ + 0.8;
  const g = new THREE.Group();
  g.name = 'marketCafeFront';
  const K = makeKit('marketCafeFront');
  const w = F.x1 - F.x0;
  const cx = (F.x0 + F.x1) / 2;
  const front = (x, y, v, extra) => mat4(x, y, zf - v, { yaw: Math.PI, ...extra });
  const paintBox = (x, y, v, sx, sy, sz, color) => K.put('paint', paint, PARTS.crate, front(x, y, v, { sx, sy, sz }), { color, noCast: true });
  const plane = (x, y, v, sx, sy) => front(x, y, v, { sx, sy });
  // the shopfront: a green board over the ground floor, a cream band under the awning
  paintBox(cx, 0, 0.075, w, F.top + 0.05, 0.06, CAFE_LOOK.front);
  paintBox(cx, 2.5, 0.12, w, 0.12, 0.04, CAFE_LOOK.trim);
  // the door in the middle, a window either side, cream pilasters between them
  const DOOR = { x: cx, w: 0.9, h: 2.15 };
  const posts = [F.x0 + 0.1, DOOR.x - DOOR.w / 2 - 0.15, DOOR.x + DOOR.w / 2 + 0.15, F.x1 - 0.1];
  for (const x of posts) paintBox(x, 0, 0.13, 0.2, 2.5, 0.06, CAFE_LOOK.trim);
  const windows = [[posts[0] + 0.1, posts[1] - 0.1], [posts[2] + 0.1, posts[3] - 0.1]];
  for (const [x0, x1] of windows) {
    const wx = (x0 + x1) / 2;
    const ww = x1 - x0;
    paintBox(wx, 0.72, 0.12, ww, 1.72, 0.03, CAFE_LOOK.trim); // the frame
    litKit.put('glass', winLit, quad, plane(wx, 1.58, 0.137, ww - 0.12, 1.6), { color: GLASS, noCast: true });
    // café curtains on a brass rod across the lower half
    K.put('paint', paint, quad, plane(wx, 1.17, 0.142, ww - 0.14, 0.62), { color: CAFE_LOOK.curtain, noCast: true });
    paintBox(wx, 1.47, 0.145, ww - 0.1, 0.025, 0.02, CAFE_LOOK.brass);
    // the glazing bars: one upright, one across near the top
    paintBox(wx, 0.78, 0.15, 0.05, 1.6, 0.02, CAFE_LOOK.trim);
    paintBox(wx, 1.96, 0.15, ww - 0.12, 0.05, 0.02, CAFE_LOOK.trim);
    // the sill, and under it two painted window boards (atlas cell 17)
    paintBox(wx, 0.68, 0.17, ww + 0.08, 0.05, 0.1, CAFE_LOOK.trim);
    for (const side of [-1, 1]) {
      K.put('atlas', M.stall, PARTS.crate, front(wx + side * ww / 4, 0.1, 0.13, { sx: ww / 2 - 0.04, sy: 0.55, sz: 0.03 }), { cell: CAFE_BOARD_CELL, noCast: true });
    }
  }
  // the door: a frame, a wooden door with a glass top and a brass knob, a stone step
  paintBox(DOOR.x, 0, 0.12, DOOR.w + 0.1, DOOR.h + 0.08, 0.03, CAFE_LOOK.trim);
  paintBox(DOOR.x, 0, 0.135, DOOR.w, DOOR.h, 0.03, CAFE_LOOK.door);
  litKit.put('glass', winLit, quad, plane(DOOR.x, 1.5, 0.152, DOOR.w - 0.24, 0.95), { color: GLASS, noCast: true });
  paintBox(DOOR.x + DOOR.w / 2 - 0.12, 0.98, 0.16, 0.06, 0.06, 0.04, CAFE_LOOK.brass);
  paintBox(DOOR.x, 0, 0.3, DOOR.w + 0.4, 0.08, 0.34, CAFE_LOOK.step);

  // the awning: two striped sheets (each the café's stripes once), from `top` at the wall to `low`
  const run = F.depth - 0.12;
  const rise = F.top - 0.05 - F.low;
  const slope = Math.hypot(run, rise);
  const pitch = Math.atan2(run, rise);
  // the valance under each, scalloped one tongue to a stripe
  const flap = scallopedValance(w / 2, F.band, F.scallop);
  for (const k of [0, 1]) {
    const x = F.x0 + (w / 2) * (k + 0.5);
    K.put('awning', M.awning, quad, front(x, F.low + rise / 2, 0.12 + run / 2, { pitch: -pitch, sx: w / 2, sy: slope }), { cell: CAFE_CELL, tag: { awning: true } });
    K.put('awning', M.awning, flap, front(x, F.low + 0.01, F.depth, {}), { cell: CAFE_CELL });
  }
  flap.dispose();
  // the two ends closed with a triangle of the stripes' colour
  {
    const end = new THREE.BufferGeometry();
    end.setAttribute('position', new THREE.Float32BufferAttribute([0, F.top - 0.05, 0.12, 0, F.low, F.depth, 0, F.low, 0.12], 3));
    end.setAttribute('uv', new THREE.Float32BufferAttribute([0.05, 0.5, 0.05, 0.5, 0.05, 0.5], 2));
    end.computeVertexNormals();
    for (const x of [F.x0, F.x1]) K.put('awning', M.awning, end, mat4(x, 0, zf, { sz: -1 }), { cell: CAFE_CELL });
    end.dispose();
  }
  // the cup sign on the wall over the awning
  const sign = new THREE.BoxGeometry(0.9, 0.9, 0.05);
  K.put('atlas', M.stall, sign, mat4(cx, F.top + 0.47, zf - 0.05, { yaw: Math.PI }), { cell: CAFE_SIGN, noCast: true });
  sign.dispose();
  for (const m of K.meshes()) g.add(m);
  scene.add(g);
  // the lanterns along the awning's front, under its scallops
  const n = 7;
  for (let i = 0; i < n; i++) {
    const x = F.x0 + 0.3 + (i * (w - 0.6)) / (n - 1);
    lanterns.push({ x, y: F.low - F.band - F.scallop - 0.12 - 0.06 * Math.sin((Math.PI * i) / (n - 1)), z: zf - F.depth + 0.06 });
  }
}

// A valance `w` wide hanging from y 0 at z 0, a band `band` deep with a tongue
// under each of a cell's eight stripes (its UVs run across the cell once),
// each `scallop` deeper at its middle, so each tongue is one stripe's colour.
const SCALLOP_SEGS = 4;
function scallopedValance(w, band, scallop) {
  const tongues = 8;
  const pos = [];
  const uv = [];
  const n = tongues * SCALLOP_SEGS;
  for (let i = 0; i <= n; i++) {
    const f = (i % SCALLOP_SEGS) / SCALLOP_SEGS;
    const x = -w / 2 + (i * w) / n;
    const u = i / n;
    const drop = band + scallop * Math.sin(Math.PI * f);
    pos.push(x, 0, 0, x, -drop, 0);
    uv.push(u, 1, u, 0);
  }
  const idx = [];
  for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// --- the bunting: six strings from the stalls' poles to the fountain's mast
function drawBunting(PARTS, flags, poles) {
  const K = makeKit('marketBunting');
  const mast = new THREE.Vector3(FOUNTAIN.x, MAST_TOP, FOUNTAIN.z);
  const string = new THREE.BoxGeometry(1, 0.014, 0.014);
  const at = (a, t) => ({
    x: a.x + (mast.x - a.x) * t,
    y: a.y + (mast.y - a.y) * t - 4 * BUNTING_SAG * t * (1 - t),
    z: a.z + (mast.z - a.z) * t,
  });
  poles.forEach((a, k) => {
    const len = Math.hypot(mast.x - a.x, mast.z - a.z);
    const yaw = -Math.atan2(mast.z - a.z, mast.x - a.x);
    const segs = Math.max(6, Math.round(len / 1.5));
    for (let i = 0; i < segs; i++) {
      const p = at(a, i / segs);
      const q = at(a, (i + 1) / segs);
      const h = Math.hypot(q.x - p.x, q.z - p.z);
      const roll = Math.atan2(q.y - p.y, h);
      const l = Math.hypot(h, q.y - p.y);
      K.put('flags', flags, string, mat4((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2, { yaw, roll, sx: l }), { color: 0x3a3a3a, noCast: true });
    }
    const n = Math.floor(len / PENNANT.every);
    for (let i = 1; i < n; i++) {
      const p = at(a, i / n);
      const c = PENNANT_COLORS[Math.floor(hash01(i, k, 31) * PENNANT_COLORS.length) % PENNANT_COLORS.length];
      K.put('flags', flags, PARTS.pennant, mat4(p.x, p.y, p.z, { yaw, sx: PENNANT.w, sy: PENNANT.h }), { color: c, noCast: true });
    }
  });
  string.dispose();
  const m = K.meshes()[0];
  m.name = 'marketBunting';
  m.userData.bunting = true;
  return m;
}

// --- the shop fronts: one row of town buildings a side, one mesh
function drawShopFront(side, { paint, winLit, litKit, barrel, sack }) {
  const K = makeKit(`marketShops:${side.id}`);
  const sideM = mat4(side.x, 0, side.z, { yaw: side.yaw });
  const put = (geo, m, color, own = false) => K.put('paint', paint, geo, sideM.clone().multiply(m), { color, noCast: true, own }); // WHAT CASTS
  const lit = (geo, m) => litKit.put('glass', winLit, geo, sideM.clone().multiply(m), { noCast: true, own: true });
  const cube = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  cube.setIndex(Array.from(cube.index.array).filter((_, i) => i < 18 || i >= 24)); // no underside: it stands on something, or hangs too high to see
  const plane = new THREE.PlaneGeometry(1, 1);
  // sky-glass, by day and lit; a flower box, wood below and leaves on top
  const shapes = {
    glass: gradientOf(new THREE.PlaneGeometry(1, 1), 0x26313c, 0x6d8ea6),
    glassLit: gradientOf(new THREE.PlaneGeometry(1, 1), 0x26313c, 0x6d8ea6),
    box: gradientOf(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), 0x6e4a32, 0x3f7a3a),
  };
  const si = SIDES.indexOf(side);
  // the runs of the row between its gaps
  const runs = [];
  let from = side.u0;
  for (const [g0, g1] of side.gaps) { runs.push([from, g0]); from = g1; }
  runs.push([from, side.u1]);
  let k = 0;
  for (const [r0, r1] of runs) {
    let u = r0;
    while (u < r1 - 0.01) {
      let w = 5.2 + 2.6 * hash01(u, si, 71);
      if (r1 - (u + w) < 3) w = r1 - u;
      house(put, lit, cube, plane, u, w, k, si, shapes);
      u += w;
      k++;
    }
  }
  // the foot of the fronts, a working market's: stacked crates, barrels,
  // sacks and a handcart, all between the fronts and the bounds (v 0.05..0.75)
  // so nobody walks into them; none in the gateway's gap or under the café's awning
  const cafeU = side.id === 'south' ? [-CAFE_FRONT.x1, -CAFE_FRONT.x0] : null;
  let i = 0;
  for (let u = side.u0 + 5 + 2 * hash01(si, 0, 73); u < side.u1 - 4; u += 4.5 + 3 * hash01(u, si, 74), i++) {
    if (side.gaps.some(([g0, g1]) => u > g0 - 2 && u < g1 + 2)) continue;
    if (cafeU && u > cafeU[0] - 1 && u < cafeU[1] + 1) continue;
    if (side.id === 'south' && Math.abs(u + BICYCLE_AT.x) < 1.6) continue; // the parked bicycle
    const kind = (i + si) % 4;
    if (kind === 0) {
      // a tall stack and a short one beside it
      const n = 3 + Math.floor(hash01(u, si, 75) * 2);
      for (let j = 0; j < n; j++) put(cube, mat4(u + (j % 2) * 0.05, j * 0.31, 0.3, { yaw: 0.1 * (j % 3), sx: 0.5, sy: 0.3, sz: 0.42 }), CRATE);
      for (let j = 0; j < 2; j++) put(cube, mat4(u + 0.58, j * 0.31, 0.3, { yaw: -0.06 * j, sx: 0.48, sy: 0.3, sz: 0.4 }), CRATE);
    } else if (kind === 1) {
      // two barrels and a crate on its side
      for (const du of [0, 0.58]) put(barrel, mat4(u + du, 0, 0.36, { sx: 0.52, sy: 0.78, sz: 0.52 }), 0x7a5a3c);
      put(cube, mat4(u + 1.1, 0, 0.3, { yaw: 0.2, sx: 0.48, sy: 0.3, sz: 0.42 }), CRATE);
    } else if (kind === 2) {
      // sacks against a crate
      put(cube, mat4(u, 0, 0.3, { sx: 0.5, sy: 0.3, sz: 0.42 }), CRATE);
      put(sack, mat4(u, 0.52, 0.3, { sx: 0.36, sy: 0.46, sz: 0.3 }), 0xc9b48a);
      for (const du of [0.45, 0.8]) put(sack, mat4(u + du, 0.22, 0.32, { yaw: du, sx: 0.36, sy: 0.46, sz: 0.3 }), 0xbfa77a);
    } else {
      // a handcart, its handles along the front
      put(cube, mat4(u, 0.42, 0.4, { sx: 1.2, sy: 0.1, sz: 0.56 }), 0x8a6a48);
      for (const dv of [0.14, 0.66]) put(cube, mat4(u, 0.52, dv, { sx: 1.2, sy: 0.16, sz: 0.04 }), 0x8a6a48);
      for (const dv of [0.08, 0.66]) put(barrel, mat4(u - 0.2, 0.3, dv, { pitch: Math.PI / 2, sx: 0.6, sy: 0.05, sz: 0.6 }), 0x4a3a2c);
      for (const dv of [0.2, 0.6]) put(cube, mat4(u + 0.95, 0.47, dv, { sx: 0.8, sy: 0.04, sz: 0.04 }), 0x6e5038);
      put(cube, mat4(u - 0.1, 0.47, 0.4, { yaw: 0.1, sx: 0.44, sy: 0.28, sz: 0.38 }), CRATE);
    }
  }
  cube.dispose();
  plane.dispose();
  for (const g of Object.values(shapes)) g.dispose();
  const m = K.meshes()[0];
  m.name = `marketShops:${side.id}`;
  m.userData.shopFront = side.id;
  return m;
}

// Market beauty pass, buildings round (2026-11-22): the town fronts get what the
// flat planes lacked, all in vertex colours and thin planes (no new texture, no
// new mesh): sky-glass gradients, mullions, sills, shutters, flower
// boxes, a shop window's goods, a fascia's painted lettering bars (no letters),
// hanging signs, striped awnings, door panels, pilasters, string courses,
// tile courses and dormers.
const SHUTTERS = Object.freeze([0x3d6b4f, 0x2f4268, 0x7a2f35, 0x4a7a8a, 0x6b4d7a]);
const AWNINGS = Object.freeze([[0xb83a3a, 0xf0e8d8], [0x2f5f9a, 0xf0e8d8], [0x3d7a4f, 0xf0e8d8], [0xd08a2a, 0xf3ecdc], [0x7a4d8a, 0xf0e8d8]]);
const GOODS = Object.freeze([
  [0xc98a4a, 0xdba85a, 0xb06a38, 0xe8c27a], // a baker's loaves
  [0xc4673c, 0x3d6b9a, 0xe0b24a, 0x9a4a30], // pots
  [0xb83a3a, 0x2f5f9a, 0xe8c040, 0x3d7a4f], // toys
  [0x7a2f35, 0x2f4268, 0x3d6b4f, 0xc9a040], // books
  [0xe0a0b0, 0xc080a0, 0xf0d0c0, 0x9a70b0], // cloth and ribbons
]);
const SILL_BLOOMS = Object.freeze([0xf07a9a, 0xf5d24a, 0xffffff, 0xe8603a]);
const STONE = 0xd9d1c0;
const mixHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
const shade = (a, k) => new THREE.Color(a).multiplyScalar(k).getHex();

// `geo` (a unit plane or box) with a colour per vertex running from `bottom` to `top` by height.
function gradientOf(geo, bottom, top) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const pos = geo.attributes.position;
  const a = new Float32Array(pos.count * 3);
  const cb = new THREE.Color(bottom), ct = new THREE.Color(top), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(cb).lerp(ct, (pos.getY(i) - min.y) / (max.y - min.y));
    a.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
// a unit box (y 0..1) with no underside and no back: 8 triangles, not 12
function wallBox(bottom, top) {
  const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const idx = Array.from(g.index.array);
  g.setIndex([...idx.slice(0, 18), ...idx.slice(24, 30)]);
  return gradientOf(g, bottom, top);
}

// One town building: u..u+w along the row, its front at v 0 facing the square.
// `put(geo, matrix, color, own)` and `lit(geo, matrix)` are drawShopFront's; `K` its shared shapes.
function house(put, lit, cube, plane, u, w, k, si, K) {
  const h1 = hash01(u, si, 81);
  const upper = h1 < 0.45 ? 1 : 2;
  const h = 3.4 + 2.9 * upper + 0.4;
  const wall = WALLS[Math.floor(hash01(u, si, 83) * WALLS.length) % WALLS.length];
  const roof = ROOFS[Math.floor(hash01(u, si, 85) * ROOFS.length) % ROOFS.length];
  const fascia = FASCIAS[Math.floor(hash01(u, si, 87) * FASCIAS.length) % FASCIAS.length];
  const door = DOORS[k % DOORS.length];
  const mid = u + w / 2;
  const light = mixHex(wall, 0xffffff, 0.32);
  const dark = shade(wall, 0.62);
  // the wall, shaded from a grimy foot to a sunlit top
  const wb = wallBox(shade(wall, 0.8), shade(wall, 1.06));
  put(wb, mat4(mid, 0, -FRONT_DEPTH / 2, { sx: w, sy: h, sz: FRONT_DEPTH }), wall, true);
  wb.dispose();
  const rise = 1.6 + 1.0 * hash01(u, si, 89);
  // each roof its own tone, a shade either way
  const roofTone = shade(roof, 0.92 + 0.16 * hash01(u, si, 141));
  const prism = roofPrism(w, FRONT_DEPTH, rise, 0.3);
  put(prism, mat4(u, h, 0), roofTone);
  prism.dispose();
  // tile courses along the front slope, a gutter on the eave and a cap along the ridge
  const slope = -Math.atan2(3.3, rise);
  for (const t of [0.12, 0.3, 0.48, 0.66, 0.84]) put(plane, mat4(mid, h + rise * t + 0.05, 0.3 - 3.3 * t + 0.05 * rise / 3.3, { pitch: slope, sx: w, sy: 0.09 }), shade(roofTone, t > 0.5 ? 0.78 : 0.86));
  put(cube, mat4(mid, h - 0.07, 0.3, { sx: w, sy: 0.1, sz: 0.1 }), 0x4a4f58);
  put(cube, mat4(mid, h + rise - 0.02, -FRONT_DEPTH / 2, { sx: w, sy: 0.14, sz: 0.3 }), shade(roofTone, 0.68));
  if (hash01(u, si, 91) < 0.6) {
    // the chimney stack with its cap and a pot
    const cx = u + w * (0.25 + 0.5 * hash01(u, si, 93));
    const cy = h + rise * 0.55, ch = rise * 0.45 + 0.9;
    put(cube, mat4(cx, cy, -FRONT_DEPTH / 2, { sx: 0.5, sy: ch, sz: 0.6 }), 0x7a4a3a);
    put(cube, mat4(cx, cy + ch, -FRONT_DEPTH / 2, { sx: 0.66, sy: 0.12, sz: 0.76 }), 0xb9ad9a);
    put(cube, mat4(cx, cy + ch + 0.12, -FRONT_DEPTH / 2, { sx: 0.2, sy: 0.28, sz: 0.2 }), 0xb5693f);
  }
  // a dormer on some of the roofs, lit at dusk on half of them
  if (hash01(u, si, 101) < 0.34) {
    const dx = u + w * (0.3 + 0.4 * hash01(u, si, 103));
    const y0 = h + rise * 0.364 - 0.1;
    put(cube, mat4(dx, y0, -1.45, { sx: 1.3, sy: 1.0, sz: 1.1 }), wall);
    const dp = roofPrism(1.6, 1.1, 0.5, 0.12);
    put(dp, mat4(dx - 0.8, y0 + 1.0, -0.82), shade(roof, 1.12));
    dp.dispose();
    put(plane, mat4(dx, y0 + 0.5, -0.89, { sx: 0.72, sy: 0.78 }), FRAME);
    const dpane = mat4(dx, y0 + 0.5, -0.88, { sx: 0.6, sy: 0.66 });
    if (hash01(u, si, 105) < 0.5) lit(K.glassLit, dpane); else put(K.glass, dpane, null, true);
  }
  // the grounding and the courses: plinth, string courses, a cornice, corner pilasters
  put(plane, mat4(mid, 0.22, 0.02, { sx: w, sy: 0.44 }), shade(wall, 0.55));
  for (let f = 0; f <= upper; f++) put(plane, mat4(mid, 3.62 + 2.9 * f, 0.015, { sx: w, sy: 0.2 }), light);
  put(plane, mat4(mid, h - 0.16, 0.03, { sx: w, sy: 0.3 }), light);
  put(plane, mat4(mid, h - 0.38, 0.025, { sx: w, sy: 0.14 }), dark);
  for (const px of [u + 0.14, u + w - 0.14]) put(plane, mat4(px, h / 2, 0.012, { sx: 0.28, sy: h }), light);
  // brick courses on the brick-red walls, a drainpipe on some houses
  if (wall === WALLS[2] || wall === WALLS[5]) for (let y = 3.7; y < h - 0.5; y += 0.5) put(plane, mat4(mid, y, 0.008, { sx: w - 0.3, sy: 0.04 }), shade(wall, 0.76));
  if (hash01(u, si, 143) < 0.4) put(cube, mat4(u + w - 0.42, 0, 0.06, { sx: 0.1, sy: h - 0.1, sz: 0.1 }), shade(wall, 0.5));
  // the shop: a window, a door, a painted fascia band
  const doorLeft = hash01(u, si, 95) < 0.5;
  const dx = doorLeft ? u + 0.9 : u + w - 0.9;
  const winX0 = doorLeft ? u + 1.6 : u + 0.4;
  const winX1 = doorLeft ? u + w - 0.4 : u + w - 1.6;
  const winW = winX1 - winX0, winM = (winX0 + winX1) / 2;
  put(plane, mat4(winM, 1.5, 0.02, { sx: winW + 0.16, sy: 1.96 }), FRAME);
  const shopPane = mat4(winM, 1.5, 0.03, { sx: winW, sy: 1.8 });
  if (hash01(u, si, 96) < 0.55) lit(K.glassLit, shopPane); else put(K.glass, shopPane, null, true);
  // goods in the window, on a shelf and on the floor
  const goods = GOODS[Math.floor(hash01(u, si, 107) * GOODS.length)];
  put(plane, mat4(winM, 1.12, 0.04, { sx: winW - 0.1, sy: 0.05 }), 0x6e4a32);
  const n = Math.max(4, Math.floor(winW / 0.62));
  for (let i = 0; i < n; i++) {
    const gx = winX0 + (winW * (i + 0.5)) / n;
    const gh = 0.18 + 0.26 * hash01(gx, si, 109);
    const gw = 0.2 + 0.16 * hash01(gx, si, 111);
    const col = goods[Math.floor(hash01(gx, si, 113) * goods.length)];
    put(plane, mat4(gx, 1.14 + gh / 2, 0.04, { sx: gw, sy: gh }), col);
    if (i % 2 === 0) put(plane, mat4(gx + 0.15, 0.6 + (gh + 0.12) / 2, 0.04, { sx: gw + 0.1, sy: gh + 0.12 }), goods[(i + 1) % goods.length]);
  }
  // the window's bars, its stall-riser under it
  for (let i = 1; i < Math.round(winW / 1.5); i++) put(plane, mat4(winX0 + (winW * i) / Math.round(winW / 1.5), 1.5, 0.05, { sx: 0.05, sy: 1.8 }), FRAME);
  put(plane, mat4(winM, 2.05, 0.05, { sx: winW, sy: 0.05 }), FRAME);
  put(plane, mat4(winM, 0.52, 0.03, { sx: winW + 0.16, sy: 0.16 }), shade(wall, 0.7));
  // the door: panels, a little glazing, a brass handle, a lintel
  put(plane, mat4(dx, 1.1, 0.03, { sx: 1.0, sy: 2.2 }), door);
  put(plane, mat4(dx, 1.72, 0.045, { sx: 0.6, sy: 0.7 }), FRAME);
  put(K.glass, mat4(dx, 1.72, 0.05, { sx: 0.5, sy: 0.6 }), null, true);
  put(plane, mat4(dx, 0.7, 0.045, { sx: 0.66, sy: 0.7 }), shade(door, 0.78));
  put(plane, mat4(dx + (doorLeft ? 0.34 : -0.34), 1.05, 0.055, { sx: 0.07, sy: 0.07 }), 0xc9a040);
  put(plane, mat4(dx, 2.3, 0.035, { sx: 1.3, sy: 0.12 }), STONE);
  put(plane, mat4(mid, 2.88, 0.04, { sx: w - 0.2, sy: 0.55 }), fascia);
  // lettering-like bars (no letters) on the fascia, in cream or gold
  const bars = 3 + Math.floor(hash01(u, si, 115) * 2);
  const barCol = hash01(u, si, 117) < 0.5 ? 0xefe6cf : 0xe0b050;
  let bw = 0;
  const bwidths = Array.from({ length: bars }, (_, i) => { const v = 0.3 + 0.6 * hash01(u + i, si, 119); bw += v + 0.16; return v; });
  let bx = mid - (bw - 0.16) / 2;
  for (const v of bwidths) { put(plane, mat4(bx + v / 2, 2.88, 0.05, { sx: v, sy: 0.15 }), barCol); bx += v + 0.16; }
  // an awning over the shop window on some
  if (hash01(u, si, 121) < 0.4) {
    const [c0, c1] = AWNINGS[Math.floor(hash01(u, si, 123) * AWNINGS.length)];
    const ns = Math.max(4, Math.round(winW / 0.5));
    const sw = winW / ns;
    const pitch = -Math.atan2(0.75, 0.34);
    for (let i = 0; i < ns; i++) {
      const cx = winX0 + sw * (i + 0.5);
      const col = i % 2 ? c1 : c0;
      put(plane, mat4(cx, 2.45, 0.375, { pitch, sx: sw, sy: 0.82 }), col);
      put(plane, mat4(cx, 2.2, 0.75, { sx: sw, sy: 0.17 }), col);
    }
    put(plane, mat4(winM, 2.45, 0.372, { pitch: Math.PI + pitch, sx: winW, sy: 0.82 }), shade(c1, 0.7));
  } else if (hash01(u, si, 125) < 0.45) {
    // else a hanging sign on an iron bracket at the end away from the door
    const sx = doorLeft ? u + w - 0.12 : u + 0.12;
    put(cube, mat4(sx, 2.2, 0.35, { sx: 0.05, sy: 0.55, sz: 0.5 }), hash01(u, si, 127) < 0.5 ? 0xe0b050 : 0xefe6cf);
    put(cube, mat4(sx, 2.82, 0.32, { sx: 0.04, sy: 0.04, sz: 0.62 }), 0x2a2420);
  }
  // the windows upstairs: sky-glass, bars, a sill, shutters on some houses, flower boxes on some windows
  const shutter = hash01(u, si, 129) < 0.5 ? SHUTTERS[Math.floor(hash01(u, si, 131) * SHUTTERS.length)] : null;
  const cols = Math.max(2, Math.floor(w / 2.2));
  for (let f = 0; f < upper; f++) {
    const y = 3.4 + 2.9 * f + 1.45;
    for (let c = 0; c < cols; c++) {
      const x = u + (w * (c + 0.5)) / cols;
      put(plane, mat4(x, y, 0.02, { sx: 1.0, sy: 1.45 }), FRAME);
      const pane = mat4(x, y, 0.03, { sx: 0.82, sy: 1.25 });
      if (hash01(x, f + 7 * si, 97) < 0.4) lit(K.glassLit, pane); else put(K.glass, pane, null, true);
      put(plane, mat4(x, y, 0.045, { sx: 0.045, sy: 1.25 }), FRAME);
      put(plane, mat4(x, y + 0.12, 0.045, { sx: 0.82, sy: 0.045 }), FRAME);
      put(plane, mat4(x, y - 0.8, 0.03, { sx: 1.2, sy: 0.1 }), STONE);
      if (shutter != null) for (const sd of [-1, 1]) put(plane, mat4(x + sd * 0.7, y, 0.035, { sx: 0.4, sy: 1.4 }), shutter);
      if (f === 0 && shutter == null && hash01(x, si, 135) < 0.3) {
        put(K.box, mat4(x, y - 0.74, 0.12, { sx: 0.95, sy: 0.2, sz: 0.24 }), 0xffffff, true);
        for (let b = 0; b < 3; b++) put(plane, mat4(x - 0.3 + 0.3 * b, y - 0.5, 0.25, { sx: 0.15, sy: 0.15 }), SILL_BLOOMS[(b + Math.floor(x)) & 3]);
      }
    }
  }
}
