// Lead and wait: how a cat that is showing the way moves. The guided first
// walk's guide (a stray) and the first camp walk's waiting cat both use it
// (design: .claude/plans/guided-first-walk-design.md, sections 3 and 7).
//
// Plain arithmetic: no THREE, no DOM, no dice. The leader owns a spot and a
// heading; its owner (straycats.js, clancats.js) copies them onto the cat,
// keeps the spot on ground that cat may stand on (`fix`), and plays the pose.
//
// What it can be told:
//   sit()               stand and look at the child
//   goTo(path, opts)    walk a path (a point or a list of points), then sit
//   approach(opts)      walk toward the child until `standoff` metres away
//   steps(n)            a few steps toward the child (n times STEP_M)
//   lead(path, opts)    trot along the path, but never far ahead: more than
//                       `ahead` metres from the child it stops and looks
//                       back, and sets off again once the child is within
//                       `near`. "Ahead" is as the crow flies AND by the way
//                       it has walked: where the path doubles back (a ledge,
//                       a bank) a child close by across the drop is still a
//                       long way behind, and it waits
//   pose(name, secs)    hold a pose where it stands (a pounce, a rub, a jump
//                       for joy), then carry on with what it was doing
//
// step(dt, child) moves it one frame and returns { speed, pose } for the
// animation. `arrived` is true once a goTo or lead has reached its end.

export const STEP_M = 0.5;
export const WALK_SPEED = 1.6;
export const TROT_SPEED = 2.5;
export const LEAD_AHEAD_M = 6;
export const LEAD_NEAR_M = 3.5;
const ARRIVE_M = 0.35;
const STUCK_S = 1.2;         // this long without progress: the next point, or give up
const TURN_RATE = 9;         // how fast the heading follows, per second

// The heading that looks from (x, z) toward (tx, tz), in the cats' own
// convention (straycats.js faceToward).
export function yawToward(x, z, tx, tz) {
  return Math.atan2(tx - x, tz - z) + Math.PI;
}

function turn(from, to, k) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d * Math.min(1, k);
}

// How far along a lead's way the child has come: the nearest spot on the way
// to the child. Looked for only a little behind and some way ahead of where
// the child was last, and only when the child is beside the way at all, so a
// leg that doubles back close by is not mistaken for progress. Further ahead
// than that it counts only when the child is standing right on the way (a
// child who ran on ahead along it).
const WAY_BACK_M = 3;
const WAY_FWD_M = 10;
const WAY_BESIDE_M = 6;
const WAY_FAR_FWD_M = 30;
const WAY_ON_M = 2.2;
const WAY_SLACK_M = 1.5;
function alongWay(o, child) {
  let best = o.childAt;
  let bestD = WAY_BESIDE_M;
  const lo = o.childAt - WAY_BACK_M;
  const hi = o.childAt + WAY_FAR_FWD_M;
  for (let k = 1; k < o.line.length; k++) {
    if (o.cum[k] < lo || o.cum[k - 1] > hi) continue;
    const a = o.line[k - 1];
    const b = o.line[k];
    const len = o.cum[k] - o.cum[k - 1];
    if (len <= 0) continue;
    const t = Math.max(0, Math.min(1, ((child.x - a.x) * (b.x - a.x) + (child.z - a.z) * (b.z - a.z)) / (len * len)));
    const s = Math.max(lo, Math.min(hi, o.cum[k - 1] + t * len));
    const tt = (s - o.cum[k - 1]) / len;
    const dist = Math.hypot(child.x - (a.x + (b.x - a.x) * tt), child.z - (a.z + (b.z - a.z) * tt));
    if (dist >= bestD) continue;
    if (s > o.childAt + WAY_FWD_M && dist >= WAY_ON_M) continue;
    bestD = dist;
    best = s;
  }
  return best;
}

// The child is standing right by the leader's own stretch of the way (within
// WAY_WITH_M of it, on the WAY_WITH_BACK_M behind the leader): the child has
// come that far, however it got there (a corner cut, a way of its own). Across
// a drop from a leg that doubles back the child is not this close to it.
const WAY_WITH_M = 2.2;
const WAY_WITH_BACK_M = 7;
function besideLeader(o, child) {
  let best = -1;
  for (let k = 1; k < o.line.length; k++) {
    if (o.cum[k] < o.at - WAY_WITH_BACK_M || o.cum[k - 1] > o.at + 1) continue;
    const a = o.line[k - 1];
    const b = o.line[k];
    const len = o.cum[k] - o.cum[k - 1];
    if (len <= 0) continue;
    const lo = Math.max(0, (o.at - WAY_WITH_BACK_M - o.cum[k - 1]) / len);
    const hi = Math.min(1, (o.at + 1 - o.cum[k - 1]) / len);
    const t = Math.max(lo, Math.min(hi, ((child.x - a.x) * (b.x - a.x) + (child.z - a.z) * (b.z - a.z)) / (len * len)));
    if (Math.hypot(child.x - (a.x + (b.x - a.x) * t), child.z - (a.z + (b.z - a.z) * t)) < WAY_WITH_M) best = Math.max(best, o.cum[k - 1] + t * len);
  }
  return best;
}

const points = (path) => (Array.isArray(path) ? path : [path])
  .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z))
  .map((p) => ({ x: p.x, z: p.z }));

