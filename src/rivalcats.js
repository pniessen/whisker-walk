import { rivalFor, patrolPath, borderMarks, isTrespassing } from './rivalclans.js';
import { buildCat } from './cat/model.js';
import { animateCat } from './cat/animator.js';
import { strayBreed } from './straynames.js';

// A rival cat that patrols its territory's border, and chases a trespasser
// back over it.
//
// THE CROSSING COST IS RECOVERABLE, FUNNY AND NEVER RETROACTIVE (v21 spec
// section 4 as revised, section 10.1). Being chased back over the border is the
// whole of it. This module imports nothing that stores progress, taming,
// colony cats, marks, trades or points, and test/rivalcats.test.js asserts it
// structurally (the same discipline enemies.js documents for its two imports).
// The chase moves the player's cat and says one line. It takes nothing.
//
// Two halves. patrolAt, chaseOutcome and findLanding are pure and free of
// THREE, so both devices in a co-walk compute the same patrol from the same
// clock with nothing on the wire. createRivalPatrol is the THREE half.

// --- design constants (all exported so the tests pin them) -------------------

// Walking pace along the border, m/s: a slow, bored prowl.
export const PATROL_SPEED = 0.75;
// A trespasser is only noticed within this distance of the patrol. Smaller
// than every territory radius, so a cat can sneak in while the patrol is on
// the far side of the disc (stalking is fun, not a trap).
export const NOTICE_DIST = 4.5;
// Where a chased cat is put: this far beyond the border.
export const LANDING_OFFSET = 1.5;
// How far further out along the ray, and how many 15 degree steps round the
// circle, findLanding tries when the first choice is not walkable.
const RAY_STEP = 0.75;
const RAY_TRIES = 6;
const ARC_STEP = Math.PI / 12;
const ARC_TRIES = 12;
// The border-mark fallback is nudged this far outside the disc.
const MARK_NUDGE = 0.25;
// The scamper: the cat runs to its landing spot rather than teleporting.
export const SCAMPER_TIME = 0.65;
export const SCAMPER_TIME_REDUCED = 0.3;
// No new chase for this long after the scamper ends, so toasts never stack.
export const CHASE_COOLDOWN = 8;
// The patrol cat's dash at a trespasser, m/s, and how it drifts back to its
// route afterwards.
const DASH_SPEED = 7;
const DASH_STOP = 1.1;
const RETURN_TIME = 1.5;

// --- pure half ----------------------------------------------------------------

const isPt = (p) => (
  p !== null && typeof p === 'object' && typeof p.x === 'number' && typeof p.z === 'number'
  && Number.isFinite(p.x) && Number.isFinite(p.z)
);

