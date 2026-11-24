// =============================================================================
// THE MOON: WING D, THE LAVA TUBE AND THE DEEP CELL, AS PLAN (milestone 8). Pure data and pure functions (no THREE, no clock, no random number):
// the Cave Massif's winding tube from its mouth to a round chamber, the walls that keep her inside it, the crystals that light it, the pedestal, the Deep Cell's
// place and the Core's third socket. world/moonlavaparts.js draws from this, world/moondeeplive.js runs it, moonplan.js folds the colliders into the Moon's.
//
//   * THE TUBE is a smoothed centreline (CTRL, rounded corners) from the mouth at (-41, 0) west and south to the chamber (-48.4, 8.0): about 29 m of tube. Its FREE
//     half width is 1.2 m (a corridor 2.4 m wide: a cat is 0.7 m across, Pip 0.8 m, Dot's circle 2.6 m: she cannot drive in, and a test says so). Walls are rows
//     of round colliders (the walk's own kind) laid along both sides and kept off every other leg's corridor; a second, fatter row seals the rock behind them.
//   * THE CHAMBER is a round room of free radius 3.6 m with the Deep Cell on a low pedestal on its far side. The way in is its only opening: a room she can turn
//     round in, never a pocket (every walkable point of the tube and chamber is joined to the mouth: test/moonlava.test.js floods the real colliders).
//   * THE LIGHT is crystals, not lights: clusters of glowing prisms along both walls every 2 m and ringed round the chamber. lightAt(x, z) is the baked glow
//     the floor and the walls are painted with; the test samples it along the whole centreline, so the tube is never dark at any point.
// North is -z, east is +x. docs/superpowers/specs/2026-11-23-moon-design.md 4.2 (the Lava Tube) and the plan's milestone 8.
// =============================================================================

const TAU = Math.PI * 2;

export const TUBE = Object.freeze({
  half: 1.2, // m: the free half width of the corridor (the colliders' inner edge)
  shellW: 1.45, shellH: 2.6, // the drawn arch inside: half width and height
  outerW: 4.9, outerH: 4.4, // the massif over it
  wall: 0.9, fat: 1.3, // the radii of the two rows of colliders
});
export const CHAMBER = Object.freeze({ x: -48.4, z: 8.0, r: 3.6, shellR: 3.9, shellH: 3.9, outerR: 5.8, outerH: 5.6, wall: 1.1 });
export const MOUTH = Object.freeze({ x: -41, z: 0 }); // the mouth's plane (the tube starts here, heading west)
export const CAVE_REACH = 24; // m: the tube is at least this long from the mouth to the chamber's edge (the spec's 24 m)

// The way's corners (a polyline from the plain outside the mouth to the room's middle); every corner is rounded by a true arc of FILLET metres, so the tube bends with a radius a
// cat and the drawn arch (1.45 m wide) can follow without the inside of a turn folding over.
const CTRL = Object.freeze([[-35, 0], [-42.4, 0], [-45.6, -4.6], [-50.4, -3.8], [-51.2, 0.6], [-45.4, 1.8], [-42.2, 4.2], [-43.8, 8.0], [-48.4, 8.0]]);
export const FILLET = 2.2; // m: the smallest radius of a bend of the way

function fillet(v, R, step = 0.25) {
  const out = [[v[0][0], v[0][1]]];
  for (let i = 1; i < v.length - 1; i++) {
    const a = v[i - 1];
    const b = v[i];
    const d = v[i + 1];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const l2 = Math.hypot(d[0] - b[0], d[1] - b[1]);
    const d1 = [(b[0] - a[0]) / l1, (b[1] - a[1]) / l1];
    const d2 = [(d[0] - b[0]) / l2, (d[1] - b[1]) / l2];
    const cross = d1[0] * d2[1] - d1[1] * d2[0];
    const theta = Math.acos(Math.min(1, Math.max(-1, d1[0] * d2[0] + d1[1] * d2[1])));
    if (theta < 1e-4) { out.push([b[0], b[1]]); continue; }
    const t = R * Math.tan(theta / 2);
    const E = [b[0] - d1[0] * t, b[1] - d1[1] * t];
    const sg = cross > 0 ? 1 : -1;
    const C = [E[0] + -d1[1] * sg * R, E[1] + d1[0] * sg * R];
    const a0 = Math.atan2(E[1] - C[1], E[0] - C[0]);
    const n = Math.max(2, Math.ceil((R * theta) / step));
    for (let k = 0; k <= n; k++) { const phi = a0 + sg * theta * (k / n); out.push([C[0] + Math.cos(phi) * R, C[1] + Math.sin(phi) * R]); }
  }
  out.push([v[v.length - 1][0], v[v.length - 1][1]]);
  return out;
}

