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
// seeded dice). The child keeps the rules above on its own: free ground by
// its own radius, never in a ride, and KEEP as a child can: it never steps
// towards her within KEEP (nor within arm's length), and steps away at the
// grown-ups' pace. A cat who runs at it faster can reach it; then the child's
// soft bump (its body circle from the people kit, drawn by src/fairshow.js,
// Task 14) stops her, as in town. Side
// by side the pair is PAIR.R wide round its middle, so the child walks beside
// only where that is clear and the way PAIR.CLEAR wide (of two clear sides,
// the one further from a cat near), a step behind where it is not. It moves
// smoothly: never further in a step than the grown-up did and the grown-ups'
// own SIDE_SPEED, never a hop, and never a step towards a cat within arm's
// length. Where it stands comes from the grown-up's spot and the ground,
// never a roll.
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
  HELLO_RISE: 0.8,    // seconds it still holds still after (the kneel's way up)
  MARGIN: 0.12,       // clear of every collider by its radius and this
});

export const PAIR = Object.freeze({
  R: 0.65,            // a pair's own radius, side by side, round its middle
  CHILD_R: 0.18,      // the child's own radius
  BESIDE: 0.65,       // metres to the grown-up's side, middle to middle
  BEHIND: 0.6,        // a step behind, where beside is not clear
  CLEAR: 1.6,         // beside only where the way is this wide: clear this far across the pair's middle
  TRAIL: 2.5,         // never further from its grown-up than this (pinned by a cat, it trails)
  APART: 0.45,        // nor nearer, middle to middle: it goes round its grown-up, never through
  NEAR_CAT: 3,        // a cat this near the grown-up: of two clear sides, the one further from her
  LEAD: 0.6,          // up to this much further than KEEP from a cat on the move, where it means to stand
});

// Whether a look spot holds a child: src/people/look.js spotKind, the same
// hash and the same cut. Here rather than imported, so that the bundler does
// not split the people's look out into a chunk of its own that every place
// pack then fetches (test/fairgames.test.js holds the two equal).
export function isChildSpot(x, z) {
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
const ROUND_CORNER = 1.0; // metres either side of a corner the rounded way turns over
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
    // at(s, out, round) → out { x, z, hx, hz }: the point s metres along, and
    // the way the line runs there. With `round`, the way turns smoothly
    // through each corner (over ROUND_CORNER either side of it, half each
    // way at the corner itself), so that a point to one side of the line
    // moves on without a jump as s passes the corner.
    at(s, out, round = false) {
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
      if (round) {
        const span = Math.min(ROUND_CORNER, seg / 2);
        const from = t - cum[i];
        const to = cum[i + 1] - t;
        const j = from < to ? (i + n - 1) % n : (i + 1) % n; // the segment round the nearer corner
        const w = 0.5 * Math.max(0, 1 - Math.min(from, to) / span);
        if (w > 0) {
          const c = points[j];
          const e = points[(j + 1) % n];
          const sl = Math.hypot(e.x - c.x, e.z - c.z) || 1;
          const hx = out.hx * (1 - w) + ((e.x - c.x) / sl) * w;
          const hz = out.hz * (1 - w) + ((e.z - c.z) / sl) * w;
          const hl = Math.hypot(hx, hz) || 1;
          out.hx = hx / hl;
          out.hz = hz / hl;
        }
      }
      return out;
    },
  };
}

