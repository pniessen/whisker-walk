// The Greenhouse's real plan, walked: a flood fill from the spawn over the ground a cat may stand on (src/player.js isWalkableAt), and the
// climb rule (src/climbing.js canReach) over its perches. Every test file stubs the canvas first (stubCanvasDocument).
import { isWalkableAt } from '../../src/player.js';
import { canReach, BASE_CLIMB_BUDGET } from '../../src/climbing.js';
import { greenhouseArea } from '../../src/world/greenhouseplan.js';

export const area = greenhouseArea();
const STEP = 0.5;
const key = (i, j) => `${i},${j}`;
const seen = new Set();
const cells = [];
{
  const start = [Math.round(area.spawn.x / STEP), Math.round(area.spawn.z / STEP)];
  seen.add(key(...start));
  const todo = [start];
  while (todo.length) {
    const [i, j] = todo.pop();
    cells.push([i * STEP, j * STEP]);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di;
      const b = j + dj;
      if (seen.has(key(a, b)) || !isWalkableAt(area, a * STEP, b * STEP)) continue;
      seen.add(key(a, b));
      todo.push([a, b]);
    }
  }
}
export const walkable = (x, z) => isWalkableAt(area, x, z);
// is there ground she can stand on, reached on foot from the spawn, within `slack` m of (x, z)?
export const reachable = (x, z, slack = 0.5) => cells.some(([cx, cz]) => Math.hypot(cx - x, cz - z) <= slack);

// the fewest hops from the ground to a perch (Infinity if none): a hop is canReach from the ground or from the perch before it
export function hopsTo(target, perches = area.perches, budget = BASE_CLIMB_BUDGET) {
  const dist = new Map();
  let frontier = perches.filter((p) => cells.some(([cx, cz]) => canReach(p, { x: cx, z: cz }, 0, budget)));
  let n = 1;
  while (frontier.length) {
    for (const p of frontier) dist.set(p, n);
    const next = perches.filter((q) => !dist.has(q) && [...dist.keys()].some((p) => dist.get(p) === n && canReach(q, p, p.y, budget)));
    frontier = next;
    n++;
  }
  let best = Infinity;
  for (const p of perches) if (Math.hypot(p.x - target.x, p.z - target.z) < 1.0 && Math.abs(p.y - target.y) < 0.9) best = Math.min(best, dist.get(p) ?? Infinity);
  return best;
}
export const hopMap = (perches = area.perches, budget = BASE_CLIMB_BUDGET) => new Map(perches.map((p) => [p, hopsTo(p, perches, budget)]));
