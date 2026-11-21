// How the gates look: the four gate looks (src/gateways.js GATE_LOOKS), their
// lanes and their posts' colliders. A shut gate must look shut and an open
// one open, so each gate is a fixed body and a leaf that swings.
//
// WHY THIS IS CALLED FROM walk.js AND NOT FROM THE AREA BUILDERS. The same two
// reasons as the border posts (world/borderpost.js, R13). The world builders
// read nothing about the player: what co-walkers share must never depend on
// which places she owns or how the game is being played, and whether a gate is
// shut or open is exactly that. And the frozen flat trace
// (test/fixtures/flat-trace.json) pins every area build, so a gate drawn there
// would move it for every place at once. So walk.js adds the gates right after
// the area build (they get contact shadows like any static prop, and the body
// merges with nothing because each gate is already one body mesh) and pushes
// the returned colliders onto the live list only her own cat reads, and hands
// that list to attach() so a shut leaf blocks the way. Never area.colliders.
//
// A gate is a group named 'gateway' at its end's spot, turned so its local -z
// points the way the cat walks out (`faces`) and its local x runs along the
// edge, with the posts at x = -GATE_HALF (the hinge) and x = +GATE_HALF. Two
// meshes:
//   gateBody  posts, frame and a band in the neighbour's map colour: one
//             vertex-coloured indexed geometry, one material.
//   gateLeaf  the bar, doors or gate: a child of its own group at the hinge
//             post, so turning that group swings it. Shut is 0; open is +pi/2,
//             which swings the free end out of the area, the way `faces`
//             points. noMerge (it moves after the build) and noCast (a thin
//             swinging leaf is not worth a shadow draw).
// Each look is at most 400 triangles over both meshes.
//
// A 'none' look is for a door or a climb the area draws itself (the Old
// House's front door, the Rooftops' fire escape): no mesh, no lane, no
// collider.
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial, surfaceProps } from '../render/materials.js';
import { path } from './builder.js';
import { clothKey } from './borderpost.js';
import { endsFor, GATE_HALF, GATE_POST_R } from '../gateways.js';
import { LAND } from '../territories.js';
import { STREET_LAND, TOWN_LAND } from '../worldmap.js';
import { FLAT_GROUND, seatOnGround } from '../ground.js';

const H = GATE_HALF;
// rotation.y that turns local -z to point the way the end faces.
const OUT_YAW = { north: 0, south: Math.PI, east: -Math.PI / 2, west: Math.PI / 2 };
// World direction of local +x (along the edge, hinge post to latch post).
const EDGE = { north: [1, 0], south: [-1, 0], east: [0, 1], west: [0, -1] };
export const LEAF_OPEN = Math.PI / 2;
const LANE_W = 2;
// A shut leaf blocks (ruling R11): LEAF_BLOCKS circles of LEAF_R spaced
// evenly across the gap between the posts. With the cat's CAT_RADIUS (0.35,
// player.js) each circle keeps her 0.65 m off its centre, and the circles are
// 0.7 m apart (and 0.7 m from each post), so the push zones overlap into one
// wall with no way through.
export const LEAF_BLOCKS = 3;
export const LEAF_R = 0.3;

// The neighbour's colour on the map: the territories' LAND for the town (and
// clan places), the street places' colours, the town's own places.
export function bandColour(to) {
  return LAND[clothKey(to)] ?? STREET_LAND[to] ?? TOWN_LAND[to] ?? LAND.gorge;
}

// Colours. Plain painted and weathered things, as the border posts.
const WOOD = 0x8a6a48;
const WOOD_DARK = 0x6a5038;
const WOOD_PALE = 0xb08e64;
const RED = 0xc8463c;
const WHITE = 0xf1ebdf;
const GOLD = 0xe0b048;
const TEAL = 0x3f8f8c;
const CREAM = 0xf3e6c4;
const IRON = 0x2f4a4a;
const GLASS = 0xffe9a6;

