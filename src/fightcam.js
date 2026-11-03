// The fight camera (Clan Life Part 2): while a clan fight is on, from the
// "Fight!" tap to its end (the walk-over included), no tree canopy or trunk
// may hide either cat. The kid has to read the intruder's move.
//
// HOW. The trees tag their Groups with a few simple solids that hold every
// vertex they draw (builder.js TREE_OCCLUDER / PINE_OCCLUDER, a pine stand
// lists its trees). findOccluders reads them once per walk. When a fight
// starts, and again when the rounds begin, chooseFightView tries camera spots
// on rings round the pair's middle, nearest the current view first, and takes
// the first one whose lines to both cats (paws, body and head, everywhere the
// fight can put them) clear every solid, that keeps both cats in the frame
// above the fight sheet, and that is inside the map and out of every
// collider. Spots where the intruder stands in front of our cat, or nearer
// the camera than it, are tried only after every other spot (ourCatHidden,
// itNearer): the kid's own cat is the one in front. (A lifted top, an action's leap or rear-up, must be in frame but
// only ranks the views by whether it is seen: see chooseFightView.) The choice is made a handful of times per fight, never per frame,
// and only against the trees near the pair: no raycast into the scene at all.
//
// Polish fightcam2: the nearest rings are now 2.5, 3.0 and 3.4 m, so on a wide
// screen the cats fill more of it; spots side-on to the pair come first
// (both cats in profile), ahead of keeping the current angle; and a tree in
// front of the pair that fills the frame without crossing a line to a cat (a
// trunk beside the camera) makes a spot cost more by the share of the frame
// it covers (frameClutter). One that still covers CLUTTER_HIDE of the chosen
// view is hidden for the fight with the blockers (`clutter`, a list of its own).
// Clutter never buys a spot with the intruder in front (the order above).
//
// The solids grow by a margin and by as far as the wind can lean each tree.
// If no spot is clear (on the shipped maps only where a cat stands beside a
// trunk under leaves that can sway to its ears: test/fightcamworld.test.js
// counts them), the best spot's blocking trees are hidden for the fight (one
// Group's `visible`, so fewer draws, never more) and shown again after it;
// with a stand pine in the way, the spot with the fewest blockers.
//
// createFightCam blends this view over the follow camera that player.update
// has already placed this frame: in over a third of a second, but only when
// every step of the move keeps both cats framed and in sight (blendClear),
// and otherwise as a cut; out over about half a second; both as cuts under
// reduced motion. It never touches the camera while no fight is on, and never
// in photo mode. Purely local: it draws no rng and moves no cat.

import { SWAY_TREE } from './world/builder.js';
import { GUST_DEPTH, MAX_INTENSITY, SIDE_AMPLITUDE_FRACTION } from './render/wind.js';
import { FLAT_GROUND } from './ground.js';
import { CAM_ROCK_CLEAR, CAM_CEIL_CLEAR } from './camzoom.js';

// Where on a cat the camera must see: paws, body, and a head lifted by a pounce.
export const CAT_HEIGHTS = Object.freeze([0.08, 0.4, 0.85]);
// Every solid grows by this much, as a margin.
export const OCCLUDER_PAD = 0.15;
// ...and by as far as the wind can lean it on top. A swaying tree turns about
// its foot (render/wind.js) by at most its amplitude (builder.js swayFor:
// SWAY_TREE x sqrt(scale)) x the gust peak (1 + GUST_DEPTH) x the strongest
// intensity wind.update accepts (MAX_INTENSITY; rain passes 1.7), on the main
// axis, with SIDE_AMPLITUDE_FRACTION of that on the side axis at once. A solid
// at height h moves at most h x that lean. A stand pine never sways.
export function maxLean(scale) {
  return SWAY_TREE * Math.sqrt(Math.max(0.01, scale)) * (1 + GUST_DEPTH) * MAX_INTENSITY
    * Math.hypot(1, SIDE_AMPLITUDE_FRACTION);
}
// The frame the cats must stay in, in normalised device coordinates. The
// fight sheet covers at most the lower 40% of the screen (to -0.2); the
// bottom edge leaves a margin over it.
export const FIGHT_FRAME = Object.freeze({ x: 0.85, top: 0.85, bottom: -0.08 });
// Where the pair's middle (LOOK_Y up) sits on screen: just above the middle,
// so the cats fill the open part over the sheet rather than its top third
// (polish, camps Task 5: the survey's cats sat small under empty grass).
export const AIM_Y = 0.12;
const LOOK_Y = 0.3;

// Polish, camps Task 5b: the real sheet. FIGHT_FRAME.bottom is the tallest
// sheet; a phone held upright shows a shorter one, and the cats then sat over
// a band of empty grass. Given the sheet's measured top edge (sheetTop, in
// NDC), the frame's bottom sits SHEET_MARGIN over it (never under
// FRAME_FLOOR, never over today's bottom), and each view pitches so its lowest
// frame point sits LOW_LIFT over that bottom, when every frame point still
// fits under the top. No sheet measured (null): today's frame and aim exactly.
const SHEET_MARGIN = 0.06;
const FRAME_FLOOR = -0.6;
const LOW_LIFT = 0.02;
// A sheet height change smaller than this (in NDC) keeps the view.
const SHEET_STEP = 0.02;

// The sheet's top edge in NDC (-1 the screen's bottom), from its height and
// the viewport's, both in CSS px; null with no sheet.
export function sheetTopFrom(sheetPx, viewportPx) {
  if (!(sheetPx > 0) || !(viewportPx > 0)) return null;
  return -1 + (2 * sheetPx) / viewportPx;
}

