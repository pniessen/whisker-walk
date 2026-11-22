import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial, repeatFor, surfaceProps } from '../render/materials.js';
import { pieceKit } from './builder.js';
import { withLocalUuids } from './localuuids.js';

// =============================================================================
// THE OLD HOUSE'S FRONT, in the town (Old House step 4, plan ruling W5).
// =============================================================================
// A big old three-storey brick house against the town's west hedge, its front
// facing east onto the lawn: a steep slate roof with a gable over the door and
// two chimneys, the round attic window in that gable (the attic's own round
// window, inside), tall sash windows on three floors, three stone steps up to
// a big panelled double door with a fanlight, a lantern either side and a pot
// either side of the steps. Warm red brick and cream stone, lit windows at
// dusk: an old house a child wants to go into, nothing in it to be scared of.
//
// The Neighborhood draws it only when a walk hands it the `town-house` gate
// end (neighborhood.js), so Legacy, a bare build() and the flat trace get the
// town exactly as before. The door stays shut (W7): walking up to it is the
// gate, and the gate's own prompt and moment carry her in.
//
// Two meshes, so the town stays inside its merged-mesh guard (the merge never
// joins two top-level children, so the front's own count is what it adds):
// the body, every wall, slate, stone, frame, sill, step, door, chimney and pot
// on the brick-textured material, coloured per piece by vertex colours; and the
// glass (every pane, the fanlight, the round window and the lanterns,
// userData.window, so render/dusk.js lights them as it lights the town's houses
// and treefade.js fades the house when the camera is behind it). The walls
// carry the town's brick UVs; the roof the same texture at a slate's size, so it
// reads as courses of slates; every other piece one fixed spot inside a brick,
// so it is flat colour. The glass casts no shadow.
//
// THE RULES builder.house() keeps, kept here:
//   * No Math.random. Everything is made inside withLocalUuids, so the build's
//     draw count does not move with the end handed in or not.
//   * The body reuses the lots' brick texture variant exactly: its material
//     asks for repeatFor('brick', 5, 3), the repeat the town's brick houses
//     already made (they are built first), and the walls' UVs count metres / 5
//     and / 3 so the bricks are the town's size. So no new texture variant is
//     made (or cached) under the local uuids.
//
// Laid out in a local frame with the front facing +z (as builder.house()),
// x across the front, then turned a quarter so the front faces east (+x).
// =============================================================================

// The footprint (world) and the door's spot at the foot of the steps. Task 5's
// gate end stands 0.45 m in front of it, at (door.x + 0.45, door.z).
export const OLD_HOUSE_FRONT = Object.freeze({ x0: -54, x1: -44, z0: 24, z1: 38, door: Object.freeze({ x: -44, z: 31 }) });

const CX = (OLD_HOUSE_FRONT.x0 + OLD_HOUSE_FRONT.x1) / 2; // -49
const CZ = (OLD_HOUSE_FRONT.z0 + OLD_HOUSE_FRONT.z1) / 2; // 31

const BRICK = 0xa8604c; // warm, old red brick
const TRIM = 0xf1e8d4; // cream stone and paint
const STONE = 0xb9ae9f; // the plinth and the steps
// The walls and the slates carry the brick tile (its mean is 0.948), so their
// colours are lifted by 1 / 0.948, as builder.house() lifts a brick body:
// 0xa8604c and 0x56606e land as typed.
const WALL = 0xb16550;
const SLATE = 0x5b6574;
const RIDGE = 0x464d58;
const DOOR = 0x2e6a55; // a deep green door
const PANEL = 0x3a7a63;
const BRASS = 0xd8b04a;
const IRON = 0x3b3a40;
const POT = 0xc4673f;
const BAY_TREE = 0x4f8a3e;
const CHIMNEY_POT = 0xb5643c;
const GLASS = 0xa8d8e8; // builder.house()'s HOUSE_GLASS

