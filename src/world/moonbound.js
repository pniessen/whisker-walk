// =============================================================================
// THE MOON: THE BOUND (milestone 7b, Tier 2 jumping). Pure rules: no THREE, no clock, no random number. A ground pounce at a run on the Moon is a BOUND: the walk's pounce
// window (the Moon's 1.08 s hang) is the flight, her paws are carried along a ballistic arc by this module, not by the player's own velocity, and she
//   * HALTS the player (world/moonboundlive.js holds it, as src/traversallive.js does) and moves herself at the speed she took off at (1.5 times her walk, 4.2 to 8.6 m/s:
//     about 5 m for a walk, 9 m from a sprint);
//   * STEERS at 60 percent of the ground's turning (the stick bends the line, the speed holds; a stick let go keeps the course);
//   * is CLAMPED to the walkable bounds (she slides along the edge) and NEVER ENTERS A COLLIDER: if the next 0.2 m step would, the bound ends there, gently (the height eases
//     down over a quarter of a second) on the ground beside it; a step the ground refuses (a wall of a hill, a tower) ends it the same way;
//   * flies over the RIFTS (the trenches) and never lands in one: if the line she is on would land her inside a rift's lip, her SPEED (never her heading) is bent so that she
//     lands on the lip: the far lip if she would be within 1.2 m of it (or is already over the trench: she catches it), else she falls short, gently, onto the near lip;
//   * lands on the GROUND or on a PERCH only through the walk's own rule: canReach(perch, where she TOOK OFF, 0, the Moon's budget). A bound therefore never reaches a perch
//     that a plain press from the take-off could not (and a press that could has already taken it: the bound only begins when it found none).
// Her height over the ground while she is in the air is `boundY(state)` (named `moonY` in the spec; the ground's own height function already has that name). It is read
// ONLY by the ring gates (world/moonboundlive.js) and the hop board (world/moonjumplive.js): nothing that reads perchY (the finds, the mice, the perch chain) ever reads it
// (test/moonbound.test.js greps the sources), exactly the suit's `floatY` rule.
// The switch that turns all of this off is world/moonswitch.js.
// =============================================================================

import { canReach } from '../climbing.js';
import { RIFT_LIP } from './moonplan.js';

export const BOUND = Object.freeze({
  steer: 0.6, // the stick's share of the ground's turning while she is in the air
  runMin: 2.0, // m/s: a walk at the Moon's pace is about 3; stalking (0.45 of it) and standing still are plain hops
  speedMul: 1.5, // take-off speed times this is the bound's speed
  speedMin: 4.2,
  speedMax: 8.6,
  step: 0.2, // m: the collision step
  radius: 0.35, // her body (src/player.js CAT_RADIUS): the player's own collider margin
  ease: 0.25, // s: how long an early end takes to come down
  pullRate: 14, // 1/s: how fast her speed is bent toward a rift's lip
  pullMax: 1.35, // times the bound's own speed: the most a flight is stretched to catch a far lip
  stretch: 1.2, // m: a landing this close to the far lip (inside it) is carried across to it; any farther short, she lands on the near lip
});

export const boundSpeed = (walk) => Math.min(BOUND.speedMax, Math.max(BOUND.speedMin, (Number.isFinite(walk) ? walk : 0) * BOUND.speedMul));

// Is this pounce a bound? `lastSpeed` is her speed the frame BEFORE the press (the press itself sets the player's velocity to a lunge).
export function boundWanted({ lastSpeed, inputHeld, stalking, perched, swimming = false }) {
  return !!inputHeld && !stalking && !perched && !swimming && Number.isFinite(lastSpeed) && lastSpeed >= BOUND.runMin;
}

// startBound({ x, z, dx, dz, speed, T, H }) -> the flight's state. (dx, dz) is the way she runs (any length but 0); T is the pounce window in seconds, H the arc's height in metres.
export function startBound({ x, z, dx, dz, speed, T, H }) {
  const m = Math.hypot(dx, dz) || 1;
  const v = Number.isFinite(speed) && speed > 0 ? speed : BOUND.speedMin;
  return { x, z, x0: x, z0: z, hx: dx / m, hz: dz / m, vx: (dx / m) * v, vz: (dz / m) * v, speed: v, v0: v, T, H, y: 0, y0: 0, ended: false, landed: false, early: false, lip: null };
}

// her height over the ground now (metres); 0 when she is not in the air. Read only by the rings and the board.
export const boundY = (st) => (st && !st.landed ? st.y : 0);

