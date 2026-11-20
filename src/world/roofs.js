import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as b from './builder.js';
import { litMaterial, tileMetres } from '../render/materials.js';
import { withLocalUuids } from './localuuids.js';
import { hash01 } from './warehouselook.js';
import { roofsMaterials, addWindowQuads, windowCell, markMesh } from './roofsparts.js';
import {
  LEVELS as L, BLOCKS, GROUNDS, ROOFS_BOUNDS, ROOFS_SPAWN, ROOFS_COLLIDERS, ROOFS_TRAVERSAL, roofsArea,
  ALLEY_LAMP, BIN_2, BIN_3, ALLEY_CRATES, YARD, YARD_WALLS, WASHING_POSTS,
} from './roofsplan.js';
import { STEP_MAX } from '../ground.js';

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
// NOTHING FADES (R7): no mesh carries userData.window and no group a
// fadeOccluder. The one lamp is builder.lampPost, so dusk lights its globe and
// the lamp pools find it.
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

const _o = new THREE.Object3D();
// The matrix that lays a thing made along +x from a to b ({ x, y, z }).
function along(a, c) {
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const dz = c.z - a.z;
  const h = Math.hypot(dx, dz);
  _o.position.set((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2);
  _o.rotation.set(0, -Math.atan2(dz, dx), Math.atan2(dy, h));
  _o.scale.set(1, 1, 1);
  _o.updateMatrix();
  return { matrix: _o.matrix.clone(), len: Math.hypot(h, dy) };
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
  };
}

const TILE = Object.fromEntries(['brick', 'shingle', 'gravel', 'cobble', 'flagstone', 'grass', 'wood'].map((s) => [s, tileMetres(s) || 1]));

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
    const win = (x, y, z, nx, nz, w, h) => windows.push({ x, y, z, nx, nz, w, h, cell: windowCell(x, z, windows.length) });

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

    // every window of part one: one mesh on the one atlas
    const panes = new THREE.Mesh(addWindowQuads(windows).geometry, M.windows);
    panes.name = 'roofsWindows';
    terrace.add(finish(panes, true));

    const lamp = b.lampPost(ALLEY_LAMP.x, ALLEY_LAMP.z);
    lamp.name = 'roofsAlleyLamp';
    scene.add(alley, terrace, moves, lamp);

    return {
      name: 'The Rooftops',
      colliders: ROOFS_COLLIDERS.map((c) => ({ ...c })),
      bounds: { ...ROOFS_BOUNDS },
      spawn: { x: ROOFS_SPAWN.x, z: ROOFS_SPAWN.z },
      boxes: [], // Task 8
      waters: [],
      waterFx: [],
      pois: [], // Task 8
      collectibles: [], // Task 8
      scenics: [], // Task 8
      critterSpawns: [],
      moments: [],
      puddles: [], // Task 8
      groundBounce: ROOFS_GROUND_COLOR,
      skyDusk: { ...SKY_DUSK }, // Task 8 drives the evening from these
      skySunset: { ...SKY_SUNSET },
      duskLight: { fogNear: 40, fogFar: 140 },
      tippables: [], // Task 8
      perches: [], // Task 8
      ground,
      traversal: plan.traversal, // the moves (src/traversal.js), from the plan
      anchors: {}, // Task 8
      evening: true,
      strays: false,
    };
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
    } else {
      continue; // pipe-1, on the warehouse: Task 8
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