// The frame's bottom for a measured sheet top; null (no sheet) keeps today's.
export function frameBottomFor(sheetTop) {
  if (sheetTop == null || !Number.isFinite(sheetTop)) return null;
  return Math.min(FIGHT_FRAME.bottom, Math.max(FRAME_FLOOR, sheetTop + SHEET_MARGIN));
}
// Camera spots round the pair's middle: distance and height, best first.
// Low rings look in under the canopies; high ones over the undergrowth. The
// first five are tight, close shots (2.5, 3.0 and 3.4 m since polish
// fightcam2: at 4.2 m a landscape screen showed the cats small); where they
// do not frame the pair (a phone held upright, side-on) the chooser falls
// through to the wider ones. `rank` prices a ring (RING_COST each): the five
// tight rings sit close together (0, 0.1, 0.2, 0.3, 0.45), and the wide rings
// keep their old order and spacing just behind them (rank 0.6 on).
export const RINGS = Object.freeze([
  { d: 2.5, h: 1.0, rank: 0 }, { d: 3.0, h: 1.15, rank: 0.1 }, { d: 3.4, h: 1.3, rank: 0.2 },
  { d: 4.2, h: 1.5, rank: 0.3 }, { d: 4.6, h: 1.1, rank: 0.45 },
  ...[
    { d: 5.5, h: 2.2 }, { d: 5.0, h: 1.3 }, { d: 6.5, h: 2.8 }, { d: 4.6, h: 1.0 },
    { d: 7.5, h: 3.4 }, { d: 6.0, h: 1.1 }, { d: 4.2, h: 0.8 }, { d: 8.5, h: 1.4 },
  ].map((r, i) => ({ ...r, rank: i + 0.6 })),
].map((r) => Object.freeze(r)));
// The last resort's ring: the first wide ring (d 5.5 h 2.2), the one that
// came first before the tight rings joined the list.
const LAST_RESORT_RING = RINGS.findIndex((r) => r.d === 5.5 && r.h === 2.2);
const YAW_STEPS = 24;               // every 15 degrees round
const RING_COST = 2;                // one ring further down the list costs two yaw steps
const AXIS_COST = 4;                // looking down the line between the cats, where one hides the other
const AXIS_ANGLE = (25 * Math.PI) / 180;
// Side-on is the fight's best angle (polish fightcam2): both cats in profile,
// neither behind the other. A spot costs SIDE_COST x |cos| of its angle to the
// line between the cats: 0 side-on, SIDE_COST looking straight down it. It
// outweighs keeping the current angle (one cost per yaw step).
export const SIDE_COST = 8;
// A tree in front of the pair that fills the frame (a trunk beside the
// camera, off every line to the cats) costs CLUTTER_COST x the share of the
// open frame it covers (frameClutter), so the chooser steers round it...
export const CLUTTER_COST = 20;
// ...and one that still covers at least this share of the chosen view is
// hidden for the fight, like a blocker (`clutter`), when it can be.
export const CLUTTER_HIDE = 0.12;
const HIDE_COST = 10;               // ...times the share of our cat the intruder hides (ourCatHidden)
const NEAR_COST = 5;                // the intruder nearer the camera than our cat (itNearer)
const COLLIDER_GAP = 0.3;           // m the camera keeps off a collider
const BOUNDS_GAP = 0.5;             // m it keeps inside the map's edge
const EASE_IN = 0.35;               // s
const EASE_OUT = 0.6;               // s
const FOLLOW_RATE = 8;              // 1/s: a new fight view eases in at this rate
const REACH = Math.max(...RINGS.map((r) => r.d)) + 3;

// --- the trees ---------------------------------------------------------------

// Every tagged tree in the scene, in world space:
//   [{ obj, x, z, R, top, shapes: [{ t: 'cyl', x, z, r, y0, y1, p } | { t: 'ell', x, y, z, r, ry, p }] }]
// `obj` is the tree's Group (hidden as a last resort), null for a stand's tree.
// Each shape's `p` is its own pad: OCCLUDER_PAD plus the wind's furthest lean
// at its height (the cylinder's top, the ellipsoid's centre: test/fightcam.test.js
// leans each tree to the limit and checks), none for a stand
// pine. R and top bound the padded shapes, for a quick reject.
export function findOccluders(scene) {
  const out = [];
  scene.updateMatrixWorld?.(true);
  const add = (obj, px, py, pz, s, shapes, sways, extra) => {
    const lean = sways ? maxLean(s) : 0;
    const placed = shapes.map((sh) => (sh.t === 'cyl'
      ? { t: 'cyl', x: px, z: pz, r: sh.r * s, y0: py + sh.y0 * s, y1: py + sh.y1 * s, p: OCCLUDER_PAD + sh.y1 * s * lean }
      : { t: 'ell', x: px, y: py + sh.y * s, z: pz, r: sh.r * s, ry: sh.ry * s, p: OCCLUDER_PAD + sh.y * s * lean }));
    const R = Math.max(...placed.map((p) => p.r + p.p));
    const top = Math.max(...placed.map((p) => (p.t === 'cyl' ? p.y1 : p.y + p.ry) + p.p));
    out.push({ obj, ...extra, x: px, z: pz, R, top, shapes: placed });
  };
  scene.traverse((o) => {
    const one = o.userData?.occluder;
    const stand = o.userData?.occluderStand;
    if (!one && !stand) return;
    const e = o.matrixWorld.elements;
    const s = Math.hypot(e[0], e[1], e[2]);
    if (one) add(o, e[12], e[13], e[14], s, one, true);
    // A stand tree's own y (builder.pineStand: the Gorge's west-top stand) is
    // in the stand's frame, like its x and z; flat stands carry none.
    // Each also names its stand and its place in it (treefade.js fades it alone).
    if (stand) stand.trees.forEach((t, i) => add(null, e[12] + t.x * s, e[13] + (t.y ?? 0) * s, e[14] + t.z * s, s * t.scale, stand.shapes, false, { stand: o, index: i }));
  });
  return out;
}

// Whether the segment a→b passes through a vertical cylinder grown by pad.
function hitsCyl(a, b, c, pad) {
  const r = c.r + pad;
  const dx = b.x - a.x, dz = b.z - a.z;
  const fx = a.x - c.x, fz = a.z - c.z;
  const A = dx * dx + dz * dz;
  let t0, t1;
  if (A < 1e-12) {
    if (fx * fx + fz * fz > r * r) return false;
    t0 = 0; t1 = 1;
  } else {
    const B = 2 * (fx * dx + fz * dz);
    const C = fx * fx + fz * fz - r * r;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return false;
    const q = Math.sqrt(disc);
    t0 = Math.max(0, (-B - q) / (2 * A));
    t1 = Math.min(1, (-B + q) / (2 * A));
    if (t0 > t1) return false;
  }
  const ya = a.y + (b.y - a.y) * t0, yb = a.y + (b.y - a.y) * t1;
  return Math.max(ya, yb) >= c.y0 - pad && Math.min(ya, yb) <= c.y1 + pad;
}