export function createLeader({ x = 0, z = 0, yaw = 0, fix = null } = {}) {
  const pos = { x, z };
  let heading = yaw;
  let order = { kind: 'sit' };
  let held = null;     // { name, left, speed }: a pose held over the order
  let stuck = 0;
  let waiting = false; // a lead that has stopped to look back
  let arrived = false;

  // One stride toward (tx, tz) at `speed`; true when it is there. A stride
  // the ground gives nothing for (a wall, a bank) counts toward `stuck`.
  function stride(tx, tz, speed, dt, reach = ARRIVE_M) {
    const dx = tx - pos.x;
    const dz = tz - pos.z;
    const d = Math.hypot(dx, dz);
    if (d <= reach) return true;
    const len = Math.min(speed * dt, d - reach * 0.97); // never a stride past where it stops
    const px = pos.x;
    const pz = pos.z;
    pos.x += (dx / d) * len;
    pos.z += (dz / d) * len;
    if (fix) fix(pos, px, pz);
    const gained = d - Math.hypot(tx - pos.x, tz - pos.z);
    stuck = gained < len * 0.25 ? stuck + dt : 0;
    heading = turn(heading, yawToward(px, pz, tx, tz), TURN_RATE * dt);
    return false;
  }

  function look(child, dt) {
    if (!child) return;
    if (Math.hypot(child.x - pos.x, child.z - pos.z) < 0.05) return;
    heading = turn(heading, yawToward(pos.x, pos.z, child.x, child.z), TURN_RATE * dt);
  }

  // Walks the order's path; true at its end. A point it cannot get to is
  // given up on after STUCK_S, so it never leans on a wall for good.
  function follow(o, dt) {
    while (o.i < o.path.length) {
      const p = o.path[o.i];
      const last = o.i === o.path.length - 1;
      if (stride(p.x, p.z, o.speed, dt, last ? Math.max(ARRIVE_M, o.standoff ?? 0) : ARRIVE_M)) { o.i += 1; stuck = 0; continue; }
      if (stuck >= STUCK_S) { o.i += 1; stuck = 0; continue; }
      return false;
    }
    return true;
  }

  const api = {
    pos,
    get yaw() { return heading; },
    get order() { return order.kind; },
    get arrived() { return arrived; },
    get waiting() { return waiting; },
    get posing() { return held ? held.name : null; },
    place(nx, nz, nyaw = heading) {
      pos.x = nx; pos.z = nz; heading = nyaw;
    },
    sit() {
      order = { kind: 'sit' };
      waiting = false;
    },
    goTo(path, { speed = WALK_SPEED, standoff = 0 } = {}) {
      order = { kind: 'go', path: points(path), i: 0, speed, standoff };
      arrived = order.path.length === 0;
      waiting = false; stuck = 0;
    },
    approach({ standoff = 1.5, speed = WALK_SPEED, budget = Infinity } = {}) {
      order = { kind: 'approach', standoff, speed, budget };
      arrived = false; waiting = false; stuck = 0;
    },
    steps(n, opts = {}) {
      api.approach({ standoff: 1.5, ...opts, budget: Math.max(0, n) * STEP_M });
    },
    lead(path, { speed = TROT_SPEED, ahead = LEAD_AHEAD_M, near = LEAD_NEAR_M, standoff = 0 } = {}) {
      const pts = points(path);
      // The way as one line from where it stands, with the metres walked to
      // each point: `at` is how far along it the leader is, `childAt` how far
      // the child has come.
      const line = [{ x: pos.x, z: pos.z }, ...pts];
      const cum = [0];
      for (let k = 1; k < line.length; k++) cum.push(cum[k - 1] + Math.hypot(line[k].x - line[k - 1].x, line[k].z - line[k - 1].z));
      order = { kind: 'lead', path: pts, i: 0, speed, ahead, near, standoff, line, cum, at: 0, childAt: 0 };
      arrived = order.path.length === 0;
      waiting = false; stuck = 0;
    },
    pose(name, secs = 1) {
      held = { name, left: secs };
    },
    step(dt, child) {
      const d = Number.isFinite(dt) && dt > 0 ? dt : 0;
      if (held) {
        held.left -= d;
        look(child, d);
        const name = held.name;
        if (held.left <= 0) held = null;
        return { speed: 0, pose: name };
      }
      const o = order;
      if (o.kind === 'go') {
        if (!arrived && follow(o, d)) arrived = true;
        if (arrived) { look(child, d); return { speed: 0, pose: 'requestPet' }; }
        return { speed: o.speed, pose: 'follow' };
      }
      if (o.kind === 'approach') {
        if (!child) return { speed: 0, pose: 'requestPet' };
        const before = { x: pos.x, z: pos.z };
        const there = arrived || o.budget <= 0 || stride(child.x, child.z, o.speed, d, o.standoff) || stuck >= STUCK_S;
        o.budget -= Math.hypot(pos.x - before.x, pos.z - before.z);
        if (there) { arrived = true; look(child, d); return { speed: 0, pose: 'requestPet' }; }
        return { speed: o.speed, pose: 'follow' };
      }
      if (o.kind === 'lead') {
        if (arrived) { look(child, d); return { speed: 0, pose: 'requestPet' }; }
        const gap = child ? Math.hypot(child.x - pos.x, child.z - pos.z) : 0;
        if (child) o.childAt = Math.max(alongWay(o, child), besideLeader(o, child));
        const behind = o.at - o.childAt; // metres of the way between them
        // (A child who is further along the way than the leader is not waited
        // for: the leader trots on after her.)
        if (behind > -0.5 && (waiting ? (gap > o.near || behind > o.ahead) : (gap > o.ahead || behind > o.ahead + WAY_SLACK_M))) {
          waiting = true;
          look(child, d);
          return { speed: 0, pose: 'requestPet' };
        }
        waiting = false;
        const bx = pos.x;
        const bz = pos.z;
        const done = follow(o, d);
        o.at += Math.hypot(pos.x - bx, pos.z - bz);
        if (done) { arrived = true; return { speed: 0, pose: 'requestPet' }; }
        return { speed: o.speed, pose: 'follow' };
      }
      look(child, d);
      return { speed: 0, pose: 'requestPet' };
    },
  };
  return api;
}
