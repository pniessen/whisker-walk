import { rivalFor, patrolPath, borderMarks, isTrespassing } from './rivalclans.js';
import { buildCat, catDims } from './cat/model.js';
import { animateCat } from './cat/animator.js';
import { setCatScars } from './cat/scarmesh.js';
import { strayBreed } from './straynames.js';
import { makeNameTag, NAME_TAG_RANGE, uprightTag } from './nametag.js';
import { RANK_SCALE, tagSubFor } from './clancast.js';

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
// The border patrol fight (2026-11-04): the fight's one visit id, how fast it
// catches up with its clock after standing (intruders.js CATCH_UP_SPEED), and
// how long a co-walker's hold lasts with no word back (intruders.js HOLD_MAX).
export const BORDER_VISIT = 'patrol';
export const CATCH_UP_SPEED = 2.5;
export const HOLD_MAX = 40;

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
//
// Gorge part 1 (R9): with a `ground` (src/ground.js) and the cat's `from`
// spot, a landing is also rejected unless the scamper's straight line from
// `from` to it is a legal walk (ground.canStep), so a chase never carries her
// over a rim. No ground (null) is flat ground. This module deliberately
// imports nothing new (the import allowlist below), so it takes the ground
// object as given rather than importing FLAT_GROUND.
export function findLanding(areaId, to, isWalkable, { ground = null, from = null } = {}) {
  const rival = rivalFor(areaId);
  if (!rival || !isPt(to) || typeof isWalkable !== 'function') return null;
  const { cx, cz, r } = rival;
  let dx = to.x - cx;
  let dz = to.z - cz;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
  const ok = (x, z) => !isTrespassing(areaId, x, z) && isWalkable(x, z) === true
    && (!ground || ground.flat || !isPt(from) || ground.canStep(from.x, from.z, x, z));

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
const NO_PATROL = { update() {}, dispose() {}, get state() { return 'none'; }, get pos() { return null; }, foe: null, chaseNow() {}, lag: 0 };

// chaseAllowed(player, session) -> bool: the walk's canChase. No chase while
// the cat is perched (perchY above the ground) or while photo mode is open, so
// a child framing a photo of the rival cat is never scampered out mid-shot.
// Nor while another chase already owns the cat (session.chasing — v21 3b Task
// 16's yard dog shares this gate), so the rival and the dog never both write
// the cat's position: whichever started first finishes, and the other waits.
// Nor while my cat is in a clan fight (Clan Life Part 2): nothing moves a
// fighting cat but the fight.
export const chaseAllowed = (player, session) => player.perchY === 0 && !session.cameraMode && session.chasing !== true
  && session.fight == null;

// createRivalPatrol(scene, areaId, opts) -> { update(dt, catPos, avatar?), dispose(), state, pos }
//
// opts:
//   reducedMotion  no dash, a short move.
//   now()          wall-clock seconds; default Date.now() / 1000.
//   isWalkable     (x, z) => bool, the walk's own collision check.
//   canChase()     false while the cat is perched or in photo mode (chaseAllowed).
//   onChase(who)   fires exactly once per chase, with the rival's display name.
//   onSettled()    fires when the scamper ends.
//   picks          the kids' clan picks; the rival's clan (and name) follow them.
//   ground         the walk's ground (src/ground.js); null is flat ground.
//
// update mutates catPos (the LOCAL player's cat position) only during a
// scamper, and, if an `avatar` (the cat's group) is passed, sets its facing
// here and nowhere else: along the travel direction while it runs, then toward
// the disc centre on arrival (the same rotation.y convention player.update
// uses). The gait is avatar.js's (it reads session.chasing). A partner's remote cat is never passed here,
// so it is never moved by this device. The patrol mesh's position is a pure
// function of the shared clock plus a local dash, so nothing goes over the
// network. The per-frame path allocates nothing: positions are written into
// scratch objects, and chaseOutcome (which allocates its result) is only
// called on the frame a chase actually starts.
//
// THE BORDER PATROL FIGHT (2026-11-04). With a `foe` ({ member, scars,
// showNames }: a warrior of the territory's clan, clancast.borderWarriorFor)
// the patrol is that warrior, built as an intruder is (its coat, its scars,
// warrior scale, a cross name tag), and it can be fought. The chase trigger is
// today's; before it chases, it asks `intercept()` (walk.js: would the fight
// show its pill, or is it showing?). If so it squares up instead: it stops
// where it is and stares, in 'cross', while the pill is up. `chaseNow()` (Run,
// a lost fight, or no answer) runs today's chase on the next update, from
// where it stands. `foe` on the returned object is the fight's `intruders`
// interface (game/clanfight.js): current, hold, release, stage, measure,
// setScars, flee (it stands down: no pill, no chase for the rest of this
// walk), isFled, holders, dropHolder. While it squares up or is held it falls
// behind its clock (`lag`); then it glides back onto its ring and catches up
// at CATCH_UP_SPEED, so a co-walker's screen agrees again. Without a foe lag
// is always 0 and this is exactly today's patrol.
//
// Still nothing here stores anything: the scars come in as a list, the name
// tag and the cast are leaves.
export function createRivalPatrol(scene, areaId, {
  reducedMotion = false,
  now = () => Date.now() / 1000,
  isWalkable = () => true,
  canChase = () => true,
  onChase = () => {},
  onSettled = () => {},
  picks = [],
  ground = null,
  foe: foeIn = null,
  intercept = () => false,
} = {}) {
  const rival = rivalFor(areaId, picks);
  if (!rival) return NO_PATROL;
  const { cx, cz } = rival;
  // A foe only on a territory's camp (never the old areas' clanless rival).
  const member = rival.clan && foeIn?.member?.clan === rival.clan ? foeIn.member : null;

  // The stray model, as straycats.js builds it ({ simple: true }), at normal
  // size; a foe as an intruder is built (intruders.js), at its rank's scale.
  const mesh = member
    ? buildCat(member.breed, undefined, { simple: true, style: member.style, scars: Array.isArray(foeIn.scars) ? foeIn.scars : [] })
    : buildCat(strayBreed(rival.name), undefined, { simple: true });
  let tag = null;
  if (member) {
    const k = RANK_SCALE[member.rank] ?? 0.85;
    mesh.scale.multiplyScalar(k);
    mesh.userData.borderFoe = true;
    if (foeIn.showNames) {
      tag = makeNameTag(member.name, { cross: true, sub: tagSubFor(member) });
      if (tag) {
        tag.scale.x /= k;
        tag.scale.y /= k;
        mesh.add(tag);
      }
    }
  }
  const who = member ? member.name : rival.name;
  const pp = { x: cx, z: cz }; // patrol position now (scratch)
  const ahead = { x: cx, z: cz }; // half a second on (scratch)
  patrolInto(areaId, now(), pp);
  // Gorge part 1: the patrol cat stands on the ground under it (its route is
  // authored; plan 2/4 check it against the ground). G only when it has height.
  const G = ground && !ground.flat ? ground : null;
  mesh.position.set(pp.x, G ? G.y(pp.x, pp.z) : 0, pp.z);
  scene.add(mesh);

  let state = 'patrol'; // 'patrol' | 'scamper' | 'return' | (a foe) 'standoff' | 'held'
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
  // The border patrol fight (a foe only; all stay at rest without one).
  let lag = 0;             // s behind its clock (squaring up, held)
  let passed = false;      // it let me pass: no pill, no chase, this walk
  let pendingChase = false; // chaseNow(): today's chase on the next update
  const holders = new Map(); // holderId -> { since, local }
  let face = null;         // who a held patrol faces
  let stage = null;        // my fight's staging of it
  let lastCat = null;      // the cat update saw last (its tag's reach)

  // Today's chase from `from` (the patrol's spot), if the cat is inside and
  // a walkable landing exists: the scamper starts and onChase fires once.
  function tryChase(catPos, from) {
    const out = chaseOutcome(areaId, catPos, from);
    const land = out.chased ? findLanding(areaId, out.to, isWalkable, { ground, from: catPos }) : null;
    if (!land) return false;
    state = 'scamper';
    elapsed = 0;
    duration = reducedMotion ? SCAMPER_TIME_REDUCED : SCAMPER_TIME;
    fromX = catPos.x;
    fromZ = catPos.z;
    toX = land.x;
    toZ = land.z;
    onChase(who);
    return true;
  }

  // From standing (squared up or held) back to its ring, level again.
  function startReturn() {
    dashX = mesh.position.x;
    dashZ = mesh.position.z;
    mesh.rotation.x = 0;
    mesh.rotation.z = 0;
    stage = null;
    state = 'return';
    returnT = 0;
  }

  let localHolds = 0;      // how many of `holders` are this device's
  const heldByMe = () => localHolds > 0;
  const setHolder = (id, h) => {
    if (holders.get(id)?.local) localHolds--;
    holders.set(id, h);
    if (h.local) localHolds++;
  };
  const dropOne = (id) => {
    const h = holders.get(id);
    if (!h) return false;
    holders.delete(id);
    if (h.local) localHolds--;
    return true;
  };

  function showTag(catPos) {
    if (!tag) return;
    uprightTag(tag, mesh.rotation.x, mesh.rotation.z, mesh.userData.parts?.body?.position.y ?? 0);
    const range = tag.userData?.revealRange ?? NAME_TAG_RANGE;
    tag.visible = !!catPos && Math.hypot(catPos.x - mesh.position.x, catPos.z - mesh.position.z) < range
      && (!G || G.sameLevel(catPos.x, catPos.z, mesh.position.x, mesh.position.z))
      && !(state === 'held' && heldByMe());
  }

  function update(dt, catPos, avatar) {
    if (disposed || !(dt >= 0) || !catPos) return;
    const t = now();
    lastCat = catPos;
    if (member) {
      // A remote holder that has said nothing for HOLD_MAX lets go; mine never.
      for (const [id, h] of holders) if (!h.local && t - h.since >= HOLD_MAX) dropOne(id);
      if (state === 'held' && holders.size === 0) startReturn();
      if (state === 'standoff' || state === 'held') lag += dt;
      else if (state === 'patrol' && lag > 0) lag = Math.max(0, lag - dt * (CATCH_UP_SPEED / PATROL_SPEED - 1));
    }
    if (!patrolInto(areaId, t - lag, pp)) return;
    cooldown = Math.max(0, cooldown - dt);

    // A loss while a co-walker still holds it waits until she lets go.
    if (pendingChase && state !== 'held' && state !== 'scamper') {
      pendingChase = false;
      if ((state === 'patrol' || state === 'return' || state === 'standoff') && canChase() !== false
        && tryChase(catPos, mesh.position)) {
        mesh.rotation.x = 0;
        mesh.rotation.z = 0;
        stage = null;
      }
    }

    if (state === 'standoff') {
      if (intercept() !== true) startReturn();
      else {
        // Squared up: stands where it stopped, facing the trespasser.
        const dx = catPos.x - mesh.position.x;
        const dz = catPos.z - mesh.position.z;
        if (Math.hypot(dx, dz) > 1e-3) mesh.rotation.y = facing(dx, dz);
        animateCat(mesh, 'cross', t, 0, reducedMotion);
        showTag(catPos);
        return;
      }
    }

    if (state === 'held') {
      const st = heldByMe() ? stage : null;
      mesh.rotation.order = 'YXZ';
      if (st) {
        mesh.position.set(st.x, G ? G.y(st.x, st.z) + st.y : st.y, st.z);
        mesh.rotation.x = st.pitch;
        mesh.rotation.z = st.roll;
      } else {
        if (G) mesh.position.y = G.y(mesh.position.x, mesh.position.z);
        mesh.rotation.x = 0;
        mesh.rotation.z = 0;
      }
      if (face) {
        const dx = face.x - mesh.position.x;
        const dz = face.z - mesh.position.z;
        if (Math.hypot(dx, dz) > 1e-3) mesh.rotation.y = facing(dx, dz);
      }
      animateCat(mesh, st ? st.pose : 'cross', t, 0, reducedMotion);
      showTag(catPos);
      return;
    }

    if (state === 'patrol' || state === 'return') {
      patrolInto(areaId, t - lag + 0.5, ahead);
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
      if (G) mesh.position.y = G.y(mesh.position.x, mesh.position.z);
      mesh.rotation.y = facing(ahead.x - pp.x, ahead.z - pp.z);
      animateCat(mesh, 'follow', t, lag > 0 && state === 'patrol' ? CATCH_UP_SPEED : PATROL_SPEED, reducedMotion);

      if (state === 'patrol' && cooldown <= 0 && canChase() !== false
        && isTrespassing(areaId, catPos.x, catPos.z)
        && Math.hypot(catPos.x - pp.x, catPos.z - pp.z) <= NOTICE_DIST
        && (!G || G.sameLevel(catPos.x, catPos.z, pp.x, pp.z))) { // R10: not across a rim
        if (passed) {
          // It let me pass this walk: it walks on.
        } else if (member && intercept() === true) {
          state = 'standoff'; // the fight's pill is up (or opens this frame)
          if (G) mesh.position.y = G.y(mesh.position.x, mesh.position.z);
        } else {
          tryChase(catPos, pp);
        }
      }
      showTag(catPos);
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
    catPos.y = (ground ? ground.y(catPos.x, catPos.z) : 0) + (reducedMotion ? 0 : Math.sin(u * Math.PI) * 0.18);
    if (avatar) avatar.rotation.y = facing(toX - fromX, toZ - fromZ);
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
      if (G) mesh.position.y = G.y(mesh.position.x, mesh.position.z);
      animateCat(mesh, 'follow', t, DASH_SPEED, reducedMotion);
    }
    if (u >= 1) {
      catPos.x = toX;
      catPos.z = toZ;
      catPos.y = ground ? ground.y(toX, toZ) : 0;
      if (avatar) avatar.rotation.y = facing(cx - toX, cz - toZ);
      dashX = mesh.position.x;
      dashZ = mesh.position.z;
      state = 'return';
      returnT = 0;
      cooldown = CHASE_COOLDOWN;
      onSettled();
      // A co-walker took hold of it mid-scamper: it stands for her now.
      if (holders.size > 0) state = 'held';
    }
    showTag(catPos);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    tag?.material?.map?.dispose?.();
    scene.remove(mesh);
    const seen = new Set();
    mesh.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      for (const m of [].concat(o.material ?? [])) {
        if (m && !seen.has(m)) { seen.add(m); m.dispose?.(); }
      }
    });
  }

  // pos: where the patrol cat is now (its mesh, so a dash counts too), as a
  // fresh {x, z} — read-only. The walk reads it a few times a second to scent
  // over the player's marks near the border (Task 12); this module does not.
  // The fight's `intruders` interface (game/clanfight.js), for a foe only.
  // Its one visit is BORDER_VISIT. The shared snapshot's pos is where the
  // mesh stands.
  // current() is read every frame (the fight and the patrol's intercept), so
  // it is one snapshot object, rewritten: read it, never keep it.
  const isMine = (v) => v === BORDER_VISIT;
  const snap = member ? { visit: BORDER_VISIT, clan: member.clan, member, pos: { x: 0, z: 0 }, state: 'resting' } : null;
  const foe = member ? {
    current() {
      let st = 'resting';
      if (state === 'held') st = 'held';
      else if (passed) st = 'passed';
      else if ((state === 'patrol' || state === 'standoff') && cooldown <= 0) st = 'walking';
      snap.pos.x = mesh.position.x;
      snap.pos.z = mesh.position.z;
      snap.state = st;
      return snap;
    },
    hold(v, holderId, facePos, { local = false } = {}) {
      if (!isMine(v)) return;
      const mine = heldByMe();
      setHolder(String(holderId), { since: now(), local: local === true });
      if ((local === true || !mine) && facePos && Number.isFinite(facePos.x) && Number.isFinite(facePos.z)) {
        face = { x: facePos.x, z: facePos.z };
      }
      if (state !== 'scamper') state = 'held';
    },
    release(v, holderId) {
      if (!isMine(v)) return;
      dropOne(String(holderId));
      if (!heldByMe()) stage = null;
      if (state === 'held' && holders.size === 0) startReturn();
    },
    dropHolder(holderId) {
      if (!dropOne(String(holderId))) return;
      if (state === 'held' && holders.size === 0) startReturn();
    },
    holders(v) { return isMine(v) ? [...holders.keys()] : []; },
    stage(v, st) {
      if (!isMine(v) || state !== 'held' || !heldByMe()) return;
      if (st === null) { stage = null; return; }
      if (!st || typeof st.pose !== 'string' || !Number.isFinite(st.x) || !Number.isFinite(st.z)) return;
      const fin = (n) => (Number.isFinite(n) ? n : 0);
      const to = stage ??= { pose: 'cross', x: 0, z: 0, y: 0, pitch: 0, roll: 0 };
      to.pose = st.pose; to.x = st.x; to.z = st.z; to.y = fin(st.y); to.pitch = fin(st.pitch); to.roll = fin(st.roll);
      if (st.face && Number.isFinite(st.face.x) && Number.isFinite(st.face.z)) {
        if (face) { face.x = st.face.x; face.z = st.face.z; } else face = { x: st.face.x, z: st.face.z };
      }
    },
    measure(v) {
      if (!isMine(v)) return null;
      const pos = mesh.position.clone();
      const rot = mesh.rotation.clone();
      mesh.position.set(0, 0, 0);
      mesh.rotation.set(0, 0, 0);
      const d = catDims(mesh);
      mesh.position.copy(pos);
      mesh.rotation.copy(rot);
      return d;
    },
    setScars(v, scars) {
      if (isMine(v)) setCatScars(mesh, Array.isArray(scars) ? scars : []);
    },
    // A win: it stands down. Only my own hold goes; a co-walker still facing it keeps hers.
    flee(v) {
      if (!isMine(v)) return;
      passed = true;
      pendingChase = false;
      for (const [id, h] of holders) if (h.local) dropOne(id);
      stage = null;
      if (state === 'held' && holders.size === 0) startReturn();
      showTag(lastCat);
    },
    isFled(v) { return isMine(v) && passed; },
  } : null;

  return {
    update,
    dispose,
    get state() { return state; },
    get pos() { return { x: mesh.position.x, z: mesh.position.z }; },
    // The border patrol fight: the fight's interface (null without a foe) and
    // today's chase on the next update (Run, a lost fight, no answer).
    foe,
    chaseNow() { if (member && !passed) pendingChase = true; },
    get lag() { return lag; },
  };
}
