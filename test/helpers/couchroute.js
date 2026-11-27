// A walk on foot for the couch-play place tests (M5): a breadth-first route over 0.5 m cells on the area's own walkable
// rule (isWalkableAt) and its ground's canStep, and the stick that turns a world direction into what a pad pushes.
import { isWalkableAt } from '../../src/player.js';

const hypot = Math.hypot;

/** Cells from `start` to within 0.7 m of `target`, or null when there is no way on foot. */
export function routeFrom(area, start, target) {
  const b = area.bounds, st = 0.5, ground = area.ground;
  const key = (x, z) => `${Math.round(x / st)},${Math.round(z / st)}`;
  const from = new Map([[key(start.x, start.z), null]]);
  const q = [{ x: start.x, z: start.z }];
  let goal = hypot(start.x - target.x, start.z - target.z) < 0.7 ? q[0] : null;
  for (let i = 0; i < q.length && !goal; i++) {
    const c = q[i];
    for (const [dx, dz] of [[st, 0], [-st, 0], [0, st], [0, -st]]) {
      const x = c.x + dx, z = c.z + dz, k = key(x, z);
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ || from.has(k) || !isWalkableAt(area, x, z) || !ground.canStep(c.x, c.z, x, z)) continue;
      from.set(k, c);
      const n = { x, z };
      q.push(n);
      if (hypot(x - target.x, z - target.z) < 0.7) { goal = n; break; }
    }
  }
  if (!goal) return null;
  const route = [];
  for (let c = goal; c; c = from.get(key(c.x, c.z))) route.push(c);
  return route.reverse();
}

/** The stick that walks toward world direction (wx, wz) on the rig `r` (the follow rule's own turn into screen space). */
export function stickFor(r, wx, wz) {
  const y = r.h.state.yaw, c = Math.cos(y), sn = Math.sin(y), d = Math.hypot(wx, wz) || 1;
  return [(wx / d * c - wz / d * sn), (wx / d * sn + wz / d * c), 0, 0];
}

/** canStep checked in 0.05 m pieces: the way a walking cat takes it frame by frame (a curb of 0.2 m is a wall to it, though a 0.5 m stride would skip over). */
function fineStep(ground, ax, az, bx, bz) {
  const n = Math.max(1, Math.ceil(hypot(bx - ax, bz - az) / 0.05));
  for (let i = 0; i < n; i++) {
    if (!ground.canStep(ax + (bx - ax) * i / n, az + (bz - az) * i / n, ax + (bx - ax) * (i + 1) / n, az + (bz - az) * (i + 1) / n)) return false;
  }
  return true;
}

/** Walkable with a quarter metre to spare all round: a walk that brushes a wall climbs it (or snags), which is not the walk being tested. */
const roomAt = (area, x, z) => isWalkableAt(area, x, z) && isWalkableAt(area, x + 0.3, z) && isWalkableAt(area, x - 0.3, z) && isWalkableAt(area, x, z + 0.3) && isWalkableAt(area, x, z - 0.3);

/** Every cell reachable on foot from `start` (0.5 m cells, the walking rule in 0.05 m pieces): { cells: [{x, z}] in breadth order, pathTo(cell) }. */
export function reachFrom(area, start0, cap = 60000) {
  const start = { x: start0.x + 0.13, z: start0.z + 0.07 }; // off the whole-metre lattice, so no cell sits exactly on a rim or an edge (a cat walking the line at 4.0002 is on the low side of it, the cell at 4 on the high)
  const b = area.bounds, st = 0.5, ground = area.ground;
  const key = (x, z) => `${Math.round(x / st)},${Math.round(z / st)}`;
  const from = new Map([[key(start.x, start.z), null]]);
  const q = [{ x: start.x, z: start.z }];
  for (let i = 0; i < q.length && q.length < cap; i++) {
    const c = q[i];
    for (const [dx, dz] of [[st, 0], [-st, 0], [0, st], [0, -st]]) {
      const x = c.x + dx, z = c.z + dz, k = key(x, z);
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ || from.has(k) || !roomAt(area, x, z) || !fineStep(ground, c.x, c.z, x, z)) continue;
      const n = { x, z };
      from.set(k, c);
      q.push(n);
    }
  }
  const pathTo = (cell) => { const route = []; for (let c = cell; c; c = from.get(key(c.x, c.z))) route.push(c); return route.reverse(); };
  return { cells: q, pathTo };
}

/** Walk cat one (a rig `r` with its session `s`) along `route` with pad one, until it is there or `frames` run out; calls `each()` every frame. */
export function walkRoute(r, s, route, { frames = 60 * 120, each = null, set, pad } = {}) {
  let i = 1;
  const reach = 0.3;
  for (let f = 0; f < frames && i < route.length; f++) {
    const p = s.cat.position;
    while (i < route.length && hypot(p.x - route[i].x, p.z - route[i].z) < reach) i++;
    const t = route[Math.min(i, route.length - 1)];
    set(r, pad(0, [], i >= route.length ? [0, 0, 0, 0] : stickFor(r, t.x - p.x, t.z - p.z)), pad(1));
    r.tick(1);
    each?.(f);
    if (Math.abs(p.y - (s.ground?.flat ? 0 : s.ground.y(p.x, p.z))) > 1) break; // a stair of the place took her up on her own
  }
  return i >= route.length;
}
