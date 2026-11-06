import * as THREE from 'three';
import * as b from './builder.js';
import { addTrails } from './pathribbon.js';
import { litMaterial, surfaceProps } from '../render/materials.js';
import { createWater } from '../render/water.js';
import {
  WALK_SHAPES, MASSES, CEILINGS, GORGE_CAVES, GORGE_DENS, STAND_ON, CLAN_STAND_ON, WIDE_LEDGE_RECT, CAMP_DEN,
  FLOOR, CLIFFTOP, WEST_TOP, LOOKOUT_LEDGE, TURN, gorgeGround, mapShapes, CORRIDOR_HEADROOM, CAMP_DEN_HEADROOM,
  DEN_HEADROOM,
} from './gorgeshape.js';
import { GOLD_MICE } from '../goldmice.js';
import { postsFor } from '../borderposts.js';
import { mulberry32, seedFromCode } from '../rng.js';
import { segDist } from '../segdist.js';
import { seatOnGround } from '../ground.js';
import { addCamp, campLayout, campDressing } from './camp.js';
import { withLocalUuids } from './localuuids.js';
import {
  narrowsTint, NARROWS_TINT_KEY, narrowsDressing, NARROWS_VIEW,
} from './narrows.js';
import { caveRoom, caveTunnel, crystalClusters, CLUSTER_SPREAD, CORNER_R, caveMouth } from './caveroom.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createGorgeLife, GORGE_BIRD_Y } from '../gorgelife.js';
import { smoothNormals } from './rocknormals.js';
import { noise3 } from './rockrelief.js';
import { ZOOM_STEPS, DEFAULT_ZOOM_STEP, CAM_CEIL_CLEAR } from '../camzoom.js';

// =============================================================================
// The Gorge.
//
// A deep rock gorge east of the Moor: a shaded floor with a stream down it,
// and a path cut into the east wall that climbs in three legs, hairpin by
// hairpin, past the Lookout Ledge and the Wide Ledge to a bright clifftop with
// a view down the whole gorge. Its shape (every ledge, leg, lip, rock mass,
// cave and den) is data in gorgeshape.js; this file draws it and adds the
// sky, the stream, the paths and the horizon. Coordinates are metres, x east
// and z south, so north is -z.
//
// WHERE ITS EDGES FACE (G1). The Gorge sits directly east of the Moor in the
// same z frame: a Moor point (x, z) is the Gorge point (x - 100, z).
//   * west is the Moor. The Narrows (x < -18, z -16..-6) is the way in, and
//     the cat spawns in it, 6 m in from the border;
//   * south is Twolegplace. The gorge walls hide it, so the horizon shows its
//     rooftops there, past the stream leaving the map;
//   * north and east are more mountains, so the hills are rock-coloured.
//
// SHADED BELOW, BRIGHT ABOVE (G5). The rock's baked colours run from a cool,
// dark grey-brown at the floor to warm sandstone at the top, in 1.1 m strata
// (alternately warm and cream) that line up with the relief's shelves, and
// darker in its recesses (builder.rockTerrain). The floor's ground plane is a
// warm sand like any other map's; its shade comes from gorgelife's light
// (SHADE_FLOOR), so the floor reads shaded from the clifftop without a darker
// ground colour. The clifftop is
// lit, and what a kid goes up there for sits south of z -27, out of the north
// rim's afternoon shade.
//
// WHY THE RIMS ARE 20 M (G6). Every mass at the map's edges is 20 m high, above
// the clifftop camera at ordinary framing, so the rims close the view. From
// the highest camera (zoom step 3, pitched right up, on the Summit Rock) she
// sees over them, onto rock tops drawn as rock and the tall horizon band
// beyond; test/gorge.test.js checks every look down from there lands on
// something. The west wall is lower (9 m), so the view from the clifftop goes
// over it towards the Moor.
//
// The three deep caves are cut into the rock here, and walked (lit, dressed,
// and given a camera of their own) in part 3. CliffClan's camp (part 4) lives
// on the Wide Ledge's south end, and its den is cut into the east rock behind
// it: no scenery is scattered in either.
//
// Nothing here reads which way the game is being played: the Gorge builds the
// same for everyone.
// =============================================================================

// Where a walk places the cat: in the Narrows, 6 m in from the Moor.
export const SPAWN = Object.freeze({ x: -44, z: -11 });

const BOUNDS = Object.freeze({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 });

// The Snug Cave's cat's home (part 3, C8): the chamber's end of the cave's
// path, 2 m to roam, standing only on the cave's bend and chamber.
const SNUG_CAVE = GORGE_CAVES.find((c) => c.id === 'snug');
const SNUG_HOME = Object.freeze({
  x: 22.5, z: 9.5, roam: 2,
  onlyOn: Object.freeze(SNUG_CAVE.rects.filter((r) => r.tag === 'snug-bend' || r.tag === 'snug-chamber')),
});

// The stepping stones over the stream, on the Narrows path's line: the Woods'
// broad flat stones, eight of them across 3.5 m, 0.5 m apart (the Woods' are
// 0.54), so they overlap with no open water between them anywhere on the deck.
// Four, as first planned, left water between the stones at the deck's edges.
// The deck is the part a cat can stand on, 1.5 m wide, and runs onto both
// banks; test/gorge.test.js raycasts the stones across all of it.
const STONES_Z = -11;
const STONES = { n: 8, rMin: 0.88, rMax: 0.9, jitter: 0, stagger: 0.03, sides: 16 };
const STEPPING_STONES = Object.freeze({ minX: -10.5, maxX: -7, minZ: -11.75, maxZ: -10.25 });

// The stream: one narrow water down the floor, from the north edge to the
// south edge and on past both, wadeable everywhere (its shallow band is half
// its 1.5 m width, so it is never deep). It lies only on base ground.
const STREAM = Object.freeze({
  id: 'stream', kind: 'rect', minX: -9.5, maxX: -8, minZ: -62, maxZ: 62, shallow: 0.75,
  decks: Object.freeze([STEPPING_STONES]),
});
export const GORGE_WATERS = Object.freeze([STREAM]);

// How the stream is drawn: a grey-blue mountain water, banked on both sides.
const WATER_LOOK = { stream: { y: 0.03, color: 0x6a9aa8, shores: ['minX', 'maxX'], evening: { dusk: { mul: [0.62, 0.58, 0.48], glow: 0 } } } }; // polish-pondrims: a grey dusk, not royal blue (water.js eveningWater)

// The paths, as [x1, z1, x2, z2] centreline segments, all 3 m wide, all on
// the floor. The Narrows path comes in from the Moor's border and stops short
// of the stream (the stones are the gap after its end); the floor path takes
// it on from the far bank, south past the foot of leg A and on to the south
// edge, and north to the north edge.
export const GORGE_PATHS = Object.freeze([
  // the Narrows path
  [-50, -11, -11.5, -11],
  // the floor path, south
  [-6, -11, -3, 10], [-3, 10, -1, 30],
  // to the foot of leg A, ending on its centreline 3 m south of it. Not
  // 36.5: a line to there clips the south-west corner of leg A's lip by 2 cm.
  [-1, 30, 3.9, 37],
  // to the south edge
  [-1, 30, -2, 50],
  // the floor path, north
  [-6, -11, -4, -30], [-4, -30, -3, -50],
].map((s) => Object.freeze(s)));
// A clear canyon day: blue sky over a warm haze (which is also the fog).
export const GORGE_SKY = Object.freeze({ top: 0x86bde6, horizon: 0xeed8b8 });
// The day haze, pushed out from applySky's 40..130 so the far walls keep
// their colour (the fog colour stays GORGE_SKY.horizon).
export const GORGE_FOG = Object.freeze({ near: 60, far: 175 });
const PATH_W = 3;
export const PATH_STYLE = Object.freeze({ surface: 'sand', color: 0xb8a27e });

// The horizon: tall hills (40 m, over the 20 m rims), tinted for what is over
// each edge: more rock north and east, the town's warm brick to the south past
// the gorge's mouth with its rooftops on the south arc, the Moor's heather to
// the west. The hills come down to the stream where it leaves the map. Out
// of the Narrows' west end they dip to the ground (NARROWS_VIEW, a keepLow
// capsule; it works because `avoid` is not empty), so the low Moor of the
// Narrows dressing shows through the gap; the west tint is a muted moor
// green-grey (a lilac one read as a pale wall beside the gap).
export const GORGE_HORIZON = Object.freeze({
  kind: 'hills', inner: 56, outer: 116, height: 40, wavelength: 40,
  color: 0xa8957a, salt: 53,
  avoid: Object.freeze([STREAM]),
  keepLow: Object.freeze([NARROWS_VIEW]),
  sideTints: Object.freeze({ north: 0xa8957a, east: 0x9e8c76, south: 0xa8866e, west: 0x9d9f8f }),
  rooftops: Object.freeze({ from: 0.28, to: 0.47, count: 10, height: 6 }),
});

// The climb race: five rings from the floor, up the legs, to a clifftop
// finish, always in this order (G8).
const RACE_COURSE = Object.freeze([
  [-3, 6], [3.9, 28], [5.6, -5], [10.5, 33.5], [16, -24],
].map(([x, z]) => Object.freeze({ x, z })));

// --- the things to find ------------------------------------------------------
// Laid out before any scenery, because GORGE_KEEP_CLEAR (below) is built from
// these very records: whatever a kid hunts for, nothing grows on it. Every y
// here is a height above the ground under it (part 1, R4), so a perch on the
// clifftop is 0.72 over the clifftop, not over the floor.

// The nine points of interest the race and the quests draw on: in the
// Narrows, up and down the floor on both banks of the stream, and two on the
// clifftop. Each stands at least 2 m from the stream and well clear of the
// Summit Rock, so spots.js's clearSpot leaves it where it is
// (test/gorge.test.js checks both, and floods each one from the spawn).
const POIS = [
  [-34, -11], [-13, -30], [-3, -2], [-14, 14], [0, 24], [-13, 42], [-3, -44], [14, -30], [29, -30],
].map(([x, z]) => ({ x, z }));

// Three places worth stopping at: the view from the clifftop, the gorge from
// the Lookout Ledge halfway up, and the Echo Cave's mouth on the floor.
const SCENICS = [
  { id: 'gorge-view', x: 4, z: -24, label: 'the view down the gorge' },
  { id: 'lookout-ledge', x: 3.5, z: -5, label: 'the gorge from the Lookout Ledge' },
  { id: 'echo-mouth', x: -16.5, z: 23.5, label: 'the mouth of the Echo Cave' },
];

// Five finds: one at the back of each deep cave, one on the floor and one on
// the clifftop.
const COLLECTIBLES = [
  { id: 'gorge-find-1', x: -27, z: 33, label: 'a smooth white pebble' }, // the Echo Cave
  { id: 'gorge-find-2', x: 24.5, z: 8, label: 'a tuft of soft grey fur' }, // the Snug Cave
  { id: 'gorge-find-3', x: 43, z: -40, label: 'a gold-flecked stone' }, // the Glitter Cave
  { id: 'gorge-find-4', x: -4, z: 18, label: 'a curly fern frond' },
  { id: 'gorge-find-5', x: 20, z: -34, label: 'a hawk feather' },
];

// The Summit Rock, on the clifftop: the Moor's High Tor shape, a grey boulder
// and then a tall pillar 1.41 m across and 1.18 m up from it, with a golden
// mouse on top (src/goldmice.js). The colliders sit under the perches, so a
// cat walks round the rocks and up onto them; the pillar is as wide at its
// foot as its collider. It stands south of z -27, in the afternoon sun (G5),
// and 5 m and more from every rim, so a cat can always walk round it (G13).
const PILLAR = { y: 1.9, r: 0.9, rTop: 0.75, rBottom: 0.9, sides: 7 };
const SUMMIT_ROCK = { x: 25, z: -24 };
const SUMMIT_BOULDER = { x: 24, z: -23, r: 0.7 };
const ROCK_COLOR = 0xb0a084;
const CHAIN_PERCHES = [
  { x: SUMMIT_BOULDER.x, z: SUMMIT_BOULDER.z, y: 0.72, kind: 'stone' },
  { x: SUMMIT_ROCK.x, z: SUMMIT_ROCK.z, y: PILLAR.y, kind: 'stone', label: 'summit rock', vantage: true },
];