// Parts merged into one vertex-coloured indexed geometry (as builder.js's
// houseTrim does, but kept indexed: the triangle budget counts index entries).
function kit() {
  const parts = [];
  const add = (geo, hex) => {
    if (geo.attributes.uv) geo.deleteAttribute('uv');
    if (geo.attributes.uv1) geo.deleteAttribute('uv1');
    if (!geo.index) geo = mergeVertices(geo);
    const c = new THREE.Color(hex); // linear r/g/b under Three's colour management
    const col = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(geo);
  };
  const place = (geo, x, y, z, { rx = 0, ry = 0, rz = 0 } = {}) => {
    if (rx) geo.rotateX(rx);
    if (rz) geo.rotateZ(rz);
    if (ry) geo.rotateY(ry);
    geo.translate(x, y, z);
    return geo;
  };
  return {
    box(w, h, d, x, y, z, hex, turn) { add(place(new THREE.BoxGeometry(w, h, d), x, y, z, turn), hex); },
    // A round post or ring: `open` leaves the caps off (a stripe inside a post).
    cyl(rTop, rBot, h, seg, x, y, z, hex, { open = false, ...turn } = {}) {
      add(place(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open), x, y, z, turn), hex);
    },
    cone(r, h, seg, x, y, z, hex) { add(place(new THREE.ConeGeometry(r, h, seg), x, y, z), hex); },
    solid(geo, x, y, z, hex, turn) { add(place(geo, x, y, z, turn), hex); },
    merged() {
      const out = mergeGeometries(parts, false);
      for (const g of parts) g.dispose();
      return out;
    },
  };
}

// A flat shape in the x-y plane, `depth` thick, centred on z = 0.
function slab(shape, depth, curveSegments = 6) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

// An arched board: the ring between radii r0 < r1 about (0, cy), between
// angles a and pi - a, in the x-y plane.
function arch(cy, r0, r1, a, depth, segments) {
  const s = new THREE.Shape();
  s.absarc(0, cy, r1, a, Math.PI - a, false);
  s.absarc(0, cy, r0, Math.PI - a, a, true);
  s.closePath();
  return slab(s, depth, segments);
}

// ---------------------------------------------------------------------------
// The looks. Each draws into `body` (fixed) and `leaf` (in its hinge's frame:
// x from 0 at the hinge post's centre to 2H at the latch post's), and returns
// nothing. `band` is the neighbour's colour.
// ---------------------------------------------------------------------------

// A road's signpost: a short hinge post and a tall post with a fingerpost
// board pointing out over the edge, the band under the board; the leaf is a
// red-and-white striped bar across the way, resting on a bracket.
function signpost(body, leaf, band) {
  body.cyl(0.1, 0.12, 1.0, 6, -H, 0.5, 0, WOOD);
  body.cone(0.13, 0.12, 6, -H, 1.06, 0, WOOD_DARK);
  body.cyl(0.1, 0.12, 1.7, 6, H, 0.85, 0, WOOD);
  body.cone(0.13, 0.12, 6, H, 1.76, 0, WOOD_DARK);
  // The fingerpost: a board in the neighbour's colour, out over the edge, and
  // its arrow tip.
  body.box(0.05, 0.2, 0.72, H, 1.45, -0.33, band);
  const tip = new THREE.Shape();
  tip.moveTo(0, -0.15);
  tip.lineTo(0, 0.15);
  tip.lineTo(0.22, 0);
  tip.closePath();
  body.solid(slab(tip, 0.05), H, 1.45, -0.69, band, { ry: Math.PI / 2 });
  // The band of cloth under the board, and one on the hinge post too.
  body.cyl(0.125, 0.125, 0.14, 8, H, 1.2, 0, band);
  body.cyl(0.125, 0.125, 0.12, 8, -H, 0.82, 0, band);
  // The bracket the bar rests in, on the tall post.
  body.box(0.16, 0.06, 0.16, H, 0.68, 0, WOOD_DARK);
  // The bar: five stripes, from the hinge post to just past the latch post.
  const len = 2 * H + 0.12;
  const n = 5;
  for (let i = 0; i < n; i++) {
    leaf.box(len / n, 0.1, 0.1, 0.06 + (i + 0.5) * (len / n), 0.76, 0, i % 2 ? WHITE : RED);
  }
}