// The local frame. Body x -W..W, back at z BACK, front wall at z FRONT; the
// middle bay (door, gable, round window) stands BAY_OUT proud of it, x -BAY..BAY.
const W = 6.9;
const BACK = -4.8;
const FRONT = 3.5;
const BAY = 2.6;
const BAY_FRONT = 4.0;
const STEP_H = 0.15; // three steps up to the door
const SILL_Y = 3 * STEP_H;
const EAVE = 8.8; // three storeys: 0-3.8, 3.8-6.4, 6.4-8.8
const COURSES = [3.8, 6.4];
const PITCH = 1.15; // rise per metre: a steep roof
const OVER = 0.35; // eaves overhang
const RIDGE_Z = (BACK + FRONT) / 2;
const RIDGE_Y = EAVE + (FRONT - RIDGE_Z) * PITCH;
const GABLE_PEAK = EAVE + BAY * PITCH;
// The cross gable's eave corner (x = BAY + OVER) and where its slopes meet the main roof.
const GX = BAY + 0.3;
const GY = GABLE_PEAK - GX * PITCH;
const valleyZ = (y) => FRONT - (y - EAVE) / PITCH;

// Windows: [x, y (pane centre), w, h], on the front wall (z FRONT) or the bay (z BAY_FRONT).
const ROWS = [[2.05, 1.9, 0.95], [5.1, 1.6, 0.95], [7.55, 1.3, 0.95]]; // [y, h, w]
const WING_X = [-5.75, -4.1, 4.1, 5.75];
const BAY_WINDOWS = [[-0.75, 5.1, 0.8, 1.6], [0.75, 5.1, 0.8, 1.6], [0, 7.55, 0.95, 1.3]];
const ROUND = { y: 10.15, r: 0.55 };
const DOOR_W = 1.5;
const DOOR_TOP = 2.85;
const FAN_R = DOOR_W / 2;

// --- the brick: hand-made quads and triangles with the town's brick UVs ------
function brickGeometry() {
  const pos = [], uv = [];
  // A planar polygon (fan), u from `along` (metres along the wall), v from y.
  const face = (pts, along) => {
    for (let i = 1; i < pts.length - 1; i++) {
      for (const p of [pts[0], pts[i], pts[i + 1]]) {
        pos.push(...p);
        uv.push(along(p) / 5, p[1] / 3);
      }
    }
  };
  // wound so each face looks outward (counter-clockwise seen from outside)
  const byX = (p) => p[0], byZ = (p) => p[2];
  face([[-W, 0, FRONT], [W, 0, FRONT], [W, EAVE, FRONT], [-W, EAVE, FRONT]], byX);
  face([[W, 0, BACK], [-W, 0, BACK], [-W, EAVE, BACK], [W, EAVE, BACK]], byX);
  // the side walls run up into their gables
  face([[W, 0, FRONT], [W, 0, BACK], [W, EAVE, BACK], [W, RIDGE_Y, RIDGE_Z], [W, EAVE, FRONT]], byZ);
  face([[-W, 0, BACK], [-W, 0, FRONT], [-W, EAVE, FRONT], [-W, RIDGE_Y, RIDGE_Z], [-W, EAVE, BACK]], byZ);
  // the bay, its front running up into the door's gable
  face([[-BAY, 0, BAY_FRONT], [BAY, 0, BAY_FRONT], [BAY, EAVE, BAY_FRONT], [0, GABLE_PEAK, BAY_FRONT], [-BAY, EAVE, BAY_FRONT]], byX);
  face([[BAY, 0, BAY_FRONT], [BAY, 0, FRONT], [BAY, EAVE, FRONT], [BAY, EAVE, BAY_FRONT]], byZ);
  face([[-BAY, 0, FRONT], [-BAY, 0, BAY_FRONT], [-BAY, EAVE, BAY_FRONT], [-BAY, EAVE, FRONT]], byZ);
  return bodyPart(pos, uv, WALL);
}