// Where the two mice dive when chased: at the foot of the west wall and of
// the clifftop's wall, on the floor. The goat's is on the shoulder (ground
// 14), where no cat goes. src/propsets.js carries the same three.
export const GORGE_HIDES = Object.freeze([
  { x: -17.4, z: 38 }, { x: 1.4, z: -38 }, { x: 8, z: -12.5 },
].map((h) => Object.freeze(h)));

// One nap in each den, at its back centre. src/propsets.js carries them as
// the Gorge's rests.
const NAPS = [[-20, 7.3], [-20, -32.7], [4, -44.7], [6.0, -10.2], [11.3, -42]].map(([x, z]) => ({ x, z }));

// The border posts, read from src/borderposts.js (pure data, no imports, so
// no cycle): to the Moor in the Narrows, and the one-way post to the town at
// the south edge (G14).
const POSTS = postsFor('gorge').map(({ x, z }) => ({ x, z }));

// The climb race's pad: part 1's spawn + (2, -3).
const RACE_PAD = { x: SPAWN.x + 2, z: SPAWN.z - 3 };

// Places no scenery may stand on, nor hide: every POI, scenic, find, golden
// mouse, chain perch, race ring, nap and hide, the spawn, both posts and the
// race pad. Built from the records themselves, so a find can never move
// without its clearance moving with it.
export const GORGE_KEEP_CLEAR = Object.freeze([
  ...POIS, ...SCENICS, ...COLLECTIBLES, ...GOLD_MICE.gorge, ...CHAIN_PERCHES, ...RACE_COURSE,
  ...NAPS, ...GORGE_HIDES, SPAWN, ...POSTS, RACE_PAD,
].map(({ x, z }) => Object.freeze([x, z])));

// And the rectangles nothing is scattered in: every cave and den, and the
// camp: the Wide Ledge's south end and the den behind it (part 4).
export const GORGE_KEEP_CLEAR_RECTS = Object.freeze([
  ...GORGE_CAVES.flatMap((c) => c.rects), ...GORGE_DENS, WIDE_LEDGE_RECT, CAMP_DEN,
].map(({ minX, maxX, minZ, maxZ }) => Object.freeze({ minX, maxX, minZ, maxZ })));

// --- the scenery ---------------------------------------------------------------
// Tall pines, boulders (tors) and scree, each seeded by its own name, and each
// candidate drawing all its numbers whether it is kept or not, so a change to
// one rule moves nothing but what that rule keeps out.

const r2 = (v) => Math.round(v * 100) / 100;
const rectDist = (d, x, z) => Math.hypot(Math.max(d.minX - x, 0, x - d.maxX), Math.max(d.minZ - z, 0, z - d.maxZ));
const inBounds = (x, z) => x >= BOUNDS.minX && x <= BOUNDS.maxX && z >= BOUNDS.minZ && z <= BOUNDS.maxZ;
const pathDist = (x, z) => Math.min(...GORGE_PATHS.map((s) => segDist(x, z, ...s)));
const keepClearDist = (x, z) => Math.min(...GORGE_KEEP_CLEAR.map(([px, pz]) => Math.hypot(x - px, z - pz)));
const MOUTHS = Object.freeze([...GORGE_CAVES.map((c) => c.mouth), ...GORGE_DENS.map((d) => d.mouth)]);
const mouthDist = (x, z) => Math.min(...MOUTHS.map((m) => Math.hypot(x - m.x, z - m.z)));
const holeDist = (x, z) => Math.min(...GORGE_KEEP_CLEAR_RECTS.map((r) => rectDist(r, x, z)));
const CLIFF = Object.freeze({ minX: 2.4, maxX: 34, minZ: -40, maxZ: -18 });
const inRect = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

// The ground the scenery is placed on: the same record the walk stands on.
let groundOnce = null;
const shapeGround = () => (groundOnce ??= gorgeGround());

// Whether everything within `r` of (x, z) is one shape: the same height as
// (x, z), and under no roof (a cave or den). Checked on rings 0.25 m apart,
// 0.25 m round, out to r. So a thing kept by it stands r or more inside its
// shape's rim, whether the rim drops away, rises as a wall, or opens on a
// cave mouth at the same height.
const RIM_STEP = 0.25;
function oneShape(x, z, r) {
  const g = shapeGround();
  const y = g.y(x, z);
  if (g.ceil(x, z) !== Infinity) return false;
  const rings = Math.ceil(r / RIM_STEP);
  for (let k = 1; k <= rings; k++) {
    const rad = Math.min(r, k * RIM_STEP);
    const n = Math.ceil((2 * Math.PI * rad) / RIM_STEP);
    for (let a = 0; a < n; a++) {
      const t = (a / n) * Math.PI * 2;
      const px = x + rad * Math.cos(t);
      const pz = z + rad * Math.sin(t);
      if (g.y(px, pz) !== y || g.ceil(px, pz) !== Infinity) return false;
    }
  }
  return true;
}

// The tors: granite outcrops, the Moor's, each a collider the size of its
// foot and one hop up onto its top at h. Up to eight on the floor and three
// on the clifftop, drawn from a fixed run of candidates each (every candidate
// draws its x, z, r and h). A tor keeps its circle 2 m inside its shape's rim
// (G13 asks 1.5), 1 m off a path's edge, 1.5 m off the stream, 3 m off every
// find, cave or den mouth, 2 m off every cave and den, and 3 m from the next
// tor, so a cat walks round each one.
const TOR_ZONES = [
  { seed: 'floor', minX: -17, maxX: 1, minZ: -49, maxZ: 49, y: FLOOR, tries: 240, cap: 8 },
  { seed: 'top', minX: 2.4, maxX: 34, minZ: -40, maxZ: -18, y: CLIFFTOP, tries: 80, cap: 3 },
];
const TOR_R = [1.0, 1.4];
const TOR_H = [1.0, 1.4];
function torFits(t, y, kept) {
  if (!inBounds(t.x, t.z) || shapeGround().y(t.x, t.z) !== y) return false;
  if (pathDist(t.x, t.z) < PATH_W / 2 + t.r + 1) return false;
  if (rectDist(STREAM, t.x, t.z) < t.r + 1.5) return false;
  if (keepClearDist(t.x, t.z) < t.r + 3 || mouthDist(t.x, t.z) < t.r + 3) return false;
  if (holeDist(t.x, t.z) < t.r + 2) return false;
  if (!kept.every((o) => Math.hypot(t.x - o.x, t.z - o.z) >= t.r + o.r + 3)) return false;
  return oneShape(t.x, t.z, t.r + 2);
}
// The Gorge's tors are rounder than the Moor's granite (b.tor, shared, is
// left alone): roundTor redraws a tor's three blocks as noisy icosahedra
// (IcosahedronGeometry(1, 1), 80 triangles a block, each vertex pushed in or
// out up to 10% by noise3 on its unit position), sized and placed exactly as
// b.tor sizes and places its dodecahedra (same reach, heights, bottoms,
// drifts and turns, so the collider r and perch h still fit), smooth-shaded.
// The new arrays replace the attributes of the tor's own geometry; the
// temporary geometries are made under local uuids (BUILD_DRAWS stays put).
// Called with the (x, z) and seed b.tor was given, before it is moved.
const TOR_BLOCKS = [[1, 0, 0.5, 0], [0.7, 0.35, 0.45, 0.15], [0.5, 0.65, 0.35, 0.12]]; // as b.tor's
export const GORGE_TOR_COLOR = 0xa39582; // weathered sandstone: grey granite read foreign here
const torHash = (x, z, salt) => {
  // builder.js's private hash01, copied: b.tor turns and drifts its blocks by it
  const v = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return v - Math.floor(v);
};
export function roundTor(mesh, { x, z, r, h, seed }) {
  withLocalUuids('gorge-uuids-tors', () => {
    const geoms = TOR_BLOCKS.map(([rs, bottom, tall, drift], i) => {
      const g = new THREE.IcosahedronGeometry(1, 1);
      const pos = g.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const ux = pos.getX(v), uy = pos.getY(v), uz = pos.getZ(v);
        const k = 1 + 0.2 * (noise3(ux * 1.7 + 5.3 * i, uy * 1.7, uz * 1.7, 977 + 31 * seed + i) - 0.5);
        pos.setXYZ(v, ux * k, uy * k, uz * k);
      }
      if (i > 0) g.rotateY(torHash(x, z, seed + i) * Math.PI);
      g.computeBoundingBox();
      let reach = 0;
      for (let v = 0; v < pos.count; v++) reach = Math.max(reach, Math.hypot(pos.getX(v), pos.getZ(v)));
      // numbers, not the box: scale() recomputes the box in place (b.tor
      // reads its min after that, which sinks each block a little; here each
      // block's foot is at h * bottom, so the top block's crown is at h)
      const minY = g.boundingBox.min.y;
      const sy = (h * tall) / (g.boundingBox.max.y - minY);
      g.scale((r * rs) / reach, sy, (r * rs) / reach);
      g.translate(0, h * bottom - minY * sy, 0);
      const a = torHash(x, z, seed + 10 + i) * Math.PI * 2;
      g.translate(x + Math.cos(a) * r * drift, 0, z + Math.sin(a) * r * drift);
      return g;
    });
    const merged = mergeGeometries(geoms, false);
    const pos = merged.attributes.position.array;
    const geo = mesh.geometry;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(smoothNormals(pos, null, 180), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(merged.attributes.uv.array, 2));
    geo.boundingBox = null;
    geo.boundingSphere = null;
    for (const g of geoms) g.dispose();
    merged.dispose();
  });
  mesh.material.color.set(GORGE_TOR_COLOR);
  return mesh;
}

let torsOnce = null;
export function gorgeTors() {
  if (torsOnce) return torsOnce;
  const rng = mulberry32(seedFromCode('gorge-tors'));
  const kept = [];
  for (const Z of TOR_ZONES) {
    let n = 0;
    for (let i = 0; i < Z.tries; i++) {
      const t = {
        x: r2(Z.minX + (Z.maxX - Z.minX) * rng()),
        z: r2(Z.minZ + (Z.maxZ - Z.minZ) * rng()),
        r: r2(TOR_R[0] + (TOR_R[1] - TOR_R[0]) * rng()),
        h: r2(TOR_H[0] + (TOR_H[1] - TOR_H[0]) * rng()),
      };
      if (n >= Z.cap || !torFits(t, Z.y, kept)) continue;
      kept.push(t);
      n++;
    }
  }
  torsOnce = Object.freeze(kept.map(Object.freeze));
  return torsOnce;
}

