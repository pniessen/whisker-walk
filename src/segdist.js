// The distance from a point to a line segment on the ground plane, and the
// segment's nearest point: one shared helper for every world file that keeps
// scenery off a path, a log or a deck, and for keepout.js's capsules (Polish
// 3; each used to keep its own copy).
//
// segT(x, z, x1, z1, x2, z2) -> how far along the segment (0..1) its nearest
// point to (x, z) lies; 0 for a zero-length segment.
export function segT(x, z, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  return len2 > 0 ? Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / len2)) : 0;
}

// segDist(x, z, x1, z1, x2, z2) -> metres from (x, z) to the segment.
export function segDist(x, z, x1, z1, x2, z2) {
  const t = segT(x, z, x1, z1, x2, z2);
  return Math.hypot(x - (x1 + t * (x2 - x1)), z - (z1 + t * (z2 - z1)));
}