// A body part from its positions and UVs, all one colour.
function bodyPart(pos, uv, hex) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return paint(geo, hex);
}
function paint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// --- the roof: the main ridge along the front, the door's gable across it ----
function roofGeometry() {
  const pos = [], uv = [];
  const slope = Math.hypot(1, PITCH);
  // A quad [a, b, c, d], both faces (the eaves' undersides): the brick tile at a
  // slate's size, 0.3 m across the eave by 0.2 m up the slope (u, v by
  // SLATE_U, SLATE_V against the walls' / 5, / 3), so its courses read as slates.
  const quad = (pts, u, up) => {
    for (const t of [[0, 1, 2], [0, 2, 3], [0, 2, 1], [0, 3, 2]]) {
      for (const i of t) {
        pos.push(...pts[i]);
        uv.push(u(pts[i]) / SLATE_U, (up(pts[i]) * slope) / SLATE_V);
      }
    }
  };
  const X = W + 0.3;
  const eaveF = FRONT + OVER, eaveB = BACK - OVER;
  const yF = EAVE - OVER * PITCH;
  quad([[-X, yF, eaveF], [X, yF, eaveF], [X, RIDGE_Y, RIDGE_Z], [-X, RIDGE_Y, RIDGE_Z]], (p) => p[0], (p) => eaveF - p[2]);
  quad([[X, yF, eaveB], [-X, yF, eaveB], [-X, RIDGE_Y, RIDGE_Z], [X, RIDGE_Y, RIDGE_Z]], (p) => p[0], (p) => p[2] - eaveB);
  // the door's gable: two slopes from its eaves (x +-GX) to its ridge (x 0),
  // running back from its front edge to where they meet the main roof
  const gF = BAY_FRONT + OVER;
  for (const s of [1, -1]) {
    const pts = [[s * GX, GY, gF], [0, GABLE_PEAK, gF], [0, GABLE_PEAK, valleyZ(GABLE_PEAK)], [s * GX, GY, valleyZ(GY)]];
    quad(s < 0 ? pts : [pts[1], pts[0], pts[3], pts[2]], (p) => p[2], (p) => GX - Math.abs(p[0]));
  }
  return bodyPart(pos, uv, SLATE);
}
const SLATE_U = 3.6; // metres per u and per v on the roof (the walls' are 5 and 3)
const SLATE_V = 2.4;

// A box from point a to point b (its length), `w` wide in the plane whose
// normal is `n`, `d` deep along n.
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
function beam(k, a, b, w, d, n, hex) {
  _x.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _x.length();
  _x.normalize();
  _z.set(...n).normalize();
  _y.crossVectors(_z, _x).normalize();
  _z.crossVectors(_x, _y);
  const geo = new THREE.BoxGeometry(len, w, d);
  geo.applyMatrix4(_m.makeBasis(_x, _y, _z));
  k.solid(geo, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, hex);
}

// A ring of `n` quads between radii r0 and r1 about (cx, cy) on the plane z,
// from angle a0 to a1 (a whole ring by default), facing +z.
function ring(k, cx, cy, z, r0, r1, n, hex, a0 = 0, a1 = Math.PI * 2) {
  for (let i = 0; i < n; i++) {
    const t0 = a0 + (a1 - a0) * i / n, t1 = a0 + (a1 - a0) * (i + 1) / n;
    const p = (r, t) => [cx + r * Math.cos(t), cy + r * Math.sin(t), z];
    k.poly([p(r0, t0), p(r1, t0), p(r1, t1), p(r0, t1)], [0, 0, 1], hex);
  }
}

// A flat cream rectangle facing +z, centred on (x, y).
const flat = (k, x, y, w, h, z, turn = 0) => k.poly([[x - w / 2, y - h / 2, z], [x + w / 2, y - h / 2, z], [x + w / 2, y + h / 2, z], [x - w / 2, y + h / 2, z]], [0, 0, 1], TRIM, turn);

// A sash window: the pane (glass), a frame, the meeting rail and a glazing
// bar, a sill and a stone lintel.
function sashWindow(k, glass, x, y, w, h, z) {
  const f = 0.1;
  const fz = z + 0.05;
  glass.poly([[x - w / 2, y - h / 2, z + 0.02], [x + w / 2, y - h / 2, z + 0.02], [x + w / 2, y + h / 2, z + 0.02], [x - w / 2, y + h / 2, z + 0.02]], [0, 0, 1], 0);
  k.box(w + 2 * f, f, 0.1, x, y + (h + f) / 2, fz, TRIM);
  k.box(w + 2 * f, f, 0.1, x, y - (h + f) / 2, fz, TRIM);
  k.box(f, h, 0.1, x - (w + f) / 2, y, fz, TRIM);
  k.box(f, h, 0.1, x + (w + f) / 2, y, fz, TRIM);
  // the bars are flat (seen face-on, a quad reads as a box at a sixth of the triangles)
  flat(k, x, y + h * 0.06, w, 0.06, z + 0.07);
  flat(k, x, y, 0.05, h, z + 0.065);
  k.box(w + 2 * f + 0.16, 0.08, 0.2, x, y - h / 2 - f - 0.04, z + 0.1, TRIM);
  k.box(w + 2 * f + 0.2, 0.16, 0.08, x, y + h / 2 + f + 0.08, z + 0.04, TRIM);
}