// ---- the rifts ------------------------------------------------------------------------------------------------------------------------------------------------------

// the nearest point of a rift's axis to (x, z), and how far it is
export function axisPoint(f, x, z) {
  const dx = f.x1 - f.x0;
  const dz = f.z1 - f.z0;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - f.x0) * dx + (z - f.z0) * dz) / l2));
  const ax = f.x0 + dx * t;
  const az = f.z0 + dz * t;
  return { ax, az, d: Math.hypot(x - ax, z - az) };
}

// the rift whose lip (half width plus RIFT_LIP) covers (x, z), with where its axis is nearest; null when the spot is clear of every rift
export function riftAt(x, z, rifts, lip = RIFT_LIP) {
  let best = null;
  for (const f of rifts) {
    const a = axisPoint(f, x, z);
    if (a.d < f.w / 2 + lip && (!best || a.d - f.w / 2 < best.d - best.f.w / 2)) best = { f, ...a };
  }
  return best;
}

// the spot on the lip, beside the rift's axis point, in the direction of (x, z) (or of the way she was going if she is on the axis itself): the last resort of a landing
function lipSpot(hit, x, z, fx, fz, lip) {
  let nx = x - hit.ax;
  let nz = z - hit.az;
  let l = Math.hypot(nx, nz);
  if (l < 1e-6) { nx = fx; nz = fz; l = Math.hypot(nx, nz) || 1; }
  const out = hit.f.w / 2 + lip + 0.05;
  return { x: hit.ax + (nx / l) * out, z: hit.az + (nz / l) * out };
}

// where along her line (metres from here) a landing inside a lip is to be carried or held: null when the landing is clear of every rift
const SAMPLE = 0.1;
function pullTarget(st, rem, rifts) {
  const total = st.speed * rem;
  const ux = st.hx;
  const uz = st.hz;
  const inside = (s) => riftAt(st.x + ux * s, st.z + uz * s, rifts) !== null;
  if (!inside(total)) return null;
  let sIn = 0;
  while (sIn < total && !inside(sIn)) sIn += SAMPLE; // where the line first enters a lip (0: she is over one already)
  let sOut = total;
  while (inside(sOut) && sOut < total + 14) sOut += SAMPLE; // where it leaves
  // the first decision holds for the rest of the flight (she may creep into the lip as she brakes: that must not turn a short landing into a carried one)
  if (!st.lip) st.lip = sIn <= 0 || sOut - total <= BOUND.stretch ? 'far' : 'near';
  return st.lip === 'far' ? sOut + 0.05 : Math.max(0, sIn - SAMPLE);
}

// Is (x, z) inside a collider's margin? The rifts' own colliders (flagged `rift`) are the ones she flies over: they never count.
export function blocked(colliders, x, z) {
  for (const c of colliders ?? []) if (!c.rift && Math.hypot(x - c.x, z - c.z) < c.r + BOUND.radius - 1e-6) return true;
  return false;
}

// ---- one frame -------------------------------------------------------------------------------------------------------------------------------------------------------

