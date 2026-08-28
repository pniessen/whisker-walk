import { nearestDry } from './builder.js';

// clearSpot(p, colliders, bounds, waters, clearance) — pure and
// deterministic: no rng, and nothing here touches a renderer, so it stays
// unit-testable headless (the one import is builder.js's water geometry,
// which test/water.test.js already imports with no DOM at all). Pushes a
// point out of every {x, z, r} collider circle and out of every water
// footprint until it sits at least `clearance` clear of both, then clamps
// into bounds.
//
// Determinism matters beyond taste here: raceCourse waypoints must come out
// identical on every device deriving today's course from the shared
// (date, area) seed — so this must be a pure function of the area's static
// collider/water/bounds data and nothing else. nearestDry is pure for the
// same reason (scent.js's buried treats must agree across a co-walk).
//
// The default clearance leaves room for the cat to reach the spot itself:
// player collision stops the cat at collider.r + CAT_RADIUS (0.35), and the
// race's ring-cross check needs the cat within CROSS_DIST (1.2) of the spot
// — 1.6 clears both with margin, and keeps ring geometry (radius 1.1) from
// visually intersecting the obstacle.
//
// THE WATER PASS IS v20, and one number covers both cases because both
// derivations land on it: a cat is stopped 0.35 short of a waterline exactly
// as it is stopped 0.35 short of a wall, so 1.6 again clears the 1.2
// ring-cross with margin and again keeps the 1.1 ring out of the drink.
//
// It changes nothing that ships. v19 relocated the offending content — the
// pond-centre POI was the bug that pass existed for — and every POI in the
// three watered areas already clears its water by at least 2.0m (or stands on
// the seaside pier's deck, which nearestDry treats as dry land), so this is
// idempotent on all 24 of them and the daily race course is unmoved. It is
// here so that a future author who drops a POI in a pond gets it pushed to
// the shore instead of a race ring that cannot be crossed.
export function clearSpot(p, colliders, bounds = null, waters = [], clearance = 1.6) {
  let x = p.x, z = p.z;
  // A push out of one collider can land inside a neighbor (house + porch
  // clusters), a push out of the water can land inside a collider and vice
  // versa, and the bounds clamp can push back into either near the map edge —
  // so relax over a few passes and stop early once stable. Water first, then
  // colliders, then bounds: the same order (and the same reasoning)
  // scent.js's keepReachable uses for buried treats.
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    const dry = nearestDry(waters, x, z, clearance);
    if (dry.x !== x || dry.z !== z) {
      x = dry.x;
      z = dry.z;
      moved = true;
    }
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
