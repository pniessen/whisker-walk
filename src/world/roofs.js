import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as b from './builder.js';
import { litMaterial, tileMetres } from '../render/materials.js';
import { SUN_POSITION } from '../render/rig.js';
import { withLocalUuids } from './localuuids.js';
import { hash01 } from './warehouselook.js';
import { roofsMaterials, addWindowQuads, windowCell, markMesh, markGlowMap, ATLAS_SIZE, PLAIN_WARM, MARK_GLOW } from './roofsparts.js';
import {
  LEVELS as L, BLOCKS, GROUNDS, ROOFS_BOUNDS, ROOFS_SPAWN, ROOFS_COLLIDERS, ROOFS_TRAVERSAL, roofsArea,
  ALLEY_LAMP, BIN_2, BIN_3, BIN_BAGS, ALLEY_CRATES, ALLEY_CLUTTER, ALLEY_CHANNEL, YARD, YARD_WALLS, WASHING_POSTS,
  VANE, VANE_TIP, TELESCOPE, GARDEN, SKYLIGHT, TELESCOPE_CRATE, ROOFS_DISCOVERIES, STREETS, PAVEMENT, STREET_LAMPS, BUS,
  ROOFS_PERCHES, ROOFS_WIND, SMOKE_POTS, ROOFS_SLEEPERS, SLEEPER_SILL,
} from './roofsplan.js';
import { STEP_MAX } from '../ground.js';
import { createRoofsLife, mixHex } from '../roofslife.js';
import { DRAWN_ID, ROOFS_BIRDS, flockPerches, perchIndex, roofsCritterSpawns } from './roofsflock.js';
import { handAngles } from './clockhands.js';
import { makeWashMaterial, swayAttribute, downwindSide } from './roofsair.js';

// =============================================================================
// THE ROOFTOPS, DRAWN (Rooftops step 2). Every position comes from
// roofsplan.js; this file only draws it. Part one (Task 7): the back alley,
// the garages, the back yards and their bunkers, the back extensions and
// outriggers, the terrace (back and front walls with lit windows, slate roofs,
// gutters, ridge tiles, chimney stacks with pots), its three flat roofs, the
// planks, the washing lines and every take-off mark. Part two (Task 8): the
// corner shop, the warehouse, the clock tower, the street below and the
// evening.
//
// A cosy English back alley at evening, seen from the cat's height: brick,
// slate, felt and cobbles, warm windows, washing on the lines.
//
// HOW IT IS BUILT. Everything is made inside withLocalUuids, so the build
// draws nothing from Math.random (variation is hash01). Static pieces go into
// a kit per group, one merged mesh per material (fairparts.js's way), and a
// few meshes stay their own because the tests read them:
//   * the top of every block (userData.block = its id), whose box tops out at
//     the block's ground height (the terrace's slates: at the ridge);
//   * every crossing (userData.crossing = its id), one mesh along its rail.
// render/mergeprops.js folds those into their group's merged meshes at walk
// time, so they cost draw calls only in the build's own count.
// The take-off marks (roofsparts.js markMesh) are merged by material too; each
// merged mark mesh keeps userData.markRanges = [{ id, kind, start, count }],
// the vertices each hop's mark put into it, so a test can find every mark's
// own geometry.
//
// THE PLAN'S ODD CORNERS, drawn on purpose (Task 5's review):
//   * the dormer and the roof terrace reach 0.7 m past their party walls: the
//     slope ends there in a brick cheek with a stone coping, so the flat roof
//     reads as a wide party parapet, not a mistake;
//   * the outriggers overhang the side returns by 0.35 m: the overhang is a
//     jettied first floor on a corbelled brick course, the side return open
//     beneath it;
//   * the flat house has no ridge over it (follow-up 3: the old timber beam
//     read as a beam in the air): a chimney stack stands on each of its party
//     walls, and every ridge lies on slates from stack to stack.
//
// NOTHING FADES (R7) but the clock tower's body: no mesh carries
// userData.window, and the one fadeOccluder besides the lamp posts is the
// tower's body below its first ledge (11.1 to 12.3), a top-level group of its
// own so the walk's prop merge keeps its mesh. The lamps (the alley's, three
// in the street below) are builder.lampPost, so dusk lights their globes and
// the lamp pools find them.
//
// PART TWO (Task 8), the north of the place and its edges:
//   * the corner shop: brick, parapets, a shopfront over the street and the
//     arch the bus goes under; the telescope on its roof (discovery E);
//   * the warehouse: brick, rows of lit windows, a stone band and parapets,
//     flush roof lights; the water tank, the pigeon loft with its holes
//     (discovery B), the glazed lantern, pipe-1 between tank and loft, and
//     the iron stair down to the ginnel;
//   * the clock tower, the landmark of the skyline: stone stages in 1 m rings
//     with railings (open where she climbs), a lit clock face on each side of
//     the belfry at 7:10, and the weathervane (mast, letters, arrow) to
//     VANE_TIP, the highest point of the place (discovery C);
//   * the street below at -4 (R3): the road and pavements, three lamps, the
//     end house with its arch at the west end, and one bus (one mesh, its
//     windows lit by an emissive map; roofslife.js drives it);
//   * the far town: the roofs carrying on into the haze, one unlit,
//     vertex-coloured, noCast mesh (builder.horizonBand's pattern: top-level,
//     never merged, faded by the fog), dark against the evening, with its
//     own lights and landmarks (beauty pass, Task A);
//   * the sky glow: one additive band low round the sky, warm toward the sun
//     at sunset and rose at dusk (roofslife.js colours it);
//   * the garden (discovery A), the skylight over the lamp-lit attic (D) and
//     the warm chimney's cowl (F).
// THE EVENING is roofslife.js: the record's `life`.
//
// THE BIRDS' PERCHES (Rooftops step 3): while drawing, the pot tops (the warm
// chimney's cowl top on its pot), the aerials' booms, the parapets' copings
// every 3 m (not over a street), tower-1's ring corners, the washing posts'
// T-bars and the yard walls' copings are pushed as drawn spots, `{ id, kind,
// x, y, z }` with roofsflock.js's DRAWN_ID ids; with the plan's own they are
// the record's `birdPerches` (roofsflock.js flockPerches), less the pots that
// smoke (roofsplan.js SMOKE_POTS) and anything in their smoke (roofsflock.js
// SMOKE_CLEAR). Data only: no mesh.
//
// THE WIND (Rooftops step 3, Task 5; roofsair.js): the vane points where it is
// from (roofsplan.js ROOFS_WIND). The cloth material is the washing's sway
// shader (record.washSway, its uniforms; the life sets its clock), and every
// piece in a `cloth` bucket carries aSway: its drop under its line on the
// line's downwind side for each thing hanging, zeros for the bicycle's tyres.
// The record's `potTops` are every pot's top and `smokePots` the three that
// smoke, for the life's smoke. No mesh: the build's counts are unchanged.
//
// THE BACK YARDS' WALLS are the plan's raised ground (roofsplan.js YARD_WALLS),
// drawn inside it: one mesh, userData.yardWalls.
//
// THE CHIMNEY STACKS are drawn inside what the ground lets them cover: their
// own disc, the void under the slates, or ground as high as their top. A
// stack is four quarters, each as long across the ridge as that allows and
// narrowed to a square inside the disc where a flat roof or the west garden
// lies beside it (stack-0, stack-5, stack--10, stack-20, stack--30); a quarter beside
// ground lower than the eaves goes down to it (stack--30's breast on the
// gable end).
// =============================================================================

const BLOCK = Object.fromEntries(BLOCKS.map((k) => [k.id, k]));
const STACKS = BLOCKS.filter((k) => k.id.startsWith('stack-'));
const BUNKERS = BLOCKS.filter((k) => k.id.startsWith('bunker-'));
const TERRACE = BLOCK.terrace;
const HOUSE_W = 5;
const houseX0 = (k) => TERRACE.x0 + HOUSE_W * (k - 1);
const extOf = (k) => BLOCK[`ext-${k}`];
const outOf = (k) => BLOCK[`out-${k}`];

// The terrace's section: eaves at EAVE_Y on z 3 and 12, the ridge at RIDGE on
// STACK_Z. The slates overhang the walls by EAVE_OVER.
const EAVE_Y = 6.45;
const EAVE_OVER = 0.15;
const RIDGE_Z = TERRACE.ridgeZ;
const PITCH = (L.RIDGE - EAVE_Y) / (TERRACE.z1 - RIDGE_Z); // rise per metre
const STACK = Object.freeze({ half: 0.85, inner: 0.42, pot: 0.55 }); // half its length across the ridge, a square's half inside the disc (r 0.6), its pots' offset
const slopeY = (z) => (z >= RIDGE_Z ? EAVE_Y + (TERRACE.z1 - z) * PITCH : EAVE_Y + (z - TERRACE.z0) * PITCH);

export const ROOFS_GROUND_COLOR = 0x7d7873; // the alley's cobbles, for groundBounce
// Beauty pass, Task D (critique findings 8 and 9): the doors' paints muted 20%
// toward their own grey (worn, not toy-bright), and the washing's colours
// softened, faded as washing is: no pure white, no shop-new red or yellow.
const MUTE = 0.2;
const greyOf = (h) => { const g = Math.round(0.299 * (h >> 16) + 0.587 * ((h >> 8) & 255) + 0.114 * (h & 255)); return (g << 16) | (g << 8) | g; };
const PAINTS = Object.freeze([0x2f5d8a, 0x7a2b2b, 0x2f5a3a, 0x2a2a2e, 0xd8c9a0, 0x5a3a6a, 0x9a6a2a, 0x3d6f73].map((h) => mixHex(h, greyOf(h), MUTE)));
const CLOTHS = Object.freeze([0xe6e1d6, 0xb5655d, 0x6c8db5, 0xc9b27a, 0x7fa27c, 0xc99aac, 0xd9d6cf, 0x8f80ad]);
const paint = (x, z, salt) => PAINTS[Math.floor(hash01(x, z, salt) * PAINTS.length) % PAINTS.length];

// --- Beauty pass, Task B: houses that differ (critique finding 3). The
// palette, and each house's look as a pure function of the plan (hash01 of
// its number): four bricks, one house in cream render and one painted pale
// blue, never the same brick twice side by side; slates in three greys, darker
// at the eave than at the ridge; eave boards white or black. The north's
// buildings have their own: the warehouse a darker brick, the corner shop
// painted. What the pass did not touch (the alley's walls, the yard walls)
// keeps the old brick, BRICK.red, and the old slate, SLATE[0].
// Round two, Task E (critique finding 11): the sooty brick a touch warmer and
// lighter (0x6b4739 read as a near-black slab at dusk), the purple-grey slate
// greyer (0x625a6c, with the dusk's purple fill, read clearly purple beside the
// green ones), the shop a deeper painted buff (0xdcc59a was the brightest flat
// block in the card), the warehouse a lighter brick (0x6a3a2c: a sooty slab).
const BRICK = Object.freeze({ red: 0x9a5640, brownRed: 0x7c4434, sooty: 0x76503f, yellow: 0xb39468 });
const BRICKS = Object.freeze([BRICK.red, BRICK.brownRed, BRICK.red, BRICK.sooty, BRICK.yellow, BRICK.brownRed]); // red and brown-red the commonest
const RENDERS = Object.freeze({ cream: 0xe4dac4, blue: 0x8eaac4 });
const SLATE = Object.freeze([0x55606e, 0x5d5a64, 0x58635a]); // blue-grey, grey with a hint of violet, green-grey
const SLATE_SHADE = Object.freeze({ eave: 0.72, ridge: 1.12, edge: 0.62 }); // times the slate, by height
const TRIM = Object.freeze({ white: 0xe9e5da, black: 0x26272b });
const STACK_SOOT = 0.84; // a stack is its house's brick, a little sooty
const NORTH = Object.freeze({ shop: 0xc6a678, warehouse: 0x7a4432, endHouse: BRICK.sooty, endSlates: SLATE[1] });
const RIDGE_TILE = 0x763a2b; // a darker terracotta than the old 0x8e4b38
const DISH = 0xd6d4cc;

const houseAt = (x) => Math.min(12, Math.max(1, Math.floor((x - TERRACE.x0) / HOUSE_W) + 1));
const HOUSE_LOOKS = (() => {
  const cream = 1 + Math.floor(hash01(3.7, 1.9, 71) * 12) % 12;
  let blue = 1 + Math.floor(hash01(5.3, 2.9, 73) * 12) % 12;
  while (Math.abs(blue - cream) < 3) blue = (blue % 12) + 1; // apart, not side by side
  const looks = [];
  let brick = null;
  let slate = -1;
  for (let k = 1; k <= 12; k++) {
    let wall;
    if (k === cream || k === blue) {
      wall = k === cream ? RENDERS.cream : RENDERS.blue;
      brick = null;
    } else {
      let i = Math.floor(hash01(k, 2.3, 43) * BRICKS.length) % BRICKS.length;
      while (BRICKS[i] === brick) i = (i + 1) % BRICKS.length; // never the same brick side by side
      brick = BRICKS[i];
      wall = brick;
    }
    const painted = k === cream || k === blue;
    let j = Math.floor(hash01(k, 8.3, 53) * SLATE.length) % SLATE.length;
    if (j === slate) j = (j + 1) % SLATE.length;
    if (k !== BLOCK.flatHouse.house) slate = j; // the flat house has no slates; its neighbours still differ
    const slateColor = new THREE.Color(SLATE[j]).multiplyScalar(0.94 + 0.12 * hash01(k, 9.7, 59));
    const trim = painted || hash01(k, 5.1, 47) < 0.6 ? TRIM.white : TRIM.black;
    looks.push(Object.freeze({ k, wall, painted, slate: slateColor, trim }));
  }
  return Object.freeze(looks);
})();
const lookOf = (k) => HOUSE_LOOKS[k - 1];
// the brick of a stack on a party wall: its west house's, or its east one's when that one is painted
function stackBrick(s) {
  const [w, e] = [lookOf(houseAt(s.x - 0.01)), lookOf(houseAt(s.x + 0.01))];
  const pick = !w.painted ? w.wall : !e.painted ? e.wall : BRICK.red;
  return new THREE.Color(pick).multiplyScalar(STACK_SOOT);
}
// a house's slates at a height: darker toward the eave, lighter toward the ridge
const SLATE_EAVE_Y = EAVE_Y - EAVE_OVER * PITCH; // the eaves' edge, slopeY(z0 - EAVE_OVER)
const _slate = new THREE.Color();
const slateShade = (k, f = 1) => (x, y) => {
  const t = Math.min(1, Math.max(0, (y - SLATE_EAVE_Y) / (L.RIDGE - SLATE_EAVE_Y)));
  return _slate.copy(lookOf(k).slate).multiplyScalar(f * (SLATE_SHADE.eave + (SLATE_SHADE.ridge - SLATE_SHADE.eave) * t));
};

export { ALLEY_CRATES }; // the plan's, for Task 8's perches

// ---------------------------------------------------------------------------
// Geometry: every piece is a fresh, non-indexed BufferGeometry in world
// space with position, normal and uv (and a colour for the painted kit).
// ---------------------------------------------------------------------------

const KEEP = new Set(['position', 'normal', 'uv']);

// UVs in tiles of `tile` metres, projected along the face's main axis, so a
// merged wall of any length shows bricks (or slates, or cobbles) at one size.
function worldUV(g, tile) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, u / tile, v / tile);
  }
  uv.needsUpdate = true;
}

function prep(geo, { color = null, tile = 0 } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!KEEP.has(k)) g.deleteAttribute(k);
  g.morphAttributes = {};
  g.clearGroups();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (tile) worldUV(g, tile);
  if (color !== null) {
    // a colour (hex or THREE.Color), or a function (x, y, z) -> THREE.Color of each vertex
    const fixed = typeof color === 'function' ? null : new THREE.Color(color);
    const p = g.attributes.position;
    const n = p.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const c = fixed ?? color(p.getX(i), p.getY(i), p.getZ(i));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  return g;
}

// A copy of a (possibly shared) geometry, moved by `matrix`.
const bake = (geo, matrix) => (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(matrix);

function box(x0, x1, y0, y1, z0, z1) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

// A box turned `yaw` about its own centre (x, z), from y0 up by h.
function turnedBox(x, z, y0, w, h, d, yaw) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  g.rotateY(yaw);
  g.translate(x, y0, z);
  return g;
}

// A vertical cylinder at (x, z) from y0 up by h.
function post(x, z, y0, h, rTop, rBot = rTop, seg = 8) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  g.translate(x, y0 + h / 2, z);
  return g;
}

// Made at first use: an Object3D draws a UUID from Math.random, and importing the Rooftops must draw nothing.
let _o = null;
// The matrix that lays a thing made along +x from a to b ({ x, y, z }).
function along(a, c) {
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const dz = c.z - a.z;
  const h = Math.hypot(dx, dz);
  const o = (_o ??= new THREE.Object3D());
  o.position.set((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2);
  o.rotation.set(0, -Math.atan2(dz, dx), Math.atan2(dy, h));
  o.scale.set(1, 1, 1);
  o.updateMatrix();
  return { matrix: o.matrix.clone(), len: Math.hypot(h, dy) };
}
// A board from a to b, its top on the line between them.
function beam(a, c, width, thick) {
  const { matrix, len } = along(a, c);
  const g = new THREE.BoxGeometry(len, thick, width);
  g.translate(0, -thick / 2, 0);
  return g.applyMatrix4(matrix);
}
// A round bar from a to b, centred on the line.
function rod(a, c, r, seg = 6) {
  const { matrix, len } = along(a, c);
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.rotateZ(-Math.PI / 2);
  return g.applyMatrix4(matrix);
}

// A thin open wire from a to b (an aerial's rods): three sides, no caps.
function wire(a, c, r) {
  const { matrix, len } = along(a, c);
  const g = new THREE.CylinderGeometry(r, r, len, 3, 1, true);
  g.rotateZ(-Math.PI / 2);
  return g.applyMatrix4(matrix);
}
// One face of a wall: x0..x1 by y0..y1 at z, facing +z (nz 1) or -z (nz -1).
function faceZ(x0, x1, y0, y1, z, nz) {
  const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
  if (nz < 0) g.rotateY(Math.PI);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
  return g;
}
// z0..z1 by y0..y1 at x, facing +x (nx 1) or -x (nx -1).
function faceX(z0, z1, y0, y1, x, nx) {
  const g = new THREE.PlaneGeometry(z1 - z0, y1 - y0);
  g.rotateY((nx * Math.PI) / 2);
  g.translate(x, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}
// x0..x1 by z0..z1 at y, facing down (a soffit).
function faceDown(x0, x1, z0, z1, y) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  return g;
}

function triangles(list) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(list.flat(), 3));
  g.computeVertexNormals();
  return g;
}
const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
// Two triangles a b c d, wound to face `want`.
function quadTris(a, c, d, e, want) {
  const n = cross(sub(c, a), sub(d, a));
  return dot(n, want) >= 0 ? [a, c, d, a, d, e] : [a, d, c, a, e, d];
}
// A convex polygon in the (z, y) plane, extruded along x from x0 to x1.
function extrudeX(poly, x0, x1) {
  const tris = [];
  const cz = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  const at = (x, p) => [x, p[1], p[0]];
  for (let i = 1; i + 1 < poly.length; i++) {
    for (const [x, sx] of [[x0, -1], [x1, 1]]) {
      const a = at(x, poly[0]); const c = at(x, poly[i]); const d = at(x, poly[i + 1]);
      const n = cross(sub(c, a), sub(d, a));
      tris.push(...(n[0] * sx >= 0 ? [a, c, d] : [a, d, c]));
    }
  }
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const want = [0, (p[1] + q[1]) / 2 - cy, (p[0] + q[0]) / 2 - cz];
    tris.push(...quadTris(at(x0, p), at(x1, p), at(x1, q), at(x0, q), want));
  }
  return triangles(tris);
}

// A flat frame round the rectangle x0..x1 by z0..z1, `t` wide, from y0 up to y1:
// its top, its outer and its inner sides (24 triangles, the middle open).
function frameRing(x0, x1, z0, z1, t, y0, y1) {
  const inner = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const outer = [[x0 - t, z0 - t], [x1 + t, z0 - t], [x1 + t, z1 + t], [x0 - t, z1 + t]];
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const tris = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const [a, c, d, e] = [inner[i], inner[j], outer[j], outer[i]];
    tris.push(...quadTris([a[0], y1, a[1]], [c[0], y1, c[1]], [d[0], y1, d[1]], [e[0], y1, e[1]], [0, 1, 0]));
    const out = [(outer[i][0] + outer[j][0]) / 2 - cx, 0, (outer[i][1] + outer[j][1]) / 2 - cz];
    tris.push(...quadTris([e[0], y0, e[1]], [d[0], y0, d[1]], [d[0], y1, d[1]], [e[0], y1, e[1]], out));
    tris.push(...quadTris([a[0], y0, a[1]], [c[0], y0, c[1]], [c[0], y1, c[1]], [a[0], y1, a[1]], out.map((q) => -q)));
  }
  return triangles(tris);
}

// ---------------------------------------------------------------------------
// The kit: pieces gathered by bucket, one merged mesh per bucket.
// ---------------------------------------------------------------------------

function finish(mesh, noCast) {
  mesh.castShadow = !noCast;
  mesh.receiveShadow = true;
  if (noCast) mesh.userData.noCast = true;
  return mesh;
}

function merged(geos, name) {
  const g = geos.length === 1 ? geos[0] : mergeGeometries(geos);
  if (!g) throw new Error(`roofs: could not merge ${name}`);
  return g;
}

const STILL = Object.freeze({ lineY: 0, nx: 0, nz: 0, phase: 0 }); // a piece on the washing's material that never sways
const washPhase = (x, z) => hash01(x, z, 53) * Math.PI * 2;

function makeKit(prefix) {
  const buckets = new Map();
  return {
    // `mark`, if given ({ id, kind }), records the vertices this piece adds
    // `item`, if given ({ id, kind, ... }), likewise into userData.itemRanges
    // (the washing: each thing on a line, for the tests)
    // `sway`, if given ({ lineY, nx, nz, phase }), is a thing on a line's
    // (roofsair.js swayAttribute); every piece on the washing's material
    // carries aSway, still (zeros) where none is given
    put(key, mat, geo, { noCast = false, color = null, tile = 0, mark = null, item = null, sway = null } = {}) {
      const full = noCast ? `${key}` : `${key}:cast`;
      let k = buckets.get(full);
      if (!k) buckets.set(full, (k = { key, mat, noCast, geos: [], count: 0, ranges: [], items: [] }));
      const g = prep(geo, { color: color ?? mat.userData.vcBase ?? null, tile });
      if (mat.userData.wash) swayAttribute(g, sway ?? STILL);
      const count = g.attributes.position.count;
      if (mark) k.ranges.push({ ...mark, start: k.count, count });
      if (item) k.items.push({ ...item, start: k.count, count });
      const start = k.count;
      k.count += count;
      k.geos.push(g);
      return { bucket: full, start, count };
    },
    meshes() {
      return [...buckets.values()].map((k) => {
        const m = finish(new THREE.Mesh(merged(k.geos, k.key), k.mat), k.noCast);
        m.name = `${prefix}:${k.key}`;
        if (k.ranges.length) m.userData.markRanges = k.ranges;
        if (k.items.length) m.userData.itemRanges = k.items;
        return m;
      });
    },
  };
}

// One mesh of its own, from pieces, tagged for the tests.
function own(name, mat, pieces, { noCast = false, color = null, tile = 0, tag = {} } = {}) {
  const geos = pieces.map((p) => prep(p.geo ?? p, { color: p.color ?? color ?? mat.userData.vcBase ?? null, tile }));
  const m = finish(new THREE.Mesh(merged(geos, name), mat), noCast);
  m.name = name;
  Object.assign(m.userData, tag);
  return m;
}

// ---------------------------------------------------------------------------
// Materials: the kit's (roofsparts.js), plus the textured walls, roofs and
// ground, made once per build.
// ---------------------------------------------------------------------------

// A vertex-coloured material whose pieces are `base` unless given a colour.
function tinted(mat, base) {
  mat.userData.vcBase = base;
  return mat;
}

function washing(mat) {
  makeWashMaterial(mat);
  return mat;
}

function buildMaterials() {
  const M = roofsMaterials();
  const tiled = (color, surface, extra = {}) => litMaterial(color, { surface, repeat: [1, 1], ...extra });
  return {
    ...M,
    // vertex-coloured (beauty pass, Task B): each piece carries its own brick
    // or slate (HOUSE_LOOKS); a piece given none is the colour these always were
    wall: tinted(tiled(0xffffff, 'brick', { vertexColors: true }), BRICK.red),
    slates: tinted(tiled(0xffffff, 'shingle', { vertexColors: true }), SLATE[0]),
    felt: tiled(0x5a5752, 'gravel'),
    cobble: tiled(ROOFS_GROUND_COLOR, 'cobble'),
    flags: tiled(0x958f85, 'flagstone'),
    grass: tiled(0x5c8748, 'grass'),
    shed: tiled(0x6e5a40, 'wood'),
    // vertex-coloured (beauty pass, Task C): the tower's sandstone, dressings and
    // verdigris (TOWER); every other stone piece is the colour it always was
    stone: tinted(litMaterial(0xffffff, { roughness: 0.9, vertexColors: true }), 0xcdc4b2),
    iron: litMaterial(0x2b2e33, { roughness: 0.5 }),
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 }),
    // the washing sways in the wind (roofsair.js: its shader patch, its uniforms on userData.wash)
    cloth: washing(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide })),
    // part two
    road: tiled(0x3a3b40, 'gravel'),
    pavement: tiled(0x8a847a, 'flagstone'),
    gold: new THREE.MeshStandardMaterial({ color: 0xc9a043, roughness: 0.35, metalness: 0.7, emissive: 0x3a2a08 }),
    // lit from inside: the clock's faces and the garden's bulbs (no real lights)
    // (Task C: brighter, 1.25 -> 1.9, so from the alley the faces read as two lit dots)
    clock: new THREE.MeshStandardMaterial({ color: 0xfff1d0, roughness: 0.6, metalness: 0, emissive: 0xffd890, emissiveIntensity: 1.9 }),
    // (round two, Task E, critique finding 7: warmer and less blown, 0xfff0c0 / 0xffc860 x 2.2
    // tone-mapped to white hexagons)
    bulbs: new THREE.MeshStandardMaterial({ color: 0xffc88a, roughness: 0.5, metalness: 0, emissive: 0xff8a30, emissiveIntensity: 1.5 }),
  };
}

const TILE = Object.fromEntries(['brick', 'shingle', 'gravel', 'cobble', 'flagstone', 'grass', 'wood'].map((s) => [s, tileMetres(s) || 1]));