// Cumulative lengths of each area's patrol loop, built once. patrolPath
// returns a fresh array every call, so cache the ring rather than rebuild it
// on the 60Hz path.
const loops = new Map();
function loopFor(areaId) {
  let l = loops.get(areaId);
  if (l) return l;
  const pts = patrolPath(areaId);
  if (pts.length < 2) return null;
  const cum = [0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  l = { pts, cum, length: cum[pts.length] };
  loops.set(areaId, l);
  return l;
}

// Where the patrol is at time t. t is WALL-CLOCK seconds (Date.now() / 1000),
// not the walk's elapsed time: two devices in a co-walk start at different
// moments, and only a shared clock keeps the patrol in the same place for
// both. A pure function of (areaId, t); null for an unknown area or a t that
// is not a finite number.
export function patrolAt(areaId, t) {
  return patrolInto(areaId, t, { x: 0, z: 0 });
}

// patrolAt writing into `out` (no allocation): the per-frame path. Returns
// `out`, or null exactly when patrolAt would.
function patrolInto(areaId, t, out) {
  if (typeof t !== 'number' || !Number.isFinite(t)) return null;
  const l = loopFor(areaId);
  if (!l) return null;
  let s = (t * PATROL_SPEED) % l.length;
  if (s < 0) s += l.length;
  let i = 0;
  while (i < l.pts.length - 1 && l.cum[i + 1] <= s) i++;
  const a = l.pts[i];
  const b = l.pts[(i + 1) % l.pts.length];
  const seg = l.cum[i + 1] - l.cum[i];
  const u = seg > 0 ? (s - l.cum[i]) / seg : 0;
  out.x = a.x + (b.x - a.x) * u;
  out.z = a.z + (b.z - a.z) * u;
  return out;
}

const NO_CHASE = Object.freeze({ chased: false, to: null });

// Would the patrol chase a cat at catPos, given the patrol at patrolPos? Only
// when the cat is inside the border AND within NOTICE_DIST of the patrol.
// `to` is the point on the ray from the disc centre through the cat, at
// r + LANDING_OFFSET. Never throws; bad input is "no chase".
export function chaseOutcome(areaId, catPos, patrolPos) {
  const rival = rivalFor(areaId);
  if (!rival || !isPt(catPos) || !isPt(patrolPos)) return NO_CHASE;
  if (!isTrespassing(areaId, catPos.x, catPos.z)) return NO_CHASE;
  if (Math.hypot(catPos.x - patrolPos.x, catPos.z - patrolPos.z) > NOTICE_DIST) return NO_CHASE;
  let dx = catPos.x - rival.cx;
  let dz = catPos.z - rival.cz;
  let d = Math.hypot(dx, dz);
  if (d < 1e-6) {
    // Dead centre: run away from the patrol instead.
    dx = rival.cx - patrolPos.x;
    dz = rival.cz - patrolPos.z;
    d = Math.hypot(dx, dz);
    if (d < 1e-6) { dx = 1; dz = 0; d = 1; }
  }
  const reach = rival.r + LANDING_OFFSET;
  return { chased: true, to: { x: rival.cx + (dx / d) * reach, z: rival.cz + (dz / d) * reach } };
}

// A landing spot that is actually walkable. `to` comes from pure geometry, so
// it can be in water or inside a building; the caller's isWalkable(x, z) is
// the walk's real check. Tries `to`, then further along the same ray, then
// points rotated round the circle, then the nearest walkable border mark
// nudged just outside. Returns null if nothing works: a null landing means no
// chase, never a cat left inside the disc.
export function findLanding(areaId, to, isWalkable) {
  const rival = rivalFor(areaId);
  if (!rival || !isPt(to) || typeof isWalkable !== 'function') return null;
  const { cx, cz, r } = rival;
  let dx = to.x - cx;
  let dz = to.z - cz;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
  const ok = (x, z) => !isTrespassing(areaId, x, z) && isWalkable(x, z) === true;

  if (ok(to.x, to.z)) return { x: to.x, z: to.z };
  const base = Math.atan2(dz, dx);
  const reach = r + LANDING_OFFSET;
  for (let k = 1; k <= RAY_TRIES; k++) {
    const rr = reach + k * RAY_STEP;
    const x = cx + dx * rr;
    const z = cz + dz * rr;
    if (ok(x, z)) return { x, z };
  }
  for (let k = 1; k <= ARC_TRIES; k++) {
    for (const sign of [1, -1]) {
      const a = base + sign * k * ARC_STEP;
      const x = cx + Math.cos(a) * reach;
      const z = cz + Math.sin(a) * reach;
      if (ok(x, z)) return { x, z };
    }
  }
  const marks = borderMarks(areaId).sort(
    (m, n) => Math.hypot(m.x - to.x, m.z - to.z) - Math.hypot(n.x - to.x, n.z - to.z),
  );
  for (const m of marks) {
    const mx = m.x - cx;
    const mz = m.z - cz;
    const md = Math.hypot(mx, mz) || 1;
    const x = cx + (mx / md) * (r + MARK_NUDGE);
    const z = cz + (mz / md) * (r + MARK_NUDGE);
    if (ok(x, z)) return { x, z };
  }
  return null;
}

// --- THREE half -------------------------------------------------------------

const smooth = (u) => u * u * (3 - 2 * u);
// rotation.y that makes a cat face direction (dx, dz): the same formula
// player.js uses for the player's cat.
const facing = (dx, dz) => Math.atan2(dx, dz) + Math.PI;
const NO_PATROL = { update() {}, dispose() {}, get state() { return 'none'; } };

// createRivalPatrol(scene, areaId, opts) -> { update(dt, catPos), dispose(), state }
//
// opts:
//   reducedMotion  no dash, a short move.
//   now()          wall-clock seconds; default Date.now() / 1000.
//   isWalkable     (x, z) => bool, the walk's own collision check.
//   canChase()     false while the cat is perched, say.
//   onChase(who)   fires exactly once per chase, with the rival's display name.
//   onSettled()    fires when the scamper ends.
//
// update mutates catPos (the LOCAL player's cat position) only during a
// scamper. The caller sets the cat's facing and gait (avatar.js reads
// session.chasing for the gait). A partner's remote cat is never passed here,
// so it is never moved by this device. The patrol mesh's position is a pure
// function of the shared clock plus a local dash, so nothing goes over the
// network. The per-frame path allocates nothing: positions are written into
// scratch objects, and chaseOutcome (which allocates its result) is only
// called on the frame a chase actually starts.
export function createRivalPatrol(scene, areaId, {
  reducedMotion = false,
  now = () => Date.now() / 1000,
  isWalkable = () => true,
  canChase = () => true,
  onChase = () => {},
  onSettled = () => {},
} = {}) {
  const rival = rivalFor(areaId);
  if (!rival) return NO_PATROL;
  const { cx, cz } = rival;

  // The stray model, as straycats.js builds it ({ simple: true }), at normal size.
  const mesh = buildCat(strayBreed(rival.name), undefined, { simple: true });
  const pp = { x: cx, z: cz }; // patrol position now (scratch)
  const ahead = { x: cx, z: cz }; // half a second on (scratch)
  patrolInto(areaId, now(), pp);
  mesh.position.set(pp.x, 0, pp.z);
  scene.add(mesh);

  let state = 'patrol'; // 'patrol' | 'scamper' | 'return'
  let cooldown = 0;
  let elapsed = 0;
  let duration = SCAMPER_TIME;
  let fromX = 0;
  let fromZ = 0;
  let toX = 0;
  let toZ = 0;
  let returnT = 0;
  let disposed = false;
  let dashX = 0;
  let dashZ = 0;

  function update(dt, catPos) {
    if (disposed || !(dt >= 0) || !catPos) return;
    const t = now();
    if (!patrolInto(areaId, t, pp)) return;
    cooldown = Math.max(0, cooldown - dt);

    if (state === 'patrol' || state === 'return') {
      patrolInto(areaId, t + 0.5, ahead);
      if (state === 'patrol') {
        mesh.position.x = pp.x;
        mesh.position.z = pp.z;
      } else {
        returnT += dt;
        const w = smooth(Math.min(1, returnT / RETURN_TIME));
        mesh.position.x = dashX + (pp.x - dashX) * w;
        mesh.position.z = dashZ + (pp.z - dashZ) * w;
        if (w >= 1) state = 'patrol';
      }
      mesh.rotation.y = facing(ahead.x - pp.x, ahead.z - pp.z);
      animateCat(mesh, 'follow', t, PATROL_SPEED, reducedMotion);

      if (state === 'patrol' && cooldown <= 0 && canChase() !== false
        && isTrespassing(areaId, catPos.x, catPos.z)
        && Math.hypot(catPos.x - pp.x, catPos.z - pp.z) <= NOTICE_DIST) {
        const out = chaseOutcome(areaId, catPos, pp);
        const land = out.chased ? findLanding(areaId, out.to, isWalkable) : null;
        if (land) {
          state = 'scamper';
          elapsed = 0;
          duration = reducedMotion ? SCAMPER_TIME_REDUCED : SCAMPER_TIME;
          fromX = catPos.x;
          fromZ = catPos.z;
          toX = land.x;
          toZ = land.z;
          onChase(rival.name);
        }
      }
      return;
    }

    // 'scamper'
    elapsed += dt;
    const u = Math.min(1, elapsed / duration);
    const e = smooth(u);
    catPos.x = fromX + (toX - fromX) * e;
    catPos.z = fromZ + (toZ - fromZ) * e;
    // Chases are gated on a grounded cat, so the rest height is the ground: a
    // pounce's render lift is never carried along. A small hop on top, none
    // in reduced motion, and it ends on the ground.
    catPos.y = reducedMotion ? 0 : Math.sin(u * Math.PI) * 0.18;
    // The patrol cat turns to the trespasser and (unless reduced motion)
    // dashes after it, stopping short; it never reaches it.
    const dx = catPos.x - mesh.position.x;
    const dz = catPos.z - mesh.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 1e-3) mesh.rotation.y = facing(dx, dz);
    if (!reducedMotion && dist > DASH_STOP) {
      const step = Math.min(DASH_SPEED * dt, dist - DASH_STOP);
      mesh.position.x += (dx / dist) * step;
      mesh.position.z += (dz / dist) * step;
      animateCat(mesh, 'follow', t, DASH_SPEED, reducedMotion);
    }
    if (u >= 1) {
      catPos.x = toX;
      catPos.z = toZ;
      catPos.y = 0;
      dashX = mesh.position.x;
      dashZ = mesh.position.z;
      state = 'return';
      returnT = 0;
      cooldown = CHASE_COOLDOWN;
      onSettled();
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.remove(mesh);
    const seen = new Set();
    mesh.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      for (const m of [].concat(o.material ?? [])) {
        if (m && !seen.has(m)) { seen.add(m); m.dispose?.(); }
      }
    });
  }

  return { update, dispose, get state() { return state; } };
}