// Whether a→b passes through an upright ellipsoid grown by pad.
function hitsEll(a, b, e, pad) {
  const r = e.r + pad;
  const k = r / (e.ry + pad); // squash y so the ellipsoid becomes a sphere of radius r
  const ax = a.x - e.x, ay = (a.y - e.y) * k, az = a.z - e.z;
  const dx = b.x - a.x, dy = (b.y - a.y) * k, dz = b.z - a.z;
  const L = dx * dx + dy * dy + dz * dz;
  const t = L < 1e-12 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy + az * dz) / L));
  const px = ax + dx * t, py = ay + dy * t, pz = az + dz * t;
  return px * px + py * py + pz * pz <= r * r;
}

// Whether a→b passes through one tree. With no `pad`, each shape grows by its
// own (margin and sway); a number grows every shape by exactly that instead
// (0 is the bare solids).
export function segmentBlocked(a, b, occ, pad = null) {
  // the tree's bounding cylinder first: most trees are nowhere near the line
  if (!hitsCyl(a, b, { x: occ.x, z: occ.z, r: occ.R, y0: -Infinity, y1: occ.top }, pad ?? 0)) return false;
  for (const s of occ.shapes) {
    const g = pad ?? s.p;
    if (s.t === 'cyl' ? hitsCyl(a, b, s, g) : hitsEll(a, b, s, g)) return true;
  }
  return false;
}

// The first tree a→b passes through, or null.
export function firstBlocker(a, b, occluders, pad = null) {
  for (const o of occluders) if (segmentBlocked(a, b, o, pad)) return o;
  return null;
}

// --- the subject -------------------------------------------------------------

// The 3D points to keep in view: every spot either cat can stand on (me, it),
// at each of CAT_HEIGHTS, plus (withPath) the walk-over's run, which must not
// be hidden but may cross the frame's edge. With `lifted` (the default), a
// spot an action lifts a cat on also gives its top (liftedPoints). Every
// height rides g0, the ground under the pair's middle (fightGround; 0 on flat
// ground, Gorge part 1 R11: a fight stands on one level).
export function subjectPoints(subject, withPath = false, lifted = true, g0 = 0) {
  const out = [];
  const spots = withPath ? [...subject.me, ...subject.it, ...(subject.path || [])] : [...subject.me, ...subject.it];
  for (const p of spots) {
    for (const y of CAT_HEIGHTS) out.push({ x: p.x, y: y + g0, z: p.z });
    if (lifted && p.y > 0) out.push(liftedTop(p, g0));
  }
  return out;
}

// A spot an action lifts a cat on (fight moves and scars, Task 5) carries `y`,
// how far the cat's top rises there above its standing top: that top is kept
// in frame like every other point, but seeing it only ranks the views (a
// controller ruling: a stand pine's low boughs may brush a leap's top where
// no camera can see it, and that must never cost the paws, body or head).
// Its y rides g0 too (reachYFor's heights are relative to the ground).
const liftedTop = (p, g0 = 0) => ({ x: p.x, y: CAT_HEIGHTS[2] + p.y + g0, z: p.z });
export function liftedPoints(subject, g0 = 0) {
  const out = [];
  for (const p of [...subject.me, ...subject.it]) if (p.y > 0) out.push(liftedTop(p, g0));
  return out;
}

// g0: the ground under the pair's middle, 0 on flat ground.
const fightGround = (subject, ground) => (ground.flat ? 0 : ground.y(subject.mid.x, subject.mid.z));

// A cat is no point: from its middle its nose and its tail reach about this
// far (the head sits 0.4 m forward, the tail as far back), whichever way it
// faces. The frame holds that much round each spot, at body height.
export const CAT_BODY = 0.55;

// The points that must be on screen above the sheet: subjectPoints (no run),
// plus each spot's body reach in the four directions at body height.
export function framePoints(subject, g0 = 0) {
  const out = subjectPoints(subject, false, true, g0);
  const y = CAT_HEIGHTS[1] + g0;
  for (const p of [...subject.me, ...subject.it]) {
    out.push({ x: p.x + CAT_BODY, y, z: p.z }, { x: p.x - CAT_BODY, y, z: p.z },
      { x: p.x, y, z: p.z + CAT_BODY }, { x: p.x, y, z: p.z - CAT_BODY });
  }
  return out;
}

// --- one view ----------------------------------------------------------------

// The view from `pos` with the pair's middle (lookY up) AIM_Y up the screen.
function viewFrom(pos, mid, fovY, lookY = LOOK_Y) {
  const dx = mid.x - pos.x, dy = lookY - pos.y, dz = mid.z - pos.z;
  const h = Math.hypot(dx, dz);
  const dist = Math.hypot(h, dy);
  const pitch = Math.atan2(dy, h) - Math.atan(AIM_Y * Math.tan((fovY * Math.PI) / 360));
  const look = {
    x: pos.x + (dx / h) * Math.cos(pitch) * dist,
    y: pos.y + Math.sin(pitch) * dist,
    z: pos.z + (dz / h) * Math.cos(pitch) * dist,
  };
  return { pos, look };
}

// The view from `pos` toward the pair's middle, pitched so the lowest of
// `pts` lands at screen height `y`: null when the highest would then pass
// FIGHT_FRAME.top. Right stays level (no roll), so a point's screen height is
// tan(its elevation - the pitch) / tan(fovY / 2) whatever its side offset.
function viewLow(pos, mid, fovY, pts, y) {
  const dx = mid.x - pos.x, dz = mid.z - pos.z;
  const h = Math.hypot(dx, dz);
  const fx = dx / h, fz = dz / h;
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) {
    const e = Math.atan2(p.y - pos.y, (p.x - pos.x) * fx + (p.z - pos.z) * fz);
    if (e < lo) lo = e;
    if (e > hi) hi = e;
  }
  const tanV = Math.tan((fovY * Math.PI) / 360);
  const pitch = lo - Math.atan(y * tanV);
  if (Math.tan(hi - pitch) / tanV > FIGHT_FRAME.top) return null;
  return {
    pos,
    look: { x: pos.x + fx * Math.cos(pitch), y: pos.y + Math.sin(pitch), z: pos.z + fz * Math.cos(pitch) },
  };
}