// A window cell that is always lit warm and plain, nothing standing in it (the
// lantern, the roof lights, the skylight, the shop).
const warmCell = (x, z) => PLAIN_WARM[Math.floor(hash01(x, z, 23) * PLAIN_WARM.length) % PLAIN_WARM.length];

// ---------------------------------------------------------------------------
// The build
// ---------------------------------------------------------------------------

// Beauty pass, Task A: a warmer sunset; the dusk top a touch lighter, never near black.
// Round two, Task E (critique finding 8): the dusk horizon a touch darker and
// less red (0x8a5a6a stood as a salmon strip over the seam), the sunset's a
// deeper orange (0xf0a46c was near white: the roofline lost its silhouette).
const SKY_SUNSET = Object.freeze({ top: 0x55609a, horizon: 0xe8925a });
const SKY_DUSK = Object.freeze({ top: 0x24305c, horizon: 0x765266 });

export function build(scene, { water, wind } = {}) { // eslint-disable-line no-unused-vars
  const plan = roofsArea();
  const { ground, traversal } = plan;
  return withLocalUuids('roofs-models', () => {
    b.applySky(scene, SKY_SUNSET.top, SKY_SUNSET.horizon);
    const M = buildMaterials();
    const windows = [];
    const win = (x, y, z, nx, nz, w, h, cell = windowCell(x, z, windows.length)) => windows.push({ x, y, z, nx, nz, w, h, cell });
    const skyWindows = []; // flush, facing up: roof lights and the skylight
    const upWin = (x, y, z, w, d, cell) => skyWindows.push({ x, y, z, w, d, cell });

    drawGround(scene, M);
    const alley = new THREE.Group();
    alley.name = 'roofsAlley';
    const AK = makeKit('roofsAlley');
    drawAlley(AK, alley, M, ground);
    const drawn = []; // the birds' drawn perches (the header)
    drawYards(AK, alley, M, drawn);
    for (const m of AK.meshes()) alley.add(m);
    const terrace = new THREE.Group();
    terrace.name = 'roofsTerrace';
    drawTerrace(terrace, M, win, ground, drawn);
    const sleepers = drawSleepers(terrace);
    const moves = new THREE.Group();
    moves.name = 'roofsMoves';
    drawCrossings(moves, M);
    const markGlow = drawMarks(moves, M, traversal, ground);

    // part two: the north, the tower, the discoveries, the street, the town
    const north = new THREE.Group();
    north.name = 'roofsNorth';
    const NK = makeKit('roofsNorth');
    drawShop(NK, north, M, win, ground, drawn);
    drawWarehouse(NK, north, M, win, upWin, ground, drawn);
    const clockHands = [];
    const vane = drawTower(NK, north, M, scene, drawn, clockHands);
    drawDiscoveries(NK, north, M, upWin);
    for (const m of NK.meshes()) north.add(m);
    const street = new THREE.Group();
    street.name = 'roofsStreet';
    const bus = drawStreet(scene, street, M, win);
    drawTown(scene);
    const skyGlow = drawSkyGlow(scene);

    // every window of the place: one mesh on the one atlas
    const panes = new THREE.Mesh(mergeGeometries([addWindowQuads(windows).geometry, upQuads(skyWindows)]), M.windows);
    panes.name = 'roofsWindows';
    terrace.add(finish(panes, true));

    const lamp = b.lampPost(ALLEY_LAMP.x, ALLEY_LAMP.z);
    lamp.name = 'roofsAlleyLamp';
    scene.add(alley, terrace, moves, north, street, lamp);
    drawLampHalos(scene); // round two, Task G: round every globe now in the scene
    const potTops = Object.freeze(Object.fromEntries(drawn.filter((d) => d.kind === 'pot').map((d) => [d.id, Object.freeze({ x: d.x, y: d.y, z: d.z })])));

    const record = {
      name: 'The Rooftops',
      colliders: ROOFS_COLLIDERS.map((c) => ({ ...c })),
      bounds: { ...ROOFS_BOUNDS },
      spawn: { x: ROOFS_SPAWN.x, z: ROOFS_SPAWN.z },
      boxes: [],
      waters: [],
      waterFx: [],
      // the plan's (roofsplan.js), as roofsArea() gives them
      pois: plan.pois.map((p) => ({ ...p })), // 13, all walked to from the spawn (R5)
      collectibles: plan.collectibles.map((c) => ({ ...c })),
      scenics: plan.scenics.map((c) => ({ ...c })),
      critterSpawns: [], // the birds, below: one critter each, at its home (step 3)
      moments: [],
      puddles: [],
      groundBounce: ROOFS_GROUND_COLOR,
      skyDusk: { ...SKY_DUSK },
      skySunset: { ...SKY_SUNSET },
      duskLight: { fogNear: 40, fogFar: 140 }, // the haze; the rest at render/dusk.js's defaults
      tippables: [],
      perches: plan.perches.map((p) => ({ ...p })),
      ground,
      traversal: plan.traversal, // the moves (src/traversal.js), from the plan
      anchors: { discoveries: ROOFS_DISCOVERIES },
      // the tower's hands, redrawn in place at the real time (clockhands.js; the life calls it)
      clockTower: clockTower(north, clockHands),
      // the weathervane's own mesh: the tower view fades it (roofsmoments.js)
      vane,
      evening: true,
      strays: false,
      bus,
      skyGlow, // the band low round the sky; roofslife.js colours it
      markGlow, // the take-off glows; roofslife.js sets their opacity (Task D)
      // the lit-from-inside materials, each at its built brightness (userData.glowBase);
      // roofslife.js brings them up as the evening deepens (step 5, Task 8)
      eveningLights: eveningLights(M),
      // where the birds perch: the plan's spots and the drawn ones (step 3),
      // less the pots that smoke and anything in their smoke (SMOKE_CLEAR)
      birdPerches: flockPerches({ traversal: ROOFS_TRAVERSAL, ground, drawn, smoking: SMOKE_POTS }),
      // every chimney pot's top, and the three that smoke (roofsair.js; the life makes the smoke)
      potTops,
      smokePots: SMOKE_POTS.map((id) => {
        if (!potTops[id]) throw new Error(`roofs: no pot ${id} to smoke`);
        return Object.freeze({ id, ...potTops[id] });
      }),
      // the washing's sway (roofsair.js): the cloth material's uniforms; the life sets its clock
      washSway: M.cloth.userData.wash,
      // the two house cats asleep on their sills (S1): scenery, which only the life breathes
      sleepers,
    };
    // the fourteen birds as the walk's critters (tag, the bell, a meow, the
    // journal: critters.js), each at its home; the life flies them
    record.critterSpawns = roofsCritterSpawns(ROOFS_BIRDS, perchIndex(record.birdPerches));
    // the evening deepening over the walk, and the bus (roofslife.js)
    record.life = createRoofsLife(record);
    return record;
  });
}

// The tower's clock hands: redraw(minutes) rewrites each hand's vertices in the
// kit's merged paint mesh (same count, same order: no triangle is added).
function clockTower(group, hands) {
  const mesh = group.children.find((m) => m.name === `roofsNorth:${hands[0].bucket}`);
  if (!mesh) throw new Error('roofs: no mesh for the clock hands');
  return Object.freeze({
    focus: hands.focus,
    redraw(minutes) {
      const a = handAngles(minutes);
      const pos = mesh.geometry.attributes.position;
      const nor = mesh.geometry.attributes.normal;
      for (const h of hands) {
        const g = prep(h.make(h.which === 'hour' ? a.hour : a.minute));
        const p = g.attributes.position;
        const n = g.attributes.normal;
        if (p.count !== h.count) throw new Error('roofs: a clock hand changed size');
        for (let i = 0; i < p.count; i++) {
          pos.setXYZ(h.start + i, p.getX(i), p.getY(i), p.getZ(i));
          nor.setXYZ(h.start + i, n.getX(i), n.getY(i), n.getZ(i));
        }
        g.dispose();
      }
      pos.needsUpdate = true;
      nor.needsUpdate = true;
    },
  });
}

// The windows', clock faces' and garden bulbs' own materials, each noting the
// brightness it was built at, so the life scales from it and never compounds.
function eveningLights(M) {
  const lights = { windows: M.windows, clock: M.clock, bulbs: M.bulbs };
  for (const m of Object.values(lights)) m.userData.glowBase = m.emissiveIntensity;
  return lights;
}

// ---------------------------------------------------------------------------
// Round two, Task F (critique finding 5): the felt she walks most was an empty
// grey plain with hard box corners. On every felt roof she walks, a few repair
// patches; on the extensions, the outriggers and the garages a dark drip edge
// down the felt's outer faces; on the warehouse, lead flashing at the
// parapets' feet and four rainwater outlets, each with its stain. Drawing only,
// in the noCast paint bucket of the kit that owns the roof: the flat pieces lie
// FELT.*Y up (under the pawprints' 0.012 and the glows' 0.03), clear of every
// take-off by FELT.clear; the drip edges are on vertical faces, never on top.
// ---------------------------------------------------------------------------
const FELT = Object.freeze({
  stainY: 0.006, patchY: 0.008, flashY: 0.009, outletY: 0.011,
  clear: 0.6, // m from every take-off (its glow is 0.45 across)
  // Task G (Task F's review): the dark patches a little lighter (0x3a3936 read
  // as holes in the felt), and fewer of them than the light ones (patchDarkShare, it was 0.6)
  patchR: Object.freeze([0.25, 0.5]), patchDark: 0x45433f, patchLight: 0x57544e, patchDarkShare: 0.4,
  drip: Object.freeze({ h: 0.05, out: 0.008, color: 0x1c1d20 }),
  flash: Object.freeze({ w: 0.16, in: 0.005, color: 0x5d6368 }),
  outlet: Object.freeze({ r: 0.1, in: 0.24, color: 0x121315 }),
  stain: Object.freeze({ r: 0.55, wide: 0.6, color: 0x242321 }),
});
// how many patches each roof gets (by its id, or its kind's prefix)
const FELT_PATCHES = Object.freeze({ garages: 3, shed: 1, ext: 3, out: 1, flatHouse: 2, dormer: 1, cornerShop: 3, warehouse: 12 });
// and their size, times FELT.patchR, on the two big roofs
const FELT_PATCH_SIZE = Object.freeze({ cornerShop: 1.3, warehouse: 1.7 });
const TAKEOFFS = Object.freeze([...ROOFS_TRAVERSAL.gaps, ...ROOFS_TRAVERSAL.climbs, ...ROOFS_TRAVERSAL.drops].map((h) => {
  const len = Math.hypot(h.to.x - h.from.x, h.to.z - h.from.z) || 1;
  return Object.freeze({ x: h.from.x, z: h.from.z, ux: (h.to.x - h.from.x) / len, uz: (h.to.z - h.from.z) / len });
}));
// What a patch keeps clear of ({ x, z, r }): every take-off (and its first
// metre ahead, where a mark may lie at the edge), the crossings' rails, the
// colliders, the perches and the discoveries.
const FELT_KEEP_OUT = Object.freeze((() => {
  const out = [];
  for (const t of TAKEOFFS) {
    out.push({ x: t.x, z: t.z, r: FELT.clear });
    for (const s of [0.4, 0.7, 1.0]) out.push({ x: t.x + t.ux * s, z: t.z + t.uz * s, r: 0.4 });
  }
  for (const c of ROOFS_TRAVERSAL.crossings) {
    for (let i = 0; i + 1 < c.points.length; i++) {
      const [a, q] = [c.points[i], c.points[i + 1]];
      const n = Math.max(1, Math.ceil(Math.hypot(q.x - a.x, q.z - a.z) / 0.25));
      for (let k = 0; k <= n; k++) out.push({ x: a.x + ((q.x - a.x) * k) / n, z: a.z + ((q.z - a.z) * k) / n, r: 0.35 });
    }
  }
  for (const c of ROOFS_COLLIDERS) out.push({ x: c.x, z: c.z, r: c.r + 0.3 });
  for (const p of ROOFS_PERCHES) out.push({ x: p.x, z: p.z, r: 0.6 });
  for (const d of Object.values(ROOFS_DISCOVERIES)) out.push({ x: d.x, z: d.z, r: 1.2 });
  return out;
})());
// Whether a disc (x, z, r) lies on the roof at y alone (nothing else's ground
// within it) and clear of `avoid`.
function feltClear(ground, y, x, z, r, avoid) {
  if (avoid.some((k) => Math.hypot(k.x - x, k.z - z) < k.r + r)) return false;
  for (let gx = -r; gx <= r + 1e-9; gx += 0.1) {
    for (let gz = -r; gz <= r + 1e-9; gz += 0.1) {
      if (gx * gx + gz * gz <= r * r && Math.abs(ground.y(x + gx, z + gz) - y) > 1e-6) return false;
    }
  }
  return true;
}
// A flat convex polygon facing up: n corners on an ellipse (rx, rz, turned
// `turn`) round (x, z), at y, a little off even spacing (hash01 of `seed`).
function feltPolygon(x, z, y, n, rx, rz, turn, seed) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = ((k + 0.7 * (hash01(seed, k, 71) - 0.5)) / n) * 2 * Math.PI;
    const [u, v] = [rx * Math.cos(a), rz * Math.sin(a)];
    pts.push([x + u * Math.cos(turn) - v * Math.sin(turn), y, z + u * Math.sin(turn) + v * Math.cos(turn)]);
  }
  const tris = [];
  for (let k = 1; k + 1 < n; k++) {
    const t = [pts[0], pts[k], pts[k + 1]];
    tris.push(...(cross(sub(t[1], t[0]), sub(t[2], t[0]))[1] >= 0 ? t : [t[0], t[2], t[1]]));
  }
  return triangles(tris);
}
// A roof's repair patches: its count of FELT_PATCHES, spread over it (the roof
// cut into that many cells, one patch tried in each), placed by hash01 where
// each is clear (feltClear, 0.15 m round it) and apart from the others; a
// shade darker or lighter than the felt. `put(geo, color, item)`.
function feltPatches(put, roof, ground, extra = []) {
  const want = FELT_PATCHES[roof.id] ?? FELT_PATCHES[roof.id.split('-')[0]] ?? 0;
  if (!want) return;
  const avoid = [...FELT_KEEP_OUT, ...extra];
  const size = FELT_PATCH_SIZE[roof.id] ?? 1;
  const [W, D] = [roof.x1 - roof.x0, roof.z1 - roof.z0];
  const cols = Math.max(1, Math.min(want, Math.round(Math.sqrt((want * W) / D))));
  const rows = Math.ceil(want / cols);
  const placed = [];
  for (let c = 0; c < cols * rows && placed.length < want; c++) {
    const [cx0, cz0] = [roof.x0 + (W * (c % cols)) / cols, roof.z0 + (D * Math.floor(c / cols)) / rows];
    for (let j = 0; j < 24; j++) {
      const seed = roof.x0 + roof.z0 + 7 * c;
      const r = size * (FELT.patchR[0] + (FELT.patchR[1] - FELT.patchR[0]) * hash01(j, seed, 61));
      const m = r + 0.15;
      const x = Math.min(roof.x1 - m, Math.max(roof.x0 + m, cx0 + (W / cols) * hash01(seed, j, 63)));
      const z = Math.min(roof.z1 - m, Math.max(roof.z0 + m, cz0 + (D / rows) * hash01(j, seed, 67)));
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r + 0.3) || !feltClear(ground, roof.y, x, z, m, avoid)) continue;
      placed.push({ x, z, r });
      const at = x * 3.1 + z;
      const n = 4 + Math.floor(3 * hash01(at, 1, 73));
      const color = hash01(at, 2, 79) < FELT.patchDarkShare ? FELT.patchDark : FELT.patchLight;
      put(feltPolygon(x, z, roof.y + FELT.patchY, n, r, r * (0.55 + 0.4 * hash01(at, 3, 83)), Math.PI * hash01(at, 4, 89), at), color, { id: `feltPatch:${roof.id}:${placed.length}`, kind: 'feltPatch', roof: roof.id });
      break;
    }
  }
}
// The dark drip edge down the top FELT.drip.h of a felt roof's outer vertical
// faces: `faces` is { x0, x1, z0, z1 }, each true or the [from, to] of it to
// trim (along z for x0 / x1, along x for z0 / z1). Just outside the felt.
function dripEdges(put, roof, faces) {
  const D = FELT.drip;
  const [y0, y1, o] = [roof.y - D.h, roof.y, D.out];
  const span = (f, a, c) => (f === true ? [a - o, c + o] : f);
  const item = { id: `dripEdge:${roof.id}`, kind: 'dripEdge', roof: roof.id };
  if (faces.x0) put(faceX(...span(faces.x0, roof.z0, roof.z1), y0, y1, roof.x0 - o, -1), D.color, item);
  if (faces.x1) put(faceX(...span(faces.x1, roof.z0, roof.z1), y0, y1, roof.x1 + o, 1), D.color, item);
  if (faces.z0) put(faceZ(...span(faces.z0, roof.x0, roof.x1), y0, y1, roof.z0 - o, -1), D.color, item);
  if (faces.z1) put(faceZ(...span(faces.z1, roof.x0, roof.x1), y0, y1, roof.z1 + o, 1), D.color, item);
}

const CHANNEL_Y = 0.012;
// Round two, Task F (critique finding 6): the cobbles' tile in the alley, the
// shop yard and the ginnel, 1.6 times smaller than the house tile (TILE.cobble,
// 1.2 m, whose stones are pillows bigger than her head at cat height), so the
// setts are small stones. The shared texture and every other place are unchanged.
const SETT_TILE = 0.75;
// --- the ground at 0: cobbles in the alley, flags in the yards, grass in the
// west garden. Top-level, as builder.ground is, and casting nothing.
function drawGround(scene, M) {
  const looks = {
    alley: ['cobble', M.cobble, SETT_TILE], shopYard: ['cobble', M.cobble, SETT_TILE], ginnel: ['cobble', M.cobble, SETT_TILE],
    backYards: ['flags', M.flags, TILE.flagstone], westGarden: ['grass', M.grass, TILE.grass],
  };
  const kit = new Map();
  for (const g of GROUNDS) {
    const [key, mat, tile] = looks[g.id];
    const plane = new THREE.PlaneGeometry(g.x1 - g.x0, g.z1 - g.z0);
    plane.rotateX(-Math.PI / 2);
    plane.translate((g.x0 + g.x1) / 2, g.y, (g.z0 + g.z1) / 2);
    if (!kit.has(key)) kit.set(key, { mat, geos: [] });
    kit.get(key).geos.push(prep(plane, { tile }));
  }
  // Task D: a flagstone drainage channel down the alley's middle, flush on the
  // cobbles (1.2 cm up), in the yards' flags: drawn only, the ground is the plan's
  const C = ALLEY_CHANNEL;
  const channel = new THREE.PlaneGeometry(C.x1 - C.x0, 2 * C.half);
  channel.rotateX(-Math.PI / 2);
  channel.translate((C.x0 + C.x1) / 2, CHANNEL_Y, C.z);
  kit.get('flags').geos.push(prep(channel, { tile: TILE.flagstone }));
  for (const [key, k] of kit) {
    const m = finish(new THREE.Mesh(merged(k.geos, key), k.mat), true);
    m.name = `roofsGround:${key}`;
    m.userData.ground = true;
    scene.add(m);
  }
}

// The shed's fascia (m): how far below its top it reaches, how far below
// the top it stops (the felt shows above it), how far out it sits (the felt
// overhangs 0.08) and how thick it is.
const SHED_FASCIA = Object.freeze({ depth: 0.18, below: 0.03, out: 0.065, thick: 0.02 });

// --- the alley: its walls, the garages, the shed, the bins, the crates, the
// bin bags, a drainpipe and the fire escape.
function drawAlley(K, group, M, ground) {
  const wall = (geo) => K.put('wall', M.wall, geo, { tile: TILE.brick });
  const stone = (geo, color = null) => K.put('stone', M.stone, geo, { color });
  const iron = (geo, noCast = false) => K.put(noCast ? 'ironSmall' : 'iron', M.iron, geo, { noCast });
  const painted = (geo, color) => K.put('paint', M.paint, geo, { color, noCast: true });
  const { minX, maxX, maxZ } = ROOFS_BOUNDS;

  // The walls round the edge, just outside the bounds, and the garden's wall
  // over the street (it rises from the street below).
  wall(box(minX, maxX, 0, 2.4, maxZ, maxZ + 0.3)); stone(box(minX - 0.05, maxX + 0.05, 2.4, 2.5, maxZ - 0.05, maxZ + 0.35));
  wall(box(minX - 0.3, minX, 0, 2.0, TERRACE.z0, maxZ + 0.3)); stone(box(minX - 0.35, minX + 0.05, 2.0, 2.1, TERRACE.z0, maxZ + 0.3));
  wall(box(maxX, maxX + 0.3, 0, 2.0, -13, maxZ + 0.3)); stone(box(maxX - 0.05, maxX + 0.35, 2.0, 2.1, -13, maxZ + 0.3));
  const garden = GROUNDS.find((g) => g.id === 'westGarden');
  wall(box(minX - 0.3, garden.x1, L.STREET, 1.0, garden.z0 - 0.3, garden.z0)); stone(box(minX - 0.3, garden.x1, 1.0, 1.1, garden.z0 - 0.35, garden.z0 + 0.05));

  // The garages: a row of lock-ups, felt on top, a door to each.
  const G = BLOCK.garages;
  const gTop = G.y - 0.15;
  wall(box(G.x0, G.x1, 0, gTop, G.z0, G.z1));
  group.add(own('garages', M.felt, [box(G.x0, G.x1, gTop, G.y, G.z0, G.z1)], { tile: TILE.gravel, tag: { block: 'garages' } }));
  const felt = (geo, color, item) => K.put('paint', M.paint, geo, { color, noCast: true, item }); // round two, Task F
  dripEdges(felt, G, { x0: true, x1: true, z0: true, z1: true });
  feltPatches(felt, G, ground);
  stone(box(G.x0, G.x1, gTop - 0.12, gTop - 0.02, G.z1, G.z1 + 0.06)); // the fascia under the felt
  const doors = Math.floor((G.x1 - G.x0) / 3);
  let last = null;
  for (let i = 0; i < doors; i++) {
    const cx = G.x0 + 1.5 + 3 * i;
    // Task D: muted paints (PAINTS), each door weathered its own shade, never
    // the same paint as the door beside it, and ribbed across (an up-and-over door)
    let j = PAINTS.indexOf(paint(cx, G.z1, 3));
    if (PAINTS[j] === last) j = (j + 1) % PAINTS.length;
    last = PAINTS[j];
    const shade = new THREE.Color(last).multiplyScalar(DOOR.dark[0] + (DOOR.dark[1] - DOOR.dark[0]) * hash01(cx, G.z1, 9));
    painted(box(cx - 1.15, cx + 1.15, 0, 2.1, G.z1, G.z1 + 0.04), shade);
    painted(doorRibs(cx - 1.1, cx + 1.1, G.z1 + 0.04), shade);
    stone(box(cx - 1.25, cx + 1.25, 2.1, 2.22, G.z1, G.z1 + 0.05)); // lintel
  }
  // a drainpipe from the garages' gutter at the shed's end
  iron(box(G.x1 - 0.3, G.x1 - 0.2, 0, gTop - 0.05, G.z1 + 0.04, G.z1 + 0.14), true);
  iron(box(G.x1 - 0.38, G.x1 - 0.12, gTop - 0.3, gTop - 0.05, G.z1 + 0.02, G.z1 + 0.2), true); // its hopper head
  // Task D: and one down every second garage's pier, an open square pipe and its hopper
  for (let i = 2; i < doors; i += 2) {
    const x = G.x0 + 3 * i;
    iron(squarePipe(x, G.z1 + 0.09, 0, gTop - 0.05, 0.05), true);
    iron(squarePipe(x, G.z1 + 0.09, gTop - 0.3, gTop - 0.05, 0.1), true);
  }

  // The shed: boards, a felt roof, a green door.
  const S = BLOCK.shed;
  K.put('shed', M.shed, box(S.x0, S.x1, 0, S.y - 0.1, S.z0, S.z1), { tile: TILE.wood });
  group.add(own('shed', M.felt, [box(S.x0, S.x1 + 0.08, S.y - 0.1, S.y, S.z0 - 0.08, S.z1 + 0.08)], { tile: TILE.gravel, tag: { block: 'shed' } }));
  feltPatches(felt, S, ground);
  painted(box(S.x1 - 1.3, S.x1 - 0.45, 0, 1.75, S.z1, S.z1 + 0.04), 0x2f5a3a);
  // a fascia board round the felt in the door's green (Task B), so the roof's
  // edge reads from the alley: inside the felt's own overhang, under its top
  const SF = SHED_FASCIA;
  const [fo, fe, fy0, fy1] = [SF.out, SF.out + SF.thick, S.y - SF.depth, S.y - SF.below];
  painted(box(S.x0, S.x1 + fe, fy0, fy1, S.z1 + fo, S.z1 + fe), 0x2f5a3a); // over the alley
  painted(box(S.x0, S.x1 + fe, fy0, fy1, S.z0 - fe, S.z0 - fo), 0x2f5a3a); // over the yards
  painted(box(S.x1 + fo, S.x1 + fe, fy0, fy1, S.z0 - fe, S.z1 + fe), 0x2f5a3a); // the east end
  iron(box(S.x1 - 0.12, S.x1 - 0.04, 0, S.y - 0.12, S.z1 + 0.02, S.z1 + 0.1), true);

  // The bins: the round one she climbs (bin-1), a dustbin, a wheelie bin.
  const B1 = BLOCK['bin-1'];
  group.add(own('bin-1', M.metal, [post(B1.x, B1.z, 0, B1.y - 0.06, B1.r - 0.05, B1.r - 0.09, 14), post(B1.x, B1.z, B1.y - 0.06, 0.06, B1.r, B1.r, 14)], { noCast: true, tag: { block: 'bin-1' } }));
  const bin2 = BIN_2;
  const bin3 = BIN_3;
  K.put('metal', M.metal, post(bin2.x, bin2.z, 0, 0.8, bin2.r - 0.05, bin2.r - 0.09, 12), { noCast: true });
  K.put('metal', M.metal, post(bin2.x + 0.02, bin2.z, 0.8, 0.05, bin2.r - 0.02, bin2.r - 0.02, 12), { noCast: true });
  painted(turnedBox(bin3.x, bin3.z, 0, 0.58, 0.95, 0.66, 0.1), 0x3b6b3b);
  painted(turnedBox(bin3.x, bin3.z, 0.95, 0.62, 0.05, 0.72, 0.1), 0x2f5730);

  // Task D: what an alley gathers, drawn only (no colliders, clear of every
  // spot she goes to: roofsplan.js ALLEY_CLUTTER), and weeds at the walls' feet.
  drawClutter(K, M);
  // (the weeds and the gully go in the stone bucket, as long as the alley
  // already, so no other bucket's bounds grow to reach shots of other places)
  for (const w of ALLEY_WEEDS) stone(weedTuft(w), weedColour);
  // the channel's gully: a dark line down the flags' middle
  stone(flatStrip(ALLEY_CHANNEL.x0, ALLEY_CHANNEL.x1, ALLEY_CHANNEL.z - 0.07, ALLEY_CHANNEL.z + 0.07, CHANNEL_Y + 0.004), 0x4a4540);

  // The crates (slatted, round two's Task F), and the bin bags she drops onto from the garages.
  for (const c of ALLEY_CRATES) {
    K.put('wood', M.wood, turnedBox(c.x, c.z, c.y, c.s, c.s, c.s, c.yaw), { noCast: true });
    crateSlats(K, M, c);
  }
  drawBinBags(K, M);

  // The fire escape: one iron flight up to a landing at the garages' west end.
  const ST = BLOCK.alleyStair;
  const F = ST.flights[0];
  const LD = ST.landings[0];
  const fx = (F.x0 + F.x1) / 2;
  const fw = F.x1 - F.x0;
  const lo = { x: fx, y: F.y0, z: F.z0 };
  const hi = { x: fx, y: F.y1, z: F.z1 };
  group.add(own('alleyStair', M.iron, [beam(lo, hi, fw, 0.05), box(LD.x0, LD.x1, LD.y - 0.05, LD.y, LD.z0, LD.z1)], { tag: { block: 'alleyStair' } }));
  const run = Math.hypot(F.z1 - F.z0, F.y1 - F.y0);
  const steps = Math.round(run / 0.45);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const p = { x: fx, y: F.y0 + (F.y1 - F.y0) * t + 0.03, z: F.z0 + (F.z1 - F.z0) * t };
    const q = { x: fx, y: p.y + (F.y1 - F.y0) * 0.006, z: p.z + (F.z1 - F.z0) * 0.006 };
    iron(beam(p, q, fw - 0.1, 0.03), true); // the treads' cleats
  }
  for (const x of [F.x0 + 0.03, F.x1 - 0.03]) {
    iron(beam({ x, y: F.y0 + 0.05, z: F.z0 }, { x, y: F.y1 + 0.05, z: F.z1 }, 0.06, 0.28)); // the stringers
    iron(rod({ x, y: F.y0 + 0.9, z: F.z0 }, { x, y: F.y1 + 0.9, z: F.z1 }, 0.025), true); // the handrails
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const y = F.y0 + (F.y1 - F.y0) * t;
      iron(post(x, F.z0 + (F.z1 - F.z0) * t, y, 0.9, 0.018), true);
    }
  }
  iron(rod({ x: LD.x0 + 0.03, y: LD.y + 0.9, z: LD.z1 }, { x: LD.x0 + 0.03, y: LD.y + 0.9, z: LD.z0 }, 0.025), true);
  iron(rod({ x: LD.x0 + 0.03, y: LD.y + 0.9, z: LD.z0 + 0.03 }, { x: LD.x1, y: LD.y + 0.9, z: LD.z0 + 0.03 }, 0.025), true);
  for (const [x, z] of [[LD.x0 + 0.03, LD.z0 + 0.03], [LD.x0 + 0.03, LD.z1], [LD.x1 - 0.1, LD.z0 + 0.03]]) iron(post(x, z, LD.y, 0.9, 0.018), true);
  // the legs: under the landing's corners, and under the flight's middle
  const legs = [[LD.x0 + 0.08, LD.z0 + 0.08], [LD.x0 + 0.08, LD.z1 - 0.08], [LD.x1 - 0.08, LD.z0 + 0.08]].map(([x, z]) => [x, z, LD.y - 0.05]);
  const zm = (F.z0 + F.z1) / 2;
  for (const x of [F.x0 + 0.08, F.x1 - 0.08]) legs.push([x, zm, ground.y(fx, zm) - 0.3]);
  for (const [x, z, top] of legs) iron(box(x - 0.05, x + 0.05, 0, top, z - 0.05, z + 0.05));
}