// The centreline: points { x, z, s } with s the arc length from the first point (outside the mouth) to it.
export const PATH = (() => {
  const pts = fillet(CTRL, FILLET);
  let s = 0;
  return Object.freeze(pts.map(([x, z], i) => {
    if (i) s += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
    return Object.freeze({ x, z, s });
  }));
})();
const at = (s) => {
  let i = 1;
  while (i < PATH.length - 1 && PATH[i].s < s) i++;
  const a = PATH[i - 1];
  const b = PATH[i];
  const k = b.s > a.s ? Math.min(1, Math.max(0, (s - a.s) / (b.s - a.s))) : 0;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: a.x + dx * k, z: a.z + dz * k, tx: dx / len, tz: dz / len };
};
export const pathAt = at;
export const S_MOUTH = (() => { for (let i = 1; i < PATH.length; i++) if (PATH[i].x <= MOUTH.x) { const a = PATH[i - 1]; const b = PATH[i]; return a.s + ((a.x - MOUTH.x) / (a.x - b.x)) * (b.s - a.s); } return 0; })();
export const S_CHAMBER = PATH[PATH.length - 1].s; // the chamber's middle
export const S_ROOM = S_CHAMBER - CHAMBER.r; // where the round room begins along the way
export const TUBE_LENGTH = S_ROOM - S_MOUTH; // m of tube from the mouth to the room's edge
export const PATH_LENGTH = S_CHAMBER - S_MOUTH; // from the mouth to the room's middle
// The massif's half width and height along the tube: at the mouth it is only a rim round the arch (a cave mouth in the dust, not a bunker's wall) and it swells to its full size over
// FLARE metres of the way. (The colliders' fat row and the sealing pass follow it.)
export const FLARE = 5;
const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const flareAt = (s) => sm((s - S_MOUTH) / FLARE);
export const rockHalf = (s) => { const w0 = TUBE.shellW + 0.8; return w0 + (TUBE.outerW - w0) * flareAt(s); };
export const rockHeight = (s) => { const h0 = TUBE.shellH + 0.8; return h0 + (TUBE.outerH - h0) * flareAt(s); };
// The direction the way runs into the chamber (west): the room's far end lies along it.
export const ENTRY_DIR = Object.freeze({ x: -1, z: 0 });
export const S_END = S_CHAMBER + CHAMBER.shellR; // the shell's far end (inside), the massif's is S_CHAMBER + CHAMBER.outerR

// The nearest point on the centreline (the approach and the stub in the chamber included): { d, s, x, z }.
export function nearest(x, z) {
  let best = null;
  for (let i = 1; i < PATH.length; i++) {
    const a = PATH[i - 1];
    const b = PATH[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz;
    const k = l2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
    const px = a.x + dx * k;
    const pz = a.z + dz * k;
    const d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) best = { d, s: a.s + (b.s - a.s) * k, x: px, z: pz };
  }
  return best;
}

// How far along the way from the mouth she is (0 at and before the mouth, up to PATH_LENGTH at the room's middle), and whether she is in the corridor or the room
// (`pad` metres beyond the free width).
export function caveDepth(x, z, pad = 0) {
  const c = Math.hypot(x - CHAMBER.x, z - CHAMBER.z);
  if (c <= CHAMBER.r + pad) return Math.max(0, S_CHAMBER - c - S_MOUTH);
  const n = nearest(x, z);
  if (n.d <= TUBE.half + pad && n.s >= S_MOUTH) return n.s - S_MOUTH;
  return 0;
}
export const inCave = (x, z, pad = 0) => caveDepth(x, z, pad) > 0 || (Math.hypot(x - CHAMBER.x, z - CHAMBER.z) <= CHAMBER.r + pad);
// Inside the mouth by `depth` metres of way (the massif's exterior is hidden from here: the camera is in the rock).
export const mouthIn = (x, z, depth = 0.3) => inCave(x, z, 0.4) && caveDepth(x, z, 0.4) >= depth;
// Deep inside (everything outside the cave is not drawn from here).
export const DEEP_AT = 4;
export const insideDeep = (x, z) => inCave(x, z, 0.4) && caveDepth(x, z, 0.4) >= DEEP_AT;

// ---- the colliders ---------------------------------------------------------------------------------------------------------

