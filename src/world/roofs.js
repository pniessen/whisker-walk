import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as b from './builder.js';
import { litMaterial, tileMetres } from '../render/materials.js';
import { withLocalUuids } from './localuuids.js';
import { hash01 } from './warehouselook.js';
import { roofsMaterials, addWindowQuads, windowCell, markMesh, ATLAS_SIZE } from './roofsparts.js';
import {
  LEVELS as L, BLOCKS, GROUNDS, ROOFS_BOUNDS, ROOFS_SPAWN, ROOFS_COLLIDERS, ROOFS_TRAVERSAL, roofsArea,
  ALLEY_LAMP, BIN_2, BIN_3, ALLEY_CRATES, YARD, YARD_WALLS, WASHING_POSTS,
  VANE, VANE_TIP, TELESCOPE, GARDEN, SKYLIGHT, TELESCOPE_CRATE, ROOFS_DISCOVERIES, STREETS, PAVEMENT, STREET_LAMPS, BUS,
} from './roofsplan.js';
import { STEP_MAX } from '../ground.js';
import { createRoofsLife, mixHex } from '../roofslife.js';

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
//   * ridge-4 runs 1.5 m over the flat house's roof: there the ridge is an
//     old timber ridge beam left standing between the two gable cheeks when
//     the slates came off, braced at both ends.
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
//     never merged, faded by the fog);
//   * the garden (discovery A), the skylight over the lamp-lit attic (D) and
//     the warm chimney's cowl (F).
// THE EVENING is roofslife.js: the record's `life`.
//
// THE BACK YARDS' WALLS are the plan's raised ground (roofsplan.js YARD_WALLS),
// drawn inside it: one mesh, userData.yardWalls.
//
// THE CHIMNEY STACKS are drawn inside what the ground lets them cover: their
// own disc, the void under the slates, or ground as high as their top. A
// stack is four quarters, each as long across the ridge as that allows and
// narrowed to a square inside the disc where a flat roof or the west garden
// lies beside it (stack-0, stack--10, stack-20, stack--30); a quarter beside
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
const PAINTS = Object.freeze([0x2f5d8a, 0x7a2b2b, 0x2f5a3a, 0x2a2a2e, 0xd8c9a0, 0x5a3a6a, 0x9a6a2a, 0x3d6f73]);
const CLOTHS = Object.freeze([0xf2efe6, 0xd9534f, 0x5b8fd1, 0xf3c94b, 0x7cc47a, 0xe9a3c4, 0xffffff, 0x9b7fd1]);
const paint = (x, z, salt) => PAINTS[Math.floor(hash01(x, z, salt) * PAINTS.length) % PAINTS.length];

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
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
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

function makeKit(prefix) {
  const buckets = new Map();
  return {
    // `mark`, if given ({ id, kind }), records the vertices this piece adds
    put(key, mat, geo, { noCast = false, color = null, tile = 0, mark = null } = {}) {
      const full = noCast ? `${key}` : `${key}:cast`;
      let k = buckets.get(full);
      if (!k) buckets.set(full, (k = { key, mat, noCast, geos: [], count: 0, ranges: [] }));
      const g = prep(geo, { color, tile });
      const count = g.attributes.position.count;
      if (mark) k.ranges.push({ ...mark, start: k.count, count });
      k.count += count;
      k.geos.push(g);
    },
    meshes() {
      return [...buckets.values()].map((k) => {
        const m = finish(new THREE.Mesh(merged(k.geos, k.key), k.mat), k.noCast);
        m.name = `${prefix}:${k.key}`;
        if (k.ranges.length) m.userData.markRanges = k.ranges;
        return m;
      });
    },
  };
}

// One mesh of its own, from pieces, tagged for the tests.
function own(name, mat, pieces, { noCast = false, color = null, tile = 0, tag = {} } = {}) {
  const geos = pieces.map((p) => prep(p.geo ?? p, { color: p.color ?? color, tile }));
  const m = finish(new THREE.Mesh(merged(geos, name), mat), noCast);
  m.name = name;
  Object.assign(m.userData, tag);
  return m;
}

// ---------------------------------------------------------------------------
// Materials: the kit's (roofsparts.js), plus the textured walls, roofs and
// ground, made once per build.
// ---------------------------------------------------------------------------

function buildMaterials() {
  const M = roofsMaterials();
  const tiled = (color, surface, extra = {}) => litMaterial(color, { surface, repeat: [1, 1], ...extra });
  return {
    ...M,
    wall: tiled(0x9a5640, 'brick'),
    slates: tiled(0x55606e, 'shingle'),
    felt: tiled(0x5a5752, 'gravel'),
    cobble: tiled(ROOFS_GROUND_COLOR, 'cobble'),
    flags: tiled(0x958f85, 'flagstone'),
    grass: tiled(0x5c8748, 'grass'),
    shed: tiled(0x6e5a40, 'wood'),
    stone: litMaterial(0xcdc4b2, { roughness: 0.9 }),
    iron: litMaterial(0x2b2e33, { roughness: 0.5 }),
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 }),
    cloth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
    // part two
    road: tiled(0x3a3b40, 'gravel'),
    pavement: tiled(0x8a847a, 'flagstone'),
    gold: new THREE.MeshStandardMaterial({ color: 0xc9a043, roughness: 0.35, metalness: 0.7, emissive: 0x3a2a08 }),
    // lit from inside: the clock's faces and the garden's bulbs (no real lights)
    clock: new THREE.MeshStandardMaterial({ color: 0xfff1d0, roughness: 0.6, metalness: 0, emissive: 0xffd890, emissiveIntensity: 1.25 }),
    bulbs: new THREE.MeshStandardMaterial({ color: 0xfff0c0, roughness: 0.5, metalness: 0, emissive: 0xffc860, emissiveIntensity: 2.2 }),
  };
}