function trimAndGlass() {
  const k = pieceKit(true);
  const glass = pieceKit(false);

  // Plinth (stone, to the door's sill), string courses and the cornice, round
  // the front, the bay and both sides.
  const band = (y0, y1, out, hex) => {
    const h = y1 - y0, y = (y0 + y1) / 2;
    k.box(2 * W + 2 * out, h, out * 2, 0, y, FRONT, hex);
    k.box(2 * BAY + 2 * out, h, out * 2, 0, y, BAY_FRONT, hex);
    for (const s of [-1, 1]) {
      k.box(out * 2, h, BAY_FRONT - FRONT, s * BAY, y, (FRONT + BAY_FRONT) / 2, hex);
      k.box(out * 2, h, FRONT - BACK, s * W, y, (FRONT + BACK) / 2, hex);
    }
  };
  band(0, 0.5, 0.04, STONE);
  for (const y of COURSES) band(y - 0.07, y + 0.07, 0.06, TRIM);
  band(EAVE - 0.24, EAVE, 0.09, TRIM);
  // Cream corner stones up the front corners and the bay's.
  for (const s of [-1, 1]) {
    k.box(0.32, EAVE - 0.5, 0.32, s * (W - 0.1), (EAVE + 0.5) / 2, FRONT - 0.1, TRIM);
    k.box(0.22, EAVE - 0.5, 0.22, s * (BAY - 0.05), (EAVE + 0.5) / 2, BAY_FRONT - 0.05, TRIM);
  }

  // The windows: two either side on all three floors, two and one in the bay.
  for (const [y, h, w] of ROWS) for (const x of WING_X) sashWindow(k, glass, x, y, w, h, FRONT);
  for (const [x, y, w, h] of BAY_WINDOWS) sashWindow(k, glass, x, y, w, h, BAY_FRONT);
  // One pane, its sill, lintel and bars on each side wall, on the first and second floors,
  // for the cat who walks round the corner.
  for (const s of [-1, 1]) {
    for (const [y, h] of [[5.1, 1.6], [7.55, 1.3]]) {
      const turn = s * Math.PI / 2;
      glass.poly([[-0.45, y - h / 2, W + 0.02], [0.45, y - h / 2, W + 0.02], [0.45, y + h / 2, W + 0.02], [-0.45, y + h / 2, W + 0.02]], [0, 0, 1], 0, turn);
      k.box(1.15, 0.08, 0.2, 0, y - h / 2 - 0.04, W + 0.1, TRIM, { turn });
      k.box(1.15, 0.12, 0.08, 0, y + h / 2 + 0.06, W + 0.04, TRIM, { turn });
      flat(k, 0, y, 0.9, 0.06, W + 0.05, turn);
      flat(k, 0, y, 0.05, h, W + 0.05, turn);
    }
  }

  // The round attic window in the door's gable: glass, a cream ring, a cross.
  const rz = BAY_FRONT;
  const disc = [];
  for (let i = 0; i < 12; i++) disc.push([ROUND.r * Math.cos(i * Math.PI / 6), ROUND.y + ROUND.r * Math.sin(i * Math.PI / 6), rz + 0.02]);
  glass.poly(disc, [0, 0, 1], 0);
  ring(k, 0, ROUND.y, rz + 0.04, ROUND.r - 0.02, ROUND.r + 0.14, 12, TRIM);
  k.box(2 * ROUND.r, 0.06, 0.05, 0, ROUND.y, rz + 0.05, TRIM);
  k.box(0.06, 2 * ROUND.r, 0.05, 0, ROUND.y, rz + 0.05, TRIM);
  // The gable's bargeboards and the main roof's at both sides, and the ridge.
  const gF = BAY_FRONT + OVER - 0.02;
  for (const s of [-1, 1]) {
    beam(k, [s * (GX + 0.05), GY - 0.12, gF], [0, GABLE_PEAK + 0.06, gF], 0.24, 0.07, [0, 0, 1], TRIM);
    const X = s * (W + 0.32);
    const yF = EAVE - OVER * PITCH;
    beam(k, [X, yF - 0.12, FRONT + OVER + 0.05], [X, RIDGE_Y + 0.06, RIDGE_Z], 0.24, 0.07, [s, 0, 0], TRIM);
    beam(k, [X, yF - 0.12, BACK - OVER - 0.05], [X, RIDGE_Y + 0.06, RIDGE_Z], 0.24, 0.07, [s, 0, 0], TRIM);
  }
  k.box(2 * W + 0.7, 0.16, 0.24, 0, RIDGE_Y + 0.04, RIDGE_Z, RIDGE);
  beam(k, [0, GABLE_PEAK + 0.04, gF], [0, GABLE_PEAK + 0.04, valleyZ(GABLE_PEAK)], 0.2, 0.16, [0, 1, 0], RIDGE);

  // Two chimneys on the ridge, near each end, each with two pots.
  for (const s of [-1, 1]) {
    const x = s * 5.4;
    const top = RIDGE_Y + 1.3;
    const bottom = RIDGE_Y - 0.6 * PITCH - 0.3;
    k.box(1.0, top - bottom, 0.8, x, (top + bottom) / 2, RIDGE_Z, BRICK);
    k.box(1.16, 0.14, 0.96, x, top + 0.07, RIDGE_Z, STONE);
    for (const dx of [-0.22, 0.22]) {
      k.solid(new THREE.CylinderGeometry(0.11, 0.13, 0.42, 6), x + dx, top + 0.35, RIDGE_Z, CHIMNEY_POT);
    }
  }

  // The front door: three stone steps, a panelled double door in a cream
  // frame between two pilasters, a fanlight over it, brass knobs.
  const z = BAY_FRONT;
  const run = (OLD_HOUSE_FRONT.x1 - CX) - BAY_FRONT; // 1.0 m from the bay to the door's spot
  for (let i = 0; i < 3; i++) {
    const d = run * (3 - i) / 3;
    k.box(2.6 - i * 0.3, STEP_H, d, 0, STEP_H * (i + 0.5), z + d / 2, STONE);
  }
  const leaf = DOOR_W / 2 - 0.01;
  const doorH = DOOR_TOP - SILL_Y;
  for (const s of [-1, 1]) {
    const lx = s * (DOOR_W / 4);
    k.box(leaf, doorH, 0.06, lx, SILL_Y + doorH / 2, z - 0.01, DOOR);
    k.box(leaf - 0.2, doorH * 0.42, 0.03, lx, SILL_Y + doorH * 0.7, z + 0.03, PANEL);
    k.box(leaf - 0.2, doorH * 0.3, 0.03, lx, SILL_Y + doorH * 0.24, z + 0.03, PANEL);
    k.box(0.07, 0.07, 0.07, s * 0.1, SILL_Y + 1.1, z + 0.06, BRASS);
    k.box(0.12, DOOR_TOP - SILL_Y + 0.05, 0.12, s * (DOOR_W / 2 + 0.06), (DOOR_TOP + SILL_Y) / 2, z + 0.03, TRIM);
    k.box(0.24, DOOR_TOP + FAN_R + 0.1 - SILL_Y, 0.16, s * (DOOR_W / 2 + 0.3), (DOOR_TOP + FAN_R + 0.1 + SILL_Y) / 2, z + 0.06, TRIM);
  }
  k.box(DOOR_W + 0.24, 0.1, 0.12, 0, DOOR_TOP + 0.05, z + 0.03, TRIM);
  // fanlight: a half disc of glass, its arch and three glazing bars
  const fan = [];
  for (let i = 0; i <= 8; i++) fan.push([FAN_R * Math.cos(i * Math.PI / 8), DOOR_TOP + 0.1 + FAN_R * Math.sin(i * Math.PI / 8), z + 0.02]);
  glass.poly(fan, [0, 0, 1], 0);
  ring(k, 0, DOOR_TOP + 0.1, z + 0.04, FAN_R - 0.02, FAN_R + 0.14, 6, TRIM, 0, Math.PI);
  for (const t of [Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4]) {
    beam(k, [0, DOOR_TOP + 0.1, z + 0.04], [FAN_R * Math.cos(t), DOOR_TOP + 0.1 + FAN_R * Math.sin(t), z + 0.04], 0.04, 0.04, [0, 0, 1], TRIM);
  }
  // Lanterns either side of the door (their panes glow at dusk), and a pot
  // with a round clipped bay tree either side of the steps.
  for (const s of [-1, 1]) {
    const lx = s * 1.55;
    k.box(0.24, 0.06, 0.24, lx, 2.08, z + 0.2, IRON);
    k.box(0.28, 0.08, 0.28, lx, 2.46, z + 0.2, IRON);
    k.box(0.06, 0.06, 0.16, lx, 2.38, z + 0.06, IRON);
    glass.box(0.2, 0.32, 0.2, lx, 2.27, z + 0.2, 0);
    k.solid(new THREE.CylinderGeometry(0.24, 0.18, 0.44, 8), s * 1.7, 0.22, z + 0.62, POT);
    k.solid(new THREE.IcosahedronGeometry(0.34, 0), s * 1.7, 0.74, z + 0.62, BAY_TREE);
  }
  // every trim piece reads the texture at one spot inside a brick (the tile's
  // x 1/8, y 3/8, a brick in either course), so it is its own flat colour; its
  // colour is lifted by that brick face's darkening (0.925, linear 0.84)
  const trim = k.merged();
  const n = trim.attributes.position.count, uv = new Float32Array(n * 2), col = trim.attributes.color.array;
  for (let i = 0; i < n * 2; i += 2) { uv[i] = 0.125; uv[i + 1] = 0.375; }
  for (let i = 0; i < n * 3; i++) col[i] /= 0.84;
  trim.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return { trim, glass: glass.merged() };
}

