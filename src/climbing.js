// Shared climb-reach rule for perches (fence tops, car/porch roofs, ridges…).
// Perches above y 1 sit at a prop's own collider center rather than its edge
// (car roofs, rooftops), so they get a longer reach to compensate for the
// collider pushing the cat out to `r + 0.35`. Climbing UP costs at most 1.6
// of height per hop, forcing multi-perch chains up tall structures; dropping
// down to a lower (or ground-level) perch is always allowed, any distance.
export function canReach(perch, catPos, currentY) {
  const reach = perch.y > 1 ? 2.6 : 1.2;
  const horizontal = Math.hypot(perch.x - catPos.x, perch.z - catPos.z);
  return horizontal < reach && perch.y - currentY <= 1.6;
}

// Picks which reachable perch a pounce/climb press should jump to. Drops
// (perch.y <= currentY) are always "reachable" per canReach, so a naive
// first-match pick among perches in declaration order can shadow a higher
// chain-mate that's also in reach (e.g. a crate stacked below a billboard
// lookout, or a porch below a rooftop ridge) with a lower one, trapping the
// climb. Preferring the HIGHEST reachable candidate makes climbs beat drops
// whenever both are available, so pressing the same key repeatedly walks a
// chain upward; only when nothing at all is reachable does the caller fall
// back to hopping down off the current perch.
export function bestPerch(perches, catPos, currentY, currentPerch) {
  let best = null;
  for (const pp of perches ?? []) {
    if (pp === currentPerch) continue;
    if (!canReach(pp, catPos, currentY)) continue;
    if (!best || pp.y > best.y) best = pp;
  }
  return best;
}
