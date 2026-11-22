// THE OLD HOUSE'S LEDGE GUARDS, AT RUN TIME (rough edges 1 and 2). houseplan.js's
// houseLedgeGuards are collider sets that belong at one height only: the feet round every
// ledge piece while she is on the floor, a top's own set (its rim, and its rows facing a
// taller piece) while she is on that top. Circles have no height, so house life keeps exactly
// the set for where she stands in the walk's own live collider list (the bookcase's rows swap
// there too), and none in the air, on a plank or on a perch (the player pushes nothing then).
// They are built for her cat's size: house life finds her cat in the scene (catScale) and
// calls scale() once, before the first set stands.
// update(catPos) runs after player.update (house life), so the next frame's push has the set
// for where this one left her. A set stands only once she is clear of all of it: a guard
// never traps her. A hop never lands her on the floor within the feet's reach, nor on a top
// within its set (houseguards.test.js), so that wait comes only when a walk is picked up
// where it stood (a spot from before the guards): she walks out as she could before, and
// from then on they hold. A standing set's push always leaves her at its edge, so finding her
// DEEP inside it means a move carried her there (the player pushes nothing while her paws are
// over the ground, perchY): it comes down at once, or its push would pull her off the move's
// arc where the arc dips to a top's lip (a drop off a tall top), and waits again. Allocates
// nothing per frame; a swap splices the list and pushes the set's own frozen circles.

import { HOUSE_LEDGES, GUARD_BODY, LEDGE_ON, houseLedgeGuards } from './houseplan.js';

const ON_FLOOR = 0.3; // m: her paws this near the floor under her are on it (every ledge rises 0.55 m or more)
const DEEP = 0.02; // m inside a standing set: a move put her there

// Whether her middle is inside the reach of any circle of the set, by more than `slack`.
function inside(set, p, slack = 1e-6) {
  for (let i = 0; i < set.length; i++) {
    const c = set[i];
    const dx = p.x - c.x, dz = p.z - c.z, m = c.r + GUARD_BODY - slack;
    if (dx * dx + dz * dz < m * m) return true;
  }
  return false;
}

// Her cat's size: the scene's object standing at her position (walk.js adds her cat to the
// scene; house life is handed its position), else 1.
export function catScale(scene, p) {
  const list = scene?.children ?? [];
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (o.position === p) return Math.max(o.scale.x, o.scale.y, o.scale.z);
  }
  return 1;
}

export function createLedgeGuards(colliders, floor, scale = 1) {
  let guards = houseLedgeGuards(scale);
  let on = null; // the set in the live list, or null
  let name = null; // 'floor', a top's id, or null

  function swap(next, id, p) {
    if (next && (next !== on ? inside(next, p) : inside(next, p, DEEP))) next = null; // in its reach: it waits
    name = next ? id : null;
    if (next === on) return;
    if (on) for (let i = colliders.length - 1; i >= 0; i--) if (colliders[i].guard) colliders.splice(i, 1);
    if (next) for (let i = 0; i < next.length; i++) colliders.push(next[i]);
    on = next;
  }

  return {
    // which set stands: 'floor', the id of the top she is on, or null
    get on() { return name; },
    get guards() { return guards; },
    // her cat's size: the sets for it (any standing set is taken down; the next update stands hers)
    scale(s) {
      guards = houseLedgeGuards(s);
      swap(null, null);
    },
    update(p) {
      if (p.y - floor.y(p.x, p.z) < ON_FLOOR) { swap(guards.feet, 'floor', p); return; }
      for (let i = 0; i < HOUSE_LEDGES.length; i++) {
        const l = HOUSE_LEDGES[i];
        const set = guards.tops[l.id];
        if (set && p.x >= l.minX && p.x <= l.maxX && p.z >= l.minZ && p.z <= l.maxZ && Math.abs(p.y - l.y) <= LEDGE_ON) {
          swap(set, l.id, p);
          return;
        }
      }
      swap(null, null);
    },
    dispose() { swap(null, null); },
  };
}