// createFairVisitors(area, opts) → the visitors of one walk.
//   opts.count    how many (visitorCount(tier.strays))
//   opts.seed     their own dice
//   opts.swept    (x, z) => true where a ride sweeps (src/fairsim.js `swept`)
// A visitor saying hello (the lifelike people; ruling R41) holds still, it
// and its child, for the hello and HELLO_RISE after it (the kneel's way up);
// it turns to face her while the hello lasts, and takes no step aside: her
// soft bump (drawn by the show, src/fairshow.js) keeps her off it, as in
// town. If she is still within KEEP of it when the hold ends, it walks round
// her calmly (SIDE_SPEED at most, never the step aside's jump, never nearer
// her) and back onto its way; her bump stops her if she follows. And every
// step it takes is a calm one (stepCareful): never a jump to catch up with
// its way.
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
    const look = { x: 100 + i * 7.3, z: 200 + i * 3.1 }; // the spot the person is dressed from (src/people/look.js)
    const pair = isChildSpot(look.x, look.z);
    return {
      id: `fair-visitor-${i + 1}`,
      index: i,
      look,
      pair,              // a grown-up with a child (the child is drawn beside it)
      // the child's spot and facing (null for one alone), moved in place each step
      childX: pair ? P.x : null, childZ: pair ? P.z : null, childYaw: pair ? Math.atan2(P.hx, P.hz) : null,
      childSide: pair ? (i % 2 ? -1 : 1) : null, // 1: on the grown-up's right
      childAt: pair ? 'beside' : null,           // 'beside' | 'behind' | 'back' (further back along the grown-up's back line)
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
      holdT: 0,          // seconds it still holds still for its hello
      away: false,       // walking round her (stepRound)
      roundWay: 0,       // which way round her (0: not yet chosen)
    };
  });

  // Where a visitor's own way has it now (before any step to the side), into `out`.
  // (`round`: the loop's corners rounded, closedLine.at)
  function wayOf(v, out, round = false) {
    if (v.mode === 'stroll') return loop.at(v.s, out, round);
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

  // A visitor saying hello (and its child) holds still: it turns to face her
  // while the hello lasts, and stays where it is for the hello and HELLO_RISE
  // (no step aside: her soft bump keeps her off it). When the hold ends with
  // her still within KEEP of it, it steps away from her calmly (stepRound
  // below; its child steps away by its own rules). Returns whether it held.
  function holdStill(v, dt, cat, catNear) {
    if (v.holdT <= 0) return false;
    v.moving = false;
    v.waiting = false;
    const saying = v.hello > 0;
    if (saying) v.hello = Math.max(0, v.hello - dt);
    v.holdT = Math.max(0, v.holdT - dt);
    if (v.holdT <= 0 && catNear && Math.hypot(v.x - cat.x, v.z - cat.z) < VISITOR.KEEP) { v.away = true; v.roundWay = 0; }
    if (saying) {
      v.yaw = turn(v.yaw, Math.atan2(cat.x - v.x, cat.z - v.z), 4 * dt);
      if (v.pair) v.childYaw = turn(v.childYaw, Math.atan2(cat.x - v.childX, cat.z - v.childZ), 4 * dt);
    }
    return true;
  }

  // How far the stroller in front of v is along the loop (Infinity: none).
  function roomAhead(v) {
    let room = Infinity;
    for (const o of list) {
      if (o === v || o.mode !== 'stroll') continue;
      let gap = o.s - v.s;
      gap = ((gap % loop.length) + loop.length) % loop.length;
      if (gap > 0 && gap < room) room = gap;
    }
    return room;
  }

  // A step of stepLen along its own way: on round the loop (not onto the
  // heels of the stroller in front, and off to a watch spot when it is time),
  // or out to its spot and back.
  function advance(v, stepLen) {
    if (v.mode === 'stroll') {
      // not onto the heels of the stroller in front
      if (roomAhead(v) > VISITOR.GAP) {
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
      v.moving = true;
      alongSpot(v, stepLen);
    }
  }

  // stepLen out to its watch spot (watching, once there) or back (strolling
  // on, once at the loop).
  function alongSpot(v, stepLen) {
    const len = Math.hypot(v.spot.x - v.spot.exit.x, v.spot.z - v.spot.exit.z) || 1;
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

  // Where its way would have it `ds` further along (back the way it came if
  // negative; only on the loop and out to or back from a spot) and `side` to
  // one side, into out (the loop's corners rounded); Q is left as the way
  // there.
  function wayAhead(v, ds, side, out) {
    const s0 = v.s;
    const u0 = v.u;
    if (ds !== 0) {
      if (v.mode === 'stroll') v.s = s0 + ds;
      else if (v.mode === 'out' || v.mode === 'back') {
        const len = Math.hypot(v.spot.x - v.spot.exit.x, v.spot.z - v.spot.exit.z) || 1;
        v.u = Math.min(1, Math.max(0, u0 + ((v.mode === 'out' ? 1 : -1) * ds) / len));
      }
    }
    wayOf(v, Q, true);
    v.s = s0;
    v.u = u0;
    out.x = Q.x + Q.hz * side;
    out.z = Q.z - Q.hx * side;
    return out;
  }

  // Every step is a calm one: never further than its pace along its way and
  // SIDE_SPEED to the side, and never a step its way has taken that it has
  // not (where it waits, its way waits with it, so it never catches up in a
  // jump). It goes on along its way (if it may) with the side step it has
  // just taken (round her, on the side she is not), or takes the side step
  // alone: the first of the two that is free ground, never a step towards her
  // within arm's length, and never into KEEP of her; else it waits where it
  // is. If where its way has it is further off than one such step (after a
  // step aside), it walks there at that pace. Stuck in front of her (within
  // arm's length, and it can neither go on nor take its side step), it walks
  // round her (stepRound).
  const T = { x: 0, z: 0 };
  function stepCareful(v, dt, cat, go, side0) {
    const px = v.x;
    const pz = v.z;
    const gap = cat ? Math.hypot(px - cat.x, pz - cat.z) : Infinity;
    const side1 = v.side;
    const len = v.pace * dt;
    const most = len + VISITOR.SIDE_SPEED * dt;
    let fwd = 0;
    if (go) {
      if (v.mode !== 'stroll' || roomAhead(v) > VISITOR.GAP) fwd = len;
      else v.waiting = true;
    }
    let took = -1; // 0: on with the side step, 1: the side step alone
    for (let k = fwd > 0 ? 0 : 1; k < 2 && took < 0; k++) {
      const ds = k === 0 ? fwd : 0;
      wayAhead(v, ds, side1, T);
      let dx = T.x - px;
      let dz = T.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > most) { dx *= most / d; dz *= most / d; }
      const x = px + dx;
      const z = pz + dz;
      if (!free(x, z)) continue;
      if (cat) {
        const e = Math.hypot(x - cat.x, z - cat.z);
        if (gap < VISITOR.NEAR && e < gap - 1e-9) continue;
        if (gap >= VISITOR.KEEP && e < VISITOR.KEEP) continue;
      }
      if (ds > 0) advance(v, ds);
      v.x = x;
      v.z = z;
      v.moving = d > 1e-6;
      took = k;
    }
    if (took < 0) v.side = side0;
    if (took !== 0 && go) v.waiting = true;
    // stuck in front of her: round her
    if (cat && gap < VISITOR.NEAR && fwd > 0 && took !== 0 && !(took === 1 && side1 !== side0)) { v.away = true; v.roundWay = 0; }
    wayAhead(v, 0, v.side, T);
  }

  // Walking round her (`away`): she was still within KEEP of it when its
  // hello ended, or it was stuck in front of her. It makes for the first spot
  // on its way past her that is clear of her (watching a ride, or none within
  // FAR: a spot straight away from her), at SIDE_SPEED at most: each step the
  // one of a ring round it that is free ground, never towards her within
  // arm's length, never into KEEP of her, close by her only ever the one way
  // round her, and nearest that spot (else it waits where it is); it turns to
  // the way it steps first. Never aside()'s jump. Once there (or KEEP and a
  // little more from her, making straight away), its way goes on from where
  // it stands. If she follows, her soft bump stops her (src/fairshow.js).
  const AWAY_CLEAR = 0.1;
  const PAST = VISITOR.KEEP + 0.6;  // how far past her, along its way, it makes for (at the least)
  const FAR = 10;                    // and at the most
  const RING = 16;
  const TURN_FIRST = 0.5;            // radians: turned this near the way it steps, it walks
  const G = { x: 0, z: 0 };
  function stepRound(v, dt, cat) {
    const px = v.x;
    const pz = v.z;
    const gap = Math.hypot(px - cat.x, pz - cat.z);
    // where it makes for (ahead: how far along its way; -1, straight away from her)
    let ahead = -1;
    if (v.mode !== 'watch') {
      wayOf(v, P, true);
      for (let a = Math.max(0, (cat.x - P.x) * P.hx + (cat.z - P.z) * P.hz) + PAST; a < FAR; a += 0.25) {
        wayAhead(v, a, 0, G);
        if (Math.hypot(G.x - cat.x, G.z - cat.z) >= VISITOR.KEEP + AWAY_CLEAR + 0.2 && free(G.x, G.z)) { ahead = a; break; }
      }
    }
    if (ahead < 0) {
      const l = gap || 1;
      G.x = px + ((px - cat.x) / l) * 2;
      G.z = pz + ((pz - cat.z) / l) * 2;
    }
    const r = VISITOR.SIDE_SPEED * dt;
    const close = gap < VISITOR.NEAR + 0.3;
    if (!close) v.roundWay = 0;
    // (a step, if there is one: standing still is never nearer that spot
    // than going round her is, a step at a time)
    let best = Infinity;
    let bx = px;
    let bz = pz;
    for (let ri = 2; ri >= 1; ri--) {
      for (let k = 0; k < RING; k++) {
        const a = k * (TAU / RING);
        const x = px + Math.sin(a) * r * (ri / 2);
        const z = pz + Math.cos(a) * r * (ri / 2);
        if (!free(x, z)) continue;
        const e = Math.hypot(x - cat.x, z - cat.z);
        if (gap < VISITOR.NEAR && e < gap - 1e-9) continue;
        if (gap >= VISITOR.KEEP && e < VISITOR.KEEP) continue;
        // (close by her, one way round her, the way it first went, so it never dithers)
        const turnWay = (x - px) * (pz - cat.z) - (z - pz) * (px - cat.x);
        if (close && v.roundWay * turnWay < -1e-9) continue;
        const g = Math.hypot(x - G.x, z - G.z);
        if (g < best - 1e-9) { best = g; bx = x; bz = z; }
      }
    }
    const step = Math.hypot(bx - px, bz - pz);
    if (step <= 1e-6) v.roundWay = -v.roundWay; // that way is blocked: the other way round next
    else if (close && v.roundWay === 0) {
      const w = (bx - px) * (pz - cat.z) - (bz - pz) * (px - cat.x);
      if (Math.abs(w) > 1e-9) v.roundWay = Math.sign(w);
    }
    // it turns to the way it steps before it walks (it faced her for its
    // hello: a stride towards her would put a foot in her)
    const dir = step > 1e-6 ? Math.atan2(bx - px, bz - pz) : v.yaw;
    const walks = step > 1e-6 && Math.abs(wrap(dir - v.yaw)) <= TURN_FIRST;
    if (walks) { v.x = bx; v.z = bz; }
    v.moving = walks;
    v.waiting = step <= 1e-6;
    const now = Math.hypot(v.x - cat.x, v.z - cat.z);
    if (ahead < 0) {
      if (now >= VISITOR.KEEP + AWAY_CLEAR) { anchor(v, null); v.away = false; }
    } else if (Math.hypot(v.x - G.x, v.z - G.z) < r && now >= VISITOR.KEEP + AWAY_CLEAR) {
      anchor(v, ahead);
      v.away = false;
    }
    wayAhead(v, 0, v.side, T); // (Q: its way where it now is)
    return dir;
  }

  // Its way goes on from where it stands: `ahead` further along its way
  // (no turn off to a watch spot on the way there; null: as far along as it
  // stands), and to the side as it stands from there.
  function anchor(v, ahead) {
    if (ahead === null) {
      wayOf(v, P, true);
      ahead = Math.max(0, (v.x - P.x) * P.hx + (v.z - P.z) * P.hz);
    }
    if (ahead > 0 && v.mode === 'stroll') {
      v.s += ahead;
      v.next -= ahead;
      if (v.s >= loop.length) v.s -= loop.length;
    } else if (ahead > 0 && v.mode !== 'watch') alongSpot(v, ahead);
    wayOf(v, Q, true);
    v.side = Math.max(-VISITOR.ROUND * 2, Math.min(VISITOR.ROUND * 2, (v.x - Q.x) * Q.hz - (v.z - Q.z) * Q.hx));
  }

  function stepOne(v, dt, cat, catNear) {
    if (holdStill(v, dt, cat, catNear)) return;
    if (v.away && !catNear) { anchor(v, null); v.away = false; }
    const ax0 = v.x;
    const az0 = v.z;
    if (v.away) {
      // walking round her (stepRound), it and its child
      if (v.hello > 0) v.hello = Math.max(0, v.hello - dt);
      if (v.mode === 'watch') {
        v.until -= dt;
        if (v.until <= 0) v.mode = 'back';
      }
      const face = stepRound(v, dt, cat);
      v.walked += Math.hypot(v.x - ax0, v.z - az0);
      v.yaw = turn(v.yaw, face, 4 * dt);
      if (v.pair) stepChild(v, dt, cat, ax0, az0, v.yaw, cat);
      return;
    }
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
    const side0 = v.side;
    if (want !== v.side) {
      const d = want - v.side;
      v.side += Math.sign(d) * Math.min(Math.abs(d), VISITOR.SIDE_SPEED * dt);
    }
    const px = v.x;
    const pz = v.z;
    if (v.mode === 'watch') {
      v.until -= dt;
      if (v.until <= 0) v.mode = 'back';
    }
    stepCareful(v, dt, catNear ? cat : null, go && v.mode !== 'watch', side0);
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
  // never within `keep` (KEEP) of a cat who is about (null: up high, out of
  // anyone's way).
  const childOk = (x, z, cat, keep = VISITOR.KEEP) => freeFor(x, z, PAIR.CHILD_R) && !(cat && Math.hypot(x - cat.x, z - cat.z) < keep);
  // Whether the child may step to (x, z): good ground, with its grown-up (never
  // through it, never further than PAIR.TRAIL), and never a step towards a cat
  // who is within arm's length (`gap`: how far she is from where it stands).
  // `keep`: how near her it may end the step (KEEP; nearer only while she is
  // already within KEEP and the step takes it further from her); `apart`, the
  // same for its grown-up (who may walk up against it while it is pinned).
  const stepOk = (v, x, z, cat, gap, keep = VISITOR.KEEP, apart = PAIR.APART) => {
    const d = Math.hypot(x - v.x, z - v.z);
    if (d > PAIR.TRAIL || d < apart || !childOk(x, z, cat, keep)) return false;
    return !(cat && gap < VISITOR.NEAR && Math.hypot(x - cat.x, z - cat.z) < gap);
  };

  // Where the child would stand by its grown-up as it is now, into C (and
  // v.childAt, v.childSide): beside where the way is PAIR.CLEAR wide (its own
  // side first; with a cat near, the side further from her), else a step
  // behind, else the nearest good spot along the grown-up's back line, else
  // the nearest round it. False if nowhere.
  function childSpot(v, cat) {
    // (from a cat on the move, a little further: it steps away before she is there)
    const keep = VISITOR.KEEP + (cat ? Math.min(PAIR.LEAD, (cat.speed ?? 0) * 0.15) : 0);
    const fx = Math.sin(v.yaw);
    const fz = Math.cos(v.yaw);
    let side = 0;
    let far = -1;
    for (let k = 0; k < 2; k++) {
      const s = k === 0 ? v.childSide : -v.childSide;
      const x = v.x + fz * s * PAIR.BESIDE;
      const z = v.z - fx * s * PAIR.BESIDE;
      const mx = v.x + fz * s * PAIR.BESIDE * 0.5;
      const mz = v.z - fx * s * PAIR.BESIDE * 0.5;
      if (!(childOk(x, z, cat, keep) && clearance(colliders, mx, mz) >= BESIDE_CLEAR && !swept(mx, mz) && !wet(mx, mz, PAIR.R))) continue;
      // both sides clear: its own, unless a cat near is nearer that one
      const d = cat && Math.hypot(v.x - cat.x, v.z - cat.z) < PAIR.NEAR_CAT ? Math.hypot(x - cat.x, z - cat.z) : (k === 0 ? 1 : 0);
      if (d > far + 1e-9) { far = d; side = s; C.x = x; C.z = z; }
    }
    if (side) { v.childSide = side; v.childAt = 'beside'; return true; }
    for (let k = 0; k < BACK_LINE.length; k++) {
      const x = v.x - fx * BACK_LINE[k];
      const z = v.z - fz * BACK_LINE[k];
      if (childOk(x, z, cat, keep)) { C.x = x; C.z = z; v.childAt = k === 0 ? 'behind' : 'back'; return true; }
    }
    for (let r = PAIR.BESIDE; r <= PAIR.TRAIL; r += 0.25) {
      for (let k = 0; k < 16; k++) {
        const a = v.yaw + Math.PI + k * (TAU / 16);
        const x = v.x + Math.sin(a) * r;
        const z = v.z + Math.cos(a) * r;
        if (childOk(x, z, cat, keep)) { C.x = x; C.z = z; v.childAt = 'back'; return true; }
      }
    }
    return false;
  }

  // A step of `len` the way `a0` points, or turned up to a quarter round.
  function slide(v, cat, gap, a0, len) {
    if (len < 1e-6) return false;
    for (let k = 0; k <= 6; k++) {
      for (let sgn = 1; sgn >= (k === 0 ? 1 : -1); sgn -= 2) {
        const a = a0 + sgn * k * (Math.PI / 12);
        const x = v.childX + Math.sin(a) * len;
        const z = v.childZ + Math.cos(a) * len;
        if (stepOk(v, x, z, cat, gap)) { v.childX = x; v.childZ = z; return true; }
      }
    }
    return false;
  }

  // On its way to its spot, round the cat: (x, z) put out to just KEEP from
  // her, if that is still within a step.
  function roundCat(v, cat, gap, x, z, reach) {
    if (!cat) return false;
    const d = Math.hypot(x - cat.x, z - cat.z);
    if (d < 1e-4 || d >= VISITOR.KEEP) return false;
    const k = (VISITOR.KEEP + 0.02) / d;
    const rx = cat.x + (x - cat.x) * k;
    const rz = cat.z + (z - cat.z) * k;
    if (Math.hypot(rx - v.childX, rz - v.childZ) > reach || !stepOk(v, rx, rz, cat, gap)) return false;
    v.childX = rx; v.childZ = rz;
    return true;
  }

  // Where it stands is no good any more (a cat came at it, or its grown-up
  // turned into it): the best good spot within a step, all the way round and
  // nearer in too: the one furthest from its grown-up if that came up against
  // it, else furthest from her and not far from its grown-up (or, with no
  // cat, nearest its spot). Never a
  // hop: if there is none, it stays.
  // (A cat who ran at it faster than it walks may be within KEEP: then any
  // good step further from her will do. Her own stop is the child's soft
  // bump, src/fairshow.js, Task 14.)
  function childAway(v, cat, gap, reach) {
    const keep = cat && gap < VISITOR.KEEP ? gap : VISITOR.KEEP;
    const apart = Math.min(PAIR.APART, Math.hypot(v.childX - v.x, v.childZ - v.z));
    let best = -Infinity;
    let bx = 0;
    let bz = 0;
    for (let ri = 4; ri >= 1; ri--) {
      const r = (reach * ri) / 4;
      for (let k = 0; k < 24; k++) {
        const a = k * (TAU / 24);
        const x = v.childX + Math.sin(a) * r;
        const z = v.childZ + Math.cos(a) * r;
        if (!stepOk(v, x, z, cat, gap, keep, apart)) continue;
        // (its grown-up came up against it: away from its grown-up first)
        // (away from her, but not away from its grown-up)
        const score = apart < PAIR.APART ? Math.hypot(x - v.x, z - v.z)
          : cat ? Math.hypot(x - cat.x, z - cat.z) - 0.5 * Math.hypot(x - v.x, z - v.z) : -Math.hypot(x - C.x, z - C.z);
        if (score > best) { best = score; bx = x; bz = z; }
      }
    }
    if (best === -Infinity) return false;
    v.childX = bx; v.childZ = bz;
    return true;
  }

  // The child's step: towards where it would stand (round the back of its
  // grown-up to the other side), never further than its grown-up went this
  // step and the grown-ups' own SIDE_SPEED, only onto good ground, and never
  // towards a cat within arm's length. If where it stands is no good any more,
  // the best spot within that same step. Pinned (between her and its
  // grown-up, or against a stall), it may trail behind, up to PAIR.TRAIL, and
  // comes back at the same calm pace.
  function stepChild(v, dt, cat, ax0, az0, face, anyCat) {
    const cx = v.childX;
    const cz = v.childZ;
    const gap = cat ? Math.hypot(cx - cat.x, cz - cat.z) : Infinity;
    const reach = Math.hypot(v.x - ax0, v.z - az0) + VISITOR.SIDE_SPEED * dt;
    const found = childSpot(v, cat);
    let moved = false;
    if (found) {
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
      // straight there (sliding round whatever is in the way), or round her
      // on the way, or along with its grown-up
      moved = d < 1e-6 ? stepOk(v, cx, cz, cat, Infinity)
        : slide(v, cat, gap, Math.atan2(dx, dz), d * k)
          || roundCat(v, cat, gap, cx + dx * k, cz + dz * k, reach)
          || (stepOk(v, cx + v.x - ax0, cz + v.z - az0, cat, gap) && ((v.childX = cx + v.x - ax0), (v.childZ = cz + v.z - az0), true));
    }
    // else it stays, if it may; if not, the best spot within a step
    // (with her coming on, it does not wait for her to be at KEEP: a little sooner)
    const keepNow = VISITOR.KEEP + (cat ? Math.min(PAIR.LEAD, (cat.speed ?? 0) * 0.15) : 0);
    if (!moved && !stepOk(v, cx, cz, cat, Infinity, keepNow)) childAway(v, cat, gap, reach);
    // it faces the way its grown-up does: the cat while they say hello, the ride while they watch
    let want = face;
    if (v.hello > 0) want = Math.atan2(anyCat.x - v.childX, anyCat.z - v.childZ);
    else if (v.mode === 'watch') want = Math.atan2(v.spot.look.x - v.childX, v.spot.look.z - v.childZ);
    v.childYaw = turn(v.childYaw, want, 4 * dt);
  }
  // each child starts where it would stand (somewhere free round its grown-up:
  // test/fairgames.test.js holds that there always is such a spot)
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
        v.holdT = VISITOR.HELLO_TIME + VISITOR.HELLO_RISE;
        said++;
      }
      if (said > 0) events.push({ type: 'visitor-hello', n: said });
      return said;
    },
  };
}
