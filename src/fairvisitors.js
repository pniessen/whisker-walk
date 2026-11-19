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

// How many visitors a quality tier has (src/render/quality.js `strays`: 22 on
// HIGH, 14, 8, fewer on the lite rungs): 8, 5, 3, and never fewer than 2.
export function visitorCount(strays) {
  const n = Number.isFinite(strays) ? strays : 22;
  return Math.max(2, Math.min(VISITOR.MAX, Math.round((n * VISITOR.MAX) / 22)));
}

const TAU = Math.PI * 2;
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
  // Whether a visitor may stand at (x, z).
  const free = (x, z) => inRect(bounds, x, z, 0.5) && clearance(colliders, x, z) >= VISITOR.R + VISITOR.MARGIN && !wet(x, z, VISITOR.R + 0.2) && !swept(x, z);
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
    return {
      id: `fair-visitor-${i + 1}`,
      index: i,
      look: { x: 100 + i * 7.3, z: 200 + i * 3.1 }, // what the figure is dressed from (critters.js twolegLook)
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
  }

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
