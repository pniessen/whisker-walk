import { canReach, BASE_CLIMB_BUDGET, perchRequirement } from '../../src/climbing.js';
import { PICKUP } from '../../src/foundwear/rules.js';

// perchHops(perches, target, { budget, groundOk }) -> the fewest hops to stand
// on a perch inside the find pick-up window of `target` (rules.js PICKUP:
// under 1.0 m sideways and 0.9 m up or down, target.y measured from the
// ground, as goldmice.js checkFind). 0 for a ground target, Infinity when no chain gets there.
//
// The search is test/climbing.test.js's hopsFromGround: a perch is a first
// hop when the cat can climb onto it from the ground right beside it, and
// then each perch the cat can reach from one it is on. Two things more:
//   * a first hop counts only from a perch with groundOk(p.x, p.z), so a
//     caller can ask that the ground under the chain is reached from the spawn;
//   * a perch a skill opens (a `requires` record, such as the Sure Claws tree
//     forks) is no step at all, so a find never needs a skill.
export function perchHops(perches, target, { budget = BASE_CLIMB_BUDGET, groundOk = () => true } = {}) {
  if (target.y === 0) return 0;
  const open = (perches ?? []).filter((p) => perchRequirement(p) === null);
  const dist = new Map();
  const queue = [];
  for (const p of open) {
    if (groundOk(p.x, p.z) && canReach(p, { x: p.x, z: p.z }, 0, budget)) {
      dist.set(p, 1);
      queue.push(p);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    for (const p of open) {
      if (p === cur || dist.has(p)) continue;
      if (canReach(p, { x: cur.x, z: cur.z }, cur.y, budget)) {
        dist.set(p, dist.get(cur) + 1);
        queue.push(p);
      }
    }
  }
  let best = Infinity;
  for (const p of open) {
    if (Math.hypot(p.x - target.x, p.z - target.z) < PICKUP.r && Math.abs(p.y - target.y) < PICKUP.dy) {
      best = Math.min(best, dist.get(p) ?? Infinity);
    }
  }
  return best;
}