// The pines. A 2 m grid over the map, each candidate jittered and kept by a
// roll. Where a candidate lands says what it is:
//   * a NEAR pine on the floor (x -17..1) or the clifftop: a swaying b.pine,
//     up to fourteen;
//   * a STAND pine on the west top (y 9): one of up to sixty in the merged,
//     still pineStand, which lifts each tree to the west top by its y.
// A pine fits only when its whole canopy (1.3 m per unit of scale) is on one
// shape and 2.5 m inside that shape's rim, so no canopy hangs over a ledge
// below or a cave mouth; it keeps the Pines' path rule (a path's half-width,
// its canopy's reach, then half a metre); it keeps its canopy the default
// camera's reach and a metre (CAM_CLEAR) off every cave and den mouth, scenic
// and nap; and it keeps 4 m off every find,
// 2.5 m off the stream, 3.2 m from the next pine and 1.5 m between its
// trunk's collider and a tor's, so a cat walks between any two. The grid is
// fine because the ground a pine may stand on is narrow: on the floor, only
// the strip between the west wall and the stream is clear of the rim, the
// paths and the water. Candidates run north to south, so the near pines
// (nine as built, with the camera's clearance) fill from the north (the
// clifftop and the floor's north half).
const PINE_GRID = { seed: 'gorge-pines', from: -48, to: 48, cell: 2, jitter: 1.0 };
const PINE_SHARE = 0.85;
const PINE_SPACING = 3.2;
const MAX_NEAR = 14;
const MAX_STAND = 60;
const PINE_REACH = 1.3; // builder.pine's lowest cone, per unit of scale
const RIM_CLEAR = 2.5;
// Where a kid stops and looks (a cave or den mouth, a scenic, a nap) the
// chase camera swings out behind her over open ground, not along a path. A
// pine's canopy keeps the default camera's distance and a metre more off
// each, so the camera there is never in a tree (the Pines' canopy problem).
const CAM_CLEAR = ZOOM_STEPS[DEFAULT_ZOOM_STEP].dist + 1;
const LOOKS = Object.freeze([...SCENICS, ...NAPS].map(({ x, z }) => Object.freeze({ x, z })));
const lookDist = (x, z) => Math.min(...LOOKS.map((p) => Math.hypot(x - p.x, z - p.z)));
const pineCollider = (scale) => r2(0.4 * scale);
function pineKind(x, z) {
  const y = shapeGround().y(x, z);
  if (y === FLOOR && x >= -17 && x <= 1) return 'near';
  if (y === CLIFFTOP && inRect(CLIFF, x, z)) return 'near';
  if (y === WEST_TOP) return 'stand';
  return null;
}
// (The shape test is the dear one, so it comes last.)
function pineFits(x, z, scale, kept) {
  if (!inBounds(x, z)) return false;
  if (pathDist(x, z) < PATH_W / 2 + PINE_REACH * scale + 0.5) return false;
  if (keepClearDist(x, z) < 4) return false;
  if (rectDist(STREAM, x, z) < 2.5) return false;
  const camClear = PINE_REACH * scale + CAM_CLEAR;
  if (mouthDist(x, z) < camClear || lookDist(x, z) < camClear) return false;
  if (gorgeTors().some((t) => Math.hypot(x - t.x, z - t.z) < t.r + pineCollider(scale) + 1.5)) return false;
  if (!kept.every((t) => Math.hypot(x - t.x, z - t.z) >= PINE_SPACING)) return false;
  return oneShape(x, z, PINE_REACH * scale + RIM_CLEAR);
}
let treesOnce = null;
export function gorgeTrees() {
  if (treesOnce) return treesOnce;
  const G = PINE_GRID;
  const rng = mulberry32(seedFromCode(G.seed));
  const near = [];
  const stand = [];
  const kept = [];
  for (let gz = G.from; gz <= G.to; gz += G.cell) {
    for (let gx = G.from; gx <= G.to; gx += G.cell) {
      const x = r2(gx + (rng() * 2 - 1) * G.jitter);
      const z = r2(gz + (rng() * 2 - 1) * G.jitter);
      const scale = r2(1.2 + 0.7 * rng());
      const roll = rng();
      if (roll >= PINE_SHARE) continue;
      const kind = pineKind(x, z);
      if (!kind || !pineFits(x, z, scale, kept)) continue;
      if (kind === 'near' && near.length < MAX_NEAR) near.push({ x, z, scale });
      else if (kind === 'stand' && stand.length < MAX_STAND) stand.push({ x, z, scale, y: WEST_TOP });
      else continue;
      kept.push({ x, z });
    }
  }
  treesOnce = Object.freeze({
    near: Object.freeze(near.map(Object.freeze)),
    stand: Object.freeze(stand.map(Object.freeze)),
  });
  return treesOnce;
}

// Scree: loose stones at the foot of each wall that faces the floor, a spot
// every 1.5 m along it and 0.6 m out onto the floor. Each wall is a line and
// the way out from it. A spot is kept off the paths, every cave and den (and
// so their mouths), every find, and anywhere the wall isn't rock after all.
// A spot carries the wall's outward normal (nx, nz), so builder.scree can
// heap its stones against the wall's foot.
const SCREE_STEP = 1.5;
const SCREE_OUT = 0.6;
export const FLOOR_WALLS = [
  [-18, -50, -18, -16, 1, 0], // the west wall, north of the Narrows
  [-18, -6, -18, 50, 1, 0], // the west wall, south of the Narrows
  [-50, -16, -18, -16, 0, 1], // the Narrows' north side
  [-50, -6, -18, -6, 0, -1], // the Narrows' south side
  [2, -50, 2, 34, -1, 0], // the east wall, from the north rim to leg A's foot
  [5.4, 34, 5.4, 50, -1, 0], // the approach's east side
];
let screeOnce = null;
export function gorgeScree() {
  if (screeOnce) return screeOnce;
  const g = shapeGround();
  const out = [];
  for (const [x1, z1, x2, z2, nx, nz] of FLOOR_WALLS) {
    const n = Math.floor(Math.hypot(x2 - x1, z2 - z1) / SCREE_STEP);
    for (let k = 0; k <= n; k++) {
      const f = (k * SCREE_STEP) / Math.hypot(x2 - x1, z2 - z1);
      const wx = x1 + (x2 - x1) * f;
      const wz = z1 + (z2 - z1) * f;
      const x = r2(wx + nx * SCREE_OUT);
      const z = r2(wz + nz * SCREE_OUT);
      if (!inBounds(x, z) || g.y(x, z) !== FLOOR) continue;
      if (g.y(wx - nx * 0.1, wz - nz * 0.1) < 0.3) continue; // no rock there
      // 0.9 off the path's edge: a heap reaches ~0.7 m from its spot (polish-gorge7)
      if (pathDist(x, z) < PATH_W / 2 + 0.9) continue;
      if (holeDist(x, z) < 1.5 || mouthDist(x, z) < 2) continue;
      if (keepClearDist(x, z) < 2) continue;
      out.push(Object.freeze({ x, z, nx, nz }));
    }
  }
  screeOnce = Object.freeze(out);
  return screeOnce;
}

// --- the meadow (polish #1b) ---------------------------------------------------
// Ground dressing in one flat, unshadowed mesh: colour patches over the
// clifftop (which the rock draws as one flat colour), green strips along both
// banks of the stream, and small grass tufts on the clifftop and the two open
// ledges. Seeded by its own name; every candidate draws all its numbers
// whether it is kept or not. Visual only: nothing here is read by the walk.
// Depth ordering over the ground beneath (every patch, top and bank, and every
// tuft base, sits MEADOW_LIFT = 6 mm up): the material has polygonOffset
// factor -1 / units -1, so it beats the ledgeTops and the ground plane (no
// offset) and cannot sink behind them. It ties the paw prints (PRINT_Y 0.012,
// -1/-1, physically higher so they win) and loses to the contact-shadow decals
// (DECAL_Y 0.015, -2/-2), so prints and the cat's ground shadow show on the
// meadow. Patch cells keep MEADOW_PATH_CLEAR off every path, so they never
// compete with the path strips.
const MEADOW_LIFT = 0.006;
// A cell's centre this far off a path keeps its whole 1 m footprint off the strip.
export const MEADOW_PATH_CLEAR = PATH_W / 2 + 0.75;
const CLIFF_INSET = 0.6;
const BANK_BANDS = Object.freeze([[-12, -9.6], [-7.9, -5.5]]);
const TUFT_TRIES = 420;
const TUFT_CAP = 140;
export const MEADOW_SAND = 0xc8b28a;
export const MEADOW_DRY = 0xb0a46e;
export const MEADOW_GREEN = 0x7f9a52;
const BANK_GREEN = 0x7f9358;
// The talus apron: the grey gravel the wall's own tint (rockshade TALUS_TINT)
// carries on across the floor, a 1 m strip every metre along each floor wall,
// 0.8-1.4 m out, fading to the floor colour at its outer edge.
export const MEADOW_TALUS = 0xa59b89;
const TALUS_OUT = 0.8;
const TALUS_VAR = 0.6;
const TUFT_COLORS = Object.freeze([0x8f9a52, 0x6f8040]);
const NOISE_N = 16;
const NOISE_SCALE = 4; // metres per lattice step: patches 3-5 m across

let meadowOnce = null;
export function gorgeMeadow() {
  if (meadowOnce) return meadowOnce;
  const g = shapeGround();
  const rng = mulberry32(seedFromCode('gorge-meadow'));
  const patches = [];
  // Patch cells do not skip keep-clear points: a flat colour overlay cannot
  // hide a find, and dropping cells there left hard-edged bare squares that
  // read as rugs. Only the tufts (3D) keep their 1.2 m rule.
  const clear = (x, z) => pathDist(x, z) >= MEADOW_PATH_CLEAR && holeDist(x, z) > 0;
  // the clifftop: 1 m cells inset off the lips
  const x0 = CLIFF.minX + CLIFF_INSET, x1 = CLIFF.maxX - CLIFF_INSET;
  const z0 = CLIFF.minZ + CLIFF_INSET, z1 = CLIFF.maxZ - CLIFF_INSET;
  for (let ax = x0; ax < x1 - 1e-9; ax += 1) {
    for (let az = z0; az < z1 - 1e-9; az += 1) {
      const bx = Math.min(ax + 1, x1), bz = Math.min(az + 1, z1);
      const cx = (ax + bx) / 2, cz = (az + bz) / 2;
      rng(); // every cell draws its number whether kept or not
      if (g.y(cx, cz) !== CLIFFTOP || !clear(cx, cz) || !oneShape(cx, cz, 0.7)) continue;
      patches.push(Object.freeze({ x0: r2(ax), z0: r2(az), x1: r2(bx), z1: r2(bz), y: CLIFFTOP + MEADOW_LIFT, kind: 'top' }));
    }
  }
  // the banks: 1 m cells on the floor either side of the water
  for (const [bx0, bx1] of BANK_BANDS) {
    for (let ax = bx0; ax < bx1 - 1e-9; ax += 1) {
      for (let az = -50; az < 50; az += 1) {
        const bx = Math.min(ax + 1, bx1);
        const cx = (ax + bx) / 2, cz = az + 0.5;
        rng();
        if (g.y(cx, cz) !== FLOOR || !clear(cx, cz) || rectDist(STEPPING_STONES, cx, cz) < 0.5 || !oneShape(cx, cz, 0.7)) continue;
        patches.push(Object.freeze({ x0: r2(ax), z0: az, x1: r2(bx), z1: az + 1, y: FLOOR + MEADOW_LIFT, kind: 'bank' }));
      }
    }
  }
  // the tufts: the clifftop (mostly) and the Lookout and the turn
  const zones = [[CLIFF, CLIFFTOP, 0.8], [LOOKOUT_LEDGE, LOOKOUT_LEDGE.y0, 0.9], [TURN, TURN.y0, 1]];
  const tufts = [];
  for (let i = 0; i < TUFT_TRIES; i++) {
    const u = rng(), ux = rng(), uz = rng(), us = rng(), ur = rng();
    if (tufts.length >= TUFT_CAP) continue;
    const [zr, zy] = zones.find((q) => u < q[2]);
    const x = r2(zr.minX + 0.5 + ux * (zr.maxX - zr.minX - 1));
    const z = r2(zr.minZ + 0.5 + uz * (zr.maxZ - zr.minZ - 1));
    if (g.y(x, z) !== zy || inRect(WIDE_LEDGE_RECT, x, z) || holeDist(x, z) <= 0) continue;
    if (keepClearDist(x, z) < 1.2 || pathDist(x, z) < PATH_W / 2 || !oneShape(x, z, 0.4)) continue;
    tufts.push(Object.freeze({ x, z, y: zy, s: r2(0.12 + us * 0.1), rot: r2(ur * Math.PI * 2) }));
  }
  // the talus: its own stream, so the patches and tufts above do not move
  const tr = mulberry32(seedFromCode('gorge-talus'));
  const talus = [];
  for (const [wx1, wz1, wx2, wz2, nx, nz] of FLOOR_WALLS) {
    const len = Math.hypot(wx2 - wx1, wz2 - wz1);
    const tx = (wx2 - wx1) / len, tz = (wz2 - wz1) / len;
    // One depth per cell CORNER, shared by the two cells that meet there, so
    // the apron's outer edge is a continuous line, not a staircase. Every
    // corner draws its number whether its cells are kept or not.
    const cells = Math.floor(len + 1e-9);
    const corner = Array.from({ length: cells + 1 }, () => r2(TALUS_OUT + TALUS_VAR * tr()));
    // the mesh's tangent (-nz, nx) points along the wall or against it
    const along = -nz * tx + nx * tz > 0;
    for (let k = 0; k < cells; k++) {
      const d0 = corner[k], d1 = corner[k + 1];
      const d = r2((d0 + d1) / 2);
      const bx = wx1 + tx * (k + 0.5), bz = wz1 + tz * (k + 0.5);
      const pts = [0.1, d / 2, Math.max(d0, d1)].map((f) => [bx + nx * f, bz + nz * f]);
      if (pts.some(([x, z]) => !inBounds(x, z) || g.y(x, z) !== FLOOR || pathDist(x, z) < MEADOW_PATH_CLEAR
        || holeDist(x, z) <= 0 || mouthDist(x, z) < 1.5 || rectDist(STREAM, x, z) < 0.5)) continue;
      if (g.y(bx - nx * 0.1, bz - nz * 0.1) < 0.3) continue; // no rock there
      talus.push(Object.freeze({ x: r2(pts[1][0]), z: r2(pts[1][1]), w: 1, d, dm: along ? d0 : d1, dp: along ? d1 : d0, nx, nz }));
    }
  }
  meadowOnce = Object.freeze({ patches: Object.freeze(patches), tufts: Object.freeze(tufts), talus: Object.freeze(talus) });
  return meadowOnce;
}