// --- Round two, Task F (critique finding 4): the bin bags were five glossy
// boulders taller than a cat, and the drop from the garages (garages-bags,
// unchanged) ended with her standing inside them. Now a slumped heap: each
// bag flattened and sunk into the cobbles so its top is BAGS[i].top (the
// middle one, where she lands, the flattest), a knot tied on each (two
// four-sided cones point to point, the neck pinched), black or dark green.
// [dx, dz, r, top]: its middle off BIN_BAGS, its radius, its top's height.
const BAGS = Object.freeze([[-0.4, 0, 0.483, 0.15], [0.345, 0.115, 0.437, 0.14], [0, -0.345, 0.414, 0.13], [0.06, 0.4, 0.38, 0.12], [-0.115, 0.058, 0.345, 0.1]]);
const BAG = Object.freeze({ squash: [0.38, 0.45], knot: Object.freeze({ at: 0.11, sink: 0.012, neck: 0.03, tuft: 0.03, foot: 0.035, top: 0.03 }), black: 0x18191c, green: 0x222e24 });
function drawBinBags(K, M) {
  const B = BAG;
  BAGS.forEach(([dx, dz, r, top], i) => {
    const [cx, cz] = [BIN_BAGS.x + dx, BIN_BAGS.z + dz];
    const sy = B.squash[0] + (B.squash[1] - B.squash[0]) * hash01(i, BIN_BAGS.z, 52);
    const cy = top - r * sy; // its middle, under the cobbles
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.scale(1, sy, 1);
    g.rotateY(i * 1.3);
    g.translate(cx, cy, cz);
    const base = new THREE.Color(hash01(i, BIN_BAGS.x, 53) < 0.3 ? B.green : B.black);
    K.put('paint', M.paint, g, { color: base.multiplyScalar(0.82 + 0.36 * hash01(i, 7, 57)), noCast: true, item: { id: `bag:${i}`, kind: 'bag' } });
    // the knot: on its side away from the heap's middle (the middle bag's, away
    // from where she lands), where its top has fallen to B.knot.at
    const k = B.knot;
    const ky = Math.min(top - 0.01, k.at);
    const d = r * Math.sqrt(Math.max(0, 1 - ((ky - cy) / (r * sy)) ** 2));
    const away = Math.hypot(dx, dz) > 0.2 ? Math.atan2(dz, dx) : Math.atan2(dz, dx) + Math.PI * (hash01(i, 3, 55) - 0.5);
    const [kx, kz] = [cx + d * Math.cos(away), cz + d * Math.sin(away)];
    const foot = ky - k.sink;
    const neck = new THREE.CylinderGeometry(0, k.foot, k.neck, 4, 1, true).translate(kx, foot + k.neck / 2, kz);
    const tuft = new THREE.CylinderGeometry(k.top, 0, k.tuft, 4, 1, true).translate(kx, foot + k.neck + k.tuft / 2, kz);
    K.put('paint', M.paint, mergeGeometries([neck.toNonIndexed(), tuft.toNonIndexed()]), { color: base.clone().multiplyScalar(0.9), noCast: true, item: { id: `bagKnot:${i}`, kind: 'bagKnot' } });
  });
}

// --- Round two, Task F (critique finding 13, its drawing): the crates read
// as plain brown boxes. Two dark gaps between boards across each side face
// and a darker batten up each corner, flush on the faces (a millimetre or two
// proud): the box, its top (the perch, where the knockables stand) and its
// size are as they were. The walk-through is the owner's call (a collider).
const CRATE = Object.freeze({ gaps: Object.freeze([1 / 3, 2 / 3]), gap: 0.022, gapOut: 0.001, gapColor: 0x2a1c10, batten: 0.05, battenOut: 0.002, battenColor: 0x5e4329 });
function crateSlats(K, M, c) {
  const C = CRATE;
  const h = c.s / 2;
  const put = (geo, color, kind) => {
    geo.rotateY(c.yaw);
    geo.translate(c.x, c.y, c.z);
    K.put('paint', M.paint, geo, { color, noCast: true, item: { id: `${kind}:${c.x}`, kind } });
  };
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    // a face's strip from a to b along it (-h..h), y0..y1 up it, `out` proud
    const strip = (a, b, y0, y1, out) => (nx ? faceX(a, b, y0, y1, nx * (h + out), nx) : faceZ(a, b, y0, y1, nz * (h + out), nz));
    for (const f of C.gaps) put(strip(-h, h, c.s * f - C.gap / 2, c.s * f + C.gap / 2, C.gapOut), C.gapColor, 'crateSlat');
    for (const e of [-1, 1]) put(strip(e < 0 ? -h : h - C.batten, e < 0 ? -h + C.batten : h, 0, c.s, C.battenOut), C.battenColor, 'crateBatten');
  }
}

// --- Task D (critique finding 8): the alley lived in.
const DOOR = Object.freeze({ dark: [0.45, 0.72], ribs: [0.55, 1.05, 1.55], rib: 0.03, out: 0.025 });
// Three ribs across an up-and-over door's face (at z), each a bevel up and a
// bevel down standing `out` proud: the light catches the one, not the other.
function doorRibs(x0, x1, z) {
  const tris = [];
  for (const y of DOOR.ribs) {
    const [lo, mid, hi] = [y - DOOR.rib, y, y + DOOR.rib];
    const zo = z + DOOR.out;
    tris.push(...quadTris([x0, hi, z], [x1, hi, z], [x1, mid, zo], [x0, mid, zo], [0, 1, 1]));
    tris.push(...quadTris([x0, mid, zo], [x1, mid, zo], [x1, lo, z], [x0, lo, z], [0, -1, 1]));
  }
  return triangles(tris);
}
// An open square pipe (four sides, faces square to x and z) from y0 to y1.
function squarePipe(x, z, y0, y1, half) {
  const g = new THREE.CylinderGeometry(half * Math.SQRT2, half * Math.SQRT2, y1 - y0, 4, 1, true);
  g.rotateY(Math.PI / 4);
  g.translate(x, (y0 + y1) / 2, z);
  return g;
}
// A flat strip x0..x1 by z0..z1 at y, facing up.
function flatStrip(x0, x1, z0, z1, y) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  return g;
}
// The weeds: a tuft at the foot of a garage pier now and then, and along the
// alley's far wall; each { x, z, h, out } (out: the way it leans, away from its wall).
export const ALLEY_WEEDS = Object.freeze((() => {
  const out = [];
  const G = BLOCK.garages;
  for (let i = 1; i < Math.floor((G.x1 - G.x0) / 3); i++) {
    const x = G.x0 + 3 * i;
    if (hash01(x, G.z1, 41) < 0.3) continue;
    out.push(Object.freeze({ x: x + 0.25 * (hash01(x, G.z1, 43) - 0.5), z: G.z1 + 0.1, h: 0.3 + 0.15 * hash01(x, 1, 45), out: 1 }));
  }
  const wallZ = ROOFS_BOUNDS.maxZ;
  for (let x = -43; x <= 43; x += 4) {
    if (hash01(x, wallZ, 41) < 0.35) continue;
    const at = x + 1.6 * (hash01(x, wallZ, 43) - 0.5);
    if (Math.abs(at - ALLEY_LAMP.x) < 0.6) continue;
    out.push(Object.freeze({ x: at, z: wallZ - 0.1, h: 0.28 + 0.17 * hash01(at, 2, 45), out: -1 }));
  }
  return out;
})());
const WEED = Object.freeze({ base: new THREE.Color(0x34502a), tip: new THREE.Color(0x7f9a4c), y: 0.4, half: 0.045, lean: 0.13 });
const _weed = new THREE.Color();
const weedColour = (x, y) => _weed.copy(WEED.base).lerp(WEED.tip, Math.min(1, y / WEED.y));
// A tuft: three blades fanned out from its foot, leaning away from the wall.
function weedTuft(w) {
  const tris = [];
  for (let k = 0; k < 3; k++) {
    const a = (k - 1) * 0.9 + 0.4 * (hash01(w.x, k, 47) - 0.5); // across the wall, -0.9..0.9 rad off square
    const [dx, dz] = [Math.sin(a), Math.cos(a) * w.out];
    const bx = w.x + 0.04 * dx;
    const bz = w.z + 0.03 * dz;
    const h = w.h * (0.75 + 0.25 * hash01(w.x, k, 49));
    const [hw, ln] = [WEED.half, WEED.lean];
    const blade = [[bx - hw * dz * w.out, 0, bz + hw * dx * w.out], [bx + hw * dz * w.out, 0, bz - hw * dx * w.out], [bx + ln * dx, h, bz + ln * dz]];
    // one-sided: wound to face the way it leans, out into the alley
    const n = cross(sub(blade[1], blade[0]), sub(blade[2], blade[0]));
    tris.push(...(dot(n, [dx, 0, dz]) >= 0 ? blade : [blade[0], blade[2], blade[1]]));
  }
  return triangles(tris);
}
// The bicycle, the pallet and the paint tin under the fire escape (roofsplan.js
// ALLEY_CLUTTER, where her body never reaches them).
function drawClutter(K, M) {
  let item = null; // which piece is being drawn, recorded in the kit's itemRanges for the tests
  const painted = (geo, color) => K.put('paint', M.paint, geo, { color, noCast: true, item });
  const wood = (geo) => K.put('wood', M.wood, geo, { noCast: true, item });
  // the bicycle: u along it (front +), v across it, y up
  item = { id: 'clutter:bike', kind: 'clutter' };
  const B = ALLEY_CLUTTER.bike;
  const [sx, sz] = [-B.az, B.ax];
  const yaw = Math.atan2(-B.az, B.ax); // turns +x onto its length
  const P = (u, y, v = 0) => ({ x: B.x + B.ax * u + sx * v, y, z: B.z + B.az * u + sz * v });
  for (const u of [-0.52, 0.52]) {
    const tyre = new THREE.RingGeometry(0.29, 0.335, 14);
    tyre.rotateY(yaw);
    const c = P(u, 0.335);
    tyre.translate(c.x, c.y, c.z);
    K.put('cloth', M.cloth, tyre, { noCast: true, color: 0x1c1c1e, item }); // two-sided
  }
  const [rear, front, crank, seat, head, fork] = [P(-0.52, 0.335), P(0.52, 0.335), P(-0.05, 0.3), P(-0.2, 0.82), P(0.36, 0.8), P(0.42, 0.62)];
  for (const [a, c] of [[rear, crank], [rear, seat], [crank, seat], [crank, fork], [seat, head], [fork, front], [head, fork], [head, P(0.34, 0.98)]]) painted(wire(a, c, 0.017), 0x6e3530);
  painted(wire(P(0.34, 0.98, -0.2), P(0.34, 0.98, 0.2), 0.015), 0x2b2b2e); // the handlebar
  const sd = P(-0.21, 0.84);
  painted(turnedBox(sd.x, sd.z, 0.84, 0.24, 0.05, 0.12, yaw), 0x222224); // the saddle
  // the pallet: five slats up its face, three bearers behind, leaning back 0.33 m onto the wall
  item = { id: 'clutter:pallet', kind: 'clutter' };
  const PL = ALLEY_CLUTTER.pallet;
  const [tx, tz] = [-PL.nz, PL.nx]; // along the wall
  const tall = 1.0;
  const back = 0.33;
  const at = (t, y, inward = 0) => ({ x: PL.x + tx * t - PL.nx * (back * y / tall + inward), y, z: PL.z + tz * t - PL.nz * (back * y / tall + inward) });
  for (const t of [-0.5, -0.25, 0, 0.25, 0.5]) wood(beam(at(t, 0), at(t, tall), 0.1, 0.022));
  for (const y of [0.1, 0.5, 0.9]) wood(beam(at(-0.6, y + 0.05, 0.0675), at(0.6, y + 0.05, 0.0675), 0.085, 0.1));
  // the paint tin, its lid left on
  item = { id: 'clutter:tin', kind: 'clutter' };
  const T = ALLEY_CLUTTER.tin;
  painted(post(T.x, T.z, 0, 0.19, 0.085, 0.085, 8), 0x8a9298);
  painted(post(T.x, T.z, 0.19, 0.012, 0.09, 0.09, 8), 0x5c6a3e);
}

// --- Task D (critique finding 9): the washing, things with shapes. Each is
// made along +x (the line), its top at y 0, hanging down in the plane z 0:
// a list of quads, two to four. Then it hangs a little crooked (one peg
// slipped: turned in its plane, lifted back to the line) and swings out in
// the wind (turned about the line), from hash01 of where it hangs.
const WASH_KINDS = Object.freeze(['shirt', 'trousers', 'socks', 'towel', 'sheet']);
const washKind = (x, z) => WASH_KINDS[Math.floor(hash01(x, z, 29) * WASH_KINDS.length) % WASH_KINDS.length];
const WASH = Object.freeze({ crook: 0.14, swing: [0.1, 0.22], sheetH: 0.7 });
function washQuads(kind, w, h) {
  const q = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  if (kind === 'shirt') {
    const s = w / 2;
    return [q(-s, 0, s, -h), [[-s, 0], [-s, -0.16], [-s - 0.17, -0.3], [-s - 0.17, -0.13]], [[s, 0], [s + 0.17, -0.13], [s + 0.17, -0.3], [s, -0.16]]];
  }
  if (kind === 'trousers') {
    const s = Math.min(w, 0.46) / 2;
    return [q(-s, 0, s, -0.1), [[-s, -0.1], [-0.02, -0.1], [-0.05, -h - 0.1], [-s - 0.04, -h - 0.1]], [[0.02, -0.1], [s, -0.1], [s + 0.04, -h - 0.1], [0.05, -h - 0.1]]];
  }
  if (kind === 'socks') {
    return [-0.11, 0.1].flatMap((x) => [q(x - 0.045, 0, x + 0.045, -0.26), [[x - 0.045, -0.26], [x + 0.045, -0.26], [x + 0.13, -0.3], [x + 0.11, -0.36]]]);
  }
  if (kind === 'sheet') return [q(-w * 0.8, 0, w * 0.8, -Math.min(h + 0.15, WASH.sheetH))];
  return [q(-w / 2, 0, w / 2, -h)]; // a towel
}
function washItem(kind, w, h, x, z) {
  const tris = [];
  for (const [a, c, d, e] of washQuads(kind, w, h)) tris.push(...[a, c, d, a, d, e].map(([u, v]) => [u, v, 0]));
  const g = triangles(tris);
  g.rotateZ((hash01(x, z, 31) - 0.5) * WASH.crook);
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox.max.y, 0); // its top back on the line
  const sw = WASH.swing[0] + (WASH.swing[1] - WASH.swing[0]) * hash01(z, x, 37);
  g.rotateX(hash01(x, z, 39) < 0.5 ? sw : -sw);
  return g;
}

// --- the back yards: walls with a gateway, washing posts, coal bunkers.
function drawYards(K, group, M, drawn) {
  const stone = (geo) => K.put('stone', M.stone, geo);
  // the walls: brick inside the plan's raised ground, a pier at each side of
  // the gateway, a stone coping
  const walls = [];
  for (const w of YARD_WALLS) {
    const t = YARD.half - 0.03;
    walls.push(box(w.x - t, w.x + t, 0, YARD.h, w.z0, w.z1));
    const z = w.z1 === YARD.gate0 ? w.z1 - 0.36 : w.z0;
    walls.push(box(w.x0, w.x1, 0, YARD.h + 0.15, z, z + 0.36));
    stone(box(w.x0, w.x1, YARD.h, YARD.h + 0.08, w.z0, w.z1));
    stone(box(w.x0, w.x1, YARD.h + 0.15, YARD.h + 0.23, z, z + 0.36));
  }
  // a bird's perch on each wall's coping, at its middle
  YARD_WALLS.forEach((w, i) => drawn.push({ id: DRAWN_ID.wall(i), kind: 'wall', x: w.x, y: YARD.h + 0.08, z: (w.z0 + w.z1) / 2 }));
  group.add(own('yardWalls', M.wall, walls, { tile: TILE.brick, tag: { yardWalls: true } }));
  const lineGeos = [];
  const [ynx, ynz] = downwindSide(0, 1); // the yards' lines run north-south
  WASHING_POSTS.forEach((p, i) => {
    for (const z of [p.z0, p.z1]) {
      K.put('ironSmall', M.iron, post(p.x, z, 0, 2.0, 0.04), { noCast: true });
      K.put('ironSmall', M.iron, rod({ x: p.x - 0.3, y: 1.95, z }, { x: p.x + 0.3, y: 1.95, z }, 0.025), { noCast: true });
    }
    // a bird's perch on each post's top, at its T-bar
    [p.z0, p.z1].forEach((z, end) => drawn.push({ id: DRAWN_ID.post(i, end), kind: 'post', x: p.x, y: 2.0, z }));
    for (const dx of [-0.25, 0.25]) lineGeos.push(rod({ x: p.x + dx, y: 1.95, z: p.z0 }, { x: p.x + dx, y: 1.9, z: p.z1 }, 0.008, 4));
    // two or three things drying on each
    for (let j = 0; j < 3; j++) {
      if (j === 2 && i % 2) continue;
      const z = p.z0 + 1.2 + j * 1.4;
      const w = 0.5 + 0.25 * hash01(p.x, z, 5);
      const h = 0.45 + 0.3 * hash01(z, p.x, 7);
      const kind = washKind(p.x, z);
      const g = washItem(kind, w, h, p.x, z);
      g.rotateY(Math.PI / 2);
      g.translate(p.x + (j % 2 ? 0.25 : -0.25), 1.92, z);
      const sway = { lineY: 1.92, nx: ynx, nz: ynz, phase: washPhase(p.x, z) };
      K.put('cloth', M.cloth, g, { noCast: true, color: CLOTHS[Math.floor(hash01(p.x, z, 11) * CLOTHS.length) % CLOTHS.length], item: { id: `wash:yard:${i}:${j}`, kind, line: 'yard' }, sway });
    }
  });
  for (const g of lineGeos) K.put('paint', M.paint, g, { noCast: true, color: 0xe8e2d0 });
  // the coal bunkers at the extensions' feet: concrete, a wooden hatch
  for (const k of BUNKERS) {
    group.add(own(k.id, M.render, [box(k.x0, k.x1, 0, k.y, k.z0, k.z1)], { noCast: true, tag: { block: k.id } }));
    K.put('paint', M.paint, box(k.x0 + 0.25, k.x1 - 0.25, 0.25, 0.85, k.z1, k.z1 + 0.04), { noCast: true, color: 0x6b5238 });
  }
}

// A stack's four quarters (west/east of its party wall, in front of/behind the
// ridge). Each runs STACK.half across the ridge where everything under it is
// its own disc, the void under the slates or ground as high as its top;
// otherwise as far as that holds (to a flat roof's edge), and where even
// STACK.inner will not do at full width, a square inside the disc. A quarter
// with lower ground beside it than the eaves goes down to that ground.
const STACK_HALF_X = 0.5;
const COPING_PROUD = 0.003; // m, how far a cheek's coping reaches past its face toward the flat roof
const STACK_PROUD = 0.006; // m, how far a quarter reaches past its party wall's plane (see drawTerrace); kept under the 7 mm the ground test samples at
function stackQuarters(s, ground) {
  const ok = (x, z) => {
    const y = ground.y(x, z);
    return y >= s.y - STEP_MAX || Math.abs(y - L.VOID) < 1e-6;
  };
  const clear = (x0, x1, z0, z1) => {
    for (let x = x0 + 0.01; x <= x1 - 0.01 + 1e-9; x += 0.025) {
      for (let z = z0 + 0.01; z <= z1 - 0.01 + 1e-9; z += 0.025) if (!ok(x, z)) return false;
    }
    return ok(x1 - 0.01, z1 - 0.01) && ok(x0 + 0.01, z1 - 0.01) && ok(x1 - 0.01, z0 + 0.01);
  };
  const out = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const span = (w, e) => {
        const xa = sx < 0 ? s.x - w : s.x;
        const xb = sx < 0 ? s.x : s.x + w;
        return sz < 0 ? [xa, xb, s.z - e, s.z] : [xa, xb, s.z, s.z + e];
      };
      let e = STACK.half;
      while (e > STACK.inner && !clear(...span(STACK_HALF_X, e))) e = Math.round((e - 0.01) * 100) / 100;
      const [x0, x1, z0, z1] = clear(...span(STACK_HALF_X, e)) ? span(STACK_HALF_X, Math.max(STACK.inner, e - 0.03)) : span(STACK.inner, STACK.inner);
      // how low the ground beside it goes (the void is under the slates)
      let low = EAVE_Y - 0.2;
      for (const [x, z] of [[x0 - 0.1, (z0 + z1) / 2], [x1 + 0.1, (z0 + z1) / 2], [(x0 + x1) / 2, z0 - 0.1], [(x0 + x1) / 2, z1 + 0.1]]) {
        const y = ground.y(x, z);
        if (Math.abs(y - L.VOID) > 1e-6 && y > L.STREET) low = Math.min(low, y);
      }
      out.push({ x0, x1, z0, z1, y0: low });
    }
  }
  return out;
}