// The fair's gate: two red-and-white striped posts with gold tops, an arched
// red top board with the band along its foot; the leaf is a pair of low
// painted doors (one leaf, so they swing as one from the hinge post).
function fairgate(body, leaf, band) {
  const top = 2.0;
  const n = 5;
  for (const x of [-H, H]) {
    for (let i = 0; i < n; i++) {
      body.cyl(0.13, 0.13, top / n, 6, x, (i + 0.5) * (top / n), 0, i % 2 ? WHITE : RED, { open: true });
    }
    body.cone(0.17, 0.32, 6, x, top + 0.16, 0, GOLD);
  }
  // The arch spans the post tops: a circle through (+-H, top) and (0, top + rise).
  const rise = 0.45;
  const R = (H * H + rise * rise) / (2 * rise);
  const cy = top + rise - R;
  const a = Math.atan2(top - cy, H);
  body.solid(arch(cy, R - 0.34, R, a, 0.08, 5), 0, 0.02, 0, RED);
  body.solid(arch(cy, R - 0.42, R - 0.34, a, 0.1, 5), 0, 0.02, 0, band);
  // A gold star (a little diamond) at the apex.
  body.solid(new THREE.OctahedronGeometry(0.13, 0), 0, top + rise + 0.12, 0, GOLD);
  // The doors: each a teal panel with a gold rail at its top and a cream band
  // across its middle, a small gap between them.
  const inner = 2 * H - 0.26;
  const w = (inner - 0.04) / 2;
  for (const i of [0, 1]) {
    const cx = 0.13 + w / 2 + i * (w + 0.04);
    leaf.box(w, 0.8, 0.06, cx, 0.5, 0, TEAL);
    leaf.box(w, 0.08, 0.09, cx, 0.94, 0, GOLD);
    leaf.box(w * 0.86, 0.12, 0.08, cx, 0.5, 0, CREAM);
  }
}

// A farm gate: two square posts with caps and the band; the leaf is a
// five-bar wooden gate with its two uprights and a diagonal brace.
function farmgate(body, leaf, band) {
  for (const x of [-H, H]) {
    body.box(0.2, 1.3, 0.2, x, 0.65, 0, WOOD);
    body.box(0.26, 0.06, 0.26, x, 1.33, 0, WOOD_DARK);
    body.box(0.22, 0.12, 0.22, x, 1.12, 0, band);
  }
  // The latch: an iron loop on the latch post.
  body.box(0.08, 0.12, 0.12, H - 0.13, 0.95, 0, IRON);
  const x0 = 0.12;
  const x1 = 2 * H - 0.12;
  const len = x1 - x0;
  for (const s of [0, len]) leaf.box(0.09, 1.08, 0.08, x0 + s + (s ? -0.045 : 0.045), 0.6, 0, WOOD_PALE);
  for (let i = 0; i < 5; i++) leaf.box(len, 0.09, 0.06, x0 + len / 2, 0.16 + i * 0.22, 0, WOOD_PALE);
  // The brace, from the hinge foot to the latch top.
  const dx = len - 0.18;
  const dy = 0.88;
  leaf.box(Math.hypot(dx, dy), 0.08, 0.05, x0 + len / 2, 0.6, 0.055, WOOD_PALE, { rz: Math.atan2(dy, dx) });
}