// Value noise over the clifftop: a wrapped lattice drawn from the meadow's own
// stream, smoothly interpolated, so colour drifts in 3-5 m patches.
let latticeOnce = null;
function meadowNoise(x, z) {
  if (!latticeOnce) {
    const r = mulberry32(seedFromCode('gorge-meadow-noise'));
    latticeOnce = Array.from({ length: NOISE_N * NOISE_N }, () => r());
  }
  const fx = x / NOISE_SCALE, fz = z / NOISE_SCALE;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const sm = (t) => t * t * (3 - 2 * t);
  const tx = sm(fx - ix), tz = sm(fz - iz);
  const at = (i, j) => latticeOnce[(((j % NOISE_N) + NOISE_N) % NOISE_N) * NOISE_N + (((i % NOISE_N) + NOISE_N) % NOISE_N)];
  const a = at(ix, iz) + (at(ix + 1, iz) - at(ix, iz)) * tx;
  const c = at(ix, iz + 1) + (at(ix + 1, iz + 1) - at(ix, iz + 1)) * tx;
  return a + (c - a) * tz;
}

const _ca = new THREE.Color(), _cb = new THREE.Color();
// Value noise sits near 0.5, so stretch the middle band to the full 0..1 range;
// otherwise nearly everything renders as the dry tone.
const smoothstep = (a, b, t) => { const u = Math.min(1, Math.max(0, (t - a) / (b - a))); return u * u * (3 - 2 * u); };
export function topColor(out, x, z) {
  const v = smoothstep(0.3, 0.7, meadowNoise(x, z));
  if (v < 0.5) out.set(MEADOW_SAND).lerp(_cb.set(MEADOW_DRY), v * 2);
  else out.set(MEADOW_DRY).lerp(_cb.set(MEADOW_GREEN), (v - 0.5) * 2);
  return out;
}
// The stream's green verge (polish-gorge6, colour only: the cells, BANK_BANDS
// and the meadow's rng are untouched). Sand at the water's edge, so the bank
// bites' fill (drawn in the floor's own colour) meets sand, not a band of
// olive: the old fringe was greenest right at the water, two-toned against
// the fill. It rises to BANK_GREEN_MAX about half a metre to a metre back and
// is gone by ~2.3 m. A corner where a cell is missing round it (a path, the
// stepping stones, a cell off the floor) is plain floor, so the verge fades
// out over a cell rather than stopping on a hard square edge.
export const BANK_GREEN_MAX = 0.45;
export function bankGreen(x, z, whole = true) {
  if (!whole) return 0;
  const d = rectDist(STREAM, x, z);
  return BANK_GREEN_MAX * smoothstep(0.05, 0.5, d) * (1 - smoothstep(0.9, 2.3, d));
}
function bankColor(out, x, z, whole) {
  return out.set(GORGE_FLOOR_COLOR).lerp(_cb.set(BANK_GREEN), bankGreen(x, z, whole));
}

function meadowMesh() {
  const { patches, tufts, talus } = gorgeMeadow();
  const pos = [], col = [];
  const vert = (x, y, z, c) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); };
  const gravel = new THREE.Color(MEADOW_TALUS), sand = new THREE.Color(GORGE_FLOOR_COLOR);
  for (const t of talus) {
    // wall edge in gravel, outer edge faded into the floor
    const tx = -t.nz * t.w / 2, tz = t.nx * t.w / 2;
    const ox = t.x - t.nx * t.d / 2, oz = t.z - t.nz * t.d / 2;
    const y = FLOOR + MEADOW_LIFT;
    // the outer corners take the depths shared with the neighbouring cells
    const q = [[ox - tx, oz - tz, gravel], [ox + tx, oz + tz, gravel],
      [ox + tx + t.nx * t.dp, oz + tz + t.nz * t.dp, sand], [ox - tx + t.nx * t.dm, oz - tz + t.nz * t.dm, sand]];
    for (const tri of [[0, 1, 2], [0, 2, 3]]) {
      const [a, b, c] = tri.map((i) => q[i]);
      // wound to face up whichever way the wall faces
      const up = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) > 0;
      for (const [x, z, col2] of (up ? [a, b, c] : [a, c, b])) vert(x, y, z, col2);
    }
  }
  // how many bank cells touch each corner: an inside corner has four
  const ck = (x, z) => `${r2(x)},${r2(z)}`;
  const touching = new Map();
  for (const p of patches) {
    if (p.kind !== 'bank') continue;
    for (const [x, z] of [[p.x0, p.z0], [p.x1, p.z0], [p.x1, p.z1], [p.x0, p.z1]]) touching.set(ck(x, z), (touching.get(ck(x, z)) ?? 0) + 1);
  }
  for (const p of patches) {
    // Colour is a pure function of world position, so cells that share a
    // corner share its colour and the patches read as soft blobs, not tiles.
    const corner = (x, z) => (p.kind === 'bank' ? bankColor(_ca, x, z, touching.get(ck(x, z)) === 4) : topColor(_ca, x, z));
    const q = [[p.x0, p.z0], [p.x1, p.z0], [p.x1, p.z1], [p.x0, p.z1]].map(([x, z]) => [x, z, corner(x, z).clone()]);
    for (const k of [0, 2, 1, 0, 3, 2]) vert(q[k][0], p.y, q[k][1], q[k][2]);
  }
  const lo = _ca.set(TUFT_COLORS[0]).clone(), hi = _cb.set(TUFT_COLORS[1]).clone();
  const tc = new THREE.Color();
  for (const t of tufts) {
    tc.copy(lo).lerp(hi, (t.s - 0.12) / 0.1);
    const tip = tc.clone().multiplyScalar(1.12);
    for (let k = 0; k < 3; k++) {
      const a = t.rot + (k * Math.PI * 2) / 3;
      const lean = 0.05 + 0.03 * k;
      const w = 0.025;
      const bx = t.x + Math.cos(a) * 0.03, bz = t.z + Math.sin(a) * 0.03;
      const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
      const tx = bx + Math.cos(a) * lean, tz = bz + Math.sin(a) * lean;
      const h = t.s * (0.85 + 0.15 * k);
      const y = t.y + MEADOW_LIFT;
      // front and back, so a blade shows from both sides
      vert(bx - px, y, bz - pz, tc); vert(bx + px, y, bz + pz, tc); vert(tx, y + h, tz, tip);
      vert(bx + px, y, bz + pz, tc); vert(bx - px, y, bz - pz, tc); vert(tx, y + h, tz, tip);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const up = new Array(pos.length / 3).fill(0).flatMap(() => [0, 1, 0]);
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(up, 3));
  // The 'grass' preset's light response with no map (surfaceProps leaves it
  // off): a texture would fight the vertex colours.
  const mat = litMaterial(0xffffff, { vertexColors: true, ...surfaceProps('grass') });
  // Draws before the pawprints (-2) and contact shadows (-1); polygonOffset
  // -1/-1 as described above the MEADOW_LIFT constant.
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -1;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'gorgeMeadow';
  mesh.renderOrder = -3;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.noCast = true;
  // The rain finds ground by this tag and swaps in a darker clone (the vertex
  // colours stay, the original material is put back afterwards).
  mesh.userData.ground = true;
  return mesh;
}

// --- inside the deep caves (part 3, C5) -----------------------------------------
// Each deep cave's chamber has crystal clusters at the foot of its walls, in
// the cave's own colour (caveroom.js's crystalClusters; the Glitter Cave the
// most and biggest, the Snug Cave a few small ones), and the walls near them
// catch their glow; the Glitter Cave has gold flecks on its walls too.
// They are soft and emissive and never move. Spots are seeded by the cave's
// name, and every candidate draws all its numbers whether it is kept or not.
// A spot is kept only where the wall really is rock (not the opening into the
// bend), with the cave's floor in front of it and rock behind it far enough
// along either way that its whole cluster stays inside the chamber. Every
// crystal keeps CAVE_PATH_CLEAR off the cave's walking line and
// CAVE_FIND_CLEAR off its find and golden mouse.
export const CAVE_COLORS = Object.freeze({ echo: 0x9fc7d8, snug: 0xe8c890, glitter: 0xf2d27a });
const FLECK_COLOR = 0xe8b84a;
export const CAVE_PATH_CLEAR = 0.6;
export const CAVE_FIND_CLEAR = 0.4;
const CRYSTAL_TRIES = 80;
// Each cave its own: the Glitter Cave the most and the biggest, the Snug Cave
// a few small ones (it has the moss and the nest).
const CRYSTAL_CAP = Object.freeze({ glitter: 14, echo: 8, snug: 6 });
const CRYSTAL_GAP = Object.freeze({ glitter: 0.75, echo: 1.0, snug: 1.1 }); // between two spots
export const CRYSTAL_SIZE = Object.freeze({ glitter: 1.3, echo: 1.0, snug: 0.85 });
const CRYSTAL_OFF = [0.1, 0.2]; // a spot's distance out from its wall (then out past the liner)
const CRYSTAL_REACH = CLUSTER_SPREAD + 0.1; // a cluster's reach from its spot
// The liner stands up to 0.07 m in from the wall line beside a spot
// (caveroom.js's WALL_BUMP; spots keep off its corner arcs), and a cluster's
// spot moves out by it: the clear check allows for that.
const LINER_SLACK = 0.08;
const LINER_HS = [0.05, 0.35, 0.7, 1.0]; // heights the liner's depth is read at
const FLECK_TRIES = 120;
const FLECK_CAP = 40;
const FLECK_H = [0.35, 2.4]; // over the cave's floor, under the chamber's 3 m roof
const FLECK_REACH = 0.1;