// --- Beauty pass, Task B (finding 5): what the roofs' edges carry. The eave's
// layers, under and in front of the slates' edge (m): the slates' own edge,
// the eave board's depth and how far it sits back, the gutter's drop below
// the edge, how far out its middle hangs and its radius.
const EAVE = Object.freeze({ slate: 0.04, inset: 0.04, board: 0.22, gutterDrop: 0.06, gutterOut: 0.05, gutterR: 0.085 });
// TV aerials on six stacks (hash01's pick), each on the stack's street face
// on the side over the slates, every one pointing the same way (at the same
// transmitter): a mast, a boom and three elements, all thin open wires.
// Returns a bird's perch on the boom (AERIAL.perch along it, between two
// elements, on the wire's top), or null where it draws none.
const AERIAL = Object.freeze({ count: 6, off: 0.3, foot: 0.6, tall: 1.15, extra: 0.35, mast: 0.022, rod: 0.011, yaw: 0.55, boom: [-0.35, 0.65], elements: [[-0.25, 0.27], [0.15, 0.22], [0.5, 0.17]], perch: 0.33 });
const AERIAL_STACKS = new Set([...STACKS].sort((p, q) => hash01(p.x, 7.1, 61) - hash01(q.x, 7.1, 61)).slice(0, AERIAL.count).map((s) => s.id));
function aerial(put, s, quarters, ground) {
  const first = hash01(s.x, 2.2, 67) < 0.5 ? -1 : 1;
  for (const sx of [first, -first]) {
    const mx = s.x + sx * AERIAL.off;
    const front = quarters.filter((q) => q.z1 <= s.z + 1e-6 && q.x0 <= mx && q.x1 >= mx);
    if (!front.length) continue;
    const mz = Math.min(...front.map((q) => q.z0)) - AERIAL.mast;
    if (Math.abs(ground.y(mx, mz - 0.05) - L.VOID) > 1e-6) continue; // over the slates only
    const top = s.y + AERIAL.tall + AERIAL.extra * hash01(s.x, 4.4, 69);
    put(wire({ x: mx, y: s.y - AERIAL.foot, z: mz }, { x: mx, y: top, z: mz }, AERIAL.mast));
    const [dx, dz] = [Math.cos(AERIAL.yaw), Math.sin(AERIAL.yaw)];
    const y = top - 0.1;
    const at = (t, u = 0) => ({ x: mx + dx * t - dz * u, y, z: mz + dz * t + dx * u });
    put(wire(at(AERIAL.boom[0]), at(AERIAL.boom[1]), AERIAL.rod));
    for (const [t, half] of AERIAL.elements) put(wire(at(t, -half), at(t, half), AERIAL.rod * 0.8));
    const perch = at(AERIAL.perch);
    return { x: perch.x, y: y + AERIAL.rod, z: perch.z };
  }
  return null;
}
// A satellite dish on two back walls (hash01's pick of the houses with no
// outrigger), between the upstairs window and the eave, facing south and up.
const DISH_AT = Object.freeze({ dx: 3.3, y: 5.75, out: 0.3, r: 0.27, tilt: 0.35 });
const DISH_HOUSES = new Set([1, 3, 4, 8, 9, 11, 12].sort((p, q) => hash01(p, 6.6, 79) - hash01(q, 6.6, 79)).slice(0, 2));
function dish(put, x, y, z) {
  const { out, r, tilt } = DISH_AT;
  const bowl = new THREE.CylinderGeometry(r, 0.05, 0.09, 10);
  bowl.rotateX(Math.PI / 2 - tilt); // its open face to the south (+z), tilted up
  bowl.translate(x, y, z + out);
  put(bowl, DISH);
  put(rod({ x, y, z }, { x, y, z: z + out - 0.03 }, 0.02, 4), DISH); // its arm off the wall
  // the arm from the rim's foot to the head at its focus
  const [ay, az] = [Math.sin(tilt), Math.cos(tilt)];
  const foot = { x, y: y - r * az, z: z + out + r * ay };
  const head = { x, y: y + ay * 0.32, z: z + out + az * 0.32 };
  put(rod(foot, head, 0.009, 3), DISH);
  put(box(x - 0.03, x + 0.03, head.y - 0.03, head.y + 0.03, head.z - 0.04, head.z + 0.04), 0x3a3b40);
}

// --- the terrace: the houses, their extensions and outriggers, the slates,
// the flat roofs, the stacks and every window.
function drawTerrace(group, M, win, ground, drawn) {
  const K = makeKit('roofsTerrace');
  // `color`: whose brick (lookOf(k).wall), or a colour of its own
  const wall = (geo, color = null) => K.put('wall', M.wall, geo, { tile: TILE.brick, color });
  const brickOf = (k) => lookOf(k).wall;
  const stone = (geo) => K.put('stone', M.stone, geo);
  const iron = (geo) => K.put('iron', M.iron, geo, { noCast: true });
  const painted = (geo, color) => K.put('paint', M.paint, geo, { color, noCast: true });
  const pots = painted;
  const felt = (geo, color, item) => K.put('paint', M.paint, geo, { color, noCast: true, item }); // round two, Task F
  const T = TERRACE;
  const sill = (x, y, z, w, nz) => stone(box(x - w / 2 - 0.06, x + w / 2 + 0.06, y - 0.07, y, nz > 0 ? z : z - 0.08, nz > 0 ? z + 0.08 : z));
  // a window with a stone sill under it, on a wall facing +z or -z
  const zWin = (x, y, z, nz, w, h) => { win(x, y, z, 0, nz, w, h); sill(x, y - h / 2, z, w, nz); };

  // The houses' body, from the street below up to the eaves, and the gables:
  // each house its own front and back (Task B: split at the party walls, so
  // the brick can change there; the top is under the slates, the foot under
  // the street, so neither is drawn), the two ends of the row.
  for (let k = 1; k <= 12; k++) {
    for (const [z, nz] of [[T.z0, -1], [T.z1, 1]]) wall(faceZ(houseX0(k), houseX0(k) + HOUSE_W, L.STREET, EAVE_Y, z, nz), brickOf(k));
  }
  wall(faceX(T.z0, T.z1, L.STREET, EAVE_Y, T.x0, -1), brickOf(1));
  wall(faceX(T.z0, T.z1, L.STREET, EAVE_Y, T.x1, 1), brickOf(12));
  const gable = [[T.z0, EAVE_Y], [RIDGE_Z, L.RIDGE], [T.z1, EAVE_Y]];
  const coping = (x, pts, width = 0.32) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      stone(beam({ x, y: pts[i][1] + 0.06, z: pts[i][0] }, { x, y: pts[i + 1][1] + 0.06, z: pts[i + 1][0] }, width, 0.1));
    }
  };
  wall(extrudeX(gable, T.x0, T.x0 + 0.2), brickOf(1)); coping(T.x0 + 0.1, gable);
  wall(extrudeX(gable, T.x1 - 0.2, T.x1), brickOf(12)); coping(T.x1 - 0.1, gable);

  // The three flat roofs: felt on a brick course; brick cheeks where the
  // neighbours' slopes end against them (see the header).
  const flats = ['flatHouse', 'dormer', 'roofTerrace'].map((id) => BLOCK[id]);
  for (const f of flats) {
    wall(box(f.x0, f.x1, EAVE_Y - 0.05, f.y - 0.08, f.z0, f.z1), brickOf(f.house));
    group.add(own(f.id, M.felt, [box(f.x0, f.x1, f.y - 0.08, f.y, f.z0, f.z1)], { tile: TILE.gravel, tag: { block: f.id } }));
    feltPatches(felt, f, ground);
    const full = f.z0 <= T.z0;
    const cheek = full ? gable : [[f.z0, EAVE_Y - 0.05], [f.z0, slopeY(f.z0)], [T.z1, EAVE_Y], [T.z1, EAVE_Y - 0.05]];
    const top = full ? gable : [[f.z0, slopeY(f.z0)], [T.z1, EAVE_Y]];
    // each cheek's coping is flush with the flat roof's edge, never over it
    // (a hair, COPING_PROUD, proud of it, so the coping's face is not coplanar with the cheek's: that pair shimmered)
    for (const [x0, x1, cx, toward] of [[f.x0 - 0.15, f.x0, f.x0 - 0.11, 1], [f.x1, f.x1 + 0.15, f.x1 + 0.11, -1]]) { wall(extrudeX(cheek, x0, x1), brickOf(houseAt(cx))); coping(cx + toward * COPING_PROUD / 2, top, 0.22 + COPING_PROUD); }
    if (!full) {
      // the back wall where the slope rises behind the flat roof, with a window or a door
      wall(box(f.x0, f.x1, EAVE_Y - 0.05, slopeY(f.z0), f.z0 - 0.15, f.z0), brickOf(f.house));
      const cx = (f.x0 + f.x1) / 2;
      if (f.id === 'dormer') zWin(cx, 7.2, f.z0, 1, 1.3, 0.65);
      else win(cx, 7.15, f.z0, 0, 1, 1.0, 0.95);
    }
  }

  // The slates: the front slope and the back, round the flat roofs. One mesh,
  // its top the ridge; each house's own slates (Task B), split at the party
  // walls, darker toward the eave (a vertex gradient: depth for free).
  const slatePieces = [];
  const perHouse = (x0, x1, fn) => {
    for (let k = houseAt(x0 + 0.01); k <= houseAt(x1 - 0.01); k++) {
      const a = Math.max(x0, houseX0(k));
      const c = Math.min(x1, houseX0(k) + HOUSE_W);
      if (c - a > 0.01) fn(a, c, k);
    }
  };
  const slope = (x0, x1, zEave, zTop) => perHouse(x0, x1, (a, c, k) => {
    const yE = slopeY(zEave);
    const yT = slopeY(zTop);
    slatePieces.push({ geo: triangles(quadTris([a, yE, zEave], [c, yE, zEave], [c, yT, zTop], [a, yT, zTop], [0, 1, 0])), color: slateShade(k) });
  });
  const flatHouse = BLOCK.flatHouse;
  const frontSpans = [[T.x0, flatHouse.x0], [flatHouse.x1, T.x1]];
  for (const [x0, x1] of frontSpans) slope(x0, x1, T.z0 - EAVE_OVER, RIDGE_Z);
  const backCuts = [BLOCK.dormer, flatHouse, BLOCK.roofTerrace].sort((p, q) => p.x0 - q.x0);
  let x = T.x0;
  for (const f of backCuts) {
    if (f.x0 > x) slope(x, f.x0, T.z1 + EAVE_OVER, RIDGE_Z);
    if (f.z0 > RIDGE_Z) slope(f.x0, f.x1, f.z0, RIDGE_Z);
    x = f.x1;
  }
  if (x < T.x1) slope(x, T.x1, T.z1 + EAVE_OVER, RIDGE_Z);
  const backSpans = [];
  let bx = T.x0;
  for (const f of backCuts) { if (f.x0 > bx) backSpans.push([bx, f.x0]); bx = f.x1; }
  backSpans.push([bx, T.x1]);

  // The eaves (Task B, finding 5): along every eave, the slates' own edge
  // (EAVE.slate thick, in their darkest shade, in the slates' mesh); under it
  // the eave board, white or black by house, set back EAVE.inset, and the
  // soffit back to the wall; the hanging gutter in front (below). All of it
  // under the slates' edge and outside the walls: nothing she walks on.
  const eaves = [[frontSpans, T.z0 - EAVE_OVER, T.z0, -1], [backSpans, T.z1 + EAVE_OVER, T.z1, 1]];
  for (const [spans, zE, zW, sz] of eaves) {
    const yE = slopeY(zE);
    for (const [x0, x1] of spans) {
      perHouse(x0, x1, (a, c, k) => {
        slatePieces.push({ geo: faceZ(a, c, yE - EAVE.slate, yE, zE, sz), color: slateShade(k, SLATE_SHADE.edge) });
        const zF = zE - sz * EAVE.inset;
        painted(faceZ(a, c, yE - EAVE.board, yE, zF, sz), lookOf(k).trim);
        painted(faceDown(a, c, Math.min(zF, zW), Math.max(zF, zW), yE - EAVE.board), lookOf(k).trim);
      });
    }
  }
  // slopeY past the eave: the overhang carries on down the same pitch
  const slates = own('terrace', M.slates, slatePieces, { tile: TILE.shingle, tag: { block: 'terrace' } });
  group.add(slates);

  // Hanging gutters along the eaves, where no lead gutter (a crossing) runs:
  // half-round (Task B: a D in section, its flat top just under the slates'
  // edge), hung out in front of the eave board.
  const leadSpans = ROOFS_TRAVERSAL.crossings.filter((c) => c.kind === 'gutter').map((c) => [Math.min(c.points[0].x, c.points[1].x), Math.max(c.points[0].x, c.points[1].x)]);
  const gutterRuns = (spans, zE, sz) => {
    const yc = slopeY(zE) - EAVE.gutterDrop;
    const zc = zE + sz * EAVE.gutterOut;
    const r = EAVE.gutterR;
    const d = Array.from({ length: 5 }, (_, i) => -Math.PI * (i / 4)); // 0 .. -pi, the half under its top
    const section = d.map((t) => [zc + sz * r * Math.cos(t), yc + r * Math.sin(t)]);
    for (const [a, c] of spans) iron(extrudeX(section, a, c));
  };
  gutterRuns(frontSpans, T.z0 - EAVE_OVER, -1);
  const free = backSpans.flatMap(([a, c]) => {
    let pieces = [[a, c]];
    for (const [la, lc] of leadSpans) pieces = pieces.flatMap(([p, q]) => (lc <= p || la >= q ? [[p, q]] : [[p, Math.max(p, la)], [Math.min(q, lc), q]].filter(([u, v]) => v - u > 0.05)));
    return pieces;
  });
  gutterRuns(free, T.z1 + EAVE_OVER, 1);

  // The chimney stacks on the party walls, across the ridge, with their pots
  // (the header: four quarters, each inside what the ground lets it cover).
  for (const s of STACKS) {
    const quarters = stackQuarters(s, ground);
    const brick = stackBrick(s);
    // Each quarter reaches STACK_PROUD past the party wall's plane (x = s.x): the cheeks, copings and
    // flat roofs beside the stack have faces in that very plane, and a sooty brick face there fought
    // them for the depth buffer (the stack's flicker). Only the inside of the stack and the wall's own
    // thickness move; nothing a cat can reach (colliders are the plan's) or see changes.
    const proud = (q) => (q.x0 === s.x ? [q.x0 - STACK_PROUD, q.x1] : [q.x0, q.x1 + STACK_PROUD]);
    group.add(own(s.id, M.wall, quarters.map((q) => box(...proud(q), q.y0, s.y, q.z0, q.z1)), { tile: TILE.brick, color: brick, tag: { block: s.id } }));
    for (const q of quarters) { const [x0, x1] = proud(q); wall(box(x0 - 0.06, x1 + 0.06, s.y - 0.16, s.y - 0.06, q.z0 - 0.06, q.z1 + 0.06), brick); } // the oversailing course
    const mast = AERIAL_STACKS.has(s.id) ? aerial(iron, s, quarters, ground) : null;
    if (mast) drawn.push({ id: DRAWN_ID.aerial(s.x), kind: 'aerial', ...mast });
    for (const side of [-1, 1]) {
      // a pot each side of the ridge's line, on the quarters that reach it
      const reach = quarters.filter((q) => (side < 0 ? s.z - q.z0 : q.z1 - s.z) >= STACK.pot + 0.13);
      if (!reach.length) continue;
      const px = reach.reduce((t, q) => t + (q.x0 + q.x1) / 2, 0) / reach.length;
      const tall = 0.45 + 0.15 * hash01(s.x, side, 3);
      const col = hash01(s.x, side, 9) < 0.7 ? 0xb8613f : 0x8a7f72;
      pots(post(px, s.z + side * STACK.pot, s.y, tall, 0.1, 0.13, 10), col);
      pots(post(px, s.z + side * STACK.pot, s.y + tall - 0.04, 0.05, 0.125, 0.125, 10), col);
      // a bird's perch on its rim (on the warm chimney's, the cowl's top)
      const warm = s.x === ROOFS_DISCOVERIES.chimney.x && side < 0;
      drawn.push({ id: DRAWN_ID.pot(s.x, side), kind: 'pot', x: px, y: s.y + tall + (warm ? 0.14 : 0.01), z: s.z + side * STACK.pot });
      // the warm chimney (discovery F): a cowl on its pot, soot round the rim
      if (warm) {
        const z = s.z + side * STACK.pot;
        pots(post(px, z, s.y + tall - 0.08, 0.06, 0.128, 0.128, 10), 0x2a2622);
        pots(post(px, z, s.y + tall + 0.08, 0.06, 0.04, 0.16, 10), 0x3a3d42);
        for (const a of [0, 2.1, 4.2]) pots(post(px + Math.cos(a) * 0.07, z + Math.sin(a) * 0.07, s.y + tall, 0.09, 0.012, 0.012, 4), 0x3a3d42);
      }
    }
  }

  // The back extensions, the outriggers on four of them, and the walls'
  // windows and doors, house by house.
  for (let k = 1; k <= 12; k++) {
    const x0 = houseX0(k);
    const e = extOf(k);
    const o = outOf(k);
    const ecx = (e.x0 + e.x1) / 2;
    wall(box(e.x0, e.x1, 0, e.y - 0.1, e.z0, e.z1), brickOf(k));
    group.add(own(e.id, M.felt, [box(e.x0, e.x1, e.y - 0.1, e.y, e.z0, e.z1)], { tile: TILE.gravel, tag: { block: e.id } }));
    // its drip edge round the yard's three sides (by an outrigger, only past it), its patches
    const past = o ? [o.z1, e.z1 + FELT.drip.out] : true;
    dripEdges(felt, e, { x0: past, x1: past, z1: true });
    feltPatches(felt, e, ground);
    // the kitchen window over the yard, its sill clear above a bunker's lid
    const bunker = BLOCK[`bunker-${k}`];
    zWin(ecx, bunker ? 2.15 : 1.85, e.z1, 1, 1.0, 1.0);
    win(e.x1, 1.5, 16.5, 1, 0, 0.7, 0.9); // a small one into the side return
    stone(box(e.x1, e.x1 + 0.08, 1.0, 1.05, 16.1, 16.9));
    const ret = (e.x1 + x0 + HOUSE_W) / 2; // the middle of the side return
    painted(box(ret - 0.42, ret + 0.42, 0, 2.0, T.z1, T.z1 + 0.05), paint(x0, T.z1, 5)); // the back door
    // its window, or, where a house cat sleeps (S1, ROOFS_SLEEPERS), a deep
    // stone sill under a window lit warm (a plain one: no cat in it too)
    if (ROOFS_SLEEPERS.some((q) => Math.abs(q.x - ret) < 1e-6)) {
      win(ret, SLEEPER_SILL.y + 0.5, T.z1, 0, 1, 0.7, 1.0, warmCell(ret, T.z1));
      stone(box(ret - 0.41, ret + 0.41, SLEEPER_SILL.y - 0.07, SLEEPER_SILL.y, T.z1, T.z1 + SLEEPER_SILL.depth));
    } else {
      zWin(ret, 4.8, T.z1, 1, 0.7, 1.0);
    }
    if (o) {
      wall(box(o.x0, o.x1, e.y - 0.1, o.y - 0.1, o.z0, o.z1), brickOf(k));
      group.add(own(o.id, M.felt, [box(o.x0, o.x1, o.y - 0.1, o.y, o.z0, o.z1)], { tile: TILE.gravel, tag: { block: o.id } }));
      dripEdges(felt, o, { x0: true, x1: true, z1: true });
      feltPatches(felt, o, ground);
      // the jettied overhang over the side return, on a corbelled course
      if (o.x1 > e.x1) wall(box(e.x1, o.x1 - 0.12, e.y - 0.3, e.y - 0.1, o.z0, o.z1), brickOf(k));
      if (o.x0 < e.x0) wall(box(o.x0 + 0.12, e.x0, e.y - 0.3, e.y - 0.1, o.z0, o.z1), brickOf(k));
      zWin(ecx, 4.35, o.z1, 1, 0.7, 0.8);
      zWin(ecx + 0.25, 5.8, T.z1, 1, 0.8, 0.7); // the back window over it, whose sill she climbs by
    } else {
      zWin(ecx, 4.9, T.z1, 1, 0.9, 1.1);
    }
    // the drainpipe at the party wall, from the eave down to the extension
    iron(box(x0 + 0.06, x0 + 0.15, e.y, EAVE_Y - 0.1, T.z1, T.z1 + 0.09));
    if (DISH_HOUSES.has(k)) dish(painted, x0 + DISH_AT.dx, DISH_AT.y, T.z1);
    // the front, over the street: a door and a window below, two above each floor
    for (const y of [L.STREET + 1.7, 0.9, 4.1]) {
      zWin(x0 + 1.3, y, T.z0, -1, 0.9, 1.3);
      if (y > L.STREET + 2) zWin(x0 + 3.7, y, T.z0, -1, 0.9, 1.3);
    }
    painted(box(x0 + 3.2, x0 + 4.2, L.STREET, L.STREET + 2.15, T.z0 - 0.05, T.z0), paint(x0, T.z0, 7));
    stone(box(x0 + 3.1, x0 + 4.3, L.STREET, L.STREET + 0.12, T.z0 - 0.35, T.z0)); // its step
  }
  // the shed's window, on the shed's east end
  const S = BLOCK.shed;
  win(S.x1, 1.25, (S.z0 + S.z1) / 2, 1, 0, 0.8, 0.5);

  for (const m of K.meshes()) group.add(m);
}

// --- the two house cats asleep on their sills (Rooftops step 3, S1;
// roofsplan.js ROOFS_SLEEPERS). Each is one mesh of its own in its coat's two
// vertex colours, at most 320 triangles: a loaf of a body (flat underneath),
// the head down on its front paws at the +x end (the -x end for a `mirror`
// sleeper: its geometry mirrored, mirrorX), its face turned out to the
// yards (+z), two ears, and the tail wrapped round the front to the paws. Its
// origin is on the sill, so the life's breathing (scale.y) lifts its back and
// never sinks it into the stone. Never merged (the life breathes it), casting
// nothing; no label, no prompt, in no list a game system reads.
const SLEEPER = Object.freeze({
  body: Object.freeze({ at: [-0.03, 0.075, 0], r: [0.2, 0.105, 0.13], flat: 0.7, seg: [10, 6] }),
  head: Object.freeze({ at: [0.17, 0.1, 0.05], r: [0.084, 0.072, 0.08], seg: [8, 6] }),
  face: Object.freeze([0.55, 0.835]), // the way its face turns, level (unit)
  ear: Object.freeze({ up: 0.05, apart: 0.035, back: 0.012, half: 0.024, deep: 0.022, tall: 0.05 }),
  paws: Object.freeze([[0.19, 0.025, 0.08], [0.17, 0.025, 0.13]]),
  paw: Object.freeze({ r: [0.055, 0.025, 0.03], seg: [6, 3] }),
  tail: Object.freeze({
    points: Object.freeze([[-0.2, 0.05, -0.06], [-0.245, 0.04, 0.05], [-0.17, 0.035, 0.135], [-0.04, 0.03, 0.165], [0.08, 0.03, 0.16], [0.14, 0.035, 0.135]]),
    r: 0.032, tip: 0.45, seg: [10, 4],
  }),
});

// An ellipsoid of radii r at `at`, as a sphere of seg[0] x seg[1].
function ellipsoid(at, r, seg) {
  const g = new THREE.SphereGeometry(1, seg[0], seg[1]);
  g.scale(r[0], r[1], r[2]);
  g.translate(at[0], at[1], at[2]);
  return g;
}

// One ear: a three-sided pyramid, its base inside the head, each face turned out.
function earGeometry(base, side, face) {
  const E = SLEEPER.ear;
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const foot = [
    v(base.x + side[0] * E.half, base.y, base.z + side[1] * E.half),
    v(base.x - side[0] * E.half, base.y, base.z - side[1] * E.half),
    v(base.x - face[0] * E.deep, base.y, base.z - face[1] * E.deep),
  ];
  const apex = v(base.x + face[0] * 0.004, base.y + E.tall, base.z + face[1] * 0.004);
  const mid = foot.reduce((t, p) => t.add(p), apex.clone()).multiplyScalar(0.25);
  const pos = [];
  for (let i = 0; i < 3; i++) {
    let [a, c] = [foot[i], foot[(i + 1) % 3]];
    const n = new THREE.Vector3().subVectors(c, a).cross(new THREE.Vector3().subVectors(apex, a));
    const centre = a.clone().add(c).add(apex).multiplyScalar(1 / 3);
    if (n.dot(centre.sub(mid)) < 0) [a, c] = [c, a];
    pos.push(a.x, a.y, a.z, c.x, c.y, c.z, apex.x, apex.y, apex.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

// The tail: a tube along its points, thinning to `tip` of its root's radius.
function tailGeometry() {
  const T = SLEEPER.tail;
  const curve = new THREE.CatmullRomCurve3(T.points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const [n, radial] = T.seg;
  const g = new THREE.TubeGeometry(curve, n, T.r, radial, false);
  const p = g.attributes.position;
  const at = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    curve.getPointAt(i / n, at);
    const k = 1 - (1 - T.tip) * (i / n) ** 1.5;
    for (let j = 0; j <= radial; j++) {
      const q = i * (radial + 1) + j;
      p.setXYZ(q, at.x + (p.getX(q) - at.x) * k, at.y + (p.getY(q) - at.y) * k, at.z + (p.getZ(q) - at.z) * k);
    }
  }
  return g;
}

// A geometry (non-indexed) mirrored in x: its positions and normals turned
// over, and each triangle's winding swapped back, so its outside is still
// the side a single-sided material shows (a negative scale on the mesh
// would turn it inside out to the shadow and the light).
function mirrorX(g) {
  g.scale(-1, 1, 1);
  for (const a of Object.values(g.attributes)) {
    const n = a.itemSize;
    const arr = a.array;
    for (let t = 0; t < a.count; t += 3) {
      for (let j = 0; j < n; j++) {
        const [i1, i2] = [(t + 1) * n + j, (t + 2) * n + j];
        [arr[i1], arr[i2]] = [arr[i2], arr[i1]];
      }
    }
    a.needsUpdate = true;
  }
  return g;
}

// A sleeper's geometry in its coat: `fur` all over, `pale` on its chest, its
// muzzle and its paws; its head toward -x where `mirror`.
function sleeperGeometry(coat, mirror = false) {
  const S = SLEEPER;
  const fur = new THREE.Color(coat.fur);
  const pale = new THREE.Color(coat.pale);
  const [fx, fz] = S.face;
  const body = ellipsoid(S.body.at, S.body.r, S.body.seg);
  const bp = body.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const y = bp.getY(i);
    if (y < S.body.at[1]) bp.setY(i, S.body.at[1] + (y - S.body.at[1]) * S.body.flat); // a loaf: flat underneath
  }
  const h = S.head.at;
  const head = ellipsoid(h, S.head.r, S.head.seg);
  const side = [fz, -fx];
  const ears = [1, -1].map((k) => earGeometry(
    { x: h[0] + side[0] * k * S.ear.apart - fx * S.ear.back, y: h[1] + S.ear.up, z: h[2] + side[1] * k * S.ear.apart - fz * S.ear.back },
    side, S.face,
  ));
  const chest = (x, y, z) => (x > 0.04 && z > 0.03 && y < 0.13 ? pale : fur);
  const muzzle = (x, y, z) => ((x - h[0]) * fx + (z - h[2]) * fz > 0.035 && y - h[1] < 0.015 ? pale : fur);
  const g = mergeGeometries([
    prep(body, { color: chest }),
    prep(head, { color: muzzle }),
    ...ears.map((e) => prep(e, { color: fur })),
    ...S.paws.map((at) => prep(ellipsoid(at, S.paw.r, S.paw.seg), { color: pale })),
    prep(tailGeometry(), { color: fur }),
  ]);
  return mirror ? mirrorX(g) : g;
}

// The two sleepers, each its own mesh added to `group`; returned in
// ROOFS_SLEEPERS' order (the record's `sleepers`).
function drawSleepers(group) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  return ROOFS_SLEEPERS.map((s) => {
    const m = finish(new THREE.Mesh(sleeperGeometry(s.coat, s.mirror), mat), true);
    m.name = `roofsSleeper:${s.id}`;
    m.userData.noMerge = true;
    m.position.set(s.x, s.y, s.z);
    m.rotation.y = s.yaw;
    group.add(m);
    return m;
  });
}

// A ridge tile's section at its spigot end (dz across the ridge, dy below the
// rail), six faces from lip to lip: its crown the rail, round-shouldered, its
// flanks 3 cm and more proud of the slopes at 0.15 m out (Task B's guard), its
// feet 0.16 m out, under the slates. Round two, Task F (critique finding 2):
// it was one 0.4 m extrusion the length of the ridge, a flat red carpet at
// cat height; now each ridge is laid in tiles RIDGE_TILES.len long or less.
const RIDGE_CAP = Object.freeze([[-0.16, -0.11], [-0.153, -0.022], [-0.1, -0.008], [0, 0], [0.1, -0.008], [0.153, -0.022], [0.16, -0.11]]);
// A tile's socket end is `socket` m larger than its spigot (the section scaled
// about the crown, so the crown stays on the rail): every joint steps out at
// the flanks. Each tile its own shade of RIDGE_TILE (`shade`, from hash01 of
// where it lies); at each socket the bedding mortar shows on both flanks.
const RIDGE_TILES = Object.freeze({ len: 0.45, socket: 0.012, shade: Object.freeze([0.9, 1.08]), mortar: 0xb8ad9c });

// The tiles of a ridge from x0 to x1, its crown (the rail) at y over z: as
// many as RIDGE_TILES.len goes into its length, each a tapered half-round
// (six quads, its socket at its west end) and two mortar triangles, the
// socket's mouth on its flanks: 14 triangles a tile. Pieces for own().
function ridgeTiles(x0, x1, y, z) {
  const R = RIDGE_TILES;
  const n = Math.ceil((x1 - x0) / R.len - 1e-9);
  const len = (x1 - x0) / n;
  const big = 1 + R.socket / RIDGE_CAP[RIDGE_CAP.length - 1][0];
  const at = (x, [dz, dy], k) => [x, y + dy * k, z + dz * k];
  const out = [];
  for (let i = 0; i < n; i++) {
    const [xs, xe] = [x0 + i * len, x0 + (i + 1) * len];
    const tris = [];
    for (let j = 0; j + 1 < RIDGE_CAP.length; j++) {
      const [p, q] = [RIDGE_CAP[j], RIDGE_CAP[j + 1]];
      const want = [0, q[0] - p[0], -(q[1] - p[1])]; // out of the section, square to this face
      tris.push(...quadTris(at(xs, p, big), at(xs, q, big), at(xe, q, 1), at(xe, p, 1), want));
    }
    const shade = R.shade[0] + (R.shade[1] - R.shade[0]) * hash01(xs, z, 51);
    out.push({ geo: triangles(tris), color: new THREE.Color(RIDGE_TILE).multiplyScalar(shade) });
    // the mortar in the socket's mouth, facing the tile before it: from the
    // socket's flank top to the spigot's flank top, down to the socket's foot
    const mortar = [];
    for (const [top, foot] of [[RIDGE_CAP[1], RIDGE_CAP[0]], [RIDGE_CAP[RIDGE_CAP.length - 2], RIDGE_CAP[RIDGE_CAP.length - 1]]]) {
      const tri = [at(xs, top, big), at(xs, top, 1), at(xs, foot, big)];
      const nrm = cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]));
      mortar.push(...(nrm[0] <= 0 ? tri : [tri[0], tri[2], tri[1]]));
    }
    out.push({ geo: triangles(mortar), color: R.mortar });
  }
  return out;
}

