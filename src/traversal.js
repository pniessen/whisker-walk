// =============================================================================
// TRAVERSAL (Rooftops step 1, part 1). The shared machinery for the moves the
// Rooftops area needs: a balance walk on a placed crossing (plank, ridge,
// gutter, line, pipe), a leap across a marked gap, and a marked drop or
// climb-up between two levels. Pure and THREE-free, so tests and the build
// check run it headless. It holds the DATA, its RULES, and the motion maths
// (mounting, the balance step, take-off spots, the hop and its timing).
//
// Why a crossing is a RAIL and not ground: a plank laid over an alley as a
// ground strip would make the alley a wall under it, because ground.js allows
// one walkable height per spot. So a crossing is a polyline in the air that
// the cat is snapped onto while she balances; the ground under it stays what
// it is.
//
// Hops (leap, climb, drop) share one arc, for s in [0, 1]:
//   x = x0 + (x1 - x0) s,  z likewise,
//   y = y0 + dy * s + 4 * apex * s * (1 - s)
// The end heights come from ground.y at the two spots, so no hop height is
// ever authored. The apex is the lowest one (in APEX_STEP steps) that
// clears every wall, lip and other roof the arc crosses.
//
// ALLOCATION: createTraversal and validateTraversal run once, at build time,
// and may allocate. crossingPoint, arcPoint and arcClears write into a
// caller's `out` (or allocate nothing) because the runtime calls them per
// frame.
// =============================================================================

import { STEP_MAX, LEVEL_TOL, MAX_PATH_GRADE } from './ground.js';
import { BASE_CLIMB_BUDGET, SPRING_PAWS_CLIMB, climbBudget } from './climbing.js';
import { hasSkill } from './skills.js';

// 'stair' (Lighthouse): a flight of rail she WALKS (normal pace and pose, no balance, not a
// feat), listed from its lower end up. Every other kind is a balance walk. A crossing with `follow`
// (a stair always; the gallery's curved railing walk) turns the held stick with the camera, so a thumb
// held "up" follows the rail round; the Rooftops' straight crossings keep the world direction they were pushed in.
export const CROSSING_KINDS = Object.freeze(['plank', 'ridge', 'gutter', 'line', 'pipe', 'stair']);
export const STAIR_SPEED = 2.4; // m/s
export const countsAsCrossing = (c) => c.kind !== 'stair';
export const SEG_MIN = 0.2; // m
export const CROSSING_MAX_LEN = 12; // m
export const END_INSET = 0.35; // m: each end's first stretch of rail lies on its roof
export const MOUNT_R = 0.5; // m from an end
export const MOUNT_DOT = 0.5; // stick must point this much onto the crossing
export const MOUNT_ALIGN_BONUS = 0.4; // m of nearness a perfectly aligned push is worth, to choose between crossings sharing an end
export const ALONG_DEAD = 0.25; // an along-crossing push smaller than this does nothing
export const BALANCE_SPEED = 1.2; // m/s, "a careful walk" (her walk is 3.5)
export const TIGHTROPE_SPEED = 1.7; // m/s, with Tightrope Tail (step 4 earns it)
export const BALANCE_EASE = 6; // 1/s
export const TURN_RATE = 9; // rad/s, her turn on a crossing (and her fastest turn in a hop's crouch)
export const WALK_SPEED = 3.5; // m/s, = player.js's walk pace (tested); a hop's crouch never glides her faster
export const SNAP_EASE = 14; // 1/s, the glide onto the rail
export const CAM_FOLLOW_RATE = 1.6; // 1/s
export const CAM_TURN_MAX = 1.1; // rad/s, "gently"
export const SPOT_R = 0.9; // m from a take-off / drop / climb spot
export const SPOT_FACE_BONUS = 0.4; // m off a candidate's score per unit of facing
export const SPOT_BODY = 0.35; // = player.js CAT_RADIUS (tested; player.js is not THREE-free)
export const GAP_MIN = 1.0; // m
export const GAP_MAX = 3.5; // m, spec
export const LONG_GAP_MAX = 4.5; // m, spec
export const LEAP_RISE_MAX = 1.6; // m, = BASE_CLIMB_BUDGET.climb, spec
export const DROP_MAX = 3.0; // m, spec
export const DROP_REACH = 2.5; // m horizontal
export const CLIMB_REACH = 2.5; // m horizontal; a climb's rise <= SPRING_PAWS_CLIMB
export const ARC_CLEAR = 0.15; // m over walls and lips
export const APEX_MARGIN = 0.1; // m
export const APEX_STEP = 0.05; // m
export const APEX_MAX = 2.0; // m