// The promenade's gate: white railings running out a short way each side, a
// lamp on the latch post, the band on both posts; the leaf is a swing gate
// of iron bars between a white top rail and bottom rail.
const PROM_RUN = 1.2; // m of railing each side, post centre to end post
const PROM_RAIL = Object.freeze({ post: 0.95, top: 0.9, mid: 0.45 });
function promenade(body, leaf, band) {
  const run = PROM_RUN;
  body.cyl(0.11, 0.13, 1.05, 8, -H, 0.525, 0, WHITE);
  body.solid(new THREE.OctahedronGeometry(0.12, 0), -H, 1.15, 0, WHITE);
  body.cyl(0.08, 0.13, 2.3, 8, H, 1.15, 0, IRON);
  body.cyl(0.135, 0.135, 0.12, 6, -H, 0.8, 0, band);
  body.cyl(0.135, 0.135, 0.12, 6, H, 0.8, 0, band);
  // The lamp: an iron base, the glass and a little cap.
  body.box(0.26, 0.05, 0.26, H, 2.32, 0, IRON);
  body.box(0.22, 0.3, 0.22, H, 2.495, 0, GLASS);
  body.cone(0.22, 0.2, 4, H, 2.75, 0, IRON);
  // The railings out each side: an end post, a top rail and a mid rail.
  for (const s of [-1, 1]) railing(body, s * H, s * (H + run), false);
  // The gate: rails, two stiles and five iron bars.
  const x0 = 0.13;
  const x1 = 2 * H - 0.13;
  const len = x1 - x0;
  leaf.box(len, 0.08, 0.07, x0 + len / 2, 0.92, 0, WHITE);
  leaf.box(len, 0.06, 0.06, x0 + len / 2, 0.14, 0, WHITE);
  for (const x of [x0 + 0.04, x1 - 0.04]) leaf.box(0.07, 0.86, 0.07, x, 0.53, 0, WHITE);
  for (let i = 1; i <= 5; i++) leaf.box(0.035, 0.72, 0.035, x0 + (i * len) / 6, 0.53, 0, IRON);
}

// A white railing along local x from x0 to x1: a post at x1 (and at x0 too
// when `first`), more posts so none is over WING_STEP from the next, a top
// rail and a mid rail.
function railing(kit, x0, x1, first) {
  const len = Math.abs(x1 - x0);
  const n = Math.max(1, Math.ceil(len / WING_STEP - 1e-9));
  for (let i = first ? 0 : 1; i <= n; i++) kit.box(0.1, PROM_RAIL.post, 0.1, x0 + ((x1 - x0) * i) / n, PROM_RAIL.post / 2, 0, WHITE);
  kit.box(len, 0.07, 0.07, (x0 + x1) / 2, PROM_RAIL.top, 0, WHITE);
  kit.box(len, 0.05, 0.05, (x0 + x1) / 2, PROM_RAIL.mid, 0, WHITE);
}

// An end's `wings` (gateways.js): the promenade's railing run on from the end
// of its own short run (PROM_RUN past each post) out to `wings` m past each
// post, along the edge line. One mesh, 'gateWings', a top-level child of the
// scene in the gate's own frame (so the look stays its own two meshes), and
// circles of WING_R at most WING_GAP apart from each post out to each end:
// with the cat's CAT_RADIUS (0.35) the push zones overlap the posts' and each
// other's, so she cannot get through the railing anywhere along it.
export const WING_STEP = 2.4;
export const WING_R = 0.25;
export const WING_GAP = 0.8;
function buildWings(end, ground) {
  if (!end.wings) return null;
  const kit0 = kit();
  let drawn = 0;
  end.wings.forEach((len, i) => {
    const s = i === 0 ? -1 : 1;
    if (len <= PROM_RUN) return;
    railing(kit0, s * (H + PROM_RUN), s * (H + len), false);
    drawn++;
  });
  if (!drawn) return null;
  const mesh = new THREE.Mesh(kit0.merged(), gateMaterial());
  mesh.name = 'gateWings';
  mesh.userData.endId = end.id;
  mesh.position.set(end.x, ground.y(end.x, end.z), end.z);
  mesh.rotation.y = OUT_YAW[end.faces];
  return mesh;
}
function wingColliders(end) {
  const out = [];
  if (!end.wings) return out;
  const [ex, ez] = EDGE[end.faces];
  end.wings.forEach((len, i) => {
    const s = i === 0 ? -1 : 1;
    const n = Math.ceil(len / WING_GAP - 1e-9);
    for (let k = 1; k <= n; k++) {
      const d = H + (len * k) / n;
      out.push({ x: end.x + s * ex * d, z: end.z + s * ez * d, r: WING_R });
    }
  });
  return out;
}

const LOOKS = { signpost, fairgate, farmgate, promenade };

// One material per gate, shared by its body and its leaf: noMerge and noCast
// are read off the mesh's userData, never off its material.
const gateMaterial = () => litMaterial(0xffffff, { vertexColors: true, ...surfaceProps('wood') });