// stepBound(st, dt, aim, world, left) -> st (mutated). `aim` is the stick's way in the world ({ x, z }) or null; `left` is the pounce window left AFTER this frame
// (0 on the landing frame); `world` is { bounds, colliders (circles; the ones flagged `rift` are flown over), rifts, canStep(ax, az, bx, bz) }.
// Every frame leaves her outside every collider's margin, inside the bounds, and (on the landing frame) outside every rift's lip.
export function stepBound(st, dt, aim, world, left) {
  if (st.landed) return st;
  const { T, H } = st;
  const rem = Math.max(0, left);
  if (st.ended) {
    // coming down gently where she stopped: `left` is the early end's own window (BOUND.ease)
    const s = Math.min(1, Math.max(0, 1 - rem / BOUND.ease));
    st.y = st.y0 * (1 - s) * (1 - s);
    if (rem <= 0) { st.y = 0; st.landed = true; }
    return st;
  }
  const d = Math.max(0, dt);
  // 1. steer: the stick bends the heading at 60 percent of the ground's rate; the speed holds
  if (aim && (aim.x || aim.z)) {
    const m = Math.hypot(aim.x, aim.z);
    const k = BOUND.steer * (1 - Math.pow(0.001, d));
    st.hx += (aim.x / m - st.hx) * k;
    st.hz += (aim.z / m - st.hz) * k;
    const hl = Math.hypot(st.hx, st.hz) || 1;
    st.hx /= hl;
    st.hz /= hl;
  }
  // 2. the rifts: a landing inside a lip bends her SPEED (not her heading) so that she lands on a lip: the far one if it is within reach, else the near one
  if (world.rifts?.length) {
    const target = pullTarget(st, rem, world.rifts);
    if (target !== null) {
      const need = target / Math.max(rem, d, 1e-3);
      const bl = 1 - Math.exp(-BOUND.pullRate * d);
      st.speed = Math.max(0, Math.min(st.v0 * BOUND.pullMax, st.speed + (need - st.speed) * bl));
    }
  }
  st.vx = st.hx * st.speed;
  st.vz = st.hz * st.speed;
  // 3. carry her in steps of at most 0.2 m: the bounds slide her, a collider or a wall of the ground ends the bound
  const b = world.bounds;
  const dist = Math.hypot(st.vx, st.vz) * d;
  const n = Math.max(1, Math.ceil(dist / BOUND.step));
  const h = d / n;
  for (let i = 0; i < n && !st.ended; i++) {
    let nx = st.x + st.vx * h;
    let nz = st.z + st.vz * h;
    if (b) { nx = Math.min(b.maxX, Math.max(b.minX, nx)); nz = Math.min(b.maxZ, Math.max(b.minZ, nz)); }
    let stop = world.canStep ? !world.canStep(st.x, st.z, nx, nz) : false;
    if (!stop && blocked(world.colliders, nx, nz)) stop = true;
    if (stop) { st.ended = true; st.early = true; break; }
    st.x = nx;
    st.z = nz;
  }
  // 4. her height on the same parabola the player draws (4 H u (1 - u))
  const u = T > 0 ? Math.min(1, Math.max(0, 1 - rem / T)) : 1;
  st.y = H * 4 * u * (1 - u);
  if (st.ended) { st.y0 = st.y; return st; } // the live sets the window to BOUND.ease; she comes down from here
  if (rem <= 0) {
    // the landing frame: never inside a rift's lip (a last bend if the pull left her short of it)
    const hit = world.rifts?.length ? riftAt(st.x, st.z, world.rifts) : null;
    if (hit) {
      const q = lipSpot(hit, st.x, st.z, st.vx, st.vz, RIFT_LIP);
      if (!(world.canStep && !world.canStep(st.x, st.z, q.x, q.z)) && !blocked(world.colliders, q.x, q.z)) { st.x = q.x; st.z = q.z; }
    }
    st.y = 0;
    st.landed = true;
  }
  return st;
}

// ---- the landing on a perch: the walk's own rule -------------------------------------------------------------------------------------------------------------------

// landingPerch(perches, from, to, budget, ground) -> the perch she lands ON, or null (the ground). A perch whose top she is over (within its radius `r`, or 1.0 m where it has none, of
// where she lands) and that canReach() lets her take FROM WHERE SHE TOOK OFF, at the ground's height, on the Moon's budget. Never a perch beyond the budget.
export function landingPerch(perches, from, to, budget, ground = null) {
  let best = null;
  const g0 = ground?.y ? ground.y(from.x, from.z) : 0;
  for (const p of perches ?? []) {
    if (Math.hypot(p.x - to.x, p.z - to.z) > (p.r ?? 1.0) + BOUND.radius) continue;
    const dy = ground?.y ? ground.y(p.x, p.z) - g0 : 0;
    if (!canReach(p, from, 0, budget, dy)) continue;
    if (!best || p.y > best.y) best = p;
  }
  return best;
}

// ---- the ring gates ---------------------------------------------------------------------------------------------------------------------------------------------------

// Did the step (ax, az, ay) -> (bx, bz, by) (heights WORLD metres) fly through the hoop? The hoop stands in the north-south plane at (g.x, g.z), centre world height `cy`, radius g.r:
// the step must cross x = g.x, and at the crossing she must be within g.r of the centre (sideways and up).
export function throughRing(g, cy, ax, az, ay, bx, bz, by) {
  const s0 = ax - g.x;
  const s1 = bx - g.x;
  if (s0 === s1 || (s0 > 0 && s1 > 0) || (s0 < 0 && s1 < 0)) return false;
  const t = s0 / (s0 - s1);
  const z = az + (bz - az) * t;
  const y = ay + (by - ay) * t;
  return Math.hypot(z - g.z, y - cy) <= g.r;
}