const c = (x, z, r) => Object.freeze({ x, z, r });
function wallRows() {
  const out = [];
  const { half, wall, fat } = TUBE;
  const offA = half + wall; // a wall circle's middle: its inner edge is the corridor's
  const offB = half + 2 * wall + fat - 0.6; // the fat row behind it (reaches the massif's own half width)
  const clear = (x, z, r) => nearest(x, z).d >= half + r - 0.01;
  const crowded = (x, z, list, gap) => list.some((q) => Math.hypot(q.x - x, q.z - z) < gap);
  // the tube, from the mouth plane to the room's edge, both sides: close-set walls (0.7 m) so no gap on the outside of a bend lets anything wider than a cat through
  const wallsA = [];
  for (let s = S_MOUTH; s <= S_ROOM + 0.4; s += 0.7) {
    const p = at(s);
    const nx = -p.tz;
    const nz = p.tx;
    for (const side of [-1, 1]) {
      const x = p.x + nx * side * offA;
      const z = p.z + nz * side * offA;
      if (clear(x, z, wall) && !crowded(x, z, wallsA, 0.45)) wallsA.push(c(x, z, wall));
    }
  }
  out.push(...wallsA);
  const fats = [];
  for (let s = S_MOUTH; s <= S_ROOM + 0.4; s += 0.5) {
    const p = at(s);
    const nx = -p.tz;
    const nz = p.tx;
    for (const side of [-1, 1]) {
      const x = p.x + nx * side * offB;
      const z = p.z + nz * side * offB;
      if (rockHalf(s) > half + 2 * wall + 0.2 && clear(x, z, fat) && !crowded(x, z, fats, 0.9)) fats.push(c(x, z, fat));
    }
  }
  out.push(...fats);
  // the room: one fat ring of wall circles round the chamber, the way in left open (its outer edge is the massif's)
  const ringA = CHAMBER.r + CHAMBER.wall; // 4.7 m from its middle, r 1.1: its outer edge is the 5.8 m of the massif
  const nA = Math.ceil((TAU * ringA) / 0.8);
  for (let i = 0; i < nA; i++) {
    const a = (i / nA) * TAU;
    const x = CHAMBER.x + Math.cos(a) * ringA;
    const z = CHAMBER.z + Math.sin(a) * ringA;
    if (clear(x, z, CHAMBER.wall)) out.push(c(x, z, CHAMBER.wall));
  }
  return out;
}

// Where the massif is: along the way from the mouth (its half width) and round the room.
const inRock = (x, z) => {
  const room = Math.hypot(x - CHAMBER.x, z - CHAMBER.z);
  if (room <= CHAMBER.r + 0.4) return false; // the room itself
  if (room < CHAMBER.outerR - 0.5) return true;
  const n = nearest(x, z);
  return n.s >= S_MOUTH + 0.3 && n.d < rockHalf(n.s) - 0.5;
};
// Seal the rock: where two legs of the tube lie close, the rows above leave a seam a cat could slip into. Flood the circles from the plain (a cat's radius, a 0.25 m grid); any spot
// of rock that is reached gets a circle of its own (as fat as it can be without touching the corridor), and again until none is. Pure and deterministic; test/moonlava.test.js floods
// the final list the same way.
function seal(list) {
  const R = 0.35;
  const step = 0.25;
  const x0 = -57;
  const z0 = -10;
  const nx = Math.round((-35 - x0) / step);
  const nz = Math.round((15 - z0) / step);
  const out = list.slice();
  for (let pass = 0; pass < 14; pass++) {
    const free = (x, z) => {
      if (x < -54 + R) return false;
      for (const q of out) if (Math.hypot(x - q.x, z - q.z) < q.r + R) return false;
      return true;
    };
    const seen = new Uint8Array((nx + 1) * (nz + 1));
    const stack = [[Math.round((-35 - x0) / step), Math.round((0 - z0) / step)]];
    const leaks = [];
    while (stack.length) {
      const [i, j] = stack.pop();
      if (i < 0 || j < 0 || i > nx || j > nz || seen[j * (nx + 1) + i]) continue;
      const x = x0 + i * step;
      const z = z0 + j * step;
      if (!free(x, z)) continue;
      seen[j * (nx + 1) + i] = 1;
      if (inRock(x, z) && nearest(x, z).d > TUBE.half + 0.4) leaks.push([x, z]);
      stack.push([i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]);
    }
    if (!leaks.length) break;
    const added = [];
    for (const [x, z] of leaks) {
      if (added.some((q) => Math.hypot(x - q.x, z - q.z) < q.r)) continue;
      const r = Math.min(1.0, Math.max(0.3, nearest(x, z).d - TUBE.half - 0.02));
      added.push(c(x, z, r));
    }
    out.push(...added);
  }
  return out;
}