// Timings and arcs per kind. airPerM is per metre of distance (leap) or of
// rise/fall (climb, drop). First guesses, for the owner to tune from the
// recording.
export const HOP = Object.freeze({
  leap: Object.freeze({ crouch: 0.5, crouchRM: 0.15, air: 0.45, airPerM: 0.07, apex: 0.45, apexPerM: 0.12, hang: 0.45, land: 0.22, landRM: 0.12 }),
  climb: Object.freeze({ crouch: 0.15, crouchRM: 0.08, air: 0.35, airPerM: 0.08, apex: 0.3, apexPerM: 0, hang: 0, land: 0.15, landRM: 0.1 }),
  drop: Object.freeze({ crouch: 0.12, crouchRM: 0.08, air: 0.4, airPerM: 0.12, apex: 0.2, apexPerM: 0, hang: 0, land: 0.22, landRM: 0.12 }),
});

export const LOOK_TIME = 1.4; // s
export const TIGHTROPE_TAIL_ID = 'tightrope-tail'; // step 5's catalog ids (skills.js)
export const LONG_LEAP_ID = 'long-leap';
export const BASE_ABILITIES = Object.freeze({ steady: false, longLeap: false, climb: BASE_CLIMB_BUDGET.climb });

const ARC_SAMPLES = 50;
const EPS = 1e-9;

// ---------------------------------------------------------------------------
// Building

function buildCrossing({ id, kind, width = 0.3, reach = 0, follow = false, points }) {
  const segs = [];
  let u = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dz);
    segs.push(Object.freeze({
      x0: a.x, z0: a.z, y0: a.y, dx, dz, dy, len, u0: u,
      tx: len > 0 ? dx / len : 0, tz: len > 0 ? dz / len : 0, grade: len > 0 ? dy / len : 0,
    }));
    u += len;
  }
  const first = segs[0];
  const last = segs[segs.length - 1];
  const p0 = points[0];
  const p1 = points[points.length - 1];
  const ends = Object.freeze([
    Object.freeze({ x: p0.x, z: p0.z, y: p0.y, inX: first.tx, inZ: first.tz }),
    Object.freeze({ x: p1.x, z: p1.z, y: p1.y, inX: -last.tx, inZ: -last.tz }),
  ]);
  return Object.freeze({ id, kind, width, reach, follow: follow || kind === 'stair', length: u, segs: Object.freeze(segs), ends });
}

function apexBase(hop) {
  const k = HOP[hop.kind];
  return Math.max(k.apex + k.apexPerM * hop.dist, Math.abs(hop.dy) / 4 + APEX_MARGIN);
}

function buildHop(kind, { id, from, to, requires = null, mark = null }, ground) {
  const y0 = ground.y(from.x, from.z);
  const y1 = ground.y(to.x, to.z);
  const hop = { id, kind, x0: from.x, z0: from.z, y0, x1: to.x, z1: to.z, y1, dist: Math.hypot(to.x - from.x, to.z - from.z), dy: y1 - y0, requires, mark, apex: APEX_MAX };
  const base = apexBase(hop);
  for (let i = 0; ; i++) {
    const h = base + i * APEX_STEP;
    if (h > APEX_MAX + EPS) break;
    if (arcClears(hop, h, ground)) { hop.apex = h; break; }
  }
  return Object.freeze(hop);
}

export function createTraversal(spec, ground) {
  const { crossings = [], gaps = [], climbs = [], drops = [] } = spec || {};
  return Object.freeze({
    crossings: Object.freeze(crossings.map(buildCrossing)),
    hops: Object.freeze([
      ...gaps.map((g) => buildHop('leap', g, ground)),
      ...climbs.map((c) => buildHop('climb', c, ground)),
      ...drops.map((d) => buildHop('drop', d, ground)),
    ]),
  });
}

