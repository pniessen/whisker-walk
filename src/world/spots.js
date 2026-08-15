// clearSpot(p, colliders, bounds, clearance) — pure and deterministic: no
// rng, no THREE import (leaf module, unit-testable without WebGL). Pushes a
// point out of every {x, z, r} collider circle until it sits at least
// `clearance` beyond the collider's edge, then clamps into bounds.
//
// Determinism matters beyond taste here: raceCourse waypoints must come out
// identical on every device deriving today's course from the shared
// (date, area) seed — so this must be a pure function of the area's static
// collider/bounds data and nothing else.
//
// The default clearance leaves room for the cat to reach the spot itself:
// player collision stops the cat at collider.r + CAT_RADIUS (0.35), and the
// race's ring-cross check needs the cat within CROSS_DIST (1.2) of the spot
// — 1.6 clears both with margin, and keeps ring geometry (radius 1.1) from
// visually intersecting the obstacle.
export function clearSpot(p, colliders, bounds = null, clearance = 1.6) {
  let x = p.x, z = p.z;
  // A push out of one collider can land inside a neighbor (house + porch
  // clusters), and the bounds clamp can push back into a collider near the
  // map edge — so relax over a few passes and stop early once stable.
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const c of colliders) {
      const need = c.r + clearance;
      let dx = x - c.x, dz = z - c.z;
      let d = Math.hypot(dx, dz);
      if (d >= need) continue;
      if (d < 1e-6) { dx = 1; dz = 0; d = 1; } // dead-center: fixed +x push
      x = c.x + (dx / d) * need;
      z = c.z + (dz / d) * need;
      moved = true;
    }
    if (bounds) {
      x = Math.min(bounds.maxX - 2, Math.max(bounds.minX + 2, x));
      z = Math.min(bounds.maxZ - 2, Math.max(bounds.minZ + 2, z));
    }
    if (!moved) break;
  }
  return { ...p, x, z };
}