// The chamber's four walls, each as a start, a direction along it, a length
// and the normal into the cave, walked as one perimeter.
function chamberWalls(r) {
  return [
    { x: r.minX, z: r.minZ, dx: 1, dz: 0, len: r.maxX - r.minX, nx: 0, nz: 1 }, // north
    { x: r.maxX, z: r.minZ, dx: 0, dz: 1, len: r.maxZ - r.minZ, nx: -1, nz: 0 }, // east
    { x: r.maxX, z: r.maxZ, dx: -1, dz: 0, len: r.maxX - r.minX, nx: 0, nz: -1 }, // south
    { x: r.minX, z: r.maxZ, dx: 0, dz: -1, len: r.maxZ - r.minZ, nx: 1, nz: 0 }, // west
  ];
}
function wallPoint(walls, t) {
  let rest = t;
  for (const w of walls) {
    if (rest <= w.len) return { x: w.x + w.dx * rest, z: w.z + w.dz * rest, nx: w.nx, nz: w.nz, tx: w.dx, tz: w.dz };
    rest -= w.len;
  }
  return null;
}
// Whether the wall at p is rock for `reach` either way along it, with the
// cave's floor in front of it all the way.
function wallHolds(cave, p, reach) {
  const g = shapeGround();
  for (const s of [-reach, 0, reach]) {
    const x = p.x + p.tx * s;
    const z = p.z + p.tz * s;
    if (g.y(x - p.nx * 0.1, z - p.nz * 0.1) < cave.y + 1) return false;
    if (g.y(x + p.nx * 0.3, z + p.nz * 0.3) !== cave.y) return false;
  }
  return true;
}
export const caveFinds = (cave) => [...COLLECTIBLES, ...GOLD_MICE.gorge]
  .filter((f) => cave.rects.some((r) => inRect(r, f.x, f.z)));
export const cavePathDist = (cave, x, z) => Math.min(...cave.path.slice(1).map((q, i) => segDist(x, z, ...cave.path[i], ...q)));
export function caveClear(cave, x, z, reach) {
  if (cavePathDist(cave, x, z) < CAVE_PATH_CLEAR + reach) return false;
  return caveFinds(cave).every((f) => Math.hypot(x - f.x, z - f.z) >= CAVE_FIND_CLEAR + reach);
}
export const chamberOf = (cave) => cave.rects.find((r) => r.tag.endsWith('-chamber'));
// Whether the chamber's wall at (x, z), a point on its wall line, is rock:
// the ground just outside it stands a metre and more over the cave's floor
// (the opening into the bend does not). Off the wall line, false.
export function chamberRockAt(cave) {
  const r = chamberOf(cave);
  const g = shapeGround();
  const e = 1e-6;
  return (x, z) => {
    const dx = x <= r.minX + e ? -0.1 : x >= r.maxX - e ? 0.1 : 0;
    const dz = z <= r.minZ + e ? -0.1 : z >= r.maxZ - e ? 0.1 : 0;
    if (!dx && !dz) return false;
    return g.y(x + dx, z + dz) >= cave.y + 1;
  };
}
// The chamber's dressing (caveroom.js): the rounded liner with its cove,
// stalactites, moss, and the Snug Cave's nest. Seeded by the cave's name.
// The walls and moss catch the crystals' glow (glow: false leaves it out).
export function caveRoomFor(caveId, { glow = true } = {}) {
  const cave = GORGE_CAVES.find((c) => c.id === caveId);
  return caveRoom(cave, {
    clear: (x, z, reach) => caveClear(cave, x, z, reach),
    rockAt: chamberRockAt(cave),
    seed: seedFromCode(`gorge-caveroom-${cave.id}`),
    crystals: glow ? { spots: caveCrystalSpots(cave), color: CAVE_COLORS[cave.id] } : null,
  });
}
// The corridor's and the bend's rounded, rough tunnel (caveroom.js's
// caveTunnel), with its roots, stalactites and moss. Seeded by the cave's name.
// Its walls by the chamber catch the crystals' glow as the chamber's do.
// mouthTint (a hex, mouthTintsFor's): the liner's first metres start in the
// sandstone round the mouth (polish-gorge5); unset, as before.
export function caveTunnelFor(caveId, { glow = true, mouthTint } = {}) {
  const cave = GORGE_CAVES.find((c) => c.id === caveId);
  return caveTunnel(cave, {
    clear: (x, z, reach) => caveClear(cave, x, z, reach),
    seed: seedFromCode('gorge-cavetunnel-' + cave.id),
    crystals: glow ? { spots: caveCrystalSpots(cave), color: CAVE_COLORS[cave.id] } : null,
    mouthTint: mouthTint === undefined ? undefined : { color: mouthTint, len: MOUTH_TINT_LEN },
  });
}
// Where each crystal cluster stands: its spot moved out from the wall by the
// liner's depth there (the deepest of a few heights up the cluster), so the
// liner never swallows a cluster.
export function crystalBases(cave, room) {
  return caveCrystalSpots(cave).map((s) => {
    const depth = Math.max(...LINER_HS.map((h) => room.linerDepth(s.wx, cave.y + h, s.wz, s.nx, s.nz)));
    return { ...s, x: s.x + s.nx * depth, z: s.z + s.nz * depth };
  });
}

const crystalsOnce = new Map();
export function caveCrystalSpots(cave) {
  if (crystalsOnce.has(cave.id)) return crystalsOnce.get(cave.id);
  const walls = chamberWalls(chamberOf(cave));
  const perimeter = walls.reduce((s, w) => s + w.len, 0);
  const r = chamberOf(cave);
  const cap = CRYSTAL_CAP[cave.id] ?? 10, gap = CRYSTAL_GAP[cave.id] ?? 1.0;
  const rng = mulberry32(seedFromCode(`gorge-crystals-${cave.id}`));
  const kept = [];
  for (let i = 0; i < CRYSTAL_TRIES; i++) {
    const t = perimeter * rng();
    const off = CRYSTAL_OFF[0] + (CRYSTAL_OFF[1] - CRYSTAL_OFF[0]) * rng();
    if (kept.length >= cap) continue;
    const p = wallPoint(walls, t);
    if (!p || !wallHolds(cave, p, CRYSTAL_REACH + 0.05)) continue;
    // off the liner's rounded corners (it stands up to 0.46 m in on an arc)
    const along = p.nz ? Math.min(p.x - r.minX, r.maxX - p.x) : Math.min(p.z - r.minZ, r.maxZ - p.z);
    if (along < CORNER_R) continue;
    const x = r2(p.x + p.nx * off);
    const z = r2(p.z + p.nz * off);
    if (!caveClear(cave, x, z, CRYSTAL_REACH + LINER_SLACK)) continue;
    if (!kept.every((o) => Math.hypot(x - o.x, z - o.z) >= gap)) continue;
    kept.push({ x, z, y: cave.y, nx: p.nx, nz: p.nz, wx: r2(p.x), wz: r2(p.z) });
  }
  const out = Object.freeze(kept.map(Object.freeze));
  crystalsOnce.set(cave.id, out);
  return out;
}

let flecksOnce = null;
export function glitterFleckSpots() {
  if (flecksOnce) return flecksOnce;
  const cave = GORGE_CAVES.find((c) => c.id === 'glitter');
  const walls = chamberWalls(chamberOf(cave));
  const perimeter = walls.reduce((s, w) => s + w.len, 0);
  const rng = mulberry32(seedFromCode('gorge-flecks-glitter'));
  const kept = [];
  for (let i = 0; i < FLECK_TRIES; i++) {
    const t = perimeter * rng();
    const h = FLECK_H[0] + (FLECK_H[1] - FLECK_H[0]) * rng();
    if (kept.length >= FLECK_CAP) continue;
    const p = wallPoint(walls, t);
    if (!p || !wallHolds(cave, p, FLECK_REACH)) continue;
    if (!caveClear(cave, p.x, p.z, FLECK_REACH)) continue;
    kept.push({ x: r2(p.x), z: r2(p.z), y: r2(cave.y + h), nx: p.nx, nz: p.nz });
  }
  flecksOnce = Object.freeze(kept.map(Object.freeze));
  return flecksOnce;
}

// One group per deep cave, `caveInterior:<id>`, hidden until gorgelife.js
// shows it (only near its cave and on its level, C5).
// The chamber's room and the corridor's tunnel are one mesh, `caveRoom:<id>`.
// The chamber's room and its crystal clusters (caveroom.js) are made on local
// uuids, so they take no Math.random draws from the Gorge build (pinned in
// waterlooks.test.js). The clusters and the Glitter Cave's flecks sit on or in
// front of the room's liner, which stands a little in from the wall line
// they were placed on.
function caveInterior(cave, mouthTint) {
  const g = new THREE.Group();
  g.name = `caveInterior:${cave.id}`;
  g.userData.caveId = cave.id;
  const { room, mesh, crystals } = withLocalUuids(`gorge-uuids-caveroom-${cave.id}`, () => {
    const made = caveRoomFor(cave.id);
    // the corridor's tunnel rides in the same mesh: no new draw
    const tunnel = caveTunnelFor(cave.id, { mouthTint });
    const geometry = mergeGeometries([made.geometry, tunnel.geometry]);
    // the merged copy is the one drawn; room.linerDepth (used below for the
    // clusters and flecks) reads the room's own position list, not its geometry
    made.geometry.dispose();
    tunnel.geometry.dispose();
    const m = new THREE.Mesh(geometry, litMaterial(0xffffff, { vertexColors: true, ...surfaceProps('cobble') }));
    m.name = `caveRoom:${cave.id}`;
    m.castShadow = false;
    m.userData.noCast = true;
    const c = crystalClusters(crystalBases(cave, made), seedFromCode(`gorge-crystals-${cave.id}`),
      { color: CAVE_COLORS[cave.id], size: CRYSTAL_SIZE[cave.id], id: cave.id });
    return { room: made, mesh: m, crystals: c };
  });
  g.add(crystals);
  if (cave.id === 'glitter') {
    const flecks = glitterFleckSpots().map((f) => {
      const d = room.linerDepth(f.x, f.y, f.z, f.nx, f.nz);
      return { ...f, x: f.x + f.nx * d, z: f.z + f.nz * d };
    });
    g.add(b.caveFlecks(flecks, seedFromCode('gorge-flecks-glitter'), { color: FLECK_COLOR }));
  }
  g.add(mesh);
  g.visible = false;
  return g;
}

// --- the cave mouths' rock arches (polish-gorge5, Task 2) ------------------------
// Each cave corridor's mouth and the camp den's open side, from their records:
// the mouth on the opening's edge, the unit normal out of the rock (toward
// open ground), the opening's half-width and its headroom.
function mouthArch(id, r, mouth, y, headroom) {
  const e = 1e-6;
  const [nx, nz] = Math.abs(mouth.x - r.minX) < e ? [-1, 0] : Math.abs(mouth.x - r.maxX) < e ? [1, 0]
    : Math.abs(mouth.z - r.minZ) < e ? [0, -1] : [0, 1];
  const half = (nx ? r.maxZ - r.minZ : r.maxX - r.minX) / 2;
  return Object.freeze({ id, x: mouth.x, z: mouth.z, y, nx, nz, half, headroom });
}
// The camp den's arch uses caveMouth's corridor low rule (MOUTH_LOW_IN, 0.12)
// rather than the den lining's LINER_IN (0.05) deliberately: its jambs stand
// at most 0.08 m in (measured), negligible at a 6 m wide den mouth (the Task 2
// review's ruling).
export const GORGE_MOUTH_ARCHES = Object.freeze([
  ...GORGE_CAVES.map((c) => mouthArch(c.id, c.rects[0], c.mouth, c.y, CORRIDOR_HEADROOM)),
  mouthArch('campDen', CAMP_DEN, CAMP_DEN.mouth, CAMP_DEN.y0, CAMP_DEN_HEADROOM),
]);
// The five small dens (polish-gorge6): the same rounded arch, smaller. A den
// is 2.6 m wide and DEN_HEADROOM (1.8) tall: jambs to MOUTH_LOW_H, a
// half-ellipse to the crown. The camera crosses a den's mouth no higher than
// CAM_CEIL_CLEAR under its ceiling (camzoom), so the camera rule there is
// camH = 1.5, not the corridors' 1.9. Fewer outline points, two threshold
// stones and a gentler mound than the camp den's: ~200 triangles each.
const DEN_ARCH = Object.freeze({ camH: DEN_HEADROOM - CAM_CEIL_CLEAR, points: 21, stones: 2, mound: 0.12 });
export const GORGE_DEN_ARCHES = Object.freeze(GORGE_DENS.map((d) => Object.freeze({
  ...mouthArch(d.id, d, d.mouth, d.y0, DEN_HEADROOM), ...DEN_ARCH,
})));
const ARCH_NEAR = 4; // rockFaces triangles and vertices this far round a mouth are looked at
const ARCH_FACE = [-1.0, 0.3]; // a face hit counts only this far behind / proud of the mouth plane
const ARCH_COLOR_R = 2; // a vertex takes the colour of the nearest rock vertex within this
const ARCH_SHADE = [0.94, 1.04];
const ARCH_CAMP_CLEAR = 0.4; // a den stone keeps this far off every camp seat and nest
const ARCH_FALLBACK = 0xb79f80;
const ARCH_SAMPLE_FLOOR = 0.02; // surface() samples no lower than this over the floor