const TILE = Object.fromEntries(['brick', 'shingle', 'gravel', 'cobble', 'flagstone', 'grass', 'wood'].map((s) => [s, tileMetres(s) || 1]));

// A window cell that is always lit warm (the lantern, the skylight).
const warmCell = (x, z) => Math.floor(hash01(x, z, 23) * 8) % 8;

// ---------------------------------------------------------------------------
// The build
// ---------------------------------------------------------------------------

const SKY_SUNSET = Object.freeze({ top: 0x4a5a8c, horizon: 0xe89a6a });
const SKY_DUSK = Object.freeze({ top: 0x1f2a52, horizon: 0x8a5a6a });

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
    drawYards(AK, alley, M);
    for (const m of AK.meshes()) alley.add(m);
    const terrace = new THREE.Group();
    terrace.name = 'roofsTerrace';
    drawTerrace(terrace, M, win, ground);
    const moves = new THREE.Group();
    moves.name = 'roofsMoves';
    drawCrossings(moves, M);
    drawMarks(moves, M, traversal);

    // part two: the north, the tower, the discoveries, the street, the town
    const north = new THREE.Group();
    north.name = 'roofsNorth';
    const NK = makeKit('roofsNorth');
    drawShop(NK, north, M, win);
    drawWarehouse(NK, north, M, win, upWin);
    drawTower(NK, north, M, scene);
    drawDiscoveries(NK, north, M, upWin);
    for (const m of NK.meshes()) north.add(m);
    const street = new THREE.Group();
    street.name = 'roofsStreet';
    const bus = drawStreet(scene, street, M, win);
    drawTown(scene);

    // every window of the place: one mesh on the one atlas
    const panes = new THREE.Mesh(mergeGeometries([addWindowQuads(windows).geometry, upQuads(skyWindows)]), M.windows);
    panes.name = 'roofsWindows';
    terrace.add(finish(panes, true));

    const lamp = b.lampPost(ALLEY_LAMP.x, ALLEY_LAMP.z);
    lamp.name = 'roofsAlleyLamp';
    scene.add(alley, terrace, moves, north, street, lamp);

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
      critterSpawns: [], // R8; step 3 adds the birds
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
      evening: true,
      strays: false,
      bus,
    };
    // the evening deepening over the walk, and the bus (roofslife.js)
    record.life = createRoofsLife(record);
    return record;
  });
}

