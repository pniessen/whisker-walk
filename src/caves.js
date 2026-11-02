// =============================================================================
// CAVES — how deep into a cave a spot is (Gorge part 3, ruling C1).
//
// A cave record is part 2's GORGE_CAVES entry: `rects` (corridor, bend,
// chamber, mouth to chamber) and `path` (a polyline [[x, z], ...] from the
// mouth to the chamber's far end). Inside one of a cave's rectangles, the
// depth is how far along the path the spot's nearest point on that path is,
// divided by the path's whole length: 0 at the mouth, 1 at the far end.
// Everywhere else it is 0, the shallow dens included (they are for peeking
// and napping, not dark), because only caves are ever passed in.
//
// Pure and allocation-free: gorgeLife and the camera call it every frame.
// =============================================================================

function inRect(r, x, z) {
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
}

// The cave whose rectangles hold (x, z), or null.
export function caveAt(caves, x, z) {
  if (!caves) return null;
  for (let i = 0; i < caves.length; i++) {
    const rects = caves[i].rects;
    for (let k = 0; k < rects.length; k++) if (inRect(rects[k], x, z)) return caves[i];
  }
  return null;
}

// (x, z)'s distance along `path` to its nearest point on it, over the path's
// length, in [0, 1].
function pathFraction(path, x, z) {
  let total = 0;
  let best = Infinity;
  let bestAlong = 0;
  for (let i = 1; i < path.length; i++) {
    const ax = path[i - 1][0];
    const az = path[i - 1][1];
    const dx = path[i][0] - ax;
    const dz = path[i][1] - az;
    const len2 = dx * dx + dz * dz;
    const len = Math.sqrt(len2);
    let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + dx * t - x;
    const ez = az + dz * t - z;
    const d2 = ex * ex + ez * ez;
    if (d2 < best) {
      best = d2;
      bestAlong = total + len * t;
    }
    total += len;
  }
  if (!(total > 0)) return 0;
  const f = bestAlong / total;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

// caveDepth(caves, x, z) -> [0, 1].
export function caveDepth(caves, x, z) {
  const cave = caveAt(caves, x, z);
  return cave ? pathFraction(cave.path, x, z) : 0;
}

// Gorge part 3, C4 and C-F3: under a ceiling.
//
// The ground's ceilings are inset 1 mm from their cave's or den's walls, so
// ground.ceil is Infinity on a 1 mm strip along every wall. "Under a ceiling"
// therefore also looks this far away on the four diagonals: one of them is
// always inward, even in a corner, so walking along a wall never flickers the
// view. Only a ceiling over her counts (not rock she might stand on top of).
const CEIL_PROBE = 0.05; // metres
function ceilOver(g, x, z, y) {
  const c = g.ceil(x, z);
  return c !== Infinity && c > y;
}
// underCeiling(ground, x, y, z): is there a ceiling over a cat (or a camera)
// standing at (x, y, z)? Used by the cave camera (player.js) and the rain
// shelter.
export function underCeiling(g, x, y, z) {
  const r = CEIL_PROBE;
  return ceilOver(g, x, z, y)
    || ceilOver(g, x + r, z + r, y) || ceilOver(g, x - r, z + r, y)
    || ceilOver(g, x + r, z - r, y) || ceilOver(g, x - r, z - r, y);
}