// The Deep Cell's pedestal (a low stone drum on the room's far side) and the cell on it; the Core's third socket.
export const PEDESTAL = Object.freeze({ x: CHAMBER.x - 1.0, z: CHAMBER.z, r: 0.75, top: 0.55 });
export const DEEP_CELL = Object.freeze({ x: PEDESTAL.x, z: PEDESTAL.z, y: PEDESTAL.top });
export const LAVA_COLLIDERS = Object.freeze([...seal(wallRows()), c(PEDESTAL.x, PEDESTAL.z, PEDESTAL.r)]);
// The wing's centre for the zone logic (the tube's middle) and how near she must be for its detail.
export const LAVA_WING = Object.freeze({ x: -45.5, z: 2.5, near: 26 });
// Where rocks may not stand (they would stand in the massif): circles along the way and round the room.
export const LAVA_KEEP_OUT = Object.freeze([
  ...[0, 6, 12, 18, 24].map((d) => { const p = at(S_MOUTH + d); return Object.freeze([p.x, p.z, 7.4]); }),
  Object.freeze([CHAMBER.x, CHAMBER.z, 10.2]),
  Object.freeze([MOUTH.x + 3, MOUTH.z, 4]), // the approach to the mouth
]);
// A clear place on the dust in front of the mouth where Pip and the camera meet her.
export const MOUTH_FRONT = Object.freeze({ x: MOUTH.x + 2.4, z: MOUTH.z });

// ---- the crystals and the light --------------------------------------------------------------------------------------------

// Clusters of glowing prisms: { x, z, h (height of the tallest), k (colour 0..1), lean }, along both walls of the tube every 2 m, ringed round the room, and four round the pedestal.
export const CRYSTALS = (() => {
  const list = [];
  let n = 0;
  for (let s = S_MOUTH + 0.4; s < S_ROOM - 0.3; s += 2.0) {
    const p = at(s);
    const side = n % 2 ? 1 : -1;
    const w = TUBE.shellW - 0.32;
    list.push(Object.freeze({ x: p.x - p.tz * side * w, z: p.z + p.tx * side * w, h: 0.75 + 0.35 * ((n * 7) % 5) / 4, k: ((n * 0.37) % 1), lean: side }));
    n++;
  }
  // a second, shorter cluster on the other wall between each pair (so both walls glow, offset by a metre)
  for (let s = S_MOUTH + 1.4; s < S_ROOM - 0.6; s += 4.0) {
    const p = at(s);
    const side = n % 2 ? 1 : -1;
    const w = TUBE.shellW - 0.32;
    list.push(Object.freeze({ x: p.x - p.tz * side * w, z: p.z + p.tx * side * w, h: 0.55, k: ((n * 0.37) % 1), lean: side }));
    n++;
  }
  for (const side of [-1, 1]) { // the way into the room
    const p = at(S_ROOM - 0.2);
    list.push(Object.freeze({ x: p.x - p.tz * side * (TUBE.shellW - 0.32), z: p.z + p.tx * side * (TUBE.shellW - 0.32), h: 0.7, k: 0.3 + 0.3 * side, lean: side }));
  }
  const ring = CHAMBER.shellR - 0.55;
  for (let i = 0; i < 11; i++) {
    const a = Math.PI * 0.35 + (i / 10) * (TAU - Math.PI * 0.7); // the way in is on the east (angle 0): the ring skips it
    list.push(Object.freeze({ x: CHAMBER.x + Math.cos(a) * ring, z: CHAMBER.z + Math.sin(a) * ring, h: 1.0 + 0.5 * ((i * 5) % 3) / 2, k: (i * 0.29) % 1, lean: 0 }));
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.6;
    list.push(Object.freeze({ x: PEDESTAL.x + Math.cos(a) * 1.15, z: PEDESTAL.z + Math.sin(a) * 1.15, h: 0.5, k: 0.1 + i * 0.25, lean: 0 }));
  }
  return Object.freeze(list);
})();

// The glow at a spot of floor or wall (0 dark .. 1 bright): each cluster lights its surroundings, falling off over about 2.5 m.
export function lightAt(x, z) {
  let sum = 0;
  for (const q of CRYSTALS) {
    const d2 = (x - q.x) * (x - q.x) + (z - q.z) * (z - q.z);
    sum += 1 / (1 + d2 / 3.0);
  }
  return 0.25 + 0.75 * (1 - Math.exp(-0.45 * sum));
}

// How many crystal clusters stand within `reach` metres of a point on the way (the tube's "always lit" check).
export function crystalsNear(x, z, reach = 3) {
  let n = 0;
  for (const q of CRYSTALS) if (Math.hypot(x - q.x, z - q.z) <= reach) n++;
  return n;
}

// The centreline sampled every `step` metres from the mouth to the room's middle (the tests walk it).
export function wayPoints(step = 0.5) {
  const out = [];
  for (let s = S_MOUTH; s <= S_CHAMBER; s += step) { const p = at(s); out.push({ x: p.x, z: p.z, s: s - S_MOUTH }); }
  return out;
}