// The view from `pos` over a frame bottom `bottom` (Task 5b), or null when
// none frames `pts`: pitched so the lowest point sits LOW_LIFT over the
// bottom when that frames them all; else, when today's aim (viewFrom)
// frames them, as low as still does (a pitch up brings the near paws closer,
// so wider on screen: the side edge can bind first), found in FIT_STEPS
// halvings between the two.
const FIT_STEPS = 8;
function fitLow(pos, mid, fovY, lookY, pts, aspect, bottom) {
  const low = viewLow(pos, mid, fovY, pts, bottom + LOW_LIFT);
  if (low && inFrame(low, pts, aspect, fovY, bottom)) return low;
  const aim = viewFrom(pos, mid, fovY, lookY);
  if (!inFrame(aim, pts, aspect, fovY, bottom)) return null;
  let ok = aim;
  let lo = bottom + LOW_LIFT;
  let hi = Infinity;
  for (const p of pts) hi = Math.min(hi, projectPoint(aim, p, aspect, fovY).y);
  for (let i = 0; i < FIT_STEPS && hi > lo; i++) {
    const y = (lo + hi) / 2;
    const v = viewLow(pos, mid, fovY, pts, y);
    if (v && inFrame(v, pts, aspect, fovY, bottom)) { ok = v; hi = y; } else lo = y;
  }
  return ok;
}

// Where world point p lands on screen (normalised device coordinates; z is
// the depth in front of the camera), for a camera at view.pos looking at
// view.look with no roll, as three.js's lookAt sets it.
export function projectPoint(view, p, aspect, fovY) {
  const { pos, look } = view;
  let fx = look.x - pos.x, fy = look.y - pos.y, fz = look.z - pos.z;
  const fl = Math.hypot(fx, fy, fz);
  fx /= fl; fy /= fl; fz /= fl;
  // right = forward x up, up' = right x forward
  let rx = -fz, rz = fx;
  const rl = Math.hypot(rx, rz);
  rx /= rl; rz /= rl;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  const vx = p.x - pos.x, vy = p.y - pos.y, vz = p.z - pos.z;
  const depth = vx * fx + vy * fy + vz * fz;
  const tanV = Math.tan((fovY * Math.PI) / 360);
  return {
    x: (vx * rx + vz * rz) / (depth * tanV * aspect),
    y: (vx * ux + vy * uy + vz * uz) / (depth * tanV),
    z: depth,
  };
}

function inFrame(view, pts, aspect, fovY, bottom = FIGHT_FRAME.bottom) {
  for (const p of pts) {
    const q = projectPoint(view, p, aspect, fovY);
    if (q.z < 0.5 || Math.abs(q.x) > FIGHT_FRAME.x || q.y > FIGHT_FRAME.top || q.y < bottom) return false;
  }
  return true;
}

// The share (0..1) of the open frame (the screen above `bottom`) a tree
// covers in `view` (from `pos`), counting only its shapes nearer the camera
// than `nearDepth` (in front of the pair: the trees behind it are only
// backdrop). Each shape counts as its screen rectangle: a trunk (cylinder)
// its radius wide and its height tall about its mid-height, a canopy
// (ellipsoid) r wide and ry tall about its centre, at its centre's depth
// (never under 0.3 m, so one at the lens is big, not infinite), clipped to
// the open frame. Overlaps count twice; a sum over 1 is 1. Bare solids: the
// pads are for lines of sight, not for what the screen shows.
const CLUTTER_MIN_DEPTH = 0.3;
const clutterCentre = { x: 0, y: 0, z: 0 };
// (`pos` is view.pos; it is kept in the signature for the interface.)
export function frameClutter(pos, view, occluder, aspect, fovY, bottom, nearDepth) {
  const tanV = Math.tan((fovY * Math.PI) / 360);
  let sum = 0;
  for (const s of occluder.shapes) {
    const cyl = s.t === 'cyl';
    clutterCentre.x = s.x; clutterCentre.z = s.z;
    clutterCentre.y = cyl ? (s.y0 + s.y1) / 2 : s.y;
    const q = projectPoint(view, clutterCentre, aspect, fovY);
    if (q.z >= nearDepth || q.z <= -s.r) continue; // behind the pair, or wholly behind the lens
    const z = Math.max(CLUTTER_MIN_DEPTH, q.z);
    // the centre's screen spot at the clamped depth (projectPoint divides by the true one)
    const cx = (q.x * q.z) / z, cy = (q.y * q.z) / z;
    const hw = s.r / (z * tanV * aspect);
    const hh = (cyl ? (s.y1 - s.y0) / 2 : s.ry) / (z * tanV);
    const w = Math.min(1, cx + hw) - Math.max(-1, cx - hw);
    const h = Math.min(1, cy + hh) - Math.max(bottom, cy - hh);
    if (w > 0 && h > 0) sum += w * h;
  }
  return Math.min(1, sum / (2 * (1 - bottom)));
}

// The depth (in `view`) nearer than which a tree stands in front of the pair:
// the nearer cat's anchor, less a body's reach.
function nearDepthFor(view, subject, lookY, aspect, fovY) {
  let d = Infinity;
  for (const a of [subject.me[0], subject.it[0]]) {
    d = Math.min(d, projectPoint(view, { x: a.x, y: lookY, z: a.z }, aspect, fovY).z);
  }
  return d - CAT_BODY;
}

// The trees (of `near`) in front of the pair in `pos`'s ground plan: nearer
// pos than the pair's middle is. The rest stand behind it.
function frontOf(pos, mid, near) {
  const D = Math.hypot(pos.x - mid.x, pos.z - mid.z);
  const out = [];
  for (const o of near) if (Math.hypot(o.x - pos.x, o.z - pos.z) < D) out.push(o);
  return out;
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Gorge part 1 (R8, R11): a camera spot is in rock when it is under the
// ground + CAM_ROCK_CLEAR or over the ceiling - CAM_CEIL_CLEAR at its own
// x, z, or when its line to the pair's middle (at look height) passes under
// the ground or over a ceiling anywhere along it (sampled every ROCK_STEP m).
// Only called off flat ground.
const ROCK_STEP = 0.1;
function inRock(pos, mid, lookY, ground) {
  if (pos.y < ground.y(pos.x, pos.z) + CAM_ROCK_CLEAR || pos.y > ground.ceil(pos.x, pos.z) - CAM_CEIL_CLEAR) return true;
  const dx = mid.x - pos.x, dy = lookY - pos.y, dz = mid.z - pos.z;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / ROCK_STEP));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = pos.x + dx * t, y = pos.y + dy * t, z = pos.z + dz * t;
    if (y < ground.y(x, z) || y > ground.ceil(x, z)) return true;
  }
  return false;
}