// --- the ground at 0: cobbles in the alley, flags in the yards, grass in the
// west garden. Top-level, as builder.ground is, and casting nothing.
function drawGround(scene, M) {
  const looks = {
    alley: ['cobble', M.cobble, TILE.cobble], shopYard: ['cobble', M.cobble, TILE.cobble], ginnel: ['cobble', M.cobble, TILE.cobble],
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
  for (const [key, k] of kit) {
    const m = finish(new THREE.Mesh(merged(k.geos, key), k.mat), true);
    m.name = `roofsGround:${key}`;
    m.userData.ground = true;
    scene.add(m);
  }
}

// --- the alley: its walls, the garages, the shed, the bins, the crates, the
// bin bags, a drainpipe and the fire escape.
function drawAlley(K, group, M, ground) {
  const wall = (geo) => K.put('wall', M.wall, geo, { tile: TILE.brick });
  const stone = (geo) => K.put('stone', M.stone, geo);
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
  stone(box(G.x0, G.x1, gTop - 0.12, gTop - 0.02, G.z1, G.z1 + 0.06)); // the fascia under the felt
  const doors = Math.floor((G.x1 - G.x0) / 3);
  for (let i = 0; i < doors; i++) {
    const cx = G.x0 + 1.5 + 3 * i;
    painted(box(cx - 1.15, cx + 1.15, 0, 2.1, G.z1, G.z1 + 0.04), paint(cx, G.z1, 3));
    stone(box(cx - 1.25, cx + 1.25, 2.1, 2.22, G.z1, G.z1 + 0.05)); // lintel
  }
  // a drainpipe from the garages' gutter at the shed's end
  iron(box(G.x1 - 0.3, G.x1 - 0.2, 0, gTop - 0.05, G.z1 + 0.04, G.z1 + 0.14), true);
  iron(box(G.x1 - 0.38, G.x1 - 0.12, gTop - 0.3, gTop - 0.05, G.z1 + 0.02, G.z1 + 0.2), true); // its hopper head

  // The shed: boards, a felt roof, a green door.
  const S = BLOCK.shed;
  K.put('shed', M.shed, box(S.x0, S.x1, 0, S.y - 0.1, S.z0, S.z1), { tile: TILE.wood });
  group.add(own('shed', M.felt, [box(S.x0, S.x1 + 0.08, S.y - 0.1, S.y, S.z0 - 0.08, S.z1 + 0.08)], { tile: TILE.gravel, tag: { block: 'shed' } }));
  painted(box(S.x1 - 1.3, S.x1 - 0.45, 0, 1.75, S.z1, S.z1 + 0.04), 0x2f5a3a);
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

  // The crates, and the bin bags she drops onto from the garages.
  for (const c of ALLEY_CRATES) K.put('wood', M.wood, turnedBox(c.x, c.z, c.y, c.s, c.s, c.s, c.yaw), { noCast: true });
  const bags = ROOFS_TRAVERSAL.drops.find((d) => d.id === 'garages-bags').to;
  [[-0.35, 0, 0.42], [0.3, 0.1, 0.38], [0, -0.3, 0.36], [0.05, 0.35, 0.33], [-0.1, 0.05, 0.3, 0.32]].forEach(([dx, dz, r, y = 0], i) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.scale(1, 0.75, 1);
    g.rotateY(i * 1.3);
    g.translate(bags.x + dx, y + r * 0.7, bags.z + dz);
    painted(g, i === 4 ? 0x3a4a3a : 0x1f2023);
  });

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

// --- the back yards: walls with a gateway, washing posts, coal bunkers.
function drawYards(K, group, M) {
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
  group.add(own('yardWalls', M.wall, walls, { tile: TILE.brick, tag: { yardWalls: true } }));
  const lineGeos = [];
  WASHING_POSTS.forEach((p, i) => {
    for (const z of [p.z0, p.z1]) {
      K.put('ironSmall', M.iron, post(p.x, z, 0, 2.0, 0.04), { noCast: true });
      K.put('ironSmall', M.iron, rod({ x: p.x - 0.3, y: 1.95, z }, { x: p.x + 0.3, y: 1.95, z }, 0.025), { noCast: true });
    }
    for (const dx of [-0.25, 0.25]) lineGeos.push(rod({ x: p.x + dx, y: 1.95, z: p.z0 }, { x: p.x + dx, y: 1.9, z: p.z1 }, 0.008, 4));
    // two or three things drying on each
    for (let j = 0; j < 3; j++) {
      if (j === 2 && i % 2) continue;
      const z = p.z0 + 1.2 + j * 1.4;
      const w = 0.5 + 0.25 * hash01(p.x, z, 5);
      const h = 0.45 + 0.3 * hash01(z, p.x, 7);
      const g = new THREE.PlaneGeometry(w, h);
      g.rotateY(Math.PI / 2);
      g.translate(p.x + (j % 2 ? 0.25 : -0.25), 1.92 - h / 2, z);
      K.put('cloth', M.cloth, g, { noCast: true, color: CLOTHS[Math.floor(hash01(p.x, z, 11) * CLOTHS.length) % CLOTHS.length] });
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

// --- the terrace: the houses, their extensions and outriggers, the slates,
// the flat roofs, the stacks and every window.
function drawTerrace(group, M, win, ground) {
  const K = makeKit('roofsTerrace');
  const wall = (geo) => K.put('wall', M.wall, geo, { tile: TILE.brick });
  const stone = (geo) => K.put('stone', M.stone, geo);
  const iron = (geo) => K.put('iron', M.iron, geo, { noCast: true });
  const painted = (geo, color) => K.put('paint', M.paint, geo, { color, noCast: true });
  const pots = painted;
  const T = TERRACE;
  const sill = (x, y, z, w, nz) => stone(box(x - w / 2 - 0.06, x + w / 2 + 0.06, y - 0.07, y, nz > 0 ? z : z - 0.08, nz > 0 ? z + 0.08 : z));
  // a window with a stone sill under it, on a wall facing +z or -z
  const zWin = (x, y, z, nz, w, h) => { win(x, y, z, 0, nz, w, h); sill(x, y - h / 2, z, w, nz); };

  // The houses' body, from the street below up to the eaves, and the gables.
  wall(box(T.x0, T.x1, L.STREET, EAVE_Y, T.z0, T.z1));
  const gable = [[T.z0, EAVE_Y], [RIDGE_Z, L.RIDGE], [T.z1, EAVE_Y]];
  const coping = (x, pts, width = 0.32) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      stone(beam({ x, y: pts[i][1] + 0.06, z: pts[i][0] }, { x, y: pts[i + 1][1] + 0.06, z: pts[i + 1][0] }, width, 0.1));
    }
  };
  wall(extrudeX(gable, T.x0, T.x0 + 0.2)); coping(T.x0 + 0.1, gable);
  wall(extrudeX(gable, T.x1 - 0.2, T.x1)); coping(T.x1 - 0.1, gable);

  // The three flat roofs: felt on a brick course; brick cheeks where the
  // neighbours' slopes end against them (see the header).
  const flats = ['flatHouse', 'dormer', 'roofTerrace'].map((id) => BLOCK[id]);
  for (const f of flats) {
    wall(box(f.x0, f.x1, EAVE_Y - 0.05, f.y - 0.08, f.z0, f.z1));
    group.add(own(f.id, M.felt, [box(f.x0, f.x1, f.y - 0.08, f.y, f.z0, f.z1)], { tile: TILE.gravel, tag: { block: f.id } }));
    const full = f.z0 <= T.z0;
    const cheek = full ? gable : [[f.z0, EAVE_Y - 0.05], [f.z0, slopeY(f.z0)], [T.z1, EAVE_Y], [T.z1, EAVE_Y - 0.05]];
    const top = full ? gable : [[f.z0, slopeY(f.z0)], [T.z1, EAVE_Y]];
    // each cheek's coping is flush with the flat roof's edge, never over it
    for (const [x0, x1, cx] of [[f.x0 - 0.15, f.x0, f.x0 - 0.11], [f.x1, f.x1 + 0.15, f.x1 + 0.11]]) { wall(extrudeX(cheek, x0, x1)); coping(cx, top, 0.22); }
    if (!full) {
      // the back wall where the slope rises behind the flat roof, with a window or a door
      wall(box(f.x0, f.x1, EAVE_Y - 0.05, slopeY(f.z0), f.z0 - 0.15, f.z0));
      const cx = (f.x0 + f.x1) / 2;
      if (f.id === 'dormer') zWin(cx, 7.2, f.z0, 1, 1.3, 0.65);
      else win(cx, 7.15, f.z0, 0, 1, 1.0, 0.95);
    }
  }

  // The slates: the front slope and the back, round the flat roofs. One mesh,
  // its top the ridge.
  const quads = [];
  const slope = (x0, x1, zEave, zTop) => {
    const yE = slopeY(zEave);
    const yT = slopeY(zTop);
    quads.push(...quadTris([x0, yE, zEave], [x1, yE, zEave], [x1, yT, zTop], [x0, yT, zTop], [0, 1, 0]));
  };
  const flatHouse = BLOCK.flatHouse;
  for (const [x0, x1] of [[T.x0, flatHouse.x0], [flatHouse.x1, T.x1]]) slope(x0, x1, T.z0 - EAVE_OVER, RIDGE_Z);
  const backCuts = [BLOCK.dormer, flatHouse, BLOCK.roofTerrace].sort((p, q) => p.x0 - q.x0);
  let x = T.x0;
  for (const f of backCuts) {
    if (f.x0 > x) slope(x, f.x0, T.z1 + EAVE_OVER, RIDGE_Z);
    if (f.z0 > RIDGE_Z) slope(f.x0, f.x1, f.z0, RIDGE_Z);
    x = f.x1;
  }
  if (x < T.x1) slope(x, T.x1, T.z1 + EAVE_OVER, RIDGE_Z);
  // slopeY past the eave: the overhang carries on down the same pitch
  const slates = own('terrace', M.slates, [triangles(quads)], { tile: TILE.shingle, tag: { block: 'terrace' } });
  group.add(slates);

  // Hanging gutters along the eaves, where no lead gutter (a crossing) runs.
  const leadSpans = ROOFS_TRAVERSAL.crossings.filter((c) => c.kind === 'gutter').map((c) => [Math.min(c.points[0].x, c.points[1].x), Math.max(c.points[0].x, c.points[1].x)]);
  const gutterRuns = (spans, z0, z1) => {
    for (const [a, c] of spans) iron(box(a, c, EAVE_Y - 0.2, EAVE_Y - 0.06, z0, z1));
  };
  gutterRuns([[T.x0, flatHouse.x0], [flatHouse.x1, T.x1]], T.z0 - EAVE_OVER - 0.14, T.z0 - EAVE_OVER + 0.02);
  const backSpans = [];
  let bx = T.x0;
  for (const f of backCuts) { if (f.x0 > bx) backSpans.push([bx, f.x0]); bx = f.x1; }
  backSpans.push([bx, T.x1]);
  const free = backSpans.flatMap(([a, c]) => {
    let pieces = [[a, c]];
    for (const [la, lc] of leadSpans) pieces = pieces.flatMap(([p, q]) => (lc <= p || la >= q ? [[p, q]] : [[p, Math.max(p, la)], [Math.min(q, lc), q]].filter(([u, v]) => v - u > 0.05)));
    return pieces;
  });
  gutterRuns(free, T.z1 + EAVE_OVER - 0.02, T.z1 + EAVE_OVER + 0.14);

  // The chimney stacks on the party walls, across the ridge, with their pots
  // (the header: four quarters, each inside what the ground lets it cover).
  for (const s of STACKS) {
    const quarters = stackQuarters(s, ground);
    group.add(own(s.id, M.wall, quarters.map((q) => box(q.x0, q.x1, q.y0, s.y, q.z0, q.z1)), { tile: TILE.brick, tag: { block: s.id } }));
    for (const q of quarters) wall(box(q.x0 - 0.06, q.x1 + 0.06, s.y - 0.16, s.y - 0.06, q.z0 - 0.06, q.z1 + 0.06)); // the oversailing course
    for (const side of [-1, 1]) {
      // a pot each side of the ridge's line, on the quarters that reach it
      const reach = quarters.filter((q) => (side < 0 ? s.z - q.z0 : q.z1 - s.z) >= STACK.pot + 0.13);
      if (!reach.length) continue;
      const px = reach.reduce((t, q) => t + (q.x0 + q.x1) / 2, 0) / reach.length;
      const tall = 0.45 + 0.15 * hash01(s.x, side, 3);
      const col = hash01(s.x, side, 9) < 0.7 ? 0xb8613f : 0x8a7f72;
      pots(post(px, s.z + side * STACK.pot, s.y, tall, 0.1, 0.13, 10), col);
      pots(post(px, s.z + side * STACK.pot, s.y + tall - 0.04, 0.05, 0.125, 0.125, 10), col);
      // the warm chimney (discovery F): a cowl on its pot, soot round the rim
      if (s.x === ROOFS_DISCOVERIES.chimney.x && side < 0) {
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
    wall(box(e.x0, e.x1, 0, e.y - 0.1, e.z0, e.z1));
    group.add(own(e.id, M.felt, [box(e.x0, e.x1, e.y - 0.1, e.y, e.z0, e.z1)], { tile: TILE.gravel, tag: { block: e.id } }));
    // the kitchen window over the yard, its sill clear above a bunker's lid
    const bunker = BLOCK[`bunker-${k}`];
    zWin(ecx, bunker ? 2.15 : 1.85, e.z1, 1, 1.0, 1.0);
    win(e.x1, 1.5, 16.5, 1, 0, 0.7, 0.9); // a small one into the side return
    stone(box(e.x1, e.x1 + 0.08, 1.0, 1.05, 16.1, 16.9));
    const ret = (e.x1 + x0 + HOUSE_W) / 2; // the middle of the side return
    painted(box(ret - 0.42, ret + 0.42, 0, 2.0, T.z1, T.z1 + 0.05), paint(x0, T.z1, 5)); // the back door
    zWin(ret, 4.8, T.z1, 1, 0.7, 1.0);
    if (o) {
      wall(box(o.x0, o.x1, e.y - 0.1, o.y - 0.1, o.z0, o.z1));
      group.add(own(o.id, M.felt, [box(o.x0, o.x1, o.y - 0.1, o.y, o.z0, o.z1)], { tile: TILE.gravel, tag: { block: o.id } }));
      // the jettied overhang over the side return, on a corbelled course
      if (o.x1 > e.x1) wall(box(e.x1, o.x1 - 0.12, e.y - 0.3, e.y - 0.1, o.z0, o.z1));
      if (o.x0 < e.x0) wall(box(o.x0 + 0.12, e.x0, e.y - 0.3, e.y - 0.1, o.z0, o.z1));
      zWin(ecx, 4.35, o.z1, 1, 0.7, 0.8);
      zWin(ecx + 0.25, 5.8, T.z1, 1, 0.8, 0.7); // the back window over it, whose sill she climbs by
    } else {
      zWin(ecx, 4.9, T.z1, 1, 0.9, 1.1);
    }
    // the drainpipe at the party wall, from the eave down to the extension
    iron(box(x0 + 0.06, x0 + 0.15, e.y, EAVE_Y - 0.1, T.z1, T.z1 + 0.09));
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

// --- the crossings: planks, ridge tiles, lead gutters, washing lines. One
// mesh each along its rail; the line's cloths in one mesh of their own.
function drawCrossings(group, M) {
  const K = makeKit('roofsMoves');
  const flatHouse = BLOCK.flatHouse;
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
      // half-round ridge tiles on the slates; over the flat house, the old
      // ridge beam between the gable cheeks, braced at both ends
      const r = 0.13;
      const x0 = Math.min(first.x, last.x);
      const x1 = Math.max(first.x, last.x);
      const y = first.y;
      const z = first.z;
      if (x0 < flatHouse.x1 && x1 > flatHouse.x0) {
        const bx0 = Math.max(x0, flatHouse.x0);
        const bx1 = Math.min(x1, flatHouse.x1 + 0.15);
        pieces.push({ geo: beam({ x: bx0, y, z }, { x: bx1, y, z }, 0.2, 0.2), color: 0x6b5238 });
        for (const [fx, dir] of [[flatHouse.x0 + 0.5, 1], [flatHouse.x1, -1]]) {
          pieces.push({ geo: beam({ x: fx, y: y - 0.65, z }, { x: fx + dir * 0.9, y: y - 0.18, z }, 0.12, 0.12), color: 0x6b5238 });
        }
        if (x0 < flatHouse.x0) pieces.push({ geo: rod({ x: x0, y: y - r, z }, { x: flatHouse.x0, y: y - r, z }, r, 8), color: 0x8e4b38 });
        if (x1 > bx1) pieces.push({ geo: rod({ x: bx1, y: y - r, z }, { x: x1, y: y - r, z }, r, 8), color: 0x8e4b38 });
      } else {
        pieces.push({ geo: rod({ x: x0, y: y - r, z }, { x: x1, y: y - r, z }, r, 8), color: 0x8e4b38 });
      }
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
        const g = new THREE.PlaneGeometry(w, h);
        g.translate(cx, cy - h / 2 - 0.01, s.z);
        K.put('cloth', M.cloth, g, { noCast: true, color: CLOTHS[Math.floor(hash01(cx, s.z, 19) * CLOTHS.length) % CLOTHS.length] });
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
// material, each mesh with the vertex ranges of every hop's mark in it.
function drawMarks(group, M, traversal) {
  const K = makeKit('roofsMarks');
  const names = new Map(Object.entries(M).map(([k, v]) => [v, k]));
  const glows = [];
  const glowRanges = [];
  let glowCount = 0;
  let glowMat = null;
  for (const hop of traversal.hops) {
    const g = markMesh(hop.mark, hop, M);
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
        K.put(`mark-${names.get(c.material) ?? c.material.uuid}`, c.material, bake(c.geometry, c.matrixWorld), { noCast: true, mark });
      }
    });
  }
  for (const m of K.meshes()) group.add(m);
  if (glows.length) {
    const glow = new THREE.Mesh(merged(glows, 'markGlow'), glowMat);
    glow.name = 'roofsMarks:glow';
    finish(glow, true);
    glow.receiveShadow = false;
    glow.renderOrder = 2;
    glow.userData.markGlow = true;
    glow.userData.noMerge = true;
    glow.userData.markRanges = glowRanges;
    group.add(glow);
  }
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
function parapet(wall, stone, x0, x1, z0, z1, y, h = 0.45) {
  wall(box(x0, x1, y - 0.15, y + h, z0, z1));
  stone(box(x0, x1, y + h, y + h + 0.07, z0, z1));
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
function drawShop(K, group, M, win) {
  const wall = (g) => K.put('wall', M.wall, g, { tile: TILE.brick });
  const stone = (g) => K.put('stone', M.stone, g);
  const painted = (g, color) => K.put('paint', M.paint, g, { color, noCast: true });
  const fw = (x, y, z, nx, nz, w, h, cell) => faceWindow(win, stone, x, y, z, nx, nz, w, h, cell);
  const S = BLOCK.cornerShop;
  const T = TERRACE;
  const top = S.y - 0.15;
  wall(box(S.x0, S.x1, L.STREET, top, S.z0, S.z1));
  group.add(own('cornerShop', M.felt, [box(S.x0, S.x1, top, S.y, S.z0, S.z1)], { tile: TILE.gravel, tag: { block: 'cornerShop' } }));
  // a stone band under the roof, on the faces over the street, the shop yard and the back yards
  stone(box(S.x1, S.x1 + 0.1, top - 0.3, top - 0.1, S.z0, S.z1 + 0.1));
  stone(box(S.x0 - 0.1, S.x1 + 0.1, top - 0.3, top - 0.1, S.z1, S.z1 + 0.1));
  stone(box(S.x0 - 0.1, S.x0, top - 0.3, top - 0.1, S.z0, T.z0));
  // parapets: open on the terrace side where she climbs up from the last stack
  const up = climbTo('cornerShop');
  for (const [z0, z1] of runsAround(S.z0, S.z1, [up.z], 0.7)) parapet(wall, stone, S.x0 - 0.25, S.x0, z0, z1, S.y);
  parapet(wall, stone, S.x1, S.x1 + 0.25, S.z0, S.z1 + 0.25, S.y);
  parapet(wall, stone, S.x0 - 0.25, S.x1, S.z1, S.z1 + 0.25, S.y);

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

// --- the warehouse, and what stands on its roof: the tank, the loft, the
// lantern, roof lights; its stair down to the ginnel.
function drawWarehouse(K, group, M, win, upWin) {
  const wall = (g) => K.put('wall', M.wall, g, { tile: TILE.brick });
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
  for (const [x0, x1] of [[W.x0 - 0.25, tower.x0], ...runsAround(tower.x1, W.x1 + 0.25, [up.x], 0.7)]) parapet(wall, stone, x0, x1, W.z1, W.z1 + 0.25, W.y, 0.5);
  parapet(wall, stone, W.x0 - 0.25, W.x0, W.z0 - 0.25, W.z1, W.y, 0.5);
  parapet(wall, stone, W.x0, W.x1 + 0.25, W.z0 - 0.25, W.z0, W.y, 0.5);
  for (const [z0, z1] of [[W.z0, stairZ[0]], [stairZ[1], W.z1]]) parapet(wall, stone, W.x1, W.x1 + 0.25, z0, z1, W.y, 0.5);
  // the ginnel's far wall and its end
  wall(box(ROOFS_BOUNDS.maxX, ROOFS_BOUNDS.maxX + 0.3, 0, 2.4, W.z0 - 0.3, W.z1)); stone(box(ROOFS_BOUNDS.maxX - 0.05, ROOFS_BOUNDS.maxX + 0.35, 2.4, 2.5, W.z0 - 0.3, W.z1));
  wall(box(W.x1, ROOFS_BOUNDS.maxX, 0, 2.4, W.z0 - 0.3, W.z0)); stone(box(W.x1, ROOFS_BOUNDS.maxX, 2.4, 2.5, W.z0 - 0.35, W.z0 + 0.05));

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

  // roof lights, flush with the felt, lit from below
  for (const x of [-12, -4, 4]) {
    for (const z of [-22, -40]) {
      upWin(x, W.y + 0.02, z, 1.0, 2.2, warmCell(x, z));
      iron(box(x - 0.56, x + 0.56, W.y, W.y + 0.03, z - 1.16, z + 1.16), true);
    }
  }

  // the water tank: wooden staves, iron hoops, a hatch
  const T = BLOCK.tank;
  group.add(own('tank', M.wood, [post(T.x, T.z, L.WAREHOUSE, T.y - L.WAREHOUSE, T.r, T.r, 18)], { tile: TILE.wood, tag: { block: 'tank' } }));
  for (const y of [11.4, 11.9, 12.4]) iron(post(T.x, T.z, y, 0.07, T.r + 0.02, T.r + 0.02, 18), true);
  iron(box(T.x - 0.25, T.x + 0.25, T.y, T.y + 0.02, T.z - 0.6, T.z - 0.1), true);

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
function drawTower(K, group, M, scene) {
  const stone = (g) => K.put('stone', M.stone, g);
  const painted = (g, color) => K.put('paint', M.paint, g, { color, noCast: true });
  const rail = (g) => K.put('ironSmall', M.iron, g, { noCast: true });
  const gold = (g) => K.put('gold', M.gold, g, { noCast: true });
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
  const bodyMesh = own('roofsTowerBody:stone', M.stone, [box(T1.x0 - cx, T1.x1 - cx, L.WAREHOUSE, LEDGE, T1.z0 - cz, T1.z1 - cz)]);
  body.add(bodyMesh);
  const half = Math.hypot(T1.x1 - T1.x0, T1.z1 - T1.z0) / 2;
  body.userData.fadeOccluder = [{ t: 'cyl', r: half, y0: L.WAREHOUSE, y1: LEDGE }];
  scene.add(body);

  // the first ledge (tower-1's ring) and the stages above, each a block's top
  group.add(own('tower-1', M.stone, [box(T1.x0 - 0.1, T1.x1 + 0.1, LEDGE, T1.y, T1.z0 - 0.1, T1.z1 + 0.1)], { tag: { block: 'tower-1' } }));
  group.add(own('belfry', M.stone, [box(BF.x0, BF.x1, T1.y, BF.y, BF.z0, BF.z1)], { tag: { block: 'belfry' } }));
  stone(box(BF.x0 - 0.08, BF.x1 + 0.08, BF.y - 0.22, BF.y - 0.1, BF.z0 - 0.08, BF.z1 + 0.08)); // its cornice
  group.add(own('lanternStage', M.stone, [box(LS.x0, LS.x1, BF.y, LS.y, LS.z0, LS.z1)], { tag: { block: 'lanternStage' } }));
  stone(box(LS.x0 - 0.08, LS.x1 + 0.08, LS.y - 0.22, LS.y - 0.1, LS.z0 - 0.08, LS.z1 + 0.08));
  group.add(own('towerTop', M.stone, [post(TT.x, TT.z, LS.y, TT.y - LS.y, TT.r, TT.r, 18)], { tag: { block: 'towerTop' } }));
  stone(post(TT.x, TT.z, TT.y - 0.2, 0.1, TT.r + 0.06, TT.r + 0.06, 18));
  // quoins on the body's corners, and the bell openings in the lantern stage
  for (const [x, z] of [[T1.x0, T1.z0], [T1.x1, T1.z0], [T1.x0, T1.z1], [T1.x1, T1.z1]]) stone(box(x - 0.06, x + 0.06, L.WAREHOUSE, LEDGE, z - 0.06, z + 0.06));
  const lsy = (BF.y + LS.y) / 2;
  for (const [x, z, nx, nz] of [[cx, LS.z0, 0, -1], [cx, LS.z1, 0, 1], [LS.x0, cz, -1, 0], [LS.x1, cz, 1, 0]]) {
    const [hw, hd] = nx ? [0.02, 0.55] : [0.55, 0.02];
    painted(box(x - hw + nx * 0.01, x + hw + nx * 0.01, lsy - 0.5, lsy + 0.45, z - hd + nz * 0.01, z + hd + nz * 0.01), 0x16141a);
  }

  // the clock: a lit face on each side of the belfry at 13.3, its hands at 7:10
  const CY = 13.3;
  const R = 0.55;
  const faces = [];
  const sides = [[BF.x0, cz, -1, 0], [BF.x1, cz, 1, 0], [cx, BF.z0, 0, -1], [cx, BF.z1, 0, 1]];
  for (const [x, z, nx, nz] of sides) {
    const disc = new THREE.CircleGeometry(R, 24);
    disc.rotateY(Math.atan2(nx, nz));
    disc.translate(x + nx * 0.03, CY, z + nz * 0.03);
    faces.push(disc);
    // the stone ring round it
    const ring = new THREE.RingGeometry(R, R + 0.09, 24);
    ring.rotateY(Math.atan2(nx, nz));
    ring.translate(x + nx * 0.035, CY, z + nz * 0.035);
    stone(ring);
    // the right of someone looking at the face, and up
    const rx = nz;
    const rz = -nx;
    const at = (theta, rad, off = 0.05) => ({ x: x + nx * off + rx * Math.sin(theta) * rad, y: CY + Math.cos(theta) * rad, z: z + nz * off + rz * Math.sin(theta) * rad });
    const centre = at(0, 0);
    const hour = ((7 + 10 / 60) / 12) * Math.PI * 2;
    const minute = (10 / 60) * Math.PI * 2;
    painted(rod(centre, at(hour, 0.3), 0.03, 5), 0x1a1612);
    painted(rod(centre, at(minute, 0.45), 0.02, 5), 0x1a1612);
    for (let i = 0; i < 12; i++) painted(rod(at((i / 12) * Math.PI * 2, 0.43, 0.04), at((i / 12) * Math.PI * 2, 0.51, 0.04), i % 3 ? 0.012 : 0.022, 4), 0x2a2420);
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

  // the weathervane (discovery C): a mast to VANE_TIP, the four letters, the arrow
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
  const yaw = 0.6; // where the wind is from tonight
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
      const g = new THREE.IcosahedronGeometry(0.045, 0);
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
  const wall = (g) => K.put('wall', M.wall, g, { tile: TILE.brick });
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
  K.put('slates', M.slates, extrudeX(ridge, E.x0 - 0.2, E.x1 + 0.2), { tile: TILE.shingle });
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
const TOWN_ROWS = Object.freeze([
  { s: 52.5, depth: 7, h: [2.5, 6] },
  { s: 66, depth: 9, h: [5, 9] },
  { s: 84, depth: 12, h: [7, 11.5] },
]);
const TOWN_KEEP_OUT = Object.freeze([
  { x0: ROOFS_BOUNDS.minX - 0.8, x1: ROOFS_BOUNDS.maxX + 0.8, z0: ROOFS_BOUNDS.minZ - 0.8, z1: ROOFS_BOUNDS.maxZ + 0.8 },
  { x0: BLOCK.street.x0 - 10.5, x1: BLOCK.street.x0, z0: BLOCK.street.z0 - 1.5, z1: BLOCK.street.z1 + 0.7 }, // the end house
]);
function drawTown(scene) {
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  const tri = (p, q, r, hex) => {
    pos.push(...p, ...q, ...r);
    c.setHex(hex);
    for (let i = 0; i < 3; i++) col.push(c.r, c.g, c.b);
  };
  const quad = (p, q, r, s, hex) => { tri(p, q, r, hex); tri(p, r, s, hex); };
  const cx = (ROOFS_BOUNDS.minX + ROOFS_BOUNDS.maxX) / 2;
  const cz = (ROOFS_BOUNDS.minZ + ROOFS_BOUNDS.maxZ) / 2;
  const y0 = L.STREET;
  const dim = (hex, k) => mixHex(0, hex, k);
  // a house: centre (x, z), t its tangent (along the row), n toward the place
  function house(x, z, t, n, w, d, h, rise, seed) {
    const P = (a, bb, yy) => [x + t[0] * a + n[0] * bb, yy, z + t[1] * a + n[1] * bb];
    const wallHex = mixHex(0x4b4559, 0x665660, hash01(x, z, seed));
    const roofHex = mixHex(0x2a2836, 0x3a3444, hash01(z, x, seed + 1));
    const [a, e] = [w / 2, d / 2];
    quad(P(-a, e, y0), P(a, e, y0), P(a, e, h), P(-a, e, h), wallHex); // the front, toward the place
    quad(P(a, -e, y0), P(-a, -e, y0), P(-a, -e, h), P(a, -e, h), dim(wallHex, 0.7));
    quad(P(-a, -e, y0), P(-a, e, y0), P(-a, e, h), P(-a, -e, h), dim(wallHex, 0.82));
    quad(P(a, e, y0), P(a, -e, y0), P(a, -e, h), P(a, e, h), dim(wallHex, 0.82));
    if (rise > 0) {
      quad(P(-a, e, h), P(a, e, h), P(a, 0, h + rise), P(-a, 0, h + rise), roofHex);
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
    // a lit window or two on the front
    const floors = Math.max(1, Math.floor((h - 0.5) / 2.8));
    for (let i = 0; i < 2; i++) {
      if (hash01(x + i, z, seed + 4) > 0.6) continue;
      const u = (hash01(x, z + i, seed + 5) - 0.5) * (w - 1.6);
      const fy = 0.6 + 2.8 * Math.floor(hash01(z, x + i, seed + 6) * floors) + 0.4;
      quad(P(u - 0.4, e + 0.05, fy), P(u + 0.4, e + 0.05, fy), P(u + 0.4, e + 0.05, fy + 1.0), P(u - 0.4, e + 0.05, fy + 1.0), 0xffc56a);
    }
  }
  const sides = [
    { t: [1, 0], n: [0, -1], at: (s, u) => [cx + u, cz + s] }, // south, facing north
    { t: [-1, 0], n: [0, 1], at: (s, u) => [cx - u, cz - s] }, // north
    { t: [0, -1], n: [-1, 0], at: (s, u) => [cx + s, cz - u] }, // east
    { t: [0, 1], n: [1, 0], at: (s, u) => [cx - s, cz + u] }, // west
  ];
  TOWN_ROWS.forEach((row, ri) => {
    sides.forEach((side, si) => {
      let u = -row.s + row.depth / 2;
      let k = 0;
      while (u < row.s - row.depth / 2) {
        const seed = ri * 97 + si * 31 + k++;
        const w = 5.5 + 3.5 * hash01(u, row.s, seed);
        const mid = u + w / 2;
        u += w + 0.6;
        const [x, z] = side.at(row.s, mid);
        const hw = Math.abs(side.t[0]) * w / 2 + Math.abs(side.n[0]) * row.depth / 2;
        const hd = Math.abs(side.t[1]) * w / 2 + Math.abs(side.n[1]) * row.depth / 2;
        if (TOWN_KEEP_OUT.some((r) => x + hw > r.x0 && x - hw < r.x1 && z + hd > r.z0 && z - hd < r.z1)) continue;
        const h = row.h[0] + (row.h[1] - row.h[0]) * hash01(x, z, seed + 7);
        const flatTop = hash01(z, x, seed + 8) < 0.15;
        house(x, z, side.t, side.n, w, row.depth * (0.75 + 0.25 * hash01(x, z, seed + 9)), h, flatTop ? 0 : 1.6 + 1.2 * hash01(x, z, seed + 10), seed);
      }
    });
  });
  // two church spires, far off
  for (const [x, z] of [[-70, -66], [64, 72]]) {
    house(x, z, [1, 0], [0, 1], 4, 4, 10, 0, 401);
    const top = [x, 16.2, z];
    const r = 2;
    const pts = [[x - r, 10, z - r], [x + r, 10, z - r], [x + r, 10, z + r], [x - r, 10, z + r]];
    for (let i = 0; i < 4; i++) tri(pts[i], pts[(i + 1) % 4], top, i % 2 ? 0x2c2a38 : 0x36323f);
  }
  // the town's ground under it all, outside the place
  const g = 0x262430;
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
