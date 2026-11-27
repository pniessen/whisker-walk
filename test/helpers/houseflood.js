// houseFlood(area, start, step): a 4-neighbour flood over the area's bounds grid.
// A cell is open when isWalkableAt(area, x, z); a move is allowed when the
// area's ground says canStep. The house's split levels mean the flood follows
// real stairs, so it reaches a room only by walking there.
import { isWalkableAt } from '../../src/player.js';

export function houseFlood(shut, start = shut.spawn, step = 0.5) {
  // walks as if the kids' wardrobe stood open (its shut colliders left out): the wonder room is a place she reaches, by its stair, once she has opened it
  const area = shut.colliders.some((c) => c.wardrobe) ? { ...shut, colliders: shut.colliders.filter((c) => !c.wardrobe) } : shut;
  const key = (i, j) => `${i},${j}`;
  const at = (i, j) => ({ x: start.x + i * step, z: start.z + j * step });
  const seen = new Set();
  const cells = [];
  const queue = [[0, 0]];
  if (isWalkableAt(area, start.x, start.z)) seen.add(key(0, 0));
  else queue.length = 0;
  while (queue.length) {
    const [i, j] = queue.shift();
    const a = at(i, j);
    cells.push(a);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      const k = key(ni, nj);
      if (seen.has(k)) continue;
      const b = at(ni, nj);
      if (!isWalkableAt(area, b.x, b.z)) continue;
      if (!area.ground.canStep(a.x, a.z, b.x, b.z)) continue;
      seen.add(k);
      queue.push([ni, nj]);
    }
  }
  function reachesWithin(x, z, r) {
    return cells.some((c) => Math.hypot(c.x - x, c.z - z) <= r + 1e-9);
  }
  return {
    cells,
    reaches: (x, z) => reachesWithin(x, z, step * 0.75),
    reachesWithin,
  };
}