// --- our cat past the intruder ----------------------------------------------

// The intruder's body, for whether it stands between the camera and our cat:
// a vertical segment from its paws IT_BODY_H up, grown by IT_BODY_R.
export const IT_BODY_R = 0.32;
const IT_BODY_H = 0.9;
const NEAR_MARGIN = 0.3; // m: the intruder counts as nearer only by more than this

// Where each cat stands for most of the fight: its spots on its own half,
// at least a quarter of the gap out from the middle along the axis. (A real
// subject's spots run right up to the other cat, for the leaps and the
// tumble; counted as they are, every view would have the intruder "hiding"
// our cat, standing where our cat's leap lands.) The anchors (spot 0) always
// qualify; a subject whose anchors sit on the middle keeps every spot.
function ownHalf(subject, who) {
  const { mid, axis } = subject;
  const spots = subject[who];
  const sign = who === 'me' ? 1 : -1; // the axis points from the intruder to our cat
  const a = subject.me[0], b = subject.it[0];
  const q = Math.abs((a.x - b.x) * axis.x + (a.z - b.z) * axis.z) / 4;
  if (q < 1e-9) return spots;
  const out = [];
  for (const p of spots) if (sign * ((p.x - mid.x) * axis.x + (p.z - mid.z) * axis.z) >= q - 1e-9) out.push(p);
  return out.length ? out : spots;
}

// The squared distance from segment p0→p1 (scalars) to the vertical segment
// at (sx, sz) from y0 to y1: Ericson's closest points between two segments
// (Real-Time Collision Detection 5.1.9), with the second one upright. No
// allocation.
function segToPostSq(px, py, pz, dx, dy, dz, sx, y0, sz, y1) {
  const ey = y1 - y0;                            // the post's direction (0, ey, 0)
  const rx = px - sx, ry = py - y0, rz = pz - sz;
  const a = dx * dx + dy * dy + dz * dz;         // |d1|^2
  const e = ey * ey;                              // |d2|^2
  const f = ey * ry;                              // d2 . r
  let s, t;
  if (a < 1e-12) {
    s = 0;
    t = Math.min(1, Math.max(0, f / e));
  } else {
    const c = dx * rx + dy * ry + dz * rz;        // d1 . r
    const b = dy * ey;                            // d1 . d2
    const denom = a * e - b * b;
    s = denom > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
    t = (b * s + f) / e;
    if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
  }
  const qx = px + dx * s - sx, qy = py + dy * s - (y0 + ey * t), qz = pz + dz * s - sz;
  return qx * qx + qy * qy + qz * qz;
}

// How much of our cat the intruder hides from `pos`: the share (0..1) of our
// cat's own-half spots x CAT_HEIGHTS whose line from pos passes within
// IT_BODY_R of the intruder's body at any of its own-half spots. g0: the
// ground under the pair's middle (fightGround), 0 on flat ground.
export function ourCatHidden(pos, subject, g0 = 0) {
  return hiddenShare(pos, ownHalf(subject, 'me'), ownHalf(subject, 'it'), g0);
}

// ourCatHidden with each cat's own-half spots already picked (candidates
// picks them once for every spot it prices).
function hiddenShare(pos, me, it, g0) {
  const r2 = IT_BODY_R * IT_BODY_R;
  let hid = 0;
  for (const p of me) {
    const dx = p.x - pos.x, dz = p.z - pos.z;
    const L2 = dx * dx + dz * dz;
    // the intruder spots near this line on the ground plan (a 3D distance is
    // never less than its ground-plan part), whatever the height
    for (const h of CAT_HEIGHTS) {
      const dy = h + g0 - pos.y;
      for (const s of it) {
        const fx = s.x - pos.x, fz = s.z - pos.z;
        const t = L2 < 1e-12 ? 0 : Math.min(1, Math.max(0, (fx * dx + fz * dz) / L2));
        const ex = fx - dx * t, ez = fz - dz * t;
        if (ex * ex + ez * ez > r2) continue;
        if (segToPostSq(pos.x, pos.y, pos.z, dx, dy, dz, s.x, g0, s.z, g0 + IT_BODY_H) <= r2) { hid++; break; }
      }
    }
  }
  return hid / (me.length * CAT_HEIGHTS.length);
}

// Whether the intruder stands nearer the camera than our cat, on the ground
// plan, by more than NEAR_MARGIN: each at its anchor (spot 0), where it
// stands for the square-off and between the beats. (Every spot would let a
// sidestep or the tumble's circle, a moment's move toward the camera, count
// our cat as the nearer from the intruder's side.)
export function itNearer(pos, subject) {
  const a = subject.me[0], b = subject.it[0];
  return Math.hypot(b.x - pos.x, b.z - pos.z) < Math.hypot(a.x - pos.x, a.z - pos.z) - NEAR_MARGIN;
}

