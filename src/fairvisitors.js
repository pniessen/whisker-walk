// =============================================================================
// The Fairground's visitors, as numbers (design:
// docs/superpowers/specs/2026-11-18-fairground-design.md, "People").
//
// A handful of people strolling the midway and the plaza (the area's
// `visitorLoop`), now and then stepping off to one of the `visitorWatch` spots
// to watch a ride, then strolling on. No THREE, no DOM: src/fairshow.js draws
// them with the villager's figure (src/critters.js).
//
// THE RULES (the design's anti-goals; test/fairgames.test.js holds each):
//   * A visitor is never where the cat is. Its middle is always at least KEEP
//     from hers: it stops for a cat crossing its way, walks round a cat who is
//     sitting in it, and steps aside for a cat who runs at it. It never pushes
//     her (it has no collider), never shoos her, and never follows her.
//   * It only ever stands on free ground: inside the bounds, clear of every
//     collider, out of the water, and out of everything a ride sweeps over.
//   * It is not an animal: it is not in src/critters.js, so nothing can stalk
//     it, pounce on it or spot it, and it pays nothing.
//   * A meow near one gets a hello: a wave, or a crouch down to her height.
//
// PAIRS (docs/superpowers/specs/2026-11-20-lifelike-people-design.md,
// "Pairs"): a visitor whose `look` spot is a child spot (src/people/look.js
// spotKind, computed here by the same hash) is a grown-up with a child, still
// one visitor: the grown-up walks as any visitor does (the same way, the same
// seeded dice). The child keeps
// every rule above on its own: free ground by its own radius, never in a
// ride, never within KEEP of the cat (KEEP is to the nearer of the two). Side
// by side the pair is PAIR.R wide round its middle, so the child walks beside
// only where that is clear and the way PAIR.CLEAR wide, a step behind where
// it is not; with a cat near, on the grown-up's far side from her. It moves
// smoothly: never further in a step than the grown-up did and PAIR.CATCH
// (out of a near cat's way, as fast as she comes). Where it stands comes from
// the grown-up's spot and the ground, never a roll.
//
// PER DEVICE and seeded, like the Farm's animals: nothing here is sent to a
// co-walker, and the same seed gives the same strollers.
// =============================================================================
import { mulberry32, seedFromCode } from './rng.js';
import { clearance, inRect, segClear } from './farmsim.js';

export const VISITOR = Object.freeze({
  MAX: 8,             // on the high tier (visitorCount below)
  R: 0.32,            // a person's own radius
  KEEP: 1.0,          // never nearer the cat than this, middle to middle
  NEAR: 1.15,         // with the cat this near, it never takes a step towards her
  WALK: 1.05,         // metres a second, a stroll (each has a pace of its own round this)
  GAP: 1.6,           // strollers keep this far apart along the loop
  LOOK_AHEAD: 2.0,    // metres of its own way it watches for the cat
  GIVE_WAY: 1.7,      // it stops for a moving cat this near its way
  ROUND: 1.5,         // how far to one side it will step to walk round her
  SIDE_SPEED: 1.6,    // metres a second: stepping to the side and back
  CAT_HIGH: 1.3,      // a cat this high up (a counter, a horse) is not in anyone's way
  WATCH_MIN: 6, WATCH_MAX: 14,   // seconds at a watch spot
  STROLL_MIN: 35, STROLL_MAX: 110, // metres strolled between two watches
  HELLO_R: 5,         // a meow this near gets a hello
  HELLO_TIME: 2.4,    // seconds it lasts
  MARGIN: 0.12,       // clear of every collider by its radius and this
});

export const PAIR = Object.freeze({
  R: 0.65,            // a pair's own radius, side by side, round its middle
  CHILD_R: 0.18,      // the child's own radius
  BESIDE: 0.65,       // metres to the grown-up's side, middle to middle
  BEHIND: 0.6,        // a step behind, where beside is not clear
  CLEAR: 1.6,         // beside only where the way is this wide: clear this far across the pair's middle
  CATCH: 1.6,         // metres a second the child may move beyond its grown-up's own step
  FAR: 1.5,           // never further from its grown-up than this
  APART: 0.45,        // nor nearer, middle to middle: it goes round its grown-up, never through
  HURRY: 6,           // metres a second at most it hurries out of a cat's way (never faster than she comes)
  SHELTER: 2.2,       // a cat this near the grown-up: the child stands on its far side from her
  LEAD: 0.6,          // up to this much further than KEEP from a cat on the move, where it means to stand
});