// --- the crossings: planks, ridge tiles, lead gutters, washing lines. One
// mesh each along its rail; the line's cloths in one mesh of their own.
function drawCrossings(group, M) {
  const K = makeKit('roofsMoves');
  for (const c of ROOFS_TRAVERSAL.crossings) {
    const p = c.points;
    const first = p[0];
    const last = p[p.length - 1];
    const pieces = [];
    let noCast = true;
    if (c.kind === 'plank') {
      noCast = false;
      for (let i = 0; i + 1 < p.length; i++) pieces.push({ geo: beam(p[i], p[i + 1], 0.28, 0.04), color: 0xb8986a });
    } else if (c.kind === 'ridge') {
      // ridge tiles on the slates, stack to stack (the plan runs no ridge over
      // a flat roof): laid one by one (round two, Task F: ridgeTiles), their
      // flanks proud of the slates either side (Task B), their crown the rail she walks
      const x0 = Math.min(first.x, last.x);
      const x1 = Math.max(first.x, last.x);
      pieces.push(...ridgeTiles(x0, x1, first.y, first.z));
    } else if (c.kind === 'gutter') {
      // a lead-lined box gutter at the back eave, its rim the rail
      const x0 = Math.min(first.x, last.x);
      const x1 = Math.max(first.x, last.x);
      pieces.push({ geo: box(x0, x1, first.y - 0.22, first.y, first.z - 0.04, TERRACE.z1 + 0.1), color: 0x5f6872 });
    } else if (c.kind === 'line') {
      // the line, tied to a short iron post at each end
      for (let i = 0; i + 1 < p.length; i++) {
        pieces.push({ geo: rod({ ...p[i], y: p[i].y + 0.012 }, { ...p[i + 1], y: p[i + 1].y + 0.012 }, 0.012, 4), color: 0xe8e2d0 });
      }
      const dir = Math.sign(last.x - first.x) || 1;
      for (const [q, s] of [[first, -1], [last, 1]]) {
        const px = q.x + s * dir * 0.12;
        pieces.push({ geo: post(px, q.z, q.y, 0.4, 0.025), color: 0x2b2e33 });
        pieces.push({ geo: rod({ x: px, y: q.y + 0.35, z: q.z }, { x: q.x, y: q.y + 0.012, z: q.z }, 0.01, 4), color: 0xe8e2d0 });
      }
      // things drying, along the sagging middle
      const a = p[1];
      const z = p[2];
      const e = p[3];
      const n = 6;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const [s, u] = t < 0.5 ? [a, z] : [z, e];
        const f = t < 0.5 ? t * 2 : (t - 0.5) * 2;
        const cx = s.x + (u.x - s.x) * f;
        const cy = s.y + (u.y - s.y) * f;
        const w = 0.4 + 0.3 * hash01(cx, z.z, 13);
        const h = 0.45 + 0.35 * hash01(z.z, cx, 17);
        const kind = washKind(cx, s.z);
        const g = washItem(kind, w, h, cx, s.z);
        g.translate(cx, cy - 0.01, s.z);
        const [nx, nz] = downwindSide(u.x - s.x, u.z - s.z);
        const sway = { lineY: cy - 0.01, nx, nz, phase: washPhase(cx, s.z) };
        K.put('cloth', M.cloth, g, { noCast: true, color: CLOTHS[Math.floor(hash01(cx, s.z, 19) * CLOTHS.length) % CLOTHS.length], item: { id: `wash:${c.id}:${i}`, kind, line: c.id }, sway });
      }
    } else if (c.kind === 'pipe') {
      // an iron pipe from the tank to the loft, its top the rail, on two
      // trestles; at each end it goes into the tank and the loft's roof
      noCast = false;
      const r = 0.11;
      pieces.push({ geo: rod({ ...first, y: first.y - r }, { ...last, y: last.y - r }, r, 10), color: 0x4a4f55 });
      for (const t of [0.35, 0.68]) {
        const x = first.x + (last.x - first.x) * t;
        const z = first.z + (last.z - first.z) * t;
        pieces.push({ geo: post(x, z, L.WAREHOUSE, first.y - 2 * r - L.WAREHOUSE, 0.035, 0.035, 6), color: 0x2b2e33 });
        pieces.push({ geo: turnedBox(x, z, first.y - 2 * r - 0.06, 0.12, 0.08, 0.4, -Math.atan2(last.z - first.z, last.x - first.x)), color: 0x2b2e33 });
        pieces.push({ geo: turnedBox(x, z, L.WAREHOUSE, 0.4, 0.05, 0.12, -Math.atan2(last.z - first.z, last.x - first.x)), color: 0x2b2e33 });
      }
    } else {
      continue;
    }
    group.add(own(`crossing:${c.id}`, M.paint, pieces, { noCast, tag: { crossing: c.id } }));
  }
  for (const m of K.meshes()) group.add(m);
}

// --- the take-off marks: every hop's mark (roofsparts.js), merged by
// material, each mesh with the vertex ranges of every hop's mark in it. A
// hop with a `prop` (the plan's: a real thing shows the spot) gets its glow
// only; the others a small piece at the roof's edge ahead, found here on the
// ground.
const PROP_OF = new Map([...ROOFS_TRAVERSAL.gaps, ...ROOFS_TRAVERSAL.climbs, ...ROOFS_TRAVERSAL.drops].map((h) => [h.id, h.prop ?? null]));
function edgeAhead(ground, h) {
  const dx = (h.x1 - h.x0) / h.dist;
  const dz = (h.z1 - h.z0) / h.dist;
  let s = 0;
  while (s < h.dist && Math.abs(ground.y(h.x0 + dx * s, h.z0 + dz * s) - h.y0) < 0.05) s += 0.01;
  return s;
}
// The brick of the wall a mark lies on (a side return's lip: its extension's house).
function brickUnder(geo) {
  geo.computeBoundingBox();
  const c = geo.boundingBox.getCenter(new THREE.Vector3());
  const onTerrace = c.x > TERRACE.x0 && c.x < TERRACE.x1 && c.z > TERRACE.z0 && c.z < BLOCK['ext-1'].z1 + 0.5;
  return onTerrace ? lookOf(houseAt(c.x)).wall : null;
}
function drawMarks(group, M, traversal, ground) {
  const K = makeKit('roofsMarks');
  const names = new Map(Object.entries(M).map(([k, v]) => [v, k]));
  const glows = [];
  const glowRanges = [];
  let glowCount = 0;
  let glowMat = null;
  for (const hop of traversal.hops) {
    const prop = PROP_OF.get(hop.id);
    const g = markMesh(hop.mark, prop ? { ...hop, prop } : { ...hop, edge: edgeAhead(ground, hop) }, M);
    g.updateMatrixWorld(true);
    const mark = { id: hop.id, kind: hop.mark };
    g.traverse((c) => {
      if (!c.isMesh) return;
      if (c.userData.markGlow) {
        const geo = prep(bake(c.geometry, c.matrixWorld));
        glowRanges.push({ ...mark, start: glowCount, count: geo.attributes.position.count });
        glowCount += geo.attributes.position.count;
        glows.push(geo);
        glowMat = c.material;
      } else {
        const geo = bake(c.geometry, c.matrixWorld);
        K.put(`mark-${names.get(c.material) ?? c.material.uuid}`, c.material, geo, { noCast: true, mark, color: c.material === M.wall ? brickUnder(geo) : null });
      }
    });
  }
  for (const m of K.meshes()) group.add(m);
  if (glows.length) {
    // the walk's own copy of the glow's material (its map shared): the evening
    // (roofslife.js) moves its opacity, from glowOpacity.sunset to .dusk (Task D)
    const mat = glowMat.clone();
    mat.opacity = MARK_GLOW.dusk;
    const glow = new THREE.Mesh(merged(glows, 'markGlow'), mat);
    glow.userData.glowOpacity = { sunset: MARK_GLOW.sunset, dusk: MARK_GLOW.dusk };
    glow.name = 'roofsMarks:glow';
    finish(glow, true);
    glow.receiveShadow = false;
    glow.renderOrder = 2;
    glow.userData.markGlow = true;
    glow.userData.noMerge = true;
    glow.userData.markRanges = glowRanges;
    group.add(glow);
    return glow;
  }
  return null;
}

// =============================================================================
// PART TWO (Task 8)
// =============================================================================