// The camera spots to try, cheapest first: yaw0 itself, then 15-degree steps
// either way, on each ring; ring0 (the ring already in use) costs nothing.
// A spot where the intruder hides our cat, or stands nearer the camera than
// our cat, comes after every spot where it does not (and among those costs
// HIDE_COST, NEAR_COST): the kid's own cat is in front.
// A spot off side-on costs SIDE_COST x |cos| of its angle to the cats' line,
// and one with trees in front of the pair filling its frame CLUTTER_COST x
// their share (frameClutter, at today's aim over `bottom`).
// These only reorder the spots; every check in chooseFightView still applies.
function candidates(subject, yaw0, ring0, g0, near, aspect, fovY, bottom, lookY) {
  const list = [];
  const ax = Math.atan2(subject.axis.x, subject.axis.z);
  const { mid } = subject;
  const pos = { x: 0, y: 0, z: 0 };
  const me = ownHalf(subject, 'me'), it = ownHalf(subject, 'it');
  RINGS.forEach((ring, ri) => {
    const rc = ri === ring0 ? 0 : RING_COST * (ring.rank + (ring0 == null ? 0 : 1));
    for (let k = 0; k < YAW_STEPS; k++) {
      const step = k === 0 ? 0 : Math.ceil(k / 2) * (k % 2 ? 1 : -1);
      const yaw = wrap(yaw0 + (step * 2 * Math.PI) / YAW_STEPS);
      const off = Math.abs(wrap(yaw - ax));
      const along = off < AXIS_ANGLE || Math.PI - off < AXIS_ANGLE;
      pos.x = mid.x + Math.sin(yaw) * ring.d; pos.y = ring.h + g0; pos.z = mid.z + Math.cos(yaw) * ring.d;
      const hid = hiddenShare(pos, me, it, g0);
      const nearer = itNearer(pos, subject);
      const ours = HIDE_COST * hid + (nearer ? NEAR_COST : 0);
      let clutter = 0;
      const front = frontOf(pos, mid, near);
      if (front.length) {
        const view = viewFrom(pos, mid, fovY, lookY);
        const nd = nearDepthFor(view, subject, lookY, aspect, fovY);
        for (const o of front) clutter += frameClutter(pos, view, o, aspect, fovY, bottom, nd);
      }
      list.push({ yaw, ri, behind: hid > 0 || nearer ? 1 : 0, cost: Math.abs(step) + rc + (along ? AXIS_COST : 0) + SIDE_COST * Math.abs(Math.cos(yaw - ax)) + ours + CLUTTER_COST * clutter });
    }
  });
  // Our cat in front comes first, whatever the rest costs: a spot where the
  // intruder hides it or stands nearer the camera is tried only after every
  // spot where it does not (final review: a woods fight on a phone held
  // upright turned to a 3/4 view with the intruder in front, two yaw steps
  // from the current angle, over the side-on view eleven steps round). Then
  // the cheapest; a stable sort: equal costs keep their order, so the choice
  // is deterministic.
  return list.map((c, i) => ({ ...c, i })).sort((p, q) => p.behind - q.behind || p.cost - q.cost || p.i - q.i);
}

