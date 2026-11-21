// How wet the beach sand is at a point: a pure number, no imports. A leaf, so
// the paw prints can ask without loading the Seaside (seaside.js re-exports it).

// The wet band's vertex colour at (x, z): 1 (dry, the beach itself) at
// WET_FROM, WET_TINT at the waterline, with a wavy edge where the last wave
// reached.
export function wetness(x, z) {
  // The wet edge wanders +-0.5m along the beach; the ramp itself runs 1.7m,
  // and reaches full wet ~0.5m short of the foam strip's lace edge
  // (waterdress.js, x ~24.1..25), so the soaked sand shows behind the foam
  // instead of only under it (polish-water Task 4; it ran 22.4..24.4 before).
  const reach = 0.32 * Math.sin(z * 0.33 + 1.3) + 0.16 * Math.sin(z * 0.91);
  const t = Math.min(1, Math.max(0, (x - 22.2 + reach) / 1.7));
  return t * t * (3 - 2 * t);
}