// Whether a look spot holds a child: src/people/look.js spotKind, the same
// hash and the same cut. Here rather than imported, so that the bundler does
// not split the people's look out into a chunk of its own that every place
// pack then fetches (test/fairgames.test.js holds the two equal).
function isChildSpot(x, z) {
  let h = Math.imul(Math.round(x * 100) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(z * 100) | 0, 0x165667b1) ^ Math.imul(20 + 1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296 < 0.18;
}

// How many visitors a quality tier has (src/render/quality.js `strays`: 22 on
// HIGH, 14, 8, fewer on the lite rungs): 8, 5, 3, and never fewer than 2.
export function visitorCount(strays) {
  const n = Number.isFinite(strays) ? strays : 22;
  return Math.max(2, Math.min(VISITOR.MAX, Math.round((n * VISITOR.MAX) / 22)));
}

const TAU = Math.PI * 2;
// side by side only where the pair's middle is clear by its radius and MARGIN, and the way PAIR.CLEAR wide
const BESIDE_CLEAR = Math.max(PAIR.CLEAR / 2, PAIR.R + VISITOR.MARGIN);
// where along a grown-up's back line its child may stand, metres behind, the step behind first
const BACK_LINE = Object.freeze([PAIR.BEHIND, 0.7, 0.5, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4]);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const turn = (yaw, want, maxStep) => {
  const d = wrap(want - yaw);
  return Math.abs(d) <= maxStep ? want : yaw + Math.sign(d) * maxStep;
};

// A closed loop of points, by distance along it.
function closedLine(points) {
  const n = points.length;
  const cum = [0];
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    cum.push(cum[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const length = cum[n];
  return {
    length,
    cum,
    // at(s, out) → out { x, z, hx, hz }: the point s metres along, and the way the line runs there
    at(s, out) {
      let t = s % length;
      if (t < 0) t += length;
      let i = 0;
      while (i < n - 1 && cum[i + 1] <= t) i++;
      const a = points[i];
      const b = points[(i + 1) % n];
      const seg = cum[i + 1] - cum[i] || 1;
      const k = (t - cum[i]) / seg;
      out.x = a.x + (b.x - a.x) * k;
      out.z = a.z + (b.z - a.z) * k;
      out.hx = (b.x - a.x) / seg;
      out.hz = (b.z - a.z) / seg;
      return out;
    },
  };
}

// createFairVisitors(area, opts) → the visitors of one walk.
//   opts.count    how many (visitorCount(tier.strays))
//   opts.seed     their own dice
//   opts.swept    (x, z) => true where a ride sweeps (src/fairsim.js `swept`)
// step(dt, cat): cat { x, z, y, speed }.
// meow(pos) → how many said hello.
export function createFairVisitors(area, { count = VISITOR.MAX, seed = 'fair-visitors', swept = () => false } = {}) {
  const rng = mulberry32(seedFromCode(String(seed)));
  const A = area.anchors;
  const colliders = area.colliders ?? [];
  const bounds = area.bounds;
  const waters = area.waters ?? [];
  const loop = closedLine(A.visitorLoop);
  const wet = (x, z, m) => waters.some((w) => w.kind === 'circle' && Math.hypot(x - w.x, z - w.z) < w.r + m);
  // Whether someone of radius r may stand at (x, z).
  const freeFor = (x, z, r) => inRect(bounds, x, z, 0.5) && clearance(colliders, x, z) >= r + VISITOR.MARGIN && !wet(x, z, r + 0.2) && !swept(x, z);
  // Whether a visitor may stand at (x, z).
  const free = (x, z) => freeFor(x, z, VISITOR.R);
  const events = [];
  const P = { x: 0, z: 0, hx: 0, hz: 1 };
  const Q = { x: 0, z: 0, hx: 0, hz: 1 };

  // What each watch spot looks at: the nearest of the things worth watching.
  const sights = [A.merryGoRound, A.wheel, A.teacups, A.helterSkelter, A.coasterPlatform, A.duckPool, A.bandstand].filter(Boolean);
  // Each watch spot's way off the loop: the nearest place on the loop from
  // which a straight walk to the spot is clear all the way.
  const spots = (A.visitorWatch ?? []).map((spot, id) => {
    let best = null;
    for (let s = 0; s < loop.length; s += 0.5) {
      loop.at(s, P);
      const d = Math.hypot(P.x - spot.x, P.z - spot.z);
      if (best && d >= best.d) continue;
      if (!segClear(colliders, P.x, P.z, spot.x, spot.z, VISITOR.R + VISITOR.MARGIN)) continue;
      let ok = true;
      for (let k = 0; k <= 1 && ok; k += 0.05) ok = free(P.x + (spot.x - P.x) * k, P.z + (spot.z - P.z) * k);
      if (ok) best = { s, d, x: P.x, z: P.z };
    }
    let look = sights[0];
    for (const g of sights) if (Math.hypot(g.x - spot.x, g.z - spot.z) < Math.hypot(look.x - spot.x, look.z - spot.z)) look = g;
    return { id, x: spot.x, z: spot.z, exit: best, look, taken: false };
  }).filter((s) => s.exit && free(s.x, s.z));

  const n = Math.max(0, Math.min(VISITOR.MAX, Math.floor(count)));
  const list = Array.from({ length: n }, (_, i) => {
    const s = ((i + 0.15 + rng() * 0.5) / n) * loop.length;
    loop.at(s, P);
    const look = { x: 100 + i * 7.3, z: 200 + i * 3.1 }; // what the figure is dressed from (critters.js twolegLook)
    const pair = isChildSpot(look.x, look.z);
    return {
      id: `fair-visitor-${i + 1}`,
      index: i,
      look,
      pair,              // a grown-up with a child (the child is drawn beside it)
      // the child's spot and facing (null for one alone), moved in place each step
      childX: pair ? P.x : null, childZ: pair ? P.z : null, childYaw: pair ? Math.atan2(P.hx, P.hz) : null,
      childSide: pair ? (i % 2 ? -1 : 1) : null, // 1: on the grown-up's right
      childAt: pair ? 'beside' : null,           // 'beside' | 'behind' | 'back' (further back along the grown-up's back line) | 'away' (from a cat near)
      pace: VISITOR.WALK * (0.85 + rng() * 0.3),
      // 'stroll' on the loop | 'out' to a watch spot | 'watch' there | 'back' to the loop
      mode: 'stroll',
      s,                 // metres along the loop
      u: 0,              // 0..1 along the way to its watch spot
      spot: null,
      until: 0,          // seconds left watching
      next: VISITOR.STROLL_MIN + rng() * (VISITOR.STROLL_MAX - VISITOR.STROLL_MIN), // metres until it next goes to watch
      side: 0,           // metres it stands to one side of its way (signed)
      x: P.x, z: P.z, yaw: Math.atan2(P.hx, P.hz),
      moving: false, waiting: false, walked: 0,
      hello: 0, helloKind: i % 2 ? 'crouch' : 'wave',
    };
  });

  // Where a visitor's own way has it now (before any step to the side), into `out`.
  function wayOf(v, out) {
    if (v.mode === 'stroll') return loop.at(v.s, out);
    const e = v.spot.exit;
    const dx = v.spot.x - e.x;
    const dz = v.spot.z - e.z;
    const len = Math.hypot(dx, dz) || 1;
    out.x = e.x + dx * v.u;
    out.z = e.z + dz * v.u;
    const back = v.mode === 'back' ? -1 : 1;
    out.hx = (dx / len) * back;
    out.hz = (dz / len) * back;
    return out;
  }

  // A free spot at least KEEP from the cat, as near (x, z) as can be: the
  // step aside. Straight away from her first, then round either way.
  function aside(v, cat) {
    let ax = v.x - cat.x;
    let az = v.z - cat.z;
    let d = Math.hypot(ax, az);
    if (d < 1e-4) { ax = Math.sin(v.yaw + Math.PI / 2); az = Math.cos(v.yaw + Math.PI / 2); d = 1; }
    const base = Math.atan2(ax, az);
    const reach = VISITOR.KEEP + 0.02;
    for (let k = 0; k <= 12; k++) {
      for (const sgn of k === 0 ? [1] : [1, -1]) {
        const a = base + sgn * k * (Math.PI / 12);
        const x = cat.x + Math.sin(a) * reach;
        const z = cat.z + Math.cos(a) * reach;
        if (free(x, z)) { v.x = x; v.z = z; return true; }
      }
    }
    // (nowhere free within a step: further out, the same way round)
    for (let r = reach + 0.4; r < reach + 3; r += 0.4) {
      for (let k = 0; k < 16; k++) {
        const a = base + k * (TAU / 16);
        const x = cat.x + Math.sin(a) * r;
        const z = cat.z + Math.cos(a) * r;
        if (free(x, z)) { v.x = x; v.z = z; return true; }
      }
    }
    return false;
  }

  function stepOne(v, dt, cat, catNear) {
    const ax0 = v.x;
    const az0 = v.z;
    v.moving = false;
    v.waiting = false;
    if (v.hello > 0) v.hello = Math.max(0, v.hello - dt);
    wayOf(v, P);
    const nx = P.hz;   // the way's right-hand side
    const nz = -P.hx;
    let want = 0;      // how far to the side it would like to be
    let go = v.mode !== 'watch' && v.hello <= 0;
    if (catNear) {
      // the cat, as its own way sees her: `along` ahead of it, `across` to its right
      const cx = cat.x - P.x;
      const cz = cat.z - P.z;
      const along = cx * P.hx + cz * P.hz;
      const across = cx * nx + cz * nz;
      const inTheWay = along > -0.6 && along < VISITOR.LOOK_AHEAD && Math.abs(across) < VISITOR.GIVE_WAY;
      if (inTheWay) {
        if ((cat.speed ?? 0) > 0.6) {
          // she is on the move: it stops and lets her by
          go = false;
          v.waiting = true;
        } else {
          // she is sitting in its way: round her, on the side she is not
          const sgn = across >= 0 ? -1 : 1;
          const need = VISITOR.KEEP + 0.25 - Math.abs(across);
          for (const side of [sgn, -sgn]) {
            const off = side === sgn ? side * Math.min(VISITOR.ROUND, Math.max(0, need)) : side * Math.min(VISITOR.ROUND, VISITOR.KEEP + 0.25 + Math.abs(across));
            // free there, and for the next couple of metres of its way
            let ok = true;
            for (let a = 0; a <= VISITOR.LOOK_AHEAD && ok; a += 0.5) ok = free(P.x + P.hx * a + nx * off, P.z + P.hz * a + nz * off);
            if (ok) { want = off; break; }
            want = null;
          }
          if (want === null) { want = v.side; go = false; v.waiting = true; }
        }
      }
    }
    // step to the side, or back onto its way
    if (want !== v.side) {
      const d = want - v.side;
      v.side += Math.sign(d) * Math.min(Math.abs(d), VISITOR.SIDE_SPEED * dt);
    }
    if (v.mode === 'watch') {
      v.until -= dt;
      if (v.until <= 0) v.mode = 'back';
    } else if (go) {
      const stepLen = v.pace * dt;
      if (v.mode === 'stroll') {
        // not onto the heels of the stroller in front
        let room = Infinity;
        for (const o of list) {
          if (o === v || o.mode !== 'stroll') continue;
          let gap = o.s - v.s;
          gap = ((gap % loop.length) + loop.length) % loop.length;
          if (gap > 0 && gap < room) room = gap;
        }
        if (room > VISITOR.GAP) {
          const before = v.s;
          v.s += stepLen;
          v.next -= stepLen;
          v.moving = true;
          // time to watch a ride: off the loop at the next free spot's turning
          if (v.next <= 0 && Math.abs(v.side) < 0.05) {
            for (const spot of spots) {
              if (spot.taken) continue;
              let ahead = spot.exit.s - before;
              ahead = ((ahead % loop.length) + loop.length) % loop.length;
              if (ahead <= stepLen + 1e-9) {
                spot.taken = true;
                v.spot = spot;
                v.mode = 'out';
                v.u = 0;
                v.s = spot.exit.s;
                break;
              }
            }
          }
          if (v.s >= loop.length) v.s -= loop.length;
        } else v.waiting = true;
      } else {
        const len = Math.hypot(v.spot.x - v.spot.exit.x, v.spot.z - v.spot.exit.z) || 1;
        v.moving = true;
        if (v.mode === 'out') {
          v.u = Math.min(1, v.u + stepLen / len);
          if (v.u >= 1) { v.mode = 'watch'; v.until = VISITOR.WATCH_MIN + rng() * (VISITOR.WATCH_MAX - VISITOR.WATCH_MIN); }
        } else {
          v.u = Math.max(0, v.u - stepLen / len);
          if (v.u <= 0) {
            v.spot.taken = false;
            v.spot = null;
            v.mode = 'stroll';
            v.next = VISITOR.STROLL_MIN + rng() * (VISITOR.STROLL_MAX - VISITOR.STROLL_MIN);
          }
        }
      }
    }
    // where that puts it
    wayOf(v, Q);
    const tx = Q.x + Q.hz * v.side;
    const tz = Q.z - Q.hx * v.side;
    const px = v.x;
    const pz = v.z;
    // (never a step TOWARDS a cat who is within arm's length: it waits where it is)
    const gap = catNear ? Math.hypot(px - cat.x, pz - cat.z) : Infinity;
    if (free(tx, tz) && !(gap < VISITOR.NEAR && Math.hypot(tx - cat.x, tz - cat.z) < gap)) { v.x = tx; v.z = tz; }
    else if (v.moving) { v.moving = false; v.waiting = true; }
    // NEVER where the cat is: if that is nearer her than KEEP, a step aside
    if (catNear && Math.hypot(v.x - cat.x, v.z - cat.z) < VISITOR.KEEP) {
      v.x = px; v.z = pz;
      if (Math.hypot(v.x - cat.x, v.z - cat.z) < VISITOR.KEEP) aside(v, cat);
      v.waiting = true;
      v.moving = false;
      // its way goes on from beside where it now stands
      const ox = v.x - Q.x;
      const oz = v.z - Q.z;
      v.side = Math.max(-VISITOR.ROUND * 2, Math.min(VISITOR.ROUND * 2, ox * Q.hz - oz * Q.hx));
    }
    v.walked += Math.hypot(v.x - px, v.z - pz);
    // which way it faces: the cat while it says hello, the ride while it watches, else the way it goes
    let face = Math.atan2(Q.hx, Q.hz);
    if (v.hello > 0) face = Math.atan2(cat.x - v.x, cat.z - v.z);
    else if (v.mode === 'watch') face = Math.atan2(v.spot.look.x - v.x, v.spot.look.z - v.z);
    v.yaw = turn(v.yaw, face, 4 * dt);
    if (v.pair) stepChild(v, dt, catNear ? cat : null, ax0, az0, face, cat);
  }

  // ---- a pair's child -------------------------------------------------------
  const C = { x: 0, z: 0 };
  // Whether the child may stand at (x, z): free ground by its own radius, and
  // never within KEEP of a cat who is about (null: up high, out of anyone's way).
  const childOk = (x, z, cat, keep = VISITOR.KEEP) => freeFor(x, z, PAIR.CHILD_R) && !(cat && Math.hypot(x - cat.x, z - cat.z) < keep);
  // ... and still with its grown-up, never through it
  const withOk = (v, x, z, cat) => {
    const d = Math.hypot(x - v.x, z - v.z);
    return d <= PAIR.FAR && d >= PAIR.APART && childOk(x, z, cat);
  };

  // Where the child would stand by its grown-up as it is now, into C (and
  // v.childAt, v.childSide): with a cat near, on the grown-up's far side from
  // her; else beside where the way is PAIR.CLEAR wide (its own side first),
  // else a step behind, else the nearest good spot along the grown-up's back
  // line, else the nearest round it. False if nowhere.
  function childSpot(v, cat) {
    // (from a cat on the move, a little further: it steps away before she is there)
    const keep = VISITOR.KEEP + (cat ? Math.min(PAIR.LEAD, (cat.speed ?? 0) * 0.15) : 0);
    // with a cat near the pair, the far side of the grown-up from her (it keeps
    // its grown-up between them), turned no more than a quarter round
    if (cat && Math.hypot(v.x - cat.x, v.z - cat.z) < PAIR.SHELTER) {
      const base = Math.atan2(v.x - cat.x, v.z - cat.z);
      for (let k = 0; k <= 6; k++) {
        for (let sgn = 1; sgn >= (k === 0 ? 1 : -1); sgn -= 2) {
          const a = base + sgn * k * (Math.PI / 12);
          const x = v.x + Math.sin(a) * PAIR.BESIDE;
          const z = v.z + Math.cos(a) * PAIR.BESIDE;
          if (childOk(x, z, cat, keep)) { C.x = x; C.z = z; v.childAt = 'away'; return true; }
        }
      }
    }
    const fx = Math.sin(v.yaw);
    const fz = Math.cos(v.yaw);
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? v.childSide : -v.childSide;
      const x = v.x + fz * side * PAIR.BESIDE;
      const z = v.z - fx * side * PAIR.BESIDE;
      const mx = v.x + fz * side * PAIR.BESIDE * 0.5;
      const mz = v.z - fx * side * PAIR.BESIDE * 0.5;
      if (childOk(x, z, cat, keep) && clearance(colliders, mx, mz) >= BESIDE_CLEAR && !swept(mx, mz) && !wet(mx, mz, PAIR.R)) {
        C.x = x; C.z = z; v.childSide = side; v.childAt = 'beside';
        return true;
      }
    }
    for (let k = 0; k < BACK_LINE.length; k++) {
      const x = v.x - fx * BACK_LINE[k];
      const z = v.z - fz * BACK_LINE[k];
      if (childOk(x, z, cat, keep)) { C.x = x; C.z = z; v.childAt = k === 0 ? 'behind' : 'back'; return true; }
    }
    for (let r = PAIR.BESIDE; r <= PAIR.FAR; r += 0.25) {
      for (let k = 0; k < 16; k++) {
        const a = v.yaw + Math.PI + k * (TAU / 16);
        const x = v.x + Math.sin(a) * r;
        const z = v.z + Math.cos(a) * r;
        if (childOk(x, z, cat, keep)) { C.x = x; C.z = z; v.childAt = 'back'; return true; }
      }
    }
    return false;
  }

  // A step of `len` the way `a` points, or turned up to a quarter round.
  function slide(v, cat, a0, len) {
    if (len < 1e-6) return withOk(v, v.childX, v.childZ, cat);
    for (let k = 0; k <= 6; k++) {
      for (let sgn = 1; sgn >= (k === 0 ? 1 : -1); sgn -= 2) {
        const a = a0 + sgn * k * (Math.PI / 12);
        const x = v.childX + Math.sin(a) * len;
        const z = v.childZ + Math.cos(a) * len;
        if (withOk(v, x, z, cat)) { v.childX = x; v.childZ = z; return true; }
      }
    }
    return false;
  }

  // On its way to its spot, round the cat: (x, z) put out to just KEEP from
  // her, if that is still within a step.
  function roundCat(v, cat, x, z, reach) {
    if (!cat) return false;
    const d = Math.hypot(x - cat.x, z - cat.z);
    if (d < 1e-4 || d >= VISITOR.KEEP) return false;
    const k = (VISITOR.KEEP + 0.02) / d;
    const rx = cat.x + (x - cat.x) * k;
    const rz = cat.z + (z - cat.z) * k;
    if (Math.hypot(rx - v.childX, rz - v.childZ) > reach || !withOk(v, rx, rz, cat)) return false;
    v.childX = rx; v.childZ = rz;
    return true;
  }

  // Where the child stands is no good any more (a cat came at it, or its
  // grown-up turned into it): first a step back from `from` (the cat, or the
  // grown-up), no longer than it may go in a step, straight away, else
  // sliding along whatever is in the way ...
  function childAway(v, from, cat, reach) {
    if (!from) return false;
    const base = Math.atan2(v.childX - from.x, v.childZ - from.z);
    for (let k = 0; k <= 6; k++) {
      for (let sgn = 1; sgn >= (k === 0 ? 1 : -1); sgn -= 2) {
        const a = base + sgn * k * (Math.PI / 12);
        const x = v.childX + Math.sin(a) * reach;
        const z = v.childZ + Math.cos(a) * reach;
        if (withOk(v, x, z, cat)) { v.childX = x; v.childZ = z; return true; }
      }
    }
    return false;
  }
  // ... else, from a cat, the nearest good spot just KEEP from her, as the
  // grown-ups step aside (straight away from her first, then round either way).
  function childAside(v, cat) {
    if (!cat) return false;
    let ax = v.childX - cat.x;
    let az = v.childZ - cat.z;
    if (Math.hypot(ax, az) < 1e-4) { ax = v.childX - v.x; az = v.childZ - v.z; }
    const base = Math.atan2(ax, az);
    const reach = VISITOR.KEEP + 0.02;
    for (let k = 0; k <= 48; k++) {
      for (let sgn = 1; sgn >= (k === 0 ? 1 : -1); sgn -= 2) {
        const a = base + sgn * k * (Math.PI / 48);
        const x = cat.x + Math.sin(a) * reach;
        const z = cat.z + Math.cos(a) * reach;
        if (withOk(v, x, z, cat)) { v.childX = x; v.childZ = z; return true; }
      }
    }
    return false;
  }

  // The child's step: towards where it would stand (round the back of its
  // grown-up to the other side), never further than its grown-up went this
  // step and PAIR.CATCH (and, out of a near cat's way, as fast as she comes),
  // and only onto good ground. If even where it stands is no good any more (a
  // cat came at it), a step back, else a step aside, else straight to its
  // spot: the rules first.
  function stepChild(v, dt, cat, ax0, az0, face, anyCat) {
    const cx = v.childX;
    const cz = v.childZ;
    // (with a cat coming near, it may hurry out of her way as fast as she comes)
    const hurry = cat && Math.hypot(cx - cat.x, cz - cat.z) < VISITOR.KEEP + PAIR.LEAD + 1 ? Math.min(PAIR.HURRY, cat.speed ?? 0) : 0;
    const reach = Math.hypot(v.x - ax0, v.z - az0) + (PAIR.CATCH + hurry) * dt;
    if (childSpot(v, cat)) {
      // the other side of its grown-up: by way of a spot a quarter round
      const ux = cx - v.x;
      const uz = cz - v.z;
      const ul = Math.hypot(ux, uz) || 1;
      const wx = C.x - v.x;
      const wz = C.z - v.z;
      const wl = Math.hypot(wx, wz) || 1;
      let gx = C.x;
      let gz = C.z;
      if ((ux * wx + uz * wz) / (ul * wl) < 0.2) {
        let bx = ux / ul + wx / wl;
        let bz = uz / ul + wz / wl;
        const bl = Math.hypot(bx, bz);
        // (straight across: by its own side)
        if (bl < 0.3) { bx = Math.cos(v.yaw) * v.childSide; bz = -Math.sin(v.yaw) * v.childSide; } else { bx /= bl; bz /= bl; }
        gx = v.x + bx * 0.7;
        gz = v.z + bz * 0.7;
      }
      const dx = gx - cx;
      const dz = gz - cz;
      const d = Math.hypot(dx, dz);
      const k = d > reach ? reach / d : 1;
      // straight there (sliding round whatever is in the way), or round her on
      // the way, or along with its grown-up; else it stays, unless that is no
      // good any more: a step back, a step aside, its spot
      if (!slide(v, cat, Math.atan2(dx, dz), d * k) && !roundCat(v, cat, cx + dx * k, cz + dz * k, reach)) {
        if (withOk(v, cx + v.x - ax0, cz + v.z - az0, cat)) { v.childX = cx + v.x - ax0; v.childZ = cz + v.z - az0; }
        else if (!withOk(v, cx, cz, cat) && !childAway(v, cat, cat, reach) && !childAway(v, v, cat, reach) && !childAside(v, cat)) { v.childX = C.x; v.childZ = C.z; }
      }
    } else if (!withOk(v, cx, cz, cat) && !childAway(v, cat, cat, reach) && !childAway(v, v, cat, reach)) childAside(v, cat);
    // it faces the way its grown-up does: the cat while they say hello, the ride while they watch
    let want = face;
    if (v.hello > 0) want = Math.atan2(anyCat.x - v.childX, anyCat.z - v.childZ);
    else if (v.mode === 'watch') want = Math.atan2(v.spot.look.x - v.childX, v.spot.look.z - v.childZ);
    v.childYaw = turn(v.childYaw, want, 4 * dt);
  }
  // each child starts where it would stand
  for (const v of list) if (v.pair && childSpot(v, null)) { v.childX = C.x; v.childZ = C.z; }

  return {
    list,
    spots,
    loop,
    events,
    free,
    takeEvents() { return events.splice(0, events.length); },

    step(dt, cat) {
      if (!(dt > 0)) return;
      const step = Math.min(dt, 0.1);
      const high = (cat.y ?? 0) >= VISITOR.CAT_HIGH;
      for (const v of list) stepOne(v, step, cat, !high);
    },

    // A meow: everyone near enough says hello, a wave or a crouch.
    meow(pos) {
      let said = 0;
      for (const v of list) {
        if (Math.hypot(v.x - pos.x, v.z - pos.z) > VISITOR.HELLO_R) continue;
        v.hello = VISITOR.HELLO_TIME;
        said++;
      }
      if (said > 0) events.push({ type: 'visitor-hello', n: said });
      return said;
    },
  };
}