// Flush quads facing up, on the window atlas (roof lights, the skylight): the
// attributes addWindowQuads makes, so the two merge into one mesh. A quad is
// { x, y, z, w, d, cell }: its centre, its size along x and z, its cell.
function upQuads(list) {
  const n = list.length;
  const pos = new Float32Array(n * 12);
  const nor = new Float32Array(n * 12);
  const uv = new Float32Array(n * 8);
  const col = new Float32Array(n * 12).fill(1);
  const idx = new Uint32Array(n * 6);
  const pad = 0.5 / ATLAS_SIZE;
  list.forEach((q, i) => {
    const u0 = (q.cell % 4) / 4 + pad;
    const u1 = (q.cell % 4 + 1) / 4 - pad;
    const v0 = Math.floor(q.cell / 4) / 4 + pad;
    const v1 = (Math.floor(q.cell / 4) + 1) / 4 - pad;
    const corners = [[-1, 1, u0, v0], [1, 1, u1, v0], [1, -1, u1, v1], [-1, -1, u0, v1]];
    corners.forEach(([sx, sz, u, v], c) => {
      const o = i * 4 + c;
      pos.set([q.x + (sx * q.w) / 2, q.y, q.z + (sz * q.d) / 2], o * 3);
      nor.set([0, 1, 0], o * 3);
      uv.set([u, v], o * 2);
    });
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// A window on a wall facing +-x or +-z (nx, nz), with a stone sill under it.
function faceWindow(win, stone, x, y, z, nx, nz, w, h, cell) {
  win(x, y, z, nx, nz, w, h, cell);
  const sy = y - h / 2;
  if (nx) {
    const x0 = nx > 0 ? x : x - 0.08;
    stone(box(x0, x0 + 0.08, sy - 0.07, sy, z - w / 2 - 0.06, z + w / 2 + 0.06));
  } else {
    const z0 = nz > 0 ? z : z - 0.08;
    stone(box(x - w / 2 - 0.06, x + w / 2 + 0.06, sy - 0.07, sy, z0, z0 + 0.08));
  }
}

// A parapet just outside a roof's edge (x0..x1, z0..z1 is its own
// footprint, never over the roof she walks on), with a stone coping.
// Round two, Task G (critique finding 10): the coping was a smooth pale band
// with no joints. With `joint` (a put for a flat piece and its item), a dark
// line COPING.joint wide across its top about every COPING.every m, evenly
// along the run, COPING.lift over the stone (flush quads, casting nothing).
const COPING = Object.freeze({ h: 0.07, every: 0.9, joint: 0.015, lift: 0.002, color: 0x5e5850 });
function parapet(wall, stone, x0, x1, z0, z1, y, h = 0.45, joint = null) {
  wall(box(x0, x1, y - 0.15, y + h, z0, z1));
  stone(box(x0, x1, y + h, y + h + COPING.h, z0, z1));
  if (!joint) return;
  const alongX = x1 - x0 >= z1 - z0;
  const [a, c] = alongX ? [x0, x1] : [z0, z1];
  const n = Math.round((c - a) / COPING.every);
  const top = y + h + COPING.h + COPING.lift;
  for (let k = 1; k < n; k++) {
    const s = a + ((c - a) * k) / n;
    const g = new THREE.PlaneGeometry(alongX ? COPING.joint : x1 - x0, alongX ? z1 - z0 : COPING.joint);
    g.rotateX(-Math.PI / 2);
    g.translate(alongX ? s : (x0 + x1) / 2, top, alongX ? (z0 + z1) / 2 : s);
    joint(g, { id: `copingJoint:${x0.toFixed(2)},${z0.toFixed(2)}:${k}`, kind: 'copingJoint' });
  }
}

// The birds' perches on a block's parapets (roofsflock.js DRAWN_ID.parapet):
// spot n is 3n m clockwise round the block's edge from its north-west corner,
// on the coping's middle (PARAPET_MID out from the edge), pushed where a
// coping of `runs` ({ x0, x1, z0, z1, y }, y its top) lies under it with
// PARAPET_END to spare along it, and not over a street.
const PARAPET_EVERY = 3;
const PARAPET_MID = 0.125;
const PARAPET_END = 0.1;
function parapetPerches(drawn, blockId, k, runs) {
  const [w, d] = [k.x1 - k.x0, k.z1 - k.z0];
  const sides = [
    [w, (u) => [k.x0 + u, k.z0 - PARAPET_MID]], [d, (u) => [k.x1 + PARAPET_MID, k.z0 + u]],
    [w, (u) => [k.x1 - u, k.z1 + PARAPET_MID]], [d, (u) => [k.x0 - PARAPET_MID, k.z1 - u]],
  ];
  const e = PARAPET_END;
  for (let n = 0; PARAPET_EVERY * n < 2 * (w + d); n++) {
    let t = PARAPET_EVERY * n;
    let i = 0;
    while (t >= sides[i][0]) t -= sides[i++][0];
    const [x, z] = sides[i][1](t);
    if (STREETS.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)) continue;
    const run = runs.find((r) => x >= r.x0 + e && x <= r.x1 - e && z >= r.z0 + e && z <= r.z1 - e);
    if (run) drawn.push({ id: DRAWN_ID.parapet(blockId, n), kind: 'parapet', x, y: run.y, z });
  }
}

// Splits [a, b] round each gap centre (half-width `half`): the runs left.
function runsAround(a, c, gaps, half) {
  let runs = [[a, c]];
  for (const g of gaps) {
    runs = runs.flatMap(([p, q]) => (g + half <= p || g - half >= q ? [[p, q]] : [[p, g - half], [g + half, q]].filter(([u, v]) => v - u > 0.2)));
  }
  return runs;
}

// An iron railing from a to c ({ x, z }) along a ledge's edge at y: a top
// rail, a mid rail and posts, each post fixed to the ledge's side a little
// below its top.
function railRun(put, a, c, y, h = 0.55) {
  put(rod({ x: a.x, y: y + h, z: a.z }, { x: c.x, y: y + h, z: c.z }, 0.022, 5));
  put(rod({ x: a.x, y: y + h * 0.5, z: a.z }, { x: c.x, y: y + h * 0.5, z: c.z }, 0.014, 4));
  const n = Math.max(1, Math.round(Math.hypot(c.x - a.x, c.z - a.z) / 0.9));
  for (let i = 0; i <= n; i++) put(post(a.x + ((c.x - a.x) * i) / n, a.z + ((c.z - a.z) * i) / n, y - 0.12, h + 0.12, 0.018, 0.018, 5));
}

// A railing round a stage's edge (just outside it), open at every spot she
// climbs or drops over: `gaps` is { n, s, w, e } of coordinates along each side.
function railRect(put, r, y, gaps = {}) {
  const o = 0.04;
  const [x0, x1, z0, z1] = [r.x0 - o, r.x1 + o, r.z0 - o, r.z1 + o];
  for (const [p, q] of runsAround(x0, x1, gaps.n ?? [], 0.7)) railRun(put, { x: p, z: z0 }, { x: q, z: z0 }, y);
  for (const [p, q] of runsAround(x0, x1, gaps.s ?? [], 0.7)) railRun(put, { x: p, z: z1 }, { x: q, z: z1 }, y);
  for (const [p, q] of runsAround(z0, z1, gaps.w ?? [], 0.7)) railRun(put, { x: x0, z: p }, { x: x0, z: q }, y);
  for (const [p, q] of runsAround(z0, z1, gaps.e ?? [], 0.7)) railRun(put, { x: x1, z: p }, { x: x1, z: q }, y);
}

// The spot each climb (and the drop that mirrors it) crosses an edge at.
const climbOf = (id) => ROOFS_TRAVERSAL.climbs.find((c) => c.id === `${id}-up`);
const climbTo = (id) => climbOf(id).to;

// --- the corner shop: brick to the street, a shopfront and the bus's arch,
// lit windows, parapets.
// Round two, Task E (critique finding 11): a deeper painted buff (NORTH.shop),
// two pale stone string courses at the floor lines between its windows, and a
// cornice under the parapets, so it reads as a building, not a cardboard box.
const SHOP_DRESS = Object.freeze({
  courses: Object.freeze([2.8, 5.8]), // their feet (y), between the floors' windows
  h: 0.15, out: 0.06, stone: 0xcdc4b2, // the stone's own colour
  cornice: Object.freeze({ h: 0.2, out: 0.3 }), // tall, and proud of the wall (the parapets stand 0.25 out)
});
function drawShop(K, group, M, win, ground, drawn) {
  const wall = (g) => K.put('wall', M.wall, g, { tile: TILE.brick, color: NORTH.shop }); // painted (Task B)
  const stone = (g) => K.put('stone', M.stone, g);
  const painted = (g, color) => K.put('paint', M.paint, g, { color, noCast: true });
  const fw = (x, y, z, nx, nz, w, h, cell) => faceWindow(win, stone, x, y, z, nx, nz, w, h, cell);
  const S = BLOCK.cornerShop;
  const T = TERRACE;
  const top = S.y - 0.15;
  wall(box(S.x0, S.x1, L.STREET, top, S.z0, S.z1));
  group.add(own('cornerShop', M.felt, [box(S.x0, S.x1, top, S.y, S.z0, S.z1)], { tile: TILE.gravel, tag: { block: 'cornerShop' } }));
  feltPatches((geo, color, item) => K.put('paint', M.paint, geo, { color, noCast: true, item }), S, ground); // round two, Task F
  // a stone cornice under the parapets, on the faces over the street, the shop yard and the back
  // yards (round two, Task E: SHOP_DRESS.cornice proud, past the parapet's face; it was a 0.1 m band)
  const D = SHOP_DRESS;
  const c = D.cornice;
  stone(box(S.x1, S.x1 + c.out, top - c.h, top, S.z0, S.z1 + c.out));
  stone(box(S.x0 - c.out, S.x1 + c.out, top - c.h, top, S.z1, S.z1 + c.out));
  stone(box(S.x0 - c.out, S.x0, top - c.h, top, S.z0, T.z0));
  // and pale stone string courses at its floor lines on the same faces (flush pieces, casting nothing)
  for (const y of D.courses) {
    painted(box(S.x1, S.x1 + D.out, y, y + D.h, S.z0, S.z1 + D.out), D.stone);
    painted(box(S.x0 - D.out, S.x1 + D.out, y, y + D.h, S.z1, S.z1 + D.out), D.stone);
    painted(box(S.x0 - D.out, S.x0, y, y + D.h, S.z0, T.z0), D.stone);
  }
  // parapets: open on the terrace side where she climbs up from the last stack
  const up = climbTo('cornerShop');
  const joint = (g, item) => K.put('paint', M.paint, g, { color: COPING.color, noCast: true, item }); // round two, Task G
  const runs = []; // the copings, for the birds' perches
  const para = (x0, x1, z0, z1) => { runs.push({ x0, x1, z0, z1, y: S.y + 0.45 + COPING.h }); parapet(wall, stone, x0, x1, z0, z1, S.y, 0.45, joint); };
  for (const [z0, z1] of runsAround(S.z0, S.z1, [up.z], 0.7)) para(S.x0 - 0.25, S.x0, z0, z1);
  para(S.x1, S.x1 + 0.25, S.z0, S.z1 + 0.25);
  para(S.x0 - 0.25, S.x1, S.z1, S.z1 + 0.25);
  parapetPerches(drawn, 'cornerShop', S, runs);

  // over the street: the arch the bus goes under, the shopfront, three floors of windows
  const arch = { z0: BUS.z - BUS.width / 2 - 0.95, z1: BUS.z + BUS.width / 2 + 0.95, y1: L.STREET + BUS.height + 0.3 };
  painted(box(S.x0 - 0.02, S.x0, L.STREET, arch.y1, arch.z0, arch.z1), 0x0e0d10);
  stone(box(S.x0 - 0.12, S.x0, L.STREET, arch.y1, arch.z0 - 0.3, arch.z0));
  stone(box(S.x0 - 0.12, S.x0, L.STREET, arch.y1, arch.z1, arch.z1 + 0.3));
  stone(box(S.x0 - 0.12, S.x0, arch.y1, arch.y1 + 0.3, arch.z0 - 0.3, arch.z1 + 0.3));
  for (const z of [-2.6, 1.6]) win(S.x0, L.STREET + 1.9, z, -1, 0, 2.2, 2.0, warmCell(S.x0, z));
  painted(box(S.x0 - 0.04, S.x0, L.STREET, L.STREET + 2.3, -0.75, 0.15), 0x2f5a3a); // the shop door
  painted(box(S.x0 - 0.1, S.x0, L.STREET + 3.1, L.STREET + 3.7, -4.0, 2.9), 0x2f5a3a); // the fascia
  stone(box(S.x0 - 0.3, S.x0, L.STREET, L.STREET + 0.12, -4.0, 2.9)); // the step and stall riser
  for (const z of [-11.2, -7.5, -3.8, -0.4, 2.2]) for (const y of [1.4, 4.4, 7.3]) fw(S.x0, y, z, -1, 0, 0.9, 1.3);
  // over the shop yard and the back yards; the back door
  for (const z of [-10, -6, -2, 2, 6, 10]) for (const y of [1.5, 4.5, 7.5]) if (!(y === 1.5 && z === 2)) fw(S.x1, y, z, 1, 0, 0.9, 1.2);
  painted(box(S.x1, S.x1 + 0.05, 0, 2.1, 1.55, 2.45), 0x7a2b2b);
  for (const x of [32, 36]) for (const y of [1.5, 4.5, 7.5]) fw(x, y, S.z1, 0, 1, 0.9, 1.2);
  K.put('ironSmall', M.iron, box(S.x1, S.x1 + 0.1, 0, top, S.z1 - 0.45, S.z1 - 0.35), { noCast: true }); // a downpipe
}

// Round two, Task F (critique finding 5c): the warehouse roof, the biggest she
// reaches. Lead flashing along the parapets' feet (where a parapet stands:
// not by the tower, the stair or the gap she climbs through), cut round every
// take-off; four rainwater outlets near the parapets, each with a darker
// stain spreading from it; and its patches (clear of the roof lights).
const WAREHOUSE_OUTLETS = Object.freeze([[-40, -24, 1, 0], [-22, -50, 0, 1], [14, -50, 0, 1], [-6, -13, 0, -1]]); // [x, z, inward nx, nz]: on the parapet's line
function warehouseFelt(put, W, ground, lights, stairZ, gapX) {
  const F = FELT;
  const tower = BLOCK['tower-1'];
  const y = W.y + F.flashY;
  const [i0, i1] = [F.flash.in, F.flash.in + F.flash.w];
  // [from, to] along the edge, the edge, and which: runs where a parapet stands
  const runs = [
    ...[[W.x0, tower.x0], ...runsAround(tower.x1, W.x1, [gapX], 0.7)].map(([a, c]) => ['z', W.z1, -1, a, c]),
    ['z', W.z0, 1, W.x0, W.x1],
    ['x', W.x0, 1, W.z0, W.z1],
    ...[[W.z0, stairZ[0]], [stairZ[1], W.z1]].map(([a, c]) => ['x', W.x1, -1, a, c]),
  ];
  let n = 0;
  for (const [axis, e, inward, a0, c0] of runs) {
    // cut round every take-off within reach of the strip
    let pieces = [[a0 + i0, c0 - i0]];
    for (const t of TAKEOFFS) {
      const [along, across] = axis === 'z' ? [t.x, t.z] : [t.z, t.x];
      const off = (across - e) * inward; // how far in from the edge
      const reach = F.clear + 0.05;
      const d = off < i0 ? i0 - off : off > i1 ? off - i1 : 0;
      if (d >= reach) continue;
      const half = Math.sqrt(reach * reach - d * d);
      pieces = pieces.flatMap(([p, q]) => (along + half <= p || along - half >= q ? [[p, q]] : [[p, along - half], [along + half, q]].filter(([u, v]) => v - u > 0.2)));
    }
    for (const [p, q] of pieces) {
      const [z0, z1] = [e + inward * i0, e + inward * i1].sort((u, v) => u - v);
      const geo = axis === 'z' ? flatStrip(p, q, z0, z1, y) : flatStrip(z0, z1, p, q, y);
      put(geo, F.flash.color, { id: `flashing:${n++}`, kind: 'flashing' });
    }
  }
  // the outlets and their stains
  WAREHOUSE_OUTLETS.forEach(([ex, ez, nx, nz], i) => {
    const [x, z] = [ex + nx * F.outlet.in, ez + nz * F.outlet.in];
    const disc = new THREE.CircleGeometry(F.outlet.r, 8);
    disc.rotateX(-Math.PI / 2);
    disc.translate(x, W.y + F.outletY, z);
    put(disc, F.outlet.color, { id: `outlet:${i}`, kind: 'outlet' });
    const S = F.stain;
    const [sx, sz] = [x + nx * S.r * 0.55, z + nz * S.r * 0.55];
    put(feltPolygon(sx, sz, W.y + F.stainY, 6, S.r, S.r * S.wide, Math.atan2(nz, nx), i + 0.5), S.color, { id: `stain:${i}`, kind: 'stain' });
  });
  feltPatches(put, W, ground, [...lights, ...WAREHOUSE_OUTLETS.map(([ex, ez, nx, nz]) => ({ x: ex + nx * 0.6, z: ez + nz * 0.6, r: 0.8 }))]);
}

const TANK_PLANK = Object.freeze({ thick: 0.018, wide: 0.26, color: 0xc9ad7e, hoop: 0xb9c0c4 }); // a pale, sun-bleached plank on the dark lid
// --- the warehouse, and what stands on its roof: the tank, the loft, the
// lantern, roof lights; its stair down to the ginnel.
function drawWarehouse(K, group, M, win, upWin, ground, drawn) {
  const wall = (g, color = NORTH.warehouse) => K.put('wall', M.wall, g, { tile: TILE.brick, color }); // a darker brick (Task B)
  const stone = (g) => K.put('stone', M.stone, g);
  const iron = (g, noCast = false) => K.put(noCast ? 'ironSmall' : 'iron', M.iron, g, { noCast });
  const painted = (g, color) => K.put('paint', M.paint, g, { color, noCast: true });
  const fw = (x, y, z, nx, nz, w, h, cell) => faceWindow(win, stone, x, y, z, nx, nz, w, h, cell);
  const W = BLOCK.warehouse;
  const WS = BLOCK.warehouseStair;
  const stairZ = [Math.min(...WS.landings.map((l) => l.z0)), Math.max(...WS.landings.map((l) => l.z1))]; // -46..-30
  const top = W.y - 0.15;
  wall(box(W.x0, W.x1, L.STREET, top, W.z0, W.z1));
  group.add(own('warehouse', M.felt, [box(W.x0, W.x1, top, W.y, W.z0, W.z1)], { tile: TILE.gravel, tag: { block: 'warehouse' } }));
  // the stone band under the parapet (not beside the stair, whose top flight runs up the wall)
  const band = [top - 0.45, top - 0.2];
  stone(box(W.x0, W.x1, ...band, W.z1, W.z1 + 0.12));
  stone(box(W.x0 - 0.12, W.x0, ...band, W.z0, W.z1));
  for (const [z0, z1] of [[W.z0, stairZ[0]], [stairZ[1], W.z1]]) stone(box(W.x1, W.x1 + 0.12, ...band, z0, z1));
  // parapets: over the street (open where she climbs up from the corner shop), the side street, the north, the ginnel
  const tower = BLOCK['tower-1'];
  const up = climbTo('warehouse');
  const joint = (g, item) => K.put('paint', M.paint, g, { color: COPING.color, noCast: true, item }); // round two, Task G
  const runs = []; // the copings, for the birds' perches
  const para = (x0, x1, z0, z1) => { runs.push({ x0, x1, z0, z1, y: W.y + 0.5 + COPING.h }); parapet(wall, stone, x0, x1, z0, z1, W.y, 0.5, joint); };
  for (const [x0, x1] of [[W.x0 - 0.25, tower.x0], ...runsAround(tower.x1, W.x1 + 0.25, [up.x], 0.7)]) para(x0, x1, W.z1, W.z1 + 0.25);
  para(W.x0 - 0.25, W.x0, W.z0 - 0.25, W.z1);
  para(W.x0, W.x1 + 0.25, W.z0 - 0.25, W.z0);
  for (const [z0, z1] of [[W.z0, stairZ[0]], [stairZ[1], W.z1]]) para(W.x1, W.x1 + 0.25, z0, z1);
  parapetPerches(drawn, 'warehouse', W, runs);
  // the ginnel's far wall and its end
  wall(box(ROOFS_BOUNDS.maxX, ROOFS_BOUNDS.maxX + 0.3, 0, 2.4, W.z0 - 0.3, W.z1), BRICK.red); stone(box(ROOFS_BOUNDS.maxX - 0.05, ROOFS_BOUNDS.maxX + 0.35, 2.4, 2.5, W.z0 - 0.3, W.z1));
  wall(box(W.x1, ROOFS_BOUNDS.maxX, 0, 2.4, W.z0 - 0.3, W.z0), BRICK.red); stone(box(W.x1, ROOFS_BOUNDS.maxX, 2.4, 2.5, W.z0 - 0.35, W.z0 + 0.05));

  // the windows: four floors over the street and the side street, three over the ginnel
  const rows = [L.STREET + 2.0, 1.6, 4.9, 8.2];
  const doorsAt = new Set([5, 11]);
  for (let k = 0; k <= 16; k++) {
    const x = W.x0 + 2 + 3.6 * k;
    rows.forEach((y, r) => {
      if (r === 0 && doorsAt.has(k)) painted(box(x - 1.2, x + 1.2, L.STREET, L.STREET + 2.8, W.z1, W.z1 + 0.05), 0x5a3a2a); // loading doors
      else fw(x, y, W.z1, 0, 1, 1.5, r === 0 ? 1.7 : 2.0);
    });
  }
  for (let k = 0; k <= 9; k++) {
    const z = W.z0 + 2 + 3.6 * k;
    rows.forEach((y, r) => {
      if (k === 5 && r > 0 && r < 3) painted(box(W.x0 - 0.05, W.x0, y - 1.1, y + 1.1, z - 0.8, z + 0.8), 0x6b3a2a); // the loading doors under the hoist
      else fw(W.x0, y, z, -1, 0, 1.5, r === 0 ? 1.7 : 2.0);
    });
    if (k === 5) {
      iron(box(W.x0 - 1.3, W.x0, top - 0.95, top - 0.75, z - 0.1, z + 0.1)); // the hoist's beam
      iron(rod({ x: W.x0 - 1.15, y: top - 0.95, z }, { x: W.x0 - 1.15, y: top - 3.2, z }, 0.012, 4), true);
    }
  }
  for (const z of [-48.2, -27.6, -23.4, -19.2, -15]) for (const y of rows.slice(1)) fw(W.x1, y, z, 1, 0, 1.5, 2.0);

  // roof lights, flush with the felt, lit from below: the iron frame runs round
  // the glass's edge (Task C: it was one slab over the whole light, so the glass
  // never showed)
  const lights = [];
  for (const x of [-12, -4, 4]) {
    for (const z of [-22, -40]) {
      upWin(x, W.y + 0.02, z, 1.0, 2.2, warmCell(x, z));
      iron(frameRing(x - 0.5, x + 0.5, z - 1.1, z + 1.1, 0.06, W.y, W.y + 0.04), true);
      lights.push({ x, z, r: 1.5 });
    }
  }
  warehouseFelt((geo, color, item) => K.put('paint', M.paint, geo, { color, noCast: true, item }), W, ground, lights, stairZ, climbTo('warehouse').x);

  // the water tank: wooden staves, iron hoops, a hatch
  const T = BLOCK.tank;
  group.add(own('tank', M.wood, [post(T.x, T.z, L.WAREHOUSE, T.y - L.WAREHOUSE, T.r, T.r, 18)], { tile: TILE.wood, tag: { block: 'tank' } }));
  for (const y of [11.4, 11.9, 12.4]) iron(post(T.x, T.z, y, 0.07, T.r + 0.02, T.r + 0.02, 18), true);
  iron(box(T.x - 0.25, T.x + 0.25, T.y, T.y + 0.02, T.z - 0.6, T.z - 0.1), true);
  // Task D (critique finding 7): the long leap to the lantern goes off this
  // rim, so the tank shows it: a plank laid across the lid from behind the
  // take-off to the rim toward the lantern (under the glow, flush), and a
  // bright galvanised hoop round the rim, catching the light
  const ll = ROOFS_TRAVERSAL.gaps.find((g) => g.id === 'long-lantern');
  const [ux, uz] = [ll.to.x - ll.from.x, ll.to.z - ll.from.z].map((q, _, a) => q / Math.hypot(...a));
  const rimAt = T.r - Math.hypot(ll.from.x - T.x, ll.from.z - T.z) - 0.04; // from the take-off, ahead
  const back = Math.hypot(ll.from.x - T.x, ll.from.z - T.z) - 0.45; // stop short of the hatch
  painted(beam({ x: ll.from.x - ux * back, y: T.y + TANK_PLANK.thick, z: ll.from.z - uz * back }, { x: ll.from.x + ux * rimAt, y: T.y + TANK_PLANK.thick, z: ll.from.z + uz * rimAt }, TANK_PLANK.wide, TANK_PLANK.thick), TANK_PLANK.color);
  painted(new THREE.CylinderGeometry(T.r + 0.025, T.r + 0.025, 0.065, 18, 1, true).translate(T.x, T.y - 0.0375, T.z), TANK_PLANK.hoop);

  // the pigeon loft (discovery B): a timber hut, a row of holes, a landing board, a door
  const P = BLOCK.loft;
  K.put('shed', M.shed, box(P.x0 + 0.05, P.x1 - 0.05, L.WAREHOUSE, P.y - 0.15, P.z0 + 0.05, P.z1 - 0.05), { tile: TILE.wood });
  group.add(own('loft', M.felt, [box(P.x0 - 0.1, P.x1 + 0.1, P.y - 0.15, P.y, P.z0 - 0.1, P.z1 + 0.1)], { tile: TILE.gravel, tag: { block: 'loft' } }));
  for (let i = 0; i < 8; i++) {
    const x = P.x0 + 0.75 + i * 0.64;
    painted(box(x - 0.12, x + 0.12, 12.0, 12.24, P.z1 - 0.05, P.z1 - 0.03), 0x141215);
  }
  K.put('wood', M.wood, box(P.x0 + 0.3, P.x1 - 0.3, 11.86, 11.9, P.z1 - 0.05, P.z1 + 0.22), { noCast: true });
  painted(box(P.x1 - 0.05, P.x1 - 0.01, L.WAREHOUSE, 12.2, -46.2, -45.4), 0x3d6f73);

  // the lantern: a glazed light over the warehouse floor, lit from below (Long Leap only)
  const N = BLOCK.lantern;
  wall(box(N.x0, N.x1, L.WAREHOUSE, 11.45, N.z0, N.z1));
  iron(box(N.x0 + 0.03, N.x1 - 0.03, 11.45, N.y - 0.13, N.z0 + 0.03, N.z1 - 0.03));
  group.add(own('lantern', M.felt, [box(N.x0 - 0.05, N.x1 + 0.05, N.y - 0.13, N.y, N.z0 - 0.05, N.z1 + 0.05)], { tile: TILE.gravel, tag: { block: 'lantern' } }));
  const ly = (11.45 + N.y - 0.13) / 2;
  for (const x of [N.x0 + 1, N.x1 - 1]) for (const [z, nz] of [[N.z0 + 0.03, -1], [N.z1 - 0.03, 1]]) win(x, ly, z, 0, nz, 1.7, 0.8, warmCell(x, z));
  for (const z of [N.z0 + 1, N.z1 - 1]) for (const [x, nx] of [[N.x0 + 0.03, -1], [N.x1 - 0.03, 1]]) win(x, ly, z, nx, 0, 1.7, 0.8, warmCell(x, z));

  // the stair down to the ginnel: four iron flights side by side, turning on landings
  const plates = [];
  for (const f of WS.flights) {
    const fx = (f.x0 + f.x1) / 2;
    plates.push(beam({ x: fx, y: f.y0, z: f.z0 }, { x: fx, y: f.y1, z: f.z1 }, f.x1 - f.x0, 0.05));
  }
  for (const l of WS.landings) plates.push(box(l.x0, l.x1, l.y - 0.05, l.y, l.z0, l.z1));
  group.add(own('warehouseStair', M.iron, plates, { tag: { block: 'warehouseStair' } }));
  for (const f of WS.flights) {
    const fx = (f.x0 + f.x1) / 2;
    const steps = Math.round(Math.hypot(f.z1 - f.z0, f.y1 - f.y0) / 0.45);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const p = { x: fx, y: f.y0 + (f.y1 - f.y0) * t + 0.03, z: f.z0 + (f.z1 - f.z0) * t };
      iron(beam(p, { x: fx, y: p.y + (f.y1 - f.y0) * 0.006, z: p.z + (f.z1 - f.z0) * 0.006 }, f.x1 - f.x0 - 0.1, 0.03), true);
    }
    for (const x of [f.x0 + 0.03, f.x1 - 0.03]) iron(beam({ x, y: f.y0 + 0.05, z: f.z0 }, { x, y: f.y1 + 0.05, z: f.z1 }, 0.06, 0.28));
    // its legs, under the middle
    const zm = (f.z0 + f.z1) / 2;
    const ym = (f.y0 + f.y1) / 2 - 0.3;
    if (ym > 0.3) for (const x of [f.x0 + 0.1, f.x1 - 0.1]) iron(box(x - 0.05, x + 0.05, 0, ym, zm - 0.05, zm + 0.05));
  }
  for (const l of WS.landings) {
    for (const [x, z] of [[l.x0 + 0.08, l.z0 + 0.08], [l.x1 - 0.08, l.z0 + 0.08], [l.x0 + 0.08, l.z1 - 0.08], [l.x1 - 0.08, l.z1 - 0.08]]) {
      if (x < W.x1 + 0.2) continue; // the landing beside the wall is carried by it
      iron(box(x - 0.05, x + 0.05, 0, l.y - 0.05, z - 0.05, z + 0.05));
    }
  }
  // a handrail up the outer flight, and round the landings' open ends
  const F1 = WS.flights[0];
  const put = (g) => iron(g, true);
  for (let i = 0; i < 6; i++) {
    const a = i / 6;
    const c = (i + 1) / 6;
    const at = (t) => ({ x: F1.x1 - 0.03, y: F1.y0 + (F1.y1 - F1.y0) * t + 0.9, z: F1.z0 + (F1.z1 - F1.z0) * t });
    put(rod(at(a), at(c), 0.022, 5));
    put(post(at(a).x, at(a).z, at(a).y - 0.9, 0.9, 0.018, 0.018, 5));
  }
  for (const l of WS.landings) {
    if (l.x0 < W.x1 + 0.2 && l.y >= L.WAREHOUSE - 1e-6) continue; // the top landing opens onto the roof
    const z = l.z0 < -40 ? l.z0 + 0.03 : l.z1 - 0.03;
    railRun(put, { x: l.x0 + 0.05, z }, { x: l.x1 - 0.05, z }, l.y, 0.9);
  }
}

// --- the clock tower: the landmark of the skyline. Its body below the first
// ledge is a top-level group with a fadeOccluder (R7); the rest is the kit.
// Beauty pass, Task C (critique finding 6): warm sandstone stages with pale
// dressings between them (the ledge, the cornices, the quoins, the clocks'
// panels), a verdigris band round the top drum, bigger and brighter clock faces
// in dark bezels, louvres in the bell openings, pinnacles on the belfry's corners.
const TOWER = Object.freeze({ stone: 0xc29a66, dressing: 0xe6dcc4, verdigris: 0x5fa08c, bezel: 0x1b1814, louvre: 0x7a7062, hands: 0x1a1612, ticks: 0x2a2420 });
// The clock: the belfry's storey is 1.5 m between two levels she walks, so the
// face (R 0.64, it was 0.55) and its bezel fill it; their panel stands 0.1 m
// proud, in front of the cornice.
const CLOCK = Object.freeze({ y: 13.33, r: 0.64, bezel: 0.07, half: 0.75, lo: 0.71, hi: 0.73, proud: 0.1 });
// The dial on the face she climbs (Task D): it fits under the cornice
// (bezel 12.62..13.86), and its pieces are pressed to within 3.5 cm of the wall.
const CLOCK_FLUSH = Object.freeze({ y: 13.24, r: 0.55, proud: 0.006, press: 0.45 });
// Whether a climb or drop on the tower goes over this side of a stage
// (`r`'s side at x or z, facing nx, nz): the face she climbs, kept clear.
const TOWER_HOPS = [...ROOFS_TRAVERSAL.climbs, ...ROOFS_TRAVERSAL.drops];
function climbedFace(r, x, z, nx, nz) {
  return TOWER_HOPS.some(({ from: a, to: c }) => (nx
    ? (a.x - x) * (c.x - x) < 0 && Math.abs(a.z + ((c.z - a.z) * (x - a.x)) / (c.x - a.x) - z) < (r.z1 - r.z0) / 2
    : (a.z - z) * (c.z - z) < 0 && Math.abs(a.x + ((c.x - a.x) * (z - a.z)) / (c.z - a.z) - x) < (r.x1 - r.x0) / 2));
}
const LOUVRE = Object.freeze({ dy: [-0.3, -0.02, 0.26], len: 1.0, depth: 0.1, thick: 0.03, tilt: 0.6, out: 0.05 });
const PINNACLE = Object.freeze({ off: 0.12, half: 0.09, y0: -0.45, y1: 0.42, cap: 0.45 }); // y from the belfry's top
function drawTower(K, group, M, scene, drawn, hands) {
  const stone = (g, color = TOWER.dressing) => K.put('stone', M.stone, g, { color });
  const painted = (g, color) => K.put('paint', M.paint, g, { color, noCast: true });
  const rail = (g) => K.put('ironSmall', M.iron, g, { noCast: true });
  const T1 = BLOCK['tower-1'];
  const BF = BLOCK.belfry;
  const LS = BLOCK.lanternStage;
  const TT = BLOCK.towerTop;
  const LEDGE = 12.3; // the first ledge: the body below it fades
  const cx = (T1.x0 + T1.x1) / 2;
  const cz = (T1.z0 + T1.z1) / 2;

  // the body, from the warehouse roof to the first ledge, centred on the tower
  const body = new THREE.Group();
  body.name = 'roofsTowerBody';
  body.position.set(cx, 0, cz);
  const bodyMesh = own('roofsTowerBody:stone', M.stone, [box(T1.x0 - cx, T1.x1 - cx, L.WAREHOUSE, LEDGE, T1.z0 - cz, T1.z1 - cz)], { color: TOWER.stone });
  body.add(bodyMesh);
  const half = Math.hypot(T1.x1 - T1.x0, T1.z1 - T1.z0) / 2;
  body.userData.fadeOccluder = [{ t: 'cyl', r: half, y0: L.WAREHOUSE, y1: LEDGE }];
  scene.add(body);

  // the first ledge (tower-1's ring) and the stages above, each a block's top
  group.add(own('tower-1', M.stone, [box(T1.x0 - 0.1, T1.x1 + 0.1, LEDGE, T1.y, T1.z0 - 0.1, T1.z1 + 0.1)], { color: TOWER.dressing, tag: { block: 'tower-1' } }));
  // the birds' perches on the ring: its corners, clockwise from the north-west, half way to the belfry
  const inset = (BLOCK.belfry.x0 - T1.x0) / 2;
  [[T1.x0 + inset, T1.z0 + inset], [T1.x1 - inset, T1.z0 + inset], [T1.x1 - inset, T1.z1 - inset], [T1.x0 + inset, T1.z1 - inset]]
    .forEach(([x, z], n) => drawn.push({ id: DRAWN_ID.parapet('tower-1', n), kind: 'parapet', x, y: T1.y, z }));
  group.add(own('belfry', M.stone, [box(BF.x0, BF.x1, T1.y, BF.y, BF.z0, BF.z1)], { color: TOWER.stone, tag: { block: 'belfry' } }));
  stone(box(BF.x0 - 0.08, BF.x1 + 0.08, BF.y - 0.22, BF.y - 0.1, BF.z0 - 0.08, BF.z1 + 0.08)); // its cornice
  group.add(own('lanternStage', M.stone, [box(LS.x0, LS.x1, BF.y, LS.y, LS.z0, LS.z1)], { color: TOWER.stone, tag: { block: 'lanternStage' } }));
  stone(box(LS.x0 - 0.08, LS.x1 + 0.08, LS.y - 0.22, LS.y - 0.1, LS.z0 - 0.08, LS.z1 + 0.08));
  group.add(own('towerTop', M.stone, [post(TT.x, TT.z, LS.y, TT.y - LS.y, TT.r, TT.r, 18)], { color: TOWER.stone, tag: { block: 'towerTop' } }));
  // the drum's cornice: copper gone green (Task D: 3 cm proud, it was 6, so it
  // lies flush where she climbs up onto the drum's top)
  stone(post(TT.x, TT.z, TT.y - 0.2, 0.1, TT.r + 0.03, TT.r + 0.03, 18), TOWER.verdigris);
  // a pinnacle on each of the belfry's corners, out beyond its railing (and
  // high over the ledge's ring below): a shaft from under the cornice, a cap
  for (const [x, z, sx, sz] of [[BF.x0, BF.z0, -1, -1], [BF.x1, BF.z0, 1, -1], [BF.x0, BF.z1, -1, 1], [BF.x1, BF.z1, 1, 1]]) {
    const px = x + sx * PINNACLE.off;
    const pz = z + sz * PINNACLE.off;
    const h = PINNACLE.half;
    stone(box(px - h, px + h, BF.y + PINNACLE.y0, BF.y + PINNACLE.y1, pz - h, pz + h), TOWER.stone);
    const cap = new THREE.ConeGeometry(h * Math.SQRT2 + 0.005, PINNACLE.cap, 4, 1, true);
    cap.rotateY(Math.PI / 4);
    cap.translate(px, BF.y + PINNACLE.y1 + PINNACLE.cap / 2, pz);
    stone(cap);
  }
  // quoins on the body's corners, and the bell openings in the lantern stage
  for (const [x, z] of [[T1.x0, T1.z0], [T1.x1, T1.z0], [T1.x0, T1.z1], [T1.x1, T1.z1]]) stone(box(x - 0.06, x + 0.06, L.WAREHOUSE, LEDGE, z - 0.06, z + 0.06));
  const lsy = (BF.y + LS.y) / 2;
  for (const [x, z, nx, nz] of [[cx, LS.z0, 0, -1], [cx, LS.z1, 0, 1], [LS.x0, cz, -1, 0], [LS.x1, cz, 1, 0]]) {
    const [hw, hd] = nx ? [0.02, 0.55] : [0.55, 0.02];
    painted(box(x - hw + nx * 0.01, x + hw + nx * 0.01, lsy - 0.5, lsy + 0.45, z - hd + nz * 0.01, z + hd + nz * 0.01), 0x16141a);
    // three louvre slats across it, sloping down and out, lying close on the
    // wall; none on the face she climbs up past (Task D: they stood in her way)
    if (climbedFace(LS, x, z, nx, nz)) continue;
    for (const dy of LOUVRE.dy) {
      const slat = new THREE.BoxGeometry(LOUVRE.len, LOUVRE.thick, LOUVRE.depth);
      slat.rotateX(LOUVRE.tilt);
      slat.rotateY(Math.atan2(nx, nz));
      slat.translate(x + nx * LOUVRE.out, lsy + dy, z + nz * LOUVRE.out);
      painted(slat, TOWER.louvre);
    }
  }

  // the clock: a lit face on each side of the belfry, its hands at 7:10; hands
  // and tick marks only, never numbers
  const CY = CLOCK.y;
  const R = CLOCK.r;
  const P = CLOCK.proud;
  hands.focus = Object.freeze({ x: cx, y: CLOCK.y, z: cz }); // the faces' middle, for the life's in-view test
  const faces = [];
  const sides = [[BF.x0, cz, -1, 0], [BF.x1, cz, 1, 0], [cx, BF.z0, 0, -1], [cx, BF.z1, 0, 1]];
  for (const [x, z, nx, nz] of sides) {
    // the face she climbs up (the belfry climb, Task D): a smaller dial lying
    // flush on the wall, under the cornice, no panel, so nothing stands proud
    // in her way; the others stand out on their panels
    const flush = climbedFace(BF, x, z, nx, nz);
    const [R, CY, P] = flush ? [CLOCK_FLUSH.r, CLOCK_FLUSH.y, CLOCK_FLUSH.proud] : [CLOCK.r, CLOCK.y, CLOCK.proud];
    const k = R / CLOCK.r; // hands and ticks scaled to the face
    // a flush dial's pieces pressed toward the wall (their offset from it times CLOCK_FLUSH.press)
    const press = (g) => {
      if (!flush) return g;
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        if (nx) p.setX(i, x + (p.getX(i) - x) * CLOCK_FLUSH.press);
        else p.setZ(i, z + (p.getZ(i) - z) * CLOCK_FLUSH.press);
      }
      return g;
    };
    const disc = new THREE.CircleGeometry(R, 24);
    disc.rotateY(Math.atan2(nx, nz));
    disc.translate(x + nx * (P + 0.01), CY, z + nz * (P + 0.01));
    faces.push(press(disc));
    // the right of someone looking at the face, and up
    const rx = nz;
    const rz = -nx;
    // the pale stone panel it is set in, standing proud of the wall
    const [i0, i1] = nx ? [x - nx * 0.02, x + nx * P].sort((p, q) => p - q) : [z - nz * 0.02, z + nz * P].sort((p, q) => p - q);
    if (flush) { /* none */ } else if (nx) stone(box(i0, i1, CY - CLOCK.lo, CY + CLOCK.hi, z - CLOCK.half, z + CLOCK.half));
    else stone(box(x - CLOCK.half, x + CLOCK.half, CY - CLOCK.lo, CY + CLOCK.hi, i0, i1));
    // the dark bezel round the face
    const ring = new THREE.RingGeometry(R, R + CLOCK.bezel, 24);
    ring.rotateY(Math.atan2(nx, nz));
    ring.translate(x + nx * (P + 0.012), CY, z + nz * (P + 0.012));
    painted(press(ring), TOWER.bezel);
    const at = (theta, rad, off = P + 0.03) => ({ x: x + nx * off + rx * Math.sin(theta) * rad, y: CY + Math.cos(theta) * rad, z: z + nz * off + rz * Math.sin(theta) * rad });
    const centre = at(0, 0);
    const hour = ((7 + 10 / 60) / 12) * Math.PI * 2;
    const minute = (10 / 60) * Math.PI * 2;
    // each hand keeps how to redraw itself (clockhands.js moves it with the real time)
    for (const [len, r, which] of [[0.35, 0.035, 'hour'], [0.52, 0.024, 'minute']]) {
      const make = (theta) => press(rod(centre, at(theta, len * k), r, 5));
      hands.push({ ...painted(make(which === 'hour' ? hour : minute), TOWER.hands), which, make });
    }
    for (let i = 0; i < 12; i++) painted(press(rod(at((i / 12) * Math.PI * 2, 0.5 * k, P + 0.02), at((i / 12) * Math.PI * 2, 0.59 * k, P + 0.02), i % 3 ? 0.014 : 0.026, 4)), TOWER.ticks);
  }
  group.add(own('roofsClockFaces', M.clock, faces, { noCast: true, tag: { clockFaces: true } }));

  // the railings round each stage, open where she climbs and drops over the edge
  const t1 = climbTo('tower-1');
  const bf = climbTo('belfry');
  const ls = climbTo('lanternStage');
  railRect(rail, T1, T1.y, { w: [t1.z] });
  railRect(rail, BF, BF.y, { n: [bf.x] });
  railRect(rail, LS, LS.y, { e: [ls.z] });
  const from = climbOf('towerTop').from;
  const gapAt = Math.atan2(from.z - TT.z, from.x - TT.x); // the side she comes up on
  const segs = 16;
  const rr = TT.r + 0.04;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const c = ((i + 1) / segs) * Math.PI * 2;
    const mid = (a + c) / 2;
    if (Math.abs(Math.atan2(Math.sin(mid - gapAt), Math.cos(mid - gapAt))) < 0.75) continue;
    railRun(rail, { x: TT.x + Math.cos(a) * rr, z: TT.z + Math.sin(a) * rr }, { x: TT.x + Math.cos(c) * rr, z: TT.z + Math.sin(c) * rr }, TT.y);
  }

  // the weathervane (discovery C): a mast to VANE_TIP, the four letters, the
  // arrow. Its own mesh (roofsVane) on its own gold, outside the kit, so the
  // tower view (roofsmoments.js) can fade it while the view is in: she stands
  // just south of the mast and the view looks south, so the mast and the
  // letters would split the picture (step 5 fix wave, I1). It casts nothing,
  // as the kit's gold never did.
  const vanePieces = [];
  const gold = (g) => vanePieces.push(g);
  const MAST = 0.05;
  const BALL = 0.1;
  gold(post(VANE.x, VANE.z, TT.y, VANE_TIP - 2 * BALL - TT.y, MAST * 0.7, MAST, 6));
  const ball = new THREE.IcosahedronGeometry(BALL, 1);
  ball.translate(VANE.x, VANE_TIP - BALL, VANE.z);
  gold(ball);
  const ay = 18.5;
  gold(rod({ x: VANE.x - 0.55, y: ay, z: VANE.z }, { x: VANE.x + 0.55, y: ay, z: VANE.z }, 0.015, 4));
  gold(rod({ x: VANE.x, y: ay, z: VANE.z - 0.55 }, { x: VANE.x, y: ay, z: VANE.z + 0.55 }, 0.015, 4));
  // each letter in the plane facing out along its arm, read from outside
  const LETTERS = {
    N: [[-0.4, -0.5, -0.4, 0.5], [-0.4, 0.5, 0.4, -0.5], [0.4, -0.5, 0.4, 0.5]],
    E: [[-0.35, -0.5, -0.35, 0.5], [-0.35, 0.5, 0.4, 0.5], [-0.35, 0, 0.3, 0], [-0.35, -0.5, 0.4, -0.5]],
    S: [[0.4, 0.5, -0.4, 0.5], [-0.4, 0.5, -0.4, 0], [-0.4, 0, 0.4, 0], [0.4, 0, 0.4, -0.5], [0.4, -0.5, -0.4, -0.5]],
    W: [[-0.5, 0.5, -0.25, -0.5], [-0.25, -0.5, 0, 0.2], [0, 0.2, 0.25, -0.5], [0.25, -0.5, 0.5, 0.5]],
  };
  const SIZE = 0.22;
  for (const [ch, dx, dz] of [['N', 0, -1], ['S', 0, 1], ['E', 1, 0], ['W', -1, 0]]) {
    const ox = VANE.x + dx * 0.7;
    const oz = VANE.z + dz * 0.7;
    const rx = dz; // the right of someone reading it from outside
    const rz = -dx;
    for (const [u0, v0, u1, v1] of LETTERS[ch]) {
      gold(rod({ x: ox + rx * u0 * SIZE, y: ay + v0 * SIZE, z: oz + rz * u0 * SIZE }, { x: ox + rx * u1 * SIZE, y: ay + v1 * SIZE, z: oz + rz * u1 * SIZE }, 0.014, 4));
    }
  }
  const vy = 19.35;
  const yaw = ROOFS_WIND.from; // where the wind is from tonight
  const [ux, uz] = [Math.cos(yaw), Math.sin(yaw)];
  const tip = { x: VANE.x + ux * 0.6, y: vy, z: VANE.z + uz * 0.6 };
  const tail = { x: VANE.x - ux * 0.55, y: vy, z: VANE.z - uz * 0.55 };
  gold(rod(tail, tip, 0.018, 5));
  const head = new THREE.ConeGeometry(0.09, 0.24, 4);
  head.rotateZ(-Math.PI / 2);
  head.rotateY(-yaw);
  head.translate(tip.x + ux * 0.1, vy, tip.z + uz * 0.1);
  gold(head);
  for (const s of [-1, 1]) {
    gold(turnedBox(tail.x + ux * 0.1, tail.z + uz * 0.1, vy - 0.02 + s * 0.08 - (s < 0 ? 0.12 : 0), 0.3, 0.16, 0.012, -yaw));
  }
  const vaneGold = M.gold.clone();
  vaneGold.transparent = true;
  vaneGold.opacity = 1;
  // never merged: the life keeps this very mesh to fade
  const vane = own('roofsVane', vaneGold, vanePieces, { noCast: true, tag: { vane: true, noMerge: true } });
  group.add(vane);
  return vane;
}

