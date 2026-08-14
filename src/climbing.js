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
