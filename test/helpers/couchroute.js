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