// Every camp spot a den stone (and the den's lining) keeps clear of: the
// seats, the leader's rock, the nests and the fresh-kill pile (camp.js's
// records, read only), each { x, z, r }.
export function campSpots() {
  const L = campLayout('gorge');
  const D = campDressing('gorge');
  const spots = [L.seats.leader, L.seats.deputy, ...L.seats.elders, ...L.seats.kits, D.kill].map((p) => ({ x: p.x, z: p.z, r: 0 }));
  return [...spots, ...D.nests.map((p) => ({ x: p.x, z: p.z, r: p.r })), { x: L.rock.x, z: L.rock.z, r: L.rock.r }];
}

// --- the camp den's rounded rock lining (polish-gorge5, Task 3) -------------------
// caveroom.js's chamber liner, on a chamber record made from CAMP_DEN: the
// three rock walls rounded at the back corners (square at the open west
// side, where the lining meets the arch's frame at x = 20) and curving in as
// a deep cove under the roof. Below DEN_LOW_H nothing stands more than
// LINER_IN in (the den's floor is all walkable); it keeps DEN_SEAT_CLEAR off
// every camp seat and nest. No stalactites and no moss: it is sandstone,
// coloured from the rock round it (mouthArchesFor) and rock-shaded.
export const DEN_LOW_H = 1.0;
export const DEN_SEAT_CLEAR = 0.3;
const DEN_LOOK = Object.freeze({
  headroom: CAMP_DEN_HEADROOM, colW: 0.55, rowH: 0.55, coveRows: 3, coveFrom: 1.2, coveIn: 0.9,
  cornerR: [0.9, 0.9, 0, 0], stalactites: 0, floorMoss: 0, wallMoss: 0, color: 0xffffff,
  lowH: DEN_LOW_H, standoff: 0.02,
});
export const CAMP_DEN_ROOM = Object.freeze({
  id: 'campDen', y: CAMP_DEN.y0, rects: Object.freeze([Object.freeze({ ...CAMP_DEN, tag: 'campDen-chamber' })]),
});
export function campDenLining() {
  const r = CAMP_DEN;
  const e = 1e-6;
  const spots = campSpots();
  return caveRoom(CAMP_DEN_ROOM, {
    // the open west side's straight run is not rock; its corners are
    rockAt: (x, z) => !(Math.abs(x - r.minX) < e && z > r.minZ + e && z < r.maxZ - e),
    clear: (x, z, reach) => x - r.minX >= reach + DEN_SEAT_CLEAR
      && spots.every((q) => Math.hypot(x - q.x, z - q.z) >= reach + q.r + DEN_SEAT_CLEAR),
    seed: seedFromCode('gorge-campden-lining'),
    look: DEN_LOOK,
    raw: true,
  });
}

// The colour of the rock vertex nearest (X, Y, Z) within ARCH_COLOR_R, among
// rockFaces vertices `verts` (1 m bins); null if none.
function nearestRock(p, verts) {
  const bins = new Map();
  const key = (i, j, k) => `${i},${j},${k}`;
  for (const v of verts) {
    const k = key(Math.floor(p[v * 3]), Math.floor(p[v * 3 + 1]), Math.floor(p[v * 3 + 2]));
    if (!bins.has(k)) bins.set(k, []);
    bins.get(k).push(v);
  }
  return (X, Y, Z) => {
    const bi = Math.floor(X), bj = Math.floor(Y), bk = Math.floor(Z);
    let best = -1, bestD = ARCH_COLOR_R * ARCH_COLOR_R;
    for (let i = bi - ARCH_COLOR_R; i <= bi + ARCH_COLOR_R; i++) {
      for (let j = bj - ARCH_COLOR_R; j <= bj + ARCH_COLOR_R; j++) {
        for (let k = bk - ARCH_COLOR_R; k <= bk + ARCH_COLOR_R; k++) {
          for (const r of bins.get(key(i, j, k)) ?? []) {
            const d = (p[r * 3] - X) ** 2 + (p[r * 3 + 1] - Y) ** 2 + (p[r * 3 + 2] - Z) ** 2;
            if (d < bestD) { bestD = d; best = r; }
          }
        }
      }
    }
    return best;
  };
}

// The rockFaces shell: positions, colours and how far its shell triangles run.
function shellOf(rockFaces) {
  const geo = rockFaces.geometry;
  const p = geo.getAttribute('position').array;
  const cAttr = geo.getAttribute('color')?.array;
  const shellTris = rockFaces.parent?.userData?.shellTris?.rockFaces ?? p.length / 9;
  return { p, cAttr, shellEnd: Math.min(p.length, shellTris * 9) };
}

// The mean colour (hex) of the rock round each cave's mouth: the shell
// vertices on or out of the cliff face within MOUTH_TINT_NEAR of the
// opening's rectangle. caveTunnelFor's mouthTint starts the liner in it.
const MOUTH_TINT_NEAR = 1.5;
const MOUTH_TINT_LEN = 3.5;
// Cached like narrowsDressing's tufts: the Gorge's one fixed rock gives the
// same answer every build, so `rockFaces` is not part of the key.
let tintsCache = null;
export function mouthTintsFor(rockFaces) {
  if (!tintsCache) tintsCache = computeMouthTints(rockFaces);
  return { ...tintsCache };
}
function computeMouthTints(rockFaces) {
  const { p, cAttr, shellEnd } = shellOf(rockFaces);
  const out = {};
  for (const a of GORGE_MOUTH_ARCHES.filter((q) => GORGE_CAVES.some((c) => c.id === q.id))) {
    let r = 0, g = 0, bl = 0, n = 0;
    for (let i = 0; cAttr && i < shellEnd; i += 3) {
      const dx = p[i] - a.x, dz = p[i + 2] - a.z;
      const u = dx * -a.nz + dz * a.nx, h = p[i + 1] - a.y, w = dx * a.nx + dz * a.nz;
      if (w < -0.3 || w > MOUTH_TINT_NEAR) continue;
      if (Math.max(Math.abs(u) - a.half, h - a.headroom, -h) > MOUTH_TINT_NEAR) continue;
      r += cAttr[i]; g += cAttr[i + 1]; bl += cAttr[i + 2]; n++;
    }
    out[a.id] = n ? new THREE.Color().setRGB(r / n, g / n, bl / n).getHex() : ARCH_FALLBACK;
  }
  return out;
}

// The arches for rockFaces (the built mesh, relief and all), coloured from
// its rock and ready to append (non-indexed): positions, colours, normals,
// the triangles per arch (byId, with the den's lining as campDenLining) and
// each arch's threshold stones. `surface` casts a ray along -n from w = +2
// against the shell triangles round the mouth and takes the outermost hit
// within ARCH_FACE (the Snug Cave's mouth stands in a notch whose side walls
// the ray would start inside), sampled no lower than ARCH_SAMPLE_FLOOR; no
// hit, 0 — counted per arch in `buried` where the point just out of the
// mouth plane is inside solid rock (the notch's walls), else in `misses`.
// `ranges[id]`: the arch's triangles in pos ({ from, to }, the threshold
// stones the last `stones` of them); `rims[id]`: its rim vertices, world [x, y, z].
let archesCache = null;
export function mouthArchesFor(rockFaces) {
  if (!archesCache) archesCache = computeMouthArches(rockFaces);
  const c = archesCache;
  // fresh typed arrays and records per caller: nothing cached is shared
  const copy = (o) => JSON.parse(JSON.stringify(o));
  return {
    ...c,
    pos: c.pos.slice(), col: c.col.slice(), nor: c.nor.slice(),
    byId: copy(c.byId), stones: Object.fromEntries(Object.entries(c.stones).map(([k, v]) => [k, v.slice()])), rims: copy(c.rims),
    ranges: copy(c.ranges), misses: copy(c.misses), buried: copy(c.buried), rimBuried: copy(c.rimBuried),
  };
}
function computeMouthArches(rockFaces) {
  const { p, cAttr, shellEnd } = shellOf(rockFaces);
  const g = shapeGround();
  const spots = campSpots();
  const fallback = new THREE.Color(ARCH_FALLBACK);
  const pos = [], col = [], nor = [];
  const byId = {}, stones = {}, rims = {}, ranges = {}, misses = {}, buriedById = {}, rimBuriedById = {};
  const append = (m, vcol) => {
    for (const v of m.idx) {
      pos.push(m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]);
      col.push(vcol[v * 3], vcol[v * 3 + 1], vcol[v * 3 + 2]);
      nor.push(m.nor[v * 3], m.nor[v * 3 + 1], m.nor[v * 3 + 2]);
    }
  };
  for (const a of [...GORGE_MOUTH_ARCHES, ...GORGE_DEN_ARCHES]) {
    const lx = -a.nz, lz = a.nx;
    const toLocal = (X, Y, Z) => { const dx = X - a.x, dz = Z - a.z; return [dx * lx + dz * lz, Y - a.y, dx * a.nx + dz * a.nz]; };
    const near = (q) => Math.abs(q[0]) <= a.half + ARCH_NEAR && q[1] >= -1 && q[1] <= a.headroom + ARCH_NEAR && Math.abs(q[2]) <= ARCH_NEAR;
    // the shell triangles round the mouth, in the mouth's frame
    const tris = [];
    const verts = [];
    for (let i = 0; i < shellEnd; i += 9) {
      const q = [0, 3, 6].map((o) => toLocal(p[i + o], p[i + o + 1], p[i + o + 2]));
      if (q.some(near)) tris.push(q);
    }
    for (let i = 0; i < shellEnd; i += 3) {
      const q = toLocal(p[i], p[i + 1], p[i + 2]);
      if (Math.abs(q[0]) <= a.half + ARCH_NEAR && q[1] >= -2 && q[1] <= a.headroom + ARCH_NEAR + 1 && Math.abs(q[2]) <= ARCH_NEAR + 1) verts.push(i / 3);
    }
    let miss = 0, buried = 0, rimBuried = 0;
    const surface = (u, hIn, stoneTry = false) => {
      // a ring's foot (h -0.02) is sampled just over the floor, where the face starts
      const h = Math.max(ARCH_SAMPLE_FLOOR, hIn);
      let best = -Infinity;
      for (const [A, B, C] of tris) {
        // the ray (u, h, 2) - t (0, 0, 1): solve for the triangle's barycentrics in (u, h)
        const d1u = B[0] - A[0], d1h = B[1] - A[1], d2u = C[0] - A[0], d2h = C[1] - A[1];
        const det = d1u * d2h - d2u * d1h;
        if (Math.abs(det) < 1e-12) continue;
        const pu = u - A[0], ph = h - A[1];
        const s = (pu * d2h - d2u * ph) / det, t = (d1u * ph - pu * d1h) / det;
        if (s < -1e-9 || t < -1e-9 || s + t > 1 + 1e-9) continue;
        const w = A[2] + s * (B[2] - A[2]) + t * (C[2] - A[2]);
        if (w >= ARCH_FACE[0] && w <= ARCH_FACE[1] && w > best) best = w;
      }
      if (best === -Infinity) {
        // no face to seat on: either the point is inside solid rock just out
        // of the mouth plane (the Snug Cave's notch walls stand out 2.8 m each
        // side of its mouth, so the rim there is buried) or a true miss
        const X = a.x + lx * u + a.nx * 0.05, Z = a.z + lz * u + a.nz * 0.05;
        if (g.y(X, Z) > a.y + h + 0.05) { buried++; if (!stoneTry) rimBuried++; } else miss++;
        return 0;
      }
      return best;
    };
    const cave = GORGE_CAVES.find((c) => c.id === a.id);
    // a stone (set into the face) has open ground at the mouth's level just
    // in front of it, and keeps off the cave's walking line (caveClear) or
    // the camp's seats and nests
    const clear = (x, z, reach) => {
      if (Math.abs(g.y(x + a.nx * reach, z + a.nz * reach) - a.y) > 0.02) return false;
      if (cave) return caveClear(cave, x, z, reach);
      return spots.every((s) => Math.hypot(x - s.x, z - s.z) >= reach + s.r + ARCH_CAMP_CLEAR);
    };
    const m = caveMouth({ ...a, seed: seedFromCode(`gorge-mouth-${a.id}`), surface, clear });
    stones[a.id] = m.stones.map((s) => Object.freeze({ ...s }));
    byId[a.id] = m.idx.length / 3;
    misses[a.id] = miss;
    buriedById[a.id] = buried;
    rimBuriedById[a.id] = rimBuried;
    rims[a.id] = m.rim.map((i) => [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]]);
    // colour: the nearest rock vertex within ARCH_COLOR_R (1 m bins), shaded
    const nearest = nearestRock(p, verts);
    const shade = mulberry32(seedFromCode(`gorge-mouth-shade-${a.id}`));
    const vcol = [];
    for (let v = 0; v < m.pos.length / 3; v++) {
      const best = nearest(m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]);
      const f = ARCH_SHADE[0] + (ARCH_SHADE[1] - ARCH_SHADE[0]) * shade();
      if (best >= 0 && cAttr) vcol.push(cAttr[best * 3] * f, cAttr[best * 3 + 1] * f, cAttr[best * 3 + 2] * f);
      else vcol.push(fallback.r * f, fallback.g * f, fallback.b * f);
    }
    // expanded to triangles, as rockFaces is (non-indexed)
    const from = pos.length / 9;
    append(m, vcol);
    ranges[a.id] = { from, to: pos.length / 9, stones: m.parts.stones };
  }

  // The camp den's lining: each vertex the colour of the nearest rock vertex
  // (the den's own walls, most), times the liner's own shading (its look's
  // colour is white, so its vertex colours are that shading alone).
  {
    const lining = campDenLining();
    const r = CAMP_DEN, y0 = CAMP_DEN.y0;
    const verts = [];
    for (let i = 0; i < shellEnd; i += 3) {
      if (p[i] >= r.minX - 2.5 && p[i] <= r.maxX + 2.5 && p[i + 2] >= r.minZ - 2.5 && p[i + 2] <= r.maxZ + 2.5
        && p[i + 1] >= y0 - 1 && p[i + 1] <= y0 + CAMP_DEN_HEADROOM + 2) verts.push(i / 3);
    }
    const nearest = nearestRock(p, verts);
    const vcol = [];
    for (let v = 0; v < lining.pos.length / 3; v++) {
      const best = nearest(lining.pos[v * 3], lining.pos[v * 3 + 1], lining.pos[v * 3 + 2]);
      const c = best >= 0 && cAttr ? [cAttr[best * 3], cAttr[best * 3 + 1], cAttr[best * 3 + 2]] : [fallback.r, fallback.g, fallback.b];
      vcol.push(c[0] * lining.col[v * 3], c[1] * lining.col[v * 3 + 1], c[2] * lining.col[v * 3 + 2]);
    }
    const from = pos.length / 9;
    append(lining, vcol);
    byId.campDenLining = lining.idx.length / 3;
    ranges.campDenLining = { from, to: pos.length / 9, stones: 0 };
  }
  return {
    pos: new Float32Array(pos), col: new Float32Array(col), nor: new Float32Array(nor),
    tris: pos.length / 9, byId, stones, rims, ranges, misses, buried: buriedById, rimBuried: rimBuriedById,
  };
}