// The look for one end, or null for 'none'.
export function buildGateLook(end, { ground = FLAT_GROUND } = {}) {
  const draw = LOOKS[end.look];
  if (!draw) return null;
  const body = kit();
  const leaf = kit();
  draw(body, leaf, bandColour(end.to));

  const g = new THREE.Group();
  g.name = 'gateway';
  g.userData.endId = end.id;
  g.position.set(end.x, ground.y(end.x, end.z), end.z);
  g.rotation.y = OUT_YAW[end.faces];

  const material = gateMaterial();
  const bodyMesh = new THREE.Mesh(body.merged(), material);
  bodyMesh.name = 'gateBody';
  g.add(bodyMesh);

  const hinge = new THREE.Group();
  hinge.name = 'gateHinge';
  hinge.position.set(-H, 0, 0);
  const leafMesh = new THREE.Mesh(leaf.merged(), material);
  leafMesh.name = 'gateLeaf';
  leafMesh.userData.noCast = true;
  leafMesh.userData.noMerge = true;
  hinge.add(leafMesh);
  g.add(hinge);
  return g;
}

export const NO_GATES = Object.freeze({ colliders: Object.freeze([]), attach() {}, setOpen() {}, dispose() {} });

// Adds each end's look and lane to `scene`. Returns:
//   colliders  the posts' colliders for walk.js to push (two per drawn end,
//              hinge post first, then its wings' circles, hinge side first);
//              fixed, whatever the leaves do.
//   attach(list)  pushes the leaf circles of every end shut right now into
//              `list` (the walk's live collider list) and remembers it.
//   setOpen(endId, open)  swings the leaf; once attached, an opened end's
//              circles leave `list` and a shut one's come back. Idempotent;
//              unknown ids are ignored; before attach it only records.
//   dispose()  a no-op (the walk's scene sweep frees the meshes; kept so
//              endWalk has one door to call).
export function addGatewayDressing(scene, areaId, { ground = FLAT_GROUND, ends = endsFor(areaId), isOpen = () => false } = {}) {
  const colliders = [];
  const gates = new Map(); // endId -> { hinge, blocks, open }
  let live = null;
  for (const end of ends) {
    const look = buildGateLook(end, { ground });
    if (!look) continue;
    if (end.lane) {
      // A top-level child, so the grass mask and the corner map see it.
      const lane = seatOnGround(path(...end.lane, LANE_W, { surface: 'gravel' }), ground);
      // Named 'path' (ruling R12): the wet and dusk tints and the paw prints
      // find path strips by that name. The flag tells a gate's lane apart.
      lane.userData.gateLane = true;
      scene.add(lane);
    }
    scene.add(look);
    const wings = buildWings(end, ground);
    if (wings) scene.add(wings);
    const [ex, ez] = EDGE[end.faces];
    for (const s of [-1, 1]) colliders.push({ x: end.x + s * ex * H, z: end.z + s * ez * H, r: GATE_POST_R });
    colliders.push(...wingColliders(end));
    const blocks = [];
    for (let i = 1; i <= LEAF_BLOCKS; i++) {
      const t = -H + (2 * H * i) / (LEAF_BLOCKS + 1);
      blocks.push({ x: end.x + t * ex, z: end.z + t * ez, r: LEAF_R });
    }
    const hinge = look.getObjectByName('gateHinge');
    const open = !!isOpen(end);
    hinge.rotation.y = open ? LEAF_OPEN : 0;
    gates.set(end.id, { hinge, blocks, open });
  }
  const unblock = (gate) => {
    for (const c of gate.blocks) {
      const i = live.indexOf(c);
      if (i >= 0) live.splice(i, 1);
    }
  };
  const block = (gate) => {
    for (const c of gate.blocks) if (!live.includes(c)) live.push(c);
  };
  return {
    colliders,
    attach(list) {
      live = list;
      for (const gate of gates.values()) if (!gate.open) block(gate);
    },
    setOpen(endId, open) {
      const gate = gates.get(endId);
      if (!gate) return;
      gate.open = !!open;
      gate.hinge.rotation.y = gate.open ? LEAF_OPEN : 0;
      if (live) (gate.open ? unblock : block)(gate);
    },
    dispose() {},
  };
}