// --- the six discoveries' props: the garden (A), the skylight (D), the
// telescope (E). The loft (B), the vane (C) and the chimney's cowl (F) are
// drawn with the warehouse, the tower and the stacks.
function drawDiscoveries(K, group, M, upWin) {
  const painted = (g, color) => K.put('paint', M.paint, g, { color, noCast: true });
  const wood = (g) => K.put('wood', M.wood, g, { noCast: true });
  const iron = (g) => K.put('ironSmall', M.iron, g, { noCast: true });
  const RT = BLOCK.roofTerrace;
  const y = RT.y;

  // A. the rooftop garden: a bench by the back wall, tomatoes in pots, a watering can, string lights
  const B = GARDEN.bench;
  const [bx0, bx1] = [B.x - B.len / 2, B.x + B.len / 2];
  wood(box(bx0, bx1, y + B.seat - 0.05, y + B.seat, B.z - 0.2, B.z + 0.2));
  wood(box(bx0, bx1, y + B.seat + 0.1, y + 0.9, RT.z0 + 0.04, RT.z0 + 0.09));
  // two back uprights from the seat's back edge up to the backrest's foot, so the back is joined to the seat (round two, Task E)
  for (const x of [bx0 + 0.1, bx1 - 0.1]) {
    const { matrix, len } = along({ x, y: y + B.seat - 0.03, z: B.z - 0.17 }, { x, y: y + B.seat + 0.13, z: RT.z0 + 0.065 });
    wood(new THREE.BoxGeometry(len, 0.06, 0.05).applyMatrix4(matrix));
  }
  for (const x of [bx0 + 0.08, bx1 - 0.08]) for (const z of [B.z - 0.15, B.z + 0.15]) wood(box(x - 0.03, x + 0.03, y, y + B.seat - 0.05, z - 0.03, z + 0.03));
  GARDEN.pots.forEach((p, i) => {
    painted(post(p.x, p.z, y, 0.32, 0.19, 0.14, 10), 0xb8613f);
    const leaf = new THREE.IcosahedronGeometry(0.24, 0);
    leaf.scale(1, 1.5, 1);
    leaf.rotateY(i * 1.1);
    leaf.translate(p.x, y + 0.62, p.z);
    painted(leaf, 0x3f7a35);
    wood(rod({ x: p.x + 0.05, y: y + 0.3, z: p.z }, { x: p.x + 0.05, y: y + 1.15, z: p.z }, 0.012, 4)); // its cane
    for (let k = 0; k < 3; k++) {
      const a = i * 2 + k * 2.1;
      const t = new THREE.IcosahedronGeometry(0.05, 0);
      t.translate(p.x + Math.cos(a) * 0.2, y + 0.5 + k * 0.12, p.z + Math.sin(a) * 0.2);
      painted(t, 0xd23a2a);
    }
  });
  const C = GARDEN.can;
  painted(post(C.x, C.z, y, 0.22, 0.1, 0.12, 10), 0x3d7a5a);
  painted(rod({ x: C.x - 0.08, y: y + 0.08, z: C.z }, { x: C.x - 0.32, y: y + 0.26, z: C.z }, 0.015, 5), 0x3d7a5a);
  painted(rod({ x: C.x + 0.06, y: y + 0.2, z: C.z }, { x: C.x + 0.13, y: y + 0.3, z: C.z }, 0.012, 4), 0x3d7a5a);
  // the string lights: two strands from the back wall to poles on the party walls' copings
  const back = RT.z0 + 0.06;
  const front = RT.z1 - 0.15;
  const poles = [{ x: RT.x0 - 0.11, z: front }, { x: RT.x1 + 0.11, z: front }];
  for (const p of poles) iron(post(p.x, p.z, y, 1.3, 0.025, 0.03, 6));
  const bulbs = [];
  for (const [p, far] of [[poles[0], RT.x1 - 0.3], [poles[1], RT.x0 + 0.3]]) {
    const a = { x: p.x, y: y + 1.27, z: p.z };
    const c = { x: far, y: y + 1.15, z: back };
    const n = 10;
    const at = (t) => ({ x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t - 0.35 * Math.sin(Math.PI * t), z: a.z + (c.z - a.z) * t });
    for (let i = 0; i < n; i++) iron(rod(at(i / n), at((i + 1) / n), 0.006, 3));
    for (let i = 1; i < n; i++) {
      const q = at(i / n);
      const g = new THREE.IcosahedronGeometry(0.035, 0);
      g.translate(q.x, q.y - 0.05, q.z);
      bulbs.push(g);
    }
  }
  group.add(own('roofsGardenLights', M.bulbs, bulbs, { noCast: true }));

  // D. the skylight on the flat-roofed house: a lead frame round a lit pane, flush with the roof
  const F = BLOCK.flatHouse;
  const S = SKYLIGHT;
  upWin(S.x, F.y + 0.03, S.z, S.w, S.d, warmCell(S.x, S.z));
  for (const [x0, x1, z0, z1] of [
    [S.x - S.w / 2 - 0.06, S.x + S.w / 2 + 0.06, S.z - S.d / 2 - 0.06, S.z - S.d / 2],
    [S.x - S.w / 2 - 0.06, S.x + S.w / 2 + 0.06, S.z + S.d / 2, S.z + S.d / 2 + 0.06],
    [S.x - S.w / 2 - 0.06, S.x - S.w / 2, S.z - S.d / 2, S.z + S.d / 2],
    [S.x + S.w / 2, S.x + S.w / 2 + 0.06, S.z - S.d / 2, S.z + S.d / 2],
  ]) iron(box(x0, x1, F.y, F.y + 0.05, z0, z1));

  // E. the telescope on the corner shop, on its tripod, looking up to the north-east; the crate beside it
  const sy = BLOCK.cornerShop.y;
  const head = { x: TELESCOPE.x, y: sy + 0.95, z: TELESCOPE.z };
  for (const a of [0.4, 2.5, 4.6]) iron(rod({ x: head.x + Math.cos(a) * 0.32, y: sy, z: head.z + Math.sin(a) * 0.32 }, head, 0.018, 5));
  const look = { x: 0.35, y: 0.62, z: -0.7 };
  const len = Math.hypot(look.x, look.y, look.z);
  const dir = { x: look.x / len, y: look.y / len, z: look.z / len };
  const tube = (r, from, to) => K.put('gold', M.gold, rod({ x: head.x + dir.x * from, y: head.y + dir.y * from, z: head.z + dir.z * from }, { x: head.x + dir.x * to, y: head.y + dir.y * to, z: head.z + dir.z * to }, r, 10), { noCast: true });
  tube(0.055, -0.35, 0.55);
  tube(0.075, 0.45, 0.62);
  tube(0.03, -0.48, -0.35);
  const T = TELESCOPE_CRATE;
  K.put('wood', M.wood, turnedBox(T.x, T.z, sy, T.s, T.s, T.s, T.yaw), { noCast: true });
}

// --- the street below (R3): the road and its pavements at -4, three lamps,
// the end house over the street's west end, and the bus. Returns the bus.
function drawStreet(scene, group, M, win) {
  const K = makeKit('roofsStreet');
  const wall = (g) => K.put('wall', M.wall, g, { tile: TILE.brick, color: NORTH.endHouse });
  const stone = (g) => K.put('stone', M.stone, g);
  const painted = (g, color) => K.put('paint', M.paint, g, { color, noCast: true });
  const pave = (x0, x1, z0, z1) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, L.STREET + 0.006, (z0 + z1) / 2);
    K.put('pavement', M.pavement, g, { noCast: true, tile: TILE.flagstone });
  };
  const y = L.STREET;
  // the road: each street block's ground, a top-level mesh like the ground at 0
  for (const id of ['street', 'sideStreet']) {
    const s = BLOCK[id];
    const plane = new THREE.PlaneGeometry(s.x1 - s.x0, s.z1 - s.z0);
    plane.rotateX(-Math.PI / 2);
    plane.translate((s.x0 + s.x1) / 2, y, (s.z0 + s.z1) / 2);
    const m = finish(new THREE.Mesh(prep(plane, { tile: TILE.gravel }), M.road), true);
    m.name = `roofsGround:${id}`;
    m.userData.ground = true;
    m.userData.block = id;
    scene.add(m);
  }
  // the pavements along each building's front, with kerbs; the far pavement past the side street
  const [street, side] = [BLOCK.street, BLOCK.sideStreet];
  const kerb = 0.12;
  const slabs = [
    [street.x0, street.x1, street.z1 - PAVEMENT, street.z1], // by the terrace
    [side.x1, street.x1, street.z0, street.z0 + PAVEMENT], // by the warehouse
    [side.x1 - PAVEMENT, side.x1, side.z0, street.z0 + PAVEMENT], // by the warehouse's west face
    [side.x0 - 3.5, side.x0, side.z0 - 8, street.z0 - 1.2], // the far side of the side street
  ];
  // flush with the road (so the lamps' pools lie on them), a raised kerb at each edge
  for (const r of slabs) pave(...r);
  stone(box(street.x0, street.x1, y, y + kerb + 0.01, street.z1 - PAVEMENT - 0.15, street.z1 - PAVEMENT));
  stone(box(side.x1, street.x1, y, y + kerb + 0.01, street.z0 + PAVEMENT, street.z0 + PAVEMENT + 0.15));
  stone(box(side.x1 - PAVEMENT - 0.15, side.x1 - PAVEMENT, y, y + kerb + 0.01, side.z0, street.z0 + PAVEMENT));
  // a dashed white line down the middle of the road
  const mid = (street.z0 + PAVEMENT + street.z1 - PAVEMENT) / 2;
  for (let x = street.x0 + 1; x < street.x1 - 2; x += 4) painted(box(x, x + 2, y, y + 0.012, mid - 0.06, mid + 0.06), 0xe8e4d8);
  roadMarks(K, M, street, side, mid); // round two, Task G
  // the lamps, on the pavements
  for (const p of STREET_LAMPS) {
    const lamp = b.lampPost(p.x, p.z);
    lamp.position.y = y;
    lamp.name = 'roofsStreetLamp';
    scene.add(lamp);
  }
  // the end house: the street runs under its arch at the west end
  const E = { x0: street.x0 - 10, x1: street.x0, z0: street.z0 - 1, z1: street.z1 + 0.2 }; // deep enough to hold the bus
  const eave = 7;
  wall(box(E.x0, E.x1, y, eave, E.z0, E.z1));
  const ridge = [[E.z0 - 0.2, eave], [(E.z0 + E.z1) / 2, eave + 2.6], [E.z1 + 0.2, eave]];
  K.put('slates', M.slates, extrudeX(ridge, E.x0 - 0.2, E.x1 + 0.2), { tile: TILE.shingle, color: NORTH.endSlates });
  const arch = { z0: BUS.z - BUS.width / 2 - 0.95, z1: BUS.z + BUS.width / 2 + 0.95, y1: y + BUS.height + 0.3 };
  painted(box(E.x1, E.x1 + 0.02, y, arch.y1, arch.z0, arch.z1), 0x0e0d10);
  stone(box(E.x1, E.x1 + 0.12, y, arch.y1, arch.z0 - 0.3, arch.z0));
  stone(box(E.x1, E.x1 + 0.12, y, arch.y1, arch.z1, arch.z1 + 0.3));
  stone(box(E.x1, E.x1 + 0.12, arch.y1, arch.y1 + 0.3, arch.z0 - 0.3, arch.z1 + 0.3));
  for (const z of [E.z0 + 1.6, arch.z1 + 1.5, E.z1 - 1.4]) for (const wy of [y + 2.2, 1.6, 4.6]) {
    if (wy === y + 2.2 && z > arch.z0 - 1 && z < arch.z1 + 1) continue;
    faceWindow(win, stone, E.x1, wy, z, 1, 0, 0.9, 1.3);
  }
  for (const m of K.meshes()) group.add(m);

  // the bus: one mesh, one material; its windows and lights glow by an emissive map
  return drawBus(scene);
}

// Round two, Task G (critique finding 10): the road was a flat black void.
// Double yellow lines along both kerbs of the street, a drain grate in the
// gutter here and there (dark, three iron bars across) and two round iron
// covers out in the lanes. All flush quads on the road (ROAD.y up, under the
// pavements' 0.006 and the lamps' pools), in the street's noCast paint.
const ROAD = Object.freeze({
  y: 0.005, barY: 0.0065,
  lines: Object.freeze([0.33, 0.47]), lineW: 0.08, lineColor: 0xd9a92a, // centres, from the kerb's face
  grate: Object.freeze({ l: 0.5, w: 0.24, in: 0.02, bar: 0.05, color: 0x0b0c0e, barColor: 0x5a5d62 }),
  grates: Object.freeze({ terrace: Object.freeze([-36, -9, 22]), warehouse: Object.freeze([-30, 6, 25]) }),
  covers: Object.freeze([Object.freeze({ x: -16, dz: 1.6 }), Object.freeze({ x: 8, dz: -1.7 })]), // dz from the middle line
  coverR: 0.35, coverColor: 0x4a4b50,
});
function roadMarks(K, M, street, side, mid) {
  const put = (g, color, item) => K.put('paint', M.paint, g, { color, noCast: true, item });
  const flat = (x0, x1, z0, z1, yy) => {
    const g = new THREE.PlaneGeometry(x1 - x0, Math.abs(z1 - z0));
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, yy, (z0 + z1) / 2);
    return g;
  };
  const y = L.STREET + ROAD.y;
  const kerbs = [
    { name: 'terrace', z: street.z1 - PAVEMENT - 0.15, dir: -1, x0: street.x0 + 0.2, x1: street.x1 - 0.2 },
    { name: 'warehouse', z: street.z0 + PAVEMENT + 0.15, dir: 1, x0: side.x1 + 0.2, x1: street.x1 - 0.2 },
  ];
  for (const k of kerbs) {
    ROAD.lines.forEach((d, i) => {
      const z = k.z + k.dir * d;
      put(flat(k.x0, k.x1, z - ROAD.lineW / 2, z + ROAD.lineW / 2, y), ROAD.lineColor, { id: `yellowLine:${k.name}:${i}`, kind: 'yellowLine' });
    });
    const G = ROAD.grate;
    ROAD.grates[k.name].forEach((x, i) => {
      const [za, zb] = [k.z + k.dir * G.in, k.z + k.dir * (G.in + G.w)];
      const bars = [-0.15, 0, 0.15].map((u) => flat(x + u - G.bar / 2, x + u + G.bar / 2, za, zb, L.STREET + ROAD.barY));
      const g = mergeGeometries([flat(x - G.l / 2, x + G.l / 2, za, zb, y), ...bars].map((q) => q.toNonIndexed()));
      const [dark, iron] = [new THREE.Color(G.color), new THREE.Color(G.barColor)];
      put(g, (_x, yy) => (yy > y + 0.0007 ? iron : dark), { id: `grate:${k.name}:${i}`, kind: 'grate' });
    });
  }
  ROAD.covers.forEach((c, i) => {
    const g = new THREE.CircleGeometry(ROAD.coverR, 8);
    g.rotateX(-Math.PI / 2);
    g.translate(c.x, y, mid + c.dz);
    put(g, ROAD.coverColor, { id: `cover:${i}`, kind: 'cover' });
  });
}

// The bus, built along +x round its own centre on the road, then put at the
// start of its route (roofslife.js moves it and hides it between runs).
const BUS_GLOW = Object.freeze({ none: 0.125, window: 0.375, lamp: 0.625, tail: 0.875 });
function drawBus(scene) {
  const data = new Uint8Array([0, 0, 0, 255, 255, 196, 120, 255, 255, 246, 220, 255, 255, 52, 30, 255]);
  const glow = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  glow.colorSpace = THREE.SRGBColorSpace;
  glow.magFilter = THREE.NearestFilter;
  glow.minFilter = THREE.NearestFilter;
  glow.generateMipmaps = false;
  glow.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 1.2 });
  const parts = [];
  const add = (geo, color, u = BUS_GLOW.none) => {
    const g = prep(geo, { color });
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u, 0.5);
    parts.push(g);
  };
  const hl = BUS.len / 2;
  const hw = BUS.width / 2;
  const red = 0xc4231b;
  add(box(-hl, hl, 0.35, 2.15, -hw, hw), red);
  add(box(-hl, hl, 2.15, 2.3, -hw - 0.02, hw + 0.02), 0xe8dcc0);
  add(box(-hl, hl, 2.3, BUS.height - 0.12, -hw, hw), red);
  add(box(-hl + 0.05, hl - 0.05, BUS.height - 0.12, BUS.height, -hw + 0.05, hw - 0.05), 0xa81d16);
  for (const s of [-1, 1]) {
    const z = s * (hw + 0.015);
    for (let i = 0; i < 6; i++) add(box(-3.6 + i * 1.25, -2.6 + i * 1.25, 1.1, 1.95, z - 0.015, z + 0.015), 0x3a2a18, BUS_GLOW.window);
    for (let i = 0; i < 7; i++) add(box(-4.0 + i * 1.18, -3.1 + i * 1.18, 2.75, 3.6, z - 0.015, z + 0.015), 0x3a2a18, BUS_GLOW.window);
    for (const x of [-3.0, 3.0]) {
      const w = new THREE.CylinderGeometry(0.45, 0.45, 0.3, 12);
      w.rotateX(Math.PI / 2);
      w.translate(x, 0.45, s * (hw - 0.1));
      add(w, 0x1c1c1e);
    }
    add(box(hl, hl + 0.03, 0.6, 0.85, s * 0.85 - 0.15, s * 0.85 + 0.15), 0xfff4d0, BUS_GLOW.lamp);
    add(box(-hl - 0.03, -hl, 0.6, 0.85, s * 0.9 - 0.12, s * 0.9 + 0.12), 0x8a1810, BUS_GLOW.tail);
  }
  add(box(hl, hl + 0.02, 1.1, 2.0, -hw + 0.2, hw - 0.2), 0x3a2a18, BUS_GLOW.window);
  add(box(hl, hl + 0.02, 2.75, 3.6, -hw + 0.2, hw - 0.2), 0x3a2a18, BUS_GLOW.window);
  add(box(hl, hl + 0.025, 2.38, 2.62, -0.7, 0.7), 0xffb040, BUS_GLOW.window); // where it is going
  const bus = finish(new THREE.Mesh(mergeGeometries(parts), mat), true);
  bus.receiveShadow = false;
  bus.name = 'roofsBus';
  bus.userData.bus = true;
  bus.userData.noMerge = true;
  bus.position.set(BUS.x0, L.STREET, BUS.z);
  bus.visible = false;
  scene.add(bus);
  return bus;
}