// Appends the arches to rockFaces: new attributes on the same geometry (a
// BufferAttribute has no uuid, so the build's Math.random draws stay put).
function appendArches(rockFaces, arches) {
  const geo = rockFaces.geometry;
  for (const [name, add] of [['position', arches.pos], ['color', arches.col], ['normal', arches.nor]]) {
    const old = geo.getAttribute(name).array;
    const next = new Float32Array(old.length + add.length);
    next.set(old);
    next.set(add, old.length);
    geo.setAttribute(name, new THREE.BufferAttribute(next, 3));
  }
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
}

// The Gorge's critters: birds in the first four near trees, a mouse at each
// end of the floor, and the goat on the shoulder, which only ever bolts (G9).
// No ducks, frogs or butterflies, and no villagers: no Twolegs walk here.
function critterSpawns() {
  return [
    ...gorgeTrees().near.slice(0, 4).map(({ x, z }) => ({ type: 'bird', x, z })),
    { type: 'mouse', x: -15, z: 36, x2: -12, z2: 40 },
    { type: 'mouse', x: -2, z: -36, x2: -4, z2: -40 },
    { type: 'goat', x: 3.5, z: -16, x2: 7.5, z2: -16 },
  ];
}

const MOMENTS = [
  { id: 'goat-leap', type: 'goat', label: 'a goat leaping over the rocks', x: 8, z: -12.5, from: { x: 4, z: -16 } },
];

// What the rock is drawn from: the walkable shapes and every cave and den
// floor (the camp den's too), the masses and the ceilings. The same records
// the ground is built from, so what she stops at is what she sees.
export const ROCK_WALKS = Object.freeze([
  ...WALK_SHAPES, ...GORGE_CAVES.flatMap((c) => c.rects), ...GORGE_DENS, CAMP_DEN,
]);

// A warm sand: the floor's shade comes from gorgelife's light (SHADE_FLOOR),
// not from a dark ground colour. Task 2 and the clancast test read it.
export const GORGE_FLOOR_COLOR = 0x9a8a6a;
const GROUND_COLOR = GORGE_FLOOR_COLOR;

// The floor's wash (polish-gorge7): per-channel multipliers on the ground
// plane's vertex colours (on top of builder's macro variation), a pure function
// of world (x, z). Damp and browner within ~3 m of the stream, paler sand
// drifted against the wall feet, and faint drift bands (~7 m, warped, with a
// longer second octave: the plane is a 2.5 m grid, so nothing finer) that fade
// out where it is damp or pale. It lives in vertex colours, not a shader patch,
// because rain and dusk clone the ground material. The stream's decks (the
// stepping stones) are ignored here: the bank under them is as damp as any.
// Damp blue is 0.25, not the plan's 0.27, so full damp (in the water) stays
// within the promised 0.75..1.12 per channel.
export const FLOOR_WASH = Object.freeze({
  damp: Object.freeze({ reach: 3.2, mul: Object.freeze([0.2, 0.22, 0.25]) }),
  pale: Object.freeze({ from: 0.4, to: 3.5, mul: Object.freeze([0.08, 0.06, 0.02]) }),
  band: Object.freeze({ wave: 7, wave2: 11.3, octave2: 0.35, warp: 1.3, amp: 0.04 }),
});
const WASH_WATERS = GORGE_WATERS.map((w) => ({ ...w, decks: [] }));
export function gorgeFloorWash(x, z) {
  const { damp: D, pale: P, band: B } = FLOOR_WASH;
  const clear = b.waterClearance(WASH_WATERS, x, z);
  const damp = clear <= 0 ? 1 : 1 - smoothstep(0, D.reach, clear);
  let wall = Infinity;
  for (const [x1, z1, x2, z2] of FLOOR_WALLS) wall = Math.min(wall, segDist(x, z, x1, z1, x2, z2));
  const pale = 1 - smoothstep(P.from, P.to, wall);
  // across the canyon on a slant, so both the N-S floor and the E-W Narrows band
  const v = 0.8 * x - 0.6 * z;
  const u = 0.6 * x + 0.8 * z + B.warp * Math.sin(v / 5.3 + 0.7);
  const tau = 2 * Math.PI;
  const band = (Math.sin(tau * u / B.wave) + B.octave2 * Math.sin(tau * u / B.wave2 + 1.9)) / (1 + B.octave2);
  const bandMul = 1 + B.amp * band * (1 - damp) * (1 - pale);
  return [0, 1, 2].map((k) => (1 - D.mul[k] * damp) * (1 + P.mul[k] * pale) * bandMul);
}
function washFloor(plane) {
  const col = plane.geometry.attributes.color;
  const pos = plane.geometry.attributes.position;
  plane.updateMatrix();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(plane.matrix);
    const w = gorgeFloorWash(v.x, v.z);
    col.setXYZ(i, col.getX(i) * w[0], col.getY(i) * w[1], col.getZ(i) * w[2]);
  }
  col.needsUpdate = true;
}

// Where things stand on the rock's top, the relief leaves the top still (no
// crest jag, no move): the goat's leap along the shoulder, (3.5..7.5, -16),
// and where it lands and hides, (8, -12.5). Kept small (the relief fades back
// in over a further metre): at r 1.2 the three goat-line discs froze the
// shoulder's west crest dead straight. The line's west end is wider (1.4):
// the shoulder is 2 m wide there, its top one crest cell across, so a lifted
// vertex on its west edge (x 2) tilts the top under the goat. At 0.6 the top
// stood 0.13 m high at (3, -16.3), at 0.9 0.09 m and at 1.2 0.04 m at (3, -16);
// 1.4 keeps x 3..7.5 within 0.03 of 14 (test/gorge.test.js). The east end
// (7.5, -16) is 0.8: the finer wall grid (ROCK_CELL 1.2) puts a crest vertex
// near it that 0.6 let lift the top 0.04 m.
export const GORGE_ROCK_KEEP = Object.freeze([
  { x: 8, z: -12.5, r: 1.0 },
  { x: 3.5, z: -16, r: 1.4 },
  { x: 5.5, z: -16, r: 0.6 },
  { x: 7.5, z: -16, r: 0.8 },
].map(Object.freeze));

// Every cave and den mouth, the camp den's too: no foot boulder is set
// within a metre of one (builder.rockTerrain's `mouths`).
export const GORGE_ROCK_MOUTHS = Object.freeze([
  ...GORGE_CAVES.map((c) => c.mouth), ...GORGE_DENS.map((d) => d.mouth), CAMP_DEN.mouth,
]);

// The sky's passing flock flies at GORGE_BIRD_Y (34), over every 20 m rim and
// the highest camera (G11); defined in gorgelife.js beside the wheeling birds.
export { GORGE_BIRD_Y };