// The fight view: { pos, look, yaw, ring, clear, blockers, brushed, clutter }. Every
// point that is not a lifted top (subjectPoints(…, false)) is hard: a view
// must clear them all, or (no spot can) hide the fewest trees for them.
// Lifted tops are soft: among the views that clear every hard point, the one
// with the fewest tops behind a tree that cannot be hidden (`brushed`), then
// the fewest trees to hide for the rest, then the cheapest, wins. clear is
// true only when nothing is hidden and nothing brushed; blockers lists the
// trees (each with its Group) to hide. clutter (always an array) lists the
// other hideable trees in front of the pair that still cover CLUTTER_HIDE of
// the chosen view's open frame: hidden for the fight like the blockers.
// `ground` (src/ground.js): every height rides g0, the ground under the
// pair's middle, and a spot in rock or over a ceiling is never taken (R11).
// `frameBottom` (frameBottomFor, Task 5b): the frame's bottom over the real
// sheet; each spot is then first tried pitched low over it (viewLow), then
// at today's aim. null: today's bottom and aim.
export function chooseFightView({ subject, occluders = [], colliders = [], bounds = null, yaw0 = 0, ring0 = null, aspect = 1, fovY = 70, ground = FLAT_GROUND, frameBottom = null }) {
  const { mid } = subject;
  const g0 = fightGround(subject, ground);
  const lookY = LOOK_Y + g0;
  const near = occluders.filter((o) => Math.hypot(o.x - mid.x, o.z - mid.z) <= REACH + o.R);
  const framePts = framePoints(subject, g0);
  const seePts = subjectPoints(subject, true, false, g0);
  const liftPts = liftedPoints(subject, g0);
  const bottom = frameBottom ?? FIGHT_FRAME.bottom;
  // every view leaves with its clutter
  const done = (v) => {
    const clutter = [];
    const front = frontOf(v.pos, mid, near);
    if (front.length) {
      const nd = nearDepthFor(v, subject, lookY, aspect, fovY);
      for (const o of front) {
        if (!o.obj || v.blockers.includes(o)) continue;
        if (frameClutter(v.pos, v, o, aspect, fovY, bottom, nd) >= CLUTTER_HIDE) clutter.push(o);
      }
    }
    v.clutter = clutter;
    return v;
  };
  let best = null;     // the best view that clears every hard point
  let fallback = null; // the spot with the fewest blockers, every one of them hideable
  let least = null;    // the spot with the fewest blockers of any kind, while there is no fallback
  const order = candidates(subject, yaw0, ring0, g0, near, aspect, fovY, bottom, lookY);
  for (const c of order) {
    const ring = RINGS[c.ri];
    const pos = { x: mid.x + Math.sin(c.yaw) * ring.d, y: ring.h + g0, z: mid.z + Math.cos(c.yaw) * ring.d };
    if (bounds && (pos.x < bounds.minX + BOUNDS_GAP || pos.x > bounds.maxX - BOUNDS_GAP ||
      pos.z < bounds.minZ + BOUNDS_GAP || pos.z > bounds.maxZ - BOUNDS_GAP)) continue;
    if (colliders.some((k) => Math.hypot(pos.x - k.x, pos.z - k.z) < k.r + COLLIDER_GAP)) continue;
    if (!ground.flat && inRock(pos, mid, lookY, ground)) continue;
    const view = frameBottom == null ? viewFrom(pos, mid, fovY, lookY)
      : fitLow(pos, mid, fovY, lookY, framePts, aspect, bottom);
    if (!view || (frameBottom == null && !inFrame(view, framePts, aspect, fovY, bottom))) continue;
    const blockers = new Set();
    let hideable = true;
    let whole = true; // counted every blocker (not stopped early)
    scan: for (const p of seePts) {
      for (const o of near) {
        if (blockers.has(o) || !segmentBlocked(pos, p, o)) continue;
        blockers.add(o);
        if (!o.obj) hideable = false;
        // A view that clears every hard point beats any that does not.
        if (best) { whole = false; break scan; }
        // Stop once this spot can beat neither the fallback nor the least
        // blocked spot (which counts only while there is no fallback). A
        // spot with the intruder in front never beats a fallback without.
        const noFallback = !hideable || (fallback && (c.behind > fallback.behind || blockers.size >= fallback.blockers.length));
        const noLeast = !!fallback || (least && blockers.size >= least.count);
        if (noFallback && noLeast) { whole = false; break scan; }
      }
    }
    if (blockers.size === 0) {
      // Hard-clear: rank by its lifted tops.
      let brushed = 0;
      const hide = new Set();
      let worse = false;
      for (const p of liftPts) {
        const by = near.filter((o) => segmentBlocked(pos, p, o));
        if (by.length === 0) continue;
        if (by.some((o) => !o.obj)) brushed++;
        else for (const o of by) hide.add(o);
        if (best && (brushed > best.brushed || (brushed === best.brushed && hide.size >= best.blockers.length))) { worse = true; break; }
      }
      if (worse) continue;
      if (!best || brushed < best.brushed || (brushed === best.brushed && hide.size < best.blockers.length)) {
        best = { ...view, yaw: c.yaw, ring: c.ri, clear: brushed === 0 && hide.size === 0, blockers: [...hide], brushed };
        if (best.clear) return done(best);
      }
      continue;
    }
    if (best) continue;
    // The fallback: our cat in front first (a spot with the intruder in
    // front never replaces one without), then the fewest blockers; ties keep
    // the earlier, cheaper spot.
    if (hideable && (!fallback || (c.behind === fallback.behind ? blockers.size < fallback.blockers.length : c.behind < fallback.behind))) {
      fallback = { ...view, yaw: c.yaw, ring: c.ri, clear: false, blockers: [...blockers], behind: c.behind };
    }
    // ties keep the earlier spot, which is the one nearer the current view
    if (!fallback && whole && (!least || blockers.size < least.count)) {
      least = { view, yaw: c.yaw, ring: c.ri, count: blockers.size, blockers: [...blockers] };
    }
  }
  if (best) return done(best);
  // The lifted tops a last-resort view leaves behind a tree it does not hide.
  const brushedFor = (pos, hidden) => liftPts.filter((p) => near.some((o) => !hidden.includes(o) && segmentBlocked(pos, p, o))).length;
  if (fallback) {
    const v = { ...fallback, brushed: brushedFor(fallback.pos, fallback.blockers) };
    delete v.behind;
    return done(v);
  }
  // No spot is clear even with trees hidden (the blockers include stand
  // pines, which cannot be hidden one by one): the spot with the fewest
  // blockers, hiding those that can be.
  if (least) {
    const blockers = least.blockers.filter((o) => o.obj);
    return done({ ...least.view, yaw: least.yaw, ring: least.ring, clear: false,
      blockers, unhidden: least.blockers.filter((o) => !o.obj).length, brushed: brushedFor(least.view.pos, blockers) });
  }
  // No spot frames the pair at all (a cat pinned in a corner of the map): the
  // first wide ring straight back, as the follow camera would be (the tight
  // rings ahead of it are for close shots, not a last resort). Off flat
  // ground, the cheapest spot out of rock (in the map and off the colliders)
  // instead, when there is one (Gorge part 1, R8).
  let ri = LAST_RESORT_RING;
  let ring = RINGS[ri];
  let yaw = yaw0;
  if (!ground.flat && inRock({ x: mid.x + Math.sin(yaw0) * ring.d, y: ring.h + g0, z: mid.z + Math.cos(yaw0) * ring.d }, mid, lookY, ground)) {
    for (const c of order) {
      const r = RINGS[c.ri];
      const q = { x: mid.x + Math.sin(c.yaw) * r.d, y: r.h + g0, z: mid.z + Math.cos(c.yaw) * r.d };
      if (bounds && (q.x < bounds.minX + BOUNDS_GAP || q.x > bounds.maxX - BOUNDS_GAP ||
        q.z < bounds.minZ + BOUNDS_GAP || q.z > bounds.maxZ - BOUNDS_GAP)) continue;
      if (colliders.some((k) => Math.hypot(q.x - k.x, q.z - k.z) < k.r + COLLIDER_GAP)) continue;
      if (inRock(q, mid, lookY, ground)) continue;
      ring = r; yaw = c.yaw; ri = c.ri;
      break;
    }
  }
  const pos = { x: mid.x + Math.sin(yaw) * ring.d, y: ring.h + g0, z: mid.z + Math.cos(yaw) * ring.d };
  return done({ ...viewFrom(pos, mid, fovY, lookY), yaw, ring: ri, clear: false, blockers: [], brushed: brushedFor(pos, []) });
}

// --- the blend ---------------------------------------------------------------

const smooth = (u) => u * u * (3 - 2 * u);
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });
// Where along a camera move it is checked: the start, and every eighth of the
// way (the end is the chosen view, already checked).
export const BLEND_SAMPLES = Object.freeze([0, 1 / 8, 2 / 8, 3 / 8, 4 / 8, 5 / 8, 6 / 8, 7 / 8]);

// Whether a camera move from `from` to `to` (each { pos, look }; both points
// move in a straight line, as the blend below moves them) keeps both cats in
// the frame above the sheet and every line to them clear of the trees, at
// every BLEND_SAMPLES point. If not, the camera cuts instead of easing.
// frameBottom: as chooseFightView's (null, today's).
export function blendClear(from, to, subject, occluders, aspect, fovY, ground = FLAT_GROUND, frameBottom = null) {
  const g0 = fightGround(subject, ground);
  const framePts = framePoints(subject, g0);
  const seePts = subjectPoints(subject, true, false, g0); // lifted tops are soft (chooseFightView)
  // only the trees within reach of the move's lines: inside a circle round
  // the pair's middle that holds both ends of the move
  const mid = subject.mid;
  const span = Math.max(Math.hypot(from.pos.x - mid.x, from.pos.z - mid.z), Math.hypot(to.pos.x - mid.x, to.pos.z - mid.z)) + 3;
  const near = occluders.filter((o) => Math.hypot(o.x - mid.x, o.z - mid.z) <= span + o.R);
  for (const t of BLEND_SAMPLES) {
    const v = { pos: lerp3(from.pos, to.pos, t), look: lerp3(from.look, to.look, t) };
    if (!inFrame(v, framePts, aspect, fovY, frameBottom ?? FIGHT_FRAME.bottom)) return false;
    for (const p of seePts) if (firstBlocker(v.pos, p, near)) return false;
  }
  return true;
}