// The colliders: circles of r 0.7 at most 0.95 m apart, round the walls, the
// steps and the pots (a closed ring, so nothing gets inside), routed in past
// the steps so none is within 1.2 m of where the gate end will stand. World
// coordinates, from the walls' own (local x -> world z = CZ - x, local z ->
// world x = CX + z). The back runs a hand's width past the footprint, so no
// cat squeezes between the house and the hedge.
const RING = [
  [CX + BACK - 0.4, CZ + W - 0.7], [CX + BACK - 0.4, CZ - W + 0.7],
  [CX + FRONT - 0.35, CZ - W + 0.7], [CX + FRONT - 0.35, CZ - BAY - 0.2],
  [CX + BAY_FRONT + 0.2, CZ - 1.6], [CX + BAY_FRONT + 0.2, CZ + 1.6],
  [CX + FRONT - 0.35, CZ + BAY + 0.2], [CX + FRONT - 0.35, CZ + W - 0.7],
];
const R = 0.7;
const GAP = 0.95;
function colliders() {
  const out = [];
  for (let i = 0; i < RING.length; i++) {
    const [ax, az] = RING[i], [bx, bz] = RING[(i + 1) % RING.length];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / GAP));
    for (let j = 0; j < n; j++) {
      const t = j / n;
      out.push({ x: Math.round((ax + (bx - ax) * t) * 1000) / 1000, z: Math.round((az + (bz - az) * t) * 1000) / 1000, r: R });
    }
  }
  return out;
}

// buildOldHouseFront(scene, { wind }) -> { group, colliders }: adds the house's
// front to `scene` (one top-level group, 'oldhousefront'). `wind` is taken so
// it reads like the town's other builders and is unused: nothing on it sways.
export function buildOldHouseFront(scene, { wind } = {}) { // eslint-disable-line no-unused-vars
  const group = withLocalUuids('oldhousefront', () => {
    const g = new THREE.Group();
    g.name = 'oldhousefront';
    const { trim, glass: glassGeo } = trimAndGlass();
    const body = new THREE.Mesh(mergeGeometries([brickGeometry(), roofGeometry(), trim]),
      litMaterial(0xffffff, { surface: 'brick', repeat: repeatFor('brick', 5, 3), vertexColors: true }));
    body.name = 'oldHouseBody';
    const glass = new THREE.Mesh(glassGeo, litMaterial(GLASS, surfaceProps('glass')));
    glass.name = 'oldHouseGlass';
    glass.userData.window = true;
    glass.userData.noCast = true;
    g.add(body, glass);
    g.rotation.y = Math.PI / 2; // the front (+z) faces east (+x)
    g.position.set(CX, 0, CZ);
    return g;
  });
  scene.add(group);
  return { group, colliders: colliders() };
}