// The lawn plane is 120 m square but the rock masses stand on most of it, so
// most of it is never seen. Drop each triangle every point of a 0.25 m lattice
// over which (vertices, edges, interior) lies strictly inside a mass at least
// 0.5 m tall and under no cave or den ceiling. The index is rebuilt in place on
// the same geometry (no new uuid'd objects, so no Math.random draws); returns
// the number of triangles dropped.
//
// Two shortcuts, both exact (the dropped set is the full lattice's): a triangle
// whose xz box lies strictly inside one tall mass and touches no ceiling is
// dropped without the lattice (rects are convex); and the kept index of the
// stock plane (PlaneGeometry(120, 120, 48, 48), always the same under the same
// masses) is remembered per masses array, so the walk's later starts reuse it.
const HIDE_STEP = 0.25;
const hiddenCache = new WeakMap(); // masses -> { verts, count, keep: Uint16Array|Uint32Array, dropped }
export function trimHiddenGround(plane, masses, { cache = true } = {}) {
  plane.updateMatrixWorld();
  const g = plane.geometry;
  const pos = g.attributes.position;
  const idx = g.index;
  const hit = cache ? hiddenCache.get(masses) : null;
  if (hit && hit.verts === pos.count && hit.count === idx.count) {
    g.setIndex(new THREE.BufferAttribute(hit.keep.slice(), 1));
    return hit.dropped;
  }
  const tall = masses.filter((m) => m.y1 >= 0.5);
  const buried = (x, z) => tall.some((m) => x > m.minX && x < m.maxX && z > m.minZ && z < m.maxZ)
    && !CEILINGS.some((c) => x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ);
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const keep = [];
  let dropped = 0;
  for (let t = 0; t < idx.count; t += 3) {
    for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx.getX(t + k)).applyMatrix4(plane.matrixWorld);
    const [a, bb, c] = v;
    const lx = Math.min(a.x, bb.x, c.x), hx = Math.max(a.x, bb.x, c.x);
    const lz = Math.min(a.z, bb.z, c.z), hz = Math.max(a.z, bb.z, c.z);
    if (tall.some((m) => lx > m.minX && hx < m.maxX && lz > m.minZ && hz < m.maxZ)
      && !CEILINGS.some((q) => hx >= q.minX && lx <= q.maxX && hz >= q.minZ && lz <= q.maxZ)) {
      dropped++;
      continue;
    }
    const longest = Math.max(a.distanceTo(bb), bb.distanceTo(c), c.distanceTo(a));
    const n = Math.max(1, Math.ceil(longest / HIDE_STEP));
    let hidden = true;
    for (let i = 0; i <= n && hidden; i++) {
      for (let j = 0; j <= n - i; j++) {
        const u = i / n, w = j / n, s = 1 - u - w;
        if (!buried(a.x * s + bb.x * u + c.x * w, a.z * s + bb.z * u + c.z * w)) { hidden = false; break; }
      }
    }
    if (hidden) dropped++;
    else keep.push(idx.getX(t), idx.getX(t + 1), idx.getX(t + 2));
  }
  if (dropped) {
    const Arr = pos.count > 65535 ? Uint32Array : Uint16Array;
    const kept = new Arr(keep);
    g.setIndex(new THREE.BufferAttribute(kept, 1));
    // only the stock plane is remembered: same vertex and index counts mean
    // the same grid (the plane is a fixed-size, fixed-place ground)
    if (cache && pos.count === 49 * 49 && idx.count === 48 * 48 * 6) {
      hiddenCache.set(masses, { verts: pos.count, count: idx.count, keep: kept.slice(), dropped });
    }
  }
  return dropped;
}

export function build(scene, { water = {}, wind } = {}) {
  const ground = gorgeGround();
  const colliders = [];
  const perches = [];
  b.applySky(scene, GORGE_SKY.top, GORGE_SKY.horizon);
  scene.fog.near = GORGE_FOG.near;
  scene.fog.far = GORGE_FOG.far;
  const plane = b.ground(120, GROUND_COLOR, { surface: 'grass' });
  plane.name = 'groundPlane';
  washFloor(plane);
  trimHiddenGround(plane, MASSES);
  scene.add(plane);
  scene.add(b.horizonBand(GORGE_HORIZON));

  // --- the rock ---------------------------------------------------------------
  const rock = b.rockTerrain({
    walks: ROCK_WALKS, masses: MASSES, ceilings: CEILINGS, seed: seedFromCode('gorge-rock'), keep: GORGE_ROCK_KEEP,
    mouths: GORGE_ROCK_MOUTHS, tint: narrowsTint, tintKey: NARROWS_TINT_KEY,
  });
  rock.name = 'gorgeRock';
  scene.add(rock);
  // The Narrows' tufts, crest shrubs and the view out to the Moor: one
  // noCast mesh at the scene root, under local uuids (BUILD_DRAWS stays put).
  const rockFaces = rock.getObjectByName('rockFaces');
  scene.add(withLocalUuids('gorge-uuids-narrows', () => narrowsDressing(rockFaces)));
  // The cave mouths' and the camp den's rounded rock arches (polish-gorge5):
  // appended to rockFaces, so they wear its rock shader at no new draw.
  // The camp den's rounded lining rides along (byId.campDenLining). The
  // tunnels' first metres take the sandstone measured round each mouth
  // (before the arches join the mesh: the shell's own colours).
  const mouthTints = mouthTintsFor(rockFaces);
  const arches = mouthArchesFor(rockFaces);
  // each part's triangles in rockFaces itself (the shell's, then the arches')
  const shellTris = rockFaces.geometry.getAttribute('position').array.length / 9;
  rock.userData.mouthArchRanges = Object.fromEntries(Object.entries(arches.ranges)
    .map(([id, r]) => [id, { from: shellTris + r.from, to: shellTris + r.to }]));
  appendArches(rockFaces, arches);
  rock.userData.mouthArches = arches.byId;
  rock.userData.mouthTints = mouthTints;

  // --- the stream -------------------------------------------------------------
  // Built from its footprint record and added to the scene root directly
  // (test/water.test.js matches against scene.children).
  const waterFx = GORGE_WATERS.map((w) => {
    const fx = createWater(w, {
      ...WATER_LOOK[w.id],
      quality: water.quality ?? 'high',
      reducedMotion: water.reducedMotion ?? false,
      waters: GORGE_WATERS,
    });
    scene.add(fx.mesh);
    return fx;
  });
  const stones = b.steppingStones(STEPPING_STONES.minX, STONES_Z, STEPPING_STONES.maxX, STONES_Z, STONES.n, STONES);
  stones.name = 'steppingStones';
  scene.add(stones);

  // --- the paths --------------------------------------------------------------
  addTrails(scene, [{ segs: GORGE_PATHS, w: PATH_W }], PATH_STYLE, 'gorge', { decks: GORGE_WATERS.flatMap((w) => w.decks ?? []), waters: GORGE_WATERS });

  // --- the Summit Rock --------------------------------------------------------
  // Named so test/gorge.test.js can find them and see past them. One material
  // for both, made per build (walk.js disposes every material at the end of a
  // walk). Each is set on the clifftop with seatOnGround.
  const rockMat = litMaterial(ROCK_COLOR, surfaceProps('cobble'));
  const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), rockMat);
  // shaded round: its normals smoothed in place, no new attribute
  const bn = boulder.geometry.attributes.normal;
  bn.array.set(smoothNormals(boulder.geometry.attributes.position.array, null, 180));
  bn.needsUpdate = true;
  boulder.name = 'summitRockBoulder';
  boulder.position.set(SUMMIT_BOULDER.x, 0.3, SUMMIT_BOULDER.z);
  scene.add(seatOnGround(boulder, ground));
  colliders.push({ x: SUMMIT_BOULDER.x, z: SUMMIT_BOULDER.z, r: SUMMIT_BOULDER.r });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(PILLAR.rTop, PILLAR.rBottom, PILLAR.y, PILLAR.sides), rockMat);
  pillar.name = 'summitRock';
  pillar.position.set(SUMMIT_ROCK.x, PILLAR.y / 2, SUMMIT_ROCK.z);
  scene.add(seatOnGround(pillar, ground));
  colliders.push({ x: SUMMIT_ROCK.x, z: SUMMIT_ROCK.z, r: PILLAR.r });
  perches.push(...CHAIN_PERCHES.map((p) => ({ ...p })));

  // --- the tors -----------------------------------------------------------------
  // builder.tor draws in place; each is moved to stand at its own (x, z) so
  // seatOnGround can set it on its ground (the floor or the clifftop). All of
  // them in one group: they share one look, so the walk's prop merge makes
  // them one draw and one shadow caster.
  const tors = new THREE.Group();
  tors.name = 'tors';
  gorgeTors().forEach(({ x, z, r, h }, i) => {
    const t = roundTor(b.tor(x, z, { r, h, seed: i }), { x, z, r, h, seed: i });
    t.geometry.translate(-x, 0, -z);
    t.position.set(x, 0, z);
    t.name = `tor-${i}`;
    tors.add(t);
    colliders.push({ x, z, r });
    perches.push({ x, z, y: h, kind: 'stone' });
  });
  scene.add(seatOnGround(tors, ground, { children: true }));

  // --- the pines ----------------------------------------------------------------
  // A collider a little wider than the trunk on every pine, near or in the
  // stand. No fork perch: a pine has no low fork. Each near pine stands at the
  // scene root at its own (x, z), seated on its ground; the stand's trees are
  // lifted onto the west top by their own y.
  const { near, stand } = gorgeTrees();
  for (const { x, z, scale } of near) scene.add(seatOnGround(b.pine(x, z, scale, { wind }), ground));
  const standMesh = b.pineStand(stand, seedFromCode('gorge-stand'));
  standMesh.name = 'pineStand';
  scene.add(standMesh);
  for (const { x, z, scale } of [...near, ...stand]) colliders.push({ x, z, r: pineCollider(scale) });

  // --- the scree ----------------------------------------------------------------
  // One merged bed, out of the shadow pass, on the floor (so at y 0), and no
  // collider: a cat walks over loose stones. Chunky sandstone heaped at each
  // wall's foot (polish-gorge7), built under local uuids so its stones add no
  // Math.random draws to the build (waterlooks.test.js pins the count).
  const scree = withLocalUuids('gorge-uuids-scree', () => b.scree(gorgeScree(), seedFromCode('gorge-scree'), { chunky: true }));
  scree.name = 'screeBed';
  scene.add(scree);

  // --- the meadow ---------------------------------------------------------------
  // Built under local uuids: the meadow's mesh, geometry and material would
  // otherwise add 12 Math.random draws to the Gorge build (pinned at 5108 by
  // waterlooks.test.js). It stays a top-level scene child.
  scene.add(withLocalUuids('gorge-uuids-meadow', meadowMesh));

  // --- inside the deep caves ----------------------------------------------------
  // One group each, at the scene root, hidden until her cat is near its cave
  // and on its level (gorgelife.js shows it; C5). Only one is ever shown at a
  // time: the caves are far apart.
  const interiors = GORGE_CAVES.map((c) => caveInterior(c, mouthTints[c.id]));
  for (const g of interiors) scene.add(g);

  // --- CliffClan's camp (part 4) ---------------------------------------------------
  // The leader's rock on the Wide Ledge and the bedding in the den behind it,
  // set on the ground; one collider, the rock (the den is cut into the rock).
  addCamp(scene, { colliders, ground }, 'gorge');

  return {
    name: 'The Gorge',
    colliders,
    bounds: { ...BOUNDS },
    spawn: { x: SPAWN.x, z: SPAWN.z },
    // Nothing Twoleg-made in the Gorge.
    boxes: [],
    tippables: [],
    pois: POIS.map((p) => ({ ...p })),
    collectibles: COLLECTIBLES.map((c) => ({ ...c })),
    scenics: SCENICS.map((c) => ({ ...c })),
    critterSpawns: critterSpawns(),
    moments: MOMENTS.map((m) => ({ ...m, from: { ...m.from } })),
    puddles: [],
    waters: GORGE_WATERS,
    waterFx,
    groundBounce: GROUND_COLOR,
    skyDusk: { top: 0x2c3460, horizon: 0xc98a6a },
    duskLight: {
      sunColor: 0xff9a52, sunIntensity: 1.0, hemiSky: 0x7a84bc,
      // polish-gorge7: the sand floor stays warm at dusk (the default lawnTint
      // greys and blues a lawn); still darker, so it reads as evening.
      lawnTint: { desat: 0.1, dark: 0.78, cool: [1.06, 0.98, 0.86] },
    },
    perches,
    // Strays and ghosts stand only where a cat can walk (G7; keepout.js reads
    // onlyOn from Task 10).
    keepOut: { rects: [], capsules: [], margin: 0.4, onlyOn: STAND_ON },
    // Where a clan cat may stand (K4): the strays' ground plus the ledges,
    // the path's legs and the camp den.
    clanStandOn: CLAN_STAND_ON,
    // Someone lives in the Snug Cave (part 3, C8): the first ordinary stray
    // has its home in the chamber, and only the cave's bend and chamber to
    // stand on (ruling C-F2; they are not in STAND_ON, ruling F35).
    strayHomes: [SNUG_HOME],
    ground,
    raceCourse: RACE_COURSE.map((r) => ({ ...r })),
    mapShapes: mapShapes(),
    caves: GORGE_CAVES,
    // What only the Gorge does on a walk: shade by height, wheeling birds,
    // the ambience mix, and the caves' dark, glow, shelter and interiors
    // (gorgelife.js). walk.js calls it once per walk.
    life: (ctx) => createGorgeLife({ ...ctx, caves: GORGE_CAVES, interiors }),
    skyBirdY: GORGE_BIRD_Y,
  };
}