// update(dt, { subject, cameraMode, camera, cat, sheetTop }) after player.update has
// placed the follow camera and the fight has placed the cats. `subject` is
// clanfight's cameraSubject (null when no fight is on); `cat` is my cat's
// position, which the follow camera looks at. `sheetTop` is the fight sheet's
// top edge in NDC (sheetTopFrom; null when none is measured): the sheet first
// showing, or rising more than SHEET_STEP over the tallest yet this fight,
// re-chooses, as a turn of the phone does; a shorter sheet keeps the view. Returns whether it
// moved the camera this frame.
//
// Every move into a fight view (the first one, and a new one when the rounds
// begin or the phone turns) is an ease only when blendClear passes from what
// is on screen now; otherwise it is a cut. An ease in goes from a still
// snapshot of the follow view, so the move is exactly the straight line that
// was checked; a move between fight views goes from what is on screen.
export function createFightCam({ occluders = [], colliders = [], bounds = null, reducedMotion = false, lookY = 0.6, ground = FLAT_GROUND } = {}) {
  let w = 0;            // 0 follow camera .. 1 fight camera
  let view = null;      // the chosen view
  let cur = null;       // where the fight camera is, easing toward view
  let from = null;      // the follow view an ease in started from (held still)
  let lastSubject = null;
  let lastAspect = 0;
  let lastSheetTop = null; // the sheet top the view was last chosen for
  let maxSheetTop = null;  // the highest sheet top seen since the fight began (or the phone turned)
  let frameBottom = null;
  let hidden = [];
  let cuts = 0;

  function show() {
    for (const o of hidden) o.obj.visible = true;
    hidden = [];
  }

  function choose(subject, camera) {
    const mid = subject.mid;
    const at = cur ? cur.pos : camera.position;
    const yaw0 = Math.atan2(at.x - mid.x, at.z - mid.z);
    const next = chooseFightView({
      subject, occluders, colliders, bounds, yaw0, ring0: view ? view.ring : null,
      aspect: camera.aspect, fovY: camera.fov, ground, frameBottom,
    });
    show();
    for (const o of [...next.blockers, ...next.clutter]) { o.obj.visible = false; hidden.push(o); }
    return next;
  }

  // Whether the sheet's top rose enough to re-choose, or first appeared. The
  // sheet's height changes between the beats (a clue, then a line), so within
  // a fight the frame ratchets to the tallest sheet seen, the safest frame: a
  // shorter sheet, or the sheet going, keeps the view rather than moving (or,
  // under reduced motion, cutting) every beat.
  const sheetMoved = (t) => t != null && (lastSheetTop == null || t > lastSheetTop + SHEET_STEP);

  const copy = (v) => ({ pos: { ...v.pos }, look: { ...v.look } });

  const api = {
    get weight() { return w; },
    get view() { return view; },
    // How many moves into a fight view were cuts (for tests).
    get cuts() { return cuts; },
    update(dt, { subject, cameraMode = false, camera, cat, sheetTop = null }) {
      const active = !!subject && !cameraMode;
      const follow = {
        pos: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        look: { x: cat.x, y: (cat.y ?? 0) + lookY, z: cat.z },
      };
      if (active) {
        // a turn of the phone starts the ratchet again from this sheet
        if (lastAspect !== 0 && camera.aspect !== lastAspect) maxSheetTop = null;
        if (sheetTop != null && (maxSheetTop == null || sheetTop > maxSheetTop)) maxSheetTop = sheetTop;
      }
      if (!active) {
        lastSubject = null;
        lastSheetTop = null;
        maxSheetTop = null;
        from = null;
        if (cameraMode || reducedMotion) w = 0;
        else w = Math.max(0, w - dt / EASE_OUT);
        // The hidden trees come back only once the camera is home: while it
        // eases out it still stands by the fight view, where a clutter trunk
        // would pop back in beside the lens (treefade.js covers only the
        // trees on the line to my cat). Reduced motion and photo mode are home at once.
        if (w === 0) { show(); view = null; cur = null; return false; }
      } else if (subject !== lastSubject || camera.aspect !== lastAspect || sheetMoved(sheetTop)) {
        // what is on screen right now, before this frame's move
        const base = from ?? follow;
        const s0 = smooth(w);
        const shown = w === 0 ? copy(follow) : { pos: lerp3(base.pos, cur.pos, s0), look: lerp3(base.look, cur.look, s0) };
        lastSheetTop = maxSheetTop;
        frameBottom = frameBottomFor(maxSheetTop);
        view = choose(subject, camera);
        lastSubject = subject;
        lastAspect = camera.aspect;
        const left = occluders.filter((o) => !o.obj || o.obj.visible !== false);
        if (reducedMotion || !blendClear(shown, view, subject, left, camera.aspect, camera.fov, ground, frameBottom)) {
          cur = copy(view); w = 1; from = null; cuts += 1;
        } else if (w === 0) {
          from = shown; cur = copy(view);
        } else {
          cur = shown; w = 1; from = null;
        }
      }
      if (active) {
        w = reducedMotion ? 1 : Math.min(1, w + dt / EASE_IN);
        if (w === 1) from = null;
        const k = reducedMotion ? 1 : 1 - Math.exp(-FOLLOW_RATE * Math.max(dt, 0));
        for (const key of ['pos', 'look']) {
          for (const ax of ['x', 'y', 'z']) cur[key][ax] = lerp(cur[key][ax], view[key][ax], k);
        }
      }
      const s = smooth(w);
      const base = from ?? follow;
      const pos = lerp3(base.pos, cur.pos, s);
      const look = lerp3(base.look, cur.look, s);
      camera.position.set(pos.x, pos.y, pos.z);
      camera.lookAt(look.x, look.y, look.z);
      return true;
    },
    // The walk ended: every hidden tree back, nothing held.
    dispose() { show(); view = null; cur = null; from = null; w = 0; lastSubject = null; },
  };
  return api;
}
