// THE OLD HOUSE'S LEDGE GUARDS, AT RUN TIME (rough edges 1 and 2). houseplan.js's
// houseLedgeGuards are collider sets that belong at one height only: the feet round every
// ledge piece while she is on the floor, a tall top's rim while she is on that top. Circles
// have no height, so house life keeps exactly the set for where she stands in the walk's
// own live collider list (the bookcase's rows swap there too), and none in the air, on a
// plank or on a perch (the player pushes nothing then).
// update(catPos) runs after player.update (house life), so the next frame's push has the set
// for where this one left her. A set stands only once she is clear of all of it: a guard
// never traps her. A hop never lands her on the floor within the feet's reach, nor on a top
// outside its rim (houseguards.test.js), so that wait comes only when a walk is picked up
// where it stood (a spot from before the guards): she walks out as she could before, and
// from then on they hold. Allocates nothing per frame; a swap splices the list and pushes
// the set's own frozen circles.

import { HOUSE_LEDGES, houseLedgeGuards } from './houseplan.js';

const ON_FLOOR = 0.3; // m: her paws this near the floor under her are on it (every ledge rises 0.55 m or more)
const ON_TOP = 0.1; // m: her paws this near a top are on it (housefinds.js ON_LEDGE)
const BODY = 0.35; // = player.js CAT_RADIUS: a circle holds her middle r + BODY off it

// Whether her middle is inside the reach of any circle of the set.
function inside(set, p) {
  for (let i = 0; i < set.length; i++) {
    const c = set[i];
    const dx = p.x - c.x, dz = p.z - c.z, m = c.r + BODY - 1e-6;
    if (dx * dx + dz * dz < m * m) return true;
  }
  return false;
}

export function createLedgeGuards(colliders, floor, guards = houseLedgeGuards()) {
  const tops = HOUSE_LEDGES.filter((l) => guards.rims[l.id]);
  let on = null; // the set in the live list, or null
  let name = null; // 'floor', a top's id, or null

  function swap(next, id, p) {
    if (next && next !== on && inside(next, p)) next = null; // she is in its reach: it waits
    name = next ? id : null;
    if (next === on) return;
    if (on) for (let i = colliders.length - 1; i >= 0; i--) if (colliders[i].guard) colliders.splice(i, 1);
    if (next) for (let i = 0; i < next.length; i++) colliders.push(next[i]);
    on = next;
  }

  return {
    // which set stands: 'floor', the id of the top she is on, or null
    get on() { return name; },
    update(p) {
      if (p.y - floor.y(p.x, p.z) < ON_FLOOR) { swap(guards.feet, 'floor', p); return; }
      for (let i = 0; i < tops.length; i++) {
        const l = tops[i];
        if (p.x >= l.minX && p.x <= l.maxX && p.z >= l.minZ && p.z <= l.maxZ && Math.abs(p.y - l.y) <= ON_TOP) {
          swap(guards.rims[l.id], l.id, p);
          return;
        }
      }
      swap(null, null);
    },
    dispose() { swap(null, null); },
  };
}