// ---------------------------------------------------------------------------
// Rails and arcs

// The point `u` metres along a crossing's rail (clamped to its length), with
// the horizontal unit direction and the grade there.
export function crossingPoint(crossing, u, out) {
  const segs = crossing.segs;
  const uu = u < 0 ? 0 : u > crossing.length ? crossing.length : u;
  let s = segs[0];
  for (let i = 0; i < segs.length; i++) {
    s = segs[i];
    if (uu <= s.u0 + s.len) break;
  }
  const t = s.len > 0 ? Math.min(Math.max((uu - s.u0) / s.len, 0), 1) : 0;
  out.x = s.x0 + s.dx * t;
  out.y = s.y0 + s.dy * t;
  out.z = s.z0 + s.dz * t;
  out.tx = s.tx;
  out.tz = s.tz;
  out.grade = s.grade;
  return out;
}

export function arcPoint(hop, apex, s, out) {
  out.x = hop.x0 + (hop.x1 - hop.x0) * s;
  out.z = hop.z0 + (hop.z1 - hop.z0) * s;
  out.y = hop.y0 + hop.dy * s + 4 * apex * s * (1 - s);
  return out;
}

// True when the arc stays over the ground it crosses: level with the ground at
// either end it must not dip below it; over anything else (walls, lips,
// other roofs) it must clear it by ARC_CLEAR.
export function arcClears(hop, apex, ground) {
  for (let i = 0; i <= ARC_SAMPLES; i++) {
    const s = i / ARC_SAMPLES;
    const x = hop.x0 + (hop.x1 - hop.x0) * s;
    const z = hop.z0 + (hop.z1 - hop.z0) * s;
    const y = hop.y0 + hop.dy * s + 4 * apex * s * (1 - s);
    const g = ground.y(x, z);
    const own = Math.abs(g - hop.y0) <= STEP_MAX || Math.abs(g - hop.y1) <= STEP_MAX;
    if (y < g + (own ? 0 : ARC_CLEAR) - EPS) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Rules

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const RING_RADII_ANGLES = 16;

// Every ring sample at the same level as the spot must be able to step to it.
function walkableTo(ground, x, z, level, outer) {
  for (const r of [0.3, 0.6, outer]) {
    for (let k = 0; k < RING_RADII_ANGLES; k++) {
      const a = (k / RING_RADII_ANGLES) * Math.PI * 2;
      const sx = x + Math.cos(a) * r;
      const sz = z + Math.sin(a) * r;
      if (Math.abs(ground.y(sx, sz) - level) <= STEP_MAX && !ground.canStep(sx, sz, x, z)) return false;
    }
  }
  return true;
}

function checkSpot(msgs, { x, z }, { bounds, colliders, wet }) {
  if (bounds && (x < bounds.minX + SPOT_BODY || x > bounds.maxX - SPOT_BODY || z < bounds.minZ + SPOT_BODY || z > bounds.maxZ - SPOT_BODY)) msgs.add('is outside the bounds');
  for (const c of colliders) if (Math.hypot(x - c.x, z - c.z) < c.r + SPOT_BODY) { msgs.add('is inside a collider'); break; }
  if (wet && wet(x, z)) msgs.add('is in the water');
}

function checkCrossing(c, ctx, msgs) {
  const { ground } = ctx;
  const pts = c.points;
  if (!CROSSING_KINDS.includes(c.kind)) msgs.add('unknown kind');
  if (!Array.isArray(pts) || pts.length < 2) { msgs.add('needs two points or more'); return; }
  const w = c.width === undefined ? 0.3 : c.width;
  if (!finite(w) || pts.some((p) => !p || !finite(p.x) || !finite(p.y) || !finite(p.z))) { msgs.add('has a non-finite number'); return; }
  const cr = buildCrossing(c);
  if (cr.segs.some((s) => s.len < SEG_MIN)) msgs.add('has a segment shorter than 0.2 m');
  if (cr.segs.some((s) => s.len > 0 && Math.abs(s.grade) > MAX_PATH_GRADE + EPS)) msgs.add('is steeper than 1 in 3');
  if (cr.length > CROSSING_MAX_LEN) msgs.add('is longer than 12 m');
  cr.ends.forEach((e, i) => { if (Math.abs(e.y - ground.y(e.x, e.z)) > STEP_MAX) msgs.add(`end ${i} is off the ground`); });
  const p = { x: 0, y: 0, z: 0, tx: 0, tz: 0, grade: 0 };
  for (let u = 0; u <= END_INSET + EPS; u += 0.05) {
    for (const uu of [u, cr.length - u]) {
      crossingPoint(cr, uu, p);
      if (Math.abs(p.y - ground.y(p.x, p.z)) > STEP_MAX) msgs.add('does not lie on its roof for its first 0.35 m');
    }
  }
  for (let u = 0; u <= cr.length + EPS; u += 0.25) {
    crossingPoint(cr, u, p);
    if (p.y < ground.y(p.x, p.z) - 1e-6) { msgs.add('goes under the ground'); break; }
  }
  cr.ends.forEach((e) => {
    checkSpot(msgs, e, ctx);
    if (!walkableTo(ground, e.x, e.z, e.y, MOUNT_R)) msgs.add('cannot be walked to from its own level');
  });
}

function checkHop(kind, h, ctx, msgs) {
  const { ground } = ctx;
  const { from, to } = h;
  if (![from, to].every((p) => p && finite(p.x) && finite(p.z))) { msgs.add('has a non-finite number'); return; }
  const hop = buildHop(kind, h, ground);
  const rise = hop.dy;
  if (kind === 'leap') {
    if (hop.dist < GAP_MIN) msgs.add('is shorter than 1 m');
    if (h.requires != null && h.requires !== LONG_LEAP_ID) msgs.add('unknown requirement');
    else if (h.requires != null && hop.dist <= GAP_MAX) msgs.add('needs no Long Leap');
    if (h.requires == null && hop.dist > GAP_MAX) msgs.add('is wider than 3.5 m without Long Leap');
    if (hop.dist > LONG_GAP_MAX) msgs.add('is wider than 4.5 m');
    if (rise > LEAP_RISE_MAX) msgs.add('rises more than 1.6 m');
    if (-rise > DROP_MAX) msgs.add('falls more than 3 m');
  } else if (kind === 'drop') {
    if (-rise <= LEVEL_TOL) msgs.add('is not a drop');
    if (-rise > DROP_MAX) msgs.add('falls more than 3 m');
    if (hop.dist > DROP_REACH) msgs.add('reaches more than 2.5 m');
  } else {
    if (rise <= LEVEL_TOL) msgs.add('is not a climb');
    if (rise > SPRING_PAWS_CLIMB) msgs.add('rises more than 2.2 m');
    if (hop.dist > CLIMB_REACH) msgs.add('reaches more than 2.5 m');
  }
  if (!arcClears(hop, hop.apex, ground)) msgs.add('arc hits the ground');
  checkSpot(msgs, from, ctx);
  checkSpot(msgs, to, ctx);
  if (!walkableTo(ground, from.x, from.z, hop.y0, SPOT_R)) msgs.add('cannot be walked to from its own level');
}

// Returns a list of problems, `${what} ${id}: ${phrase}`; empty means good.
export function validateTraversal(spec, { ground, bounds, colliders = [], wet = null }) {
  const { crossings = [], gaps = [], climbs = [], drops = [] } = spec || {};
  const ctx = { ground, bounds, colliders, wet };
  const out = [];
  const seen = new Set();
  const lists = [['crossing', crossings, checkCrossing], ['gap', gaps, (r, c, m) => checkHop('leap', r, c, m)],
    ['climb', climbs, (r, c, m) => checkHop('climb', r, c, m)], ['drop', drops, (r, c, m) => checkHop('drop', r, c, m)]];
  for (const [what, list, check] of lists) {
    for (const rec of list) {
      const msgs = new Set();
      if (seen.has(rec.id)) msgs.add('duplicate id');
      seen.add(rec.id);
      check(rec, ctx, msgs);
      for (const m of msgs) out.push(`${what} ${rec.id}: ${m}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Abilities

// What the player's save lets her do on a crossing or across a gap. The base
// set is returned by identity when nothing is held (the climbBudget pattern).
export function moveAbilities(state) {
  const steady = hasSkill(state, TIGHTROPE_TAIL_ID);
  const longLeap = hasSkill(state, LONG_LEAP_ID);
  const climb = climbBudget(state).climb;
  if (!steady && !longLeap && climb === BASE_ABILITIES.climb) return BASE_ABILITIES;
  return Object.freeze({ steady, longLeap, climb });
}

// ---------------------------------------------------------------------------
// Motions

// The end of a crossing the cat is pushing onto, if any: nearest of the ends
// that are close, level, and in the direction of the push; where several
// ends qualify (crossings that share one), the lowest d - MOUNT_ALIGN_BONUS *
// (how well the push points along it) wins. The end (skipCrossing, skipEnd) is
// never a candidate. `out` is { crossing, end, u }, with u the cat's place
// along that end's own segment.
// A crossing may reach further than MOUNT_R (its `reach`, extra metres, for an end in the
// middle of a round roof, where a wandering stick meets the rim well off the end).
export function crossingToMount(trav, x, z, groundY, dirX, dirZ, out, skipCrossing = null, skipEnd = -1) {
  const dl = Math.hypot(dirX, dirZ);
  if (dl < 0.2) return null;
  let best = Infinity;
  let found = false;
  for (let i = 0; i < trav.crossings.length; i++) {
    const c = trav.crossings[i];
    for (let k = 0; k < 2; k++) {
      const e = c.ends[k];
      const d = Math.hypot(x - e.x, z - e.z);
      if (d > MOUNT_R + c.reach) continue;
      if (c === skipCrossing && k === skipEnd) continue;
      if (Math.abs(groundY - e.y) > LEVEL_TOL) continue;
      const dot = dirX * e.inX + dirZ * e.inZ;
      if (dot < MOUNT_DOT * dl) continue;
      const score = d - MOUNT_ALIGN_BONUS * dot / dl;
      if (score >= best) continue;
      best = score;
      found = true;
      out.crossing = c;
      out.end = k;
    }
  }
  if (!found) return null;
  const c = out.crossing;
  const s = out.end === 0 ? c.segs[0] : c.segs[c.segs.length - 1];
  const p = Math.min(Math.max((x - s.x0) * s.tx + (z - s.z0) * s.tz, 0), s.len);
  out.u = s.u0 + p;
  return out;
}

// One frame of walking a crossing. st = { u, v } is changed in place. Returns
// 0 or 1 when she is pushed out past that end (step off), else null.
export function balanceStep(st, crossing, along, dt, steady) {
  const max = crossing.kind === 'stair' ? STAIR_SPEED : steady ? TIGHTROPE_SPEED : BALANCE_SPEED;
  const target = Math.abs(along) < ALONG_DEAD ? 0 : along * max;
  st.v += (target - st.v) * (1 - Math.exp(-BALANCE_EASE * dt));
  st.u += st.v * dt;
  // Edge grace: on a crossing with a `reach` a push off an end must be firmer
  // than `reach` m/s (target is the push times the walk's speed) to step off,
  // so a wandering stick that grazes the end does not do it (reach is 0 on
  // every other crossing: any push off steps off).
  if (st.u <= 0) {
    st.u = 0;
    if (target < -crossing.reach) return 0;
    st.v = 0;
  } else if (st.u >= crossing.length) {
    st.u = crossing.length;
    if (target > crossing.reach) return 1;
    st.v = 0;
  }
  return null;
}

// The hop she would take from here, if any: { hop, look }. A look is a spot
// she cannot use yet (gated gap, climb too high); it only shows her the view.
export function spotFor(trav, x, z, groundY, faceX, faceZ, abilities, out) {
  let best = Infinity;
  let found = false;
  for (let i = 0; i < trav.hops.length; i++) {
    const h = trav.hops[i];
    const d = Math.hypot(x - h.x0, z - h.z0);
    if (d > SPOT_R || Math.abs(groundY - h.y0) > LEVEL_TOL) continue;
    const look = (h.kind === 'leap' && h.requires === LONG_LEAP_ID && !abilities.longLeap)
      || (h.kind === 'climb' && h.dy > abilities.climb);
    let facing = 0;
    if (h.dist > 0) facing = Math.max(0, (faceX * (h.x1 - h.x0) + faceZ * (h.z1 - h.z0)) / h.dist);
    const score = d - SPOT_FACE_BONUS * facing + (look ? SPOT_R : 0);
    if (score < best) {
      best = score;
      found = true;
      out.hop = h;
      out.look = look;
    }
  }
  return found ? out : null;
}

// The timing of one hop, from where she was pressed to the landing. `turn`
// is the signed turn (rad) from her yaw at the press to the hop's. The crouch
// eases her yaw and her glide to the take-off on one smoothstep, whose top
// rate is 1.5 times its mean, so it lasts at least long enough that neither
// her turn passes TURN_RATE nor her glide her walk: no snap on the spring
// frame, no slide faster than she walks. Reduced motion shortens only the
// base crouch; both floors stay.
export function planHop(hop, startX, startZ, reducedMotion, out, turn = 0) {
  const k = HOP[hop.kind];
  out.hop = hop;
  out.sx = startX;
  out.sz = startZ;
  const glide = Math.hypot(hop.x0 - startX, hop.z0 - startZ);
  out.crouch = Math.max(reducedMotion ? k.crouchRM : k.crouch, (1.5 * Math.abs(turn)) / TURN_RATE, (1.5 * glide) / WALK_SPEED);
  out.land = reducedMotion ? k.landRM : k.land;
  out.hang = reducedMotion ? 0 : k.hang;
  out.air = k.air + k.airPerM * (hop.kind === 'leap' ? hop.dist : Math.abs(hop.dy));
  out.total = out.crouch + out.air + out.land;
  return out;
}

// Where she is `elapsed` seconds into a plan. Phase: crouch (glide to the
// take-off), air (the arc, slow at the top), land, then done (exactly on the
// landing spot).
export function hopAt(plan, elapsed, out) {
  const hop = plan.hop;
  const e = elapsed < 0 ? 0 : elapsed;
  if (e < plan.crouch) {
    const t = e / plan.crouch;
    const m = t * t * (3 - 2 * t);
    out.x = plan.sx + (hop.x0 - plan.sx) * m;
    out.z = plan.sz + (hop.z0 - plan.sz) * m;
    out.y = hop.y0;
    out.phase = 'crouch';
    out.s = 0;
    out.onGround = true;
    out.tau = t;
  } else if (e < plan.crouch + plan.air) {
    const w = (e - plan.crouch) / plan.air;
    const s = w + (plan.hang / (2 * Math.PI)) * Math.sin(2 * Math.PI * w);
    arcPoint(hop, hop.apex, s, out);
    out.phase = 'air';
    out.s = s;
    out.onGround = false;
    out.tau = w;
  } else {
    const done = e >= plan.total;
    out.x = hop.x1;
    out.y = hop.y1;
    out.z = hop.z1;
    out.phase = done ? 'done' : 'land';
    out.s = 1;
    out.onGround = true;
    out.tau = done ? 1 : (e - plan.crouch - plan.air) / plan.land;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Yaw and stick helpers

// A stick (sx right, sz back as the pad reports it) turned by the camera yaw:
// three's Vector3(sx, 0, sz).applyAxisAngle(+y, yaw), without three.
export function stickToWorld(sx, sz, yaw, out) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  out.x = sx * c + sz * s;
  out.z = -sx * s + sz * c;
  return out;
}

// player.js's rotation.y for a cat heading (fx, fz).
export function facingYaw(fx, fz) {
  return Math.atan2(fx, fz) + Math.PI;
}

// The camera yaw that puts the follow camera behind a cat heading (fx, fz).
// (0 - x, not -x, so a heading of 0 gives +0 and not -0.)
export function behindYaw(fx, fz) {
  return Math.atan2(0 - fx, 0 - fz);
}

// An angle's shortest signed form, in (-PI, PI].
export function wrapPi(a) {
  const TWO_PI = Math.PI * 2;
  let d = a % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  else if (d <= -Math.PI) d += TWO_PI;
  return d;
}

// Turn `cur` toward `target` the short way: a share of the gap, at most
// max rad/s.
export function easeYawToward(cur, target, dt, rate, max) {
  let step = wrapPi(target - cur) * (1 - Math.exp(-rate * dt));
  const cap = max * dt;
  if (step > cap) step = cap;
  else if (step < -cap) step = -cap;
  return cur + step;
}