// --- the far town: rows of houses round the place, out into the haze. One
// unlit mesh in vertex colours (fogged like everything else), never cast,
// never merged, at the top level (builder.horizonBand's pattern), with the
// town's ground under it.
// Beauty pass, Task A (critique finding 2): dark, cool silhouettes that stand
// against the sky glow, not a lilac fence brighter than the sky; three to five
// lit windows on every front (from the top floor down: the row in front hides
// the ground floors), a roof light on half the roofs, and lines of street
// lights down side streets that run out through the rows, their colours in
// HDR (TOWN_LIGHT.k times a warm colour: the Float32 colour attribute is not
// clamped, so after the fog's mix they still read as lights);
// a skyline with landmarks (two blocks of flats, a mill chimney, a gasholder, a
// second clock tower, the two spires) and dark tree clumps between the rows.
// Round two, Task E (critique finding 9): evenly dark, with its back rows the
// tallest, the town read as near and huge, a wall that hid the glow. Now
// aerial perspective: walls and roofs mixed toward the dusk horizon by how far
// out they stand (TOWN_HAZE: 0 at the front row, 0.22 at the second, 0.4 at the
// third and beyond), and the back rows lower than they were (h 4..10.5 and
// 6..12.5), so the skyline steps down into the haze and the glow shows over
// it. The lights less blown, so they stay amber after the fog: windows
// TOWN_LIGHT.window at k 2.8, roof lights small squares (TOWN_ROOF_LIGHT) at 2.6.
// Round two, Task G (Task E's review): from the warehouse roof at her eye the
// lowered town hid under the parapet, an empty pink band; the back row's
// tallest are 2 m higher again (h up to 11.5, it was 9.5), so a few of its
// roofs and roof lights show over the parapet, still hazed and still lower
// than round one's 12.5.
const TOWN_ROWS = Object.freeze([
  { s: 52.5, depth: 7, h: [2, 7] },
  { s: 66, depth: 9, h: [3.5, 8.5] },
  { s: 84, depth: 12, h: [4.5, 11.5] }, // Task G: 9.5 hid it all under the warehouse's parapet
]);
const TOWN_HAZE = Object.freeze([[52.5, 0], [66, 0.22], [84, 0.4]]); // [s, how far toward the horizon], linear between, held past the ends
const TOWN_KEEP_OUT = Object.freeze([
  { x0: ROOFS_BOUNDS.minX - 0.8, x1: ROOFS_BOUNDS.maxX + 0.8, z0: ROOFS_BOUNDS.minZ - 0.8, z1: ROOFS_BOUNDS.maxZ + 0.8 },
  { x0: BLOCK.street.x0 - 10.5, x1: BLOCK.street.x0, z0: BLOCK.street.z0 - 1.5, z1: BLOCK.street.z1 + 0.7 }, // the end house
]);
const TOWN_WALL = Object.freeze([0x221e2c, 0x342a3a]);
const TOWN_ROOF = Object.freeze([0x15131c, 0x221d29]);
const TOWN_TREE = Object.freeze([0x16211d, 0x1f2a26]);
// the lights: windows warm, street lamps a paler sodium, the chimney's red lamp
const TOWN_LIGHT = Object.freeze({ window: 0xff9c3a, lamp: 0xffc46a, red: 0xff3a24, clock: 0xfff0c8, k: 4, windowK: 2.8 });
const TOWN_ROOF_LIGHT = Object.freeze({ w: 0.45, h: 0.32, at: 0.45, k: 2.6 }); // its width (m) and height (of the slope), centred at `at` up it
// the side streets: running out from the place through every row, at these
// places along each side (u, nudged per side by hash01), each with a line of
// street lights down one kerb, TOWN_LAMP.every apart from TOWN_LAMP.s to the
// town's edge; the gaps between the rows (TOWN_GAPS) hold the tree clumps
const TOWN_STREETS = Object.freeze([-34, 0, 31]);
const TOWN_STREET_HALF = 3.2;
const TOWN_LAMP = Object.freeze({ s: 50, to: 100, every: 7, kerb: 2.3, y: 4.2, size: 0.5 });
const TOWN_GAPS = Object.freeze([58.8, 74.2]);
function drawTown(scene) {
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  const tri = (p, q, r, hex, k = 1) => {
    pos.push(...p, ...q, ...r);
    c.setHex(hex).multiplyScalar(k);
    for (let i = 0; i < 3; i++) col.push(c.r, c.g, c.b);
  };
  const quad = (p, q, r, s, hex, k) => { tri(p, q, r, hex, k); tri(p, r, s, hex, k); };
  const cx = (ROOFS_BOUNDS.minX + ROOFS_BOUNDS.maxX) / 2;
  const cz = (ROOFS_BOUNDS.minZ + ROOFS_BOUNDS.maxZ) / 2;
  const y0 = L.STREET;
  const dim = (hex, k) => mixHex(0, hex, k);
  const blocked = (x, z, hw, hd) => TOWN_KEEP_OUT.some((r) => x + hw > r.x0 && x - hw < r.x1 && z + hd > r.z0 && z - hd < r.z1);
  // a wall's or a roof's colour at (x, z), mixed toward the dusk horizon by how far out it stands
  const hazed = (hex, x, z) => {
    const s = Math.max(Math.abs(x - cx), Math.abs(z - cz));
    const H = TOWN_HAZE;
    let k = s <= H[0][0] ? H[0][1] : H[H.length - 1][1];
    for (let i = 0; i + 1 < H.length; i++) if (s > H[i][0] && s <= H[i + 1][0]) k = H[i][1] + (H[i + 1][1] - H[i][1]) * (s - H[i][0]) / (H[i + 1][0] - H[i][0]);
    return mixHex(hex, SKY_DUSK.horizon, k);
  };
  // a light: a small square at (x, y, z) facing the place's middle
  function light(x, y, z, size, hex, k = TOWN_LIGHT.k) {
    const dx = cx - x;
    const dz = cz - z;
    const n = Math.hypot(dx, dz);
    const [tx, tz] = [-dz / n * size / 2, dx / n * size / 2];
    const h = size / 2;
    quad([x - tx, y - h, z - tz], [x + tx, y - h, z + tz], [x + tx, y + h, z + tz], [x - tx, y + h, z - tz], hex, k);
  }
  // a box of walls (no floor) with a flat top, centre (x, z), t along, n toward the place
  function walls(P, a, e, ya, yb, wallHex) {
    quad(P(-a, e, ya), P(a, e, ya), P(a, e, yb), P(-a, e, yb), wallHex); // the front, toward the place
    quad(P(a, -e, ya), P(-a, -e, ya), P(-a, -e, yb), P(a, -e, yb), dim(wallHex, 0.7));
    quad(P(-a, -e, ya), P(-a, e, ya), P(-a, e, yb), P(-a, -e, yb), dim(wallHex, 0.82));
    quad(P(a, e, ya), P(a, -e, ya), P(a, -e, yb), P(a, e, yb), dim(wallHex, 0.82));
  }
  // lit windows on a front: `n` of its grid's cells, picked by hash01
  function frontWindows(P, w, e, h, n, seed, x, z) {
    const floors = Math.max(1, Math.floor((h - y0 - 1.2) / 2.7));
    const cols = Math.max(2, Math.floor((w - 0.8) / 1.8));
    const cells = floors * cols;
    const lit = new Set();
    for (let i = 0; lit.size < Math.min(n, cells) && i < n * 4; i++) lit.add(Math.floor(hash01(x + i, z - i, seed) * cells) % cells);
    for (const cell of lit) {
      const f = Math.floor(cell / cols);
      const j = cell % cols;
      const u = -w / 2 + (j + 0.5) * (w / cols);
      const fy = h - 1.5 - 2.7 * f; // from the top floor down: the row in front hides the ground floors
      quad(P(u - 0.36, e + 0.05, fy), P(u + 0.36, e + 0.05, fy), P(u + 0.36, e + 0.05, fy + 0.9), P(u - 0.36, e + 0.05, fy + 0.9), TOWN_LIGHT.window, TOWN_LIGHT.windowK);
    }
  }
  const frame = (x, z, t, n) => (a, bb, yy) => [x + t[0] * a + n[0] * bb, yy, z + t[1] * a + n[1] * bb];
  // a house: centre (x, z), t its tangent (along the row), n toward the place
  function house(x, z, t, n, w, d, h, rise, seed) {
    const P = frame(x, z, t, n);
    const wallHex = hazed(mixHex(TOWN_WALL[0], TOWN_WALL[1], hash01(x, z, seed)), x, z);
    const roofHex = hazed(mixHex(TOWN_ROOF[0], TOWN_ROOF[1], hash01(z, x, seed + 1)), x, z);
    const [a, e] = [w / 2, d / 2];
    walls(P, a, e, y0, h, wallHex);
    if (rise > 0) {
      quad(P(-a, e, h), P(a, e, h), P(a, 0, h + rise), P(-a, 0, h + rise), roofHex);
      // a lit roof light on the front slope of half of them: seen from the tower and the high roofs
      if (hash01(x, z, seed + 11) < 0.5) {
        const k = (hash01(z, x, seed + 12) - 0.5) * (w - 1.4);
        const R = TOWN_ROOF_LIGHT;
        const [s0, s1] = [R.at - R.h / 2, R.at + R.h / 2]; // up the slope, from the eaves
        const at = (u, f) => P(k + u, e * (1 - f) + 0.04, h + rise * f + 0.04);
        quad(at(-R.w / 2, s0), at(R.w / 2, s0), at(R.w / 2, s1), at(-R.w / 2, s1), TOWN_LIGHT.window, R.k);
      }
      quad(P(a, -e, h), P(-a, -e, h), P(-a, 0, h + rise), P(a, 0, h + rise), dim(roofHex, 0.8));
      tri(P(-a, -e, h), P(-a, e, h), P(-a, 0, h + rise), dim(wallHex, 0.82));
      tri(P(a, e, h), P(a, -e, h), P(a, 0, h + rise), dim(wallHex, 0.82));
    } else {
      quad(P(-a, e, h), P(a, e, h), P(a, -e, h), P(-a, -e, h), roofHex);
    }
    // a chimney on half of them
    if (hash01(x, z, seed + 2) < 0.5) {
      const k = (hash01(x, z, seed + 3) - 0.5) * w * 0.6;
      const top = h + rise + 0.7;
      const s = 0.35;
      for (const [u, v, uu, vv] of [[-s, s, s, s], [s, -s, -s, -s], [-s, -s, -s, s], [s, s, s, -s]]) quad(P(k + u, v, h), P(k + uu, vv, h), P(k + uu, vv, top), P(k + u, v, top), dim(wallHex, 0.75));
      quad(P(k - s, s, top), P(k + s, s, top), P(k + s, -s, top), P(k - s, -s, top), dim(roofHex, 0.7));
    }
    // three to five lit windows on the front
    frontWindows(P, w, e, h, 3 + Math.floor(hash01(z, x, seed + 4) * 3), seed + 5, x, z);
  }
  const sides = [
    { t: [1, 0], n: [0, -1], at: (s, u) => [cx + u, cz + s] }, // south, facing north
    { t: [-1, 0], n: [0, 1], at: (s, u) => [cx - u, cz - s] }, // north
    { t: [0, -1], n: [-1, 0], at: (s, u) => [cx + s, cz - u] }, // east
    { t: [0, 1], n: [1, 0], at: (s, u) => [cx - s, cz + u] }, // west
  ];
  const streetsOf = (si) => TOWN_STREETS.map((u, k) => u + 8 * (hash01(si, k, 470) - 0.5));
  TOWN_ROWS.forEach((row, ri) => {
    sides.forEach((side, si) => {
      const streets = streetsOf(si);
      let u = -row.s + row.depth / 2;
      let k = 0;
      while (u < row.s - row.depth / 2) {
        const seed = ri * 97 + si * 31 + k++;
        const w = 5.5 + 3.5 * hash01(u, row.s, seed);
        const cut = streets.find((q) => u < q + TOWN_STREET_HALF && u + w > q - TOWN_STREET_HALF);
        if (cut !== undefined) { // a side street runs through here
          u = cut + TOWN_STREET_HALF + 0.3;
          continue;
        }
        const mid = u + w / 2;
        u += w + 0.6;
        const [x, z] = side.at(row.s, mid);
        const hw = Math.abs(side.t[0]) * w / 2 + Math.abs(side.n[0]) * row.depth / 2;
        const hd = Math.abs(side.t[1]) * w / 2 + Math.abs(side.n[1]) * row.depth / 2;
        if (blocked(x, z, hw, hd)) continue;
        const h = row.h[0] + (row.h[1] - row.h[0]) * hash01(x, z, seed + 7);
        const flatTop = hash01(z, x, seed + 8) < 0.15;
        house(x, z, side.t, side.n, w, row.depth * (0.75 + 0.25 * hash01(x, z, seed + 9)), h, flatTop ? 0 : 1.6 + 1.2 * hash01(x, z, seed + 10), seed);
      }
    });
  });
  // street lights down the side streets: lines of lights running out into the haze
  sides.forEach((side, si) => {
    for (const q of streetsOf(si)) {
      for (let s = TOWN_LAMP.s; s <= TOWN_LAMP.to; s += TOWN_LAMP.every) {
        const [x, z] = side.at(s, q + TOWN_LAMP.kerb);
        if (blocked(x, z, 0.5, 0.5)) continue;
        light(x, y0 + TOWN_LAMP.y, z, TOWN_LAMP.size, TOWN_LIGHT.lamp);
      }
    }
  });
  // dark tree clumps in the gaps between the rows
  const ico = new THREE.IcosahedronGeometry(1, 0); // non-indexed: three vertices a face
  const ip = ico.attributes.position;
  TOWN_GAPS.forEach((s) => {
    sides.forEach((side, si) => {
      for (let k = 0; k < 3; k++) {
        const u = (hash01(s, si, 500 + k) - 0.5) * 1.6 * s;
        const [x, z] = side.at(s, u);
        const r = 2.6 + 1.6 * hash01(x, z, 510 + k);
        if (blocked(x, z, r, r)) continue;
        const hex = mixHex(TOWN_TREE[0], TOWN_TREE[1], hash01(z, x, 520 + k));
        const ty = y0 + r * 1.1;
        for (let f = 0; f < ip.count; f += 3) {
          const v = (i) => [x + ip.getX(i) * r, ty + ip.getY(i) * r * 0.85, z + ip.getZ(i) * r];
          tri(v(f), v(f + 1), v(f + 2), ip.getY(f) + ip.getY(f + 1) + ip.getY(f + 2) > 0 ? hex : dim(hex, 0.75));
        }
      }
    });
  });
  ico.dispose();
  // two church spires, far off
  for (const [x, z] of [[-70, -66], [64, 72]]) {
    house(x, z, [1, 0], [0, 1], 4, 4, 10, 0, 401);
    const top = [x, 16.2, z];
    const r = 2;
    const pts = [[x - r, 10, z - r], [x + r, 10, z - r], [x + r, 10, z + r], [x - r, 10, z + r]];
    for (let i = 0; i < 4; i++) tri(pts[i], pts[(i + 1) % 4], top, hazed(i % 2 ? 0x1a1822 : 0x221e2a, x, z));
  }
  // the landmarks, out past the last row, every one under the tower's top (LEVELS.TOP),
  // in the back row's haze (round two)
  const toward = (x, z) => { const dx = cx - x; const dz = cz - z; const n = Math.hypot(dx, dz); return [[-dz / n, dx / n], [dx / n, dz / n]]; };
  // two blocks of flats, a grid of windows on the side toward the place
  for (const [x, z, w, d, h, seed] of [[cx - 26, cz + 103, 16, 10, y0 + 20, 601], [cx + 104, cz - 34, 14, 10, y0 + 18, 611]]) {
    const [t, n] = toward(x, z);
    const P = frame(x, z, t, n);
    const wallHex = hazed(mixHex(TOWN_WALL[0], TOWN_WALL[1], 0.6), x, z);
    walls(P, w / 2, d / 2, y0, h, wallHex);
    quad(P(-w / 2, d / 2, h), P(w / 2, d / 2, h), P(w / 2, -d / 2, h), P(-w / 2, -d / 2, h), hazed(TOWN_ROOF[0], x, z));
    const floors = Math.floor((h - y0 - 1.6) / 2.8);
    const cols = Math.floor((w - 0.8) / 1.8);
    frontWindows(P, w, d / 2, h, Math.round(floors * cols * 0.45), seed, x, z);
  }
  // the mill chimney: tall, tapering, eight-sided, a red lamp at its top
  {
    const [x, z] = [cx - 99, cz - 44];
    const top = y0 + 20.5;
    const seg = 8;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const at = (a, r, y) => [x + Math.cos(a) * r, y, z + Math.sin(a) * r];
      quad(at(a0, 1.7, y0), at(a1, 1.7, y0), at(a1, 1.0, top), at(a0, 1.0, top), dim(hazed(0x3a2a2c, x, z), 0.7 + 0.3 * Math.abs(Math.cos(a0 + 0.4))));
    }
    light(x + 0.6, top - 0.6, z + 0.9, 0.6, TOWN_LIGHT.red);
  }
  // the gasholder: a dark drum inside a ring of posts with a girder round the top
  {
    const [x, z] = [cx + 96, cz + 74];
    const seg = 12;
    const at = (a, r, y) => [x + Math.cos(a) * r, y, z + Math.sin(a) * r];
    const drum = y0 + 9;
    const ring = y0 + 12.5;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const shade = 0.75 + 0.25 * Math.abs(Math.cos(a0 + 0.6));
      quad(at(a0, 9, y0), at(a1, 9, y0), at(a1, 9, drum), at(a0, 9, drum), dim(hazed(0x2a3030, x, z), shade));
      tri(at(a0, 9, drum), at(a1, 9, drum), [x, drum + 1.2, z], hazed(0x1c2122, x, z));
      quad(at(a0, 10, ring - 0.7), at(a1, 10, ring - 0.7), at(a1, 10, ring), at(a0, 10, ring), hazed(0x1e2224, x, z));
      if (i % 2 === 0) { // a post: a thin flat upright, its face toward the place
        const [px, , pz] = at(a0, 10, 0);
        const [[tx, tz]] = toward(px, pz);
        quad([px - tx * 0.3, y0, pz - tz * 0.3], [px + tx * 0.3, y0, pz + tz * 0.3], [px + tx * 0.3, ring, pz + tz * 0.3], [px - tx * 0.3, ring, pz - tz * 0.3], hazed(0x1e2224, x, z));
      }
    }
  }
  // a second clock tower over the town, its lit face toward the place
  {
    const [x, z] = [cx - 62, cz + 100];
    const [t, n] = toward(x, z);
    const P = frame(x, z, t, n);
    const h = y0 + 16;
    walls(P, 2.2, 2.2, y0, h, hazed(mixHex(TOWN_WALL[0], TOWN_WALL[1], 0.8), x, z));
    for (const [p, q] of [[P(-2.4, 2.4, h), P(2.4, 2.4, h)], [P(2.4, 2.4, h), P(2.4, -2.4, h)], [P(2.4, -2.4, h), P(-2.4, -2.4, h)], [P(-2.4, -2.4, h), P(-2.4, 2.4, h)]]) {
      tri(p, q, P(0, 0, h + 4), hazed(TOWN_ROOF[1], x, z));
    }
    const f = h - 2.4;
    quad(P(-1.1, 2.25, f - 1.1), P(1.1, 2.25, f - 1.1), P(1.1, 2.25, f + 1.1), P(-1.1, 2.25, f + 1.1), TOWN_LIGHT.clock, TOWN_LIGHT.k * 0.8);
  }
  // the town's ground under it all, outside the place
  const g = 0x1c1a24;
  const R = 112;
  const K = TOWN_KEEP_OUT[0];
  const gy = y0 - 0.02;
  quad([cx - R, gy, cz - R], [cx + R, gy, cz - R], [cx + R, gy, K.z0], [cx - R, gy, K.z0], g);
  quad([cx - R, gy, K.z1], [cx + R, gy, K.z1], [cx + R, gy, cz + R], [cx - R, gy, cz + R], g);
  quad([cx - R, gy, K.z0], [K.x0, gy, K.z0], [K.x0, gy, K.z1], [cx - R, gy, K.z1], g);
  quad([K.x1, gy, K.z0], [cx + R, gy, K.z0], [cx + R, gy, K.z1], [K.x1, gy, K.z1], g);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'roofsTownBand';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noCast = true;
  mesh.userData.townBand = true;
  scene.add(mesh);
}

// --- the lamps' halo (round two, Task G; critique finding 12). The globes
// were flat white discs with nothing round them. One additive mesh: a soft
// warm quad HALO.size across on every lamp globe in the scene (the alley's and
// the three in the street), on the take-off glow's ringless texture
// (roofsparts.js markGlowMap), writing no depth, so the globe in front of its
// middle stays the bright part and the halo shows round it. Each quad turns to
// face the camera before it is drawn (onBeforeRender rewrites its 16 vertices;
// nothing is allocated): fixed crossed quads would show as bright streaks
// through the globe wherever one stands edge-on. Its bounds are set once to
// hold every globe and its quad, so it is drawn whenever one could show.
// Top-level, noCast, noMerge; never a lamp to render/ambient.js or dusk.js
// (no lampGlobeY on it).
// size and opacity: the critique's 0.9 m at 0.5 showed only a thin rim, the
// texture's tight falloff (FALLOFF 0.42 of its radius) being mostly inside the
// 0.44 m globe; at 1.6 m and 0.55 the glow reaches about 0.4 m past it.
const HALO = Object.freeze({ size: 1.6, color: 0xffb060, opacity: 0.55 });
const HALO_CORNERS = Object.freeze([-1, -1, 1, -1, 1, 1, -1, 1]); // (right, up) of each corner, counter-clockwise from the camera
function drawLampHalos(scene) {
  const globes = [];
  scene.traverse((o) => {
    if (!(o.userData?.lampGlobeY > 0)) return;
    const p = o.getWorldPosition(new THREE.Vector3());
    p.y += o.userData.lampGlobeY;
    globes.push(p);
  });
  if (!globes.length) return null;
  const n = globes.length;
  const pos = new Float32Array(n * 12);
  const uv = new Float32Array(n * 8);
  const index = [];
  for (let i = 0; i < n; i++) {
    uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
    index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  }
  const geo = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(pos, 3);
  geo.setAttribute('position', attr);
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const toCam = new THREE.Vector3();
  const half = HALO.size / 2;
  // each quad square to the line from its globe to the eye at (ex, ey, ez)
  const face = (ex, ey, ez) => {
    for (let i = 0; i < n; i++) {
      const g = globes[i];
      toCam.set(ex - g.x, ey - g.y, ez - g.z);
      if (toCam.lengthSq() < 1e-8) toCam.set(0, 0, 1);
      toCam.normalize();
      right.set(toCam.z, 0, -toCam.x); // world up x toCam
      if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
      right.normalize().multiplyScalar(half);
      up.crossVectors(toCam, right); // |up| = half
      for (let k = 0; k < 4; k++) {
        const sr = HALO_CORNERS[k * 2];
        const su = HALO_CORNERS[k * 2 + 1];
        const o = (i * 4 + k) * 3;
        pos[o] = g.x + sr * right.x + su * up.x;
        pos[o + 1] = g.y + sr * right.y + su * up.y;
        pos[o + 2] = g.z + sr * right.z + su * up.z;
      }
    }
    attr.needsUpdate = true;
  };
  face(globes[0].x, globes[0].y, globes[0].z + 1);
  geo.computeBoundingSphere();
  geo.boundingSphere.radius += HALO.size; // whichever way the quads turn
  const mat = new THREE.MeshBasicMaterial({
    color: HALO.color, map: markGlowMap(), transparent: true, opacity: HALO.opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'roofsLampHalo';
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    const e = camera.matrixWorld.elements;
    face(e[12], e[13], e[14]);
  };
  mesh.renderOrder = 2;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noCast = true;
  mesh.userData.noMerge = true;
  mesh.userData.lampHalo = true;
  scene.add(mesh);
  return mesh;
}

// --- the sky glow (beauty pass, Task A; critique finding 1). render/sky.js's
// gradient is shared by every area and packs its whole change into the few
// degrees over the horizon, so a shot that sees more sky shows a flat slab and
// a seam, and the sunset has no glow. The Rooftops add their own: one open
// band at SKY_GLOW.r, behind the far town and well inside the camera's 300 m
// far plane, from under the horizon up to about 25 degrees, added onto the sky
// (AdditiveBlending, unfogged, writing no depth, so the town and the roofs
// hide it). It is built round the place's middle and, like the sky it
// brightens, moves with the camera across the ground (onBeforeRender sets its
// x and z to the camera's; nothing is allocated): from a spot near the edge
// of the place a fixed band would rise higher on the near side than the far
// one, and the card, taken from the alley's south end, showed it as a dome.
// Its vertex colours are the shape: faint at its foot, brightest over
// sky.js's seam (so the sky climbs smoothly past it) and black at its top,
// with a warm lobe
// toward the sun's azimuth (render/rig.js SUN_POSITION, the north-west) and a
// violet belt opposite. roofslife.js colours its material every frame, from
// userData.skyGlow.sunset to .dusk (linear RGB). Top-level, noCast, noMerge.
const SKY_GLOW = Object.freeze({
  r: 200,
  seg: 24,
  rings: Object.freeze([-2, 16, 40, 66, 93]), // y: under the horizon, ~2, ~9, ~16 and ~25 degrees up (from 8 m)
  // Task A: brightest over sky.js's seam (~5 degrees), so the sky rises smoothly past it.
  // Round two, Task E (critique finding 8): sky.js lifts its horizon toward white in a strip
  // a few degrees up (its haze stop), so from a high roof the sky fell again under the glow's
  // peak: a salmon line, not a glow. The band is now strongest at the horizon (its second
  // ring) and still strong above the seam (0.3, 0.55, 0.7, 0.4 before), so the sky climbs
  // over a wider span and does not fall again before the roofline.
  ringK: Object.freeze([0.9, 1.3, 0.8, 0.45, 0]),
  base: Object.freeze([0.42, 0.26, 0.34]), // rose, all round
  warm: Object.freeze([0.95, 0.5, 0.1]), // toward the sun
  belt: Object.freeze([0.14, 0.08, 0.3]), // violet, opposite
  // the material's colour at sunset: warm and strong (round two, Task E: redder and weaker than
  // 0.4, 0.29, 0.13, which with the stronger foot washed the horizon near white over the roofline)
  sunset: Object.freeze([0.22, 0.1, 0.045]),
  dusk: Object.freeze([0.13, 0.08, 0.085]), // and at dusk: rose and weaker (round two, Task E: less magenta than 0.14, 0.08, 0.11, now the band is strongest at the horizon)
});
function drawSkyGlow(scene) {
  const { r, seg, rings, ringK, base, warm, belt } = SKY_GLOW;
  const cx = (ROOFS_BOUNDS.minX + ROOFS_BOUNDS.maxX) / 2;
  const cz = (ROOFS_BOUNDS.minZ + ROOFS_BOUNDS.maxZ) / 2;
  const sn = Math.hypot(SUN_POSITION[0], SUN_POSITION[2]);
  const [sx, sz] = [SUN_POSITION[0] / sn, SUN_POSITION[2] / sn];
  const pos = [];
  const col = [];
  for (let j = 0; j < rings.length; j++) {
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const [ux, uz] = [Math.cos(a), Math.sin(a)];
      const s = 0.5 + 0.5 * (ux * sx + uz * sz); // 1 toward the sun, 0 away
      const w = s ** 2.5;
      const v = (1 - s) ** 3;
      pos.push(ux * r, rings[j], uz * r);
      for (let k = 0; k < 3; k++) col.push((base[k] + warm[k] * w + belt[k] * v) * ringK[j]);
    }
  }
  const index = [];
  for (let j = 0; j + 1 < rings.length; j++) {
    for (let i = 0; i < seg; i++) {
      const p = j * (seg + 1) + i;
      const q = p + seg + 1;
      index.push(p, p + 1, q + 1, p, q + 1, q);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  mat.forceSinglePass = true; // one draw, not three's two for a transparent double-sided material
  mat.color.setRGB(...SKY_GLOW.sunset);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'roofsSkyGlow';
  mesh.position.set(cx, 0, cz);
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    const e = camera.matrixWorld.elements;
    mesh.position.x = e[12];
    mesh.position.z = e[14];
    mesh.updateMatrixWorld();
  };
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noCast = true;
  mesh.userData.noMerge = true;
  mesh.userData.skyGlow = { sunset: SKY_GLOW.sunset, dusk: SKY_GLOW.dusk };
  scene.add(mesh);
  return mesh;
}
